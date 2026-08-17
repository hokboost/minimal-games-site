'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { assertTransition } = require('../domain/quests/v2/transitions');
const { QuestV2Service, QuestV2ServiceError } = require('../services/quest-v2-service');
const { QuestV2MaintenanceWorker } = require('../workers/quest-v2-maintenance');

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

function serviceWith(runtime, catalog = {}, options = {}) {
    return new QuestV2Service({
        pool: pool(),
        BalanceLogger: options.BalanceLogger || {
            async updateBalance() { return { success: true, balanceBefore: 0, balance: 0 }; }
        },
        runtimeRepositoryFactory: () => runtime,
        catalogRepositoryFactory: () => catalog,
        ownerUsername: Object.prototype.hasOwnProperty.call(options, 'ownerUsername')
            ? options.ownerUsername : 'configured-owner',
        clock: options.clock || (() => new Date('2026-08-17T12:00:00.000Z'))
    });
}

test('Quest lifecycle exposes honest terminal rejection and review-to-active transitions', () => {
    assert.doesNotThrow(() => assertTransition('under_review', 'rejected'));
    assert.doesNotThrow(() => assertTransition('under_review', 'active'));
    assert.throws(() => assertTransition('rejected', 'active'));
});

test('postpone extends due_at, records cumulative hours, and returns the authoritative deadline', async () => {
    const calls = [];
    const runtime = {
        lockCreator: async () => ({ id: 7 }),
        lockAssignment: async () => ({
            id: 12,
            status: 'active',
            revision: 3,
            due_at: '2026-08-18T12:00:00.000Z',
            postponed_hours: 0,
            postpone_policy: { allowed: true, maxHours: 48 }
        }),
        postponeAssignment: async (_id, _revision, hours, maximumHours) => {
            calls.push({ hours, maximumHours });
            assert.equal(hours, 24);
            assert.equal(maximumHours, 48);
            return {
                revision: 4,
                due_at: '2026-08-19T12:00:00.000Z',
                postpone_until: '2026-08-19T12:00:00.000Z',
                postponed_hours: 24
            };
        },
        insertAssignmentEvent: async (entry) => calls.push(entry),
        insertAudit: async (entry) => calls.push(entry)
    };
    const result = await serviceWith(runtime).postpone('creator', {
        assignmentId: 12,
        expectedRevision: 3,
        hours: 24
    }, { requestId: 'postpone-p1-0001' });
    assert.equal(result.dueAt, '2026-08-19T12:00:00.000Z');
    assert.equal(result.postponedHours, 24);
    assert.equal(calls.filter((item) => item.eventType === 'quest.assignment.postponed').length, 1);
});

test('bounded expiry worker is a first-class idempotent Quest service operation', async () => {
    const events = [];
    const runtime = {
        lockDueAssignments: async (limit) => {
            assert.equal(limit, 2);
            return [{ id: 1, revision: 0, status: 'offered', due_at: '2026-08-16T12:00:00.000Z' }];
        },
        expireAssignment: async () => ({ id: 1, status: 'expired', revision: 1 }),
        insertAssignmentEvent: async (entry) => events.push(entry),
        insertAudit: async (entry) => events.push(entry)
    };
    const result = await serviceWith(runtime).expireDueAssignments({ limit: 2 });
    assert.deepEqual(result, { processed: 1, assignmentIds: [1] });
    assert.equal(events.filter((item) => item.eventType === 'quest.assignment.expired').length, 1);
    assert.equal(events.filter((item) => item.action === 'quest.assignment.expired').length, 1);
});

test('publish rejects missing dependency keys and dependency cycles before freezing a version', async () => {
    for (const steps of [
        [
            { id: 1, step_key: 'first', depends_on_keys: [] },
            { id: 2, step_key: 'second', depends_on_keys: ['missing'] }
        ],
        [
            { id: 1, step_key: 'first', depends_on_keys: ['second'] },
            { id: 2, step_key: 'second', depends_on_keys: ['first'] }
        ]
    ]) {
        let published = false;
        const catalog = {
            listStudioVersions: async () => [{
                id: 9,
                source: 'owner_studio',
                lifecycle: 'draft',
                verification_mode: 'manual',
                review_policy: 'owner',
                eligibility_rule: { op: 'relationship_level', minimum: 1 },
                completion_rule: { op: 'evidence_approved' }
            }],
            listVersionSteps: async () => steps.map((step) => ({
                ...step,
                required: true,
                evidence_kind: 'text',
                completion_rule: { op: 'evidence_approved' }
            })),
            publishStudioVersion: async () => { published = true; return true; }
        };
        const runtime = { insertAudit: async () => {} };
        await assert.rejects(serviceWith(runtime, catalog).publish('configured-owner', {
            versionId: 9
        }, { requestId: `publish-invalid-${steps[0].depends_on_keys[0] || 'missing'}` }),
        (error) => error instanceof QuestV2ServiceError
            && error.code === 'QUEST_STEP_DEPENDENCY_INVALID');
        assert.equal(published, false);
    }
});

