'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { evaluateRule, validateRule, QuestRuleError } = require('../domain/quests/v2/rules');
const { validateEvidence, QuestEvidenceError } = require('../domain/quests/v2/evidence');
const { assertTransition, QuestTransitionError } = require('../domain/quests/v2/transitions');
const { QUESTS, CHAINS, BOARDS, PACK_COUNTS } = require('../content/streamer-world/quests/phase-2-pack');
const { readStreamerWorldFlags } = require('../lib/streamer-world-flags');
const { IDEMPOTENT_WRITE_PATHS, MUTATING_ADMIN_PATHS } = require('../routes/manifest');
const { QuestV2RuntimeRepository } = require('../repositories/quest-v2-runtime-repository');
const { QuestV2Service, QuestV2ServiceError, validateRegisteredRule } = require('../services/quest-v2-service');

const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Phase 2 pack has 60 original bilingual quests, ten chains, and twelve boards', () => {
    assert.deepEqual(PACK_COUNTS, { quests: 60, chains: 10, boards: 12 });
    assert.equal(new Set(QUESTS.map((item) => item.slug)).size, 60);
    assert.equal(new Set(QUESTS.map((item) => item.titleZh)).size, 60);
    assert.equal(new Set(QUESTS.map((item) => item.titleEn)).size, 60);
    assert.ok(QUESTS.every((item) => item.titleZh && item.titleEn && item.descriptionZh && item.descriptionEn));
    assert.ok(CHAINS.every((chain) => chain.quests.length >= 3));
    assert.ok(BOARDS.every((board) => board.quests.length === 8));
});

test('explicit per-event gte filter requires one quiz round reaching eight', () => {
    const rule = { op: 'event_count', event: 'quiz.round.completed', target: 1, filters: { correct: { op: 'gte', value: 8 } } };
    const event = (correct, second) => ({ eventType: 'quiz.round.completed', occurredAt: `2026-08-1${second}T00:00:00.000Z`, payload: { correct } });
    assert.equal(evaluateRule(rule, { events: [event(7, 1)] }), false);
    assert.equal(evaluateRule(rule, { events: [event(8, 1)] }), true);
    assert.equal(evaluateRule(rule, { events: [event(4, 1), event(4, 2)] }), false);
});

test('rule AST is closed, bounded, and rejects arbitrary event publication', () => {
    assert.throws(() => validateRule({ op: 'event_count', event: 'quiz.round.completed', target: 1, filters: { correct: { op: 'eval', value: 8 } } }), QuestRuleError);
    assert.throws(() => validateRule({ op: 'execute_js', source: 'return true' }), QuestRuleError);
    assert.throws(() => validateRegisteredRule({ op: 'event_count', event: 'browser.claimed', target: 1, filters: {} }), /unregistered/i);
    assert.doesNotThrow(() => validateRegisteredRule({ op: 'event_count', event: 'doudizhu.match.won', target: 1, filters: {} }));
});

test('text/checklist evidence is bounded plain data and PNG is fail-closed', async () => {
    const textEvidence = await validateEvidence({ text: '<img src=x onerror=alert(1)>' }, { expectedKind: 'text' });
    assert.equal(textEvidence.content.text, '<img src=x onerror=alert(1)>');
    const checklist = await validateEvidence({ items: [{ label: 'Creator confirmed', checked: true }] }, { expectedKind: 'checklist' });
    assert.equal(checklist.content.items.length, 1);
    await assert.rejects(validateEvidence({ imageData: 'data:text/html;base64,PHNjcmlwdD4=' }, { expectedKind: 'png' }), QuestEvidenceError);
    await assert.rejects(validateEvidence({ text: 'x'.repeat(2001) }, { expectedKind: 'text' }), QuestEvidenceError);
});

test('decline is neutral from offered, active, or returned and terminal states stay closed', () => {
    assert.doesNotThrow(() => assertTransition('offered', 'declined'));
    assert.doesNotThrow(() => assertTransition('active', 'declined'));
    assert.doesNotThrow(() => assertTransition('returned', 'declined'));
    assert.throws(() => assertTransition('completed', 'active'), QuestTransitionError);
});

