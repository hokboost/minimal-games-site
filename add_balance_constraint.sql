ALTER TABLE users ADD CONSTRAINT check_balance_non_negative CHECK (balance >= 0);
