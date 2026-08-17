'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const pack = require('../content/streamer-world/story/season-one');
const seasonTwo = require('../content/streamer-world/story/season-2');
const { evaluateCondition, validateCondition, StoryConditionError } = require('../domain/story/conditions');
const { applyEffects, initialStoryState, validateEffect, StoryEffectError } = require('../domain/story/effects');
const { createStoryRun, recoverStoryRun, StoryTransitionError, transitionStory } = require('../domain/story/engine');
const { buildPublishedStoryProgressionRegistry } = require('../domain/story/progression-registry');
const { publicStoryProjection } = require('../domain/story/projection');
const { validateStoryContent, StoryContentError, NODE_TYPES } = require('../domain/story/validator');
const { readStreamerWorldFlags } = require('../lib/streamer-world-flags');
const { IDEMPOTENT_WRITE_PATHS, ROUTE_MANIFEST } = require('../routes/manifest');
const { validateInternalStoryEvent, validateRegisteredRule } = require('../services/quest-v2-service');
const { StoryWorldService } = require('../services/story-world-service');
const { StoryWorldRepository } = require('../repositories/story-world-repository');
const { RewardCatalogRepository } = require('../repositories/reward-catalog-repository');

const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Season One contains twelve substantial episodes and the complete graph target', () => {
    assert.equal(pack.episodes.length, 12); assert.ok(pack.nodes.length >= 144);
    assert.equal(pack.nodes.filter((node) => node.type === 'choice').length, 60);
    assert.equal(pack.nodes.flatMap((node) => node.options || []).length, 120);
    assert.ok(validateStoryContent(pack).proseCount >= 480);
});

test('all fifteen node kinds are executable in the compiled graph', () => {
    const actual = new Set(pack.nodes.map((node) => node.type));
    assert.deepEqual([...actual].sort(), [...NODE_TYPES].sort());
});

test('choices have distinct authored outcomes and four durable consequences', () => {
    for (const node of pack.nodes.filter((item) => item.type === 'choice')) {
        assert.notEqual(node.options[0].next, node.options[1].next);
        for (const option of node.options) {
            assert.ok(option.outcome.zh.length > 10 && option.outcome.en.length > 20);
            assert.deepEqual(option.effects.map((effect) => effect.type), ['set_flag', 'increment_axis', 'increment_character', 'add_route']);
        }
    }
});

test('visible prose has no episode-number template and authored text remains unique', () => {
    const visible = pack.nodes.flatMap((node) => [node.text, ...(node.options || []).flatMap((option) => [option.label, option.outcome])]);
    assert.equal(new Set(visible.map((value) => value.zh)).size, visible.length);
    assert.equal(new Set(visible.map((value) => value.en)).size, visible.length);
    assert.doesNotMatch(visible.map((value) => `${value.zh}\n${value.en}`).join('\n'), /第\d+(?:\.\d+)?次交汇|At crossing \d/i);
});

test('twelve named characters recur across episodes', () => {
    const counts = new Map(); for (const node of pack.nodes) if (node.speaker) counts.set(node.speaker, (counts.get(node.speaker) || 0) + 1);
    assert.equal(counts.size, 12); for (const count of counts.values()) assert.ok(count >= 2);
});

test('Season One carries five conclusions, twelve memories, and six owner moments', () => {
    assert.equal(pack.nodes.filter((node) => node.type === 'season_ending').length, 5);
    assert.ok(Object.keys(pack.memories).length >= 10);
    assert.ok(pack.nodes.filter((node) => node.type === 'owner_intervention').length >= 6);
});

test('all memory and message effects resolve to immutable catalog content', () => {
    for (const node of pack.nodes) for (const effect of [...(node.effects || []), ...(node.options || []).flatMap((option) => option.effects || [])]) {
        if (effect.type === 'unlock_memory') assert.ok(pack.memories[effect.key]);
        if (effect.type === 'deliver_message') assert.ok(pack.messages[effect.key]);
    }
});

test('condition AST is closed, bounded, and deterministic', () => {
    assert.equal(evaluateCondition({ op: 'all', conditions: [{ op: 'axis', axis: 'trust', minimum: 2 }, { op: 'flag', key: 'heard.signal', equals: true }] }, { axes: { trust: 3 }, flags: { 'heard.signal': true } }), true);
    assert.throws(() => validateCondition({ op: 'javascript', source: 'return true' }), StoryConditionError);
    let nested = { op: 'always' }; for (let index = 0; index < 8; index += 1) nested = { op: 'not', condition: nested };
    assert.throws(() => validateCondition(nested), /deep/i);
});

test('effect AST rejects currency and gift operations', () => {
    assert.throws(() => validateEffect({ type: 'award_points', amount: 100 }), StoryEffectError);
    assert.throws(() => validateEffect({ type: 'send_gift', gift: 'x' }), StoryEffectError);
    const applied = applyEffects(initialStoryState(), [{ type: 'unlock', unlockType: 'reward_catalog_visibility', key: 'moon-page' }]);
    assert.equal(applied.state.unlocks['reward_catalog_visibility:moon-page'], true);
});

test('choice transition writes flag, axis, character relationship, and route', () => {
    let run = createStoryRun(pack); run = transitionStory(pack, run, { action: 'advance', expectedRevision: 0 }).run;
    const node = pack.nodesById.get(run.currentNodeId), selected = node.options[0];
    const result = transitionStory(pack, run, { action: 'choose', expectedRevision: 1, choiceId: selected.id });
    assert.equal(result.run.state.flags[selected.effects[0].key], true);
    assert.ok(result.run.state.axes[selected.effects[1].axis] > 0);
    assert.ok(result.run.state.characterRelationships.lumen > 0);
    assert.equal(result.run.state.routes[selected.effects[3].key], true);
});

