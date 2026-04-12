ALTER TYPE escrow_status ADD VALUE IF NOT EXISTS 'under_review';

CREATE TABLE IF NOT EXISTS moderator_audit_log (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    TEXT        NOT NULL,
    action      TEXT        NOT NULL,
    target_id   TEXT        NOT NULL,
    target_type TEXT        NOT NULL CHECK (target_type IN ('user', 'escrow')),
    reason      TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mod_audit_actor
    ON moderator_audit_log (actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mod_audit_target
    ON moderator_audit_log (target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mod_audit_created
    ON moderator_audit_log (created_at DESC);
