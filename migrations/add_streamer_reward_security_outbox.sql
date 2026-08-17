BEGIN;

CREATE TABLE reward_grant_intents (
    id UUID PRIMARY KEY,
    source_type VARCHAR(24) NOT NULL CHECK (source_type IN ('quest','story','game','achievement','season')),
    source_event_id VARCHAR(120) NOT NULL CHECK (source_event_id ~ '^[A-Za-z0-9:_.-]{8,120}$'),
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    catalog_slug VARCHAR(120) NOT NULL CHECK (catalog_slug ~ '^[a-z][a-z0-9._-]{1,119}$'),
    semantic_hash CHAR(64) NOT NULL CHECK (semantic_hash ~ '^[0-9a-f]{64}$'),
    payload JSONB NOT NULL DEFAULT '{}'::JSONB
        CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::TEXT)<=4096),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','processing','completed','dead_letter')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 100),
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lease_owner VARCHAR(120),
    lease_expires_at TIMESTAMPTZ,
    order_id UUID REFERENCES reward_orders(id) ON DELETE RESTRICT,
    response_snapshot JSONB CHECK (response_snapshot IS NULL
        OR (jsonb_typeof(response_snapshot)='object' AND octet_length(response_snapshot::TEXT)<=65536)),
    last_error_code VARCHAR(100),
    last_error_detail VARCHAR(500),
    completed_at TIMESTAMPTZ,
    dead_lettered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_type,source_event_id),
    CHECK (
        (status='pending' AND lease_owner IS NULL AND lease_expires_at IS NULL
            AND order_id IS NULL AND completed_at IS NULL AND dead_lettered_at IS NULL)
        OR (status='processing' AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL
            AND order_id IS NULL AND completed_at IS NULL AND dead_lettered_at IS NULL)
        OR (status='completed' AND lease_owner IS NULL AND lease_expires_at IS NULL
            AND order_id IS NOT NULL AND completed_at IS NOT NULL AND dead_lettered_at IS NULL
            AND response_snapshot IS NOT NULL)
        OR (status='dead_letter' AND lease_owner IS NULL AND lease_expires_at IS NULL
            AND order_id IS NULL AND completed_at IS NULL AND dead_lettered_at IS NOT NULL
            AND last_error_code IS NOT NULL)
    )
);

CREATE INDEX reward_grant_intents_dispatch_idx
    ON reward_grant_intents(status,available_at,created_at,id)
    WHERE status IN ('pending','processing');
CREATE INDEX reward_grant_intents_dead_letter_idx
    ON reward_grant_intents(dead_lettered_at DESC,id)
    WHERE status='dead_letter';

CREATE TABLE reward_grant_intent_events (
    event_id UUID PRIMARY KEY,
    intent_id UUID NOT NULL REFERENCES reward_grant_intents(id) ON DELETE RESTRICT,
    sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 1000),
    event_type VARCHAR(32) NOT NULL CHECK (event_type IN (
        'intent_created','intent_claimed','lease_recovered','dispatch_retry','dispatch_completed','dispatch_dead_lettered'
    )),
    worker_id VARCHAR(120),
    details JSONB NOT NULL DEFAULT '{}'::JSONB
        CHECK (jsonb_typeof(details)='object' AND octet_length(details::TEXT)<=4096),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(intent_id,sequence)
);

CREATE OR REPLACE FUNCTION protect_reward_grant_intent() RETURNS trigger AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'reward grant intents cannot be deleted';
    END IF;
    IF OLD.id IS DISTINCT FROM NEW.id
       OR OLD.source_type IS DISTINCT FROM NEW.source_type
       OR OLD.source_event_id IS DISTINCT FROM NEW.source_event_id
       OR OLD.user_id IS DISTINCT FROM NEW.user_id
       OR OLD.catalog_slug IS DISTINCT FROM NEW.catalog_slug
       OR OLD.semantic_hash IS DISTINCT FROM NEW.semantic_hash
       OR OLD.payload IS DISTINCT FROM NEW.payload
       OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
        RAISE EXCEPTION 'reward grant intent source identity is immutable';
    END IF;
    IF OLD.status IN ('completed','dead_letter') THEN
        RAISE EXCEPTION 'terminal reward grant intent is immutable';
    END IF;
    IF NOT ((OLD.status='pending' AND NEW.status IN ('pending','processing'))
        OR (OLD.status='processing' AND NEW.status IN ('processing','pending','completed','dead_letter'))) THEN
        RAISE EXCEPTION 'invalid reward grant intent transition';
    END IF;
    IF NEW.attempts < OLD.attempts OR NEW.attempts > OLD.attempts + 1
       OR (NEW.attempts > OLD.attempts AND NOT (OLD.status='pending' AND NEW.status='processing')) THEN
        RAISE EXCEPTION 'invalid reward grant intent attempt counter';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION protect_reward_grant_intent_event() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'reward grant intent history is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reward_grant_intent_guard ON reward_grant_intents;
CREATE TRIGGER reward_grant_intent_guard BEFORE UPDATE OR DELETE ON reward_grant_intents
FOR EACH ROW EXECUTE FUNCTION protect_reward_grant_intent();
DROP TRIGGER IF EXISTS reward_grant_intent_events_append_only ON reward_grant_intent_events;
CREATE TRIGGER reward_grant_intent_events_append_only BEFORE UPDATE OR DELETE ON reward_grant_intent_events
FOR EACH ROW EXECUTE FUNCTION protect_reward_grant_intent_event();

COMMIT;
