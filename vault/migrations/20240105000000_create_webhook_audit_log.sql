CREATE TABLE IF NOT EXISTS webhook_audit_log (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    provider        VARCHAR(50) NOT NULL,
    source_ip       INET        NOT NULL,
    raw_payload     TEXT        NOT NULL,
    signature_valid BOOLEAN     NOT NULL,
    processed       BOOLEAN     NOT NULL DEFAULT false,
    error           TEXT,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wh_audit_provider    ON webhook_audit_log (provider, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_wh_audit_unprocessed ON webhook_audit_log (processed, received_at DESC)
    WHERE processed = false;
