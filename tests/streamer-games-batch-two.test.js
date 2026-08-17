'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const packs = require('../content/streamer-world/games/batch-two');
const meteor = require('../domain/meteor-defense/engine');
const maze = require('../domain/dream-maze/engine');
const bingo = require('../domain/broadcast-bingo/engine');
const echo = require('../domain/echo-memory/engine');
const prediction = require('../domain/keeper-prediction/engine');
const { GAME_DEFINITIONS } = require('../domain/games/registry');
const { GAME_IDS, validateTrustedBingoEvent } = require('../services/streamer-game-service');
const { StreamerGameService } = require('../services/streamer-game-service');
const { assertAdminBingoBody } = require('../routes/streamer-games');

const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const uuid = value => `00000000-0000-4000-a000-${String(value).padStart(12, '0')}`;

class DailyMemoryRepository {
    constructor() {
        this.user = { id: 1, username: 'creator', authorized: true, deactivated: false,
            is_admin: false, live_interaction_opt_in: false, timezone: 'UTC' };
        this.owner = { id: 2, username: 'owner', authorized: true, deactivated: false,
            is_admin: true, live_interaction_opt_in: true, timezone: 'UTC' };
        this.versions = new Map();
        this.runs = new Map();
        this.starts = new Map();
        this.events = [];
        this.audits = [];
        this.trusted = new Map();
        this.hooks = [];
        this.tail = Promise.resolve();
    }
    snapshot() {
        return structuredClone({ versions: this.versions, runs: this.runs, starts: this.starts,
            events: this.events, audits: this.audits, trusted: this.trusted, hooks: this.hooks });
    }
    async withTransaction(work) {
        const before = this.tail;
        let release;
        this.tail = new Promise(resolve => { release = resolve; });
        await before;
        const snapshot = this.snapshot();
        try { return await work(this); } catch (error) { Object.assign(this, snapshot); throw error; } finally { release(); }
    }
    async seedVersion(client, pack, contentHash) {
        this.versions.set(pack.gameId, { id: this.versions.size + 1, pack, contentHash });
        return this.versions.get(pack.gameId).id;
    }
    async lockAccounts(client, names) {
        return new Map(names.filter(Boolean).map(name => [name, name === 'owner' ? this.owner : this.user]));
    }
    async findStartCommand(client, actor, game, command) { return this.starts.get(`${actor}:${game}:${command}`) || null; }
    async findDailyMazeRun(client, creator, day) {
        return [...this.runs.values()].find(run => run.creatorUserId === creator
            && run.gameId === 'dream-maze' && run.state.dailyKey === day) || null;
    }
    async findOverlappingDailyMazeRun(client, creator, windowStart, windowEnd) {
        const start = new Date(windowStart).getTime();
        const end = new Date(windowEnd).getTime();
        return [...this.runs.values()].find(run => run.creatorUserId === creator
            && run.gameId === 'dream-maze'
            && new Date(run.dailyWindowStart).getTime() < end
            && new Date(run.dailyWindowEnd).getTime() > start) || null;
    }
    async findActiveCreatorRun(client, creator, game) {
        return [...this.runs.values()].find(run => run.creatorUserId === creator && run.gameId === game && run.status === 'active') || null;
    }
    async readRunIdentity(client, id) {
        const run = this.runs.get(id);
        return run ? {
            id: run.id, game_id: run.gameId, mode: run.mode, status: run.status,
            creator_user_id: run.creatorUserId, owner_user_id: run.ownerUserId,
            live_interaction_id: run.liveInteractionId,
            creator_username: run.creatorUsername, owner_username: run.ownerUsername
        } : null;
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
        this.starts.set(`${value.actorUserId}:${value.gameId}:${value.commandId}`,
            { semantic_hash: value.semanticHash, response_body: value.body });
    }
    async insertAudit(client, value) { this.audits.push(value); }
    async findTrustedGameEvent(client, type, id) { return this.trusted.get(`${type}:${id}`) || null; }
    async insertTrustedGameEvent(client, value) {
        this.trusted.set(`${value.sourceType}:${value.sourceEventId}`,
            { semantic_hash: value.semanticHash, run_id: value.runId,
                response_status: value.status, response_body: value.body });
    }
    async lockRun(client, id, username) {
        const run = this.runs.get(id);
        return run && username === run.creatorUsername ? { run, actorRole: 'creator', actorUserId: 1 } : null;
    }
    async updateRun(client, run, state) {
        if (this.runs.get(run.id).revision !== run.revision) return null;
        const saved = { ...run, state, status: state.status, score: state.score, revision: run.revision + 1 };
        this.runs.set(run.id, saved);
        return saved;
    }
    async insertHookIntent(client, value) {
        if (!this.hooks.some(row => row.runId === value.runId && row.intentType === value.intentType && row.intentKey === value.intentKey)) {
            this.hooks.push(value);
        }
    }
}

