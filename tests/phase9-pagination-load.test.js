'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { CreatorRepository } = require('../repositories/creator-repository');
const { QuestV2RuntimeRepository } = require('../repositories/quest-v2-runtime-repository');
const { RewardCatalogRepository } = require('../repositories/reward-catalog-repository');
const { AchievementRepository } = require('../repositories/achievement-repository');
const { StoryWorldRepository } = require('../repositories/story-world-repository');
const { LiveInteractionRepository } = require('../repositories/live-interaction-repository');

function normalizeSql(sql) {
    return String(sql).replace(/\s+/g, ' ').trim();
}

class RoutedQueryable {
    constructor(routes = []) {
        this.routes = routes;
        this.calls = [];
        this.active = 0;
        this.peak = 0;
    }

    async query(sql, parameters = []) {
        const normalized = normalizeSql(sql);
        const call = {
            sql: normalized,
            parameters: structuredClone(parameters)
        };
        this.calls.push(call);
        this.active += 1;
        this.peak = Math.max(this.peak, this.active);
        try {
            await Promise.resolve();
            const route = this.routes.find(candidate => {
                if (candidate.match instanceof RegExp) return candidate.match.test(normalized);
                return normalized.includes(candidate.match);
            });
            if (!route) throw new Error(`Unexpected query: ${normalized}`);
            const response = typeof route.reply === 'function'
                ? await route.reply(call, this.calls.length - 1)
                : route.reply;
            const rows = structuredClone(response?.rows || []);
            return {
                rows,
                rowCount: response?.rowCount ?? rows.length
            };
        } finally {
            this.active -= 1;
        }
    }
}

function creatorPool(routes = []) {
    const queryable = new RoutedQueryable(routes);
    return {
        queryable,
        pool: {
            query: queryable.query.bind(queryable),
            async connect() {
                throw new Error('read-only pagination path must not acquire a transaction connection');
            }
        }
    };
}

function memoryRows(count) {
    return Array.from({ length: count }, (_, index) => ({
        id: String(index + 1),
        title_zh: `记忆 ${index + 1}`,
        title_en: `Memory ${index + 1}`,
        body_zh: `第 ${index + 1} 条安全记忆`,
        body_en: `Safe memory ${index + 1}`,
        visibility: index % 2 ? 'private' : 'shared',
        pinned: index === 0,
        archived: index > 15,
        hidden: false,
        occurred_at: `2026-08-${String((index % 17) + 1).padStart(2, '0')}T12:00:00.000Z`,
        content_version: '2'
    }));
}

function inboxRows(count) {
    return Array.from({ length: count }, (_, index) => ({
        id: String(index + 1),
        sender_type: index % 2 ? 'owner' : 'system',
        message_type: index % 3 ? 'quest_invite' : 'story_letter',
        title_zh: `收件箱 ${index + 1}`,
        title_en: `Inbox ${index + 1}`,
        body_zh: `可恢复消息 ${index + 1}`,
        body_en: `Recoverable message ${index + 1}`,
        action_path: index % 2 ? '/quests' : '/story',
        sent_at: `2026-08-17T12:${String(index % 60).padStart(2, '0')}:00.000Z`,
        expires_at: null,
        read_at: index % 4 ? null : '2026-08-17T13:00:00.000Z',
        archived_at: null
    }));
}

test('creator memory page maps database values into a hidden-safe projection', async () => {
    const rows = memoryRows(20);
    const { pool, queryable } = creatorPool([
        {
            match: 'FROM shared_memories',
            reply: { rows }
        }
    ]);
    const repository = new CreatorRepository({ pool });
    const result = await repository.listMemories(queryable, 17, { limit: 20 });

    assert.equal(result.length, 20);
    assert.equal(result[0].id, 1);
    assert.equal(result[0].contentVersion, 2);
    assert.equal(result[0].titleZh, '记忆 1');
    assert.equal(result[0].titleEn, 'Memory 1');
    assert.equal(result[0].pinned, true);
    assert.equal(result[0].hidden, false);
    assert.equal(result[0].visibility, 'shared');
    assert.equal(result[1].visibility, 'private');
    assert.deepEqual(queryable.calls[0].parameters, [17, 20]);
    assert.match(queryable.calls[0].sql, /hidden = FALSE/);
    assert.match(queryable.calls[0].sql, /ORDER BY archived, pinned DESC, occurred_at DESC, id DESC/);
    assert.match(queryable.calls[0].sql, /LIMIT \$2/);
});
test('creator memory page never asks the database for an unbounded result', async () => {
    const { pool, queryable } = creatorPool([
        {
            match: 'FROM shared_memories',
            reply(call) {
                const limit = call.parameters[1];
                assert.equal(Number.isSafeInteger(limit), true);
                assert.equal(limit, 20);
                return { rows: memoryRows(limit) };
            }
        }
    ]);
    const repository = new CreatorRepository({ pool });
    const result = await repository.listMemories(queryable, 5, { limit: 20 });

    assert.equal(result.length, 20);
    assert.equal(queryable.calls.length, 1);
    assert.equal(queryable.calls[0].parameters.length, 2);
});

