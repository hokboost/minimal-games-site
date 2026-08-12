'use strict';

const { parseInteger } = require('./integer-money');

async function queueMissingPkRunners(client, { limit = 20 } = {}) {
    const safeLimit = parseInteger(limit, 'PK recovery limit', { min: 1, max: 100 });
    const result = await client.query(`
        WITH candidates AS (
            SELECT control.username
            FROM pk_control_state AS control
            JOIN users AS account ON account.username = control.username
            LEFT JOIN pk_runner_state AS runner ON runner.username = control.username
            WHERE control.desired_running = TRUE
              AND control.room_id IS NOT NULL
              AND control.updated_at <= NOW() - INTERVAL '30 seconds'
              AND account.authorized = TRUE
              AND account.deactivated = FALSE
              AND account.bilibili_room_id = control.room_id
              AND (
                  runner.username IS NULL
                  OR runner.running IS NOT TRUE
                  OR runner.lease_expires_at IS NULL
                  OR runner.lease_expires_at <= NOW()
                  OR runner.command_generation IS DISTINCT FROM control.command_generation
                  OR runner.room_id IS DISTINCT FROM control.room_id
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM pk_tasks AS active
                  WHERE active.username = control.username
                    AND active.command_generation = control.command_generation
                    AND active.status IN ('pending', 'claimed', 'processing')
              )
            ORDER BY control.updated_at, control.username
            FOR UPDATE OF control SKIP LOCKED
            LIMIT $1
        ), advanced AS (
            UPDATE pk_control_state AS control
            SET command_generation = control.command_generation + 1,
                updated_at = NOW()
            FROM candidates
            WHERE control.username = candidates.username
            RETURNING control.username, control.room_id, control.command_generation
        ), superseded AS (
            UPDATE pk_tasks AS task
            SET status = 'superseded',
                processed_at = NOW(),
                error = '运行租约失效，由自动恢复指令替代'
            FROM advanced
            WHERE task.username = advanced.username
              AND task.status IN ('pending', 'claimed', 'processing', 'uncertain')
              AND (task.command_generation IS NULL
                   OR task.command_generation < advanced.command_generation)
            RETURNING task.id
        )
        INSERT INTO pk_tasks (
            username, room_id, action, status, command_generation, error
        )
        SELECT username, room_id, 'start', 'pending', command_generation,
               'PK运行租约失效，等待自动恢复'
        FROM advanced
        RETURNING id, username, room_id, command_generation
    `, [safeLimit]);
    return result.rows;
}

module.exports = { queueMissingPkRunners };
