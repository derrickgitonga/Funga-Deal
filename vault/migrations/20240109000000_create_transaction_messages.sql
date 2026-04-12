CREATE TABLE IF NOT EXISTS transaction_messages (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    escrow_id   UUID        NOT NULL REFERENCES escrows(id) ON DELETE CASCADE,
    sender_id   TEXT        NOT NULL,
    sender_role TEXT        NOT NULL DEFAULT 'user'
                    CHECK (sender_role IN ('user', 'moderator', 'system')),
    body        TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_txmsg_escrow
    ON transaction_messages (escrow_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_txmsg_sender
    ON transaction_messages (sender_id, created_at DESC);