test('creator memory repeated read load stays at one bounded query per request', async () => {
    const { pool, queryable } = creatorPool([
        {
            match: 'FROM shared_memories',
            reply(call) {
                return { rows: memoryRows(call.parameters[1]) };
            }
        }
    ]);
    const repository = new CreatorRepository({ pool });
    const pages = await Promise.all(Array.from({ length: 120 }, () => repository.listMemories(
        queryable,
        9,
        { limit: 20 }
    )));

    assert.equal(pages.length, 120);
    assert.equal(pages.every(page => page.length === 20), true);
    assert.equal(queryable.calls.length, 120);
    assert.equal(queryable.calls.every(call => call.parameters[0] === 9), true);
    assert.equal(queryable.calls.every(call => call.parameters[1] === 20), true);
    assert.equal(queryable.active, 0);
    assert.ok(queryable.peak > 1);
});

test('creator inbox page filters archived and expired rows in SQL', async () => {
    const rows = inboxRows(30);
    const { pool, queryable } = creatorPool([
        {
            match: 'FROM creator_inbox_messages',
            reply: { rows }
        }
    ]);
    const repository = new CreatorRepository({ pool });
    const result = await repository.listInbox(queryable, 23, { limit: 30 });

    assert.equal(result.length, 30);
    assert.equal(result[0].id, 1);
    assert.equal(result[0].senderType, 'system');
    assert.equal(result[0].messageType, 'story_letter');
    assert.equal(result[0].actionPath, '/story');
    assert.equal(result[0].archivedAt, null);
    assert.deepEqual(queryable.calls[0].parameters, [23, 30]);
    assert.match(queryable.calls[0].sql, /archived_at IS NULL/);
    assert.match(queryable.calls[0].sql, /expires_at IS NULL OR expires_at > NOW\(\)/);
    assert.match(queryable.calls[0].sql, /read_at NULLS FIRST/);
    assert.match(queryable.calls[0].sql, /LIMIT \$2/);
});

test('creator inbox mapping exposes no database dedupe or arbitrary metadata', async () => {
    const row = {
        ...inboxRows(1)[0],
        dedupe_key: 'private-dedupe-key',
        metadata: {
            providerGiftId: 'must-not-leak'
        }
    };
    const { pool, queryable } = creatorPool([
        {
            match: 'FROM creator_inbox_messages',
            reply: { rows: [row] }
        }
    ]);
    const repository = new CreatorRepository({ pool });
    const [message] = await repository.listInbox(queryable, 1, { limit: 1 });

    assert.equal(message.dedupeKey, undefined);
    assert.equal(message.metadata, undefined);
    assert.equal(JSON.stringify(message).includes('providerGiftId'), false);
    assert.deepEqual(Object.keys(message).sort(), [
        'actionPath',
        'archivedAt',
        'bodyEn',
        'bodyZh',
        'expiresAt',
        'id',
        'messageType',
        'readAt',
        'senderType',
        'sentAt',
        'titleEn',
        'titleZh'
    ]);
});

test('creator inbox repeated read load remains bounded and connection-free', async () => {
    const { pool, queryable } = creatorPool([
        {
            match: 'FROM creator_inbox_messages',
            reply(call) {
                return { rows: inboxRows(call.parameters[1]) };
            }
        }
    ]);
    const repository = new CreatorRepository({ pool });
    const pages = await Promise.all(Array.from({ length: 150 }, (_, index) => repository.listInbox(
        queryable,
        index % 5 + 1,
        { limit: 30 }
    )));

    assert.equal(pages.length, 150);
    assert.equal(pages.every(page => page.length === 30), true);
    assert.equal(queryable.calls.length, 150);
    assert.equal(queryable.calls.every(call => call.parameters[1] === 30), true);
    assert.equal(queryable.active, 0);
    assert.ok(queryable.peak > 1);
});

test('creator inbox read mutation is ownership-scoped and replay-safe', async () => {
    const queryable = new RoutedQueryable([
        {
            match: 'UPDATE creator_inbox_messages SET read_at',
            reply(call) {
                assert.deepEqual(call.parameters, [91, 7]);
                return { rows: [{ id: 91 }], rowCount: 1 };
            }
        }
    ]);
    const repository = new CreatorRepository({
        pool: {
            query: queryable.query.bind(queryable),
            async connect() {}
        }
    });
    const changed = await repository.updateInboxState(queryable, 7, 91, 'read');

    assert.equal(changed, true);
    assert.match(queryable.calls[0].sql, /read_at = COALESCE\(read_at, NOW\(\)\)/);
    assert.match(queryable.calls[0].sql, /WHERE id = \$1 AND user_id = \$2/);
});

