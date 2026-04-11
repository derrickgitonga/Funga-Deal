use thiserror::Error;

#[derive(Debug, Error)]
pub enum EscrowError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Unknown escrow status: '{0}'")]
    UnknownStatus(String),

    #[error("Escrow not found: {0}")]
    NotFound(uuid::Uuid),

    #[error("Amount mismatch: expected {expected}, received {received}")]
    AmountMismatch {
        expected: rust_decimal::Decimal,
        received: rust_decimal::Decimal,
    },
}
