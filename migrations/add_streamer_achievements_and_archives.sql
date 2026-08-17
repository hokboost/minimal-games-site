BEGIN;

CREATE TABLE IF NOT EXISTS streamer_achievement_definitions (
    id BIGSERIAL PRIMARY KEY,
    slug VARCHAR(100) NOT NULL UNIQUE CHECK (slug ~ '^[a-z][a-z0-9-]{2,99}$'),
    lifecycle VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (lifecycle IN ('active','retired')),
    version INTEGER NOT NULL CHECK (version BETWEEN 1 AND 1000000),
    title_zh VARCHAR(160) NOT NULL,
    title_en VARCHAR(160) NOT NULL,
    description_zh VARCHAR(800) NOT NULL,
    description_en VARCHAR(800) NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    target INTEGER NOT NULL CHECK (target BETWEEN 1 AND 1000000),
    filters JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(filters)='object'),
    hidden BOOLEAN NOT NULL DEFAULT FALSE,
    season INTEGER CHECK (season BETWEEN 1 AND 5),
    collection_key VARCHAR(100) NOT NULL CHECK (collection_key ~ '^[a-z][a-z0-9-]{2,99}$'),
    content_hash CHAR(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    retired_at TIMESTAMPTZ,
    UNIQUE (slug, version),
    CHECK ((lifecycle='active' AND retired_at IS NULL) OR lifecycle='retired')
);

CREATE TABLE IF NOT EXISTS streamer_achievement_events (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    source_type VARCHAR(32) NOT NULL CHECK (source_type IN ('story','streamer_game','quest','live_interaction')),
    source_event_id VARCHAR(180) NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::TEXT)<=6000),
    semantic_hash CHAR(64) NOT NULL CHECK (semantic_hash ~ '^[0-9a-f]{64}$'),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_type, source_event_id)
);

CREATE INDEX IF NOT EXISTS streamer_achievement_events_user_type_idx
    ON streamer_achievement_events(user_id, event_type, id);

CREATE TABLE IF NOT EXISTS streamer_achievement_progress (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    achievement_id BIGINT NOT NULL REFERENCES streamer_achievement_definitions(id) ON DELETE RESTRICT,
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 1000000),
    progress_keys JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(progress_keys)='array' AND jsonb_array_length(progress_keys)<=1000),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 1000000),
    unlocked_at TIMESTAMPTZ,
    last_event_id BIGINT REFERENCES streamer_achievement_events(id) ON DELETE RESTRICT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS streamer_achievement_unlocks (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    achievement_id BIGINT NOT NULL REFERENCES streamer_achievement_definitions(id) ON DELETE RESTRICT,
    achievement_event_id BIGINT NOT NULL REFERENCES streamer_achievement_events(id) ON DELETE RESTRICT,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS streamer_collection_holdings (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    item_key VARCHAR(100) NOT NULL CHECK (item_key ~ '^[a-z][a-z0-9-]{2,99}$'),
    source_type VARCHAR(24) NOT NULL CHECK (source_type IN ('achievement','story','game','quest','reward')),
    source_id VARCHAR(180) NOT NULL,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ,
    showcase_slot INTEGER CHECK (showcase_slot BETWEEN 1 AND 6),
    UNIQUE (user_id, item_key),
    UNIQUE (user_id, showcase_slot)
);

CREATE TABLE IF NOT EXISTS streamer_season_archives (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    season_slug VARCHAR(100) NOT NULL,
    content_version_id BIGINT NOT NULL REFERENCES story_content_versions(id) ON DELETE RESTRICT,
    state VARCHAR(16) NOT NULL CHECK (state IN ('open','archived')),
    conclusion_key VARCHAR(120),
    snapshot_hash CHAR(64) NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, content_version_id),
    CHECK ((state='open' AND archived_at IS NULL) OR (state='archived' AND archived_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS streamer_achievement_audit (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT,
    actor_username VARCHAR(100),
    action VARCHAR(80) NOT NULL,
    source_event_id VARCHAR(180),
    details JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(details)='object' AND octet_length(details::TEXT)<=6000),
    request_id VARCHAR(180),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION protect_streamer_achievement_definition()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'achievement definitions are immutable'; END IF;
    IF OLD.slug IS DISTINCT FROM NEW.slug OR OLD.version IS DISTINCT FROM NEW.version
       OR OLD.title_zh IS DISTINCT FROM NEW.title_zh OR OLD.title_en IS DISTINCT FROM NEW.title_en
       OR OLD.description_zh IS DISTINCT FROM NEW.description_zh OR OLD.description_en IS DISTINCT FROM NEW.description_en
       OR OLD.event_type IS DISTINCT FROM NEW.event_type OR OLD.target IS DISTINCT FROM NEW.target
       OR OLD.filters IS DISTINCT FROM NEW.filters OR OLD.hidden IS DISTINCT FROM NEW.hidden
       OR OLD.season IS DISTINCT FROM NEW.season OR OLD.collection_key IS DISTINCT FROM NEW.collection_key
       OR OLD.content_hash IS DISTINCT FROM NEW.content_hash OR OLD.published_at IS DISTINCT FROM NEW.published_at
       OR OLD.lifecycle='retired' OR NOT (OLD.lifecycle='active' AND NEW.lifecycle='retired')
    THEN RAISE EXCEPTION 'achievement content and lifecycle are immutable'; END IF;
    IF NEW.retired_at IS NULL THEN RAISE EXCEPTION 'retirement requires timestamp'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_streamer_achievement_definition ON streamer_achievement_definitions;
CREATE TRIGGER trg_protect_streamer_achievement_definition
BEFORE UPDATE OR DELETE ON streamer_achievement_definitions
FOR EACH ROW EXECUTE FUNCTION protect_streamer_achievement_definition();

CREATE OR REPLACE FUNCTION reject_streamer_achievement_append_mutation()
RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'streamer achievement history is append-only'; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_streamer_achievement_events_append ON streamer_achievement_events;
CREATE TRIGGER trg_streamer_achievement_events_append BEFORE UPDATE OR DELETE ON streamer_achievement_events
FOR EACH ROW EXECUTE FUNCTION reject_streamer_achievement_append_mutation();
DROP TRIGGER IF EXISTS trg_streamer_achievement_unlocks_append ON streamer_achievement_unlocks;
CREATE TRIGGER trg_streamer_achievement_unlocks_append BEFORE UPDATE OR DELETE ON streamer_achievement_unlocks
FOR EACH ROW EXECUTE FUNCTION reject_streamer_achievement_append_mutation();
DROP TRIGGER IF EXISTS trg_streamer_achievement_audit_append ON streamer_achievement_audit;
CREATE TRIGGER trg_streamer_achievement_audit_append BEFORE UPDATE OR DELETE ON streamer_achievement_audit
FOR EACH ROW EXECUTE FUNCTION reject_streamer_achievement_append_mutation();

COMMIT;