test('creator inbox archive mutation cannot cross account ownership', async () => {
    const queryable = new RoutedQueryable([
        {
            match: 'UPDATE creator_inbox_messages SET archived_at',
            reply: { rows: [], rowCount: 0 }
        }
    ]);
    const repository = new CreatorRepository({
        pool: {
            query: queryable.query.bind(queryable),
            async connect() {}
        }
    });
    const changed = await repository.updateInboxState(queryable, 8, 91, 'archive');

    assert.equal(changed, false);
    assert.deepEqual(queryable.calls[0].parameters, [91, 8]);
    assert.match(queryable.calls[0].sql, /archived_at = COALESCE\(archived_at, NOW\(\)\)/);
    assert.match(queryable.calls[0].sql, /user_id = \$2/);
});

function assignmentRows(count) {
    return Array.from({ length: count }, (_, index) => ({
        id: index + 1,
        assignment_key: `assignment-${index + 1}`,
        status: index % 2 ? 'active' : 'returned',
        revision: index,
        occurrence: index + 1,
        reward_points: 10,
        assignment_source: 'board',
        title_zh: `任务 ${index + 1}`,
        title_en: `Quest ${index + 1}`
    }));
}

function questClient(routes) {
    return new RoutedQueryable(routes);
}

test('Quest assignment journal uses explicit limit and offset', async () => {
    const client = questClient([
        {
            match: 'FROM quest_v2_assignments assignment',
            reply: { rows: assignmentRows(25) }
        }
    ]);
    const repository = new QuestV2RuntimeRepository(client);
    const result = await repository.listAssignments(31, {
        limit: 25,
        offset: 50
    });

    assert.equal(result.length, 25);
    assert.deepEqual(client.calls[0].parameters, [31, 25, 50]);
    assert.match(client.calls[0].sql, /LIMIT \$2 OFFSET \$3/);
    assert.match(client.calls[0].sql, /assignment\.offered_at DESC, assignment\.id DESC/);
    assert.match(client.calls[0].sql, /WHEN 'active' THEN 0/);
    assert.match(client.calls[0].sql, /WHEN 'under_review' THEN 3/);
});

test('Quest assignment journal selects settlement status without ledger internals', async () => {
    const [row] = assignmentRows(1);
    row.settlement_status = 'settled';
    row.ledger_entry_id = 999;
    const client = questClient([
        {
            match: 'FROM quest_v2_assignments assignment',
            reply: { rows: [row] }
        }
    ]);
    const repository = new QuestV2RuntimeRepository(client);
    const [result] = await repository.listAssignments(3, {
        limit: 1,
        offset: 0
    });

    assert.equal(result.settlement_status, 'settled');
    assert.equal(result.ledger_entry_id, 999);
    assert.doesNotMatch(client.calls[0].sql, /balance_after|provider_receipt|media_bytes/);
    assert.match(client.calls[0].sql, /settlement\.status AS settlement_status/);
});

test('Quest assignment concurrent journal load keeps every query bounded', async () => {
    const client = questClient([
        {
            match: 'FROM quest_v2_assignments assignment',
            reply(call) {
                return { rows: assignmentRows(call.parameters[1]) };
            }
        }
    ]);
    const repository = new QuestV2RuntimeRepository(client);
    const pages = await Promise.all(Array.from({ length: 120 }, (_, index) => repository.listAssignments(
        44,
        {
            limit: 25,
            offset: (index % 4) * 25
        }
    )));

    assert.equal(pages.length, 120);
    assert.equal(pages.every(page => page.length === 25), true);
    assert.equal(client.calls.length, 120);
    assert.equal(client.calls.every(call => call.parameters[0] === 44), true);
    assert.equal(client.calls.every(call => call.parameters[1] === 25), true);
    assert.equal(client.calls.every(call => [0, 25, 50, 75].includes(call.parameters[2])), true);
    assert.equal(client.active, 0);
    assert.ok(client.peak > 1);
});

test('Quest step projection avoids a database round trip for an empty page', async () => {
    const client = questClient([]);
    const repository = new QuestV2RuntimeRepository(client);
    const result = await repository.listAssignmentSteps(4, []);

    assert.deepEqual(result, []);
    assert.equal(client.calls.length, 0);
});

test('Quest step projection scopes every step to the creator assignment set', async () => {
    const rows = [
        {
            assignment_id: 10,
            step_id: 101,
            step_key: 'observe',
            ordinal: 1,
            latest_evidence_id: 501,
            latest_review_decision: 'returned'
        },
        {
            assignment_id: 11,
            step_id: 102,
            step_key: 'reflect',
            ordinal: 1,
            latest_evidence_id: 502,
            latest_review_decision: null
        }
    ];
    const client = questClient([
        {
            match: 'FROM quest_v2_assignments assignment JOIN quest_v2_step_definitions',
            reply: { rows }
        }
    ]);
    const repository = new QuestV2RuntimeRepository(client);
    const result = await repository.listAssignmentSteps(7, [10, 11]);

    assert.deepEqual(result, rows);
    assert.deepEqual(client.calls[0].parameters, [7, [10, 11]]);
    assert.match(client.calls[0].sql, /assignment\.user_id = \$1/);
    assert.match(client.calls[0].sql, /assignment\.id = ANY\(\$2::BIGINT\[\]\)/);
    assert.match(client.calls[0].sql, /ORDER BY submitted_at DESC, id DESC LIMIT 1/);
    assert.match(client.calls[0].sql, /ORDER BY reviewed_at DESC, id DESC LIMIT 1/);
});

