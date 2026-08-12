CREATE TABLE IF NOT EXISTS ux_sessions (
    id UUID PRIMARY KEY,
    anonymous_id UUID NOT NULL,
    tab_id UUID NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    device_type VARCHAR(20) NOT NULL DEFAULT 'unknown',
    platform VARCHAR(80),
    browser_language VARCHAR(35),
    preferred_languages TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    app_language VARCHAR(12),
    timezone VARCHAR(80),
    timezone_offset_minutes SMALLINT,
    screen_width INTEGER,
    screen_height INTEGER,
    viewport_width INTEGER,
    viewport_height INTEGER,
    pixel_ratio NUMERIC(5,2),
    orientation VARCHAR(20),
    color_scheme VARCHAR(12),
    reduced_motion BOOLEAN,
    high_contrast BOOLEAN,
    touch_capable BOOLEAN,
    cookies_enabled BOOLEAN,
    standalone BOOLEAN,
    hardware_concurrency SMALLINT,
    device_memory_gb NUMERIC(5,2),
    connection_type VARCHAR(20),
    save_data BOOLEAN,
    user_agent TEXT,
    first_ip INET,
    last_ip INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (device_type IN ('desktop', 'tablet', 'mobile', 'unknown')),
    CHECK (color_scheme IS NULL OR color_scheme IN ('light', 'dark', 'unknown')),
    CHECK (screen_width IS NULL OR screen_width BETWEEN 1 AND 20000),
    CHECK (screen_height IS NULL OR screen_height BETWEEN 1 AND 20000),
    CHECK (viewport_width IS NULL OR viewport_width BETWEEN 1 AND 20000),
    CHECK (viewport_height IS NULL OR viewport_height BETWEEN 1 AND 20000)
);

CREATE TABLE IF NOT EXISTS ux_page_views (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES ux_sessions(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    route VARCHAR(180) NOT NULL,
    referrer_route VARCHAR(180),
    entered_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    exited_at TIMESTAMPTZ,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    active_ms INTEGER NOT NULL DEFAULT 0,
    max_scroll_percent SMALLINT NOT NULL DEFAULT 0,
    exit_reason VARCHAR(30),
    is_embedded BOOLEAN NOT NULL DEFAULT FALSE,
    first_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (route LIKE '/%'),
    CHECK (duration_ms BETWEEN 0 AND 86400000),
    CHECK (active_ms BETWEEN 0 AND 86400000),
    CHECK (max_scroll_percent BETWEEN 0 AND 100)
);

CREATE TABLE IF NOT EXISTS ux_events (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES ux_sessions(id) ON DELETE CASCADE,
    page_view_id UUID NOT NULL REFERENCES ux_page_views(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    element_name VARCHAR(80),
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    occurred_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (event_type ~ '^[a-z][a-z0-9_]{1,49}$'),
    CHECK (element_name IS NULL OR element_name ~ '^[a-zA-Z0-9_.:-]{1,80}$'),
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_ux_sessions_user_started
    ON ux_sessions (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ux_sessions_last_seen
    ON ux_sessions (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_ux_sessions_anonymous
    ON ux_sessions (anonymous_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ux_page_views_route_entered
    ON ux_page_views (route, entered_at DESC);
CREATE INDEX IF NOT EXISTS idx_ux_page_views_user_entered
    ON ux_page_views (user_id, entered_at DESC);
CREATE INDEX IF NOT EXISTS idx_ux_page_views_session_entered
    ON ux_page_views (session_id, entered_at);
CREATE INDEX IF NOT EXISTS idx_ux_events_type_occurred
    ON ux_events (event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ux_events_page_view
    ON ux_events (page_view_id, occurred_at);
