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
mod payout_service;
mod universal_pay;
mod webhook;
mod worker;

use std::{net::SocketAddr, sync::Arc};

use axum::{
    extract::{Path, State},
    http::StatusCode,
    middleware,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use dotenvy::dotenv;
use ipnet::IpNet;
use rust_decimal::Decimal;
use secrecy::Secret;
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
use payout_service::B2CClient;
use webhook::WebhookRateLimiter;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub mpesa: Arc<MpesaClient>,
    pub nowpayments: Arc<NowPaymentsClient>,
    pub nowpayments_price_currency: String,
    pub nowpayments_ipn_secret: Secret<String>,
    pub vault_public_url: String,
    pub frontend_url: String,
    pub http_client: reqwest::Client,
    pub internal_service_secret: Option<Secret<String>>,
    pub django_backend_url: String,
    pub mpesa_allowed_ips: Vec<IpNet>,
    pub intasend_webhook_secret: Option<Secret<String>>,
    pub webhook_rate_limiter: Arc<WebhookRateLimiter>,
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

    let mpesa_allowed_ips: Vec<IpNet> = cfg
        .mpesa_allowed_ips
        .split(',')
        .filter_map(|s| {
            let trimmed = s.trim();
            trimmed
                .parse::<IpNet>()
                .or_else(|_| trimmed.parse::<std::net::IpAddr>().map(IpNet::from))
                .ok()
        })
        .collect();

    let mpesa = Arc::new(MpesaClient::new(cfg.clone()));
    let nowpayments = Arc::new(NowPaymentsClient::new(
        cfg.nowpayments_api_key.clone(),
        cfg.nowpayments_ipn_secret.clone(),
    ));
    let b2c = B2CClient::new(mpesa.clone(), cfg.clone());

    let pool = PgPool::connect(&database_url).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;

    if cfg.mpesa_b2c_security_credential.is_some() && cfg.internal_service_secret.is_some() {
        let worker_state = Arc::new(worker::WorkerState {
            db: pool.clone(),
            b2c,
            service_fee_bps: cfg.service_fee_bps,
            http: reqwest::Client::new(),
            django_backend_url: cfg.django_backend_url.clone(),
            internal_service_secret: cfg.internal_service_secret.clone(),
        });
        tokio::spawn(worker::run(worker_state));
        info!("Payout worker started");
    } else {
        info!("Payout worker DISABLED — set MPESA_B2C_SECURITY_CREDENTIAL and INTERNAL_SERVICE_SECRET to enable");
    }

    let state = Arc::new(AppState {
        db: pool,
        mpesa,
        nowpayments,
        nowpayments_price_currency: cfg.nowpayments_price_currency,
        nowpayments_ipn_secret: cfg.nowpayments_ipn_secret,
        vault_public_url: cfg.vault_public_url.clone(),
        frontend_url: cfg.frontend_url,
        http_client: reqwest::Client::new(),
        internal_service_secret: cfg.internal_service_secret,
        django_backend_url: cfg.django_backend_url,
        mpesa_allowed_ips,
        intasend_webhook_secret: cfg.intasend_webhook_secret,
        webhook_rate_limiter: Arc::new(WebhookRateLimiter::new(30, 60)),
    });

    let mpesa_webhooks = Router::new()
        .route("/webhooks/mpesa", post(webhook::mpesa_webhook))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            webhook::mw_require_mpesa_ip,
        ))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            webhook::mw_rate_limit,
        ));

    let provider_webhooks = Router::new()
        .route("/webhooks/nowpayments", post(webhook::nowpayments_webhook))
        .route("/webhooks/intasend", post(webhook::intasend_webhook))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            webhook::mw_rate_limit,
        ));

    let app = Router::new()
        .merge(mpesa_webhooks)
        .merge(provider_webhooks)
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
        .route("/pay/:id", get(universal_pay::get_payment))
        .route("/pay/:id/initiate", post(universal_pay::initiate_payment))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8001").await?;
    info!("Funga Vault listening on {}", listener.local_addr()?);
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;

    Ok(())
}
