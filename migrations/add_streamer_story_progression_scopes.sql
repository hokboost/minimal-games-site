CREATE TABLE IF NOT EXISTS story_progression_bindings (
    binding_hash CHAR(64) PRIMARY KEY CHECK (binding_hash ~ '^[a-f0-9]{64}$'),
    content_version_id BIGINT NOT NULL REFERENCES story_content_versions(id) ON DELETE RESTRICT,
    node_id VARCHAR(120) NOT NULL CHECK (node_id ~ '^[a-z][a-z0-9_.-]{1,119}$'),
    unlock_type VARCHAR(40) NOT NULL CHECK (unlock_type IN (
        'quest', 'game', 'achievement', 'collection', 'reward_catalog_visibility'
    )),
    unlock_key VARCHAR(120) NOT NULL CHECK (unlock_key ~ '^[a-z][a-z0-9_.-]{1,119}$'),
    progression_scope VARCHAR(24) NOT NULL CHECK (progression_scope = 'account_entitlement'),
    provenance_type VARCHAR(32) NOT NULL CHECK (provenance_type IN (
        'episode_first_clear', 'season_completion'
    )),
    provenance_key VARCHAR(180) NOT NULL CHECK (provenance_key ~ '^[a-z][a-z0-9_.-]{1,179}$'),
    economic_eligible BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(content_version_id,node_id,unlock_type,unlock_key),
    CHECK (economic_eligible = FALSE OR unlock_type = 'reward_catalog_visibility')
);

CREATE OR REPLACE FUNCTION story_reject_progression_binding_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'published story progression binding is immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_story_progression_binding_immutable ON story_progression_bindings;
CREATE TRIGGER trg_story_progression_binding_immutable
BEFORE UPDATE OR DELETE ON story_progression_bindings
FOR EACH ROW EXECUTE FUNCTION story_reject_progression_binding_mutation();

ALTER TABLE story_unlock_intents
    ADD COLUMN IF NOT EXISTS progression_scope VARCHAR(24) NOT NULL DEFAULT 'branch_local',
    ADD COLUMN IF NOT EXISTS provenance_type VARCHAR(32) NOT NULL DEFAULT 'legacy_unverified',
    ADD COLUMN IF NOT EXISTS provenance_key VARCHAR(180),
    ADD COLUMN IF NOT EXISTS published_binding_hash CHAR(64),
    ADD COLUMN IF NOT EXISTS economic_eligible BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing rows predate branch-lineage semantics. Their original path cannot
-- be reconstructed safely. PostgreSQL fills the newly added NOT NULL columns
-- with their conservative branch-local, legacy, non-economic defaults.

ALTER TABLE story_unlock_intents
    DROP CONSTRAINT IF EXISTS story_unlock_intents_progression_scope_check,
    DROP CONSTRAINT IF EXISTS story_unlock_intents_provenance_type_check,
    DROP CONSTRAINT IF EXISTS story_unlock_intents_provenance_key_check,
    DROP CONSTRAINT IF EXISTS story_unlock_intents_published_binding_hash_check,
    DROP CONSTRAINT IF EXISTS story_unlock_intents_progression_consistency_check,
    DROP CONSTRAINT IF EXISTS story_unlock_intents_economic_type_check,
    DROP CONSTRAINT IF EXISTS story_unlock_intents_published_binding_fk;

