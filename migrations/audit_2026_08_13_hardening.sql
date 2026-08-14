-- New accounts must be funded explicitly by the registration transaction.
ALTER TABLE users
    ALTER COLUMN balance SET DEFAULT 0;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_admin_totp_counter BIGINT;

ALTER TABLE pk_gift_logs
    ADD COLUMN IF NOT EXISTS provider_receipt JSONB;

ALTER TABLE pk_spend_authorizations
    ADD COLUMN IF NOT EXISTS provider_receipt JSONB;

-- Bound the hot scans used by account-wide authentication throttling and
-- maintenance jobs. Financial/audit rows are archived, never silently deleted.
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_status_updated
    ON idempotency_keys(status, updated_at);

CREATE INDEX IF NOT EXISTS idx_delivery_outbox_status_created
    ON delivery_outbox(status, created_at);

CREATE TABLE IF NOT EXISTS delivery_outbox_archive (
    id BIGINT PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    aggregate_id INTEGER NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL,
    attempt_count INTEGER NOT NULL,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_username_activity
    ON active_sessions(username, is_active, last_activity DESC);
