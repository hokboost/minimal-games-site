'use strict';

const {
    BLINDBOX_CONFIG,
    DUEL_CONFIG,
    STONE_CONFIG,
    WISH_CONFIGS
} = require('./configuration');

const ADMIN_RECORD_LIMIT_MAX = 500;

const column = (key, labelZh, labelEn) => Object.freeze({ key, labelZh, labelEn });
const localized = (zh, en = zh) => ({ zh: String(zh), en: String(en) });

function displayValue(value, fallback = '-') {
    if (value === null || value === undefined || value === '') return fallback;
    if (Array.isArray(value)) return value.map((item) => displayValue(item, '')).join(',');
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return fallback;
        }
    }
    return String(value);
}

function normalizeLocalizedValue(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)
        && Object.hasOwn(value, 'zh') && Object.hasOwn(value, 'en')) {
        return localized(displayValue(value.zh), displayValue(value.en));
    }
    const text = displayValue(value);
    return localized(text, text);
}

function parseDisplayArray(value) {
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value;
        return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
    } catch {
        return [];
    }
}

function translateScratchResult(value) {
    const zh = displayValue(value, '');
    return localized(
        zh,
        zh.replaceAll('未中奖', 'No Win').replaceAll('中奖', 'Win').replaceAll('积分', 'points')
    );
}

const STONE_COLOR_NAMES = Object.freeze({
    red: localized('红', 'Red'),
    orange: localized('橙', 'Orange'),
    yellow: localized('黄', 'Yellow'),
    green: localized('绿', 'Green'),
    cyan: localized('青', 'Cyan'),
    blue: localized('蓝', 'Blue'),
    purple: localized('紫', 'Purple')
});

function formatStoneSlots(value) {
    const slots = parseDisplayArray(value);
    return localized(
        slots.map((color) => STONE_COLOR_NAMES[color]?.zh || '空').join(''),
        slots.map((color) => STONE_COLOR_NAMES[color]?.en || 'Empty').join(' / ')
    );
}

function formatSignedAmount(cost, reward) {
    if (Number(cost) > 0) return `-${displayValue(cost, '0')}`;
    if (Number(reward) > 0) return `+${displayValue(reward, '0')}`;
    return '0';
}

function localizedNet(cost, reward) {
    if (cost === null || cost === undefined || reward === null || reward === undefined) {
        return localized('历史记录暂无盈亏数据', 'Unavailable for legacy record');
    }
    const net = (Number(reward) || 0) - (Number(cost) || 0);
    const signed = net > 0 ? `+${net}` : String(net);
    return localized(`${signed} 积分`, `${signed} points`);
}

function validatePresentation(presentation, label) {
    if (!presentation || !Array.isArray(presentation.columns)
        || typeof presentation.mapRow !== 'function') {
        throw new TypeError(`Record provider is missing ${label} presentation`);
    }
    const keys = new Set();
    for (const descriptor of presentation.columns) {
        if (!descriptor || typeof descriptor.key !== 'string' || !descriptor.key
            || typeof descriptor.labelZh !== 'string' || typeof descriptor.labelEn !== 'string'
            || keys.has(descriptor.key)) {
            throw new TypeError(`Record provider has invalid ${label} columns`);
        }
        keys.add(descriptor.key);
    }
}

function defineProvider(config) {
    const {
        listSql,
        countSql,
        summarySql,
        mapSummary,
        latestSql,
        mapLatest,
        profile,
        admin
    } = config;
    if (![listSql, countSql, summarySql, latestSql].every((sql) => typeof sql === 'string')) {
        throw new TypeError('Record provider SQL must be strings');
    }
    if (typeof mapSummary !== 'function' || typeof mapLatest !== 'function') {
        throw new TypeError('Record provider is missing a mapper or admin presentation');
    }
    validatePresentation(profile, 'profile');
    validatePresentation(admin, 'admin');
    const adminListSql = admin.listSql || listSql;
    if (typeof adminListSql !== 'string') {
        throw new TypeError('Record provider admin SQL must be a string');
    }
    return Object.freeze({
        ...config,
        profile: Object.freeze({
            ...profile,
            columns: Object.freeze([...profile.columns])
        }),
        admin: Object.freeze({
            ...admin,
            listSql: adminListSql,
            columns: Object.freeze([...admin.columns])
        })
    });
}

