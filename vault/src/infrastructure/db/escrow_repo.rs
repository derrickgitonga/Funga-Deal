use async_trait::async_trait;
use secrecy::ExposeSecret;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    domain::escrow::repository::{EscrowRepository, EscrowStatusUpdate},
    error::EscrowError,
    escrow::{
        db::{rehydrate, AnyEscrow, EscrowRow},
        machine::Escrow,
        states::{Created, STATUS_CREATED},
    },
};

pub struct PostgresEscrowRepository {
    pool: PgPool,
}

impl PostgresEscrowRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl EscrowRepository for PostgresEscrowRepository {
    async fn insert_created(&self, escrow: &Escrow<Created>) -> Result<u64, EscrowError> {
        let d = &escrow.data;

        let result = sqlx::query(
            r#"
            INSERT INTO escrows (
                id, buyer_id, seller_id, title, amount, currency, status,
                idempotency_key, shipping_timeout_days, inspection_timeout_days,
                created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
        .execute(&self.pool)
        .await
        .map_err(|e| EscrowError::Repository(e.to_string()))?;

        Ok(result.rows_affected())
    }

    async fn find_by_id(&self, id: Uuid) -> Result<AnyEscrow, EscrowError> {
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
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| EscrowError::Repository(e.to_string()))?;

        rehydrate(row.ok_or(EscrowError::NotFound(id))?)
    }

    async fn update_status(&self, upd: EscrowStatusUpdate) -> Result<(), EscrowError> {
        sqlx::query(
            r#"
            UPDATE escrows
            SET    status            = $1,
                   mpesa_checkout_id = $2,
                   updated_at        = $3
            WHERE  id = $4
            "#,
        )
        .bind(upd.status)
        .bind(upd.mpesa_checkout_id)
        .bind(upd.updated_at)
        .bind(upd.id)
        .execute(&self.pool)
        .await
        .map_err(|e| EscrowError::Repository(e.to_string()))?;

        Ok(())
    }
}
