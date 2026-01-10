module.exports = function registerWishRoutes(app, deps) {
    const {
        pool,
        BalanceLogger,
        GameLogic,
        getWishConfig,
        requireLogin,
        requireAuthorized,
        security,
        generateCSRFToken,
        broadcastDanmaku,
        enqueueWishInventorySend
    } = deps;
    const { randomInt, randomBytes } = require('crypto');
    const randomFloat = () => randomInt(0, 1000000) / 1000000;
    const rejectWhenOverloaded = (req, res, next) => {
        if (pool.waitingCount > 30) {
            return res.status(503).json({ success: false, message: '服务器繁忙，请稍后重试' });
        }
        return next();
    };
    const lockErrorCodes = new Set(['55P03', '57014', '40P01', '40001']); // lock/statement timeout, deadlock, serialization
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    app.get('/wish', requireLogin, requireAuthorized, security.basicRateLimit, (req, res) => {
        // 初始化session
        if (!req.session.initialized) {
            req.session.initialized = true;
            req.session.createdAt = Date.now();
            // 🛡️ 安全修复：统一使用csrf库生成token
            generateCSRFToken(req);
        }

        const username = req.session.user.username;
        let balance = 0;

        pool.query(
            'SELECT balance FROM users WHERE username = $1',
            [username]
        ).then((result) => {
            balance = result.rows.length > 0 ? parseFloat(result.rows[0].balance) : 0;
            res.render('wish', {
                username,
                balance,
                csrfToken: req.session.csrfToken,
                canWishTest: username === 'hokboost'
            });
        }).catch((dbError) => {
            console.error('Database query error:', dbError);
            res.render('wish', {
                username,
                balance,
                csrfToken: req.session.csrfToken,
                canWishTest: username === 'hokboost'
            });
        });
    });

    app.post('/api/wish/play', rejectWhenOverloaded, requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
        const username = req.session.user.username;
        const giftType = req.body.giftType || 'deepsea_singer';
        const config = getWishConfig(giftType);
        if (!config) {
            return res.status(400).json({ success: false, message: '无效的祈愿礼物类型' });
        }

        const wishCost = config.cost;
        const successRate = config.successRate;
        const guaranteeThreshold = Number.isFinite(config.guaranteeCount) ? (config.guaranteeCount - 1) : null;
        const rewardName = config.name;
        const rewardValue = config.rewardValue;

        const maxAttempts = 2;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(`SET LOCAL lock_timeout = '10s'; SET LOCAL statement_timeout = '15s';`);

                // 锁定祈愿进度
                let progressResult = await client.query(
                    'SELECT * FROM wish_progress WHERE username = $1 AND gift_type = $2 FOR UPDATE',
                    [username, giftType]
                );

                if (progressResult.rows.length === 0) {
                    await client.query(`
                        INSERT INTO wish_progress (username, gift_type, total_wishes, consecutive_fails, total_spent, total_rewards_value)
                        VALUES ($1, $2, 0, 0, 0, 0)
                    `, [username, giftType]);

                    progressResult = await client.query(
                        'SELECT * FROM wish_progress WHERE username = $1 AND gift_type = $2 FOR UPDATE',
                        [username, giftType]
                    );
                }

                const progress = progressResult.rows[0];

                // 扣除祈愿费用（同一事务）
                const betResult = await BalanceLogger.updateBalance({
                    username: username,
                    amount: -wishCost,
                    operationType: 'wish_bet',
                    description: `幸运祈愿：${wishCost} 电币`,
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent'),
                    client,
                    managedTransaction: true
                });

                if (!betResult.success) {
                    const shouldRetry = betResult.message && betResult.message.includes('系统繁忙');
                    await client.query('ROLLBACK');
                    if (shouldRetry && attempt < maxAttempts) {
                        await sleep(150);
                        continue;
                    }
                    return res.status(400).json({ success: false, message: betResult.message });
                }

                const balanceBefore = betResult.balance + wishCost;
                let balanceAfter = betResult.balance;

                // 判断是否成功
                const isGuaranteed = Number.isFinite(guaranteeThreshold) && progress.consecutive_fails >= guaranteeThreshold;
                const randomSuccess = randomFloat() < successRate;
                const success = isGuaranteed || randomSuccess;

                let reward = null;

                if (success) {
                    reward = rewardName;
                    const roomResult = await client.query(
                        'SELECT bilibili_room_id FROM users WHERE username = $1',
                        [username]
                    );
                    const roomId = roomResult.rows[0]?.bilibili_room_id || null;
                    const expiresAt = roomId
                        ? "(date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai') + interval '1 day' + interval '23 hours 59 minutes 59 seconds')"
                        : "'infinity'::timestamptz";

                    await client.query(`
                        INSERT INTO wish_inventory (
                            username, gift_type, gift_name, bilibili_gift_id, status, expires_at,
                            created_at, updated_at
                        )
                        VALUES (
                            $1, $2, $3, $4, 'stored',
                            ${expiresAt},
                            (NOW() AT TIME ZONE 'Asia/Shanghai'),
                            (NOW() AT TIME ZONE 'Asia/Shanghai')
                        )
                    `, [username, giftType, rewardName, config.bilibiliGiftId]);
                }

                // 更新祈愿进度
                const newTotalWishes = progress.total_wishes + 1;
                const newConsecutiveFails = success ? 0 : progress.consecutive_fails + 1;
                const newTotalSpent = progress.total_spent + wishCost;
                const newTotalRewardsValue = progress.total_rewards_value + (success ? rewardValue : 0);

                await client.query(`
                    UPDATE wish_progress 
                    SET total_wishes = $1, consecutive_fails = $2, total_spent = $3, total_rewards_value = $4,
                        last_success_at = CASE WHEN $5 THEN (NOW() AT TIME ZONE 'Asia/Shanghai') ELSE last_success_at END,
                        updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai')
                    WHERE username = $6 AND gift_type = $7
                `, [
                    newTotalWishes,
                    newConsecutiveFails,
                    newTotalSpent,
                    newTotalRewardsValue,
                    success,
                    username,
                    giftType
                ]);

                // 保存祈愿记录
                try {
                    const crypto = require('crypto');
                    const proof = crypto.createHash('sha256')
                        .update(`${username}-wish-${Date.now()}-${randomBytes(8).toString('hex')}`)
                        .digest('hex');

                    await client.query(`
                        INSERT INTO wish_results (
                            username, gift_type, cost, success, reward, reward_value, balance_before, balance_after,
                            wishes_count, is_guaranteed, game_details, created_at
                        ) 
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, (NOW() AT TIME ZONE 'Asia/Shanghai'))
                    `, [
                        username,
                        giftType,
                        wishCost,
                        success,
                        reward,
                        success ? rewardValue : null,
                        balanceBefore,
                        balanceAfter,
                        newTotalWishes,
                        isGuaranteed,
                        JSON.stringify({
                            success_rate: successRate,
                            is_guaranteed: isGuaranteed,
                            consecutive_fails_before: progress.consecutive_fails,
                            proof: proof,
                            timestamp: new Date().toISOString()
                        })
                    ]);
                } catch (dbError) {
                    console.error('祈愿记录存储失败:', dbError);
                }

                // 记录祈愿会话（单次）
                try {
                    await client.query(`
                        INSERT INTO wish_sessions (
                            username, gift_type, gift_name, batch_count, total_cost, success_count, total_reward_value, created_at
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, (NOW() AT TIME ZONE 'Asia/Shanghai'))
                    `, [
                        username,
                        giftType,
                        rewardName,
                        1,
                        wishCost,
                        success ? 1 : 0,
                        success ? rewardValue : 0
                    ]);
                } catch (dbError) {
                    console.error('祈愿会话记录失败:', dbError);
                }

                await client.query('COMMIT');

                return res.json({
                    success: true,
                    wishSuccess: success,
                    reward: reward,
                    rewardValue: success ? rewardValue : 0,
                    newBalance: balanceAfter,
                    progress: {
                        total_wishes: newTotalWishes,
                        consecutive_fails: newConsecutiveFails,
                        total_spent: newTotalSpent,
                        total_rewards_value: newTotalRewardsValue,
                        progress_percentage: Number.isFinite(guaranteeThreshold)
                            ? Math.min((newConsecutiveFails / (guaranteeThreshold + 1)) * 100, 100).toFixed(1)
                            : null,
                        wishes_until_guarantee: Number.isFinite(guaranteeThreshold)
                            ? Math.max(0, guaranteeThreshold + 1 - newConsecutiveFails)
                            : null,
                        guarantee_count: config.guaranteeCount
                    },
                    isGuaranteed: isGuaranteed,
                    giftName: rewardName
                });
            } catch (error) {
                try { await client.query('ROLLBACK'); } catch (e) { console.error('Wish play rollback failed:', e); }
                const isLockError = lockErrorCodes.has(error.code);
                if (isLockError && attempt < maxAttempts) {
                    await sleep(150);
                    continue;
                }
                console.error('Wish play error:', error);
                return res.status(500).json({ success: false, message: '祈愿失败，请稍后重试' });
            } finally {
                client.release();
            }
        }
    });

    // 获取祈愿历史记录
    app.get('/api/wish/history', requireLogin, requireAuthorized, async (req, res) => {
        try {
            const username = req.session.user.username;
            const page = parseInt(req.query.page) || 1;
            const limit = Math.min(parseInt(req.query.limit) || 20, 50);
            const offset = (page - 1) * limit;

            const result = await pool.query(`
                SELECT * FROM wish_results 
                WHERE username = $1 
                ORDER BY created_at DESC 
                LIMIT $2 OFFSET $3
            `, [username, limit, offset]);

            const countResult = await pool.query(
                'SELECT COUNT(*) FROM wish_results WHERE username = $1',
                [username]
            );

            res.json({
                success: true,
                history: result.rows,
                pagination: {
                    page: page,
                    limit: limit,
                    total: parseInt(countResult.rows[0].count),
                    hasMore: (page * limit) < parseInt(countResult.rows[0].count)
                }
            });

        } catch (error) {
            console.error('获取祈愿历史失败:', error);
            res.status(500).json({ success: false, message: '获取历史记录失败' });
        }
    });

    // 获取祈愿进度
    app.get('/api/wish/progress', requireLogin, requireAuthorized, async (req, res) => {
        try {
            const username = req.session.user.username;
            const giftType = req.query.giftType || 'deepsea_singer';
            const config = getWishConfig(giftType);
            if (!config) {
                return res.status(400).json({ success: false, message: '无效的祈愿礼物类型' });
            }
            const guaranteeThreshold = Number.isFinite(config.guaranteeCount) ? (config.guaranteeCount - 1) : null;

            let result = await pool.query(
                'SELECT * FROM wish_progress WHERE username = $1 AND gift_type = $2',
                [username, giftType]
            );

            // 如果用户没有祈愿记录，创建一个
            if (result.rows.length === 0) {
                await pool.query(`
                    INSERT INTO wish_progress (username, gift_type, total_wishes, consecutive_fails, total_spent, total_rewards_value)
                    VALUES ($1, $2, 0, 0, 0, 0)
                `, [username, giftType]);

                result = await pool.query(
                    'SELECT * FROM wish_progress WHERE username = $1 AND gift_type = $2',
                    [username, giftType]
                );
            }

            const progress = result.rows[0];

            res.json({
                success: true,
                progress: {
                    total_wishes: progress.total_wishes,
                    consecutive_fails: progress.consecutive_fails,
                    total_spent: progress.total_spent,
                    total_rewards_value: progress.total_rewards_value,
                    last_success_at: progress.last_success_at,
                    progress_percentage: Number.isFinite(guaranteeThreshold)
                        ? Math.min((progress.consecutive_fails / (guaranteeThreshold + 1)) * 100, 100).toFixed(1)
                        : null,
                    wishes_until_guarantee: Number.isFinite(guaranteeThreshold)
                        ? Math.max(0, guaranteeThreshold + 1 - progress.consecutive_fails)
                        : null,
                    next_is_guaranteed: Number.isFinite(guaranteeThreshold)
                        ? progress.consecutive_fails >= guaranteeThreshold
                        : false,
                    guarantee_count: config.guaranteeCount,
                    gift_name: config.name
                }
            });

        } catch (error) {
            console.error('获取祈愿进度失败:', error);
            res.status(500).json({ success: false, message: '获取进度失败' });
        }
    });

    app.get('/api/wish/backpack', requireLogin, requireAuthorized, async (req, res) => {
        try {
            const username = req.session.user.username;
            const result = await pool.query(`
                SELECT wi.id,
                       wi.gift_name,
                       wi.status,
                       wi.gift_exchange_id,
                       wi.last_failure_reason,
                       CASE
                           WHEN u.bilibili_room_id IS NULL THEN NULL
                           WHEN wi.expires_at IS NULL OR wi.expires_at = 'infinity'::timestamptz THEN NULL
                           ELSE to_char(wi.expires_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS')
                       END as expires_at,
                       CASE
                           WHEN u.bilibili_room_id IS NULL THEN '绑定房间号后自动送出'
                           WHEN wi.expires_at IS NULL OR wi.expires_at = 'infinity'::timestamptz THEN '绑定房间号后自动送出'
                           ELSE NULL
                       END as expires_note,
                       to_char(wi.created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as created_at
                FROM wish_inventory wi
                JOIN users u ON u.username = wi.username
                WHERE wi.username = $1
                ORDER BY wi.created_at DESC
                LIMIT 100
            `, [username]);

            res.json({
                success: true,
                items: result.rows
            });
        } catch (error) {
            console.error('获取背包失败:', error);
            res.status(500).json({ success: false, message: '获取背包失败' });
        }
    });

    app.post('/api/wish/backpack/send', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
        try {
            const username = req.session.user.username;
            const inventoryId = Number(req.body.inventoryId);

            if (!Number.isFinite(inventoryId)) {
                return res.status(400).json({ success: false, message: '参数无效' });
            }

            const result = await enqueueWishInventorySend({ inventoryId, username, isAuto: false });
            if (!result.success) {
                return res.status(400).json({ success: false, message: result.message });
            }

            res.json({ success: true, message: '礼物已加入发送队列' });
        } catch (error) {
            console.error('背包送出失败:', error);
            res.status(500).json({ success: false, message: '送出失败' });
        }
    });

    // Wish API 路由
    app.post('/api/wish',
        security.basicRateLimit,
        security.csrfProtection,
        (req, res) => {
        try {
            const { currentCount = 0, username } = req.body;
            const result = GameLogic.wish.makeWish(currentCount);

            // 触发飘屏广播
            if (username) {
                broadcastDanmaku(username, 'wish', result.isWin);
            }

            res.json({
                success: true,
                isWin: result.isWin,
                guaranteed: result.guaranteed,
                globalRate: result.globalRate
            });
        } catch (error) {
            console.error('Wish error:', error);
            res.status(500).json({ success: false, message: '祈愿系统故障' });
        }
    });

    // 批量祈愿API - 仅支持10次，逐次记录
    app.post('/api/wish-batch',
        rejectWhenOverloaded,
        requireLogin,
        requireAuthorized,
        security.basicRateLimit,
        security.csrfProtection,
        async (req, res) => {
        const username = req.session.user.username;
        const batchCount = Number(req.body.batchCount || 10);
        const giftType = req.body.giftType || 'deepsea_singer';
        const config = getWishConfig(giftType);
        if (!config) {
            return res.status(400).json({ success: false, message: '无效的祈愿礼物类型' });
        }
        if (batchCount !== 10) {
            return res.status(400).json({ success: false, message: '仅支持10次祈愿' });
        }

        const wishCost = config.cost;
        const successRate = config.successRate;
        const guaranteeThreshold = Number.isFinite(config.guaranteeCount) ? (config.guaranteeCount - 1) : null;
        const rewardName = config.name;
        const rewardValue = config.rewardValue;
        const maxAttempts = 2;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            let client;
            try {
                // 先用独立事务一次性扣款，避免长事务占用 users 行锁
                const totalCost = wishCost * batchCount;
                const totalBetResult = await BalanceLogger.updateBalance({
                    username,
                    amount: -totalCost,
                    operationType: 'wish_bet_batch',
                    description: `十连祈愿扣费：${totalCost} 电币`,
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent')
                });
                if (!totalBetResult.success) {
                    return res.status(400).json({ success: false, message: totalBetResult.message });
                }
                const startingBalance = totalBetResult.balance + totalCost;
                const finalBalance = totalBetResult.balance;

                client = await pool.connect();
                await client.query('BEGIN');
                await client.query(`SET LOCAL lock_timeout = '10s'; SET LOCAL statement_timeout = '15s';`);

                // 获取用户当前祈愿进度（加锁）
                let progressResult = await client.query(
                    'SELECT * FROM wish_progress WHERE username = $1 AND gift_type = $2 FOR UPDATE',
                    [username, giftType]
                );

                if (progressResult.rows.length === 0) {
                    await client.query(`
                        INSERT INTO wish_progress (username, gift_type, total_wishes, consecutive_fails, total_spent, total_rewards_value)
                        VALUES ($1, $2, 0, 0, 0, 0)
                    `, [username, giftType]);

                    progressResult = await client.query(
                        'SELECT * FROM wish_progress WHERE username = $1 AND gift_type = $2 FOR UPDATE',
                        [username, giftType]
                    );
                }

                let progress = progressResult.rows[0];
                let successCount = 0;
                for (let i = 0; i < batchCount; i++) {
                    const balanceBefore = startingBalance - (wishCost * i);
                    const balanceAfterThis = balanceBefore - wishCost;

                    // 判断是否成功
                    const isGuaranteed = Number.isFinite(guaranteeThreshold) && progress.consecutive_fails >= guaranteeThreshold;
                    const randomSuccess = randomFloat() < successRate;
                    const success = isGuaranteed || randomSuccess;

                    let reward = null;
                    if (success) {
                        reward = rewardName;

                        // 写入背包奖励
                        try {
                            const roomResult = await client.query(
                                'SELECT bilibili_room_id FROM users WHERE username = $1',
                                [username]
                            );
                            const roomId = roomResult.rows[0]?.bilibili_room_id || null;
                            const expiresAt = roomId
                                ? "(date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai') + interval '1 day' + interval '23 hours 59 minutes 59 seconds')"
                                : "'infinity'::timestamptz";

                            await client.query(`
                                INSERT INTO wish_inventory (
                                    username, gift_type, gift_name, bilibili_gift_id, status, expires_at,
                                    created_at, updated_at
                                )
                                VALUES (
                                    $1, $2, $3, $4, 'stored',
                                    ${expiresAt},
                                    (NOW() AT TIME ZONE 'Asia/Shanghai'),
                                    (NOW() AT TIME ZONE 'Asia/Shanghai')
                                )
                            `, [username, giftType, rewardName, config.bilibiliGiftId]);
                        } catch (dbError) {
                            console.error('祈愿背包记录存储失败:', dbError);
                        }
                    }

                    // 更新祈愿进度
                    const newTotalWishes = progress.total_wishes + 1;
                    const newConsecutiveFails = success ? 0 : progress.consecutive_fails + 1;
                    const newTotalSpent = progress.total_spent + wishCost;
                    const newTotalRewardsValue = progress.total_rewards_value + (success ? rewardValue : 0);

                    await client.query(`
                        UPDATE wish_progress 
                        SET total_wishes = $1, consecutive_fails = $2, total_spent = $3, total_rewards_value = $4,
                            last_success_at = CASE WHEN $5 THEN (NOW() AT TIME ZONE 'Asia/Shanghai') ELSE last_success_at END,
                            updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai')
                        WHERE username = $6 AND gift_type = $7
                    `, [
                        newTotalWishes,
                        newConsecutiveFails,
                        newTotalSpent,
                        newTotalRewardsValue,
                        success,
                        username,
                        giftType
                    ]);

                    // 保存祈愿记录
                    try {
                        const crypto = require('crypto');
                        const proof = crypto.createHash('sha256')
                            .update(`${username}-wish-${Date.now()}-${randomBytes(8).toString('hex')}`)
                            .digest('hex');

                        await client.query(`
                            INSERT INTO wish_results (
                                username, gift_type, cost, success, reward, reward_value, balance_before, balance_after,
                                wishes_count, is_guaranteed, game_details, created_at
                            ) 
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, (NOW() AT TIME ZONE 'Asia/Shanghai'))
                        `, [
                            username,
                            giftType,
                            wishCost,
                            success,
                            reward,
                            success ? rewardValue : null,
                            balanceBefore,
                            balanceAfterThis,
                            newTotalWishes,
                            isGuaranteed,
                            JSON.stringify({
                                success_rate: successRate,
                                is_guaranteed: isGuaranteed,
                                consecutive_fails_before: progress.consecutive_fails,
                                proof: proof,
                                timestamp: new Date().toISOString()
                            })
                        ]);
                    } catch (dbError) {
                        console.error('祈愿记录存储失败:', dbError);
                    }

                    if (success) {
                        successCount += 1;
                    }

                    progress = {
                        ...progress,
                        total_wishes: newTotalWishes,
                        consecutive_fails: newConsecutiveFails,
                        total_spent: newTotalSpent,
                        total_rewards_value: newTotalRewardsValue,
                        last_success_at: success ? new Date() : progress.last_success_at
                    };
                }

                // 记录祈愿会话（十连）
                try {
                    await client.query(`
                        INSERT INTO wish_sessions (
                            username, gift_type, gift_name, batch_count, total_cost, success_count, total_reward_value, created_at
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, (NOW() AT TIME ZONE 'Asia/Shanghai'))
                    `, [
                        username,
                        giftType,
                        rewardName,
                        batchCount,
                        wishCost * batchCount,
                        successCount,
                        successCount * rewardValue
                    ]);
                } catch (dbError) {
                    console.error('祈愿会话记录失败:', dbError);
                }

                await client.query('COMMIT');

                return res.json({
                    success: true,
                    successCount,
                    newBalance: finalBalance,
                    progress: {
                        total_wishes: progress.total_wishes,
                        consecutive_fails: progress.consecutive_fails,
                        total_spent: progress.total_spent,
                        total_rewards_value: progress.total_rewards_value,
                        progress_percentage: Number.isFinite(guaranteeThreshold)
                            ? Math.min((progress.consecutive_fails / (guaranteeThreshold + 1)) * 100, 100).toFixed(1)
                            : null,
                        wishes_until_guarantee: Number.isFinite(guaranteeThreshold)
                            ? Math.max(0, guaranteeThreshold + 1 - progress.consecutive_fails)
                            : null,
                        guarantee_count: config.guaranteeCount
                    }
                });

            } catch (error) {
                if (client) {
                    try {
                        await client.query('ROLLBACK');
                    } catch (e) {
                        console.error('Batch wish rollback failed:', e);
                    }
                }
                const isLockError = lockErrorCodes.has(error.code);
                if (isLockError && attempt < maxAttempts) {
                    await sleep(150);
                    continue;
                }
                console.error('Batch wish error:', error);
                return res.status(500).json({ success: false, message: '批量祈愿系统故障' });
            } finally {
                if (client) {
                    client.release();
                }
            }
        }
    });

    // 祈愿概率模拟（管理员测试，无余额/数据库影响）
    app.post('/api/wish/simulate',
        requireLogin,
        requireAuthorized,
        security.basicRateLimit,
        security.csrfProtection,
        async (req, res) => {
        try {
            const username = req.session.user.username;
            if (username !== 'hokboost') {
                return res.status(403).json({ success: false, message: '无权限' });
            }

            const giftType = req.body.giftType || 'deepsea_singer';
            const count = Number(req.body.count || 100000);
            const config = getWishConfig(giftType);
            if (!config) {
                return res.status(400).json({ success: false, message: '无效的祈愿礼物类型' });
            }

            if (!Number.isFinite(count) || count < 1 || count > 100000) {
                return res.status(400).json({ success: false, message: '次数无效' });
            }

            const guaranteeThreshold = Number.isFinite(config.guaranteeCount) ? (config.guaranteeCount - 1) : null;
            let consecutiveFails = 0;
            let successCount = 0;

            for (let i = 0; i < count; i++) {
                const isGuaranteed = Number.isFinite(guaranteeThreshold) && consecutiveFails >= guaranteeThreshold;
            const randomSuccess = randomFloat() < config.successRate;
                const success = isGuaranteed || randomSuccess;
                if (success) {
                    successCount += 1;
                    consecutiveFails = 0;
                } else {
                    consecutiveFails += 1;
                }
            }

            res.json({
                success: true,
                giftName: config.name,
                count,
                successCount,
                rate: ((successCount / count) * 100).toFixed(4) + '%'
            });
        } catch (error) {
            console.error('祈愿模拟失败:', error);
            res.status(500).json({ success: false, message: '模拟失败' });
        }
    });
};
