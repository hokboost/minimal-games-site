-- Streamer World Phase 4: durable live interactions on the existing Socket.IO/event-bus stack.

CREATE TABLE IF NOT EXISTS live_interactions (
    id BIGSERIAL PRIMARY KEY,
    interaction_key UUID NOT NULL UNIQUE,
    creator_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'left', 'closed', 'reported')),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    next_sequence BIGINT NOT NULL DEFAULT 1 CHECK (next_sequence >= 1),
    creator_availability VARCHAR(20) NOT NULL DEFAULT 'offline'
        CHECK (creator_availability IN ('offline', 'available', 'busy')),
    creator_muted_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    CHECK (creator_user_id <> owner_user_id),
    CHECK ((status IN ('active', 'reported') AND closed_at IS NULL)
        OR (status IN ('left', 'closed') AND closed_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_live_interaction_active_pair
    ON live_interactions(creator_user_id, owner_user_id)
    WHERE status IN ('active', 'reported');
CREATE INDEX IF NOT EXISTS idx_live_interactions_creator
    ON live_interactions(creator_user_id, status, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_live_interactions_owner
    ON live_interactions(owner_user_id, status, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS live_interaction_members (
    interaction_id BIGINT NOT NULL REFERENCES live_interactions(id) ON DELETE RESTRICT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    member_role VARCHAR(20) NOT NULL CHECK (member_role IN ('creator', 'owner')),
    member_status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (member_status IN ('active', 'left')),
    highest_ack_sequence BIGINT NOT NULL DEFAULT 0 CHECK (highest_ack_sequence >= 0),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ,
    left_at TIMESTAMPTZ,
    PRIMARY KEY (interaction_id, user_id),
    CHECK ((member_status = 'active' AND left_at IS NULL)
        OR (member_status = 'left' AND left_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS live_interaction_items (
    id BIGSERIAL PRIMARY KEY,
    item_key UUID NOT NULL UNIQUE,
    interaction_id BIGINT NOT NULL REFERENCES live_interactions(id) ON DELETE RESTRICT,
    item_type VARCHAR(40) NOT NULL CHECK (item_type IN (
        'nudge', 'clue', 'celebration', 'story_letter', 'quest_invite',
        'poll', 'game_invite', 'story_intervention'
    )),
    template_key VARCHAR(100) NOT NULL CHECK (template_key ~ '^[a-z0-9][a-z0-9._-]{2,99}$'),
    status VARCHAR(24) NOT NULL DEFAULT 'delivered' CHECK (status IN (
        'scheduled', 'delivered', 'accepted', 'declined', 'closed', 'reported', 'expired'
    )),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    payload JSONB NOT NULL CHECK (
        jsonb_typeof(payload) = 'object' AND octet_length(payload::TEXT) <= 5000
    ),
    semantic_hash CHAR(64) NOT NULL CHECK (semantic_hash ~ '^[a-f0-9]{64}$'),
    target_story_node VARCHAR(160),
    created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deliver_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (expires_at IS NULL OR expires_at > created_at),
    CHECK ((item_type = 'story_intervention' AND target_story_node IS NOT NULL)
        OR (item_type <> 'story_intervention' AND target_story_node IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_live_items_interaction_state
    ON live_interaction_items(interaction_id, status, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS live_interaction_events (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE,
    interaction_id BIGINT NOT NULL REFERENCES live_interactions(id) ON DELETE RESTRICT,
    sequence BIGINT NOT NULL CHECK (sequence >= 1),
    protocol_version SMALLINT NOT NULL DEFAULT 1 CHECK (protocol_version = 1),
    event_type VARCHAR(60) NOT NULL CHECK (event_type IN (
        'interaction.opened', 'interaction.nudge', 'interaction.clue',
        'interaction.celebration', 'interaction.story_letter',
        'interaction.quest_invite', 'interaction.poll_opened',
        'interaction.poll_voted', 'interaction.game_invite',
        'interaction.story_intervention', 'interaction.item_accepted',
        'interaction.item_declined', 'interaction.availability_changed',
        'interaction.muted', 'interaction.left', 'interaction.reported',
        'interaction.closed', 'interaction.report_resolved', 'interaction.reconsented',
        'interaction.item_expired'
    )),
    actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('owner', 'creator', 'system')),
    actor_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    subject_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    correlation_id UUID NOT NULL,
    state_revision INTEGER NOT NULL CHECK (state_revision >= 0),
    payload JSONB NOT NULL CHECK (
        jsonb_typeof(payload) = 'object' AND octet_length(payload::TEXT) <= 5000
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (interaction_id, sequence)
);
CREATE INDEX IF NOT EXISTS idx_live_events_replay
    ON live_interaction_events(interaction_id, sequence, id);
CREATE INDEX IF NOT EXISTS idx_live_events_subject
    ON live_interaction_events(subject_user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS live_interaction_commands (
    id BIGSERIAL PRIMARY KEY,
    interaction_id BIGINT NOT NULL REFERENCES live_interactions(id) ON DELETE RESTRICT,
    actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    command_id UUID NOT NULL,
    command_type VARCHAR(60) NOT NULL,
    semantic_hash CHAR(64) NOT NULL CHECK (semantic_hash ~ '^[a-f0-9]{64}$'),
    expected_revision INTEGER NOT NULL CHECK (expected_revision >= 0),
    event_id UUID REFERENCES live_interaction_events(event_id) ON DELETE RESTRICT,
    response_status SMALLINT NOT NULL CHECK (response_status BETWEEN 200 AND 499),
    response_body JSONB NOT NULL CHECK (
        jsonb_typeof(response_body) = 'object' AND octet_length(response_body::TEXT) <= 16384
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (interaction_id, actor_user_id, command_id)
);

CREATE TABLE IF NOT EXISTS live_interaction_reports (
    id BIGSERIAL PRIMARY KEY,
    report_key UUID NOT NULL UNIQUE,
    interaction_id BIGINT NOT NULL REFERENCES live_interactions(id) ON DELETE RESTRICT,
    item_id BIGINT REFERENCES live_interaction_items(id) ON DELETE RESTRICT,
    reporter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reason_code VARCHAR(40) NOT NULL CHECK (reason_code IN (
        'unwanted_contact', 'unsafe_task', 'privacy', 'harassment', 'other'
    )),
    detail VARCHAR(500) NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewer_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    creator_reconsented_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_live_reports_open
    ON live_interaction_reports(status, created_at, id);

CREATE TABLE IF NOT EXISTS live_interaction_audit_log (
    id BIGSERIAL PRIMARY KEY,
    interaction_id BIGINT REFERENCES live_interactions(id) ON DELETE RESTRICT,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('owner', 'creator', 'system')),
    action VARCHAR(80) NOT NULL CHECK (action ~ '^[a-z][a-z0-9._-]{2,79}$'),
    request_id TEXT,
    details JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (
        jsonb_typeof(details) = 'object' AND octet_length(details::TEXT) <= 8192
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_live_audit_interaction
    ON live_interaction_audit_log(interaction_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION live_interaction_reject_append_only_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_live_events_append_only ON live_interaction_events;
CREATE TRIGGER trg_live_events_append_only
BEFORE UPDATE OR DELETE ON live_interaction_events
FOR EACH ROW EXECUTE FUNCTION live_interaction_reject_append_only_mutation();

DROP TRIGGER IF EXISTS trg_live_commands_append_only ON live_interaction_commands;
CREATE TRIGGER trg_live_commands_append_only
BEFORE UPDATE OR DELETE ON live_interaction_commands
FOR EACH ROW EXECUTE FUNCTION live_interaction_reject_append_only_mutation();

DROP TRIGGER IF EXISTS trg_live_audit_append_only ON live_interaction_audit_log;
CREATE TRIGGER trg_live_audit_append_only
BEFORE UPDATE OR DELETE ON live_interaction_audit_log
FOR EACH ROW EXECUTE FUNCTION live_interaction_reject_append_only_mutation();

CREATE OR REPLACE FUNCTION protect_live_interaction_report()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'live reports cannot be deleted'; END IF;
    IF NEW.report_key IS DISTINCT FROM OLD.report_key
       OR NEW.interaction_id IS DISTINCT FROM OLD.interaction_id
       OR NEW.item_id IS DISTINCT FROM OLD.item_id
       OR NEW.reporter_user_id IS DISTINCT FROM OLD.reporter_user_id
       OR NEW.reason_code IS DISTINCT FROM OLD.reason_code
       OR NEW.detail IS DISTINCT FROM OLD.detail
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'live report provenance is immutable';
    END IF;
    IF OLD.status <> NEW.status AND NOT (
        (OLD.status = 'open' AND NEW.status IN ('reviewing', 'resolved', 'dismissed'))
        OR (OLD.status = 'reviewing' AND NEW.status IN ('resolved', 'dismissed'))
    ) THEN RAISE EXCEPTION 'invalid live report lifecycle'; END IF;
    IF NEW.status IN ('resolved','dismissed')
       AND (NEW.reviewed_at IS NULL OR NEW.reviewer_user_id IS NULL) THEN
        RAISE EXCEPTION 'closed report requires reviewer provenance';
    END IF;
    IF OLD.status = 'open' AND NEW.status = 'open'
       AND (NEW.reviewed_at IS NOT NULL OR NEW.reviewer_user_id IS NOT NULL) THEN
        RAISE EXCEPTION 'open report cannot carry review provenance';
    END IF;
    IF OLD.status IN ('resolved','dismissed')
       AND (NEW.status IS DISTINCT FROM OLD.status
         OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
         OR NEW.reviewer_user_id IS DISTINCT FROM OLD.reviewer_user_id) THEN
        RAISE EXCEPTION 'closed report review provenance is immutable';
    END IF;
    IF OLD.status = 'reviewing'
       AND (NEW.reviewer_user_id IS DISTINCT FROM OLD.reviewer_user_id
         OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at) THEN
        RAISE EXCEPTION 'report reviewer provenance cannot be replaced';
    END IF;
    IF OLD.creator_reconsented_at IS NOT NULL
       AND NEW.creator_reconsented_at IS DISTINCT FROM OLD.creator_reconsented_at THEN
        RAISE EXCEPTION 'creator reconsent timestamp is immutable once recorded';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_live_interaction_report ON live_interaction_reports;
CREATE TRIGGER trg_protect_live_interaction_report
BEFORE UPDATE OR DELETE ON live_interaction_reports
FOR EACH ROW EXECUTE FUNCTION protect_live_interaction_report();

CREATE OR REPLACE FUNCTION protect_live_interaction_item()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'live interaction items cannot be deleted'; END IF;
    IF NEW.item_key IS DISTINCT FROM OLD.item_key
       OR NEW.interaction_id IS DISTINCT FROM OLD.interaction_id
       OR NEW.item_type IS DISTINCT FROM OLD.item_type
       OR NEW.template_key IS DISTINCT FROM OLD.template_key
       OR NEW.payload IS DISTINCT FROM OLD.payload
       OR NEW.semantic_hash IS DISTINCT FROM OLD.semantic_hash
       OR NEW.target_story_node IS DISTINCT FROM OLD.target_story_node
       OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.deliver_at IS DISTINCT FROM OLD.deliver_at
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
        RAISE EXCEPTION 'live interaction item content is immutable';
    END IF;
    IF NEW.revision <> OLD.revision + 1 THEN
        RAISE EXCEPTION 'live interaction item revision must advance exactly once';
    END IF;
    IF NOT ((OLD.status = 'scheduled' AND NEW.status IN ('delivered', 'closed', 'expired'))
         OR (OLD.status = 'delivered' AND NEW.status IN ('accepted', 'declined', 'closed', 'reported', 'expired'))
         OR (OLD.status = NEW.status)) THEN
        RAISE EXCEPTION 'invalid live interaction item transition';
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_live_interaction_item ON live_interaction_items;
CREATE TRIGGER trg_protect_live_interaction_item
BEFORE UPDATE OR DELETE ON live_interaction_items
FOR EACH ROW EXECUTE FUNCTION protect_live_interaction_item();

CREATE OR REPLACE FUNCTION protect_live_interaction_room()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'live interactions cannot be deleted'; END IF;
    IF NEW.interaction_key IS DISTINCT FROM OLD.interaction_key
       OR NEW.creator_user_id IS DISTINCT FROM OLD.creator_user_id
       OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'live interaction identity is immutable';
    END IF;
    IF NEW.revision < OLD.revision OR NEW.next_sequence < OLD.next_sequence THEN
        RAISE EXCEPTION 'live interaction counters cannot move backwards';
    END IF;
    IF OLD.status <> NEW.status AND NOT (
        (OLD.status = 'active' AND NEW.status IN ('left', 'closed', 'reported'))
        OR (OLD.status = 'reported' AND NEW.status IN ('closed'))
    ) THEN RAISE EXCEPTION 'invalid live interaction lifecycle'; END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_live_interaction_room ON live_interactions;
CREATE TRIGGER trg_protect_live_interaction_room
BEFORE UPDATE OR DELETE ON live_interactions
FOR EACH ROW EXECUTE FUNCTION protect_live_interaction_room();

CREATE OR REPLACE FUNCTION protect_live_member_ack()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'live interaction members cannot be deleted'; END IF;
    IF NEW.interaction_id IS DISTINCT FROM OLD.interaction_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.member_role IS DISTINCT FROM OLD.member_role
       OR NEW.joined_at IS DISTINCT FROM OLD.joined_at THEN
        RAISE EXCEPTION 'live interaction membership identity is immutable';
    END IF;
    IF NEW.highest_ack_sequence < OLD.highest_ack_sequence THEN
        RAISE EXCEPTION 'live acknowledgement cannot move backwards';
    END IF;
    IF OLD.member_status = 'left' AND NEW.member_status <> 'left' THEN
        RAISE EXCEPTION 'left member cannot silently rejoin';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_live_member_ack ON live_interaction_members;
CREATE TRIGGER trg_protect_live_member_ack
BEFORE UPDATE OR DELETE ON live_interaction_members
FOR EACH ROW EXECUTE FUNCTION protect_live_member_ack();
