use std::sync::Arc;

use axum::{
    body::Bytes,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use rust_decimal::{prelude::ToPrimitive, Decimal};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::AppState;

#[derive(Serialize)]
pub struct PublicLinkDetails {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub price: f64,
    pub currency: String,
    pub delivery_method: String,
    pub seller_name: Option<String>,
    pub status: String,
}

#[derive(Deserialize)]
pub struct PayLinkCryptoRequest {
    pub buyer_name: Option<String>,
    pub buyer_email: Option<String>,
}

#[derive(Deserialize)]
pub struct PayLinkMpesaRequest {
    pub phone_number: String,
    pub buyer_name: Option<String>,
    pub buyer_email: Option<String>,
}

#[derive(Serialize)]
pub struct CryptoInitResponse {
    pub order_id: String,
    pub invoice_url: String,
}

#[derive(Serialize)]
pub struct MpesaInitResponse {
    pub order_id: String,
    pub checkout_request_id: String,
    pub message: String,
}

pub async fn get_link(
    State(state): State<Arc<AppState>>,
    Path(link_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let not_found = || {
        (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "detail": "Payment link not found" })),
        )
    };

    let row = sqlx::query(
        "SELECT pl.id, pl.title, pl.description, pl.price, pl.currency,
                pl.delivery_method, pl.status::text AS status, u.full_name AS seller_name
         FROM payment_links pl
         LEFT JOIN users u ON u.id = pl.seller_id
         WHERE pl.id = $1",
    )
    .bind(&link_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("get_link DB error for id={link_id}: {e}");
        not_found()
    })?;

    let status: String = row.try_get("status").unwrap_or_default();
    tracing::info!("get_link id={link_id} status={status:?}");
    if status.to_lowercase() != "active" {
        return Err((
            StatusCode::GONE,
            Json(serde_json::json!({ "detail": "This payment link is no longer active" })),
        ));
    }

    let price: Decimal = row.try_get("price").unwrap_or_default();

    Ok(Json(PublicLinkDetails {
        id: row.try_get("id").unwrap_or_default(),
        title: row.try_get("title").unwrap_or_default(),
        description: row.try_get("description").ok(),
        price: price.to_f64().unwrap_or(0.0),
        currency: row.try_get("currency").unwrap_or_default(),
        delivery_method: row.try_get("delivery_method").unwrap_or_default(),
        seller_name: row.try_get("seller_name").ok(),
        status,
    }))
}

pub async fn pay_crypto(
    State(state): State<Arc<AppState>>,
    Path(link_id): Path<String>,
    Json(req): Json<PayLinkCryptoRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let bad = |msg: &str| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "detail": msg })),
        )
    };

    let row = sqlx::query(
        "SELECT title, price, currency, status::text AS status FROM payment_links WHERE id = $1",
    )
    .bind(&link_id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| bad("Payment link not found"))?;

    let link_status: String = row.try_get("status").unwrap_or_default();
    if link_status.to_lowercase() != "active" {
        return Err(bad("This payment link is no longer active"));
    }

    let title: String = row.try_get("title").unwrap_or_default();
    let price: Decimal = row.try_get("price").map_err(|_| bad("Invalid price"))?;
    let currency: String = row.try_get("currency").unwrap_or_else(|_| "USD".into());

    let order_id = Uuid::new_v4().to_string();
    let price_f64 = price.to_f64().unwrap_or(0.0);

    let invoice = state
        .nowpayments
        .create_invoice(
            &order_id,
            &title,
            price_f64,
            &currency.to_lowercase(),
            format!("{}/payment-links/callback/crypto", state.vault_public_url),
            format!("{}/pay/{}?status=success", state.frontend_url, link_id),
            format!("{}/pay/{}?status=cancelled", state.frontend_url, link_id),
        )
        .await
        .map_err(|e| {
            tracing::error!("NOWPayments invoice failed for link {link_id}: {e}");
            (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "detail": "Crypto payment initiation failed" })),
            )
        })?;

    sqlx::query(
        "INSERT INTO payment_link_orders
         (id, payment_link_id, buyer_name, buyer_email, amount, currency, status, payment_method, nowpayments_invoice_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', 'crypto', $7)",
    )
    .bind(&order_id)
    .bind(&link_id)
    .bind(req.buyer_name.as_deref())
    .bind(req.buyer_email.as_deref())
    .bind(price)
    .bind(&currency)
    .bind(&invoice.id)
    .execute(&state.db)
    .await
    .map_err(|_| bad("Failed to create order"))?;

    Ok(Json(CryptoInitResponse {
        order_id,
        invoice_url: invoice.invoice_url,
    }))
}

