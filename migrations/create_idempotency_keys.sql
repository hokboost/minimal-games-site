CREATE TABLE IF NOT EXISTS idempotency_keys (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    request_method VARCHAR(10) NOT NULL,
    request_path VARCHAR(255) NOT NULL,
    request_hash CHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    response_status INTEGER,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT idempotency_keys_status_check CHECK (status IN ('pending', 'completed')),
    CONSTRAINT idempotency_keys_user_key_unique UNIQUE (username, idempotency_key)
);

-- Older deployments used idem_key/method/path and "processing". Rename in
-- place so existing responses and their unique index remain intact.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'idempotency_keys'
          AND column_name = 'idem_key'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'idempotency_keys'
          AND column_name = 'idempotency_key'
    ) THEN
        ALTER TABLE idempotency_keys RENAME COLUMN idem_key TO idempotency_key;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'idempotency_keys'
          AND column_name = 'method'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'idempotency_keys'
          AND column_name = 'request_method'
    ) THEN
        ALTER TABLE idempotency_keys RENAME COLUMN method TO request_method;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'idempotency_keys'
          AND column_name = 'path'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'idempotency_keys'
          AND column_name = 'request_path'
    ) THEN
        ALTER TABLE idempotency_keys RENAME COLUMN path TO request_path;
    END IF;
END
$$;

UPDATE idempotency_keys
SET status = 'pending'
WHERE status = 'processing';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'idempotency_keys'::regclass
          AND conname = 'idempotency_keys_status_check'
    ) THEN
        ALTER TABLE idempotency_keys
            ADD CONSTRAINT idempotency_keys_status_check
            CHECK (status IN ('pending', 'completed'));
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_updated_at
ON idempotency_keys(updated_at);

CREATE TABLE IF NOT EXISTS api_request_nonces (
    nonce VARCHAR(200) PRIMARY KEY,
    request_method VARCHAR(10) NOT NULL,
    request_path TEXT NOT NULL,
    request_timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_request_nonces_created
ON api_request_nonces(created_at);
