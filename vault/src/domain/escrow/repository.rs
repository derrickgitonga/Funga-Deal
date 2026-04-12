use async_trait::async_trait;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{
    error::EscrowError,
    escrow::{db::AnyEscrow, machine::Escrow, states::Created},
};

pub struct EscrowUpdate {
    pub id: Uuid,
    pub status: &'static str,
    pub mpesa_checkout_id: Option<String>,
    pub updated_at: OffsetDateTime,
}

#[async_trait]
pub trait EscrowRepository: Send + Sync {
    async fn insert(&self, escrow: &Escrow<Created>) -> Result<u64, EscrowError>;
    async fn find_by_id(&self, id: Uuid) -> Result<AnyEscrow, EscrowError>;
    async fn update(&self, upd: EscrowUpdate) -> Result<(), EscrowError>;
}
