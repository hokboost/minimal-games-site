'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ejs = require('ejs');

const packs = require('../content/streamer-world/games/batch-one');
const constellation = require('../domain/constellation-repair/engine');
const signal = require('../domain/signal-duet/engine');
const mystery = require('../domain/mystery-board/engine');
const weaver = require('../domain/story-weaver/engine');
const crafting = require('../domain/studio-crafting/engine');
const { readStreamerWorldFlags } = require('../lib/streamer-world-flags');
const { GAME_DEFINITIONS } = require('../domain/games/registry');
const { validateInternalGameEvent } = require('../services/quest-v2-service');
const { ENGINE_REGISTRY, StreamerGameService, StreamerGameServiceError, hash } = require('../services/streamer-game-service');

const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const uuid = value => `00000000-0000-4000-a000-${String(value).padStart(12, '0')}`;

test('batch one ships five deeply frozen versioned packs with 20 unique bilingual challenges each', () => {
    assert.deepEqual(Object.keys(packs), ['constellation-repair', 'signal-duet', 'mystery-board', 'story-weaver', 'studio-crafting']);
    const ids = new Set();
    const prose = new Set();
    for (const [gameId, pack] of Object.entries(packs)) {
        assert.equal(pack.gameId, gameId);
        assert.equal(pack.challenges.length, 20);
        assert.ok(/-v1$/.test(pack.version));
        assert.equal(Object.isFrozen(pack), true);
        for (const challenge of pack.challenges) {
            assert.equal(ids.has(`${gameId}:${challenge.id}`), false);
            ids.add(`${gameId}:${challenge.id}`);
            for (const field of ['titleZh', 'titleEn', 'briefZh', 'briefEn']) {
                assert.ok(challenge[field].length > (field.startsWith('title') ? 2 : 4));
                assert.equal(prose.has(challenge[field]), false, `${gameId}:${challenge.id}:${field}`);
                prose.add(challenge[field]);
            }
            if (challenge.recipe) assert.equal(Object.isFrozen(challenge.recipe), true);
        }
    }
    assert.equal(ids.size, 100);
});

test('constellation blockers are finite, avoid the authored solution, and materially constrain play', () => {
    for (const difficulty of ['gentle', 'standard', 'expert']) {
        const state = constellation.createState({ challengeId: 'lantern-wharf', difficulty, mode: 'solo' });
        const path = new Set(state.solution.map(cell => `${cell.x}:${cell.y}`));
        assert.ok(state.blockers.every(cell => !path.has(cell)));
        assert.equal(new Set(state.blockers).size, state.blockers.length);
        assert.throws(() => constellation.applyAction(state, { type: 'place',
            x: Number(state.blockers[0].split(':')[0]), y: Number(state.blockers[0].split(':')[1]) },
        { actorRole: 'creator' }), /blocked/);
    }
    assert.ok(constellation.createState({ challengeId: 'lantern-wharf', difficulty: 'expert', mode: 'solo' }).blockers.length
        > constellation.createState({ challengeId: 'lantern-wharf', difficulty: 'gentle', mode: 'solo' }).blockers.length);
});

test('constellation solo fallback completes a legal route while projections hide the full path', () => {
    let state = constellation.createState({ challengeId: 'paper-crane-arc', difficulty: 'standard', mode: 'solo' });
    assert.equal(constellation.project(state, 'creator').solution, undefined);
    for (const cell of state.solution) state = constellation.applyAction(state,
        { type: 'place', x: cell.x, y: cell.y }, { actorRole: 'creator' });
    assert.equal(state.status, 'completed');
    assert.ok(state.score > 0);
});

test('constellation co-op enforces asymmetric turns and role-specific clues', () => {
    const state = constellation.createState({ challengeId: 'tea-house-orbit', difficulty: 'gentle', mode: 'coop' });
    const creatorView = constellation.project(state, 'creator');
    const ownerView = constellation.project(state, 'owner');
    assert.ok('nextRow' in creatorView.privateClue);
    assert.equal('blockedCells' in creatorView.privateClue, false);
    assert.ok(Array.isArray(ownerView.privateClue.blockedCells));
    assert.throws(() => constellation.applyAction(state, { type: 'place', x: state.solution[0].x,
        y: state.solution[0].y }, { actorRole: 'owner' }), /Partner turn/);
});

test('signal schedule is strictly increasing and persists an authoritative server epoch', () => {
    const state = signal.createState({ challengeId: 'window-rain', difficulty: 'standard', mode: 'solo', serverStartedAtMs: 100000 });
    assert.equal(state.startedAtMs, 100000);
    assert.equal(state.nextBeatAtMs, 101800);
    for (let index = 1; index < state.beats.length; index += 1) {
        assert.ok(state.beats[index].offsetMs > state.beats[index - 1].offsetMs);
    }
    assert.equal(signal.project(state, 'creator').beats, undefined);
});

