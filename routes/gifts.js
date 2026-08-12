module.exports = function registerGiftRoutes(app, deps) {
    const {
        pool,
        giftConfig,
        BalanceLogger,
        requireLogin,
        requireAuthorized,
        requireApiKey,
        security,
        generateCSRFToken,
        enqueueWishInventorySend
    } = deps;
    const redeemableGiftTypes = new Set(['heartbox', 'fanlight', 'tiedu_one']);

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
        if (!enqueueResult.success && enqueueResult.message === '送出失败，请稍后重试') {
            throw new Error(enqueueResult.message);
        }
    }

    // 自动处理卡住的礼物任务，超时退款
    const monitorStuckGiftTasks = () => {
        const INTERVAL_MS = 10 * 60 * 1000; // 10分钟扫描一次
        const TIMEOUT_SQL = `(
            (delivery_status = 'pending' AND created_at < NOW() - INTERVAL '30 minutes')
            OR
            (delivery_status = 'processing' AND processed_at < NOW() - INTERVAL '30 minutes')
        )`;
        const interval = setInterval(async () => {
            try {
                const stuckTasks = await pool.query(`
                    SELECT id, username, cost, delivery_status
                    FROM gift_exchanges
                    WHERE status = 'funds_locked'
                      AND delivery_status IN ('pending', 'processing')
                      AND ${TIMEOUT_SQL}
                    ORDER BY created_at
                    LIMIT 20
                `);

                for (const task of stuckTasks.rows) {
                    const client = await pool.connect();
                    try {
                        await client.query('BEGIN');
                        const lockedResult = await client.query(`
                            SELECT username, cost, delivery_status
                            FROM gift_exchanges
                            WHERE id = $1
                              AND status = 'funds_locked'
                              AND delivery_status IN ('pending', 'processing')
                            FOR UPDATE
                        `, [task.id]);
                        if (lockedResult.rows.length === 0) {
                            await client.query('ROLLBACK');
                            continue;
                        }
                        const lockedTask = lockedResult.rows[0];
                        if (lockedTask.delivery_status === 'processing') {
                            await client.query(
                                `UPDATE gift_exchanges
                                 SET delivery_status = 'uncertain',
                                     failure_reason = '发送服务已领取任务，但超时未确认结果',
                                     updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai')
                                 WHERE id = $1 AND status = 'funds_locked'`,
                                [task.id]
                            );
                            await client.query('COMMIT');
                            console.error(`礼物任务结果待人工确认，未自动退款或重发: id=${task.id}`);
                            continue;
                        }
                        const refund = await BalanceLogger.updateBalance({
                            username: lockedTask.username,
                            amount: Number(lockedTask.cost),
                            operationType: 'gift_timeout_refund',
                            description: `礼物任务超时自动退款: ${lockedTask.cost} 积分`,
                            gameData: { taskId: task.id, reason: 'pending_timeout' },
                            requireSufficientBalance: false,
                            client,
                            managedTransaction: true
                        });
                        if (!refund.success) {
                            await client.query('ROLLBACK');
                            console.error(`自动退款失败，任务ID=${task.id}, 用户=${lockedTask.username}`);
                            continue;
                        }
                        await client.query(
                            `UPDATE gift_exchanges 
                             SET status = 'failed', delivery_status = 'timeout', updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai') 
                             WHERE id = $1`,
                            [task.id]
                        );
                        await client.query(`
                            UPDATE wish_inventory
                            SET status = 'stored',
                                gift_exchange_id = NULL,
                                last_failure_reason = '发送任务在领取前超时',
                                expires_at = (date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai') + interval '1 day' + interval '23 hours 59 minutes 59 seconds'),
                                updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai')
                            WHERE gift_exchange_id = $1
                        `, [task.id]);
                        await client.query('COMMIT');
                        console.log(`✅ 自动处理卡住礼物任务，已退款并标记失败: id=${task.id}`);
                    } catch (err) {
                        try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
                        console.error('自动处理卡住礼物任务失败:', err);
                    } finally {
                        client.release();
                    }
                }
            } catch (err) {
                console.error('扫描卡住礼物任务失败:', err);
            }
        }, INTERVAL_MS);
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

            const balance = userResult.rows.length > 0 ? userResult.rows[0].balance : 0;

            res.render('gifts', {
                title: '礼物兑换 - Minimal Games',
                user: req.session.user,
                balance: balance,
                csrfToken: req.session.csrfToken
            });

        } catch (err) {
            console.error(err);
            res.status(500).send('服务器错误');
        }
    });

    app.get('/api/pk/status', requireLogin, requireAuthorized, security.basicRateLimit, async (req, res) => {
        try {
            const username = req.session.user.username;
            const statusResult = await pool.query(`
                SELECT COALESCE(state.running, FALSE) AS running,
                       active_task.action,
                       active_task.status
                FROM (SELECT $1::varchar AS username) AS requested
                LEFT JOIN pk_runner_state AS state ON state.username = requested.username
                LEFT JOIN LATERAL (
                    SELECT action, status
                    FROM pk_tasks
                    WHERE username = requested.username
                      AND status IN ('pending', 'processing')
                    ORDER BY id DESC
                    LIMIT 1
                ) AS active_task ON TRUE
            `, [username]);
            const activeTask = statusResult.rows[0] || {};
            const running = activeTask.running === true;
            const transition = activeTask?.action === 'start' || activeTask?.action === 'stop'
                ? activeTask.action
                : null;
            const desiredRunning = transition ? transition === 'start' : running;
            res.set('Cache-Control', 'no-store');
            res.json({
                success: true,
                running,
                desiredRunning,
                transition,
                transitionStatus: activeTask?.status || null
            });
        } catch (error) {
            console.error('PK status error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.post('/api/pk/start', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            const username = req.session.user.username;
            await client.query('BEGIN');
            await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`pk:${username}`]);
            const roomResult = await client.query(
                'SELECT bilibili_room_id FROM users WHERE username = $1',
                [username]
            );
            const roomId = roomResult.rows[0]?.bilibili_room_id;
            if (!roomId) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '请先绑定B站房间号' });
            }
            const pendingResult = await client.query(
                `SELECT id, action, status
                 FROM pk_tasks
                 WHERE username = $1 AND status IN ('pending', 'processing')
                 ORDER BY id DESC
                 FOR UPDATE`,
                [username]
            );
            if (pendingResult.rows[0]?.action === 'start') {
                await client.query('ROLLBACK');
                return res.json({ success: true, queued: true, message: '已在队列中' });
            }
            await client.query(
                `UPDATE pk_tasks
                 SET status = 'superseded', processed_at = NOW(), error = '由较新的启动请求替代'
                 WHERE username = $1 AND status = 'pending'`,
                [username]
            );
            await client.query(
                `INSERT INTO pk_tasks (username, room_id, action, status)
                 VALUES ($1, $2, 'start', 'pending')`,
                [username, String(roomId)]
            );
            const responseBody = { success: true, queued: true };
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

    app.post('/api/pk/stop', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            const username = req.session.user.username;
            await client.query('BEGIN');
            await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`pk:${username}`]);
            const pendingResult = await client.query(
                `SELECT id, action, status
                 FROM pk_tasks
                 WHERE username = $1 AND status IN ('pending', 'processing')
                 ORDER BY id DESC
                 FOR UPDATE`,
                [username]
            );
            if (pendingResult.rows[0]?.action === 'stop') {
                await client.query('ROLLBACK');
                return res.json({ success: true, queued: true, message: '已在队列中' });
            }
            await client.query(
                `UPDATE pk_tasks
                 SET status = 'superseded', processed_at = NOW(), error = '由较新的停止请求替代'
                 WHERE username = $1 AND status = 'pending'`,
                [username]
            );
            await client.query(
                `INSERT INTO pk_tasks (username, action, status)
                 VALUES ($1, 'stop', 'pending')`,
                [username]
            );
            const responseBody = { success: true, queued: true };
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

    app.get('/api/pk-tasks', requireApiKey, async (req, res) => {
        try {
            await pool.query(`
                UPDATE pk_tasks
                SET status = 'failed',
                    error = '任务领取后超过10分钟未确认结果',
                    processed_at = NOW()
                WHERE status = 'processing'
                  AND processed_at < NOW() - INTERVAL '10 minutes'
            `);
            const result = await pool.query(`
                WITH claimed AS (
                    SELECT task.id
                    FROM pk_tasks task
                    WHERE task.status = 'pending'
                      AND NOT EXISTS (
                          SELECT 1
                          FROM pk_tasks active
                          WHERE active.username = task.username
                            AND active.status = 'processing'
                      )
                      AND task.id = (
                          SELECT first_task.id
                          FROM pk_tasks first_task
                          WHERE first_task.username = task.username
                            AND first_task.status = 'pending'
                          ORDER BY first_task.created_at ASC, first_task.id ASC
                          LIMIT 1
                      )
                    ORDER BY task.created_at ASC, task.id ASC
                    FOR UPDATE SKIP LOCKED
                    LIMIT 10
                )
                UPDATE pk_tasks AS task
                SET status = 'processing', processed_at = NOW()
                FROM claimed
                WHERE task.id = claimed.id
                RETURNING task.id, task.username, task.room_id, task.action, task.created_at
            `);
            res.json({ success: true, tasks: result.rows });
        } catch (error) {
            console.error('获取PK任务失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.post('/api/pk-tasks/:id/complete', requireApiKey, async (req, res) => {
        try {
            const taskId = Number(req.params.id);
            if (!Number.isSafeInteger(taskId) || taskId < 1) {
                return res.status(400).json({ success: false, message: '任务ID无效' });
            }
            const result = await pool.query(`
                UPDATE pk_tasks
                SET status = 'completed', processed_at = NOW()
                WHERE id = $1 AND status = 'processing'
                RETURNING id
            `, [taskId]);
            if (result.rows.length === 0) {
                const existing = await pool.query('SELECT status FROM pk_tasks WHERE id = $1', [taskId]);
                if (existing.rows[0]?.status === 'completed') {
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

    app.post('/api/pk-tasks/:id/fail', requireApiKey, async (req, res) => {
        try {
            const taskId = Number(req.params.id);
            if (!Number.isSafeInteger(taskId) || taskId < 1) {
                return res.status(400).json({ success: false, message: '任务ID无效' });
            }
            const errorMessage = String(req.body?.error || '执行失败').slice(0, 1000);
            const result = await pool.query(`
                UPDATE pk_tasks
                SET status = 'failed', error = $2, processed_at = NOW()
                WHERE id = $1 AND status = 'processing'
                RETURNING id
            `, [taskId, errorMessage]);
            if (result.rows.length === 0) {
                const existing = await pool.query('SELECT status FROM pk_tasks WHERE id = $1', [taskId]);
                if (existing.rows[0]?.status === 'failed') {
                    return res.json({ success: true, message: '任务已标记失败' });
                }
                if (existing.rows.length > 0) {
                    return res.status(409).json({ success: false, message: '任务状态不允许失败处理' });
                }
                return res.status(404).json({ success: false, message: '任务不存在' });
            }
            return res.json({ success: true });
        } catch (error) {
            console.error('PK任务失败处理错误:', error);
            return res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.post('/api/pk/runner/update', requireApiKey, async (req, res) => {
        try {
            const { username, running, roomId, pid } = req.body || {};
            const normalizedUsername = typeof username === 'string' ? username.trim() : '';
            const normalizedPid = pid === null || pid === undefined ? null : Number(pid);
            if (!/^[\p{L}\p{N}_-]{3,32}$/u.test(normalizedUsername) || typeof running !== 'boolean'
                || (normalizedPid !== null && (!Number.isSafeInteger(normalizedPid) || normalizedPid < 1 || normalizedPid > 2147483647))) {
                return res.status(400).json({ success: false, message: '参数不完整' });
            }
            await pool.query(`
                INSERT INTO pk_runner_state (username, room_id, running, pid, updated_at)
                VALUES ($1, $2, $3, $4, (NOW() AT TIME ZONE 'Asia/Shanghai'))
                ON CONFLICT (username)
                DO UPDATE SET room_id = EXCLUDED.room_id, running = EXCLUDED.running, pid = EXCLUDED.pid, updated_at = EXCLUDED.updated_at
            `, [
                normalizedUsername,
                roomId ? String(roomId).slice(0, 50) : null,
                running,
                normalizedPid
            ]);
            res.json({ success: true });
        } catch (error) {
            console.error('PK runner update error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.post('/api/pk/report', requireApiKey, async (req, res) => {
        try {
            const { reportId, username, roomId, giftIds, script, success, reason, ticketCount } = req.body || {};
            const normalizedGiftItems = Array.isArray(giftIds) ? giftIds.map((item) => {
                if (item && typeof item === 'object' && !Array.isArray(item)) {
                    const id = String(item.id ?? item.gift_id ?? item.giftId ?? '');
                    const count = Number(item.count ?? 1);
                    return { id, count };
                }
                return { id: String(item), count: 1 };
            }) : [];
            if (typeof username !== 'string' || !/^[\p{L}\p{N}_-]{3,32}$/u.test(username)
                || typeof reportId !== 'string' || !/^[A-Za-z0-9._:-]{16,128}$/.test(reportId)
                || typeof success !== 'boolean'
                || !Array.isArray(giftIds) || giftIds.length < 1 || giftIds.length > 1000
                || normalizedGiftItems.some(({ id, count }) => (
                    !/^[A-Za-z0-9_-]{1,50}$/.test(id)
                    || !Number.isSafeInteger(count) || count < 1 || count > 1000000
                ))
                || normalizedGiftItems.reduce((sum, item) => sum + item.count, 0) > 1000000) {
                return res.status(400).json({ success: false, message: '参数不完整' });
            }
            const parseTicketCount = (value) => {
                const num = Number(value);
                if (!Number.isSafeInteger(num) || num <= 0 || num > 100000000) {
                    return null;
                }
                return num;
            };
            const computeTicketCountFromGifts = () => {
                const poolConfig = giftConfig?.礼物池配置 || {};
                let total = 0;
                let allKnown = true;
                normalizedGiftItems.forEach(({ id, count }) => {
                    const entry = poolConfig[id];
                    if (!entry) {
                        allKnown = false;
                        return;
                    }
                    const price = Array.isArray(entry) ? Number(entry[1]) : Number(entry?.value);
                    if (!Number.isFinite(price) || price < 0) {
                        allKnown = false;
                        return;
                    }
                    total += price * 10 * count;
                });
                const roundedTotal = Math.round(total);
                return allKnown && Number.isSafeInteger(roundedTotal)
                    && roundedTotal > 0 && roundedTotal <= 100000000
                    ? roundedTotal
                    : null;
            };
            const reportedTicketCount = parseTicketCount(ticketCount);
            const computedTicketCount = computeTicketCountFromGifts();
            if (success && computedTicketCount === null) {
                return res.status(400).json({ success: false, message: '礼物明细无法计算或超过上限' });
            }
            if (reportedTicketCount && computedTicketCount && reportedTicketCount !== computedTicketCount) {
                return res.status(400).json({ success: false, message: '上票积分与礼物明细不匹配' });
            }
            const resolvedTicketCount = computedTicketCount ?? reportedTicketCount;
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const insertResult = await client.query(`
                    INSERT INTO pk_gift_logs (
                        report_id, username, room_id, gift_ids, ticket_count, script_name, success, reason
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (report_id) DO NOTHING
                    RETURNING id
                `, [
                    reportId,
                    username,
                    roomId ? String(roomId).slice(0, 50) : null,
                    JSON.stringify(giftIds),
                    Number.isFinite(resolvedTicketCount) ? resolvedTicketCount : null,
                    script ? String(script).slice(0, 50) : null,
                    typeof success === 'boolean' ? success : null,
                    reason ? String(reason).slice(0, 1000) : null
                ]);
                if (insertResult.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.json({ success: true, replayed: true });
                }
                if (success === true && Number.isFinite(resolvedTicketCount) && resolvedTicketCount > 0) {
                    const chargeResult = await BalanceLogger.updateBalance({
                        username,
                        amount: -resolvedTicketCount,
                        operationType: 'pk_ticket',
                        description: `PK自动上票扣费：${resolvedTicketCount} 积分`,
                        gameData: { reportId, roomId, ticketCount: resolvedTicketCount },
                        ipAddress: req.clientIP,
                        userAgent: req.get('User-Agent'),
                        requireSufficientBalance: false,
                        client,
                        managedTransaction: true
                    });
                    if (!chargeResult.success) {
                        throw new Error(chargeResult.message || 'PK上票扣费失败');
                    }
                }
                await client.query('COMMIT');
            } catch (transactionError) {
                await client.query('ROLLBACK').catch(() => {});
                throw transactionError;
            } finally {
                client.release();
            }
            return res.json({ success: true });
        } catch (error) {
            console.error('PK report error:', error);
            return res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    // 礼物兑换
    app.post('/api/gifts/exchange', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
        let username = 'unknown';
        let currentBalance;
        let bilibiliRoomId;
        let existingExchange = null;
        const idempotencyKey = req.idempotencyKey;

        try {
            const { giftType, cost, quantity = 1 } = req.body;
            username = req.session.user.username; // ✅ FIX: 不再用const，赋值到外层变量
            const clientIP = req.clientIP;
            const userAgent = req.userAgent;

            // ✅ FIX: 统一把 cost / quantity 转成数字，避免 "150" !== 150
            const costNum = Number(cost);
            const quantityNum = Number(quantity);

            // 验证输入参数
            if (!giftType || !Number.isFinite(costNum) || !Number.isInteger(costNum) || !Number.isFinite(quantityNum) || !Number.isInteger(quantityNum) || quantityNum < 1) {
                return res.status(400).json({
                    success: false,
                    message: '参数不完整或数量无效'
                });
            }

            // 验证数量上限
            if (quantityNum > 100) { // ✅ FIX
                return res.status(400).json({
                    success: false,
                    message: '单次最多只能兑换100个礼物'
                });
            }

            // 从配置文件获取可用的礼物类型
            const availableGifts = {};
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
            } else {
                // 备用配置
                availableGifts.heartbox = { name: '心动盲盒', cost: 150, bilibili_id: '32251' };
                availableGifts.fanlight = { name: '粉丝团灯牌', cost: 1, bilibili_id: '31164' };
            }

            // 验证礼物类型
            if (!availableGifts[giftType]) {
                return res.status(400).json({
                    success: false,
                    message: '无效的礼物类型'
                });
            }

            // 验证价格（考虑数量）
            const expectedTotalCost = availableGifts[giftType].cost * quantityNum; // ✅ FIX
            if (costNum !== expectedTotalCost) { // ✅ FIX
                return res.status(400).json({
                    success: false,
                    message: `价格不匹配，期望价格: ${expectedTotalCost} 积分`
                });
            }

            // 🛡️ 真正的预扣机制：在事务中原子地检查余额、锁住资金并创建任务
            const client = await pool.connect();
            let insertResult;
            try {
                await client.query('BEGIN');

                // 加锁：同一用户礼物兑换互斥，避免并发重复扣款
                const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtext($1 || \':gift_exchange\')) AS locked', [username]);
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
                currentBalance = Number(lockResult.rows[0].balance);
                bilibiliRoomId = lockResult.rows[0].bilibili_room_id;

                if (!bilibiliRoomId) {
                    throw new Error('请先绑定B站房间号再兑换礼物');
                }

                if (currentBalance < costNum) { // ✅ FIX
                    throw new Error(`余额不足！当前余额: ${currentBalance} 积分，需要: ${costNum} 积分`); // ✅ FIX
                }

                // 2.1 幂等检查（如果表支持 idempotency_key）
                // 2.1 幂等检查
                if (idempotencyKey) {
                    const idemResult = await client.query(
                        'SELECT id, delivery_status, status FROM gift_exchanges WHERE username = $1 AND idempotency_key = $2 LIMIT 1',
                        [username, idempotencyKey]
                    );

                    if (idemResult.rows.length > 0) {
                        existingExchange = idemResult.rows[0];
                        await client.query('ROLLBACK');

                        // 获取当前真实余额
                        const balanceResult = await pool.query('SELECT balance FROM users WHERE username = $1', [username]);
                        const realBalance = balanceResult.rows.length > 0 ? parseFloat(balanceResult.rows[0].balance) : 0;

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

                // 2. 检查是否有pending的任务（防止重复兑换）
                const pendingResult = await client.query(
                    'SELECT COUNT(*) as count FROM gift_exchanges WHERE username = $1 AND delivery_status IN ($2, $3)',
                    [username, 'pending', 'processing']
                );
                if (parseInt(pendingResult.rows[0].count) > 0) {
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
                const responseBody = {
                    success: true,
                    message: '兑换成功，礼物正在发送中，请稍候...',
                    exchangeId,
                    newBalance: currentBalance - costNum,
                    deliveryStatus: 'pending',
                    note: '资金已锁定，礼物发送完成后确认扣费'
                };
                await req.finalizeIdempotency?.(client, 200, responseBody);
                await client.query('COMMIT');

                console.log(`🔒 用户 ${username} 资金已锁定: ${costNum} 积分，剩余余额: ${currentBalance - costNum} 积分`); // ✅ FIX

            } catch (error) {
                await client.query('ROLLBACK').catch(() => {});
                console.error('兑换事务失败:', error.message);
                const publicMessages = [
                    '用户不存在',
                    '请先绑定B站房间号再兑换礼物',
                    '您有礼物正在发送中，请等待完成后再兑换'
                ];
                const isPublicError = publicMessages.includes(error.message)
                    || error.message.startsWith('余额不足')
                    || error.message === '余额不足';
                return res.status(isPublicError ? 400 : 500).json({
                    success: false,
                    message: isPublicError ? error.message : '兑换失败，请稍后重试'
                });
            } finally {
                client.release();
            }

            const exchangeId = insertResult.rows[0].id;

            console.log(`✅ 用户 ${username} 成功兑换 ${availableGifts[giftType].name} x${quantityNum}，花费 ${costNum} 积分`); // ✅ FIX

            // 礼物将由Windows监听服务处理，无需立即发送
            let deliveryMessage = '';
            if (bilibiliRoomId) {
                console.log('🎁 礼物兑换记录已创建，等待Windows监听服务处理...');
                deliveryMessage = '，礼物正在发送中，请稍候...';
            } else {
                console.log(`⚠️ 用户 ${username} 未绑定B站房间号，跳过礼物发送`);
                deliveryMessage = '，请先绑定B站房间号以发送礼物';
            }

            // 🛡️ 预扣机制：返回扣费后的余额
            res.json({
                success: true,
                message: `兑换成功${deliveryMessage}`,
                exchangeId,
                newBalance: currentBalance - costNum, // ✅ FIX
                deliveryStatus: bilibiliRoomId ? 'pending' : 'no_room',
                note: '资金已锁定，礼物发送完成后确认扣费'
            });

        } catch (error) {
            console.error('🚨 礼物兑换严重错误:', {
                message: error.message,
                stack: error.stack,
                username: username || 'unknown', // ✅ FIX: 现在不会ReferenceError
                giftType: req.body?.giftType,
                cost: req.body?.cost,
                quantity: req.body?.quantity
            });
            res.status(500).json({
                success: false,
                message: '服务器错误'
            });
        }
    });

    // 获取兑换历史
    app.get('/api/gifts/history', requireLogin, requireAuthorized, async (req, res) => {
        try {
            const username = req.session.user.username;
            const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
            const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
            const offset = (page - 1) * limit;

            // 尝试查询包含quantity字段，如果失败则使用不包含quantity的查询
            let result;
            try {
                result = await pool.query(`
                    SELECT id, gift_type, gift_name, cost, quantity, status, failure_reason,
                           to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as created_at,
                           delivery_status
                    FROM gift_exchanges 
                    WHERE username = $1 
                    ORDER BY created_at DESC 
                    LIMIT $2 OFFSET $3
                `, [username, limit, offset]);
            } catch (error) {
                if (error.code === '42703') { // column does not exist
                    console.log('⚠️ quantity字段不存在，历史记录使用备用查询');
                    result = await pool.query(`
                        SELECT id, gift_type, gift_name, cost, status,
                               to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as created_at,
                               delivery_status
                        FROM gift_exchanges 
                        WHERE username = $1 
                        ORDER BY created_at DESC 
                        LIMIT $2 OFFSET $3
                    `, [username, limit, offset]);
                    // 为每行添加默认quantity
                    result.rows.forEach(row => {
                        row.quantity = 1;
                        row.failure_reason = null;
                    });
                } else {
                    throw error;
                }
            }

            const totalResult = await pool.query(
                'SELECT COUNT(*) as total FROM gift_exchanges WHERE username = $1',
                [username]
            );

            const total = parseInt(totalResult.rows[0].total);

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
    app.get('/api/gift-tasks', requireApiKey, async (req, res) => {
        try {
            // 原子操作：一次完成"领取+返回"，防止并发重复消费
            let result;
            try {
                result = await pool.query(`
                    WITH claimed AS (
                        SELECT id
                        FROM gift_exchanges
                        WHERE delivery_status = 'pending' AND bilibili_room_id IS NOT NULL
                        ORDER BY created_at ASC
                        FOR UPDATE SKIP LOCKED
                        LIMIT 10
                    )
                    UPDATE gift_exchanges AS exchange
                    SET delivery_status = 'processing', processed_at = NOW()
                    FROM claimed
                    WHERE exchange.id = claimed.id
                    RETURNING exchange.id, exchange.gift_type, exchange.bilibili_room_id,
                              exchange.username, exchange.gift_name, exchange.quantity, exchange.created_at
                `);
            } catch (error) {
                if (error.code === '42703') { // column does not exist
                    console.log('⚠️ quantity字段不存在，使用备用查询');
                    result = await pool.query(`
                        WITH claimed AS (
                            SELECT id
                            FROM gift_exchanges
                            WHERE delivery_status = 'pending' AND bilibili_room_id IS NOT NULL
                            ORDER BY created_at ASC
                            FOR UPDATE SKIP LOCKED
                            LIMIT 10
                        )
                        UPDATE gift_exchanges AS exchange
                        SET delivery_status = 'processing', processed_at = NOW()
                        FROM claimed
                        WHERE exchange.id = claimed.id
                        RETURNING exchange.id, exchange.gift_type, exchange.bilibili_room_id,
                                  exchange.username, exchange.gift_name, exchange.created_at
                    `);
                } else {
                    throw error;
                }
            }

            res.json({
                success: true,
                tasks: result.rows.map(row => ({
                    id: row.id,
                    giftId: giftConfig.礼物映射[row.gift_type]?.bilibili_id || row.gift_type,
                    roomId: row.bilibili_room_id,
                    username: row.username,
                    giftName: row.gift_name,
                    quantity: row.quantity || 1, // 如果字段不存在，默认为1
                    createdAt: row.created_at
                }))
            });

        } catch (error) {
            console.error('获取任务队列失败:', error);
            res.status(500).json({
                success: false,
                message: '服务器错误'
            });
        }
    });

    // 标记任务开始处理
    app.post('/api/gift-tasks/:id/start', requireApiKey, async (req, res) => {
        try {
            const taskId = Number(req.params.id);
            if (!Number.isSafeInteger(taskId) || taskId < 1) {
                return res.status(400).json({ success: false, message: '任务ID无效' });
            }

            const result = await pool.query(`
                UPDATE gift_exchanges 
                SET delivery_status = 'processing',
                    processed_at = NOW()
                WHERE id = $1 AND delivery_status IN ('pending', 'processing')
                RETURNING username, gift_name
            `, [taskId]);

            if (result.rows.length > 0) {
                console.log(`🔄 Windows服务开始处理任务 ${taskId}: ${result.rows[0].username} 的 ${result.rows[0].gift_name}`);
                res.json({ success: true, message: '任务开始处理' });
            } else {
                res.status(404).json({ success: false, message: '任务未找到或已被处理' });
            }
        } catch (error) {
            console.error('标记任务开始失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    // 标记任务完成
    app.post('/api/gift-tasks/:id/complete', requireApiKey, async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            const taskId = Number.parseInt(req.params.id, 10);
            if (!Number.isInteger(taskId) || taskId < 1) {
                return res.status(400).json({ success: false, message: '任务ID无效' });
            }
            await client.query('BEGIN');
            const taskResult = await client.query(`
                SELECT username, gift_name, cost, status, quantity, delivery_status
                FROM gift_exchanges
                WHERE id = $1
                FOR UPDATE
            `, [taskId]);

            if (taskResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: '任务不存在' });
            }

            const { username, gift_name, cost, status, quantity, delivery_status } = taskResult.rows[0];
            if (status === 'completed') {
                await client.query('ROLLBACK');
                await enqueueNextStoredBlindbox(username, taskId);
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
            const quantityNum = Number(quantity);
            const costNum = Number(cost);
            if (!Number.isInteger(quantityNum) || quantityNum < 1 || !Number.isFinite(costNum) || costNum < 0) {
                throw new Error('任务金额或数量无效');
            }
            const partialSuccess = (req.body.partialSuccess ?? req.body.partial_success) === true;
            const rawActual = Number(req.body.actualQuantity ?? req.body.actual_quantity);
            const rawRequested = Number(req.body.requestedQuantity ?? req.body.requested_quantity);
            const hasActualQuantity = req.body.actualQuantity !== undefined || req.body.actual_quantity !== undefined;
            const hasRequestedQuantity = req.body.requestedQuantity !== undefined || req.body.requested_quantity !== undefined;
            if (hasRequestedQuantity && (!Number.isInteger(rawRequested) || rawRequested !== quantityNum)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '请求数量与任务不匹配' });
            }
            if (partialSuccess && (!Number.isInteger(rawActual) || rawActual < 1 || rawActual >= quantityNum)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '部分成功数量无效' });
            }
            if (!partialSuccess && hasActualQuantity && (!Number.isInteger(rawActual) || rawActual !== quantityNum)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '成功数量与任务不匹配' });
            }
            const actualQuantity = partialSuccess ? rawActual : quantityNum;
            const actualCost = Math.round((costNum / quantityNum) * actualQuantity);
            const refundAmount = Math.max(0, costNum - actualCost);

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

            const confirmation = await BalanceLogger.updateBalance({
                username,
                amount: 0,
                operationType: partialSuccess ? 'gift_delivery_partial' : 'gift_delivery_success',
                description: `礼物发送${partialSuccess ? '部分' : ''}成功确认: ${gift_name} ${actualQuantity}/${quantityNum}`,
                gameData: {
                    taskId,
                    gift_name,
                    lockedAmount: costNum,
                    actualCost,
                    refundAmount,
                    actualQuantity,
                    partialSuccess
                },
                requireSufficientBalance: false,
                client,
                managedTransaction: true
            });
            if (!confirmation.success) throw new Error(confirmation.message || '确认日志写入失败');

            const finalDeliveryStatus = partialSuccess ? 'partial_success' : 'success';
            await client.query(`
                UPDATE gift_exchanges
                SET delivery_status = $2,
                    status = 'completed',
                    processed_at = NOW()
                WHERE id = $1 AND status = 'funds_locked'
            `, [taskId, finalDeliveryStatus]);

            await client.query(`
                UPDATE wish_inventory
                SET status = 'sent',
                    sent_at = (NOW() AT TIME ZONE 'Asia/Shanghai'),
                    last_failure_reason = NULL,
                    updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai')
                WHERE gift_exchange_id = $1
            `, [taskId]);
            await client.query('COMMIT');
            await enqueueNextStoredBlindbox(username, taskId);
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

    // 已领取任务的外部副作用可能已经发生，不能自动重发或退款。
    app.post('/api/gift-tasks/reset-stuck', requireApiKey, async (req, res) => {
        try {
            const result = await pool.query(`
                UPDATE gift_exchanges 
                SET delivery_status = 'uncertain',
                    failure_reason = '发送服务已领取任务，但超时未确认结果',
                    updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai')
                WHERE delivery_status = 'processing' 
                AND processed_at < NOW() - INTERVAL '5 minutes'
                RETURNING id, username, gift_name
            `);

            const resetCount = result.rows.length;
            console.log(`标记了 ${resetCount} 个结果待确认的任务`);

            result.rows.forEach(row => {
                console.log(`  - 任务 ${row.id}: ${row.username} 的 ${row.gift_name}`);
            });

            res.json({
                success: true,
                message: `标记了 ${resetCount} 个结果待确认的任务`,
                resetTasks: result.rows
            });
        } catch (error) {
            console.error('重置卡住任务失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.post('/api/gift-tasks/:id/uncertain', requireApiKey, async (req, res) => {
        try {
            const taskId = Number(req.params.id);
            if (!Number.isSafeInteger(taskId) || taskId < 1) {
                return res.status(400).json({ success: false, message: '任务ID无效' });
            }
            const reason = String(req.body?.reason || '发送结果无法确认').trim().slice(0, 1000) || '发送结果无法确认';
            const result = await pool.query(`
                UPDATE gift_exchanges
                SET delivery_status = 'uncertain',
                    failure_reason = $2,
                    updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai')
                WHERE id = $1
                  AND status = 'funds_locked'
                  AND delivery_status = 'processing'
                RETURNING id
            `, [taskId, reason]);
            if (result.rows.length > 0) {
                return res.json({ success: true, message: '任务已标记为结果待确认' });
            }
            const existing = await pool.query(
                'SELECT status, delivery_status FROM gift_exchanges WHERE id = $1',
                [taskId]
            );
            if (existing.rows.length === 0) {
                return res.status(404).json({ success: false, message: '任务不存在' });
            }
            if (existing.rows[0].delivery_status === 'uncertain'
                || ['completed', 'failed'].includes(existing.rows[0].status)) {
                return res.json({ success: true, message: '任务已有最终或待确认状态' });
            }
            return res.status(409).json({ success: false, message: '任务状态不允许标记待确认' });
        } catch (error) {
            console.error('标记礼物任务待确认失败:', error);
            return res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    // 标记任务失败
    app.post('/api/gift-tasks/:id/fail', requireApiKey, async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            const taskId = Number.parseInt(req.params.id, 10);
            if (!Number.isInteger(taskId) || taskId < 1) {
                return res.status(400).json({ success: false, message: '任务ID无效' });
            }
            const errorMessage = String(req.body.error || '礼物发送失败').trim().slice(0, 1000) || '礼物发送失败';

            await client.query('BEGIN');
            const taskResult = await client.query(`
                SELECT username, gift_name, cost, status, quantity, delivery_status
                FROM gift_exchanges
                WHERE id = $1
                FOR UPDATE
            `, [taskId]);

            if (taskResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: '任务不存在' });
            }

            const { username, gift_name, cost, status, quantity, delivery_status } = taskResult.rows[0];
            if (status === 'failed') {
                await client.query('ROLLBACK');
                return res.json({ success: true, message: '任务已标记失败' });
            }
            if (status !== 'funds_locked') {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '任务状态不允许失败处理' });
            }
            if (!['processing', 'uncertain'].includes(delivery_status)) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '任务尚未被发送服务领取' });
            }
            if (delivery_status === 'uncertain' && req.body.confirmedFailure !== true) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    success: false,
                    message: '结果待确认任务必须明确确认发送失败后才能退款'
                });
            }

            const quantityNum = Number(quantity);
            const costNum = Number(cost);
            if (!Number.isInteger(quantityNum) || quantityNum < 1 || !Number.isFinite(costNum) || costNum < 0) {
                throw new Error('任务金额或数量无效');
            }
            const partialSuccess = (req.body.partialSuccess ?? req.body.partial_success) === true;
            if (partialSuccess) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '部分成功必须通过完成接口确认' });
            }
            const actualQuantity = 0;
            const actualCost = Math.round((costNum / quantityNum) * actualQuantity);
            const refundAmount = Math.max(0, costNum - actualCost);

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
                        actualCost,
                        refundAmount,
                        errorMessage,
                        quantity: quantityNum,
                        actualQuantity,
                        partialSuccess
                    },
                    requireSufficientBalance: false,
                    client,
                    managedTransaction: true
                });

                if (!refundResult.success) {
                    throw new Error(refundResult.message || '退款失败');
                }
            }

            await client.query(`
                UPDATE gift_exchanges
                SET delivery_status = 'failed',
                    status = 'failed',
                    failure_reason = $2,
                    processed_at = NOW()
                WHERE id = $1 AND status = 'funds_locked'
            `, [taskId, errorMessage]);

            await client.query(`
                UPDATE wish_inventory
                SET status = 'stored',
                    gift_exchange_id = NULL,
                    last_failure_reason = $2,
                    expires_at = (date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai') + interval '1 day' + interval '23 hours 59 minutes 59 seconds'),
                    updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai')
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
};
