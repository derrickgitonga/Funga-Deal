mod error;
mod escrow;

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::post,
    Json, Router,
};
use dotenvy::dotenv;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use tracing::info;
use uuid::Uuid;

use escrow::{
    db::EscrowRepository,
    machine::{DisputeResolution, ResolvedEscrow},
    AnyEscrow, Created, Escrow,
};

#[derive(Clone)]
struct AppState {
    db: PgPool,
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

    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");

    let pool = PgPool::connect(&database_url).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;

    let state = Arc::new(AppState { db: pool });

    let app = Router::new()
        .route("/escrows", post(create_escrow))
        .route("/escrows/:id/deposit", post(deposit_funds))
        .route("/escrows/:id/release", post(release_funds))
        .route("/escrows/:id/refund", post(refund_funds))
        .route("/escrows/:id/dispute/resolve", post(resolve_dispute))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8001").await?;
    info!("Funga Vault listening on {}", listener.local_addr()?);
    axum::serve(listener, app).await?;

    Ok(())
}
