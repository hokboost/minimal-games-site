BEGIN;

CREATE TABLE reward_catalog_items (
    id BIGSERIAL PRIMARY KEY,
    slug VARCHAR(120) NOT NULL UNIQUE CHECK (slug ~ '^[a-z][a-z0-9._-]{1,119}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE reward_catalog_versions (
    id BIGSERIAL PRIMARY KEY,
    item_id BIGINT NOT NULL REFERENCES reward_catalog_items(id) ON DELETE RESTRICT,
    catalog_version VARCHAR(120) NOT NULL CHECK (catalog_version ~ '^[a-z][a-z0-9._-]{1,119}$'),
    version INTEGER NOT NULL CHECK (version BETWEEN 1 AND 10000),
    content_hash CHAR(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
    kind VARCHAR(24) NOT NULL CHECK (kind IN ('provider_gift','cosmetic','story_key')),
    title_zh VARCHAR(160) NOT NULL,
    title_en VARCHAR(160) NOT NULL,
    description_zh VARCHAR(1000) NOT NULL,
    description_en VARCHAR(1000) NOT NULL,
    art_key VARCHAR(80) NOT NULL CHECK (art_key ~ '^[a-z][a-z0-9._-]{1,79}$'),
    points_price BIGINT NOT NULL CHECK (points_price BETWEEN 0 AND 100000000),
    exposure_value BIGINT NOT NULL CHECK (exposure_value BETWEEN 0 AND 100000000),
    provider_gift_type VARCHAR(50),
    stock_limit INTEGER NOT NULL CHECK (stock_limit BETWEEN 1 AND 1000000),
    per_user_limit INTEGER NOT NULL CHECK (per_user_limit BETWEEN 1 AND 1000),
    cooldown_hours INTEGER NOT NULL CHECK (cooldown_hours BETWEEN 0 AND 87600),
    approval_policy VARCHAR(16) NOT NULL CHECK (approval_policy IN ('automatic','manual')),
    visibility_type VARCHAR(24) NOT NULL CHECK (visibility_type IN ('open','owner_only','story_unlock','achievement_unlock','season_window')),
    visibility_key VARCHAR(120),
    visibility_start TIMESTAMPTZ,
    visibility_end TIMESTAMPTZ,
    owner_grant_only BOOLEAN NOT NULL DEFAULT FALSE,
    lifecycle VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (lifecycle IN ('active','retired')),
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    retired_at TIMESTAMPTZ,
    UNIQUE(item_id,version),
    UNIQUE(catalog_version,item_id),
    CHECK ((kind='provider_gift' AND provider_gift_type IS NOT NULL)
        OR (kind<>'provider_gift' AND provider_gift_type IS NULL AND exposure_value=0)),
    CHECK ((visibility_type IN ('story_unlock','achievement_unlock') AND visibility_key IS NOT NULL
            AND visibility_start IS NULL AND visibility_end IS NULL)
        OR (visibility_type='season_window' AND visibility_key IS NULL AND visibility_start IS NOT NULL
            AND visibility_end IS NOT NULL AND visibility_start<visibility_end)
        OR (visibility_type IN ('open','owner_only') AND visibility_key IS NULL
            AND visibility_start IS NULL AND visibility_end IS NULL)),
    CHECK ((lifecycle='active' AND retired_at IS NULL) OR (lifecycle='retired' AND retired_at IS NOT NULL))
);
CREATE UNIQUE INDEX reward_catalog_one_active_version_idx ON reward_catalog_versions(item_id) WHERE lifecycle='active';

CREATE TABLE reward_catalog_budgets (
    id BIGSERIAL PRIMARY KEY,
    budget_key VARCHAR(120) NOT NULL UNIQUE CHECK (budget_key ~ '^[a-z][a-z0-9._-]{1,119}$'),
    scope VARCHAR(16) NOT NULL CHECK (scope IN ('global','feature','user')),
    daily_limit BIGINT NOT NULL CHECK (daily_limit BETWEEN 1 AND 100000000),
    lifecycle VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (lifecycle IN ('active','retired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    retired_at TIMESTAMPTZ,
    CHECK ((lifecycle='active' AND retired_at IS NULL) OR (lifecycle='retired' AND retired_at IS NOT NULL))
);

CREATE TABLE reward_budget_counters (
    budget_id BIGINT NOT NULL REFERENCES reward_catalog_budgets(id) ON DELETE RESTRICT,
    period_start DATE NOT NULL,
    subject_user_id INTEGER NOT NULL DEFAULT 0 CHECK (subject_user_id >= 0),
    used_amount BIGINT NOT NULL DEFAULT 0 CHECK (used_amount BETWEEN 0 AND 100000000),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 1000000),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(budget_id,period_start,subject_user_id)
);

CREATE TABLE reward_orders (
    id UUID PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    catalog_version_id BIGINT NOT NULL REFERENCES reward_catalog_versions(id) ON DELETE RESTRICT,
    source_type VARCHAR(24) NOT NULL CHECK (source_type IN ('direct_redemption','owner_grant','quest','story','game','achievement','season')),
    source_key VARCHAR(160) NOT NULL CHECK (source_key ~ '^[A-Za-z0-9:_.-]{8,160}$'),
    grant_template_key VARCHAR(80),
    created_by_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(24) NOT NULL CHECK (status IN ('submitted','pending_approval','approved','rejected','claimed','cancelled','revoked')),
    points_cost BIGINT NOT NULL CHECK (points_cost BETWEEN 0 AND 100000000),
    exposure_value BIGINT NOT NULL CHECK (exposure_value BETWEEN 0 AND 100000000),
    semantic_hash CHAR(64) NOT NULL CHECK (semantic_hash ~ '^[0-9a-f]{64}$'),
    notification_policy VARCHAR(24) NOT NULL DEFAULT 'normal' CHECK (notification_policy IN ('normal','quiet_suppressed','muted_suppressed')),
    reviewer_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    claimed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id,source_type,source_key),
    CHECK ((status='approved' AND approved_at IS NOT NULL)
        OR status<>'approved'),
    CHECK ((status='rejected' AND rejected_at IS NOT NULL)
        OR status<>'rejected'),
    CHECK ((status='claimed' AND claimed_at IS NOT NULL AND approved_at IS NOT NULL)
        OR status<>'claimed'),
    CHECK ((status='cancelled' AND cancelled_at IS NOT NULL)
        OR status<>'cancelled'),
    CHECK ((status='revoked' AND revoked_at IS NOT NULL AND points_cost=0)
        OR status<>'revoked'),
    CHECK ((status IN ('submitted','pending_approval') AND reviewer_user_id IS NULL AND approved_at IS NULL
            AND rejected_at IS NULL AND claimed_at IS NULL AND cancelled_at IS NULL AND revoked_at IS NULL)
        OR (status='approved' AND approved_at IS NOT NULL AND rejected_at IS NULL AND claimed_at IS NULL
            AND cancelled_at IS NULL AND revoked_at IS NULL)
        OR (status='rejected' AND reviewer_user_id IS NOT NULL AND approved_at IS NULL AND rejected_at IS NOT NULL
            AND claimed_at IS NULL AND cancelled_at IS NULL AND revoked_at IS NULL)
        OR (status='claimed' AND approved_at IS NOT NULL AND rejected_at IS NULL AND claimed_at IS NOT NULL
            AND cancelled_at IS NULL AND revoked_at IS NULL)
        OR (status='cancelled' AND approved_at IS NULL AND rejected_at IS NULL AND claimed_at IS NULL
            AND cancelled_at IS NOT NULL AND revoked_at IS NULL)
        OR (status='revoked' AND rejected_at IS NULL AND claimed_at IS NULL AND cancelled_at IS NULL
            AND revoked_at IS NOT NULL))
);
CREATE INDEX reward_orders_user_history_idx ON reward_orders(user_id,created_at DESC,id);
CREATE INDEX reward_orders_review_idx ON reward_orders(status,created_at) WHERE status='pending_approval';
CREATE INDEX reward_orders_catalog_usage_idx ON reward_orders(catalog_version_id,status,created_at DESC);
CREATE UNIQUE INDEX reward_orders_one_pending_item_idx ON reward_orders(user_id,catalog_version_id)
    WHERE status IN ('submitted','pending_approval');

CREATE TABLE reward_inventory_grants (
    id BIGSERIAL PRIMARY KEY,
    order_id UUID NOT NULL UNIQUE REFERENCES reward_orders(id) ON DELETE RESTRICT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(16) NOT NULL CHECK (status IN ('available','claimed','revoked')),
    wish_inventory_id INTEGER UNIQUE REFERENCES wish_inventory(id) ON DELETE RESTRICT,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    CHECK ((status='available' AND claimed_at IS NULL AND revoked_at IS NULL AND wish_inventory_id IS NULL)
        OR (status='claimed' AND claimed_at IS NOT NULL AND revoked_at IS NULL AND wish_inventory_id IS NOT NULL)
        OR (status='revoked' AND revoked_at IS NOT NULL AND claimed_at IS NULL AND wish_inventory_id IS NULL))
);

CREATE TABLE reward_user_assets (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    asset_type VARCHAR(24) NOT NULL CHECK (asset_type IN ('cosmetic','story_key')),
    asset_key VARCHAR(120) NOT NULL CHECK (asset_key ~ '^[a-z][a-z0-9._-]{1,119}$'),
    source_order_id UUID NOT NULL REFERENCES reward_orders(id) ON DELETE RESTRICT,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id,asset_type,asset_key),
    UNIQUE(source_order_id)
);

CREATE TABLE reward_order_events (
    event_id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES reward_orders(id) ON DELETE RESTRICT,
    sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 1000),
    event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('order_submitted','approval_requested','order_approved',
        'order_rejected','grant_available','order_claimed','order_cancelled','grant_revoked')),
    actor_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    details JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(details)='object' AND octet_length(details::TEXT)<=4096),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(order_id,sequence)
);

