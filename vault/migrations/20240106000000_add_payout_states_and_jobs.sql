ALTER TYPE escrow_status ADD VALUE IF NOT EXISTS 'pending_confirmation';
ALTER TYPE escrow_status ADD VALUE IF NOT EXISTS 'release_queued';
ALTER TYPE escrow_status ADD VALUE IF NOT EXISTS 'payout_pending';
ALTER TYPE escrow_status ADD VALUE IF NOT EXISTS 'payout_completed';
ALTER TYPE escrow_status ADD VALUE IF NOT EXISTS 'payout_failed';

CREATE TABLE IF NOT EXISTS payout_jobs (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    escrow_id           UUID            NOT NULL REFERENCES escrows(id),
    payout_id           UUID            NOT NULL UNIQUE,
    seller_id           TEXT            NOT NULL,
    seller_phone        TEXT            NOT NULL,
    amount              NUMERIC(12, 2)  NOT NULL CHECK (amount > 0),
    status              TEXT            NOT NULL DEFAULT 'queued'
                            CHECK (status IN ('queued', 'processing', 'pending', 'completed', 'failed')),
    attempts            INTEGER         NOT NULL DEFAULT 0,
    max_attempts        INTEGER         NOT NULL DEFAULT 5,
    next_attempt_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    last_error          TEXT,
    b2c_conversation_id TEXT,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_jobs_claimable
    ON payout_jobs (next_attempt_at ASC, created_at ASC)
    WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_payout_jobs_escrow
    ON payout_jobs (escrow_id);

CREATE OR REPLACE FUNCTION touch_payout_jobs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER payout_jobs_updated_at
    BEFORE UPDATE ON payout_jobs
    FOR EACH ROW EXECUTE FUNCTION touch_payout_jobs_updated_at();
