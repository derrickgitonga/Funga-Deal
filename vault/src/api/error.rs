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
                AppError::NotFound(format!("escrow {} not found", id))
            }
            EscrowError::AmountMismatch { expected, received } => AppError::Unprocessable(
                format!("amount mismatch: expected {expected}, received {received}"),
            ),
            EscrowError::BuyerSellerConflict => {
                AppError::Validation("buyer and seller must be different users".into())
            }
            EscrowError::InvalidAmount => {
                AppError::Validation("amount must be greater than zero".into())
            }
            EscrowError::IdempotencyConflict => {
                AppError::Conflict("an escrow with this idempotency key already exists".into())
            }
            EscrowError::InvalidTransition { from, to } => AppError::Conflict(
                format!("invalid state transition from '{from}' to '{to}'"),
            ),
            EscrowError::UnknownStatus(s) => {
                AppError::Internal(anyhow::anyhow!("unknown escrow status in db: {s}"))
            }
            EscrowError::Repository(msg) => {
                AppError::Internal(anyhow::anyhow!("repository error: {msg}"))
            }
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, body) = match &self {
            AppError::NotFound(msg) => (
                StatusCode::NOT_FOUND,
                serde_json::json!({ "error": msg }),
            ),
            AppError::Conflict(msg) => (
                StatusCode::CONFLICT,
                serde_json::json!({ "error": msg }),
            ),
            AppError::Validation(msg) | AppError::Unprocessable(msg) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                serde_json::json!({ "error": msg }),
            ),
            AppError::BadGateway(msg) => (
                StatusCode::BAD_GATEWAY,
                serde_json::json!({ "error": msg }),
            ),
            AppError::Internal(e) => {
                tracing::error!(error = %e, "unhandled internal error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    serde_json::json!({ "error": "INTERNAL_ERROR" }),
                )
            }
        };

        (status, Json(body)).into_response()
    }
}
