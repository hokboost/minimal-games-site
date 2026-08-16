'use strict';

const { parseMoney } = require('./integer-money');

const GAME_OPERATIONS = Object.freeze([
    'quiz_start', 'quiz_reward',
    'slot_bet', 'slot_win',
    'scratch_bet', 'scratch_win',
    'stone_add', 'stone_fill', 'stone_replace', 'stone_reward',
    'flip_card', 'flip_reward', 'flip_cashout',
    'blindbox_open',
    'duel_bet', 'duel_win',
    'wish_bet', 'wish_bet_batch'
]);

function parseAggregateMoney(value, label, options = {}) {
    let normalized = value;
    if (typeof value === 'string') {
        const scaledInteger = value.match(/^(-?\d+)\.0+$/);
        if (scaledInteger) normalized = scaledInteger[1];
    }
    return parseMoney(normalized || 0, label, options);
}

async function getLifetimeEarnings(pool, username) {
    const result = await pool.query(`
        WITH ledger AS (
            SELECT
                COALESCE(SUM(amount) FILTER (
                    WHERE operation_type = ANY($2::text[])
                ), 0) AS game_net,
                COALESCE(SUM(GREATEST(amount, 0)) FILTER (
                    WHERE operation_type IN ('admin_add', 'admin_balance_adjustment')
                ), 0) AS admin_earned,
                COALESCE(SUM(amount) FILTER (
                    WHERE operation_type IN ('task_card_reward', 'event_task_reward')
                ), 0) AS task_earned
            FROM balance_logs
            WHERE username = $1
        ), inventory_value AS (
            SELECT
                COALESCE((SELECT SUM(total_reward_value) FROM wish_sessions WHERE username = $1), 0)
                + COALESCE((SELECT SUM(total_reward_value) FROM blindbox_logs WHERE username = $1), 0)
                AS gift_value
        )
        SELECT game_net, admin_earned, task_earned, gift_value,
               game_net + admin_earned + task_earned + gift_value AS lifetime_earnings
        FROM ledger CROSS JOIN inventory_value
    `, [username, GAME_OPERATIONS]);
    const row = result.rows[0] || {};
    return {
        gameNet: parseAggregateMoney(row.game_net, 'lifetime game net'),
        adminEarned: parseAggregateMoney(row.admin_earned, 'lifetime admin earnings', { min: 0 }),
        taskEarned: parseAggregateMoney(row.task_earned, 'lifetime task earnings', { min: 0 }),
        giftValue: parseAggregateMoney(row.gift_value, 'lifetime gift value', { min: 0 }),
        total: parseAggregateMoney(row.lifetime_earnings, 'lifetime earnings')
    };
}

module.exports = { GAME_OPERATIONS, getLifetimeEarnings, parseAggregateMoney };