pub async fn pay_mpesa(
    State(state): State<Arc<AppState>>,
    Path(link_id): Path<String>,
    Json(req): Json<PayLinkMpesaRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let bad = |msg: &str| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "detail": msg })),
        )
    };

    let row = sqlx::query(
        "SELECT title, price, status::text AS status FROM payment_links WHERE id = $1",
    )
    .bind(&link_id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| bad("Payment link not found"))?;

    let link_status: String = row.try_get("status").unwrap_or_default();
    if link_status.to_lowercase() != "active" {
        return Err(bad("This payment link is no longer active"));
    }

    let title: String = row.try_get("title").unwrap_or_default();
    let price: Decimal = row.try_get("price").map_err(|_| bad("Invalid price"))?;
    let amount_u64 = price.to_u64().unwrap_or(0);

    let order_id = Uuid::new_v4().to_string();

    let stk = state
        .mpesa
        .stk_push(&order_id, &req.phone_number, amount_u64, &title)
        .await
        .map_err(|e| {
            tracing::error!("STK push failed for link {link_id}: {e}");
            (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "detail": "M-Pesa request failed" })),
            )
        })?;

    if stk.response_code != "0" {
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "detail": stk.response_description })),
        ));
    }

    sqlx::query(
        "INSERT INTO payment_link_orders
         (id, payment_link_id, buyer_name, buyer_email, amount, currency, status, payment_method, mpesa_checkout_id)
         VALUES ($1, $2, $3, $4, $5, 'KES', 'pending', 'mpesa', $6)",
    )
    .bind(&order_id)
    .bind(&link_id)
    .bind(req.buyer_name.as_deref())
    .bind(req.buyer_email.as_deref())
    .bind(price)
    .bind(&stk.checkout_request_id)
    .execute(&state.db)
    .await
    .map_err(|_| bad("Failed to create order"))?;

    Ok(Json(MpesaInitResponse {
        order_id,
        checkout_request_id: stk.checkout_request_id,
        message: stk.customer_message,
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
        tracing::warn!("Invalid NOWPayments IPN sig for payment link callback");
        return StatusCode::UNAUTHORIZED;
    }

    let payment_status = payload
        .get("payment_status")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if payment_status != "finished" && payment_status != "confirmed" {
        return StatusCode::OK;
    }

    let order_id = match payload.get("order_id").and_then(|v| v.as_str()) {
        Some(id) => id.to_string(),
        None => return StatusCode::OK,
    };

    if let Err(e) = sqlx::query(
        "UPDATE payment_link_orders SET status = 'paid', updated_at = NOW() WHERE id = $1",
    )
    .bind(&order_id)
    .execute(&state.db)
    .await
    {
        tracing::error!("Failed to mark order {order_id} as paid: {e}");
    }

    StatusCode::OK
}

pub async fn mpesa_callback(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<crate::payment::MpesaCallback>,
) -> impl IntoResponse {
    let cb = &payload.body.stk_callback;

    if cb.result_code != 0 {
        tracing::warn!("M-Pesa link callback: failed (code {})", cb.result_code);
        return StatusCode::OK;
    }

    let order_id = match sqlx::query(
        "SELECT id FROM payment_link_orders WHERE mpesa_checkout_id = $1",
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
            tracing::error!(
                "No payment link order for checkout {}",
                cb.checkout_request_id
            );
            return StatusCode::OK;
        }
    };

    if let Err(e) = sqlx::query(
        "UPDATE payment_link_orders SET status = 'paid', updated_at = NOW() WHERE id = $1",
    )
    .bind(&order_id)
    .execute(&state.db)
    .await
    {
        tracing::error!("Failed to mark link order {order_id} as paid: {e}");
    }

    StatusCode::OK
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