test('Quest review queue only loads latest evidence for required steps', async () => {
    const client = questClient([
        {
            match: 'FROM quest_v2_assignments assignment',
            reply: {
                rows: [
                    {
                        id: 71,
                        username: 'creator',
                        evidence_id: 710,
                        evidence_kind: 'text',
                        content: { text: 'bounded' },
                        redacted_at: null,
                        step_key: 'reflection'
                    }
                ]
            }
        }
    ]);
    const repository = new QuestV2RuntimeRepository(client);
    const result = await repository.listReviewQueue(50);

    assert.equal(result.length, 1);
    assert.equal(result[0].evidence_id, 710);
    assert.deepEqual(client.calls[0].parameters, [50]);
    assert.match(client.calls[0].sql, /assignment\.status = 'under_review'/);
    assert.match(client.calls[0].sql, /step\.required = TRUE/);
    assert.match(client.calls[0].sql, /ORDER BY submitted_at DESC, id DESC LIMIT 1/);
    assert.match(client.calls[0].sql, /LIMIT \$1/);
});

test('Quest review queue load remains bounded under concurrent administrators', async () => {
    const client = questClient([
        {
            match: 'FROM quest_v2_assignments assignment',
            reply(call) {
                return {
                    rows: Array.from({ length: call.parameters[0] }, (_, index) => ({
                        id: index + 1,
                        username: `creator-${index + 1}`,
                        evidence_id: index + 100,
                        evidence_kind: 'checklist',
                        content: { items: ['reviewed'] },
                        step_key: 'check'
                    }))
                };
            }
        }
    ]);
    const repository = new QuestV2RuntimeRepository(client);
    const queues = await Promise.all(Array.from({ length: 80 }, () => repository.listReviewQueue(50)));

    assert.equal(queues.length, 80);
    assert.equal(queues.every(queue => queue.length === 50), true);
    assert.equal(client.calls.length, 80);
    assert.equal(client.calls.every(call => call.parameters[0] === 50), true);
    assert.equal(client.active, 0);
    assert.ok(client.peak > 1);
});

test('Quest trusted history has a fixed ten-thousand event safety ceiling', async () => {
    const client = questClient([
        {
            match: 'FROM quest_v2_trusted_events',
            reply: {
                rows: [
                    {
                        event_type: 'story.choice.committed',
                        occurred_at: '2026-08-17T12:00:00.000Z',
                        payload: { choiceId: 'signal-path' }
                    }
                ]
            }
        }
    ]);
    const repository = new QuestV2RuntimeRepository(client);
    const history = await repository.listTrustedHistory(81, '2025-08-17T12:00:00.000Z');

    assert.deepEqual(history, [
        {
            eventType: 'story.choice.committed',
            occurredAt: '2026-08-17T12:00:00.000Z',
            payload: { choiceId: 'signal-path' }
        }
    ]);
    assert.deepEqual(client.calls[0].parameters, [81, '2025-08-17T12:00:00.000Z']);
    assert.match(client.calls[0].sql, /processing_status IN \('recorded', 'processed'\)/);
    assert.match(client.calls[0].sql, /ORDER BY occurred_at, id/);
    assert.match(client.calls[0].sql, /LIMIT 10000/);
});

test('Quest retention batch uses skip-locked ordering and caller limit', async () => {
    const client = questClient([
        {
            match: 'SELECT account.id,account.username',
            reply: { rows: [{ id: 7, username: 'creator-a' }, { id: 8, username: 'creator-b' }] }
        },
        {
            match: 'SELECT assignment.id',
            reply: { rows: [{ id: 10 }, { id: 11 }] }
        },
        {
            match: 'WITH due AS',
            reply: {
                rows: [
                    { id: 1, assignment_id: 10 },
                    { id: 2, assignment_id: 11 }
                ]
            }
        }
    ]);
    const repository = new QuestV2RuntimeRepository(client);
    const result = await repository.redactExpiredEvidenceBatch(100);

    assert.deepEqual(result, [
        { id: 1, assignment_id: 10 },
        { id: 2, assignment_id: 11 }
    ]);
    assert.deepEqual(client.calls[0].parameters, [100]);
    assert.deepEqual(client.calls[1].parameters, [[7, 8], 100]);
    assert.deepEqual(client.calls[2].parameters, [[10, 11], 100]);
    assert.match(client.calls[0].sql, /ORDER BY account\.id[\s\S]*FOR NO KEY UPDATE OF account SKIP LOCKED/);
    assert.match(client.calls[1].sql, /ORDER BY assignment\.id[\s\S]*FOR NO KEY UPDATE OF assignment SKIP LOCKED/);
    assert.match(client.calls[2].sql, /redacted_at IS NULL/);
    assert.match(client.calls[2].sql, /retention_until <= NOW\(\)/);
    assert.match(client.calls[2].sql,
        /ORDER BY evidence\.retention_until,evidence\.id LIMIT \$2 FOR UPDATE OF evidence SKIP LOCKED/);
    assert.match(client.calls[2].sql, /content = '\{\}'::JSONB/);
    assert.match(client.calls[2].sql, /media_bytes = NULL/);
    assert.match(client.calls[2].sql, /redaction_reason = 'retention_expired'/);
});

