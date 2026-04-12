use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use thiserror::Error;

use crate::error::EscrowError;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("{0}")]
    NotFound(String),

    #[error("{0}")]
    Conflict(String),

    #[error("{0}")]
    Validation(String),

    #[error("{0}")]
    Unprocessable(String),

    #[error("{0}")]
    BadGateway(String),

    #[error("internal error")]
    Internal(#[from] anyhow::Error),
}

impl From<EscrowError> for AppError {
    fn from(e: EscrowError) -> Self {
        match e {
            EscrowError::NotFound(id) => {
                AppError::NotFound(format!("Escrow {} not found", id))
            }
            EscrowError::AmountMismatch { expected, received } => AppError::Unprocessable(
                format!("Amount mismatch: expected {expected}, received {received}"),
            ),
            EscrowError::BuyerSellerConflict => {
                AppError::Validation("Buyer and seller must be different users".into())
            }
            EscrowError::InvalidAmount => {
                AppError::Validation("Amount must be greater than zero".into())
            }
            EscrowError::IdempotencyConflict => {
                AppError::Conflict("An escrow with this idempotency key already exists".into())
            }
            EscrowError::UnknownStatus(s) => {
                AppError::Internal(anyhow::anyhow!("Unknown escrow status in DB: {s}"))
            }
            EscrowError::Database(e) => AppError::Internal(anyhow::Error::new(e)),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, msg.clone()),
            AppError::Validation(msg) | AppError::Unprocessable(msg) => {
                (StatusCode::UNPROCESSABLE_ENTITY, msg.clone())
            }
            AppError::BadGateway(msg) => (StatusCode::BAD_GATEWAY, msg.clone()),
            AppError::Internal(e) => {
                tracing::error!(error = %e, "Unhandled internal error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "An internal error occurred".to_string(),
                )
            }
        };

        (status, Json(serde_json::json!({ "error": message }))).into_response()
    }
}
