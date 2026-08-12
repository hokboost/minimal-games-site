BEGIN;

-- Normalize columns and worker tables that older deployments created from
-- one-off setup scripts. Keeping this compatibility here makes the migration
-- the single source of truth for both upgrades and fresh databases.
ALTER TABLE gift_exchanges
    ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS failure_reason TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE gift_exchanges
SET quantity = 1
WHERE quantity IS NULL;

UPDATE gift_exchanges
SET updated_at = COALESCE(created_at, NOW())
WHERE updated_at IS NULL;

ALTER TABLE gift_exchanges
    ALTER COLUMN cost SET NOT NULL,
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN delivery_status SET NOT NULL,
    ALTER COLUMN quantity SET NOT NULL,
    ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE wish_inventory
    ADD COLUMN IF NOT EXISTS last_failure_reason TEXT,
    ADD COLUMN IF NOT EXISTS source_type TEXT,
    ADD COLUMN IF NOT EXISTS source_batch_id TEXT,
    ADD COLUMN IF NOT EXISTS batch_order INTEGER,
    ADD COLUMN IF NOT EXISTS batch_value INTEGER;

ALTER TABLE wish_inventory
    ALTER COLUMN status SET NOT NULL;

ALTER TABLE slot_results
    ALTER COLUMN balance_before TYPE BIGINT USING balance_before::BIGINT,
    ALTER COLUMN balance_after TYPE BIGINT USING balance_after::BIGINT;

ALTER TABLE scratch_results
    ALTER COLUMN balance_before TYPE BIGINT USING balance_before::BIGINT,
    ALTER COLUMN balance_after TYPE BIGINT USING balance_after::BIGINT;

ALTER TABLE wish_results
    ALTER COLUMN balance_before TYPE BIGINT USING balance_before::BIGINT,
    ALTER COLUMN balance_after TYPE BIGINT USING balance_after::BIGINT;

CREATE TABLE IF NOT EXISTS pk_gift_logs (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    room_id VARCHAR(50),
    gift_ids JSONB NOT NULL,
    ticket_count INTEGER,
    script_name VARCHAR(50),
    success BOOLEAN,
    reason TEXT,
    report_id VARCHAR(128),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pk_gift_logs
    ADD COLUMN IF NOT EXISTS ticket_count INTEGER,
    ADD COLUMN IF NOT EXISTS report_id VARCHAR(128);

CREATE TABLE IF NOT EXISTS pk_tasks (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    room_id VARCHAR(50),
    action VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pk_runner_state (
    username VARCHAR(50) PRIMARY KEY,
    room_id VARCHAR(50),
    running BOOLEAN DEFAULT FALSE,
    pid INTEGER,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pk_gift_logs_username
    ON pk_gift_logs(username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pk_tasks_status
    ON pk_tasks(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_pk_tasks_user
    ON pk_tasks(username, created_at DESC);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM users WHERE balance IS NULL OR balance < 0 OR balance <> trunc(balance)) THEN
        RAISE EXCEPTION 'Cannot enforce balance invariant: invalid user balances exist';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM balance_audit_baselines
        WHERE balance <> trunc(balance)
    ) THEN
        RAISE EXCEPTION 'Cannot enforce audit baseline invariant: fractional values exist';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM spin_results
        WHERE (balance_before IS NOT NULL AND balance_before <> trunc(balance_before))
           OR (balance_after IS NOT NULL AND balance_after <> trunc(balance_after))
    ) THEN
        RAISE EXCEPTION 'Cannot enforce spin balance invariant: fractional values exist';
    END IF;
END
$$;

ALTER TABLE users
    ALTER COLUMN balance DROP DEFAULT,
    ALTER COLUMN balance TYPE BIGINT USING balance::BIGINT,
    ALTER COLUMN balance SET DEFAULT 100;

UPDATE users
SET login_failures = 0
WHERE login_failures IS NULL;

ALTER TABLE users
    ALTER COLUMN login_failures SET DEFAULT 0,
    ALTER COLUMN login_failures SET NOT NULL;

ALTER TABLE balance_logs
    ALTER COLUMN amount TYPE NUMERIC USING amount::NUMERIC,
    ALTER COLUMN balance_before TYPE NUMERIC USING balance_before::NUMERIC,
    ALTER COLUMN balance_after TYPE NUMERIC USING balance_after::NUMERIC;

ALTER TABLE balance_audit_baselines
    ALTER COLUMN balance TYPE BIGINT USING balance::BIGINT;

ALTER TABLE spin_results
    ALTER COLUMN balance_before TYPE BIGINT USING balance_before::BIGINT,
    ALTER COLUMN balance_after TYPE BIGINT USING balance_after::BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'balance_logs'::regclass
          AND conname = 'balance_logs_safe_integer_check'
    ) THEN
        ALTER TABLE balance_logs
            ADD CONSTRAINT balance_logs_safe_integer_check
            CHECK (
                amount = trunc(amount)
                AND balance_before = trunc(balance_before)
                AND balance_after = trunc(balance_after)
                AND amount BETWEEN -9007199254740991 AND 9007199254740991
                AND balance_before BETWEEN 0 AND 9007199254740991
                AND balance_after BETWEEN 0 AND 9007199254740991
            ) NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'balance_audit_baselines'::regclass
          AND conname = 'balance_audit_baselines_safe_integer_check'
    ) THEN
        ALTER TABLE balance_audit_baselines
            ADD CONSTRAINT balance_audit_baselines_safe_integer_check
            CHECK (balance BETWEEN 0 AND 9007199254740991) NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'users'::regclass
          AND conname = 'users_login_failures_check'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_login_failures_check
            CHECK (login_failures BETWEEN 0 AND 100000) NOT VALID;
    END IF;
END
$$;

-- NOT VALID still enforces the check for every new row. Validate it fully when
-- no immutable pre-cutover fractional ledger evidence needs to be preserved.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM balance_logs
        WHERE amount <> trunc(amount)
           OR balance_before <> trunc(balance_before)
           OR balance_after <> trunc(balance_after)
    ) THEN
        ALTER TABLE balance_logs
            VALIDATE CONSTRAINT balance_logs_safe_integer_check;
    END IF;
END
$$;

COMMENT ON CONSTRAINT balance_logs_safe_integer_check ON balance_logs IS
    'Enforced for all new rows; may remain unvalidated only for immutable legacy fractional rows.';

ALTER TABLE balance_audit_baselines VALIDATE CONSTRAINT balance_audit_baselines_safe_integer_check;
ALTER TABLE users VALIDATE CONSTRAINT users_login_failures_check;

ALTER TABLE wish_results
    ADD COLUMN IF NOT EXISTS wish_session_id INTEGER,
    ADD COLUMN IF NOT EXISTS batch_position INTEGER,
    ADD COLUMN IF NOT EXISTS result_trace VARCHAR(128);