test('Quest V2 requires all three strict lowercase flags', () => {
    assert.equal(readStreamerWorldFlags({ STREAMER_WORLD_ENABLED: 'true', CREATOR_PROFILE_ENABLED: 'true', QUEST_ENGINE_V2_ENABLED: 'true' }).questEngineV2Enabled, true);
    for (const value of ['TRUE', '1', 'yes', ' true ']) {
        assert.equal(readStreamerWorldFlags({ STREAMER_WORLD_ENABLED: 'true', CREATOR_PROFILE_ENABLED: 'true', QUEST_ENGINE_V2_ENABLED: value }).questEngineV2Enabled, false);
    }
});

test('all Quest V2 mutations use fixed exact idempotent paths and admin audit policies', () => {
    const expected = [
        '/api/quests/v2/offers/claim', '/api/quests/v2/assignments/accept',
        '/api/quests/v2/assignments/decline', '/api/quests/v2/assignments/postpone',
        '/api/quests/v2/evidence/submit', '/api/quests/v2/assignments/submit',
        '/api/quests/v2/legacy/import', '/api/admin/quests/v2/drafts',
        '/api/admin/quests/v2/publish', '/api/admin/quests/v2/review'
    ];
    for (const route of expected) assert.ok(IDEMPOTENT_WRITE_PATHS.includes(route), route);
    for (const route of expected.filter((item) => item.startsWith('/api/admin/'))) assert.ok(MUTATING_ADMIN_PATHS.has(route), route);
    assert.ok(expected.every((route) => !route.includes(':')));
});

