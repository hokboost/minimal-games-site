DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'dictation_submissions' AND column_name = 'image_path'
    ) THEN
        ALTER TABLE dictation_submissions ADD COLUMN image_path TEXT;
    END IF;
END $$;