UPDATE wish_results
SET result_trace = LEFT(COALESCE(game_details->>'result_trace', game_details->>'proof'), 128)
WHERE result_trace IS NULL
  AND COALESCE(game_details->>'result_trace', game_details->>'proof') IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'wish_results'::regclass
          AND conname = 'wish_results_session_fkey'
    ) THEN
        ALTER TABLE wish_results
            ADD CONSTRAINT wish_results_session_fkey
            FOREIGN KEY (wish_session_id) REFERENCES wish_sessions(id);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'wish_inventory'::regclass
          AND conname = 'wish_inventory_status_check'
    ) THEN
        ALTER TABLE wish_inventory
            ADD CONSTRAINT wish_inventory_status_check
            CHECK (status IN ('stored', 'queued', 'sent', 'failed', 'expired')) NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'wish_inventory'::regclass
          AND conname = 'wish_inventory_exchange_fkey'
    ) THEN
        ALTER TABLE wish_inventory
            ADD CONSTRAINT wish_inventory_exchange_fkey
            FOREIGN KEY (gift_exchange_id) REFERENCES gift_exchanges(id) NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'wish_inventory'::regclass
          AND conname = 'wish_inventory_state_shape_check'
    ) THEN
        ALTER TABLE wish_inventory
            ADD CONSTRAINT wish_inventory_state_shape_check
            CHECK (
                (status = 'stored' AND gift_exchange_id IS NULL AND sent_at IS NULL)
                OR (status = 'queued' AND gift_exchange_id IS NOT NULL AND sent_at IS NULL)
                OR (status = 'sent' AND gift_exchange_id IS NOT NULL AND sent_at IS NOT NULL)
                OR (status = 'failed' AND sent_at IS NULL)
                OR (status = 'expired' AND gift_exchange_id IS NULL AND sent_at IS NULL)
            ) NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'wish_progress'::regclass
          AND conname = 'wish_progress_counters_check'
    ) THEN
        ALTER TABLE wish_progress
            ADD CONSTRAINT wish_progress_counters_check
            CHECK (
                total_wishes >= 0 AND consecutive_fails >= 0
                AND total_spent >= 0 AND total_rewards_value >= 0
                AND consecutive_fails <= total_wishes
            ) NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'wish_sessions'::regclass
          AND conname = 'wish_sessions_totals_check'
    ) THEN
        ALTER TABLE wish_sessions
            ADD CONSTRAINT wish_sessions_totals_check
            CHECK (
                batch_count > 0 AND batch_count <= 100
                AND total_cost > 0
                AND success_count >= 0 AND success_count <= batch_count
                AND total_reward_value >= 0
            ) NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'wish_results'::regclass
          AND conname = 'wish_results_values_check'
    ) THEN
        ALTER TABLE wish_results
            ADD CONSTRAINT wish_results_values_check
            CHECK (
                cost > 0
                AND (reward_value IS NULL OR reward_value >= 0)
                AND wishes_count > 0
                AND (batch_position IS NULL OR batch_position > 0)
                AND ((balance_before IS NULL) = (balance_after IS NULL))
                AND (balance_before IS NULL OR balance_before BETWEEN 0 AND 9007199254740991)
                AND (balance_after IS NULL OR balance_after BETWEEN 0 AND 9007199254740991)
                AND (
                    balance_before IS NULL
                    OR balance_after = balance_before - cost
                    OR (
                        success = TRUE
                        AND reward_value IS NOT NULL
                        AND balance_after = balance_before - cost + reward_value
                    )
                )
                AND (result_trace IS NULL OR length(result_trace) BETWEEN 16 AND 128)
            ) NOT VALID;
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wish_results_session_position
    ON wish_results (wish_session_id, batch_position)
    WHERE wish_session_id IS NOT NULL AND batch_position IS NOT NULL;

ALTER TABLE wish_inventory VALIDATE CONSTRAINT wish_inventory_status_check;
ALTER TABLE wish_inventory VALIDATE CONSTRAINT wish_inventory_exchange_fkey;
ALTER TABLE wish_inventory VALIDATE CONSTRAINT wish_inventory_state_shape_check;
ALTER TABLE wish_progress VALIDATE CONSTRAINT wish_progress_counters_check;
ALTER TABLE wish_sessions VALIDATE CONSTRAINT wish_sessions_totals_check;
ALTER TABLE wish_results VALIDATE CONSTRAINT wish_results_values_check;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'slot_results'::regclass
          AND conname = 'slot_results_balance_snapshot_check'
    ) THEN
        ALTER TABLE slot_results
            ADD CONSTRAINT slot_results_balance_snapshot_check
            CHECK (
                (balance_before IS NULL) = (balance_after IS NULL)
                AND (balance_before IS NULL OR balance_before BETWEEN 0 AND 9007199254740991)
                AND (balance_after IS NULL OR balance_after BETWEEN 0 AND 9007199254740991)
            ) NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'scratch_results'::regclass
          AND conname = 'scratch_results_balance_snapshot_check'
    ) THEN
        ALTER TABLE scratch_results
            ADD CONSTRAINT scratch_results_balance_snapshot_check
            CHECK (
                (balance_before IS NULL) = (balance_after IS NULL)
                AND (balance_before IS NULL OR balance_before BETWEEN 0 AND 9007199254740991)
                AND (balance_after IS NULL OR balance_after BETWEEN 0 AND 9007199254740991)
            ) NOT VALID;
    END IF;
END
$$;

ALTER TABLE slot_results VALIDATE CONSTRAINT slot_results_balance_snapshot_check;
ALTER TABLE scratch_results VALIDATE CONSTRAINT scratch_results_balance_snapshot_check;

CREATE OR REPLACE FUNCTION enforce_wish_inventory_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.username IS DISTINCT FROM OLD.username
       OR NEW.gift_type IS DISTINCT FROM OLD.gift_type
       OR NEW.gift_name IS DISTINCT FROM OLD.gift_name
       OR NEW.bilibili_gift_id IS DISTINCT FROM OLD.bilibili_gift_id
       OR NEW.source_type IS DISTINCT FROM OLD.source_type
       OR NEW.source_batch_id IS DISTINCT FROM OLD.source_batch_id
       OR NEW.batch_order IS DISTINCT FROM OLD.batch_order
       OR NEW.batch_value IS DISTINCT FROM OLD.batch_value
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Wish inventory entitlement identity is immutable';
    END IF;
    IF OLD.status IN ('sent', 'expired') THEN
        RAISE EXCEPTION 'Terminal wish inventory state is immutable';
    END IF;
    IF NEW.status = OLD.status THEN
        IF OLD.status = 'queued'
           AND NEW.gift_exchange_id IS DISTINCT FROM OLD.gift_exchange_id THEN
            RAISE EXCEPTION 'Queued wish inventory delivery identity is immutable';
        END IF;
        RETURN NEW;
    END IF;
    IF OLD.status = 'stored' AND NEW.status IN ('queued', 'expired') THEN
        RETURN NEW;
    END IF;
    IF OLD.status = 'queued' AND NEW.status IN ('stored', 'sent', 'failed') THEN
        RETURN NEW;
    END IF;
    IF OLD.status = 'failed' AND NEW.status = 'stored' THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Illegal wish inventory state transition: % -> %', OLD.status, NEW.status;
END;
$$;

DROP TRIGGER IF EXISTS wish_inventory_transition_guard ON wish_inventory;
CREATE TRIGGER wish_inventory_transition_guard
BEFORE UPDATE ON wish_inventory
FOR EACH ROW EXECUTE FUNCTION enforce_wish_inventory_transition();