test('Quest single evidence redaction cannot clear content before retention expiry', async () => {
    const client = questClient([
        {
            match: 'UPDATE quest_v2_evidence',
            reply: { rows: [], rowCount: 0 }
        }
    ]);
    const repository = new QuestV2RuntimeRepository(client);
    const result = await repository.redactExpiredEvidence(9001);

    assert.equal(result, null);
    assert.deepEqual(client.calls[0].parameters, [9001]);
    assert.match(client.calls[0].sql, /WHERE id = \$1 AND redacted_at IS NULL/);
    assert.match(client.calls[0].sql, /retention_until <= NOW\(\)/);
    assert.match(client.calls[0].sql, /RETURNING id, assignment_id/);
});

function rewardStatePool() {
    const queryable = new RoutedQueryable([
        {
            match: 'SELECT orders.id,orders.source_type,orders.status',
            reply(call) {
                const limit = call.parameters[1];
                const offset = call.parameters[2];
                return {
                    rows: Array.from({ length: Math.min(limit, 3) }, (_, index) => ({
                        id: offset + index + 1,
                        source_type: 'direct_redemption',
                        status: index === 0 ? 'claimed' : 'pending_approval',
                        points_cost: 20,
                        notification_policy: 'inbox',
                        slug: `reward-${offset + index + 1}`,
                        kind: 'cosmetic',
                        title_zh: `奖励 ${offset + index + 1}`,
                        title_en: `Reward ${offset + index + 1}`,
                        wish_inventory_id: null,
                        inventory_status: null,
                        gift_exchange_id: null,
                        delivery_status: null,
                        failure_reason: null
                    }))
                };
            }
        },
        {
            match: 'SELECT COUNT(*) AS total FROM reward_orders',
            reply: { rows: [{ total: '73' }] }
        },
        {
            match: 'FROM reward_wishlists list',
            reply: {
                rows: [
                    {
                        catalog_version_id: 10,
                        target_quantity: 1,
                        priority: 1,
                        revision: 2,
                        slug: 'paper-lantern',
                        title_zh: '纸灯',
                        title_en: 'Paper Lantern'
                    }
                ]
            }
        },
        {
            match: 'FROM reward_user_assets assets',
            reply: {
                rows: [
                    {
                        asset_type: 'profile_frame',
                        asset_key: 'harbor-frame',
                        acquired_at: '2026-08-17T12:00:00.000Z'
                    }
                ]
            }
        }
    ]);
    return {
        queryable,
        pool: {
            query: queryable.query.bind(queryable),
            async connect() {
                throw new Error('reward state read must not open a transaction');
            }
        }
    };
}

test('reward state page uses bounded history and a separate total count', async () => {
    const { pool, queryable } = rewardStatePool();
    const repository = new RewardCatalogRepository({ pool });
    const state = await repository.state('creator', {
        limit: 30,
        offset: 60
    });

    assert.equal(state.orders.length, 3);
    assert.equal(state.orders[0].id, 61);
    assert.equal(state.total, 73);
    assert.equal(state.wishlist.length, 1);
    assert.equal(state.assets.length, 1);
    assert.equal(queryable.calls.length, 4);
    const orderCall = queryable.calls.find(call => call.sql.startsWith('SELECT orders.id'));
    assert.deepEqual(orderCall.parameters, ['creator', 30, 60]);
    assert.match(orderCall.sql, /ORDER BY orders\.created_at DESC,orders\.id LIMIT \$2 OFFSET \$3/);
});

test('reward history read preserves delivery reconciliation without provider identity', async () => {
    const { pool, queryable } = rewardStatePool();
    const repository = new RewardCatalogRepository({ pool });
    const state = await repository.state('creator', {
        limit: 30,
        offset: 0
    });

    const orderCall = queryable.calls.find(call => call.sql.startsWith('SELECT orders.id'));
    assert.match(orderCall.sql, /LEFT JOIN wish_inventory inventory/);
    assert.match(orderCall.sql, /LEFT JOIN gift_exchanges exchange/);
    assert.match(orderCall.sql, /exchange\.delivery_status/);
    assert.match(orderCall.sql, /exchange\.failure_reason/);
    assert.doesNotMatch(orderCall.sql, /provider_gift_type|provider_receipt|gift_config|provider_id/);
    assert.equal(JSON.stringify(state).includes('provider'), false);
});