test('stale revision and unavailable choice fail closed', () => {
    const run = createStoryRun(pack);
    assert.throws(() => transitionStory(pack, run, { action: 'advance', expectedRevision: 2 }), (error) => error instanceof StoryTransitionError && error.code === 'STORY_VERSION_CONFLICT');
    const choiceRun = transitionStory(pack, run, { action: 'advance', expectedRevision: 0 }).run;
    assert.throws(() => transitionStory(pack, choiceRun, { action: 'choose', expectedRevision: 1, choiceId: 'invented.choice' }), /unavailable/i);
});

test('public projection never exposes effects, conditions, answers, or future references', () => {
    const run = transitionStory(pack, createStoryRun(pack), { action: 'advance', expectedRevision: 0 }).run;
    const serialized = JSON.stringify(publicStoryProjection(pack, run, { language: 'en' }));
    for (const secret of ['effects', 'condition', 'answerKey', 'successNext', 'failureNext', 'nextNodeId']) assert.doesNotMatch(serialized, new RegExp(secret));
});

test('puzzle answer stays hidden while both authored result branches are reachable', () => {
    const puzzle = pack.nodes.find((node) => node.type === 'puzzle');
    const run = { ...createStoryRun(pack), currentNodeId: puzzle.id, currentEpisode: puzzle.episode };
    const projection = publicStoryProjection(pack, run, { language: 'zh' });
    assert.equal(projection.node.answerKey, undefined); assert.equal(projection.node.answerOptions.length, 2);
    assert.notEqual(transitionStory(pack, run, { action: 'answer', answerKey: puzzle.answerKey, expectedRevision: 0 }).run.currentNodeId,
        transitionStory(pack, run, { action: 'answer', answerKey: 'quiet-beat-a', expectedRevision: 0 }).run.currentNodeId);
});

test('timed wait uses injected time and never trusts browser time', () => {
    const node = pack.nodes.find((item) => item.type === 'timed_wait');
    let now = new Date('2026-08-16T12:00:00.000Z'); let run = { ...createStoryRun(pack), currentNodeId: node.id, currentEpisode: node.episode };
    run = transitionStory(pack, run, { action: 'advance', expectedRevision: 0 }, { now: () => now }).run;
    assert.equal(run.currentNodeId, node.id); assert.throws(() => transitionStory(pack, run, { action: 'advance', expectedRevision: 1 }, { now: () => now }), /still arriving/i);
    now = new Date('2026-08-16T12:00:02.000Z'); assert.notEqual(transitionStory(pack, run, { action: 'advance', expectedRevision: 1 }, { now: () => now }).run.currentNodeId, node.id);
});

test('checkpoint recovery increments revision and restores a deterministic snapshot', () => {
    const checkpointNode = pack.nodes.find((item) => item.type === 'checkpoint');
    let run = { ...createStoryRun(pack), currentNodeId: checkpointNode.id, currentEpisode: checkpointNode.episode };
    run = transitionStory(pack, run, { action: 'advance', expectedRevision: 0 }).run;
    const checkpointState = structuredClone(run.state);
    const altered = structuredClone(run);
    altered.state.flags.later = true;
    altered.state.memories['later.memory'] = true;
    altered.state.unlocks['reward_catalog_visibility:later.reward'] = true;
    altered.state.messages['later.message'] = true;
    altered.state.completedEpisodes['later-episode'] = true;
    altered.revision = 2;
    const recovered = recoverStoryRun(pack, altered, 2);
    assert.equal(recovered.run.revision, 3);
    assert.deepEqual(recovered.run.state, checkpointState);
    for (const [field, key] of [
        ['flags','later'], ['memories','later.memory'],
        ['unlocks','reward_catalog_visibility:later.reward'],
        ['messages','later.message'], ['completedEpisodes','later-episode']
    ]) assert.equal(recovered.run.state[field][key], undefined);
    assert.equal(recovered.event.action, 'recover');
});

test('repeated recovery cannot combine mutually exclusive branch progression', () => {
    const checkpointNode = pack.nodes.find((item) => item.type === 'checkpoint');
    let run = { ...createStoryRun(pack), currentNodeId: checkpointNode.id,
        currentEpisode: checkpointNode.episode };
    run = transitionStory(pack, run, { action:'advance', expectedRevision:0 }).run;
    const branchA = structuredClone(run);
    branchA.state.unlocks['reward_catalog_visibility:branch-a'] = true;
    branchA.state.completedEpisodes['branch-a-ending'] = true;
    branchA.state.memories['branch-a-memory'] = true;
    branchA.state.messages['branch-a-message'] = true;
    branchA.revision += 1;
    const afterA = recoverStoryRun(pack, branchA, branchA.revision).run;
    const branchB = structuredClone(afterA);
    branchB.state.unlocks['reward_catalog_visibility:branch-b'] = true;
    branchB.state.completedEpisodes['branch-b-ending'] = true;
    branchB.revision += 1;
    const recovered = recoverStoryRun(pack, branchB, branchB.revision).run;
    assert.deepEqual(recovered.state, run.checkpoint.state);
    for (const key of ['reward_catalog_visibility:branch-a','reward_catalog_visibility:branch-b']) {
        assert.equal(recovered.state.unlocks[key], undefined);
    }
    for (const key of ['branch-a-ending','branch-b-ending']) {
        assert.equal(recovered.state.completedEpisodes[key], undefined);
    }
    assert.equal(recovered.state.memories['branch-a-memory'], undefined);
    assert.equal(recovered.state.messages['branch-a-message'], undefined);
});

