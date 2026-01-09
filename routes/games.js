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
    const { randomInt, randomBytes } = require('crypto');
    const randomFloat = () => randomInt(0, 1000000) / 1000000;

    app.get('/quiz', requireLogin, requireAuthorized, security.basicRateLimit, async (req, res) => {
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

    // Quiz 开始游戏 API - 扣除电币
    app.post('/api/quiz/start', requireLogin, requireAuthorized, security.basicRateLimit, async (req, res) => {
        try {
            const { username } = req.body;

            // 验证用户名
            if (username !== req.session.user.username) {
                return res.status(403).json({ success: false, message: '用户名不匹配' });
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

            res.json({
                success: true,
                message: '游戏开始，已扣除10电币',
                newBalance: balanceResult.balance
            });
        } catch (error) {
            console.error('Quiz start error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.get('/slot', requireLogin, requireAuthorized, security.basicRateLimit, async (req, res) => {
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

    app.get('/scratch', requireLogin, requireAuthorized, security.basicRateLimit, async (req, res) => {
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

    app.get('/spin', requireLogin, requireAuthorized, security.basicRateLimit, (req, res) => {
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

    app.get('/stone', requireLogin, requireAuthorized, security.basicRateLimit, async (req, res) => {
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

    app.get('/flip', requireLogin, requireAuthorized, security.basicRateLimit, async (req, res) => {
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

    app.get('/duel', requireLogin, requireAuthorized, security.basicRateLimit, async (req, res) => {
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
    app.get('/api/user-info', security.basicRateLimit, (req, res) => {
        const username = generateUsername();
        res.json({ success: true, username });
    });

    app.post('/api/quiz/next',
        requireLogin,
        requireAuthorized,
        security.basicRateLimit,
        security.csrfProtection,
        (req, res) => {
        try {
            const { username: requestUsername, seen = [], questionIndex = 0 } = req.body;
            const username = req.session.user.username;
            if (requestUsername && requestUsername !== username) {
                return res.status(403).json({ success: false, message: '用户名不匹配' });
            }

            const question = GameLogic.quiz.getRandomQuestion(questions, seen, questionIndex);
            if (!question) {
                return res.json({ success: false, message: '没有更多题目了' });
            }

            const token = GameLogic.generateToken(16);
            const signature = GameLogic.generateToken(16);

            // 存储问题信息
            if (!userSessions.has(username)) {
                userSessions.set(username, {});
            }
            userSessions.get(username)[token] = {
                questionId: question.id,
                timestamp: Date.now()
            };

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
        security.basicRateLimit,
        security.csrfProtection,
        async (req, res) => {
        try {
            const { username, answers = [] } = req.body;

            // 验证用户名与登录用户一致
            if (username !== req.session.user.username) {
                return res.status(403).json({ success: false, message: '用户名不匹配' });
            }

            let correctCount = 0;
            const userSession = userSessions.get(username) || {};

            for (const answer of answers) {
                const sessionData = userSession[answer.token];
                if (sessionData) {
                    const question = questionMap.get(sessionData.questionId);
                    if (question && GameLogic.quiz.validateAnswer(question, answer.answerIndex)) {
                        correctCount++;
                    }
                } else {
                    console.warn(`Missing session data for token: ${answer.token}, user: ${username}`);
                }
            }

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
                    const userSession = userSessions.get(username) || {};
                    const sessionData = userSession[answer.token];

                    if (sessionData) {
                        const question = questionMap.get(sessionData.questionId);
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
            if (Object.keys(userSession).length > 0) {
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

    app.post('/api/slot/play', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
        try {
            const { username, betAmount } = req.body;

            // 验证用户名
            if (username !== req.session.user.username) {
                return res.status(403).json({ success: false, message: '用户名不匹配' });
            }

            // 验证投注金额
            if (!betAmount || betAmount < 1 || betAmount > 1000) {
                return res.status(400).json({ success: false, message: '投注金额必须在1-1000电币之间' });
            }

            // 扣除投注电币
            const betResult = await BalanceLogger.updateBalance({
                username: username,
                amount: -betAmount,
                operationType: 'slot_bet',
                description: `老虎机投注：${betAmount} 电币`,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            });

            if (!betResult.success) {
                return res.status(400).json({ success: false, message: betResult.message });
            }

            const currentBalance = betResult.balance;

            // 生成游戏结果 - 5种结果各20%概率
            const outcomes = [
                { type: '不亏不赚', multiplier: 1.0 },
                { type: '×2', multiplier: 2.0 },
                { type: '归零', multiplier: 0.0 },
                { type: '×1.5', multiplier: 1.5 },
                { type: '×0.5', multiplier: 0.5 }
            ];

            const randomIndex = randomInt(0, 5);
            const outcome = outcomes[randomIndex];

            // 计算奖励
            const payout = Math.floor(betAmount * outcome.multiplier);

            // 生成三个金额转动结果（用于前端显示，保证显示与奖励一致）
            const baseAmounts = [50, 100, 150, 200];
            const amounts = baseAmounts.map((num) => Math.max(1, Math.round(num * betAmount / 100)));
            const randomAmount = () => amounts[randomInt(0, amounts.length)];
            const isLose = payout <= 0;
            let slotResults = isLose ? [randomAmount(), randomAmount(), randomAmount()] : [payout, payout, payout];
            if (isLose) {
                // 避免出现三格相同导致误判中奖
                while (slotResults[0] === slotResults[1] && slotResults[1] === slotResults[2]) {
                    slotResults = [randomAmount(), randomAmount(), randomAmount()];
                }
            }

            // 发放奖励电币
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
                    requireSufficientBalance: false
                });

                if (winResult.success) {
                    finalBalance = winResult.balance;
                }
            }

            // 存储游戏记录到slot_results表（记录金额转动结果）
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
                    JSON.stringify(slotResults), // result: 三个金额转动结果
                    outcome.type,                // won: 你现在存的是 outcome.type（先不动）
                    proof,
                    betAmount,                   // $5 bet_amount ✅
                    payout,                      // $6 payout_amount ✅
                    currentBalance + betAmount,  // $7 balance_before ✅（下注前余额）
                    finalBalance,                // $8 balance_after ✅
                    outcome.multiplier,          // $9 multiplier ✅
                    JSON.stringify({             // $10 game_details ✅
                        outcome: outcome.type,
                        amounts: slotResults,
                        won: payout > 0,
                        timestamp: new Date().toISOString()
                    })
                ]);
            } catch (dbError) {
                console.error('Slot游戏记录存储失败:', dbError);
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
            console.error('Slot play error:', error);
            res.status(500).json({ success: false, message: '游戏失败，请稍后重试' });
        }
    });

    // Scratch 刮刮乐游戏API
    app.post('/api/scratch/play', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
        try {
            const { username, tier, winCount } = req.body;

            // 验证用户名
            if (username !== req.session.user.username) {
                return res.status(403).json({ success: false, message: '用户名不匹配' });
            }

            // 验证档位参数 - 修复为正确的号码配置逻辑
            const validTiers = [
                { cost: 5, winCount: 5, userCount: 5 },    // 5元：5个中奖号码，5个我的号码
                { cost: 10, winCount: 5, userCount: 10 },  // 10元：5个中奖号码，10个我的号码
                { cost: 100, winCount: 5, userCount: 20 }  // 100元：5个中奖号码，20个我的号码
            ];

            const selectedTier = validTiers.find(t => t.cost === tier);
            if (!selectedTier) {
                return res.status(400).json({ success: false, message: '无效的游戏档位' });
            }

            // 扣除投注电币
            const betResult = await BalanceLogger.updateBalance({
                username: username,
                amount: -tier,
                operationType: 'scratch_bet',
                description: `刮刮乐投注：${tier} 电币 (${selectedTier.winCount}中奖+${selectedTier.userCount}我的)`,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            });

            if (!betResult.success) {
                return res.status(400).json({ success: false, message: betResult.message });
            }

            const currentBalance = betResult.balance;

            // 按用户要求的中奖梯度：
            // 5元：50%中5元，20%中10元，1%中20元，29%不中
            // 10元：50%中10元，20%中20元，1%中40元，29%不中
            // 100元：50%中100元，20%中200元，1%中400元，29%不中
            const random = randomInt(0, 10000) / 100; // 0-100的随机数
            let payout = 0;
            let outcomeType = '';

            if (random <= 50) {
                // 50% 概率中等额
                payout = tier;
                outcomeType = `中奖 ${tier} 电币`;
            } else if (random <= 70) {
                // 20% 概率中2倍
                payout = tier * 2;
                outcomeType = `大奖 ${payout} 电币`;
            } else if (random <= 71) {
                // 1% 概率中4倍
                payout = tier * 4;
                outcomeType = `超级大奖 ${payout} 电币`;
            } else {
                // 29% 概率不中
                payout = 0;
                outcomeType = '未中奖';
            }

            // 发放奖励电币
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
                    requireSufficientBalance: false
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
                    prize = `￥${tierRewards[randomInt(0, tierRewards.length)]}`;
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

            res.json({
                success: true,
                reward: payout,
                matches_count: matchedCount,
                winning_numbers: winningNumbers,
                slots: userSlots,
                balance: finalBalance
            });

        } catch (error) {
            console.error('Scratch play error:', error);
            res.status(500).json({ success: false, message: '游戏失败，请稍后重试' });
        }
    });

    // 合石头 Stone 游戏API
    app.get('/api/stone/state', requireLogin, requireAuthorized, security.basicRateLimit, async (req, res) => {
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

    app.post('/api/stone/add', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
        try {
            const username = req.session.user.username;
            const slots = await getStoneState(username);
            const beforeSlots = slots.slice();

            const emptyIndex = slots.findIndex((slot) => !slot);
            if (emptyIndex === -1) {
                return res.status(400).json({ success: false, message: '槽位已满' });
            }

            const balanceResult = await BalanceLogger.updateBalance({
                username,
                amount: -30,
                operationType: 'stone_add',
                description: '合石头：放入一颗石头',
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            });

            if (!balanceResult.success) {
                return res.status(400).json({ success: false, message: balanceResult.message });
            }

            slots[emptyIndex] = randomStoneColor();
            await saveStoneState(username, slots);
            await logStoneAction({
                username,
                actionType: 'add',
                cost: 30,
                beforeSlots,
                afterSlots: slots
            });

            res.json({
                success: true,
                slots,
                newBalance: balanceResult.balance
            });
        } catch (error) {
            console.error('Stone add error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.post('/api/stone/fill', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
        try {
            const username = req.session.user.username;
            const slots = await getStoneState(username);
            const beforeSlots = slots.slice();

            if (slots.every((slot) => slot)) {
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
                userAgent: req.get('User-Agent')
            });

            if (!balanceResult.success) {
                return res.status(400).json({ success: false, message: balanceResult.message });
            }

            const newSlots = slots.map((slot) => slot || randomStoneColor());
            await saveStoneState(username, newSlots);
            await logStoneAction({
                username,
                actionType: 'fill',
                cost,
                beforeSlots,
                afterSlots: newSlots
            });

            res.json({
                success: true,
                slots: newSlots,
                newBalance: balanceResult.balance
            });
        } catch (error) {
            console.error('Stone fill error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.post('/api/stone/replace', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
        try {
            const username = req.session.user.username;
            const index = Number(req.body.index);
            const slots = await getStoneState(username);
            const beforeSlots = slots.slice();

            if (!Number.isInteger(index) || index < 0 || index >= slots.length) {
                return res.status(400).json({ success: false, message: '槽位索引无效' });
            }

            if (!slots.every((slot) => slot)) {
                return res.status(400).json({ success: false, message: '槽位未满' });
            }

            const maxSame = getMaxSameCount(slots);
            const replaceCost = stoneReplaceCosts[maxSame];
            if (replaceCost === undefined) {
                return res.status(400).json({ success: false, message: '当前无法更换' });
            }

            const balanceResult = await BalanceLogger.updateBalance({
                username,
                amount: -replaceCost,
                operationType: 'stone_replace',
                description: `合石头：更换第${index + 1}颗石头`,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            });

            if (!balanceResult.success) {
                return res.status(400).json({ success: false, message: balanceResult.message });
            }

            const newSlots = slots.slice();
            newSlots[index] = randomStoneColor();
            await saveStoneState(username, newSlots);
            await logStoneAction({
                username,
                actionType: 'replace',
                cost: replaceCost,
                slotIndex: index,
                beforeSlots,
                afterSlots: newSlots
            });

            res.json({
                success: true,
                slots: newSlots,
                newBalance: balanceResult.balance
            });
        } catch (error) {
            console.error('Stone replace error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.post('/api/stone/redeem', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
        try {
            const username = req.session.user.username;
            const slots = await getStoneState(username);
            const beforeSlots = slots.slice();

            if (!slots.every((slot) => slot)) {
                return res.status(400).json({ success: false, message: '槽位未满' });
            }

            const maxSame = getMaxSameCount(slots);
            const reward = stoneRewards[maxSame] || 0;
            const newSlots = normalizeStoneSlots([]);

            await saveStoneState(username, newSlots);
            await logStoneAction({
                username,
                actionType: 'redeem',
                reward,
                beforeSlots,
                afterSlots: newSlots
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
                    requireSufficientBalance: false
                });

                if (!rewardResult.success) {
                    return res.status(400).json({ success: false, message: rewardResult.message });
                }

                newBalance = rewardResult.balance;
            } else {
                const balanceResult = await pool.query(
                    'SELECT balance FROM users WHERE username = $1',
                    [username]
                );
                newBalance = balanceResult.rows.length > 0 ? balanceResult.rows[0].balance : 0;
            }

            res.json({
                success: true,
                slots: newSlots,
                reward,
                newBalance
            });
        } catch (error) {
            console.error('Stone redeem error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    // 翻卡牌
    app.get('/api/flip/state', requireLogin, requireAuthorized, security.basicRateLimit, async (req, res) => {
        try {
            const username = req.session.user.username;
            const state = await getFlipState(username);
            const flips = state.flipped.filter(Boolean).length;
            const nextCost = flips < flipCosts.length ? flipCosts[flips] : null;
            const canFlip = !state.ended && flips < flipCosts.length;
            const cashoutReward = flipCashoutRewards[state.good_count] || 0;

            const boardTypes = Array.isArray(state.board) ? state.board : [];
            const flipped = Array.isArray(state.flipped) ? state.flipped : [];
            const board = boardTypes.map((type, index) => ({
                type,
                flipped: !!flipped[index]
            }));

            res.json({
                success: true,
                board,
                ended: state.ended,
                goodCount: state.good_count,
                badCount: state.bad_count,
                nextCost,
                canFlip,
                cashoutReward
            });
        } catch (error) {
            console.error('Flip state error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.post('/api/flip/start', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
        try {
            const username = req.session.user.username;
            const previousState = await getFlipState(username);
            const flips = previousState.flipped.filter(Boolean).length;
            let previousReward = 0;
            let newBalance = null;

            if (!previousState.ended && flips > 0 && previousState.good_count > 0) {
                previousReward = flipCashoutRewards[previousState.good_count] || 0;
                previousState.ended = true;
                await saveFlipState(username, previousState);

                if (previousReward > 0) {
                    const rewardResult = await BalanceLogger.updateBalance({
                        username,
                        amount: previousReward,
                        operationType: 'flip_cashout',
                        description: `翻卡牌开始新一轮自动结算 ${previousReward} 电币`,
                        ipAddress: req.ip,
                        userAgent: req.get('User-Agent'),
                        requireSufficientBalance: false
                    });

                    if (!rewardResult.success) {
                        return res.status(400).json({ success: false, message: rewardResult.message });
                    }
                    newBalance = rewardResult.balance;
                }

                await logFlipAction({
                    username,
                    actionType: 'end',
                    reward: previousReward,
                    goodCount: previousState.good_count,
                    badCount: previousState.bad_count,
                    ended: true
                });
            }

            const board = createFlipBoard();
            const flipped = Array(9).fill(false);
            const state = {
                board,
                flipped,
                good_count: 0,
                bad_count: 0,
                ended: false
            };
            await saveFlipState(username, state);

            res.json({
                success: true,
                nextCost: flipCosts[0],
                previousReward,
                previousGood: previousState.good_count,
                previousBad: previousState.bad_count,
                newBalance
            });
        } catch (error) {
            console.error('Flip start error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.post('/api/flip/flip', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
        try {
            const username = req.session.user.username;
            const cardIndex = Number(req.body.cardIndex);

            if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex > 8) {
                return res.status(400).json({ success: false, message: '卡牌索引无效' });
            }

            const state = await getFlipState(username);
            const flips = state.flipped.filter(Boolean).length;
            if (state.ended || flips >= flipCosts.length) {
                return res.status(400).json({ success: false, message: '本轮已结束' });
            }

            if (state.flipped[cardIndex]) {
                return res.status(400).json({ success: false, message: '该卡牌已翻开' });
            }

            const cost = flipCosts[flips];
            const balanceResult = await BalanceLogger.updateBalance({
                username,
                amount: -cost,
                operationType: 'flip_card',
                description: `翻卡牌：翻开第${flips + 1}张`,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            });

            if (!balanceResult.success) {
                return res.status(400).json({ success: false, message: balanceResult.message });
            }

            state.flipped[cardIndex] = true;
            const cardType = state.board[cardIndex];
            if (cardType === 'good') {
                state.good_count += 1;
            } else {
                state.bad_count += 1;
                state.ended = true;
            }

            let reward = 0;
            if (state.bad_count > 0) {
                reward = 50;
            } else if (state.good_count >= 7) {
                reward = 30000;
                state.ended = true;
            }

            if (reward > 0) {
                const rewardResult = await BalanceLogger.updateBalance({
                    username,
                    amount: reward,
                    operationType: 'flip_reward',
                    description: `翻卡牌奖励 ${reward} 电币`,
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent'),
                    requireSufficientBalance: false
                });

                if (!rewardResult.success) {
                    return res.status(400).json({ success: false, message: rewardResult.message });
                }
            }

            await saveFlipState(username, state);
            if (state.ended) {
                await logFlipAction({
                    username,
                    actionType: 'end',
                    reward,
                    goodCount: state.good_count,
                    badCount: state.bad_count,
                    ended: true
                });
            }

            res.json({
                success: true,
                cardIndex,
                cardType,
                goodCount: state.good_count,
                badCount: state.bad_count,
                ended: state.ended,
                reward,
                newBalance: balanceResult.balance + reward
            });
        } catch (error) {
            console.error('Flip card error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    app.post('/api/flip/cashout', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
        try {
            const username = req.session.user.username;
            const state = await getFlipState(username);

            if (state.ended) {
                return res.status(400).json({ success: false, message: '本轮已结束' });
            }

            if (state.bad_count > 0) {
                return res.status(400).json({ success: false, message: '坏牌已出现，无法退出' });
            }

            const reward = flipCashoutRewards[state.good_count] || 0;
            state.ended = true;
            await saveFlipState(username, state);

            const rewardResult = await BalanceLogger.updateBalance({
                username,
                amount: reward,
                operationType: 'flip_cashout',
                description: `翻卡牌退出奖励 ${reward} 电币`,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                requireSufficientBalance: false
            });

            if (!rewardResult.success) {
                return res.status(400).json({ success: false, message: rewardResult.message });
            }

            await logFlipAction({
                username,
                actionType: 'end',
                reward,
                goodCount: state.good_count,
                badCount: state.bad_count,
                ended: true
            });

            res.json({
                success: true,
                reward,
                newBalance: rewardResult.balance
            });
        } catch (error) {
            console.error('Flip cashout error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    // 决斗挑战 Duel 游戏API
    app.post('/api/duel/play', requireLogin, requireAuthorized, security.basicRateLimit, security.csrfProtection, async (req, res) => {
        try {
            const username = req.session.user.username;
            const giftType = req.body.giftType;
            const power = Number(req.body.power);

            if (!duelRewards[giftType]) {
                return res.status(400).json({ success: false, message: '无效的奖品档位' });
            }

            if (!Number.isFinite(power) || power < 1 || power > 80) {
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
                userAgent: req.get('User-Agent')
            });

            if (!balanceResult.success) {
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
                    requireSufficientBalance: false
                });

                if (!rewardResult.success) {
                    return res.status(400).json({ success: false, message: rewardResult.message });
                }

                newBalance = rewardResult.balance;
            }

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
            console.error('Duel play error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        }
    });

    // Spin API 路由
    app.post('/api/spin',
        security.basicRateLimit,
        security.csrfProtection,
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
