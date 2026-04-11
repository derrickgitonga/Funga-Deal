CREATE TYPE escrow_status AS ENUM (
    'created',
    'deposited',
    'in_dispute',
    'released',
    'refunded'
);

CREATE TABLE IF NOT EXISTS escrows (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id                TEXT            NOT NULL,
    seller_id               TEXT            NOT NULL,
    title                   VARCHAR(255)    NOT NULL,
    amount                  NUMERIC(12, 2)  NOT NULL CHECK (amount > 0),
    currency                CHAR(3)         NOT NULL DEFAULT 'KES',
    status                  escrow_status   NOT NULL DEFAULT 'created',
    mpesa_checkout_id       TEXT,
    idempotency_key         VARCHAR(255)    UNIQUE,
    shipping_timeout_days   INTEGER         NOT NULL DEFAULT 7,
    inspection_timeout_days INTEGER         NOT NULL DEFAULT 3,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_escrows_buyer_id  ON escrows (buyer_id);
CREATE INDEX idx_escrows_seller_id ON escrows (seller_id);

CREATE INDEX idx_escrows_open
    ON escrows (buyer_id, created_at DESC)
    WHERE status NOT IN ('released', 'refunded');

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER escrows_updated_at
    BEFORE UPDATE ON escrows
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
