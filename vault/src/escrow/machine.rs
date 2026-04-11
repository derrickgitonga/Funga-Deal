use std::marker::PhantomData;

use rust_decimal::Decimal;
use secrecy::Secret;
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::error::EscrowError;
use super::states::{
    Created, Deposited, EscrowState, InDispute, Refunded, Released,
    STATUS_CREATED, STATUS_DEPOSITED, STATUS_IN_DISPUTE, STATUS_REFUNDED, STATUS_RELEASED,
};

#[derive(Debug, Clone)]
pub struct EscrowData {
    pub id: Uuid,
    pub buyer_id: Secret<String>,
    pub seller_id: Secret<String>,
    pub title: String,
    pub amount: Decimal,
    pub currency: String,
    pub mpesa_checkout_id: Option<Secret<String>>,
    pub idempotency_key: Option<String>,
    pub shipping_timeout_days: i32,
    pub inspection_timeout_days: i32,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

pub struct Escrow<State: EscrowState> {
    pub data: EscrowData,
    _state: PhantomData<State>,
}

impl<State: EscrowState> Escrow<State> {
    pub(crate) fn from_data(data: EscrowData) -> Self {
        Self { data, _state: PhantomData }
    }
}

pub trait DbStatus: EscrowState {
    fn status_str() -> &'static str;
}

impl DbStatus for Created   { fn status_str() -> &'static str { STATUS_CREATED   } }
impl DbStatus for Deposited { fn status_str() -> &'static str { STATUS_DEPOSITED  } }
impl DbStatus for InDispute { fn status_str() -> &'static str { STATUS_IN_DISPUTE } }
impl DbStatus for Released  { fn status_str() -> &'static str { STATUS_RELEASED   } }
impl DbStatus for Refunded  { fn status_str() -> &'static str { STATUS_REFUNDED   } }

impl Escrow<Created> {
    pub fn new(
        buyer_id: impl Into<String>,
        seller_id: impl Into<String>,
        title: impl Into<String>,
        amount: Decimal,
        currency: impl Into<String>,
        idempotency_key: Option<String>,
    ) -> Self {
        let now = OffsetDateTime::now_utc();
        Self::from_data(EscrowData {
            id: Uuid::new_v4(),
            buyer_id: Secret::new(buyer_id.into()),
            seller_id: Secret::new(seller_id.into()),
            title: title.into(),
            amount,
            currency: currency.into(),
            mpesa_checkout_id: None,
            idempotency_key,
            shipping_timeout_days: 7,
            inspection_timeout_days: 3,
            created_at: now,
            updated_at: now,
        })
    }

    pub fn deposit(
        mut self,
        mpesa_checkout_id: impl Into<String>,
        paid_amount: Decimal,
    ) -> Result<Escrow<Deposited>, EscrowError> {
        if paid_amount != self.data.amount {
            return Err(EscrowError::AmountMismatch {
                expected: self.data.amount,
                received: paid_amount,
            });
        }
        self.data.mpesa_checkout_id = Some(Secret::new(mpesa_checkout_id.into()));
        self.data.updated_at = OffsetDateTime::now_utc();
        Ok(Escrow::from_data(self.data))
    }
}

impl Escrow<Deposited> {
    pub fn release(mut self) -> Result<Escrow<Released>, EscrowError> {
        self.data.updated_at = OffsetDateTime::now_utc();
        Ok(Escrow::from_data(self.data))
    }

    pub fn refund(mut self) -> Result<Escrow<Refunded>, EscrowError> {
        self.data.updated_at = OffsetDateTime::now_utc();
        Ok(Escrow::from_data(self.data))
    }

    #[allow(dead_code)]
    pub fn open_dispute(mut self) -> Result<Escrow<InDispute>, EscrowError> {
        self.data.updated_at = OffsetDateTime::now_utc();
        Ok(Escrow::from_data(self.data))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DisputeResolution {
    FavorSeller,
    FavorBuyer,
}

pub enum ResolvedEscrow {
    Released(Escrow<Released>),
    Refunded(Escrow<Refunded>),
}

impl Escrow<InDispute> {
    pub fn resolve_dispute(
        mut self,
        resolution: DisputeResolution,
    ) -> Result<ResolvedEscrow, EscrowError> {
        self.data.updated_at = OffsetDateTime::now_utc();
        match resolution {
            DisputeResolution::FavorSeller => {
                Ok(ResolvedEscrow::Released(Escrow::from_data(self.data)))
            }
            DisputeResolution::FavorBuyer => {
                Ok(ResolvedEscrow::Refunded(Escrow::from_data(self.data)))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    fn sample_escrow() -> Escrow<Created> {
        Escrow::<Created>::new(
            "buyer-uuid-001",
            "seller-uuid-002",
            "iPhone 15 Pro Max",
            dec!(85000.00),
            "KES",
            Some("idemp-key-abc123".to_string()),
        )
    }

    #[test]
    fn happy_path_release() {
        let deposited = sample_escrow()
            .deposit("ws_CO_123456789", dec!(85000.00))
            .unwrap();
        deposited.release().unwrap();
    }

    #[test]
    fn happy_path_refund() {
        let deposited = sample_escrow()
            .deposit("ws_CO_123456789", dec!(85000.00))
            .unwrap();
        deposited.refund().unwrap();
    }

    #[test]
    fn happy_path_dispute_resolved_favor_seller() {
        let disputed = sample_escrow()
            .deposit("ws_CO_123456789", dec!(85000.00))
            .unwrap()
            .open_dispute()
            .unwrap();

        match disputed.resolve_dispute(DisputeResolution::FavorSeller).unwrap() {
            ResolvedEscrow::Released(_) => {}
            ResolvedEscrow::Refunded(_) => panic!("expected Released"),
        }
    }

    #[test]
    fn deposit_rejects_wrong_amount() {
        let result = sample_escrow().deposit("ws_CO_123456789", dec!(50000.00));
        assert!(matches!(result, Err(EscrowError::AmountMismatch { .. })));
    }
}
