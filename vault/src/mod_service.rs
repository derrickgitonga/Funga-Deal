use std::sync::Arc;

use axum::{
    body::Body,
    extract::{Path, Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Extension, Json,
};
use jsonwebtoken::{decode, Algorithm, Validation};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::{Postgres, Row, Transaction};
use tracing::{error, warn};
use uuid::Uuid;

use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum UserStatus {
    Active,
    Inactive,
    Suspended,
}

#[derive(Debug)]
enum ModeratorAction {
    UserDeactivated,
    SellerRevoked,
    DisputeIntervened,
    MessageInjected,
}

impl ModeratorAction {
    fn label(&self) -> &'static str {
        match self {
            Self::UserDeactivated => "user_deactivated",
            Self::SellerRevoked => "seller_revoked",
            Self::DisputeIntervened => "dispute_intervened",
            Self::MessageInjected => "message_injected",
        }
    }
}

#[derive(Debug, Deserialize)]
struct ClerkClaims {
    sub: String,
    #[serde(default)]
    metadata: ClerkPublicMetadata,
}

#[derive(Debug, Deserialize, Default)]
struct ClerkPublicMetadata {
    role: Option<String>,
    #[serde(rename = "isAdmin", default)]
    is_admin: bool,
}

impl ClerkPublicMetadata {
    fn is_mod_authorized(&self) -> bool {
        self.is_admin || matches!(self.role.as_deref(), Some("admin") | Some("moderator"))
    }
}

#[derive(Clone, Debug)]
pub struct ModeratorId(pub String);

pub async fn mw_require_moderator(
    State(state): State<Arc<AppState>>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    let Some(key) = &state.clerk_decoding_key else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };

    let token = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("");

    if token.is_empty() {
        return StatusCode::UNAUTHORIZED.into_response();
    }

    let mut validation = Validation::new(Algorithm::RS256);
    validation.validate_aud = false;

    let claims = match decode::<ClerkClaims>(token, key, &mut validation) {
        Ok(d) => d.claims,
        Err(e) => {
            warn!("mod JWT rejected: {e}");
            return StatusCode::UNAUTHORIZED.into_response();
        }
    };

    if !claims.metadata.is_mod_authorized() {
        return StatusCode::FORBIDDEN.into_response();
    }

    req.extensions_mut().insert(ModeratorId(claims.sub));
    next.run(req).await
}

#[derive(Serialize)]
pub struct EscrowSummary {
    id: Uuid,
    buyer_id: String,
    seller_id: String,
    title: String,
    amount: Decimal,
    currency: String,
    status: String,
}