test('signal duet advances each authoritative window from server time and supports both modes', () => {
    let state = signal.createState({ challengeId: 'tram-chime', difficulty: 'expert', mode: 'solo', serverStartedAtMs: 5000 });
    while (state.status === 'active') {
        state = signal.applyAction(state, { type: 'tap', beatIndex: state.hits.length },
            { actorRole: 'creator', serverNowMs: state.nextBeatAtMs });
    }
    assert.equal(state.status, 'completed');
    assert.equal(state.mistakes, 0);
    const coop = signal.createState({ challengeId: 'tram-chime', difficulty: 'gentle', mode: 'coop', serverStartedAtMs: 5000 });
    assert.throws(() => signal.applyAction(coop, { type: 'tap', beatIndex: 0 },
        { actorRole: 'owner', serverNowMs: coop.nextBeatAtMs }), /Partner beat/);
});

test('all mystery cases contain authored evidence graphs with valid references', () => {
    const culpritPositions = new Set();
    for (const challenge of packs['mystery-board'].challenges) {
        assert.ok(challenge.evidence.length >= 4);
        assert.ok(challenge.suspects.length >= 3);
        const ids = new Set(challenge.evidence.map(entry => entry[0]));
        for (const group of [challenge.solutionLinks, challenge.falseLinks, challenge.contradictions]) {
            for (const pair of group) assert.ok(pair.every(id => ids.has(id)), `${challenge.id}:${pair}`);
        }
        culpritPositions.add(challenge.culprit);
    }
    assert.deepEqual([...culpritPositions].sort(), [0, 1, 2]);
    assert.notDeepEqual(packs['mystery-board'].challenges.map(challenge => challenge.culprit),
        packs['mystery-board'].challenges.map((_, index) => index % 3));
});

test('mystery projection hides correctness until terminal and three difficulty contracts differ', () => {
    let state = mystery.createState({ challengeId: 'missing-lantern', difficulty: 'standard', mode: 'solo' });
    const hidden = mystery.project(state);
    assert.equal(hidden.solution, undefined);
    for (const link of state.solutionLinks) {
        const [left, right] = link.split(':');
        state = mystery.applyAction(state, { type: 'link', left, right }, { actorRole: 'creator' });
    }
    state = mystery.applyAction(state, { type: 'accuse', suspectIndex: mystery.challengeById(state.challengeId).culprit },
        { actorRole: 'creator' });
    assert.equal(state.status, 'completed');
    assert.ok(mystery.project(state).solution);
    assert.ok(mystery.project(mystery.createState({ challengeId: 'missing-lantern', difficulty: 'gentle', mode: 'solo' })).contradictionHint);
    assert.equal(mystery.project(mystery.createState({ challengeId: 'missing-lantern', difficulty: 'expert', mode: 'solo' })).contradictionHint, null);
});

test('story weaver builds persisted bilingual passages with alternating co-op authorship', () => {
    let state = weaver.createState({ challengeId: 'umbrella-station', difficulty: 'standard', mode: 'coop' });
    while (state.status === 'active') {
        const role = state.turn % 2 ? 'owner' : 'creator';
        state = weaver.applyAction(state, { type: 'choose', cardIndex: 0 }, { actorRole: role });
    }
    assert.equal(state.status, 'completed');
    assert.ok(state.passages.every(entry => entry.textZh && entry.textEn));
    assert.ok(state.score > state.passages.length * 100);
    assert.throws(() => weaver.applyAction(weaver.createState({ challengeId: 'umbrella-station', difficulty: 'expert', mode: 'coop' }),
        { type: 'choose', cardIndex: 0 }, { actorRole: 'owner' }), /Partner writing turn/);
});

test('crafting conserves materials and completes only after a crafted item is placed', () => {
    let state = crafting.createState({ challengeId: 'paper-moon-lamp', difficulty: 'standard', mode: 'solo' });
    const recipe = crafting.challengeById(state.challengeId).recipe;
    while (!crafting.recipeReady(state.materials, recipe)) {
        state = crafting.applyAction(state, { type: 'gather', material: state.gatherCycle % 2
            ? Object.keys(recipe)[1] : Object.keys(recipe)[0] }, { actorRole: 'creator' });
    }
    const before = { ...state.materials };
    state = crafting.applyAction(state, { type: 'craft' }, { actorRole: 'creator' });
    assert.equal(state.status, 'active');
    for (const [key, amount] of Object.entries(recipe)) assert.equal(state.materials[key], before[key] - amount);
    state = crafting.applyAction(state, { type: 'place', slot: 3 }, { actorRole: 'creator' });
    assert.equal(state.status, 'completed');
    assert.equal(state.roomSlots[3], 'paper-moon-lamp');
});