test('published progression registry requires first clear and separately allowlists economic visibility', () => {
    const registry = buildPublishedStoryProgressionRegistry([pack,seasonTwo]);
    const gameNode = pack.nodes.find(node => (node.effects || []).some(effect =>
        effect.type === 'unlock' && effect.unlockType === 'game'));
    const gameEffect = gameNode.effects.find(effect => effect.type === 'unlock');
    const branch = registry.resolve(pack,gameNode.id,gameEffect,new Set());
    assert.deepEqual(branch,{
        progressionScope:'branch_local', provenanceType:'branch_effect',
        provenanceKey:gameNode.id, publishedBindingHash:null, economicEligible:false
    });
    const entitlement = registry.resolve(pack,gameNode.id,gameEffect,new Set([gameNode.episode]));
    assert.equal(entitlement.progressionScope,'account_entitlement');
    assert.equal(entitlement.provenanceType,'episode_first_clear');
    assert.equal(entitlement.economicEligible,false);
    assert.match(entitlement.publishedBindingHash,/^[a-f0-9]{64}$/);

    const economic = registry.bindings.filter(row => row.economicEligible);
    assert.deepEqual(economic.map(row => ({
        season:row.season,nodeId:row.nodeId,unlockType:row.unlockType,unlockKey:row.unlockKey,
        provenanceType:row.provenanceType,provenanceKey:row.provenanceKey
    })), [{
        season:'tides-of-return', nodeId:'storm-name-market.archive',
        unlockType:'reward_catalog_visibility', unlockKey:'tides.storm-label',
        provenanceType:'episode_first_clear', provenanceKey:'storm-name-market'
    }]);
});

test('published progression binding seed is restart-idempotent across PostgreSQL bigint strings', async () => {
    const binding = buildPublishedStoryProgressionRegistry([pack]).bindings[0];
    const client = { query:async(sql,values)=>{
        if (/INSERT INTO story_progression_bindings/.test(sql)) {
            assert.equal(values[1],3);
            return { rowCount:0, rows:[] };
        }
        if (/FROM story_progression_bindings WHERE binding_hash/.test(sql)) return {
            rowCount:1,
            rows:[{
                binding_hash:binding.publishedBindingHash,
                content_version_id:'3', node_id:binding.nodeId,
                unlock_type:binding.unlockType, unlock_key:binding.unlockKey,
                progression_scope:binding.progressionScope,
                provenance_type:binding.provenanceType, provenance_key:binding.provenanceKey,
                economic_eligible:binding.economicEligible
            }]
        };
        throw new Error(`Unexpected binding seed query: ${sql}`);
    } };
    const repository = new StoryWorldRepository(client);
    assert.equal(await repository.seedProgressionBindings('3',[binding]),1);
    await assert.rejects(repository.seedProgressionBindings('not-an-id',[binding]),
        /content version/);
});

test('ending router uses accumulated long-term state and has a safe fallback', () => {
    const router = pack.nodesById.get('season-one.ending-router');
    const base = { ...createStoryRun(pack), currentNodeId: router.id, currentEpisode: router.episode };
    assert.equal(transitionStory(pack, base, { action: 'advance', expectedRevision: 0 }).run.currentNodeId, 'season-one.ending.hearth');
    const harmony = structuredClone(base); harmony.state.axes.harmony = 20;
    assert.equal(transitionStory(pack, harmony, { action: 'advance', expectedRevision: 0 }).run.currentNodeId, 'season-one.ending.constellation');
});

test('a bounded deterministic policy completes all twelve episodes and the season', () => {
    let tick = 0, run = createStoryRun(pack); const episodes = new Set();
    for (let steps = 0; run.status !== 'completed' && steps < 500; steps += 1) {
        const node = pack.nodesById.get(run.currentNodeId); let command;
        if (node.type === 'choice') command = { action: 'choose', choiceId: node.options[0].id, expectedRevision: run.revision };
        else if (node.type === 'puzzle') command = { action: 'answer', answerKey: node.answerKey, expectedRevision: run.revision };
        else if (node.type === 'season_ending') command = { action: 'finish', expectedRevision: run.revision };
        else command = { action: 'advance', expectedRevision: run.revision };
        const result = transitionStory(pack, run, command, { now: () => new Date(Date.UTC(2026, 7, 16, 12, 0, tick += 2)) });
        result.event.newlyCompletedEpisodes.forEach((episode) => episodes.add(episode)); run = result.run;
    }
    assert.equal(run.status, 'completed'); assert.equal(episodes.size, 12); assert.equal(run.state.committedChoices.length, 60);
});

test('all five endings are reachable from distinct long-term axis states', () => {
    const router = pack.nodesById.get('season-one.ending-router');
    const route = (axes) => transitionStory(pack, { ...createStoryRun(pack), currentNodeId: router.id, currentEpisode: router.episode, state: { ...initialStoryState(), axes: { ...initialStoryState().axes, ...axes } } }, { action: 'advance', expectedRevision: 0 }).run.currentNodeId;
    assert.equal(route({ harmony: 20 }), 'season-one.ending.constellation');
    assert.equal(route({ trust: 20 }), 'season-one.ending.beacon');
    assert.equal(route({ curiosity: 20 }), 'season-one.ending.archive');
    assert.equal(route({ courage: 20 }), 'season-one.ending.brave');
    assert.equal(route({}), 'season-one.ending.hearth');
});

