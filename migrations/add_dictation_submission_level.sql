DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'dictation_submissions' AND column_name = 'level'
    ) THEN
        ALTER TABLE dictation_submissions ADD COLUMN level INTEGER DEFAULT 1;
        UPDATE dictation_submissions SET level = 1 WHERE level IS NULL;
    END IF;
END $$;