test('batch two ships five deeply frozen packs and 100 distinct bilingual challenges', () => {
    assert.deepEqual(Object.keys(packs), ['meteor-defense', 'dream-maze', 'broadcast-bingo', 'echo-memory', 'keeper-prediction']);
    const prose = new Set();
    for (const [gameId, pack] of Object.entries(packs)) {
        assert.equal(pack.gameId, gameId);
        assert.equal(pack.challenges.length, 20);
        assert.equal(Object.isFrozen(pack), true);
        assert.equal(Object.isFrozen(pack.challenges[0]), true);
        for (const challenge of pack.challenges) for (const field of ['titleZh', 'titleEn', 'briefZh', 'briefEn']) {
            assert.ok(challenge[field].length > (field.startsWith('title') ? 2 : 4));
            assert.equal(prose.has(challenge[field]), false, `${gameId}:${challenge.id}:${field}`);
            prose.add(challenge[field]);
        }
    }
    assert.equal(new Set(packs['echo-memory'].challenges.map(item => item.briefZh)).size, 20);
});

test('meteor uses every authored modifier, bounded wave phases, and asymmetric hidden intel', () => {
    for (const challenge of packs['meteor-defense'].challenges) assert.ok(meteor.MODIFIER_RULES[challenge.modifier]);
    let state = meteor.createState({ challengeId: 'harbor-watch', difficulty: 'standard', mode: 'coop' });
    assert.equal(meteor.project(state, 'creator').currentThreat.strength, null);
    assert.equal(meteor.project(state, 'owner').currentThreat.lane, null);
    state = meteor.applyAction(state, { type: 'fortify', lane: 0 }, { actorRole: 'creator' });
    assert.throws(() => meteor.applyAction(state, { type: 'fortify', lane: 1 }, { actorRole: 'creator' }), /unavailable/);
    state = meteor.applyAction(state, { type: 'beacon', lane: 0 }, { actorRole: 'owner' });
    assert.throws(() => meteor.applyAction(state, { type: 'resolve', lane: 0 }, { actorRole: 'creator' }), /Unexpected/);
    state = meteor.applyAction(state, { type: 'resolve' }, { actorRole: 'creator' });
    assert.equal(state.wave, 1);
    assert.equal(state.fortifiedThisWave, false);
});

test('meteor modifiers materially alter deterministic threats', () => {
    const shifted = meteor.createState({ challengeId: 'harbor-watch', difficulty: 'gentle', mode: 'solo' });
    const harsh = meteor.createState({ challengeId: 'glass-orchard', difficulty: 'gentle', mode: 'solo' });
    assert.notDeepEqual(shifted.threats, harsh.threats);
    const steam = meteor.createState({ challengeId: 'tea-district', difficulty: 'standard', mode: 'solo' });
    const threat = steam.threats[0];
    const protectedState = meteor.applyAction(steam, { type: 'beacon', lane: threat.lane }, { actorRole: 'creator' });
    const resolved = meteor.applyAction(protectedState, { type: 'resolve' }, { actorRole: 'creator' });
    assert.equal(resolved.integrity, steam.integrity);
});