test('reward state issues independent read queries concurrently', async () => {
    const { pool, queryable } = rewardStatePool();
    const repository = new RewardCatalogRepository({ pool });
    const result = await repository.state('creator', {
        limit: 30,
        offset: 0
    });

    assert.equal(result.total, 73);
    assert.equal(queryable.calls.length, 4);
    assert.ok(queryable.peak > 1);
    assert.equal(queryable.active, 0);
});

test('reward state repeated load remains four bounded queries per request', async () => {
    const { pool, queryable } = rewardStatePool();
    const repository = new RewardCatalogRepository({ pool });
    const pages = await Promise.all(Array.from({ length: 75 }, (_, index) => repository.state(
        'creator',
        {
            limit: 30,
            offset: (index % 3) * 30
        }
    )));

    assert.equal(pages.length, 75);
    assert.equal(pages.every(page => page.total === 73), true);
    assert.equal(queryable.calls.length, 300);
    const orderCalls = queryable.calls.filter(call => call.sql.startsWith('SELECT orders.id'));
    assert.equal(orderCalls.length, 75);
    assert.equal(orderCalls.every(call => call.parameters[1] === 30), true);
    assert.equal(orderCalls.every(call => [0, 30, 60].includes(call.parameters[2])), true);
    assert.equal(queryable.active, 0);
    assert.ok(queryable.peak > 4);
});

test('reward pending approval queue has an explicit stable cap and order', async () => {
    const queryable = new RoutedQueryable([
        {
            match: "WHERE orders.status='pending_approval'",
            reply: {
                rows: [
                    {
                        id: 1,
                        username: 'creator',
                        points_cost: 200,
                        exposure_value: 5,
                        slug: 'special-frame'
                    }
                ]
            }
        }
    ]);
    const repository = new RewardCatalogRepository({
        pool: {
            query: queryable.query.bind(queryable),
            async connect() {}
        }
    });
    const queue = await repository.pendingReview(50);

    assert.equal(queue.length, 1);
    assert.equal(queue[0].username, 'creator');
    assert.deepEqual(queryable.calls[0].parameters, [50]);
    assert.match(queryable.calls[0].sql, /WHERE orders\.status='pending_approval'/);
    assert.match(queryable.calls[0].sql, /ORDER BY orders\.created_at LIMIT \$1/);
    assert.doesNotMatch(queryable.calls[0].sql, /provider_gift_type|provider_receipt/);
});

function achievementStateClient() {
    return new RoutedQueryable([
        {
            match: 'FROM streamer_achievement_definitions definition',
            reply: {
                rows: [
                    {
                        id: 1,
                        slug: 'harbor-witness',
                        lifecycle: 'active',
                        title_zh: '港湾见证',
                        title_en: 'Harbor Witness',
                        hidden: false,
                        progress: 1,
                        unlocked_at: '2026-08-17T12:00:00.000Z'
                    },
                    {
                        id: 2,
                        slug: 'secret-route',
                        lifecycle: 'retired',
                        title_zh: '隐藏路线',
                        title_en: 'Hidden Route',
                        hidden: true,
                        progress: null,
                        unlocked_at: null
                    }
                ]
            }
        },
        {
            match: 'FROM streamer_collection_holdings',
            reply: {
                rows: [
                    {
                        item_key: 'harbor-pin',
                        source_type: 'achievement',
                        acquired_at: '2026-08-17T12:00:00.000Z',
                        archived_at: null,
                        showcase_slot: 1
                    }
                ]
            }
        },
        {
            match: 'FROM streamer_season_archives',
            reply: {
                rows: [
                    {
                        season_slug: 'streamer-world-season-one',
                        state: 'archived',
                        conclusion_key: 'harbor-promise',
                        archived_at: '2026-08-17T12:00:00.000Z'
                    }
                ]
            }
        }
    ]);
}

test('achievement state loads active and retired definitions without event payloads', async () => {
    const client = achievementStateClient();
    const repository = new AchievementRepository(client);
    const state = await repository.state(44);

    assert.equal(state.achievements.length, 2);
    assert.equal(state.collection.length, 1);
    assert.equal(state.archives.length, 1);
    assert.equal(client.calls.length, 3);
    assert.equal(client.calls.every(call => call.parameters[0] === 44), true);
    assert.match(client.calls[0].sql, /lifecycle IN \('active','retired'\)/);
    assert.doesNotMatch(client.calls[0].sql, /streamer_achievement_events/);
    assert.equal(JSON.stringify(state).includes('semantic_hash'), false);
    assert.equal(JSON.stringify(state).includes('source_event_id'), false);
});