test('new game feature flag is strict, derived, and off by default', () => {
    assert.equal(readStreamerWorldFlags({}).newGamesEnabled, false);
    assert.equal(readStreamerWorldFlags({ STREAMER_WORLD_ENABLED: 'true', CREATOR_PROFILE_ENABLED: 'true', STREAMER_NEW_GAMES_ENABLED: 'TRUE' }).newGamesEnabled, false);
    assert.equal(readStreamerWorldFlags({ STREAMER_WORLD_ENABLED: 'true', CREATOR_PROFILE_ENABLED: 'true', STREAMER_NEW_GAMES_ENABLED: 'true' }).newGamesEnabled, true);
});

test('central registry contains five free non-random games and fixed protected mutations', () => {
    const ids = Object.keys(packs);
    const games = GAME_DEFINITIONS.filter(game => ids.includes(game.id));
    assert.equal(games.length, 5);
    for (const game of games) {
        assert.equal(game.economicsKind, 'free');
        assert.equal(game.actions.length, 2);
        for (const action of game.actions) assert.deepEqual(action.policies,
            ['capacity', 'login', 'authorized', 'basic-rate-limit', 'action-rate-limit', 'csrf', 'idempotent']);
    }
});

test('migration stores version snapshots, CAS runs, immutable replay, hook intents, collection, and live protocol upgrade', () => {
    const sql = source('migrations/add_streamer_games_batch_one.sql');
    for (const table of ['streamer_game_versions', 'streamer_game_runs', 'streamer_game_start_commands',
        'streamer_game_commands', 'streamer_game_events', 'streamer_game_hook_intents',
        'streamer_game_collection_items', 'streamer_game_room_slots', 'streamer_game_audit_log']) assert.match(sql, new RegExp(`CREATE TABLE ${table}`));
    assert.match(sql, /content_snapshot JSONB/);
    assert.match(sql, /one_active_idx/);
    assert.match(sql, /interaction\.game_state_changed/);
    assert.match(sql, /DROP CONSTRAINT live_interaction_events_event_type_check/);
    assert.doesNotMatch(sql, /DROP CONSTRAINT IF EXISTS live_interaction_events_event_type_check/);
    assert.match(sql, /append-only/);
    assert.match(sql, /streamer_game_hook_intent_lifecycle/);
    assert.match(sql, /streamer_game_version_no_delete/);
    assert.match(sql, /streamer_game_collection_append_only/);
    assert.match(source('domain/live-interactions/protocol.js'), /interaction\.game_state_changed/);
});

test('Quest V2 accepts only a server-shaped game completion event', () => {
    const event = validateInternalGameEvent({ sourceType: 'streamer_game', sourceEventId: `game-run:${uuid(4)}`,
        username: 'creator', eventType: 'game.run.completed', occurredAt: new Date(0).toISOString(),
        payload: { runId: uuid(4), gameId: 'signal-duet', configVersion: 'signal-v1', challengeId: 'window-rain',
            difficulty: 'standard', mode: 'solo', score: 900 } });
    assert.equal(event.eventType, 'game.run.completed');
    assert.throws(() => validateInternalGameEvent({ ...event, payload: { ...event.payload, score: 999999999 } }), /Malformed/);
    assert.throws(() => validateInternalGameEvent({ ...event, sourceEventId: `game-run:${uuid(5)}` }), /Malformed/);
});

