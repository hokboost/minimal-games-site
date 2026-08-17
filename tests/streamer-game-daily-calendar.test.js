'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    calendarKeyForInstant,
    dailyCalendarWindow
} = require('../domain/streamer-games/daily-calendar');
const { StreamerGameService } = require('../services/streamer-game-service');

const root = path.resolve(__dirname, '..');
const uuid = value => `10000000-0000-4000-a000-${String(value).padStart(12, '0')}`;

class CalendarMemoryRepository {
    constructor() {
        this.user = { id: 31, username: 'creator', authorized: true, deactivated: false,
            account_locked: false, is_admin: false, live_interaction_opt_in: false, timezone: 'UTC' };
        this.versions = new Map();
        this.runs = new Map();
        this.starts = new Map();
        this.events = [];
        this.tail = Promise.resolve();
    }
    snapshot() {
        return structuredClone({ versions: this.versions, runs: this.runs,
            starts: this.starts, events: this.events });
    }
    async withTransaction(work) {
        const prior = this.tail;
        let release;
        this.tail = new Promise(resolve => { release = resolve; });
        await prior;
        const snapshot = this.snapshot();
        try { return await work(this); } catch (error) {
            this.versions = snapshot.versions;
            this.runs = snapshot.runs;
            this.starts = snapshot.starts;
            this.events = snapshot.events;
            throw error;
        } finally { release(); }
    }
    async seedVersion(client, pack, contentHash) {
        this.versions.set(pack.gameId, { id: this.versions.size + 1, pack, contentHash });
        return this.versions.get(pack.gameId).id;
    }
    async lockAccounts(client, names) {
        return new Map(names.filter(Boolean).map(name => [name, this.user]));
    }
    async findStartCommand(client, actorId, gameId, commandId) {
        return this.starts.get(`${actorId}:${gameId}:${commandId}`) || null;
    }
    async findOverlappingDailyMazeRun(client, creatorUserId, windowStart, windowEnd) {
        const start = new Date(windowStart).getTime();
        const end = new Date(windowEnd).getTime();
        return [...this.runs.values()].find(run => run.creatorUserId === creatorUserId
            && run.gameId === 'dream-maze'
            && new Date(run.dailyWindowStart).getTime() < end
            && new Date(run.dailyWindowEnd).getTime() > start) || null;
    }
    async findActiveCreatorRun(client, creatorUserId, gameId) {
        return [...this.runs.values()].find(run => run.creatorUserId === creatorUserId
            && run.gameId === gameId && run.status === 'active') || null;
    }
    async createRun(client, value) {
        const version = this.versions.get(value.gameId);
        const run = { ...value, status: 'active', revision: 0, score: 0,
            contentHash: version.contentHash, contentSnapshot: version.pack };
        this.runs.set(run.id, run);
        return run;
    }
    async appendEvent(client, value) {
        const event = { ...value, sequence: this.events.length + 1 };
        this.events.push(event);
        return event;
    }
    async saveStartCommand(client, value) {
        this.starts.set(`${value.actorUserId}:${value.gameId}:${value.commandId}`, {
            semantic_hash: value.semanticHash,
            response_body: structuredClone(value.body)
        });
    }
    async insertAudit() {}
}

function startCommand(index) {
    return { commandId: uuid(index), gameId: 'dream-maze', challengeId: 'moss-library',
        difficulty: 'gentle', mode: 'solo' };
}

test('IANA daily windows use creator-local keys and preserve 23/24/25-hour calendar days', () => {
    const utc = dailyCalendarWindow(new Date('2026-08-17T12:00:00.000Z'), 'UTC');
    assert.deepEqual(utc, {
        calendarKey: '2026-08-17',
        timezone: 'UTC',
        windowStart: '2026-08-17T00:00:00.000Z',
        windowEnd: '2026-08-18T00:00:00.000Z'
    });
    const shanghai = dailyCalendarWindow(new Date('2026-08-16T16:30:00.000Z'), 'Asia/Shanghai');
    assert.equal(shanghai.calendarKey, '2026-08-17');
    assert.equal(shanghai.windowStart, '2026-08-16T16:00:00.000Z');
    assert.equal(shanghai.windowEnd, '2026-08-17T16:00:00.000Z');

    const spring = dailyCalendarWindow(new Date('2026-03-08T16:00:00.000Z'), 'America/Toronto');
    assert.equal(spring.calendarKey, '2026-03-08');
    assert.equal(spring.windowStart, '2026-03-08T05:00:00.000Z');
    assert.equal(spring.windowEnd, '2026-03-09T04:00:00.000Z');
    assert.equal((new Date(spring.windowEnd) - new Date(spring.windowStart)) / 3600000, 23);

    const fall = dailyCalendarWindow(new Date('2026-11-01T17:00:00.000Z'), 'America/Toronto');
    assert.equal(fall.calendarKey, '2026-11-01');
    assert.equal(fall.windowStart, '2026-11-01T04:00:00.000Z');
    assert.equal(fall.windowEnd, '2026-11-02T05:00:00.000Z');
    assert.equal((new Date(fall.windowEnd) - new Date(fall.windowStart)) / 3600000, 25);
    assert.equal(calendarKeyForInstant(new Date('2026-08-17T03:30:00.000Z'), 'America/Toronto'),
        '2026-08-16');
    assert.throws(() => dailyCalendarWindow(new Date(), 'Not/A_Timezone'), /timezone/i);
});

