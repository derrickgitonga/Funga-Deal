use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::Arc,
    time::{Duration, Instant},
};

use axum::{
    body::Bytes,
    extract::{ConnectInfo, Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::IntoResponse,
};
use hmac::{Hmac, Mac};
use secrecy::ExposeSecret;
use serde::Deserialize;
use sha2::{Sha256, Sha512};
use sqlx::{PgPool, Row};
use tokio::sync::Mutex;
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::AppState;

type HmacSha256 = Hmac<Sha256>;
type HmacSha512 = Hmac<Sha512>;

pub struct WebhookRateLimiter {
    windows: Mutex<HashMap<String, Vec<Instant>>>,
    max_requests: u32,
    window: Duration,
}

impl WebhookRateLimiter {
    pub fn new(max_requests: u32, window_secs: u64) -> Self {
        Self {
            windows: Mutex::new(HashMap::new()),
            max_requests,
            window: Duration::from_secs(window_secs),
        }
    }

    pub async fn is_allowed(&self, key: &str) -> bool {
        let mut map = self.windows.lock().await;
        let now = Instant::now();
        let window = self.window;
        let entry = map.entry(key.to_owned()).or_default();
        entry.retain(|&t| now.duration_since(t) < window);
        if entry.len() as u32 >= self.max_requests {
            return false;
        }
        entry.push(now);
        true
    }
}

pub async fn mw_rate_limit(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    req: Request,
    next: Next,
) -> impl IntoResponse {
    let ip = addr.ip().to_string();
    if !state.webhook_rate_limiter.is_allowed(&ip).await {
        warn!("Webhook rate limit exceeded: {ip}");
        return StatusCode::TOO_MANY_REQUESTS.into_response();
    }
    next.run(req).await
}

pub async fn mw_require_mpesa_ip(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    req: Request,
    next: Next,
) -> impl IntoResponse {
    let ip = addr.ip();
    if !state.mpesa_allowed_ips.iter().any(|net| net.contains(&ip)) {
        warn!("M-Pesa webhook blocked: unauthorized source IP {ip}");
        return StatusCode::FORBIDDEN.into_response();
    }
    next.run(req).await
}

fn verify_hmac_sha256(payload: &[u8], hex_sig: &str, secret: &str) -> bool {
    let Ok(mut mac) = HmacSha256::new_from_slice(secret.as_bytes()) else {
        return false;
    };
    mac.update(payload);
    let expected = hex::encode(mac.finalize().into_bytes());
    constant_time_eq(expected.as_bytes(), hex_sig.as_bytes())
}

fn verify_hmac_sha512_sorted(payload: &[u8], hex_sig: &str, secret: &str) -> bool {
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(payload) else {
        return false;
    };
    let sorted = sort_json_keys(&value);
    let Ok(sorted_str) = serde_json::to_string(&sorted) else {
        return false;
    };
    let Ok(mut mac) = HmacSha512::new_from_slice(secret.as_bytes()) else {
        return false;
    };
    mac.update(sorted_str.as_bytes());
    let expected = hex::encode(mac.finalize().into_bytes());
    constant_time_eq(expected.as_bytes(), hex_sig.as_bytes())
}

fn sort_json_keys(value: &serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let mut sorted = serde_json::Map::new();
            for k in keys {
                sorted.insert(k.clone(), sort_json_keys(&map[k]));
            }
            serde_json::Value::Object(sorted)
        }
        _ => value.clone(),
    }
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

async fn write_audit_log(
    db: &PgPool,
    provider: &str,
    source_ip: &str,
    raw_payload: &str,
    sig_valid: bool,
) -> String {
    let log_id = Uuid::new_v4().to_string();
    if let Err(e) = sqlx::query(
        "INSERT INTO webhook_audit_log (id, provider, source_ip, raw_payload, signature_valid)
         VALUES ($1, $2, $3::inet, $4, $5)",
    )
    .bind(&log_id)
    .bind(provider)
    .bind(source_ip)
    .bind(raw_payload)
    .bind(sig_valid)
    .execute(db)
    .await
    {
        error!("Audit log write failed: {e}");
    }
    log_id
}

async fn mark_processed(db: &PgPool, log_id: &str, err: Option<&str>) {
    let _ = sqlx::query(
        "UPDATE webhook_audit_log SET processed = true, error = $1 WHERE id = $2",
    )
    .bind(err)
    .bind(log_id)
    .execute(db)
    .await;
}