ALTER TABLE users
    ALTER COLUMN balance SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'users'::regclass
          AND conname = 'users_balance_invariant_check'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_balance_invariant_check
            CHECK (balance >= 0 AND balance = trunc(balance) AND balance <= 9007199254740991)
            NOT VALID;
    END IF;
END
$$;

ALTER TABLE users VALIDATE CONSTRAINT users_balance_invariant_check;

CREATE UNIQUE INDEX IF NOT EXISTS users_bilibili_room_unique
    ON users (bilibili_room_id)
    WHERE bilibili_room_id IS NOT NULL;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS bilibili_room_bound_at TIMESTAMPTZ;

UPDATE users
SET bilibili_room_bound_at = COALESCE(bilibili_room_bound_at, created_at, NOW())
WHERE bilibili_room_id IS NOT NULL;

UPDATE users
SET bilibili_room_bound_at = NULL
WHERE bilibili_room_id IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'users'::regclass
          AND conname = 'users_bilibili_room_binding_shape_check'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_bilibili_room_binding_shape_check
            CHECK ((bilibili_room_id IS NULL) = (bilibili_room_bound_at IS NULL)) NOT VALID;
    END IF;
END
$$;

ALTER TABLE users VALIDATE CONSTRAINT users_bilibili_room_binding_shape_check;

ALTER TABLE pk_runner_state
    ADD COLUMN IF NOT EXISTS generation_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS worker_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS command_generation BIGINT;

ALTER TABLE pk_tasks
    ADD COLUMN IF NOT EXISTS claim_token VARCHAR(200),
    ADD COLUMN IF NOT EXISTS worker_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS claim_generation INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS command_generation BIGINT;

ALTER TABLE pk_tasks
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN attempt_count SET NOT NULL,
    ALTER COLUMN claim_generation SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'pk_tasks'::regclass
          AND conname = 'pk_tasks_state_check'
    ) THEN
        ALTER TABLE pk_tasks
            ADD CONSTRAINT pk_tasks_state_check
            CHECK (
                action IN ('start', 'stop')
                AND status IN ('pending', 'claimed', 'processing', 'completed',
                               'failed', 'uncertain', 'superseded')
                AND attempt_count >= 0
                AND claim_generation >= 0
                AND (command_generation IS NULL OR command_generation > 0)
                AND (
                    status NOT IN ('claimed', 'processing', 'uncertain')
                    OR (
                        claim_token IS NOT NULL
                        AND worker_id IS NOT NULL
                        AND claim_generation > 0
                    )
                )
            ) NOT VALID;
    END IF;
END
$$;

ALTER TABLE pk_tasks VALIDATE CONSTRAINT pk_tasks_state_check;

CREATE TABLE IF NOT EXISTS pk_control_state (
    username VARCHAR(50) PRIMARY KEY REFERENCES users(username),
    command_generation BIGINT NOT NULL DEFAULT 0 CHECK (command_generation >= 0),
    desired_running BOOLEAN NOT NULL DEFAULT FALSE,
    room_id VARCHAR(50),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (NOT desired_running OR room_id IS NOT NULL)
);

INSERT INTO pk_control_state (username, command_generation, desired_running, room_id)
SELECT state.username, 0, COALESCE(state.running, FALSE), state.room_id
FROM pk_runner_state AS state
ON CONFLICT (username) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pk_tasks_user_command_generation
    ON pk_tasks (username, command_generation)
    WHERE command_generation IS NOT NULL;

ALTER TABLE gift_exchanges
    ADD COLUMN IF NOT EXISTS claim_token VARCHAR(200),
    ADD COLUMN IF NOT EXISTS worker_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS claim_generation INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS provider_transaction_id VARCHAR(200);

ALTER TABLE gift_exchanges
    ALTER COLUMN attempt_count SET NOT NULL,
    ALTER COLUMN claim_generation SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS gift_exchanges_provider_transaction_unique
    ON gift_exchanges (provider_transaction_id)
    WHERE provider_transaction_id IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'gift_exchanges'::regclass
          AND conname = 'gift_exchanges_state_check'
    ) THEN
        ALTER TABLE gift_exchanges
            ADD CONSTRAINT gift_exchanges_state_check
            CHECK (
                status IN ('funds_locked', 'completed', 'failed')
                AND delivery_status IN (
                    'pending', 'claimed', 'processing', 'uncertain',
                    'success', 'partial_success', 'failed', 'timeout',
                    'delivered', 'no_room'
                )
                AND cost >= 0 AND cost <= 9007199254740991
                AND quantity BETWEEN 1 AND 100
                AND attempt_count >= 0
                AND claim_generation >= 0
                AND (
                    status <> 'funds_locked'
                    OR delivery_status IN ('pending', 'claimed', 'processing', 'uncertain')
                )
                AND (
                    delivery_status NOT IN ('claimed', 'processing', 'uncertain')
                    OR (
                        claim_token IS NOT NULL
                        AND worker_id IS NOT NULL
                        AND claim_generation > 0
                    )
                )
            ) NOT VALID;
    END IF;
END
$$;

ALTER TABLE gift_exchanges VALIDATE CONSTRAINT gift_exchanges_state_check;

CREATE OR REPLACE FUNCTION enforce_gift_exchange_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.username IS DISTINCT FROM OLD.username
       OR NEW.cost IS DISTINCT FROM OLD.cost
       OR NEW.quantity IS DISTINCT FROM OLD.quantity THEN
        RAISE EXCEPTION 'Gift exchange ownership and locked amount are immutable';
    END IF;
    IF OLD.status IN ('completed', 'failed') THEN
        RAISE EXCEPTION 'Terminal gift exchange state cannot transition';
    END IF;
    IF NEW.status = OLD.status AND NEW.delivery_status = OLD.delivery_status THEN
        RETURN NEW;
    END IF;
    IF OLD.delivery_status = 'pending'
       AND ((NEW.status = 'funds_locked' AND NEW.delivery_status = 'claimed')
            OR (NEW.status = 'failed' AND NEW.delivery_status IN ('failed', 'timeout'))) THEN
        RETURN NEW;
    END IF;
    IF OLD.delivery_status = 'claimed'
       AND ((NEW.status = 'funds_locked' AND NEW.delivery_status IN ('pending', 'processing'))
            OR (NEW.status = 'failed' AND NEW.delivery_status = 'failed')) THEN
        RETURN NEW;
    END IF;
    IF OLD.delivery_status = 'processing'
       AND ((NEW.status = 'funds_locked' AND NEW.delivery_status = 'uncertain')
            OR (NEW.status = 'completed' AND NEW.delivery_status IN ('success', 'partial_success'))) THEN
        RETURN NEW;
    END IF;
    IF OLD.delivery_status = 'uncertain'
       AND ((NEW.status = 'completed' AND NEW.delivery_status IN ('success', 'partial_success'))
            OR (NEW.status = 'failed' AND NEW.delivery_status = 'failed')) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Illegal gift exchange state transition: %/% -> %/%',
        OLD.status, OLD.delivery_status, NEW.status, NEW.delivery_status;
END;
$$;

DROP TRIGGER IF EXISTS gift_exchanges_transition_guard ON gift_exchanges;
CREATE TRIGGER gift_exchanges_transition_guard
BEFORE UPDATE ON gift_exchanges
FOR EACH ROW EXECUTE FUNCTION enforce_gift_exchange_transition();

