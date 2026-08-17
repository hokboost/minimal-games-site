'use strict';

require('dotenv').config();

const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { applyTrackedMigration } = require('../lib/database-migrations');
const { StreamerGameRepository } = require('../repositories/streamer-game-repository');
const { StreamerGameService } = require('../services/streamer-game-service');
const { DisposableDatabase } = require('../tests/helpers/integration-environment');

if (process.env.ALLOW_DATABASE_CREATE_TEST !== 'true') {
    throw new Error('Set ALLOW_DATABASE_CREATE_TEST=true to run the disposable daily calendar test');
}

const uuid = () => crypto.randomUUID();

async function transaction(pool, work) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const value = await work(client);
        await client.query('COMMIT');
        return value;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

async function createCreator(database, username, timezone) {
    const user = await database.createUser({ username });
    await database.pool.query(`INSERT INTO creator_profiles(
        user_id,display_name,timezone,live_interaction_opt_in
    ) SELECT id,$2,$3,FALSE FROM users WHERE username=$1`, [username, `Daily ${username}`, timezone]);
    return user;
}

function command(index) {
    return { commandId: uuid(), gameId: 'dream-maze', challengeId: index % 2
        ? 'moss-library' : 'rain-station', difficulty: 'gentle', mode: 'solo' };
}

async function calendarRow(pool, runId) {
    return (await pool.query(`SELECT daily_key::TEXT,daily_timezone,
        daily_window_start,daily_window_end FROM streamer_game_runs WHERE id=$1`, [runId])).rows[0];
}

async function verifyFreshRuntime(database) {
    await createCreator(database, 'daily_toronto_spring', 'America/Toronto');
    await createCreator(database, 'daily_toronto_fall', 'America/Toronto');
    await createCreator(database, 'daily_shanghai', 'Asia/Shanghai');
    await createCreator(database, 'daily_timezone_switch', 'UTC');

    let now = new Date('2026-03-08T16:00:00.000Z');
    const repository = new StreamerGameRepository({ pool: database.pool });
    const service = new StreamerGameService({ repository, clock: () => now });
    await service.ensureCatalog();
    const concurrent = await Promise.allSettled([
        service.start('daily_toronto_spring', 'dream-maze', command(1)),
        service.start('daily_toronto_spring', 'dream-maze', command(2))
    ]);
    assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(concurrent.find(result => result.status === 'rejected').reason.code,
        'GAME_DAILY_ALREADY_PLAYED');
    const springRun = concurrent.find(result => result.status === 'fulfilled').value.run;
    const spring = await calendarRow(database.pool, springRun.id);
    assert.equal(spring.daily_key, '2026-03-08');
    assert.equal(spring.daily_timezone, 'America/Toronto');
    assert.equal(spring.daily_window_start.toISOString(), '2026-03-08T05:00:00.000Z');
    assert.equal(spring.daily_window_end.toISOString(), '2026-03-09T04:00:00.000Z');

    now = new Date('2026-11-01T17:00:00.000Z');
    const fallRun = await service.start('daily_toronto_fall', 'dream-maze', command(3));
    const fall = await calendarRow(database.pool, fallRun.run.id);
    assert.equal(fall.daily_key, '2026-11-01');
    assert.equal((fall.daily_window_end - fall.daily_window_start) / 3600000, 25);

    now = new Date('2026-08-16T16:30:00.000Z');
    const shanghaiRun = await service.start('daily_shanghai', 'dream-maze', command(4));
    const shanghai = await calendarRow(database.pool, shanghaiRun.run.id);
    assert.equal(shanghai.daily_key, '2026-08-17');
    assert.equal(shanghai.daily_timezone, 'Asia/Shanghai');
    assert.equal(shanghai.daily_window_start.toISOString(), '2026-08-16T16:00:00.000Z');

    now = new Date('2026-08-17T01:00:00.000Z');
    const utcRun = await service.start('daily_timezone_switch', 'dream-maze', command(5));
    await database.pool.query(`UPDATE streamer_game_runs SET status='failed',updated_at=NOW()
        WHERE id=$1`, [utcRun.run.id]);
    await database.pool.query(`UPDATE creator_profiles SET timezone='America/Toronto'
        WHERE user_id=(SELECT id FROM users WHERE username='daily_timezone_switch')`);
    await assert.rejects(service.start('daily_timezone_switch', 'dream-maze', command(6)),
        error => error?.code === 'GAME_DAILY_ALREADY_PLAYED');
    assert.equal(Number((await database.pool.query(`SELECT COUNT(*) count FROM streamer_game_runs run
        JOIN users account ON account.id=run.creator_user_id
        WHERE account.username='daily_timezone_switch' AND run.game_id='dream-maze'`)).rows[0].count), 1);

    now = new Date('2026-08-18T05:00:00.000Z');
    const afterOverlap = await service.start('daily_timezone_switch', 'dream-maze', command(7));
    const switched = await calendarRow(database.pool, afterOverlap.run.id);
    assert.equal(switched.daily_key, '2026-08-18');
    assert.equal(switched.daily_timezone, 'America/Toronto');
    assert.equal(switched.daily_window_start.toISOString(), '2026-08-18T04:00:00.000Z');

    const malformed = command(8);
    malformed.timezone = 'Pacific/Kiritimati';
    await assert.rejects(service.start('daily_timezone_switch', 'dream-maze', malformed),
        /Unexpected start command field/);
}