test('approving a partial hybrid step unlocks dependents and resumes active without premature reward', async () => {
    const events = [];
    let rewards = 0;
    const runtime = {
        client: {},
        readAssignmentSubjectId: async () => 4,
        lockReviewerAndSubject: async () => ({
            reviewer: { id: 9, username: 'configured-owner', is_admin: true },
            subject: { id: 4, username: 'creator', is_admin: false }
        }),
        lockAssignmentForReview: async () => ({
            id: 5,
            user_id: 4,
            username: 'creator',
            slug: 'hybrid-path',
            status: 'under_review',
            revision: 3,
            reward_policy_version: 1,
            reward_points: 50,
            verification_mode: 'hybrid',
            review_policy: 'owner'
        }),
        lockLatestEvidence: async () => [{ id: '11111111-1111-4111-a111-111111111111', step_id: 11 }],
        insertEvidenceReview: async () => {},
        markStepsReviewed: async () => [{ step_definition_id: 11, step_key: 'manual-first' }],
        unlockEligibleSteps: async () => [{ step_definition_id: 12, step_key: 'trusted-second' }],
        assignmentCompletionReadiness: async () => false,
        transitionAssignment: async (_id, _revision, _from, target) => ({ status: target, revision: 4 }),
        insertAssignmentEvent: async (entry) => events.push(entry),
        insertAudit: async (entry) => events.push(entry)
    };
    const result = await serviceWith(runtime, {}, {
        BalanceLogger: { async updateBalance() { rewards += 1; return { success: true }; } }
    }).review('configured-owner', {
        assignmentId: 5,
        decision: 'approved',
        note: ''
    }, { requestId: 'review-partial-hybrid-0001' });
    assert.equal(result.status, 'active');
    assert.equal(result.rewardEarned, 0);
    assert.equal(rewards, 0);
    assert.equal(events.filter((item) => item.eventType === 'quest.step.unlocked').length, 1);
});

test('review policy is enforced from authoritative admin state and rejected stays terminal', async () => {
    const baseAssignment = {
        id: 8,
        user_id: 4,
        username: 'creator',
        slug: 'review-policy',
        status: 'under_review',
        revision: 2,
        reward_policy_version: 1,
        reward_points: 0,
        verification_mode: 'manual',
        review_policy: 'owner'
    };
    const forbiddenRuntime = {
        readAssignmentSubjectId: async () => 4,
        lockReviewerAndSubject: async () => ({
            reviewer: { id: 10, username: 'other-admin', is_admin: true },
            subject: { id: 4, username: 'creator', is_admin: false }
        }),
        lockAssignmentForReview: async () => baseAssignment
    };
    await assert.rejects(serviceWith(forbiddenRuntime).review('other-admin', {
        assignmentId: 8,
        decision: 'approved',
        note: ''
    }), (error) => error instanceof QuestV2ServiceError
        && error.code === 'QUEST_REVIEW_FORBIDDEN' && error.status === 403);

    const targets = [];
    const runtime = {
        client: {},
        readAssignmentSubjectId: async () => 4,
        lockReviewerAndSubject: async () => ({
            reviewer: { id: 9, username: 'configured-owner', is_admin: true },
            subject: { id: 4, username: 'creator', is_admin: false }
        }),
        lockAssignmentForReview: async () => baseAssignment,
        lockLatestEvidence: async () => [{ id: '22222222-2222-4222-a222-222222222222', step_id: 9 }],
        insertEvidenceReview: async () => {},
        markStepsReviewed: async (_id, decision) => {
            assert.equal(decision, 'rejected');
            return [{ step_definition_id: 9, step_key: 'proof' }];
        },
        unlockEligibleSteps: async () => [],
        assignmentCompletionReadiness: async () => false,
        transitionAssignment: async (_id, _revision, _from, target) => {
            targets.push(target);
            return { status: target, revision: 3 };
        },
        insertAssignmentEvent: async () => {},
        insertAudit: async () => {}
    };
    const result = await serviceWith(runtime).review('configured-owner', {
        assignmentId: 8,
        decision: 'rejected',
        note: 'Evidence cannot establish completion.'
    }, { requestId: 'review-terminal-reject-0001' });
    assert.equal(result.status, 'rejected');
    assert.deepEqual(targets, ['rejected']);
});