CREATE OR REPLACE FUNCTION enforce_pk_task_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.username IS DISTINCT FROM OLD.username
       OR NEW.action IS DISTINCT FROM OLD.action
       OR NEW.command_generation IS DISTINCT FROM OLD.command_generation THEN
        RAISE EXCEPTION 'PK task identity is immutable';
    END IF;
    IF OLD.status IN ('completed', 'failed', 'superseded') THEN
        RAISE EXCEPTION 'Terminal PK task state cannot transition';
    END IF;
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;
    IF OLD.status = 'pending' AND NEW.status IN ('claimed', 'superseded') THEN
        RETURN NEW;
    END IF;
    IF OLD.status = 'claimed' AND NEW.status IN ('pending', 'processing', 'failed', 'superseded') THEN
        RETURN NEW;
    END IF;
    IF OLD.status = 'processing' AND NEW.status IN ('completed', 'failed', 'uncertain', 'superseded') THEN
        RETURN NEW;
    END IF;
    IF OLD.status = 'uncertain' AND NEW.status IN ('completed', 'failed', 'superseded') THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Illegal PK task state transition: % -> %', OLD.status, NEW.status;
END;
$$;

DROP TRIGGER IF EXISTS pk_tasks_transition_guard ON pk_tasks;
CREATE TRIGGER pk_tasks_transition_guard
BEFORE UPDATE ON pk_tasks
FOR EACH ROW EXECUTE FUNCTION enforce_pk_task_transition();

CREATE TABLE IF NOT EXISTS gift_delivery_events (
    id BIGSERIAL PRIMARY KEY,
    gift_exchange_id INTEGER NOT NULL REFERENCES gift_exchanges(id),
    event_type VARCHAR(50) NOT NULL,
    claim_generation INTEGER,
    worker_id VARCHAR(100),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (gift_exchange_id, event_type, claim_generation)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'gift_delivery_events'::regclass
          AND conname = 'gift_delivery_events_shape_check'
    ) THEN
        ALTER TABLE gift_delivery_events
            ADD CONSTRAINT gift_delivery_events_shape_check
            CHECK (
                event_type ~ '^[a-z][a-z0-9_]{1,49}$'
                AND (claim_generation IS NULL OR claim_generation >= 0)
                AND jsonb_typeof(details) = 'object'
            ) NOT VALID;
    END IF;
END
$$;

ALTER TABLE gift_delivery_events VALIDATE CONSTRAINT gift_delivery_events_shape_check;

CREATE INDEX IF NOT EXISTS idx_gift_delivery_events_exchange
    ON gift_delivery_events (gift_exchange_id, created_at);

DROP TRIGGER IF EXISTS gift_delivery_events_append_only ON gift_delivery_events;
CREATE TRIGGER gift_delivery_events_append_only
BEFORE UPDATE OR DELETE ON gift_delivery_events
FOR EACH ROW EXECUTE FUNCTION reject_balance_log_mutation();

CREATE TABLE IF NOT EXISTS delivery_outbox (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    aggregate_id INTEGER NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'dead_letter')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    claim_token VARCHAR(100),
    lease_expires_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE (event_type, aggregate_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_outbox_pending
    ON delivery_outbox (next_attempt_at, id)
    WHERE status IN ('pending', 'processing');

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'delivery_outbox'::regclass
          AND conname = 'delivery_outbox_state_check'
    ) THEN
        ALTER TABLE delivery_outbox
            ADD CONSTRAINT delivery_outbox_state_check
            CHECK (
                event_type IN ('enqueue_next_blindbox', 'enqueue_inventory')
                AND status IN ('pending', 'processing', 'completed', 'dead_letter')
                AND attempt_count >= 0
                AND jsonb_typeof(payload) = 'object'
            ) NOT VALID;
    END IF;
END
$$;

ALTER TABLE delivery_outbox VALIDATE CONSTRAINT delivery_outbox_state_check;

CREATE OR REPLACE FUNCTION enforce_delivery_outbox_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.event_type IS DISTINCT FROM OLD.event_type
       OR NEW.aggregate_id IS DISTINCT FROM OLD.aggregate_id
       OR NEW.payload IS DISTINCT FROM OLD.payload THEN
        RAISE EXCEPTION 'Delivery outbox identity is immutable';
    END IF;
    IF OLD.status IN ('completed', 'dead_letter') THEN
        RAISE EXCEPTION 'Terminal delivery outbox state cannot transition';
    END IF;
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;
    IF (OLD.status = 'pending' AND NEW.status = 'processing')
       OR (OLD.status = 'processing' AND NEW.status IN ('pending', 'completed', 'dead_letter')) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Illegal delivery outbox state transition: % -> %', OLD.status, NEW.status;
END;
$$;

DROP TRIGGER IF EXISTS delivery_outbox_transition_guard ON delivery_outbox;
CREATE TRIGGER delivery_outbox_transition_guard
BEFORE UPDATE ON delivery_outbox
FOR EACH ROW EXECUTE FUNCTION enforce_delivery_outbox_transition();

CREATE TABLE IF NOT EXISTS worker_heartbeats (
    worker_id VARCHAR(100) PRIMARY KEY,
    worker_type VARCHAR(50) NOT NULL,
    version VARCHAR(50),
    protocol_version INTEGER NOT NULL CHECK (protocol_version > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'online'
        CHECK (status IN ('online', 'draining', 'offline')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_heartbeats_last_seen
    ON worker_heartbeats (last_seen_at DESC);

CREATE TABLE IF NOT EXISTS worker_role_leases (
    role VARCHAR(50) PRIMARY KEY,
    worker_id VARCHAR(100) NOT NULL,
    lease_generation BIGINT NOT NULL DEFAULT 1 CHECK (lease_generation > 0),
    lease_expires_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_role_leases_expiry
    ON worker_role_leases (lease_expires_at);

ALTER TABLE quiz_sessions
    ADD COLUMN IF NOT EXISTS expected_question_count INTEGER NOT NULL DEFAULT 15,
    ADD COLUMN IF NOT EXISTS question_bank_version CHAR(64),
    ADD COLUMN IF NOT EXISTS question_snapshot JSONB;

-- Legacy active sessions did not contain an immutable question snapshot and
-- cannot be graded reliably after a question-bank deployment.
UPDATE quiz_sessions
SET status = 'expired', settled_at = COALESCE(settled_at, NOW())
WHERE status = 'active'
  AND (question_snapshot IS NULL OR question_bank_version IS NULL);

WITH duplicate_active AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY username ORDER BY created_at DESC, id DESC
           ) AS active_rank
    FROM quiz_sessions
    WHERE status = 'active'
)
UPDATE quiz_sessions AS session
SET status = 'replaced', settled_at = COALESCE(session.settled_at, NOW())
FROM duplicate_active
WHERE session.id = duplicate_active.id
  AND duplicate_active.active_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_sessions_one_active_per_user
    ON quiz_sessions (username)
    WHERE status = 'active';

ALTER TABLE quiz_question_tokens
    ADD COLUMN IF NOT EXISTS question_index INTEGER;

WITH ranked AS (
    SELECT token,
           ROW_NUMBER() OVER (
               PARTITION BY session_id ORDER BY created_at, token
           ) - 1 AS derived_index
    FROM quiz_question_tokens
    WHERE question_index IS NULL
)
UPDATE quiz_question_tokens AS issued
SET question_index = ranked.derived_index
FROM ranked
WHERE issued.token = ranked.token;

ALTER TABLE quiz_question_tokens
    ALTER COLUMN question_index SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_tokens_session_question_index
    ON quiz_question_tokens (session_id, question_index);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'quiz_sessions'::regclass
          AND conname = 'quiz_sessions_expected_count_check'
    ) THEN
        ALTER TABLE quiz_sessions
            ADD CONSTRAINT quiz_sessions_expected_count_check
            CHECK (expected_question_count BETWEEN 1 AND 100) NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'quiz_sessions'::regclass
          AND conname = 'quiz_sessions_active_snapshot_check'
    ) THEN
        ALTER TABLE quiz_sessions
            ADD CONSTRAINT quiz_sessions_active_snapshot_check
            CHECK (
                status <> 'active' OR CASE
                    WHEN jsonb_typeof(question_snapshot) = 'array'
                    THEN jsonb_array_length(question_snapshot) = expected_question_count
                         AND question_bank_version IS NOT NULL
                    ELSE FALSE
                END
            ) NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'quiz_question_tokens'::regclass
          AND conname = 'quiz_question_tokens_index_check'
    ) THEN
        ALTER TABLE quiz_question_tokens
            ADD CONSTRAINT quiz_question_tokens_index_check
            CHECK (question_index >= 0) NOT VALID;
    END IF;