async fn complete_order(db: &PgPool, order_id: &str) -> anyhow::Result<bool> {
    let mut tx = db.begin().await?;

    let row = sqlx::query(
        "SELECT status FROM payment_link_orders WHERE id = $1 FOR UPDATE",
    )
    .bind(order_id)
    .fetch_optional(&mut *tx)
    .await?;

    let Some(row) = row else {
        tx.rollback().await?;
        return Ok(false);
    };

    let status: String = row.try_get("status").unwrap_or_default();
    if status == "paid" {
        tx.rollback().await?;
        return Ok(false);
    }

    sqlx::query(
        "UPDATE payment_link_orders
         SET status = 'paid', updated_at = NOW()
         WHERE id = $1 AND status = 'pending'",
    )
    .bind(order_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(true)
}

async fn notify_django(
    http: &reqwest::Client,
    url: &str,
    secret: &str,
    event: &str,
    order_id: &str,
) {
    let result = http
        .post(format!("{url}/api/internal/webhook-event/"))
        .header("Authorization", format!("Bearer {secret}"))
        .json(&serde_json::json!({ "event": event, "order_id": order_id }))
        .send()
        .await;

    match result {
        Ok(r) if r.status().is_success() => {
            info!("Django notified: event={event} order={order_id}");
        }
        Ok(r) => warn!(
            "Django notification returned {}: order={order_id}",
            r.status()
        ),
        Err(e) => error!("Django notification error: {e} order={order_id}"),
    }
}

#[derive(Deserialize)]
pub struct MpesaWebhook {
    #[serde(rename = "Body")]
    pub body: MpesaBody,
}

#[derive(Deserialize)]
pub struct MpesaBody {
    #[serde(rename = "stkCallback")]
    pub stk_callback: StkCallback,
}

#[derive(Deserialize)]
pub struct StkCallback {
    #[serde(rename = "CheckoutRequestID")]
    pub checkout_request_id: String,
    #[serde(rename = "ResultCode")]
    pub result_code: i64,
    #[serde(rename = "ResultDesc")]
    pub result_desc: String,
}

pub async fn mpesa_webhook(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    body: Bytes,
) -> StatusCode {
    let source_ip = addr.ip().to_string();
    let raw = String::from_utf8_lossy(&body).into_owned();
    let log_id = write_audit_log(&state.db, "mpesa", &source_ip, &raw, true).await;

    let payload: MpesaWebhook = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(e) => {
            error!("M-Pesa webhook parse error: {e}");
            mark_processed(&state.db, &log_id, Some(&e.to_string())).await;
            return StatusCode::BAD_REQUEST;
        }
    };

    let cb = &payload.body.stk_callback;

    if cb.result_code != 0 {
        warn!(
            "M-Pesa payment failed: {} (code {})",
            cb.result_desc, cb.result_code
        );
        mark_processed(&state.db, &log_id, None).await;
        return StatusCode::OK;
    }

    let order_id = match sqlx::query(
        "SELECT id FROM payment_link_orders WHERE mpesa_checkout_id = $1",
    )
    .bind(&cb.checkout_request_id)
    .fetch_optional(&state.db)
    .await
    {
        Ok(Some(row)) => row.try_get::<String, _>("id").unwrap_or_default(),
        Ok(None) => {
            error!(
                "No order for M-Pesa checkout {}",
                cb.checkout_request_id
            );
            mark_processed(&state.db, &log_id, Some("order not found")).await;
            return StatusCode::OK;
        }
        Err(e) => {
            error!("DB error looking up M-Pesa checkout: {e}");
            mark_processed(&state.db, &log_id, Some(&e.to_string())).await;
            return StatusCode::INTERNAL_SERVER_ERROR;
        }
    };

    match complete_order(&state.db, &order_id).await {
        Ok(true) => {
            notify_django(
                &state.http_client,
                &state.django_backend_url,
                state.internal_service_secret.as_ref().map(|s| s.expose_secret().as_str()).unwrap_or(""),
                "payment.completed",
                &order_id,
            )
            .await;
            mark_processed(&state.db, &log_id, None).await;
        }
        Ok(false) => {
            info!("M-Pesa order {order_id} already completed (idempotent)");
            mark_processed(&state.db, &log_id, None).await;
        }
        Err(e) => {
            error!("Failed to complete M-Pesa order {order_id}: {e}");
            mark_processed(&state.db, &log_id, Some(&e.to_string())).await;
        }
    }

    StatusCode::OK
}

