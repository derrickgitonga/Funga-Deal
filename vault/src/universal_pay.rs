use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use rust_decimal::{prelude::ToPrimitive, Decimal};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::AppState;

type ApiResult = Result<(StatusCode, Json<serde_json::Value>), (StatusCode, Json<serde_json::Value>)>;

fn err(code: StatusCode, msg: &str) -> (StatusCode, Json<serde_json::Value>) {
    (code, Json(serde_json::json!({ "detail": msg })))
}

#[derive(Debug, Serialize)]
pub struct Transaction {
    pub id: String,
    pub amount: Decimal,
    pub currency: String,
    pub seller_id: String,
    pub status: String,
    pub payer_email: Option<String>,
    pub payer_phone: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaymentMethod {
    Mpesa,
    Crypto,
}

#[derive(Debug, Deserialize)]
pub struct InitiateRequest {
    pub phone: Option<String>,
    pub email: Option<String>,
    pub buyer_name: Option<String>,
    pub payment_method: PaymentMethod,
    pub idempotency_key: Option<Uuid>,
}

pub async fn get_payment(
    State(state): State<Arc<AppState>>,
    Path(link_id): Path<String>,
) -> ApiResult {
    let row = sqlx::query(
        "SELECT pl.id, pl.title, pl.description, pl.price, pl.currency,
                pl.status::text AS status, u.full_name AS seller_name
         FROM payment_links pl
         LEFT JOIN users u ON u.id = pl.seller_id
         WHERE pl.id = $1",
    )
    .bind(&link_id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| err(StatusCode::NOT_FOUND, "Payment link not found"))?;

    let status: String = row.try_get("status").unwrap_or_default();
    if status.to_lowercase() != "active" {
        return Err(err(StatusCode::GONE, "This payment link is no longer active"));
    }

    let price: Decimal = row
        .try_get("price")
        .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Invalid price data"))?;

    Ok((
        StatusCode::OK,
        Json(serde_json::json!({
            "id":          row.try_get::<String, _>("id").unwrap_or_default(),
            "title":       row.try_get::<String, _>("title").unwrap_or_default(),
            "description": row.try_get::<Option<String>, _>("description").ok().flatten(),
            "amount":      price.to_f64().unwrap_or(0.0),
            "currency":    row.try_get::<String, _>("currency").unwrap_or_default(),
            "seller_name": row.try_get::<Option<String>, _>("seller_name").ok().flatten(),
        })),
    ))
}

pub async fn initiate_payment(
    State(state): State<Arc<AppState>>,
    Path(link_id): Path<String>,
    Json(req): Json<InitiateRequest>,
) -> ApiResult {
    if matches!(req.payment_method, PaymentMethod::Mpesa) && req.phone.is_none() {
        return Err(err(
            StatusCode::UNPROCESSABLE_ENTITY,
            "phone is required for M-Pesa",
        ));
    }

    let mut tx = state
        .db
        .begin()
        .await
        .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    if let Some(idem_key) = req.idempotency_key {
        if let Ok(existing) = sqlx::query(
            "SELECT id, status FROM payment_link_orders WHERE idempotency_key = $1",
        )
        .bind(idem_key)
        .fetch_one(&mut *tx)
        .await
        {
            let existing_id: String = existing.try_get("id").unwrap_or_default();
            let existing_status: String = existing.try_get("status").unwrap_or_default();
            return Ok((
                StatusCode::OK,
                Json(serde_json::json!({
                    "order_id": existing_id,
                    "status":   existing_status,
                    "message":  "Existing order returned",
                })),
            ));
        }
    }

    let link_row = sqlx::query(
        "SELECT id, title, price, currency, allow_multiple, status::text AS status
         FROM payment_links
         WHERE id = $1
         FOR UPDATE",
    )
    .bind(&link_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|_| err(StatusCode::NOT_FOUND, "Payment link not found"))?;

    let link_status: String = link_row.try_get("status").unwrap_or_default();
    if link_status.to_lowercase() != "active" {
        return Err(err(StatusCode::GONE, "This payment link is no longer active"));
    }

    let title: String = link_row.try_get("title").unwrap_or_default();
    let price: Decimal = link_row
        .try_get("price")
        .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Invalid price"))?;
    let currency: String = link_row
        .try_get("currency")
        .unwrap_or_else(|_| "KES".into());
    let allow_multiple: bool = link_row.try_get("allow_multiple").unwrap_or(true);

    if !allow_multiple {
        let paid = sqlx::query(
            "SELECT id FROM payment_link_orders
             WHERE payment_link_id = $1 AND status = 'paid'
             LIMIT 1",
        )
        .bind(&link_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

        if paid.is_some() {
            return Err(err(
                StatusCode::CONFLICT,
                "This payment link has already been paid",
            ));
        }
    }

    if let Some(phone) = &req.phone {
        let in_flight = sqlx::query(
            "SELECT id FROM payment_link_orders
             WHERE payment_link_id = $1
               AND payer_phone = $2
               AND status = 'pending'
               AND created_at > NOW() - INTERVAL '5 minutes'
             LIMIT 1",
        )
        .bind(&link_id)
        .bind(phone)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

        if in_flight.is_some() {
            return Err(err(
                StatusCode::TOO_MANY_REQUESTS,
                "A payment is already in progress for this number",
            ));
        }
    }

    let order_id = Uuid::new_v4().to_string();
    let amount_u64 = price.to_u64().unwrap_or(0);

    match req.payment_method {
        PaymentMethod::Mpesa => {
            let phone = req.phone.as_deref().unwrap();

            let stk = state
                .mpesa
                .stk_push(&order_id, phone, amount_u64, &title)
                .await
                .map_err(|e| {
                    tracing::error!("STK push failed for universal link {link_id}: {e}");
                    err(StatusCode::BAD_GATEWAY, "M-Pesa request failed")
                })?;

            if stk.response_code != "0" {
                return Err(err(StatusCode::BAD_GATEWAY, &stk.response_description));
            }

            sqlx::query(
                "INSERT INTO payment_link_orders
                 (id, payment_link_id, buyer_name, buyer_email, payer_phone,
                  amount, currency, status, payment_method, mpesa_checkout_id, idempotency_key)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 'mpesa', $8, $9)",
            )
            .bind(&order_id)
            .bind(&link_id)
            .bind(req.buyer_name.as_deref())
            .bind(req.email.as_deref())
            .bind(phone)
            .bind(price)
            .bind(&currency)
            .bind(&stk.checkout_request_id)
            .bind(req.idempotency_key)
            .execute(&mut *tx)
            .await
            .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create order"))?;

            tx.commit()
                .await
                .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Transaction commit failed"))?;

            Ok((
                StatusCode::CREATED,
                Json(serde_json::json!({
                    "order_id":             order_id,
                    "checkout_request_id":  stk.checkout_request_id,
                    "message":              stk.customer_message,
                })),
            ))
        }

        PaymentMethod::Crypto => {
            let invoice = state
                .nowpayments
                .create_invoice(
                    &order_id,
                    &title,
                    price.to_f64().unwrap_or(0.0),
                    &currency.to_lowercase(),
                    format!("{}/payment-links/callback/crypto", state.vault_public_url),
                    format!("{}/pay/{}?status=success", state.frontend_url, link_id),
                    format!("{}/pay/{}?status=cancelled", state.frontend_url, link_id),
                )
                .await
                .map_err(|e| {
                    tracing::error!("NOWPayments invoice failed for universal link {link_id}: {e}");
                    err(StatusCode::BAD_GATEWAY, "Crypto payment initiation failed")
                })?;

            sqlx::query(
                "INSERT INTO payment_link_orders
                 (id, payment_link_id, buyer_name, buyer_email,
                  amount, currency, status, payment_method, nowpayments_invoice_id, idempotency_key)
                 VALUES ($1, $2, $3, $4, $5, $6, 'pending', 'crypto', $7, $8)",
            )
            .bind(&order_id)
            .bind(&link_id)
            .bind(req.buyer_name.as_deref())
            .bind(req.email.as_deref())
            .bind(price)
            .bind(&currency)
            .bind(&invoice.id)
            .bind(req.idempotency_key)
            .execute(&mut *tx)
            .await
            .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create order"))?;

            tx.commit()
                .await
                .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Transaction commit failed"))?;

            Ok((
                StatusCode::CREATED,
                Json(serde_json::json!({
                    "order_id":    order_id,
                    "invoice_url": invoice.invoice_url,
                    "message":     "Crypto invoice created",
                })),
            ))
        }
    }
}
