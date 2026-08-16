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
        gameNet: parseMoney(row.game_net || 0, 'lifetime game net'),
        adminEarned: parseMoney(row.admin_earned || 0, 'lifetime admin earnings', { min: 0 }),
        taskEarned: parseMoney(row.task_earned || 0, 'lifetime task earnings', { min: 0 }),
        giftValue: parseMoney(row.gift_value || 0, 'lifetime gift value', { min: 0 }),
        total: parseMoney(row.lifetime_earnings || 0, 'lifetime earnings')
    };
}

module.exports = { GAME_OPERATIONS, getLifetimeEarnings };
