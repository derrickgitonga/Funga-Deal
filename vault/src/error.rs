use thiserror::Error;

#[derive(Debug, Error)]
pub enum EscrowError {
    #[error("Illegal state transition: {from} → {to}")]
    IllegalTransition { from: &'static str, to: &'static str },

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

    #[error("Idempotency key conflict: '{0}'")]
    IdempotencyConflict(String),

    #[error("M-Pesa checkout not confirmed for transaction {0}")]
    PaymentNotConfirmed(uuid::Uuid),
}
