'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const ejs = require('ejs');

const gameRegistry = require('../domain/games');
const {
    ADMIN_RECORD_LIMIT_MAX,
    PROVIDERS,
    buildProfileRecordRows,
    loadAdminRecordSections,
    loadLatestRecords,
    resolveRecordGames
} = gameRegistry.records;

test('profile record rows use the same provider metadata instead of browser game branches', () => {
    const duelRows = buildProfileRecordRows('duel', [{
        id: 9,
        played_at: '2026-08-13 12:00:00',
        gift_type: 'jade',
        power: 42,
        cost: gameRegistry.calculateDuelCost('jade', 42),
        success: true,
        reward: gameRegistry.DUEL_CONFIG.rewards.jade.reward
    }]);
    assert.deepEqual(
        duelRows[0].cells.map((cell) => cell.key),
        PROVIDERS.duel.profile.columns.map((column) => column.key)
    );
    const duelCells = Object.fromEntries(duelRows[0].cells.map((cell) => [cell.key, cell]));
    assert.equal(duelCells.gift.zh, '玉阶奖 1000');
    assert.equal(duelCells.gift.en, 'Jade Prize 1000');

    const stoneRows = buildProfileRecordRows('stone', [{
        played_at: '2026-08-13 12:01:00',
        action_type: 'replace',
        cost: gameRegistry.STONE_CONFIG.replaceCosts[4],
        reward: 0,
        before_slots: ['red', 'red', 'red', 'red', 'blue', 'green'],
        after_slots: ['red', 'red', 'red', 'blue', 'blue', 'green']
    }]);
    const stoneCells = Object.fromEntries(stoneRows[0].cells.map((cell) => [cell.key, cell]));
    assert.equal(stoneCells.amount.zh, `-${gameRegistry.STONE_CONFIG.replaceCosts[4]} 积分`);
    assert.match(stoneCells.change.en, /Red/);
});

test('record providers expose one validated admin presentation contract', () => {
    for (const [recordView, provider] of Object.entries(PROVIDERS)) {
        assert.match(provider.latestSql, /username = ANY\(\$1::text\[\]\)/, recordView);
        assert.equal(typeof provider.mapLatest, 'function', recordView);
        assert.match(provider.admin.listSql, /WHERE username = \$1/, recordView);
        assert.match(provider.admin.listSql, /LIMIT \$2 OFFSET \$3/, recordView);
        assert.equal(typeof provider.admin.mapRow, 'function', recordView);
        assert.ok(provider.admin.columns.length > 0, recordView);
        assert.equal(
            new Set(provider.admin.columns.map((descriptor) => descriptor.key)).size,
            provider.admin.columns.length,
            recordView
        );
    }

    const resolved = resolveRecordGames([
        { id: 'quiz', recordView: 'quiz', titleZh: '问答', titleEn: 'Quiz' },
        { id: 'spin', recordView: null, titleZh: '转盘', titleEn: 'Spin' }
    ]);
    assert.deepEqual(resolved, [{
        id: 'quiz',
        recordView: 'quiz',
        titleZh: '问答',
        titleEn: 'Quiz'
    }]);
    assert.throws(() => resolveRecordGames([
        { id: 'unknown', recordView: 'missing', titleZh: '未知', titleEn: 'Unknown' }
    ]), /has no record provider/);
    assert.throws(() => resolveRecordGames([
        { id: 'quiz', recordView: 'quiz', titleZh: '问答', titleEn: 'Quiz' },
        { id: 'quiz-copy', recordView: 'quiz', titleZh: '重复', titleEn: 'Duplicate' }
    ]), /assigned more than once/);
});

test('latest-record loader builds a localized registry-driven matrix without route branches', async () => {
    const calls = [];
    const pool = {
        async query(sql, values) {
            calls.push({ sql, values });
            if (sql.includes('FROM submissions')) {
                return { rows: [{ username: 'alice', score: 12, played_at: '2026-08-13 10:00:00' }] };
            }
            if (sql.includes('FROM blindbox_logs')) {
                return {
                    rows: [{
                        username: 'bob',
                        tier_name: '高级',
                        box_count: 2,
                        total_reward_value: 98,
                        played_at: '2026-08-13 11:00:00'
                    }]
                };
            }
            throw new Error('Unexpected provider query');
        }
    };
    const result = await loadLatestRecords(pool, {
        usernames: ['alice', 'bob', 'alice'],
        gameDefinitions: [
            { id: 'quiz', recordView: 'quiz', titleZh: '知识问答', titleEn: 'Quiz Sprint' },
            { id: 'blindbox', recordView: 'blindbox', titleZh: '惊喜盲盒', titleEn: 'Surprise Boxes' },
            { id: 'spin', recordView: null, titleZh: '挑战转盘', titleEn: 'Challenge Wheel' }
        ]
    });

    assert.deepEqual(result.games.map((game) => game.recordView), ['quiz', 'blindbox']);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].values, [['alice', 'bob']]);
    assert.deepEqual(result.byUsername.alice.quiz, {
        zh: '2026-08-13 10:00:00 | 分数 12',
        en: '2026-08-13 10:00:00 | Score 12'
    });
    assert.deepEqual(result.byUsername.alice.blindbox, { zh: '-', en: '-' });
    assert.deepEqual(result.byUsername.bob.blindbox, {
        zh: '2026-08-13 11:00:00 | 高级 | 98积分',
        en: '2026-08-13 11:00:00 | 高级 | 98 points'
    });
});