test('migration freezes snapshots and separates story from money and gift tables', () => {
    const sql = source('migrations/add_story_world_season_one.sql');
    for (const fragment of ['story_content_versions', 'content_snapshot JSONB NOT NULL', 'story_events', 'story_first_clears', 'story_unlock_intents', 'story_protect_catalog_content', 'published_at IS DISTINCT', 'story_reject_append_only_mutation']) assert.match(sql, new RegExp(fragment));
    assert.doesNotMatch(sql, /REFERENCES\s+(?:balances|gift_exchanges|wish_inventory)/i);
});

test('forward story progression migration fails legacy unlocks closed and validates irreversible provenance', () => {
    const sql = source('migrations/add_streamer_story_progression_scopes.sql');
    for (const fragment of [
        'progression_scope', 'provenance_type', 'provenance_key',
        'published_binding_hash', 'economic_eligible',
        "progression_scope = 'branch_local'", "DEFAULT 'legacy_unverified'",
        'story_progression_bindings', 'story_validate_unlock_progression', 'story_first_clears',
        "source_event.action = 'finish'", 'source_event.from_node_id = binding.node_id',
        'story unlock provenance is immutable'
    ]) assert.match(sql,new RegExp(fragment));
    assert.match(source('lib/database-migrations.js'),/add_streamer_story_progression_scopes\.sql/);
    assert.doesNotMatch(sql,/UPDATE\s+(?:story_memories|creator_inbox_messages)/i);
    assert.doesNotMatch(sql,/gift_exchanges|wish_inventory|delivery_outbox|provider_receipt/i);
});

test('reward visibility reads only reviewed economic story entitlements', async () => {
    const calls = [];
    const pool = { query:async()=>({rows:[]}), connect:async()=>({query:async()=>({rows:[]}),release(){}}) };
    const repository = new RewardCatalogRepository({ pool });
    const client = { query:async(sql,values)=>{ calls.push({sql,values}); return {rows:[{allowed:false}]}; } };
    assert.equal(await repository.hasVisibilityUnlock(client,7,'story_unlock','tides.storm-label'),false);
    assert.equal(await repository.hasVisibilityUnlock(client,7,'story_unlock','reward.story-lantern'),false);
    assert.equal(calls.length,2);
    assert.deepEqual(calls[0].values,[7,'tides.storm-label']);
    assert.deepEqual(calls[1].values,[7,'tides.storm-label'],
        'the immutable v1 reward key must map to its published Season Two milestone');
    for (const fragment of [
        "progression_scope='account_entitlement'", 'economic_eligible=TRUE',
        'published_binding_hash IS NOT NULL'
    ]) assert.match(calls[0].sql,new RegExp(fragment));
    assert.ok(calls[0].sql.includes("provenance_type IN('episode_first_clear','season_completion')"));
    assert.doesNotMatch(calls[0].sql,/story_memories|creator_inbox_messages/);
    const repositorySource = source('repositories/reward-catalog-repository.js');
    assert.match(repositorySource,/WHEN 'reward\.story-lantern' THEN 'tides\.storm-label'/);
});

test('Story World requires strict lowercase master, creator, and story flags', () => {
    assert.equal(readStreamerWorldFlags({ STREAMER_WORLD_ENABLED: 'true', CREATOR_PROFILE_ENABLED: 'true', STORY_WORLD_ENABLED: 'true' }).storyWorldEnabled, true);
    for (const value of ['TRUE', '1', 'yes', ' true ']) assert.equal(readStreamerWorldFlags({ STREAMER_WORLD_ENABLED: 'true', CREATOR_PROFILE_ENABLED: 'true', STORY_WORLD_ENABLED: value }).storyWorldEnabled, false);
});

test('story writes use fixed exact paths and preview remains non-idempotent and read-only', () => {
    for (const route of ['/api/story/runs/start', '/api/story/actions/commit', '/api/story/runs/recover']) assert.ok(IDEMPOTENT_WRITE_PATHS.includes(route));
    assert.ok(!IDEMPOTENT_WRITE_PATHS.includes('/api/story/actions/preview'));
    assert.ok(ROUTE_MANIFEST.some((route) => route.path === '/api/story/actions/preview' && route.policies.includes('csrf')));
});

test('trusted Story events use a strict registered schema', () => {
    const event = validateInternalStoryEvent({ sourceType: 'story', sourceEventId: 'story-event:11111111-1111-4111-a111-111111111111', username: 'alice', eventType: 'story.choice.committed', occurredAt: '2026-08-16T12:00:00Z', payload: { runId: 9, episodeSlug: 'quiet-frequency', choiceId: 'quiet-frequency.m1.left', contentVersion: 1 } });
    assert.equal(event.eventType, 'story.choice.committed');
    assert.throws(() => validateInternalStoryEvent({ ...event, payload: { ...event.payload, points: 5 } }), /malformed/i);
    assert.doesNotThrow(() => validateRegisteredRule({ op: 'event_count', event: 'story.episode.completed', target: 1, filters: {} }));
});

