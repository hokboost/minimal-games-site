CREATE TABLE IF NOT EXISTS quest_v2_definitions (
    id BIGSERIAL PRIMARY KEY,
    slug VARCHAR(120) NOT NULL UNIQUE CHECK (slug ~ '^[a-z][a-z0-9-]{2,119}$'),
    source VARCHAR(30) NOT NULL DEFAULT 'built_in' CHECK (source IN ('built_in', 'owner_studio', 'legacy_import')),
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quest_v2_versions (
    id BIGSERIAL PRIMARY KEY,
    definition_id BIGINT NOT NULL REFERENCES quest_v2_definitions(id) ON DELETE RESTRICT,
    version INTEGER NOT NULL CHECK (version BETWEEN 1 AND 1000000),
    lifecycle VARCHAR(20) NOT NULL CHECK (lifecycle IN ('draft', 'validated', 'scheduled', 'active', 'retired')),
    category VARCHAR(30) NOT NULL CHECK (category IN (
        'exploration', 'game_mastery', 'story', 'creativity', 'streaming_practice',
        'coop', 'community', 'collection', 'wellbeing'
    )),
    tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[] CHECK (cardinality(tags) BETWEEN 1 AND 12),
    difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('relaxed', 'guided', 'balanced', 'challenging')),
    estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes BETWEEN 1 AND 480),
    safety_class VARCHAR(20) NOT NULL CHECK (safety_class IN ('standard', 'sensitive', 'wellbeing')),
    title_zh VARCHAR(240) NOT NULL,
    title_en VARCHAR(240) NOT NULL,
    description_zh VARCHAR(1200) NOT NULL,
    description_en VARCHAR(1200) NOT NULL,
    hint_zh VARCHAR(800) NOT NULL,
    hint_en VARCHAR(800) NOT NULL,
    completion_zh VARCHAR(500) NOT NULL,
    completion_en VARCHAR(500) NOT NULL,
    verification_mode VARCHAR(20) NOT NULL CHECK (verification_mode IN ('automatic', 'manual', 'hybrid')),
    consent_category VARCHAR(30) NOT NULL,
    eligibility_rule JSONB NOT NULL CHECK (
        jsonb_typeof(eligibility_rule) = 'object' AND octet_length(eligibility_rule::TEXT) <= 16384
    ),
    completion_rule JSONB NOT NULL CHECK (
        jsonb_typeof(completion_rule) = 'object' AND octet_length(completion_rule::TEXT) <= 32768
    ),
    reward_policy_version INTEGER NOT NULL DEFAULT 1 CHECK (reward_policy_version BETWEEN 1 AND 1000000),
    reward_points INTEGER NOT NULL CHECK (reward_points BETWEEN 0 AND 100000000),
    review_policy VARCHAR(20) NOT NULL CHECK (review_policy IN ('none', 'owner', 'admin')),
    decline_behavior VARCHAR(30) NOT NULL DEFAULT 'neutral'
        CHECK (decline_behavior IN ('neutral', 'reoffer_next_cycle', 'archive')),
    postpone_policy JSONB NOT NULL DEFAULT '{"allowed":true,"maxHours":168}'::JSONB CHECK (
        jsonb_typeof(postpone_policy) = 'object' AND octet_length(postpone_policy::TEXT) <= 2048
    ),
    expiry_behavior VARCHAR(30) NOT NULL DEFAULT 'expire_neutral'
        CHECK (expiry_behavior IN ('expire_neutral', 'archive_neutral')),
    unlock_hooks JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (
        jsonb_typeof(unlock_hooks) = 'object'
        AND octet_length(unlock_hooks::TEXT) <= 4096
        AND NOT (unlock_hooks ?| ARRAY['points', 'balance', 'gift', 'provider'])
    ),
    cooldown_hours INTEGER NOT NULL DEFAULT 0 CHECK (cooldown_hours BETWEEN 0 AND 8760),
    repeatable BOOLEAN NOT NULL DEFAULT FALSE,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    content_hash CHAR(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (definition_id, version),
    UNIQUE (content_hash),
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
    CHECK (lifecycle IN ('draft', 'validated') OR published_at IS NOT NULL),
    CHECK (safety_class <> 'wellbeing' OR reward_points = 0)
);

CREATE INDEX IF NOT EXISTS idx_quest_v2_versions_active
    ON quest_v2_versions(category, difficulty, starts_at, ends_at, id)
    WHERE lifecycle = 'active';

