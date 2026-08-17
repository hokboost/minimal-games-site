-- Forward-only Quest V2 lifecycle, dependency, review, and recurring-board hardening.

ALTER TABLE quest_v2_assignments
    ADD COLUMN IF NOT EXISTS postponed_hours INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_postponed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

ALTER TABLE quest_v2_assignments
    DROP CONSTRAINT IF EXISTS quest_v2_assignments_postponed_hours_check;
ALTER TABLE quest_v2_assignments
    ADD CONSTRAINT quest_v2_assignments_postponed_hours_check
    CHECK (postponed_hours BETWEEN 0 AND 8760) NOT VALID;
ALTER TABLE quest_v2_assignments
    VALIDATE CONSTRAINT quest_v2_assignments_postponed_hours_check;

ALTER TABLE quest_v2_assignments
    DROP CONSTRAINT IF EXISTS quest_v2_assignments_status_check;
ALTER TABLE quest_v2_assignments
    ADD CONSTRAINT quest_v2_assignments_status_check CHECK (status IN (
        'offered', 'accepted', 'active', 'submitted', 'under_review', 'returned',
        'completed', 'declined', 'rejected', 'expired', 'cancelled'
    )) NOT VALID;
ALTER TABLE quest_v2_assignments
    VALIDATE CONSTRAINT quest_v2_assignments_status_check;

ALTER TABLE quest_v2_assignments
    DROP CONSTRAINT IF EXISTS quest_v2_assignment_terminal_timestamps;
ALTER TABLE quest_v2_assignments
    ADD CONSTRAINT quest_v2_assignment_terminal_timestamps CHECK (
        (status <> 'expired' OR (expired_at IS NOT NULL AND resolved_at IS NOT NULL))
        AND (status <> 'rejected' OR (rejected_at IS NOT NULL AND resolved_at IS NOT NULL))
    ) NOT VALID;
ALTER TABLE quest_v2_assignments
    VALIDATE CONSTRAINT quest_v2_assignment_terminal_timestamps;

ALTER TABLE quest_v2_assignment_steps
    DROP CONSTRAINT IF EXISTS quest_v2_assignment_steps_status_check;
ALTER TABLE quest_v2_assignment_steps
    ADD CONSTRAINT quest_v2_assignment_steps_status_check
    CHECK (status IN ('locked', 'active', 'submitted', 'completed', 'returned', 'rejected'))
    NOT VALID;
ALTER TABLE quest_v2_assignment_steps
    VALIDATE CONSTRAINT quest_v2_assignment_steps_status_check;

CREATE INDEX IF NOT EXISTS idx_quest_v2_assignments_expiry_worker
    ON quest_v2_assignments(due_at, id)
    WHERE status IN ('offered', 'accepted', 'active', 'returned');

ALTER TABLE quest_v2_schedules
    ADD COLUMN IF NOT EXISTS rotation_week_start DATE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quest_v2_schedule_timezone_week
    ON quest_v2_schedules(timezone, rotation_week_start)
    WHERE rotation_week_start IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quest_v2_schedule_rotation_horizon
    ON quest_v2_schedules(timezone, rotation_week_start, lifecycle)
    WHERE rotation_week_start IS NOT NULL;

-- A version cannot be published with dangling dependency keys, a dependency
-- cycle, or a verification/review combination that runtime cannot execute.
-- Keep the assertion callable so this forward migration can validate every
-- catalog version that was already published before the trigger existed.
CREATE OR REPLACE FUNCTION quest_v2_assert_publish_graph(
    checked_version_id BIGINT,
    checked_verification_mode TEXT,
    checked_review_policy TEXT,
    checked_safety_class TEXT
)
RETURNS VOID AS $$
DECLARE
    required_steps INTEGER;
    trusted_steps INTEGER;
    reviewed_steps INTEGER;