class MemoryRepository {
    constructor() {
        this.users = new Map([
            ['creator', { id: 1, username: 'creator', authorized: true, deactivated: false, is_admin: false, live_interaction_opt_in: true }],
            ['owner', { id: 2, username: 'owner', authorized: true, deactivated: false, is_admin: true, live_interaction_opt_in: true }]
        ]);
        this.versions = new Map(); this.runs = new Map(); this.starts = new Map(); this.commands = new Map();
        this.events = []; this.hooks = []; this.audits = []; this.collection = new Set(); this.slots = new Map();
        this.lockTrace = [];
        this.tail = Promise.resolve();
    }
    snapshot() { return structuredClone({ versions: this.versions, runs: this.runs, starts: this.starts,
        commands: this.commands, events: this.events, hooks: this.hooks, audits: this.audits,
        collection: this.collection, slots: this.slots }); }
    restore(value) { Object.assign(this, value); }
    async withTransaction(work) {
        const before = this.tail; let release; this.tail = new Promise(resolve => { release = resolve; });
        await before; const snapshot = this.snapshot();
        try { return await work(this); } catch (error) { this.restore(snapshot); throw error; } finally { release(); }
    }
    async seedVersion(client, pack, contentHash) { this.versions.set(pack.gameId, { id: this.versions.size + 1, pack, contentHash }); return this.versions.get(pack.gameId).id; }
    async lockAccounts(client, usernames) {
        this.lockTrace.push({ kind: 'accounts', usernames: usernames.filter(Boolean) });
        return new Map(usernames.filter(Boolean).map(name => [name, this.users.get(name)]));
    }
    async findActiveLiveRoom() { return 77; }
    async findStartCommand(client, actor, game, command) { return this.starts.get(`${actor}:${game}:${command}`) || null; }
    async findActiveCreatorRun(client, creator, game) { return [...this.runs.values()].find(run => run.creatorUserId === creator && run.gameId === game && run.status === 'active') || null; }
    async createRun(client, value) {
        const version = this.versions.get(value.gameId);
        const run = { ...value, contentHash: version.contentHash, contentSnapshot: version.pack,
            status: 'active', revision: 0, nextSequence: 1, score: 0, state: value.state };
        this.runs.set(run.id, run); return run;
    }
    async saveStartCommand(client, value) { this.starts.set(`${value.actorUserId}:${value.gameId}:${value.commandId}`,
        { semantic_hash: value.semanticHash, response_body: value.body }); }
    async appendEvent(client, value) { const event = { ...value, sequence: this.events.filter(row => row.runId === value.runId).length + 1 };
        this.events.push(event); return event; }
    async insertAudit(client, value) { this.audits.push(value); }
    async readRunIdentity(client, id) { const run = this.runs.get(id); return run && { creator_username: run.creatorUsername, owner_username: run.ownerUsername }; }
    async lockRun(client, id, username) { this.lockTrace.push({ kind: 'run', id }); const run = this.runs.get(id); if (!run) return null;
        const actorRole = username === run.creatorUsername ? 'creator' : username === run.ownerUsername ? 'owner' : null;
        return actorRole ? { run, actorRole, actorUserId: this.users.get(username).id } : null; }
    async findCommand(client, run, actor, command) { return this.commands.get(`${run}:${actor}:${command}`) || null; }
    async updateRun(client, run, state) { if (this.runs.get(run.id).revision !== run.revision) return null;
        const next = { ...run, state, status: state.status, score: state.score, revision: run.revision + 1 };
        this.runs.set(run.id, next); return next; }
    async saveCommand(client, value) { this.commands.set(`${value.runId}:${value.actorUserId}:${value.commandId}`,
        { semantic_hash: value.semanticHash, response_body: value.body }); }
    async insertHookIntent(client, value) { const found = this.hooks.find(row => row.runId === value.runId && row.intentType === value.intentType && row.intentKey === value.intentKey);
        if (found && JSON.stringify(found.payload) !== JSON.stringify(value.payload)) throw new Error('intent collision');
        if (!found) this.hooks.push(value); }
    async settleCraftingCollection(client, run, item, slot) { this.collection.add(`${run.creatorUserId}:${item}`); this.slots.set(slot, item); }
    async readRun(id, username) { const run = this.runs.get(id); if (!run) return null;
        return { run, actorRole: username === run.creatorUsername ? 'creator' : 'owner' }; }
    async listHistory(username, game) { return [...this.runs.values()].filter(run => run.gameId === game
        && [run.creatorUsername, run.ownerUsername].includes(username)).map(run => ({ id: run.id, status: run.status,
            difficulty: run.difficulty, score: run.score })); }
    async collectionState() { return { items: [...this.collection].map(value => ({ itemKey: value.split(':').slice(1).join(':') })),
        slots: [...this.slots].map(([slot, itemKey]) => ({ slot, itemKey, revision: 0 })) }; }
}

async function serviceFixture(options = {}) {
    const repository = new MemoryRepository();
    let now = 100000;
    const questEvents = [];
    const service = new StreamerGameService({ repository, ownerUsername: 'owner',
        clock: () => new Date(now), questV2Service: { async recordInternalTrustedEvent(client, event) { questEvents.push(event); return { enabled: true }; } },
        ...options });
    await service.ensureCatalog();
    return { repository, service, questEvents, setNow(value) { now = value; } };
}