test('daily maze is repeatable by identity/date, changes across dates, and contains branches', () => {
    const setup = { challengeId: 'moss-library', difficulty: 'standard', mode: 'coop', creatorUsername: 'creator', serverDateKey: '2026-08-16' };
    const first = maze.createState(setup);
    const replay = maze.createState(setup);
    const tomorrow = maze.createState({ ...setup, serverDateKey: '2026-08-17' });
    assert.deepEqual(first.graph, replay.graph);
    assert.notDeepEqual(first.graph, tomorrow.graph);
    assert.ok(Object.values(first.graph).some(exits => exits.length >= 3));
    assert.ok(Object.values(first.graph).some(exits => exits.length === 1));
});

test('maze projection exposes local exits but no graph or solution; owner hints and creator moves', () => {
    let state = maze.createState({ challengeId: 'rain-station', difficulty: 'standard', mode: 'coop', creatorUsername: 'creator', serverDateKey: '2026-08-16' });
    const view = maze.project(state, 'creator');
    assert.equal(view.graph, undefined);
    assert.equal(view.goal, undefined);
    assert.ok(view.legalDirections.length > 0);
    assert.throws(() => maze.applyAction(state, { type: 'hint' }, { actorRole: 'creator' }), /owner/);
    state = maze.applyAction(state, { type: 'hint' }, { actorRole: 'owner' });
    assert.ok(state.lastHint);
    const path = maze.shortestDirections(state.graph, state.position, state.goal);
    for (const direction of path) state = maze.applyAction(state, { type: 'move', direction }, { actorRole: 'creator' });
    assert.equal(state.status, 'completed');
});

test('bingo rejects browser-shaped events and accepts only server-trusted allowlisted events', () => {
    let state = bingo.createState({ challengeId: 'warm-opening', difficulty: 'gentle', mode: 'solo' });
    const key = state.cells[0].eventKey;
    assert.throws(() => bingo.applyAction(state, { type: 'trusted_event', eventKey: key, sourceEventId: 'source:0001' },
        { actorRole: 'creator', trusted: false }), /trusted server/);
    state = bingo.applyAction(state, { type: 'trusted_event', eventKey: key, sourceEventId: 'source:0001' },
        { actorRole: 'creator', trusted: true });
    assert.equal(state.cells.filter(cell => cell.marked).length, 1);
    assert.equal(bingo.project(state).acceptedSourceEvents, undefined);
});

test('trusted bingo command and fixed owner route close source type and input shape', () => {
    const pack = packs['broadcast-bingo'];
    const event = validateTrustedBingoEvent({ sourceType: 'admin_confirmed_live', sourceEventId: 'admin:event:0001',
        username: 'creator', eventKey: pack.safeEventKinds[0][0], payload: { confirmed: true } }, pack);
    assert.equal(event.sourceType, 'admin_confirmed_live');
    assert.throws(() => validateTrustedBingoEvent({ ...event, sourceType: 'browser' }, pack), /Untrusted/);
    assert.throws(() => validateTrustedBingoEvent({ ...event, eventKey: 'gift.sent' }, pack), /allowlist/);
    assert.throws(() => assertAdminBingoBody({ sourceType: 'server_observed_live' }), /Unexpected/);
});

test('echo keeps partner clues asymmetric and only reveals a role half during study', () => {
    let state = echo.createState({ challengeId: 'rain-chimes', difficulty: 'gentle', mode: 'coop' });
    const creator = echo.project(state, 'creator').privateClue;
    const owner = echo.project(state, 'owner').privateClue;
    assert.ok(creator.every(item => item.index % 2 === 0));
    assert.ok(owner.every(item => item.index % 2 === 1));
    assert.equal(new Set([...creator, ...owner].map(item => item.index)).size, state.sequence.length);
    state = echo.applyAction(state, { type: 'study' }, { actorRole: 'creator' });
    state = echo.applyAction(state, { type: 'study' }, { actorRole: 'owner' });
    while (state.status === 'active') {
        const role = state.recallIndex % 2 === 0 ? 'creator' : 'owner';
        state = echo.applyAction(state, { type: 'echo', symbol: state.sequence[state.recallIndex] }, { actorRole: role });
    }
    assert.equal(state.status, 'completed');
});

