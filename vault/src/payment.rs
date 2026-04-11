use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use rust_decimal::{prelude::ToPrimitive, Decimal};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::AppState;

#[derive(Deserialize)]
pub struct InitiatePaymentRequest {
    pub phone_number: String,
}

#[derive(Serialize)]
pub struct InitiatePaymentResponse {
    pub checkout_request_id: String,
    pub message: String,
}

pub async fn initiate_payment(
    State(state): State<Arc<AppState>>,
    Path(transaction_id): Path<Uuid>,
    Json(req): Json<InitiatePaymentRequest>,
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

    let amount: Decimal = row.try_get("amount").map_err(|_| bad("Invalid amount"))?;
    let title: String = row.try_get("title").unwrap_or_default();

    let amount_u64 = amount.to_u64().unwrap_or(0);

    let res = state
        .mpesa
        .stk_push(&id_str, &req.phone_number, amount_u64, &title)
        .await
        .map_err(|e| {
            tracing::error!("STK push failed: {e}");
            (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "detail": "M-Pesa request failed" })),
            )
        })?;

    if res.response_code != "0" {
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "detail": res.response_description })),
        ));
    }

    sqlx::query("UPDATE transactions SET mpesa_checkout_id = $1 WHERE id = $2")
        .bind(&res.checkout_request_id)
        .bind(&id_str)
        .execute(&state.db)
        .await
        .map_err(|_| bad("Failed to store checkout ID"))?;

    Ok(Json(InitiatePaymentResponse {
        checkout_request_id: res.checkout_request_id,
        message: res.customer_message,
    }))
}

#[derive(Deserialize)]
pub struct MpesaCallback {
    #[serde(rename = "Body")]
    pub body: CallbackBody,
}

#[derive(Deserialize)]
pub struct CallbackBody {
    #[serde(rename = "stkCallback")]
    pub stk_callback: StkCallback,
}

#[derive(Deserialize)]
pub struct StkCallback {
    #[serde(rename = "CheckoutRequestID")]
    pub checkout_request_id: String,
    #[serde(rename = "ResultCode")]
    pub result_code: i64,
    #[serde(rename = "CallbackMetadata")]
    pub callback_metadata: Option<CallbackMetadata>,
}

#[derive(Deserialize)]
pub struct CallbackMetadata {
    #[serde(rename = "Item")]
    pub items: Vec<MetadataItem>,
}

#[derive(Deserialize)]
pub struct MetadataItem {
    #[serde(rename = "Name")]
    pub name: String,
    #[serde(rename = "Value")]
    pub value: Option<serde_json::Value>,
}

pub async fn mpesa_callback(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<MpesaCallback>,
) -> impl IntoResponse {
    let cb = &payload.body.stk_callback;

    if cb.result_code != 0 {
        tracing::warn!("M-Pesa callback: payment failed (code {})", cb.result_code);
        return StatusCode::OK;
    }

    let tx_id = match sqlx::query(
        "SELECT id FROM transactions WHERE mpesa_checkout_id = $1",
    )
    .bind(&cb.checkout_request_id)
    .fetch_one(&state.db)
    .await
    {
        Ok(row) => {
            let id: String = row.try_get("id").unwrap_or_default();
            id
        }
        Err(_) => {
            tracing::error!("No transaction for checkout {}", cb.checkout_request_id);
            return StatusCode::OK;
        }
    };

    let paid_amount = cb
        .callback_metadata
        .as_ref()
        .and_then(|m| m.items.iter().find(|i| i.name == "Amount"))
        .and_then(|i| i.value.as_ref())
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    if let Err(e) = fund_transaction(&state.db, &tx_id, paid_amount).await {
        tracing::error!("Failed to fund transaction {tx_id}: {e}");
    }

    StatusCode::OK
}

async fn fund_transaction(db: &PgPool, tx_id: &str, amount: f64) -> anyhow::Result<()> {
    let mut dbtx = db.begin().await?;

    sqlx::query("UPDATE transactions SET status = 'FUNDED' WHERE id = $1")
        .bind(tx_id)
        .execute(&mut *dbtx)
        .await?;

    let row = sqlx::query(
        "SELECT buyer_id, seller_id, amount FROM transactions WHERE id = $1",
    )
    .bind(tx_id)
    .fetch_one(&mut *dbtx)
    .await?;

    let _buyer_id: String = row.try_get("buyer_id")?;
    let _seller_id: String = row.try_get("seller_id")?;
    let db_amount: Decimal = row.try_get("amount")?;

    let paid = if amount > 0.0 {
        Decimal::from_f64_retain(amount).unwrap_or(db_amount)
    } else {
        db_amount
    };

    let entry_id_1 = Uuid::new_v4().to_string();
    let entry_id_2 = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO ledger_entries (id, transaction_id, account_type, entry_type, amount, description, created_at)
         VALUES ($1, $2, 'BUYER', 'DEBIT', $3, 'Buyer M-Pesa payment', NOW())",
    )
    .bind(&entry_id_1)
    .bind(tx_id)
    .bind(paid)
    .execute(&mut *dbtx)
    .await?;

    sqlx::query(
        "INSERT INTO ledger_entries (id, transaction_id, account_type, entry_type, amount, description, created_at)
         VALUES ($1, $2, 'ESCROW', 'CREDIT', $3, 'Escrow hold', NOW())",
    )
    .bind(&entry_id_2)
    .bind(tx_id)
    .bind(paid)
    .execute(&mut *dbtx)
    .await?;

    dbtx.commit().await?;
    Ok(())
}
