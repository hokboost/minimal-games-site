-- Keep the exchange-specific key compatible with the API's 100-character limit.
ALTER TABLE gift_exchanges
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'gift_exchanges'
          AND column_name = 'idempotency_key'
          AND data_type = 'character varying'
          AND character_maximum_length < 100
    ) THEN
        ALTER TABLE gift_exchanges
            ALTER COLUMN idempotency_key TYPE VARCHAR(100);
    END IF;
END
$$;

COMMENT ON COLUMN gift_exchanges.idempotency_key IS
    'Idempotency key used to prevent duplicate exchange requests';

CREATE UNIQUE INDEX IF NOT EXISTS idx_gift_exchanges_idempotency
    ON gift_exchanges(username, idempotency_key);

-- Replaced by the full unique index above; PostgreSQL unique indexes already
-- allow multiple NULL values.
DROP INDEX IF EXISTS idx_gift_exchanges_idem;