const PROVIDERS = Object.freeze({
    quiz: defineProvider({
        listSql: `
            SELECT id, score, cost_points, reward_points,
                   to_char(submitted_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS played_at
            FROM submissions
            WHERE username = $1
            ORDER BY submitted_at DESC
            LIMIT $2 OFFSET $3
        `,
        countSql: 'SELECT COUNT(*) FROM submissions WHERE username = $1',
        summarySql: 'SELECT COUNT(*) AS count, MAX(score) AS best_score FROM submissions WHERE username = $1',
        mapSummary: (row) => ({ total: Number.parseInt(row.count, 10) || 0, bestScore: Number(row.best_score) || 0 }),
        latestSql: `
            SELECT DISTINCT ON (username) username, score,
                   to_char(submitted_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS played_at
            FROM submissions
            WHERE username = ANY($1::text[])
            ORDER BY username, submitted_at DESC
        `,
        mapLatest: (row) => localized(
            `${row.played_at} | 分数 ${displayValue(row.score, '0')}`,
            `${row.played_at} | Score ${displayValue(row.score, '0')}`
        ),
        profile: {
            columns: [column('playedAt', '游戏时间', 'Time'), column('score', '得分', 'Score'), column('net', '本次盈亏', 'Win / Loss')],
            mapRow: (row) => ({
                playedAt: row.played_at,
                score: localized(`${displayValue(row.score, '0')} 分`, `${displayValue(row.score, '0')} pts`),
                net: localizedNet(row.cost_points, row.reward_points)
            })
        },
        admin: {
            columns: [column('playedAt', '时间', 'Time'), column('score', '分数', 'Score')],
            mapRow: (row) => ({ playedAt: row.played_at, score: row.score })
        }
    }),
    slot: defineProvider({
        listSql: `
            SELECT id, won AS result, COALESCE(payout_amount, 0) AS payout,
                   COALESCE(bet_amount, 0) AS bet_amount,
                   COALESCE(multiplier, 0) AS multiplier,
                   COALESCE(game_details->>'amounts', '') AS amounts,
                   to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS played_at
            FROM slot_results
            WHERE username = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `,
        countSql: 'SELECT COUNT(*) FROM slot_results WHERE username = $1',
        summarySql: 'SELECT COUNT(*) AS count, SUM(CASE WHEN COALESCE(payout_amount, 0) > 0 THEN 1 ELSE 0 END) AS wins FROM slot_results WHERE username = $1',
        mapSummary: (row) => ({ total: Number.parseInt(row.count, 10) || 0, wins: Number.parseInt(row.wins, 10) || 0 }),
        latestSql: `
            SELECT DISTINCT ON (username) username, COALESCE(payout_amount, 0) AS payout,
                   to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS played_at
            FROM slot_results
            WHERE username = ANY($1::text[])
            ORDER BY username, created_at DESC
        `,
        mapLatest: (row) => localized(
            `${row.played_at} | ${displayValue(row.payout, '0')}积分`,
            `${row.played_at} | ${displayValue(row.payout, '0')} points`
        ),
        profile: {
            columns: [
                column('playedAt', '游戏时间', 'Time'),
                column('result', '结果', 'Result'),
                column('payout', '获得积分', 'Points Earned'),
                column('net', '本次盈亏', 'Win / Loss'),
                column('panel', '转动结果', 'Reels')
            ],
            mapRow: (row) => {
                const won = Number(row.payout) > 0 || row.result === 'won';
                const panel = parseDisplayArray(row.amounts);
                return {
                    playedAt: row.played_at,
                    result: localized(won ? '中奖' : '未中奖', won ? 'Win' : 'No Win'),
                    payout: localized(
                        `${displayValue(row.payout, '0')} 积分`,
                        `${displayValue(row.payout, '0')} points`
                    ),
                    net: localizedNet(row.bet_amount, row.payout),
                    panel: `[${panel.map((item) => displayValue(item, '')).join(', ')}]`
                };
            }
        },
        admin: {
            columns: [
                column('playedAt', '时间', 'Time'),
                column('result', '结果', 'Result'),
                column('bet', '下注', 'Bet'),
                column('multiplier', '倍数', 'Multiplier'),
                column('payout', '派奖', 'Payout'),
                column('panel', '面板', 'Panel')
            ],
            mapRow: (row) => ({
                playedAt: row.played_at,
                result: row.result,
                bet: row.bet_amount,
                multiplier: row.multiplier,
                payout: row.payout,
                panel: row.amounts
            })
        }
    }),
    scratch: defineProvider({
        listSql: `
            SELECT id, reward AS result, COALESCE(matches_count, 0) AS matches_count,
                   COALESCE(tier_cost, 5) AS tier_cost, winning_numbers, slots,
                   to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS played_at
            FROM scratch_results
            WHERE username = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `,
        countSql: 'SELECT COUNT(*) FROM scratch_results WHERE username = $1',
        summarySql: 'SELECT COUNT(*) AS count, SUM(CASE WHEN COALESCE(matches_count, 0) > 0 THEN 1 ELSE 0 END) AS wins FROM scratch_results WHERE username = $1',
        mapSummary: (row) => ({ total: Number.parseInt(row.count, 10) || 0, wins: Number.parseInt(row.wins, 10) || 0 }),
        latestSql: `
            SELECT DISTINCT ON (username) username, COALESCE(reward::text, '0') AS reward,
                   to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS played_at
            FROM scratch_results
            WHERE username = ANY($1::text[])
            ORDER BY username, created_at DESC
        `,
        mapLatest: (row) => localized(
            `${row.played_at} | ${displayValue(row.reward, '0')}积分`,
            `${row.played_at} | ${displayValue(row.reward, '0')} points`
        ),
        profile: {
            columns: [
                column('playedAt', '游戏时间', 'Time'),
                column('result', '结果', 'Result'),
                column('tier', '档位', 'Tier'),
                column('matches', '匹配数', 'Matches'),
                column('net', '本次盈亏', 'Win / Loss')
            ],
            mapRow: (row) => ({
                playedAt: row.played_at,
                result: translateScratchResult(row.result),
                tier: localized(
                    `${displayValue(row.tier_cost, '0')} 积分`,
                    `${displayValue(row.tier_cost, '0')} points`
                ),
                matches: localized(
                    `${displayValue(row.matches_count, '0')} 个`,
                    displayValue(row.matches_count, '0')
                ),
                net: localizedNet(row.tier_cost, row.result)
            })
        },
        admin: {
            listSql: `
                SELECT id, COALESCE(reward::text, '0') AS reward,
                       COALESCE(matches_count, 0) AS matches_count,
                       COALESCE(tier_cost, 0) AS tier_cost,
                       to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS played_at
                FROM scratch_results
                WHERE username = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
            `,
            columns: [
                column('playedAt', '时间', 'Time'),
                column('tier', '档位', 'Tier'),
                column('matches', '匹配', 'Match'),
                column('reward', '奖励', 'Reward')
            ],
            mapRow: (row) => ({
                playedAt: row.played_at,
                tier: row.tier_cost,
                matches: row.matches_count,
                reward: row.reward
            })
        }
    }),
    wish: defineProvider({
        listSql: `
            SELECT id, gift_type, batch_count, total_cost, success_count, total_reward_value, gift_name,
                   to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS played_at
            FROM wish_sessions
            WHERE username = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `,
        countSql: 'SELECT COUNT(*) FROM wish_sessions WHERE username = $1',
        summarySql: 'SELECT COUNT(*) AS count, COALESCE(SUM(success_count), 0) AS wins FROM wish_sessions WHERE username = $1',
        mapSummary: (row) => ({ total: Number.parseInt(row.count, 10) || 0, wins: Number.parseInt(row.wins, 10) || 0 }),
        latestSql: `
            SELECT DISTINCT ON (username) username, reward, success, cost,
                   to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS played_at
            FROM wish_results
            WHERE username = ANY($1::text[])
            ORDER BY username, created_at DESC
        `,
        mapLatest: (row) => {
            const rewardZh = row.success ? (row.reward || '中奖') : '未中奖';
            const rewardEn = row.success ? (row.reward || 'Win') : 'No win';
            return localized(`${row.played_at} | ${rewardZh}`, `${row.played_at} | ${rewardEn}`);
        },
        profile: {
            columns: [
                column('playedAt', '祈愿时间', 'Wish Time'),
                column('count', '次数', 'Count'),
                column('cost', '消耗积分', 'Cost'),
                column('result', '结果', 'Result'),
                column('net', '本次盈亏', 'Win / Loss')
            ],
            mapRow: (row) => {
                const successCount = Number(row.success_count) || 0;
                const config = WISH_CONFIGS[row.gift_type];
                const giftZh = row.gift_name || config?.name || displayValue(row.gift_type, '礼物');
                const giftEn = config?.nameEn || row.gift_name || displayValue(row.gift_type, 'Gift');
                return {
                    playedAt: row.played_at,
                    count: row.batch_count,
                    cost: localized(
                        `${displayValue(row.total_cost, '0')} 积分`,
                        `${displayValue(row.total_cost, '0')} points`
                    ),
                    result: successCount > 0
                        ? localized(`${giftZh} x${successCount}`, `${giftEn} x${successCount}`)
                        : localized('未中奖', 'No Win'),
                    net: localizedNet(row.total_cost, row.total_reward_value)
                };
            }
        },
        admin: {
            listSql: `
                SELECT id, gift_type, cost, success, reward, wishes_count,
                       to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS played_at
                FROM wish_results
                WHERE username = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
            `,
            columns: [
                column('playedAt', '时间', 'Time'),
                column('gift', '礼物', 'Gift'),
                column('cost', '消耗', 'Cost'),
                column('result', '结果', 'Result'),
                column('reward', '奖励', 'Reward'),
                column('count', '次数', 'Count')
            ],
            mapRow: (row) => ({
                playedAt: row.played_at,
                gift: row.gift_type,
                cost: row.cost,
                result: localized(row.success ? '成功' : '失败', row.success ? 'Success' : 'Failed'),
                reward: row.reward || '-',
                count: row.wishes_count
            })
        }
    }),
    blindbox: defineProvider({
        listSql: `
            SELECT id, tier_key, tier_name, box_count, total_cost, total_reward_value, rewards,
                   to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS played_at
            FROM blindbox_logs
            WHERE username = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `,
        countSql: 'SELECT COUNT(*) FROM blindbox_logs WHERE username = $1',
        summarySql: 'SELECT COUNT(*) AS count FROM blindbox_logs WHERE username = $1',
        mapSummary: (row) => ({ total: Number.parseInt(row.count, 10) || 0 }),
        latestSql: `
            SELECT DISTINCT ON (username) username, tier_name, box_count, total_reward_value,
                   to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS played_at
            FROM blindbox_logs
            WHERE username = ANY($1::text[])
            ORDER BY username, created_at DESC
        `,
        mapLatest: (row) => localized(
            `${row.played_at} | ${displayValue(row.tier_name)} | ${displayValue(row.total_reward_value, '0')}积分`,
            `${row.played_at} | ${displayValue(row.tier_name)} | ${displayValue(row.total_reward_value, '0')} points`
        ),
        profile: {
            columns: [
                column('playedAt', '抽取时间', 'Time'),
                column('tier', '档位', 'Tier'),
                column('count', '数量', 'Count'),
                column('cost', '消耗积分', 'Cost'),
                column('value', '总价值', 'Total Value'),
                column('net', '本次盈亏', 'Win / Loss')
            ],
            mapRow: (row) => {
                const tier = BLINDBOX_CONFIG.tiers[row.tier_key];
                return {
                    playedAt: row.played_at,
                    tier: localized(row.tier_name || tier?.nameZh || '-', tier?.nameEn || row.tier_name || '-'),
                    count: row.box_count,
                    cost: localized(
                        `${displayValue(row.total_cost, '0')} 积分`,
                        `${displayValue(row.total_cost, '0')} points`
                    ),
                    value: localized(
                        `${displayValue(row.total_reward_value, '0')} 积分`,
                        `${displayValue(row.total_reward_value, '0')} points`
                    ),
                    net: localizedNet(row.total_cost, row.total_reward_value)
                };
            }
        },
        admin: {
            columns: [
                column('playedAt', '时间', 'Time'),
                column('tier', '档位', 'Tier'),
                column('count', '数量', 'Count'),
                column('cost', '消耗', 'Cost'),
                column('value', '总价值', 'Total Value')
            ],
            mapRow: (row) => ({
                playedAt: row.played_at,
                tier: row.tier_name,
                count: row.box_count,
                cost: row.total_cost,
                value: row.total_reward_value
            })
        }
    }),
    stone: defineProvider({
        listSql: `
            SELECT id, action_type, COALESCE(cost, 0) AS cost, COALESCE(reward, 0) AS reward,
                   slot_index, before_slots, after_slots,
                   to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS played_at
            FROM stone_logs
            WHERE username = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `,
        countSql: 'SELECT COUNT(*) FROM stone_logs WHERE username = $1',
        summarySql: 'SELECT COUNT(*) AS count FROM stone_logs WHERE username = $1',
        mapSummary: (row) => ({ total: Number.parseInt(row.count, 10) || 0 }),
        latestSql: `
            SELECT DISTINCT ON (username) username, action_type, COALESCE(reward, 0) AS reward,
                   to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS played_at
            FROM stone_logs
            WHERE username = ANY($1::text[])
            ORDER BY username, created_at DESC
        `,
        mapLatest: (row) => localized(
            `${row.played_at} | ${displayValue(row.action_type)} | ${displayValue(row.reward, '0')}积分`,
            `${row.played_at} | ${displayValue(row.action_type)} | ${displayValue(row.reward, '0')} points`
        ),
        profile: {
            columns: [
                column('playedAt', '操作时间', 'Time'),
                column('action', '操作', 'Action'),
                column('amount', '花费', 'Change'),
                column('net', '本次盈亏', 'Win / Loss'),
                column('change', '变化', 'Slots')
            ],
            mapRow: (row) => {
                const actions = {
                    add: localized('放入', 'Add'),
                    fill: localized('一键放满', 'Fill'),
                    replace: localized('更换', 'Replace'),
                    redeem: localized('兑换', 'Redeem')
                };
                const before = formatStoneSlots(row.before_slots);
                const after = formatStoneSlots(row.after_slots);
                const amount = formatSignedAmount(row.cost, row.reward);
                return {
                    playedAt: row.played_at,
                    action: actions[row.action_type] || row.action_type,
                    amount: localized(`${amount} 积分`, `${amount} points`),
                    net: localizedNet(row.cost, row.reward),
                    change: localized(`${before.zh} → ${after.zh}`, `${before.en} → ${after.en}`)
                };
            }
        },
        admin: {
            columns: [
                column('playedAt', '时间', 'Time'),
                column('action', '动作', 'Action'),
                column('cost', '消耗', 'Cost'),
                column('reward', '奖励', 'Reward'),
                column('slot', '槽位', 'Slot'),
                column('change', '变化', 'Change')
            ],
            mapRow: (row) => ({
                playedAt: row.played_at,
                action: row.action_type,
                cost: row.cost,
                reward: row.reward,
                slot: row.slot_index,
                change: `${displayValue(row.before_slots)} → ${displayValue(row.after_slots)}`
            })
        }
    }),
    flip: defineProvider({
        listSql: `
            SELECT id, action_type, COALESCE(cost, 0) AS cost, COALESCE(reward, 0) AS reward,
                   good_count, bad_count, ended,
                   to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS played_at
            FROM flip_logs
            WHERE username = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `,
        countSql: 'SELECT COUNT(*) FROM flip_logs WHERE username = $1',
        summarySql: 'SELECT COUNT(*) AS count FROM flip_logs WHERE username = $1',
        mapSummary: (row) => ({ total: Number.parseInt(row.count, 10) || 0 }),
        latestSql: `
            SELECT DISTINCT ON (username) username, good_count, bad_count, COALESCE(reward, 0) AS reward,
                   to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS played_at
            FROM flip_logs
            WHERE action_type = 'end' AND username = ANY($1::text[])
            ORDER BY username, created_at DESC
        `,
        mapLatest: (row) => localized(
            `${row.played_at} | 好${displayValue(row.good_count, '0')}坏${displayValue(row.bad_count, '0')} | ${displayValue(row.reward, '0')}积分`,
            `${row.played_at} | Good ${displayValue(row.good_count, '0')} Bad ${displayValue(row.bad_count, '0')} | ${displayValue(row.reward, '0')} points`
        ),
        profile: {
            columns: [
                column('playedAt', '操作时间', 'Time'),
                column('action', '动作', 'Action'),
                column('amount', '成本/奖励', 'Cost/Reward'),
                column('net', '本次盈亏', 'Win / Loss'),
                column('result', '结果', 'Result')
            ],
            mapRow: (row) => {
                const action = row.action_type === 'end'
                    ? localized('本局结果', 'Result')
                    : displayValue(row.action_type);
                const amount = formatSignedAmount(row.cost, row.reward);
                return {
                    playedAt: row.played_at,
                    action,
                    amount: localized(`${amount} 积分`, `${amount} points`),
                    net: localizedNet(row.cost, row.reward),
                    result: localized(
                        `好牌${displayValue(row.good_count, '0')}，坏牌${displayValue(row.bad_count, '0')}`,
                        `Good ${displayValue(row.good_count, '0')}, Bad ${displayValue(row.bad_count, '0')}`
                    )
                };
            }
        },
        admin: {
            listSql: `
                SELECT id, action_type, COALESCE(cost, 0) AS cost, COALESCE(reward, 0) AS reward,
                       card_index, card_type, good_count, bad_count, ended,
                       to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS played_at
                FROM flip_logs
                WHERE username = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
            `,
            columns: [
                column('playedAt', '时间', 'Time'),
                column('action', '动作', 'Action'),
                column('cost', '消耗', 'Cost'),
                column('reward', '奖励', 'Reward'),
                column('flipped', '翻开', 'Flipped'),
                column('goodBad', '好/坏', 'Good/Bad'),
                column('ended', '结束', 'Ended')
            ],
            mapRow: (row) => ({
                playedAt: row.played_at,
                action: row.action_type,
                cost: row.cost,
                reward: row.reward,
                flipped: `${displayValue(row.card_index)} / ${displayValue(row.card_type)}`,
                goodBad: `${displayValue(row.good_count)}/${displayValue(row.bad_count)}`,
                ended: localized(row.ended ? '是' : '否', row.ended ? 'Yes' : 'No')
            })
        }
    }),
    duel: defineProvider({
        listSql: `
            SELECT id, gift_type, COALESCE(reward, 0) AS reward, power, cost, success,
                   to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS played_at
            FROM duel_logs
            WHERE username = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `,
        countSql: 'SELECT COUNT(*) FROM duel_logs WHERE username = $1',
        summarySql: 'SELECT COUNT(*) AS count FROM duel_logs WHERE username = $1',
        mapSummary: (row) => ({ total: Number.parseInt(row.count, 10) || 0 }),
        latestSql: `
            SELECT DISTINCT ON (username) username, gift_type, success, COALESCE(reward, 0) AS reward,
                   to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS played_at
            FROM duel_logs
            WHERE username = ANY($1::text[])
            ORDER BY username, created_at DESC
        `,
        mapLatest: (row) => {
            const gift = displayValue(row.gift_type, '礼物');
            return localized(
                `${row.played_at} | ${gift} | ${row.success ? '成功' : '失败'} | ${displayValue(row.reward, '0')}积分`,
                `${row.played_at} | ${gift} | ${row.success ? 'Success' : 'Failed'} | ${displayValue(row.reward, '0')} points`
            );
        },
        profile: {
            columns: [
                column('playedAt', '挑战时间', 'Challenge Time'),
                column('gift', '礼物', 'Gift'),
                column('power', '功力', 'Power'),
                column('cost', '消耗', 'Cost'),
                column('result', '结果', 'Result'),
                column('net', '本次盈亏', 'Win / Loss')
            ],
            mapRow: (row) => {
                const reward = DUEL_CONFIG.rewards[row.gift_type];
                const rewardValue = displayValue(reward?.reward, displayValue(row.reward, '0'));
                return {
                    playedAt: row.played_at,
                    gift: localized(
                        `${reward?.name || displayValue(row.gift_type)} ${rewardValue}`,
                        `${reward?.nameEn || displayValue(row.gift_type)} ${rewardValue}`
                    ),
                    power: `${displayValue(row.power, '0')}%`,
                    cost: `-${displayValue(row.cost, '0')}`,
                    result: row.success
                        ? localized(
                            `成功 +${displayValue(row.reward, '0')}`,
                            `Success +${displayValue(row.reward, '0')}`
                        )
                        : localized('失败', 'Failed'),
                    net: localizedNet(row.cost, row.reward)
                };
            }
        },
        admin: {
            columns: [
                column('playedAt', '时间', 'Time'),
                column('gift', '礼物', 'Gift'),
                column('power', '功力', 'Power'),
                column('cost', '消耗', 'Cost'),
                column('result', '结果', 'Result'),
                column('reward', '奖励', 'Reward')
            ],
            mapRow: (row) => ({
                playedAt: row.played_at,
                gift: row.gift_type,
                power: `${displayValue(row.power, '0')}%`,
                cost: row.cost,
                result: localized(row.success ? '成功' : '失败', row.success ? 'Success' : 'Failed'),
                reward: row.reward
            })
        }
    })
});