test('admin policy remains reviewable without a configured owner while owner policy stays closed', async () => {
    const decisions = [];
    const runtime = {
        client: {},
        readAssignmentSubjectId: async () => 4,
        lockReviewerAndSubject: async () => ({
            reviewer: { id: 9, username: 'independent-admin', is_admin: true },
            subject: { id: 4, username: 'creator', is_admin: false }
        }),
        lockAssignmentForReview: async () => ({
            id: 18,
            user_id: 4,
            username: 'creator',
            slug: 'ownerless-admin-review',
            status: 'under_review',
            revision: 2,
            reward_policy_version: 1,
            reward_points: 0,
            verification_mode: 'manual',
            review_policy: 'admin',
            safety_class: 'standard'
        }),
        lockLatestEvidence: async () => [{ id: '33333333-3333-4333-a333-333333333333', step_id: 19 }],
        insertEvidenceReview: async (entry) => decisions.push(entry),
        markStepsReviewed: async () => [{ step_definition_id: 19, step_key: 'proof' }],
        unlockEligibleSteps: async () => [],
        assignmentCompletionReadiness: async () => true,
        insertSettlement: async () => ({ settlement_key: 'ownerless-zero', status: 'zero_value' }),
        transitionAssignment: async (_id, _revision, _from, target) => ({ status: target, revision: 3 }),
        insertAssignmentEvent: async () => {},
        insertAudit: async () => {}
    };
    const result = await serviceWith(runtime, {}, { ownerUsername: null }).review(
        'independent-admin',
        { assignmentId: 18, decision: 'approved', note: '' },
        { requestId: 'ownerless-admin-review-0001' }
    );
    assert.equal(result.status, 'completed');
    assert.equal(decisions.length, 1);

    runtime.lockAssignmentForReview = async () => ({
        id: 18, user_id: 4, username: 'creator', status: 'under_review', revision: 2,
        verification_mode: 'manual', review_policy: 'owner', safety_class: 'standard'
    });
    await assert.rejects(serviceWith(runtime, {}, { ownerUsername: null }).review(
        'independent-admin',
        { assignmentId: 18, decision: 'approved', note: '' }
    ), (error) => error.code === 'QUEST_REVIEW_FORBIDDEN');
});

test('weekly materialization is exposed as a bounded restart-safe service operation', async () => {
    const calls = [];
    const catalog = {
        listCreatorTimezones: async () => ['America/Toronto', 'Asia/Shanghai'],
        materializeWeeklyBoards: async (options) => {
            calls.push(options);
            return { timezone: options.timezone, inserted: calls.length === 1 ? 13 : 0, current: 1, future: 12 };
        }
    };
    const service = serviceWith({}, catalog);
    const first = await service.materializeWeeklyBoards({ horizonWeeks: 12 });
    assert.equal(first.timezones, 2);
    assert.equal(first.current, 2);
    assert.equal(first.future, 24);
    assert.ok(calls.every((item) => item.horizonWeeks === 12));
});

test('maintenance worker coalesces overlapping lifecycle runs and resets after completion', async () => {
    let expiryCalls = 0;
    let scheduleCalls = 0;
    let resolveExpiry;
    let resolveSchedule;
    const expiryGate = new Promise((resolve) => { resolveExpiry = resolve; });
    const scheduleGate = new Promise((resolve) => { resolveSchedule = resolve; });
    const worker = new QuestV2MaintenanceWorker({
        enabled: true,
        questV2Service: {
            async expireDueAssignments(options) {
                expiryCalls += 1;
                assert.deepEqual(options, { limit: 100 });
                await expiryGate;
                return { processed: 1, assignmentIds: [7] };
            },
            async materializeWeeklyBoards(options) {
                scheduleCalls += 1;
                assert.deepEqual(options, { horizonWeeks: 12 });
                await scheduleGate;
                return { timezones: 1, inserted: 13, current: 1, future: 12 };
            }
        }
    });
    const expiryA = worker.expire();
    const expiryB = worker.expire();
    const scheduleA = worker.materialize();
    const scheduleB = worker.materialize();
    assert.strictEqual(expiryA, expiryB);
    assert.strictEqual(scheduleA, scheduleB);
    assert.equal(expiryCalls, 1);
    assert.equal(scheduleCalls, 1);
    resolveExpiry();
    resolveSchedule();
    await Promise.all([expiryA, scheduleA]);
    await worker.expire();
    await worker.materialize();
    assert.equal(expiryCalls, 2);
    assert.equal(scheduleCalls, 2);
});
