-- Forward-only Quest V2 security hardening.
-- Existing published versions default to exclusive per-occurrence event use.
ALTER TABLE quest_v2_versions
    ADD COLUMN IF NOT EXISTS allow_event_reuse BOOLEAN NOT NULL DEFAULT FALSE;

-- The redundant composite key lets the consumption ledger prove that its
-- denormalized user/version/occurrence identity belongs to the assignment.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'quest_v2_assignments'::regclass
          AND conname = 'uq_quest_v2_assignment_consumption_identity'
    ) THEN
        ALTER TABLE quest_v2_assignments
            ADD CONSTRAINT uq_quest_v2_assignment_consumption_identity
            UNIQUE (id, user_id, version_id, occurrence);
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS quest_v2_assignment_event_consumptions (
    assignment_id BIGINT NOT NULL,
    trusted_event_id BIGINT NOT NULL
        REFERENCES quest_v2_trusted_events(id) ON DELETE RESTRICT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    version_id BIGINT NOT NULL REFERENCES quest_v2_versions(id) ON DELETE RESTRICT,
    occurrence INTEGER NOT NULL CHECK (occurrence BETWEEN 1 AND 1000000),
    allow_event_reuse BOOLEAN NOT NULL DEFAULT FALSE,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (assignment_id, trusted_event_id),
    FOREIGN KEY (assignment_id, user_id, version_id, occurrence)
        REFERENCES quest_v2_assignments(id, user_id, version_id, occurrence)
        ON DELETE RESTRICT
);

-- Unless an immutable quest version opts in, one source event can belong to
-- only one occurrence of that version for that creator.
CREATE UNIQUE INDEX IF NOT EXISTS uq_quest_v2_consumption_exclusive_occurrence
    ON quest_v2_assignment_event_consumptions(user_id, version_id, trusted_event_id)
    WHERE allow_event_reuse = FALSE;

CREATE INDEX IF NOT EXISTS idx_quest_v2_consumption_assignment_time
    ON quest_v2_assignment_event_consumptions(assignment_id, consumed_at, trusted_event_id);

-- Conservative historical backfill. Every event inside an authoritative
-- assignment window is attributed to the earliest matching occurrence. This
-- prevents historical/future-skewed rows from being recycled after upgrade.
WITH eligible AS (
    SELECT DISTINCT ON (assignment.user_id, assignment.version_id, event.id)
           assignment.id AS assignment_id,
           event.id AS trusted_event_id,
           assignment.user_id,
           assignment.version_id,
           assignment.occurrence,
           version.allow_event_reuse
    FROM quest_v2_assignments assignment
    JOIN quest_v2_versions version ON version.id = assignment.version_id
    JOIN quest_v2_trusted_events event
      ON event.subject_user_id = assignment.user_id
     AND assignment.accepted_at IS NOT NULL
     AND event.occurred_at >= assignment.accepted_at
     AND (assignment.due_at IS NULL OR event.occurred_at <= assignment.due_at)
     AND (assignment.completed_at IS NULL OR event.occurred_at < assignment.completed_at)
     AND (assignment.resolved_at IS NULL OR event.occurred_at < assignment.resolved_at)
    ORDER BY assignment.user_id, assignment.version_id, event.id,
             assignment.occurrence, assignment.id
)
INSERT INTO quest_v2_assignment_event_consumptions (
    assignment_id, trusted_event_id, user_id, version_id,
    occurrence, allow_event_reuse
)
SELECT assignment_id, trusted_event_id, user_id, version_id,
       occurrence, allow_event_reuse
FROM eligible
ON CONFLICT DO NOTHING;

-- Extend the already-published version immutability guard to the new policy.
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
           OR NEW.allow_event_reuse IS DISTINCT FROM OLD.allow_event_reuse
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

CREATE OR REPLACE FUNCTION quest_v2_validate_event_consumption()
RETURNS TRIGGER AS $$
DECLARE
    expected_reuse BOOLEAN;
BEGIN
    SELECT allow_event_reuse INTO expected_reuse
    FROM quest_v2_versions WHERE id = NEW.version_id;
    IF expected_reuse IS NULL OR NEW.allow_event_reuse IS DISTINCT FROM expected_reuse THEN
        RAISE EXCEPTION 'quest event consumption reuse policy mismatch';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_quest_v2_consumption_policy
    ON quest_v2_assignment_event_consumptions;
CREATE TRIGGER trg_quest_v2_consumption_policy
BEFORE INSERT ON quest_v2_assignment_event_consumptions
FOR EACH ROW EXECUTE FUNCTION quest_v2_validate_event_consumption();

DROP TRIGGER IF EXISTS trg_quest_v2_consumptions_append_only
    ON quest_v2_assignment_event_consumptions;
CREATE TRIGGER trg_quest_v2_consumptions_append_only
BEFORE UPDATE OR DELETE ON quest_v2_assignment_event_consumptions
FOR EACH ROW EXECUTE FUNCTION quest_v2_reject_append_only_mutation();