function memoryHarness() {
    const initial = createStoryRun(pack); const state = { run: { id: 7, user_id: 4, campaign_id: 2, content_version_id: 3, status: initial.status, current_episode: initial.currentEpisode, current_node_id: initial.currentNodeId, revision: initial.revision, replay_mode: false, state_snapshot: initial.state, checkpoint_snapshot: null }, events: [], audits: [], memories: [], unlocks: [], inbox: [], firstClears: [], relationships: [], questEvents: [], normalized: { flags: {}, clues: {}, inventory: {}, routes: {}, messages: {}, memories: {}, unlocks: {} } };
    let tail = Promise.resolve();
    const pool = { async connect() { let snapshot, unlock; return { query: async (sql) => { if (sql === 'BEGIN') { const prior = tail; tail = new Promise((resolve) => { unlock = resolve; }); await prior; snapshot = structuredClone(state); } if (sql === 'ROLLBACK') { for (const key of Object.keys(state)) delete state[key]; Object.assign(state, snapshot); unlock?.(); } if (sql === 'COMMIT') unlock?.(); return { rows: [], rowCount: 0 }; }, release() {} }; } };
    const repository = () => ({
        lockCreator: async () => ({ id: 4, username: 'alice', timezone: 'UTC' }), readCreator: async () => ({ id: 4, username: 'alice', timezone: 'UTC' }), loadBoundaries: async () => ({ preferences: [], quietHours: [] }),
        lockRun: async (_user, id) => Number(id) === 7 ? structuredClone(state.run) : null, loadRun: async () => structuredClone(state.run), latestRun: async () => structuredClone(state.run),
        loadEvent: async (_run, command) => state.events.find((event) => event.command_id === command) || null,
        hasCommittedChoice: async () => false,
        updateRun: async (_id, revision, run) => { if (state.run.revision !== revision || state.run.status !== 'active') return null; Object.assign(state.run, { status: run.status, current_episode: run.currentEpisode, current_node_id: run.currentNodeId, revision: run.revision, state_snapshot: structuredClone(run.state), checkpoint_snapshot: run.checkpoint }); return state.run; },
        appendEvent: async (event) => { if (state.events.some((item) => item.command_id === event.commandId)) return null; const row = { ...event, command_id: event.commandId, semantic_hash: event.semanticHash, response_snapshot: event.response }; state.events.push(row); return row; },
        syncState: async (_runId, _eventId, storyState) => { state.normalized = { flags: structuredClone(storyState.flags), clues: structuredClone(storyState.clues), inventory: structuredClone(storyState.inventory), routes: structuredClone(storyState.routes), messages: structuredClone(storyState.messages), memories: structuredClone(storyState.memories), unlocks: structuredClone(storyState.unlocks) }; }, insertAudit: async (audit) => state.audits.push(audit), listAdminAudit: async () => state.audits,
        loadCatalogIdentity: async () => ({ campaign_id: 2, content_version_id: 3 }), loadContentVersion: async () => null,
        insertFirstClear: async (entry) => { if (state.failFirstClear) throw new Error('first clear failed'); if (state.firstClearResult === false) return false; state.firstClears.push(entry); return true; },
        appendRelationshipFirstClear: async (entry) => { if (state.failRelationship) throw new Error('relationship failed'); state.relationships.push(entry); },
        insertMemory: async (entry) => state.memories.push(entry), insertUnlock: async (entry) => { if (state.failUnlock) throw new Error('unlock failed'); state.unlocks.push(entry); }, insertMessage: async (entry) => state.inbox.push(entry)
    });
    const service = new StoryWorldService({ pool, repositoryFactory: repository, content: pack }); service.catalog = { campaign: { id: 2 }, version: { id: 3 } }; service.contentCache.set(3, pack);
    return { state, service };
}

test('preview is reversible and writes no run, event, audit, or idempotent state', async () => {
    const { state, service } = memoryHarness(); const choiceRun = transitionStory(pack, databaseHarnessRun(state.run), { action: 'advance', expectedRevision: 0 }).run;
    Object.assign(state.run, { current_node_id: choiceRun.currentNodeId, current_episode: choiceRun.currentEpisode, revision: choiceRun.revision, state_snapshot: choiceRun.state });
    const before = structuredClone(state); const choice = pack.nodesById.get(choiceRun.currentNodeId).options[0];
    const preview = await service.preview('alice', { runId: 7, action: 'choose', choiceId: choice.id, expectedRevision: 1, language: 'en' });
    assert.equal(preview.preview, true); assert.deepEqual(state, before);
    assert.equal(JSON.stringify(preview).includes('effects'), false);
});

function databaseHarnessRun(row) { return { status: row.status, currentNodeId: row.current_node_id, currentEpisode: row.current_episode, revision: Number(row.revision), replayMode: Boolean(row.replay_mode), state: row.state_snapshot, checkpoint: row.checkpoint_snapshot }; }

test('preview rejects puzzle answers and every story command rejects unknown fields', async () => {
    const { service } = memoryHarness();
    await assert.rejects(service.preview('alice', { runId: 7, action: 'answer', answerKey: 'secret', expectedRevision: 0 }), (error) => error.code === 'STORY_INVALID_INPUT' || error.code === 'STORY_PREVIEW_CHOICE_ONLY');
    await assert.rejects(service.commit('alice', { runId: 7, action: 'advance', expectedRevision: 0, state: { axes: { trust: 999 } } }, { requestId: 'unknown-field-command' }), (error) => error.code === 'STORY_INVALID_INPUT');
    await assert.rejects(service.start('alice', { replay: false, username: 'bob' }, { requestId: 'unknown-start-command' }), (error) => error.code === 'STORY_INVALID_INPUT');
});

test('run, event, audit, and idempotent response roll back together', async () => {
    const { state, service } = memoryHarness(); const before = structuredClone(state);
    await assert.rejects(service.commit('alice', { runId: 7, action: 'advance', expectedRevision: 0 }, { requestId: 'story-rollback-command', finalizeIdempotency: async () => { throw new Error('finalize lost'); } }), /finalize lost/);
    assert.deepEqual(state, before);
});

