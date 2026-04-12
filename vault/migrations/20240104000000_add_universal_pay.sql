ALTER TABLE payment_links
    ADD COLUMN IF NOT EXISTS allow_multiple BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE payment_link_orders
    ADD COLUMN IF NOT EXISTS payer_phone    VARCHAR(20),
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_plo_link_status
    ON payment_link_orders (payment_link_id, status);

CREATE INDEX IF NOT EXISTS idx_plo_phone_pending
    ON payment_link_orders (payment_link_id, payer_phone)
    WHERE status = 'pending';
