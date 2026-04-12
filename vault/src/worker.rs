use std::sync::Arc;

use rust_decimal::Decimal;
use secrecy::{ExposeSecret, Secret};
use sqlx::{PgPool, Postgres, Row, Transaction};
use tokio::time::{interval, Duration};
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::payout_service::{verified_payout_amount, B2CClient, PayoutParams};

const AUTO_RELEASE_HOURS: u64 = 72;
const WORKER_PAYOUT_POLL_SECS: u64 = 60;
const WORKER_AUTO_RELEASE_SECS: u64 = 3600;

pub struct WorkerState {
    pub db: PgPool,
    pub b2c: B2CClient,
    pub service_fee_bps: u32,
    pub http: reqwest::Client,
    pub django_backend_url: String,
    pub internal_service_secret: Secret<String>,
}

pub async fn run(state: Arc<WorkerState>) {
    let mut release_tick = interval(Duration::from_secs(WORKER_AUTO_RELEASE_SECS));
    let mut payout_tick = interval(Duration::from_secs(WORKER_PAYOUT_POLL_SECS));

    loop {
        tokio::select! {
            _ = release_tick.tick() => {
                if let Err(e) = run_auto_release(&state).await {
                    error!("auto-release worker: {e}");
                }
            }
            _ = payout_tick.tick() => {
                if let Err(e) = run_payout_processor(&state).await {
                    error!("payout worker: {e}");
                }
            }
        }
    }
}

async fn run_auto_release(state: &WorkerState) -> anyhow::Result<()> {
    let threshold_hours = AUTO_RELEASE_HOURS as i64;

    let rows = sqlx::query(
        "SELECT id, seller_id, amount
         FROM escrows
         WHERE status = 'pending_confirmation'
           AND updated_at < NOW() - ($1 || ' hours')::INTERVAL",
    )
    .bind(threshold_hours)
    .fetch_all(&state.db)
    .await?;

    if rows.is_empty() {
        return Ok(());
    }

    info!("auto-release: found {} escrow(s) past {}h window", rows.len(), AUTO_RELEASE_HOURS);

    for row in rows {
        let escrow_id: Uuid = row.try_get("id")?;
        let seller_id: String = row.try_get("seller_id")?;
        let amount: Decimal = row.try_get("amount")?;

        if let Err(e) = queue_release(&state.db, escrow_id, &seller_id, amount).await {
            error!("auto-release: failed to queue escrow {escrow_id}: {e}");
        }
    }

    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn queue_release(
    db: &PgPool,
    escrow_id: Uuid,
    seller_id: &str,
    amount: Decimal,
) -> anyhow::Result<()> {
    let mut tx = db.begin().await?;

    let locked = sqlx::query(
        "SELECT id FROM escrows
         WHERE id = $1 AND status = 'pending_confirmation'
         FOR UPDATE",
    )
    .bind(escrow_id)
    .fetch_optional(&mut *tx)
    .await?;

    if locked.is_none() {
        return Ok(());
    }

    sqlx::query(
        "UPDATE escrows SET status = 'release_queued', updated_at = NOW() WHERE id = $1",
    )
    .bind(escrow_id)
    .execute(&mut *tx)
    .await?;

    append_audit(
        &mut tx,
        escrow_id,
        "pending_confirmation",
        "release_queued",
        &format!("auto-release: {AUTO_RELEASE_HOURS}h buyer confirmation timeout"),
        "worker",
    )
    .await?;

    let phone_row = sqlx::query("SELECT phone FROM users WHERE id = $1")
        .bind(seller_id)
        .fetch_optional(&mut *tx)
        .await?;

    let seller_phone = phone_row
        .and_then(|r| r.try_get::<Option<String>, _>("phone").ok().flatten())
        .unwrap_or_default();

    anyhow::ensure!(
        !seller_phone.is_empty(),
        "seller {seller_id} has no phone number on file"
    );

    let payout_id = Uuid::new_v4();

    sqlx::query(
        "INSERT INTO payout_jobs (escrow_id, payout_id, seller_id, seller_phone, amount)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (payout_id) DO NOTHING",
    )
    .bind(escrow_id)
    .bind(payout_id)
    .bind(seller_id)
    .bind(&seller_phone)
    .bind(amount)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    info!("auto-release: queued payout {payout_id} for escrow {escrow_id} → seller {seller_id}");
    Ok(())
}

async fn run_payout_processor(state: &WorkerState) -> anyhow::Result<()> {
    let claimed = sqlx::query(
        "WITH claimable AS (
             SELECT id FROM payout_jobs
             WHERE status = 'queued'
               AND next_attempt_at <= NOW()
               AND attempts < max_attempts
             ORDER BY created_at ASC
             LIMIT 10
             FOR UPDATE SKIP LOCKED
         )
         UPDATE payout_jobs SET status = 'processing', updated_at = NOW()
         FROM claimable
         WHERE payout_jobs.id = claimable.id
         RETURNING
             payout_jobs.id,
             payout_jobs.escrow_id,
             payout_jobs.payout_id,
             payout_jobs.seller_phone,
             payout_jobs.amount,
             payout_jobs.attempts",
    )
    .fetch_all(&state.db)
    .await?;

    if claimed.is_empty() {
        return Ok(());
    }

    info!("payout worker: claimed {} job(s)", claimed.len());

    for row in claimed {
        let job_id: Uuid = row.try_get("id")?;
        let escrow_id: Uuid = row.try_get("escrow_id")?;
        let payout_id: Uuid = row.try_get("payout_id")?;
        let phone: String = row.try_get("seller_phone")?;
        let attempts: i32 = row.try_get("attempts")?;

        process_single_payout(state, job_id, escrow_id, payout_id, &phone, attempts as u32).await;
    }

    Ok(())
}

