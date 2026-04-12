mod api;
mod application;
mod config;
mod crypto_payment;
mod domain;
mod error;
mod escrow;
mod infrastructure;
mod mpesa;
mod nowpayments;
mod payment;
mod payment_link_payment;

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use dotenvy::dotenv;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use tower_http::cors::CorsLayer;
use tracing::info;
use uuid::Uuid;

use config::Config;
use escrow::{
    db::EscrowRepository,
    machine::{DisputeResolution, ResolvedEscrow},
    AnyEscrow, Created, Escrow,
};
use mpesa::MpesaClient;
use nowpayments::NowPaymentsClient;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub mpesa: Arc<MpesaClient>,
    pub nowpayments: Arc<NowPaymentsClient>,
    pub nowpayments_price_currency: String,
    pub vault_public_url: String,
    pub frontend_url: String,
}

async fn create_escrow(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateEscrowRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let escrow = Escrow::<Created>::new(
        req.buyer_id,
        req.seller_id,
        req.title,
        req.amount,
        req.currency,
        req.idempotency_key,
    );

    EscrowRepository::insert_created(&state.db, &escrow)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(EscrowIdResponse { id: escrow.data.id })))
}

async fn deposit_funds(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(req): Json<DepositRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let any = EscrowRepository::find_by_id(&state.db, id)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let created = match any {
        AnyEscrow::Created(e) => e,
        _ => return Err(StatusCode::CONFLICT),
    };

    let deposited = created
        .deposit(req.mpesa_checkout_id, req.paid_amount)
        .map_err(|_| StatusCode::UNPROCESSABLE_ENTITY)?;

    EscrowRepository::update_status(&state.db, &deposited)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::OK)
}

async fn release_funds(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, StatusCode> {
    let any = EscrowRepository::find_by_id(&state.db, id)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let deposited = match any {
        AnyEscrow::Deposited(e) => e,
        _ => return Err(StatusCode::CONFLICT),
    };

    let released = deposited
        .release()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    EscrowRepository::update_status(&state.db, &released)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::OK)
}

async fn refund_funds(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, StatusCode> {
    let any = EscrowRepository::find_by_id(&state.db, id)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let deposited = match any {
        AnyEscrow::Deposited(e) => e,
        _ => return Err(StatusCode::CONFLICT),
    };

    let refunded = deposited
        .refund()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    EscrowRepository::update_status(&state.db, &refunded)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::OK)
}

async fn resolve_dispute(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(req): Json<ResolveDisputeRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let any = EscrowRepository::find_by_id(&state.db, id)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let disputed = match any {
        AnyEscrow::InDispute(e) => e,
        _ => return Err(StatusCode::CONFLICT),
    };

    match disputed
        .resolve_dispute(req.resolution)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    {
        ResolvedEscrow::Released(e) => {
            EscrowRepository::update_status(&state.db, &e)
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        }
        ResolvedEscrow::Refunded(e) => {
            EscrowRepository::update_status(&state.db, &e)
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        }
    }

    Ok(StatusCode::OK)
}

#[derive(Deserialize)]
struct CreateEscrowRequest {
    buyer_id: String,
    seller_id: String,
    title: String,
    amount: Decimal,
    currency: String,
    idempotency_key: Option<String>,
}

#[derive(Deserialize)]
struct DepositRequest {
    mpesa_checkout_id: String,
    paid_amount: Decimal,
}

#[derive(Deserialize)]
struct ResolveDisputeRequest {
    resolution: DisputeResolution,
}

#[derive(Serialize)]
struct EscrowIdResponse {
    id: Uuid,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("funga_vault=debug".parse()?),
        )
        .init();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let cfg = Config::from_env()?;

    let mpesa = Arc::new(MpesaClient::new(cfg.clone()));
    let nowpayments = Arc::new(NowPaymentsClient::new(
        cfg.nowpayments_api_key.clone(),
        cfg.nowpayments_ipn_secret.clone(),
    ));

    let pool = PgPool::connect(&database_url).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;

    let state = Arc::new(AppState {
        db: pool,
        mpesa,
        nowpayments,
        nowpayments_price_currency: cfg.nowpayments_price_currency,
        vault_public_url: cfg.vault_public_url.clone(),
        frontend_url: cfg.frontend_url,
    });

    let app = Router::new()
        .route("/escrows", post(create_escrow))
        .route("/escrows/:id/deposit", post(deposit_funds))
        .route("/escrows/:id/release", post(release_funds))
        .route("/escrows/:id/refund", post(refund_funds))
        .route("/escrows/:id/dispute/resolve", post(resolve_dispute))
        .route("/payments/:id/initiate", post(payment::initiate_payment))
        .route("/payments/callback", post(payment::mpesa_callback))
        .route("/crypto-payments/:id/initiate", post(crypto_payment::initiate_crypto_payment))
        .route("/crypto-payments/callback", post(crypto_payment::crypto_callback))
        .route("/payment-links/:id", get(payment_link_payment::get_link))
        .route("/payment-links/:id/pay/crypto", post(payment_link_payment::pay_crypto))
        .route("/payment-links/:id/pay/mpesa", post(payment_link_payment::pay_mpesa))
        .route("/payment-links/callback/crypto", post(payment_link_payment::crypto_callback))
        .route("/payment-links/callback/mpesa", post(payment_link_payment::mpesa_callback))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8001").await?;
    info!("Funga Vault listening on {}", listener.local_addr()?);
    axum::serve(listener, app).await?;

    Ok(())
}
