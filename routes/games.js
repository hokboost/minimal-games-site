module.exports = function registerGameRoutes(app, deps) {
    const {
        pool,
        BalanceLogger,
        GameLogic,
        questions,
        generateCSRFToken,
        generateUsername,
        requireLogin,
        requireAuthorized,
        security,
        userSessions,
        quizSessions,
        questionMap,
        randomStoneColor,
    normalizeStoneSlots,
    getMaxSameCount,
    getStoneState,
    saveStoneState,
    logStoneAction,
        stoneRewards,
        stoneReplaceCosts,
        flipCosts,
        flipCashoutRewards,
        createFlipBoard,
        getFlipState,
        saveFlipState,
        logFlipAction,
    duelRewards,
    calculateDuelCost
} = deps;
    // 兜底，防止 security 中未提供特定中间件时报 undefined
    const userActionRateLimit = security.userActionRateLimit || ((req, res, next) => next());
    const basicRateLimit = security.basicRateLimit || ((req, res, next) => next());
    const csrfProtection = security.csrfProtection || ((req, res, next) => next());
    const { randomInt, randomBytes } = require('crypto');
    const randomFloat = () => randomInt(0, 1000000) / 1000000;

    const rejectWhenOverloaded = (req, res, next) => {
        // 等待队列过多时快速失败，防止池子耗尽
        if (pool.waitingCount > 30) {
            return res.status(503).json({ success: false, message: '服务器繁忙，请稍后重试' });
        }
        return next();
    };

    app.get('/quiz', requireLogin, requireAuthorized, basicRateLimit, async (req, res) => {
        // 初始化session
        if (!req.session.initialized) {
            req.session.initialized = true;
            req.session.createdAt = Date.now();
            // 🛡️ 安全修复：统一使用csrf库生成token
            generateCSRFToken(req);
        }

        const username = req.session.user.username;

        // 获取用户电币余额
        let balance = 0;
        try {
            const result = await pool.query(
                'SELECT balance FROM users WHERE username = $1',
                [username]
            );
            balance = result.rows.length > 0 ? result.rows[0].balance : 0;
        } catch (dbError) {
            console.error('Database query error:', dbError);
        }

        res.render('quiz', {
            username,
            balance,
            csrfToken: req.session.csrfToken
        });
    });

    // Quiz 开始游戏 API - 扣除电币 + 创建付费会话
    app.post('/api/quiz/start', requireLogin, requireAuthorized, basicRateLimit, async (req, res) => {
        try {
            const { username } = req.body;

            // 验证用户名
            if (username !== req.session.user.username) {
                return res.status(403).json({ success: false, message: '用户名不匹配' });
            }

            // 每次开始新会话时，清理旧的 quiz 会话
            const prevSessionId = req.session.quizSessionId;
            if (prevSessionId) {
                quizSessions.delete(prevSessionId);
            }

            // 使用余额日志系统扣除电币
            const balanceResult = await BalanceLogger.updateBalance({
                username: username,
                amount: -10,
                operationType: 'quiz_start',
                description: '开始答题游戏',
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            });

            if (!balanceResult.success) {
                return res.status(400).json({ success: false, message: balanceResult.message });
            }

            // 创建新的 quiz 会话（绑定付费、未结算、过期时间）
            const sessionId = GameLogic.generateToken(16);
            const now = Date.now();
            quizSessions.set(sessionId, {
                username,
                paid: true,
                settled: false,
                createdAt: now,
                expiresAt: now + 20 * 60 * 1000 // 有效期放宽到20分钟，减少误判
            });
            req.session.quizSessionId = sessionId;

            res.json({
                success: true,
                message: '游戏开始，已扣除10电币',
                newBalance: balanceResult.balance,
                quizSessionId: sessionId
            });
        } catch (error) {
            console.error('Quiz start error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.get('/slot', requireLogin, requireAuthorized, basicRateLimit, async (req, res) => {
        try {
            // 初始化session
            if (!req.session.initialized) {
                req.session.initialized = true;
                req.session.createdAt = Date.now();
                generateCSRFToken(req); // 统一使用csrf库
            }

            const username = req.session.user.username;

            // 获取用户余额
            const userResult = await pool.query(
                'SELECT balance FROM users WHERE username = $1',
                [username]
            );

            const balance = userResult.rows.length > 0 ? parseFloat(userResult.rows[0].balance) : 0;

            res.render('slot', {
                username,
                balance,
                csrfToken: req.session.csrfToken
            });
        } catch (error) {
            console.error('Slot page error:', error);
            res.status(500).send('服务器错误');
        }
    });

    app.get('/scratch', requireLogin, requireAuthorized, basicRateLimit, async (req, res) => {
        try {
            // 初始化session
            if (!req.session.initialized) {
                req.session.initialized = true;
                req.session.createdAt = Date.now();
                generateCSRFToken(req); // 统一使用csrf库
            }

            const username = req.session.user.username;

            // 获取用户余额
            const userResult = await pool.query(
                'SELECT balance FROM users WHERE username = $1',
                [username]
            );

            const balance = userResult.rows.length > 0 ? parseFloat(userResult.rows[0].balance) : 0;

            res.render('scratch', {
                username,
                balance,
                csrfToken: req.session.csrfToken
            });
        } catch (error) {
            console.error('Scratch page error:', error);
            res.status(500).send('服务器错误');
        }
    });

    app.get('/dictation', requireLogin, requireAuthorized, basicRateLimit, async (req, res) => {
        if (!req.session.initialized) {
            req.session.initialized = true;
            req.session.createdAt = Date.now();
            generateCSRFToken(req);
        }

        const username = req.session.user.username;
        let attempts = 0;
        try {
            const result = await pool.query(
                'SELECT attempts FROM dictation_allowances WHERE username = $1',
                [username]
            );
            if (result.rows.length) {
                attempts = Number(result.rows[0].attempts || 0);
            }
        } catch (error) {
            console.error('Dictation attempts fetch error:', error);
        }
        if (attempts <= 0) {
            return res.redirect('/');
        }
        res.render('dictation', {
            username,
            csrfToken: req.session.csrfToken
        });
    });

    app.get('/spin', requireLogin, requireAuthorized, basicRateLimit, (req, res) => {
        // 初始化session
        if (!req.session.initialized) {
            req.session.initialized = true;
            req.session.createdAt = Date.now();
            // 🛡️ 安全修复：统一使用csrf库生成token
            generateCSRFToken(req);
        }

        const username = req.session.user.username;
        res.render('spin', {
            username,
            csrfToken: req.session.csrfToken
        });
    });

    app.get('/stone', requireLogin, requireAuthorized, basicRateLimit, async (req, res) => {
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

            const balance = userResult.rows.length > 0 ? parseFloat(userResult.rows[0].balance) : 0;

            res.render('stone', {
                username,
                balance,
                csrfToken: req.session.csrfToken
            });
        } catch (error) {
            console.error('Stone page error:', error);
            res.status(500).send('服务器错误');
        }
    });

    app.get('/flip', requireLogin, requireAuthorized, basicRateLimit, async (req, res) => {
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

            const balance = userResult.rows.length > 0 ? parseFloat(userResult.rows[0].balance) : 0;

            res.render('flip', {
                username,
                balance,
                csrfToken: req.session.csrfToken
            });
        } catch (error) {
            console.error('Flip page error:', error);
            res.status(500).send('服务器错误');
        }
    });

    app.get('/duel', requireLogin, requireAuthorized, basicRateLimit, async (req, res) => {
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

            const balance = userResult.rows.length > 0 ? parseFloat(userResult.rows[0].balance) : 0;

            res.render('duel', {
                username,
                balance,
                csrfToken: req.session.csrfToken
            });
        } catch (error) {
            console.error('Duel page error:', error);
            res.status(500).send('服务器错误');
        }
    });

    // Quiz API 路由
    app.get('/api/user-info', basicRateLimit, (req, res) => {
        const username = generateUsername();
        res.json({ success: true, username });
    });

    app.post('/api/quiz/next',
        requireLogin,
        requireAuthorized,
        basicRateLimit,
        csrfProtection,
        (req, res) => {
        try {
            const { username: requestUsername, seen = [], questionIndex = 0 } = req.body;
            const username = req.session.user.username;
            if (requestUsername && requestUsername !== username) {
                return res.status(403).json({ success: false, message: '用户名不匹配' });
            }

            // 验证付费会话
            const quizSessionId = req.session.quizSessionId;
            const sessionData = quizSessionId ? quizSessions.get(quizSessionId) : null;
            if (!sessionData || sessionData.username !== username) {
                return res.status(403).json({ success: false, message: '未找到有效答题会话，请先开始游戏' });
            }
            const now = Date.now();
            if (!sessionData.paid || sessionData.settled || now > sessionData.expiresAt) {
                return res.status(403).json({ success: false, message: '答题会话无效或已过期，请重新开始' });
            }

            const question = GameLogic.quiz.getRandomQuestion(questions, seen, questionIndex);
            if (!question) {
                return res.json({ success: false, message: '没有更多题目了' });
            }

            const token = GameLogic.generateToken(16);
            const signature = GameLogic.generateToken(16);

            // 存储问题信息，绑定到当前付费会话，按 session 分桶
            if (!userSessions.has(username)) {
                userSessions.set(username, { tokensBySession: {} });
            }
            const userStore = userSessions.get(username);
            if (!userStore.tokensBySession) {
                userStore.tokensBySession = {};
            }
            // 只清理其他会话的残留，当前会话保留已有题目的token
            Object.keys(userStore.tokensBySession).forEach((sid) => {
                if (sid !== quizSessionId) {
                    delete userStore.tokensBySession[sid];
                }
            });
            if (!userStore.tokensBySession[quizSessionId]) {
                userStore.tokensBySession[quizSessionId] = {};
            }
            // 限制单次会话题目数量，防止无限刷题（最多15题）
            const currentCount = Object.keys(userStore.tokensBySession[quizSessionId]).length;
            if (currentCount >= 15) {
                return res.status(400).json({ success: false, message: '题目数量已达上限，请提交答案' });
            }
            userStore.tokensBySession[quizSessionId][token] = {
                questionId: question.id,
                timestamp: Date.now(),
                sessionId: quizSessionId
            };
            userSessions.set(username, userStore);

            res.json({
                success: true,
                question: {
                    id: question.id,
                    question: question.question,
                    options: question.options
                },
                token,
                signature
            });
        } catch (error) {
            console.error('Quiz next error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.post('/api/quiz/submit',
        requireLogin,
        requireAuthorized,
        basicRateLimit,
        csrfProtection,
        async (req, res) => {
        try {
            const { username, answers = [] } = req.body;

            // 验证用户名与登录用户一致
            if (username !== req.session.user.username) {
                return res.status(403).json({ success: false, message: '用户名不匹配' });
            }

            // 验证付费会话
            const quizSessionId = req.session.quizSessionId;
            const sessionData = quizSessionId ? quizSessions.get(quizSessionId) : null;
            const now = Date.now();
            if (!sessionData || sessionData.username !== username) {
                return res.status(403).json({ success: false, message: '未找到有效答题会话，请先开始游戏' });
            }
            if (!sessionData.paid || sessionData.settled) {
                return res.status(403).json({ success: false, message: '答题会话无效或已结算' });
            }
            if (now > sessionData.expiresAt) {
                quizSessions.delete(quizSessionId);
                return res.status(403).json({ success: false, message: '答题会话已过期，请重新开始' });
            }
            if (sessionData.processing) {
                return res.status(429).json({ success: false, message: '答题提交处理中，请勿重复提交' });
            }
            sessionData.processing = true;
            quizSessions.set(quizSessionId, sessionData);

            let correctCount = 0;
            let validAnswers = 0;
            const userStore = userSessions.get(username);
            const userTokens = userStore?.tokensBySession?.[quizSessionId] || {};
            const usedTokens = new Set();

            for (const answer of answers) {
                const tokenData = userTokens[answer.token];
                // token不存在直接跳过
                if (!tokenData) {
                    continue;
                }
                // 防重放：同一次提交内重复token
                if (usedTokens.has(answer.token)) {
                    return res.status(400).json({ success: false, message: 'Token重复使用，疑似作弊' });
                }
                const tokenAge = Date.now() - (tokenData.timestamp || 0);
                if (tokenAge > 60_000) {
                    continue; // 过期token直接忽略
                }
                if (tokenData && tokenData.sessionId === quizSessionId) {
                    const question = questionMap.get(tokenData.questionId);
                    if (question && GameLogic.quiz.validateAnswer(question, answer.answerIndex)) {
                        correctCount++;
                    }
                    validAnswers++;
                    usedTokens.add(answer.token);
                }
            }

            // 消费已使用的token，避免后续重放
            usedTokens.forEach((token) => {
                delete userTokens[token];
            });

            if (validAnswers === 0) {
                return res.status(400).json({
                    success: false,
                    message: '未找到有效题目令牌，请重新获取题目后再提交'
                });
            }

            // 防止重复提交：标记已结算
            sessionData.settled = true;
            sessionData.processing = false;
            quizSessions.set(quizSessionId, sessionData);

            // 存储到数据库 - 完全对齐kingboost格式
            try {
                const crypto = require('crypto');
                const proof = crypto.createHash('sha256')
                    .update(`${username}-${Date.now()}-${randomBytes(8).toString('hex')}`)
                    .digest('hex');

                // 存储主记录到submissions表
                const submissionResult = await pool.query(
                    'INSERT INTO submissions (username, score, submitted_at, proof) VALUES ($1, $2, NOW(), $3) RETURNING id',
                    [username, correctCount, proof]
                );

                const submissionId = submissionResult.rows[0].id;

                // 存储详细答题记录到submission_details表
                for (let i = 0; i < answers.length; i++) {
                    const answer = answers[i];
                    const tokenData = userTokens[answer.token];
                    if (tokenData && tokenData.sessionId === quizSessionId) {
                        const question = questionMap.get(tokenData.questionId);
                        if (question) {
                            const userAnswer = question.options[answer.answerIndex];
                            const correctAnswer = question.options[question.correct];
                            const isCorrect = answer.answerIndex === question.correct;

                            await pool.query(
                                'INSERT INTO submission_details (submission_id, question_id, user_answer, is_correct, correct_answer) VALUES ($1, $2, $3, $4, $5)',
                                [submissionId, question.id, userAnswer, isCorrect, correctAnswer]
                            );
                        }
                    }
                }
            } catch (dbError) {
                console.error('数据库存储失败:', dbError);
            }

            // 清理用户会话
            if (userSessions.has(username)) {
                userSessions.delete(username);
            }

            // 发放电币奖励 (得分 × 2)
            const reward = correctCount * 2;
            let newBalance = 0;

            if (reward > 0) {
                const balanceResult = await BalanceLogger.updateBalance({
                    username: username,
                    amount: reward,
                    operationType: 'quiz_reward',
                    description: `答题奖励：${correctCount}题正确 × 2电币`,
                    gameData: {
                        score: correctCount,
                        total: answers.length,
                        reward: reward
                    },
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent'),
                    requireSufficientBalance: false
                });

                if (balanceResult.success) {
                    newBalance = balanceResult.balance;
                } else {
                    console.error('电币奖励发放失败:', balanceResult.message);
                }
            }

            res.json({
                success: true,
                score: correctCount,
                total: answers.length,
                reward: reward,
                newBalance: newBalance,
                proof: GameLogic.generateToken(8)
            });
        } catch (error) {
            const quizSessionId = req.session.quizSessionId;
            if (quizSessionId && quizSessions.has(quizSessionId)) {
                const sd = quizSessions.get(quizSessionId);
                if (sd) {
                    sd.processing = false;
                    quizSessions.set(quizSessionId, sd);
                }
            }
            console.error('Quiz submit error:', error);
            res.status(500).json({ success: false, message: '提交失败' });
        }
    });

    // Quiz 排行榜 API
    app.get('/api/quiz/leaderboard', requireLogin, requireAuthorized, async (req, res) => {
        try {
            // 修改为只显示每个账号的最高分
            const result = await pool.query(
                `SELECT username, MAX(score) as score, 
                        (SELECT submitted_at FROM submissions s2 
                         WHERE s2.username = s1.username AND s2.score = MAX(s1.score) 
                         ORDER BY submitted_at DESC LIMIT 1) as submitted_at
                 FROM submissions s1
                 WHERE DATE(submitted_at) = CURRENT_DATE
                   AND s1.username NOT IN (SELECT username FROM users WHERE is_admin = TRUE)
                 GROUP BY username
                 ORDER BY score DESC, submitted_at ASC 
                 LIMIT 20`
            );

            res.json({
                success: true,
                leaderboard: result.rows
            });
        } catch (error) {
            console.error('Quiz leaderboard error:', error);
            res.status(500).json({ success: false, message: '获取排行榜失败' });
        }
    });

    // 余额变动记录 API
    app.get('/api/balance/logs', requireLogin, requireAuthorized, async (req, res) => {
        try {
            const username = req.session.user.username;
            const page = parseInt(req.query.page) || 1;
            const limit = Math.min(parseInt(req.query.limit) || 20, 100);
            const offset = (page - 1) * limit;

            const logs = await BalanceLogger.getUserBalanceLogs(username, limit, offset);

            res.json({
                success: true,
                logs: logs,
                page: page,
                limit: limit
            });
        } catch (error) {
            console.error('Balance logs error:', error);
            res.status(500).json({ success: false, message: '获取记录失败' });
        }
    });

    app.post('/api/dictation/start',
        rejectWhenOverloaded,
        requireLogin,
        requireAuthorized,
        basicRateLimit,
        userActionRateLimit,
        csrfProtection,
        async (req, res) => {
        try {
            if (req.session.dictationPending && req.session.dictationStartAt) {
                const elapsed = Date.now() - req.session.dictationStartAt;
                if (elapsed <= 30 * 60 * 1000) {
                    return res.status(400).json({ success: false, message: '已有未提交的听写' });
                }
                req.session.dictationPending = false;
                req.session.dictationStartAt = null;
            }

            const username = req.session.user?.username || '';
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const attemptsResult = await client.query(
                    'SELECT attempts FROM dictation_allowances WHERE username = $1 FOR UPDATE',
                    [username]
                );
                const currentAttempts = attemptsResult.rows.length
                    ? Number(attemptsResult.rows[0].attempts || 0)
                    : 0;
                if (!attemptsResult.rows.length || currentAttempts <= 0) {
                    await client.query('ROLLBACK');
                    return res.status(403).json({ success: false, message: '听写次数不足' });
                }

                await client.query(
                    'UPDATE dictation_allowances SET attempts = GREATEST(attempts - 1, 0), updated_at = NOW() WHERE username = $1',
                    [username]
                );
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK').catch(() => {});
                throw error;
            } finally {
                client.release();
            }

            req.session.dictationPending = true;
            req.session.dictationStartAt = Date.now();

            res.json({ success: true, message: '开始成功' });
        } catch (error) {
            console.error('Dictation start error:', error);
            res.status(500).json({ success: false, message: '开始失败' });
        }
    });

    app.post('/api/dictation/submit',
        rejectWhenOverloaded,
        requireLogin,
        requireAuthorized,
        basicRateLimit,
        userActionRateLimit,
        csrfProtection,
        async (req, res) => {
        try {
            const startAt = req.session.dictationStartAt;
            if (!req.session.dictationPending || !startAt) {
                return res.status(400).json({ success: false, message: '听写未开始' });
            }
            if (Date.now() - startAt > 30 * 60 * 1000) {
                req.session.dictationPending = false;
                req.session.dictationStartAt = null;
                return res.status(400).json({ success: false, message: '听写已过期，请重新开始' });
            }

            const sanitizeText = (value, maxLen) => {
                if (typeof value !== 'string') {
                    return '';
                }
                return value.trim().slice(0, maxLen);
            };

            const wordId = sanitizeText(req.body?.wordId, 50);
            const word = sanitizeText(req.body?.word, 120);
            const pronunciation = sanitizeText(req.body?.pronunciation, 120);
            const definition = sanitizeText(req.body?.definition, 400);
            const userInput = sanitizeText(req.body?.input, 120);

            if (!wordId || !userInput) {
                return res.status(400).json({ success: false, message: '请填写听写内容后再提交' });
            }

            const userId = req.session.user?.id || null;
            const username = req.session.user?.username || '';

            await pool.query(
                `INSERT INTO dictation_submissions
                    (user_id, username, word_id, word, pronunciation, definition, user_input, ip_address, user_agent)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    userId,
                    username,
                    wordId,
                    word || null,
                    pronunciation || null,
                    definition || null,
                    userInput,
                    req.ip,
                    req.get('User-Agent')
                ]
            );

            req.session.dictationPending = false;
            req.session.dictationStartAt = null;

            res.json({ success: true, message: '提交成功，等待人工审核' });
        } catch (error) {
            console.error('Dictation submit error:', error);
            res.status(500).json({ success: false, message: '提交失败' });
        }
    });


    app.post('/api/slot/play', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const postCommitTasks = [];
            const { username, betAmount } = req.body;
            const betValue = Number(betAmount);

            if (username !== req.session.user.username) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, message: '用户名不匹配' });
            }

            if (!Number.isFinite(betValue) || !Number.isInteger(betValue) || betValue < 1 || betValue > 1000) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '投注金额必须在1-1000电币之间' });
            }

            const betResult = await BalanceLogger.updateBalance({
                username: username,
                amount: -betValue,
                operationType: 'slot_bet',
                description: `老虎机投注：${betValue} 电币`,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                client,
                managedTransaction: true
            });

            if (!betResult.success) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: betResult.message });
            }

            const currentBalance = betResult.balance;

            const outcomes = [
                { type: '不亏不赚', multiplier: 1.0 },
                { type: '×2', multiplier: 2.0 },
                { type: '归零', multiplier: 0.0 },
                { type: '×1.5', multiplier: 1.5 },
                { type: '×0.5', multiplier: 0.5 }
            ];

            const randomIndex = randomInt(0, 5);
            const outcome = outcomes[randomIndex];

            const payout = Math.floor(betValue * outcome.multiplier);

            const baseAmounts = [50, 100, 150, 200];
            const amounts = baseAmounts.map((num) => Math.max(1, Math.round(num * betValue / 100)));
            const randomAmount = () => amounts[randomInt(0, amounts.length)];
            const isLose = payout <= 0;
            let slotResults = isLose ? [randomAmount(), randomAmount(), randomAmount()] : [payout, payout, payout];
            if (isLose) {
                while (slotResults[0] === slotResults[1] && slotResults[1] === slotResults[2]) {
                    slotResults = [randomAmount(), randomAmount(), randomAmount()];
                }
            }

            let finalBalance = currentBalance;
            if (payout > 0) {
                const winResult = await BalanceLogger.updateBalance({
                    username: username,
                    amount: payout,
                    operationType: 'slot_win',
                    description: `老虎机中奖：${outcome.type}，获得 ${payout} 电币`,
                    gameData: {
                        bet_amount: betAmount,
                        outcome: outcome.type,
                        multiplier: outcome.multiplier,
                        payout: payout
                    },
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent'),
                    requireSufficientBalance: false,
                    client,
                    managedTransaction: true
                });

                if (winResult.success) {
                    finalBalance = winResult.balance;
                }
            }

            // 提交后记录 slot 结果，减少事务内 I/O
            postCommitTasks.push(async () => {
                try {
                    const crypto = require('crypto');
                    const proof = crypto.createHash('sha256')
                        .update(`${username}-${Date.now()}-${randomBytes(8).toString('hex')}`)
                        .digest('hex');

                    await pool.query(`
                        INSERT INTO slot_results (
                            username, result, won, proof, created_at,
                            bet_amount, payout_amount, balance_before, balance_after, multiplier, game_details
                        ) 
                        VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10)
                    `, [
                        username,
                        JSON.stringify(slotResults),
                        outcome.type,
                        proof,
                        betValue,
                        payout,
                        currentBalance + betAmount,
                        finalBalance,
                        outcome.multiplier,
                        JSON.stringify({
                            outcome: outcome.type,
                            amounts: slotResults,
                            won: payout > 0,
                            timestamp: new Date().toISOString()
                        })
                    ]);
                } catch (dbError) {
                    console.error('Slot游戏记录存储失败:', dbError);
                }
            });

            await client.query('COMMIT');
            for (const task of postCommitTasks) {
                task().catch((err) => console.error('Slot post-commit log failed:', err));
            }

            res.json({
                success: true,
                outcome: outcome.type,
                multiplier: outcome.multiplier,
                payout: payout,
                reels: slotResults,
                newBalance: currentBalance,
                finalBalance: finalBalance
            });

        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('Slot play error:', error);
            res.status(500).json({ success: false, message: '游戏失败，请稍后重试' });
        } finally {
            client.release();
        }
    });
    // Scratch 刮刮乐游戏API
    // Scratch 刮刮乐游戏API
    app.post('/api/scratch/play', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, csrfProtection, async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { username, tier, winCount } = req.body;

            if (username !== req.session.user.username) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, message: '用户名不匹配' });
            }

            const validTiers = [
                { cost: 5, winCount: 5, userCount: 5 },
                { cost: 10, winCount: 5, userCount: 10 },
                { cost: 100, winCount: 5, userCount: 20 }
            ];

            const selectedTier = validTiers.find(t => t.cost === tier);
            if (!selectedTier) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '无效的游戏档位' });
            }

            const betResult = await BalanceLogger.updateBalance({
                username: username,
                amount: -tier,
                operationType: 'scratch_bet',
                description: `刮刮乐投注：${tier} 电币 (${selectedTier.winCount}中奖+${selectedTier.userCount}我的)`,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                client,
                managedTransaction: true
            });

            if (!betResult.success) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: betResult.message });
            }

            const currentBalance = betResult.balance;

            const random = randomInt(0, 10000) / 100; // 0-100的随机数
            let payout = 0;
            let outcomeType = '';

            if (random <= 50) {
                payout = tier;
                outcomeType = `中奖 ${tier} 电币`;
            } else if (random <= 70) {
                payout = tier * 2;
                outcomeType = `大奖 ${payout} 电币`;
            } else if (random <= 71) {
                payout = tier * 4;
                outcomeType = `超级大奖 ${payout} 电币`;
            } else {
                payout = 0;
                outcomeType = '未中奖';
            }

            let finalBalance = currentBalance;
            if (payout > 0) {
                const winResult = await BalanceLogger.updateBalance({
                    username: username,
                    amount: payout,
                    operationType: 'scratch_win',
                    description: `刮刮乐中奖：${outcomeType}，获得 ${payout} 电币`,
                    gameData: {
                        tier: tier,
                        outcome: outcomeType,
                        payout: payout,
                        tier_config: selectedTier
                    },
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent'),
                    requireSufficientBalance: false,
                    client,
                    managedTransaction: true
                });

                if (winResult.success) {
                    finalBalance = winResult.balance;
                }
            }

            // 生成刮刮乐显示内容 - 修复为正确的号码配置
            const winningNumbers = [];
            for (let i = 0; i < selectedTier.winCount; i++) {
                winningNumbers.push(randomInt(1, 101));
            }

            // 生成我的号码区域 - 修复中奖金额显示逻辑
            const userSlots = [];
            let matchedCount = 0;

            // 定义奖励金额梯度
            const rewardAmounts = {
                5: [5, 10, 15, 20, 25, 30, 50],     // 5电币档位奖励
                10: [10, 20, 30, 40, 50, 80, 100],  // 10电币档位奖励
                100: [100, 200, 300, 500, 800, 1000, 1500] // 100电币档位奖励
            };

            const tierRewards = rewardAmounts[tier] || [tier, tier * 2, tier * 3, tier * 4, tier * 5, tier * 8, tier * 10];

            for (let i = 0; i < selectedTier.userCount; i++) {
                let num;
                let prize;

                // 如果应该中奖且还没有匹配号码
                if (payout > 0 && matchedCount === 0) {
                    num = winningNumbers[randomInt(0, winningNumbers.length)];
                    prize = `${payout} 电币`; // 使用实际中奖金额
                    matchedCount++;
                } else {
                    num = randomInt(1, 101);
                    prize = `${tierRewards[randomInt(0, tierRewards.length)]} 电币`;
                }

                userSlots.push({
                    number: num,
                    prize: prize,
                    isWinning: winningNumbers.includes(num)
                });
            }

            // 如果中奖但没有匹配号码，强制插入一个匹配号码
            if (payout > 0 && matchedCount === 0) {
                userSlots[0] = {
                    number: winningNumbers[0],
                    prize: `${payout} 电币`,
                    isWinning: true
                };
            }

            // 保存游戏记录
            try {
                const crypto = require('crypto');
                const proof = crypto.createHash('sha256')
                    .update(`${username}-scratch-${Date.now()}-${randomBytes(8).toString('hex')}`)
                    .digest('hex');

                await pool.query(
                    `INSERT INTO scratch_results (
                        username, reward, matches_count, tier_cost, winning_numbers, slots, proof, created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, (NOW() AT TIME ZONE 'Asia/Shanghai'))`,
                    [username, payout, matchedCount, tier, JSON.stringify(winningNumbers), JSON.stringify(userSlots), proof]
                );
            } catch (dbError) {
                console.error('Scratch游戏记录存储失败:', dbError);
            }

            await client.query('COMMIT');

            res.json({
                success: true,
                reward: payout,
                payout: payout,
                outcome: outcomeType,
                matches_count: matchedCount,
                matchesCount: matchedCount,
                winning_numbers: winningNumbers,
                winningNumbers: winningNumbers,
                slots: userSlots,
                balance: finalBalance
            });

        } catch (error) {
            try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
            console.error('Scratch play error:', error);
            res.status(500).json({ success: false, message: '游戏失败，请稍后重试' });
        } finally {
            client.release();
        }
    });

    // 合石头 Stone 游戏API
    app.get('/api/stone/state', requireLogin, requireAuthorized, basicRateLimit, async (req, res) => {
        try {
            const username = req.session.user.username;
            const slots = await getStoneState(username);
            const isFull = slots.every((slot) => slot);
            const maxSame = getMaxSameCount(slots);
            const reward = isFull ? (stoneRewards[maxSame] || 0) : 0;
            const replaceCost = isFull ? (stoneReplaceCosts[maxSame] || null) : null;

            res.json({
                success: true,
                slots,
                isFull,
                maxSame,
                reward,
                replaceCost,
                canReplace: isFull && maxSame < 6 && replaceCost !== null
            });
        } catch (error) {
            console.error('Stone state error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.post('/api/stone/add', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const postCommitTasks = [];
            const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtext($1 || \':stone\')) AS locked', [req.session.user.username]);
            if (!lock.rows[0].locked) {
                await client.query('ROLLBACK');
                return res.status(429).json({ success: false, message: '操作过于频繁，请稍后重试' });
            }
            const username = req.session.user.username;
            const slots = await getStoneState(username, client, { forUpdate: true });
            const beforeSlots = slots.slice();

            const emptyIndex = slots.findIndex((slot) => !slot);
            if (emptyIndex === -1) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '槽位已满' });
            }

            const balanceResult = await BalanceLogger.updateBalance({
                username,
                amount: -30,
                operationType: 'stone_add',
                description: '合石头：放入一颗石头',
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                client,
                managedTransaction: true
            });

            if (!balanceResult.success) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: balanceResult.message });
            }

            slots[emptyIndex] = randomStoneColor();
            await saveStoneState(username, slots, client);
            postCommitTasks.push(async () => {
                await logStoneAction({
                    username,
                    actionType: 'add',
                    cost: 30,
                    beforeSlots,
                    afterSlots: slots
                });
            });

            await client.query('COMMIT');
            for (const task of postCommitTasks) {
                task().catch((err) => console.error('Stone add post-commit log failed:', err));
            }
            res.json({
                success: true,
                slots,
                newBalance: balanceResult.balance
            });
        } catch (error) {
            try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
            console.error('Stone add error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client.release();
        }
    });

    app.post('/api/stone/fill', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const postCommitTasks = [];
            const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtext($1 || \':stone\')) AS locked', [req.session.user.username]);
            if (!lock.rows[0].locked) {
                await client.query('ROLLBACK');
                return res.status(429).json({ success: false, message: '操作过于频繁，请稍后重试' });
            }
            const username = req.session.user.username;
            const slots = await getStoneState(username, client, { forUpdate: true });
            const beforeSlots = slots.slice();

            if (slots.every((slot) => slot)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '槽位已满' });
            }

            const emptyCount = slots.filter((slot) => !slot).length;
            const cost = emptyCount * 30;

            const balanceResult = await BalanceLogger.updateBalance({
                username,
                amount: -cost,
                operationType: 'stone_fill',
                description: '合石头：一键填满',
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                client,
                managedTransaction: true
            });

            if (!balanceResult.success) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: balanceResult.message });
            }

            const newSlots = slots.map((slot) => slot || randomStoneColor());
            await saveStoneState(username, newSlots, client);
            postCommitTasks.push(async () => {
                await logStoneAction({
                    username,
                    actionType: 'fill',
                    cost,
                    beforeSlots,
                    afterSlots: newSlots
                });
            });

            await client.query('COMMIT');
            for (const task of postCommitTasks) {
                task().catch((err) => console.error('Stone fill post-commit log failed:', err));
            }
            res.json({
                success: true,
                slots: newSlots,
                newBalance: balanceResult.balance
            });
        } catch (error) {
            try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
            console.error('Stone fill error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client.release();
        }
    });

    app.post('/api/stone/replace', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const postCommitTasks = [];
            const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtext($1 || \':stone\')) AS locked', [req.session.user.username]);
            if (!lock.rows[0].locked) {
                await client.query('ROLLBACK');
                return res.status(429).json({ success: false, message: '操作过于频繁，请稍后重试' });
            }
            const username = req.session.user.username;
            const index = Number(req.body.index);
            const slots = await getStoneState(username, client, { forUpdate: true });
            const beforeSlots = slots.slice();

            if (!Number.isInteger(index) || index < 0 || index >= slots.length) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '槽位索引无效' });
            }

            if (!slots.every((slot) => slot)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '槽位未满' });
            }

            const maxSame = getMaxSameCount(slots);
            const replaceCost = stoneReplaceCosts[maxSame];
            if (replaceCost === undefined) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '当前无法更换' });
            }

            const balanceResult = await BalanceLogger.updateBalance({
                username,
                amount: -replaceCost,
                operationType: 'stone_replace',
                description: `合石头：更换第${index + 1}颗石头`,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                client,
                managedTransaction: true
            });

            if (!balanceResult.success) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: balanceResult.message });
            }

            const newSlots = slots.slice();
            newSlots[index] = randomStoneColor();
            await saveStoneState(username, newSlots, client);
            postCommitTasks.push(async () => {
                await logStoneAction({
                    username,
                    actionType: 'replace',
                    cost: replaceCost,
                    slotIndex: index,
                    beforeSlots,
                    afterSlots: newSlots
                });
            });

            await client.query('COMMIT');
            for (const task of postCommitTasks) {
                task().catch((err) => console.error('Stone replace post-commit log failed:', err));
            }
            res.json({
                success: true,
                slots: newSlots,
                newBalance: balanceResult.balance
            });
        } catch (error) {
            try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
            console.error('Stone replace error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client.release();
        }
    });

    app.post('/api/stone/redeem', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const postCommitTasks = [];
            const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtext($1 || \':stone\')) AS locked', [req.session.user.username]);
            if (!lock.rows[0].locked) {
                await client.query('ROLLBACK');
                return res.status(429).json({ success: false, message: '操作过于频繁，请稍后重试' });
            }
            const username = req.session.user.username;
            const slots = await getStoneState(username, client, { forUpdate: true });
            const beforeSlots = slots.slice();

            if (!slots.every((slot) => slot)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '槽位未满' });
            }

            const maxSame = getMaxSameCount(slots);
            const reward = stoneRewards[maxSame] || 0;
            const newSlots = normalizeStoneSlots([]);

            await saveStoneState(username, newSlots, client);
            postCommitTasks.push(async () => {
                await logStoneAction({
                    username,
                    actionType: 'redeem',
                    reward,
                    beforeSlots,
                    afterSlots: newSlots
                });
            });

            let newBalance = null;
            if (reward > 0) {
                const rewardResult = await BalanceLogger.updateBalance({
                    username,
                    amount: reward,
                    operationType: 'stone_reward',
                    description: `合石头兑换奖励 ${reward} 电币`,
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent'),
                    requireSufficientBalance: false,
                    client,
                    managedTransaction: true
                });

                if (!rewardResult.success) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ success: false, message: rewardResult.message });
                }

                newBalance = rewardResult.balance;
            } else {
                const balanceResult = await client.query(
                    'SELECT balance FROM users WHERE username = $1',
                    [username]
                );
                newBalance = balanceResult.rows.length > 0 ? balanceResult.rows[0].balance : 0;
            }

            await client.query('COMMIT');
            for (const task of postCommitTasks) {
                task().catch((err) => console.error('Stone redeem post-commit log failed:', err));
            }
            res.json({
                success: true,
                slots: newSlots,
                reward,
                newBalance
            });
        } catch (error) {
            try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
            console.error('Stone redeem error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client.release();
        }
    });

    // 翻卡牌
    app.get('/api/flip/state', requireLogin, requireAuthorized, basicRateLimit, async (req, res) => {
        try {
            const username = req.session.user.username;
            const state = await getFlipState(username);
            const flips = (state.flipped || []).filter(Boolean).length;
            const nextCost = flips < flipCosts.length ? flipCosts[flips] : null;
            const canFlip = !state.ended && flips < flipCosts.length;
            const cashoutReward = flipCashoutRewards[state.good_count] || 0;
            const board = (state.board || Array(9).fill(null)).map((card, idx) => ({
                type: state.flipped?.[idx] ? card : 'unknown',
                flipped: !!state.flipped?.[idx]
            }));

            res.json({
                success: true,
                ended: state.ended,
                goodCount: state.good_count,
                badCount: state.bad_count,
                nextCost,
                canFlip,
                cashoutReward,
                board
            });
        } catch (error) {
            console.error('Flip state error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.post('/api/flip/start', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const postCommitTasks = [];
            const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtext($1 || \':flip\')) AS locked', [req.session.user.username]);
            if (!lock.rows[0].locked) {
                await client.query('ROLLBACK');
                return res.status(429).json({ success: false, message: '操作过于频繁，请稍后再试' });
            }
            const username = req.session.user.username;
            const previousState = await getFlipState(username, client, { forUpdate: true });
            const flips = previousState.good_count + previousState.bad_count;
            let previousReward = 0;
            let newBalance = null;

            if (!previousState.ended && flips > 0 && previousState.good_count > 0) {
                previousReward = flipCashoutRewards[previousState.good_count] || 0;
                previousState.ended = true;
                await saveFlipState(username, previousState, client);

                if (previousReward > 0) {
                    const rewardResult = await BalanceLogger.updateBalance({
                        username,
                        amount: previousReward,
                        operationType: 'flip_cashout',
                        description: `翻卡牌开始新一轮自动结算 ${previousReward} 电币`,
                        ipAddress: req.ip,
                        userAgent: req.get('User-Agent'),
                        requireSufficientBalance: false,
                        client,
                        managedTransaction: true
                    });

                    if (!rewardResult.success) {
                        await client.query('ROLLBACK');
                        return res.status(400).json({ success: false, message: rewardResult.message });
                    }
                    newBalance = rewardResult.balance;
                }

                postCommitTasks.push(async () => {
                    await logFlipAction({
                        username,
                        actionType: 'end',
                        reward: previousReward,
                        goodCount: previousState.good_count,
                        badCount: previousState.bad_count,
                        ended: true
                    });
                });
            }

            const board = Array(9).fill(null);
            const state = {
                board,
                flipped: Array(board.length).fill(false),
                good_count: 0,
                bad_count: 0,
                ended: false
            };
            await saveFlipState(username, state, client);

            await client.query('COMMIT');
            for (const task of postCommitTasks) {
                task().catch((err) => console.error('Flip start post-commit log failed:', err));
            }
            res.json({
                success: true,
                nextCost: flipCosts[0],
                previousReward,
                previousGood: previousState.good_count,
                previousBad: previousState.bad_count,
                newBalance
            });
        } catch (error) {
            try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
            console.error('Flip start error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client.release();
        }
    });

    app.post('/api/flip/flip', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const postCommitTasks = [];
            const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtext($1 || \':flip\')) AS locked', [req.session.user.username]);
            if (!lock.rows[0].locked) {
                await client.query('ROLLBACK');
                return res.status(429).json({ success: false, message: '操作过于频繁，请稍后再试' });
            }
            const username = req.session.user.username;
            const cardIndex = Number(req.body.cardIndex);

            if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex > 8) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '卡牌索引无效' });
            }

            const state = await getFlipState(username, client, { forUpdate: true });
            const flips = state.good_count + state.bad_count;
            if (state.ended || flips >= flipCosts.length) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '本轮已结束' });
            }

            const cost = flipCosts[flips];
            const balanceResult = await BalanceLogger.updateBalance({
                username,
                amount: -cost,
                operationType: 'flip_card',
                description: `翻卡牌：翻开第${flips + 1}张`,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                client,
                managedTransaction: true
            });

            if (!balanceResult.success) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: balanceResult.message });
            }

            if (!Array.isArray(state.board) || !Array.isArray(state.flipped)) {
                await client.query('ROLLBACK');
                return res.status(500).json({ success: false, message: '翻牌数据异常，请重试' });
            }

            const boardSize = state.board.length;
            if (cardIndex >= boardSize) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '卡牌索引无效' });
            }

            if (state.flipped[cardIndex]) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '该卡牌已翻开' });
            }

            // 动态分配本次翻开的牌型，根据剩余好/坏牌数量抽签
            const remainingGood = Math.max(0, 7 - state.good_count);
            const remainingBad = Math.max(0, 2 - state.bad_count);
            const remainingTotal = remainingGood + remainingBad;
            if (remainingTotal <= 0) {
                state.ended = true;
                await saveFlipState(username, state, client);
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '本轮已结束，请重新开始' });
            }

            let cardType = state.board[cardIndex];
            if (cardType !== 'good' && cardType !== 'bad') {
                const draw = randomInt(0, remainingTotal);
                cardType = draw < remainingGood ? 'good' : 'bad';
                state.board[cardIndex] = cardType;
            }

            state.flipped[cardIndex] = true;
            if (cardType === 'good') {
                state.good_count += 1;
                if (state.good_count >= 7) {
                    state.ended = true;
                }
            } else {
                state.bad_count += 1;
                state.ended = true;
            }

            let reward = 0;
            if (cardType === 'bad') {
                reward = 50;
            } else if (state.good_count >= 7) {
                reward = 30000;
                state.ended = true;
            }

            let rewardBalance = balanceResult.balance;
            if (reward > 0) {
                const rewardResult = await BalanceLogger.updateBalance({
                    username,
                    amount: reward,
                    operationType: 'flip_reward',
                    description: `翻卡牌奖励 ${reward} 电币`,
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent'),
                    requireSufficientBalance: false,
                    client,
                    managedTransaction: true
                });

                if (!rewardResult.success) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ success: false, message: rewardResult.message });
                }
                rewardBalance = rewardResult.balance;
            }

            await saveFlipState(username, state, client);
            if (state.ended) {
                postCommitTasks.push(async () => {
                    await logFlipAction({
                        username,
                        actionType: 'end',
                        reward,
                        goodCount: state.good_count,
                        badCount: state.bad_count,
                        ended: true
                    });
                });
            }

            await client.query('COMMIT');
            for (const task of postCommitTasks) {
                task().catch((err) => console.error('Flip flip post-commit log failed:', err));
            }
            res.json({
                success: true,
                cardIndex,
                cardType,
                goodCount: state.good_count,
                badCount: state.bad_count,
                ended: state.ended,
                reward,
                newBalance: rewardBalance
            });
        } catch (error) {
            try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
            console.error('Flip card error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client.release();
        }
    });

    app.post('/api/flip/cashout', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const postCommitTasks = [];
            const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtext($1 || \':flip\')) AS locked', [req.session.user.username]);
            if (!lock.rows[0].locked) {
                await client.query('ROLLBACK');
                return res.status(429).json({ success: false, message: '操作过于频繁，请稍后再试' });
            }

            const username = req.session.user.username;
            const state = await getFlipState(username, client, { forUpdate: true });

            if (state.ended) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '本轮已结束' });
            }

            if (state.bad_count > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '坏牌已出现，无法退出' });
            }

            const reward = flipCashoutRewards[state.good_count] || 0;
            state.ended = true;
            await saveFlipState(username, state, client);

            const rewardResult = await BalanceLogger.updateBalance({
                username,
                amount: reward,
                operationType: 'flip_cashout',
                description: `翻卡牌退出奖励 ${reward} 电币`,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                requireSufficientBalance: false,
                client,
                managedTransaction: true
            });

            if (!rewardResult.success) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: rewardResult.message });
            }

            postCommitTasks.push(async () => {
                await logFlipAction({
                    username,
                    actionType: 'end',
                    reward,
                    goodCount: state.good_count,
                    badCount: state.bad_count,
                    ended: true
                });
            });

            await client.query('COMMIT');
            for (const task of postCommitTasks) {
                task().catch((err) => console.error('Flip cashout post-commit log failed:', err));
            }
            res.json({
                success: true,
                reward,
                newBalance: rewardResult.balance
            });
        } catch (error) {
            try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
            console.error('Flip cashout error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client.release();
        }
    });

    // 决斗挑战 Duel 游戏API
    app.post('/api/duel/play', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const postCommitTasks = [];
            const username = req.session.user.username;
            const giftType = req.body.giftType;
            const power = Number(req.body.power);

            if (!duelRewards[giftType]) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '无效的奖品档位' });
            }

            if (!Number.isFinite(power) || power < 1 || power > 80) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '功力范围为1-80' });
            }

            const cost = calculateDuelCost(giftType, power);
            const successRate = power / 100;

            const balanceResult = await BalanceLogger.updateBalance({
                username,
                amount: -cost,
                operationType: 'duel_bet',
                description: `决斗挑战：功力${power}%`,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                client,
                managedTransaction: true
            });

            if (!balanceResult.success) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: balanceResult.message });
            }

            const success = randomFloat() < successRate;
            const reward = success ? duelRewards[giftType].reward : 0;

            const balanceAfterBet = balanceResult.balance;
            let newBalance = balanceAfterBet;
            if (success) {
                const rewardResult = await BalanceLogger.updateBalance({
                    username,
                    amount: reward,
                    operationType: 'duel_win',
                    description: `决斗挑战获胜：${duelRewards[giftType].name} ${reward} 电币`,
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent'),
                    requireSufficientBalance: false,
                    client,
                    managedTransaction: true
                });

                if (!rewardResult.success) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ success: false, message: rewardResult.message });
                }

                newBalance = rewardResult.balance;
            }

            // 提交后记录 duel 日志，避免事务内多一次 I/O
            postCommitTasks.push(async () => {
                try {
                    await pool.query(
                        `INSERT INTO duel_logs (
                            username, gift_type, reward, power, cost, success, created_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, (NOW() AT TIME ZONE 'Asia/Shanghai'))`,
                        [
                            username,
                            giftType,
                            reward,
                            power,
                            cost,
                            success
                        ]
                    );
                } catch (dbError) {
                    console.error('Duel log error:', dbError);
                }
            });

            await client.query('COMMIT');
            for (const task of postCommitTasks) {
                task().catch((err) => console.error('Duel post-commit log failed:', err));
            }

            if (req.session.user) {
                req.session.user.balance = newBalance;
            }

            res.json({
                success: true,
                duelSuccess: success,
                reward,
                cost,
                balanceAfterBet,
                balanceAfterReward: newBalance,
                newBalance
            });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('Duel play error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client.release();
        }
    });

    // Spin API 路由
    app.post('/api/spin',
        basicRateLimit,
        csrfProtection,
        (req, res) => {
        try {
            const result = GameLogic.spin.spin();
            res.json({
                success: true,
                prize: result.prize,
                angle: result.angle
            });
        } catch (error) {
            console.error('Spin error:', error);
            res.status(500).json({ success: false, message: '转盘故障' });
        }
    });

    // 获取用户游戏记录
    app.get('/api/game-records/:gameType', requireLogin, requireAuthorized, async (req, res) => {
        try {
            const { gameType } = req.params;
            const { page = 1, limit = 10 } = req.query;
            const username = req.session.user.username;
            const offset = (page - 1) * limit;

            let query, params, countQuery, countParams;

            switch (gameType) {
                case 'quiz':
                    query = `
                        SELECT id,
                               score,
                               to_char(submitted_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                        FROM submissions 
                        WHERE username = $1 
                        ORDER BY submitted_at DESC 
                        LIMIT $2 OFFSET $3
                    `;
                    params = [username, limit, offset];
                    countQuery = 'SELECT COUNT(*) FROM submissions WHERE username = $1';
                    countParams = [username];
                    break;

                case 'slot':
                    query = `
                        SELECT id,
                               won as result,
                               COALESCE(payout_amount, 0) as payout,
                               game_details->>'amounts' as amounts,
                               to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                        FROM slot_results 
                        WHERE username = $1 
                        ORDER BY created_at DESC 
                        LIMIT $2 OFFSET $3
                    `;

                    params = [username, limit, offset];
                    countQuery = 'SELECT COUNT(*) FROM slot_results WHERE username = $1';
                    countParams = [username];
                    break;

                case 'scratch':
                    query = `
                        SELECT id, reward as result, COALESCE(matches_count, 0) as matches_count, 
                               COALESCE(tier_cost, 5) as tier_cost, 
                               winning_numbers, slots,
                               to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                        FROM scratch_results 
                        WHERE username = $1 
                        ORDER BY created_at DESC 
                        LIMIT $2 OFFSET $3
                    `;
                    params = [username, limit, offset];
                    countQuery = 'SELECT COUNT(*) FROM scratch_results WHERE username = $1';
                    countParams = [username];
                    break;

                case 'wish':
                    query = `
                        SELECT id,
                               batch_count,
                               total_cost,
                               success_count,
                               total_reward_value,
                               gift_name,
                               to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                        FROM wish_sessions
                        WHERE username = $1
                        ORDER BY created_at DESC
                        LIMIT $2 OFFSET $3
                    `;
                    params = [username, limit, offset];
                    countQuery = 'SELECT COUNT(*) FROM wish_sessions WHERE username = $1';
                    countParams = [username];
                    break;

                case 'stone':
                    query = `
                        SELECT id,
                               action_type,
                               cost,
                               reward,
                               slot_index,
                               before_slots,
                               after_slots,
                               to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                        FROM stone_logs
                        WHERE username = $1
                        ORDER BY created_at DESC
                        LIMIT $2 OFFSET $3
                    `;
                    params = [username, limit, offset];
                    countQuery = 'SELECT COUNT(*) FROM stone_logs WHERE username = $1';
                    countParams = [username];
                    break;

                case 'flip':
                    query = `
                        SELECT id,
                               action_type,
                               reward,
                               good_count,
                               bad_count,
                               ended,
                               to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                        FROM flip_logs
                        WHERE username = $1 AND action_type = 'end'
                        ORDER BY created_at DESC
                        LIMIT $2 OFFSET $3
                    `;
                    params = [username, limit, offset];
                    countQuery = "SELECT COUNT(*) FROM flip_logs WHERE username = $1 AND action_type = 'end'";
                    countParams = [username];
                    break;

                case 'duel':
                    query = `
                        SELECT id,
                               gift_type,
                               reward,
                               power,
                               cost,
                               success,
                               to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                        FROM duel_logs
                        WHERE username = $1
                        ORDER BY created_at DESC
                        LIMIT $2 OFFSET $3
                    `;
                    params = [username, limit, offset];
                    countQuery = 'SELECT COUNT(*) FROM duel_logs WHERE username = $1';
                    countParams = [username];
                    break;

                default:
                    return res.status(400).json({ success: false, message: '不支持的游戏类型' });
            }

            const [records, countResult] = await Promise.all([
                pool.query(query, params),
                pool.query(countQuery, countParams)
            ]);

            const total = parseInt(countResult.rows[0].count);
            const totalPages = Math.ceil(total / limit);

            res.json({
                success: true,
                gameType,
                records: records.rows,
                pagination: {
                    current: parseInt(page),
                    total: totalPages,
                    count: total,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            });

        } catch (error) {
            console.error('获取游戏记录失败:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });
};
