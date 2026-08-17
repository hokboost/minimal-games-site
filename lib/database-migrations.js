'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIGRATION_LOCK = "hashtextextended('minimal_games_schema_migration', 0)";
const BASE_MIGRATION = '000_base_schema.sql';
const MIGRATIONS = Object.freeze([
    'add_idempotency_key.sql',
    'add_registration_ip.sql',
    'create_ux_analytics.sql',
    'create_wish_tables.sql',
    'create_idempotency_keys.sql',
    'create_quiz_runtime_tables.sql',
    'add_pk_report_id.sql',
    'strengthen_financial_audit.sql',
    'harden_money_and_workers.sql',
    'audit_2026_08_13_hardening.sql',
    'add_doudizhu_games.sql',
    'add_task_cards_account_locks_and_earnings.sql',
    'add_adventure_progression.sql',
    'add_quest_v2_foundation.sql',
    'extend_quest_v2_game_events.sql',
    'add_creator_foundation.sql',
    'add_streamer_quest_engine_v2.sql',
    'add_story_world_season_one.sql',
    'add_live_interaction_platform.sql',
    'add_streamer_games_batch_one.sql',
    'add_streamer_games_batch_two.sql',
    'add_streamer_reward_catalog.sql',
    'add_streamer_achievements_and_archives.sql',
    'add_streamer_phase9_hardening.sql',
    'add_streamer_security_quest_windows.sql',
    'add_streamer_security_live_acl.sql',
    'add_streamer_security_quest_lifecycle.sql',
    'add_streamer_reward_security_outbox.sql',
    'add_streamer_achievement_producers.sql',
    'add_streamer_security_communication_privacy.sql',
    'add_streamer_story_progression_scopes.sql',
    'add_streamer_game_daily_calendar.sql'
]);

function readMigration(filename) {
    const migrationPath = path.join(__dirname, '..', 'migrations', filename);
    const stat = fs.lstatSync(migrationPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error(`Invalid migration file: ${filename}`);
    }
    return fs.readFileSync(migrationPath, 'utf8');
}

function migrationChecksum(sql) {
    return crypto.createHash('sha256').update(sql).digest('hex');
}

function migrationTransactionBody(sql) {
    let normalized = String(sql).replace(/^\uFEFF/, '').trim();
    if (/^BEGIN\s*;/i.test(normalized) && /COMMIT\s*;$/i.test(normalized)) {
        normalized = normalized
            .replace(/^BEGIN\s*;/i, '')
            .replace(/COMMIT\s*;$/i, '')
            .trim();
    }
    return normalized
        .replace(/^\s*SET\s+statement_timeout\s*=\s*0\s*;\s*$/gmi, '')
        .replace(/^\s*SET\s+lock_timeout\s*=\s*0\s*;\s*$/gmi, '')
        .replace(
            /^(\s*)SET\s+(idle_in_transaction_session_timeout|client_encoding|standard_conforming_strings|search_path|check_function_bodies|xmloption|client_min_messages|row_security|default_tablespace|default_table_access_method)\b/gmi,
            '$1SET LOCAL $2'
        );
}

async function ensureMigrationTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS minimal_games_schema_migrations (
            filename TEXT PRIMARY KEY,
            checksum CHAR(64) NOT NULL,
            status TEXT NOT NULL DEFAULT 'applied',
            attempts INTEGER NOT NULL DEFAULT 1,
            started_at TIMESTAMPTZ,
            finished_at TIMESTAMPTZ,
            applied_at TIMESTAMPTZ,
            error_code TEXT
        )
    `);
    await client.query(`
        ALTER TABLE minimal_games_schema_migrations
            ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'applied',
            ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 1,
            ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS error_code TEXT
    `);
    await client.query(`
        ALTER TABLE minimal_games_schema_migrations
            ALTER COLUMN applied_at DROP DEFAULT,
            ALTER COLUMN applied_at DROP NOT NULL
    `);
    await client.query(`
        UPDATE minimal_games_schema_migrations
        SET status = COALESCE(status, 'applied'),
            attempts = GREATEST(COALESCE(attempts, 1), 1),
            started_at = COALESCE(started_at, applied_at),
            finished_at = COALESCE(finished_at, applied_at)
    `);
    await client.query(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conrelid = 'minimal_games_schema_migrations'::regclass
                  AND conname = 'minimal_games_schema_migrations_state_check'
            ) THEN
                ALTER TABLE minimal_games_schema_migrations
                    ADD CONSTRAINT minimal_games_schema_migrations_state_check
                    CHECK (
                        status IN ('running', 'applied', 'failed')
                        AND attempts >= 1
                        AND (status <> 'applied' OR applied_at IS NOT NULL)
                    );
            END IF;
        END
        $$
    `);
}

