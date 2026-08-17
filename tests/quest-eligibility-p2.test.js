'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    MAX_ELIGIBILITY_REFERENCES,
    QuestRuleError,
    collectEligibilityRequirements,
    evaluateRule,
    validateEligibilityRule
} = require('../domain/quests/v2/rules');
const { QuestV2RuntimeRepository } = require('../repositories/quest-v2-runtime-repository');
const { QuestV2Service, QuestV2ServiceError } = require('../services/quest-v2-service');

const eligibilityRule = Object.freeze({
    op: 'all',
    rules: Object.freeze([
        Object.freeze({ op: 'relationship_level', minimum: 2 }),
        Object.freeze({ op: 'has_achievement', slug: 'first-signal' }),
        Object.freeze({ op: 'story_flag', flag: 'season-one.station-restored', value: true }),
        Object.freeze({ op: 'owns_collection_item', item: 'starlight-compass' })
    ])
});

function pool() {
    return {
        async connect() {
            return {
                async query() { return { rows: [], rowCount: 0 }; },
                release() {}
            };
        }
    };
}

function offerService({ facts, rule = eligibilityRule, published = true } = {}) {
    const calls = { offered: 0, events: 0, audits: 0, requirements: null };
    const runtime = {
        lockCreator: async () => ({
            id: 7,
            timezone: 'America/Toronto',
            relationship_level: 3
        }),
        loadEligibilityFacts: async (_userId, requirements) => {
            calls.requirements = requirements;
            return facts || { achievements: [], storyFlags: {}, collectionItems: [] };
        },
        insertAssignmentEvent: async () => { calls.events += 1; },
        insertAudit: async () => { calls.audits += 1; }
    };
    const catalog = {
        loadOfferCandidate: async () => published
            ? { id: 11, category: 'story', eligibility_rule: rule }
            : null,
        listBlockedCategories: async () => [],
        offerAssignment: async () => { calls.offered += 1; return { id: 41 }; }
    };
    const service = new QuestV2Service({
        pool: pool(),
        BalanceLogger: { updateBalance: async () => ({ success: true }) },
        runtimeRepositoryFactory: () => runtime,
        catalogRepositoryFactory: () => catalog
    });
    return { service, calls };
}

test('eligibility requirements are closed, bounded, deduplicated account facts', () => {
    const repeated = {
        op: 'all',
        rules: [eligibilityRule, { op: 'has_achievement', slug: 'first-signal' }]
    };
    const requirements = collectEligibilityRequirements(repeated);
    assert.deepEqual(requirements, {
        achievements: ['first-signal'],
        storyFlags: ['season-one.station-restored'],
        collectionItems: ['starlight-compass'],
        referenceCount: 5
    });
    for (const unsupported of [
        { op: 'event_count', event: 'quiz.round.completed', target: 1, filters: {} },
        { op: 'admin_confirmation' },
        { op: 'within_window', seconds: 60, rule: { op: 'relationship_level', minimum: 1 } }
    ]) {
        assert.throws(() => validateEligibilityRule(unsupported), QuestRuleError);
    }
    const oversized = {
        op: 'all',
        rules: Array.from({ length: 12 }, (_, outer) => ({
            op: 'all',
            rules: Array.from({ length: 12 }, (_, inner) => ({
                op: 'has_achievement', slug: `fact-${outer}-${inner}`
            }))
        }))
    };
    assert.throws(() => collectEligibilityRequirements(oversized), (error) =>
        error instanceof QuestRuleError
        && error.message.includes(`${MAX_ELIGIBILITY_REFERENCES}`) === false
        && /too many facts/i.test(error.message));
});

test('complete eligibility facts handle achievements, story values, collection, relation and not', () => {
    const context = {
        relationshipLevel: 3,
        achievements: ['first-signal'],
        storyFlags: { 'season-one.station-restored': true },
        collectionItems: ['starlight-compass']
    };
    assert.equal(evaluateRule(eligibilityRule, context), true);
    assert.equal(evaluateRule(eligibilityRule, { ...context, achievements: [] }), false);
    assert.equal(evaluateRule({ op: 'not', rule: { op: 'has_achievement', slug: 'later-signal' } }, context), true);
    assert.equal(evaluateRule({ op: 'story_flag', flag: 'season-one.route', value: 'harbor' }, {
        storyFlags: { 'season-one.route': 'harbor' }
    }), true);
    assert.equal(evaluateRule({ op: 'story_flag', flag: 'season-one.route', value: 'harbor' }, {
        storyFlags: { 'season-one.route': 'ridge' }
    }), false);
});

