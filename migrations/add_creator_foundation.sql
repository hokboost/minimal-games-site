CREATE TABLE IF NOT EXISTS creator_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
    display_name VARCHAR(80) NOT NULL,
    bio VARCHAR(500) NOT NULL DEFAULT '',
    pronouns VARCHAR(80) NOT NULL DEFAULT '',
    timezone VARCHAR(80) NOT NULL DEFAULT 'UTC',
    interaction_tones TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    difficulty VARCHAR(20) NOT NULL DEFAULT 'guided'
        CHECK (difficulty IN ('relaxed', 'guided', 'balanced', 'challenging')),
    story_tone VARCHAR(20) NOT NULL DEFAULT 'gentle'
        CHECK (story_tone IN ('gentle', 'mystery', 'adventure', 'dramatic')),
    communication_style VARCHAR(20) NOT NULL DEFAULT 'async'
        CHECK (communication_style IN ('async', 'live', 'low_frequency')),
    live_interaction_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
    profile_visibility VARCHAR(20) NOT NULL DEFAULT 'private'
        CHECK (profile_visibility IN ('private', 'owner')),
    evidence_retention VARCHAR(20) NOT NULL DEFAULT 'minimum'
        CHECK (evidence_retention IN ('minimum', 'standard', 'extended')),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 1000000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (cardinality(interaction_tones) <= 3),
    CHECK (interaction_tones <@ ARRAY[
        'friend', 'co_creator', 'mentor', 'playful_rival', 'story_partner', 'quiet_support'
    ]::TEXT[]),
    CHECK (octet_length(display_name) <= 240 AND octet_length(bio) <= 1500)
);

CREATE TABLE IF NOT EXISTS creator_preferences (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    preference_type VARCHAR(30) NOT NULL
        CHECK (preference_type IN ('quest_category', 'game', 'communication', 'evidence')),
    preference_key VARCHAR(80) NOT NULL CHECK (preference_key ~ '^[a-z][a-z0-9_-]{1,79}$'),
    preference_value VARCHAR(20) NOT NULL CHECK (preference_value IN ('allow', 'neutral', 'avoid', 'block')),
    source VARCHAR(20) NOT NULL DEFAULT 'creator' CHECK (source IN ('creator', 'owner', 'system')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, preference_type, preference_key)
);

CREATE TABLE IF NOT EXISTS creator_quiet_hours (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_minute SMALLINT NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
    end_minute SMALLINT NOT NULL CHECK (end_minute BETWEEN 0 AND 1439),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, weekday),
    CHECK (start_minute <> end_minute)
);

CREATE TABLE IF NOT EXISTS creator_interaction_windows (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_minute SMALLINT NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
    end_minute SMALLINT NOT NULL CHECK (end_minute BETWEEN 0 AND 1439),
    interaction_mode VARCHAR(20) NOT NULL DEFAULT 'either'
        CHECK (interaction_mode IN ('async', 'live', 'either')),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, weekday),
    CHECK (((end_minute - start_minute + 1440) % 1440) BETWEEN 30 AND 720)
);

