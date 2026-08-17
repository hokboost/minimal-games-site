-- Streamer World P1: authoritative communication boundaries and independent privacy review.
-- Forward-only: historical reports and immutable events are not rewritten.
-- Sensitive reads are recorded in a separate append-only audit relation.

ALTER TABLE live_interaction_events
    DROP CONSTRAINT IF EXISTS live_interaction_events_actor_type_check;
ALTER TABLE live_interaction_events
    ADD CONSTRAINT live_interaction_events_actor_type_check
    CHECK (actor_type IN ('owner', 'creator', 'moderator', 'system'));

ALTER TABLE live_interaction_audit_log
    DROP CONSTRAINT IF EXISTS live_interaction_audit_log_actor_type_check;
ALTER TABLE live_interaction_audit_log
    ADD CONSTRAINT live_interaction_audit_log_actor_type_check
    CHECK (actor_type IN ('owner', 'creator', 'moderator', 'system'));

CREATE TABLE IF NOT EXISTS creator_sensitive_read_audit (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    actor_username TEXT NOT NULL,
    target_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    interaction_id BIGINT REFERENCES live_interactions(id) ON DELETE RESTRICT,
    report_id BIGINT REFERENCES live_interaction_reports(id) ON DELETE RESTRICT,
    access_kind VARCHAR(40) NOT NULL CHECK (access_kind IN (
        'owner_profile', 'moderation_evidence'
    )),
    decision VARCHAR(16) NOT NULL CHECK (decision IN ('granted', 'redacted', 'denied')),
    fields TEXT[] NOT NULL DEFAULT '{}'::TEXT[] CHECK (cardinality(fields) <= 24),
    request_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (
        jsonb_typeof(metadata) = 'object' AND octet_length(metadata::TEXT) <= 4096
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (access_kind = 'owner_profile' AND target_user_id IS NOT NULL
            AND interaction_id IS NULL AND report_id IS NULL)
        OR
        (access_kind = 'moderation_evidence' AND interaction_id IS NOT NULL
            AND report_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS creator_sensitive_read_actor_idx
    ON creator_sensitive_read_audit(actor_user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS creator_sensitive_read_target_idx
    ON creator_sensitive_read_audit(target_user_id, created_at DESC, id DESC)
    WHERE target_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS creator_sensitive_read_report_idx
    ON creator_sensitive_read_audit(report_id, created_at DESC, id DESC)
    WHERE report_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_creator_sensitive_read_append_only
    ON creator_sensitive_read_audit;
CREATE TRIGGER trg_creator_sensitive_read_append_only
BEFORE UPDATE OR DELETE ON creator_sensitive_read_audit
FOR EACH ROW EXECUTE FUNCTION live_interaction_reject_append_only_mutation();

CREATE OR REPLACE FUNCTION enforce_independent_live_report_moderator()
RETURNS TRIGGER AS $$
DECLARE
    configured_owner_id INTEGER;
    reviewer_is_admin BOOLEAN;
BEGIN
    IF OLD.status NOT IN ('resolved', 'dismissed')
       AND NEW.status IN ('resolved', 'dismissed')
       AND NEW.reason_code IN ('unsafe_task', 'privacy', 'harassment') THEN
        SELECT room.owner_user_id INTO configured_owner_id
        FROM live_interactions room WHERE room.id = NEW.interaction_id;
        SELECT account.is_admin = TRUE
               AND account.authorized = TRUE
               AND account.deactivated = FALSE
               AND COALESCE(account.account_locked, FALSE) = FALSE
        INTO reviewer_is_admin
        FROM users account WHERE account.id = NEW.reviewer_user_id;
        IF NEW.reviewer_user_id IS NULL
           OR NEW.reviewer_user_id = configured_owner_id
           OR reviewer_is_admin IS DISTINCT FROM TRUE THEN
            RAISE EXCEPTION 'sensitive owner report requires an independent active moderator';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_live_report_independent_moderator
    ON live_interaction_reports;
CREATE TRIGGER trg_live_report_independent_moderator
BEFORE UPDATE ON live_interaction_reports
FOR EACH ROW EXECUTE FUNCTION enforce_independent_live_report_moderator();
