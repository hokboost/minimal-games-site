ALTER TABLE dictation_submissions
ADD COLUMN IF NOT EXISTS admin_message TEXT;