test('keeper prediction seals partner choices and uses only authored fictional options', () => {
    let state = prediction.createState({ challengeId: 'sky-library', difficulty: 'gentle', mode: 'coop' });
    state = prediction.applyAction(state, { type: 'submit', choice: 0, prediction: 1 }, { actorRole: 'creator' });
    const ownerView = prediction.project(state, 'owner');
    assert.equal(ownerView.partnerSubmitted, true);
    assert.equal(ownerView.creatorChoice, undefined);
    assert.equal(ownerView.reveals.length, 0);
    state = prediction.applyAction(state, { type: 'submit', choice: 1, prediction: 0 }, { actorRole: 'owner' });
    assert.equal(state.reveals[0].points, 2);
    assert.equal(Object.keys(state).some(key => /profile|health|politic|relig/i.test(key)), false);
});

test('three difficulties materially alter all five game contracts', () => {
    const setups = [
        [meteor, 'harbor-watch', state => [state.integrity, state.energy]],
        [maze, 'moss-library', state => [state.size, state.hintsRemaining]],
        [bingo, 'warm-opening', state => state.difficulty],
        [echo, 'rain-chimes', state => state.sequence.length],
        [prediction, 'sky-library', state => state.roundCount]
    ];
    for (const [engine, challengeId, select] of setups) {
        const common = { challengeId, mode: 'solo', creatorUsername: 'creator', serverDateKey: '2026-08-16' };
        assert.notDeepEqual(select(engine.createState({ ...common, difficulty: 'gentle' })),
            select(engine.createState({ ...common, difficulty: 'expert' })));
    }
});

test('registry exposes fixed protected routes for all ten expansion games', () => {
    assert.equal(GAME_IDS.length, 10);
    const games = GAME_DEFINITIONS.filter(game => Object.keys(packs).includes(game.id));
    assert.equal(games.length, 5);
    for (const game of games) for (const action of game.actions) assert.deepEqual(action.policies,
        ['capacity', 'login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']);
});

test('batch two migration activates daily identity and append-only trusted event dedupe', () => {
    const sql = source('migrations/add_streamer_games_batch_two.sql');
    assert.match(sql, /ADD COLUMN daily_key DATE/);
    assert.match(sql, /streamer_game_runs_daily_maze_idx/);
    assert.match(sql, /CREATE TABLE streamer_game_trusted_events/);
    assert.match(sql, /UNIQUE\(source_type,source_event_id\)/);
    assert.match(sql, /streamer_game_trusted_events_append_only/);
    const repositorySource = source('repositories/streamer-game-repository.js');
    assert.match(repositorySource, /findOverlappingDailyMazeRun/);
    assert.match(repositorySource, /values\.dailyKey, values\.dailyTimezone, values\.dailyWindowStart, values\.dailyWindowEnd/);
});

test('daily maze start serializes by creator/day, rolls back atomically, and permits the next day', async () => {
    const repository = new DailyMemoryRepository();
    let now = new Date('2026-08-16T12:00:00.000Z');
    const service = new StreamerGameService({ repository, clock: () => now });
    await service.ensureCatalog();
    const command = number => ({ commandId: uuid(number), gameId: 'dream-maze', challengeId: 'moss-library',
        difficulty: 'gentle', mode: 'solo' });
    await assert.rejects(service.start('creator', 'dream-maze', command(1), {
        finalizeIdempotency: async () => { throw new Error('response persistence failed'); }
    }), /response persistence failed/);
    assert.equal(repository.runs.size, 0);
    const results = await Promise.allSettled([
        service.start('creator', 'dream-maze', command(2)),
        service.start('creator', 'dream-maze', command(3))
    ]);
    assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
    const rejected = results.find(item => item.status === 'rejected').reason;
    assert.equal(rejected.code, 'GAME_DAILY_ALREADY_PLAYED');
    assert.equal(repository.runs.size, 1);
    repository.runs.values().next().value.status = 'completed';
    await assert.rejects(service.start('creator', 'dream-maze', command(4)),
        error => error.code === 'GAME_DAILY_ALREADY_PLAYED');
    now = new Date('2026-08-17T12:00:00.000Z');
    const tomorrow = await service.start('creator', 'dream-maze', command(5));
    assert.equal(tomorrow.run.state.dailyKey, '2026-08-17');
});