test('service start is durable, semantically replayable, and cleanly rejects a second active command', async () => {
    const { service, repository } = await serviceFixture();
    const command = { commandId: uuid(10), gameId: 'studio-crafting', challengeId: 'paper-moon-lamp', difficulty: 'gentle', mode: 'solo' };
    const first = await service.start('creator', 'studio-crafting', command);
    assert.deepEqual(await service.start('creator', 'studio-crafting', command), first);
    await assert.rejects(service.start('creator', 'studio-crafting', { ...command, commandId: uuid(11) }),
        error => error.code === 'GAME_ACTIVE_RUN_EXISTS');
    assert.equal(repository.runs.size, 1);
    await assert.rejects(service.start('creator', 'studio-crafting', { ...command, difficulty: 'expert' }),
        error => error.code === 'GAME_COMMAND_COLLISION');
});

test('concurrent starts serialize on creator ownership and create only one active run', async () => {
    const { service, repository } = await serviceFixture();
    const base = { gameId: 'story-weaver', challengeId: 'umbrella-station', difficulty: 'standard', mode: 'solo' };
    const settled = await Promise.allSettled([
        service.start('creator', 'story-weaver', { ...base, commandId: uuid(20) }),
        service.start('creator', 'story-weaver', { ...base, commandId: uuid(21) })
    ]);
    assert.equal(settled.filter(entry => entry.status === 'fulfilled').length, 1);
    assert.equal(settled.filter(entry => entry.reason?.code === 'GAME_ACTIVE_RUN_EXISTS').length, 1);
    assert.equal(repository.runs.size, 1);
});

test('creator can durably abandon an active run and then start a fresh occurrence', async () => {
    const { service, repository } = await serviceFixture();
    const first = await service.start('creator', 'mystery-board', {
        commandId: uuid(22), gameId: 'mystery-board', challengeId: 'missing-lantern',
        difficulty: 'standard', mode: 'solo'
    });
    const abandoned = await service.action('creator', 'mystery-board', {
        commandId: uuid(23), gameId: 'mystery-board', runId: first.run.id,
        expectedRevision: 0, action: { type: 'abandon' }
    });
    assert.equal(abandoned.run.status, 'abandoned');
    assert.equal(repository.events.at(-1).eventType, 'game.run.abandoned');
    const second = await service.start('creator', 'mystery-board', {
        commandId: uuid(24), gameId: 'mystery-board', challengeId: 'silent-greenhouse',
        difficulty: 'gentle', mode: 'solo'
    });
    assert.notEqual(second.run.id, first.run.id);
    assert.equal(repository.runs.size, 2);
});

test('action CAS, response replay, and idempotency-finalize rollback preserve one state transition', async () => {
    const { service, repository } = await serviceFixture();
    const started = await service.start('creator', 'studio-crafting', { commandId: uuid(30), gameId: 'studio-crafting',
        challengeId: 'paper-moon-lamp', difficulty: 'gentle', mode: 'solo' });
    const action = { commandId: uuid(31), gameId: 'studio-crafting', runId: started.run.id,
        expectedRevision: 0, action: { type: 'gather', material: 'folded-paper' } };
    const first = await service.action('creator', 'studio-crafting', action);
    assert.deepEqual(await service.action('creator', 'studio-crafting', action), first);
    assert.equal(repository.runs.get(started.run.id).revision, 1);
    await assert.rejects(service.action('creator', 'studio-crafting', { ...action, commandId: uuid(32) }),
        error => error.code === 'GAME_REVISION_CONFLICT');
    const before = repository.runs.get(started.run.id).revision;
    await assert.rejects(service.action('creator', 'studio-crafting', { ...action, commandId: uuid(33),
        expectedRevision: 1, action: { type: 'gather', material: 'soft-light' } },
    { finalizeIdempotency: async () => { throw new Error('lost finalize'); } }), /lost finalize/);
    assert.equal(repository.runs.get(started.run.id).revision, before);
});

test('concurrent actions at one revision commit exactly one durable transition', async () => {
    const { service, repository } = await serviceFixture();
    const started = await service.start('creator', 'story-weaver', {
        commandId: uuid(330), gameId: 'story-weaver', challengeId: 'umbrella-station',
        difficulty: 'standard', mode: 'solo'
    });
    const common = { gameId: 'story-weaver', runId: started.run.id, expectedRevision: 0 };
    const settled = await Promise.allSettled([
        service.action('creator', 'story-weaver', { ...common, commandId: uuid(331),
            action: { type: 'choose', cardIndex: 0 } }),
        service.action('creator', 'story-weaver', { ...common, commandId: uuid(332),
            action: { type: 'choose', cardIndex: 1 } })
    ]);
    assert.equal(settled.filter(entry => entry.status === 'fulfilled').length, 1);
    assert.equal(settled.filter(entry => entry.reason?.code === 'GAME_REVISION_CONFLICT').length, 1);
    assert.equal(repository.runs.get(started.run.id).revision, 1);
    assert.equal(repository.events.filter(event => event.runId === started.run.id).length, 2);
    assert.equal(repository.commands.size, 1);
});

