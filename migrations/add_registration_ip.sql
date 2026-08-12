ALTER TABLE users
    ADD COLUMN IF NOT EXISTS registration_ip INET;

CREATE INDEX IF NOT EXISTS idx_users_registration_ip
    ON users (registration_ip)
    WHERE registration_ip IS NOT NULL;