test('achievement collection projection retains earned items after archive', async () => {
    const client = achievementStateClient();
    const repository = new AchievementRepository(client);
    const state = await repository.state(44);

    assert.equal(state.collection[0].item_key, 'harbor-pin');
    assert.equal(state.collection[0].source_type, 'achievement');
    assert.equal(state.collection[0].archived_at, null);
    assert.equal(state.collection[0].showcase_slot, 1);
    const collectionCall = client.calls.find(call => call.sql.includes('streamer_collection_holdings'));
    assert.match(collectionCall.sql, /WHERE user_id=\$1/);
    assert.match(collectionCall.sql, /ORDER BY acquired_at,id/);
    assert.doesNotMatch(collectionCall.sql, /WHERE archived_at IS NULL/);
});

test('achievement state concurrent reads complete without locks or mutation statements', async () => {
    const client = achievementStateClient();
    const repository = new AchievementRepository(client);
    const states = await Promise.all(Array.from({ length: 100 }, () => repository.state(44)));

    assert.equal(states.length, 100);
    assert.equal(states.every(state => state.achievements.length === 2), true);
    assert.equal(states.every(state => state.collection.length === 1), true);
    assert.equal(states.every(state => state.archives.length === 1), true);
    assert.equal(client.calls.length, 300);
    assert.equal(client.calls.some(call => /FOR UPDATE|INSERT|UPDATE|DELETE/.test(call.sql)), false);
    assert.equal(client.active, 0);
    assert.ok(client.peak > 1);
});

test('season archive records the immutable story content hash', async () => {
    const contentHash = 'a'.repeat(64);
    const client = new RoutedQueryable([
        {
            match: 'SELECT id,content_hash FROM story_content_versions',
            reply: {
                rows: [
                    {
                        id: 901,
                        content_hash: contentHash
                    }
                ]
            }
        },
        {
            match: 'INSERT INTO streamer_season_archives',
            reply(call) {
                assert.deepEqual(call.parameters, [
                    44,
                    'streamer-world-season-three',
                    901,
                    'beacon-kept',
                    contentHash
                ]);
                return { rows: [], rowCount: 1 };
            }
        }
    ]);
    const repository = new AchievementRepository(client);
    const archived = await repository.archiveSeason(44, {
        payload: {
            season: 'streamer-world-season-three',
            contentVersion: 1,
            conclusion: 'beacon-kept'
        }
    });

    assert.equal(archived, true);
    assert.equal(client.calls.length, 2);
    assert.match(client.calls[1].sql, /snapshot_hash/);
    assert.match(client.calls[1].sql, /ON CONFLICT \(user_id,content_version_id\) DO NOTHING/);
});

test('season archive refuses to invent a snapshot when version identity is absent', async () => {
    const client = new RoutedQueryable([
        {
            match: 'SELECT id,content_hash FROM story_content_versions',
            reply: { rows: [] }
        }
    ]);
    const repository = new AchievementRepository(client);
    const archived = await repository.archiveSeason(44, {
        payload: {
            season: 'unknown-season',
            contentVersion: 9,
            conclusion: 'none'
        }
    });

    assert.equal(archived, false);
    assert.equal(client.calls.length, 1);
    assert.equal(client.calls.some(call => call.sql.includes('INSERT INTO streamer_season_archives')), false);
});

function livePoolForItems(rows) {
    const queryable = new RoutedQueryable([
        {
            match: 'FROM live_interaction_items item',
            reply: { rows }
        }
    ]);
    return {
        queryable,
        pool: {
            query: queryable.query.bind(queryable),
            async connect() {}
        }
    };
}

function liveItemRows(count) {
    return Array.from({ length: count }, (_, index) => ({
        id: index + 1,
        item_key: `item-${index + 1}`,
        interaction_id: 77,
        item_type: index % 2 ? 'quest_invite' : 'celebration',
        template_key: index % 2 ? 'quest-gentle' : 'celebrate-clear',
        status: index === 0 ? 'expired' : 'delivered',
        revision: 0,
        payload: {
            titleZh: `互动 ${index + 1}`,
            titleEn: `Interaction ${index + 1}`
        },
        target_story_node: null,
        created_at: '2026-08-17T12:00:00.000Z',
        deliver_at: '2026-08-17T12:00:00.000Z',
        expires_at: '2026-08-17T13:00:00.000Z',
        responded_at: null,
        updated_at: '2026-08-17T12:00:00.000Z'
    }));
}

test('live item page derives expired status on the server and uses a fixed limit', async () => {
    const { pool, queryable } = livePoolForItems(liveItemRows(50));
    const repository = new LiveInteractionRepository({ pool });
    const items = await repository.listItems(queryable, 77, { limit: 50 });

    assert.equal(items.length, 50);
    assert.equal(items[0].id, 1);
    assert.equal(items[0].itemKey, 'item-1');
    assert.equal(items[0].status, 'expired');
    assert.equal(items[1].status, 'delivered');
    assert.deepEqual(queryable.calls[0].parameters, [77, 50]);
    assert.match(queryable.calls[0].sql, /item\.status='delivered' AND item\.expires_at<=NOW\(\)/);
    assert.match(queryable.calls[0].sql, /THEN 'expired'/);
    assert.match(queryable.calls[0].sql, /ORDER BY created_at DESC,id DESC LIMIT \$2/);
});