async function registerLegacyBaseline(client) {
    const sql = readMigration(BASE_MIGRATION);
    const checksum = migrationChecksum(sql);
    const existing = await client.query(
        'SELECT checksum, status FROM minimal_games_schema_migrations WHERE filename = $1',
        [BASE_MIGRATION]
    );
    if (existing.rows.length > 0) {
        if (existing.rows[0].checksum !== checksum || existing.rows[0].status !== 'applied') {
            throw new Error(`Invalid baseline migration record: ${BASE_MIGRATION}`);
        }
        return;
    }
    await client.query(`
        INSERT INTO minimal_games_schema_migrations (
            filename, checksum, status, attempts, started_at, finished_at, applied_at
        ) VALUES ($1, $2, 'applied', 1, NOW(), NOW(), NOW())
    `, [BASE_MIGRATION, checksum]);
}

function migrationErrorCode(error) {
    const code = String(error?.code || 'migration_failed');
    return /^[A-Za-z0-9_]{3,40}$/.test(code) ? code : 'migration_failed';
}

async function applyTrackedMigration(client, filename, onMigration) {
    const sql = readMigration(filename);
    const checksum = migrationChecksum(sql);
    const existing = await client.query(`
        SELECT checksum, status
        FROM minimal_games_schema_migrations
        WHERE filename = $1
    `, [filename]);
    if (existing.rows.length > 0) {
        if (existing.rows[0].checksum !== checksum) {
            throw new Error(`Applied migration was modified: ${filename}`);
        }
        if (existing.rows[0].status === 'applied') return;
        await client.query(`
            UPDATE minimal_games_schema_migrations
            SET status = 'running', attempts = attempts + 1,
                started_at = NOW(), finished_at = NULL, applied_at = NULL, error_code = NULL
            WHERE filename = $1
        `, [filename]);
    } else {
        await client.query(`
            INSERT INTO minimal_games_schema_migrations (
                filename, checksum, status, attempts, started_at
            ) VALUES ($1, $2, 'running', 1, NOW())
        `, [filename, checksum]);
    }

    let commitAttempted = false;
    try {
        onMigration(filename);
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout = '10s'");
        await client.query("SET LOCAL statement_timeout = '120s'");
        await client.query(migrationTransactionBody(sql));
        const applied = await client.query(`
            UPDATE minimal_games_schema_migrations
            SET status = 'applied', finished_at = NOW(), applied_at = NOW(), error_code = NULL
            WHERE filename = $1 AND status = 'running'
        `, [filename]);
        if (applied.rowCount !== 1) {
            throw new Error(`Migration state record was lost: ${filename}`);
        }
        commitAttempted = true;
        const commitResult = await client.query('COMMIT');
        if (commitResult.command !== 'COMMIT') {
            throw new Error(`Migration transaction did not commit: ${filename}`);
        }
    } catch (error) {
        if (commitAttempted) {
            // A lost COMMIT response is ambiguous: the server may already have
            // committed both the schema and its applied marker. Never overwrite
            // that durable marker with a guessed failure state.
            const state = await client.query(`
                SELECT status
                FROM minimal_games_schema_migrations
                WHERE filename = $1
            `, [filename]).catch(() => null);
            if (state?.rows[0]?.status === 'applied') return;
            throw error;
        }
        await client.query('ROLLBACK').catch(() => {});
        await client.query(`
            UPDATE minimal_games_schema_migrations
            SET status = 'failed', finished_at = NOW(), error_code = $2
            WHERE filename = $1
        `, [filename, migrationErrorCode(error)]).catch(() => {});
        throw error;
    }
}

async function applyDatabaseMigrations(pool, { onMigration = () => {} } = {}) {
    const client = await pool.connect();
    let locked = false;
    try {
        await client.query(`SELECT pg_advisory_lock(${MIGRATION_LOCK})`);
        locked = true;
        await ensureMigrationTable(client);
        const schemaState = await client.query(
            "SELECT to_regclass('public.users') AS users_table"
        );
        if (schemaState.rows[0]?.users_table) {
            await registerLegacyBaseline(client);
        } else {
            await applyTrackedMigration(client, BASE_MIGRATION, onMigration);
        }
        for (const filename of MIGRATIONS) {
            await applyTrackedMigration(client, filename, onMigration);
        }
    } finally {
        try {
            if (locked) {
                await client.query('ROLLBACK').catch(() => {});
                await client.query(`SELECT pg_advisory_unlock(${MIGRATION_LOCK})`);
            }
        } finally {
            client.release();
        }
    }
}

async function assertDatabaseSchemaCurrent(pool) {
    const expected = [BASE_MIGRATION, ...MIGRATIONS].map((filename) => ({
        filename,
        checksum: migrationChecksum(readMigration(filename))
    }));
    const result = await pool.query(`
        SELECT filename, checksum, status
        FROM minimal_games_schema_migrations
        WHERE filename = ANY($1::text[])
    `, [expected.map((migration) => migration.filename)]);
    const applied = new Map(result.rows.map((row) => [row.filename, row]));
    for (const migration of expected) {
        const row = applied.get(migration.filename);
        if (!row || row.status !== 'applied' || row.checksum !== migration.checksum) {
            throw new Error(`Database schema is not current: ${migration.filename}`);
        }
    }
    return true;
}

module.exports = {
    BASE_MIGRATION,
    MIGRATIONS,
    applyTrackedMigration,
    applyDatabaseMigrations,
    assertDatabaseSchemaCurrent,
    migrationTransactionBody
};
