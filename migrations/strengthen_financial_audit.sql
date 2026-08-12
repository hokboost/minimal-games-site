BEGIN;

ALTER TABLE balance_logs
    ADD COLUMN IF NOT EXISTS request_id VARCHAR(200);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS deactivated BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_balance_logs_request_id
    ON balance_logs(request_id)
    WHERE request_id IS NOT NULL;

UPDATE balance_logs SET created_at = NOW() WHERE created_at IS NULL;
ALTER TABLE balance_logs ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE balance_logs ALTER COLUMN created_at SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'balance_logs'::regclass
          AND conname = 'balance_logs_amount_matches_check'
    ) THEN
        ALTER TABLE balance_logs
            ADD CONSTRAINT balance_logs_amount_matches_check
            CHECK (amount = balance_after - balance_before) NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'balance_logs'::regclass
          AND conname = 'balance_logs_nonnegative_check'
    ) THEN
        ALTER TABLE balance_logs
            ADD CONSTRAINT balance_logs_nonnegative_check
            CHECK (balance_before >= 0 AND balance_after >= 0) NOT VALID;
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS financial_audit_cutovers (
    version VARCHAR(50) PRIMARY KEY,
    established_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_balance_log_id BIGINT NOT NULL,
    user_count INTEGER NOT NULL,
    legacy_arithmetic_mismatches INTEGER NOT NULL,
    notes TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS balance_audit_baselines (
    version VARCHAR(50) NOT NULL,
    username VARCHAR(255) NOT NULL,
    balance NUMERIC NOT NULL CHECK (balance >= 0),
    last_balance_log_id BIGINT NOT NULL,
    established_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (version, username)
);

INSERT INTO financial_audit_cutovers (
    version, last_balance_log_id, user_count, legacy_arithmetic_mismatches, notes
)
SELECT 'append-only-v1',
       COALESCE(MAX(id), 0),
       (SELECT COUNT(*)::INTEGER FROM users),
       COUNT(*) FILTER (WHERE amount <> balance_after - balance_before)::INTEGER,
       'Historical rows before this checkpoint may contain legacy gaps. New rows are constrained and append-only.'
FROM balance_logs
ON CONFLICT (version) DO NOTHING;

INSERT INTO balance_audit_baselines (
    version, username, balance, last_balance_log_id
)
SELECT 'append-only-v1',
       users.username,
       users.balance,
       COALESCE((SELECT MAX(id) FROM balance_logs), 0)
FROM users
ON CONFLICT (version, username) DO NOTHING;

CREATE OR REPLACE FUNCTION establish_new_user_balance_audit_baseline()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    previous_log_id BIGINT;
BEGIN
    SELECT COALESCE(MAX(id), 0)
    INTO previous_log_id
    FROM balance_logs
    WHERE username = NEW.username;

    INSERT INTO balance_audit_baselines (
        version, username, balance, last_balance_log_id
    ) VALUES (
        'append-only-v1', NEW.username, NEW.balance, previous_log_id
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_establish_balance_audit_baseline ON users;
CREATE TRIGGER users_establish_balance_audit_baseline
AFTER INSERT ON users
FOR EACH ROW EXECUTE FUNCTION establish_new_user_balance_audit_baseline();

ALTER TABLE idempotency_keys
    ADD COLUMN IF NOT EXISTS failure_reason TEXT;

ALTER TABLE idempotency_keys
    DROP CONSTRAINT IF EXISTS idempotency_keys_status_check;
ALTER TABLE idempotency_keys
    ADD CONSTRAINT idempotency_keys_status_check
    CHECK (status IN ('pending', 'completed', 'indeterminate'));

UPDATE idempotency_keys
SET status = 'indeterminate',
    response_status = 409,
    response_body = '{"success":false,"message":"请求处理结果无法自动确认，请联系管理员核对账务"}'::jsonb,
    failure_reason = '服务在写入最终幂等响应前中断',
    updated_at = NOW()
WHERE status = 'pending'
  AND updated_at < NOW() - INTERVAL '1 hour';

-- January's legacy exchange route deducted these tasks without a ledger row,
-- then left them permanently locked because no room was bound. Refund each
-- user's still-unsettled total once and preserve the affected task IDs.
DO $$
DECLARE
    refund RECORD;
    balance_after_value NUMERIC;
BEGIN
    FOR refund IN
        SELECT username,
               SUM(cost)::NUMERIC AS amount,
               jsonb_agg(id ORDER BY id) AS task_ids
        FROM gift_exchanges
        WHERE status = 'funds_locked'
          AND delivery_status = 'no_room'
        GROUP BY username
    LOOP
        UPDATE users
        SET balance = balance + refund.amount
        WHERE username = refund.username
        RETURNING balance INTO balance_after_value;

        IF FOUND THEN
            INSERT INTO balance_logs (
                username, operation_type, amount, balance_before, balance_after,
                description, game_data, request_id, created_at
            ) VALUES (
                refund.username,
                'legacy_gift_no_room_refund',
                refund.amount,
                balance_after_value - refund.amount,
                balance_after_value,
                '退还旧版未绑定房间且从未发送的礼物预扣款',
                jsonb_build_object('gift_exchange_ids', refund.task_ids),
                'migration:legacy-gift-no-room-refund',
                NOW()
            );
        END IF;

        UPDATE gift_exchanges
        SET status = 'failed',
            delivery_status = 'failed',
            failure_reason = '旧版任务未绑定房间且从未发送，已自动退款',
            processed_at = NOW(),
            updated_at = NOW()
        WHERE username = refund.username
          AND status = 'funds_locked'
          AND delivery_status = 'no_room';
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION reject_balance_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'balance_logs is append-only';
END;
$$;

DROP TRIGGER IF EXISTS balance_logs_append_only ON balance_logs;
CREATE TRIGGER balance_logs_append_only
BEFORE UPDATE OR DELETE ON balance_logs
FOR EACH ROW EXECUTE FUNCTION reject_balance_log_mutation();

DROP TRIGGER IF EXISTS financial_audit_cutovers_append_only ON financial_audit_cutovers;
CREATE TRIGGER financial_audit_cutovers_append_only
BEFORE UPDATE OR DELETE ON financial_audit_cutovers
FOR EACH ROW EXECUTE FUNCTION reject_balance_log_mutation();

DROP TRIGGER IF EXISTS balance_audit_baselines_append_only ON balance_audit_baselines;
CREATE TRIGGER balance_audit_baselines_append_only
BEFORE UPDATE OR DELETE ON balance_audit_baselines
FOR EACH ROW EXECUTE FUNCTION reject_balance_log_mutation();

COMMENT ON TABLE balance_logs IS
    'Append-only balance ledger. Corrections must be new compensating entries.';
COMMENT ON COLUMN balance_logs.request_id IS
    'Browser idempotency key or signed worker nonce associated with the mutation.';

COMMIT;