pub async fn nowpayments_webhook(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    body: Bytes,
) -> StatusCode {
    let source_ip = addr.ip().to_string();
    let raw = String::from_utf8_lossy(&body).into_owned();

    let sig = headers
        .get("x-nowpayments-sig")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let sig_valid = verify_hmac_sha512_sorted(
        &body,
        sig,
        state.nowpayments_ipn_secret.expose_secret(),
    );

    let log_id =
        write_audit_log(&state.db, "nowpayments", &source_ip, &raw, sig_valid).await;

    if !sig_valid {
        warn!("NOWPayments webhook: invalid signature from {source_ip}");
        mark_processed(&state.db, &log_id, Some("invalid signature")).await;
        return StatusCode::UNAUTHORIZED;
    }

    let payload: serde_json::Value = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(e) => {
            error!("NOWPayments webhook parse error: {e}");
            mark_processed(&state.db, &log_id, Some(&e.to_string())).await;
            return StatusCode::BAD_REQUEST;
        }
    };

    let payment_status = payload
        .get("payment_status")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if payment_status != "finished" && payment_status != "confirmed" {
        mark_processed(&state.db, &log_id, None).await;
        return StatusCode::OK;
    }

    let order_id = match payload.get("order_id").and_then(|v| v.as_str()) {
        Some(id) => id.to_string(),
        None => {
            error!("NOWPayments webhook: missing order_id in payload");
            mark_processed(&state.db, &log_id, Some("missing order_id")).await;
            return StatusCode::OK;
        }
    };

    match complete_order(&state.db, &order_id).await {
        Ok(true) => {
            notify_django(
                &state.http_client,
                &state.django_backend_url,
                state.internal_service_secret.as_ref().map(|s| s.expose_secret().as_str()).unwrap_or(""),
                "payment.completed",
                &order_id,
            )
            .await;
            mark_processed(&state.db, &log_id, None).await;
        }
        Ok(false) => {
            info!("NOWPayments order {order_id} already completed (idempotent)");
            mark_processed(&state.db, &log_id, None).await;
        }
        Err(e) => {
            error!("Failed to complete NOWPayments order {order_id}: {e}");
            mark_processed(&state.db, &log_id, Some(&e.to_string())).await;
        }
    }

    StatusCode::OK
}

#[derive(Deserialize)]
struct IntaSendPayload {
    state: String,
    invoice: Option<IntaSendInvoice>,
}

#[derive(Deserialize)]
struct IntaSendInvoice {
    invoice_id: String,
}

pub async fn intasend_webhook(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    body: Bytes,
) -> StatusCode {
    let source_ip = addr.ip().to_string();
    let raw = String::from_utf8_lossy(&body).into_owned();

    let sig = headers
        .get("x-intasend-signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let secret = match &state.intasend_webhook_secret {
        Some(s) => s.expose_secret().as_str(),
        None => {
            error!("IntaSend webhook hit but INTASEND_WEBHOOK_SECRET is not configured");
            return StatusCode::INTERNAL_SERVER_ERROR;
        }
    };

    let sig_valid = verify_hmac_sha256(&body, sig, secret);
    let log_id =
        write_audit_log(&state.db, "intasend", &source_ip, &raw, sig_valid).await;

    if !sig_valid {
        warn!("IntaSend webhook: invalid HMAC-SHA256 signature from {source_ip}");
        mark_processed(&state.db, &log_id, Some("invalid signature")).await;
        return StatusCode::UNAUTHORIZED;
    }

    let payload: IntaSendPayload = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(e) => {
            error!("IntaSend webhook parse error: {e}");
            mark_processed(&state.db, &log_id, Some(&e.to_string())).await;
            return StatusCode::BAD_REQUEST;
        }
    };

    if payload.state != "COMPLETE" {
        mark_processed(&state.db, &log_id, None).await;
        return StatusCode::OK;
    }

    let invoice_id = match payload.invoice.map(|i| i.invoice_id) {
        Some(id) => id,
        None => {
            error!("IntaSend webhook: COMPLETE state but no invoice_id");
            mark_processed(&state.db, &log_id, Some("missing invoice_id")).await;
            return StatusCode::OK;
        }
    };

    let order_id = match sqlx::query(
        "SELECT id FROM payment_link_orders WHERE nowpayments_invoice_id = $1",
    )
    .bind(&invoice_id)
    .fetch_optional(&state.db)
    .await
    {
        Ok(Some(row)) => row.try_get::<String, _>("id").unwrap_or_default(),
        Ok(None) => {
            error!("No order for IntaSend invoice {invoice_id}");
            mark_processed(&state.db, &log_id, Some("order not found")).await;
            return StatusCode::OK;
        }
        Err(e) => {
            error!("DB error looking up IntaSend invoice: {e}");
            mark_processed(&state.db, &log_id, Some(&e.to_string())).await;
            return StatusCode::INTERNAL_SERVER_ERROR;
        }
    };

    match complete_order(&state.db, &order_id).await {
        Ok(true) => {
            notify_django(
                &state.http_client,
                &state.django_backend_url,
                state.internal_service_secret.as_ref().map(|s| s.expose_secret().as_str()).unwrap_or(""),
                "payment.completed",
                &order_id,
            )
            .await;
            mark_processed(&state.db, &log_id, None).await;
        }
        Ok(false) => {
            info!("IntaSend order {order_id} already completed (idempotent)");
            mark_processed(&state.db, &log_id, None).await;
        }
        Err(e) => {
            error!("Failed to complete IntaSend order {order_id}: {e}");
            mark_processed(&state.db, &log_id, Some(&e.to_string())).await;
        }
    }

    StatusCode::OK
}
