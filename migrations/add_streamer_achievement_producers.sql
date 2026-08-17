BEGIN;

CREATE TABLE quest_v2_chain_completions (
    id UUID PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    chain_id BIGINT NOT NULL REFERENCES quest_v2_chains(id) ON DELETE RESTRICT,
    trigger_assignment_id BIGINT NOT NULL REFERENCES quest_v2_assignments(id) ON DELETE RESTRICT,
    source_event_id VARCHAR(120) NOT NULL UNIQUE
        CHECK (source_event_id ~ '^[A-Za-z0-9:_.-]{8,120}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, chain_id)
);

CREATE TABLE quest_v2_appeals (
    id UUID PRIMARY KEY,
    assignment_id BIGINT NOT NULL UNIQUE REFERENCES quest_v2_assignments(id) ON DELETE RESTRICT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    command_id UUID NOT NULL,
    semantic_hash CHAR(64) NOT NULL CHECK (semantic_hash ~ '^[0-9a-f]{64}$'),
    reason VARCHAR(1000) NOT NULL CHECK (char_length(BTRIM(reason)) BETWEEN 8 AND 1000),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved')),
    decision VARCHAR(20) CHECK (decision IN ('accepted','dismissed')),
    resolution_note VARCHAR(1000),
    resolved_by_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    resolution_command_id UUID UNIQUE,
    resolution_semantic_hash CHAR(64)
        CHECK (resolution_semantic_hash IS NULL OR resolution_semantic_hash ~ '^[0-9a-f]{64}$'),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    UNIQUE(user_id, command_id),
    CHECK (
        (status='pending' AND decision IS NULL AND resolution_note IS NULL
            AND resolved_by_user_id IS NULL AND resolution_command_id IS NULL
            AND resolution_semantic_hash IS NULL AND resolved_at IS NULL)
        OR (status='resolved' AND decision IS NOT NULL AND resolution_note IS NOT NULL
            AND resolved_by_user_id IS NOT NULL AND resolution_command_id IS NOT NULL
            AND resolution_semantic_hash IS NOT NULL AND resolved_at IS NOT NULL)
    )
);

CREATE INDEX quest_v2_appeals_pending_idx
    ON quest_v2_appeals(submitted_at,id) WHERE status='pending';
CREATE INDEX quest_v2_appeals_user_history_idx
    ON quest_v2_appeals(user_id,submitted_at DESC,id);

CREATE OR REPLACE FUNCTION protect_quest_v2_chain_completion() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'quest chain completion history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION protect_quest_v2_appeal() RETURNS trigger AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'quest appeals cannot be deleted';
    END IF;
    IF OLD.id IS DISTINCT FROM NEW.id
       OR OLD.assignment_id IS DISTINCT FROM NEW.assignment_id
       OR OLD.user_id IS DISTINCT FROM NEW.user_id
       OR OLD.command_id IS DISTINCT FROM NEW.command_id
       OR OLD.semantic_hash IS DISTINCT FROM NEW.semantic_hash
       OR OLD.reason IS DISTINCT FROM NEW.reason
       OR OLD.submitted_at IS DISTINCT FROM NEW.submitted_at THEN
        RAISE EXCEPTION 'quest appeal source identity is immutable';
    END IF;
    IF OLD.status <> 'pending' OR NEW.status <> 'resolved' THEN
        RAISE EXCEPTION 'quest appeal has an invalid or terminal transition';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS quest_v2_chain_completion_append_only ON quest_v2_chain_completions;
CREATE TRIGGER quest_v2_chain_completion_append_only
BEFORE UPDATE OR DELETE ON quest_v2_chain_completions
FOR EACH ROW EXECUTE FUNCTION protect_quest_v2_chain_completion();

DROP TRIGGER IF EXISTS quest_v2_appeal_guard ON quest_v2_appeals;
CREATE TRIGGER quest_v2_appeal_guard BEFORE UPDATE OR DELETE ON quest_v2_appeals
FOR EACH ROW EXECUTE FUNCTION protect_quest_v2_appeal();

COMMIT;