pub async fn list_transactions(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, StatusCode> {
    let rows = sqlx::query(
        "SELECT id, buyer_id, seller_id, title, amount, currency, status::TEXT as status
         FROM escrows
         WHERE status NOT IN ('released', 'refunded', 'payout_completed')
         ORDER BY updated_at DESC
         LIMIT 200",
    )
    .fetch_all(&state.db)
    .await
    .map_err(internal)?;

    let summaries: Vec<EscrowSummary> = rows
        .into_iter()
        .filter_map(|r| {
            Some(EscrowSummary {
                id: r.try_get("id").ok()?,
                buyer_id: r.try_get("buyer_id").ok()?,
                seller_id: r.try_get("seller_id").ok()?,
                title: r.try_get("title").ok()?,
                amount: r.try_get("amount").ok()?,
                currency: r.try_get("currency").ok()?,
                status: r.try_get("status").ok()?,
            })
        })
        .collect();

    Ok(Json(summaries))
}

pub async fn deactivate_user(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<String>,
    Extension(mod_id): Extension<ModeratorId>,
) -> Result<impl IntoResponse, StatusCode> {
    let mut tx = state.db.begin().await.map_err(internal)?;

    let affected = sqlx::query("UPDATE users SET is_active = false WHERE id = $1")
        .bind(&user_id)
        .execute(&mut *tx)
        .await
        .map_err(internal)?
        .rows_affected();

    if affected == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let reason = format!("Moderator {} deactivated user {}", mod_id.0, user_id);
    write_mod_audit(
        &mut tx,
        &mod_id.0,
        ModeratorAction::UserDeactivated,
        &user_id,
        "user",
        &reason,
    )
    .await?;

    tx.commit().await.map_err(internal)?;

    if let Some(redis) = &state.redis {
        invalidate_user_sessions(redis, &user_id).await;
    }

    Ok(StatusCode::NO_CONTENT)
}

pub async fn revoke_seller(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<String>,
    Extension(mod_id): Extension<ModeratorId>,
) -> Result<impl IntoResponse, StatusCode> {
    let mut tx = state.db.begin().await.map_err(internal)?;

    let affected = sqlx::query("UPDATE users SET is_seller = false WHERE id = $1")
        .bind(&user_id)
        .execute(&mut *tx)
        .await
        .map_err(internal)?
        .rows_affected();

    if affected == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let reason = format!("Moderator {} revoked seller privilege for {}", mod_id.0, user_id);
    write_mod_audit(
        &mut tx,
        &mod_id.0,
        ModeratorAction::SellerRevoked,
        &user_id,
        "user",
        &reason,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
pub struct InterveneRequest {
    pub reason: String,
}

pub async fn intervene_dispute(
    State(state): State<Arc<AppState>>,
    Path(escrow_id): Path<Uuid>,
    Extension(mod_id): Extension<ModeratorId>,
    Json(body): Json<InterveneRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    if body.reason.trim().is_empty() {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    let mut tx = state.db.begin().await.map_err(internal)?;

    let row = sqlx::query(
        "SELECT status::TEXT as status FROM escrows WHERE id = $1 FOR UPDATE",
    )
    .bind(escrow_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(internal)?
    .ok_or(StatusCode::NOT_FOUND)?;

    let current: String = row.try_get("status").map_err(internal)?;

    sqlx::query(
        "UPDATE escrows SET status = 'under_review', updated_at = NOW() WHERE id = $1",
    )
    .bind(escrow_id)
    .execute(&mut *tx)
    .await
    .map_err(internal)?;

    let reason = format!("Moderator {} intervened: {}", mod_id.0, body.reason);

    append_escrow_audit(&mut tx, escrow_id, &current, "under_review", &reason, &mod_id.0).await?;

    write_mod_audit(
        &mut tx,
        &mod_id.0,
        ModeratorAction::DisputeIntervened,
        &escrow_id.to_string(),
        "escrow",
        &reason,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
pub struct InjectMessageRequest {
    pub body: String,
}

pub async fn inject_message(
    State(state): State<Arc<AppState>>,
    Path(escrow_id): Path<Uuid>,
    Extension(mod_id): Extension<ModeratorId>,
    Json(req): Json<InjectMessageRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let body = req.body.trim().to_string();
    if body.is_empty() || body.len() > 2000 {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    let mut tx = state.db.begin().await.map_err(internal)?;

    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM escrows WHERE id = $1)")
        .bind(escrow_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(internal)?;

    if !exists {
        return Err(StatusCode::NOT_FOUND);
    }

    sqlx::query(
        "INSERT INTO transaction_messages (escrow_id, sender_id, sender_role, body)
         VALUES ($1, $2, 'system', $3)",
    )
    .bind(escrow_id)
    .bind(&mod_id.0)
    .bind(&body)
    .execute(&mut *tx)
    .await
    .map_err(internal)?;

    let reason = format!("Moderator {} injected system message into escrow {}", mod_id.0, escrow_id);

    append_escrow_audit(&mut tx, escrow_id, "under_review", "under_review", &reason, &mod_id.0)
        .await?;

    write_mod_audit(
        &mut tx,
        &mod_id.0,
        ModeratorAction::MessageInjected,
        &escrow_id.to_string(),
        "escrow",
        &reason,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(StatusCode::NO_CONTENT)
}

fn internal<E: std::fmt::Display>(e: E) -> StatusCode {
    error!("{e}");
    StatusCode::INTERNAL_SERVER_ERROR
}

async fn append_escrow_audit(
    tx: &mut Transaction<'_, Postgres>,
    escrow_id: Uuid,
    old_status: &str,
    new_status: &str,
    reason: &str,
    actor: &str,
) -> Result<(), StatusCode> {
    sqlx::query(
        "INSERT INTO transaction_audit_trail
             (transaction_id, old_status, new_status, reason, actor)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(escrow_id)
    .bind(old_status)
    .bind(new_status)
    .bind(reason)
    .bind(actor)
    .execute(&mut **tx)
    .await
    .map_err(internal)?;
    Ok(())
}

async fn write_mod_audit(
    tx: &mut Transaction<'_, Postgres>,
    actor_id: &str,
    action: ModeratorAction,
    target_id: &str,
    target_type: &str,
    reason: &str,
) -> Result<(), StatusCode> {
    sqlx::query(
        "INSERT INTO moderator_audit_log
             (actor_id, action, target_id, target_type, reason)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(actor_id)
    .bind(action.label())
    .bind(target_id)
    .bind(target_type)
    .bind(reason)
    .execute(&mut **tx)
    .await
    .map_err(internal)?;
    Ok(())
}

async fn invalidate_user_sessions(client: &redis::Client, user_id: &str) {
    use redis::AsyncCommands;

    let mut conn = match client.get_multiplexed_async_connection().await {
        Ok(c) => c,
        Err(e) => {
            error!("Redis unavailable for session invalidation user={user_id}: {e}");
            return;
        }
    };

    let keys = [
        format!("session:user:{user_id}"),
        format!("user_cache:{user_id}"),
        format!(":1:auth_user_{user_id}"),
        format!("clerk:session:{user_id}"),
    ];

    for key in &keys {
        let _: Result<(), _> = conn.del(key).await;
    }
}