if (STONE_CONFIG.colors.some((color) => !Object.hasOwn(STONE_COLOR_NAMES, color))) {
    throw new Error('Stone record color presentation is incomplete');
}

const RECORD_VIEWS = Object.freeze(Object.fromEntries(Object.entries(PROVIDERS).map(
    ([recordView, provider]) => [recordView, Object.freeze({
        headersZh: Object.freeze(provider.profile.columns.map((descriptor) => descriptor.labelZh)),
        headersEn: Object.freeze(provider.profile.columns.map((descriptor) => descriptor.labelEn))
    })]
)));

function getRecordProvider(gameType) {
    return typeof gameType === 'string' && Object.hasOwn(PROVIDERS, gameType)
        ? PROVIDERS[gameType]
        : null;
}

function buildProfileRecordRows(recordView, rawRows) {
    const provider = getRecordProvider(recordView);
    if (!provider || !Array.isArray(rawRows)) {
        throw new TypeError(`Cannot build profile record rows: ${recordView || 'unknown'}`);
    }
    const keys = provider.profile.columns.map((descriptor) => descriptor.key);
    return rawRows.map((row) => {
        const mapped = provider.profile.mapRow(row) || {};
        return {
            id: row.id ?? null,
            cells: keys.map((key) => ({ key, ...normalizeLocalizedValue(mapped[key]) }))
        };
    });
}

