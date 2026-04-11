use rust_decimal::Decimal;
use secrecy::{ExposeSecret, Secret};
use sqlx::PgPool;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::error::EscrowError;
use super::{
    machine::{DbStatus, Escrow, EscrowData},
    states::{
        Created, Deposited, EscrowState, InDispute, Refunded, Released,
        STATUS_CREATED, STATUS_DEPOSITED, STATUS_IN_DISPUTE, STATUS_REFUNDED, STATUS_RELEASED,
    },
};

#[derive(sqlx::FromRow, Debug)]
pub struct EscrowRow {
    pub id: Uuid,
    pub buyer_id: String,
    pub seller_id: String,
    pub title: String,
    pub amount: Decimal,
    pub currency: String,
    pub status: String,
    pub mpesa_checkout_id: Option<String>,
    pub idempotency_key: Option<String>,
    pub shipping_timeout_days: i32,
    pub inspection_timeout_days: i32,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

pub enum AnyEscrow {
    Created(Escrow<Created>),
    Deposited(Escrow<Deposited>),
    InDispute(Escrow<InDispute>),
    Released(Escrow<Released>),
    Refunded(Escrow<Refunded>),
}

pub fn rehydrate(row: EscrowRow) -> Result<AnyEscrow, EscrowError> {
    let data = EscrowData {
        id: row.id,
        buyer_id: Secret::new(row.buyer_id),
        seller_id: Secret::new(row.seller_id),
        title: row.title,
        amount: row.amount,
        currency: row.currency,
        mpesa_checkout_id: row.mpesa_checkout_id.map(Secret::new),
        idempotency_key: row.idempotency_key,
        shipping_timeout_days: row.shipping_timeout_days,
        inspection_timeout_days: row.inspection_timeout_days,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };

    match row.status.as_str() {
        STATUS_CREATED    => Ok(AnyEscrow::Created(Escrow::from_data(data))),
        STATUS_DEPOSITED  => Ok(AnyEscrow::Deposited(Escrow::from_data(data))),
        STATUS_IN_DISPUTE => Ok(AnyEscrow::InDispute(Escrow::from_data(data))),
        STATUS_RELEASED   => Ok(AnyEscrow::Released(Escrow::from_data(data))),
        STATUS_REFUNDED   => Ok(AnyEscrow::Refunded(Escrow::from_data(data))),
        unknown           => Err(EscrowError::UnknownStatus(unknown.to_string())),
    }
}

pub struct EscrowRepository;

impl EscrowRepository {
    pub async fn insert_created(pool: &PgPool, escrow: &Escrow<Created>) -> Result<(), EscrowError> {
        let d = &escrow.data;
        sqlx::query(
            r#"
            INSERT INTO escrows (
                id, buyer_id, seller_id, title, amount, currency, status,
                idempotency_key, shipping_timeout_days, inspection_timeout_days,
                created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            ON CONFLICT (idempotency_key) DO NOTHING
            "#,
        )
        .bind(d.id)
        .bind(d.buyer_id.expose_secret())
        .bind(d.seller_id.expose_secret())
        .bind(&d.title)
        .bind(d.amount)
        .bind(&d.currency)
        .bind(STATUS_CREATED)
        .bind(&d.idempotency_key)
        .bind(d.shipping_timeout_days)
        .bind(d.inspection_timeout_days)
        .bind(d.created_at)
        .bind(d.updated_at)
        .execute(pool)
        .await?;

        Ok(())
    }

    pub async fn update_status<S>(pool: &PgPool, escrow: &Escrow<S>) -> Result<(), EscrowError>
    where
        S: EscrowState + DbStatus,
    {
        let d = &escrow.data;
        sqlx::query(
            r#"
            UPDATE escrows
            SET    status            = $1,
                   mpesa_checkout_id = $2,
                   updated_at        = $3
            WHERE  id = $4
            "#,
        )
        .bind(S::status_str())
        .bind(d.mpesa_checkout_id.as_ref().map(|s| s.expose_secret().clone()))
        .bind(d.updated_at)
        .bind(d.id)
        .execute(pool)
        .await?;

        Ok(())
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<AnyEscrow, EscrowError> {
        let row: Option<EscrowRow> = sqlx::query_as(
            r#"
            SELECT id, buyer_id, seller_id, title, amount, currency, status,
                   mpesa_checkout_id, idempotency_key,
                   shipping_timeout_days, inspection_timeout_days,
                   created_at, updated_at
            FROM   escrows
            WHERE  id = $1
            "#,
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        rehydrate(row.ok_or(EscrowError::NotFound(id))?)
    }

    pub async fn find_by_buyer(pool: &PgPool, buyer_id: &str) -> Result<Vec<AnyEscrow>, EscrowError> {
        let rows: Vec<EscrowRow> = sqlx::query_as(
            r#"
            SELECT id, buyer_id, seller_id, title, amount, currency, status,
                   mpesa_checkout_id, idempotency_key,
                   shipping_timeout_days, inspection_timeout_days,
                   created_at, updated_at
            FROM   escrows
            WHERE  buyer_id = $1
            ORDER BY created_at DESC
            "#,
        )
        .bind(buyer_id)
        .fetch_all(pool)
        .await?;

        rows.into_iter().map(rehydrate).collect()
    }
}
