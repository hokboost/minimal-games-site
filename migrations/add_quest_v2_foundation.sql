CREATE TABLE IF NOT EXISTS quest_definitions (
    id BIGSERIAL PRIMARY KEY,
    slug VARCHAR(120) NOT NULL,
    version INTEGER NOT NULL CHECK (version BETWEEN 1 AND 1000000),
    status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'published', 'retired')),
    title_zh VARCHAR(240) NOT NULL,
    title_en VARCHAR(240) NOT NULL,
    description_zh VARCHAR(1000) NOT NULL,
    description_en VARCHAR(1000) NOT NULL,
    verification_mode VARCHAR(20) NOT NULL CHECK (verification_mode IN ('automatic', 'manual', 'hybrid', 'signed_worker')),
    objective_version INTEGER NOT NULL CHECK (objective_version = 1),
    objective JSONB NOT NULL CHECK (
        jsonb_typeof(objective) = 'object'
        AND objective->>'type' = 'event_count'
        AND objective->>'event' = 'adventure.chapter.completed'
        AND objective->>'target' ~ '^(1000000|[1-9][0-9]{0,5})$'
        AND (NOT (objective ? 'filters') OR jsonb_typeof(objective->'filters') = 'object')
    ),
    reward_points INTEGER NOT NULL CHECK (reward_points BETWEEN 1 AND 100000000),
    eligibility JSONB NOT NULL DEFAULT '{"type":"task_card_pilot"}'::jsonb CHECK (jsonb_typeof(eligibility) = 'object'),
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (slug, version),
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
    CHECK (status = 'draft' OR published_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_quest_definitions_published
    ON quest_definitions(status, starts_at, ends_at, id)
    WHERE status = 'published';

CREATE OR REPLACE FUNCTION protect_published_quest_definition()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' AND OLD.published_at IS NOT NULL THEN
        RAISE EXCEPTION 'published quest definitions cannot be deleted';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.published_at IS NOT NULL THEN
        IF OLD.status <> 'published'
           OR NEW.status <> 'retired'
           OR NEW.slug IS DISTINCT FROM OLD.slug
           OR NEW.version IS DISTINCT FROM OLD.version
           OR NEW.title_zh IS DISTINCT FROM OLD.title_zh
           OR NEW.title_en IS DISTINCT FROM OLD.title_en
           OR NEW.description_zh IS DISTINCT FROM OLD.description_zh
           OR NEW.description_en IS DISTINCT FROM OLD.description_en
           OR NEW.verification_mode IS DISTINCT FROM OLD.verification_mode
           OR NEW.objective_version IS DISTINCT FROM OLD.objective_version
           OR NEW.objective IS DISTINCT FROM OLD.objective
           OR NEW.reward_points IS DISTINCT FROM OLD.reward_points
           OR NEW.eligibility IS DISTINCT FROM OLD.eligibility
           OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
           OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
           OR NEW.published_at IS DISTINCT FROM OLD.published_at
           OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'published quest definitions are immutable; publish a new version';
        END IF;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_published_quest_definition ON quest_definitions;
CREATE TRIGGER trg_protect_published_quest_definition
BEFORE UPDATE OR DELETE ON quest_definitions
FOR EACH ROW EXECUTE FUNCTION protect_published_quest_definition();

CREATE TABLE IF NOT EXISTS quest_assignments (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL REFERENCES users(username),
    definition_id BIGINT NOT NULL REFERENCES quest_definitions(id),
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'completed', 'expired', 'cancelled')),
    objective_version INTEGER NOT NULL CHECK (objective_version >= 1),
    objective_snapshot JSONB NOT NULL CHECK (jsonb_typeof(objective_snapshot) = 'object'),
    reward_points INTEGER NOT NULL CHECK (reward_points BETWEEN 1 AND 100000000),
    progress_value INTEGER NOT NULL DEFAULT 0 CHECK (progress_value >= 0),
    target_value INTEGER NOT NULL CHECK (target_value BETWEEN 1 AND 1000000),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    due_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    completion_number INTEGER CHECK (completion_number IS NULL OR completion_number >= 1),
    reward_posting_id VARCHAR(180) UNIQUE,
    assignment_source VARCHAR(40) NOT NULL DEFAULT 'automatic_pilot',
    UNIQUE (username, definition_id),
    CHECK (progress_value <= target_value),
    CHECK (
        (status = 'active' AND completed_at IS NULL AND reward_posting_id IS NULL)
        OR (status = 'completed' AND completed_at IS NOT NULL AND completion_number IS NOT NULL AND reward_posting_id IS NOT NULL)
        OR (status IN ('expired', 'cancelled')
            AND completed_at IS NULL
            AND completion_number IS NULL
            AND reward_posting_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_quest_assignments_user_status
    ON quest_assignments(username, status, assigned_at DESC);

CREATE TABLE IF NOT EXISTS quest_progress_events (
    id BIGSERIAL PRIMARY KEY,
    source_type VARCHAR(60) NOT NULL,
    source_event_id VARCHAR(180) NOT NULL,
    username VARCHAR(50) NOT NULL REFERENCES users(username),
    event_type VARCHAR(100) NOT NULL,
    event_version INTEGER NOT NULL CHECK (event_version = 1),
    occurred_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 8192),
    processing_status VARCHAR(20) NOT NULL DEFAULT 'recorded'
        CHECK (processing_status IN ('recorded', 'processed', 'ignored')),
    result JSONB CHECK (
        result IS NULL
        OR (jsonb_typeof(result) = 'object' AND octet_length(result::text) <= 16384)
    ),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_type, source_event_id),
    CHECK (
        (processing_status = 'recorded' AND result IS NULL AND processed_at IS NULL)
        OR (processing_status IN ('processed', 'ignored') AND result IS NOT NULL AND processed_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_quest_progress_events_user_time
    ON quest_progress_events(username, occurred_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS quest_reward_postings (
    posting_id VARCHAR(180) PRIMARY KEY,
    assignment_id BIGINT NOT NULL UNIQUE REFERENCES quest_assignments(id),
    progress_event_id BIGINT NOT NULL REFERENCES quest_progress_events(id),
    username VARCHAR(50) NOT NULL REFERENCES users(username),
    completion_number INTEGER NOT NULL CHECK (completion_number >= 1),
    reward_points INTEGER NOT NULL CHECK (reward_points BETWEEN 1 AND 100000000),
    operation_type VARCHAR(80) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'posted')),
    balance_before BIGINT,
    balance_after BIGINT,
    posted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (status = 'pending' AND balance_before IS NULL AND balance_after IS NULL AND posted_at IS NULL)
        OR (status = 'posted' AND balance_before IS NOT NULL AND balance_after IS NOT NULL AND posted_at IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS quest_audit_log (
    id BIGSERIAL PRIMARY KEY,
    assignment_id BIGINT NOT NULL REFERENCES quest_assignments(id),
    progress_event_id BIGINT NOT NULL REFERENCES quest_progress_events(id),
    posting_id VARCHAR(180) REFERENCES quest_reward_postings(posting_id),
    username VARCHAR(50) NOT NULL REFERENCES users(username),
    action VARCHAR(60) NOT NULL,
    verification_mode VARCHAR(20) NOT NULL,
    details JSONB NOT NULL CHECK (jsonb_typeof(details) = 'object' AND octet_length(details::text) <= 8192),
    request_id VARCHAR(180),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (assignment_id, progress_event_id, action)
);

ALTER TABLE quest_assignments
    ADD CONSTRAINT quest_assignments_reward_posting_fk
    FOREIGN KEY (reward_posting_id) REFERENCES quest_reward_postings(posting_id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION protect_quest_progress_event()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'quest progress events cannot be deleted';
    END IF;
    IF OLD.processing_status <> 'recorded'
       OR NEW.source_type IS DISTINCT FROM OLD.source_type
       OR NEW.source_event_id IS DISTINCT FROM OLD.source_event_id
       OR NEW.username IS DISTINCT FROM OLD.username
       OR NEW.event_type IS DISTINCT FROM OLD.event_type
       OR NEW.event_version IS DISTINCT FROM OLD.event_version
       OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
       OR NEW.payload IS DISTINCT FROM OLD.payload
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.processing_status NOT IN ('processed', 'ignored')
       OR NEW.result IS NULL
       OR NEW.processed_at IS NULL THEN
        RAISE EXCEPTION 'quest progress event transition is invalid';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_quest_progress_event ON quest_progress_events;
CREATE TRIGGER trg_protect_quest_progress_event
BEFORE UPDATE OR DELETE ON quest_progress_events
FOR EACH ROW EXECUTE FUNCTION protect_quest_progress_event();

CREATE OR REPLACE FUNCTION protect_quest_reward_posting()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'quest reward postings cannot be deleted';
    END IF;
    IF OLD.status <> 'pending'
       OR NEW.posting_id IS DISTINCT FROM OLD.posting_id
       OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id
       OR NEW.progress_event_id IS DISTINCT FROM OLD.progress_event_id
       OR NEW.username IS DISTINCT FROM OLD.username
       OR NEW.completion_number IS DISTINCT FROM OLD.completion_number
       OR NEW.reward_points IS DISTINCT FROM OLD.reward_points
       OR NEW.operation_type IS DISTINCT FROM OLD.operation_type
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.status <> 'posted'
       OR NEW.balance_before IS NULL
       OR NEW.balance_after IS NULL
       OR NEW.posted_at IS NULL THEN
        RAISE EXCEPTION 'quest reward posting transition is invalid';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_quest_reward_posting ON quest_reward_postings;
CREATE TRIGGER trg_protect_quest_reward_posting
BEFORE UPDATE OR DELETE ON quest_reward_postings
FOR EACH ROW EXECUTE FUNCTION protect_quest_reward_posting();

DROP TRIGGER IF EXISTS quest_audit_log_append_only ON quest_audit_log;
CREATE TRIGGER quest_audit_log_append_only
BEFORE UPDATE OR DELETE ON quest_audit_log
FOR EACH ROW EXECUTE FUNCTION reject_balance_log_mutation();

INSERT INTO quest_definitions (
    slug, version, status,
    title_zh, title_en, description_zh, description_en,
    verification_mode, objective_version, objective, reward_points,
    eligibility, published_at
) VALUES (
    'star-archive-three-chapters', 1, 'published',
    '星图远征：连续通关三章', 'Star Map Expedition: Clear Three Chapters',
    '在星图档案馆任意通关三个不同章节。进度由服务器自动验证。',
    'Clear any three distinct Star Archive chapters. Progress is verified automatically by the server.',
    'automatic', 1,
    '{"type":"event_count","event":"adventure.chapter.completed","target":3,"filters":{"campaignId":"star-archive-v1"}}'::jsonb,
    1200,
    '{"type":"task_card_pilot"}'::jsonb,
    NOW()
)
ON CONFLICT (slug, version) DO NOTHING;
