-- Streamer World security remediation: durable live audience ACL and conservative backfill.
-- Historical migrations are immutable. Unknown historical semantics stay system-only.

ALTER TABLE live_interaction_events
    ADD COLUMN audience VARCHAR(16) NOT NULL DEFAULT 'system';

-- The Phase 4 append-only trigger predates the audience column. The migrator owns
-- this one bounded provenance backfill; runtime roles cannot disable this trigger.
ALTER TABLE live_interaction_events DISABLE TRIGGER trg_live_events_append_only;

UPDATE live_interaction_events
SET audience = CASE
    WHEN event_type IN (
        'interaction.opened',
        'interaction.nudge',
        'interaction.clue',
        'interaction.celebration',
        'interaction.story_letter',
        'interaction.quest_invite',
        'interaction.poll_opened',
        'interaction.poll_voted',
        'interaction.game_invite',
        'interaction.story_intervention',
        'interaction.item_accepted',
        'interaction.item_declined',
        'interaction.availability_changed',
        'interaction.muted',
        'interaction.left',
        'interaction.item_expired',
        'interaction.game_state_changed'
    ) THEN 'both'
    WHEN event_type IN (
        'interaction.reported',
        'interaction.report_resolved',
        'interaction.reconsented'
    ) THEN 'creator'
    ELSE 'system'
END;

ALTER TABLE live_interaction_events ENABLE TRIGGER trg_live_events_append_only;
ALTER TABLE live_interaction_events ALTER COLUMN audience DROP DEFAULT;
ALTER TABLE live_interaction_events
    ADD CONSTRAINT live_interaction_events_audience_check
    CHECK (audience IN ('owner', 'creator', 'both', 'system'));

CREATE INDEX live_interaction_events_acl_replay_idx
    ON live_interaction_events(interaction_id, audience, sequence, id);

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
    IF OLD.member_status = 'left' AND (
        NEW.member_status <> 'left'
        OR NEW.left_at IS DISTINCT FROM OLD.left_at
    ) THEN
        RAISE EXCEPTION 'inactive live membership is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add a durable reason while retaining the established abandoned terminal state.
ALTER TABLE streamer_game_runs
    ADD COLUMN consent_revoked_reason VARCHAR(48),
    ADD COLUMN consent_revoked_at TIMESTAMPTZ,
    ADD CONSTRAINT streamer_game_runs_consent_revocation_check CHECK (
        (consent_revoked_reason IS NULL AND consent_revoked_at IS NULL)
        OR (
            mode = 'coop'
            AND status = 'abandoned'
            AND consent_revoked_reason IN (
                'live_room_inactive', 'membership_inactive', 'global_opt_out',
                'unresolved_report', 'room_muted', 'communication_blocked',
                'game_preference_blocked', 'creator_account_inactive',
                'owner_account_inactive', 'owner_role_invalid', 'participant_left',
                'account_deactivated', 'account_locked'
            )
            AND consent_revoked_at IS NOT NULL
        )
    );

CREATE INDEX streamer_game_runs_active_coop_consent_idx
    ON streamer_game_runs(live_interaction_id, creator_user_id, game_id, id)
    WHERE mode = 'coop' AND status = 'active';

-- Trusted game-event replay previously assumed every canonical response was HTTP 200.
-- Persist status so a consent-revoked response is replayed byte-for-byte and status-for-status.
ALTER TABLE streamer_game_trusted_events
    ADD COLUMN response_status SMALLINT NOT NULL DEFAULT 200
    CHECK (response_status BETWEEN 100 AND 599);
ALTER TABLE streamer_game_trusted_events ALTER COLUMN response_status DROP DEFAULT;