test('co-op action locks every participant before the run and deactivation rolls back without an event', async () => {
    const { service, repository } = await serviceFixture();
    const started = await service.start('creator', 'constellation-repair', {
        commandId: uuid(34), gameId: 'constellation-repair', challengeId: 'lantern-wharf',
        difficulty: 'gentle', mode: 'coop'
    });
    repository.lockTrace.length = 0;
    repository.users.get('creator').deactivated = true;
    const eventsBefore = repository.events.length;
    const firstCell = repository.runs.get(started.run.id).state.solution[0];
    await assert.rejects(service.action('owner', 'constellation-repair', {
        commandId: uuid(35), gameId: 'constellation-repair', runId: started.run.id,
        expectedRevision: 0, action: { type: 'place', x: firstCell.x, y: firstCell.y }
    }), error => error.code === 'GAME_ACCOUNT_UNAVAILABLE');
    assert.equal(repository.runs.get(started.run.id).revision, 0);
    assert.equal(repository.events.length, eventsBefore);
    assert.deepEqual(repository.lockTrace.map(entry => entry.kind), ['accounts']);

    repository.users.get('creator').deactivated = false;
    repository.lockTrace.length = 0;
    await service.action('creator', 'constellation-repair', {
        commandId: uuid(36), gameId: 'constellation-repair', runId: started.run.id,
        expectedRevision: 0, action: { type: 'place', x: firstCell.x, y: firstCell.y }
    });
    assert.deepEqual(repository.lockTrace.map(entry => entry.kind), ['accounts', 'run']);
});

test('co-op live relay emits only bounded metadata and invited-owner history discovers the run', async () => {
    const relayed = [];
    const published = [];
    const liveRepository = {
        async appendEvent(client, value) {
            relayed.push(value);
            return { ...value, sequence: 9 };
        }
    };
    const { service, repository } = await serviceFixture({
        liveRepository,
        publish: async event => { published.push(event); }
    });
    const startCommand = {
        commandId: uuid(37), gameId: 'constellation-repair', challengeId: 'lantern-wharf',
        difficulty: 'gentle', mode: 'coop'
    };
    const started = await service.start('creator', 'constellation-repair', startCommand);
    assert.deepEqual(await service.start('creator', 'constellation-repair', startCommand), started);
    assert.equal(relayed.length, 1, 'start replay must not emit a second relay event');
    const ownerState = await service.state('owner', 'constellation-repair');
    assert.equal(ownerState.run.actorRole, 'owner');
    assert.equal(ownerState.run.id, started.run.id);
    const firstCell = repository.runs.get(started.run.id).state.solution[0];
    await service.action('creator', 'constellation-repair', {
        commandId: uuid(38), gameId: 'constellation-repair', runId: started.run.id,
        expectedRevision: 0, action: { type: 'place', x: firstCell.x, y: firstCell.y }
    });
    assert.equal(relayed.length, 2);
    assert.deepEqual(relayed.map(event => event.payload.revision), [0, 1]);
    for (const relay of relayed) {
        assert.deepEqual(Object.keys(relay.payload).sort(), ['gameId', 'revision', 'runId', 'status']);
        assert.equal(JSON.stringify(relay).includes('solution'), false);
        assert.ok(Buffer.byteLength(JSON.stringify(relay)) < 7500);
    }
    assert.equal(published.length, 2);
});

test('craft completion atomically writes collection and exactly-once quest/story/achievement hooks', async () => {
    const { service, repository, questEvents } = await serviceFixture();
    let result = await service.start('creator', 'studio-crafting', { commandId: uuid(40), gameId: 'studio-crafting',
        challengeId: 'paper-moon-lamp', difficulty: 'gentle', mode: 'solo' });
    let serial = 41;
    for (const material of ['folded-paper', 'soft-light']) {
        result = await service.action('creator', 'studio-crafting', { commandId: uuid(serial++), gameId: 'studio-crafting',
            runId: result.run.id, expectedRevision: result.run.revision, action: { type: 'gather', material } });
    }
    result = await service.action('creator', 'studio-crafting', { commandId: uuid(serial++), gameId: 'studio-crafting',
        runId: result.run.id, expectedRevision: result.run.revision, action: { type: 'craft' } });
    assert.equal(result.run.status, 'active');
    const finalCommand = { commandId: uuid(serial++), gameId: 'studio-crafting',
        runId: result.run.id, expectedRevision: result.run.revision, action: { type: 'place', slot: 2 } };
    result = await service.action('creator', 'studio-crafting', finalCommand);
    assert.equal(result.run.status, 'completed');
    assert.equal(repository.hooks.length, 3);
    assert.equal(repository.collection.size, 1);
    assert.equal(repository.slots.get(2), 'paper-moon-lamp');
    assert.equal(questEvents.length, 1);
    assert.deepEqual(await service.action('creator', 'studio-crafting', finalCommand), result);
    assert.equal(repository.hooks.length, 3);
    assert.equal(questEvents.length, 1);
});