END
$$;

ALTER TABLE quiz_sessions VALIDATE CONSTRAINT quiz_sessions_expected_count_check;
ALTER TABLE quiz_sessions VALIDATE CONSTRAINT quiz_sessions_active_snapshot_check;
ALTER TABLE quiz_question_tokens VALIDATE CONSTRAINT quiz_question_tokens_index_check;

ALTER TABLE submissions
    ADD COLUMN IF NOT EXISTS quiz_session_id TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'submissions'::regclass
          AND conname = 'submissions_quiz_session_fkey'
    ) THEN
        ALTER TABLE submissions
            ADD CONSTRAINT submissions_quiz_session_fkey
            FOREIGN KEY (quiz_session_id) REFERENCES quiz_sessions(id) NOT VALID;
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_quiz_session_unique
    ON submissions (quiz_session_id)
    WHERE quiz_session_id IS NOT NULL;

ALTER TABLE submissions VALIDATE CONSTRAINT submissions_quiz_session_fkey;

CREATE INDEX IF NOT EXISTS idx_balance_logs_username_id
    ON balance_logs (username, id);

CREATE OR REPLACE FUNCTION enforce_balance_log_chain()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    expected_before BIGINT;
    current_balance BIGINT;
    latest_balance BIGINT;
BEGIN
    SELECT baseline.balance
    INTO expected_before
    FROM balance_audit_baselines AS baseline
    WHERE baseline.version = 'append-only-v1'
      AND baseline.username = NEW.username;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Balance audit baseline is missing for %', NEW.username;
    END IF;

    SELECT entry.balance_after
    INTO latest_balance
    FROM balance_logs AS entry
    JOIN balance_audit_baselines AS baseline
      ON baseline.username = entry.username
     AND baseline.version = 'append-only-v1'
    WHERE entry.username = NEW.username
      AND entry.id > baseline.last_balance_log_id
    ORDER BY entry.id DESC
    LIMIT 1;
    IF FOUND THEN
        expected_before := latest_balance;
    END IF;

    SELECT account.balance
    INTO current_balance
    FROM users AS account
    WHERE account.username = NEW.username;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Balance owner is missing for %', NEW.username;
    END IF;
    IF NEW.balance_before IS DISTINCT FROM expected_before THEN
        RAISE EXCEPTION 'Balance ledger chain is discontinuous for %', NEW.username;
    END IF;
    IF NEW.balance_after IS DISTINCT FROM current_balance THEN
        RAISE EXCEPTION 'Balance ledger does not match current balance for %', NEW.username;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS balance_logs_chain_guard ON balance_logs;
CREATE TRIGGER balance_logs_chain_guard
BEFORE INSERT ON balance_logs
FOR EACH ROW EXECUTE FUNCTION enforce_balance_log_chain();

CREATE OR REPLACE FUNCTION enforce_user_balance_has_ledger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    expected_balance BIGINT;
    latest_balance BIGINT;
    actual_balance BIGINT;
BEGIN
    SELECT baseline.balance
    INTO expected_balance
    FROM balance_audit_baselines AS baseline
    WHERE baseline.version = 'append-only-v1'
      AND baseline.username = NEW.username;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Balance audit baseline is missing for %', NEW.username;
    END IF;

    SELECT entry.balance_after
    INTO latest_balance
    FROM balance_logs AS entry
    JOIN balance_audit_baselines AS baseline
      ON baseline.username = entry.username
     AND baseline.version = 'append-only-v1'
    WHERE entry.username = NEW.username
      AND entry.id > baseline.last_balance_log_id
    ORDER BY entry.id DESC
    LIMIT 1;
    IF FOUND THEN
        expected_balance := latest_balance;
    END IF;

    SELECT account.balance
    INTO actual_balance
    FROM users AS account
    WHERE account.username = NEW.username;
    IF actual_balance IS DISTINCT FROM expected_balance THEN
        RAISE EXCEPTION 'User balance changed without a matching ledger entry for %', NEW.username;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS users_balance_ledger_guard ON users;
CREATE CONSTRAINT TRIGGER users_balance_ledger_guard
AFTER UPDATE OF balance ON users
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (OLD.balance IS DISTINCT FROM NEW.balance)
EXECUTE FUNCTION enforce_user_balance_has_ledger();

CREATE OR REPLACE VIEW balance_audit_current AS
WITH post_baseline_entries AS (
    SELECT baseline.username,
           baseline.balance AS baseline_balance,
           entry.id,
           entry.amount,
           entry.balance_before,
           entry.balance_after,
           LAG(entry.balance_after) OVER (
               PARTITION BY baseline.username ORDER BY entry.id
           ) AS previous_balance
    FROM balance_audit_baselines AS baseline
    JOIN balance_logs AS entry
      ON entry.username = baseline.username
     AND entry.id > baseline.last_balance_log_id
    WHERE baseline.version = 'append-only-v1'
), ledger_summary AS (
    SELECT username,
           SUM(amount) AS total_change,
           COUNT(id)::BIGINT AS entry_count,
           BOOL_AND(
               balance_before = COALESCE(previous_balance, baseline_balance)
           ) AS chain_is_consistent
    FROM post_baseline_entries
    GROUP BY username
)
SELECT account.username,
       account.balance AS actual_balance,
       baseline.balance + COALESCE(summary.total_change, 0) AS expected_balance,
       COALESCE(summary.entry_count, 0)::BIGINT AS post_baseline_entry_count,
       baseline.username IS NOT NULL
           AND COALESCE(summary.chain_is_consistent, TRUE) AS is_chain_consistent,
       baseline.username IS NOT NULL
           AND account.balance = baseline.balance + COALESCE(summary.total_change, 0)
           AND COALESCE(summary.chain_is_consistent, TRUE) AS is_consistent
