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
    const crypto = require('crypto');

    // 自动处理卡住的礼物任务，超时退款
    const monitorStuckGiftTasks = () => {
        const INTERVAL_MS = 10 * 60 * 1000; // 10分钟扫描一次
        const TIMEOUT_SQL = `created_at < (NOW() AT TIME ZONE 'Asia/Shanghai') - INTERVAL '30 minutes'`;
        setInterval(async () => {
            try {
                const stuckTasks = await pool.query(`
                    SELECT id, username, cost
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
                        const refund = await BalanceLogger.updateBalance({
                            username: task.username,
                            amount: task.cost,
                            operationType: 'gift_timeout_refund',
                            description: `礼物任务超时自动退款: ${task.cost} 电币`,
                            requireSufficientBalance: false,
                            client,
                            managedTransaction: true
                        });
                        if (!refund.success) {
                            await client.query('ROLLBACK');
                            console.error(`自动退款失败，任务ID=${task.id}, 用户=${task.username}`);
                            continue;
                        }
                        await client.query(
                            `UPDATE gift_exchanges 
                             SET status = 'failed', delivery_status = 'timeout', updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai') 
                             WHERE id = $1`,
                            [task.id]
                        );
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
    };

    function verifyGiftTaskHMAC(taskId, timestamp, signature) {
        const secret = process.env.GIFT_TASKS_HMAC_SECRET;
        const enforce = process.env.GIFT_TASKS_HMAC_ENFORCE === 'true';
        if (!secret || !timestamp || !signature) {
            return enforce ? { valid: false, error: '签名缺失' } : { valid: true };
        }
        const payload = `${taskId}:${timestamp}`;
        const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
        if (signature !== expected) return { valid: false, error: '签名无效' };
        const age = Date.now() - Number(timestamp);
        if (!Number.isFinite(age) || age < 0 || age > 300000) {
            return { valid: false, error: '请求已过期' };
        }
        return { valid: true };
    }

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
            const stateResult = await pool.query(
                'SELECT running FROM pk_runner_state WHERE username = $1',
                [username]
            );
            const running = stateResult.rows.length > 0 ? !!stateResult.rows[0].running : false;
            res.json({ success: true, running });
        } catch (error) {
            console.error('PK status error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.post('/api/pk/start', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
        try {
            const username = req.session.user.username;
            const roomResult = await pool.query(
                'SELECT bilibili_room_id FROM users WHERE username = $1',
                [username]
            );
            const roomId = roomResult.rows[0]?.bilibili_room_id;
            if (!roomId) {
                return res.status(400).json({ success: false, message: '请先绑定B站房间号' });
            }
            const pendingResult = await pool.query(
                "SELECT COUNT(*) AS count FROM pk_tasks WHERE username = $1 AND status IN ('pending','processing') AND action = 'start'",
                [username]
            );
            if (Number(pendingResult.rows[0]?.count || 0) > 0) {
                return res.json({ success: true, queued: true, message: '已在队列中' });
            }
            await pool.query(
                `INSERT INTO pk_tasks (username, room_id, action, status)
                 VALUES ($1, $2, 'start', 'pending')`,
                [username, String(roomId)]
            );
            return res.json({ success: true, queued: true });
        } catch (error) {
            console.error('PK start error:', error);
            return res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.post('/api/pk/stop', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, (req, res) => {
        try {
            const username = req.session.user.username;
            pool.query(
                "SELECT COUNT(*) AS count FROM pk_tasks WHERE username = $1 AND status IN ('pending','processing') AND action = 'stop'",
                [username]
            ).then((pendingResult) => {
                if (Number(pendingResult.rows[0]?.count || 0) > 0) {
                    return res.json({ success: true, queued: true, message: '已在队列中' });
                }
                return pool.query(
                    `INSERT INTO pk_tasks (username, action, status)
                     VALUES ($1, 'stop', 'pending')`,
                    [username]
                ).then(() => res.json({ success: true, queued: true }));
            }).catch((error) => {
                console.error('PK stop error:', error);
                res.status(500).json({ success: false, message: '服务器错误' });
            });
        } catch (error) {
            console.error('PK stop error:', error);
            return res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.get('/api/pk-tasks', requireApiKey, async (req, res) => {
        try {
            const result = await pool.query(`
                UPDATE pk_tasks
                SET status = 'processing', processed_at = NOW()
                WHERE id IN (
                    SELECT id FROM pk_tasks
                    WHERE status = 'pending'
                    ORDER BY created_at ASC
                    LIMIT 10
                )
                RETURNING id, username, room_id, action, created_at
            `);
            res.json({ success: true, tasks: result.rows });
        } catch (error) {
            console.error('获取PK任务失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.post('/api/pk-tasks/:id/complete', requireApiKey, async (req, res) => {
        try {
            const taskId = parseInt(req.params.id, 10);
            const result = await pool.query(`
                UPDATE pk_tasks
                SET status = 'completed', processed_at = NOW()
                WHERE id = $1
                RETURNING id
            `, [taskId]);
            if (result.rows.length === 0) {
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
            const taskId = parseInt(req.params.id, 10);
            const errorMessage = req.body?.error || '执行失败';
            const result = await pool.query(`
                UPDATE pk_tasks
                SET status = 'failed', error = $2, processed_at = NOW()
                WHERE id = $1
                RETURNING id
            `, [taskId, errorMessage]);
            if (result.rows.length === 0) {
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
            if (!username || typeof running !== 'boolean') {
                return res.status(400).json({ success: false, message: '参数不完整' });
            }
            await pool.query(`
                INSERT INTO pk_runner_state (username, room_id, running, pid, updated_at)
                VALUES ($1, $2, $3, $4, (NOW() AT TIME ZONE 'Asia/Shanghai'))
                ON CONFLICT (username)
                DO UPDATE SET room_id = EXCLUDED.room_id, running = EXCLUDED.running, pid = EXCLUDED.pid, updated_at = EXCLUDED.updated_at
            `, [
                username,
                roomId ? String(roomId) : null,
                running,
                Number.isFinite(Number(pid)) ? Number(pid) : null
            ]);
            res.json({ success: true });
        } catch (error) {
            console.error('PK runner update error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.post('/api/pk/report', requireApiKey, async (req, res) => {
        try {
            const { username, roomId, giftIds, script, success, reason, ticketCount } = req.body || {};
            if (!username || !Array.isArray(giftIds)) {
                return res.status(400).json({ success: false, message: '参数不完整' });
            }
            const parseTicketCount = (value) => {
                const num = Number(value);
                if (!Number.isFinite(num) || num <= 0) {
                    return null;
                }
                return Math.round(num);
            };
            const computeTicketCountFromGifts = () => {
                const poolConfig = giftConfig?.礼物池配置 || {};
                let total = 0;
                giftIds.forEach((gid) => {
                    const entry = poolConfig[String(gid)];
                    if (!entry) {
                        return;
                    }
                    const price = Array.isArray(entry) ? Number(entry[1]) : Number(entry?.value);
                    if (!Number.isFinite(price)) {
                        return;
                    }
                    total += Math.round(price * 10);
                });
                return total > 0 ? total : null;
            };
            const resolvedTicketCount = parseTicketCount(ticketCount) ?? computeTicketCountFromGifts();
            await pool.query(`
                INSERT INTO pk_gift_logs (username, room_id, gift_ids, ticket_count, script_name, success, reason)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                username,
                roomId ? String(roomId) : null,
                JSON.stringify(giftIds),
                Number.isFinite(resolvedTicketCount) ? resolvedTicketCount : null,
                script ? String(script) : null,
                typeof success === 'boolean' ? success : null,
                reason ? String(reason) : null
            ]);
            if (success === true && Number.isFinite(resolvedTicketCount) && resolvedTicketCount > 0) {
                try {
                    await BalanceLogger.updateBalance({
                        username,
                        amount: -resolvedTicketCount,
                        operationType: 'pk_ticket',
                        description: `PK自动上票扣费：${resolvedTicketCount} 电币`,
                        ipAddress: req.ip,
                        userAgent: req.get('User-Agent')
                    });
                } catch (balanceError) {
                    console.error('PK ticket balance deduct error:', balanceError);
                }
            }
            return res.json({ success: true });
        } catch (error) {
            console.error('PK report error:', error);
            return res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    // 礼物兑换
    app.post('/api/gifts/exchange', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
        console.log('🚀 [DEBUG] 礼物兑换API开始执行');
        console.log('🚀 [DEBUG] 请求体:', JSON.stringify(req.body, null, 2));
        console.log('🚀 [DEBUG] 用户session:', req.session?.user);

        // ✅ FIX: 提前声明，避免外层catch作用域拿不到
        let username = 'unknown';
        // ✅ FIX: 事务内拿到的值需要在事务外继续用
        let currentBalance;
        let bilibiliRoomId;
        let existingExchange = null;
        // 如果未传入，则后端自动生成，避免NULL导致无法去重
        const crypto = require('crypto');
        const idempotencyKey = req.body?.idempotencyKey
            || req.body?.idempotency_key
            || `auto-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;

        try {
            const { giftType, cost, quantity = 1 } = req.body;
            username = req.session.user.username; // ✅ FIX: 不再用const，赋值到外层变量
            const clientIP = req.clientIP;
            const userAgent = req.userAgent;

            console.log(`🔍 [DEBUG] 解析后参数: giftType=${giftType}, cost=${cost}, quantity=${quantity}, username=${username}`);
            console.log(`🔍 [DEBUG] 客户端信息: IP=${clientIP}, UA=${userAgent}`);

            // ✅ FIX: 统一把 cost / quantity 转成数字，避免 "150" !== 150
            const costNum = Number(cost);
            const quantityNum = Number(quantity);

            // 验证输入参数
            if (!giftType || !Number.isFinite(costNum) || !Number.isInteger(costNum) || !Number.isFinite(quantityNum) || !Number.isInteger(quantityNum) || quantityNum < 1) {
                console.log('❌ [DEBUG] 参数验证失败:', { giftType, cost, quantity });
                return res.status(400).json({
                    success: false,
                    message: '参数不完整或数量无效'
                });
            }
            console.log('✅ [DEBUG] 参数验证通过');

            // 验证数量上限
            if (quantityNum > 100) { // ✅ FIX
                return res.status(400).json({
                    success: false,
                    message: '单次最多只能兑换100个礼物'
                });
            }

            // 从配置文件获取可用的礼物类型
            console.log('🔍 [DEBUG] giftConfig状态:', { hasConfig: !!giftConfig, hasMapping: !!giftConfig.礼物映射 });

            const availableGifts = {};
            if (giftConfig.礼物映射) {
                console.log('✅ [DEBUG] 使用配置文件中的礼物映射');
                for (const [key, config] of Object.entries(giftConfig.礼物映射)) {
                    availableGifts[key] = {
                        name: config.名称,
                        cost: config.电币成本,
                        bilibili_id: config.bilibili_id
                    };
                    console.log(`🔍 [DEBUG] 加载礼物: ${key} = ${JSON.stringify(availableGifts[key])}`);
                }
            } else {
                console.log('⚠️ [DEBUG] 配置文件无效，使用备用配置');
                // 备用配置
                availableGifts.heartbox = { name: '心动盲盒', cost: 150, bilibili_id: '32251' };
                availableGifts.fanlight = { name: '粉丝团灯牌', cost: 1, bilibili_id: '31164' };
            }

            console.log('🔍 [DEBUG] 最终可用礼物:', availableGifts);

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
                    message: `价格不匹配，期望价格: ${expectedTotalCost} 电币`
                });
            }

            // 🛡️ 真正的预扣机制：在事务中原子地检查余额、锁住资金并创建任务
            console.log('🔍 [DEBUG] 开始数据库事务操作');
            const client = await pool.connect();
            let insertResult;
            try {
                console.log('🔍 [DEBUG] 开始事务');
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
                console.log(`🔍 [DEBUG] 查询用户 ${username} 的余额和房间号`);
                const lockResult = await client.query(
                    'SELECT balance, bilibili_room_id FROM users WHERE username = $1 FOR UPDATE',
                    [username]
                );
                console.log('🔍 [DEBUG] 数据库查询结果:', lockResult.rows);

                if (lockResult.rows.length === 0) {
                    throw new Error('用户不存在');
                }

                // ✅ FIX: 去掉const解构，写入外层变量供事务外使用
                currentBalance = Number(lockResult.rows[0].balance);
                bilibiliRoomId = lockResult.rows[0].bilibili_room_id;

                console.log(`🔍 [DEBUG] 用户信息: 余额=${currentBalance}, 房间号=${bilibiliRoomId}`);

                if (!bilibiliRoomId) {
                    throw new Error('请先绑定B站房间号再兑换礼物');
                }

                if (currentBalance < costNum) { // ✅ FIX
                    console.log(`❌ [DEBUG] 余额不足: 当前=${currentBalance}, 需要=${costNum}`); // ✅ FIX
                    throw new Error(`余额不足！当前余额: ${currentBalance} 电币，需要: ${costNum} 电币`); // ✅ FIX
                }
                console.log('✅ [DEBUG] 余额检查通过');

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
                console.log('🔍 [DEBUG] 检查是否有pending任务');
                const pendingResult = await client.query(
                    'SELECT COUNT(*) as count FROM gift_exchanges WHERE username = $1 AND delivery_status IN ($2, $3)',
                    [username, 'pending', 'processing']
                );
                console.log('🔍 [DEBUG] pending任务查询结果:', pendingResult.rows);

                if (parseInt(pendingResult.rows[0].count) > 0) {
                    console.log('❌ [DEBUG] 检测到pending任务，阻止兑换');
                    throw new Error('您有礼物正在发送中，请等待完成后再兑换');
                }
                console.log('✅ [DEBUG] 无pending任务，可以继续');

                // 3. 立即锁住资金（从余额中扣除，但标记为frozen）
                console.log(`🔍 [DEBUG] 扣除资金: ${costNum} 电币`); // ✅ FIX
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
                console.log('✅ [DEBUG] 资金扣除完成');

                // 4. 创建任务记录，标记资金已锁定
                console.log('🔍 [DEBUG] 创建礼物兑换任务记录');
                const insertParams = [username, giftType, availableGifts[giftType].name, costNum, quantityNum, bilibiliRoomId, 'pending', idempotencyKey];
                console.log('🔍 [DEBUG] INSERT参数:', insertParams);

                insertResult = await client.query(`
                    INSERT INTO gift_exchanges (
                        username, gift_type, gift_name, cost, quantity, status, created_at,
                        bilibili_room_id, delivery_status, idempotency_key
                    ) VALUES ($1, $2, $3, $4, $5, 'funds_locked', NOW(), $6, $7, $8)
                    RETURNING id
                `, insertParams);
                console.log('✅ [DEBUG] 任务记录创建成功:', insertResult.rows);

                console.log('🔍 [DEBUG] 提交事务');
                await client.query('COMMIT');
                console.log('✅ [DEBUG] 事务提交成功');

                console.log(`🔒 用户 ${username} 资金已锁定: ${costNum} 电币，剩余余额: ${currentBalance - costNum} 电币`); // ✅ FIX

            } catch (error) {
                console.log('💥 [DEBUG] 事务中发生错误:', error.message);
                console.log('💥 [DEBUG] 错误堆栈:', error.stack);
                await client.query('ROLLBACK');
                console.log('🔍 [DEBUG] 事务已回滚');
                console.error('兑换事务失败:', error.message);
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            } finally {
                console.log('🔍 [DEBUG] 释放数据库连接');
                client.release();
            }

            const exchangeId = insertResult.rows[0].id;

            console.log(`✅ 用户 ${username} 成功兑换 ${availableGifts[giftType].name} x${quantityNum}，花费 ${costNum} 电币`); // ✅ FIX

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
                message: `服务器错误: ${error.message}`
            });
        }
    });

    // 获取兑换历史
    app.get('/api/gifts/history', requireLogin, requireAuthorized, async (req, res) => {
        try {
            const username = req.session.user.username;
            const page = parseInt(req.query.page) || 1;
            const limit = Math.min(parseInt(req.query.limit) || 20, 50);
            const offset = (page - 1) * limit;

            // 尝试查询包含quantity字段，如果失败则使用不包含quantity的查询
            let result;
            try {
                result = await pool.query(`
                    SELECT gift_type, gift_name, cost, quantity, status, failure_reason,
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
                        SELECT gift_type, gift_name, cost, status,
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
                    UPDATE gift_exchanges 
                    SET delivery_status = 'processing', processed_at = NOW()
                    WHERE id IN (
                        SELECT id FROM gift_exchanges 
                        WHERE delivery_status = 'pending' AND bilibili_room_id IS NOT NULL
                        ORDER BY created_at ASC 
                        LIMIT 10
                    )
                    RETURNING id, gift_type, bilibili_room_id, username, gift_name, quantity, created_at
                `);
            } catch (error) {
                if (error.code === '42703') { // column does not exist
                    console.log('⚠️ quantity字段不存在，使用备用查询');
                    result = await pool.query(`
                        UPDATE gift_exchanges 
                        SET delivery_status = 'processing', processed_at = NOW()
                        WHERE id IN (
                            SELECT id FROM gift_exchanges 
                            WHERE delivery_status = 'pending' AND bilibili_room_id IS NOT NULL
                            ORDER BY created_at ASC 
                            LIMIT 10
                        )
                        RETURNING id, gift_type, bilibili_room_id, username, gift_name, created_at
                    `);
                } else {
                    throw error;
                }
            }

            // 加载礼物配置
            const fs = require('fs');
            const giftConfig = JSON.parse(fs.readFileSync('./gift-codes.json', 'utf8'));

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
            const taskId = parseInt(req.params.id);

            const result = await pool.query(`
                UPDATE gift_exchanges 
                SET delivery_status = 'processing',
                    processed_at = NOW()
                WHERE id = $1 AND delivery_status = 'pending'
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
            res.status(500).json({ success: false, message: '服务器错误', error: error.message });
        }
    });

    // 标记任务完成
    app.post('/api/gift-tasks/:id/complete', requireApiKey, async (req, res) => {
        try {
            const taskId = parseInt(req.params.id);
            const { timestamp, signature } = req.body || {};
            const verification = verifyGiftTaskHMAC(taskId, timestamp, signature);
            if (!verification.valid) {
                const enforce = process.env.GIFT_TASKS_HMAC_ENFORCE === 'true';
                // 仅当明确启用强制并且传入了签名却校验失败时才阻断；缺失签名时放行，避免任务卡住
                if (enforce && timestamp && signature) {
                    return res.status(401).json({ success: false, message: verification.error || '签名校验失败' });
                }
            }

            // 🛡️ 预扣机制：获取任务信息并执行部分成功的扣费
            // ✅ 兼容 Windows(Python) snake_case 与 JS camelCase
            const actualQuantityVal = (req.body.actualQuantity ?? req.body.actual_quantity);
            const requestedQuantityVal = (req.body.requestedQuantity ?? req.body.requested_quantity);
            const partialSuccessVal = (req.body.partialSuccess ?? req.body.partial_success);
            const actualQuantity = Number.isFinite(Number(actualQuantityVal)) ? parseInt(actualQuantityVal, 10) : null;
            const requestedQuantity = Number.isFinite(Number(requestedQuantityVal)) ? parseInt(requestedQuantityVal, 10) : null;
            const partialSuccess = !!partialSuccessVal;
            const clampQuantity = (val, fallback) => {
                if (!Number.isFinite(val) || val < 0) return fallback;
                return val;
            };

            const taskResult = await pool.query(`
                SELECT username, gift_name, cost, status, quantity
                FROM gift_exchanges 
                WHERE id = $1
            `, [taskId]);

            if (taskResult.rows.length === 0) {
                return res.status(404).json({ success: false, message: '任务不存在' });
            }

            const { username, gift_name, cost, status, quantity } = taskResult.rows[0];
            const effectiveRequested = clampQuantity(requestedQuantity, quantity);
            const effectiveActual = clampQuantity(actualQuantity, quantity);

            // 🔒 资金已锁定状态的任务，成功时确认扣费（已经扣除了，标记为完成即可）
            if (status === 'funds_locked') {
                // 🛡️ 计算实际应扣费用和退款（基于实际发送数量）
                const unitCost = cost / quantity; // 单个礼物的成本
                const actualCost = Math.round(unitCost * (effectiveActual || effectiveRequested));
                const refundAmount = Math.max(0, cost - actualCost); // 需要退还的金额

                if (partialSuccess && refundAmount > 0) {
                    console.log(`⚠️ 任务 ${taskId} 部分成功: 原计划 ${quantity} 个，实际成功 ${effectiveActual} 个`);
                    console.log(`💰 资金处理: 锁定 ${cost} 电池，实际消费 ${actualCost} 电池，退还 ${refundAmount} 电池`);

                    // 退还多余的资金
                    await BalanceLogger.updateBalance({
                        username,
                        amount: refundAmount,
                        operationType: 'gift_delivery_refund',
                        description: `礼物部分成功退款 ${refundAmount} 电币`,
                        requireSufficientBalance: false
                    });
                }

                // 记录最终的扣费日志
                const balanceResult = await BalanceLogger.updateBalance({
                    username: username,
                    amount: 0, // 资金已经在兑换时锁定了，这里只是记录
                    operationType: partialSuccess ? 'gift_delivery_partial' : 'gift_delivery_success',
                    description: `礼物发送${partialSuccess ? '部分' : ''}成功确认: ${gift_name} ${effectiveActual || quantity}/${quantity}${refundAmount > 0 ? `，退还 ${refundAmount} 电池` : ''}`,
                    gameData: {
                        taskId,
                        gift_name,
                        lockedAmount: cost,
                        actualCost: actualCost,
                        refundAmount: refundAmount,
                        requestedQuantity: effectiveRequested,
                        actualQuantity: effectiveActual || quantity,
                        partialSuccess: partialSuccess || false
                    },
                    requireSufficientBalance: false // 不检查余额，因为只是记录
                });

            console.log(`💰 任务 ${taskId} 资金确认: 锁定 ${cost} 电池，消费 ${actualCost} 电池，退还 ${refundAmount} 电池`);
            }

            const finalDeliveryStatus = partialSuccess ? 'partial_success' : 'success';
            // 标记任务完成
            const result = await pool.query(`
                UPDATE gift_exchanges 
                SET delivery_status = $2,
                    status = 'completed',
                    processed_at = NOW()
                WHERE id = $1
                RETURNING username, gift_name
            `, [taskId, finalDeliveryStatus]);

            if (result.rows.length > 0) {
                try {
                    await pool.query(`
                        UPDATE wish_inventory
                        SET status = 'sent',
                            sent_at = (NOW() AT TIME ZONE 'Asia/Shanghai'),
                            last_failure_reason = NULL,
                            updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai')
                        WHERE gift_exchange_id = $1
                    `, [taskId]);

                    if (enqueueWishInventorySend) {
                        const batchInfo = await pool.query(`
                            SELECT id, username, source_type, source_batch_id, batch_order
                            FROM wish_inventory
                            WHERE gift_exchange_id = $1
                            LIMIT 1
                        `, [taskId]);

                        const batchRow = batchInfo.rows[0];
                        if (batchRow?.source_type === 'blindbox' && batchRow.source_batch_id) {
                            const nextItem = await pool.query(`
                                SELECT id
                                FROM wish_inventory
                                WHERE username = $1
                                  AND source_type = 'blindbox'
                                  AND source_batch_id = $2
                                  AND status = 'stored'
                                ORDER BY batch_order ASC
                                LIMIT 1
                            `, [batchRow.username, batchRow.source_batch_id]);

                            if (nextItem.rows.length > 0) {
                                enqueueWishInventorySend({
                                    inventoryId: nextItem.rows[0].id,
                                    username: batchRow.username
                                }).catch((err) => {
                                    console.error('Blindbox enqueue next failed:', err);
                                });
                            }
                        }
                    }
                } catch (dbError) {
                    console.error('更新背包发送状态失败:', dbError);
                }

                console.log(`✅ Windows服务完成任务 ${taskId}: ${result.rows[0].username} 的 ${result.rows[0].gift_name}`);
                res.json({ success: true, message: '任务完成' });
            } else {
                res.status(404).json({ success: false, message: '任务不存在' });
            }

        } catch (error) {
            console.error('标记任务完成失败:', error);
            res.status(500).json({
                success: false,
                message: '服务器错误'
            });
        }
    });

    // 重置卡住的任务（超过5分钟的processing任务重置为pending）
    app.post('/api/gift-tasks/reset-stuck', requireApiKey, async (req, res) => {
        try {
            const result = await pool.query(`
                UPDATE gift_exchanges 
                SET delivery_status = 'pending',
                    processed_at = NULL
                WHERE delivery_status = 'processing' 
                AND processed_at < NOW() - INTERVAL '5 minutes'
                RETURNING id, username, gift_name
            `);

            const resetCount = result.rows.length;
            console.log(`🔄 重置了 ${resetCount} 个卡住的任务`);

            result.rows.forEach(row => {
                console.log(`  - 任务 ${row.id}: ${row.username} 的 ${row.gift_name}`);
            });

            res.json({
                success: true,
                message: `重置了 ${resetCount} 个卡住的任务`,
                resetTasks: result.rows
            });
        } catch (error) {
            console.error('重置卡住任务失败:', error);
            res.status(500).json({ success: false, message: '服务器错误', error: error.message });
        }
    });

    // 标记任务失败
    app.post('/api/gift-tasks/:id/fail', requireApiKey, async (req, res) => {
        try {
            const taskId = parseInt(req.params.id);
            const errorMessage = req.body.error || '礼物发送失败';

            // ✅ 兼容 Windows(Python) snake_case 与 JS camelCase
            const actualQuantityVal = (req.body.actualQuantity ?? req.body.actual_quantity);
            const partialSuccessVal = (req.body.partialSuccess ?? req.body.partial_success);
            const actualQuantity = Number.isFinite(Number(actualQuantityVal)) ? parseInt(actualQuantityVal, 10) : null;
            const partialSuccess = !!partialSuccessVal;

            // 🛡️ 预扣机制：任务失败时必须退还锁定的资金
            const taskResult = await pool.query(`
                SELECT username, gift_name, cost, status, quantity
                FROM gift_exchanges 
                WHERE id = $1
            `, [taskId]);

            if (taskResult.rows.length === 0) {
                return res.status(404).json({ success: false, message: '任务不存在' });
            }

            const { username, gift_name, cost, status, quantity } = taskResult.rows[0];

            // 🔒 如果资金已锁定，需要退还给用户
            if (status === 'funds_locked') {
                // ✅ 计算实际应退款金额
                let refundAmount = cost; // 默认全退（保持你原有行为）
                let descExtra = '';

                if (partialSuccess && actualQuantity !== null && actualQuantity > 0 && quantity > 0) {
                    const unitCost = cost / quantity;              // 单价
                    const actualCost = Math.round(unitCost * actualQuantity);
                    refundAmount = Math.max(0, cost - actualCost); // 只退未送出的差额
                    descExtra = `（部分成功：${actualQuantity}/${quantity}，退还差额 ${refundAmount} 电币）`;
                }

                console.log(`🔄 任务 ${taskId} 失败，正在退还锁定资金 ${refundAmount} 电币给用户 ${username}`);

                // 使用 BalanceLogger 安全地退还资金并记录日志
                const refundResult = await BalanceLogger.updateBalance({
                    username: username,
                    amount: refundAmount,
                    operationType: 'gift_delivery_failed_refund',
                    description: `礼物发送失败退款: ${gift_name} ${quantity}个，退还 ${refundAmount} 电币 - 原因: ${errorMessage}${descExtra}`,
                    gameData: {
                        taskId,
                        gift_name,
                        originalCost: cost,
                        refundAmount: refundAmount,
                        errorMessage: errorMessage,
                        quantity: quantity,
                        actualQuantity: actualQuantity,
                        partialSuccess: partialSuccess
                    },
                    requireSufficientBalance: false
                });

                if (!refundResult.success) {
                    console.error(`❌ 退款失败: ${refundResult.message}`);
                    return res.status(500).json({
                        success: false,
                        message: `任务失败且退款失败: ${refundResult.message}`
                    });
                }

                console.log(`✅ 成功退还 ${refundAmount} 电币给 ${username}，新余额: ${refundResult.balance}`);
            }

            // 标记任务为失败
            const result = await pool.query(`
                UPDATE gift_exchanges 
                SET delivery_status = 'failed',
                    status = 'failed',
                    failure_reason = $2,
                    processed_at = NOW()
                WHERE id = $1
                RETURNING username, gift_name, cost
            `, [taskId, errorMessage]);

            if (result.rows.length > 0) {
                try {
                    await pool.query(`
                        UPDATE wish_inventory
                        SET status = 'stored',
                            gift_exchange_id = NULL,
                            last_failure_reason = $2,
                            expires_at = (date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai') + interval '1 day' + interval '23 hours 59 minutes 59 seconds'),
                            updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai')
                        WHERE gift_exchange_id = $1
                    `, [taskId, errorMessage]);
                } catch (dbError) {
                    console.error('更新背包失败回退失败:', dbError);
                }

                console.log(`❌ 任务 ${taskId} 标记为失败: ${username} 的 ${gift_name} - ${errorMessage}`);
                if (status === 'funds_locked') {
                    console.log('💰 资金处理: 已按规则退还（可能为差额退款）');
                } else {
                    console.log(`💰 资金处理: 无需退款（状态: ${status}）`);
                }
                res.json({ success: true, message: '任务标记为失败，资金已安全退还' });
            } else {
                res.status(404).json({ success: false, message: '任务不存在' });
            }

        } catch (error) {
            console.error('标记任务失败:', error);
            res.status(500).json({
                success: false,
                message: '服务器错误'
            });
        }
    });

    // 启动卡住任务自动处理
    monitorStuckGiftTasks();
};
