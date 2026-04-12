CREATE TABLE IF NOT EXISTS transaction_audit_trail (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID        NOT NULL,
    old_status     TEXT        NOT NULL,
    new_status     TEXT        NOT NULL,
    reason         TEXT        NOT NULL,
    actor          TEXT        NOT NULL DEFAULT 'system',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_trail_tx
    ON transaction_audit_trail (transaction_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_trail_recent
    ON transaction_audit_trail (created_at DESC);
