module.exports = function registerGiftRoutes(app, deps) {
    const crypto = require('crypto');
    const requireFunction = require('../lib/require-function');
    const { multiplyMoney, parseInteger, parseMoney } = require('../lib/integer-money');
    const {
        computeTicketCount,
        createSpendHash,
        normalizeGiftItems
    } = require('../lib/pk-spend');
    const { queueMissingPkRunners } = require('../lib/pk-runner-recovery');
    const {
        acquireWorkerRoleLease,
        releaseWorkerRoleLease
    } = require('../lib/worker-role-lease');
    const {
        pool,
        giftConfig,
        BalanceLogger,
        requireLogin,
        requireAuthorized,
        requireCSRF,
        requireApiKey,
        requireActiveWorkerLease,
        security,
        generateCSRFToken,
        enqueueWishInventorySend,
        paidActionConcurrencyGuard
    } = deps;
    const basicRateLimit = requireFunction(security, 'basicRateLimit', 'security middleware');
    const readHeavyRateLimit = requireFunction(security, 'readHeavyRateLimit', 'security middleware');
    const userActionRateLimit = requireFunction(security, 'userActionRateLimit', 'security middleware');
    const rejectWhenOverloaded = requireFunction(
        { paidActionConcurrencyGuard },
        'paidActionConcurrencyGuard',
        'route dependency'
    );
    const workerApiKeyGuard = requireFunction(
        { requireApiKey },
        'requireApiKey',
        'route dependency'
    );
    const activeWorkerGuard = requireFunction(
        { requireActiveWorkerLease },
        'requireActiveWorkerLease',
        'route dependency'
    );
    const workerGuards = [workerApiKeyGuard, activeWorkerGuard];
    const redeemableGiftTypes = new Set(['heartbox', 'fanlight', 'tiedu_one']);

    function calculateDeliveredCost(totalCost, deliveredQuantity, requestedQuantity) {
        if (!Number.isSafeInteger(totalCost) || totalCost < 0
            || !Number.isSafeInteger(deliveredQuantity) || deliveredQuantity < 0
            || !Number.isSafeInteger(requestedQuantity) || requestedQuantity < 1
            || deliveredQuantity > requestedQuantity) {
            throw new Error('Invalid gift settlement values');
        }
        return Number((BigInt(totalCost) * BigInt(deliveredQuantity)) / BigInt(requestedQuantity));
    }

    function parseClaimGeneration(value) {
        try {
            return parseInteger(value, 'claim generation', { min: 1 });
        } catch {
            return null;
        }
    }

    const terminalInventoryEnqueueMessages = new Set([
        '背包物品不存在',
        '该物品已处理',
        '未绑定房间号，暂不送出',
        '请先绑定B站房间号再送出礼物'
    ]);

    function shouldRetryInventoryEnqueue(result) {
        return result?.success !== true
            && !terminalInventoryEnqueueMessages.has(String(result?.message || ''));
    }

    async function enqueueNextStoredBlindbox(username, completedExchangeId) {
        if (!enqueueWishInventorySend || !username) return;

        const completedItem = await pool.query(`
            SELECT source_batch_id
            FROM wish_inventory
            WHERE gift_exchange_id = $1 AND username = $2 AND source_type = 'blindbox'
            LIMIT 1
        `, [completedExchangeId, username]);
        const preferredBatchId = completedItem.rows[0]?.source_batch_id || null;
        const nextItem = await pool.query(`
            SELECT id
            FROM wish_inventory
            WHERE username = $1
              AND source_type = 'blindbox'
              AND status = 'stored'
            ORDER BY
              CASE WHEN source_batch_id = $2 THEN 0 ELSE 1 END,
              created_at ASC,
              batch_order ASC
            LIMIT 1
        `, [username, preferredBatchId]);
        if (!nextItem.rows[0]) return;

        const enqueueResult = await enqueueWishInventorySend({
            inventoryId: nextItem.rows[0].id,
            username
        });
        if (shouldRetryInventoryEnqueue(enqueueResult)) {
            throw new Error(enqueueResult.message);
        }
    }

    let deliveryOutboxRunning = false;
    async function processDeliveryOutbox() {
        if (deliveryOutboxRunning) return;
        deliveryOutboxRunning = true;
        let claimedEvent = null;
        const claimToken = crypto.randomBytes(24).toString('hex');
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            await client.query(`
                UPDATE delivery_outbox
                SET status = 'pending', claim_token = NULL, lease_expires_at = NULL
                WHERE status = 'processing' AND lease_expires_at < NOW()
            `);
            const claim = await client.query(`
                WITH next_event AS (
                    SELECT id
                    FROM delivery_outbox
                    WHERE status = 'pending' AND next_attempt_at <= NOW()
                    ORDER BY next_attempt_at, id
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                )
                UPDATE delivery_outbox AS event
                SET status = 'processing',
                    claim_token = $1,
                    lease_expires_at = NOW() + INTERVAL '1 minute',
                    attempt_count = event.attempt_count + 1
                FROM next_event
                WHERE event.id = next_event.id
                RETURNING event.id, event.event_type, event.aggregate_id,
                          event.payload, event.attempt_count
            `, [claimToken]);
            claimedEvent = claim.rows[0] || null;
            await client.query('COMMIT');
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('礼物续接 outbox 领取失败');
            deliveryOutboxRunning = false;
            return;
        } finally {
            client?.release();
        }

        if (!claimedEvent) {
            deliveryOutboxRunning = false;
            return;
        }
        try {
            const username = String(claimedEvent.payload?.username || '');
            if (!username) throw new Error('Delivery outbox payload is invalid');
            if (claimedEvent.event_type === 'enqueue_next_blindbox') {
                await enqueueNextStoredBlindbox(username, claimedEvent.aggregate_id);
            } else if (claimedEvent.event_type === 'enqueue_inventory') {
                const enqueueResult = await enqueueWishInventorySend({
                    inventoryId: claimedEvent.aggregate_id,
                    username,
                    isAuto: true
                });
                if (shouldRetryInventoryEnqueue(enqueueResult)) {
                    throw new Error('Inventory enqueue is not ready');
                }
            } else {
                throw new Error('Unsupported delivery outbox event');
            }
            const completed = await pool.query(`
                UPDATE delivery_outbox
                SET status = 'completed', completed_at = NOW(),
                    claim_token = NULL, lease_expires_at = NULL, last_error = NULL
                WHERE id = $1 AND status = 'processing' AND claim_token = $2
            `, [claimedEvent.id, claimToken]);
            if (completed.rowCount !== 1) {
                throw new Error('Delivery outbox lease expired before completion');
            }
        } catch (error) {
            const attempts = Number(claimedEvent.attempt_count) || 1;
            const deadLetter = attempts >= 20;
            const retrySeconds = Math.min(3600, 2 ** Math.min(attempts, 11));
            await pool.query(`
                UPDATE delivery_outbox
                SET status = $3,
                    claim_token = NULL,
                    lease_expires_at = NULL,
                    next_attempt_at = NOW() + make_interval(secs => $4),
                    last_error = $5
                WHERE id = $1 AND status = 'processing' AND claim_token = $2
            `, [
                claimedEvent.id,
                claimToken,
                deadLetter ? 'dead_letter' : 'pending',
                retrySeconds,
                String(error.message || 'Delivery continuation failed').slice(0, 500)
            ]).catch(() => {});
            console.error('礼物续接 outbox 执行失败');
        } finally {
            deliveryOutboxRunning = false;
        }
    }

    // Lease cleanup is leader-elected. Only tasks proven not to have started an
    // external send may be refunded automatically.
    const monitorStuckGiftTasks = () => {
        const INTERVAL_MS = 10 * 60 * 1000;
        const run = async () => {
            let leaderClient;
            let leader = false;
            try {
                leaderClient = await pool.connect();
                const lock = await leaderClient.query(`
                    SELECT pg_try_advisory_lock(
                        hashtextextended('gift_delivery_maintenance', 0)
                    ) AS locked
                `);
                leader = lock.rows[0]?.locked === true;
                if (!leader) return;

                await leaderClient.query(`
                    UPDATE gift_exchanges
                    SET delivery_status = 'pending', claim_token = NULL, worker_id = NULL,
                        lease_expires_at = NULL,
                        failure_reason = '领取租约过期，尚未开始外部发送',
                        updated_at = NOW()
                    WHERE status = 'funds_locked'
                      AND delivery_status = 'claimed'
                      AND started_at IS NULL
                      AND lease_expires_at < NOW()
                `);
                await leaderClient.query(`
                    UPDATE gift_exchanges
                    SET delivery_status = 'uncertain',
                        failure_reason = '外部发送已开始但租约超时，结果需要对账',
                        lease_expires_at = NOW(), updated_at = NOW()
                    WHERE status = 'funds_locked'
                      AND delivery_status = 'processing'
                      AND lease_expires_at < NOW()
                `);
                const stuckTasks = await leaderClient.query(`
                    SELECT id
                    FROM gift_exchanges
                    WHERE status = 'funds_locked'
                      AND delivery_status = 'pending'
                      AND started_at IS NULL
                      AND created_at < NOW() - INTERVAL '30 minutes'
                    ORDER BY created_at
                    LIMIT 20
                `);

                for (const task of stuckTasks.rows) {
                    const client = await pool.connect();
                    try {
                        await client.query('BEGIN');
                        const lockedResult = await client.query(`
                            SELECT username, gift_name, cost, claim_generation
                            FROM gift_exchanges
                            WHERE id = $1
                              AND status = 'funds_locked'
                              AND delivery_status = 'pending'
                              AND started_at IS NULL
                              AND created_at < NOW() - INTERVAL '30 minutes'
                            FOR UPDATE
                        `, [task.id]);
                        if (lockedResult.rows.length === 0) {
                            await client.query('ROLLBACK');
                            continue;
                        }
                        const lockedTask = lockedResult.rows[0];
                        const refundAmount = parseMoney(lockedTask.cost, 'pending gift cost', { min: 0 });
                        if (refundAmount > 0) {
                            const refund = await BalanceLogger.updateBalance({
                                username: lockedTask.username,
                                amount: refundAmount,
                                operationType: 'gift_timeout_refund',
                                description: `未开始发送的礼物任务超时退款: ${refundAmount} 积分`,
                                gameData: { taskId: task.id, reason: 'never_started_timeout' },
                                requireSufficientBalance: false,
                                client,
                                managedTransaction: true
                            });
                            if (!refund.success) throw new Error('Pending gift refund failed');
                        }
                        const timedOut = await client.query(
                            `UPDATE gift_exchanges 
                             SET status = 'failed', delivery_status = 'timeout',
                                 failure_reason = '任务在外部发送开始前超时',
                                 processed_at = NOW(), updated_at = NOW()
                             WHERE id = $1
                               AND status = 'funds_locked'
                               AND delivery_status = 'pending'
                               AND started_at IS NULL
                             RETURNING id`,
                            [task.id]
                        );
                        if (timedOut.rowCount !== 1) {
                            throw new Error('Pending gift timeout state changed concurrently');
                        }
                        await client.query(`
                            INSERT INTO gift_delivery_events (
                                gift_exchange_id, event_type, claim_generation, details
                            ) VALUES ($1, 'delivery_not_started_timeout', $2, $3)
                            ON CONFLICT (gift_exchange_id, event_type, claim_generation) DO NOTHING
                        `, [
                            task.id,
                            Number(lockedTask.claim_generation) || 0,
                            JSON.stringify({ refundAmount })
                        ]);
                        await client.query(`
                            UPDATE wish_inventory
                            SET status = 'stored',
                                gift_exchange_id = NULL,
                                last_failure_reason = '发送任务在领取前超时',
                                expires_at = ((date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai')
                                    + interval '1 day 23 hours 59 minutes 59 seconds') AT TIME ZONE 'Asia/Shanghai'),
                                updated_at = NOW()
                            WHERE gift_exchange_id = $1
                        `, [task.id]);
                        await client.query('COMMIT');
                    } catch (err) {
                        try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
                        console.error('自动处理未开始礼物任务失败');
                    } finally {
                        client.release();
                    }
                }
            } catch (err) {
                console.error('扫描卡住礼物任务失败');
            } finally {
                if (leaderClient) {
                    if (leader) {
                        await leaderClient.query(`
                            SELECT pg_advisory_unlock(
                                hashtextextended('gift_delivery_maintenance', 0)
                            )
                        `).catch(() => {});
                    }
                    leaderClient.release();
                }
            }
        };
        const initial = setTimeout(() => run().catch(() => {}), 30000);
        initial.unref?.();
        const interval = setInterval(() => run().catch(() => {}), INTERVAL_MS);
        interval.unref?.();
    };

    // 礼物兑换页面
    app.get('/gifts', requireLogin, requireAuthorized, async (req, res) => {
        try {
            if (!req.session.initialized) {
                req.session.initialized = true;
                req.session.createdAt = Date.now();
                generateCSRFToken(req);
            }
            const username = req.session.user.username;
            const userResult = await pool.query(
                'SELECT balance FROM users WHERE username = $1',
                [username]
            );
            if (userResult.rows.length !== 1) {
                return res.status(404).send('用户不存在');
            }
            const balance = parseMoney(userResult.rows[0].balance, 'user balance', { min: 0 });

            res.render('gifts', {
                title: '礼物兑换 - Minimal Games',
                user: req.session.user,
                balance: balance,
                csrfToken: req.session.csrfToken
            });

        } catch (err) {
            console.error(err);
            res.status(503).send('余额服务暂不可用');
        }
    });

    app.post('/api/workers/heartbeat', workerApiKeyGuard, async (req, res) => {
        let client;
        try {
            const workerType = String(req.body?.workerType || '');
            const version = String(req.body?.version || '');
            const protocolVersion = Number(req.body?.protocolVersion);
            const capabilities = req.body?.capabilities;
            if (!/^[a-z0-9_-]{2,50}$/i.test(workerType)
                || !/^[A-Za-z0-9._+-]{1,50}$/.test(version)
                || !Number.isSafeInteger(protocolVersion) || protocolVersion < 1
                || !Array.isArray(capabilities) || capabilities.length > 20
                || capabilities.some((item) => !/^[a-z0-9_-]{1,50}$/i.test(String(item)))) {
                return res.status(400).json({ success: false, message: '工作器信息无效' });
            }
            client = await pool.connect();
            await client.query('BEGIN');
            const lease = await acquireWorkerRoleLease(client, {
                role: 'gift-pk',
                workerId: req.workerId,
                ttlSeconds: 90
            });
            if (!lease) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    success: false,
                    message: '另一个工作器实例仍持有活动租约',
                    code: 'WORKER_LEASE_HELD'
                });
            }
            await client.query(`
                UPDATE worker_heartbeats
                SET status = 'offline'
                WHERE worker_type = 'gift-pk'
                  AND worker_id <> $1
                  AND status = 'online'
            `, [req.workerId]);
            await client.query(`
                INSERT INTO worker_heartbeats (
                    worker_id, worker_type, version, protocol_version,
                    status, metadata, started_at, last_seen_at
                ) VALUES ($1, $2, $3, $4, 'online', $5, NOW(), NOW())
                ON CONFLICT (worker_id) DO UPDATE
                SET worker_type = EXCLUDED.worker_type,
                    version = EXCLUDED.version,
                    protocol_version = EXCLUDED.protocol_version,
                    status = 'online',
                    metadata = EXCLUDED.metadata,
                    last_seen_at = NOW()
            `, [
                req.workerId,
                workerType,
                version,
                protocolVersion,
                JSON.stringify({
                    capabilities: capabilities.map(String),
                    leaseGeneration: Number(lease.lease_generation)
                })
            ]);
            await client.query('COMMIT');
            return res.json({
                success: true,
                serverTime: new Date().toISOString(),
                leaseGeneration: Number(lease.lease_generation),
                leaseExpiresAt: lease.lease_expires_at
            });
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('工作器心跳写入失败');
            return res.status(503).json({ success: false, message: '工作器状态服务暂不可用' });
        } finally {
            client?.release();
        }
    });

    app.post('/api/workers/drain', ...workerGuards, async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            await client.query(
                "SELECT pg_advisory_xact_lock(hashtextextended('bilibili-provider-send', 0))"
            );
            await client.query(`
                UPDATE gift_exchanges
                SET delivery_status = 'pending', claim_token = NULL, worker_id = NULL,
                    lease_expires_at = NULL, failure_reason = '工作器在发送前关机',
                    updated_at = NOW()
                WHERE status = 'funds_locked' AND delivery_status = 'claimed'
                  AND started_at IS NULL AND worker_id = $1
            `, [req.workerId]);
            await client.query(`
                UPDATE gift_exchanges
                SET delivery_status = 'uncertain', lease_expires_at = NOW(),
                    failure_reason = '工作器关机，外部发送结果需要对账',
                    updated_at = NOW()
                WHERE status = 'funds_locked' AND delivery_status = 'processing'
                  AND worker_id = $1
            `, [req.workerId]);
            await client.query(`
                UPDATE pk_tasks
                SET status = 'pending', claim_token = NULL, worker_id = NULL,
                    lease_expires_at = NULL, started_at = NULL,
                    error = '工作器在执行前关机'
                WHERE status = 'claimed' AND started_at IS NULL AND worker_id = $1
            `, [req.workerId]);
            await client.query(`
                UPDATE pk_tasks
                SET status = 'uncertain', lease_expires_at = NOW(), processed_at = NOW(),
                    error = '工作器关机，执行结果需要重建'
                WHERE status = 'processing' AND worker_id = $1
            `, [req.workerId]);
            const drainedRunners = await client.query(`
                UPDATE pk_runner_state
                SET running = FALSE, pid = NULL, lease_expires_at = NOW(), updated_at = NOW()
                WHERE worker_id = $1
                RETURNING username
            `, [req.workerId]);
            const usernames = drainedRunners.rows.map((row) => row.username);
            if (usernames.length > 0) {
                await client.query(`
                    WITH advanced AS (
                        UPDATE pk_control_state
                        SET command_generation = command_generation + 1,
                            updated_at = NOW()
                        WHERE desired_running = TRUE
                          AND username = ANY($1::varchar[])
                        RETURNING username, room_id, command_generation
                    ), superseded AS (
                        UPDATE pk_tasks AS task
                        SET status = 'superseded', processed_at = NOW(),
                            error = '工作器安全停机，由重建指令替代'
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
                    SELECT advanced.username, advanced.room_id, 'start', 'pending',
                           advanced.command_generation, '工作器安全停机，等待重建运行进程'
                    FROM advanced
                `, [usernames]);
            }
            await client.query(`
                INSERT INTO worker_heartbeats (
                    worker_id, worker_type, protocol_version, status, last_seen_at
                ) VALUES ($1, 'gift-pk', 4, 'draining', NOW())
                ON CONFLICT (worker_id) DO UPDATE
                SET status = 'draining', last_seen_at = NOW()
            `, [req.workerId]);
            await releaseWorkerRoleLease(client, {
                role: 'gift-pk',
                workerId: req.workerId
            });
            await client.query('COMMIT');
            return res.json({ success: true });
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('工作器停机状态处理失败');
            return res.status(503).json({ success: false, message: '工作器状态服务暂不可用' });
        } finally {
            client?.release();
        }
    });

    app.get('/api/pk/status', requireLogin, requireAuthorized, readHeavyRateLimit, async (req, res) => {
        try {
            const username = req.session.user.username;
            const statusResult = await pool.query(`
                SELECT COALESCE(
                           state.running = TRUE
                           AND state.lease_expires_at > NOW()
                           AND state.command_generation = control.command_generation
                           AND state.room_id = control.room_id
                           AND control.room_id = account.bilibili_room_id,
                           FALSE
                       ) AS running,
                       COALESCE(
                           control.desired_running = TRUE
                           AND control.room_id = account.bilibili_room_id,
                           FALSE
                       ) AS desired_running,
                       control.command_generation,
                       active_task.action,
                       active_task.status
                FROM (SELECT $1::varchar AS username) AS requested
                LEFT JOIN users AS account ON account.username = requested.username
                LEFT JOIN pk_runner_state AS state ON state.username = requested.username
                LEFT JOIN pk_control_state AS control ON control.username = requested.username
                LEFT JOIN LATERAL (
                    SELECT action, status
                    FROM pk_tasks
                    WHERE username = requested.username
                      AND command_generation = control.command_generation
                      AND status IN ('pending', 'claimed', 'processing', 'uncertain')
                    ORDER BY command_generation DESC, id DESC
                    LIMIT 1
                ) AS active_task ON TRUE
            `, [username]);
            const activeTask = statusResult.rows[0] || {};
            const running = activeTask.running === true;
            const transition = activeTask?.action === 'start' || activeTask?.action === 'stop'
                ? activeTask.action
                : null;
            const desiredRunning = activeTask.desired_running === true;
            res.set('Cache-Control', 'no-store');
            res.json({
                success: true,
                running,
                desiredRunning,
                transition,
                transitionStatus: activeTask?.status || null,
                generation: activeTask.command_generation || null
            });
        } catch (error) {
            console.error('PK status error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.post('/api/pk/start', requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, requireCSRF, async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            const username = req.session.user.username;
            await client.query('BEGIN');
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`pk:${username}`]);
            const roomResult = await client.query(
                'SELECT bilibili_room_id FROM users WHERE username = $1',
                [username]
            );
            const roomId = roomResult.rows[0]?.bilibili_room_id;
            if (!roomId) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '请先绑定B站房间号' });
            }
            const currentStateResult = await client.query(`
                SELECT control.command_generation, control.desired_running, control.room_id,
                       COALESCE(
                           runner.running = TRUE
                           AND runner.lease_expires_at > NOW()
                           AND runner.command_generation = control.command_generation,
                           FALSE
                       ) AS runner_running,
                       COALESCE(
                           runner.running = TRUE AND runner.lease_expires_at > NOW(),
                           FALSE
                       ) AS runner_healthy,
                       runner.command_generation AS runner_generation,
                       active_task.action AS task_action,
                       active_task.status AS task_status
                FROM pk_control_state AS control
                LEFT JOIN pk_runner_state AS runner ON runner.username = control.username
                LEFT JOIN LATERAL (
                    SELECT action, status
                    FROM pk_tasks
                    WHERE username = control.username
                      AND command_generation = control.command_generation
                      AND status IN ('pending', 'claimed', 'processing', 'uncertain')
                    ORDER BY id DESC
                    LIMIT 1
                ) AS active_task ON TRUE
                WHERE control.username = $1
                FOR UPDATE OF control
            `, [username]);
            const currentState = currentStateResult.rows[0];
            const currentGeneration = Number(currentState?.command_generation) || null;
            const runnerMatchesGeneration = currentState?.runner_healthy === true
                && Number(currentState?.runner_generation) === currentGeneration;
            const startAlreadyActive = currentState?.task_action === 'start'
                && ['pending', 'claimed', 'processing'].includes(currentState?.task_status);
            if (currentState?.desired_running === true
                && String(currentState.room_id || '') === String(roomId)
                && (runnerMatchesGeneration || startAlreadyActive)) {
                const responseBody = {
                    success: true,
                    queued: startAlreadyActive,
                    running: currentState.runner_running === true,
                    alreadyDesired: true,
                    generation: currentGeneration
                };
                await req.finalizeIdempotency?.(client, 200, responseBody);
                await client.query('COMMIT');
                return res.json(responseBody);
            }
            const control = await client.query(`
                INSERT INTO pk_control_state (
                    username, command_generation, desired_running, room_id, updated_at
                ) VALUES ($1, 1, TRUE, $2, NOW())
                ON CONFLICT (username) DO UPDATE
                SET command_generation = pk_control_state.command_generation + 1,
                    desired_running = TRUE,
                    room_id = EXCLUDED.room_id,
                    updated_at = NOW()
                RETURNING command_generation
            `, [username, String(roomId)]);
            const commandGeneration = Number(control.rows[0].command_generation);
            await client.query(
                `UPDATE pk_tasks
                 SET status = 'superseded', processed_at = NOW(), error = '由较新的启动请求替代'
                 WHERE username = $1
                   AND status IN ('pending', 'claimed', 'processing', 'uncertain')
                   AND (command_generation IS NULL OR command_generation < $2)`,
                [username, commandGeneration]
            );
            await client.query(
                `INSERT INTO pk_tasks (
                    username, room_id, action, status, command_generation
                 ) VALUES ($1, $2, 'start', 'pending', $3)`,
                [username, String(roomId), commandGeneration]
            );
            const responseBody = { success: true, queued: true, generation: commandGeneration };
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            return res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('PK start error:', error);
            return res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    app.post('/api/pk/stop', requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, requireCSRF, async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            const username = req.session.user.username;
            await client.query('BEGIN');
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`pk:${username}`]);
            const currentStateResult = await client.query(`
                SELECT control.command_generation, control.desired_running,
                       COALESCE(
                           runner.running = TRUE
                           AND runner.lease_expires_at > NOW()
                           AND runner.command_generation = control.command_generation,
                           FALSE
                       ) AS runner_running,
                       COALESCE(
                           runner.running = TRUE AND runner.lease_expires_at > NOW(),
                           FALSE
                       ) AS runner_healthy,
                       active_task.action AS task_action,
                       active_task.status AS task_status
                FROM pk_control_state AS control
                LEFT JOIN pk_runner_state AS runner ON runner.username = control.username
                LEFT JOIN LATERAL (
                    SELECT action, status
                    FROM pk_tasks
                    WHERE username = control.username
                      AND command_generation = control.command_generation
                      AND status IN ('pending', 'claimed', 'processing', 'uncertain')
                    ORDER BY id DESC
                    LIMIT 1
                ) AS active_task ON TRUE
                WHERE control.username = $1
                FOR UPDATE OF control
            `, [username]);
            const currentState = currentStateResult.rows[0];
            const stopAlreadyActive = currentState?.task_action === 'stop'
                && ['pending', 'claimed', 'processing'].includes(currentState?.task_status);
            const stopNeedsRecovery = currentState?.task_action === 'stop'
                && currentState?.task_status === 'uncertain';
            if (!currentState || (currentState.desired_running === false
                && !stopNeedsRecovery
                && (stopAlreadyActive || currentState.runner_healthy !== true))) {
                const responseBody = {
                    success: true,
                    queued: stopAlreadyActive,
                    running: currentState?.runner_running === true,
                    alreadyDesired: true,
                    generation: Number(currentState?.command_generation) || null
                };
                await req.finalizeIdempotency?.(client, 200, responseBody);
                await client.query('COMMIT');
                return res.json(responseBody);
            }
            const control = await client.query(`
                INSERT INTO pk_control_state (
                    username, command_generation, desired_running, room_id, updated_at
                ) VALUES ($1, 1, FALSE, NULL, NOW())
                ON CONFLICT (username) DO UPDATE
                SET command_generation = pk_control_state.command_generation + 1,
                    desired_running = FALSE,
                    room_id = NULL,
                    updated_at = NOW()
                RETURNING command_generation
            `, [username]);
            const commandGeneration = Number(control.rows[0].command_generation);
            await client.query(
                `UPDATE pk_tasks
                 SET status = 'superseded', processed_at = NOW(), error = '由较新的停止请求替代'
                 WHERE username = $1
                   AND status IN ('pending', 'claimed', 'processing', 'uncertain')
                   AND (command_generation IS NULL OR command_generation < $2)`,
                [username, commandGeneration]
            );
            await client.query(
                `INSERT INTO pk_tasks (username, action, status, command_generation)
                 VALUES ($1, 'stop', 'pending', $2)`,
                [username, commandGeneration]
            );
            const responseBody = { success: true, queued: true, generation: commandGeneration };
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            return res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('PK stop error:', error);
            return res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    app.post('/api/pk-tasks/claim', ...workerGuards, async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            await client.query(`
                UPDATE pk_tasks AS task
                SET status = 'completed', processed_at = NOW(), lease_expires_at = NOW(),
                    error = '根据工作器运行状态完成回执对账'
                FROM pk_runner_state AS runner, pk_control_state AS control
                WHERE task.status IN ('processing', 'uncertain')
                  AND task.worker_id = runner.worker_id
                  AND task.username = runner.username
                  AND task.command_generation = runner.command_generation
                  AND control.username = task.username
                  AND control.command_generation = task.command_generation
                  AND (
                      (task.action = 'start'
                       AND control.desired_running = TRUE
                       AND runner.running = TRUE
                       AND runner.lease_expires_at > NOW()
                       AND runner.updated_at >= task.started_at + INTERVAL '10 seconds')
                      OR
                      (task.action = 'stop'
                       AND control.desired_running = FALSE
                       AND runner.running = FALSE)
                  )
            `);
            await client.query(`
                UPDATE pk_tasks
                SET status = 'pending', claim_token = NULL, worker_id = NULL,
                    lease_expires_at = NULL,
                    error = '领取租约过期，命令尚未开始执行'
                WHERE status = 'claimed'
                  AND started_at IS NULL
                  AND lease_expires_at < NOW()
                  AND EXISTS (
                      SELECT 1 FROM pk_control_state control
                      WHERE control.username = pk_tasks.username
                        AND control.command_generation = pk_tasks.command_generation
                  )
            `);
            await client.query(`
                UPDATE pk_tasks
                SET status = 'uncertain',
                    error = '任务租约过期，执行结果需要核对',
                    processed_at = NOW()
                WHERE status = 'processing'
                  AND lease_expires_at < NOW()
            `);
            await queueMissingPkRunners(client);

            let result = await client.query(`
                SELECT task.id, task.username, task.room_id, task.action,
                       task.created_at, task.claim_token, task.claim_generation,
                       task.command_generation
                FROM pk_tasks task
                JOIN pk_control_state control
                  ON control.username = task.username
                 AND control.command_generation = task.command_generation
                WHERE task.status = 'claimed'
                  AND task.worker_id = $1
                  AND task.lease_expires_at > NOW()
                ORDER BY task.created_at, task.id
                LIMIT 1
                FOR UPDATE
            `, [req.workerId]);
            if (result.rows.length === 0) {
                result = await client.query(`
                WITH claimed AS (
                    SELECT task.id
                    FROM pk_tasks task
                    JOIN pk_control_state control
                      ON control.username = task.username
                     AND control.command_generation = task.command_generation
                    LEFT JOIN pk_runner_state runner ON runner.username = task.username
                    WHERE task.status = 'pending'
                      AND ((task.action = 'start' AND control.desired_running = TRUE)
                           OR (task.action = 'stop' AND control.desired_running = FALSE))
                      AND (runner.running IS NOT TRUE
                           OR runner.lease_expires_at < NOW()
                           OR runner.worker_id = $2)
                    ORDER BY task.created_at ASC, task.id ASC
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                )
                UPDATE pk_tasks AS task
                SET status = 'claimed',
                    claim_token = $1 || ':' || task.id::text,
                    worker_id = $2,
                    lease_expires_at = NOW() + INTERVAL '1 minute',
                    attempt_count = task.attempt_count + 1,
                    claim_generation = task.claim_generation + 1,
                    error = NULL
                FROM claimed
                WHERE task.id = claimed.id
                RETURNING task.id, task.username, task.room_id, task.action,
                          task.created_at, task.claim_token, task.claim_generation,
                          task.command_generation
            `, [req.requestNonce, req.workerId]);
            }
            await client.query('COMMIT');
            res.json({ success: true, tasks: result.rows });
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('获取PK任务失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    app.post('/api/pk-tasks/:id/start', ...workerGuards, async (req, res) => {
        try {
            const taskId = Number(req.params.id);
            const claimToken = String(req.body?.claimToken || '');
            const claimGeneration = parseClaimGeneration(req.body?.claimGeneration);
            const commandGeneration = Number(req.body?.commandGeneration);
            if (!Number.isSafeInteger(taskId) || taskId < 1 || !claimGeneration
                || !Number.isSafeInteger(commandGeneration) || commandGeneration < 1
                || !/^[A-Za-z0-9._:-]{8,200}$/.test(claimToken)) {
                return res.status(400).json({ success: false, message: 'PK任务租约参数无效' });
            }
            const result = await pool.query(`
                UPDATE pk_tasks AS task
                SET status = 'processing',
                    started_at = COALESCE(task.started_at, NOW()),
                    processed_at = COALESCE(task.processed_at, NOW()),
                    lease_expires_at = NOW() + INTERVAL '2 minutes'
                FROM pk_control_state control
                WHERE task.id = $1
                  AND task.status IN ('claimed', 'processing')
                  AND task.claim_token = $2
                  AND task.worker_id = $3
                  AND task.claim_generation = $4
                  AND task.command_generation = $5
                  AND task.lease_expires_at > NOW()
                  AND control.username = task.username
                  AND control.command_generation = task.command_generation
                  AND ((task.action = 'start' AND control.desired_running = TRUE)
                       OR (task.action = 'stop' AND control.desired_running = FALSE))
                RETURNING task.id
            `, [taskId, claimToken, req.workerId, claimGeneration, commandGeneration]);
            if (result.rows.length === 0) {
                return res.status(409).json({ success: false, message: 'PK指令已被更新或租约已失效' });
            }
            return res.json({ success: true });
        } catch (error) {
            console.error('PK任务执行确认失败');
            return res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.post('/api/pk-tasks/:id/complete', ...workerGuards, async (req, res) => {
        try {
            const taskId = Number(req.params.id);
            const claimToken = String(req.body?.claimToken || '');
            const claimGeneration = parseClaimGeneration(req.body?.claimGeneration);
            const commandGeneration = Number(req.body?.commandGeneration);
            if (!Number.isSafeInteger(taskId) || taskId < 1
                || !claimGeneration
                || !Number.isSafeInteger(commandGeneration) || commandGeneration < 1
                || !/^[A-Za-z0-9._:-]{8,200}$/.test(claimToken)) {
                return res.status(400).json({ success: false, message: 'PK任务租约参数无效' });
            }
            const result = await pool.query(`
                UPDATE pk_tasks AS task
                SET status = 'completed', processed_at = NOW(), lease_expires_at = NOW()
                FROM pk_control_state control
                WHERE task.id = $1
                  AND task.status IN ('processing', 'uncertain')
                  AND task.claim_token = $2
                  AND task.worker_id = $3
                  AND task.claim_generation = $4
                  AND task.command_generation = $5
                  AND control.username = task.username
                  AND control.command_generation = task.command_generation
                  AND ((task.action = 'start' AND control.desired_running = TRUE)
                       OR (task.action = 'stop' AND control.desired_running = FALSE))
                RETURNING task.id
            `, [taskId, claimToken, req.workerId, claimGeneration, commandGeneration]);
            if (result.rows.length === 0) {
                const existing = await pool.query(
                    `SELECT status, claim_token, worker_id, claim_generation, command_generation
                     FROM pk_tasks WHERE id = $1`,
                    [taskId]
                );
                const task = existing.rows[0];
                const ownedAttempt = task?.claim_token === claimToken
                    && task?.worker_id === req.workerId
                    && Number(task?.claim_generation) === claimGeneration
                    && Number(task?.command_generation) === commandGeneration;
                if (ownedAttempt && ['completed', 'superseded'].includes(task.status)) {
                    return res.json({ success: true, message: '任务已完成' });
                }
                if (existing.rows.length > 0) {
                    return res.status(409).json({ success: false, message: '任务状态不允许完成' });
                }
                return res.status(404).json({ success: false, message: '任务不存在' });
            }
            return res.json({ success: true });
        } catch (error) {
            console.error('PK任务完成失败:', error);
            return res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.post('/api/pk-tasks/:id/fail', ...workerGuards, async (req, res) => {
        try {
            const taskId = Number(req.params.id);
            const claimToken = String(req.body?.claimToken || '');
            const claimGeneration = parseClaimGeneration(req.body?.claimGeneration);
            const commandGeneration = Number(req.body?.commandGeneration);
            if (!Number.isSafeInteger(taskId) || taskId < 1
                || !claimGeneration
                || !Number.isSafeInteger(commandGeneration) || commandGeneration < 1
                || !/^[A-Za-z0-9._:-]{8,200}$/.test(claimToken)) {
                return res.status(400).json({ success: false, message: 'PK任务租约参数无效' });
            }
            const errorMessage = String(req.body?.error || '执行失败').slice(0, 1000);
            const result = await pool.query(`
                UPDATE pk_tasks AS task
                SET status = CASE
                        WHEN task.status = 'claimed' AND task.started_at IS NULL THEN 'failed'
                        ELSE 'uncertain'
                    END,
                    error = $2, processed_at = NOW(), lease_expires_at = NOW()
                FROM pk_control_state control
                WHERE task.id = $1
                  AND task.status IN ('claimed', 'processing')
                  AND task.claim_token = $3
                  AND task.worker_id = $4
                  AND task.claim_generation = $5
                  AND task.command_generation = $6
                  AND control.username = task.username
                  AND control.command_generation = task.command_generation
                RETURNING task.id, task.status
            `, [
                taskId, errorMessage, claimToken, req.workerId,
                claimGeneration, commandGeneration
            ]);
            if (result.rows.length === 0) {
                const existing = await pool.query(
                    `SELECT status, claim_token, worker_id, claim_generation, command_generation
                     FROM pk_tasks WHERE id = $1`,
                    [taskId]
                );
                const task = existing.rows[0];
                const ownedAttempt = task?.claim_token === claimToken
                    && task?.worker_id === req.workerId
                    && Number(task?.claim_generation) === claimGeneration
                    && Number(task?.command_generation) === commandGeneration;
                if (ownedAttempt && ['failed', 'uncertain', 'superseded'].includes(task.status)) {
                    return res.json({
                        success: true,
                        status: task.status,
                        message: task.status === 'uncertain' ? '任务执行结果待核对' : '任务已标记失败'
                    });
                }
                if (existing.rows.length > 0) {
                    return res.status(409).json({ success: false, message: '任务状态不允许失败处理' });
                }
                return res.status(404).json({ success: false, message: '任务不存在' });
            }
            return res.json({ success: true, status: result.rows[0].status });
        } catch (error) {
            console.error('PK任务失败处理错误:', error);
            return res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.post('/api/pk/runner/update', ...workerGuards, async (req, res) => {
        let client;
        try {
            const { username, running, roomId, pid, generationId } = req.body || {};
            const commandGeneration = Number(req.body?.commandGeneration);
            const unexpectedExit = req.body?.unexpectedExit === true;
            const normalizedUsername = typeof username === 'string' ? username.trim() : '';
            const normalizedPid = pid === null || pid === undefined ? null : Number(pid);
            if (!/^[\p{L}\p{N}_-]{3,32}$/u.test(normalizedUsername) || typeof running !== 'boolean'
                || !Number.isSafeInteger(commandGeneration) || commandGeneration < 1
                || (req.body?.unexpectedExit !== undefined && typeof req.body.unexpectedExit !== 'boolean')
                || (running && unexpectedExit)
                || (running && !/^[A-Za-z0-9._:-]{16,100}$/.test(String(generationId || '')))
                || (!running && generationId !== null && generationId !== undefined
                    && !/^[A-Za-z0-9._:-]{16,100}$/.test(String(generationId)))
                || (unexpectedExit && !/^[A-Za-z0-9._:-]{16,100}$/.test(String(generationId || '')))
                || (normalizedPid !== null && (!Number.isSafeInteger(normalizedPid) || normalizedPid < 1 || normalizedPid > 2147483647))) {
                return res.status(400).json({ success: false, message: '参数不完整' });
            }
            client = await pool.connect();
            await client.query('BEGIN');
            await client.query(
                "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
                [`pk:${normalizedUsername}`]
            );
            const controlResult = await client.query(`
                SELECT command_generation, desired_running, room_id
                FROM pk_control_state
                WHERE username = $1
                FOR UPDATE
            `, [normalizedUsername]);
            const control = controlResult.rows[0];
            const currentRunnerResult = await client.query(`
                SELECT running, worker_id, generation_id, command_generation, room_id
                FROM pk_runner_state
                WHERE username = $1
                FOR UPDATE
            `, [normalizedUsername]);
            const runner = currentRunnerResult.rows[0] || null;
            const runnerOwned = runner?.worker_id === req.workerId
                && Number(runner?.command_generation) === commandGeneration;
            const runnerGenerationMatches = runnerOwned
                && Boolean(generationId)
                && runner.generation_id === generationId;

            if (!control) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: 'PK指令已被更新' });
            }

            // A retry after an unexpected-exit report may arrive after the first
            // report already advanced the command generation and queued a restart.
            if (!running && unexpectedExit
                && runner?.running === false
                && runnerGenerationMatches
                && Number(control.command_generation) === commandGeneration + 1
                && control.desired_running === true) {
                const queuedRestart = await client.query(`
                    SELECT id
                    FROM pk_tasks
                    WHERE username = $1
                      AND command_generation = $2
                      AND action = 'start'
                    LIMIT 1
                `, [normalizedUsername, control.command_generation]);
                await client.query('COMMIT');
                if (queuedRestart.rows.length === 1) {
                    return res.json({ success: true, replayed: true, restartQueued: true });
                }
                return res.status(409).json({ success: false, message: 'PK退出状态无法确认' });
            }

            if (Number(control.command_generation) !== commandGeneration
                || (running && control.desired_running !== true)
                || (!running && !unexpectedExit && control.desired_running !== false)
                || (running && String(control.room_id || '') !== String(roomId || ''))) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: 'PK指令已被更新' });
            }

            const activeTaskResult = await client.query(`
                SELECT id, action, worker_id
                FROM pk_tasks
                WHERE username = $1
                  AND command_generation = $2
                  AND status = 'processing'
                ORDER BY id DESC
                LIMIT 1
            `, [normalizedUsername, commandGeneration]);
            const activeTask = activeTaskResult.rows[0] || null;
            const ownsExpectedTask = activeTask?.worker_id === req.workerId
                && activeTask.action === (running ? 'start' : 'stop');

            if (running) {
                if (!/^\d{1,12}$/.test(String(roomId || ''))) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ success: false, message: '房间号无效' });
                }
                if (!ownsExpectedTask && !runnerGenerationMatches) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ success: false, message: 'PK运行状态不属于当前工作器任务' });
                }
                await client.query(`
                    INSERT INTO pk_runner_state (
                        username, room_id, running, pid, generation_id, worker_id,
                        lease_expires_at, updated_at, command_generation
                    ) VALUES ($1, $2, TRUE, $3, $4, $5, NOW() + INTERVAL '90 seconds', NOW(), $6)
                    ON CONFLICT (username) DO UPDATE
                    SET room_id = EXCLUDED.room_id,
                        running = TRUE,
                        pid = EXCLUDED.pid,
                        generation_id = EXCLUDED.generation_id,
                        worker_id = EXCLUDED.worker_id,
                        lease_expires_at = EXCLUDED.lease_expires_at,
                        command_generation = EXCLUDED.command_generation,
                        updated_at = NOW()
                `, [
                    normalizedUsername, String(roomId), normalizedPid,
                    generationId, req.workerId, commandGeneration
                ]);
            } else {
                if (unexpectedExit && !runnerGenerationMatches) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ success: false, message: 'PK退出状态不属于当前运行实例' });
                }
                if (!unexpectedExit && !ownsExpectedTask
                    && !(runnerOwned && (!generationId || runner.generation_id === generationId))) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ success: false, message: 'PK停止状态不属于当前工作器任务' });
                }
                const stopped = await client.query(`
                    UPDATE pk_runner_state
                    SET running = FALSE, pid = NULL, lease_expires_at = NOW(),
                        command_generation = $2, updated_at = NOW()
                    WHERE username = $1
                      AND ($3::boolean = FALSE OR (
                          worker_id = $4 AND generation_id = $5
                          AND command_generation = $2
                      ))
                    RETURNING room_id
                `, [
                    normalizedUsername,
                    commandGeneration,
                    unexpectedExit,
                    req.workerId,
                    generationId || null
                ]);
                if (runner && stopped.rowCount !== 1) {
                    throw new Error('PK runner state changed concurrently');
                }

                if (unexpectedExit && control.desired_running === true) {
                    const advanced = await client.query(`
                        UPDATE pk_control_state
                        SET command_generation = command_generation + 1,
                            updated_at = NOW()
                        WHERE username = $1 AND command_generation = $2
                        RETURNING command_generation, room_id
                    `, [normalizedUsername, commandGeneration]);
                    if (advanced.rowCount !== 1 || !advanced.rows[0].room_id) {
                        throw new Error('PK restart command could not be advanced');
                    }
                    const restartGeneration = Number(advanced.rows[0].command_generation);
                    await client.query(`
                        UPDATE pk_tasks
                        SET status = 'superseded', processed_at = NOW(),
                            error = '运行进程意外退出，由重建指令替代'
                        WHERE username = $1
                          AND status IN ('pending', 'claimed', 'processing', 'uncertain')
                          AND (command_generation IS NULL OR command_generation < $2)
                    `, [normalizedUsername, restartGeneration]);
                    await client.query(`
                        INSERT INTO pk_tasks (
                            username, room_id, action, status, command_generation, error
                        ) VALUES ($1, $2, 'start', 'pending', $3, '运行进程意外退出，等待自动重建')
                    `, [normalizedUsername, advanced.rows[0].room_id, restartGeneration]);
                    await client.query('COMMIT');
                    return res.json({ success: true, restartQueued: true, generation: restartGeneration });
                }
            }
            await client.query('COMMIT');
            return res.json({ success: true });
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('PK runner update error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    app.post('/api/pk/authorize', ...workerGuards, async (req, res) => {
        let client;
        try {
            const { authorizationId, username, roomId, runnerGeneration, giftIds } = req.body || {};
            const normalizedItems = normalizeGiftItems(giftIds);
            const resolvedTicketCount = computeTicketCount(giftIds, giftConfig);
            const normalizedRoomId = String(roomId || '');
            if (!/^[A-Za-z0-9._:-]{16,100}$/.test(String(authorizationId || ''))
                || typeof username !== 'string' || !/^[\p{L}\p{N}_-]{3,32}$/u.test(username)
                || !/^\d{1,12}$/.test(normalizedRoomId)
                || !/^[A-Za-z0-9._:-]{16,100}$/.test(String(runnerGeneration || ''))
                || !normalizedItems || !resolvedTicketCount) {
                return res.status(400).json({ success: false, message: '参数不完整' });
            }
            const spendHash = createSpendHash({
                username,
                roomId: normalizedRoomId,
                runnerGeneration,
                giftIds,
                ticketCount: resolvedTicketCount
            });

            client = await pool.connect();
            await client.query('BEGIN');
            await client.query(
                "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
                [`pk:${username}`]
            );
            const existingById = await client.query(`
                SELECT request_hash, status, ticket_count, worker_id
                FROM pk_spend_authorizations
                WHERE authorization_id = $1
                FOR UPDATE
            `, [authorizationId]);
            if (existingById.rows.length > 0) {
                const authorization = existingById.rows[0];
                await client.query('ROLLBACK');
                if (authorization.request_hash !== spendHash
                    || authorization.worker_id !== req.workerId) {
                    return res.status(409).json({ success: false, message: '预授权编号已用于其他请求' });
                }
                if (['reserved', 'sending', 'settled'].includes(authorization.status)) {
                    return res.json({
                        success: true,
                        replayed: true,
                        authorizationId,
                        ticketCount: parseInteger(
                            authorization.ticket_count,
                            'PK ticket count',
                            { min: 1, max: 100000000 }
                        )
                    });
                }
                return res.status(409).json({ success: false, message: '预授权已结束或需要人工核对' });
            }
            const runner = await client.query(`
                SELECT runner.running, runner.room_id, runner.generation_id,
                       runner.worker_id, runner.lease_expires_at,
                       runner.command_generation, control.command_generation AS desired_generation,
                       control.desired_running
                FROM pk_runner_state runner
                JOIN pk_control_state control ON control.username = runner.username
                JOIN users account ON account.username = runner.username
                WHERE runner.username = $1
                  AND account.authorized = TRUE
                  AND account.deactivated = FALSE
                  AND account.bilibili_room_id = $2
                FOR UPDATE OF runner, control
            `, [username, normalizedRoomId]);
            const state = runner.rows[0];
            if (state?.running !== true
                || String(state.room_id || '') !== normalizedRoomId
                || state.generation_id !== runnerGeneration
                || state.worker_id !== req.workerId
                || state.desired_running !== true
                || Number(state.command_generation) !== Number(state.desired_generation)
                || !state.lease_expires_at || new Date(state.lease_expires_at) <= new Date()) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: 'PK运行实例已失效' });
            }

            const unresolved = await client.query(`
                SELECT authorization_id, status
                FROM pk_spend_authorizations
                WHERE username = $1
                  AND status IN ('reserved', 'sending', 'uncertain')
                ORDER BY created_at
                LIMIT 1
            `, [username]);
            if (unresolved.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    success: false,
                    message: '上一笔PK送礼仍在处理或等待对账'
                });
            }

            const inserted = await client.query(`
                INSERT INTO pk_spend_authorizations (
                    authorization_id, username, room_id, runner_generation,
                    worker_id, gift_ids, ticket_count, request_hash, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'reserved')
                ON CONFLICT (authorization_id) DO NOTHING
                RETURNING authorization_id
            `, [
                authorizationId,
                username,
                normalizedRoomId,
                runnerGeneration,
                req.workerId,
                JSON.stringify(normalizedItems),
                resolvedTicketCount,
                spendHash
            ]);
            if (inserted.rows.length === 0) {
                const existing = await client.query(`
                    SELECT request_hash, status, ticket_count, worker_id
                    FROM pk_spend_authorizations
                    WHERE authorization_id = $1
                `, [authorizationId]);
                await client.query('ROLLBACK');
                const authorization = existing.rows[0];
                if (!authorization || authorization.request_hash !== spendHash
                    || authorization.worker_id !== req.workerId) {
                    return res.status(409).json({ success: false, message: '预授权编号已用于其他请求' });
                }
                if (['reserved', 'sending', 'settled'].includes(authorization.status)) {
                    return res.json({
                        success: true,
                        replayed: true,
                        authorizationId,
                        ticketCount: parseInteger(
                            authorization.ticket_count,
                            'PK ticket count',
                            { min: 1, max: 100000000 }
                        )
                    });
                }
                return res.status(409).json({ success: false, message: '预授权已结束或需要人工核对' });
            }

            const reserveResult = await BalanceLogger.updateBalance({
                username,
                amount: -resolvedTicketCount,
                operationType: 'pk_ticket_reserve',
                description: `PK自动上票预扣：${resolvedTicketCount} 积分`,
                gameData: {
                    authorizationId,
                    roomId: normalizedRoomId,
                    runnerGeneration,
                    ticketCount: resolvedTicketCount
                },
                ipAddress: req.clientIP,
                userAgent: req.get('User-Agent'),
                requestId: authorizationId,
                requireSufficientBalance: true,
                client,
                managedTransaction: true
            });
            if (!reserveResult.success) {
                await client.query('ROLLBACK');
                return res.status(402).json({ success: false, message: reserveResult.message });
            }
            await client.query('COMMIT');
            return res.json({
                success: true,
                authorizationId,
                ticketCount: resolvedTicketCount,
                balance: reserveResult.balance
            });
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('PK authorize error:', error);
            return res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    app.post('/api/pk/send-start', ...workerGuards, async (req, res) => {
        let client;
        try {
            const authorizationId = String(req.body?.authorizationId || '');
            if (!/^[A-Za-z0-9._:-]{16,100}$/.test(authorizationId)) {
                return res.status(400).json({ success: false, message: '预授权编号无效' });
            }
            client = await pool.connect();
            await client.query('BEGIN');
            await client.query(
                "SELECT pg_advisory_xact_lock(hashtextextended('bilibili-provider-send', 0))"
            );
            const ownerResult = await client.query(
                'SELECT username FROM pk_spend_authorizations WHERE authorization_id = $1',
                [authorizationId]
            );
            if (ownerResult.rows.length !== 1) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: '预授权不存在' });
            }
            await client.query(
                "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
                [`pk:${ownerResult.rows[0].username}`]
            );
            const authorizationResult = await client.query(`
                SELECT authorization_id, username, room_id, runner_generation,
                       worker_id, status
                FROM pk_spend_authorizations
                WHERE authorization_id = $1
                FOR UPDATE
            `, [authorizationId]);
            const authorization = authorizationResult.rows[0];
            if (!authorization) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: '预授权不存在' });
            }
            if (authorization.worker_id !== req.workerId) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '预授权不属于当前工作器' });
            }
            if (authorization.status === 'sending') {
                await client.query('ROLLBACK');
                return res.json({ success: true, replayed: true });
            }
            if (authorization.status !== 'reserved') {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '预授权状态不允许开始发送' });
            }
            const runnerResult = await client.query(`
                SELECT runner.running, runner.room_id, runner.generation_id,
                       runner.worker_id, runner.lease_expires_at,
                       runner.command_generation,
                       control.command_generation AS desired_generation,
                       control.desired_running
                FROM pk_runner_state AS runner
                JOIN pk_control_state AS control ON control.username = runner.username
                JOIN users AS account ON account.username = runner.username
                WHERE runner.username = $1
                  AND account.authorized = TRUE
                  AND account.deactivated = FALSE
                  AND account.bilibili_room_id = runner.room_id
                FOR UPDATE OF runner, control
            `, [authorization.username]);
            const runner = runnerResult.rows[0];
            if (runner?.running !== true
                || String(runner.room_id || '') !== String(authorization.room_id)
                || runner.generation_id !== authorization.runner_generation
                || runner.worker_id !== req.workerId
                || runner.desired_running !== true
                || Number(runner.command_generation) !== Number(runner.desired_generation)
                || !runner.lease_expires_at || new Date(runner.lease_expires_at) <= new Date()) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: 'PK运行实例已失效' });
            }
            const providerBusy = await client.query(`
                SELECT EXISTS (
                    SELECT 1
                    FROM gift_exchanges
                    WHERE status = 'funds_locked' AND delivery_status = 'processing'
                ) OR EXISTS (
                    SELECT 1
                    FROM pk_spend_authorizations
                    WHERE status = 'sending'
                      AND authorization_id <> $1
                ) AS busy
            `, [authorizationId]);
            if (providerBusy.rows[0]?.busy === true) {
                await client.query('ROLLBACK');
                res.set('Retry-After', '2');
                return res.status(503).json({
                    success: false,
                    message: '外部发送账号正忙，请稍后重试',
                    code: 'EXTERNAL_SENDER_BUSY'
                });
            }
            const started = await client.query(`
                UPDATE pk_spend_authorizations
                SET status = 'sending', started_at = NOW(), updated_at = NOW()
                WHERE authorization_id = $1 AND status = 'reserved'
                RETURNING authorization_id
            `, [authorizationId]);
            if (started.rowCount !== 1) {
                throw new Error('PK send authorization state changed concurrently');
            }
            await client.query('COMMIT');
            return res.json({ success: true });
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('PK发送开始确认失败');
            return res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    app.post('/api/pk/report', ...workerGuards, async (req, res) => {
        let client;
        try {
            const {
                authorizationId,
                reportId,
                username,
                roomId,
                runnerGeneration,
                giftIds,
                script,
                success,
                reason
            } = req.body || {};
            const normalizedItems = normalizeGiftItems(giftIds);
            const resolvedTicketCount = computeTicketCount(giftIds, giftConfig);
            const normalizedRoomId = String(roomId || '');
            if (!/^[A-Za-z0-9._:-]{16,100}$/.test(String(authorizationId || ''))
                || !/^[A-Za-z0-9._:-]{16,128}$/.test(String(reportId || ''))
                || typeof username !== 'string' || !/^[\p{L}\p{N}_-]{3,32}$/u.test(username)
                || !/^\d{1,12}$/.test(normalizedRoomId)
                || !/^[A-Za-z0-9._:-]{16,100}$/.test(String(runnerGeneration || ''))
                || typeof success !== 'boolean' || !normalizedItems || !resolvedTicketCount) {
                return res.status(400).json({ success: false, message: '参数不完整' });
            }
            const spendHash = createSpendHash({
                username,
                roomId: normalizedRoomId,
                runnerGeneration,
                giftIds,
                ticketCount: resolvedTicketCount
            });
            const outcomeReason = String(reason || (success ? 'sent' : 'unconfirmed_failure')).slice(0, 1000);

            client = await pool.connect();
            await client.query('BEGIN');
            await client.query(
                "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
                [`pk:${username}`]
            );
            const authResult = await client.query(`
                SELECT username, room_id, runner_generation, gift_ids, ticket_count,
                       request_hash, status, report_id, worker_id
                FROM pk_spend_authorizations
                WHERE authorization_id = $1
                FOR UPDATE
            `, [authorizationId]);
            const authorization = authResult.rows[0];
            if (!authorization) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: '预授权不存在' });
            }
            if (authorization.request_hash !== spendHash
                || authorization.username !== username
                || authorization.runner_generation !== runnerGeneration) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '回报内容与预授权不匹配' });
            }
            const adoptedWorkerReport = authorization.worker_id !== req.workerId;
            const canAttachLateReport = authorization.status === 'uncertain'
                && !authorization.report_id;
            if (!['reserved', 'sending'].includes(authorization.status) && !canAttachLateReport) {
                await client.query('ROLLBACK');
                if (authorization.report_id === reportId) {
                    return res.json({ success: true, replayed: true, status: authorization.status });
                }
                return res.status(409).json({ success: false, message: '预授权已经结算' });
            }
            if (authorization.status === 'reserved' && success) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '外部发送尚未获得开始授权' });
            }

            const logResult = await client.query(`
                INSERT INTO pk_gift_logs (
                    report_id, authorization_id, runner_generation, username, room_id,
                    gift_ids, ticket_count, script_name, success, reason,
                    origin_worker_id, reporting_worker_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (report_id) DO NOTHING
                RETURNING id
            `, [
                reportId,
                authorizationId,
                runnerGeneration,
                username,
                normalizedRoomId,
                JSON.stringify(normalizedItems),
                resolvedTicketCount,
                script ? String(script).slice(0, 50) : 'pk-proxy',
                success,
                outcomeReason,
                authorization.worker_id,
                req.workerId
            ]);
            if (logResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '回报编号已用于其他请求' });
            }

            // A reserved record proves that the server never authorized an
            // external attempt, so a pre-send failure can be released. Once
            // sending starts, every non-success result requires reconciliation.
            const previousStatus = authorization.status;
            const nextStatus = success
                ? 'settled'
                : previousStatus === 'reserved' ? 'released' : 'uncertain';
            if (nextStatus === 'released') {
                const refundAmount = parseInteger(
                    authorization.ticket_count,
                    'PK ticket count',
                    { min: 1, max: 100000000 }
                );
                const refund = await BalanceLogger.updateBalance({
                    username,
                    amount: refundAmount,
                    operationType: 'pk_pre_send_release',
                    description: `PK发送开始前取消预授权：${refundAmount} 积分`,
                    gameData: { authorizationId, reportId, outcomeReason },
                    requestId: `${authorizationId}:pre-send-release`,
                    requireSufficientBalance: false,
                    client,
                    managedTransaction: true
                });
                if (!refund.success) throw new Error('PK pre-send release failed');
            }

            const settled = await client.query(`
                UPDATE pk_spend_authorizations
                SET status = $2, report_id = $3, outcome_reason = $4,
                    settled_at = NOW(), updated_at = NOW()
                WHERE authorization_id = $1 AND status = $5
                RETURNING authorization_id
            `, [authorizationId, nextStatus, reportId, outcomeReason, previousStatus]);
            if (settled.rowCount !== 1) {
                throw new Error('PK authorization state changed concurrently');
            }
            await client.query('COMMIT');
            return res.json({
                success: true,
                status: nextStatus,
                adoptedWorkerReport
            });
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('PK report error:', error);
            return res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    // 礼物兑换
    app.post('/api/gifts/exchange', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, requireCSRF, async (req, res) => {
        let username = 'unknown';
        let currentBalance;
        let bilibiliRoomId;
        let existingExchange = null;
        let committedResponse = null;
        const idempotencyKey = req.idempotencyKey;

        try {
            const { giftType, cost, quantity = 1 } = req.body || {};
            username = req.session.user.username; // ✅ FIX: 不再用const，赋值到外层变量
            const clientIP = req.clientIP;
            const userAgent = req.userAgent;

            let suppliedCost;
            let quantityNum;
            try {
                suppliedCost = parseMoney(cost, 'gift cost', { min: 0 });
                quantityNum = parseInteger(quantity, 'gift quantity', { min: 1, max: 100 });
            } catch {
                return res.status(400).json({
                    success: false,
                    message: '参数不完整或数量无效'
                });
            }

            // 从配置文件获取可用的礼物类型
            const availableGifts = Object.create(null);
            if (giftConfig.礼物映射) {
                for (const [key, config] of Object.entries(giftConfig.礼物映射)) {
                    if (!redeemableGiftTypes.has(key)) {
                        continue;
                    }
                    availableGifts[key] = {
                        name: config.名称,
                        cost: config.电币成本,
                        bilibili_id: config.bilibili_id
                    };
                }
            }

            // 验证礼物类型
            if (typeof giftType !== 'string' || !Object.hasOwn(availableGifts, giftType)) {
                return res.status(400).json({
                    success: false,
                    message: '无效的礼物类型'
                });
            }

            // 验证价格（考虑数量）
            let costNum;
            try {
                costNum = multiplyMoney(
                    parseMoney(availableGifts[giftType].cost, 'configured gift cost', { min: 0 }),
                    quantityNum,
                    'gift total cost'
                );
            } catch {
                return res.status(503).json({ success: false, message: '礼物价格配置无效' });
            }
            if (suppliedCost !== costNum) {
                return res.status(400).json({
                    success: false,
                    message: `价格不匹配，期望价格: ${costNum} 积分`
                });
            }

            // 🛡️ 真正的预扣机制：在事务中原子地检查余额、锁住资金并创建任务
            const client = await pool.connect();
            let insertResult;
            try {
                await client.query('BEGIN');

                // 加锁：同一用户礼物兑换互斥，避免并发重复扣款
                const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1 || \':gift_exchange\', 0)) AS locked', [username]);
                if (!lock.rows[0].locked) {
                    await client.query('ROLLBACK');
                    return res.status(429).json({
                        success: false,
                        message: '兑换过于频繁，请稍后再试'
                    });
                }

                // 1. 锁定用户行并检查余额
                const lockResult = await client.query(
                    'SELECT balance, bilibili_room_id FROM users WHERE username = $1 FOR UPDATE',
                    [username]
                );
                if (lockResult.rows.length === 0) {
                    throw new Error('用户不存在');
                }

                // ✅ FIX: 去掉const解构，写入外层变量供事务外使用
                currentBalance = parseMoney(lockResult.rows[0].balance, 'user balance', { min: 0 });
                bilibiliRoomId = lockResult.rows[0].bilibili_room_id;

                // 2.1 幂等检查
                if (idempotencyKey) {
                    const idemResult = await client.query(
                        `SELECT id, delivery_status, status, gift_type, cost, quantity
                         FROM gift_exchanges
                         WHERE username = $1 AND idempotency_key = $2
                         LIMIT 1`,
                        [username, idempotencyKey]
                    );

                    if (idemResult.rows.length > 0) {
                        existingExchange = idemResult.rows[0];
                        const sameRequest = existingExchange.gift_type === giftType
                            && parseMoney(existingExchange.cost, 'existing gift cost', { min: 0 }) === costNum
                            && parseInteger(existingExchange.quantity, 'existing gift quantity', { min: 1, max: 100 }) === quantityNum;
                        if (!sameRequest) {
                            await client.query('ROLLBACK');
                            return res.status(409).json({ success: false, message: '幂等键已用于其他礼物兑换' });
                        }
                        await client.query('ROLLBACK');

                        // 获取当前真实余额
                        const balanceResult = await pool.query('SELECT balance FROM users WHERE username = $1', [username]);
                        if (balanceResult.rows.length !== 1) {
                            return res.status(404).json({ success: false, message: '用户不存在' });
                        }
                        const realBalance = parseMoney(balanceResult.rows[0].balance, 'user balance', { min: 0 });

                        return res.json({
                            success: true,
                            message: '重复请求，返回已有结果',
                            exchangeId: existingExchange.id,
                            deliveryStatus: existingExchange.delivery_status,
                            status: existingExchange.status,
                            newBalance: realBalance
                        });
                    }
                }

                if (!bilibiliRoomId) {
                    throw new Error('请先绑定B站房间号再兑换礼物');
                }

                if (currentBalance < costNum) { // ✅ FIX
                    throw new Error(`余额不足！当前余额: ${currentBalance} 积分，需要: ${costNum} 积分`); // ✅ FIX
                }

                // 2. 检查是否有pending的任务（防止重复兑换）
                const pendingResult = await client.query(`
                    SELECT COUNT(*) AS count
                    FROM gift_exchanges
                    WHERE username = $1
                      AND status = 'funds_locked'
                      AND delivery_status IN ('pending', 'claimed', 'processing', 'uncertain')
                `, [username]);
                if (parseInteger(pendingResult.rows[0].count, 'pending gift count', { min: 0 }) > 0) {
                    throw new Error('您有礼物正在发送中，请等待完成后再兑换');
                }

                // 3. 立即锁住资金（从余额中扣除，但标记为frozen）
                const deductResult = await BalanceLogger.updateBalance({
                    username,
                    amount: -costNum,
                    operationType: 'gift_exchange_lock',
                    description: `兑换礼物预扣：${availableGifts[giftType].name} x${quantityNum}`,
                    ipAddress: clientIP,
                    userAgent,
                    client,
                    managedTransaction: true
                });
                if (!deductResult.success) {
                    throw new Error(deductResult.message || '扣费失败');
                }

                // 4. 创建任务记录，标记资金已锁定
                const insertParams = [username, giftType, availableGifts[giftType].name, costNum, quantityNum, bilibiliRoomId, 'pending', idempotencyKey];

                insertResult = await client.query(`
                    INSERT INTO gift_exchanges (
                        username, gift_type, gift_name, cost, quantity, status, created_at,
                        bilibili_room_id, delivery_status, idempotency_key
                    ) VALUES ($1, $2, $3, $4, $5, 'funds_locked', NOW(), $6, $7, $8)
                    RETURNING id
                `, insertParams);
                const exchangeId = insertResult.rows[0].id;
                committedResponse = {
                    success: true,
                    message: '兑换成功，礼物正在发送中，请稍候...',
                    exchangeId,
                    newBalance: deductResult.balance,
                    deliveryStatus: 'pending',
                    note: '资金已锁定，礼物发送完成后确认扣费'
                };
                await req.finalizeIdempotency?.(client, 200, committedResponse);
                await client.query('COMMIT');

            } catch (error) {
                await client.query('ROLLBACK').catch(() => {});
                console.error('礼物兑换事务失败');
                const errorMessage = typeof error?.message === 'string' ? error.message : '';
                const publicMessages = [
                    '用户不存在',
                    '请先绑定B站房间号再兑换礼物',
                    '您有礼物正在发送中，请等待完成后再兑换'
                ];
                const isPublicError = publicMessages.includes(errorMessage)
                    || errorMessage.startsWith('余额不足');
                return res.status(isPublicError ? 400 : 500).json({
                    success: false,
                    message: isPublicError ? errorMessage : '兑换失败，请稍后重试'
                });
            } finally {
                client.release();
            }

            return res.json(committedResponse);

        } catch (error) {
            console.error('礼物兑换请求发生未预期错误');
            res.status(500).json({
                success: false,
                message: '服务器错误'
            });
        }
    });

    // 获取兑换历史
    app.get('/api/gifts/history', requireLogin, requireAuthorized, readHeavyRateLimit, async (req, res) => {
        try {
            const username = req.session.user.username;
            const page = Math.min(500, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
            const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
            const offset = (page - 1) * limit;

            const result = await pool.query(`
                SELECT id, gift_type, gift_name, cost, quantity, status, failure_reason,
                       to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS created_at,
                       delivery_status
                FROM gift_exchanges
                WHERE username = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
            `, [username, limit, offset]);

            const totalResult = await pool.query(
                'SELECT COUNT(*) as total FROM gift_exchanges WHERE username = $1',
                [username]
            );

            const total = parseInteger(totalResult.rows[0].total, 'gift history total', { min: 0 });

            res.json({
                success: true,
                history: result.rows,
                pagination: {
                    page: page,
                    limit: limit,
                    total: total,
                    pages: Math.ceil(total / limit)
                }
            });

        } catch (error) {
            console.error('获取兑换历史失败:', error);
            res.status(500).json({
                success: false,
                message: '服务器错误'
            });
        }
    });

    // 获取待处理的礼物发送任务
    app.post('/api/gift-tasks/claim', ...workerGuards, async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            await client.query(
                "SELECT pg_advisory_xact_lock(hashtextextended('bilibili-provider-send', 0))"
            );
            await client.query(`
                UPDATE gift_exchanges
                SET delivery_status = 'pending',
                    claim_token = NULL,
                    worker_id = NULL,
                    lease_expires_at = NULL,
                    failure_reason = '领取租约过期，尚未开始外部发送',
                    updated_at = NOW()
                WHERE status = 'funds_locked'
                  AND delivery_status = 'claimed'
                  AND lease_expires_at < NOW()
            `);
            await client.query(`
                UPDATE gift_exchanges
                SET delivery_status = 'uncertain',
                    failure_reason = '发送任务租约过期，结果需要核对',
                    updated_at = NOW()
                WHERE status = 'funds_locked'
                  AND delivery_status = 'processing'
                  AND lease_expires_at < NOW()
            `);

            const result = await client.query(`
                WITH claimed AS (
                    SELECT exchange.id
                    FROM gift_exchanges AS exchange
                    JOIN users AS owner ON owner.username = exchange.username
                    WHERE exchange.status = 'funds_locked'
                      AND exchange.delivery_status = 'pending'
                      AND exchange.bilibili_room_id IS NOT NULL
                      AND owner.authorized = TRUE
                      AND owner.deactivated = FALSE
                      AND owner.bilibili_room_id = exchange.bilibili_room_id
                      AND NOT EXISTS (
                          SELECT 1
                          FROM gift_exchanges active
                          WHERE active.status = 'funds_locked'
                            AND active.delivery_status IN ('claimed', 'processing')
                      )
                      AND NOT EXISTS (
                          SELECT 1
                          FROM gift_exchanges unresolved
                          WHERE unresolved.username = exchange.username
                            AND unresolved.status = 'funds_locked'
                            AND unresolved.delivery_status = 'uncertain'
                      )
                      AND NOT EXISTS (
                          SELECT 1
                          FROM pk_spend_authorizations authorization
                          WHERE authorization.status = 'sending'
                      )
                    ORDER BY exchange.created_at ASC, exchange.id ASC
                    FOR UPDATE OF exchange, owner SKIP LOCKED
                    LIMIT 1
                )
                UPDATE gift_exchanges AS exchange
                SET delivery_status = 'claimed',
                    claim_token = $1 || ':' || exchange.id::text,
                    worker_id = $2,
                    lease_expires_at = NOW() + INTERVAL '1 minute',
                    attempt_count = exchange.attempt_count + 1,
                    claim_generation = exchange.claim_generation + 1,
                    failure_reason = NULL,
                    updated_at = NOW()
                FROM claimed
                WHERE exchange.id = claimed.id
                RETURNING exchange.id, exchange.gift_type, exchange.bilibili_room_id,
                          exchange.username, exchange.gift_name, exchange.quantity,
                          exchange.created_at, exchange.claim_token, exchange.claim_generation
            `, [req.requestNonce, req.workerId]);

            await client.query('COMMIT');

            res.json({
                success: true,
                tasks: result.rows.map(row => ({
                    id: row.id,
                    giftId: giftConfig.礼物映射[row.gift_type]?.bilibili_id || row.gift_type,
                    roomId: row.bilibili_room_id,
                    username: row.username,
                    giftName: row.gift_name,
                    quantity: row.quantity || 1, // 如果字段不存在，默认为1
                    createdAt: row.created_at,
                    claimToken: row.claim_token,
                    claimGeneration: row.claim_generation
                }))
            });

        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('获取任务队列失败:', error);
            res.status(500).json({
                success: false,
                message: '服务器错误'
            });
        } finally {
            client?.release();
        }
    });

    app.post('/api/gift-tasks/:id/start', ...workerGuards, async (req, res) => {
        let client;
        try {
            const taskId = Number(req.params.id);
            const claimToken = String(req.body?.claimToken || '');
            const claimGeneration = parseClaimGeneration(req.body?.claimGeneration);
            if (!Number.isSafeInteger(taskId) || taskId < 1 || !claimGeneration
                || !/^[A-Za-z0-9._:-]{8,200}$/.test(claimToken)) {
                return res.status(400).json({ success: false, message: '任务租约参数无效' });
            }
            client = await pool.connect();
            await client.query('BEGIN');
            await client.query(
                "SELECT pg_advisory_xact_lock(hashtextextended('bilibili-provider-send', 0))"
            );
            const result = await client.query(`
                UPDATE gift_exchanges AS exchange
                SET delivery_status = 'processing',
                    started_at = COALESCE(exchange.started_at, NOW()),
                    processed_at = COALESCE(exchange.processed_at, NOW()),
                    lease_expires_at = NOW() + INTERVAL '5 minutes',
                    updated_at = NOW()
                FROM users AS owner
                WHERE exchange.id = $1
                  AND exchange.status = 'funds_locked'
                  AND exchange.delivery_status IN ('claimed', 'processing')
                  AND exchange.claim_token = $2
                  AND exchange.worker_id = $3
                  AND exchange.claim_generation = $4
                  AND exchange.lease_expires_at > NOW()
                  AND owner.username = exchange.username
                  AND owner.authorized = TRUE
                  AND owner.deactivated = FALSE
                  AND owner.bilibili_room_id = exchange.bilibili_room_id
                  AND NOT EXISTS (
                      SELECT 1
                      FROM gift_exchanges AS active
                      WHERE active.id <> exchange.id
                        AND active.status = 'funds_locked'
                        AND active.delivery_status = 'processing'
                  )
                  AND NOT EXISTS (
                      SELECT 1
                      FROM pk_spend_authorizations AS authorization
                      WHERE authorization.status = 'sending'
                  )
                RETURNING exchange.id
            `, [taskId, claimToken, req.workerId, claimGeneration]);
            if (result.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '任务租约已失效或不属于当前工作进程' });
            }
            await client.query('COMMIT');
            return res.json({ success: true });
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('开始礼物任务失败:', error);
            return res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    // 标记任务完成
    app.post('/api/gift-tasks/:id/complete', ...workerGuards, async (req, res) => {
        let client;
        try {
            const taskId = Number.parseInt(req.params.id, 10);
            const claimToken = String(req.body?.claimToken || '');
            const claimGeneration = parseClaimGeneration(req.body?.claimGeneration);
            if (!Number.isInteger(taskId) || taskId < 1
                || !claimGeneration
                || !/^[A-Za-z0-9._:-]{8,200}$/.test(claimToken)) {
                return res.status(400).json({ success: false, message: '任务租约参数无效' });
            }
            client = await pool.connect();
            await client.query('BEGIN');
            const taskResult = await client.query(`
                SELECT username, gift_name, cost, status, quantity, delivery_status,
                       claim_token, worker_id, claim_generation
                FROM gift_exchanges
                WHERE id = $1
                FOR UPDATE
            `, [taskId]);

            if (taskResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: '任务不存在' });
            }

            const {
                username, gift_name, cost, status, quantity, delivery_status,
                claim_token: storedClaimToken, worker_id: workerId,
                claim_generation: storedGeneration
            } = taskResult.rows[0];
            if (storedClaimToken !== claimToken || workerId !== req.workerId
                || Number(storedGeneration) !== claimGeneration) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '任务租约不属于当前工作进程' });
            }
            if (status === 'completed') {
                await client.query('ROLLBACK');
                return res.json({ success: true, message: '任务已完成' });
            }
            if (status !== 'funds_locked') {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '任务状态不允许完成' });
            }
            if (!['processing', 'uncertain'].includes(delivery_status)) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '任务尚未被发送服务领取' });
            }
            const quantityNum = parseInteger(quantity, 'task quantity', { min: 1 });
            const costNum = parseMoney(cost, 'task cost', { min: 0 });
            const partialSuccess = (req.body?.partialSuccess ?? req.body?.partial_success) === true;
            const hasActualQuantity = req.body?.actualQuantity !== undefined || req.body?.actual_quantity !== undefined;
            const hasRequestedQuantity = req.body?.requestedQuantity !== undefined || req.body?.requested_quantity !== undefined;
            let rawActual = null;
            let rawRequested = null;
            try {
                if (hasActualQuantity) {
                    rawActual = parseInteger(
                        req.body?.actualQuantity ?? req.body?.actual_quantity,
                        'actual quantity',
                        { min: 0 }
                    );
                }
                if (hasRequestedQuantity) {
                    rawRequested = parseInteger(
                        req.body?.requestedQuantity ?? req.body?.requested_quantity,
                        'requested quantity',
                        { min: 1 }
                    );
                }
            } catch {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '任务数量无效' });
            }
            if (hasRequestedQuantity && rawRequested !== quantityNum) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '请求数量与任务不匹配' });
            }
            if (partialSuccess && (rawActual < 1 || rawActual >= quantityNum)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '部分成功数量无效' });
            }
            if (!partialSuccess && hasActualQuantity && rawActual !== quantityNum) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '成功数量与任务不匹配' });
            }
            const actualQuantity = partialSuccess ? rawActual : quantityNum;
            const actualCost = calculateDeliveredCost(costNum, actualQuantity, quantityNum);
            const refundAmount = costNum - actualCost;
            const providerTransactionId = typeof req.body?.providerTransactionId === 'string'
                && req.body.providerTransactionId.length <= 200
                && !/[\r\n\0]/.test(req.body.providerTransactionId)
                ? req.body.providerTransactionId.trim() || null
                : null;

            if (refundAmount > 0) {
                const refund = await BalanceLogger.updateBalance({
                    username,
                    amount: refundAmount,
                    operationType: 'gift_delivery_refund',
                    description: `礼物部分成功退款 ${refundAmount} 积分`,
                    requireSufficientBalance: false,
                    client,
                    managedTransaction: true
                });
                if (!refund.success) throw new Error(refund.message || '退款失败');
            }

            const finalDeliveryStatus = partialSuccess ? 'partial_success' : 'success';
            const updated = await client.query(`
                UPDATE gift_exchanges
                SET delivery_status = $2,
                    status = 'completed',
                    processed_at = NOW(),
                    lease_expires_at = NOW(),
                    provider_transaction_id = COALESCE($5, provider_transaction_id),
                    updated_at = NOW()
                WHERE id = $1 AND status = 'funds_locked'
                  AND claim_token = $3 AND worker_id = $4
                  AND claim_generation = $6
                RETURNING id
            `, [
                taskId, finalDeliveryStatus, claimToken, req.workerId,
                providerTransactionId, claimGeneration
            ]);
            if (updated.rows.length !== 1) throw new Error('Gift settlement state changed concurrently');

            await client.query(`
                INSERT INTO gift_delivery_events (
                    gift_exchange_id, event_type, claim_generation, worker_id, details
                ) VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (gift_exchange_id, event_type, claim_generation) DO NOTHING
            `, [
                taskId,
                partialSuccess ? 'delivery_partial' : 'delivery_succeeded',
                claimGeneration,
                req.workerId,
                JSON.stringify({
                    giftName: gift_name,
                    lockedAmount: costNum,
                    actualCost,
                    refundAmount,
                    actualQuantity,
                    requestedQuantity: quantityNum,
                    providerTransactionId
                })
            ]);

            await client.query(`
                UPDATE wish_inventory
                SET status = 'sent',
                    sent_at = NOW(),
                    last_failure_reason = NULL,
                    updated_at = NOW()
                WHERE gift_exchange_id = $1
            `, [taskId]);
            await client.query(`
                INSERT INTO delivery_outbox (event_type, aggregate_id, payload)
                VALUES ('enqueue_next_blindbox', $1, $2)
                ON CONFLICT (event_type, aggregate_id) DO NOTHING
            `, [taskId, JSON.stringify({ username })]);
            await client.query('COMMIT');
            setImmediate(() => processDeliveryOutbox().catch(() => {}));
            return res.json({ success: true, message: '任务完成' });
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('标记任务完成失败:', error);
            return res.status(500).json({
                success: false,
                message: '服务器错误'
            });
        } finally {
            client?.release();
        }
    });

    app.post('/api/gift-tasks/:id/uncertain', ...workerGuards, async (req, res) => {
        let client;
        try {
            const taskId = Number(req.params.id);
            const claimToken = String(req.body?.claimToken || '');
            const claimGeneration = parseClaimGeneration(req.body?.claimGeneration);
            if (!Number.isSafeInteger(taskId) || taskId < 1
                || !claimGeneration
                || !/^[A-Za-z0-9._:-]{8,200}$/.test(claimToken)) {
                return res.status(400).json({ success: false, message: '任务租约参数无效' });
            }
            const reason = String(req.body?.reason || '发送结果无法确认').trim().slice(0, 1000) || '发送结果无法确认';
            client = await pool.connect();
            await client.query('BEGIN');
            const result = await client.query(`
                UPDATE gift_exchanges
                SET delivery_status = 'uncertain',
                    failure_reason = $2,
                    lease_expires_at = NOW(),
                    updated_at = NOW()
                WHERE id = $1
                  AND status = 'funds_locked'
                  AND delivery_status = 'processing'
                  AND claim_token = $3
                  AND worker_id = $4
                  AND claim_generation = $5
                RETURNING id
            `, [taskId, reason, claimToken, req.workerId, claimGeneration]);
            if (result.rows.length > 0) {
                await client.query(`
                    INSERT INTO gift_delivery_events (
                        gift_exchange_id, event_type, claim_generation, worker_id, details
                    ) VALUES ($1, 'delivery_uncertain', $2, $3, $4)
                    ON CONFLICT (gift_exchange_id, event_type, claim_generation) DO NOTHING
                `, [taskId, claimGeneration, req.workerId, JSON.stringify({ reason })]);
                await client.query('COMMIT');
                return res.json({ success: true, message: '任务已标记为结果待确认' });
            }
            const existing = await client.query(
                `SELECT status, delivery_status, claim_token, worker_id, claim_generation
                 FROM gift_exchanges WHERE id = $1`,
                [taskId]
            );
            await client.query('ROLLBACK');
            if (existing.rows.length === 0) {
                return res.status(404).json({ success: false, message: '任务不存在' });
            }
            const ownedAttempt = existing.rows[0].claim_token === claimToken
                && existing.rows[0].worker_id === req.workerId
                && Number(existing.rows[0].claim_generation) === claimGeneration;
            if (ownedAttempt && (existing.rows[0].delivery_status === 'uncertain'
                || ['completed', 'failed'].includes(existing.rows[0].status))) {
                return res.json({ success: true, message: '任务已有最终或待确认状态' });
            }
            return res.status(409).json({ success: false, message: '任务状态不允许标记待确认' });
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('标记礼物任务待确认失败:', error);
            return res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    // 标记任务失败
    app.post('/api/gift-tasks/:id/fail', ...workerGuards, async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            const taskId = Number.parseInt(req.params.id, 10);
            const claimToken = String(req.body?.claimToken || '');
            const claimGeneration = parseClaimGeneration(req.body?.claimGeneration);
            if (!Number.isInteger(taskId) || taskId < 1
                || !claimGeneration
                || !/^[A-Za-z0-9._:-]{8,200}$/.test(claimToken)) {
                return res.status(400).json({ success: false, message: '任务租约参数无效' });
            }
            const errorMessage = String(req.body?.error || '礼物发送失败').trim().slice(0, 1000) || '礼物发送失败';

            await client.query('BEGIN');
            const taskResult = await client.query(`
                SELECT username, gift_name, cost, status, quantity, delivery_status,
                       claim_token, worker_id, claim_generation, lease_expires_at
                FROM gift_exchanges
                WHERE id = $1
                FOR UPDATE
            `, [taskId]);

            if (taskResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: '任务不存在' });
            }

            const {
                username, gift_name, cost, status, quantity, delivery_status,
                claim_token: storedClaimToken, worker_id: workerId,
                claim_generation: storedGeneration,
                lease_expires_at: leaseExpiresAt
            } = taskResult.rows[0];
            if (storedClaimToken !== claimToken || workerId !== req.workerId
                || Number(storedGeneration) !== claimGeneration) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '任务租约不属于当前工作进程' });
            }
            if (status === 'failed') {
                await client.query('ROLLBACK');
                return res.json({ success: true, message: '任务已标记失败' });
            }
            if (status !== 'funds_locked') {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '任务状态不允许失败处理' });
            }
            if (delivery_status !== 'claimed') {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    success: false,
                    message: '任务已开始外部发送，不能由工作器自动退款，必须进入人工对账'
                });
            }
            if (!leaseExpiresAt || new Date(leaseExpiresAt) <= new Date()) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '任务领取租约已过期' });
            }

            const quantityNum = parseInteger(quantity, 'task quantity', { min: 1 });
            const costNum = parseMoney(cost, 'task cost', { min: 0 });
            const refundAmount = costNum;

            if (refundAmount > 0) {
                const refundResult = await BalanceLogger.updateBalance({
                    username,
                    amount: refundAmount,
                    operationType: 'gift_delivery_failed_refund',
                    description: `礼物发送失败退款: ${gift_name} ${quantityNum}个，退还 ${refundAmount} 积分 - 原因: ${errorMessage}`,
                    gameData: {
                        taskId,
                        gift_name,
                        originalCost: costNum,
                        refundAmount,
                        errorMessage,
                        quantity: quantityNum,
                        externalSendStarted: false
                    },
                    requireSufficientBalance: false,
                    client,
                    managedTransaction: true
                });

                if (!refundResult.success) {
                    throw new Error(refundResult.message || '退款失败');
                }
            }

            const failed = await client.query(`
                UPDATE gift_exchanges
                SET delivery_status = 'failed',
                    status = 'failed',
                    failure_reason = $2,
                    processed_at = NOW(),
                    lease_expires_at = NOW()
                WHERE id = $1 AND status = 'funds_locked'
                  AND claim_token = $3 AND worker_id = $4
                  AND claim_generation = $5
                  AND delivery_status = 'claimed'
                RETURNING id
            `, [taskId, errorMessage, claimToken, req.workerId, claimGeneration]);
            if (failed.rowCount !== 1) {
                throw new Error('Gift failure state changed concurrently');
            }

            await client.query(`
                INSERT INTO gift_delivery_events (
                    gift_exchange_id, event_type, claim_generation, worker_id, details
                ) VALUES ($1, 'delivery_not_started', $2, $3, $4)
                ON CONFLICT (gift_exchange_id, event_type, claim_generation) DO NOTHING
            `, [taskId, claimGeneration, req.workerId, JSON.stringify({ reason: errorMessage, refundAmount })]);

            await client.query(`
                UPDATE wish_inventory
                SET status = 'stored',
                    gift_exchange_id = NULL,
                    last_failure_reason = $2,
                    expires_at = (date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'
                        + interval '1 day 23 hours 59 minutes 59 seconds'),
                    updated_at = NOW()
                WHERE gift_exchange_id = $1
            `, [taskId, errorMessage]);
            await client.query('COMMIT');
            return res.json({ success: true, message: '任务标记为失败，资金已安全退还' });

        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('标记任务失败:', error);
            return res.status(500).json({
                success: false,
                message: '服务器错误'
            });
        } finally {
            client?.release();
        }
    });

    // 启动卡住任务自动处理
    monitorStuckGiftTasks();
    const outboxInterval = setInterval(() => {
        processDeliveryOutbox().catch(() => {});
    }, 5000);
    outboxInterval.unref?.();
    setImmediate(() => processDeliveryOutbox().catch(() => {}));
};
