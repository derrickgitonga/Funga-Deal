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

    #[error("Buyer and seller must be different users")]
    BuyerSellerConflict,

    #[error("Amount must be greater than zero")]
    InvalidAmount,

    #[error("An escrow with this idempotency key already exists")]
    IdempotencyConflict,
}
