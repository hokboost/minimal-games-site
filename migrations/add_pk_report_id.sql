CREATE TABLE IF NOT EXISTS pk_gift_logs (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    room_id VARCHAR(50),
    gift_ids JSONB NOT NULL,
    ticket_count INTEGER,
    script_name VARCHAR(50),
    success BOOLEAN,
    reason TEXT,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Shanghai')
);

ALTER TABLE pk_gift_logs
ADD COLUMN IF NOT EXISTS report_id VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pk_gift_logs_report_id_unique
ON pk_gift_logs(report_id);