async fn process_single_payout(
    state: &WorkerState,
    job_id: Uuid,
    escrow_id: Uuid,
    payout_id: Uuid,
    phone: &str,
    attempts: u32,
) {
    let verified_amount = match verified_payout_amount(&state.db, escrow_id, state.service_fee_bps).await {
        Ok(a) => a,
        Err(e) => {
            error!("payout safety guard FAILED for job {job_id}: {e}");
            fail_job_permanently(
                &state.db,
                job_id,
                escrow_id,
                &format!("safety guard failed: {e}"),
            )
            .await;
            return;
        }
    };

    let params = PayoutParams {
        payout_id,
        escrow_id,
        phone,
        amount: verified_amount,
        remarks: "Funga-Deal escrow release",
    };

    match state.b2c.initiate_payout(&params).await {
        Ok(resp) => {
            info!(
                "payout initiated: job={job_id} escrow={escrow_id} conversation={}",
                resp.conversation_id
            );
            on_payout_success(&state.db, job_id, escrow_id, &resp.conversation_id).await;
            notify_django(state, "payout.initiated", &escrow_id.to_string()).await;
        }
        Err(e) => {
            warn!("payout attempt {} failed for job {job_id}: {e}", attempts + 1);
            on_payout_failure(&state.db, job_id, escrow_id, attempts, &e.to_string()).await;
        }
    }
}

async fn on_payout_success(db: &PgPool, job_id: Uuid, escrow_id: Uuid, conversation_id: &str) {
    let result = async {
        let mut tx = db.begin().await?;

        sqlx::query(
            "UPDATE payout_jobs
             SET status = 'pending', b2c_conversation_id = $1,
                 attempts = attempts + 1, updated_at = NOW()
             WHERE id = $2",
        )
        .bind(conversation_id)
        .bind(job_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "UPDATE escrows SET status = 'payout_pending', updated_at = NOW() WHERE id = $1",
        )
        .bind(escrow_id)
        .execute(&mut *tx)
        .await?;

        append_audit(
            &mut tx,
            escrow_id,
            "release_queued",
            "payout_pending",
            &format!("B2C initiated: conversation_id={conversation_id}"),
            "worker",
        )
        .await?;

        tx.commit().await?;
        anyhow::Ok(())
    }
    .await;

    if let Err(e) = result {
        error!("on_payout_success DB update failed for job {job_id}: {e}");
    }
}

