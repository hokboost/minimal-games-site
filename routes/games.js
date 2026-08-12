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
        calculateDuelCost,
        enqueueWishInventorySend
    } = deps;
    // 兜底，防止 security 中未提供特定中间件时报 undefined
    const userActionRateLimit = security.userActionRateLimit || ((req, res, next) => next());
    const basicRateLimit = security.basicRateLimit || ((req, res, next) => next());
    const csrfProtection = security.csrfProtection || ((req, res, next) => next());
    const { randomInt, randomBytes } = require('crypto');
    const fs = require('fs');
    const path = require('path');
    const randomFloat = () => randomInt(0, 1000000) / 1000000;
    const dictationHomophoneCache = {
        map: null
    };
    const dictationCharSetCache = {
        loaded: false,
        set: null
    };

    const toneMarkMap = new Map([
        ['ā', ['a', 1]], ['á', ['a', 2]], ['ǎ', ['a', 3]], ['à', ['a', 4]],
        ['ē', ['e', 1]], ['é', ['e', 2]], ['ě', ['e', 3]], ['è', ['e', 4]],
        ['ī', ['i', 1]], ['í', ['i', 2]], ['ǐ', ['i', 3]], ['ì', ['i', 4]],
        ['ō', ['o', 1]], ['ó', ['o', 2]], ['ǒ', ['o', 3]], ['ò', ['o', 4]],
        ['ū', ['u', 1]], ['ú', ['u', 2]], ['ǔ', ['u', 3]], ['ù', ['u', 4]],
        ['ǖ', ['v', 1]], ['ǘ', ['v', 2]], ['ǚ', ['v', 3]], ['ǜ', ['v', 4]],
        ['ń', ['n', 2]], ['ň', ['n', 3]], ['ǹ', ['n', 4]],
        ['ḿ', ['m', 2]]
    ]);

    const toneMarkToNumber = (raw) => {
        if (!raw) {
            return '';
        }
        let tone = 5;
        let base = '';
        for (const ch of String(raw)) {
            const mapped = toneMarkMap.get(ch);
            if (mapped) {
                base += mapped[0];
                tone = mapped[1];
                continue;
            }
            if (ch === 'ü') {
                base += 'v';
                continue;
            }
            if (/[a-z]/i.test(ch)) {
                base += ch.toLowerCase();
            }
        }
        if (!base) {
            return '';
        }
        return `${base}${tone}`;
    };

    const normalizeNumberSyllable = (raw) => {
        if (!raw) {
            return '';
        }
        const text = String(raw).trim().toLowerCase().replace(/ü/g, 'v');
        const match = text.match(/^([a-z]+)([1-5])$/);
        if (match) {
            return `${match[1]}${match[2]}`;
        }
        const letters = text.replace(/[^a-z]/g, '');
        if (!letters) {
            return '';
        }
        return `${letters}5`;
    };

    const getSyllableBase = (raw) => {
        const normalized = normalizeNumberSyllable(raw);
        if (!normalized) {
            return '';
        }
        return normalized.replace(/[1-5]$/, '');
    };

    const loadHomophoneMap = () => {
        if (dictationHomophoneCache.map) {
            return dictationHomophoneCache.map;
        }
        const fs = require('fs');
        let sourcePath = null;
        try {
            sourcePath = require.resolve('pinyin/lib/cjs/pinyin.js');
        } catch (error) {
            console.error('Homophone map resolve error:', error);
            dictationHomophoneCache.map = new Map();
            return dictationHomophoneCache.map;
        }
        let raw = '';
        try {
            raw = fs.readFileSync(sourcePath, 'utf8');
        } catch (error) {
            console.error('Homophone map read error:', error);
            dictationHomophoneCache.map = new Map();
            return dictationHomophoneCache.map;
        }
        const regex = /dict\[0x([0-9a-f]+)\] = "([^"]+)"/gi;
        const map = new Map();
        let match;
        while ((match = regex.exec(raw)) !== null) {
            const codepoint = Number.parseInt(match[1], 16);
            if (!Number.isFinite(codepoint)) {
                continue;
            }
            const char = String.fromCodePoint(codepoint);
            const pinyinList = String(match[2]).split(',');
            for (const entry of pinyinList) {
                const key = toneMarkToNumber(entry);
                if (!key) {
                    continue;
                }
                if (!map.has(key)) {
                    map.set(key, new Set());
                }
                map.get(key).add(char);
            }
        }
        const normalized = new Map();
        for (const [key, set] of map.entries()) {
            normalized.set(key, Array.from(set));
        }
        dictationHomophoneCache.map = normalized;
        return dictationHomophoneCache.map;
    };

    const loadDictationCharSet = () => {
        if (dictationCharSetCache.loaded) {
            return dictationCharSetCache.set;
        }
        dictationCharSetCache.loaded = true;
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(__dirname, '..', 'public', 'dictation', '8105.txt');
        if (!fs.existsSync(filePath)) {
            dictationCharSetCache.set = null;
            return dictationCharSetCache.set;
        }
        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            const chars = raw.replace(/\s+/g, '').split('');
            dictationCharSetCache.set = new Set(chars);
        } catch (error) {
            console.error('Dictation 8105 load error:', error);
            dictationCharSetCache.set = null;
        }
        return dictationCharSetCache.set;
    };

    const blindboxTiers = [
        { key: 'starmoon', nameZh: '星月盲盒', nameEn: 'Star Moon Box', cost: 50 },
        { key: 'heart', nameZh: '心动盲盒', nameEn: 'Heart Box', cost: 150 },
        { key: 'supreme', nameZh: '至尊盲盒', nameEn: 'Supreme Box', cost: 1000 }
    ];
    const blindboxCounts = [1, 10, 50];
    const blindboxConfigs = {
        starmoon: {
            cost: 50,
            items: [
                { giftId: '34999', name: '原地求婚', weight: 0.0002 },
                { giftId: '31122', name: '水晶球', weight: 0.0005 },
                { giftId: '33668', name: '啵啵', weight: 0.003 },
                { giftId: '31053', name: '告白花束', weight: 0.005 },
                { giftId: '34315', name: '喜欢你', weight: 0.0664 },
                { giftId: '31044', name: '情书', weight: 0.7249 },
                { giftId: '34500', name: '你真好看', weight: 0.2 }
            ]
        },
        heart: {
            cost: 150,
            items: [
                { giftId: '31028', name: '探索者启航', weight: 0.0004 },
                { giftId: '31122', name: '水晶球', weight: 0.02 },
                { giftId: '33668', name: '啵啵', weight: 0.05 },
                { giftId: '31053', name: '告白花束', weight: 0.184876 },
                { giftId: '34315', name: '喜欢你', weight: 0.544724 },
                { giftId: '31044', name: '情书', weight: 0.2 }
            ]
        },
        supreme: {
            cost: 1000,
            items: [
                { giftId: '34998', name: '小电视飞船', weight: 0.003 },
                { giftId: '34381', name: '飞屋环游', weight: 0.085 },
                { giftId: '31122', name: '水晶球', weight: 0.3 },
                { giftId: '33668', name: '啵啵', weight: 0.3162 },
                { giftId: '31053', name: '告白花束', weight: 0.2958 }
            ]
        }
    };

    const rejectWhenOverloaded = (req, res, next) => {
        // 等待队列过多时快速失败，防止池子耗尽
        if (pool.waitingCount > 30) {
            return res.status(503).json({ success: false, message: '服务器繁忙，请稍后重试' });
        }
        return next();
    };

    const blindboxGiftConfigPath = path.join(__dirname, '..', 'gift-codes.json');

    const loadBlindboxGiftMap = () => {
        const raw = fs.readFileSync(blindboxGiftConfigPath, 'utf8');
        const config = JSON.parse(raw);
        const poolConfig = config.礼物池配置 || {};
        return Object.entries(poolConfig).reduce((acc, [giftId, info]) => {
            const name = Array.isArray(info) ? info[0] : info?.name;
            const value = Array.isArray(info) ? info[1] : info?.value;
            acc[giftId] = {
                name: name || giftId,
                value: Number(value) || 0
            };
            return acc;
        }, {});
    };

    const buildBlindboxPool = (tierConfig) => {
        const giftMap = loadBlindboxGiftMap();
        return (tierConfig.items || []).map((item) => ({
            giftId: String(item.giftId),
            name: item.name || giftMap[item.giftId]?.name || String(item.giftId),
            value: Number(giftMap[item.giftId]?.value) || 0,
            weight: Number(item.weight) || 0
        })).filter((item) => item.giftId && item.weight > 0);
    };

    const pickBlindboxReward = (pool) => {
        const totalWeight = pool.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
        if (totalWeight <= 0) {
            return null;
        }
        const roll = randomFloat() * totalWeight;
        let acc = 0;
        for (const item of pool) {
            acc += Number(item.weight) || 0;
            if (roll <= acc) {
                return item;
            }
        }
        return pool[pool.length - 1] || null;
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

        // 获取用户积分余额
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

    // Quiz 开始游戏 API - 扣除积分 + 创建付费会话
    app.post('/api/quiz/start', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            const { username } = req.body;

            // 验证用户名
            if (username !== req.session.user.username) {
                return res.status(403).json({ success: false, message: '用户名不匹配' });
            }

            await client.query('BEGIN');
            await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`quiz:${username}`]);
            const balanceResult = await BalanceLogger.updateBalance({
                username,
                amount: -10,
                operationType: 'quiz_start',
                description: '开始答题游戏',
                ipAddress: req.clientIP,
                userAgent: req.get('User-Agent'),
                client,
                managedTransaction: true
            });

            if (!balanceResult.success) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: balanceResult.message });
            }

            const sessionId = GameLogic.generateToken(16);
            await client.query(`
                UPDATE quiz_sessions
                SET status = 'replaced', settled_at = NOW()
                WHERE username = $1 AND status = 'active'
            `, [username]);
            await client.query(`
                INSERT INTO quiz_sessions (id, username, status, created_at, expires_at)
                VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '20 minutes')
            `, [sessionId, username]);
            await client.query('COMMIT');

            req.session.quizSessionId = sessionId;

            res.json({
                success: true,
                message: '游戏开始，已扣除10积分',
                newBalance: balanceResult.balance,
                quizSessionId: sessionId
            });
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('Quiz start error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
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

    app.get('/blindbox', requireLogin, requireAuthorized, basicRateLimit, async (req, res) => {
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

            res.render('blindbox', {
                username,
                balance,
                tiers: blindboxTiers,
                counts: blindboxCounts,
                blindboxConfigs,
                csrfToken: req.session.csrfToken
            });
        } catch (error) {
            console.error('Blindbox page error:', error);
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
        async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            const { username: requestUsername } = req.body;
            const username = req.session.user.username;
            if (requestUsername && requestUsername !== username) {
                return res.status(403).json({ success: false, message: '用户名不匹配' });
            }

            let quizSessionId = req.session.quizSessionId;
            if (!quizSessionId) {
                const activeSession = await client.query(`
                    SELECT id
                    FROM quiz_sessions
                    WHERE username = $1
                      AND status = 'active'
                      AND expires_at > NOW()
                    ORDER BY created_at DESC
                    LIMIT 1
                `, [username]);
                quizSessionId = activeSession.rows[0]?.id || null;
                if (quizSessionId) req.session.quizSessionId = quizSessionId;
            }
            if (!quizSessionId) {
                return res.status(403).json({ success: false, message: '未找到有效答题会话，请先开始游戏' });
            }

            await client.query('BEGIN');
            await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`quiz-next:${quizSessionId}`]);
            const sessionResult = await client.query(`
                SELECT status, expires_at
                FROM quiz_sessions
                WHERE id = $1 AND username = $2
                FOR UPDATE
            `, [quizSessionId, username]);
            const sessionData = sessionResult.rows[0];
            if (!sessionData) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, message: '未找到有效答题会话，请先开始游戏' });
            }
            if (sessionData.status !== 'active' || new Date(sessionData.expires_at) <= new Date()) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, message: '答题会话无效或已过期，请重新开始' });
            }

            const issuedTokens = await client.query(
                'SELECT question_id FROM quiz_question_tokens WHERE session_id = $1 ORDER BY created_at',
                [quizSessionId]
            );
            if (issuedTokens.rows.length >= 15) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '题目数量已达上限，请提交答案' });
            }

            const serverSeen = issuedTokens.rows
                .map((row) => Number(row.question_id))
                .filter(Number.isInteger);
            const question = GameLogic.quiz.getRandomQuestion(questions, serverSeen, issuedTokens.rows.length);
            if (!question) {
                await client.query('ROLLBACK');
                return res.json({ success: false, message: '没有更多题目了' });
            }

            const token = GameLogic.generateToken(16);
            const signature = GameLogic.generateToken(16);
            await client.query(`
                INSERT INTO quiz_question_tokens (token, session_id, question_id, created_at)
                VALUES ($1, $2, $3, NOW())
            `, [token, quizSessionId, question.id]);
            await client.query('COMMIT');

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
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('Quiz next error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    app.post('/api/quiz/submit',
        requireLogin,
        requireAuthorized,
        basicRateLimit,
        csrfProtection,
        async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            const { username, answers = [] } = req.body;

            if (username !== req.session.user.username) {
                return res.status(403).json({ success: false, message: '用户名不匹配' });
            }
            if (!Array.isArray(answers) || answers.length < 1 || answers.length > 15) {
                return res.status(400).json({ success: false, message: '答案数量无效' });
            }

            const normalizedAnswers = [];
            const submittedTokens = new Set();
            for (const answer of answers) {
                const token = typeof answer?.token === 'string' ? answer.token : '';
                const answerIndex = Number(answer?.answerIndex);
                if (!token || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 20) {
                    return res.status(400).json({ success: false, message: '答案格式无效' });
                }
                if (submittedTokens.has(token)) {
                    return res.status(400).json({ success: false, message: 'Token重复使用，疑似作弊' });
                }
                submittedTokens.add(token);
                normalizedAnswers.push({ token, answerIndex });
            }

            let quizSessionId = req.session.quizSessionId;
            if (!quizSessionId) {
                const activeSession = await client.query(`
                    SELECT id
                    FROM quiz_sessions
                    WHERE username = $1
                      AND status = 'active'
                      AND expires_at > NOW()
                    ORDER BY created_at DESC
                    LIMIT 1
                `, [username]);
                quizSessionId = activeSession.rows[0]?.id || null;
                if (quizSessionId) req.session.quizSessionId = quizSessionId;
            }
            if (!quizSessionId) {
                return res.status(403).json({ success: false, message: '未找到有效答题会话，请先开始游戏' });
            }

            await client.query('BEGIN');
            const sessionResult = await client.query(`
                SELECT status, expires_at
                FROM quiz_sessions
                WHERE id = $1 AND username = $2
                FOR UPDATE
            `, [quizSessionId, username]);
            const sessionData = sessionResult.rows[0];
            if (!sessionData) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, message: '未找到有效答题会话，请先开始游戏' });
            }
            if (sessionData.status !== 'active') {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, message: '答题会话无效或已结算' });
            }
            if (new Date(sessionData.expires_at) <= new Date()) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, message: '答题会话已过期，请重新开始' });
            }

            const tokenResult = await client.query(`
                SELECT token, question_id
                FROM quiz_question_tokens
                WHERE session_id = $1
                  AND token = ANY($2::text[])
                  AND consumed_at IS NULL
                FOR UPDATE
            `, [quizSessionId, Array.from(submittedTokens)]);
            if (tokenResult.rows.length !== normalizedAnswers.length) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    message: '存在无效或已使用的题目令牌'
                });
            }

            const tokensByValue = new Map(tokenResult.rows.map((row) => [row.token, row]));
            let correctCount = 0;
            const answerDetails = [];
            for (const answer of normalizedAnswers) {
                const tokenData = tokensByValue.get(answer.token);
                const question = questionMap.get(Number(tokenData.question_id));
                if (!question || answer.answerIndex >= question.options.length) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ success: false, message: '题目或答案无效' });
                }
                const isCorrect = GameLogic.quiz.validateAnswer(question, answer.answerIndex);
                if (isCorrect) correctCount += 1;
                answerDetails.push({ question, answerIndex: answer.answerIndex, isCorrect });
            }

            const crypto = require('crypto');
            const proof = crypto.createHash('sha256')
                .update(`${username}-${Date.now()}-${randomBytes(8).toString('hex')}`)
                .digest('hex');
            const submissionResult = await client.query(
                'INSERT INTO submissions (username, score, submitted_at, proof) VALUES ($1, $2, NOW(), $3) RETURNING id',
                [username, correctCount, proof]
            );
            const submissionId = submissionResult.rows[0].id;

            for (const detail of answerDetails) {
                await client.query(
                    `INSERT INTO submission_details (
                        submission_id, question_id, user_answer, is_correct, correct_answer
                    ) VALUES ($1, $2, $3, $4, $5)`,
                    [
                        submissionId,
                        detail.question.id,
                        detail.question.options[detail.answerIndex],
                        detail.isCorrect,
                        detail.question.options[detail.question.correct]
                    ]
                );
            }

            const reward = correctCount * 2;
            let newBalance;

            if (reward > 0) {
                const balanceResult = await BalanceLogger.updateBalance({
                    username,
                    amount: reward,
                    operationType: 'quiz_reward',
                    description: `答题奖励：${correctCount}题正确 × 2积分`,
                    gameData: {
                        score: correctCount,
                        total: normalizedAnswers.length,
                        reward
                    },
                    ipAddress: req.clientIP,
                    userAgent: req.get('User-Agent'),
                    requireSufficientBalance: false,
                    client,
                    managedTransaction: true
                });

                if (!balanceResult.success) {
                    await client.query('ROLLBACK');
                    return res.status(503).json({ success: false, message: balanceResult.message || '奖励入账失败' });
                }
                newBalance = balanceResult.balance;
            } else {
                const balanceResult = await client.query(
                    'SELECT balance FROM users WHERE username = $1',
                    [username]
                );
                newBalance = Number(balanceResult.rows[0]?.balance || 0);
            }

            await client.query(
                'UPDATE quiz_question_tokens SET consumed_at = NOW() WHERE session_id = $1 AND token = ANY($2::text[])',
                [quizSessionId, Array.from(submittedTokens)]
            );
            await client.query(
                "UPDATE quiz_sessions SET status = 'settled', settled_at = NOW() WHERE id = $1",
                [quizSessionId]
            );
            await client.query('COMMIT');
            req.session.quizSessionId = null;

            res.json({
                success: true,
                score: correctCount,
                total: normalizedAnswers.length,
                reward,
                newBalance,
                proof
            });
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('Quiz submit error:', error);
            res.status(500).json({ success: false, message: '提交失败' });
        } finally {
            client?.release();
        }
    });

    // Quiz 排行榜 API
    app.get('/api/quiz/leaderboard', requireLogin, requireAuthorized, async (req, res) => {
        try {
            // Show each account's best score for the current Shanghai calendar day.
            const result = await pool.query(`
                SELECT username, score, submitted_at
                FROM (
                    SELECT DISTINCT ON (s.username)
                           s.username, s.score, s.submitted_at::timestamptz AS submitted_at
                    FROM submissions s
                    JOIN users u ON u.username = s.username
                    WHERE s.submitted_at::timestamptz >= date_trunc('day', NOW())
                      AND s.submitted_at::timestamptz < date_trunc('day', NOW()) + INTERVAL '1 day'
                    ORDER BY s.username, s.score DESC, s.submitted_at::timestamptz ASC
                ) ranked
                ORDER BY score DESC, submitted_at ASC
                LIMIT 20
            `);

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
            const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
            const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
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
            const username = req.session.user?.username || '';
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const pendingResult = await client.query(
                    `SELECT level, set_id
                     FROM dictation_submissions
                     WHERE username = $1 AND status = 'pending'
                     ORDER BY created_at DESC
                     LIMIT 1
                     FOR UPDATE`,
                    [username]
                );
                if (pendingResult.rows.length) {
                    const pending = pendingResult.rows[0];
                    await client.query('COMMIT');
                    return res.json({
                        success: true,
                        message: '继续等待审核',
                        level: Number(pending.level || 1),
                        setId: pending.set_id !== null ? Number(pending.set_id) : null
                    });
                }

                let level = 1;
                let setId = null;
                let sessionId = null;
                let consumeAttempt = false;
                await client.query(
                    `INSERT INTO dictation_progress (username, level)
                     VALUES ($1, 1)
                     ON CONFLICT (username) DO NOTHING`,
                    [username]
                );
                const progressResult = await client.query(
                    'SELECT level, set_id, session_id FROM dictation_progress WHERE username = $1 FOR UPDATE',
                    [username]
                );
                if (progressResult.rows.length) {
                    level = Number(progressResult.rows[0].level || 1);
                    setId = progressResult.rows[0].set_id !== null ? Number(progressResult.rows[0].set_id) : null;
                    sessionId = progressResult.rows[0].session_id || null;
                }

                if (level > 1 && !Number.isFinite(setId)) {
                    const latestSubmission = await client.query(
                        `SELECT set_id, session_id
                         FROM dictation_submissions
                         WHERE username = $1 AND set_id IS NOT NULL
                         ORDER BY created_at DESC
                         LIMIT 1
                         FOR UPDATE`,
                        [username]
                    );
                    if (latestSubmission.rows.length) {
                        setId = Number(latestSubmission.rows[0].set_id);
                        if (!sessionId) {
                            sessionId = latestSubmission.rows[0].session_id || null;
                        }
                    }
                }
                if (level > 1 && !Number.isFinite(setId)) {
                    const latestSession = await client.query(
                        `SELECT id, set_id
                         FROM dictation_sessions
                         WHERE username = $1
                         ORDER BY started_at DESC
                         LIMIT 1
                         FOR UPDATE`,
                        [username]
                    );
                    if (latestSession.rows.length) {
                        setId = Number(latestSession.rows[0].set_id);
                        if (!sessionId) {
                            sessionId = latestSession.rows[0].id;
                        }
                    }
                }

                if (!Number.isFinite(level) || level < 1) {
                    level = 1;
                } else if (level > 3) {
                    level = 3;
                }

                if (level === 1 || !setId) {
                    const fs = require('fs');
                    const path = require('path');
                    const filePath = path.join(__dirname, '..', 'public', 'dictation', 'words.json');
                    const raw = await fs.promises.readFile(filePath, 'utf8');
                    const data = JSON.parse(raw);
                    const setIds = Array.from(new Set(data.map((item) => Number(item.set_id || 1))))
                        .filter((v) => Number.isFinite(v));
                    if (setIds.length === 0) {
                        await client.query('ROLLBACK');
                        return res.status(500).json({ success: false, message: '题库未配置' });
                    }
                    const orderedSetIds = setIds.slice().sort((a, b) => a - b);
                    const inProgress = await client.query(
                        `SELECT id, set_id
                         FROM dictation_sessions
                         WHERE username = $1 AND result = 'in_progress'
                         ORDER BY started_at DESC
                         LIMIT 1
                         FOR UPDATE`,
                        [username]
                    );
                    if (inProgress.rows.length) {
                        setId = Number(inProgress.rows[0].set_id);
                        sessionId = inProgress.rows[0].id;
                    }
                    if (!Number.isFinite(setId)) {
                        let lastCompletedId = null;
                        const completed = await client.query(
                            `SELECT set_id
                             FROM dictation_sessions
                             WHERE username = $1 AND result IN ('passed', 'failed')
                             ORDER BY ended_at DESC NULLS LAST, started_at DESC
                             LIMIT 1`,
                            [username]
                        );
                        if (completed.rows.length) {
                            lastCompletedId = Number(completed.rows[0].set_id);
                        }
                        if (Number.isFinite(lastCompletedId)) {
                            const index = orderedSetIds.indexOf(lastCompletedId);
                            const nextIndex = index >= 0 ? (index + 1) % orderedSetIds.length : 0;
                            setId = orderedSetIds[nextIndex];
                        } else {
                            setId = orderedSetIds[0];
                        }
                    }
                    if (!sessionId) {
                        const sessionResult = await client.query(
                            'INSERT INTO dictation_sessions (username, set_id, started_at, result) VALUES ($1, $2, NOW(), $3) RETURNING id',
                            [username, setId, 'in_progress']
                        );
                        sessionId = sessionResult.rows[0].id;
                        consumeAttempt = level === 1;
                    }
                }

                await client.query(
                    'UPDATE dictation_progress SET level = $1, set_id = $2, session_id = $3, updated_at = NOW() WHERE username = $4',
                    [level, setId, sessionId, username]
                );

                if (consumeAttempt) {
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
                }
                await client.query('COMMIT');

                res.json({ success: true, message: '开始成功', level, setId });
            } catch (error) {
                await client.query('ROLLBACK').catch(() => {});
                throw error;
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('Dictation start error:', error);
            res.status(500).json({ success: false, message: '开始失败' });
        }
    });

    app.get('/api/dictation/latest-status', requireLogin, requireAuthorized, basicRateLimit, async (req, res) => {
        try {
            const username = req.session.user?.username || '';
            const result = await pool.query(
                `SELECT status, level, word, set_id, admin_message
                 FROM dictation_submissions
                 WHERE username = $1
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [username]
            );
            if (!result.rows.length) {
                return res.json({ success: true, status: null });
            }
            const row = result.rows[0];
            res.json({
                success: true,
                status: row.status || null,
                level: Number(row.level || 1),
                word: row.word || null,
                setId: row.set_id !== null ? Number(row.set_id) : null,
                adminMessage: row.admin_message || null
            });
        } catch (error) {
            console.error('Dictation latest status error:', error);
            res.status(500).json({ success: false, message: '获取状态失败' });
        }
    });

    app.get('/api/dictation/progress', requireLogin, requireAuthorized, basicRateLimit, async (req, res) => {
        try {
            const username = req.session.user?.username || '';
            const result = await pool.query(
                'SELECT level, set_id FROM dictation_progress WHERE username = $1',
                [username]
            );
            if (!result.rows.length) {
                return res.json({ success: true, level: 1, setId: null });
            }
            const row = result.rows[0];
            res.json({
                success: true,
                level: Number(row.level || 1),
                setId: row.set_id !== null ? Number(row.set_id) : null
            });
        } catch (error) {
            console.error('Dictation progress error:', error);
            res.status(500).json({ success: false, message: '获取进度失败' });
        }
    });

    app.post('/api/dictation/retry',
        rejectWhenOverloaded,
        requireLogin,
        requireAuthorized,
        basicRateLimit,
        userActionRateLimit,
        csrfProtection,
        async (req, res) => {
        try {
            const username = req.session.user?.username || '';
            const latest = await pool.query(
                `SELECT status
                 FROM dictation_submissions
                 WHERE username = $1
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [username]
            );
            if (!latest.rows.length || latest.rows[0].status !== 'rewrite') {
                return res.status(403).json({ success: false, message: '当前不支持重写' });
            }
            const progressResult = await pool.query(
                'SELECT level FROM dictation_progress WHERE username = $1',
                [username]
            );
            const level = progressResult.rows.length ? Number(progressResult.rows[0].level || 1) : 1;
            res.json({ success: true, level });
        } catch (error) {
            console.error('Dictation retry error:', error);
            res.status(500).json({ success: false, message: '开始失败' });
        }
    });

    app.get('/api/dictation/words', requireLogin, requireAuthorized, basicRateLimit, async (req, res) => {
        try {
            const fs = require('fs');
            const path = require('path');
            const filePath = path.join(__dirname, '..', 'public', 'dictation', 'words.json');
            const raw = await fs.promises.readFile(filePath, 'utf8');
            const data = JSON.parse(raw);
            const homophoneMap = loadHomophoneMap();
            const dictationCharSet = loadDictationCharSet();
            const words = data.map((item) => {
                const pronunciation = typeof item.pronunciation === 'string' ? item.pronunciation.trim() : '';
                const syllables = pronunciation ? pronunciation.split(/\s+/) : [];
                const homophones = syllables.map((syllable) => {
                    const base = getSyllableBase(syllable);
                    if (!base) {
                        return [];
                    }
                    const merged = new Set();
                    for (let tone = 1; tone <= 5; tone += 1) {
                        const key = `${base}${tone}`;
                        const list = homophoneMap.get(key) || [];
                        list.forEach((char) => merged.add(char));
                    }
                    let result = Array.from(merged);
                    if (dictationCharSet) {
                        result = result.filter((char) => dictationCharSet.has(char));
                    }
                    return result;
                });
                return {
                    ...item,
                    homophones
                };
            });
            res.json({ success: true, words });
        } catch (error) {
            console.error('Dictation words load error:', error);
            res.status(500).json({ success: false, message: '加载听写词库失败' });
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
        let imageDiskPath = null;
        try {
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
            const imageData = req.body?.imageData;

            if (!wordId) {
                return res.status(400).json({ success: false, message: '缺少题目信息' });
            }
            if (!userInput) {
                return res.status(400).json({ success: false, message: '请先选择答案' });
            }

            const userId = req.session.user?.id || null;
            const username = req.session.user?.username || '';
            let level = 1;
            let setId = null;
            let sessionId = null;
            let correctWord = '';
            const progressResult = await pool.query(
                'SELECT level, set_id, session_id FROM dictation_progress WHERE username = $1',
                [username]
            );
            if (progressResult.rows.length) {
                level = Number(progressResult.rows[0].level || 1);
                setId = progressResult.rows[0].set_id !== null ? Number(progressResult.rows[0].set_id) : null;
                sessionId = progressResult.rows[0].session_id || null;
            }

            const fs = require('fs');
            const path = require('path');
            const wordsPath = path.join(__dirname, '..', 'public', 'dictation', 'words.json');
            const raw = await fs.promises.readFile(wordsPath, 'utf8');
            const data = JSON.parse(raw);
            const matched = data.find((item) => String(item.id) === String(wordId));
            if (!matched || typeof matched.word !== 'string') {
                return res.status(400).json({ success: false, message: '题目不存在' });
            }
            const matchedSetId = Number(matched.set_id);
            const setWords = data.filter((item) => Number(item.set_id) === matchedSetId);
            const matchedLevel = setWords.findIndex((item) => String(item.id) === String(wordId)) + 1;
            if (!sessionId || matchedSetId !== setId || matchedLevel !== level) {
                return res.status(409).json({ success: false, message: '题目与当前听写进度不匹配' });
            }
            correctWord = matched.word.trim();
            const normalizeAnswer = (value) => String(value || '').replace(/\s+/g, '');
            const normalizedInput = normalizeAnswer(userInput);
            const normalizedWord = normalizeAnswer(correctWord);
            const isCorrect = normalizedInput && normalizedWord && normalizedInput === normalizedWord;
            const status = isCorrect ? 'correct' : 'wrong';
            const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'dictation');
            let imagePath = null;
            if (imageData && typeof imageData === 'string' && imageData.startsWith('data:image/png;base64,')) {
                const base64Data = imageData.slice('data:image/png;base64,'.length);
                if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64Data)) {
                    return res.status(400).json({ success: false, message: '图片数据无效' });
                }
                const imageBuffer = Buffer.from(base64Data, 'base64');
                const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
                if (imageBuffer.length === 0 || imageBuffer.length > 1.5 * 1024 * 1024 ||
                    imageBuffer.length < pngSignature.length ||
                    !imageBuffer.subarray(0, pngSignature.length).equals(pngSignature)) {
                    return res.status(400).json({ success: false, message: '仅支持不超过 1.5MB 的 PNG 图片' });
                }
                await fs.promises.mkdir(uploadDir, { recursive: true });
                const filename = `${Date.now()}_${randomBytes(12).toString('hex')}.png`;
                const filePath = path.join(uploadDir, filename);
                await fs.promises.writeFile(filePath, imageBuffer, { flag: 'wx', mode: 0o600 });
                imageDiskPath = filePath;
                imagePath = `/uploads/dictation/${filename}`;
            }

            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const lockedProgress = await client.query(
                    'SELECT level, set_id, session_id FROM dictation_progress WHERE username = $1 FOR UPDATE',
                    [username]
                );
                const currentProgress = lockedProgress.rows[0];
                if (!currentProgress
                    || Number(currentProgress.level) !== level
                    || Number(currentProgress.set_id) !== setId
                    || String(currentProgress.session_id) !== String(sessionId)) {
                    await client.query('ROLLBACK');
                    if (imageDiskPath) await fs.promises.unlink(imageDiskPath).catch(() => {});
                    return res.status(409).json({ success: false, message: '听写进度已变化，请刷新后重试' });
                }
                const activeSession = await client.query(`
                    SELECT id
                    FROM dictation_sessions
                    WHERE id = $1 AND username = $2 AND set_id = $3 AND result = 'in_progress'
                    FOR UPDATE
                `, [sessionId, username, setId]);
                if (activeSession.rows.length === 0) {
                    await client.query('ROLLBACK');
                    if (imageDiskPath) await fs.promises.unlink(imageDiskPath).catch(() => {});
                    return res.status(409).json({ success: false, message: '听写会话已结束' });
                }
                const previousSubmission = await client.query(`
                    SELECT status
                    FROM dictation_submissions
                    WHERE username = $1 AND session_id = $2 AND level = $3
                    ORDER BY created_at DESC
                    LIMIT 1
                    FOR UPDATE
                `, [username, sessionId, level]);
                if (previousSubmission.rows.length > 0 && previousSubmission.rows[0].status !== 'rewrite') {
                    await client.query('ROLLBACK');
                    if (imageDiskPath) await fs.promises.unlink(imageDiskPath).catch(() => {});
                    return res.status(409).json({ success: false, message: '本关答案已提交' });
                }
                await client.query(
                    `INSERT INTO dictation_submissions
                        (user_id, username, word_id, word, pronunciation, definition, user_input, status, level, set_id, session_id, image_path, ip_address, user_agent)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
                    [
                        userId,
                        username,
                        wordId,
                        correctWord || null,
                        typeof matched.pronunciation === 'string' ? matched.pronunciation.slice(0, 120) : null,
                        typeof matched.definition === 'string' ? matched.definition.slice(0, 400) : null,
                        userInput,
                        status,
                        Number.isFinite(level) ? level : 1,
                        Number.isFinite(setId) ? setId : null,
                        sessionId || null,
                        imagePath,
                        req.clientIP,
                        req.get('User-Agent')
                    ]
                );

                if (username) {
                    let nextLevel = 1;
                    if (status === 'correct') {
                        nextLevel = Math.min(Math.max(Number(level || 1), 1) + 1, 3);
                    }
                    const progressUpdate = await client.query(
                        'UPDATE dictation_progress SET level = $1, set_id = $2, session_id = $3, updated_at = NOW() WHERE username = $4',
                        [nextLevel, setId, sessionId, username]
                    );
                    if (progressUpdate.rowCount === 0) {
                        await client.query(
                            'INSERT INTO dictation_progress (username, level, set_id, session_id) VALUES ($1, $2, $3, $4)',
                            [username, nextLevel, setId, sessionId]
                        );
                    }

                    if (sessionId) {
                        let sessionResult = null;
                        if (status === 'wrong') {
                            sessionResult = 'failed';
                        } else if (status === 'correct' && level >= 3) {
                            sessionResult = 'passed';
                        }
                        if (sessionResult) {
                            await client.query(
                                'UPDATE dictation_sessions SET result = $1, ended_at = NOW() WHERE id = $2',
                                [sessionResult, sessionId]
                            );
                            await client.query(
                                'UPDATE dictation_progress SET level = 1, set_id = NULL, session_id = NULL, updated_at = NOW() WHERE username = $1',
                                [username]
                            );
                        }
                    }
                }

                await client.query('COMMIT');
            } catch (txError) {
                await client.query('ROLLBACK').catch(() => {});
                if (imageDiskPath) await fs.promises.unlink(imageDiskPath).catch(() => {});
                throw txError;
            } finally {
                client.release();
            }

            res.json({ success: true, message: isCorrect ? '自动审核通过' : '自动审核未通过', status });
        } catch (error) {
            if (imageDiskPath) {
                const fs = require('fs');
                await fs.promises.unlink(imageDiskPath).catch(() => {});
            }
            console.error('Dictation submit error:', error);
            res.status(500).json({ success: false, message: '提交失败' });
        }
    });


    app.post('/api/slot/play', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            const { username, betAmount } = req.body;
            const betValue = Number(betAmount);

            if (username !== req.session.user.username) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, message: '用户名不匹配' });
            }

            if (!Number.isFinite(betValue) || !Number.isInteger(betValue) || betValue < 1 || betValue > 1000) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '投注金额必须在1-1000积分之间' });
            }

            const betResult = await BalanceLogger.updateBalance({
                username: username,
                amount: -betValue,
                operationType: 'slot_bet',
                description: `老虎机投注：${betValue} 积分`,
                ipAddress: req.clientIP,
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
                    description: `老虎机中奖：${outcome.type}，获得 ${payout} 积分`,
                    gameData: {
                        bet_amount: betAmount,
                        outcome: outcome.type,
                        multiplier: outcome.multiplier,
                        payout: payout
                    },
                    ipAddress: req.clientIP,
                    userAgent: req.get('User-Agent'),
                    requireSufficientBalance: false,
                    client,
                    managedTransaction: true
                });

                if (!winResult.success) {
                    await client.query('ROLLBACK');
                    return res.status(503).json({ success: false, message: winResult.message || '奖励入账失败' });
                }
                finalBalance = winResult.balance;
            }

            const crypto = require('crypto');
            const proof = crypto.createHash('sha256')
                .update(`${username}-${Date.now()}-${randomBytes(8).toString('hex')}`)
                .digest('hex');
            await client.query(`
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
                betResult.balanceBefore,
                finalBalance,
                outcome.multiplier,
                JSON.stringify({
                    outcome: outcome.type,
                    amounts: slotResults,
                    won: payout > 0,
                    timestamp: new Date().toISOString()
                })
            ]);

            await client.query('COMMIT');

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
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('Slot play error:', error);
            res.status(500).json({ success: false, message: '游戏失败，请稍后重试' });
        } finally {
            client?.release();
        }
    });
    // Scratch 刮刮乐游戏API
    // Scratch 刮刮乐游戏API
    app.post('/api/scratch/play', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            const { username } = req.body;
            const tier = Number(req.body.tier);

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
                description: `刮刮乐投注：${tier} 积分 (${selectedTier.winCount}中奖+${selectedTier.userCount}我的)`,
                ipAddress: req.clientIP,
                userAgent: req.get('User-Agent'),
                client,
                managedTransaction: true
            });

            if (!betResult.success) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: betResult.message });
            }

            const currentBalance = betResult.balance;

            const random = randomInt(0, 10000);
            let payout = 0;
            let outcomeType = '';

            if (random < 5000) {
                payout = tier;
                outcomeType = `中奖 ${tier} 积分`;
            } else if (random < 7000) {
                payout = tier * 2;
                outcomeType = `大奖 ${payout} 积分`;
            } else if (random < 7100) {
                payout = tier * 4;
                outcomeType = `超级大奖 ${payout} 积分`;
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
                    description: `刮刮乐中奖：${outcomeType}，获得 ${payout} 积分`,
                    gameData: {
                        tier: tier,
                        outcome: outcomeType,
                        payout: payout,
                        tier_config: selectedTier
                    },
                    ipAddress: req.clientIP,
                    userAgent: req.get('User-Agent'),
                    requireSufficientBalance: false,
                    client,
                    managedTransaction: true
                });

                if (!winResult.success) {
                    await client.query('ROLLBACK');
                    return res.status(503).json({ success: false, message: winResult.message || '奖励入账失败' });
                }
                finalBalance = winResult.balance;
            }

            // 生成刮刮乐显示内容 - 修复为正确的号码配置
            const winningNumbers = [];
            while (winningNumbers.length < selectedTier.winCount) {
                const candidate = randomInt(1, 101);
                if (!winningNumbers.includes(candidate)) winningNumbers.push(candidate);
            }

            // 生成我的号码区域 - 修复中奖金额显示逻辑
            const userSlots = [];
            let matchedCount = 0;

            // 定义奖励金额梯度
            const rewardAmounts = {
                5: [5, 10, 15, 20, 25, 30, 50],     // 5积分档位奖励
                10: [10, 20, 30, 40, 50, 80, 100],  // 10积分档位奖励
                100: [100, 200, 300, 500, 800, 1000, 1500] // 100积分档位奖励
            };

            const tierRewards = rewardAmounts[tier] || [tier, tier * 2, tier * 3, tier * 4, tier * 5, tier * 8, tier * 10];

            for (let i = 0; i < selectedTier.userCount; i++) {
                let num;
                let prize;

                // 如果应该中奖且还没有匹配号码
                if (payout > 0 && matchedCount === 0) {
                    num = winningNumbers[randomInt(0, winningNumbers.length)];
                    prize = `${payout} 积分`; // 使用实际中奖金额
                    matchedCount++;
                } else {
                    do {
                        num = randomInt(1, 101);
                    } while (winningNumbers.includes(num));
                    prize = `${tierRewards[randomInt(0, tierRewards.length)]} 积分`;
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
                    prize: `${payout} 积分`,
                    isWinning: true
                };
            }

            const crypto = require('crypto');
            const proof = crypto.createHash('sha256')
                .update(`${username}-scratch-${Date.now()}-${randomBytes(8).toString('hex')}`)
                .digest('hex');
            await client.query(
                `INSERT INTO scratch_results (
                    username, reward, matches_count, tier_cost, winning_numbers, slots, proof, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, (NOW() AT TIME ZONE 'Asia/Shanghai'))`,
                [username, payout, matchedCount, tier, JSON.stringify(winningNumbers), JSON.stringify(userSlots), proof]
            );

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
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('Scratch play error:', error);
            res.status(500).json({ success: false, message: '游戏失败，请稍后重试' });
        } finally {
            client?.release();
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
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
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
                ipAddress: req.clientIP,
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
            await logStoneAction({
                username,
                actionType: 'add',
                cost: 30,
                beforeSlots,
                afterSlots: slots
            }, client);

            await client.query('COMMIT');
            res.json({
                success: true,
                slots,
                newBalance: balanceResult.balance
            });
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('Stone add error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    app.post('/api/stone/fill', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
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
                ipAddress: req.clientIP,
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
            await logStoneAction({
                username,
                actionType: 'fill',
                cost,
                beforeSlots,
                afterSlots: newSlots
            }, client);

            await client.query('COMMIT');
            res.json({
                success: true,
                slots: newSlots,
                newBalance: balanceResult.balance
            });
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('Stone fill error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    app.post('/api/stone/replace', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
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
                ipAddress: req.clientIP,
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
            const colorCounts = newSlots.reduce((counts, color) => {
                counts[color] = (counts[color] || 0) + 1;
                return counts;
            }, {});
            const highestCount = Math.max(...Object.values(colorCounts));
            const dominantColors = Object.keys(colorCounts)
                .filter((color) => colorCounts[color] === highestCount);
            let nextReplaceIndex = index;
            if (dominantColors.length === 1 && dominantColors[0] === newSlots[index]) {
                for (let offset = 1; offset < newSlots.length; offset += 1) {
                    const candidate = (index + offset) % newSlots.length;
                    if (newSlots[candidate] !== dominantColors[0]) {
                        nextReplaceIndex = candidate;
                        break;
                    }
                }
            }
            await saveStoneState(username, newSlots, client);
            await logStoneAction({
                username,
                actionType: 'replace',
                cost: replaceCost,
                slotIndex: index,
                beforeSlots,
                afterSlots: newSlots
            }, client);

            await client.query('COMMIT');
            res.json({
                success: true,
                slots: newSlots,
                newBalance: balanceResult.balance,
                replacedSlot: index,
                nextReplaceIndex
            });
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('Stone replace error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    app.post('/api/stone/redeem', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
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

            let newBalance = null;
            if (reward > 0) {
                const rewardResult = await BalanceLogger.updateBalance({
                    username,
                    amount: reward,
                    operationType: 'stone_reward',
                    description: `合石头兑换奖励 ${reward} 积分`,
                    ipAddress: req.clientIP,
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

            await logStoneAction({
                username,
                actionType: 'redeem',
                reward,
                beforeSlots,
                afterSlots: newSlots
            }, client);

            await client.query('COMMIT');
            res.json({
                success: true,
                slots: newSlots,
                reward,
                newBalance
            });
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('Stone redeem error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
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
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
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
                        description: `翻卡牌开始新一轮自动结算 ${previousReward} 积分`,
                        ipAddress: req.clientIP,
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

                await logFlipAction({
                    username,
                    actionType: 'end',
                    reward: previousReward,
                    goodCount: previousState.good_count,
                    badCount: previousState.bad_count,
                    ended: true
                }, client);
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
            res.json({
                success: true,
                nextCost: flipCosts[0],
                previousReward,
                previousGood: previousState.good_count,
                previousBad: previousState.bad_count,
                newBalance
            });
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('Flip start error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    app.post('/api/flip/flip', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
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
                ipAddress: req.clientIP,
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
                    description: `翻卡牌奖励 ${reward} 积分`,
                    ipAddress: req.clientIP,
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
            await logFlipAction({
                username,
                actionType: 'flip',
                cost,
                reward,
                cardIndex,
                cardType,
                goodCount: state.good_count,
                badCount: state.bad_count,
                ended: state.ended
            }, client);

            await client.query('COMMIT');
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
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('Flip card error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    app.post('/api/flip/cashout', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
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
                description: `翻卡牌退出奖励 ${reward} 积分`,
                ipAddress: req.clientIP,
                userAgent: req.get('User-Agent'),
                requireSufficientBalance: false,
                client,
                managedTransaction: true
            });

            if (!rewardResult.success) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: rewardResult.message });
            }

            await logFlipAction({
                username,
                actionType: 'end',
                reward,
                goodCount: state.good_count,
                badCount: state.bad_count,
                ended: true
            }, client);

            await client.query('COMMIT');
            res.json({
                success: true,
                reward,
                newBalance: rewardResult.balance
            });
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('Flip cashout error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    // 惊喜盲盒
    app.post('/api/blindbox/open', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        const username = req.session.user.username;
        const tierKey = String(req.body.tier || '').trim();
        const countNum = Number(req.body.count);

        const tier = blindboxTiers.find((item) => item.key === tierKey);
        if (!tier) {
            return res.status(400).json({ success: false, message: '无效的盲盒档位' });
        }
        if (!blindboxCounts.includes(countNum)) {
            return res.status(400).json({ success: false, message: '无效的盲盒数量' });
        }

        const tierConfig = blindboxConfigs[tierKey];
        if (!tierConfig) {
            return res.status(400).json({ success: false, message: '盲盒配置不存在' });
        }

        let blindboxPool;
        try {
            blindboxPool = buildBlindboxPool(tierConfig);
        } catch (error) {
            console.error('Blindbox pool load error:', error);
            return res.status(500).json({ success: false, message: '礼物池加载失败' });
        }

        if (!blindboxPool.length) {
            return res.status(500).json({ success: false, message: '礼物池为空' });
        }

        const totalCost = tier.cost * countNum;
        const rewards = [];
        for (let i = 0; i < countNum; i += 1) {
            const reward = pickBlindboxReward(blindboxPool);
            if (!reward) {
                return res.status(500).json({ success: false, message: '抽取失败，请稍后再试' });
            }
            rewards.push({
                giftId: String(reward.giftId),
                name: reward.name,
                value: Number(reward.value) || 0
            });
        }

        const sortedRewards = rewards
            .map((item, index) => ({ ...item, originalIndex: index }))
            .sort((a, b) => {
                if (b.value !== a.value) {
                    return b.value - a.value;
                }
                return a.originalIndex - b.originalIndex;
            });
        const totalRewardValue = sortedRewards.reduce((sum, item) => sum + (Number(item.value) || 0), 0);

        let client;
        let balanceAfter = null;
        let batchId = null;
        let firstInventoryId = null;
        let bilibiliRoomId = null;
        try {
            client = await pool.connect();
            await client.query('BEGIN');

            const lock = await client.query(
                'SELECT pg_try_advisory_xact_lock(hashtext($1 || \':blindbox\')) AS locked',
                [username]
            );
            if (!lock.rows[0]?.locked) {
                await client.query('ROLLBACK');
                return res.status(429).json({ success: false, message: '操作过于频繁，请稍后再试' });
            }

            const betResult = await BalanceLogger.updateBalance({
                username,
                amount: -totalCost,
                operationType: 'blindbox_open',
                description: `惊喜盲盒：${tier.nameZh} x${countNum}`,
                ipAddress: req.clientIP,
                userAgent: req.get('User-Agent'),
                client,
                managedTransaction: true
            });

            if (!betResult.success) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: betResult.message });
            }
            balanceAfter = betResult.balance;

            const roomResult = await client.query(
                'SELECT bilibili_room_id FROM users WHERE username = $1',
                [username]
            );
            bilibiliRoomId = roomResult.rows[0]?.bilibili_room_id || null;
            const expiresAt = bilibiliRoomId
                ? "(date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai') + interval '1 day' + interval '23 hours 59 minutes 59 seconds')"
                : "'infinity'::timestamptz";

            batchId = randomBytes(8).toString('hex');

            for (let i = 0; i < sortedRewards.length; i += 1) {
                const reward = sortedRewards[i];
                const insertResult = await client.query(`
                    INSERT INTO wish_inventory (
                        username,
                        gift_type,
                        gift_name,
                        bilibili_gift_id,
                        status,
                        expires_at,
                        created_at,
                        updated_at,
                        source_type,
                        source_batch_id,
                        batch_order,
                        batch_value
                    )
                    VALUES (
                        $1, $2, $3, $4, 'stored',
                        ${expiresAt},
                        (NOW() AT TIME ZONE 'Asia/Shanghai'),
                        (NOW() AT TIME ZONE 'Asia/Shanghai'),
                        'blindbox',
                        $5,
                        $6,
                        $7
                    )
                    RETURNING id
                `, [
                    username,
                    reward.giftId,
                    reward.name,
                    reward.giftId,
                    batchId,
                    i + 1,
                    reward.value
                ]);

                if (i === 0) {
                    firstInventoryId = insertResult.rows[0]?.id || null;
                }
            }

            await client.query(
                `INSERT INTO blindbox_logs (
                    username, tier_key, tier_name, box_count, total_cost, total_reward_value, rewards, batch_id, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, (NOW() AT TIME ZONE 'Asia/Shanghai'))`,
                [
                    username,
                    tierKey,
                    tier.nameZh,
                    countNum,
                    totalCost,
                    totalRewardValue,
                    JSON.stringify(sortedRewards),
                    batchId
                ]
            );

            await client.query('COMMIT');
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('Blindbox open error:', error);
            return res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }

        let enqueueResult = null;
        if (bilibiliRoomId && firstInventoryId && enqueueWishInventorySend) {
            enqueueResult = await enqueueWishInventorySend({
                inventoryId: firstInventoryId,
                username
            });
        }

        return res.json({
            success: true,
            balanceAfter,
            batchId,
            rewards,
            queued: !!enqueueResult?.success,
            enqueueMessage: enqueueResult?.message || null
        });
    });

    // 决斗挑战 Duel 游戏API
    app.post('/api/duel/play', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            const username = req.session.user.username;
            const giftType = req.body.giftType;
            const power = Number(req.body.power);

            if (!duelRewards[giftType]) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '无效的奖品档位' });
            }

            if (!Number.isInteger(power) || power < 1 || power > 80) {
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
                ipAddress: req.clientIP,
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
                    description: `决斗挑战获胜：${duelRewards[giftType].name} ${reward} 积分`,
                    ipAddress: req.clientIP,
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

            await client.query(
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

            await client.query('COMMIT');

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
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('Duel play error:', error);
            res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }
    });

    // Spin API 路由
    app.post('/api/spin',
        requireLogin,
        requireAuthorized,
        basicRateLimit,
        userActionRateLimit,
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
            const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
            const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
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

                case 'blindbox':
                    query = `
                        SELECT id,
                               tier_name,
                               box_count,
                               total_cost,
                               total_reward_value,
                               rewards,
                               to_char(created_at::timestamptz AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as played_at
                        FROM blindbox_logs
                        WHERE username = $1
                        ORDER BY created_at DESC
                        LIMIT $2 OFFSET $3
                    `;
                    params = [username, limit, offset];
                    countQuery = 'SELECT COUNT(*) FROM blindbox_logs WHERE username = $1';
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