function resolveRecordGames(gameDefinitions) {
    if (!Array.isArray(gameDefinitions)) throw new TypeError('Game definitions must be an array');
    const seenRecordViews = new Set();
    const games = [];
    for (const definition of gameDefinitions) {
        const recordView = definition?.recordView;
        if (recordView === null || recordView === undefined) continue;
        if (typeof recordView !== 'string' || !getRecordProvider(recordView)) {
            throw new Error(`Game has no record provider: ${definition?.id || 'unknown'}:${recordView}`);
        }
        if (seenRecordViews.has(recordView)) {
            throw new Error(`Game record provider is assigned more than once: ${recordView}`);
        }
        seenRecordViews.add(recordView);
        games.push(Object.freeze({
            id: String(definition.id || recordView),
            recordView,
            titleZh: String(definition.titleZh || definition.id || recordView),
            titleEn: String(definition.titleEn || definition.id || recordView)
        }));
    }
    return Object.freeze(games);
}

async function loadProfileStats(pool, username) {
    const entries = Object.entries(PROVIDERS);
    const results = await Promise.all(entries.map(([, provider]) => (
        pool.query(provider.summarySql, [username])
    )));
    return Object.fromEntries(entries.map(([gameType, provider], index) => [
        gameType,
        provider.mapSummary(results[index].rows[0] || {})
    ]));
}

