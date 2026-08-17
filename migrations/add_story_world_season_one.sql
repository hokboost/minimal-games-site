CREATE TABLE IF NOT EXISTS story_campaigns (
    id BIGSERIAL PRIMARY KEY,
    slug VARCHAR(120) NOT NULL UNIQUE CHECK (slug ~ '^[a-z][a-z0-9.-]{2,119}$'),
    title_zh VARCHAR(240) NOT NULL,
    title_en VARCHAR(240) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS story_content_versions (
    id BIGSERIAL PRIMARY KEY,
    campaign_id BIGINT NOT NULL REFERENCES story_campaigns(id) ON DELETE RESTRICT,
    version INTEGER NOT NULL CHECK (version BETWEEN 1 AND 1000000),
    status VARCHAR(20) NOT NULL CHECK (status IN ('scheduled', 'active', 'retired')),
    content_hash CHAR(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    content_snapshot JSONB NOT NULL CHECK (jsonb_typeof(content_snapshot) = 'object' AND octet_length(content_snapshot::TEXT) <= 8388608),
    node_count INTEGER NOT NULL CHECK (node_count BETWEEN 1 AND 5000),
    choice_count INTEGER NOT NULL CHECK (choice_count BETWEEN 0 AND 2000),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (campaign_id, version),
    UNIQUE (campaign_id, content_hash),
    CHECK ((status = 'scheduled' AND published_at IS NULL) OR (status IN ('active', 'retired') AND published_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_story_active_content ON story_content_versions(campaign_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS story_runs (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    campaign_id BIGINT NOT NULL REFERENCES story_campaigns(id) ON DELETE RESTRICT,
    content_version_id BIGINT NOT NULL REFERENCES story_content_versions(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
    current_episode VARCHAR(120) NOT NULL CHECK (current_episode ~ '^[a-z][a-z0-9.-]{2,119}$'),
    current_node_id VARCHAR(120) NOT NULL CHECK (current_node_id ~ '^[a-z][a-z0-9.-]{2,119}$'),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 1000000),
    replay_mode BOOLEAN NOT NULL DEFAULT FALSE,
    state_snapshot JSONB NOT NULL CHECK (jsonb_typeof(state_snapshot) = 'object' AND octet_length(state_snapshot::TEXT) <= 1048576),
    checkpoint_snapshot JSONB CHECK (checkpoint_snapshot IS NULL OR (jsonb_typeof(checkpoint_snapshot) = 'object' AND octet_length(checkpoint_snapshot::TEXT) <= 1048576)),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((status = 'completed' AND completed_at IS NOT NULL) OR (status <> 'completed' AND completed_at IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_story_active_run ON story_runs(user_id, campaign_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_story_runs_user_time ON story_runs(user_id, started_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS story_events (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE,
    run_id BIGINT NOT NULL REFERENCES story_runs(id) ON DELETE RESTRICT,
    command_id VARCHAR(180) NOT NULL,
    semantic_hash CHAR(64) NOT NULL CHECK (semantic_hash ~ '^[a-f0-9]{64}$'),
    actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('creator', 'owner', 'system')),
    actor_username TEXT,
    action VARCHAR(30) NOT NULL CHECK (action IN ('start', 'advance', 'choose', 'answer', 'finish', 'replay', 'recover')),
    from_node_id VARCHAR(120),
    to_node_id VARCHAR(120) NOT NULL,
    selected_choice_id VARCHAR(120),
    answer_correct BOOLEAN,
    from_revision INTEGER NOT NULL CHECK (from_revision >= 0),
    to_revision INTEGER NOT NULL CHECK (to_revision = from_revision + 1 OR (action IN ('start', 'replay') AND to_revision = 0)),
    effects_digest JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(effects_digest) = 'object' AND octet_length(effects_digest::TEXT) <= 32768),
    response_snapshot JSONB NOT NULL CHECK (jsonb_typeof(response_snapshot) = 'object' AND octet_length(response_snapshot::TEXT) <= 262144),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (run_id, command_id)
);
CREATE INDEX IF NOT EXISTS idx_story_events_run_revision ON story_events(run_id, to_revision, id);

CREATE TABLE IF NOT EXISTS story_flags (
    run_id BIGINT NOT NULL REFERENCES story_runs(id) ON DELETE RESTRICT,
    flag_key VARCHAR(120) NOT NULL CHECK (flag_key ~ '^[a-z][a-z0-9_.-]{1,119}$'),
    flag_value JSONB NOT NULL CHECK (jsonb_typeof(flag_value) IN ('string', 'boolean')),
    source_event_id UUID NOT NULL REFERENCES story_events(event_id) ON DELETE RESTRICT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (run_id, flag_key)
);
CREATE TABLE IF NOT EXISTS story_relationship_axes (
    run_id BIGINT NOT NULL REFERENCES story_runs(id) ON DELETE RESTRICT,
    axis VARCHAR(20) NOT NULL CHECK (axis IN ('trust', 'curiosity', 'courage', 'harmony')),
    value INTEGER NOT NULL CHECK (value BETWEEN 0 AND 1000),
    source_event_id UUID NOT NULL REFERENCES story_events(event_id) ON DELETE RESTRICT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (run_id, axis)
);
CREATE TABLE IF NOT EXISTS story_character_relationships (
    run_id BIGINT NOT NULL REFERENCES story_runs(id) ON DELETE RESTRICT,
    character_key VARCHAR(120) NOT NULL CHECK (character_key ~ '^[a-z][a-z0-9_.-]{1,119}$'),
    value INTEGER NOT NULL CHECK (value BETWEEN -100 AND 100),
    source_event_id UUID NOT NULL REFERENCES story_events(event_id) ON DELETE RESTRICT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (run_id, character_key)
);
CREATE TABLE IF NOT EXISTS story_run_assets (
    run_id BIGINT NOT NULL REFERENCES story_runs(id) ON DELETE RESTRICT,
    asset_type VARCHAR(20) NOT NULL CHECK (asset_type IN ('clue', 'item', 'route', 'message')),
    asset_key VARCHAR(120) NOT NULL CHECK (asset_key ~ '^[a-z][a-z0-9_.-]{1,119}$'),
    source_event_id UUID NOT NULL REFERENCES story_events(event_id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (run_id, asset_type, asset_key)
);

CREATE TABLE IF NOT EXISTS story_memories (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    content_version_id BIGINT NOT NULL REFERENCES story_content_versions(id) ON DELETE RESTRICT,
    memory_key VARCHAR(120) NOT NULL CHECK (memory_key ~ '^[a-z][a-z0-9_.-]{1,119}$'),
    first_run_id BIGINT NOT NULL REFERENCES story_runs(id) ON DELETE RESTRICT,
    source_event_id UUID NOT NULL REFERENCES story_events(event_id) ON DELETE RESTRICT,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, content_version_id, memory_key)
);
CREATE TABLE IF NOT EXISTS story_unlock_intents (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    content_version_id BIGINT NOT NULL REFERENCES story_content_versions(id) ON DELETE RESTRICT,
    unlock_type VARCHAR(40) NOT NULL CHECK (unlock_type IN ('quest', 'game', 'achievement', 'collection', 'reward_catalog_visibility')),
    unlock_key VARCHAR(120) NOT NULL CHECK (unlock_key ~ '^[a-z][a-z0-9_.-]{1,119}$'),
    source_event_id UUID NOT NULL REFERENCES story_events(event_id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'consumed', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, content_version_id, unlock_type, unlock_key)
);
CREATE TABLE IF NOT EXISTS story_first_clears (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    content_version_id BIGINT NOT NULL REFERENCES story_content_versions(id) ON DELETE RESTRICT,
    episode_slug VARCHAR(120) NOT NULL CHECK (episode_slug ~ '^[a-z][a-z0-9.-]{2,119}$'),
    run_id BIGINT NOT NULL REFERENCES story_runs(id) ON DELETE RESTRICT,
    source_event_id UUID NOT NULL REFERENCES story_events(event_id) ON DELETE RESTRICT,
    cleared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, content_version_id, episode_slug)
);
CREATE TABLE IF NOT EXISTS story_audit_log (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT REFERENCES story_runs(id) ON DELETE RESTRICT,
    user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('creator', 'owner', 'admin', 'system')),
    actor_username TEXT,
    action VARCHAR(80) NOT NULL CHECK (action ~ '^[a-z][a-z0-9_.-]{2,79}$'),
    details JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(details) = 'object' AND octet_length(details::TEXT) <= 32768),
    request_id VARCHAR(180),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_story_audit_time ON story_audit_log(created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION story_reject_append_only_mutation()
RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END; $$ LANGUAGE plpgsql;
DO $$
DECLARE table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['story_events', 'story_memories', 'story_first_clears', 'story_audit_log'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || table_name || '_append_only', table_name);
        EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION story_reject_append_only_mutation()', 'trg_' || table_name || '_append_only', table_name);
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION story_protect_catalog_content()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'story catalog cannot be deleted'; END IF;
    IF NEW.campaign_id IS DISTINCT FROM OLD.campaign_id OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.content_hash IS DISTINCT FROM OLD.content_hash OR NEW.content_snapshot IS DISTINCT FROM OLD.content_snapshot
       OR NEW.node_count IS DISTINCT FROM OLD.node_count OR NEW.choice_count IS DISTINCT FROM OLD.choice_count
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR (OLD.status <> 'scheduled' AND NEW.published_at IS DISTINCT FROM OLD.published_at)
       OR (OLD.status = 'scheduled' AND NEW.status = 'scheduled' AND NEW.published_at IS DISTINCT FROM OLD.published_at)
       THEN RAISE EXCEPTION 'published story content is immutable'; END IF;
    IF NOT ((OLD.status = 'scheduled' AND NEW.status IN ('active', 'retired')) OR (OLD.status = 'active' AND NEW.status = 'retired') OR OLD.status = NEW.status) THEN
        RAISE EXCEPTION 'invalid story content lifecycle';
    END IF;
    IF OLD.status = 'retired' AND NEW.status <> 'retired' THEN RAISE EXCEPTION 'retired story content cannot be revived'; END IF;
    IF OLD.status = 'scheduled' AND NEW.status = 'active' AND (OLD.published_at IS NOT NULL OR NEW.published_at IS NULL) THEN RAISE EXCEPTION 'activation requires one publication timestamp'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_story_content_immutable ON story_content_versions;
CREATE TRIGGER trg_story_content_immutable BEFORE UPDATE OR DELETE ON story_content_versions FOR EACH ROW EXECUTE FUNCTION story_protect_catalog_content();

CREATE OR REPLACE FUNCTION story_protect_campaign()
RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'story campaign identity is immutable'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_story_campaign_immutable ON story_campaigns;
CREATE TRIGGER trg_story_campaign_immutable BEFORE UPDATE OR DELETE ON story_campaigns FOR EACH ROW EXECUTE FUNCTION story_protect_campaign();

CREATE OR REPLACE FUNCTION story_protect_unlock_intent()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'story unlock intents cannot be deleted'; END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.content_version_id IS DISTINCT FROM OLD.content_version_id
       OR NEW.unlock_type IS DISTINCT FROM OLD.unlock_type OR NEW.unlock_key IS DISTINCT FROM OLD.unlock_key
       OR NEW.source_event_id IS DISTINCT FROM OLD.source_event_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'story unlock provenance is immutable';
    END IF;
    IF NOT ((OLD.status = 'visible' AND NEW.status IN ('consumed', 'revoked')) OR OLD.status = NEW.status) THEN RAISE EXCEPTION 'invalid unlock lifecycle'; END IF;
    NEW.updated_at := NOW(); RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_story_unlock_intent_protection ON story_unlock_intents;
CREATE TRIGGER trg_story_unlock_intent_protection BEFORE UPDATE OR DELETE ON story_unlock_intents FOR EACH ROW EXECUTE FUNCTION story_protect_unlock_intent();