test('migration freezes published catalogs and models repeat cycles, policies, hooks, and parallel steps', () => {
    const sql = source('migrations/add_streamer_quest_engine_v2.sql');
    for (const fragment of [
        'occurrence INTEGER NOT NULL', 'uq_quest_v2_assignment_active_cycle',
        'parallel_group INTEGER', 'depends_on_keys TEXT[]', 'decline_behavior',
        'postpone_policy JSONB', 'expiry_behavior', 'unlock_hooks JSONB',
        'quest_v2_protect_schedule', 'quest_v2_board_slots_append_only',
        "OLD.lifecycle = 'retired'", "OLD.lifecycle = 'active' AND NEW.lifecycle <> 'retired'"
    ]) assert.match(sql, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(sql, /REFERENCES\s+(?:gift_exchanges|wish_inventory)/i);
});

test('evidence retention keeps canonical hashes and only permits expired tombstone redaction', async () => {
    const sql = source('migrations/add_streamer_quest_engine_v2.sql');
    assert.match(sql, /content_sha256 CHAR\(64\) NOT NULL/);
    assert.match(sql, /OLD\.retention_until > NOW\(\)/);
    assert.match(sql, /NEW\.content <> '\{\}'::JSONB/);
    const calls = [];
    const early = new QuestV2RuntimeRepository({ query: async (text) => { calls.push(text); return { rowCount: 0, rows: [] }; } });
    assert.equal(await early.redactExpiredEvidence('11111111-1111-4111-a111-111111111111'), null);
    const late = new QuestV2RuntimeRepository({ query: async () => ({ rowCount: 1, rows: [{ id: 'x', assignment_id: 7 }] }) });
    assert.deepEqual(await late.redactExpiredEvidence('11111111-1111-4111-a111-111111111111'), { id: 'x', assignment_id: 7 });
    assert.match(calls[0], /retention_until <= NOW\(\)/);
});

function transactionalPool(state) {
    return {
        state,
        async connect() {
            let snapshot;
            return {
                query: async (sql) => {
                    if (sql === 'BEGIN') snapshot = structuredClone(state);
                    if (sql === 'ROLLBACK') {
                        for (const key of Object.keys(state)) delete state[key];
                        Object.assign(state, snapshot);
                    }
                    return { rows: [], rowCount: 0 };
                },
                release() {}
            };
        }
    };
}

function evidenceRuntime(pool) {
    return {
        client: {},
        lockCreator: async () => ({ id: 4, evidence_retention: 'minimum' }),
        lockEvidenceStep: async () => ({ assignment_status: 'active', step_status: 'active', step_revision: 0, evidence_kind: 'text' }),
        evidenceQuota: async () => ({ retainedBytes: 0, recentCount: 0, stepVersions: 0 }),
        insertEvidence: async (item) => { pool.state.evidence.push(item); return { id: item.id }; },
        markStepSubmitted: async () => { pool.state.step = 'submitted'; return true; },
        insertAudit: async (item) => { pool.state.audit.push(item); }
    };
}

test('evidence, audit, and idempotent response roll back together when finalization fails', async () => {
    const state = { evidence: [], audit: [], step: 'active' };
    const pool = transactionalPool(state);
    const service = new QuestV2Service({
        pool, BalanceLogger: { updateBalance: async () => ({ success: true }) },
        runtimeRepositoryFactory: () => evidenceRuntime(pool), catalogRepositoryFactory: () => ({})
    });
    await assert.rejects(service.submitEvidence('creator', {
        assignmentId: 1, stepId: 2, evidence: { text: 'bounded plain evidence' }
    }, { requestId: 'quest-evidence-command-0001', finalizeIdempotency: async () => { throw new Error('finalize failed'); } }), /finalize failed/);
    assert.deepEqual(state, { evidence: [], audit: [], step: 'active' });
});

test('retention preference maps to seven days and completed assignments reject new evidence', async () => {
    const state = { evidence: [], audit: [], step: 'active' };
    const pool = transactionalPool(state);
    const runtime = evidenceRuntime(pool);
    const service = new QuestV2Service({ pool, BalanceLogger: { updateBalance: async () => ({ success: true }) }, runtimeRepositoryFactory: () => runtime, catalogRepositoryFactory: () => ({}) });
    const before = Date.now();
    await service.submitEvidence('creator', { assignmentId: 1, stepId: 2, evidence: { text: 'proof' } }, { requestId: 'quest-evidence-command-0002' });
    const days = (new Date(state.evidence[0].retentionUntil).getTime() - before) / 86400000;
    assert.ok(days >= 6.99 && days <= 7.01);
    runtime.lockEvidenceStep = async () => ({ assignment_status: 'completed', step_status: 'active', step_revision: 0, evidence_kind: 'text' });
    await assert.rejects(service.submitEvidence('creator', { assignmentId: 1, stepId: 2, evidence: { text: 'late proof' } }, { requestId: 'quest-evidence-command-0003' }), (error) => error instanceof QuestV2ServiceError && error.code === 'STEP_UNAVAILABLE');
});

test('user-row serialization keeps concurrent evidence commands within daily quota', async () => {
    const state = { recent: 49, inserted: [] };
    let tail = Promise.resolve();
    const pool = { async connect() { let unlock; return { query: async (sql) => { if (sql === 'BEGIN') { const previous = tail; tail = new Promise((resolve) => { unlock = resolve; }); await previous; } if (sql === 'COMMIT' || sql === 'ROLLBACK') unlock?.(); return { rows: [], rowCount: 0 }; }, release() {} }; } };
    const runtime = () => ({
        lockCreator: async () => ({ id: 4, evidence_retention: 'standard' }),
        lockEvidenceStep: async (_user, _assignment, step) => ({ assignment_status: 'active', step_status: 'active', step_revision: 0, evidence_kind: 'text', step_id: step }),
        evidenceQuota: async () => ({ retainedBytes: 0, recentCount: state.recent, stepVersions: 0 }),
        insertEvidence: async (item) => { state.recent += 1; state.inserted.push(item); return { id: item.id }; },
        markStepSubmitted: async () => true, insertAudit: async () => {}
    });
    const service = new QuestV2Service({ pool, BalanceLogger: { updateBalance: async () => ({ success: true }) }, runtimeRepositoryFactory: runtime, catalogRepositoryFactory: () => ({}) });
    const results = await Promise.allSettled([
        service.submitEvidence('alice', { assignmentId: 1, stepId: 2, evidence: { text: 'one' } }, { requestId: 'evidence-quota-one' }),
        service.submitEvidence('alice', { assignmentId: 1, stepId: 3, evidence: { text: 'two' } }, { requestId: 'evidence-quota-two' })
    ]);
    assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(results.filter((item) => item.status === 'rejected' && item.reason.status === 429).length, 1);
    assert.equal(state.inserted.length, 1);
});

test('assignment-event replay compares canonical payload semantics and fails closed on collision', async () => {
    const expected = { a: 1, b: { x: true } };
    const repository = new QuestV2RuntimeRepository({
        query: async (sql) => sql.includes('INSERT INTO')
            ? { rowCount: 0, rows: [] }
            : { rows: [{ actor_type: 'creator', actor_username: 'alice', event_type: 'quest.accept', from_status: 'offered', to_status: 'accepted', payload: { b: { x: true }, a: 1 } }] }
    });
    const replay = await repository.insertAssignmentEvent({ eventId: '11111111-1111-4111-a111-111111111111', assignmentId: 1, actorType: 'creator', actorUsername: 'alice', eventType: 'quest.accept', fromStatus: 'offered', toStatus: 'accepted', dedupeKey: 'command-0001', payload: expected });
    assert.equal(replay.replay, true);
    await assert.rejects(repository.insertAssignmentEvent({ eventId: '11111111-1111-4111-a111-111111111111', assignmentId: 1, actorType: 'creator', actorUsername: 'alice', eventType: 'quest.accept', fromStatus: 'offered', toStatus: 'accepted', dedupeKey: 'command-0001', payload: { a: 2 } }), /identity collision/);
});

test('trusted source replay is semantic, rewards once, and rejects changed payload identity', async () => {
    let stored = null;
    let rewards = 0;
    const runtime = {
        client: {},
        lockCreator: async () => ({ id: 9 }),
        insertTrustedEvent: async (event) => {
            if (stored) return null;
            stored = {
                id: 1, source_type: event.sourceType, dedupe_key: event.dedupeKey,
                event_type: event.eventType, actor_user_id: event.actorUserId,
                subject_user_id: event.subjectUserId, occurred_at: event.occurredAt,
                correlation_id: event.correlationId,
                payload: { total: event.payload.total, correct: event.payload.correct,
                    sessionId: event.payload.sessionId, submissionId: event.payload.submissionId },
                result: null
            };
            return { id: 1 };
        },
        loadTrustedEvent: async () => stored,
        listTrustedHistory: async () => [], listTrustedCandidates: async () => [],
        finalizeTrustedEvent: async (_id, result) => { stored.result = result; rewards += result.rewardEarned; }
    };
    const service = new QuestV2Service({
        pool: { connect() {} }, BalanceLogger: { updateBalance: async () => ({ success: true }) },
        runtimeRepositoryFactory: () => runtime, catalogRepositoryFactory: () => ({})
    });
    const base = {
        sourceType: 'quiz', sourceEventId: 'quiz-submission:77', username: 'alice',
        eventType: 'quiz.round.completed', eventVersion: 1,
        occurredAt: '2026-08-16T12:00:00.000Z',
        payload: { submissionId: 77, sessionId: 'abcdefghijklmnop', correct: 8, total: 10 }
    };
    const first = await service.recordTrustedEvent({}, base);
    const replay = await service.recordTrustedEvent({}, { ...base, payload: { total: 10, correct: 8, sessionId: 'abcdefghijklmnop', submissionId: 77 } });
    assert.deepEqual(replay, first);
    assert.equal(rewards, 0);
    await assert.rejects(service.recordTrustedEvent({}, { ...base, payload: { ...base.payload, correct: 7 } }), /identity collision/);
});

test('concurrent stale accept commands allow exactly one assignment transition', async () => {
    const state = { status: 'offered', revision: 0, events: [] };
    let tail = Promise.resolve();
    const pool = {
        async connect() {
            let unlock;
            return {
                query: async (sql) => {
                    if (sql === 'BEGIN') {
                        const previous = tail;
                        tail = new Promise((resolve) => { unlock = resolve; });
                        await previous;
                    }
                    if (sql === 'COMMIT' || sql === 'ROLLBACK') unlock?.();
                    return { rows: [], rowCount: 0 };
                }, release() {}
            };
        }
    };
    const runtime = () => ({
        lockCreator: async () => ({ id: 4 }),
        lockAssignment: async () => ({ id: 1, user_id: 4, version_id: 2, status: state.status, revision: state.revision }),
        transitionAssignment: async (_id, revision, from, to) => {
            if (revision !== state.revision || !from.includes(state.status)) return null;
            state.status = to; state.revision += 1;
            return { status: state.status, revision: state.revision };
        },
        initializeSteps: async () => {},
        insertAssignmentEvent: async (event) => { state.events.push(event.eventType); return true; },
        insertAudit: async () => {}
    });
    const service = new QuestV2Service({ pool, BalanceLogger: { updateBalance: async () => ({ success: true }) }, runtimeRepositoryFactory: runtime, catalogRepositoryFactory: () => ({}) });
    const attempts = await Promise.allSettled([
        service.transition('alice', { assignmentId: 1, expectedRevision: 0 }, 'accept', { requestId: 'accept-command-one' }),
        service.transition('alice', { assignmentId: 1, expectedRevision: 0 }, 'accept', { requestId: 'accept-command-two' })
    ]);
    assert.equal(attempts.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(attempts.filter((item) => item.status === 'rejected').length, 1);
    assert.deepEqual(state.events, ['quest.accept', 'quest.activated']);
});

test('review reward, settlement, terminal event, audit, and idempotency response roll back together', async () => {
    const state = { settlements: [], ledger: [], events: [], audits: [], assignment: 'under_review', steps: 'submitted' };
    const pool = transactionalPool(state);
    const runtime = {
        client: {},
        lockAssignmentForReview: async () => ({ id: 5, user_id: 4, username: 'alice', slug: 'review-me', status: state.assignment, revision: 3, reward_policy_version: 1, reward_points: 50, verification_mode: 'manual' }),
        lockLatestEvidence: async () => [{ id: 'evidence-1', step_id: 2 }],
        insertEvidenceReview: async () => {},
        markStepsReviewed: async () => { state.steps = 'completed'; },
        insertSettlement: async (item) => { state.settlements.push(item); return { settlement_key: item.key, status: 'pending' }; },
        markSettlementPosted: async () => true,
        transitionAssignment: async () => { state.assignment = 'completed'; return { status: 'completed', revision: 4 }; },
        insertAssignmentEvent: async (item) => { state.events.push(item); },
        insertAudit: async (item) => { state.audits.push(item); }
    };
    const service = new QuestV2Service({
        pool,
        BalanceLogger: { updateBalance: async ({ amount }) => { state.ledger.push(amount); return { success: true, balanceBefore: 10, balance: 60 }; } },
        runtimeRepositoryFactory: () => runtime, catalogRepositoryFactory: () => ({})
    });
    await assert.rejects(service.review('admin', { assignmentId: 5, decision: 'approved', note: '' }, {
        requestId: 'review-command-0001', finalizeIdempotency: async () => { throw new Error('idempotency finalization failed'); }
    }), /idempotency finalization failed/);
    assert.deepEqual(state, { settlements: [], ledger: [], events: [], audits: [], assignment: 'under_review', steps: 'submitted' });
});

test('legacy bridge uses current AST and explicitly writes zero reward', () => {
    const repository = source('repositories/quest-v2-runtime-repository.js');
    assert.doesNotMatch(repository, /"type":"admin_confirmation"/);
    assert.match(repository, /"op":"admin_confirmation"/);
    assert.match(repository, /0, 'none', FALSE/);
    assert.match(source('services/quest-v2-service.js'), /rewarded: false|rewardEarned: 0/);
});

test('startup seeds catalog before HTTP and journal/studio remain read-only', () => {
    const server = source('server.js');
    const service = source('services/quest-v2-service.js');
    assert.match(server, /registerComponent\('quest-v2-catalog'/);
    assert.match(server, /await questV2Service\.initialize\(\)/);
    const journal = service.slice(service.indexOf('async journal'), service.indexOf('async offer'));
    const studio = service.slice(service.indexOf('async studio'), service.indexOf('async createDraft'));
    assert.doesNotMatch(journal, /this\.seed/);
    assert.doesNotMatch(studio, /this\.seed/);
});

test('twelve seeded schedules expose only the current time-bounded weekly board', () => {
    const repository = source('repositories/quest-v2-catalog-repository.js');
    assert.match(repository, /for \(let index = 0; index < boards\.length; index \+= 1\)/);
    assert.match(repository, /phase-2-week-/);
    assert.match(repository, /schedule\.starts_at <= NOW\(\) AND schedule\.ends_at > NOW\(\)/);
    assert.match(repository, /schedule\.lifecycle IN \('scheduled', 'active'\)/);
});

test('journal uses shared idempotent fetch and response-loss retry reuses its command key', async () => {
    const journalScript = source('public/js/quest-journal.js');
    assert.match(journalScript, /window\.idempotentFetch/);
    assert.match(journalScript, /'X-CSRF-Token'/);
    assert.doesNotMatch(journalScript, /Idempotency-Key|await fetch\(/);
    const storage = new Map(); const keys = []; let calls = 0;
    const context = {
        document: { documentElement: { lang: 'en' } }, window: {},
        sessionStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
        Headers, Date, Uint8Array,
        crypto: { randomUUID: () => '11111111-1111-4111-a111-111111111111', getRandomValues: (bytes) => bytes.fill(1) },
        fetch: async (_url, options) => { calls += 1; keys.push(options.headers.get('Idempotency-Key')); if (calls === 1) throw new Error('response lost'); return { headers: { get: () => null } }; }
    };
    context.globalThis = context;
    vm.runInNewContext(source('public/js/i18n-helpers.js'), context);
    const options = { method: 'POST', body: '{"assignmentId":1}' };
    await assert.rejects(context.window.idempotentFetch('/api/quests/v2/assignments/accept', options), /response lost/);
    await context.window.idempotentFetch('/api/quests/v2/assignments/accept', options);
    assert.deepEqual(keys, ['11111111-1111-4111-a111-111111111111', '11111111-1111-4111-a111-111111111111']);
});

test('routes and templates provide disabled 404, bilingual privacy, and mobile controls', () => {
    const route = source('routes/quest-v2.js');
    const view = source('views/quest-journal.ejs');
    const css = source('public/quest-world.css');
    assert.match(route, /questEngineV2Enabled/);
    assert.match(route, /status\(404\)/);
    assert.match(view, /拒绝、延后或退出/);
    assert.match(view, /Declining, postponing, or leaving/);
    assert.match(view, /浏览器证据必须经过审核/);
    assert.match(css, /@media\(max-width:640px\)/);
    assert.match(css, /min-height:44px/);
    assert.match(view, /data-chain-id/);
    assert.match(view, /accept="image\/png"/);
    const studio = source('views/admin-quest-studio.ejs');
    assert.match(studio, /quest-draft-form/);
    assert.match(studio, /reviewQueue/);
    assert.match(studio, /data-review="approved"/);
    assert.match(studio, /data-review="returned"/);
    assert.doesNotMatch(studio, /media_bytes/);
});

test('disabled Quest V2 registrar returns API 404 before invoking the journal service', async () => {
    const registered = [];
    const app = {
        get: (routePath, ...handlers) => registered.push({ method: 'GET', routePath, handlers }),
        post: (routePath, ...handlers) => registered.push({ method: 'POST', routePath, handlers })
    };
    let serviceCalls = 0;
    const pass = (_req, _res, next) => next();
    require('../routes/quest-v2')(app, {
        questV2Service: { journal: async () => { serviceCalls += 1; return {}; } },
        streamerWorldFlags: { questEngineV2Enabled: false }, generateCSRFToken: () => 'token',
        requireLogin: pass, requireAuthorized: pass, requireCSRF: pass,
        security: { basicRateLimit: pass, userActionRateLimit: pass, readHeavyRateLimit: pass }
    });
    const route = registered.find((item) => item.routePath === '/api/quests/v2/journal');
    const response = { code: null, body: null, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } };
    await route.handlers[3]({ path: '/api/quests/v2/journal' }, response, () => { throw new Error('feature gate bypassed'); });
    assert.equal(response.code, 404);
    assert.equal(response.body.code, 'FEATURE_DISABLED');
    assert.equal(serviceCalls, 0);
});

test('gift provider boundary stays absent from every Phase 2 module', () => {
    const files = [
        'services/quest-v2-service.js', 'repositories/quest-v2-runtime-repository.js',
        'repositories/quest-v2-catalog-repository.js', 'routes/quest-v2.js',
        'routes/admin-quest-studio.js'
    ];
    for (const file of files) {
        assert.doesNotMatch(source(file), /bilibili_gift_sender|sendGift|gift_exchanges|wish_inventory/i, file);
    }
});
