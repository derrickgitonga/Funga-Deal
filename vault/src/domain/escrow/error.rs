use thiserror::Error;

#[derive(Debug, Error)]
pub enum EscrowError {
    #[error("escrow {0} not found")]
    NotFound(uuid::Uuid),

    #[error("amount mismatch: expected {expected}, received {received}")]
    AmountMismatch {
        expected: rust_decimal::Decimal,
        received: rust_decimal::Decimal,
    },

    #[error("buyer and seller must be different users")]
    BuyerSellerConflict,

    #[error("amount must be greater than zero")]
    InvalidAmount,

    #[error("an escrow with this idempotency key already exists")]
    IdempotencyConflict,

    #[error("invalid state transition from '{from}' to '{to}'")]
    InvalidTransition {
        from: &'static str,
        to: &'static str,
    },

    #[error("unknown escrow status: '{0}'")]
    UnknownStatus(String),

    #[error("repository error: {0}")]
    Repository(String),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}