test('live item projection omits semantic hashes and creator identifiers', async () => {
    const row = {
        ...liveItemRows(1)[0],
        semantic_hash: 'private-semantic-hash',
        created_by_user_id: 88,
        provider_id: 'never-expose'
    };
    const { pool, queryable } = livePoolForItems([row]);
    const repository = new LiveInteractionRepository({ pool });
    const [item] = await repository.listItems(queryable, 77, { limit: 1 });

    assert.equal(item.semanticHash, undefined);
    assert.equal(item.createdByUserId, undefined);
    assert.equal(item.providerId, undefined);
    assert.equal(JSON.stringify(item).includes('private-semantic-hash'), false);
    assert.equal(JSON.stringify(item).includes('never-expose'), false);
});

test('live item repeated room load remains bounded at fifty rows', async () => {
    const { pool, queryable } = livePoolForItems(liveItemRows(50));
    const repository = new LiveInteractionRepository({ pool });
    const pages = await Promise.all(Array.from({ length: 100 }, () => repository.listItems(
        queryable,
        77,
        { limit: 50 }
    )));

    assert.equal(pages.length, 100);
    assert.equal(pages.every(page => page.length === 50), true);
    assert.equal(queryable.calls.length, 100);
    assert.equal(queryable.calls.every(call => call.parameters[0] === 77), true);
    assert.equal(queryable.calls.every(call => call.parameters[1] === 50), true);
    assert.equal(queryable.active, 0);
    assert.ok(queryable.peak > 1);
});

test('story administrator audit has an explicit limit and newest-first order', async () => {
    const client = new RoutedQueryable([
        {
            match: 'FROM story_audit_log audit',
            reply: {
                rows: [
                    {
                        id: 100,
                        run_id: 77,
                        username: 'creator',
                        action: 'story.choice.committed',
                        details: { choiceId: 'signal-path' },
                        created_at: '2026-08-17T12:00:00.000Z'
                    }
                ]
            }
        }
    ]);
    const repository = new StoryWorldRepository(client);
    const rows = await repository.listAdminAudit(100);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, 'story.choice.committed');
    assert.deepEqual(client.calls[0].parameters, [100]);
    assert.match(client.calls[0].sql, /ORDER BY audit\.id DESC LIMIT \$1/);
    assert.doesNotMatch(client.calls[0].sql, /story_runs\.state|state_snapshot|effects_digest/);
});

test('story administrator audit load remains bounded under parallel readers', async () => {
    const client = new RoutedQueryable([
        {
            match: 'FROM story_audit_log audit',
            reply(call) {
                return {
                    rows: Array.from({ length: call.parameters[0] }, (_, index) => ({
                        id: 1000 - index,
                        run_id: index + 1,
                        username: `creator-${index + 1}`,
                        action: 'story.choice.committed',
                        details: {},
                        created_at: '2026-08-17T12:00:00.000Z'
                    }))
                };
            }
        }
    ]);
    const repository = new StoryWorldRepository(client);
    const pages = await Promise.all(Array.from({ length: 100 }, () => repository.listAdminAudit(100)));

    assert.equal(pages.length, 100);
    assert.equal(pages.every(page => page.length === 100), true);
    assert.equal(client.calls.length, 100);
    assert.equal(client.calls.every(call => call.parameters[0] === 100), true);
    assert.equal(client.active, 0);
    assert.ok(client.peak > 1);
});

test('all Phase9 read-load query contracts are explicit LIMIT queries', () => {
    const files = [
        require('node:fs').readFileSync(require.resolve('../repositories/creator-repository'), 'utf8'),
        require('node:fs').readFileSync(require.resolve('../repositories/quest-v2-runtime-repository'), 'utf8'),
        require('node:fs').readFileSync(require.resolve('../repositories/reward-catalog-repository'), 'utf8'),
        require('node:fs').readFileSync(require.resolve('../repositories/story-world-repository'), 'utf8'),
        require('node:fs').readFileSync(require.resolve('../repositories/live-interaction-repository'), 'utf8')
    ];
    const combined = files.join('\n');

    assert.match(combined, /FROM shared_memories[\s\S]*?LIMIT \$2/);
    assert.match(combined, /FROM creator_inbox_messages[\s\S]*?LIMIT \$2/);
    assert.match(combined, /FROM quest_v2_assignments assignment[\s\S]*?LIMIT \$2 OFFSET \$3/);
    assert.match(combined, /FROM quest_v2_trusted_events[\s\S]*?LIMIT 10000/);
    assert.match(combined, /WHERE orders\.status='pending_approval'[\s\S]*?LIMIT \$1/);
    assert.match(combined, /FROM story_audit_log audit[\s\S]*?LIMIT \$1/);
    assert.match(combined, /FROM live_interaction_items item[\s\S]*?LIMIT \$2/);
});