test('serialized stale concurrent story commands allow exactly one commit', async () => {
    const { state, service } = memoryHarness();
    const settled = await Promise.allSettled([
        service.commit('alice', { runId: 7, action: 'advance', expectedRevision: 0 }, { requestId: 'story-concurrent-one' }),
        service.commit('alice', { runId: 7, action: 'advance', expectedRevision: 0 }, { requestId: 'story-concurrent-two' })
    ]);
    assert.equal(settled.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(settled.filter((item) => item.status === 'rejected').length, 1);
    assert.equal(state.run.revision, 1); assert.equal(state.events.length, 1);
});

test('same semantic command replays persisted response once and changed body collides', async () => {
    const { state, service } = memoryHarness(); const context = { requestId: 'story-semantic-replay' };
    const first = await service.commit('alice', { runId: 7, action: 'advance', expectedRevision: 0 }, context);
    const revision = state.run.revision, eventCount = state.events.length;
    const replay = await service.commit('alice', { runId: 7, action: 'advance', expectedRevision: 0 }, context);
    assert.deepEqual(replay, first); assert.equal(state.run.revision, revision); assert.equal(state.events.length, eventCount);
    await assert.rejects(service.commit('alice', { runId: 7, action: 'advance', expectedRevision: 1 }, context), (error) => error.code === 'STORY_COMMAND_COLLISION');
});

function placeAtCompletionSpecial(state) {
    const node = pack.nodes.find((item) => item.type === 'game_launch');
    Object.assign(state.run, { current_node_id: node.id, current_episode: node.episode, revision: 0, state_snapshot: initialStoryState(), checkpoint_snapshot: null, status: 'active' });
}

test('non-first episode completion emits neither relationship XP nor Quest progress', async () => {
    const { state, service } = memoryHarness(); placeAtCompletionSpecial(state); state.firstClearResult = false;
    service.questIntegrationEnabled = true; service.questV2Service = { recordInternalTrustedEvent: async (_client, event) => state.questEvents.push(event) };
    await service.commit('alice', { runId: 7, action: 'advance', expectedRevision: 0 }, { requestId: 'story-not-first-clear' });
    assert.deepEqual(state.relationships, []); assert.deepEqual(state.questEvents, []);
    assert.equal(state.unlocks[0].progressionScope,'branch_local');
    assert.equal(state.unlocks[0].economicEligible,false);
});

test('first-clear story unlock persists immutable published entitlement provenance', async () => {
    const { state, service } = memoryHarness(); placeAtCompletionSpecial(state);
    await service.commit('alice',{runId:7,action:'advance',expectedRevision:0},
        {requestId:'story-entitlement-first-clear'});
    assert.equal(state.unlocks.length,1);
    assert.equal(state.unlocks[0].progressionScope,'account_entitlement');
    assert.equal(state.unlocks[0].provenanceType,'episode_first_clear');
    assert.equal(state.unlocks[0].provenanceKey,'locked-window');
    assert.match(state.unlocks[0].publishedBindingHash,/^[a-f0-9]{64}$/);
    assert.equal(state.unlocks[0].economicEligible,false);
});

for (const [name, configure, pattern] of [
    ['first-clear', (state) => { state.failFirstClear = true; }, /first clear failed/],
    ['unlock', (state) => { state.failUnlock = true; }, /unlock failed/],
    ['relationship', (state) => { state.failRelationship = true; }, /relationship failed/],
    ['Quest hook', (state, service) => { service.questIntegrationEnabled = true; service.questV2Service = { recordInternalTrustedEvent: async () => { state.questEvents.push('attempt'); throw new Error('quest hook failed'); } }; }, /quest hook failed/]
]) test(`${name} failure rolls back run, event, projections, memories, and first-clear side effects`, async () => {
    const { state, service } = memoryHarness(); placeAtCompletionSpecial(state); configure(state, service); const before = structuredClone(state);
    await assert.rejects(service.commit('alice', { runId: 7, action: 'advance', expectedRevision: 0 }, { requestId: `story-failure-${name.replace(/\s/g, '-')}` }), pattern);
    assert.deepEqual(state, before);
});

test('service recovery reconciles every branch projection while account meta history remains durable', async () => {
    const { state, service } = memoryHarness(); const checkpointNode = pack.nodes.find((item) => item.type === 'checkpoint');
    const checkpointState = initialStoryState(); checkpointState.flags.before = true; checkpointState.memories['before.memory'] = true;
    const currentState = structuredClone(checkpointState); currentState.flags.after = true; currentState.clues.after = true; currentState.memories['after.memory'] = true; currentState.unlocks['collection:after'] = true; currentState.messages['after.message'] = true; currentState.completedEpisodes.after = true;
    Object.assign(state.run, { current_node_id: pack.nodesById.get(checkpointNode.next).id, current_episode: checkpointNode.episode, revision: 8, state_snapshot: currentState, checkpoint_snapshot: { nodeId: checkpointNode.next, revision: 5, state: checkpointState } });
    state.firstClears.push({ episode: 'before-first-bell' }); state.memories.push({ key:'after.memory' }); state.inbox.push({ key:'after.message' }); state.normalized = { flags: structuredClone(currentState.flags), clues: structuredClone(currentState.clues), inventory: {}, routes: {}, messages: structuredClone(currentState.messages), memories: structuredClone(currentState.memories), unlocks: structuredClone(currentState.unlocks) };
    await service.recover('alice', { runId: 7, expectedRevision: 8 }, { requestId: 'story-service-recover' });
    assert.deepEqual(state.normalized.flags, { before: true }); assert.deepEqual(state.normalized.clues, {});
    assert.deepEqual(state.normalized.memories, { 'before.memory':true }); assert.deepEqual(state.normalized.unlocks, {});
    assert.deepEqual(state.normalized.messages, {}); assert.deepEqual(state.run.state_snapshot.completedEpisodes, {});
    assert.equal(state.memories.length, 1); assert.equal(state.inbox.length, 1); assert.equal(state.firstClears.length, 1);
});

test('catalog seed fails closed for hash, snapshot, or count drift at the same version', async () => {
    const { nodesById, contentHash, ...snapshot } = pack;
    for (const drift of [
        { content_hash: '0'.repeat(64), content_snapshot: snapshot, node_count: pack.nodes.length },
        { content_hash: contentHash, content_snapshot: { ...snapshot, title: { zh: '漂移标题', en: 'Drift' } }, node_count: pack.nodes.length },
        { content_hash: contentHash, content_snapshot: snapshot, node_count: pack.nodes.length - 1 },
        { content_hash: contentHash, content_snapshot: snapshot, node_count: pack.nodes.length, choice_count: 59 }
    ]) {
        const client = { query: async (sql) => {
            if (sql.includes('INSERT INTO story_campaigns')) return { rows: [] };
            if (sql.includes('SELECT * FROM story_campaigns')) return { rows: [{ id: 2, slug: pack.slug, title_zh: pack.title.zh, title_en: pack.title.en }] };
            if (sql.includes('INSERT INTO story_content_versions')) return { rows: [] };
            return { rows: [{ id: 3, campaign_id: 2, version: pack.version, choice_count: 60, ...drift }] };
        } };
        await assert.rejects(new StoryWorldRepository(client).seedContent(pack), /content version collision/i);
    }
});

test('committed event records before/after state hashes and all consequence keys', async () => {
    const { state, service } = memoryHarness(); await service.commit('alice', { runId: 7, action: 'advance', expectedRevision: 0 }, { requestId: 'story-effect-digest' });
    const digest = state.events[0].effectsDigest; assert.match(digest.beforeStateHash, /^[a-f0-9]{64}$/); assert.match(digest.afterStateHash, /^[a-f0-9]{64}$/); assert.ok(Array.isArray(digest.effects));
});

test('bound old content version runs continue after catalog activation changes', async () => {
    const { state, service } = memoryHarness(); service.catalog = { campaign: { id: 2 }, version: { id: 99 } };
    service.contentCache.set(3, pack); const response = await service.commit('alice', { runId: 7, action: 'advance', expectedRevision: 0 }, { requestId: 'old-version-command' });
    assert.equal(response.story.campaign.version, 1); assert.equal(state.run.content_version_id, 3);
});

test('quiet-hour projection defers owner presence without blocking asynchronous story', () => {
    const owner = pack.nodes.find((node) => node.type === 'owner_intervention');
    const run = { ...createStoryRun(pack), currentNodeId: owner.id, currentEpisode: owner.episode };
    assert.equal(publicStoryProjection(pack, run, { ownerPresence: 'deferred_for_quiet_hours' }).node.ownerPresence, 'deferred_for_quiet_hours');
});

test('communication mute hides owner prose while keeping autonomous story available', () => {
    const owner = pack.nodes.find((node) => node.type === 'owner_intervention'); const run = { ...createStoryRun(pack), currentNodeId: owner.id, currentEpisode: owner.episode };
    const projection = publicStoryProjection(pack, run, { language: 'en', ownerMessagesBlocked: true });
    assert.equal(projection.node.ownerPresence, 'muted_by_creator'); assert.match(projection.node.text, /muted by your preferences/);
    assert.doesNotMatch(projection.node.text, new RegExp(owner.text.en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('feature-off registrar returns 404 before story state service', async () => {
    const registered = []; const app = { get: (routePath, ...handlers) => registered.push({ routePath, handlers }), post: (routePath, ...handlers) => registered.push({ routePath, handlers }) };
    let calls = 0; const pass = (_req, _res, next) => next();
    require('../routes/story-world')(app, { storyWorldService: { state: async () => { calls += 1; } }, streamerWorldFlags: { storyWorldEnabled: false }, generateCSRFToken: () => 'x', requireLogin: pass, requireAuthorized: pass, requireCSRF: pass, security: { basicRateLimit: pass, userActionRateLimit: pass, readHeavyRateLimit: pass } });
    const route = registered.find((item) => item.routePath === '/api/story/state'); const response = { statusCode: 0, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await route.handlers[3]({ path: '/api/story/state' }, response, () => { throw new Error('gate bypass'); });
    assert.equal(response.statusCode, 404); assert.equal(calls, 0);
});

test('browser UI is bilingual, mobile, escaped by construction, and uses shared idempotency', () => {
    const view = source('views/story-world.ejs'), script = source('public/js/story-world.js'), css = source('public/story-world.css');
    assert.match(view, /持久分支故事/); assert.match(view, /Persistent branching story/);
    assert.match(view, /replace\(\/<\/g/); assert.match(script, /window\.idempotentFetch/); assert.match(script, /'X-CSRF-Token'/);
    assert.doesNotMatch(script, /innerHTML|await fetch\(/); assert.match(css, /@media\(max-width:600px\)/); assert.match(css, /min-height:52px/);
});

function executeStoryBrowser(model, responses) {
    class Element {
        constructor(tag = '') { this.tag = tag; this.dataset = {}; this.children = []; this.textContent = ''; this.listeners = {}; this.disabled = false; }
        append(...items) { this.children.push(...items); } replaceChildren(...items) { this.children = [...items]; }
        addEventListener(name, handler) { this.listeners[name] = handler; } closest(selector) { return selector === 'button[data-action]' && this.dataset.action ? this : null; }
    }
    const stage = new Element('section'), axes = new Element('div'), unlocks = new Element('ul'), message = new Element('p'), bootstrap = new Element('script'); bootstrap.textContent = JSON.stringify(model);
    const body = new Element('body'); body.dataset = { csrfToken: 'csrf-token', lang: 'en' };
    const calls = [];
    const context = { document: { body, getElementById(id) { return ({ 'story-stage': stage, 'story-axes': axes, 'story-unlocks': unlocks, 'story-message': message, 'story-bootstrap': bootstrap })[id]; }, createElement: (tag) => new Element(tag) }, window: {}, JSON, Object, Number, Error };
    context.window.idempotentFetch = async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); const payload = responses[url]; return { ok: true, json: async () => payload }; };
    vm.runInNewContext(source('public/js/story-world.js'), context); return { stage, axes, unlocks, message, calls };
}

test('browser recovery removes abandoned branch unlocks from the rendered projection', async () => {
    const active = {
        run:{status:'active',revision:8,canRecover:true},
        node:{speaker:null,episode:'Branch A',text:'A temporary branch.',action:'advance'},
        progress:{axes:{trust:4},unlocks:['reward_catalog_visibility:branch-a']}
    };
    const restored = {
        run:{status:'active',revision:9,canRecover:true},
        node:{speaker:null,episode:'Checkpoint',text:'The checkpoint is restored.',action:'advance'},
        progress:{axes:{trust:1},unlocks:[]}
    };
    const ui = executeStoryBrowser({runId:7,story:active,selectedSeason:'signal-between-us'}, {
        '/api/story/runs/recover':{success:true,recovered:true,runId:7,story:restored}
    });
    assert.equal(ui.unlocks.children[0].textContent,'reward_catalog_visibility:branch-a');
    const recover = ui.stage.children.find(item=>item.dataset.action==='recover');
    await ui.stage.listeners.click({target:recover});
    assert.deepEqual(ui.calls.map(item=>item.url),['/api/story/runs/recover']);
    assert.equal(ui.unlocks.children.length,0);
    assert.match(ui.stage.children[1].textContent,/checkpoint is restored/i);
});

test('browser choice preview is reversible and confirmation is the only commit', async () => {
    const run = transitionStory(pack, createStoryRun(pack), { action: 'advance', expectedRevision: 0 }).run;
    const story = publicStoryProjection(pack, run, { language: 'en' }); const choice = story.node.choices[0];
    const committedRun = transitionStory(pack, run, { action: 'choose', expectedRevision: 1, choiceId: choice.id }).run;
    const ui = executeStoryBrowser({ runId: 7, story }, {
        '/api/story/actions/preview': { success: true, preview: true, revision: 1, outcome: 'Preview outcome', next: { type: 'narrative', speaker: null, text: 'Preview next' } },
        '/api/story/actions/commit': { success: true, runId: 7, story: publicStoryProjection(pack, committedRun, { language: 'en' }), outcome: 'Committed' }
    });
    const previewButton = ui.stage.children.find((item) => item.dataset.action === 'preview-choice');
    await ui.stage.listeners.click({ target: previewButton }); assert.deepEqual(ui.calls.map((item) => item.url), ['/api/story/actions/preview']);
    const confirm = ui.stage.children.find((item) => item.dataset.action === 'confirm-choice'); await ui.stage.listeners.click({ target: confirm });
    assert.deepEqual(ui.calls.map((item) => item.url), ['/api/story/actions/preview', '/api/story/actions/commit']);
    assert.equal(ui.calls[1].body.expectedRevision, 1); assert.equal(ui.calls[1].body.choiceId, choice.id);
});

test('completed browser state exposes replay without an invalid finish command', () => {
    const ending = pack.nodesById.get('season-one.ending.hearth'); const run = { ...createStoryRun(pack), status: 'completed', currentNodeId: ending.id, currentEpisode: ending.episode };
    const ui = executeStoryBrowser({ runId: 7, story: publicStoryProjection(pack, run, { language: 'en' }) }, {});
    const actions = ui.stage.children.filter((item) => item.dataset.action).map((item) => item.dataset.action);
    assert.deepEqual(actions, ['replay']);
});

test('browser preserves selected season through completion and value-free replay', async () => {
    const activeStory = {
        run: { status: 'active', revision: 11, canRecover: false },
        node: { speaker: null, episode: 'The Listening Orchard', text: 'The last bell is ready.', action: 'finish' },
        progress: { axes: {}, unlocks: [] }
    };
    const completedStory = {
        ...activeStory,
        run: { status: 'completed', revision: 12, canRecover: false },
        node: { speaker: null, episode: 'The Listening Orchard', text: 'The orchard keeps its answer.', action: null }
    };
    const ui = executeStoryBrowser({
        runId: 31,
        story: activeStory,
        selectedSeason: 'city-of-borrowed-hours',
        seasons: [{ slug: 'city-of-borrowed-hours', title: 'The Signal Between Us: Borrowed Hours' }]
    }, {
        '/api/story/actions/commit': { success: true, runId: 31, story: completedStory },
        '/api/story/runs/start': { success: true, runId: 32, story: activeStory }
    });
    const finish = ui.stage.children.find((item) => item.dataset.action === 'finish');
    await ui.stage.listeners.click({ target: finish });
    const replay = ui.stage.children.find((item) => item.dataset.action === 'replay');
    await ui.stage.listeners.click({ target: replay });
    assert.equal(ui.calls[1].url, '/api/story/runs/start');
    assert.equal(ui.calls[1].body.replay, true);
    assert.equal(ui.calls[1].body.season, 'city-of-borrowed-hours');
});

test('Story World modules never touch balance or gift provider boundaries', () => {
    for (const file of ['domain/story/effects.js','services/story-world-service.js','repositories/story-world-repository.js','routes/story-world.js']) {
        assert.doesNotMatch(source(file), /BalanceLogger|sendGift|bilibili_gift_sender|gift_exchanges|wish_inventory/i, file);
    }
});