FROM users AS account
LEFT JOIN balance_audit_baselines AS baseline
  ON baseline.username = account.username
 AND baseline.version = 'append-only-v1'
LEFT JOIN ledger_summary AS summary ON summary.username = account.username;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'submissions' AND column_name = 'proof'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'submissions' AND column_name = 'result_trace'
    ) THEN
        ALTER TABLE submissions RENAME COLUMN proof TO result_trace;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'slot_results' AND column_name = 'proof'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'slot_results' AND column_name = 'result_trace'
    ) THEN
        ALTER TABLE slot_results RENAME COLUMN proof TO result_trace;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'scratch_results' AND column_name = 'proof'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'scratch_results' AND column_name = 'result_trace'
    ) THEN
        ALTER TABLE scratch_results RENAME COLUMN proof TO result_trace;
    END IF;
END
$$;

ALTER TABLE ux_sessions
    ADD COLUMN IF NOT EXISTS detailed_preferences BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS consent_version VARCHAR(20);

UPDATE ux_sessions
SET platform = NULL,
    preferred_languages = ARRAY[]::TEXT[],
    timezone = NULL,
    screen_width = NULL,
    screen_height = NULL,
    pixel_ratio = NULL,
    orientation = NULL,
    hardware_concurrency = NULL,
    device_memory_gb = NULL,
    detailed_preferences = FALSE
WHERE consent_version IS NULL;

ALTER TABLE ux_sessions
    DROP COLUMN IF EXISTS first_ip,
    DROP COLUMN IF EXISTS last_ip,
    DROP COLUMN IF EXISTS user_agent;

ALTER TABLE api_request_nonces
    ADD COLUMN IF NOT EXISTS worker_id VARCHAR(100);

ALTER TABLE idempotency_keys
    ALTER COLUMN status SET DEFAULT 'pending';

CREATE OR REPLACE FUNCTION enforce_idempotency_key_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.username IS DISTINCT FROM OLD.username
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.request_method IS DISTINCT FROM OLD.request_method
       OR NEW.request_path IS DISTINCT FROM OLD.request_path
       OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Idempotency request identity is immutable';
    END IF;
    IF OLD.status IN ('completed', 'indeterminate') THEN
        RAISE EXCEPTION 'Terminal idempotency state is immutable';
    END IF;
    IF NEW.status = 'pending' THEN
        IF NEW.response_status IS DISTINCT FROM OLD.response_status
           OR NEW.response_body IS DISTINCT FROM OLD.response_body
           OR NEW.failure_reason IS DISTINCT FROM OLD.failure_reason THEN
            RAISE EXCEPTION 'Pending idempotency response cannot be populated';
        END IF;
        RETURN NEW;
    END IF;
    IF OLD.status = 'pending' AND NEW.status IN ('completed', 'indeterminate') THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Illegal idempotency state transition: % -> %', OLD.status, NEW.status;
END;
$$;

DROP TRIGGER IF EXISTS idempotency_keys_transition_guard ON idempotency_keys;
CREATE TRIGGER idempotency_keys_transition_guard
BEFORE UPDATE ON idempotency_keys
FOR EACH ROW EXECUTE FUNCTION enforce_idempotency_key_transition();

CREATE TABLE IF NOT EXISTS pk_spend_authorizations (
    authorization_id VARCHAR(100) PRIMARY KEY,
    username VARCHAR(50) NOT NULL REFERENCES users(username),
    room_id VARCHAR(50) NOT NULL,
    runner_generation VARCHAR(100) NOT NULL,
    worker_id VARCHAR(100),
    gift_ids JSONB NOT NULL,
    ticket_count INTEGER NOT NULL CHECK (ticket_count > 0 AND ticket_count <= 100000000),
    request_hash CHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'reserved'
        CHECK (status IN ('reserved', 'sending', 'settled', 'released', 'uncertain')),
    report_id VARCHAR(128),
    outcome_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    settled_at TIMESTAMPTZ,
    UNIQUE (report_id)
);

ALTER TABLE pk_spend_authorizations
    ADD COLUMN IF NOT EXISTS worker_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE pk_spend_authorizations
    DROP CONSTRAINT IF EXISTS pk_spend_authorizations_status_check;

ALTER TABLE pk_spend_authorizations
    ADD CONSTRAINT pk_spend_authorizations_status_check
    CHECK (status IN ('reserved', 'sending', 'settled', 'released', 'uncertain'));

CREATE INDEX IF NOT EXISTS idx_pk_spend_authorizations_user_status
    ON pk_spend_authorizations (username, status, created_at DESC);

CREATE OR REPLACE FUNCTION enforce_pk_spend_authorization_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.authorization_id IS DISTINCT FROM OLD.authorization_id
       OR NEW.username IS DISTINCT FROM OLD.username
       OR NEW.room_id IS DISTINCT FROM OLD.room_id
       OR NEW.runner_generation IS DISTINCT FROM OLD.runner_generation
       OR NEW.worker_id IS DISTINCT FROM OLD.worker_id
       OR NEW.gift_ids IS DISTINCT FROM OLD.gift_ids
       OR NEW.ticket_count IS DISTINCT FROM OLD.ticket_count
       OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'PK spend authorization identity is immutable';
    END IF;
    IF NEW.started_at IS DISTINCT FROM OLD.started_at
       AND NOT (
           OLD.started_at IS NULL
           AND OLD.status = 'reserved'
           AND NEW.status = 'sending'
           AND NEW.started_at IS NOT NULL
       ) THEN
        RAISE EXCEPTION 'PK spend start time is immutable';
    END IF;
    IF NEW.report_id IS DISTINCT FROM OLD.report_id
       AND NOT (
           OLD.report_id IS NULL
           AND OLD.status IN ('reserved', 'sending', 'uncertain')
           AND NEW.status IN ('settled', 'released', 'uncertain')
           AND NEW.report_id IS NOT NULL
       ) THEN
        RAISE EXCEPTION 'PK spend report identity is immutable';
    END IF;
    IF OLD.status IN ('settled', 'released') THEN
        RAISE EXCEPTION 'Terminal PK spend authorization is immutable';
    END IF;
    IF NEW.status = OLD.status THEN
        IF OLD.status = 'uncertain'
           AND OLD.report_id IS NULL
           AND NEW.report_id IS NOT NULL
           AND NEW.outcome_reason IS NOT NULL THEN
            RETURN NEW;
        END IF;
        IF NEW IS DISTINCT FROM OLD THEN
            RAISE EXCEPTION 'PK spend authorization metadata requires a state transition';
        END IF;
        RETURN NEW;
    END IF;
    IF (OLD.status = 'reserved' AND NEW.status IN ('sending', 'released'))
       OR (OLD.status = 'sending' AND NEW.status IN ('settled', 'uncertain'))
       OR (OLD.status = 'uncertain' AND NEW.status IN ('settled', 'released')) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Illegal PK spend authorization transition: % -> %', OLD.status, NEW.status;
END;
$$;

DROP TRIGGER IF EXISTS pk_spend_authorizations_transition_guard ON pk_spend_authorizations;
CREATE TRIGGER pk_spend_authorizations_transition_guard
BEFORE UPDATE ON pk_spend_authorizations
FOR EACH ROW EXECUTE FUNCTION enforce_pk_spend_authorization_transition();

