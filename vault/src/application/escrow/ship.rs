use secrecy::ExposeSecret;
use uuid::Uuid;

use crate::{
    domain::escrow::repository::{EscrowRepository, EscrowStatusUpdate},
    error::EscrowError,
    escrow::{db::AnyEscrow, states::STATUS_SHIPPED},
};

pub struct ShipEscrowCommand {
    pub escrow_id: Uuid,
}

pub struct ShipEscrowUseCase;

impl ShipEscrowUseCase {
    pub async fn execute(
        repo: &dyn EscrowRepository,
        cmd: ShipEscrowCommand,
    ) -> Result<(), EscrowError> {
        let any = repo.find_by_id(cmd.escrow_id).await?;

        let deposited = match any {
            AnyEscrow::Deposited(e) => e,
            _ => {
                return Err(EscrowError::InvalidTransition {
                    from: "non-deposited",
                    to: "shipped",
                })
            }
        };

        let shipped = deposited.mark_shipped()?;

        repo.update_status(EscrowStatusUpdate {
            id: shipped.data.id,
            status: STATUS_SHIPPED,
            mpesa_checkout_id: shipped
                .data
                .mpesa_checkout_id
                .as_ref()
                .map(|s| s.expose_secret().clone()),
            updated_at: shipped.data.updated_at,
        })
        .await
    }
}
