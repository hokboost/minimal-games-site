module.exports = function registerAdminRoutes(app, deps) {
    const crypto = require('crypto');
    const net = require('net');
    const requireFunction = require('../lib/require-function');
    const {
        pool,
        bcrypt,
        BalanceLogger,
        generateCSRFToken,
        requireLogin,
        requireAdmin,
        requireRecentAdminAuth,
        requireAuthorized,
        requireCSRF,
        security,
        scheduleWishInventoryDeliveryOnBind,
        IPManager,
        SessionManager,
        notifySecurityEvent,
        disconnectUserSockets,
        getAdminTotpSecret,
        passwordResetTokenSecret,
        gameRegistry
    } = deps;
    if (!Buffer.isBuffer(passwordResetTokenSecret) || passwordResetTokenSecret.length < 32) {
        throw new Error('passwordResetTokenSecret must be a Buffer of at least 32 bytes');
    }
    if (!Array.isArray(gameRegistry?.GAME_DEFINITIONS)
        || typeof gameRegistry?.records?.resolveRecordGames !== 'function'
        || typeof gameRegistry.records.loadLatestRecords !== 'function'
        || typeof gameRegistry.records.loadAdminRecordSections !== 'function') {
        throw new TypeError('Missing required game record registry');
    }
    const adminRecordGames = gameRegistry.records.resolveRecordGames(gameRegistry.GAME_DEFINITIONS);

    const adminRateLimit = requireFunction(security, 'adminRateLimit', 'security middleware');
    const adminStrictLimit = requireFunction(security, 'adminStrictLimit', 'security middleware');
    const readHeavyRateLimit = requireFunction(security, 'readHeavyRateLimit', 'security middleware');
    const { scopedAuditRequestId } = require('../lib/admin-audit-failure');
    const { parseInteger, parseMoney } = require('../lib/integer-money');
    const usernamePattern = /^[\p{L}\p{N}_-]{3,32}$/u;
    const normalizeUsername = (value) => typeof value === 'string'
        ? value.normalize('NFKC').trim()
        : '';

    // Page routes require an authenticated admin and rate limits. Admins may
    // connect from changing addresses, so access is never tied to client IP.
    const adminGuards = [requireLogin, requireAdmin, adminRateLimit, adminStrictLimit];
    const adminApiGuards = adminGuards;
    const highRiskAdminGuards = [...adminApiGuards, requireRecentAdminAuth];

    const runPostCommitEffect = (label, effect) => {
        Promise.resolve()
            .then(effect)
            .catch(() => console.error(`${label}失败`));
    };

    const lockCurrentAdminSession = async (client, req) => {
        const result = await client.query(`
            SELECT 1
            FROM active_sessions AS active
            JOIN users AS account ON account.username = active.username
            WHERE active.session_id = $1
              AND active.username = $2
              AND active.is_active = TRUE
              AND account.authorized = TRUE
              AND account.is_admin = TRUE
              AND account.deactivated = FALSE
            FOR SHARE OF active
        `, [req.sessionID, req.session?.user?.username]);
        return result.rowCount === 1;
    };

    const calculateDeliveredCost = (totalCost, deliveredQuantity, requestedQuantity) => {
        if (!Number.isSafeInteger(totalCost) || totalCost < 0
            || !Number.isSafeInteger(deliveredQuantity) || deliveredQuantity < 0
            || !Number.isSafeInteger(requestedQuantity) || requestedQuantity < 1
            || deliveredQuantity > requestedQuantity) {
            throw new Error('Invalid gift reconciliation values');
        }
        return Number((BigInt(totalCost) * BigInt(deliveredQuantity)) / BigInt(requestedQuantity));
    };

    const addMoney = (current, amount, label) => parseMoney(
        parseMoney(current, `${label} current`, { min: 0 })
            + parseMoney(amount, `${label} amount`, { min: 0 }),
        label,
        { min: 0 }
    );

    // An account/room transition invalidates work that has not crossed an
    // external-send boundary. Anything already sending remains locked.
    const prepareExternalWorkForAccountTransition = async ({
        client,
        username,
        reason,
        requestId,
        transitionType = 'room_change',
        transitionLabel = '房间变更'
    }) => {
        if (!['room_change', 'authorization_revoke'].includes(transitionType)) {
            throw new Error('Unsupported external-work transition');
        }
        const cancelableGifts = await client.query(`
            SELECT id, gift_name, cost, quantity, delivery_status
            FROM gift_exchanges
            WHERE username = $1
              AND status = 'funds_locked'
              AND delivery_status IN ('pending', 'claimed')
              AND started_at IS NULL
            ORDER BY id
            FOR UPDATE
        `, [username]);
        let refundedGiftAmount = 0;
        for (const gift of cancelableGifts.rows) {
            const refundAmount = parseMoney(gift.cost, 'room-change gift cost', { min: 0 });
            if (refundAmount > 0) {
                const refund = await BalanceLogger.updateBalance({
                    username,
                    amount: refundAmount,
                    operationType: `${transitionType}_gift_refund`,
                    description: `${transitionLabel}，取消尚未开始发送的礼物任务 ${gift.id}`,
                    gameData: {
                        taskId: gift.id,
                        giftName: gift.gift_name,
                        quantity: Number(gift.quantity),
                        previousDeliveryStatus: gift.delivery_status,
                        reason
                    },
                    requestId: `${requestId || transitionType}:gift:${gift.id}`,
                    requireSufficientBalance: false,
                    client,
                    managedTransaction: true
                });
                if (!refund.success) throw new Error('Room-change gift refund failed');
                refundedGiftAmount = addMoney(
                    refundedGiftAmount,
                    refundAmount,
                    'room-change gift refund total'
                );
            }
            const cancelled = await client.query(`
                UPDATE gift_exchanges
                SET status = 'failed', delivery_status = 'failed',
                    failure_reason = $2,
                    processed_at = NOW(), lease_expires_at = NOW(), updated_at = NOW()
                WHERE id = $1
                  AND status = 'funds_locked'
                  AND delivery_status = $3
                  AND started_at IS NULL
                RETURNING id
            `, [gift.id, `${transitionLabel}，外部发送尚未开始：${reason}`, gift.delivery_status]);
            if (cancelled.rowCount !== 1) {
                throw new Error('Room-change gift state changed concurrently');
            }
            await client.query(`
                UPDATE wish_inventory
                SET status = 'stored', gift_exchange_id = NULL,
                    last_failure_reason = $2,
                    expires_at = 'infinity'::timestamptz,
                    updated_at = NOW()
                WHERE gift_exchange_id = $1
            `, [gift.id, `${transitionLabel}，发送任务已取消：${reason}`]);
        }

        const releasablePk = await client.query(`
            SELECT authorization_id, ticket_count
            FROM pk_spend_authorizations
            WHERE username = $1 AND status = 'reserved'
            ORDER BY created_at, authorization_id
            FOR UPDATE
        `, [username]);
        let refundedPkAmount = 0;
        for (const authorization of releasablePk.rows) {
            const refundAmount = parseMoney(
                authorization.ticket_count,
                'room-change PK reservation',
                { min: 1, max: 100000000 }
            );
            const refund = await BalanceLogger.updateBalance({
                username,
                amount: refundAmount,
                operationType: `${transitionType}_pk_release`,
                description: `${transitionLabel}，释放尚未开始发送的PK预扣 ${refundAmount} 积分`,
                gameData: { authorizationId: authorization.authorization_id, reason },
                requestId: `${authorization.authorization_id}:room-change-release`,
                requireSufficientBalance: false,
                client,
                managedTransaction: true
            });
            if (!refund.success) throw new Error('Room-change PK release failed');
            const released = await client.query(`
                UPDATE pk_spend_authorizations
                SET status = 'released', outcome_reason = $2,
                    settled_at = NOW(), updated_at = NOW()
                WHERE authorization_id = $1 AND status = 'reserved'
                RETURNING authorization_id
            `, [authorization.authorization_id, `${transitionLabel}，发送尚未开始：${reason}`]);
            if (released.rowCount !== 1) {
                throw new Error('Room-change PK authorization changed concurrently');
            }
            refundedPkAmount = addMoney(
                refundedPkAmount,
                refundAmount,
                'room-change PK refund total'
            );
        }

        const pkControlResult = await client.query(`
            SELECT command_generation, desired_running
            FROM pk_control_state
            WHERE username = $1
            FOR UPDATE
        `, [username]);
        const pkRunnerResult = await client.query(`
            SELECT running
            FROM pk_runner_state
            WHERE username = $1
            FOR UPDATE
        `, [username]);
        const activePkTasks = await client.query(`
            SELECT id
            FROM pk_tasks
            WHERE username = $1
              AND status IN ('pending', 'claimed', 'processing', 'uncertain')
            ORDER BY id
            FOR UPDATE
        `, [username]);
        const pkControl = pkControlResult.rows[0];
        const needsPkStop = pkControl?.desired_running === true
            || pkRunnerResult.rows[0]?.running === true
            || activePkTasks.rows.length > 0;
        let pkStopGeneration = null;
        if (needsPkStop) {
            const stoppedControl = await client.query(`
                INSERT INTO pk_control_state (
                    username, command_generation, desired_running, room_id, updated_at
                ) VALUES ($1, 1, FALSE, NULL, NOW())
                ON CONFLICT (username) DO UPDATE
                SET command_generation = pk_control_state.command_generation + 1,
                    desired_running = FALSE, room_id = NULL, updated_at = NOW()
                RETURNING command_generation
            `, [username]);
            pkStopGeneration = parseInteger(
                stoppedControl.rows[0].command_generation,
                'room-change PK stop generation',
                { min: 1 }
            );
            await client.query(`
                UPDATE pk_tasks
                SET status = 'superseded', processed_at = NOW(),
                    error = $3
                WHERE username = $1
                  AND status IN ('pending', 'claimed', 'processing', 'uncertain')
                  AND (command_generation IS NULL OR command_generation < $2)
            `, [username, pkStopGeneration, `${transitionLabel}，由停止指令替代：${reason}`]);
            await client.query(`
                INSERT INTO pk_tasks (username, action, status, command_generation, error)
                VALUES ($1, 'stop', 'pending', $2, $3)
            `, [username, pkStopGeneration, `${transitionLabel}，等待停止旧运行进程：${reason}`]);
        }

        const unresolvedGiftResult = await client.query(`
            SELECT COUNT(*)::integer AS count
            FROM gift_exchanges
            WHERE username = $1 AND status = 'funds_locked'
              AND delivery_status IN ('processing', 'uncertain')
        `, [username]);
        const unresolvedPkResult = await client.query(`
            SELECT COUNT(*)::integer AS count
            FROM pk_spend_authorizations
            WHERE username = $1 AND status IN ('sending', 'uncertain')
        `, [username]);

        return {
            cancelledGiftTasks: cancelableGifts.rows.length,
            refundedGiftAmount,
            releasedPkReservations: releasablePk.rows.length,
            refundedPkAmount,
            unresolvedGiftCount: parseInteger(
                unresolvedGiftResult.rows[0]?.count || 0,
                'room-change unresolved gift count',
                { min: 0 }
            ),
            unresolvedPkCount: parseInteger(
                unresolvedPkResult.rows[0]?.count || 0,
                'room-change unresolved PK count',
                { min: 0 }
            ),
            pkStopGeneration
        };
    };

    const auditAdminAction = async ({
        client = pool,
        adminUsername,
        action,
        targetUsername = null,
        details = {},
        clientIP = null,
        requestId = null,
        authStrength = 'session_password'
    }) => {
        const auditDetails = { ...details, result: 'success', authStrength };
        const scopedRequestId = scopedAuditRequestId(adminUsername, requestId);
        await client.query(`
            INSERT INTO admin_audit_log (
                request_id, admin_username, action, target_username, details, ip_address
            ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [scopedRequestId, adminUsername, action, targetUsername, JSON.stringify(auditDetails), clientIP]);
        await client.query(`
            INSERT INTO security_events (event_type, username, ip_address, description, severity)
            VALUES ('admin_action', $1, $2, $3, 'high')
        `, [
            adminUsername,
            clientIP,
            `${action}: ${targetUsername || '-'} - ${JSON.stringify(auditDetails)}`
        ]);
    };

    const notifyAdminAction = (adminUsername, action, targetUsername, details = {}) => {
        const securityOwner = process.env.SECURITY_NOTIFICATION_USER;
        if (securityOwner && adminUsername !== securityOwner) {
            runPostCommitEffect('管理员操作通知', () => notifySecurityEvent(securityOwner, {
                type: 'admin_action',
                title: '管理员操作通知',
                message: `${adminUsername} 执行了 ${action} 操作`,
                details: { targetUsername, ...details },
                level: 'warning'
            }));
        }
    };

    app.post('/api/admin/reauthenticate', ...adminApiGuards, requireCSRF, async (req, res) => {
        let client;
        let sessionStamped = false;
        const previousAuthenticatedAt = req.session.lastAuthenticatedAt;
        const previousMfaVerifiedAt = req.session.lastMfaVerifiedAt;
        try {
            const password = typeof req.body?.password === 'string' ? req.body.password : '';
            const totpCode = typeof req.body?.totpCode === 'string' ? req.body.totpCode : '';
            if (!password || Buffer.byteLength(password, 'utf8') > 72) {
                return res.status(400).json({ success: false, message: '密码格式无效' });
            }

            const userResult = await pool.query(
                `SELECT password_hash, last_admin_totp_counter
                 FROM users
                 WHERE username = $1 AND is_admin = true AND deactivated = false`,
                [req.session.user.username]
            );
            const validPassword = userResult.rows.length === 1
                && await bcrypt.compare(password, userResult.rows[0].password_hash);
            if (!validPassword) {
                return res.status(401).json({ success: false, message: '管理员密码错误' });
            }

            const totpSecret = getAdminTotpSecret(req.session.user.username);
            const { matchTotpCounter } = require('../lib/totp');
            const totpCounter = totpSecret ? matchTotpCounter(totpSecret, totpCode) : null;
            if (totpCounter === null
                || (userResult.rows[0].last_admin_totp_counter !== null
                    && totpCounter <= Number(userResult.rows[0].last_admin_totp_counter))) {
                return res.status(401).json({ success: false, message: '动态验证码错误或已过期' });
            }

            client = await pool.connect();
            await client.query('BEGIN');
            const stillCurrent = await client.query(`
                SELECT account.password_hash, account.last_admin_totp_counter
                FROM users AS account
                JOIN active_sessions AS active ON active.username = account.username
                WHERE account.username = $1
                  AND account.is_admin = TRUE
                  AND account.deactivated = FALSE
                  AND active.session_id = $2
                  AND active.is_active = TRUE
                FOR SHARE OF account, active
            `, [req.session.user.username, req.sessionID]);
            if (stillCurrent.rows.length !== 1
                || stillCurrent.rows[0].password_hash !== userResult.rows[0].password_hash
                || (stillCurrent.rows[0].last_admin_totp_counter !== null
                    && totpCounter <= Number(stillCurrent.rows[0].last_admin_totp_counter))) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '管理员凭据或会话已发生变化，请重新登录' });
            }
            const consumedTotp = await client.query(`
                UPDATE users
                SET last_admin_totp_counter = $2
                WHERE username = $1
                  AND (last_admin_totp_counter IS NULL OR last_admin_totp_counter < $2)
                RETURNING username
            `, [req.session.user.username, totpCounter]);
            if (consumedTotp.rowCount !== 1) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '动态验证码已使用，请等待下一组验证码' });
            }

            await auditAdminAction({
                client,
                adminUsername: req.session.user.username,
                action: 'admin_reauthenticated',
                clientIP: req.clientIP,
                requestId: req.requestId,
                authStrength: 'password_totp'
            });
            await client.query('COMMIT');

            const verifiedAt = Date.now();
            req.session.lastMfaVerifiedAt = verifiedAt;
            req.session.lastAuthenticatedAt = verifiedAt;
            sessionStamped = true;
            await new Promise((resolve, reject) => {
                req.session.save((error) => (error ? reject(error) : resolve()));
            });
            return res.json({ success: true, mfaRequired: true });
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            if (sessionStamped) {
                req.session.lastAuthenticatedAt = previousAuthenticatedAt;
                req.session.lastMfaVerifiedAt = previousMfaVerifiedAt;
                await new Promise((resolve) => req.session.save(() => resolve()));
            }
            console.error('管理员重新认证失败:', error);
            return res.status(500).json({ success: false, message: '重新认证服务暂不可用' });
        } finally {
            client?.release();
        }
    });

    // 管理员后台
    app.get('/admin', ...adminGuards, async (req, res) => {
        try {
            // 初始化session
            if (!req.session.initialized) {
                req.session.initialized = true;
                req.session.createdAt = Date.now();
                generateCSRFToken(req); // 统一使用csrf库
            }

            const afterUsername = typeof req.query.after === 'string'
                && usernamePattern.test(normalizeUsername(req.query.after))
                ? normalizeUsername(req.query.after)
                : '';
            const usersResult = await pool.query(
                `SELECT username, balance, spins_allowed, authorized, is_admin,
                        login_failures, last_failure_time, locked_until
                 FROM users
                 WHERE deactivated = false AND username > $1
                 ORDER BY username
                 LIMIT 51`,
                [afterUsername]
            );

            const hasNextUsersPage = usersResult.rows.length > 50;
            const users = usersResult.rows.slice(0, 50).map(user => ({
                ...user,
                is_locked: user.locked_until && new Date(user.locked_until) > new Date(),
                lock_minutes: user.locked_until ? Math.ceil((new Date(user.locked_until) - new Date()) / 60000) : 0
            }));
            const usernames = users.map((user) => user.username);
            const recentRecordData = await gameRegistry.records.loadLatestRecords(pool, {
                usernames,
                gameDefinitions: adminRecordGames
            });

            let dictationSubmissions = [];
            try {
                const dictationResult = await pool.query(`
                    SELECT id,
                           username,
                           word_id,
                           word,
                           pronunciation,
                           definition,
                           user_input,
                           level,
                           set_id,
                           session_id,
                           image_path,
                           status,
                           to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as submitted_at
                    FROM dictation_submissions
                    ORDER BY created_at DESC
                    LIMIT 100
                `);
                dictationSubmissions = dictationResult.rows;
            } catch (error) {
                console.error('Dictation submissions query error:', error);
            }

            let dictationLatest = [];
            try {
                const latestResult = await pool.query(`
                    SELECT DISTINCT ON (username)
                           username,
                           set_id,
                           result,
                           to_char(ended_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as ended_at,
                           to_char(started_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as started_at
                    FROM dictation_sessions
                    WHERE username = ANY($1::text[])
                    ORDER BY username, COALESCE(ended_at, started_at) DESC
                `, [usernames]);
                dictationLatest = latestResult.rows;
            } catch (error) {
                console.error('Dictation latest session query error:', error);
            }

            res.render('admin', {
                title: '管理后台 - Minimal Games',
                user: req.session.user,
                userLoggedIn: req.session.user?.username,
                users: users,
                nextUsersCursor: hasNextUsersPage ? users.at(-1)?.username : null,
                recordGames: recentRecordData.games,
                latestRecords: recentRecordData.byUsername,
                dictationSubmissions: dictationSubmissions,
                dictationLatest: dictationLatest,
                adminMfaConfigured: Boolean(getAdminTotpSecret(req.session.user.username)),
                csrfToken: req.session.csrfToken
            });
        } catch (err) {
            console.error('❌ 管理员页面加载失败:', err);
            res.status(500).send('后台加载失败');
        }
    });

    app.get('/admin/users/:username/records', ...adminGuards, async (req, res) => {
        try {
            const targetUsername = normalizeUsername(req.params.username);
            if (!usernamePattern.test(targetUsername)) {
                return res.status(400).send('用户名格式无效');
            }
            const userResult = await pool.query(
                'SELECT username FROM users WHERE username = $1',
                [targetUsername]
            );

            if (userResult.rows.length === 0) {
                return res.status(404).send('用户不存在');
            }

            const recordSections = await gameRegistry.records.loadAdminRecordSections(pool, {
                username: targetUsername,
                gameDefinitions: adminRecordGames,
                limit: 200
            });

            res.render('admin-user-records', {
                title: `用户记录 - ${targetUsername}`,
                user: req.session.user,
                targetUsername,
                csrfToken: req.session.csrfToken,
                recordSections
            });
        } catch (error) {
            console.error('管理员用户记录加载失败:', error);
            res.status(500).send('记录加载失败');
        }
    });

    // 添加积分
    app.post('/api/admin/add-electric-coin', ...highRiskAdminGuards, requireCSRF, async (req, res) => {
        let client;
        try {
            const username = normalizeUsername(req.body?.username);
            let amount;
            try {
                amount = parseMoney(req.body?.amount, 'admin credit', { min: 1, max: 100000 });
            } catch (error) {
                return res.status(400).json({ success: false, message: '参数错误：用户名和积分数量必须有效' });
            }
            const adminUsername = req.session.user.username;

            if (!usernamePattern.test(username)) {
                return res.status(400).json({ success: false, message: '参数错误：用户名和积分数量必须有效' });
            }

            client = await pool.connect();
            await client.query('BEGIN');
            const target = await client.query(
                'SELECT deactivated FROM users WHERE username = $1 FOR UPDATE',
                [username]
            );
            if (target.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: '用户不存在' });
            }
            if (target.rows[0].deactivated === true) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '账户已停用，不能添加积分' });
            }

            // 使用余额日志系统进行管理员充值
            const balanceResult = await BalanceLogger.updateBalance({
                username: username,
                amount,
                operationType: 'admin_add',
                description: `管理员充值：添加 ${amount} 积分`,
                gameData: {
                    admin_user: req.session.user.username,
                    amount: amount,
                    type: 'manual_recharge'
                },
                ipAddress: req.clientIP,
                userAgent: req.get('User-Agent'),
                requireSufficientBalance: false,
                client,
                managedTransaction: true
            });

            if (!balanceResult.success) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: balanceResult.message });
            }

            const responseBody = {
                success: true,
                newBalance: balanceResult.balance,
                addedAmount: amount
            };
            await auditAdminAction({
                client,
                adminUsername,
                action: 'balance_credit',
                targetUsername: username,
                details: {
                    amount,
                    balanceBefore: balanceResult.balanceBefore,
                    balanceAfter: balanceResult.balance
                },
                clientIP: req.clientIP,
                requestId: req.idempotencyKey,
                authStrength: getAdminTotpSecret(adminUsername) ? 'password_totp' : 'password'
            });
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            notifyAdminAction(adminUsername, 'balance_credit', username, { amount });
            res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('添加积分失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    // 授权用户
    app.post('/api/admin/authorize-user', ...highRiskAdminGuards, requireCSRF, async (req, res) => {
        let client;
        try {
            const username = normalizeUsername(req.body?.username);

            if (!usernamePattern.test(username)) {
                return res.status(400).json({ success: false, message: '用户名格式无效' });
            }

            client = await pool.connect();
            await client.query('BEGIN');
            const result = await client.query(
                'UPDATE users SET authorized = true WHERE username = $1 AND deactivated = false RETURNING username',
                [username]
            );

            if (result.rows.length === 0) {
                const target = await client.query(
                    'SELECT deactivated FROM users WHERE username = $1',
                    [username]
                );
                await client.query('ROLLBACK');
                return res.status(target.rows.length === 0 ? 404 : 409).json({
                    success: false,
                    message: target.rows.length === 0 ? '用户不存在' : '账户已停用，不能授权'
                });
            }

            const responseBody = { success: true, message: '授权成功' };
            await auditAdminAction({
                client,
                adminUsername: req.session.user.username,
                action: 'authorize_user',
                targetUsername: username,
                clientIP: req.clientIP,
                requestId: req.idempotencyKey
            });
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            notifyAdminAction(req.session.user.username, 'authorize_user', username);
            res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('授权失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    // 取消授权
    app.post('/api/admin/unauthorize-user', ...highRiskAdminGuards, requireCSRF, async (req, res) => {
        let client;
        let sessionIds = [];
        try {
            const username = normalizeUsername(req.body?.username);

            if (!usernamePattern.test(username)) {
                return res.status(400).json({ success: false, message: '用户名格式无效' });
            }

            client = await pool.connect();
            await client.query('BEGIN');
            await client.query(
                "SELECT pg_advisory_xact_lock(hashtextextended($1 || ':gift_exchange', 0))",
                [username]
            );
            await client.query(
                "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
                [`pk:${username}`]
            );
            const result = await client.query(
                `UPDATE users
                 SET authorized = false
                 WHERE username = $1 AND is_admin = false
                 RETURNING username`,
                [username]
            );

            if (result.rows.length === 0) {
                const user = await client.query('SELECT is_admin FROM users WHERE username = $1', [username]);
                await client.query('ROLLBACK');
                if (user.rows[0]?.is_admin) {
                    return res.status(403).json({ success: false, message: '不能取消管理员授权' });
                }
                return res.status(404).json({ success: false, message: '用户不存在' });
            }

            const externalState = await prepareExternalWorkForAccountTransition({
                client,
                username,
                reason: '管理员取消账户授权',
                requestId: req.idempotencyKey,
                transitionType: 'authorization_revoke',
                transitionLabel: '取消授权'
            });
            const sessions = await client.query(
                'SELECT session_id FROM active_sessions WHERE username = $1 AND is_active = true FOR UPDATE',
                [username]
            );
            sessionIds = sessions.rows.map((row) => row.session_id);
            await client.query(`
                UPDATE active_sessions
                SET is_active = false, terminated_at = NOW(), termination_reason = 'authorization_revoked'
                WHERE username = $1 AND is_active = true
            `, [username]);
            if (sessionIds.length > 0) {
                await client.query('DELETE FROM user_sessions WHERE sid = ANY($1::text[])', [sessionIds]);
            }
            const hasUnresolved = externalState.unresolvedGiftCount
                + externalState.unresolvedPkCount > 0;
            const responseBody = {
                success: true,
                message: hasUnresolved
                    ? '已取消授权；仍有已经开始的外部发送等待人工对账'
                    : '取消授权成功',
                ...externalState
            };
            await auditAdminAction({
                client,
                adminUsername: req.session.user.username,
                action: 'unauthorize_user',
                targetUsername: username,
                details: { terminatedSessions: sessionIds.length, ...externalState },
                clientIP: req.clientIP,
                requestId: req.idempotencyKey
            });
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            runPostCommitEffect('取消授权后的会话断开', () => disconnectUserSockets(username));
            notifyAdminAction(req.session.user.username, 'unauthorize_user', username);
            res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('取消授权失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });


    // 重置密码
    app.post('/api/admin/reset-password', ...highRiskAdminGuards, requireCSRF, async (req, res) => {
        let client;
        try {
            const username = normalizeUsername(req.body?.username);
            const adminUsername = req.session.user.username;
            const idempotencyKey = String(req.get('Idempotency-Key') || '').trim();

            if (!usernamePattern.test(username)) {
                return res.status(400).json({ success: false, message: '用户名格式无效' });
            }
            if (!/^[A-Za-z0-9._:-]{8,100}$/.test(idempotencyKey)) {
                return res.status(400).json({ success: false, message: '缺少或无效的 Idempotency-Key' });
            }

            const resetToken = crypto.createHmac('sha256', passwordResetTokenSecret)
                .update(adminUsername)
                .update('\0')
                .update(username)
                .update('\0')
                .update(idempotencyKey)
                .digest('base64url');
            const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

            client = await pool.connect();
            await client.query('BEGIN');
            if (!await lockCurrentAdminSession(client, req)) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, message: '管理员权限或会话已失效' });
            }
            const target = await client.query(
                'SELECT is_admin, deactivated, password_hash FROM users WHERE username = $1 FOR UPDATE',
                [username]
            );
            if (target.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: '用户不存在' });
            }
            if (target.rows[0].is_admin) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, message: '管理员请使用本人密码修改功能' });
            }
            if (target.rows[0].deactivated === true) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '账户已停用，不能生成重置链接' });
            }

            const existingTokenResult = await client.query(`
                SELECT username, issued_by, password_fingerprint, expires_at,
                       used_at, revoked_at
                FROM password_reset_tokens
                WHERE token_hash = $1
                FOR UPDATE
            `, [tokenHash]);
            if (existingTokenResult.rows.length === 1) {
                const existingToken = existingTokenResult.rows[0];
                const currentFingerprint = crypto.createHash('sha256')
                    .update(target.rows[0].password_hash)
                    .digest('hex');
                const canReplay = existingToken.username === username
                    && existingToken.issued_by === adminUsername
                    && existingToken.password_fingerprint === currentFingerprint
                    && !existingToken.used_at
                    && !existingToken.revoked_at
                    && new Date(existingToken.expires_at) > new Date();
                await client.query('ROLLBACK');
                if (!canReplay) {
                    return res.status(409).json({
                        success: false,
                        message: '该重置请求已失效，请重新生成'
                    });
                }
                return res.json({
                    success: true,
                    replayed: true,
                    message: '返回已生成的一次性密码重置链接，原有效期不变',
                    resetPath: `/reset-password?token=${encodeURIComponent(resetToken)}`
                });
            }

            await client.query(`
                UPDATE password_reset_tokens
                SET revoked_at = NOW()
                WHERE username = $1 AND used_at IS NULL AND revoked_at IS NULL
            `, [username]);
            await client.query(`
                INSERT INTO password_reset_tokens (
                    username, token_hash, password_fingerprint, issued_by, expires_at
                ) VALUES ($1, $2, $3, $4, NOW() + INTERVAL '15 minutes')
            `, [
                username,
                tokenHash,
                crypto.createHash('sha256').update(target.rows[0].password_hash).digest('hex'),
                adminUsername
            ]);
            const sessions = await client.query(
                'SELECT session_id FROM active_sessions WHERE username = $1 AND is_active = true FOR UPDATE',
                [username]
            );
            const sessionIds = sessions.rows.map((row) => row.session_id);
            await client.query(
                `UPDATE active_sessions
                 SET is_active = false, terminated_at = NOW(), termination_reason = 'password_reset'
                 WHERE username = $1 AND is_active = true`,
                [username]
            );
            if (sessionIds.length > 0) {
                await client.query('DELETE FROM user_sessions WHERE sid = ANY($1::text[])', [sessionIds]);
            }
            const responseBody = {
                success: true,
                message: '一次性密码重置链接已生成，15分钟内有效',
                resetPath: `/reset-password?token=${encodeURIComponent(resetToken)}`
            };
            await auditAdminAction({
                client,
                adminUsername,
                action: 'issue_password_reset',
                targetUsername: username,
                details: { expiresInMinutes: 15, terminatedSessions: sessionIds.length },
                clientIP: req.clientIP,
                requestId: idempotencyKey
            });
            await client.query('COMMIT');

            runPostCommitEffect('密码重置后的会话断开', () => disconnectUserSockets(username, sessionIds));
            notifyAdminAction(adminUsername, 'issue_password_reset', username);

            res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('重置密码失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    // 修改用户余额 - 添加CSRF保护
    app.post('/api/admin/update-balance', ...highRiskAdminGuards, requireCSRF, async (req, res) => {
        let client;
        try {
            const username = normalizeUsername(req.body?.username);
            let balance;
            try {
                balance = parseMoney(req.body?.balance, 'admin balance', { min: 0, max: 100000000 });
            } catch (error) {
                return res.status(400).json({ success: false, message: '无效的余额数值' });
            }
            const adminUsername = req.session.user.username;

            if (!usernamePattern.test(username)) {
                return res.status(400).json({ success: false, message: '用户名格式无效' });
            }

            client = await pool.connect();
            await client.query('BEGIN');
            const currentBalanceResult = await client.query(
                'SELECT balance, deactivated FROM users WHERE username = $1 FOR UPDATE',
                [username]
            );

            if (currentBalanceResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: '用户不存在' });
            }
            if (currentBalanceResult.rows[0].deactivated === true) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '账户已停用，不能修改余额' });
            }

            const currentBalance = parseMoney(
                currentBalanceResult.rows[0].balance,
                'current user balance',
                { min: 0 }
            );
            const delta = balance - currentBalance;

            // 使用BalanceLogger进行安全的余额修改（带审计和原子锁）
            const balanceResult = delta === 0
                ? { success: true, balance, balanceBefore: balance }
                : await BalanceLogger.updateBalance({
                    username: username,
                    amount: delta,
                    operationType: 'admin_balance_adjustment',
                    description: `管理员 ${adminUsername} 将余额从 ${currentBalance} 调整为 ${balance}`,
                    gameData: {
                        admin_username: adminUsername,
                        old_balance: currentBalance,
                        new_balance: balance,
                        delta: delta
                    },
                    ipAddress: req.clientIP,
                    userAgent: req.userAgent,
                    requireSufficientBalance: false,
                    client,
                    managedTransaction: true
                });

            if (!balanceResult.success) {
                await client.query('ROLLBACK');
                return res.status(500).json({
                    success: false,
                    message: '余额修改失败'
                });
            }
            const responseBody = {
                success: true,
                message: '余额修改成功',
                newBalance: balance,
                oldBalance: currentBalance
            };
            await auditAdminAction({
                client,
                adminUsername,
                action: 'balance_set',
                targetUsername: username,
                details: { oldBalance: currentBalance, newBalance: balance, delta },
                clientIP: req.clientIP,
                requestId: req.idempotencyKey,
                authStrength: getAdminTotpSecret(adminUsername) ? 'password_totp' : 'password'
            });
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            notifyAdminAction(adminUsername, 'balance_set', username, { oldBalance: currentBalance, newBalance: balance });
            res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('修改余额失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    // 审核听写提交
    app.post('/api/admin/dictation/mark', ...highRiskAdminGuards, requireCSRF, async (req, res) => {
        let client;
        try {
            const id = Number(req.body?.id);
            const status = String(req.body?.status || '');
            const allowed = new Set(['correct', 'wrong', 'rewrite']);
            if (!Number.isSafeInteger(id) || id < 1 || !allowed.has(status)) {
                return res.status(400).json({ success: false, message: '参数错误' });
            }
            let adminMessage = null;
            if (typeof req.body?.message === 'string') {
                const trimmed = req.body.message.trim();
                if (trimmed) {
                    adminMessage = trimmed.slice(0, 300);
                }
            }

            client = await pool.connect();
            await client.query('BEGIN');
            const targetResult = await client.query(
                'SELECT username FROM dictation_submissions WHERE id = $1',
                [id]
            );
            if (!targetResult.rows[0]) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: '记录不存在' });
            }
            await client.query(
                "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
                [`dictation:${targetResult.rows[0].username}`]
            );
            const submissionResult = await client.query(`
                SELECT submission.username, submission.level, submission.set_id,
                       submission.session_id, submission.session_version,
                       submission.status, submission.review_version
                FROM dictation_submissions AS submission
                WHERE submission.id = $1
                FOR UPDATE
            `, [id]);
            const submission = submissionResult.rows[0];
            if (!submission) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: '记录不存在' });
            }
            let currentSessionVersion = null;
            if (submission.session_id) {
                const sessionResult = await client.query(`
                    SELECT version, result
                    FROM dictation_sessions
                    WHERE id = $1 AND username = $2
                    FOR UPDATE
                `, [submission.session_id, submission.username]);
                currentSessionVersion = sessionResult.rows[0]?.version ?? null;
            }
            if (Number(submission.review_version) > 0) {
                await client.query('ROLLBACK');
                if (submission.status === status) {
                    return res.json({ success: true, message: '该审核结论已经保存' });
                }
                return res.status(409).json({ success: false, message: '该记录已被审核，不能覆盖终态' });
            }
            if (!['pending', 'correct', 'wrong'].includes(submission.status)) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '当前状态不允许审核' });
            }

            const username = submission.username;
            const level = Number(submission.level || 1);
            const setId = submission.set_id !== null ? Number(submission.set_id) : null;
            const sessionId = submission.session_id || null;
            const progressResult = await client.query(`
                SELECT level, set_id, session_id
                FROM dictation_progress
                WHERE username = $1
                FOR UPDATE
            `, [username]);
            const activeSessionResult = await client.query(`
                SELECT id
                FROM dictation_sessions
                WHERE username = $1 AND result = 'in_progress'
                FOR UPDATE
            `, [username]);
            const latestSubmissionResult = await client.query(`
                SELECT id
                FROM dictation_submissions
                WHERE username = $1
                ORDER BY created_at DESC, id DESC
                LIMIT 1
            `, [username]);
            const progressSessionId = progressResult.rows[0]?.session_id || null;
            const activeSessionId = activeSessionResult.rows[0]?.id || null;
            const isCurrentSessionVersion = sessionId
                && progressResult.rows.length === 1
                && Number(submission.session_version) > 0
                && Number(submission.session_version) === Number(currentSessionVersion)
                && Number(latestSubmissionResult.rows[0]?.id) === id
                && (!activeSessionId || Number(activeSessionId) === Number(sessionId))
                && (!progressSessionId || Number(progressSessionId) === Number(sessionId));
            const updated = await client.query(`
                UPDATE dictation_submissions
                SET status = $1, admin_message = $2,
                    review_version = 1, reviewed_at = NOW(), reviewed_by = $3
                WHERE id = $4 AND review_version = 0
                RETURNING id
            `, [status, adminMessage, req.session.user.username, id]);
            if (updated.rows.length !== 1) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '审核状态已变更' });
            }

            if (isCurrentSessionVersion) {
                const terminalResult = status === 'wrong'
                    ? 'failed'
                    : status === 'correct' && level >= 3 ? 'passed' : null;
                const sessionUpdated = await client.query(`
                        UPDATE dictation_sessions
                        SET result = $1,
                            ended_at = CASE WHEN $1 = 'in_progress' THEN NULL ELSE NOW() END
                        WHERE id = $2 AND username = $3 AND version = $4
                        RETURNING id
                `, [terminalResult || 'in_progress', sessionId, username, submission.session_version]);
                if (sessionUpdated.rowCount !== 1) {
                    throw new Error('Dictation session state changed during review');
                }

                if (terminalResult) {
                    const progressCleared = await client.query(`
                        UPDATE dictation_progress
                        SET level = 1, set_id = NULL, session_id = NULL,
                            question_id = NULL, question_token_hash = NULL,
                            bank_version = NULL, question_issued_at = NULL, updated_at = NOW()
                        WHERE username = $1
                          AND (session_id = $2 OR session_id IS NULL)
                        RETURNING username
                    `, [username, sessionId]);
                    if (progressCleared.rowCount !== 1) {
                        throw new Error('Dictation progress was not cleared during review');
                    }
                } else {
                    const progressUpdated = await client.query(`
                        INSERT INTO dictation_progress (username, level, set_id, session_id, updated_at)
                        VALUES ($1, $2, $3, $4, NOW())
                        ON CONFLICT (username) DO UPDATE
                        SET level = EXCLUDED.level,
                            set_id = EXCLUDED.set_id,
                            session_id = EXCLUDED.session_id,
                            question_id = NULL,
                            question_token_hash = NULL,
                            bank_version = NULL,
                            question_issued_at = NULL,
                            updated_at = NOW()
                        WHERE dictation_progress.session_id = EXCLUDED.session_id
                           OR dictation_progress.session_id IS NULL
                        RETURNING username
                    `, [username, status === 'correct' ? Math.min(level + 1, 3) : level, setId, sessionId]);
                    if (progressUpdated.rowCount !== 1) {
                        throw new Error('Dictation progress state changed during review');
                    }
                }
            }

            const responseBody = {
                success: true,
                message: isCurrentSessionVersion ? '已更新' : '已记录审核，较新会话进度保持不变'
            };
            await auditAdminAction({
                client,
                adminUsername: req.session.user.username,
                action: 'dictation_mark',
                targetUsername: username,
                details: {
                    submissionId: id,
                    previousStatus: submission.status,
                    status,
                    level,
                    sessionVersion: submission.session_version,
                    affectedCurrentProgress: Boolean(isCurrentSessionVersion)
                },
                clientIP: req.clientIP,
                requestId: req.idempotencyKey
            });
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            notifyAdminAction(req.session.user.username, 'dictation_mark', username, { submissionId: id, status });
            return res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('Dictation mark error:', error);
            return res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    // 删除账户
    app.post('/api/admin/delete-account', ...highRiskAdminGuards, requireCSRF, async (req, res) => {
        try {
            const username = normalizeUsername(req.body?.username);

            if (!usernamePattern.test(username)) {
                return res.status(400).json({ success: false, message: '用户名格式无效' });
            }

            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(
                    "SELECT pg_advisory_xact_lock(hashtextextended($1 || ':gift_exchange', 0))",
                    [username]
                );
                await client.query(
                    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
                    [`pk:${username}`]
                );

                const userResult = await client.query(
                    'SELECT is_admin, deactivated FROM users WHERE username = $1 FOR UPDATE',
                    [username]
                );
                if (userResult.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({ success: false, message: '用户不存在' });
                }
                if (userResult.rows[0].is_admin) {
                    await client.query('ROLLBACK');
                    return res.status(403).json({ success: false, message: '不能删除管理员账户' });
                }
                if (userResult.rows[0].deactivated === true) {
                    await client.query('ROLLBACK');
                    return res.json({ success: true, message: '账户已经停用' });
                }

                const cancelableGifts = await client.query(`
                    SELECT id, gift_name, cost, quantity, delivery_status
                    FROM gift_exchanges
                    WHERE username = $1
                      AND status = 'funds_locked'
                      AND delivery_status IN ('pending', 'claimed')
                      AND started_at IS NULL
                    ORDER BY id
                    FOR UPDATE
                `, [username]);
                let refundedGiftAmount = 0;
                for (const gift of cancelableGifts.rows) {
                    const refundAmount = parseMoney(gift.cost, 'deactivated gift cost', { min: 0 });
                    if (refundAmount > 0) {
                        const refund = await BalanceLogger.updateBalance({
                            username,
                            amount: refundAmount,
                            operationType: 'account_deactivation_gift_refund',
                            description: `账户停用，取消尚未开始发送的礼物任务 ${gift.id}`,
                            gameData: {
                                taskId: gift.id,
                                giftName: gift.gift_name,
                                quantity: Number(gift.quantity),
                                previousDeliveryStatus: gift.delivery_status
                            },
                            requestId: `deactivate:${username}:gift:${gift.id}`,
                            requireSufficientBalance: false,
                            client,
                            managedTransaction: true
                        });
                        if (!refund.success) throw new Error('Account deactivation gift refund failed');
                        refundedGiftAmount = addMoney(
                            refundedGiftAmount,
                            refundAmount,
                            'account-deactivation gift refund total'
                        );
                    }
                    const cancelled = await client.query(`
                        UPDATE gift_exchanges
                        SET status = 'failed', delivery_status = 'failed',
                            failure_reason = '账户停用，外部发送尚未开始',
                            processed_at = NOW(), lease_expires_at = NOW(), updated_at = NOW()
                        WHERE id = $1
                          AND status = 'funds_locked'
                          AND delivery_status = $2
                          AND started_at IS NULL
                        RETURNING id
                    `, [gift.id, gift.delivery_status]);
                    if (cancelled.rowCount !== 1) {
                        throw new Error('Account deactivation gift state changed concurrently');
                    }
                    await client.query(`
                        UPDATE wish_inventory
                        SET status = 'stored', gift_exchange_id = NULL,
                            last_failure_reason = '账户停用，发送任务已取消',
                            expires_at = 'infinity'::timestamptz,
                            updated_at = NOW()
                        WHERE gift_exchange_id = $1
                    `, [gift.id]);
                }

                const releasablePk = await client.query(`
                    SELECT authorization_id, ticket_count
                    FROM pk_spend_authorizations
                    WHERE username = $1 AND status = 'reserved'
                    ORDER BY created_at, authorization_id
                    FOR UPDATE
                `, [username]);
                let refundedPkAmount = 0;
                for (const authorization of releasablePk.rows) {
                    const refundAmount = parseMoney(
                        authorization.ticket_count,
                        'deactivated PK reservation',
                        { min: 1, max: 100000000 }
                    );
                    const refund = await BalanceLogger.updateBalance({
                        username,
                        amount: refundAmount,
                        operationType: 'account_deactivation_pk_release',
                        description: `账户停用，释放尚未开始发送的PK预扣 ${refundAmount} 积分`,
                        gameData: { authorizationId: authorization.authorization_id },
                        requestId: `${authorization.authorization_id}:account-deactivation-release`,
                        requireSufficientBalance: false,
                        client,
                        managedTransaction: true
                    });
                    if (!refund.success) throw new Error('Account deactivation PK release failed');
                    const released = await client.query(`
                        UPDATE pk_spend_authorizations
                        SET status = 'released',
                            outcome_reason = '账户停用，发送尚未开始',
                            settled_at = NOW(), updated_at = NOW()
                        WHERE authorization_id = $1 AND status = 'reserved'
                        RETURNING authorization_id
                    `, [authorization.authorization_id]);
                    if (released.rowCount !== 1) {
                        throw new Error('Account deactivation PK authorization changed concurrently');
                    }
                    refundedPkAmount = addMoney(
                        refundedPkAmount,
                        refundAmount,
                        'account-deactivation PK refund total'
                    );
                }

                const pkControlResult = await client.query(`
                    SELECT command_generation, desired_running
                    FROM pk_control_state
                    WHERE username = $1
                    FOR UPDATE
                `, [username]);
                const pkRunnerResult = await client.query(`
                    SELECT running
                    FROM pk_runner_state
                    WHERE username = $1
                    FOR UPDATE
                `, [username]);
                const activePkTasks = await client.query(`
                    SELECT id
                    FROM pk_tasks
                    WHERE username = $1
                      AND status IN ('pending', 'claimed', 'processing', 'uncertain')
                    ORDER BY id
                    FOR UPDATE
                `, [username]);
                let pkStopGeneration = null;
                const pkControl = pkControlResult.rows[0];
                const pkRunnerRunning = pkRunnerResult.rows[0]?.running === true;
                const needsPkStop = pkControl?.desired_running === true
                    || pkRunnerRunning
                    || activePkTasks.rows.length > 0;
                if (needsPkStop) {
                    const stoppedControl = await client.query(`
                        INSERT INTO pk_control_state (
                            username, command_generation, desired_running, room_id, updated_at
                        ) VALUES ($1, 1, FALSE, NULL, NOW())
                        ON CONFLICT (username) DO UPDATE
                        SET command_generation = pk_control_state.command_generation + 1,
                            desired_running = FALSE, room_id = NULL, updated_at = NOW()
                        RETURNING command_generation
                    `, [username]);
                    if (stoppedControl.rowCount !== 1) {
                        throw new Error('Account deactivation PK control changed concurrently');
                    }
                    pkStopGeneration = parseInteger(
                        stoppedControl.rows[0].command_generation,
                        'account-deactivation PK stop generation',
                        { min: 1 }
                    );
                    await client.query(`
                        UPDATE pk_tasks
                        SET status = 'superseded', processed_at = NOW(),
                            error = '账户停用，由停止指令替代'
                        WHERE username = $1
                          AND status IN ('pending', 'claimed', 'processing', 'uncertain')
                          AND (command_generation IS NULL OR command_generation < $2)
                    `, [username, pkStopGeneration]);
                    await client.query(`
                        INSERT INTO pk_tasks (username, action, status, command_generation, error)
                        VALUES ($1, 'stop', 'pending', $2, '账户停用，等待停止运行进程')
                    `, [username, pkStopGeneration]);
                }

                const unresolvedGiftResult = await client.query(`
                    SELECT COUNT(*)::integer AS count
                    FROM gift_exchanges
                    WHERE username = $1 AND status = 'funds_locked'
                      AND delivery_status IN ('processing', 'uncertain')
                `, [username]);
                const unresolvedPkResult = await client.query(`
                    SELECT COUNT(*)::integer AS count
                    FROM pk_spend_authorizations
                    WHERE username = $1 AND status IN ('sending', 'uncertain')
                `, [username]);
                const unresolvedGiftCount = parseInteger(
                    unresolvedGiftResult.rows[0]?.count || 0,
                    'account-deactivation unresolved gift count',
                    { min: 0 }
                );
                const unresolvedPkCount = parseInteger(
                    unresolvedPkResult.rows[0]?.count || 0,
                    'account-deactivation unresolved PK count',
                    { min: 0 }
                );

                const sessionResult = await client.query(
                    'SELECT session_id FROM active_sessions WHERE username = $1 FOR UPDATE',
                    [username]
                );
                const sessionIds = sessionResult.rows.map(row => row.session_id);
                if (sessionIds.length > 0) {
                    await client.query(
                        'DELETE FROM user_sessions WHERE sid = ANY($1::text[])',
                        [sessionIds]
                    );
                }

                await client.query(`
                    UPDATE active_sessions
                    SET is_active = false,
                        terminated_at = NOW(),
                        termination_reason = 'account_deactivated'
                    WHERE username = $1
                `, [username]);
                await client.query(`
                    UPDATE password_reset_tokens
                    SET revoked_at = NOW()
                    WHERE username = $1 AND used_at IS NULL AND revoked_at IS NULL
                `, [username]);
                await client.query(`
                    UPDATE wish_inventory
                    SET expires_at = 'infinity'::timestamptz,
                        updated_at = NOW()
                    WHERE username = $1 AND status = 'stored'
                `, [username]);
                const deactivated = await client.query(`
                    UPDATE users
                    SET deactivated = true,
                        authorized = false,
                        bilibili_room_id = NULL,
                        bilibili_room_bound_at = NULL
                    WHERE username = $1
                    RETURNING username
                `, [username]);
                if (deactivated.rowCount !== 1) {
                    throw new Error('Account deactivation state changed concurrently');
                }
                const responseBody = {
                    success: true,
                    message: unresolvedGiftCount + unresolvedPkCount > 0
                        ? '账户已停用；存在结果不确定的外部发送，请在对账队列处理'
                        : '账户已停用，审计记录已保留',
                    cancelledGiftTasks: cancelableGifts.rows.length,
                    refundedGiftAmount,
                    releasedPkReservations: releasablePk.rows.length,
                    refundedPkAmount,
                    unresolvedGiftCount,
                    unresolvedPkCount,
                    pkStopQueued: pkStopGeneration !== null
                };
                await auditAdminAction({
                    client,
                    adminUsername: req.session.user.username,
                    action: 'deactivate_account',
                    targetUsername: username,
                    details: {
                        financialHistoryPreserved: true,
                        terminatedSessions: sessionIds.length,
                        cancelledGiftTasks: cancelableGifts.rows.length,
                        refundedGiftAmount,
                        releasedPkReservations: releasablePk.rows.length,
                        refundedPkAmount,
                        unresolvedGiftCount,
                        unresolvedPkCount,
                        pkStopGeneration
                    },
                    clientIP: req.clientIP,
                    requestId: req.idempotencyKey
                });
                await req.finalizeIdempotency?.(client, 200, responseBody);
                await client.query('COMMIT');

                runPostCommitEffect('账户停用后的会话断开', () => disconnectUserSockets(username));
                notifyAdminAction(req.session.user.username, 'deactivate_account', username, {
                    unresolvedGiftCount,
                    unresolvedPkCount
                });

                return res.json(responseBody);
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }

        } catch (error) {
            console.error('删除账户失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    // 解锁账户
    app.post('/api/admin/unlock-account', ...highRiskAdminGuards, requireCSRF, async (req, res) => {
        let client;
        try {
            const username = normalizeUsername(req.body?.username);

            if (!usernamePattern.test(username)) {
                return res.status(400).json({ success: false, message: '用户名格式无效' });
            }

            client = await pool.connect();
            await client.query('BEGIN');
            const result = await client.query(
                `UPDATE users
                 SET login_failures = 0, last_failure_time = NULL, locked_until = NULL
                 WHERE username = $1
                 RETURNING username`,
                [username]
            );

            if (result.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: '用户不存在' });
            }

            const responseBody = { success: true, message: '账户解锁成功' };
            await auditAdminAction({
                client,
                adminUsername: req.session.user.username,
                action: 'unlock_account',
                targetUsername: username,
                clientIP: req.clientIP,
                requestId: req.idempotencyKey
            });
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            notifyAdminAction(req.session.user.username, 'unlock_account', username);
            res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('解锁账户失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    // 清除失败记录
    app.post('/api/admin/clear-failures', ...highRiskAdminGuards, requireCSRF, async (req, res) => {
        let client;
        try {
            const username = normalizeUsername(req.body?.username);

            if (!usernamePattern.test(username)) {
                return res.status(400).json({ success: false, message: '用户名格式无效' });
            }

            client = await pool.connect();
            await client.query('BEGIN');
            const result = await client.query(
                `UPDATE users
                 SET login_failures = 0, last_failure_time = NULL
                 WHERE username = $1
                 RETURNING username`,
                [username]
            );

            if (result.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: '用户不存在' });
            }

            const responseBody = { success: true, message: '失败记录清除成功' };
            await auditAdminAction({
                client,
                adminUsername: req.session.user.username,
                action: 'clear_login_failures',
                targetUsername: username,
                clientIP: req.clientIP,
                requestId: req.idempotencyKey
            });
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            notifyAdminAction(req.session.user.username, 'clear_login_failures', username);
            res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('清除失败记录失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    // 管理员修改自己密码
    app.post('/api/admin/change-self-password', ...highRiskAdminGuards, requireCSRF, async (req, res) => {
        let client;
        try {
            const { oldPassword, newPassword } = req.body || {};
            const username = req.session.user.username;

            if (typeof oldPassword !== 'string' || typeof newPassword !== 'string'
                || !oldPassword || !newPassword || Buffer.byteLength(oldPassword, 'utf8') > 72) {
                return res.status(400).json({ success: false, message: '缺少必要参数' });
            }

            if (newPassword.length < 12 || newPassword.length > 128
                || Buffer.byteLength(newPassword, 'utf8') > 72
                || !/\p{L}/u.test(newPassword) || !/\p{N}/u.test(newPassword)) {
                return res.status(400).json({ success: false, message: '新密码须为12-128位，并同时包含字母和数字' });
            }

            const userResult = await pool.query(
                'SELECT password_hash FROM users WHERE username = $1',
                [username]
            );

            if (userResult.rows.length === 0) {
                return res.status(404).json({ success: false, message: '用户不存在' });
            }

            const currentPasswordHash = userResult.rows[0].password_hash;
            const isOldPasswordValid = await bcrypt.compare(oldPassword, currentPasswordHash);

            if (!isOldPasswordValid) {
                return res.status(400).json({ success: false, message: '当前密码错误' });
            }

            const hashedNewPassword = await bcrypt.hash(newPassword, 12);
            client = await pool.connect();
            await client.query('BEGIN');
            const updateResult = await client.query(
                `UPDATE users
                 SET password_hash = $1,
                     login_failures = 0,
                     last_failure_time = NULL,
                     locked_until = NULL
                 WHERE username = $2
                   AND password_hash = $3
                   AND is_admin = true
                   AND deactivated = false
                 RETURNING username`,
                [hashedNewPassword, username, currentPasswordHash]
            );
            if (updateResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '密码已被其他会话修改，请重新登录' });
            }
            await client.query(`
                UPDATE password_reset_tokens
                SET revoked_at = NOW()
                WHERE username = $1 AND used_at IS NULL AND revoked_at IS NULL
            `, [username]);
            const otherSessions = await client.query(
                `SELECT session_id
                 FROM active_sessions
                 WHERE username = $1 AND session_id != $2 AND is_active = true
                 FOR UPDATE`,
                [username, req.sessionID]
            );
            const otherSessionIds = otherSessions.rows.map((row) => row.session_id);
            await client.query(
                `UPDATE active_sessions
                 SET is_active = false, terminated_at = NOW(), termination_reason = 'password_changed'
                 WHERE username = $1 AND session_id != $2 AND is_active = true`,
                [username, req.sessionID]
            );
            if (otherSessionIds.length > 0) {
                await client.query('DELETE FROM user_sessions WHERE sid = ANY($1::text[])', [otherSessionIds]);
            }
            const responseBody = { success: true, message: '密码修改成功' };
            await auditAdminAction({
                client,
                adminUsername: username,
                action: 'change_admin_password',
                targetUsername: username,
                details: { terminatedSessions: otherSessionIds.length },
                clientIP: req.clientIP,
                requestId: req.idempotencyKey,
                authStrength: getAdminTotpSecret(adminUsername) ? 'password_totp' : 'password'
            });
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');

            runPostCommitEffect('管理员改密后的会话断开', () => disconnectUserSockets(username, otherSessionIds));
            notifyAdminAction(username, 'change_admin_password', username);

            res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('修改密码失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    // 获取房间号绑定状态 (管理员可查看所有用户，普通用户只能查看自己)
    app.get('/api/bilibili/room', requireLogin, requireAuthorized, readHeavyRateLimit, async (req, res) => {
        try {
            const username = req.session.user.username;
            const isAdmin = req.session.user.is_admin;
            const targetUsername = normalizeUsername(req.query?.username);
            if (targetUsername && !usernamePattern.test(targetUsername)) {
                return res.status(400).json({ success: false, message: '用户名格式无效' });
            }

            // 普通用户只能查看自己的信息
            const usernameToQuery = (isAdmin && targetUsername) ? targetUsername : username;

            // 如果是管理员且未指定用户，返回所有用户的房间绑定信息
            if (isAdmin && !targetUsername) {
                const result = await pool.query(`
                    SELECT username, bilibili_room_id, bilibili_room_bound_at AS bind_time
                    FROM users
                    WHERE bilibili_room_id IS NOT NULL
                    ORDER BY username
                    LIMIT 501
                `);
                const truncated = result.rows.length > 500;

                return res.json({
                    success: true,
                    isAdminView: true,
                    truncated,
                    allBindings: result.rows.slice(0, 500).map(row => ({
                        username: row.username,
                        roomId: row.bilibili_room_id,
                        bindTime: row.bind_time
                    }))
                });
            }

            const result = await pool.query(`
                SELECT bilibili_room_id, bilibili_room_bound_at AS bind_time
                FROM users
                WHERE username = $1
            `, [usernameToQuery]);

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: '用户不存在'
                });
            }

            const roomInfo = result.rows[0];

            res.json({
                success: true,
                username: usernameToQuery,
                roomId: roomInfo.bilibili_room_id || null,
                bindTime: roomInfo.bind_time,
                isBound: !!roomInfo.bilibili_room_id,
                isAdminView: isAdmin && targetUsername
            });

        } catch (error) {
            console.error('获取房间号失败:', error);
            res.status(500).json({
                success: false,
                message: '服务器错误'
            });
        }
    });

    // 绑定或更新B站房间号 (仅管理员)
    app.post('/api/bilibili/room', ...highRiskAdminGuards, requireCSRF, async (req, res) => {
        let client;
        try {
            const { roomId, targetUsername } = req.body || {};
            const adminUsername = req.session.user.username;
            const normalizedTargetUsername = normalizeUsername(targetUsername);
            const usernameToUpdate = normalizedTargetUsername
                ? normalizedTargetUsername
                : adminUsername;
            const normalizedRoomId = String(roomId || '').trim();

            if (!usernamePattern.test(usernameToUpdate)) {
                return res.status(400).json({ success: false, message: '用户名格式无效' });
            }

            // B站既有短房间号，也有较长的普通房间号。
            if (!/^\d{1,12}$/.test(normalizedRoomId) || Number(normalizedRoomId) <= 0) {
                return res.status(400).json({
                    success: false,
                    message: '房间号格式不正确，应为1-12位数字'
                });
            }

            client = await pool.connect();
            await client.query('BEGIN');
            await client.query(
                "SELECT pg_advisory_xact_lock(hashtextextended($1 || ':gift_exchange', 0))",
                [usernameToUpdate]
            );
            await client.query(
                "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
                [`pk:${usernameToUpdate}`]
            );
            await client.query(
                "SELECT pg_advisory_xact_lock(hashtextextended('bilibili-room:' || $1, 0))",
                [normalizedRoomId]
            );
            const target = await client.query(
                `SELECT username, bilibili_room_id, deactivated
                 FROM users
                 WHERE username = $1
                 FOR UPDATE`,
                [usernameToUpdate]
            );
            if (target.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({
                    success: false,
                    message: `用户 ${usernameToUpdate} 不存在`
                });
            }
            if (target.rows[0].deactivated === true) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '账户已停用，不能绑定房间' });
            }

            // 检查房间号是否已被其他用户绑定
            const existingResult = await client.query(`
                SELECT username FROM users 
                WHERE bilibili_room_id = $1 AND username != $2
            `, [normalizedRoomId, usernameToUpdate]);

            if (existingResult.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    message: `房间号 ${normalizedRoomId} 已被用户 ${existingResult.rows[0].username} 绑定`
                });
            }

            const previousRoomId = target.rows[0].bilibili_room_id
                ? String(target.rows[0].bilibili_room_id)
                : null;
            const roomChanged = previousRoomId !== normalizedRoomId;
            const transition = roomChanged
                ? await prepareExternalWorkForAccountTransition({
                    client,
                    username: usernameToUpdate,
                    reason: previousRoomId
                        ? `从房间 ${previousRoomId} 更换为 ${normalizedRoomId}`
                        : `绑定房间 ${normalizedRoomId}`,
                    requestId: req.idempotencyKey
                })
                : {
                    cancelledGiftTasks: 0,
                    refundedGiftAmount: 0,
                    releasedPkReservations: 0,
                    refundedPkAmount: 0,
                    unresolvedGiftCount: 0,
                    unresolvedPkCount: 0,
                    pkStopGeneration: null
                };

            // 更新用户的房间号
            const updated = await client.query(`
                UPDATE users
                SET bilibili_room_id = $1,
                    bilibili_room_bound_at = CASE
                        WHEN bilibili_room_id IS DISTINCT FROM $1 THEN NOW()
                        ELSE bilibili_room_bound_at
                    END
                WHERE username = $2 AND deactivated = FALSE
                RETURNING username
            `, [normalizedRoomId, usernameToUpdate]);
            if (updated.rowCount !== 1) {
                throw new Error('Room binding target changed concurrently');
            }
            const hasUnresolved = transition.unresolvedGiftCount + transition.unresolvedPkCount > 0;
            const responseBody = {
                success: true,
                message: hasUnresolved
                    ? `房间已更新；旧房间仍有外部结果待对账，确认前不会重复发送或退款`
                    : `成功为用户 ${usernameToUpdate} 绑定B站房间号: ${normalizedRoomId}`,
                roomId: normalizedRoomId,
                targetUser: usernameToUpdate,
                roomChanged,
                ...transition
            };
            const scheduledInventoryCount = await scheduleWishInventoryDeliveryOnBind(
                usernameToUpdate,
                client
            );
            responseBody.scheduledInventoryCount = scheduledInventoryCount;
            await auditAdminAction({
                client,
                adminUsername,
                action: 'bind_bilibili_room',
                targetUsername: usernameToUpdate,
                details: {
                    previousRoomId,
                    roomId: normalizedRoomId,
                    roomChanged,
                    scheduledInventoryCount,
                    ...transition
                },
                clientIP: req.clientIP,
                requestId: req.idempotencyKey
            });
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');

            notifyAdminAction(adminUsername, 'bind_bilibili_room', usernameToUpdate, { roomId: normalizedRoomId });
            res.json(responseBody);

        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('绑定房间号失败:', error);
            res.status(500).json({
                success: false,
                message: '服务器错误'
            });
        } finally {
            client?.release();
        }
    });

    // 手动刷新B站Cookie (仅管理员)
    app.post('/api/bilibili/cookies/refresh', ...highRiskAdminGuards, requireCSRF, async (req, res) => {
        res.status(409).json({
            success: false,
            code: 'COOKIE_MANAGED_BY_WORKER',
            message: 'Cookie 由 Windows 工作器本地管理，网站无法远程刷新'
        });
    });

    // 检查B站Cookie状态 (仅管理员)
    app.get('/api/bilibili/cookies/status', ...adminApiGuards, async (req, res) => {
        res.json({
            success: true,
            valid: null,
            expired: null,
            managedExternally: true,
            reason: '网站无法读取 Windows 工作器的本地 Cookie 状态'
        });
    });

    // 解除房间号绑定 (仅管理员)
    app.delete('/api/bilibili/room', ...highRiskAdminGuards, requireCSRF, async (req, res) => {
        let client;
        try {
            const { targetUsername } = req.body || {};
            const adminUsername = req.session.user.username;
            const normalizedTargetUsername = normalizeUsername(targetUsername);
            const usernameToUpdate = normalizedTargetUsername
                ? normalizedTargetUsername
                : adminUsername;
            if (!usernamePattern.test(usernameToUpdate)) {
                return res.status(400).json({ success: false, message: '用户名格式无效' });
            }

            client = await pool.connect();
            await client.query('BEGIN');
            await client.query(
                "SELECT pg_advisory_xact_lock(hashtextextended($1 || ':gift_exchange', 0))",
                [usernameToUpdate]
            );
            await client.query(
                "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
                [`pk:${usernameToUpdate}`]
            );
            const target = await client.query(`
                SELECT username, bilibili_room_id, deactivated
                FROM users
                WHERE username = $1
                FOR UPDATE
            `, [usernameToUpdate]);
            if (target.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({
                    success: false,
                    message: `用户 ${usernameToUpdate} 不存在`
                });
            }
            if (target.rows[0].deactivated === true) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '账户已停用' });
            }
            const previousRoomId = target.rows[0].bilibili_room_id
                ? String(target.rows[0].bilibili_room_id)
                : null;
            const transition = await prepareExternalWorkForAccountTransition({
                client,
                username: usernameToUpdate,
                reason: previousRoomId ? `解除房间 ${previousRoomId}` : '确认保持未绑定状态',
                requestId: req.idempotencyKey
            });
            const result = await client.query(`
                UPDATE users
                SET bilibili_room_id = NULL,
                    bilibili_room_bound_at = NULL
                WHERE username = $1 AND deactivated = FALSE
                RETURNING username
            `, [usernameToUpdate]);
            if (result.rowCount !== 1) {
                throw new Error('Room unbinding target changed concurrently');
            }

            await client.query(`
                UPDATE wish_inventory
                SET expires_at = 'infinity'::timestamptz,
                    updated_at = NOW()
                WHERE username = $1
                  AND status = 'stored'
            `, [usernameToUpdate]);
            const hasUnresolved = transition.unresolvedGiftCount + transition.unresolvedPkCount > 0;
            const responseBody = {
                success: true,
                message: hasUnresolved
                    ? `房间已解除；旧房间仍有外部结果待对账，确认前不会退款`
                    : `成功为用户 ${usernameToUpdate} 解除房间号绑定`,
                targetUser: usernameToUpdate,
                previousRoomId,
                ...transition
            };
            await auditAdminAction({
                client,
                adminUsername,
                action: 'unbind_bilibili_room',
                targetUsername: usernameToUpdate,
                details: { previousRoomId, ...transition },
                clientIP: req.clientIP,
                requestId: req.idempotencyKey
            });
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');

            notifyAdminAction(adminUsername, 'unbind_bilibili_room', usernameToUpdate);
            res.json(responseBody);

        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('解除房间号绑定失败:', error);
            res.status(500).json({
                success: false,
                message: '服务器错误'
            });
        } finally {
            client?.release();
        }
    });

    // 管理员查看所有余额记录 API
    app.get('/api/admin/balance/logs', ...adminApiGuards, async (req, res) => {
        try {
            const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
            const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
            const offset = (page - 1) * limit;
            const operationType = req.query.type || null;

            const logs = await BalanceLogger.getAllBalanceLogs(limit, offset, operationType);

            res.json({
                success: true,
                logs: logs,
                page: page,
                limit: limit,
                operationType: operationType
            });
        } catch (error) {
            console.error('Admin balance logs error:', error);
            res.status(500).json({ success: false, message: '获取记录失败' });
        }
    });

    // 获取IP风险信息
    app.get('/api/admin/ip/:ip', ...adminApiGuards, async (req, res) => {
        try {
            const ip = req.params.ip;
            if (!net.isIP(ip)) {
                return res.status(400).json({ success: false, message: 'IP格式无效' });
            }
            const [riskData, stats] = await Promise.all([
                IPManager.getIPRiskScore(ip),
                IPManager.getIPStats(ip)
            ]);

            res.json({
                success: true,
                ip,
                riskData,
                stats
            });
        } catch (error) {
            console.error('获取IP信息失败:', error);
            res.status(500).json({ success: false, message: '获取IP信息失败' });
        }
    });

    // 添加IP到黑名单
    app.post('/api/admin/ip/blacklist', ...highRiskAdminGuards, requireCSRF, async (req, res) => {
        let client;
        try {
            const ip = typeof req.body?.ip === 'string' ? req.body.ip.trim() : '';
            const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
            const adminUser = req.session.user.username;

            if (!net.isIP(ip) || !reason) {
                return res.status(400).json({ success: false, message: 'IP和原因不能为空' });
            }

            client = await pool.connect();
            await client.query('BEGIN');
            await client.query(`
                INSERT INTO ip_blacklist (ip_address, reason, added_by, created_at, is_active)
                VALUES ($1, $2, $3, NOW(), true)
                ON CONFLICT (ip_address) DO UPDATE SET
                    reason = EXCLUDED.reason,
                    added_by = EXCLUDED.added_by,
                    updated_at = NOW(),
                    is_active = true
            `, [ip, reason, adminUser]);
            await client.query('UPDATE ip_whitelist SET is_active = false, updated_at = NOW() WHERE ip_address = $1', [ip]);
            const responseBody = { success: true, message: 'IP已添加到黑名单' };
            await auditAdminAction({
                client,
                adminUsername: adminUser,
                action: 'blacklist_ip',
                details: { ip, reason },
                clientIP: req.clientIP,
                requestId: req.idempotencyKey
            });
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            runPostCommitEffect('IP风险缓存清理', () => IPManager.clearRiskCacheForIP(ip));
            runPostCommitEffect('黑名单缓存刷新', () => security.refreshBlacklist(true));
            notifyAdminAction(adminUser, 'blacklist_ip', null, { ip, reason });
            res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('添加IP黑名单失败:', error);
            res.status(500).json({ success: false, message: '系统错误' });
        } finally {
            client?.release();
        }
    });

    // 添加IP到白名单
    app.post('/api/admin/ip/whitelist', ...highRiskAdminGuards, requireCSRF, async (req, res) => {
        let client;
        try {
            const ip = typeof req.body?.ip === 'string' ? req.body.ip.trim() : '';
            const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
            const adminUser = req.session.user.username;

            if (!net.isIP(ip) || !reason) {
                return res.status(400).json({ success: false, message: 'IP和原因不能为空' });
            }

            client = await pool.connect();
            await client.query('BEGIN');
            await client.query(`
                INSERT INTO ip_whitelist (ip_address, reason, added_by, created_at, is_active)
                VALUES ($1, $2, $3, NOW(), true)
                ON CONFLICT (ip_address) DO UPDATE SET
                    reason = EXCLUDED.reason,
                    added_by = EXCLUDED.added_by,
                    updated_at = NOW(),
                    is_active = true
            `, [ip, reason, adminUser]);
            await client.query('UPDATE ip_blacklist SET is_active = false, updated_at = NOW() WHERE ip_address = $1', [ip]);
            const responseBody = { success: true, message: 'IP已添加到白名单' };
            await auditAdminAction({
                client,
                adminUsername: adminUser,
                action: 'whitelist_ip',
                details: { ip, reason },
                clientIP: req.clientIP,
                requestId: req.idempotencyKey
            });
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            runPostCommitEffect('IP风险缓存清理', () => IPManager.clearRiskCacheForIP(ip));
            runPostCommitEffect('黑名单缓存刷新', () => security.refreshBlacklist(true));
            notifyAdminAction(adminUser, 'whitelist_ip', null, { ip, reason });
            res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('添加IP白名单失败:', error);
            res.status(500).json({ success: false, message: '系统错误' });
        } finally {
            client?.release();
        }
    });

    // 移除IP黑名单
    app.post('/api/admin/ip/remove-blacklist', ...highRiskAdminGuards, requireCSRF, async (req, res) => {
        let client;
        try {
            const ip = typeof req.body?.ip === 'string' ? req.body.ip.trim() : '';
            const adminUser = req.session.user.username;

            if (!net.isIP(ip)) {
                return res.status(400).json({ success: false, message: 'IP不能为空' });
            }

            client = await pool.connect();
            await client.query('BEGIN');
            await client.query('UPDATE ip_blacklist SET is_active = false, updated_at = NOW() WHERE ip_address = $1', [ip]);
            const responseBody = { success: true, message: 'IP已从黑名单移除' };
            await auditAdminAction({
                client,
                adminUsername: adminUser,
                action: 'remove_ip_blacklist',
                details: { ip },
                clientIP: req.clientIP,
                requestId: req.idempotencyKey
            });
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            runPostCommitEffect('IP风险缓存清理', () => IPManager.clearRiskCacheForIP(ip));
            runPostCommitEffect('黑名单缓存刷新', () => security.refreshBlacklist(true));
            notifyAdminAction(adminUser, 'remove_ip_blacklist', null, { ip });
            res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('移除IP黑名单失败:', error);
            res.status(500).json({ success: false, message: '系统错误' });
        } finally {
            client?.release();
        }
    });

    // 强制踢出用户所有会话
    app.post('/api/admin/force-logout', ...highRiskAdminGuards, requireCSRF, async (req, res) => {
        let client;
        let sessionIds = [];
        try {
            const username = normalizeUsername(req.body?.username);
            const adminUser = req.session.user.username;

            if (!usernamePattern.test(username)) {
                return res.status(400).json({ success: false, message: '用户名格式无效' });
            }

            client = await pool.connect();
            await client.query('BEGIN');
            const target = await client.query('SELECT is_admin FROM users WHERE username = $1 FOR UPDATE', [username]);
            if (target.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: '用户不存在' });
            }
            if (target.rows[0].is_admin) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, message: '不能强制注销管理员账户' });
            }

            const sessions = await client.query(
                'SELECT session_id FROM active_sessions WHERE username = $1 AND is_active = true FOR UPDATE',
                [username]
            );
            sessionIds = sessions.rows.map((row) => row.session_id);
            await client.query(`
                UPDATE active_sessions
                SET is_active = false, terminated_at = NOW(), termination_reason = 'admin_force_logout'
                WHERE username = $1 AND is_active = true
            `, [username]);
            if (sessionIds.length > 0) {
                await client.query('DELETE FROM user_sessions WHERE sid = ANY($1::text[])', [sessionIds]);
            }
            const responseBody = {
                success: true,
                message: `已强制注销用户 ${username} 的 ${sessionIds.length} 个会话`
            };
            await auditAdminAction({
                client,
                adminUsername: adminUser,
                action: 'force_logout_user',
                targetUsername: username,
                details: { terminatedSessions: sessionIds.length },
                clientIP: req.clientIP,
                requestId: req.idempotencyKey
            });
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            runPostCommitEffect('强制注销后的会话断开', () => disconnectUserSockets(username));
            notifyAdminAction(adminUser, 'force_logout_user', username, { terminatedSessions: sessionIds.length });
            res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('强制注销失败:', error);
            res.status(500).json({ success: false, message: '强制注销失败' });
        } finally {
            client?.release();
        }
    });

    // 获取活跃会话列表
    app.get('/api/admin/sessions', ...adminApiGuards, async (req, res) => {
        try {
            const stats = await SessionManager.getSessionStats();

            const activeSessions = await pool.query(`
                SELECT username, ip_address, user_agent, created_at, last_activity
                FROM active_sessions 
                WHERE is_active = true 
                ORDER BY last_activity DESC 
                LIMIT 50
            `);

            res.json({
                success: true,
                stats,
                sessions: activeSessions.rows
            });
        } catch (error) {
            console.error('获取会话列表失败:', error);
            res.status(500).json({ success: false, message: '获取会话列表失败' });
        }
    });

    // 获取安全事件列表
    app.get('/api/admin/security-events', ...adminApiGuards, async (req, res) => {
        try {
            const events = await pool.query(`
                SELECT id, event_type, username, ip_address, description, severity, 
                       handled, handled_by, created_at
                FROM security_events 
                ORDER BY created_at DESC 
                LIMIT 100
            `);

            res.json({
                success: true,
                events: events.rows
            });
        } catch (error) {
            console.error('获取安全事件失败:', error);
            res.status(500).json({ success: false, message: '获取安全事件失败' });
        }
    });

    app.get('/api/admin/audit-log', ...adminApiGuards, async (req, res) => {
        try {
            const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
            const beforeId = Number.parseInt(req.query.beforeId, 10);
            const result = await pool.query(`
                SELECT id, request_id, admin_username, action, target_username,
                       details, created_at
                FROM admin_audit_log
                WHERE ($1::bigint IS NULL OR id < $1)
                ORDER BY id DESC
                LIMIT $2
            `, [Number.isSafeInteger(beforeId) && beforeId > 0 ? beforeId : null, limit]);
            res.set('Cache-Control', 'no-store');
            return res.json({
                success: true,
                events: result.rows,
                nextBeforeId: result.rows.length === limit ? result.rows[result.rows.length - 1].id : null
            });
        } catch (error) {
            console.error('读取管理员审计日志失败');
            return res.status(500).json({ success: false, message: '审计日志暂不可用' });
        }
    });

    app.get('/api/admin/gift-reconciliation', ...adminApiGuards, async (req, res) => {
        try {
            const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
            const result = await pool.query(`
                SELECT id, username, gift_type, gift_name, cost, quantity,
                       bilibili_room_id, delivery_status, failure_reason,
                       claim_generation, worker_id, started_at, processed_at,
                       provider_transaction_id, created_at, updated_at
                FROM gift_exchanges
                WHERE status = 'funds_locked' AND delivery_status = 'uncertain'
                ORDER BY updated_at, id
                LIMIT $1
            `, [limit]);
            res.set('Cache-Control', 'no-store');
            return res.json({ success: true, tasks: result.rows });
        } catch (error) {
            console.error('读取礼物对账队列失败');
            return res.status(500).json({ success: false, message: '对账队列暂不可用' });
        }
    });

    app.get('/api/admin/pk-reconciliation', ...adminApiGuards, async (req, res) => {
        try {
            const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
            const [authorizationResult, taskResult] = await Promise.all([
                pool.query(`
                    SELECT authorization_id, username, room_id, runner_generation,
                           worker_id, gift_ids, ticket_count, report_id,
                           outcome_reason, created_at, updated_at
                    FROM pk_spend_authorizations
                    WHERE status = 'uncertain'
                    ORDER BY updated_at, authorization_id
                    LIMIT $1
                `, [limit]),
                pool.query(`
                    SELECT id, username, room_id, action, command_generation,
                           worker_id, claim_generation, started_at, error,
                           created_at, processed_at
                    FROM pk_tasks
                    WHERE status = 'uncertain'
                    ORDER BY processed_at NULLS FIRST, id
                    LIMIT $1
                `, [limit])
            ]);
            res.set('Cache-Control', 'no-store');
            return res.json({
                success: true,
                authorizations: authorizationResult.rows,
                tasks: taskResult.rows
            });
        } catch (error) {
            console.error('读取PK对账队列失败');
            return res.status(500).json({ success: false, message: 'PK对账队列暂不可用' });
        }
    });

    app.post('/api/admin/pk-reconciliation', ...highRiskAdminGuards, requireCSRF, async (req, res) => {
        let client;
        try {
            const authorizationId = String(req.body?.authorizationId || '');
            const outcome = String(req.body?.outcome || '');
            const reason = String(req.body?.reason || '').trim();
            if (!/^[A-Za-z0-9._:-]{16,100}$/.test(authorizationId)
                || !['sent', 'not_sent'].includes(outcome)
                || reason.length < 8 || reason.length > 500) {
                return res.status(400).json({
                    success: false,
                    message: '预授权、结论或至少8字的对账依据无效'
                });
            }
            client = await pool.connect();
            await client.query('BEGIN');
            const authResult = await client.query(`
                SELECT authorization_id, username, ticket_count, status, report_id
                FROM pk_spend_authorizations
                WHERE authorization_id = $1
                FOR UPDATE
            `, [authorizationId]);
            const authorization = authResult.rows[0];
            if (!authorization) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: 'PK预授权不存在' });
            }
            if (authorization.status !== 'uncertain') {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: 'PK预授权已完成对账或状态不允许处理' });
            }
            const ticketCount = parseMoney(
                authorization.ticket_count,
                'PK authorization amount',
                { min: 1, max: 100000000 }
            );
            const refundAmount = outcome === 'not_sent' ? ticketCount : 0;
            if (refundAmount > 0) {
                const refund = await BalanceLogger.updateBalance({
                    username: authorization.username,
                    amount: refundAmount,
                    operationType: 'admin_pk_reconciliation_refund',
                    description: `PK人工对账释放预扣 ${refundAmount} 积分`,
                    gameData: { authorizationId, reportId: authorization.report_id, outcome, reason },
                    requestId: `${authorizationId}:admin-release`,
                    requireSufficientBalance: false,
                    client,
                    managedTransaction: true
                });
                if (!refund.success) throw new Error('PK reconciliation refund failed');
            }
            const reconciled = await client.query(`
                UPDATE pk_spend_authorizations
                SET status = $2,
                    outcome_reason = $3,
                    settled_at = NOW(),
                    updated_at = NOW()
                WHERE authorization_id = $1 AND status = 'uncertain'
                RETURNING authorization_id
            `, [authorizationId, outcome === 'sent' ? 'settled' : 'released', reason]);
            if (reconciled.rowCount !== 1) {
                throw new Error('PK reconciliation state changed concurrently');
            }
            const responseBody = {
                success: true,
                authorizationId,
                outcome,
                refundedAmount: refundAmount
            };
            await auditAdminAction({
                client,
                adminUsername: req.session.user.username,
                action: 'reconcile_pk_spend',
                targetUsername: authorization.username,
                details: { authorizationId, outcome, refundAmount, reason },
                clientIP: req.clientIP,
                requestId: req.idempotencyKey,
                authStrength: getAdminTotpSecret(req.session.user.username)
                    ? 'recent_password_totp' : 'recent_password'
            });
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            notifyAdminAction(req.session.user.username, 'reconcile_pk_spend', authorization.username, {
                authorizationId, outcome, refundAmount
            });
            return res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('PK人工对账失败');
            return res.status(500).json({ success: false, message: 'PK对账处理失败，请核对后重试' });
        } finally {
            client?.release();
        }
    });

    app.post('/api/admin/gift-reconciliation', ...highRiskAdminGuards, requireCSRF, async (req, res) => {
        let client;
        try {
            const taskId = Number(req.body?.taskId);
            const outcome = String(req.body?.outcome || '');
            const reason = String(req.body?.reason || '').trim();
            const requestedDeliveredQuantity = Number(req.body?.deliveredQuantity);
            const providerTransactionId = typeof req.body?.providerTransactionId === 'string'
                && req.body.providerTransactionId.length <= 200
                && !/[\r\n\0]/.test(req.body.providerTransactionId)
                ? req.body.providerTransactionId.trim() || null
                : null;
            if (!Number.isSafeInteger(taskId) || taskId < 1
                || !['sent', 'not_sent', 'partial'].includes(outcome)
                || reason.length < 8 || reason.length > 500) {
                return res.status(400).json({
                    success: false,
                    message: '任务、结论或至少8字的对账依据无效'
                });
            }

            client = await pool.connect();
            await client.query('BEGIN');
            const taskResult = await client.query(`
                SELECT id, username, gift_name, cost, quantity, status,
                       delivery_status, claim_generation, worker_id
                FROM gift_exchanges
                WHERE id = $1
                FOR UPDATE
            `, [taskId]);
            const task = taskResult.rows[0];
            if (!task) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: '礼物任务不存在' });
            }
            if (task.status !== 'funds_locked' || task.delivery_status !== 'uncertain') {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '任务已完成对账或状态不允许处理' });
            }

            const quantity = parseInteger(task.quantity, 'gift quantity', { min: 1, max: 100 });
            const cost = parseMoney(task.cost, 'gift cost', { min: 0 });
            let deliveredQuantity = outcome === 'sent' ? quantity : 0;
            if (outcome === 'partial') deliveredQuantity = requestedDeliveredQuantity;
            if (!Number.isSafeInteger(deliveredQuantity)
                || (outcome === 'partial' && (deliveredQuantity < 1 || deliveredQuantity >= quantity))) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '实际送达数量无效' });
            }
            const actualCost = calculateDeliveredCost(cost, deliveredQuantity, quantity);
            const refundAmount = cost - actualCost;
            if (refundAmount > 0) {
                const refund = await BalanceLogger.updateBalance({
                    username: task.username,
                    amount: refundAmount,
                    operationType: 'admin_gift_reconciliation_refund',
                    description: `礼物人工对账退款 ${refundAmount} 积分`,
                    gameData: { taskId, outcome, deliveredQuantity, quantity, reason },
                    requireSufficientBalance: false,
                    client,
                    managedTransaction: true
                });
                if (!refund.success) throw new Error('Gift reconciliation refund failed');
            }

            const completed = deliveredQuantity > 0;
            const deliveryStatus = outcome === 'partial'
                ? 'partial_success'
                : completed ? 'success' : 'failed';
            const reconciled = await client.query(`
                UPDATE gift_exchanges
                SET status = $2,
                    delivery_status = $3,
                    failure_reason = $4,
                    provider_transaction_id = COALESCE($5, provider_transaction_id),
                    processed_at = NOW(), lease_expires_at = NOW(), updated_at = NOW()
                WHERE id = $1 AND status = 'funds_locked' AND delivery_status = 'uncertain'
                RETURNING id
            `, [taskId, completed ? 'completed' : 'failed', deliveryStatus, reason, providerTransactionId]);
            if (reconciled.rowCount !== 1) {
                throw new Error('Gift reconciliation state changed concurrently');
            }
            await client.query(`
                INSERT INTO gift_delivery_events (
                    gift_exchange_id, event_type, claim_generation, worker_id, details
                ) VALUES ($1, 'admin_reconciled', $2, $3, $4)
                ON CONFLICT (gift_exchange_id, event_type, claim_generation) DO NOTHING
            `, [
                taskId,
                Number(task.claim_generation) || 0,
                task.worker_id,
                JSON.stringify({
                    outcome, deliveredQuantity, requestedQuantity: quantity,
                    actualCost, refundAmount, reason, providerTransactionId,
                    reconciledBy: req.session.user.username
                })
            ]);
            if (completed) {
                await client.query(`
                    UPDATE wish_inventory
                    SET status = 'sent', sent_at = NOW(), last_failure_reason = NULL, updated_at = NOW()
                    WHERE gift_exchange_id = $1
                `, [taskId]);
                await client.query(`
                    INSERT INTO delivery_outbox (event_type, aggregate_id, payload)
                    VALUES ('enqueue_next_blindbox', $1, $2)
                    ON CONFLICT (event_type, aggregate_id) DO NOTHING
                `, [taskId, JSON.stringify({ username: task.username })]);
            } else {
                await client.query(`
                    UPDATE wish_inventory
                    SET status = 'stored', gift_exchange_id = NULL,
                        last_failure_reason = $2,
                        expires_at = ((date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai')
                            + interval '1 day 23 hours 59 minutes 59 seconds') AT TIME ZONE 'Asia/Shanghai'),
                        updated_at = NOW()
                    WHERE gift_exchange_id = $1
                `, [taskId, reason]);
            }

            const responseBody = {
                success: true,
                taskId,
                outcome,
                deliveredQuantity,
                refundedAmount: refundAmount
            };
            await auditAdminAction({
                client,
                adminUsername: req.session.user.username,
                action: 'reconcile_gift_delivery',
                targetUsername: task.username,
                details: { taskId, outcome, deliveredQuantity, refundAmount, reason, providerTransactionId },
                clientIP: req.clientIP,
                requestId: req.idempotencyKey,
                authStrength: getAdminTotpSecret(req.session.user.username)
                    ? 'recent_password_totp' : 'recent_password'
            });
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            notifyAdminAction(req.session.user.username, 'reconcile_gift_delivery', task.username, {
                taskId, outcome, refundAmount
            });
            return res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('礼物人工对账失败');
            return res.status(500).json({ success: false, message: '对账处理失败，请核对任务后重试' });
        } finally {
            client?.release();
        }
    });

    // 管理员工具：重置卡住的礼物任务
    app.post('/api/admin/reset-stuck-gift-tasks', ...highRiskAdminGuards, requireCSRF, async (req, res) => {
        let client;
        try {
            const adminUser = req.session.user.username;

            client = await pool.connect();
            await client.query('BEGIN');
            const stuckTasks = await client.query(`
                SELECT id, username, gift_name, cost, created_at
                FROM gift_exchanges
                WHERE status = 'funds_locked'
                  AND delivery_status = 'pending'
                  AND claim_token IS NULL
                  AND attempt_count = 0
                  AND created_at < NOW() - INTERVAL '10 minutes'
                ORDER BY created_at
                LIMIT 100
                FOR UPDATE SKIP LOCKED
            `);

            const results = [];
            for (const task of stuckTasks.rows) {
                const refundAmount = parseMoney(task.cost, 'stuck gift cost', { min: 0 });
                if (refundAmount > 0) {
                    const refundResult = await BalanceLogger.updateBalance({
                        username: task.username,
                        amount: refundAmount,
                        operationType: 'admin_stuck_gift_refund',
                        description: `管理员取消从未被工作器领取的礼物任务 ${task.id}`,
                        gameData: { taskId: task.id, adminUser, claimAttempts: 0 },
                        requireSufficientBalance: false,
                        client,
                        managedTransaction: true
                    });
                    if (!refundResult.success) {
                        throw new Error('Stuck gift refund failed');
                    }
                }
                await client.query(`
                    UPDATE gift_exchanges
                    SET status = 'failed',
                        delivery_status = 'failed',
                        failure_reason = '管理员取消从未被工作器领取的超时任务',
                        processed_at = NOW(),
                        updated_at = NOW()
                    WHERE id = $1
                `, [task.id]);
                await client.query(`
                    UPDATE wish_inventory
                    SET status = 'stored',
                        gift_exchange_id = NULL,
                        last_failure_reason = '管理员取消未领取的发送任务',
                        expires_at = ((date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai')
                            + interval '1 day 23 hours 59 minutes 59 seconds') AT TIME ZONE 'Asia/Shanghai'),
                        updated_at = NOW()
                    WHERE gift_exchange_id = $1
                `, [task.id]);
                results.push({
                    taskId: task.id,
                    username: task.username,
                    giftName: task.gift_name,
                    refundedAmount: refundAmount,
                    createdAt: task.created_at
                });
            }

            const responseBody = {
                success: true,
                message: `成功重置 ${results.length} 个从未被领取的超时任务`,
                resetCount: results.length,
                results
            };
            await auditAdminAction({
                client,
                adminUsername: adminUser,
                action: 'refund_unclaimed_gift_tasks',
                details: { taskIds: results.map((item) => item.taskId), count: results.length },
                clientIP: req.clientIP,
                requestId: req.idempotencyKey
            });
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            notifyAdminAction(adminUser, 'refund_unclaimed_gift_tasks', null, { count: results.length });
            res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('重置卡住任务失败:', error);
            res.status(500).json({
                success: false,
                message: '重置失败，请核对任务状态后重试'
            });
        } finally {
            client?.release();
        }
    });

    // 管理员安全警告测试API (需要管理员权限)
    app.post('/api/admin/test/security-alert', ...highRiskAdminGuards, requireCSRF, async (req, res) => {
        const username = normalizeUsername(req.body?.username);
        const adminUsername = req.session.user.username;

        if (!usernamePattern.test(username)) {
            return res.status(400).json({ success: false, message: '用户名格式无效' });
        }

        const testEvent = {
            type: 'device_logout',
            title: '管理员测试安全提醒',
            message: `管理员 ${adminUsername} 发起的安全警告测试`,
            level: 'warning',
            details: {
                admin: adminUsername,
                testMode: true,
                timestamp: new Date().toISOString()
            }
        };

        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            const target = await client.query('SELECT username FROM users WHERE username = $1', [username]);
            if (target.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: '用户不存在' });
            }
            const responseBody = { success: true, message: `测试安全警告已发送给用户: ${username}` };
            await auditAdminAction({
                client,
                adminUsername,
                action: 'send_test_security_alert',
                targetUsername: username,
                clientIP: req.clientIP,
                requestId: req.idempotencyKey
            });
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            runPostCommitEffect('测试安全通知', () => notifySecurityEvent(username, testEvent));
            return res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('发送测试安全警告失败:', error);
            return res.status(500).json({ success: false, message: '发送失败' });
        } finally {
            client?.release();
        }
    });

    // 安全监控面板 - 修复后：使用统一的session权限体系
    app.get('/admin/security', ...adminGuards, (req, res) => {
        // 收集安全统计信息
        const blacklist = security.getBlacklist();
        const behaviorStats = [];

        // 获取行为统计（最多显示100个）
        let count = 0;
        for (const [ip, behavior] of security.getBehaviorEntries()) {
            if (count >= 100) break;

            const userBehavior = behavior || security.getUserBehavior(ip);
            if (userBehavior) {
                behaviorStats.push({
                    ip,
                    totalRequests: userBehavior.totalRequests,
                    suspicionScore: userBehavior.suspicionScore,
                    avgInterval: Math.round(userBehavior.patterns?.avgInterval || 0),
                    minInterval: userBehavior.patterns?.minInterval || 0,
                    lastSeen: new Date(userBehavior.lastRequestTime).toISOString()
                });
            }
            count++;
        }

        res.json({
            timestamp: new Date().toISOString(),
            security: {
                blacklistedIPs: blacklist.length,
                blacklist: blacklist.slice(0, 20), // 只显示前20个
                activeUsers: behaviorStats.length,
                suspiciousUsers: behaviorStats.filter(u => u.suspicionScore > 30).length,
                recentBehavior: behaviorStats
                    .sort((a, b) => b.suspicionScore - a.suspicionScore)
                    .slice(0, 20)
            }
        });
    });

    // 安全管理解除封禁
    app.post('/admin/security/unblock', ...highRiskAdminGuards, requireCSRF, async (req, res) => {
        const { ip } = req.body || {};
        const adminUsername = req.session.user.username;

        if (!net.isIP(ip)) {
            return res.status(400).json({ success: false, message: 'Valid IP address required' });
        }
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            await client.query('UPDATE ip_blacklist SET is_active = false, updated_at = NOW() WHERE ip_address = $1', [ip]);
            const responseBody = { success: true, message: `IP ${ip} has been unblocked` };
            await auditAdminAction({
                client,
                adminUsername,
                action: 'unblock_ip',
                details: { ip },
                clientIP: req.clientIP,
                requestId: req.idempotencyKey
            });
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            runPostCommitEffect('黑名单缓存刷新', () => security.removeFromBlacklist(ip));
            runPostCommitEffect('行为缓存清理', () => security.clearUserBehavior(ip));
            runPostCommitEffect('IP风险缓存清理', () => IPManager.clearRiskCacheForIP(ip));
            return res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('解除IP封禁失败:', error);
            return res.status(500).json({ success: false, message: 'Unblock failed' });
        } finally {
            client?.release();
        }
    });
};
