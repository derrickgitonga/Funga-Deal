use rust_decimal::Decimal;
use uuid::Uuid;
use validator::Validate;

use crate::{
    domain::escrow::repository::EscrowRepository,
    error::EscrowError,
    escrow::{machine::Escrow, states::Created},
};

#[derive(Debug, Validate)]
pub struct CreateEscrowCommand {
    #[validate(length(min = 1, message = "buyer_id is required"))]
    pub buyer_id: String,

    #[validate(length(min = 1, message = "seller_id is required"))]
    pub seller_id: String,

    #[validate(length(min = 1, max = 255, message = "title must be 1–255 characters"))]
    pub title: String,

    pub amount_minor: i64,

    #[validate(length(min = 3, max = 3, message = "currency must be a 3-letter ISO 4217 code"))]
    pub currency: String,

    pub idempotency_key: Option<String>,
}

pub struct CreateEscrowResponse {
    pub escrow_id: Uuid,
}

pub struct CreateEscrowUseCase;

impl CreateEscrowUseCase {
    pub async fn execute(
        repo: &dyn EscrowRepository,
        cmd: CreateEscrowCommand,
    ) -> Result<CreateEscrowResponse, EscrowError> {
        if cmd.buyer_id == cmd.seller_id {
            return Err(EscrowError::BuyerSellerConflict);
        }

        if cmd.amount_minor <= 0 {
            return Err(EscrowError::InvalidAmount);
        }

        let amount = Decimal::new(cmd.amount_minor, 0);

        let escrow = Escrow::<Created>::new(
            &cmd.buyer_id,
            &cmd.seller_id,
            &cmd.title,
            amount,
            &cmd.currency,
            cmd.idempotency_key,
        );

        let escrow_id = escrow.data.id;
        let rows_inserted = repo.insert(&escrow).await?;

        if rows_inserted == 0 {
            return Err(EscrowError::IdempotencyConflict);
        }

        Ok(CreateEscrowResponse { escrow_id })
    }
}