async function loadGameRecords(pool, { gameType, username, limit, offset }) {
    const provider = getRecordProvider(gameType);
    if (!provider) return null;
    const [records, countResult] = await Promise.all([
        pool.query(provider.listSql, [username, limit, offset]),
        pool.query(provider.countSql, [username])
    ]);
    return {
        records: records.rows,
        recordRows: buildProfileRecordRows(gameType, records.rows),
        total: Number.parseInt(countResult.rows[0]?.count, 10) || 0
    };
}

async function loadLatestRecords(pool, { usernames, gameDefinitions }) {
    const games = resolveRecordGames(gameDefinitions);
    const uniqueUsernames = [...new Set(
        Array.isArray(usernames) ? usernames.filter((value) => typeof value === 'string') : []
    )];
    const byUsername = Object.fromEntries(uniqueUsernames.map((username) => [
        username,
        Object.fromEntries(games.map((game) => [game.recordView, localized('-', '-')]))
    ]));
    if (uniqueUsernames.length === 0 || games.length === 0) return { games, byUsername };

    const results = await Promise.all(games.map((game) => (
        pool.query(getRecordProvider(game.recordView).latestSql, [uniqueUsernames])
    )));
    games.forEach((game, index) => {
        const provider = getRecordProvider(game.recordView);
        for (const row of results[index].rows) {
            if (!Object.hasOwn(byUsername, row.username)) continue;
            byUsername[row.username][game.recordView] = normalizeLocalizedValue(provider.mapLatest(row));
        }
    });
    return { games, byUsername };
}