ALTER TABLE pk_gift_logs
    ADD COLUMN IF NOT EXISTS authorization_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS runner_generation VARCHAR(100),
    ADD COLUMN IF NOT EXISTS origin_worker_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS reporting_worker_id VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pk_gift_logs_authorization_unique
    ON pk_gift_logs (authorization_id)
    WHERE authorization_id IS NOT NULL;

DROP TRIGGER IF EXISTS pk_gift_logs_append_only ON pk_gift_logs;
CREATE TRIGGER pk_gift_logs_append_only
BEFORE UPDATE OR DELETE ON pk_gift_logs
FOR EACH ROW EXECUTE FUNCTION reject_balance_log_mutation();

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id BIGSERIAL PRIMARY KEY,
    request_id VARCHAR(200),
    admin_username VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    target_username VARCHAR(50),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created
    ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target
    ON admin_audit_log (target_username, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_audit_request_action
    ON admin_audit_log (request_id, action)
    WHERE request_id IS NOT NULL;

DROP TRIGGER IF EXISTS admin_audit_log_append_only ON admin_audit_log;
CREATE TRIGGER admin_audit_log_append_only
BEFORE UPDATE OR DELETE ON admin_audit_log
FOR EACH ROW EXECUTE FUNCTION reject_balance_log_mutation();

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL REFERENCES users(username),
    token_hash CHAR(64) NOT NULL UNIQUE,
    password_fingerprint CHAR(64) NOT NULL,
    issued_by VARCHAR(50) NOT NULL REFERENCES users(username),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_active
    ON password_reset_tokens (username, expires_at DESC)
    WHERE used_at IS NULL AND revoked_at IS NULL;

ALTER TABLE dictation_progress
    ADD COLUMN IF NOT EXISTS question_id TEXT,
    ADD COLUMN IF NOT EXISTS question_token_hash CHAR(64),
    ADD COLUMN IF NOT EXISTS bank_version CHAR(64),
    ADD COLUMN IF NOT EXISTS question_issued_at TIMESTAMPTZ;

ALTER TABLE dictation_sessions
    ADD COLUMN IF NOT EXISTS bank_version CHAR(64),
    ADD COLUMN IF NOT EXISTS question_snapshot JSONB,
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE dictation_submissions
    ADD COLUMN IF NOT EXISTS bank_version CHAR(64),
    ADD COLUMN IF NOT EXISTS upload_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS session_version INTEGER,
    ADD COLUMN IF NOT EXISTS review_version INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(50);

WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY session_id ORDER BY created_at, id
           )::INTEGER AS derived_version
    FROM dictation_submissions
    WHERE session_id IS NOT NULL AND session_version IS NULL
)
UPDATE dictation_submissions AS submission
SET session_version = ranked.derived_version
FROM ranked
WHERE submission.id = ranked.id;

UPDATE dictation_sessions AS session
SET version = GREATEST(session.version, versions.max_version)
FROM (
    SELECT session_id, MAX(session_version)::INTEGER AS max_version
    FROM dictation_submissions
    WHERE session_id IS NOT NULL
    GROUP BY session_id
) AS versions
WHERE session.id = versions.session_id;

CREATE TABLE IF NOT EXISTS dictation_uploads (
    id VARCHAR(64) PRIMARY KEY,
    submission_id INTEGER NOT NULL UNIQUE REFERENCES dictation_submissions(id),
    storage_path TEXT NOT NULL UNIQUE,
    content_sha256 CHAR(64) NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 1572864),
    width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 2048),
    height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 2048),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE dictation_uploads
    ADD COLUMN IF NOT EXISTS content BYTEA;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'dictation_uploads'::regclass
          AND conname = 'dictation_uploads_content_size_check'
    ) THEN
        ALTER TABLE dictation_uploads
            ADD CONSTRAINT dictation_uploads_content_size_check
            CHECK (content IS NULL OR octet_length(content) BETWEEN 1 AND 1572864)
            NOT VALID;
    END IF;
END
$$;
ALTER TABLE dictation_uploads VALIDATE CONSTRAINT dictation_uploads_content_size_check;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'dictation_progress'::regclass
          AND conname = 'dictation_progress_level_check'
    ) THEN
        ALTER TABLE dictation_progress
            ADD CONSTRAINT dictation_progress_level_check CHECK (level BETWEEN 1 AND 3) NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'dictation_sessions'::regclass
          AND conname = 'dictation_sessions_result_check'
    ) THEN
        ALTER TABLE dictation_sessions
            ADD CONSTRAINT dictation_sessions_result_check
            CHECK (result IN ('in_progress', 'passed', 'failed')) NOT VALID;
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'dictation_submissions'::regclass
          AND conname = 'dictation_submissions_status_check'
          AND pg_get_constraintdef(oid) NOT LIKE '%superseded%'
    ) THEN
        ALTER TABLE dictation_submissions
            DROP CONSTRAINT dictation_submissions_status_check;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'dictation_submissions'::regclass
          AND conname = 'dictation_submissions_status_check'
    ) THEN
        ALTER TABLE dictation_submissions
            ADD CONSTRAINT dictation_submissions_status_check
            CHECK (status IN ('pending', 'correct', 'wrong', 'rewrite', 'superseded')) NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'dictation_sessions'::regclass
          AND conname = 'dictation_sessions_version_check'
    ) THEN
        ALTER TABLE dictation_sessions
            ADD CONSTRAINT dictation_sessions_version_check CHECK (version >= 0) NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'dictation_submissions'::regclass
          AND conname = 'dictation_submissions_review_version_check'
    ) THEN
        ALTER TABLE dictation_submissions
            ADD CONSTRAINT dictation_submissions_review_version_check
            CHECK (review_version BETWEEN 0 AND 1) NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'dictation_submissions'::regclass
          AND conname = 'dictation_submissions_session_version_check'
    ) THEN
        ALTER TABLE dictation_submissions
            ADD CONSTRAINT dictation_submissions_session_version_check
            CHECK (session_id IS NULL OR session_version > 0) NOT VALID;
    END IF;
END
$$;

ALTER TABLE dictation_progress VALIDATE CONSTRAINT dictation_progress_level_check;
ALTER TABLE dictation_sessions VALIDATE CONSTRAINT dictation_sessions_result_check;
ALTER TABLE dictation_submissions VALIDATE CONSTRAINT dictation_submissions_status_check;
ALTER TABLE dictation_sessions VALIDATE CONSTRAINT dictation_sessions_version_check;
ALTER TABLE dictation_submissions VALIDATE CONSTRAINT dictation_submissions_review_version_check;
ALTER TABLE dictation_submissions VALIDATE CONSTRAINT dictation_submissions_session_version_check;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dictation_sessions_one_active_per_user
    ON dictation_sessions (username)
    WHERE result = 'in_progress';

CREATE UNIQUE INDEX IF NOT EXISTS idx_dictation_submissions_session_version
    ON dictation_submissions (session_id, session_version)
    WHERE session_id IS NOT NULL AND session_version IS NOT NULL;

