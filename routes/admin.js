module.exports = function registerAdminRoutes(app, deps) {
    const {
        pool,
        bcrypt,
        BalanceLogger,
        generateCSRFToken,
        requireLogin,
        requireAdmin,
        requireAuthorized,
        requireCSRF,
        security,
        autoSendWishInventoryOnBind,
        IPManager,
        SessionManager,
        notifySecurityEvent,
        path
    } = deps;

    // 安全中间件存在性兜底，防止依赖缺失导致路由注册报错
    const adminIPWhitelist = security.adminIPWhitelist || ((req, res, next) => next());
    const verifyAdminSignature = security.verifyAdminSignature || ((req, res, next) => next());
    const adminRateLimit = security.adminRateLimit || ((req, res, next) => next());
    const adminStrictLimit = security.adminStrictLimit || ((req, res, next) => next());

    // 页面类接口：登录+admin+IP白名单+限流，不强制签名（浏览器点击可用）
    const adminGuards = [requireLogin, requireAdmin, adminIPWhitelist, adminRateLimit, adminStrictLimit];
    // API 类接口：在 adminGuards 基础上强制签名（可选关闭，用 ADMIN_SIGN_SECRET 控制）
    const adminApiGuards = verifyAdminSignature === ((req, res, next) => next())
        ? adminGuards
        : [...adminGuards, verifyAdminSignature];

    const auditAdminAction = async ({
        adminUsername,
        action,
        targetUsername,
        details = {},
        clientIP = null
    }) => {
        try {
            await pool.query(`
                INSERT INTO security_events (event_type, username, ip_address, description, severity)
                VALUES ('admin_action', $1, $2, $3, 'high')
            `, [
                adminUsername,
                clientIP,
                `${action}: ${targetUsername} - ${JSON.stringify(details)}`
            ]);

            if (adminUsername !== 'hokboost') {
                notifySecurityEvent('hokboost', {
                    type: 'admin_action',
                    title: '管理员操作通知',
                    message: `${adminUsername} 执行了 ${action} 操作`,
                    details: { targetUsername, ...details },
                    level: 'warning'
                });
            }
        } catch (err) {
            console.error('记录管理员操作失败:', err);
        }
    };

    // 管理员后台
    app.get('/admin', ...adminGuards, async (req, res) => {
        try {
            // 初始化session
            if (!req.session.initialized) {
                req.session.initialized = true;
                req.session.createdAt = Date.now();
                generateCSRFToken(req); // 统一使用csrf库
            }

            const usersResult = await pool.query(
                'SELECT username, balance, spins_allowed, authorized, is_admin, login_failures, last_failure_time, locked_until FROM users ORDER BY username'
            );

            const users = usersResult.rows.map(user => ({
                ...user,
                is_locked: user.locked_until && new Date(user.locked_until) > new Date(),
                lock_minutes: user.locked_until ? Math.ceil((new Date(user.locked_until) - new Date()) / 60000) : 0
            }));

            const [quizResult, slotResult, scratchResult, wishResult, stoneResult, flipResult, duelResult] = await Promise.all([
                pool.query(`
                    SELECT DISTINCT ON (username)
                        username,
                        score,
                        to_char(submitted_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                    FROM submissions
                    ORDER BY username, submitted_at DESC
                `),
                pool.query(`
                    SELECT DISTINCT ON (username)
                        username,
                        COALESCE(payout_amount, 0) as payout,
                        to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                    FROM slot_results
                    ORDER BY username, created_at DESC
                `),
                pool.query(`
                    SELECT DISTINCT ON (username)
                        username,
                        COALESCE(reward::text, '0') as reward_text,
                        to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                    FROM scratch_results
                    ORDER BY username, created_at DESC
                `),
                pool.query(`
                    SELECT DISTINCT ON (username)
                        username,
                        reward,
                        success,
                        cost,
                        to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                    FROM wish_results
                    ORDER BY username, created_at DESC
                `),
                pool.query(`
                    SELECT DISTINCT ON (username)
                        username,
                        action_type,
                        COALESCE(reward, 0) as reward,
                        to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                    FROM stone_logs
                    ORDER BY username, created_at DESC
                `),
                pool.query(`
                    SELECT DISTINCT ON (username)
                        username,
                        good_count,
                        bad_count,
                        COALESCE(reward, 0) as reward,
                        to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                    FROM flip_logs
                    WHERE action_type = 'end'
                    ORDER BY username, created_at DESC
                `),
                pool.query(`
                    SELECT DISTINCT ON (username)
                        username,
                        gift_type,
                        success,
                        COALESCE(reward, 0) as reward,
                        to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                    FROM duel_logs
                    ORDER BY username, created_at DESC
                `)
            ]);

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

            const latestRecords = {};
            users.forEach((user) => {
                latestRecords[user.username] = {
                    quiz: '-',
                    slot: '-',
                    scratch: '-',
                    wish: '-',
                    stone: '-',
                    flip: '-',
                    duel: '-',
                    spin: '未记录'
                };
            });

            quizResult.rows.forEach((row) => {
                if (latestRecords[row.username]) {
                    latestRecords[row.username].quiz = `${row.played_at} | 分数 ${row.score}`;
                }
            });

            slotResult.rows.forEach((row) => {
                if (latestRecords[row.username]) {
                    latestRecords[row.username].slot = `${row.played_at} | ${row.payout}电币`;
                }
            });

            scratchResult.rows.forEach((row) => {
                if (latestRecords[row.username]) {
                    latestRecords[row.username].scratch = `${row.played_at} | ${row.reward_text}电币`;
                }
            });

            wishResult.rows.forEach((row) => {
                if (latestRecords[row.username]) {
                    const rewardText = row.success ? (row.reward || '中奖') : '未中奖';
                    latestRecords[row.username].wish = `${row.played_at} | ${rewardText}`;
                }
            });

            stoneResult.rows.forEach((row) => {
                if (latestRecords[row.username]) {
                    latestRecords[row.username].stone = `${row.played_at} | ${row.action_type} | ${row.reward}电币`;
                }
            });

            flipResult.rows.forEach((row) => {
                if (latestRecords[row.username]) {
                    latestRecords[row.username].flip = `${row.played_at} | 好${row.good_count}坏${row.bad_count} | ${row.reward}电币`;
                }
            });

            duelResult.rows.forEach((row) => {
                if (latestRecords[row.username]) {
                    const giftLabel = row.gift_type ? row.gift_type : '礼物';
                    const resultLabel = row.success ? '成功' : '失败';
                    latestRecords[row.username].duel = `${row.played_at} | ${giftLabel} | ${resultLabel} | ${row.reward}电币`;
                }
            });

            res.render('admin', {
                title: '管理后台 - Minimal Games',
                user: req.session.user,
                userLoggedIn: req.session.user?.username,
                users: users,
                latestRecords: latestRecords,
                dictationSubmissions: dictationSubmissions,
                csrfToken: req.session.csrfToken
            });
        } catch (err) {
            console.error('❌ 管理员页面加载失败:', err);
            res.status(500).send('后台加载失败');
        }
    });

    app.get('/admin/users/:username/records', ...adminGuards, async (req, res) => {
        try {
            const targetUsername = req.params.username;
            const userResult = await pool.query(
                'SELECT username FROM users WHERE username = $1',
                [targetUsername]
            );

            if (userResult.rows.length === 0) {
                return res.status(404).send('用户不存在');
            }

            const [
                quizResult,
                slotResult,
                scratchResult,
                wishResult,
                stoneResult,
                flipResult,
                duelResult
            ] = await Promise.all([
                pool.query(`
                    SELECT score,
                           to_char(submitted_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                    FROM submissions
                    WHERE username = $1
                    ORDER BY submitted_at DESC
                    LIMIT 200
                `, [targetUsername]),
                pool.query(`
                    SELECT won as result,
                           COALESCE(payout_amount, 0) as payout,
                           COALESCE(bet_amount, 0) as bet_amount,
                           COALESCE(multiplier, 0) as multiplier,
                           COALESCE(game_details->>'amounts', '') as amounts,
                           to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                    FROM slot_results
                    WHERE username = $1
                    ORDER BY created_at DESC
                    LIMIT 200
                `, [targetUsername]),
                pool.query(`
                    SELECT COALESCE(reward::text, '0') as reward,
                           COALESCE(matches_count, 0) as matches_count,
                           COALESCE(tier_cost, 0) as tier_cost,
                           to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                    FROM scratch_results
                    WHERE username = $1
                    ORDER BY created_at DESC
                    LIMIT 200
                `, [targetUsername]),
                pool.query(`
                    SELECT gift_type,
                           cost,
                           success,
                           reward,
                           wishes_count,
                           to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                    FROM wish_results
                    WHERE username = $1
                    ORDER BY created_at DESC
                    LIMIT 200
                `, [targetUsername]),
                pool.query(`
                    SELECT action_type,
                           COALESCE(cost, 0) as cost,
                           COALESCE(reward, 0) as reward,
                           slot_index,
                           before_slots,
                           after_slots,
                           to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                    FROM stone_logs
                    WHERE username = $1
                    ORDER BY created_at DESC
                    LIMIT 200
                `, [targetUsername]),
                pool.query(`
                    SELECT action_type,
                           COALESCE(cost, 0) as cost,
                           COALESCE(reward, 0) as reward,
                           card_index,
                           card_type,
                           good_count,
                           bad_count,
                           ended,
                           to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                    FROM flip_logs
                    WHERE username = $1
                    ORDER BY created_at DESC
                    LIMIT 200
                `, [targetUsername]),
                pool.query(`
                    SELECT gift_type,
                           power,
                           cost,
                           success,
                           COALESCE(reward, 0) as reward,
                           to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                    FROM duel_logs
                    WHERE username = $1
                    ORDER BY created_at DESC
                    LIMIT 200
                `, [targetUsername])
            ]);

            res.render('admin-user-records', {
                title: `用户记录 - ${targetUsername}`,
                user: req.session.user,
                targetUsername,
                records: {
                    quiz: quizResult.rows,
                    slot: slotResult.rows,
                    scratch: scratchResult.rows,
                    wish: wishResult.rows,
                    stone: stoneResult.rows,
                    flip: flipResult.rows,
                    duel: duelResult.rows
                }
            });
        } catch (error) {
            console.error('管理员用户记录加载失败:', error);
            res.status(500).send('记录加载失败');
        }
    });

    // 添加电币
    app.post('/api/admin/add-electric-coin', ...adminApiGuards, requireCSRF, async (req, res) => {
        try {
            const { username, amount } = req.body;

            if (!username || !amount || amount <= 0) {
                return res.status(400).json({ success: false, message: '参数错误：用户名和电币数量必须有效' });
            }

            if (amount > 100000) {
                return res.status(400).json({ success: false, message: '单次添加不能超过100,000电币' });
            }

            // 使用余额日志系统进行管理员充值
            const balanceResult = await BalanceLogger.updateBalance({
                username: username,
                amount: parseFloat(amount),
                operationType: 'admin_add',
                description: `管理员充值：添加 ${amount} 电币`,
                gameData: {
                    admin_user: req.session.user.username,
                    amount: amount,
                    type: 'manual_recharge'
                },
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                requireSufficientBalance: false
            });

            if (!balanceResult.success) {
                return res.status(400).json({ success: false, message: balanceResult.message });
            }

            res.json({
                success: true,
                newBalance: balanceResult.balance,
                addedAmount: parseFloat(amount)
            });
        } catch (error) {
            console.error('添加电币失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    // 授权用户
    app.post('/api/admin/authorize-user', ...adminApiGuards, requireCSRF, async (req, res) => {
        try {
            const { username } = req.body;

            if (!username) {
                return res.status(400).json({ success: false, message: '缺少用户名' });
            }

            await pool.query(
                'UPDATE users SET authorized = true WHERE username = $1',
                [username]
            );

            res.json({ success: true, message: '授权成功' });
        } catch (error) {
            console.error('授权失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    // 取消授权
    app.post('/api/admin/unauthorize-user', ...adminApiGuards, requireCSRF, async (req, res) => {
        try {
            const { username } = req.body;

            if (!username) {
                return res.status(400).json({ success: false, message: '缺少用户名' });
            }

            await pool.query(
                'UPDATE users SET authorized = false WHERE username = $1',
                [username]
            );

            res.json({ success: true, message: '取消授权成功' });
        } catch (error) {
            console.error('取消授权失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });


    // 重置密码
    app.post('/api/admin/reset-password', ...adminApiGuards, requireCSRF, async (req, res) => {
        try {
            const { username, newPassword = '123456' } = req.body;

            if (!username) {
                return res.status(400).json({ success: false, message: '缺少用户名' });
            }

            const hashedPassword = await bcrypt.hash(newPassword, 12);
            await pool.query(
                'UPDATE users SET password_hash = $1 WHERE username = $2',
                [hashedPassword, username]
            );

            res.json({ success: true, message: '密码重置成功' });
        } catch (error) {
            console.error('重置密码失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    // 修改用户余额 - 添加CSRF保护
    app.post('/api/admin/update-balance', ...adminApiGuards, requireCSRF, async (req, res) => {
        try {
            const { username, balance } = req.body;
            const adminUsername = req.session.user.username;

            if (!username) {
                return res.status(400).json({ success: false, message: '缺少用户名' });
            }

            if (balance === undefined || balance < 0) {
                return res.status(400).json({ success: false, message: '无效的余额数值' });
            }

            // 获取当前余额
            const currentBalanceResult = await pool.query(
                'SELECT balance FROM users WHERE username = $1',
                [username]
            );

            if (currentBalanceResult.rows.length === 0) {
                return res.status(404).json({ success: false, message: '用户不存在' });
            }

            const currentBalance = currentBalanceResult.rows[0].balance;
            const delta = balance - currentBalance;

            // 使用BalanceLogger进行安全的余额修改（带审计和原子锁）
            const balanceResult = await BalanceLogger.updateBalance({
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
                requireSufficientBalance: false // 管理员操作允许负余额调整
            });

            if (!balanceResult.success) {
                return res.status(500).json({
                    success: false,
                    message: `余额修改失败: ${balanceResult.message}`
                });
            }

            await auditAdminAction({
                adminUsername,
                action: '修改余额',
                targetUsername: username,
                details: { oldBalance: currentBalance, newBalance: balance, delta },
                clientIP: req.clientIP
            });

            res.json({
                success: true,
                message: '余额修改成功',
                newBalance: balance,
                oldBalance: currentBalance
            });
        } catch (error) {
            console.error('修改余额失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    // 审核听写提交
    app.post('/api/admin/dictation/mark', ...adminApiGuards, requireCSRF, async (req, res) => {
        try {
            const { id, status } = req.body;
            const allowed = new Set(['correct', 'wrong', 'rewrite']);
            if (!id || !allowed.has(status)) {
                return res.status(400).json({ success: false, message: '参数错误' });
            }

            let notifyUsername = '';
            let notifyLevel = 1;
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const submissionResult = await client.query(
                    'SELECT username, level FROM dictation_submissions WHERE id = $1 FOR UPDATE',
                    [id]
                );
                if (!submissionResult.rows.length) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({ success: false, message: '记录不存在' });
                }
                const submission = submissionResult.rows[0];
                const username = submission.username;
                const level = Number(submission.level || 1);
                notifyUsername = username;
                notifyLevel = level;

                await client.query(
                    'UPDATE dictation_submissions SET status = $1 WHERE id = $2',
                    [status, id]
                );

                if (username) {
                    const progressResult = await client.query(
                        'SELECT level FROM dictation_progress WHERE username = $1 FOR UPDATE',
                        [username]
                    );
                    let nextLevel = 1;
                    if (status === 'correct') {
                        nextLevel = Math.min(Math.max(level, 1) + 1, 5);
                    } else if (status === 'wrong') {
                        nextLevel = 1;
                    }

                    if (progressResult.rows.length) {
                        await client.query(
                            'UPDATE dictation_progress SET level = $1, updated_at = NOW() WHERE username = $2',
                            [nextLevel, username]
                        );
                    } else {
                        await client.query(
                            'INSERT INTO dictation_progress (username, level) VALUES ($1, $2)',
                            [username, nextLevel]
                        );
                    }
                }

                await client.query('COMMIT');
            } catch (txError) {
                await client.query('ROLLBACK').catch(() => {});
                throw txError;
            } finally {
                client.release();
            }

            res.json({ success: true, message: '已更新' });
        } catch (error) {
            console.error('Dictation mark error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    // 删除账户
    app.post('/api/admin/delete-account', ...adminApiGuards, requireCSRF, async (req, res) => {
        try {
            const { username } = req.body;

            if (!username) {
                return res.status(400).json({ success: false, message: '缺少用户名' });
            }

            // 防止删除管理员账户
            const userResult = await pool.query(
                'SELECT is_admin FROM users WHERE username = $1',
                [username]
            );

            if (userResult.rows[0]?.is_admin) {
                return res.status(403).json({ success: false, message: '不能删除管理员账户' });
            }

            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                const sessionResult = await client.query(
                    'SELECT session_id FROM active_sessions WHERE username = $1',
                    [username]
                );
                const sessionIds = sessionResult.rows.map(row => row.session_id);
                if (sessionIds.length > 0) {
                    await client.query(
                        'DELETE FROM user_sessions WHERE sid = ANY($1)',
                        [sessionIds]
                    );
                }

                await client.query('DELETE FROM active_sessions WHERE username = $1', [username]);
                await client.query('DELETE FROM ip_activities WHERE username = $1', [username]);
                await client.query('DELETE FROM login_logs WHERE username = $1', [username]);
                await client.query('DELETE FROM security_events WHERE username = $1', [username]);
                await client.query('DELETE FROM balance_logs WHERE username = $1', [username]);
                await client.query('DELETE FROM gift_exchanges WHERE username = $1', [username]);

                await client.query(
                    'DELETE FROM submission_details WHERE submission_id IN (SELECT id FROM submissions WHERE username = $1)',
                    [username]
                );
                await client.query('DELETE FROM submissions WHERE username = $1', [username]);
                await client.query('DELETE FROM slot_results WHERE username = $1', [username]);
                await client.query('DELETE FROM scratch_results WHERE username = $1', [username]);

                await client.query('DELETE FROM wish_results WHERE username = $1', [username]);
                await client.query('DELETE FROM wish_sessions WHERE username = $1', [username]);
                await client.query('DELETE FROM wish_progress WHERE username = $1', [username]);
                await client.query('DELETE FROM wish_inventory WHERE username = $1', [username]);

                await client.query('DELETE FROM stone_logs WHERE username = $1', [username]);
                await client.query('DELETE FROM stone_states WHERE username = $1', [username]);
                await client.query('DELETE FROM flip_logs WHERE username = $1', [username]);
                await client.query('DELETE FROM flip_states WHERE username = $1', [username]);
                await client.query('DELETE FROM duel_logs WHERE username = $1', [username]);

                await client.query('DELETE FROM users WHERE username = $1', [username]);
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }

            res.json({ success: true, message: '账户删除成功' });
        } catch (error) {
            console.error('删除账户失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    // 解锁账户
    app.post('/api/admin/unlock-account', ...adminApiGuards, requireCSRF, async (req, res) => {
        try {
            const { username } = req.body;

            if (!username) {
                return res.status(400).json({ success: false, message: '缺少用户名' });
            }

            await pool.query(
                'UPDATE users SET login_failures = 0, last_failure_time = NULL, locked_until = NULL WHERE username = $1',
                [username]
            );

            res.json({ success: true, message: '账户解锁成功' });
        } catch (error) {
            console.error('解锁账户失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    // 清除失败记录
    app.post('/api/admin/clear-failures', ...adminApiGuards, requireCSRF, async (req, res) => {
        try {
            const { username } = req.body;

            if (!username) {
                return res.status(400).json({ success: false, message: '缺少用户名' });
            }

            await pool.query(
                'UPDATE users SET login_failures = 0, last_failure_time = NULL WHERE username = $1',
                [username]
            );

            res.json({ success: true, message: '失败记录清除成功' });
        } catch (error) {
            console.error('清除失败记录失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    // 管理员修改自己密码
    app.post('/api/admin/change-self-password', ...adminApiGuards, requireCSRF, async (req, res) => {
        try {
            const { oldPassword, newPassword } = req.body;
            const username = req.session.user.username;

            if (!oldPassword || !newPassword) {
                return res.status(400).json({ success: false, message: '缺少必要参数' });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({ success: false, message: '新密码长度至少需要6位' });
            }

            // 验证当前密码
            const userResult = await pool.query('SELECT password FROM users WHERE username = $1', [username]);

            if (userResult.rows.length === 0) {
                return res.status(404).json({ success: false, message: '用户不存在' });
            }

            const isOldPasswordValid = await bcrypt.compare(oldPassword, userResult.rows[0].password);

            if (!isOldPasswordValid) {
                return res.status(400).json({ success: false, message: '当前密码错误' });
            }

            // 加密新密码
            const hashedNewPassword = await bcrypt.hash(newPassword, 12);

            // 更新密码
            await pool.query(
                'UPDATE users SET password = $1 WHERE username = $2',
                [hashedNewPassword, username]
            );

            res.json({ success: true, message: '密码修改成功' });
        } catch (error) {
            console.error('修改密码失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    // 获取房间号绑定状态 (管理员可查看所有用户，普通用户只能查看自己)
    app.get('/api/bilibili/room', requireLogin, requireAuthorized, async (req, res) => {
        try {
            const username = req.session.user.username;
            const isAdmin = req.session.user.is_admin;
            const targetUsername = req.query.username; // 管理员可通过查询参数指定用户

            // 普通用户只能查看自己的信息
            const usernameToQuery = (isAdmin && targetUsername) ? targetUsername : username;

            // 如果是管理员且未指定用户，返回所有用户的房间绑定信息
            if (isAdmin && !targetUsername) {
                const result = await pool.query(`
                    SELECT username, bilibili_room_id, created_at as bind_time
                    FROM users 
                    WHERE bilibili_room_id IS NOT NULL
                    ORDER BY username
                `);

                return res.json({
                    success: true,
                    isAdminView: true,
                    allBindings: result.rows.map(row => ({
                        username: row.username,
                        roomId: row.bilibili_room_id,
                        bindTime: row.bind_time
                    }))
                });
            }

            const result = await pool.query(`
                SELECT bilibili_room_id, created_at as bind_time
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
    app.post('/api/bilibili/room', ...adminApiGuards, async (req, res) => {
        try {
            const { roomId, targetUsername } = req.body;
            const adminUsername = req.session.user.username;
            const usernameToUpdate = targetUsername || adminUsername; // 允许管理员为其他用户设置房间号

            // 验证房间号格式（数字，6-12位）
            if (!roomId || !/^\d{6,12}$/.test(roomId.toString())) {
                return res.status(400).json({
                    success: false,
                    message: '房间号格式不正确，应为6-12位数字'
                });
            }

            // 如果指定了目标用户，验证用户是否存在
            if (targetUsername) {
                const userExistsResult = await pool.query(`
                    SELECT username FROM users WHERE username = $1
                `, [targetUsername]);

                if (userExistsResult.rows.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: `用户 ${targetUsername} 不存在`
                    });
                }
            }

            // 检查房间号是否已被其他用户绑定
            const existingResult = await pool.query(`
                SELECT username FROM users 
                WHERE bilibili_room_id = $1 AND username != $2
            `, [roomId, usernameToUpdate]);

            if (existingResult.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `房间号 ${roomId} 已被用户 ${existingResult.rows[0].username} 绑定`
                });
            }

            // 更新用户的房间号
            await pool.query(`
                UPDATE users 
                SET bilibili_room_id = $1 
                WHERE username = $2
            `, [roomId, usernameToUpdate]);

            autoSendWishInventoryOnBind(usernameToUpdate).catch((error) => {
                console.error('绑定后自动送出任务失败:', error);
            });

            console.log(`✅ 管理员 ${adminUsername} 为用户 ${usernameToUpdate} 成功绑定B站房间号: ${roomId}`);

            res.json({
                success: true,
                message: `成功为用户 ${usernameToUpdate} 绑定B站房间号: ${roomId}`,
                roomId: roomId,
                targetUser: usernameToUpdate
            });

        } catch (error) {
            console.error('绑定房间号失败:', error);
            res.status(500).json({
                success: false,
                message: '服务器错误'
            });
        }
    });

    // 手动刷新B站Cookie (仅管理员)
    app.post('/api/bilibili/cookies/refresh', ...adminApiGuards, async (req, res) => {
        try {
            console.log(`🔄 管理员 ${req.session.user.username} 请求刷新B站Cookie`);

            // Cookie现在由Windows监听服务管理
            const refreshResult = { success: true, message: 'Cookie由Windows监听服务管理' };

            if (refreshResult.success) {
                console.log('✅ Cookie刷新成功');
                res.json({
                    success: true,
                    message: refreshResult.message
                });
            } else {
                console.log('❌ Cookie刷新失败');
                res.status(500).json({
                    success: false,
                    message: refreshResult.error || 'Cookie刷新失败'
                });
            }

        } catch (error) {
            console.error('❌ 刷新Cookie API失败:', error);
            res.status(500).json({
                success: false,
                message: '服务器错误'
            });
        }
    });

    // 检查B站Cookie状态 (仅管理员)
    app.get('/api/bilibili/cookies/status', ...adminApiGuards, async (req, res) => {
        try {
            console.log(`🔍 管理员 ${req.session.user.username} 检查Cookie状态`);

            // Cookie现在由Windows监听服务管理
            const checkResult = { valid: true, message: 'Cookie由Windows监听服务管理' };

            res.json({
                success: true,
                expired: checkResult.expired || false,
                reason: checkResult.reason || 'Windows监听服务管理',
                lastCheck: Date.now(),
                nextCheck: Date.now() + 60000, // 1分钟后
                checkInterval: 60000 // 1分钟间隔
            });

        } catch (error) {
            console.error('❌ 检查Cookie状态失败:', error);
            res.status(500).json({
                success: false,
                message: '服务器错误'
            });
        }
    });

    // 解除房间号绑定 (仅管理员)
    app.delete('/api/bilibili/room', ...adminApiGuards, async (req, res) => {
        try {
            const { targetUsername } = req.body;
            const adminUsername = req.session.user.username;
            const usernameToUpdate = targetUsername || adminUsername; // 允许管理员为其他用户解除绑定

            // 如果指定了目标用户，验证用户是否存在
            if (targetUsername) {
                const userExistsResult = await pool.query(`
                    SELECT username FROM users WHERE username = $1
                `, [targetUsername]);

                if (userExistsResult.rows.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: `用户 ${targetUsername} 不存在`
                    });
                }
            }

            await pool.query(`
                UPDATE users 
                SET bilibili_room_id = NULL 
                WHERE username = $1
            `, [usernameToUpdate]);

            await pool.query(`
                UPDATE wish_inventory
                SET expires_at = 'infinity'::timestamptz,
                    updated_at = (NOW() AT TIME ZONE 'Asia/Shanghai')
                WHERE username = $1
                  AND status = 'stored'
            `, [usernameToUpdate]);

            console.log(`✅ 管理员 ${adminUsername} 为用户 ${usernameToUpdate} 成功解除B站房间号绑定`);

            res.json({
                success: true,
                message: `成功为用户 ${usernameToUpdate} 解除房间号绑定`,
                targetUser: usernameToUpdate
            });

        } catch (error) {
            console.error('解除房间号绑定失败:', error);
            res.status(500).json({
                success: false,
                message: '服务器错误'
            });
        }
    });

    // 管理员查看所有余额记录 API
    app.get('/api/admin/balance/logs', ...adminApiGuards, async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = Math.min(parseInt(req.query.limit) || 50, 200);
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
    app.post('/api/admin/ip/blacklist', ...adminApiGuards, requireCSRF, async (req, res) => {
        try {
            const { ip, reason } = req.body;
            const adminUser = req.session.user.username;

            if (!ip || !reason) {
                return res.status(400).json({ success: false, message: 'IP和原因不能为空' });
            }

            const success = await IPManager.addToBlacklist(ip, reason, adminUser);

            if (success) {
                console.log(`管理员 ${adminUser} 将IP ${ip} 添加到黑名单: ${reason}`);
                res.json({ success: true, message: 'IP已添加到黑名单' });
            } else {
                res.status(500).json({ success: false, message: '添加黑名单失败' });
            }
        } catch (error) {
            console.error('添加IP黑名单失败:', error);
            res.status(500).json({ success: false, message: '系统错误' });
        }
    });

    // 添加IP到白名单
    app.post('/api/admin/ip/whitelist', ...adminApiGuards, requireCSRF, async (req, res) => {
        try {
            const { ip, reason } = req.body;
            const adminUser = req.session.user.username;

            if (!ip || !reason) {
                return res.status(400).json({ success: false, message: 'IP和原因不能为空' });
            }

            const success = await IPManager.addToWhitelist(ip, reason, adminUser);

            if (success) {
                console.log(`管理员 ${adminUser} 将IP ${ip} 添加到白名单: ${reason}`);
                res.json({ success: true, message: 'IP已添加到白名单' });
            } else {
                res.status(500).json({ success: false, message: '添加白名单失败' });
            }
        } catch (error) {
            console.error('添加IP白名单失败:', error);
            res.status(500).json({ success: false, message: '系统错误' });
        }
    });

    // 移除IP黑名单
    app.post('/api/admin/ip/remove-blacklist', ...adminApiGuards, requireCSRF, async (req, res) => {
        try {
            const { ip } = req.body;
            const adminUser = req.session.user.username;

            if (!ip) {
                return res.status(400).json({ success: false, message: 'IP不能为空' });
            }

            const success = await IPManager.removeFromBlacklist(ip);

            if (success) {
                console.log(`管理员 ${adminUser} 将IP ${ip} 从黑名单移除`);
                res.json({ success: true, message: 'IP已从黑名单移除' });
            } else {
                res.status(500).json({ success: false, message: '移除黑名单失败' });
            }
        } catch (error) {
            console.error('移除IP黑名单失败:', error);
            res.status(500).json({ success: false, message: '系统错误' });
        }
    });

    // 强制踢出用户所有会话
    app.post('/api/admin/force-logout', ...adminApiGuards, requireCSRF, async (req, res) => {
        try {
            const { username } = req.body;
            const adminUser = req.session.user.username;

            if (!username) {
                return res.status(400).json({ success: false, message: '用户名不能为空' });
            }

            // 特别保护hokboost管理员账号
            if (username === 'hokboost') {
                console.log(`⚠️ 管理员 ${adminUser} 试图强制注销hokboost - 已拒绝`);
                return res.status(403).json({
                    success: false,
                    message: '不能对hokboost管理员账号执行此操作'
                });
            }

            const sessionCount = await SessionManager.forceLogoutUser(username, 'admin_force_logout');

            console.log(`管理员 ${adminUser} 强制注销用户 ${username} 的 ${sessionCount} 个会话`);
            res.json({
                success: true,
                message: `已强制注销用户 ${username} 的 ${sessionCount} 个会话`
            });
        } catch (error) {
            console.error('强制注销失败:', error);
            res.status(500).json({ success: false, message: '强制注销失败' });
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

    // WebSocket测试页面
    app.get('/test-websocket', ...adminGuards, (req, res) => {
        res.sendFile(path.join(__dirname, '../test-websocket.html'));
    });

    // 管理员工具：重置卡住的礼物任务
    app.post('/api/admin/reset-stuck-gift-tasks', ...adminApiGuards, requireCSRF, async (req, res) => {
        try {
            const adminUser = req.session.user.username;

            console.log(`🔧 管理员 ${adminUser} 开始重置卡住的礼物任务`);

            // 查找卡住的任务（资金已锁定但任务pending超过10分钟）
            const stuckTasks = await pool.query(`
                SELECT id, username, gift_name, cost, created_at
                FROM gift_exchanges 
                WHERE status = 'funds_locked' 
                  AND delivery_status IN ('pending', 'processing')
                  AND created_at < NOW() - INTERVAL '10 minutes'
                ORDER BY created_at
            `);

            let resetCount = 0;
            const results = [];

            for (const task of stuckTasks.rows) {
                const client = await pool.connect();
                try {
                    await client.query('BEGIN');

                    // 退还资金
                    await client.query(
                        'UPDATE users SET balance = balance + $1 WHERE username = $2',
                        [task.cost, task.username]
                    );

                    // 标记任务为失败
                    await client.query(
                        'UPDATE gift_exchanges SET status = $1, delivery_status = $2, processed_at = NOW() WHERE id = $3',
                        ['failed', 'failed', task.id]
                    );

                    await client.query('COMMIT');

                    console.log(`✅ 重置任务 ${task.id}: 退还 ${task.cost} 电币给 ${task.username}`);
                    resetCount++;
                    results.push({
                        taskId: task.id,
                        username: task.username,
                        giftName: task.gift_name,
                        refundedAmount: task.cost,
                        createdAt: task.created_at
                    });

                } catch (error) {
                    await client.query('ROLLBACK');
                    console.error(`❌ 重置任务 ${task.id} 失败:`, error.message);
                    results.push({
                        taskId: task.id,
                        username: task.username,
                        error: error.message
                    });
                } finally {
                    client.release();
                }
            }

            console.log(`🔧 管理员 ${adminUser} 重置了 ${resetCount} 个卡住的任务`);

            res.json({
                success: true,
                message: `成功重置 ${resetCount} 个卡住的任务`,
                resetCount,
                results
            });

        } catch (error) {
            console.error('重置卡住任务失败:', error);
            res.status(500).json({
                success: false,
                message: '重置失败: ' + error.message
            });
        }
    });

    // 管理员安全警告测试API (需要管理员权限)
    app.post('/api/admin/test/security-alert', ...adminApiGuards, requireCSRF, (req, res) => {
        const { username } = req.body;
        const adminUsername = req.session.user.username;

        if (!username) {
            return res.status(400).json({ success: false, message: '缺少用户名参数' });
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

        notifySecurityEvent(username, testEvent);
        console.log(`🚨 管理员 ${adminUsername} 发送测试安全警告给用户: ${username}`);

        res.json({ success: true, message: `测试安全警告已发送给用户: ${username}` });
    });

    // 安全监控面板 - 修复后：使用统一的session权限体系
    app.get('/admin/security', ...adminGuards, (req, res) => {
        // 收集安全统计信息
        const blacklist = security.getBlacklist();
        const behaviorStats = [];

        // 获取行为统计（最多显示100个）
        let count = 0;
        for (const [ip, behavior] of Object.entries({})) {
            if (count >= 100) break;

            const userBehavior = security.getUserBehavior(ip);
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
    app.post('/admin/security/unblock', ...adminGuards, requireCSRF, (req, res) => {
        const { ip } = req.body;
        const adminUsername = req.session.user.username;

        if (ip) {
            security.removeFromBlacklist(ip);
            security.clearUserBehavior(ip);
            console.log(`🔓 管理员 ${adminUsername} 解除IP封禁: ${ip}`);
            res.json({ success: true, message: `IP ${ip} has been unblocked` });
        } else {
            res.status(400).json({ success: false, message: 'IP address required' });
        }
    });
};