function buildAdminRecordSection(game, rawRows) {
    const provider = getRecordProvider(game?.recordView);
    if (!provider || !Array.isArray(rawRows)) {
        throw new TypeError(`Cannot build admin record section: ${game?.recordView || 'unknown'}`);
    }
    const columns = provider.admin.columns.map((descriptor) => ({ ...descriptor }));
    const rows = rawRows.map((row) => {
        const mapped = provider.admin.mapRow(row) || {};
        return {
            id: row.id ?? null,
            cells: columns.map((descriptor) => ({
                key: descriptor.key,
                ...normalizeLocalizedValue(mapped[descriptor.key])
            }))
        };
    });
    return {
        gameId: game.id,
        recordView: game.recordView,
        titleZh: game.titleZh,
        titleEn: game.titleEn,
        columns,
        rows
    };
}

async function loadAdminRecordSections(pool, { username, gameDefinitions, limit = 200 }) {
    const games = resolveRecordGames(gameDefinitions);
    const normalizedLimit = Number.isSafeInteger(limit)
        ? Math.min(ADMIN_RECORD_LIMIT_MAX, Math.max(1, limit))
        : 200;
    const results = await Promise.all(games.map((game) => {
        const provider = getRecordProvider(game.recordView);
        return pool.query(provider.admin.listSql, [username, normalizedLimit, 0]);
    }));

    return games.map((game, index) => buildAdminRecordSection(game, results[index].rows));
}

module.exports = {
    ADMIN_RECORD_LIMIT_MAX,
    PROVIDERS,
    RECORD_VIEWS,
    buildAdminRecordSection,
    buildProfileRecordRows,
    getRecordProvider,
    loadAdminRecordSections,
    loadGameRecords,
    loadLatestRecords,
    loadProfileStats,
    resolveRecordGames
};
