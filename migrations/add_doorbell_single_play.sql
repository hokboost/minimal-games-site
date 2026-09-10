BEGIN;

ALTER TABLE doorbell_runs ADD COLUMN bell_doors INTEGER[] NOT NULL DEFAULT '{}';
CREATE TABLE doorbell_audio_plays (
    run_id UUID NOT NULL REFERENCES doorbell_runs(id),
    door INTEGER NOT NULL CHECK (door BETWEEN 1 AND 8),
    kind TEXT NOT NULL CHECK (kind IN ('bell','original')),
    token UUID NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    PRIMARY KEY (run_id, door, kind)
);
-- Older rounds already used original-help once. Their help is intentionally not reissued.

COMMIT;
