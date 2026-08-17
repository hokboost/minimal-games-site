'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { QuestV2RuntimeRepository } = require('../repositories/quest-v2-runtime-repository');
const { QuestV2Service } = require('../services/quest-v2-service');

function sequencedClient(steps) {
    const calls = [];
    return {
        calls,
        async query(sql, parameters = []) {
            calls.push({ sql, parameters });
            const step = steps[calls.length - 1];
            assert.ok(step, `unexpected query ${calls.length}: ${sql}`);
            assert.match(sql, step.match);
            return { rows: step.rows || [], rowCount: (step.rows || []).length };
        }
    };
}

test('Quest retention locks users by immutable id before assignments and evidence', async () => {
    const evidenceRows = [
        { id: '11111111-1111-4111-a111-111111111111', assignment_id: 81,
            user_id: 11, username: 'creator-a' },
        { id: '22222222-2222-4222-a222-222222222222', assignment_id: 82,
            user_id: 19, username: 'creator-b' }
    ];
    const client = sequencedClient([
        { match: /FROM users account[\s\S]*ORDER BY account\.id[\s\S]*LIMIT \$1[\s\S]*FOR NO KEY UPDATE OF account SKIP LOCKED/,
            rows: [{ id: 11, username: 'creator-a' }, { id: 19, username: 'creator-b' }] },
        { match: /FROM quest_v2_assignments assignment[\s\S]*assignment\.user_id = ANY\(\$1::INTEGER\[\]\)[\s\S]*ORDER BY assignment\.id[\s\S]*FOR NO KEY UPDATE OF assignment SKIP LOCKED/,
            rows: [{ id: 81 }, { id: 82 }] },
        { match: /WITH due AS[\s\S]*assignment_id = ANY\(\$1::BIGINT\[\]\)[\s\S]*ORDER BY evidence\.retention_until,evidence\.id[\s\S]*FOR UPDATE OF evidence SKIP LOCKED/,
            rows: evidenceRows }
    ]);

    const repository = new QuestV2RuntimeRepository(client);
    assert.deepEqual(await repository.redactExpiredEvidenceBatch(100), evidenceRows);
    assert.deepEqual(client.calls.map((call) => call.parameters), [
        [100],
        [[11, 19], 100],
        [[81, 82], 100]
    ]);
    assert.match(client.calls[0].sql, /retention_until <= NOW\(\)/);
    assert.match(client.calls[1].sql, /retention_until <= NOW\(\)/);
    assert.match(client.calls[2].sql, /content = '\{\}'::JSONB/);
    assert.match(client.calls[2].sql, /redaction_reason = 'retention_expired'/);
});

test('Quest retention stops after the user barrier when all due users are busy', async () => {
    const client = sequencedClient([
        { match: /FOR NO KEY UPDATE OF account SKIP LOCKED/, rows: [] }
    ]);
    const repository = new QuestV2RuntimeRepository(client);

    assert.deepEqual(await repository.redactExpiredEvidenceBatch(100), []);
    assert.equal(client.calls.length, 1);
});

test('Quest retention stops before evidence when every candidate assignment is busy', async () => {
    const client = sequencedClient([
        { match: /FOR NO KEY UPDATE OF account SKIP LOCKED/,
            rows: [{ id: 11, username: 'creator-a' }] },
        { match: /FOR NO KEY UPDATE OF assignment SKIP LOCKED/, rows: [] }
    ]);
    const repository = new QuestV2RuntimeRepository(client);

    assert.deepEqual(await repository.redactExpiredEvidenceBatch(100), []);
    assert.equal(client.calls.length, 2);
});

function retentionServiceFixture({ row, achievementError = null }) {
    const trace = [];
    const audits = [];
    const achievementEvents = [];
    const client = {
        async query(sql) {
            trace.push(sql);
            return { rows: [], rowCount: 0 };
        },
        release() { trace.push('RELEASE'); }
    };
    const service = new QuestV2Service({
        pool: { async connect() { return client; } },
        BalanceLogger: { async updateBalance() {} },
        runtimeRepositoryFactory: () => ({
            async redactExpiredEvidenceBatch() { return [row]; },
            async insertAudit(entry) { audits.push(entry); }
        }),
        achievementService: {
            async recordTrustedEvent(_client, username, event) {
                achievementEvents.push({ username, event });
                if (achievementError) throw achievementError;
            }
        }
    });
    return { service, trace, audits, achievementEvents };
}

test('Quest retention redacts unavailable accounts and records why achievement production was skipped', async () => {
    const fixture = retentionServiceFixture({
        row: {
            id: '33333333-3333-4333-a333-333333333333',
            assignment_id: 83,
            user_id: 29,
            username: 'locked-creator',
            achievement_eligible: false
        }
    });

    assert.equal(await fixture.service.redactExpiredEvidence(), 1);
    assert.equal(fixture.achievementEvents.length, 0);
    assert.equal(fixture.audits.length, 1);
    assert.deepEqual(fixture.audits[0].details, {
        evidenceId: '33333333-3333-4333-a333-333333333333',
        tombstoneRetained: true,
        achievementSkippedReason: 'account_unavailable'
    });
    assert.ok(fixture.trace.includes('COMMIT'));
});

test('Quest retention still rolls back on non-availability achievement producer failures', async () => {
    const fixture = retentionServiceFixture({
        row: {
            id: '44444444-4444-4444-a444-444444444444',
            assignment_id: 84,
            user_id: 31,
            username: 'active-creator',
            achievement_eligible: true
        },
        achievementError: new Error('injected achievement failure')
    });

    await assert.rejects(fixture.service.redactExpiredEvidence(), /injected achievement failure/);
    assert.equal(fixture.audits.length, 0);
    assert.equal(fixture.achievementEvents.length, 1);
    assert.ok(fixture.trace.includes('ROLLBACK'));
    assert.ok(!fixture.trace.includes('COMMIT'));
});