test('admin record loader preserves Wish and Flip detail behavior behind standard sections', async () => {
    const calls = [];
    const pool = {
        async query(sql, values) {
            calls.push({ sql, values });
            if (sql.includes('FROM wish_results')) {
                return {
                    rows: [{
                        id: 41,
                        gift_type: 'proposal',
                        cost: gameRegistry.WISH_CONFIGS.proposal.cost,
                        success: true,
                        reward: '原地求婚',
                        wishes_count: 3,
                        played_at: '2026-08-13 12:00:00'
                    }]
                };
            }
            if (sql.includes('FROM flip_logs')) {
                return {
                    rows: [{
                        id: 42,
                        action_type: 'flip',
                        cost: gameRegistry.FLIP_CONFIG.costs[0],
                        reward: 0,
                        card_index: 2,
                        card_type: 'good',
                        good_count: 1,
                        bad_count: 0,
                        ended: false,
                        played_at: '2026-08-13 12:01:00'
                    }]
                };
            }
            throw new Error('Unexpected provider query');
        }
    };
    const sections = await loadAdminRecordSections(pool, {
        username: 'alice',
        limit: ADMIN_RECORD_LIMIT_MAX + 100,
        gameDefinitions: [
            { id: 'wish', recordView: 'wish', titleZh: '幸运祈愿', titleEn: 'Lucky Wish' },
            { id: 'flip', recordView: 'flip', titleZh: '翻卡牌', titleEn: 'Card Flip' }
        ]
    });

    assert.equal(calls.length, 2);
    assert.ok(calls[0].sql.includes('FROM wish_results'));
    assert.ok(!calls[0].sql.includes('FROM wish_sessions'));
    assert.ok(!calls[1].sql.includes("action_type = 'end'"));
    assert.deepEqual(calls.map((call) => call.values), [
        ['alice', ADMIN_RECORD_LIMIT_MAX, 0],
        ['alice', ADMIN_RECORD_LIMIT_MAX, 0]
    ]);

    const wishCells = Object.fromEntries(sections[0].rows[0].cells.map((cell) => [cell.key, cell]));
    assert.equal(sections[0].titleEn, 'Lucky Wish');
    assert.deepEqual(wishCells.result, { key: 'result', zh: '成功', en: 'Success' });
    assert.deepEqual(wishCells.reward, { key: 'reward', zh: '原地求婚', en: '原地求婚' });

    const flipCells = Object.fromEntries(sections[1].rows[0].cells.map((cell) => [cell.key, cell]));
    assert.deepEqual(flipCells.flipped, { key: 'flipped', zh: '2 / good', en: '2 / good' });
    assert.deepEqual(flipCells.ended, { key: 'ended', zh: '否', en: 'No' });
});

test('the actual catalog automatically yields a section for every record provider', async () => {
    const calls = [];
    const pool = {
        async query(sql, values) {
            calls.push({ sql, values });
            return { rows: [] };
        }
    };
    const sections = await loadAdminRecordSections(pool, {
        username: 'catalog-user',
        gameDefinitions: gameRegistry.GAME_DEFINITIONS
    });
    const expected = gameRegistry.GAME_DEFINITIONS
        .filter((definition) => definition.recordView)
        .map((definition) => definition.recordView);

    assert.deepEqual(sections.map((section) => section.recordView), expected);
    assert.equal(calls.length, expected.length);
    assert.ok(sections.some((section) => section.recordView === 'blindbox'));
});

test('generic admin record renderer uses DTO metadata and escapes cell values', async () => {
    const template = path.resolve(__dirname, '../views/admin-user-records.ejs');
    const html = await ejs.renderFile(template, {
        title: 'User Records',
        lang: 'en',
        user: { username: 'admin' },
        targetUsername: 'alice',
        csrfToken: 'csrf-token',
        cspNonce: 'nonce',
        recordSections: [{
            recordView: 'future-game',
            titleZh: '未来游戏',
            titleEn: 'Future Game',
            columns: [{ key: 'outcome', labelZh: '结果', labelEn: 'Outcome' }],
            rows: [{
                id: 1,
                cells: [{ key: 'outcome', zh: '<script>失败</script>', en: '<script>Failed</script>' }]
            }]
        }]
    });

    assert.match(html, /data-record-view="future-game"/);
    assert.match(html, /Future Game/);
    assert.match(html, /Outcome/);
    assert.match(html, /&lt;script&gt;Failed&lt;\/script&gt;/);
    assert.ok(!html.includes('<script>Failed</script>'));
});