test('trusted bingo replays canonical responses, rejects collisions, and rolls back Quest failure', async () => {
    const repository = new DailyMemoryRepository();
    let failQuest = true;
    const achievementEvents = [];
    const achievementService = { async recordTrustedEvent(client, username, event) {
        achievementEvents.push({ username, event: structuredClone(event) });
        return { success: true, unlocked: [] };
    } };
    const questV2Service = { async recordInternalTrustedEvent() {
        if (failQuest) throw new Error('quest hook failed');
        return { matchedAssignments: [] };
    } };
    const service = new StreamerGameService({ repository, ownerUsername: 'owner', questV2Service,
        achievementService,
        clock: () => new Date('2026-08-16T12:00:00.000Z') });
    await service.ensureCatalog();
    const started = await service.start('creator', 'broadcast-bingo', { commandId: uuid(20),
        gameId: 'broadcast-bingo', challengeId: 'warm-opening', difficulty: 'gentle', mode: 'solo' });
    const keys = started.run.state.cells.slice(0, 5).map(cell => cell.eventKey);
    const context = { actorUsername: 'owner', finalizeIdempotency: async () => {} };
    const firstCommand = { sourceType: 'admin_confirmed_live', sourceEventId: 'owner:event:0001',
        username: 'creator', eventKey: keys[0], payload: { confirmed: true } };
    const first = await service.recordTrustedBingoEvent(firstCommand, context);
    const replay = await service.recordTrustedBingoEvent(firstCommand, context);
    assert.deepEqual(replay, first);
    assert.equal(repository.trusted.size, 1);
    await assert.rejects(service.recordTrustedBingoEvent({ ...firstCommand, eventKey: keys[1] }, context),
        error => error.code === 'GAME_TRUSTED_EVENT_COLLISION');
    for (let index = 1; index < 4; index += 1) await service.recordTrustedBingoEvent({
        ...firstCommand, sourceEventId: `owner:event:000${index + 1}`, eventKey: keys[index]
    }, context);
    const before = repository.snapshot();
    const terminalCommand = { ...firstCommand, sourceEventId: 'owner:event:0005', eventKey: keys[4] };
    await assert.rejects(service.recordTrustedBingoEvent(terminalCommand, context), /quest hook failed/);
    assert.equal(achievementEvents.length, 0,
        'the completion producer must remain behind the Quest rollback point');
    assert.deepEqual(repository.runs, before.runs);
    assert.deepEqual(repository.events, before.events);
    assert.deepEqual(repository.trusted, before.trusted);
    assert.deepEqual(repository.hooks, before.hooks);
    failQuest = false;
    const terminal = await service.recordTrustedBingoEvent(terminalCommand, context);
    assert.equal(terminal.status, 'completed');
    assert.equal(repository.hooks.length, 3);
    assert.equal(achievementEvents.length, 1);
    assert.equal(achievementEvents[0].event.eventType, 'game.run.completed');
    assert.equal(achievementEvents[0].event.payload.gameId, 'broadcast-bingo');
    assert.equal(achievementEvents[0].event.payload.authoritativeScore, true);
});

test('new batch stays isolated from balances, provider sends, and gift delivery', () => {
    const files = ['services/streamer-game-service.js', 'repositories/streamer-game-repository.js',
        'routes/streamer-games.js', 'domain/meteor-defense/engine.js', 'domain/dream-maze/engine.js',
        'domain/broadcast-bingo/engine.js', 'domain/echo-memory/engine.js', 'domain/keeper-prediction/engine.js'];
    const combined = files.map(source).join('\n');
    assert.doesNotMatch(combined, /BalanceLogger|giftProvider|sendGift|provider\.send|wish_inventory/);
});