async function verifyHistoricalUtcBackfill(database) {
    await createCreator(database, 'daily_legacy', 'America/Toronto');
    let now = new Date('2026-08-17T12:00:00.000Z');
    const repository = new StreamerGameRepository({ pool: database.pool });
    const service = new StreamerGameService({ repository, clock: () => now });
    await service.ensureCatalog();
    const legacy = await service.start('daily_legacy', 'dream-maze', command(20));

    await transaction(database.pool, async client => {
        await client.query('ALTER TABLE streamer_game_runs DROP CONSTRAINT streamer_game_runs_daily_calendar_scope');
        await client.query('DROP INDEX streamer_game_runs_daily_maze_window_idx');
        await client.query(`ALTER TABLE streamer_game_runs DROP COLUMN daily_timezone,
            DROP COLUMN daily_window_start,DROP COLUMN daily_window_end`);
        await client.query(`DELETE FROM minimal_games_schema_migrations
            WHERE filename='add_streamer_game_daily_calendar.sql'`);
    });
    const before = await database.pool.query(`SELECT daily_key::TEXT FROM streamer_game_runs WHERE id=$1`,
        [legacy.run.id]);
    assert.equal(before.rows[0].daily_key, '2026-08-17');
    const client = await database.pool.connect();
    try {
        await applyTrackedMigration(client, 'add_streamer_game_daily_calendar.sql', () => {});
    } finally {
        client.release();
    }
    const upgraded = await calendarRow(database.pool, legacy.run.id);
    assert.equal(upgraded.daily_timezone, 'UTC');
    assert.equal(upgraded.daily_window_start.toISOString(), '2026-08-17T00:00:00.000Z');
    assert.equal(upgraded.daily_window_end.toISOString(), '2026-08-18T00:00:00.000Z');
    assert.equal((await database.pool.query(`SELECT status FROM minimal_games_schema_migrations
        WHERE filename='add_streamer_game_daily_calendar.sql'`)).rows[0].status, 'applied');
}

async function main() {
    const fresh = new DisposableDatabase('game_daily');
    const upgrade = new DisposableDatabase('game_daily_upgrade');
    try {
        await fresh.create();
        await verifyFreshRuntime(fresh);
        await upgrade.create();
        await verifyHistoricalUtcBackfill(upgrade);
        console.log('Streamer game creator-local daily calendar PostgreSQL tests passed');
    } finally {
        await fresh.close();
        await upgrade.close();
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