test('runtime repository loads only requested authoritative facts from canonical tables', async () => {
    const calls = [];
    const repository = new QuestV2RuntimeRepository({
        async query(sql, params) {
            calls.push({ sql, params });
            if (sql.includes('streamer_achievement_unlocks')) {
                return { rows: [{ slug: 'first-signal' }] };
            }
            if (sql.includes('FROM story_flags')) {
                return { rows: [
                    { flag_key: 'season-one.station-restored', flag_value: true, run_id: 9 },
                    { flag_key: 'season-one.station-restored', flag_value: true, run_id: 12 }
                ] };
            }
            if (sql.includes('streamer_collection_holdings')) {
                return { rows: [{ item_key: 'starlight-compass' }] };
            }
            throw new Error('unexpected query');
        }
    });
    const facts = await repository.loadEligibilityFacts(7,
        collectEligibilityRequirements(eligibilityRule));
    assert.deepEqual(facts, {
        achievements: ['first-signal'],
        storyFlags: { 'season-one.station-restored': true },
        collectionItems: ['starlight-compass']
    });
    assert.equal(calls.length, 3);
    assert.ok(calls.every((call) => call.params[0] === 7 && call.params[1].length === 1));
    assert.match(calls[1].sql, /run\.replay_mode = FALSE/);
    assert.match(calls[1].sql, /run\.status IN \('active', 'completed'\)/);
    assert.doesNotMatch(calls[2].sql, /wish_inventory|reward_orders|streamer_game/i);
});

test('conflicting authoritative story projections fail closed', async () => {
    const repository = new QuestV2RuntimeRepository({
        async query(sql) {
            if (sql.includes('FROM story_flags')) return { rows: [
                { flag_key: 'season-one.route', flag_value: 'harbor', run_id: 2 },
                { flag_key: 'season-one.route', flag_value: 'ridge', run_id: 3 }
            ] };
            return { rows: [] };
        }
    });
    await assert.rejects(repository.loadEligibilityFacts(7, {
        achievements: [], storyFlags: ['season-one.route'], collectionItems: []
    }), /conflicting authoritative values/);
});

test('offer evaluates repository facts and ignores browser-supplied eligibility claims', async () => {
    const allowed = offerService({ facts: {
        achievements: ['first-signal'],
        storyFlags: { 'season-one.station-restored': true },
        collectionItems: ['starlight-compass']
    } });
    const result = await allowed.service.offer('creator', {
        versionId: 11,
        boardId: 4,
        achievements: ['browser-forgery'],
        storyFlags: { forged: true },
        collectionItems: ['forged']
    }, { requestId: 'quest-eligibility-allow-0001' });
    assert.deepEqual(result, { success: true, assignmentId: 41, status: 'offered' });
    assert.equal(allowed.calls.offered, 1);
    assert.deepEqual(allowed.calls.requirements.achievements, ['first-signal']);

    const denied = offerService({ facts: {
        achievements: [], storyFlags: {}, collectionItems: []
    } });
    await assert.rejects(denied.service.offer('creator', {
        versionId: 11,
        boardId: 4,
        achievements: ['first-signal'],
        storyFlags: { 'season-one.station-restored': true },
        collectionItems: ['starlight-compass']
    }), (error) => error instanceof QuestV2ServiceError
        && error.code === 'QUEST_NOT_ELIGIBLE');
    assert.equal(denied.calls.offered, 0);
});

test('studio draft and publish reject unsupported or over-budget eligibility rules', async () => {
    const service = new QuestV2Service({
        pool: pool(),
        BalanceLogger: { updateBalance: async () => ({ success: true }) },
        runtimeRepositoryFactory: () => ({ insertAudit: async () => {} }),
        catalogRepositoryFactory: () => ({
            listStudioVersions: async () => [{
                id: 5,
                eligibility_rule: {
                    op: 'event_count', event: 'quiz.round.completed', target: 1, filters: {}
                },
                completion_rule: {
                    op: 'event_count', event: 'quiz.round.completed', target: 1, filters: {}
                },
                verification_mode: 'automatic',
                review_policy: 'none',
                safety_class: 'standard'
            }],
            listVersionSteps: async () => [{
                step_key: 'quiz', evidence_kind: 'trusted_event', depends_on_keys: [],
                completion_rule: {
                    op: 'event_count', event: 'quiz.round.completed', target: 1, filters: {}
                }
            }],
            publishStudioVersion: async () => { throw new Error('must not publish'); }
        })
    });
    await assert.rejects(service.publish('admin', { versionId: 5 }), QuestRuleError);
    await assert.rejects(service.createDraft('admin', {
        completionRule: {
            op: 'event_count', event: 'quiz.round.completed', target: 1, filters: {}
        },
        eligibilityRule: {
            op: 'event_count', event: 'quiz.round.completed', target: 1, filters: {}
        }
    }), QuestRuleError);
});
