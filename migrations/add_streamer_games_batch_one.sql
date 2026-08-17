BEGIN;

-- Phase 4 owns this exact constraint. A missing or renamed constraint means the
-- deployed schema is not the version this upgrade was reviewed against, so fail
-- closed instead of silently leaving an unexpected CHECK in place.
ALTER TABLE live_interaction_events DROP CONSTRAINT live_interaction_events_event_type_check;
ALTER TABLE live_interaction_events ADD CONSTRAINT live_interaction_events_event_type_check CHECK (event_type IN (
    'interaction.opened','interaction.nudge','interaction.clue','interaction.celebration',
    'interaction.story_letter','interaction.quest_invite','interaction.poll_opened','interaction.poll_voted',
    'interaction.game_invite','interaction.story_intervention','interaction.item_accepted',
    'interaction.item_declined','interaction.availability_changed','interaction.muted','interaction.left',
    'interaction.reported','interaction.closed','interaction.report_resolved','interaction.reconsented',
    'interaction.item_expired','interaction.game_state_changed'
));

CREATE TABLE streamer_game_versions (
    id BIGSERIAL PRIMARY KEY,
    game_id VARCHAR(40) NOT NULL,
    config_version VARCHAR(64) NOT NULL,
    content_hash CHAR(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
    content_snapshot JSONB NOT NULL CHECK (jsonb_typeof(content_snapshot)='object' AND octet_length(content_snapshot::TEXT)<=262144),
    challenge_count INTEGER NOT NULL CHECK (challenge_count BETWEEN 20 AND 500),
    lifecycle VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (lifecycle IN('active','retired')),
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    retired_at TIMESTAMPTZ,
    UNIQUE(game_id,config_version),
    CHECK ((lifecycle='active' AND retired_at IS NULL) OR (lifecycle='retired' AND retired_at IS NOT NULL))
);

CREATE UNIQUE INDEX streamer_game_versions_one_active_idx
    ON streamer_game_versions(game_id) WHERE lifecycle='active';

CREATE TABLE streamer_game_runs (
    id UUID PRIMARY KEY,
    game_id VARCHAR(40) NOT NULL,
    version_id BIGINT NOT NULL REFERENCES streamer_game_versions(id),
    creator_user_id BIGINT NOT NULL REFERENCES users(id),
    owner_user_id BIGINT REFERENCES users(id),
    live_interaction_id BIGINT REFERENCES live_interactions(id),
    mode VARCHAR(12) NOT NULL CHECK (mode IN('solo','coop')),
    difficulty VARCHAR(12) NOT NULL CHECK (difficulty IN('gentle','standard','expert')),
    status VARCHAR(16) NOT NULL CHECK (status IN('active','completed','failed','left','abandoned')),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 100000),
    next_sequence INTEGER NOT NULL DEFAULT 1 CHECK (next_sequence BETWEEN 1 AND 100001),
    score INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100000000),
    state JSONB NOT NULL CHECK (jsonb_typeof(state)='object' AND octet_length(state::TEXT)<=131072),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CHECK ((status='completed' AND completed_at IS NOT NULL) OR (status<>'completed' AND completed_at IS NULL)),
    CHECK ((mode='solo' AND owner_user_id IS NULL AND live_interaction_id IS NULL)
        OR (mode='coop' AND owner_user_id IS NOT NULL AND live_interaction_id IS NOT NULL))
);

CREATE UNIQUE INDEX streamer_game_runs_one_active_idx
    ON streamer_game_runs(creator_user_id,game_id) WHERE status='active';
CREATE INDEX streamer_game_runs_owner_idx ON streamer_game_runs(owner_user_id,updated_at DESC) WHERE owner_user_id IS NOT NULL;
CREATE INDEX streamer_game_runs_history_idx ON streamer_game_runs(creator_user_id,game_id,updated_at DESC);

CREATE TABLE streamer_game_start_commands (
    actor_user_id BIGINT NOT NULL REFERENCES users(id),
    game_id VARCHAR(40) NOT NULL,
    command_id UUID NOT NULL,
    semantic_hash CHAR(64) NOT NULL CHECK (semantic_hash ~ '^[0-9a-f]{64}$'),
    run_id UUID NOT NULL REFERENCES streamer_game_runs(id),
    response_status INTEGER NOT NULL CHECK (response_status BETWEEN 200 AND 299),
    response_body JSONB NOT NULL CHECK (jsonb_typeof(response_body)='object' AND octet_length(response_body::TEXT)<=131072),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(actor_user_id,game_id,command_id)
);

CREATE TABLE streamer_game_commands (
    run_id UUID NOT NULL REFERENCES streamer_game_runs(id),
    actor_user_id BIGINT NOT NULL REFERENCES users(id),
    command_id UUID NOT NULL,
    command_type VARCHAR(64) NOT NULL,
    semantic_hash CHAR(64) NOT NULL CHECK (semantic_hash ~ '^[0-9a-f]{64}$'),
    expected_revision INTEGER NOT NULL CHECK (expected_revision BETWEEN 0 AND 100000),
    event_id UUID,
    response_status INTEGER NOT NULL CHECK (response_status BETWEEN 200 AND 499),
    response_body JSONB NOT NULL CHECK (jsonb_typeof(response_body)='object' AND octet_length(response_body::TEXT)<=131072),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(run_id,actor_user_id,command_id)
);