CREATE TABLE reward_commands (
    actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    command_id UUID NOT NULL,
    command_type VARCHAR(64) NOT NULL,
    semantic_hash CHAR(64) NOT NULL CHECK (semantic_hash ~ '^[0-9a-f]{64}$'),
    response_status INTEGER NOT NULL CHECK (response_status BETWEEN 200 AND 499),
    response_body JSONB NOT NULL CHECK (jsonb_typeof(response_body)='object' AND octet_length(response_body::TEXT)<=65536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(actor_user_id,command_id)
);

CREATE TABLE reward_wishlists (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    catalog_version_id BIGINT NOT NULL REFERENCES reward_catalog_versions(id) ON DELETE RESTRICT,
    target_quantity INTEGER NOT NULL CHECK (target_quantity BETWEEN 1 AND 10),
    priority INTEGER NOT NULL CHECK (priority BETWEEN 1 AND 5),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 100000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(user_id,catalog_version_id)
);

CREATE TABLE reward_audit_log (
    id BIGSERIAL PRIMARY KEY,
    order_id UUID REFERENCES reward_orders(id) ON DELETE RESTRICT,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    action VARCHAR(100) NOT NULL,
    request_id VARCHAR(200),
    details JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(details)='object' AND octet_length(details::TEXT)<=4096),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION protect_reward_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'reward history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION protect_reward_catalog_version() RETURNS trigger AS $$
BEGIN
    IF OLD.item_id<>NEW.item_id OR OLD.catalog_version<>NEW.catalog_version OR OLD.version<>NEW.version
       OR OLD.content_hash<>NEW.content_hash OR OLD.kind<>NEW.kind OR OLD.title_zh<>NEW.title_zh
       OR OLD.title_en<>NEW.title_en OR OLD.description_zh<>NEW.description_zh
       OR OLD.description_en<>NEW.description_en OR OLD.art_key<>NEW.art_key
       OR OLD.points_price<>NEW.points_price OR OLD.exposure_value<>NEW.exposure_value
       OR OLD.provider_gift_type IS DISTINCT FROM NEW.provider_gift_type OR OLD.stock_limit<>NEW.stock_limit
       OR OLD.per_user_limit<>NEW.per_user_limit OR OLD.cooldown_hours<>NEW.cooldown_hours
       OR OLD.approval_policy<>NEW.approval_policy OR OLD.visibility_type<>NEW.visibility_type
       OR OLD.visibility_key IS DISTINCT FROM NEW.visibility_key
       OR OLD.visibility_start IS DISTINCT FROM NEW.visibility_start
       OR OLD.visibility_end IS DISTINCT FROM NEW.visibility_end OR OLD.owner_grant_only<>NEW.owner_grant_only
       OR OLD.published_at<>NEW.published_at OR OLD.lifecycle='retired' OR NEW.lifecycle<>'retired'
       OR NEW.retired_at IS NULL THEN
        RAISE EXCEPTION 'published reward catalog version is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION protect_reward_order_transition() RETURNS trigger AS $$
BEGIN
    IF OLD.id<>NEW.id OR OLD.user_id<>NEW.user_id OR OLD.catalog_version_id<>NEW.catalog_version_id
       OR OLD.source_type<>NEW.source_type OR OLD.source_key<>NEW.source_key
       OR OLD.grant_template_key IS DISTINCT FROM NEW.grant_template_key
       OR OLD.created_by_user_id IS DISTINCT FROM NEW.created_by_user_id OR OLD.points_cost<>NEW.points_cost
       OR OLD.exposure_value<>NEW.exposure_value OR OLD.semantic_hash<>NEW.semantic_hash
       OR OLD.notification_policy<>NEW.notification_policy OR OLD.created_at<>NEW.created_at THEN
        RAISE EXCEPTION 'reward order identity is immutable';
    END IF;
    IF OLD.status IN ('rejected','claimed','cancelled','revoked') THEN
        RAISE EXCEPTION 'terminal reward order is immutable';
    END IF;
    IF NEW.reviewer_user_id IS DISTINCT FROM OLD.reviewer_user_id
       AND NOT (OLD.status='pending_approval' AND NEW.status IN ('approved','rejected')
           AND OLD.reviewer_user_id IS NULL AND NEW.reviewer_user_id IS NOT NULL) THEN
        RAISE EXCEPTION 'reward reviewer provenance is immutable';
    END IF;
    IF OLD.status='pending_approval' AND NEW.status IN ('approved','rejected')
       AND NEW.reviewer_user_id IS NULL THEN
        RAISE EXCEPTION 'manual reward review requires reviewer provenance';
    END IF;
    IF (OLD.status='submitted' AND NEW.status IN ('pending_approval','approved','cancelled'))
       OR (OLD.status='pending_approval' AND NEW.status IN ('approved','rejected','cancelled','revoked'))
       OR (OLD.status='approved' AND NEW.status='claimed')
       OR (OLD.status='approved' AND NEW.status='revoked' AND OLD.points_cost=0) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'illegal reward order transition: % -> %', OLD.status, NEW.status;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION protect_reward_grant_transition() RETURNS trigger AS $$
BEGIN
    IF OLD.order_id<>NEW.order_id OR OLD.user_id<>NEW.user_id OR OLD.granted_at<>NEW.granted_at THEN
        RAISE EXCEPTION 'reward grant identity is immutable';
    END IF;
    IF OLD.status IN ('claimed','revoked') THEN RAISE EXCEPTION 'terminal reward grant is immutable'; END IF;
    IF OLD.status='available' AND NEW.status IN ('claimed','revoked') THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'illegal reward grant transition';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reward_catalog_version_lifecycle BEFORE UPDATE ON reward_catalog_versions
    FOR EACH ROW EXECUTE FUNCTION protect_reward_catalog_version();
CREATE TRIGGER reward_catalog_item_append_only BEFORE UPDATE OR DELETE ON reward_catalog_items
    FOR EACH ROW EXECUTE FUNCTION protect_reward_append_only();
CREATE TRIGGER reward_catalog_version_no_delete BEFORE DELETE ON reward_catalog_versions
    FOR EACH ROW EXECUTE FUNCTION protect_reward_append_only();
CREATE TRIGGER reward_budget_definition_append_only BEFORE UPDATE OR DELETE ON reward_catalog_budgets
    FOR EACH ROW EXECUTE FUNCTION protect_reward_append_only();
CREATE TRIGGER reward_order_transition BEFORE UPDATE ON reward_orders
    FOR EACH ROW EXECUTE FUNCTION protect_reward_order_transition();
CREATE TRIGGER reward_order_no_delete BEFORE DELETE ON reward_orders
    FOR EACH ROW EXECUTE FUNCTION protect_reward_append_only();
CREATE TRIGGER reward_grant_transition BEFORE UPDATE ON reward_inventory_grants
    FOR EACH ROW EXECUTE FUNCTION protect_reward_grant_transition();
CREATE TRIGGER reward_grant_no_delete BEFORE DELETE ON reward_inventory_grants
    FOR EACH ROW EXECUTE FUNCTION protect_reward_append_only();
CREATE TRIGGER reward_events_append_only BEFORE UPDATE OR DELETE ON reward_order_events
    FOR EACH ROW EXECUTE FUNCTION protect_reward_append_only();
CREATE TRIGGER reward_commands_append_only BEFORE UPDATE OR DELETE ON reward_commands
    FOR EACH ROW EXECUTE FUNCTION protect_reward_append_only();
CREATE TRIGGER reward_assets_append_only BEFORE UPDATE OR DELETE ON reward_user_assets
    FOR EACH ROW EXECUTE FUNCTION protect_reward_append_only();
CREATE TRIGGER reward_audit_append_only BEFORE UPDATE OR DELETE ON reward_audit_log
    FOR EACH ROW EXECUTE FUNCTION protect_reward_append_only();

COMMIT;