async fn on_payout_failure(
    db: &PgPool,
    job_id: Uuid,
    escrow_id: Uuid,
    attempts: u32,
    error_msg: &str,
) {
    let next_attempt = attempts + 1;
    let max_attempts = 5u32;

    let result = async {
        let mut tx = db.begin().await?;

        if next_attempt >= max_attempts {
            sqlx::query(
                "UPDATE payout_jobs
                 SET status = 'failed', last_error = $1,
                     attempts = attempts + 1, updated_at = NOW()
                 WHERE id = $2",
            )
            .bind(error_msg)
            .bind(job_id)
            .execute(&mut *tx)
            .await?;

            sqlx::query(
                "UPDATE escrows SET status = 'payout_failed', updated_at = NOW() WHERE id = $1",
            )
            .bind(escrow_id)
            .execute(&mut *tx)
            .await?;

            append_audit(
                &mut tx,
                escrow_id,
                "payout_pending",
                "payout_failed",
                &format!("B2C failed after {next_attempt} attempts: {error_msg}"),
                "worker",
            )
            .await?;

            error!(
                "payout permanently FAILED for escrow {escrow_id} after {next_attempt} attempts"
            );
        } else {
            let delay = backoff_duration(next_attempt);
            let next_at_secs = delay.as_secs() as i64;

            sqlx::query(
                "UPDATE payout_jobs
                 SET status = 'queued',
                     last_error = $1,
                     attempts = attempts + 1,
                     next_attempt_at = NOW() + ($2 || ' seconds')::INTERVAL,
                     updated_at = NOW()
                 WHERE id = $3",
            )
            .bind(error_msg)
            .bind(next_at_secs)
            .bind(job_id)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        anyhow::Ok(())
    }
    .await;

    if let Err(e) = result {
        error!("on_payout_failure DB update failed for job {job_id}: {e}");
    }
}

async fn fail_job_permanently(db: &PgPool, job_id: Uuid, escrow_id: Uuid, reason: &str) {
    let _ = async {
        let mut tx = db.begin().await?;

        sqlx::query(
            "UPDATE payout_jobs
             SET status = 'failed', last_error = $1, updated_at = NOW()
             WHERE id = $2",
        )
        .bind(reason)
        .bind(job_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "UPDATE escrows SET status = 'payout_failed', updated_at = NOW() WHERE id = $1",
        )
        .bind(escrow_id)
        .execute(&mut *tx)
        .await?;

        append_audit(
            &mut tx,
            escrow_id,
            "release_queued",
            "payout_failed",
            reason,
            "worker",
        )
        .await?;

        tx.commit().await?;
        anyhow::Ok(())
    }
    .await;
}

async fn append_audit(
    tx: &mut Transaction<'_, Postgres>,
    transaction_id: Uuid,
    old_status: &str,
    new_status: &str,
    reason: &str,
    actor: &str,
) -> anyhow::Result<()> {
    sqlx::query(
        "INSERT INTO transaction_audit_trail
             (transaction_id, old_status, new_status, reason, actor)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(transaction_id)
    .bind(old_status)
    .bind(new_status)
    .bind(reason)
    .bind(actor)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

fn backoff_duration(attempt: u32) -> Duration {
    let secs = match attempt {
        1 => 5 * 60,
        2 => 15 * 60,
        3 => 45 * 60,
        4 => 2 * 60 * 60,
        _ => 6 * 60 * 60,
    };
    Duration::from_secs(secs)
}

async fn notify_django(state: &WorkerState, event: &str, escrow_id: &str) {
    let result = state
        .http
        .post(format!(
            "{}/api/internal/webhook-event/",
            state.django_backend_url
        ))
        .header(
            "Authorization",
            format!("Bearer {}", state.internal_service_secret.expose_secret()),
        )
        .json(&serde_json::json!({ "event": event, "escrow_id": escrow_id }))
        .send()
        .await;

    match result {
        Ok(r) if r.status().is_success() => {
            info!("Django notified: event={event} escrow={escrow_id}");
        }
        Ok(r) => warn!("Django returned {} for event={event}", r.status()),
        Err(e) => error!("Django notify failed: {e}"),
    }
}