CREATE TABLE IF NOT EXISTS creator_room_binding_requests (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    requested_room_id VARCHAR(20) NOT NULL CHECK (requested_room_id ~ '^[1-9][0-9]{0,11}$'),
    previous_room_id VARCHAR(20),
    status VARCHAR(20) NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested', 'verifying', 'approved', 'rejected', 'cancelled', 'blocked')),
    request_note VARCHAR(300) NOT NULL DEFAULT '',
    review_note VARCHAR(500) NOT NULL DEFAULT '',
    reviewer_username TEXT REFERENCES users(username) ON DELETE RESTRICT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (previous_room_id IS NULL OR previous_room_id ~ '^[1-9][0-9]{0,11}$'),
    CHECK (
        (status IN ('requested', 'verifying') AND reviewed_at IS NULL AND cancelled_at IS NULL)
        OR (status IN ('approved', 'rejected', 'blocked') AND reviewed_at IS NOT NULL AND cancelled_at IS NULL)
        OR (status = 'cancelled' AND reviewed_at IS NULL AND cancelled_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_creator_room_binding_active_user
    ON creator_room_binding_requests(user_id)
    WHERE status IN ('requested', 'verifying');
CREATE INDEX IF NOT EXISTS idx_creator_room_binding_review_queue
    ON creator_room_binding_requests(status, requested_at, id);

CREATE TABLE IF NOT EXISTS creator_consent_events (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('creator', 'owner', 'admin', 'system')),
    actor_username TEXT,
    event_type VARCHAR(50) NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.-]{2,49}$'),
    previous_state JSONB NOT NULL DEFAULT '{}'::JSONB
        CHECK (jsonb_typeof(previous_state) = 'object' AND octet_length(previous_state::TEXT) <= 16384),
    next_state JSONB NOT NULL DEFAULT '{}'::JSONB
        CHECK (jsonb_typeof(next_state) = 'object' AND octet_length(next_state::TEXT) <= 16384),
    request_id VARCHAR(180),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_creator_consent_events_user_time
    ON creator_consent_events(user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS relationship_events (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    event_type VARCHAR(60) NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.-]{2,59}$'),
    xp_delta INTEGER NOT NULL CHECK (xp_delta BETWEEN 0 AND 1000),
    source_type VARCHAR(40) NOT NULL CHECK (source_type ~ '^[a-z][a-z0-9_.-]{1,39}$'),
    source_id VARCHAR(180) NOT NULL,
    summary_zh VARCHAR(300) NOT NULL,
    summary_en VARCHAR(300) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB
        CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::TEXT) <= 8192),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_relationship_events_user_time
    ON relationship_events(user_id, occurred_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS relationship_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
    total_xp INTEGER NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
    level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 1000),
    milestone VARCHAR(80) NOT NULL DEFAULT 'new_signal',
    version INTEGER NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 1000000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shared_memories (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    source_type VARCHAR(40) NOT NULL CHECK (source_type ~ '^[a-z][a-z0-9_.-]{1,39}$'),
    source_id VARCHAR(180) NOT NULL,
    title_zh VARCHAR(240) NOT NULL,
    title_en VARCHAR(240) NOT NULL,
    body_zh VARCHAR(2000) NOT NULL,
    body_en VARCHAR(2000) NOT NULL,
    content_version INTEGER NOT NULL DEFAULT 1 CHECK (content_version BETWEEN 1 AND 1000000),
    visibility VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'owner')),
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    hidden BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB
        CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::TEXT) <= 8192),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_shared_memories_user_time
    ON shared_memories(user_id, archived, pinned DESC, occurred_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS creator_inbox_messages (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('system', 'owner')),
    sender_username TEXT,
    message_type VARCHAR(40) NOT NULL CHECK (message_type IN (
        'system_notice', 'welcome', 'owner_note', 'quest_invitation', 'story_letter',
        'game_invitation', 'coop_result', 'achievement_celebration', 'reward_status',
        'evidence_review', 'event_reminder', 'moderation_notice'
    )),
    dedupe_key VARCHAR(180) NOT NULL,
    title_zh VARCHAR(240) NOT NULL,
    title_en VARCHAR(240) NOT NULL,
    body_zh VARCHAR(2000) NOT NULL,
    body_en VARCHAR(2000) NOT NULL,
    action_path VARCHAR(240) CHECK (action_path IS NULL OR action_path ~ '^/[A-Za-z0-9/_?&=.-]{1,239}$'),
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB
        CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::TEXT) <= 8192),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    UNIQUE (user_id, dedupe_key),
    CHECK (expires_at IS NULL OR expires_at > sent_at)
);
CREATE INDEX IF NOT EXISTS idx_creator_inbox_user_state
    ON creator_inbox_messages(user_id, archived_at, read_at, sent_at DESC, id DESC);

CREATE OR REPLACE FUNCTION creator_reject_append_only_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_creator_consent_append_only ON creator_consent_events;
CREATE TRIGGER trg_creator_consent_append_only
BEFORE UPDATE OR DELETE ON creator_consent_events
FOR EACH ROW EXECUTE FUNCTION creator_reject_append_only_mutation();

DROP TRIGGER IF EXISTS trg_relationship_events_append_only ON relationship_events;
CREATE TRIGGER trg_relationship_events_append_only
BEFORE UPDATE OR DELETE ON relationship_events
FOR EACH ROW EXECUTE FUNCTION creator_reject_append_only_mutation();

CREATE OR REPLACE FUNCTION protect_shared_memory_content()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'shared memories cannot be deleted'; END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.source_type IS DISTINCT FROM OLD.source_type
       OR NEW.source_id IS DISTINCT FROM OLD.source_id
       OR NEW.title_zh IS DISTINCT FROM OLD.title_zh
       OR NEW.title_en IS DISTINCT FROM OLD.title_en
       OR NEW.body_zh IS DISTINCT FROM OLD.body_zh
       OR NEW.body_en IS DISTINCT FROM OLD.body_en
       OR NEW.content_version IS DISTINCT FROM OLD.content_version
       OR NEW.metadata IS DISTINCT FROM OLD.metadata
       OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'shared memory provenance is immutable';
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_shared_memory_content ON shared_memories;
CREATE TRIGGER trg_protect_shared_memory_content
BEFORE UPDATE OR DELETE ON shared_memories
FOR EACH ROW EXECUTE FUNCTION protect_shared_memory_content();

CREATE OR REPLACE FUNCTION protect_creator_inbox_content()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'creator inbox messages cannot be deleted'; END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.sender_type IS DISTINCT FROM OLD.sender_type
       OR NEW.sender_username IS DISTINCT FROM OLD.sender_username
       OR NEW.message_type IS DISTINCT FROM OLD.message_type
       OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
       OR NEW.title_zh IS DISTINCT FROM OLD.title_zh
       OR NEW.title_en IS DISTINCT FROM OLD.title_en
       OR NEW.body_zh IS DISTINCT FROM OLD.body_zh
       OR NEW.body_en IS DISTINCT FROM OLD.body_en
       OR NEW.action_path IS DISTINCT FROM OLD.action_path
       OR NEW.metadata IS DISTINCT FROM OLD.metadata
       OR NEW.sent_at IS DISTINCT FROM OLD.sent_at
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
        RAISE EXCEPTION 'creator inbox content is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_creator_inbox_content ON creator_inbox_messages;
CREATE TRIGGER trg_protect_creator_inbox_content
BEFORE UPDATE OR DELETE ON creator_inbox_messages
FOR EACH ROW EXECUTE FUNCTION protect_creator_inbox_content();
