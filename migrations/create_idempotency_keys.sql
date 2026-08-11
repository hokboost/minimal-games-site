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