ALTER TABLE ip_activities
    ADD COLUMN IF NOT EXISTS request_count INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'ip_activities'::regclass
          AND conname = 'ip_activities_request_count_check'
    ) THEN
        ALTER TABLE ip_activities
            ADD CONSTRAINT ip_activities_request_count_check
            CHECK (request_count BETWEEN 1 AND 1000000) NOT VALID;
    END IF;
END
$$;
ALTER TABLE ip_activities VALIDATE CONSTRAINT ip_activities_request_count_check;

CREATE TABLE IF NOT EXISTS rate_limit_counters (
    namespace VARCHAR(80) NOT NULL,
    key_hash CHAR(64) NOT NULL,
    total_hits INTEGER NOT NULL CHECK (total_hits >= 0),
    reset_time TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (namespace, key_hash)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_counters_expiry
    ON rate_limit_counters (reset_time);

-- Legacy columns stored Asia/Shanghai wall-clock values in TIMESTAMP fields.
-- Convert those instants once, then keep all event times as TIMESTAMPTZ/UTC.
DO $$
DECLARE
    current_type TEXT;
BEGIN
    SELECT data_type INTO current_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'submissions'
      AND column_name = 'submitted_at';

    IF current_type = 'text' THEN
        -- Fail the migration instead of silently discarding an unparseable
        -- historical leaderboard timestamp.
        ALTER TABLE submissions
            ALTER COLUMN submitted_at TYPE TIMESTAMPTZ
            USING submitted_at::TIMESTAMPTZ;
    ELSIF current_type = 'timestamp without time zone' THEN
        ALTER TABLE submissions
            ALTER COLUMN submitted_at TYPE TIMESTAMPTZ
            USING submitted_at AT TIME ZONE 'Asia/Shanghai';
    END IF;
END
$$;

DO $$
DECLARE
    target RECORD;
    current_type TEXT;
BEGIN
    FOR target IN
        SELECT * FROM (VALUES
            ('duel_logs', 'created_at', true),
            ('flip_logs', 'created_at', true),
            ('flip_states', 'created_at', true),
            ('flip_states', 'updated_at', true),
            ('pk_gift_logs', 'created_at', true),
            ('pk_runner_state', 'updated_at', true),
            ('pk_tasks', 'created_at', true),
            ('pk_tasks', 'processed_at', false),
            ('spin_results', 'created_at', true),
            ('stone_logs', 'created_at', true),
            ('stone_states', 'created_at', true),
            ('stone_states', 'updated_at', true),
            ('users', 'created_at', true),
            ('users', 'last_failure_time', false),
            ('users', 'locked_until', false),
            ('wish_inventory', 'expires_at', false),
            ('wish_inventory', 'created_at', true),
            ('wish_inventory', 'updated_at', true),
            ('wish_inventory', 'sent_at', false),
            ('wish_progress', 'last_success_at', false),
            ('wish_progress', 'created_at', true),
            ('wish_progress', 'updated_at', true),
            ('wish_results', 'created_at', true),
            ('wish_sessions', 'created_at', true)
        ) AS columns_to_convert(table_name, column_name, set_now_default)
    LOOP
        SELECT data_type INTO current_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = target.table_name
          AND column_name = target.column_name;

        IF current_type = 'timestamp without time zone' THEN
            EXECUTE format(
                'ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT',
                target.table_name,
                target.column_name
            );
            EXECUTE format(
                'ALTER TABLE %I ALTER COLUMN %I TYPE TIMESTAMPTZ USING %I AT TIME ZONE %L',
                target.table_name,
                target.column_name,
                target.column_name,
                'Asia/Shanghai'
            );
            IF target.set_now_default THEN
                EXECUTE format(
                    'ALTER TABLE %I ALTER COLUMN %I SET DEFAULT NOW()',
                    target.table_name,
                    target.column_name
                );
            END IF;
        END IF;
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION valid_stone_slots(candidate JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
    item JSONB;
    color TEXT;
BEGIN
    IF jsonb_typeof(candidate) <> 'array' OR jsonb_array_length(candidate) <> 6 THEN
        RETURN FALSE;
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(candidate)
    LOOP
        IF item = 'null'::jsonb THEN
            CONTINUE;
        END IF;
        IF jsonb_typeof(item) <> 'string' THEN
            RETURN FALSE;
        END IF;
        color := item #>> '{}';
        IF color NOT IN ('red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple') THEN
            RETURN FALSE;
        END IF;
    END LOOP;
    RETURN TRUE;
END
$$;

CREATE OR REPLACE FUNCTION valid_flip_state(
    board_value JSONB,
    flipped_value JSONB,
    stored_good INTEGER,
    stored_bad INTEGER,
    stored_ended BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
    index_value INTEGER;
    board_item JSONB;
    flipped_item JSONB;
    flipped_good INTEGER := 0;
    flipped_bad INTEGER := 0;
    board_good INTEGER := 0;
    board_bad INTEGER := 0;
BEGIN
    IF jsonb_typeof(board_value) <> 'array' OR jsonb_array_length(board_value) <> 9
       OR jsonb_typeof(flipped_value) <> 'array' OR jsonb_array_length(flipped_value) <> 9 THEN
        RETURN FALSE;
    END IF;
    FOR index_value IN 0..8
    LOOP
        board_item := board_value -> index_value;
        flipped_item := flipped_value -> index_value;
        IF board_item <> 'null'::jsonb
           AND (jsonb_typeof(board_item) <> 'string'
                OR board_item #>> '{}' NOT IN ('good', 'bad')) THEN
            RETURN FALSE;
        END IF;
        IF jsonb_typeof(flipped_item) <> 'boolean' THEN
            RETURN FALSE;
        END IF;
        IF board_item = '"good"'::jsonb THEN
            board_good := board_good + 1;
        ELSIF board_item = '"bad"'::jsonb THEN
            board_bad := board_bad + 1;
        END IF;
        IF flipped_item = 'true'::jsonb THEN
            IF board_item = '"good"'::jsonb THEN
                flipped_good := flipped_good + 1;
            ELSIF board_item = '"bad"'::jsonb THEN
                flipped_bad := flipped_bad + 1;
            ELSE
                RETURN FALSE;
            END IF;
        END IF;
    END LOOP;
    RETURN board_good <= 7
       AND board_bad <= 2
       AND stored_good = flipped_good
       AND stored_bad = flipped_bad
       AND stored_good BETWEEN 0 AND 7
       AND stored_bad BETWEEN 0 AND 2
       AND (stored_bad = 0 OR stored_ended)
       AND (stored_good < 7 OR stored_ended);
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'stone_states'::regclass
          AND conname = 'stone_states_shape_check'
    ) THEN
        ALTER TABLE stone_states
            ADD CONSTRAINT stone_states_shape_check
            CHECK (valid_stone_slots(slots)) NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'flip_states'::regclass
          AND conname = 'flip_states_shape_check'
    ) THEN
        ALTER TABLE flip_states
            ADD CONSTRAINT flip_states_shape_check
            CHECK (valid_flip_state(board, flipped, good_count, bad_count, ended)) NOT VALID;
    END IF;
END
$$;

ALTER TABLE stone_states VALIDATE CONSTRAINT stone_states_shape_check;
ALTER TABLE flip_states VALIDATE CONSTRAINT flip_states_shape_check;

COMMIT;