test('completion hook failure rolls back run, event, hook intents, and collection settlement', async () => {
    const { service, repository } = await serviceFixture();
    let result = await service.start('creator', 'studio-crafting', {
        commandId: uuid(50), gameId: 'studio-crafting', challengeId: 'paper-moon-lamp',
        difficulty: 'gentle', mode: 'solo'
    });
    for (const [offset, material] of ['folded-paper', 'soft-light'].entries()) {
        result = await service.action('creator', 'studio-crafting', {
            commandId: uuid(51 + offset), gameId: 'studio-crafting', runId: result.run.id,
            expectedRevision: result.run.revision, action: { type: 'gather', material }
        });
    }
    result = await service.action('creator', 'studio-crafting', {
        commandId: uuid(53), gameId: 'studio-crafting', runId: result.run.id,
        expectedRevision: result.run.revision, action: { type: 'craft' }
    });
    const eventsBefore = repository.events.length;
    service.questV2Service = { async recordInternalTrustedEvent() { throw new Error('quest hook unavailable'); } };
    await assert.rejects(service.action('creator', 'studio-crafting', {
        commandId: uuid(54), gameId: 'studio-crafting', runId: result.run.id,
        expectedRevision: result.run.revision, action: { type: 'place', slot: 1 }
    }), /quest hook unavailable/);
    assert.equal(repository.runs.get(result.run.id).status, 'active');
    assert.equal(repository.events.length, eventsBefore);
    assert.equal(repository.hooks.length, 0);
    assert.equal(repository.collection.size, 0);
    assert.equal(repository.slots.size, 0);
});

test('bound content snapshot drives old-run projection and hash drift fails closed', async () => {
    const { service, repository } = await serviceFixture({ engines: { ...ENGINE_REGISTRY, 'weaver-old': weaver } });
    const oldPack = structuredClone(packs['story-weaver']);
    oldPack.version = 'weaver-old';
    oldPack.challenges[0].titleEn = 'Preserved Old Opening';
    const run = { id: uuid(60), gameId: 'story-weaver', configVersion: 'weaver-old', versionId: 99,
        contentHash: hash(oldPack), contentSnapshot: oldPack, creatorUserId: 1, creatorUsername: 'creator',
        ownerUserId: null, ownerUsername: null, liveInteractionId: null, mode: 'solo', difficulty: 'gentle',
        status: 'active', revision: 0, nextSequence: 1, score: 0,
        state: weaver.createState({ challengeId: oldPack.challenges[0].id, difficulty: 'gentle', mode: 'solo', contentPack: oldPack }) };
    repository.runs.set(run.id, run);
    assert.equal((await service.state('creator', 'story-weaver', run.id)).run.state.titleEn, 'Preserved Old Opening');
    repository.runs.get(run.id).contentHash = '0'.repeat(64);
    await assert.rejects(service.state('creator', 'story-weaver', run.id),
        error => error.code === 'GAME_VERSION_UNAVAILABLE');
});

test('state rejects malformed UUID before repository access with a stable 400 error', async () => {
    const { service } = await serviceFixture();
    await assert.rejects(service.state('creator', 'signal-duet', 'not-a-uuid'),
        error => error instanceof StreamerGameServiceError && error.status === 400);
});

