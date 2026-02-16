DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'dictation_submissions' AND column_name = 'set_id'
    ) THEN
        ALTER TABLE dictation_submissions ADD COLUMN set_id INTEGER;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'dictation_submissions' AND column_name = 'session_id'
    ) THEN
        ALTER TABLE dictation_submissions ADD COLUMN session_id INTEGER;
    END IF;
END $$;