ALTER TABLE story_unlock_intents
    ADD CONSTRAINT story_unlock_intents_progression_scope_check
        CHECK (progression_scope IN ('branch_local', 'account_entitlement')),
    ADD CONSTRAINT story_unlock_intents_provenance_type_check
        CHECK (provenance_type IN ('legacy_unverified', 'branch_effect', 'episode_first_clear', 'season_completion')),
    ADD CONSTRAINT story_unlock_intents_provenance_key_check
        CHECK (provenance_key IS NULL OR provenance_key ~ '^[a-z][a-z0-9_.-]{1,179}$'),
    ADD CONSTRAINT story_unlock_intents_published_binding_hash_check
        CHECK (published_binding_hash IS NULL OR published_binding_hash ~ '^[a-f0-9]{64}$'),
    ADD CONSTRAINT story_unlock_intents_progression_consistency_check CHECK (
        (progression_scope = 'account_entitlement'
            AND provenance_type IN ('episode_first_clear', 'season_completion')
            AND provenance_key IS NOT NULL
            AND published_binding_hash IS NOT NULL)
        OR
        (progression_scope = 'branch_local'
            AND provenance_type IN ('legacy_unverified', 'branch_effect')
            AND published_binding_hash IS NULL
            AND economic_eligible = FALSE)
    ),
    ADD CONSTRAINT story_unlock_intents_economic_type_check CHECK (
        economic_eligible = FALSE
        OR (progression_scope = 'account_entitlement'
            AND unlock_type = 'reward_catalog_visibility')
    ),
    ADD CONSTRAINT story_unlock_intents_published_binding_fk
        FOREIGN KEY(published_binding_hash)
        REFERENCES story_progression_bindings(binding_hash) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION story_validate_unlock_progression()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.progression_scope <> 'account_entitlement' THEN
        RETURN NEW;
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM story_progression_bindings binding
        WHERE binding.binding_hash = NEW.published_binding_hash
          AND binding.content_version_id = NEW.content_version_id
          AND binding.unlock_type = NEW.unlock_type
          AND binding.unlock_key = NEW.unlock_key
          AND binding.progression_scope = NEW.progression_scope
          AND binding.provenance_type = NEW.provenance_type
          AND binding.provenance_key = NEW.provenance_key
          AND binding.economic_eligible = NEW.economic_eligible
    ) THEN
        RAISE EXCEPTION 'story entitlement is absent from the published registry';
    END IF;
    IF NEW.provenance_type = 'episode_first_clear' THEN
        IF NOT EXISTS (
            SELECT 1
            FROM story_first_clears first_clear
            JOIN story_events source_event
              ON source_event.event_id = first_clear.source_event_id
             AND source_event.run_id = first_clear.run_id
            JOIN story_progression_bindings binding
              ON binding.binding_hash = NEW.published_binding_hash
            WHERE first_clear.user_id = NEW.user_id
              AND first_clear.content_version_id = NEW.content_version_id
              AND first_clear.episode_slug = NEW.provenance_key
              AND first_clear.source_event_id = NEW.source_event_id
              AND source_event.from_node_id = binding.node_id
        ) THEN
            RAISE EXCEPTION 'story entitlement requires matching first-clear provenance';
        END IF;
    ELSIF NEW.provenance_type = 'season_completion' THEN
        IF NOT EXISTS (
            SELECT 1
            FROM story_events source_event
            JOIN story_runs run ON run.id = source_event.run_id
            JOIN story_progression_bindings binding
              ON binding.binding_hash = NEW.published_binding_hash
            WHERE source_event.event_id = NEW.source_event_id
              AND run.user_id = NEW.user_id
              AND run.content_version_id = NEW.content_version_id
              AND run.status = 'completed'
              AND source_event.action = 'finish'
              AND source_event.from_node_id = binding.node_id
        ) THEN
            RAISE EXCEPTION 'story entitlement requires matching season completion provenance';
        END IF;
    ELSE
        RAISE EXCEPTION 'story entitlement provenance is not irreversible';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_story_unlock_progression_validation ON story_unlock_intents;
CREATE TRIGGER trg_story_unlock_progression_validation
BEFORE INSERT OR UPDATE ON story_unlock_intents
FOR EACH ROW EXECUTE FUNCTION story_validate_unlock_progression();

CREATE OR REPLACE FUNCTION story_protect_unlock_intent()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'story unlock intents cannot be deleted'; END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.content_version_id IS DISTINCT FROM OLD.content_version_id
       OR NEW.unlock_type IS DISTINCT FROM OLD.unlock_type
       OR NEW.unlock_key IS DISTINCT FROM OLD.unlock_key
       OR NEW.source_event_id IS DISTINCT FROM OLD.source_event_id
       OR NEW.progression_scope IS DISTINCT FROM OLD.progression_scope
       OR NEW.provenance_type IS DISTINCT FROM OLD.provenance_type
       OR NEW.provenance_key IS DISTINCT FROM OLD.provenance_key
       OR NEW.published_binding_hash IS DISTINCT FROM OLD.published_binding_hash
       OR NEW.economic_eligible IS DISTINCT FROM OLD.economic_eligible
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'story unlock provenance is immutable';
    END IF;
    IF NOT ((OLD.status = 'visible' AND NEW.status IN ('consumed', 'revoked'))
        OR OLD.status = NEW.status) THEN
        RAISE EXCEPTION 'invalid unlock lifecycle';
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_story_unlock_intent_protection ON story_unlock_intents;
CREATE TRIGGER trg_story_unlock_intent_protection
BEFORE UPDATE OR DELETE ON story_unlock_intents
FOR EACH ROW EXECUTE FUNCTION story_protect_unlock_intent();

CREATE INDEX IF NOT EXISTS idx_story_unlock_economic_entitlement
ON story_unlock_intents(user_id, unlock_type, unlock_key)
WHERE progression_scope = 'account_entitlement'
  AND economic_eligible = TRUE
  AND status IN ('visible', 'consumed');