CREATE TABLE streamer_game_events (
    event_id UUID PRIMARY KEY,
    run_id UUID NOT NULL REFERENCES streamer_game_runs(id),
    sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 100000),
    event_type VARCHAR(64) NOT NULL CHECK (event_type IN(
        'game.run.started','game.partner.joined','game.action.committed','game.run.completed',
        'game.run.failed','game.run.abandoned','game.partner.left','game.run.resumed'
    )),
    actor_user_id BIGINT REFERENCES users(id),
    state_revision INTEGER NOT NULL CHECK (state_revision BETWEEN 0 AND 100000),
    action_summary JSONB NOT NULL CHECK (jsonb_typeof(action_summary)='object' AND octet_length(action_summary::TEXT)<=4096),
    state_hash CHAR(64) NOT NULL CHECK (state_hash ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(run_id,sequence)
);
CREATE INDEX streamer_game_events_replay_idx ON streamer_game_events(run_id,sequence);

CREATE TABLE streamer_game_hook_intents (
    id BIGSERIAL PRIMARY KEY,
    run_id UUID NOT NULL REFERENCES streamer_game_runs(id),
    intent_type VARCHAR(24) NOT NULL CHECK (intent_type IN('quest_event','story_unlock','achievement_progress','collection_unlock')),
    intent_key VARCHAR(120) NOT NULL CHECK (intent_key ~ '^[a-z0-9][a-z0-9:._-]{1,119}$'),
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::TEXT)<=4096),
    status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN('pending','processed','ignored')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    UNIQUE(run_id,intent_type,intent_key),
    CHECK ((status='pending' AND processed_at IS NULL) OR (status IN('processed','ignored') AND processed_at IS NOT NULL))
);

CREATE TABLE streamer_game_collection_items (
    user_id BIGINT NOT NULL REFERENCES users(id),
    item_key VARCHAR(120) NOT NULL CHECK (item_key ~ '^[a-z0-9][a-z0-9:._-]{1,119}$'),
    source_run_id UUID NOT NULL REFERENCES streamer_game_runs(id),
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(user_id,item_key),
    UNIQUE(source_run_id,item_key)
);

CREATE TABLE streamer_game_room_slots (
    user_id BIGINT NOT NULL REFERENCES users(id),
    slot_index SMALLINT NOT NULL CHECK (slot_index BETWEEN 0 AND 5),
    item_key VARCHAR(120) NOT NULL,
    source_run_id UUID NOT NULL REFERENCES streamer_game_runs(id),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 100000),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(user_id,slot_index),
    FOREIGN KEY(user_id,item_key) REFERENCES streamer_game_collection_items(user_id,item_key)
);

CREATE TABLE streamer_game_audit_log (
    id BIGSERIAL PRIMARY KEY,
    run_id UUID REFERENCES streamer_game_runs(id),
    actor_user_id BIGINT REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    request_id VARCHAR(200),
    details JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(details)='object' AND octet_length(details::TEXT)<=4096),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION protect_streamer_game_immutable_rows() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'streamer game history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER streamer_game_commands_append_only BEFORE UPDATE OR DELETE ON streamer_game_commands
    FOR EACH ROW EXECUTE FUNCTION protect_streamer_game_immutable_rows();
CREATE TRIGGER streamer_game_start_commands_append_only BEFORE UPDATE OR DELETE ON streamer_game_start_commands
    FOR EACH ROW EXECUTE FUNCTION protect_streamer_game_immutable_rows();
CREATE TRIGGER streamer_game_events_append_only BEFORE UPDATE OR DELETE ON streamer_game_events
    FOR EACH ROW EXECUTE FUNCTION protect_streamer_game_immutable_rows();
CREATE TRIGGER streamer_game_audit_append_only BEFORE UPDATE OR DELETE ON streamer_game_audit_log
    FOR EACH ROW EXECUTE FUNCTION protect_streamer_game_immutable_rows();
CREATE TRIGGER streamer_game_collection_append_only BEFORE UPDATE OR DELETE ON streamer_game_collection_items
    FOR EACH ROW EXECUTE FUNCTION protect_streamer_game_immutable_rows();

CREATE OR REPLACE FUNCTION protect_streamer_game_version() RETURNS trigger AS $$
BEGIN
    IF OLD.game_id<>NEW.game_id OR OLD.config_version<>NEW.config_version OR OLD.content_hash<>NEW.content_hash
       OR OLD.content_snapshot<>NEW.content_snapshot OR OLD.challenge_count<>NEW.challenge_count
       OR OLD.published_at<>NEW.published_at OR OLD.lifecycle='retired' OR NEW.lifecycle<>'retired'
       OR NEW.retired_at IS NULL THEN
        RAISE EXCEPTION 'published streamer game versions are immutable and retirement is one-way';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER streamer_game_version_lifecycle BEFORE UPDATE ON streamer_game_versions
    FOR EACH ROW EXECUTE FUNCTION protect_streamer_game_version();
CREATE TRIGGER streamer_game_version_no_delete BEFORE DELETE ON streamer_game_versions
    FOR EACH ROW EXECUTE FUNCTION protect_streamer_game_immutable_rows();

CREATE OR REPLACE FUNCTION protect_streamer_game_hook_intent() RETURNS trigger AS $$
BEGIN
    IF OLD.run_id<>NEW.run_id OR OLD.intent_type<>NEW.intent_type OR OLD.intent_key<>NEW.intent_key
       OR OLD.payload<>NEW.payload OR OLD.created_at<>NEW.created_at OR OLD.status<>'pending'
       OR NEW.status NOT IN('processed','ignored') OR NEW.processed_at IS NULL THEN
        RAISE EXCEPTION 'streamer game hook intent provenance is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER streamer_game_hook_intent_lifecycle BEFORE UPDATE ON streamer_game_hook_intents
    FOR EACH ROW EXECUTE FUNCTION protect_streamer_game_hook_intent();
CREATE TRIGGER streamer_game_hook_intent_no_delete BEFORE DELETE ON streamer_game_hook_intents
    FOR EACH ROW EXECUTE FUNCTION protect_streamer_game_immutable_rows();

COMMIT;
