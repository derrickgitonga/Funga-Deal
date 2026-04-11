use std::sync::Arc;

use axum::{
    body::Bytes,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use rust_decimal::{prelude::ToPrimitive, Decimal};
use serde::Serialize;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::AppState;

#[derive(Serialize)]
pub struct CryptoPaymentResponse {
    pub invoice_id: String,
    pub invoice_url: String,
}

pub async fn initiate_crypto_payment(
    State(state): State<Arc<AppState>>,
    Path(transaction_id): Path<Uuid>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let bad = |msg: &str| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "detail": msg })),
        )
    };

    let id_str = transaction_id.to_string();

    let row = sqlx::query(
        "SELECT status, title, amount FROM transactions WHERE id = $1",
    )
    .bind(&id_str)
    .fetch_one(&state.db)
    .await
    .map_err(|_| bad("Transaction not found"))?;

    let status: String = row.try_get("status").unwrap_or_default();
    if status != "CREATED" {
        return Err(bad("Transaction is not in CREATED state"));
    }

    let title: String = row.try_get("title").unwrap_or_default();
    let amount: Decimal = row.try_get("amount").map_err(|_| bad("Invalid amount"))?;
    let price_amount = amount.to_f64().unwrap_or(0.0);

    let invoice = state
        .nowpayments
        .create_invoice(
            &id_str,
            &title,
            price_amount,
            &state.nowpayments_price_currency,
            format!("{}/crypto-payments/callback", state.vault_public_url),
            format!("{}/dashboard?crypto=success", state.frontend_url),
            format!("{}/dashboard?crypto=cancelled", state.frontend_url),
        )
        .await
        .map_err(|e| {
            tracing::error!("NOWPayments invoice failed: {e}");
            (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "detail": "Crypto payment initiation failed" })),
            )
        })?;

    sqlx::query(
        "UPDATE transactions SET nowpayments_invoice_id = $1 WHERE id = $2",
    )
    .bind(&invoice.id)
    .bind(&id_str)
    .execute(&state.db)
    .await
    .map_err(|_| bad("Failed to store invoice ID"))?;

    Ok(Json(CryptoPaymentResponse {
        invoice_id: invoice.id,
        invoice_url: invoice.invoice_url,
    }))
}

pub async fn crypto_callback(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    let sig = headers
        .get("x-nowpayments-sig")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let payload: serde_json::Value = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(_) => return StatusCode::BAD_REQUEST,
    };

    let sorted = sort_json_keys(&payload);
    let sorted_str = serde_json::to_string(&sorted).unwrap_or_default();

    if !state.nowpayments.verify_ipn_signature(&sorted_str, sig) {
        tracing::warn!("Invalid NOWPayments IPN signature, rejecting callback");
        return StatusCode::UNAUTHORIZED;
    }

    let payment_status = payload
        .get("payment_status")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if payment_status != "finished" && payment_status != "confirmed" {
        tracing::info!("NOWPayments IPN: status={payment_status}, skipping");
        return StatusCode::OK;
    }

    let order_id = match payload.get("order_id").and_then(|v| v.as_str()) {
        Some(id) => id.to_string(),
        None => {
            tracing::error!("NOWPayments IPN missing order_id");
            return StatusCode::OK;
        }
    };

    let actually_paid = payload
        .get("actually_paid")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    if let Err(e) = fund_transaction_crypto(&state.db, &order_id, actually_paid).await {
        tracing::error!("Failed to fund transaction {order_id}: {e}");
    }

    StatusCode::OK
}

async fn fund_transaction_crypto(
    db: &PgPool,
    tx_id: &str,
    paid: f64,
) -> anyhow::Result<()> {
    let mut dbtx = db.begin().await?;

    sqlx::query("UPDATE transactions SET status = 'FUNDED' WHERE id = $1")
        .bind(tx_id)
        .execute(&mut *dbtx)
        .await?;

    let row = sqlx::query("SELECT amount FROM transactions WHERE id = $1")
        .bind(tx_id)
        .fetch_one(&mut *dbtx)
        .await?;

    let db_amount: Decimal = row.try_get("amount")?;
    let amount = if paid > 0.0 {
        Decimal::from_f64_retain(paid).unwrap_or(db_amount)
    } else {
        db_amount
    };

    let id1 = Uuid::new_v4().to_string();
    let id2 = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO ledger_entries (id, transaction_id, account_type, entry_type, amount, description, created_at)
         VALUES ($1, $2, 'BUYER', 'DEBIT', $3, 'Buyer crypto payment', NOW())",
    )
    .bind(&id1)
    .bind(tx_id)
    .bind(amount)
    .execute(&mut *dbtx)
    .await?;

    sqlx::query(
        "INSERT INTO ledger_entries (id, transaction_id, account_type, entry_type, amount, description, created_at)
         VALUES ($1, $2, 'ESCROW', 'CREDIT', $3, 'Escrow hold', NOW())",
    )
    .bind(&id2)
    .bind(tx_id)
    .bind(amount)
    .execute(&mut *dbtx)
    .await?;

    dbtx.commit().await?;
    Ok(())
}

fn sort_json_keys(value: &serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Object(map) => {
            let mut sorted = serde_json::Map::new();
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            for key in keys {
                sorted.insert(key.clone(), sort_json_keys(&map[key]));
            }
            serde_json::Value::Object(sorted)
        }
        _ => value.clone(),
    }
}