test('timezone change cannot create a second maze whose absolute daily window overlaps history', async () => {
    const repository = new CalendarMemoryRepository();
    let now = new Date('2026-08-17T01:00:00.000Z');
    const service = new StreamerGameService({ repository, clock: () => now });
    await service.ensureCatalog();
    const first = await service.start('creator', 'dream-maze', startCommand(1));
    assert.equal(first.run.state.dailyKey, '2026-08-17');
    const firstRun = repository.runs.get(first.run.id);
    assert.equal(firstRun.dailyTimezone, 'UTC');
    assert.equal(firstRun.dailyWindowStart, '2026-08-17T00:00:00.000Z');
    assert.equal(firstRun.dailyWindowEnd, '2026-08-18T00:00:00.000Z');
    firstRun.status = 'completed';

    repository.user.timezone = 'America/Toronto';
    await assert.rejects(service.start('creator', 'dream-maze', startCommand(2)),
        error => error.code === 'GAME_DAILY_ALREADY_PLAYED');
    now = new Date('2026-08-18T05:00:00.000Z');
    const next = await service.start('creator', 'dream-maze', startCommand(3));
    assert.equal(next.run.state.dailyKey, '2026-08-18');
    const nextRun = repository.runs.get(next.run.id);
    assert.equal(nextRun.dailyTimezone, 'America/Toronto');
    assert.equal(nextRun.dailyWindowStart, '2026-08-18T04:00:00.000Z');
    assert.equal(nextRun.dailyWindowEnd, '2026-08-19T04:00:00.000Z');
});

test('same creator and local window serialize to exactly one daily maze start', async () => {
    const repository = new CalendarMemoryRepository();
    const service = new StreamerGameService({ repository,
        clock: () => new Date('2026-08-17T12:00:00.000Z') });
    await service.ensureCatalog();
    const results = await Promise.allSettled([
        service.start('creator', 'dream-maze', startCommand(10)),
        service.start('creator', 'dream-maze', startCommand(11))
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code,
        'GAME_DAILY_ALREADY_PLAYED');
    assert.equal(repository.runs.size, 1);
});

test('daily maze fails closed when the locked creator profile has no valid timezone', async () => {
    const repository = new CalendarMemoryRepository();
    repository.user.timezone = null;
    const service = new StreamerGameService({ repository,
        clock: () => new Date('2026-08-17T12:00:00.000Z') });
    await service.ensureCatalog();
    await assert.rejects(service.start('creator', 'dream-maze', startCommand(12)), error =>
        error.code === 'GAME_CREATOR_TIMEZONE_REQUIRED' && error.status === 409);
    assert.equal(repository.runs.size, 0);
});

test('start API schema never accepts a browser-supplied calendar date or timezone', async () => {
    const service = new StreamerGameService({ repository: { async withTransaction() {
        throw new Error('repository must not be reached');
    } } });
    for (const injected of [
        { serverDateKey: '2030-01-01' },
        { dailyKey: '2030-01-01' },
        { timezone: 'Pacific/Kiritimati' },
        { dailyWindowStart: '2030-01-01T00:00:00.000Z' }
    ]) {
        await assert.rejects(service.start('creator', 'dream-maze', { ...startCommand(20), ...injected }),
            /Unexpected start command field/);
    }
});

test('daily calendar migration is forward-only, UTC-backfills legacy rows, and persists window identity', () => {
    const sql = fs.readFileSync(path.join(root, 'migrations/add_streamer_game_daily_calendar.sql'), 'utf8');
    assert.match(sql, /ADD COLUMN daily_timezone/);
    assert.match(sql, /ADD COLUMN daily_window_start/);
    assert.match(sql, /ADD COLUMN daily_window_end/);
    assert.match(sql, /SET daily_timezone='UTC'/);
    assert.match(sql, /daily_key::timestamp AT TIME ZONE 'UTC'/);
    assert.match(sql, /streamer_game_runs_daily_maze_window_idx/);
    assert.doesNotMatch(sql, /DROP\s+(?:TABLE|COLUMN)/i);
});