test('route feature gate stops reads and mutations, while malformed state run IDs map to HTTP 400', async () => {
    const registrations = [];
    const app = {
        get(routePath, ...handlers) { registrations.push({ method: 'get', routePath, handlers }); },
        post(routePath, ...handlers) { registrations.push({ method: 'post', routePath, handlers }); }
    };
    const pass = (req, res, next) => next();
    let stateCalls = 0;
    require('../routes/streamer-games')(app, {
        streamerGameService: {
            async state(username, gameId, runId) {
                stateCalls += 1;
                validateUuidForTest(runId);
                return { success: true, username, gameId };
            },
            async start() { throw new Error('must not start'); },
            async action() { throw new Error('must not act'); }
        },
        streamerWorldFlags: { newGamesEnabled: false },
        generateCSRFToken: () => 'csrf',
        requireLogin: pass,
        requireAuthorized: pass,
        requireCSRF: pass,
        paidActionConcurrencyGuard: pass,
        security: {
            basicRateLimit: pass,
            userActionRateLimit: pass,
            readHeavyRateLimit: pass
        }
    });
    const result = {
        locals: { lang: 'en' },
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; },
        send(value) { this.body = value; return this; },
        set() {}
    };
    const read = registrations.find(row => row.routePath === '/api/signal-duet/state');
    await read.handlers[3]({ path: '/api/signal-duet/state' }, result, () => {
        throw new Error('feature gate bypassed');
    });
    assert.equal(result.statusCode, 404);
    assert.equal(stateCalls, 0);
    const mutation = registrations.find(row => row.routePath === '/api/signal-duet/action');
    assert.equal(mutation.handlers[0], pass);
    await mutation.handlers[6]({ path: '/api/signal-duet/action' }, result, () => {
        throw new Error('mutation feature gate bypassed');
    });
    assert.equal(result.statusCode, 404);

    function validateUuidForTest(runId) {
        if (runId === 'bad') throw new StreamerGameServiceError('INVALID_INPUT', 400, 'Invalid runId');
    }
    registrations.length = 0;
    require('../routes/streamer-games')(app, {
        streamerGameService: {
            async state(username, gameId, runId) {
                stateCalls += 1;
                validateUuidForTest(runId);
                return { success: true, username, gameId };
            }
        },
        streamerWorldFlags: { newGamesEnabled: true },
        generateCSRFToken: () => 'csrf', requireLogin: pass, requireAuthorized: pass, requireCSRF: pass,
        paidActionConcurrencyGuard: pass,
        security: { basicRateLimit: pass, userActionRateLimit: pass,
            readHeavyRateLimit: pass }
    });
    const enabledRead = registrations.find(row => row.routePath === '/api/signal-duet/state');
    const badResponse = { statusCode: 200, status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; }, set() {} };
    await enabledRead.handlers.at(-1)({ session: { user: { username: 'creator' } }, query: { runId: 'bad' } }, badResponse);
    assert.equal(badResponse.statusCode, 400);
    assert.equal(badResponse.body.code, 'INVALID_INPUT');
});

test('browser helper gives deterministic countdown, keyboard action, and single-flight busy behavior', () => {
    const context = { globalThis: {} }; vm.createContext(context);
    vm.runInContext(source('public/js/streamer-game-ui-state.js'), context);
    const ui = context.globalThis.StreamerGameUIState;
    assert.equal(ui.countdownRemaining(2500, 1000, 400), 1100);
    assert.deepEqual(JSON.parse(JSON.stringify(ui.keyboardAction('signal-duet', { yourTurn: true, completedBeats: 3 }, 'Space'))),
        { type: 'tap', beatIndex: 3 });
    const gate = ui.createBusyGate(); assert.equal(gate.begin(), true); assert.equal(gate.begin(), false);
    gate.end(); assert.equal(gate.begin(), true);
});

test('UI is bilingual, mobile, keyboard/touch ready, reconnects coop, and never renders hidden HTML', () => {
    const view = source('views/streamer-game.ejs');
    const browser = source('public/js/streamer-game.js');
    assert.doesNotThrow(() => ejs.compile(view));
    assert.match(view, /src="\/js\/idempotent-fetch\.js"/);
    assert.doesNotMatch(view, /src="\/idempotency\.js"/);
    assert.ok(
        view.indexOf('/js/idempotent-fetch.js') < view.indexOf('/js/streamer-game.js'),
        'idempotent request helper must load before the game controller'
    );
    assert.match(view, /socket\.io/);
    assert.match(browser, /live:subscribe/);
    assert.match(browser, /interaction\.game_state_changed/);
    assert.match(browser, /setInterval/);
    assert.match(browser, /idempotentFetch/);
    assert.match(browser, /GAME_ACTIVE_RUN_EXISTS/);
    assert.match(browser, /type: 'unlink'/);
    assert.doesNotMatch(browser, /innerHTML\s*=/);
    assert.match(source('public/streamer-games.css'), /@media\(max-width:520px\)/);
    assert.match(source('public/streamer-games.css'), /min-height:48px/);
});

test('new game production boundary never imports points, gift inventory, random payout, or provider sends', () => {
    const files = ['services/streamer-game-service.js', 'repositories/streamer-game-repository.js',
        'routes/streamer-games.js', 'domain/constellation-repair/engine.js', 'domain/signal-duet/engine.js',
        'domain/mystery-board/engine.js', 'domain/story-weaver/engine.js', 'domain/studio-crafting/engine.js'];
    const combined = files.map(source).join('\n');
    assert.doesNotMatch(combined, /BalanceLogger|wish_inventory|gift_exchanges|bilibili_gift|Math\.random|updateBalance/);
});