CREATE TABLE IF NOT EXISTS quest_v2_step_definitions (
    id BIGSERIAL PRIMARY KEY,
    version_id BIGINT NOT NULL REFERENCES quest_v2_versions(id) ON DELETE RESTRICT,
    step_key VARCHAR(80) NOT NULL CHECK (step_key ~ '^[a-z][a-z0-9_-]{1,79}$'),
    ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 100),
    title_zh VARCHAR(240) NOT NULL,
    title_en VARCHAR(240) NOT NULL,
    instructions_zh VARCHAR(1200) NOT NULL,
    instructions_en VARCHAR(1200) NOT NULL,
    evidence_kind VARCHAR(20) NOT NULL CHECK (evidence_kind IN ('none', 'text', 'checklist', 'png', 'trusted_event')),
    parallel_group INTEGER CHECK (parallel_group IS NULL OR parallel_group BETWEEN 1 AND 20),
    depends_on_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[] CHECK (cardinality(depends_on_keys) <= 12),
    completion_rule JSONB NOT NULL CHECK (
        jsonb_typeof(completion_rule) = 'object' AND octet_length(completion_rule::TEXT) <= 16384
    ),
    required BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (version_id, step_key),
    UNIQUE (version_id, ordinal)
);

CREATE TABLE IF NOT EXISTS quest_v2_boards (
    id BIGSERIAL PRIMARY KEY,
    slug VARCHAR(120) NOT NULL UNIQUE CHECK (slug ~ '^[a-z][a-z0-9-]{2,119}$'),
    title_zh VARCHAR(240) NOT NULL,
    title_en VARCHAR(240) NOT NULL,
    lifecycle VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (lifecycle IN ('draft', 'active', 'retired')),
    rotation_weeks INTEGER NOT NULL DEFAULT 1 CHECK (rotation_weeks BETWEEN 1 AND 52),
    content_hash CHAR(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quest_v2_board_slots (
    board_id BIGINT NOT NULL REFERENCES quest_v2_boards(id) ON DELETE RESTRICT,
    slot_number INTEGER NOT NULL CHECK (slot_number BETWEEN 1 AND 40),
    version_id BIGINT NOT NULL REFERENCES quest_v2_versions(id) ON DELETE RESTRICT,
    PRIMARY KEY (board_id, slot_number),
    UNIQUE (board_id, version_id)
);

CREATE TABLE IF NOT EXISTS quest_v2_chains (
    id BIGSERIAL PRIMARY KEY,
    slug VARCHAR(120) NOT NULL UNIQUE CHECK (slug ~ '^[a-z][a-z0-9-]{2,119}$'),
    title_zh VARCHAR(240) NOT NULL,
    title_en VARCHAR(240) NOT NULL,
    lifecycle VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (lifecycle IN ('draft', 'active', 'retired')),
    content_hash CHAR(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quest_v2_chain_nodes (
    chain_id BIGINT NOT NULL REFERENCES quest_v2_chains(id) ON DELETE RESTRICT,
    node_number INTEGER NOT NULL CHECK (node_number BETWEEN 1 AND 8),
    version_id BIGINT NOT NULL REFERENCES quest_v2_versions(id) ON DELETE RESTRICT,
    prerequisite_node INTEGER,
    PRIMARY KEY (chain_id, node_number),
    UNIQUE (chain_id, version_id),
    CHECK (prerequisite_node IS NULL OR prerequisite_node BETWEEN 1 AND node_number - 1)
);

CREATE TABLE IF NOT EXISTS quest_v2_schedules (
    id BIGSERIAL PRIMARY KEY,
    schedule_key VARCHAR(120) NOT NULL UNIQUE CHECK (schedule_key ~ '^[a-z][a-z0-9-]{2,119}$'),
    board_id BIGINT NOT NULL REFERENCES quest_v2_boards(id) ON DELETE RESTRICT,
    timezone VARCHAR(80) NOT NULL DEFAULT 'UTC',
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    lifecycle VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (lifecycle IN ('scheduled', 'active', 'finished', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_quest_v2_schedules_active
    ON quest_v2_schedules(starts_at, ends_at, id)
    WHERE lifecycle IN ('scheduled', 'active');

CREATE TABLE IF NOT EXISTS quest_v2_assignments (
    id BIGSERIAL PRIMARY KEY,
    assignment_key VARCHAR(180) NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    version_id BIGINT NOT NULL REFERENCES quest_v2_versions(id) ON DELETE RESTRICT,
    board_id BIGINT REFERENCES quest_v2_boards(id) ON DELETE RESTRICT,
    chain_id BIGINT REFERENCES quest_v2_chains(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'offered' CHECK (status IN (
        'offered', 'accepted', 'active', 'submitted', 'under_review', 'returned',
        'completed', 'declined', 'expired', 'cancelled'
    )),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    occurrence INTEGER NOT NULL CHECK (occurrence BETWEEN 1 AND 1000000),
    reward_policy_version INTEGER NOT NULL CHECK (reward_policy_version BETWEEN 1 AND 1000000),
    reward_points INTEGER NOT NULL CHECK (reward_points BETWEEN 0 AND 100000000),
    completion_rule JSONB NOT NULL CHECK (
        jsonb_typeof(completion_rule) = 'object' AND octet_length(completion_rule::TEXT) <= 32768
    ),
    assignment_source VARCHAR(30) NOT NULL CHECK (assignment_source IN ('board', 'chain', 'owner', 'legacy_import', 'system')),
    offered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    due_at TIMESTAMPTZ,
    postpone_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, version_id, occurrence),
    CHECK (due_at IS NULL OR due_at > offered_at),
    CHECK (postpone_until IS NULL OR postpone_until > offered_at),
    CHECK ((status <> 'completed') OR completed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_quest_v2_assignments_user_status
    ON quest_v2_assignments(user_id, status, offered_at DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_quest_v2_assignment_active_cycle
    ON quest_v2_assignments(user_id, version_id)
    WHERE status IN ('offered', 'accepted', 'active', 'submitted', 'under_review', 'returned');

CREATE TABLE IF NOT EXISTS quest_v2_assignment_steps (
    assignment_id BIGINT NOT NULL REFERENCES quest_v2_assignments(id) ON DELETE RESTRICT,
    step_definition_id BIGINT NOT NULL REFERENCES quest_v2_step_definitions(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('locked', 'active', 'submitted', 'completed', 'returned')),
    progress JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (
        jsonb_typeof(progress) = 'object' AND octet_length(progress::TEXT) <= 16384
    ),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (assignment_id, step_definition_id),
    CHECK (status <> 'completed' OR completed_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS quest_v2_trusted_events (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE,
    source_type VARCHAR(60) NOT NULL CHECK (source_type ~ '^[a-z][a-z0-9_.-]{1,59}$'),
    dedupe_key VARCHAR(180) NOT NULL,
    event_type VARCHAR(120) NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.-]{2,119}$'),
    schema_version INTEGER NOT NULL CHECK (schema_version = 1),
    actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    subject_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    occurred_at TIMESTAMPTZ NOT NULL,
    correlation_id UUID NOT NULL,
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::TEXT) <= 8192),
    processing_status VARCHAR(20) NOT NULL DEFAULT 'recorded' CHECK (processing_status IN ('recorded', 'processed', 'ignored')),
    result JSONB CHECK (result IS NULL OR (jsonb_typeof(result) = 'object' AND octet_length(result::TEXT) <= 32768)),
    processed_at TIMESTAMPTZ,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_type, dedupe_key),
    CHECK (
        (processing_status = 'recorded' AND result IS NULL AND processed_at IS NULL)
        OR (processing_status IN ('processed', 'ignored') AND result IS NOT NULL AND processed_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_quest_v2_trusted_events_subject_time
    ON quest_v2_trusted_events(subject_user_id, occurred_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS quest_v2_assignment_events (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE,
    assignment_id BIGINT NOT NULL REFERENCES quest_v2_assignments(id) ON DELETE RESTRICT,
    actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('creator', 'owner', 'admin', 'system', 'trusted_event')),
    actor_username TEXT,
    event_type VARCHAR(80) NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.-]{2,79}$'),
    from_status VARCHAR(20),
    to_status VARCHAR(20),
    dedupe_key VARCHAR(180) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::TEXT) <= 16384),
    request_id VARCHAR(180),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (assignment_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_quest_v2_assignment_events_history
    ON quest_v2_assignment_events(assignment_id, occurred_at, id);

CREATE TABLE IF NOT EXISTS quest_v2_evidence (
    id UUID PRIMARY KEY,
    assignment_id BIGINT NOT NULL REFERENCES quest_v2_assignments(id) ON DELETE RESTRICT,
    step_definition_id BIGINT NOT NULL REFERENCES quest_v2_step_definitions(id) ON DELETE RESTRICT,
    submitted_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    evidence_kind VARCHAR(20) NOT NULL CHECK (evidence_kind IN ('text', 'checklist', 'png')),
    content JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(content) = 'object' AND octet_length(content::TEXT) <= 16384),
    content_sha256 CHAR(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
    media_bytes BYTEA,
    media_type VARCHAR(40),
    byte_count INTEGER CHECK (byte_count IS NULL OR byte_count BETWEEN 1 AND 786432),
    width INTEGER CHECK (width IS NULL OR width BETWEEN 1 AND 1600),
    height INTEGER CHECK (height IS NULL OR height BETWEEN 1 AND 1600),
    sha256 CHAR(64) CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
    retention_until TIMESTAMPTZ NOT NULL,
    redacted_at TIMESTAMPTZ,
    redaction_reason VARCHAR(40) CHECK (redaction_reason IS NULL OR redaction_reason = 'retention_expired'),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (evidence_kind IN ('text', 'checklist') AND media_bytes IS NULL AND media_type IS NULL AND byte_count IS NULL AND width IS NULL AND height IS NULL AND sha256 IS NULL)
        OR (evidence_kind = 'png' AND media_type = 'image/png'
            AND byte_count IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL AND sha256 IS NOT NULL
            AND (
                (media_bytes IS NOT NULL AND byte_count = octet_length(media_bytes)
                    AND redacted_at IS NULL AND redaction_reason IS NULL)
                OR (media_bytes IS NULL AND redacted_at IS NOT NULL AND redaction_reason = 'retention_expired')
            ))
    )
);

CREATE INDEX IF NOT EXISTS idx_quest_v2_evidence_retention
    ON quest_v2_evidence(retention_until, id);

CREATE TABLE IF NOT EXISTS quest_v2_evidence_reviews (
    id BIGSERIAL PRIMARY KEY,
    evidence_id UUID NOT NULL REFERENCES quest_v2_evidence(id) ON DELETE RESTRICT,
    assignment_id BIGINT NOT NULL REFERENCES quest_v2_assignments(id) ON DELETE RESTRICT,
    reviewer_username TEXT NOT NULL REFERENCES users(username) ON DELETE RESTRICT,
    decision VARCHAR(20) NOT NULL CHECK (decision IN ('approved', 'returned', 'rejected')),
    note VARCHAR(1000) NOT NULL DEFAULT '',
    request_id VARCHAR(180),
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quest_v2_evidence_reviews_assignment
    ON quest_v2_evidence_reviews(assignment_id, reviewed_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS quest_v2_reward_settlements (
    settlement_key VARCHAR(180) PRIMARY KEY,
    assignment_id BIGINT NOT NULL UNIQUE REFERENCES quest_v2_assignments(id) ON DELETE RESTRICT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reward_policy_version INTEGER NOT NULL CHECK (reward_policy_version BETWEEN 1 AND 1000000),
    reward_points INTEGER NOT NULL CHECK (reward_points BETWEEN 0 AND 100000000),
    operation_type VARCHAR(80) NOT NULL DEFAULT 'quest_auto_reward' CHECK (operation_type = 'quest_auto_reward'),
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'posted', 'zero_value')),
    balance_before BIGINT,
    balance_after BIGINT,
    posted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (status = 'pending' AND reward_points > 0 AND balance_before IS NULL AND balance_after IS NULL AND posted_at IS NULL)
        OR (status = 'posted' AND reward_points > 0 AND balance_before IS NOT NULL AND balance_after IS NOT NULL AND posted_at IS NOT NULL)
        OR (status = 'zero_value' AND reward_points = 0 AND balance_before IS NULL AND balance_after IS NULL AND posted_at IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS quest_v2_audit_log (
    id BIGSERIAL PRIMARY KEY,
    assignment_id BIGINT REFERENCES quest_v2_assignments(id) ON DELETE RESTRICT,
    actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('creator', 'owner', 'admin', 'system', 'trusted_event')),
    actor_username TEXT,
    action VARCHAR(80) NOT NULL CHECK (action ~ '^[a-z][a-z0-9_.-]{2,79}$'),
    details JSONB NOT NULL CHECK (jsonb_typeof(details) = 'object' AND octet_length(details::TEXT) <= 16384),
    request_id VARCHAR(180),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quest_v2_audit_assignment
    ON quest_v2_audit_log(assignment_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS quest_v2_legacy_imports (
    id BIGSERIAL PRIMARY KEY,
    task_card_assignment_id BIGINT NOT NULL UNIQUE REFERENCES task_card_assignments(id) ON DELETE RESTRICT,
    quest_assignment_id BIGINT NOT NULL UNIQUE REFERENCES quest_v2_assignments(id) ON DELETE RESTRICT,
    imported_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    imported_status VARCHAR(30) NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION quest_v2_reject_append_only_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION quest_v2_protect_version()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'quest versions cannot be deleted'; END IF;
    IF OLD.lifecycle IN ('scheduled', 'active', 'retired') THEN
        IF (OLD.lifecycle = 'scheduled' AND NEW.lifecycle NOT IN ('active', 'retired'))
           OR (OLD.lifecycle = 'active' AND NEW.lifecycle <> 'retired')
           OR (OLD.lifecycle = 'retired')
           OR NEW.definition_id IS DISTINCT FROM OLD.definition_id
           OR NEW.version IS DISTINCT FROM OLD.version
           OR NEW.category IS DISTINCT FROM OLD.category
           OR NEW.tags IS DISTINCT FROM OLD.tags
           OR NEW.difficulty IS DISTINCT FROM OLD.difficulty
           OR NEW.estimated_minutes IS DISTINCT FROM OLD.estimated_minutes
           OR NEW.safety_class IS DISTINCT FROM OLD.safety_class
           OR NEW.title_zh IS DISTINCT FROM OLD.title_zh
           OR NEW.title_en IS DISTINCT FROM OLD.title_en
           OR NEW.description_zh IS DISTINCT FROM OLD.description_zh
           OR NEW.description_en IS DISTINCT FROM OLD.description_en
           OR NEW.hint_zh IS DISTINCT FROM OLD.hint_zh
           OR NEW.hint_en IS DISTINCT FROM OLD.hint_en
           OR NEW.completion_zh IS DISTINCT FROM OLD.completion_zh
           OR NEW.completion_en IS DISTINCT FROM OLD.completion_en
           OR NEW.verification_mode IS DISTINCT FROM OLD.verification_mode
           OR NEW.consent_category IS DISTINCT FROM OLD.consent_category
           OR NEW.eligibility_rule IS DISTINCT FROM OLD.eligibility_rule
           OR NEW.completion_rule IS DISTINCT FROM OLD.completion_rule
           OR NEW.reward_policy_version IS DISTINCT FROM OLD.reward_policy_version
           OR NEW.reward_points IS DISTINCT FROM OLD.reward_points
           OR NEW.review_policy IS DISTINCT FROM OLD.review_policy
           OR NEW.decline_behavior IS DISTINCT FROM OLD.decline_behavior
           OR NEW.postpone_policy IS DISTINCT FROM OLD.postpone_policy
           OR NEW.expiry_behavior IS DISTINCT FROM OLD.expiry_behavior
           OR NEW.unlock_hooks IS DISTINCT FROM OLD.unlock_hooks
           OR NEW.cooldown_hours IS DISTINCT FROM OLD.cooldown_hours
           OR NEW.repeatable IS DISTINCT FROM OLD.repeatable
           OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
           OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
           OR NEW.published_at IS DISTINCT FROM OLD.published_at
           OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
           OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'published quest version is immutable';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION quest_v2_protect_catalog_container()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION '% cannot be deleted', TG_TABLE_NAME; END IF;
    IF OLD.lifecycle = 'retired'
       OR (OLD.lifecycle = 'active' AND NEW.lifecycle <> 'retired')
       OR (OLD.lifecycle = 'draft' AND NEW.lifecycle NOT IN ('active', 'retired'))
       OR NEW.slug IS DISTINCT FROM OLD.slug
       OR NEW.title_zh IS DISTINCT FROM OLD.title_zh
       OR NEW.title_en IS DISTINCT FROM OLD.title_en
       OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'published quest catalog container is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION quest_v2_protect_schedule()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'quest schedules cannot be deleted'; END IF;
    IF OLD.lifecycle = 'finished' OR OLD.lifecycle = 'cancelled'
       OR (OLD.lifecycle = 'scheduled' AND NEW.lifecycle NOT IN ('active', 'cancelled'))
       OR (OLD.lifecycle = 'active' AND NEW.lifecycle NOT IN ('finished', 'cancelled'))
       OR NEW.schedule_key IS DISTINCT FROM OLD.schedule_key
       OR NEW.board_id IS DISTINCT FROM OLD.board_id
       OR NEW.timezone IS DISTINCT FROM OLD.timezone
       OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
       OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'quest schedule is immutable or lifecycle transition is invalid';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION quest_v2_protect_evidence_retention()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'quest evidence cannot be deleted'; END IF;
    IF OLD.redacted_at IS NOT NULL
       OR OLD.retention_until > NOW()
       OR NEW.content <> '{}'::JSONB
       OR NEW.media_bytes IS NOT NULL
       OR NEW.redacted_at IS NULL
       OR NEW.redaction_reason <> 'retention_expired'
       OR NEW.id IS DISTINCT FROM OLD.id
       OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id
       OR NEW.step_definition_id IS DISTINCT FROM OLD.step_definition_id
       OR NEW.submitted_by_user_id IS DISTINCT FROM OLD.submitted_by_user_id
       OR NEW.evidence_kind IS DISTINCT FROM OLD.evidence_kind
       OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
       OR NEW.media_type IS DISTINCT FROM OLD.media_type
       OR NEW.byte_count IS DISTINCT FROM OLD.byte_count
       OR NEW.width IS DISTINCT FROM OLD.width
       OR NEW.height IS DISTINCT FROM OLD.height
       OR NEW.sha256 IS DISTINCT FROM OLD.sha256
       OR NEW.retention_until IS DISTINCT FROM OLD.retention_until
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
        RAISE EXCEPTION 'quest evidence mutation is not an eligible retention redaction';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION quest_v2_protect_trusted_event()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'trusted quest events cannot be deleted'; END IF;
    IF OLD.processing_status <> 'recorded'
       OR NEW.event_id IS DISTINCT FROM OLD.event_id
       OR NEW.source_type IS DISTINCT FROM OLD.source_type
       OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
       OR NEW.event_type IS DISTINCT FROM OLD.event_type
       OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
       OR NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
       OR NEW.subject_user_id IS DISTINCT FROM OLD.subject_user_id
       OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
       OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
       OR NEW.payload IS DISTINCT FROM OLD.payload
       OR NEW.recorded_at IS DISTINCT FROM OLD.recorded_at
       OR NEW.processing_status NOT IN ('processed', 'ignored')
       OR NEW.result IS NULL OR NEW.processed_at IS NULL THEN
        RAISE EXCEPTION 'trusted quest event transition is invalid';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION quest_v2_protect_settlement()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'quest settlements cannot be deleted'; END IF;
    IF OLD.status <> 'pending'
       OR NEW.settlement_key IS DISTINCT FROM OLD.settlement_key
       OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.reward_policy_version IS DISTINCT FROM OLD.reward_policy_version
       OR NEW.reward_points IS DISTINCT FROM OLD.reward_points
       OR NEW.operation_type IS DISTINCT FROM OLD.operation_type
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.status <> 'posted'
       OR NEW.balance_before IS NULL OR NEW.balance_after IS NULL OR NEW.posted_at IS NULL THEN
        RAISE EXCEPTION 'quest settlement transition is invalid';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_quest_v2_definitions_append_only ON quest_v2_definitions;
CREATE TRIGGER trg_quest_v2_definitions_append_only BEFORE UPDATE OR DELETE ON quest_v2_definitions
FOR EACH ROW EXECUTE FUNCTION quest_v2_reject_append_only_mutation();

DROP TRIGGER IF EXISTS trg_quest_v2_protect_version ON quest_v2_versions;
CREATE TRIGGER trg_quest_v2_protect_version BEFORE UPDATE OR DELETE ON quest_v2_versions
FOR EACH ROW EXECUTE FUNCTION quest_v2_protect_version();

DROP TRIGGER IF EXISTS trg_quest_v2_steps_append_only ON quest_v2_step_definitions;
CREATE TRIGGER trg_quest_v2_steps_append_only BEFORE UPDATE OR DELETE ON quest_v2_step_definitions
FOR EACH ROW EXECUTE FUNCTION quest_v2_reject_append_only_mutation();

DROP TRIGGER IF EXISTS trg_quest_v2_boards_lifecycle ON quest_v2_boards;
CREATE TRIGGER trg_quest_v2_boards_lifecycle BEFORE UPDATE OR DELETE ON quest_v2_boards
FOR EACH ROW EXECUTE FUNCTION quest_v2_protect_catalog_container();

DROP TRIGGER IF EXISTS trg_quest_v2_board_slots_append_only ON quest_v2_board_slots;
CREATE TRIGGER trg_quest_v2_board_slots_append_only BEFORE UPDATE OR DELETE ON quest_v2_board_slots
FOR EACH ROW EXECUTE FUNCTION quest_v2_reject_append_only_mutation();

DROP TRIGGER IF EXISTS trg_quest_v2_chains_lifecycle ON quest_v2_chains;
CREATE TRIGGER trg_quest_v2_chains_lifecycle BEFORE UPDATE OR DELETE ON quest_v2_chains
FOR EACH ROW EXECUTE FUNCTION quest_v2_protect_catalog_container();

DROP TRIGGER IF EXISTS trg_quest_v2_chain_nodes_append_only ON quest_v2_chain_nodes;
CREATE TRIGGER trg_quest_v2_chain_nodes_append_only BEFORE UPDATE OR DELETE ON quest_v2_chain_nodes
FOR EACH ROW EXECUTE FUNCTION quest_v2_reject_append_only_mutation();

DROP TRIGGER IF EXISTS trg_quest_v2_schedules_lifecycle ON quest_v2_schedules;
CREATE TRIGGER trg_quest_v2_schedules_lifecycle BEFORE UPDATE OR DELETE ON quest_v2_schedules
FOR EACH ROW EXECUTE FUNCTION quest_v2_protect_schedule();

DROP TRIGGER IF EXISTS trg_quest_v2_trusted_event ON quest_v2_trusted_events;
CREATE TRIGGER trg_quest_v2_trusted_event BEFORE UPDATE OR DELETE ON quest_v2_trusted_events
FOR EACH ROW EXECUTE FUNCTION quest_v2_protect_trusted_event();

DROP TRIGGER IF EXISTS trg_quest_v2_assignment_events_append_only ON quest_v2_assignment_events;
CREATE TRIGGER trg_quest_v2_assignment_events_append_only BEFORE UPDATE OR DELETE ON quest_v2_assignment_events
FOR EACH ROW EXECUTE FUNCTION quest_v2_reject_append_only_mutation();

DROP TRIGGER IF EXISTS trg_quest_v2_evidence_retention ON quest_v2_evidence;
CREATE TRIGGER trg_quest_v2_evidence_retention BEFORE UPDATE OR DELETE ON quest_v2_evidence
FOR EACH ROW EXECUTE FUNCTION quest_v2_protect_evidence_retention();

DROP TRIGGER IF EXISTS trg_quest_v2_reviews_append_only ON quest_v2_evidence_reviews;
CREATE TRIGGER trg_quest_v2_reviews_append_only BEFORE UPDATE OR DELETE ON quest_v2_evidence_reviews
FOR EACH ROW EXECUTE FUNCTION quest_v2_reject_append_only_mutation();

DROP TRIGGER IF EXISTS trg_quest_v2_settlement ON quest_v2_reward_settlements;
CREATE TRIGGER trg_quest_v2_settlement BEFORE UPDATE OR DELETE ON quest_v2_reward_settlements
FOR EACH ROW EXECUTE FUNCTION quest_v2_protect_settlement();

DROP TRIGGER IF EXISTS trg_quest_v2_audit_append_only ON quest_v2_audit_log;
CREATE TRIGGER trg_quest_v2_audit_append_only BEFORE UPDATE OR DELETE ON quest_v2_audit_log
FOR EACH ROW EXECUTE FUNCTION quest_v2_reject_append_only_mutation();

DROP TRIGGER IF EXISTS trg_quest_v2_legacy_imports_append_only ON quest_v2_legacy_imports;
CREATE TRIGGER trg_quest_v2_legacy_imports_append_only BEFORE UPDATE OR DELETE ON quest_v2_legacy_imports
FOR EACH ROW EXECUTE FUNCTION quest_v2_reject_append_only_mutation();
