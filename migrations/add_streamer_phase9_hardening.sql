BEGIN;

-- Bounded creator inbox reads: active items first, then a stable cursor.
CREATE INDEX IF NOT EXISTS creator_inbox_user_archive_time_idx
    ON creator_inbox_messages(user_id, archived_at, sent_at DESC, id DESC);

-- Assignment journal pages filter by active lifecycle and use a stable time/id order.
CREATE INDEX IF NOT EXISTS quest_v2_assignments_user_updated_cursor_idx
    ON quest_v2_assignments(user_id, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS quest_v2_assignments_review_cursor_idx
    ON quest_v2_assignments(status, submitted_at ASC, id ASC)
    WHERE status IN ('submitted', 'under_review');

-- Story recovery and season archive reads bind to user, campaign, version, and status.
CREATE INDEX IF NOT EXISTS story_runs_user_campaign_version_cursor_idx
    ON story_runs(user_id, campaign_id, content_version_id, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS story_runs_active_recovery_idx
    ON story_runs(user_id, updated_at DESC, id DESC)
    WHERE status = 'active';

-- Live catch-up already uses interaction/sequence; this covers item inbox filtering.
CREATE INDEX IF NOT EXISTS live_interaction_items_room_status_cursor_idx
    ON live_interaction_items(interaction_id, status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS live_interaction_reports_status_cursor_idx
    ON live_interaction_reports(status, created_at DESC, id DESC);

-- Reward history and approval queues use deterministic cursor columns.
CREATE INDEX IF NOT EXISTS reward_orders_user_status_cursor_idx
    ON reward_orders(user_id, status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS reward_orders_pending_review_cursor_idx
    ON reward_orders(created_at ASC, id ASC)
    WHERE status = 'pending_approval';

-- Achievement projection and immutable source replay remain user scoped.
CREATE INDEX IF NOT EXISTS streamer_achievement_progress_user_unlock_cursor_idx
    ON streamer_achievement_progress(user_id, unlocked_at DESC, achievement_id DESC);

CREATE INDEX IF NOT EXISTS streamer_collection_holdings_user_acquired_cursor_idx
    ON streamer_collection_holdings(user_id, acquired_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS streamer_season_archives_user_created_cursor_idx
    ON streamer_season_archives(user_id, created_at DESC, id DESC);

COMMIT;