BEGIN
    -- Legacy imports are immutable read-only assignment snapshots. They are
    -- never offered or published through the catalog and intentionally keep
    -- their original no-review bridge semantics.
    IF EXISTS (
        SELECT 1
        FROM quest_v2_versions version
        JOIN quest_v2_definitions definition ON definition.id = version.definition_id
        WHERE version.id = checked_version_id
          AND definition.source = 'legacy_import'
    ) THEN
        RETURN;
    END IF;

    SELECT COUNT(*) FILTER (WHERE required),
           COUNT(*) FILTER (WHERE required AND evidence_kind = 'trusted_event'),
           COUNT(*) FILTER (WHERE required AND evidence_kind <> 'trusted_event')
      INTO required_steps, trusted_steps, reviewed_steps
    FROM quest_v2_step_definitions
    WHERE version_id = checked_version_id;

    IF required_steps = 0 THEN
        RAISE EXCEPTION 'published quest requires at least one required step';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM quest_v2_step_definitions step
        CROSS JOIN LATERAL unnest(step.depends_on_keys) dependency(step_key)
        LEFT JOIN quest_v2_step_definitions target
          ON target.version_id = step.version_id
         AND target.step_key = dependency.step_key
        WHERE step.version_id = checked_version_id AND target.id IS NULL
    ) THEN
        RAISE EXCEPTION 'quest step dependency key does not exist';
    END IF;

    IF EXISTS (
        WITH RECURSIVE dependency_path(step_key, dependency_key) AS (
            SELECT step.step_key, dependency.step_key
            FROM quest_v2_step_definitions step
            CROSS JOIN LATERAL unnest(step.depends_on_keys) dependency(step_key)
            WHERE step.version_id = checked_version_id
            UNION
            SELECT path.step_key, dependency.step_key
            FROM dependency_path path
            JOIN quest_v2_step_definitions next_step
              ON next_step.version_id = checked_version_id
             AND next_step.step_key = path.dependency_key
            CROSS JOIN LATERAL unnest(next_step.depends_on_keys) dependency(step_key)
        )
        SELECT 1 FROM dependency_path WHERE step_key = dependency_key
    ) THEN
        RAISE EXCEPTION 'quest step dependency graph contains a cycle';
    END IF;

    IF checked_verification_mode = 'automatic'
       AND (checked_review_policy <> 'none' OR trusted_steps <> required_steps) THEN
        RAISE EXCEPTION 'automatic quests require trusted steps and no human review';
    ELSIF checked_verification_mode = 'manual'
       AND (checked_review_policy NOT IN ('owner', 'admin') OR trusted_steps <> 0) THEN
        RAISE EXCEPTION 'manual quests require human review and non-trusted steps';
    ELSIF checked_verification_mode = 'hybrid'
       AND (checked_review_policy NOT IN ('owner', 'admin')
            OR trusted_steps = 0 OR reviewed_steps = 0) THEN
        RAISE EXCEPTION 'hybrid quests require trusted and reviewed steps';
    END IF;

    IF checked_safety_class = 'sensitive'
       AND checked_verification_mode <> 'automatic'
       AND checked_review_policy <> 'admin' THEN
        RAISE EXCEPTION 'sensitive evidence quests require independent admin review';
    END IF;

    RETURN;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION quest_v2_validate_publish_graph()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.lifecycle NOT IN ('scheduled', 'active')
       OR OLD.lifecycle NOT IN ('draft', 'validated') THEN
        RETURN NEW;
    END IF;

    PERFORM quest_v2_assert_publish_graph(
        NEW.id, NEW.verification_mode, NEW.review_policy, NEW.safety_class
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_quest_v2_validate_publish_graph ON quest_v2_versions;
CREATE TRIGGER trg_quest_v2_validate_publish_graph
BEFORE UPDATE OF lifecycle ON quest_v2_versions
FOR EACH ROW EXECUTE FUNCTION quest_v2_validate_publish_graph();

DO $$
DECLARE
    published RECORD;
BEGIN
    FOR published IN
        SELECT id, verification_mode, review_policy, safety_class
        FROM quest_v2_versions
        WHERE lifecycle IN ('scheduled', 'active')
        ORDER BY id
    LOOP
        PERFORM quest_v2_assert_publish_graph(
            published.id,
            published.verification_mode,
            published.review_policy,
            published.safety_class
        );
    END LOOP;
END;
$$;

-- Extend schedule immutability to the stable local-week identity introduced by
-- the rolling materializer. Lifecycle transitions remain one-way.
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
       OR NEW.rotation_week_start IS DISTINCT FROM OLD.rotation_week_start
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'quest schedule is immutable or lifecycle transition is invalid';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
