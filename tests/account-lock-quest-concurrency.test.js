'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { AchievementRepository } = require('../repositories/achievement-repository');
const { CreatorRepository } = require('../repositories/creator-repository');
const { QuestV2RuntimeRepository } = require('../repositories/quest-v2-runtime-repository');
const { StoryWorldRepository } = require('../repositories/story-world-repository');
const { QuestV2Service, QuestV2ServiceError } = require('../services/quest-v2-service');

const ROOT = path.resolve(__dirname, '..');

function methodSource(klass, method) {
    return Function.prototype.toString.call(klass.prototype[method]);
}

function transactionPool() {
    return {
        async connect() {
            return {
                async query() { return { rows: [], rowCount: 0 }; },
                release() {}
            };
        }
    };
}

function questService(runtime, options = {}) {
    return new QuestV2Service({
        pool: transactionPool(),
        BalanceLogger: options.BalanceLogger || {
            async updateBalance() { return { success: true, balanceBefore: 0, balance: 1 }; }
        },
        runtimeRepositoryFactory: () => runtime,
        catalogRepositoryFactory: () => ({}),
        ownerUsername: 'configured-owner',
        clock: () => new Date('2026-08-17T12:00:00.000Z')
    });
}

test('idempotent replay and finalization continuously reject and lock a locked account', () => {
    const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    const existing = server.slice(
        server.indexOf('async function validateExistingIdempotentRequest'),
        server.indexOf('async function validateTransactionalIdempotentRequest')
    );
    const transactional = server.slice(
        server.indexOf('async function validateTransactionalIdempotentRequest'),
        server.indexOf("app.use((req, res, next) =>", server.indexOf('async function validateTransactionalIdempotentRequest'))
    );

    assert.match(existing, /COALESCE\(u\.account_locked,\s*FALSE\)/i);
    assert.match(existing, /status:\s*423/);
    assert.match(transactional, /COALESCE\(account\.account_locked,\s*FALSE\)/i);
    assert.match(transactional, /FOR SHARE/i,
        'final authorization must hold the account row until the business transaction commits');
    assert.match(transactional, /status:\s*423/);
});

test('all creator-owned Quest, Story, Creator and Achievement entry reads fail closed on account lock', () => {
    const checks = [
        [QuestV2RuntimeRepository, 'lockCreator'],
        [StoryWorldRepository, 'lockCreator'],
        [StoryWorldRepository, 'readCreator'],
        [CreatorRepository, 'lockUser'],
        [CreatorRepository, 'loadDashboard'],
        [CreatorRepository, 'exportCreatorData'],
        [AchievementRepository, 'lockUser'],
        [AchievementRepository, 'readUser']
    ];
    for (const [klass, method] of checks) {
        assert.match(methodSource(klass, method), /COALESCE\([^)]*account_locked[^)]*,\s*FALSE\)\s*=\s*FALSE/i,
            `${klass.name}.${method} must exclude locked accounts in its authoritative SQL`);
    }
});

test('admin Quest review locks reviewer and subject users before the assignment', async () => {
    const calls = [];
    const runtime = {
        client: {},
        async readAssignmentSubjectId() { calls.push('read-subject'); return 4; },
        async lockReviewerAndSubject() {
            calls.push('lock-users');
            return {
                reviewer: { id: 9, username: 'configured-owner', is_admin: true },
                subject: { id: 4, username: 'creator', is_admin: false }
            };
        },
        async lockAssignmentForReview() {
            calls.push('lock-assignment');
            return {
                id: 5, user_id: 4, username: 'creator', slug: 'lock-order',
                status: 'under_review', revision: 3, reward_policy_version: 1,
                reward_points: 0, verification_mode: 'manual', review_policy: 'owner',
                safety_class: 'standard'
            };
        },
        async lockLatestEvidence() { return [{ id: '11111111-1111-4111-a111-111111111111' }]; },
        async insertEvidenceReview() {},
        async markStepsReviewed() { return [{ step_definition_id: 7, step_key: 'proof' }]; },
        async transitionAssignment() { return { revision: 4 }; },
        async insertAssignmentEvent() {},
        async insertAudit() {}
    };
    const result = await questService(runtime).review('configured-owner', {
        assignmentId: 5,
        decision: 'rejected',
        note: 'The evidence does not establish completion.'
    });
    assert.equal(result.status, 'rejected');
    assert.deepEqual(calls.slice(0, 3), ['read-subject', 'lock-users', 'lock-assignment']);
});

test('a lock committed before review subject acquisition prevents assignment mutation and payout', async () => {
    let assignmentLocks = 0;
    let payouts = 0;
    const runtime = {
        async readAssignmentSubjectId() { return 4; },
        async lockReviewerAndSubject() {
            return {
                reviewer: { id: 9, username: 'configured-owner', is_admin: true },
                subject: null
            };
        },
        async lockAssignmentForReview() { assignmentLocks += 1; return null; }
    };
    const service = questService(runtime, {
        BalanceLogger: {
            async updateBalance() { payouts += 1; return { success: true, balance: 1 }; }
        }
    });
    await assert.rejects(service.review('configured-owner', {
        assignmentId: 5,
        decision: 'approved',
        note: ''
    }), (error) => error instanceof QuestV2ServiceError
        && error.code === 'QUEST_SUBJECT_UNAVAILABLE' && error.status === 423);
    assert.equal(assignmentLocks, 0);
    assert.equal(payouts, 0);
});

test('admin appeal resolution uses the same users-before-appeal lock order', async () => {
    const calls = [];
    const runtime = {
        async readAppealSubjectId() { calls.push('read-subject'); return 4; },
        async lockReviewerAndSubject() {
            calls.push('lock-users');
            return {
                reviewer: { id: 9, username: 'quest-admin', is_admin: true },
                subject: { id: 4, username: 'creator', is_admin: false }
            };
        },
        async lockAppeal() {
            calls.push('lock-appeal');
            return {
                id: '11111111-1111-4111-a111-111111111111',
                assignment_id: 5,
                user_id: 4,
                username: 'creator',
                status: 'pending'
            };
        },
        async resolveAppeal(appealId, reviewerId, resolution) {
            return { id: appealId, status: 'resolved', reviewerId, decision: resolution.decision };
        },
        async insertAudit() {}
    };
    const result = await questService(runtime).resolveAppeal('quest-admin', {
        appealId: '11111111-1111-4111-a111-111111111111',
        commandId: '22222222-2222-4222-a222-222222222222',
        decision: 'dismissed',
        note: 'The retained review evidence supports the original decision.'
    });
    assert.equal(result.status, 'resolved');
    assert.deepEqual(calls, ['read-subject', 'lock-users', 'lock-appeal']);
});

test('review actor repository locks eligible users in deterministic id order without blocking audit foreign keys',
async () => {
    const statements = [];
    const client = {
        async query(statement) {
            statements.push(statement);
            return { rows: [] };
        }
    };
    const repository = new QuestV2RuntimeRepository(client);
    await repository.lockReviewerAndSubject('reviewer', 7);
    assert.match(statements[0], /COALESCE\(account_locked,\s*FALSE\)\s*=\s*FALSE/i);
    assert.match(statements[0], /ORDER BY id\s+FOR NO KEY UPDATE/i);
    assert.doesNotMatch(statements[0], /\bFOR UPDATE\b/i);
});
