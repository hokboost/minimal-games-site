module.exports = function registerGameRoutes(app, deps) {
    const requireFunction = require('../lib/require-function');
    const {
        pool,
        BalanceLogger,
        GameLogic,
        questions,
        generateCSRFToken,
        requireLogin,
        requireAuthorized,
        requireCSRF,
        dictationTokenSecret,
        security,
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
        paidActionConcurrencyGuard,
        giftConfig
    } = deps;
    const userActionRateLimit = requireFunction(security, 'userActionRateLimit', 'security middleware');
    const basicRateLimit = requireFunction(security, 'basicRateLimit', 'security middleware');
    const readHeavyRateLimit = requireFunction(security, 'readHeavyRateLimit', 'security middleware');
    const csrfProtection = requireFunction({ requireCSRF }, 'requireCSRF', 'route dependency');
    const rejectWhenOverloaded = requireFunction(
        { paidActionConcurrencyGuard },
        'paidActionConcurrencyGuard',
        'route dependency'
    );
    if (!dictationTokenSecret || Buffer.byteLength(String(dictationTokenSecret)) < 32) {
        throw new Error('Missing dictation token secret');
    }
    const { createHash, randomInt, randomBytes } = require('crypto');
    const { parseMoney } = require('../lib/integer-money');
    const { randomArrayIndex, randomArrayItem } = require('../lib/random-index');
    const fs = require('fs');
    const path = require('path');
    const { pinyin } = require('pinyin');
    const { PNG } = require('pngjs');
    const randomFloat = () => randomInt(0, 1000000) / 1000000;
    const loadUserBalance = async (username) => {
        const result = await pool.query(
            'SELECT balance FROM users WHERE username = $1',
            [username]
        );
        if (result.rows.length !== 1) {
            throw new Error('Authenticated user disappeared while loading balance');
        }
        return parseMoney(result.rows[0].balance, 'user balance', { min: 0 });
    };
    const QUIZ_QUESTION_COUNT = 15;
    const quizBankVersion = createHash('sha256')
        .update(JSON.stringify(questions))
        .digest('hex');
    if (!Array.isArray(questions) || questions.length < QUIZ_QUESTION_COUNT) {
        throw new Error(`Quiz requires at least ${QUIZ_QUESTION_COUNT} valid questions`);
    }
    const createQuizSnapshot = () => {
        const available = questions.map((question) => ({
            id: question.id,
            question: String(question.question || ''),
            options: Array.isArray(question.options) ? question.options.map(String) : [],
            correct: Number(question.correct)
        }));
        if (available.some((question) => (
            question.id === null || question.id === undefined
            || !question.question
            || question.options.length < 2
            || !Number.isInteger(question.correct)
            || question.correct < 0
            || question.correct >= question.options.length
        ))) {
            throw new Error('Quiz question bank contains invalid questions');
        }
        if (new Set(available.map((question) => String(question.id))).size !== available.length) {
            throw new Error('Quiz question IDs must be unique');
        }
        const selected = [];
        while (selected.length < QUIZ_QUESTION_COUNT) {
            const index = randomArrayIndex(available.length);
            selected.push(available.splice(index, 1)[0]);
        }
        return selected;
    };
    const dictationHomophoneCache = {
        map: null
    };
    const dictationBankPath = path.join(__dirname, '..', 'data', 'dictation-words.json');
    const dictationAudioDirectory = path.join(__dirname, '..', 'private', 'dictation-audio');
    const dictationBankRaw = fs.readFileSync(dictationBankPath, 'utf8');
    const dictationBankVersion = createHash('sha256').update(dictationBankRaw).digest('hex');
    const dictationWords = JSON.parse(dictationBankRaw).map((item) => ({
        id: String(item.id || ''),
        set_id: Number(item.set_id),
        word: String(item.word || '').trim(),
        pronunciation: String(item.pronunciation || '').trim(),
        definition: String(item.definition || '').trim()
    }));
    if (dictationWords.length === 0 || dictationWords.some((item) => (
        !item.id || !Number.isSafeInteger(item.set_id) || !item.word || !item.pronunciation
    ))) {
        throw new Error('Invalid private dictation question bank');
    }
    const dictationAudioById = new Map(dictationWords.map((item) => {
        if (!/^[A-Za-z0-9_-]{1,50}$/.test(item.id)) {
            throw new Error(`Invalid dictation audio id: ${item.id}`);
        }
        const audio = fs.readFileSync(path.join(dictationAudioDirectory, `${item.id}.wav`));
        const isWave = audio.length >= 44
            && audio.subarray(0, 4).toString('ascii') === 'RIFF'
            && audio.subarray(8, 12).toString('ascii') === 'WAVE';
        if (!isWave || audio.length > 2 * 1024 * 1024) {
            throw new Error(`Invalid dictation audio asset: ${item.id}`);
        }
        return [item.id, audio];
    }));
    const dictationSets = new Map();
    for (const item of dictationWords) {
        if (!dictationSets.has(item.set_id)) dictationSets.set(item.set_id, []);
        dictationSets.get(item.set_id).push(item);
    }

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
        const map = new Map();
        const characters = [];
        for (let codepoint = 0x4e00; codepoint <= 0x9fff; codepoint += 1) {
            characters.push(String.fromCodePoint(codepoint));
        }
        const readings = pinyin(characters.join(''), {
            style: 'tone2',
            heteronym: true,
            segment: false
        });
        characters.forEach((character, index) => {
            for (const entry of readings[index] || []) {
                const key = normalizeNumberSyllable(entry);
                if (!key) {
                    continue;
                }
                if (!map.has(key)) {
                    map.set(key, new Set());
                }
                map.get(key).add(character);
            }
        });
        const normalized = new Map();
        for (const [key, set] of map.entries()) {
            normalized.set(key, Array.from(set));
        }
        dictationHomophoneCache.map = normalized;
        return dictationHomophoneCache.map;
    };
    loadHomophoneMap();

    const buildDictationPrompt = (item) => {
        const homophoneMap = loadHomophoneMap();
        const syllables = item.pronunciation ? item.pronunciation.split(/\s+/) : [];
        const homophones = syllables.map((syllable) => {
            const base = getSyllableBase(syllable);
            const merged = new Set();
            for (let tone = 1; tone <= 5; tone += 1) {
                for (const character of homophoneMap.get(`${base}${tone}`) || []) {
                    merged.add(character);
                }
            }
            return Array.from(merged);
        });
        return {
            id: String(item.id),
            set_id: Number(item.set_id),
            pronunciation: String(item.pronunciation || ''),
            definition: String(item.definition || ''),
            homophones,
            audioUrl: '/api/dictation/audio'
        };
    };

    const signDictationQuestion = ({ username, sessionId, level, questionId, bankVersion }) => (
        require('crypto').createHmac('sha256', dictationTokenSecret)
            .update(`${username}\n${sessionId}\n${level}\n${questionId}\n${bankVersion}`)
            .digest('hex')
    );

    const questionTokensMatch = (provided, expected) => {
        if (!/^[a-f0-9]{64}$/i.test(String(provided || ''))) return false;
        const providedBuffer = Buffer.from(String(provided).toLowerCase(), 'hex');
        const expectedBuffer = Buffer.from(expected, 'hex');
        return providedBuffer.length === expectedBuffer.length
            && require('crypto').timingSafeEqual(providedBuffer, expectedBuffer);
    };

    const getSessionQuestion = async (client, { username, sessionId, setId, level }) => {
        const sessionResult = await client.query(`
            SELECT bank_version, question_snapshot
            FROM dictation_sessions
            WHERE id = $1 AND username = $2 AND set_id = $3 AND result = 'in_progress'
            FOR UPDATE
        `, [sessionId, username, setId]);
        if (sessionResult.rows.length !== 1) {
            throw new Error('Dictation session is not active');
        }

        let snapshot = sessionResult.rows[0].question_snapshot;
        let bankVersion = sessionResult.rows[0].bank_version;
        if (!Array.isArray(snapshot) || snapshot.length < 3 || !bankVersion) {
            snapshot = (dictationSets.get(Number(setId)) || []).map((item) => ({ ...item }));
            bankVersion = dictationBankVersion;
            if (snapshot.length < 3) throw new Error('Dictation set is incomplete');
            await client.query(`
                UPDATE dictation_sessions
                SET bank_version = $1, question_snapshot = $2
                WHERE id = $3
            `, [bankVersion, JSON.stringify(snapshot), sessionId]);
        }

        const question = snapshot[Number(level) - 1];
        if (!question || !question.id || !question.word || !question.pronunciation) {
            throw new Error('Dictation question is missing from the session snapshot');
        }
        return { question, bankVersion };
    };

    const issueDictationQuestion = async (client, context) => {
        const { username, sessionId, setId, level } = context;
        const { question, bankVersion } = await getSessionQuestion(client, context);
        const questionToken = signDictationQuestion({
            username,
            sessionId,
            level,
            questionId: String(question.id),
            bankVersion
        });
        const tokenHash = createHash('sha256').update(questionToken).digest('hex');
        const issuedResult = await client.query(`
            UPDATE dictation_progress
            SET question_id = $1,
                question_token_hash = $2,
                bank_version = $3,
                question_issued_at = NOW(),
                updated_at = NOW()
            WHERE username = $4 AND session_id = $5 AND level = $6 AND set_id = $7
            RETURNING username
        `, [String(question.id), tokenHash, bankVersion, username, sessionId, level, setId]);
        if (issuedResult.rows.length !== 1) {
            throw new Error('Dictation progress changed while issuing the question');
        }
        return {
            question: buildDictationPrompt(question),
            questionToken,
            bankVersion
        };
    };

    const readIssuedDictationQuestion = (row, username) => {
        const level = Number(row?.level);
        const setId = Number(row?.set_id);
        const snapshot = row?.question_snapshot;
        const bankVersion = row?.session_bank_version;
        const question = Number.isInteger(level) && Array.isArray(snapshot)
            ? snapshot[level - 1]
            : null;
        if (!Number.isInteger(level) || level < 1 || level > 3
            || !Number.isSafeInteger(setId) || !row?.session_id
            || !question?.id || Number(question.set_id) !== setId
            || !bankVersion || row.bank_version !== bankVersion
            || String(row.question_id || '') !== String(question.id)) {
            return null;
        }
        const questionToken = signDictationQuestion({
            username,
            sessionId: row.session_id,
            level,
            questionId: String(question.id),
            bankVersion
        });
        const tokenHash = createHash('sha256').update(questionToken).digest('hex');
        if (!questionTokensMatch(row.question_token_hash, tokenHash)) return null;
        return { level, setId, question, questionToken, bankVersion };
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

    const loadBlindboxGiftMap = () => {
        const poolConfig = giftConfig?.礼物池配置 || {};
        return Object.entries(poolConfig).reduce((acc, [giftId, info]) => {
            const name = Array.isArray(info) ? info[0] : info?.name;
            const value = Array.isArray(info) ? info[1] : info?.value;
            const numericValue = Number(value);
            if (!/^\d+$/.test(String(giftId))
                || typeof name !== 'string'
                || !name.trim()
                || !Number.isSafeInteger(numericValue)
                || numericValue < 0) {
                throw new Error(`Invalid blindbox gift configuration: ${giftId}`);
            }
            acc[giftId] = {
                name: name.trim(),
                value: numericValue
            };
            return acc;
        }, Object.create(null));
    };

    const blindboxGiftMap = loadBlindboxGiftMap();
    if (Object.keys(blindboxGiftMap).length === 0) {
        throw new Error('Blindbox gift pool configuration is empty');
    }

    const buildBlindboxPool = (tierConfig) => {
        if (!tierConfig || !Number.isSafeInteger(tierConfig.cost) || tierConfig.cost <= 0
            || !Array.isArray(tierConfig.items) || tierConfig.items.length === 0) {
            throw new Error('Invalid blindbox tier configuration');
        }

        const seenGiftIds = new Set();
        return tierConfig.items.map((item) => {
            const giftId = String(item?.giftId || '');
            const gift = blindboxGiftMap[giftId];
            const weight = Number(item?.weight);
            if (!/^\d+$/.test(giftId) || !gift) {
                throw new Error(`Blindbox reward is missing from gift pool configuration: ${giftId}`);
            }
            if (seenGiftIds.has(giftId)) {
                throw new Error(`Duplicate blindbox reward in tier: ${giftId}`);
            }
            if (!Number.isFinite(weight) || weight <= 0) {
                throw new Error(`Invalid blindbox reward weight: ${giftId}`);
            }
            const weightUnits = Math.round(weight * 1_000_000);
            if (!Number.isSafeInteger(weightUnits) || weightUnits < 1
                || Math.abs(weight - (weightUnits / 1_000_000)) > Number.EPSILON) {
                throw new Error(`Blindbox reward weight requires more than six decimals: ${giftId}`);
            }
            seenGiftIds.add(giftId);
            return {
                giftId,
                name: item.name || gift.name,
                value: gift.value,
                weight,
                weightUnits
            };
        });
    };

    const pickBlindboxReward = (pool) => {
        const totalWeight = pool.reduce((sum, item) => sum + item.weightUnits, 0);
        if (totalWeight !== 1_000_000) return null;
        const roll = randomInt(0, totalWeight);
        let acc = 0;
        for (const item of pool) {
            acc += item.weightUnits;
            if (roll < acc) return item;
        }
        throw new Error('Blindbox random draw exceeded configured weight');
    };

    const blindboxPools = new Map(Object.entries(blindboxConfigs).map(([key, config]) => {
        const configuredPool = buildBlindboxPool(config);
        const totalWeight = configuredPool.reduce((sum, item) => sum + item.weightUnits, 0);
        if (configuredPool.length === 0 || totalWeight !== 1_000_000) {
            throw new Error(`Blindbox tier ${key} weights must total 1`);
        }
        return [key, configuredPool];
    }));

    app.get('/quiz', requireLogin, requireAuthorized, basicRateLimit, async (req, res) => {
        try {
            if (!req.session.initialized) {
                req.session.initialized = true;
                req.session.createdAt = Date.now();
                generateCSRFToken(req);
            }
            const username = req.session.user.username;
            const balance = await loadUserBalance(username);
            return res.render('quiz', {
                username,
                balance,
                csrfToken: req.session.csrfToken
            });
        } catch (error) {
            console.error('Quiz page balance load failed:', error);
            return res.status(503).send('余额服务暂不可用');
        }
    });

    // Quiz 开始游戏 API - 扣除积分 + 创建付费会话
    app.post('/api/quiz/start', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            const { username } = req.body || {};

            // 验证用户名
            if (username !== req.session.user.username) {
                return res.status(403).json({ success: false, message: '用户名不匹配' });
            }

            await client.query('BEGIN');
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`quiz:${username}`]);
            const activeResult = await client.query(`
                SELECT id, expires_at, expected_question_count, question_snapshot
                FROM quiz_sessions
                WHERE username = $1 AND status = 'active'
                ORDER BY created_at DESC
                LIMIT 1
                FOR UPDATE
            `, [username]);
            const activeSession = activeResult.rows[0] || null;
            const canResume = activeSession
                && new Date(activeSession.expires_at).getTime() > Date.now()
                && Number(activeSession.expected_question_count) === QUIZ_QUESTION_COUNT
                && Array.isArray(activeSession.question_snapshot)
                && activeSession.question_snapshot.length === QUIZ_QUESTION_COUNT;
            if (canResume) {
                const balanceResult = await client.query(
                    'SELECT balance FROM users WHERE username = $1',
                    [username]
                );
                if (balanceResult.rows.length !== 1) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({ success: false, message: '用户不存在' });
                }
                const responseBody = {
                    success: true,
                    message: '已恢复未完成的答题',
                    newBalance: parseMoney(balanceResult.rows[0].balance, 'user balance', { min: 0 }),
                    quizSessionId: activeSession.id,
                    expectedQuestionCount: QUIZ_QUESTION_COUNT,
                    resumed: true
                };
                await req.finalizeIdempotency?.(client, 200, responseBody);
                await client.query('COMMIT');
                req.session.quizSessionId = activeSession.id;
                return res.json(responseBody);
            }
            if (activeSession) {
                await client.query(`
                    UPDATE quiz_sessions
                    SET status = 'expired', settled_at = NOW()
                    WHERE id = $1 AND status = 'active'
                `, [activeSession.id]);
            }

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
            const questionSnapshot = createQuizSnapshot();
            await client.query(`
                INSERT INTO quiz_sessions (
                    id, username, status, created_at, expires_at,
                    expected_question_count, question_bank_version, question_snapshot
                )
                VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '20 minutes', $3, $4, $5)
            `, [
                sessionId,
                username,
                QUIZ_QUESTION_COUNT,
                quizBankVersion,
                JSON.stringify(questionSnapshot)
            ]);
            const questionTokens = questionSnapshot.map(() => GameLogic.generateToken(16));
            await client.query(`
                INSERT INTO quiz_question_tokens (token, session_id, question_id, question_index, created_at)
                SELECT token, $1, question_id, question_index, NOW()
                FROM unnest($2::text[], $3::text[], $4::integer[])
                    AS issued(token, question_id, question_index)
            `, [
                sessionId,
                questionTokens,
                questionSnapshot.map((question) => String(question.id)),
                questionSnapshot.map((question, index) => index)
            ]);
            const responseBody = {
                success: true,
                message: '游戏开始，已扣除10积分',
                newBalance: balanceResult.balance,
                quizSessionId: sessionId,
                expectedQuestionCount: QUIZ_QUESTION_COUNT,
                resumed: false
            };
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');

            req.session.quizSessionId = sessionId;
            res.json(responseBody);
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
            const balance = await loadUserBalance(username);

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
            const balance = await loadUserBalance(username);

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
            return res.status(503).send('听写次数服务暂不可用');
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
            const balance = await loadUserBalance(username);

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
            const balance = await loadUserBalance(username);

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
            const balance = await loadUserBalance(username);

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
            const balance = await loadUserBalance(username);

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
    app.get('/api/user-info', requireLogin, requireAuthorized, readHeavyRateLimit, async (req, res) => {
        try {
            const username = req.session.user.username;
            const balance = await loadUserBalance(username);
            return res.json({ success: true, username, balance });
        } catch (error) {
            console.error('User info load failed');
            return res.status(503).json({ success: false, message: '用户信息暂不可用' });
        }
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
            const { username: requestUsername } = req.body || {};
            const questionIndex = Number(req.body?.questionIndex);
            const username = req.session.user.username;
            if (requestUsername && requestUsername !== username) {
                return res.status(403).json({ success: false, message: '用户名不匹配' });
            }
            if (!Number.isInteger(questionIndex)
                || questionIndex < 0
                || questionIndex >= QUIZ_QUESTION_COUNT) {
                return res.status(400).json({ success: false, message: '题目序号无效' });
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
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`quiz-next:${quizSessionId}`]);
            const sessionResult = await client.query(`
                SELECT status, expires_at, expected_question_count, question_snapshot
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
            const snapshot = sessionData.question_snapshot;
            if (Number(sessionData.expected_question_count) !== QUIZ_QUESTION_COUNT
                || !Array.isArray(snapshot)
                || snapshot.length !== QUIZ_QUESTION_COUNT) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '答题会话数据不完整，请联系管理员' });
            }
            const question = snapshot[questionIndex];
            const tokenResult = await client.query(`
                SELECT token, question_id
                FROM quiz_question_tokens
                WHERE session_id = $1 AND question_index = $2
            `, [quizSessionId, questionIndex]);
            const issued = tokenResult.rows[0];
            if (!question || !issued || String(question.id) !== String(issued.question_id)) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '题目快照损坏，请联系管理员' });
            }
            const responseBody = {
                success: true,
                question: {
                    id: question.id,
                    question: question.question,
                    options: question.options
                },
                token: issued.token,
                questionIndex
            };
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');

            res.json(responseBody);
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
            const { username, answers = [] } = req.body || {};

            if (username !== req.session.user.username) {
                return res.status(403).json({ success: false, message: '用户名不匹配' });
            }
            if (!Array.isArray(answers) || answers.length !== QUIZ_QUESTION_COUNT) {
                return res.status(400).json({
                    success: false,
                    message: `必须完成全部 ${QUIZ_QUESTION_COUNT} 道题后才能提交`
                });
            }

            const normalizedAnswers = [];
            const submittedTokens = new Set();
            for (const answer of answers) {
                const token = typeof answer?.token === 'string' ? answer.token : '';
                const answerIndex = Number(answer?.answerIndex);
                if (!token || !Number.isInteger(answerIndex) || answerIndex < -1 || answerIndex > 20) {
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
                SELECT status, expires_at, expected_question_count, question_snapshot
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
            const expectedCount = Number(sessionData.expected_question_count);
            const questionSnapshot = sessionData.question_snapshot;
            if (expectedCount !== QUIZ_QUESTION_COUNT
                || !Array.isArray(questionSnapshot)
                || questionSnapshot.length !== expectedCount
                || normalizedAnswers.length !== expectedCount) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '答题会话数据不完整' });
            }

            const tokenResult = await client.query(`
                SELECT token, question_id, question_index
                FROM quiz_question_tokens
                WHERE session_id = $1
                  AND consumed_at IS NULL
                ORDER BY question_index
                FOR UPDATE
            `, [quizSessionId]);
            if (tokenResult.rows.length !== expectedCount
                || tokenResult.rows.some((row) => !submittedTokens.has(row.token))) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    message: '必须且只能提交本局全部题目令牌'
                });
            }

            const tokensByValue = new Map(tokenResult.rows.map((row) => [row.token, row]));
            let correctCount = 0;
            const answerDetails = [];
            for (const answer of normalizedAnswers) {
                const tokenData = tokensByValue.get(answer.token);
                const snapshotIndex = Number(tokenData?.question_index);
                const question = questionSnapshot[snapshotIndex];
                if (!tokenData
                    || !Number.isInteger(snapshotIndex)
                    || String(question?.id) !== String(tokenData.question_id)
                    || !Array.isArray(question?.options)
                    || answer.answerIndex >= question.options.length
                    || !Number.isInteger(Number(question.correct))) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ success: false, message: '题目或答案无效' });
                }
                const isCorrect = answer.answerIndex >= 0
                    && answer.answerIndex === Number(question.correct);
                if (isCorrect) correctCount += 1;
                answerDetails.push({ question, answerIndex: answer.answerIndex, isCorrect });
            }

            const resultTrace = randomBytes(24).toString('hex');
            const submissionResult = await client.query(
                `INSERT INTO submissions (
                    username, score, submitted_at, result_trace, quiz_session_id
                 ) VALUES ($1, $2, NOW(), $3, $4)
                 RETURNING id`,
                [username, correctCount, resultTrace, quizSessionId]
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
                        detail.answerIndex >= 0
                            ? detail.question.options[detail.answerIndex]
                            : null,
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
                if (balanceResult.rows.length !== 1) {
                    throw new Error('Quiz owner disappeared during settlement');
                }
                newBalance = parseMoney(balanceResult.rows[0].balance, 'user balance', { min: 0 });
            }

            const consumedTokens = await client.query(
                'UPDATE quiz_question_tokens SET consumed_at = NOW() WHERE session_id = $1 AND token = ANY($2::text[])',
                [quizSessionId, Array.from(submittedTokens)]
            );
            if (consumedTokens.rowCount !== expectedCount) {
                throw new Error('Quiz token state changed concurrently');
            }
            const settledSession = await client.query(
                "UPDATE quiz_sessions SET status = 'settled', settled_at = NOW() WHERE id = $1 AND status = 'active' RETURNING id",
                [quizSessionId]
            );
            if (settledSession.rowCount !== 1) {
                throw new Error('Quiz session state changed concurrently');
            }
            const responseBody = {
                success: true,
                score: correctCount,
                total: normalizedAnswers.length,
                reward,
                newBalance,
                resultTrace
            };
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            req.session.quizSessionId = null;

            res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('Quiz submit error:', error);
            res.status(500).json({ success: false, message: '提交失败' });
        } finally {
            client?.release();
        }
    });

    // Quiz 排行榜 API
    app.get('/api/quiz/leaderboard', requireLogin, requireAuthorized, readHeavyRateLimit, async (req, res) => {
        try {
            // Show each account's best score for the current Shanghai calendar day.
            const result = await pool.query(`
                SELECT username, score, submitted_at
                FROM (
                    SELECT DISTINCT ON (s.username)
                           s.username, s.score, s.submitted_at::timestamptz AS submitted_at
                    FROM submissions s
                    JOIN users u ON u.username = s.username
                    WHERE s.submitted_at::timestamptz >=
                          (date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai')
                      AND s.submitted_at::timestamptz <
                          ((date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai') + INTERVAL '1 day') AT TIME ZONE 'Asia/Shanghai')
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
    app.get('/api/balance/logs', requireLogin, requireAuthorized, readHeavyRateLimit, async (req, res) => {
        try {
            const username = req.session.user.username;
            const page = Math.min(500, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
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
                await client.query(
                    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
                    [`dictation:${username}`]
                );
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
                    const responseBody = {
                        success: true,
                        message: '继续等待审核',
                        level: Number(pending.level || 1),
                        setId: pending.set_id !== null ? Number(pending.set_id) : null
                    };
                    await req.finalizeIdempotency?.(client, 200, responseBody);
                    await client.query('COMMIT');
                    return res.json(responseBody);
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
                if (level > 1 && (!Number.isSafeInteger(setId) || !sessionId)) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ success: false, message: '听写进度不完整，请联系管理员核对' });
                }

                if (level === 1 || !setId) {
                    const setIds = Array.from(dictationSets.keys());
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
                        const snapshot = dictationSets.get(Number(setId));
                        const sessionResult = await client.query(
                            `INSERT INTO dictation_sessions (
                                username, set_id, started_at, result, bank_version, question_snapshot
                             ) VALUES ($1, $2, NOW(), 'in_progress', $3, $4)
                             RETURNING id`,
                            [username, setId, dictationBankVersion, JSON.stringify(snapshot)]
                        );
                        sessionId = sessionResult.rows[0].id;
                        consumeAttempt = level === 1;
                    }
                }

                const progressUpdated = await client.query(
                    `UPDATE dictation_progress
                     SET level = $1, set_id = $2, session_id = $3, updated_at = NOW()
                     WHERE username = $4
                     RETURNING username`,
                    [level, setId, sessionId, username]
                );
                if (progressUpdated.rowCount !== 1) {
                    throw new Error('Dictation progress state changed during start');
                }

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

                    const consumedAttempt = await client.query(
                        `UPDATE dictation_allowances
                         SET attempts = attempts - 1, updated_at = NOW()
                         WHERE username = $1 AND attempts > 0
                         RETURNING attempts`,
                        [username]
                    );
                    if (consumedAttempt.rowCount !== 1) {
                        throw new Error('Dictation allowance state changed concurrently');
                    }
                }
                const issued = await issueDictationQuestion(client, { username, sessionId, setId, level });
                const responseBody = {
                    success: true,
                    message: '开始成功',
                    level,
                    setId,
                    sessionId,
                    question: issued.question,
                    questionToken: issued.questionToken,
                    bankVersion: issued.bankVersion
                };
                await req.finalizeIdempotency?.(client, 200, responseBody);
                await client.query('COMMIT');

                res.json(responseBody);
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
                `SELECT submission.status, submission.level, submission.word,
                        submission.set_id, submission.admin_message
                 FROM dictation_submissions AS submission
                 LEFT JOIN dictation_progress AS progress
                   ON progress.username = submission.username
                 WHERE submission.username = $1
                   AND (progress.session_id IS NULL
                        OR submission.session_id = progress.session_id)
                 ORDER BY submission.created_at DESC, submission.id DESC
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
        let client;
        try {
            const username = req.session.user?.username || '';
            client = await pool.connect();
            await client.query('BEGIN');
            await client.query(
                "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
                [`dictation:${username}`]
            );
            const progressResult = await client.query(
                'SELECT level, set_id, session_id FROM dictation_progress WHERE username = $1 FOR UPDATE',
                [username]
            );
            if (progressResult.rows.length !== 1) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '听写进度不存在' });
            }
            const level = Number(progressResult.rows[0].level || 1);
            const setId = Number(progressResult.rows[0].set_id);
            const sessionId = progressResult.rows[0].session_id;
            if (!Number.isInteger(level) || level < 1 || level > 3
                || !Number.isSafeInteger(setId) || !sessionId) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '听写进度不完整' });
            }
            const latest = await client.query(
                `SELECT id, status
                 FROM dictation_submissions
                 WHERE username = $1 AND session_id = $2 AND level = $3
                 ORDER BY created_at DESC, id DESC
                 LIMIT 1
                 FOR UPDATE`,
                [username, sessionId, level]
            );
            if (!latest.rows.length || latest.rows[0].status !== 'rewrite') {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, message: '当前不支持重写' });
            }
            const issued = await issueDictationQuestion(client, { username, sessionId, setId, level });
            const responseBody = {
                success: true,
                level,
                setId,
                sessionId,
                question: issued.question,
                questionToken: issued.questionToken,
                bankVersion: issued.bankVersion
            };
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            res.json(responseBody);
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('Dictation retry error:', error);
            res.status(500).json({ success: false, message: '开始失败' });
        } finally {
            client?.release();
        }
    });

    app.get('/api/dictation/current', requireLogin, requireAuthorized, basicRateLimit, async (req, res) => {
        try {
            const username = req.session.user.username;
            const result = await pool.query(`
                SELECT progress.level, progress.set_id, progress.session_id,
                       progress.question_id, progress.question_token_hash, progress.bank_version,
                       session.question_snapshot, session.bank_version AS session_bank_version
                FROM dictation_progress AS progress
                JOIN dictation_sessions AS session
                  ON session.id = progress.session_id
                 AND session.username = progress.username
                 AND session.result = 'in_progress'
                WHERE progress.username = $1
            `, [username]);
            if (result.rows.length !== 1) {
                return res.status(404).json({ success: false, message: '当前没有进行中的听写' });
            }
            const row = result.rows[0];
            const issued = readIssuedDictationQuestion(row, username);
            if (!issued) {
                return res.status(409).json({ success: false, message: '听写题目状态不完整，请重新开始' });
            }
            return res.json({
                success: true,
                level: issued.level,
                setId: issued.setId,
                sessionId: row.session_id,
                question: buildDictationPrompt(issued.question),
                questionToken: issued.questionToken,
                bankVersion: issued.bankVersion
            });
        } catch (error) {
            console.error('Dictation current question load error:', error);
            res.status(500).json({ success: false, message: '加载当前听写题目失败' });
        }
    });

    app.get('/api/dictation/audio', requireLogin, requireAuthorized, basicRateLimit, async (req, res) => {
        try {
            const username = req.session.user.username;
            const result = await pool.query(`
                SELECT progress.level, progress.set_id, progress.session_id,
                       progress.question_id, progress.question_token_hash, progress.bank_version,
                       session.question_snapshot, session.bank_version AS session_bank_version
                FROM dictation_progress AS progress
                JOIN dictation_sessions AS session
                  ON session.id = progress.session_id
                 AND session.username = progress.username
                 AND session.result = 'in_progress'
                WHERE progress.username = $1
            `, [username]);
            if (result.rows.length !== 1) {
                return res.status(404).json({ success: false, message: '当前没有进行中的听写' });
            }

            const row = result.rows[0];
            const issued = readIssuedDictationQuestion(row, username);
            if (!issued || !questionTokensMatch(req.query.token, issued.questionToken)) {
                return res.status(409).json({ success: false, message: '听写音频状态不匹配' });
            }

            const audio = dictationAudioById.get(String(issued.question.id));
            if (!audio) {
                return res.status(503).json({ success: false, message: '听写音频暂不可用' });
            }

            res.set({
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'private, no-store',
                'Content-Type': 'audio/wav',
                'X-Content-Type-Options': 'nosniff'
            });
            const range = req.get('Range');
            const match = typeof range === 'string' ? range.match(/^bytes=(\d+)-(\d*)$/) : null;
            if (!match) {
                res.set('Content-Length', String(audio.length));
                return res.send(audio);
            }

            const start = Number(match[1]);
            const requestedEnd = match[2] ? Number(match[2]) : audio.length - 1;
            const end = Math.min(requestedEnd, audio.length - 1);
            if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end) {
                res.set('Content-Range', `bytes */${audio.length}`);
                return res.status(416).end();
            }
            const chunk = audio.subarray(start, end + 1);
            res.status(206).set({
                'Content-Length': String(chunk.length),
                'Content-Range': `bytes ${start}-${end}/${audio.length}`
            });
            return res.send(chunk);
        } catch (error) {
            console.error('Dictation audio load error:', error);
            return res.status(500).json({ success: false, message: '加载听写音频失败' });
        }
    });

    app.get('/api/dictation/submissions/:id/image', requireLogin, requireAuthorized, basicRateLimit, async (req, res) => {
        const submissionId = Number.parseInt(req.params.id, 10);
        if (!Number.isSafeInteger(submissionId) || submissionId <= 0) {
            return res.status(400).json({ success: false, message: '图片编号无效' });
        }
        try {
            const result = await pool.query(`
                SELECT submission.username, submission.image_path,
                       upload.storage_path, upload.content_sha256, upload.content
                FROM dictation_submissions AS submission
                LEFT JOIN dictation_uploads AS upload ON upload.id = submission.upload_id
                WHERE submission.id = $1
            `, [submissionId]);
            const row = result.rows[0];
            if (!row) return res.status(404).json({ success: false, message: '图片不存在' });
            if (req.session.user.is_admin !== true && row.username !== req.session.user.username) {
                return res.status(403).json({ success: false, message: '无权查看该图片' });
            }

            res.set({
                'Cache-Control': 'private, no-store',
                'Content-Type': 'image/png',
                'X-Content-Type-Options': 'nosniff'
            });
            if (Buffer.isBuffer(row.content) && row.content.length > 0) {
                if (row.content_sha256) res.set('ETag', `"sha256-${row.content_sha256}"`);
                return res.send(row.content);
            }

            let filePath;
            if (row.storage_path && /^[a-f0-9]{48}\.png$/.test(row.storage_path)) {
                filePath = path.join(__dirname, '..', 'private', 'dictation-uploads', row.storage_path);
            } else {
                const legacyMatch = String(row.image_path || '').match(/^\/uploads\/dictation\/([A-Za-z0-9_.-]+\.png)$/);
                if (!legacyMatch) return res.status(404).json({ success: false, message: '图片不存在' });
                filePath = path.join(__dirname, '..', 'public', 'uploads', 'dictation', legacyMatch[1]);
            }

            return res.sendFile(filePath, (error) => {
                if (error && !res.headersSent) {
                    res.status(error.code === 'ENOENT' ? 404 : 500).json({ success: false, message: '图片读取失败' });
                }
            });
        } catch (error) {
            console.error('Dictation image read error:', error);
            return res.status(500).json({ success: false, message: '图片读取失败' });
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
            const sanitizeText = (value, maxLen) => {
                if (typeof value !== 'string') {
                    return '';
                }
                return value.trim().slice(0, maxLen);
            };

            const wordId = sanitizeText(req.body?.wordId, 50);
            const questionToken = sanitizeText(req.body?.questionToken, 128);
            const userInput = sanitizeText(req.body?.input, 120);
            const imageData = req.body?.imageData;

            if (!wordId || !questionToken) {
                return res.status(400).json({ success: false, message: '缺少题目信息' });
            }
            if (!userInput) {
                return res.status(400).json({ success: false, message: '请先选择答案' });
            }

            const userId = req.session.user?.id || null;
            const username = req.session.user?.username || '';
            const normalizeAnswer = (value) => String(value || '').replace(/\s+/g, '');
            let validatedImage = null;
            if (imageData && typeof imageData === 'string' && imageData.startsWith('data:image/png;base64,')) {
                const base64Data = imageData.slice('data:image/png;base64,'.length);
                if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64Data)) {
                    return res.status(400).json({ success: false, message: '图片数据无效' });
                }
                const imageBuffer = Buffer.from(base64Data, 'base64');
                const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
                if (imageBuffer.length === 0 || imageBuffer.length > 1.5 * 1024 * 1024 ||
                    imageBuffer.length < 24 ||
                    !imageBuffer.subarray(0, pngSignature.length).equals(pngSignature)) {
                    return res.status(400).json({ success: false, message: '仅支持不超过 1.5MB 的 PNG 图片' });
                }
                const headerWidth = imageBuffer.readUInt32BE(16);
                const headerHeight = imageBuffer.readUInt32BE(20);
                if (headerWidth < 1 || headerHeight < 1 || headerWidth > 2048 || headerHeight > 2048
                    || headerWidth * headerHeight > 4_000_000) {
                    return res.status(400).json({ success: false, message: '图片尺寸无效或过大' });
                }
                try {
                    const decoded = PNG.sync.read(imageBuffer, { checkCRC: true });
                    if (decoded.width !== headerWidth || decoded.height !== headerHeight) {
                        throw new Error('PNG dimensions changed while decoding');
                    }
                    const reencoded = PNG.sync.write(decoded, { colorType: 6 });
                    if (reencoded.length > 1.5 * 1024 * 1024) {
                        return res.status(400).json({ success: false, message: '处理后的图片超过 1.5MB' });
                    }
                    validatedImage = {
                        buffer: reencoded,
                        width: decoded.width,
                        height: decoded.height,
                        sha256: createHash('sha256').update(reencoded).digest('hex')
                    };
                } catch (error) {
                    return res.status(400).json({ success: false, message: 'PNG 图片无法解码' });
                }
            } else if (imageData !== undefined && imageData !== null && imageData !== '') {
                return res.status(400).json({ success: false, message: '图片数据无效' });
            }

            const client = await pool.connect();
            let responseBody;
            try {
                await client.query('BEGIN');
                await client.query(
                    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
                    [`dictation:${username}`]
                );
                const lockedProgress = await client.query(
                    `SELECT level, set_id, session_id, question_id,
                            question_token_hash, bank_version
                     FROM dictation_progress
                     WHERE username = $1
                     FOR UPDATE`,
                    [username]
                );
                const currentProgress = lockedProgress.rows[0];
                if (!currentProgress) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ success: false, message: '听写进度不存在' });
                }
                const level = Number(currentProgress.level);
                const setId = Number(currentProgress.set_id);
                const sessionId = currentProgress.session_id;
                if (!Number.isInteger(level) || level < 1 || level > 3
                    || !Number.isSafeInteger(setId) || !sessionId) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ success: false, message: '听写进度不完整' });
                }
                const { question, bankVersion } = await getSessionQuestion(client, {
                    username,
                    sessionId,
                    setId,
                    level
                });
                const expectedToken = signDictationQuestion({
                    username,
                    sessionId,
                    level,
                    questionId: String(question.id),
                    bankVersion
                });
                const expectedTokenHash = createHash('sha256').update(expectedToken).digest('hex');
                if (String(question.id) !== wordId
                    || Number(question.set_id) !== setId
                    || String(currentProgress.question_id || '') !== wordId
                    || currentProgress.bank_version !== bankVersion
                    || !questionTokensMatch(currentProgress.question_token_hash, expectedTokenHash)
                    || !questionTokensMatch(questionToken, expectedToken)) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ success: false, message: '题目与当前听写进度不匹配' });
                }
                const correctWord = String(question.word).trim();
                const normalizedInput = normalizeAnswer(userInput);
                const normalizedWord = normalizeAnswer(correctWord);
                const isCorrect = Boolean(normalizedInput && normalizedWord && normalizedInput === normalizedWord);
                const status = isCorrect ? 'correct' : 'wrong';
                const previousSubmission = await client.query(`
                    SELECT id, status
                    FROM dictation_submissions
                    WHERE username = $1 AND session_id = $2 AND level = $3
                    ORDER BY created_at DESC
                    LIMIT 1
                    FOR UPDATE
                `, [username, sessionId, level]);
                if (previousSubmission.rows.length > 0 && previousSubmission.rows[0].status !== 'rewrite') {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ success: false, message: '本关答案已提交' });
                }
                if (previousSubmission.rows[0]?.status === 'rewrite') {
                    const superseded = await client.query(
                        `UPDATE dictation_submissions
                         SET status = 'superseded'
                         WHERE id = $1 AND status = 'rewrite'
                         RETURNING id`,
                        [previousSubmission.rows[0].id]
                    );
                    if (superseded.rowCount !== 1) {
                        throw new Error('Dictation rewrite state changed concurrently');
                    }
                }
                const sessionVersionResult = await client.query(`
                    UPDATE dictation_sessions
                    SET version = version + 1
                    WHERE id = $1 AND username = $2 AND result = 'in_progress'
                    RETURNING version
                `, [sessionId, username]);
                if (sessionVersionResult.rows.length !== 1) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ success: false, message: '听写会话已结束' });
                }
                const sessionVersion = Number(sessionVersionResult.rows[0].version);
                const submissionResult = await client.query(
                    `INSERT INTO dictation_submissions
                        (user_id, username, word_id, word, pronunciation, definition, user_input,
                         status, level, set_id, session_id, image_path, ip_address, user_agent,
                         bank_version, session_version)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL, $12, $13, $14, $15)
                     RETURNING id`,
                    [
                        userId,
                        username,
                        wordId,
                        correctWord || null,
                        String(question.pronunciation || '').slice(0, 120) || null,
                        String(question.definition || '').slice(0, 400) || null,
                        userInput,
                        status,
                        level,
                        setId,
                        sessionId,
                        req.clientIP,
                        req.get('User-Agent'),
                        bankVersion,
                        sessionVersion
                    ]
                );
                const submissionId = submissionResult.rows[0].id;
                if (validatedImage) {
                    const uploadId = randomBytes(24).toString('hex');
                    const filename = `${uploadId}.png`;
                    await client.query(`
                        INSERT INTO dictation_uploads (
                            id, submission_id, storage_path, content_sha256,
                            byte_size, width, height, content
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    `, [
                        uploadId,
                        submissionId,
                        filename,
                        validatedImage.sha256,
                        validatedImage.buffer.length,
                        validatedImage.width,
                        validatedImage.height,
                        validatedImage.buffer
                    ]);
                    const uploadLinked = await client.query(`
                        UPDATE dictation_submissions
                        SET upload_id = $1, image_path = $2
                        WHERE id = $3
                        RETURNING id
                    `, [uploadId, `/api/dictation/submissions/${submissionId}/image`, submissionId]);
                    if (uploadLinked.rowCount !== 1) {
                        throw new Error('Dictation upload was not linked to its submission');
                    }
                }

                const nextLevel = status === 'correct'
                    ? Math.min(level + 1, 3)
                    : 1;
                const progressAdvanced = await client.query(
                    `UPDATE dictation_progress
                     SET level = $1, set_id = $2, session_id = $3,
                         question_id = NULL, question_token_hash = NULL,
                         question_issued_at = NULL, updated_at = NOW()
                     WHERE username = $4 AND session_id = $3
                     RETURNING username`,
                    [nextLevel, setId, sessionId, username]
                );
                if (progressAdvanced.rowCount !== 1) {
                    throw new Error('Dictation progress state changed during submission');
                }

                let nextQuestion = null;
                let sessionResult = null;
                if (status === 'wrong') {
                    sessionResult = 'failed';
                } else if (status === 'correct' && level >= 3) {
                    sessionResult = 'passed';
                }
                if (sessionResult) {
                    const sessionEnded = await client.query(
                        `UPDATE dictation_sessions
                         SET result = $1, ended_at = NOW()
                         WHERE id = $2 AND username = $3 AND result = 'in_progress'
                         RETURNING id`,
                        [sessionResult, sessionId, username]
                    );
                    if (sessionEnded.rowCount !== 1) {
                        throw new Error('Dictation session state changed while ending');
                    }
                    const progressCleared = await client.query(
                        `UPDATE dictation_progress
                         SET level = 1, set_id = NULL, session_id = NULL,
                             question_id = NULL, question_token_hash = NULL,
                             bank_version = NULL, question_issued_at = NULL, updated_at = NOW()
                         WHERE username = $1 AND session_id = $2
                         RETURNING username`,
                        [username, sessionId]
                    );
                    if (progressCleared.rowCount !== 1) {
                        throw new Error('Dictation progress was not cleared');
                    }
                } else {
                    const nextIssued = await issueDictationQuestion(client, {
                        username,
                        sessionId,
                        setId,
                        level: nextLevel
                    });
                    nextQuestion = {
                        level: nextLevel,
                        setId,
                        sessionId,
                        question: nextIssued.question,
                        questionToken: nextIssued.questionToken,
                        bankVersion: nextIssued.bankVersion
                    };
                }

                responseBody = {
                    success: true,
                    message: isCorrect ? '自动审核通过' : '自动审核未通过',
                    status,
                    level,
                    answer: correctWord,
                    nextQuestion
                };
                await req.finalizeIdempotency?.(client, 200, responseBody);
                await client.query('COMMIT');
            } catch (txError) {
                await client.query('ROLLBACK').catch(() => {});
                throw txError;
            } finally {
                client.release();
            }

            res.json(responseBody);
        } catch (error) {
            console.error('Dictation submit error:', error);
            res.status(500).json({ success: false, message: '提交失败' });
        }
    });


    app.post('/api/slot/play', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            const { username, betAmount } = req.body || {};
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

            const outcome = randomArrayItem(outcomes);

            const payout = Math.floor(betValue * outcome.multiplier);

            const baseAmounts = [50, 100, 150, 200];
            const amounts = baseAmounts.map((num) => Math.max(1, Math.round(num * betValue / 100)));
            const randomAmount = () => randomArrayItem(amounts);
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

            const resultTrace = randomBytes(24).toString('hex');
            await client.query(`
                INSERT INTO slot_results (
                    username, result, won, result_trace, created_at,
                    bet_amount, payout_amount, balance_before, balance_after, multiplier, game_details
                )
                VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10)
            `, [
                username,
                JSON.stringify(slotResults),
                outcome.type,
                resultTrace,
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

            const responseBody = {
                success: true,
                outcome: outcome.type,
                multiplier: outcome.multiplier,
                payout: payout,
                reels: slotResults,
                newBalance: finalBalance,
                resultTrace
            };
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');

            res.json(responseBody);

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
            const { username } = req.body || {};
            const tier = Number(req.body?.tier);

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
                    num = randomArrayItem(winningNumbers);
                    prize = `${payout} 积分`; // 使用实际中奖金额
                    matchedCount++;
                } else {
                    do {
                        num = randomInt(1, 101);
                    } while (winningNumbers.includes(num));
                    prize = `${randomArrayItem(tierRewards)} 积分`;
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

            const resultTrace = randomBytes(24).toString('hex');
            await client.query(
                `INSERT INTO scratch_results (
                    username, reward, matches_count, tier_cost, winning_numbers, slots,
                    result_trace, reward_list, tier_config, balance_before, balance_after,
                    game_details, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
                [
                    username,
                    payout,
                    matchedCount,
                    tier,
                    JSON.stringify(winningNumbers),
                    JSON.stringify(userSlots),
                    resultTrace,
                    JSON.stringify(tierRewards),
                    JSON.stringify(selectedTier),
                    betResult.balanceBefore,
                    finalBalance,
                    JSON.stringify({ outcome: outcomeType, randomBucket: Math.floor(random / 100) })
                ]
            );

            const responseBody = {
                success: true,
                reward: payout,
                payout: payout,
                outcome: outcomeType,
                matches_count: matchedCount,
                matchesCount: matchedCount,
                winning_numbers: winningNumbers,
                winningNumbers: winningNumbers,
                slots: userSlots,
                balance: finalBalance,
                resultTrace
            };
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');

            res.json(responseBody);

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
            const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1 || \':stone\', 0)) AS locked', [req.session.user.username]);
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

            const responseBody = {
                success: true,
                slots,
                newBalance: balanceResult.balance
            };
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            res.json(responseBody);
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
            const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1 || \':stone\', 0)) AS locked', [req.session.user.username]);
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

            const responseBody = {
                success: true,
                slots: newSlots,
                newBalance: balanceResult.balance
            };
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            res.json(responseBody);
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
            const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1 || \':stone\', 0)) AS locked', [req.session.user.username]);
            if (!lock.rows[0].locked) {
                await client.query('ROLLBACK');
                return res.status(429).json({ success: false, message: '操作过于频繁，请稍后重试' });
            }
            const username = req.session.user.username;
            const index = Number(req.body?.index);
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

            const responseBody = {
                success: true,
                slots: newSlots,
                newBalance: balanceResult.balance,
                replacedSlot: index,
                nextReplaceIndex
            };
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            res.json(responseBody);
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
            const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1 || \':stone\', 0)) AS locked', [req.session.user.username]);
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
                if (balanceResult.rows.length !== 1) {
                    throw new Error('Stone owner disappeared during settlement');
                }
                newBalance = parseMoney(balanceResult.rows[0].balance, 'user balance', { min: 0 });
            }

            await logStoneAction({
                username,
                actionType: 'redeem',
                reward,
                beforeSlots,
                afterSlots: newSlots
            }, client);

            const responseBody = {
                success: true,
                slots: newSlots,
                reward,
                newBalance
            };
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            res.json(responseBody);
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
            const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1 || \':flip\', 0)) AS locked', [req.session.user.username]);
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

            const responseBody = {
                success: true,
                nextCost: flipCosts[0],
                previousReward,
                previousGood: previousState.good_count,
                previousBad: previousState.bad_count,
                newBalance
            };
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            res.json(responseBody);
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
            const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1 || \':flip\', 0)) AS locked', [req.session.user.username]);
            if (!lock.rows[0].locked) {
                await client.query('ROLLBACK');
                return res.status(429).json({ success: false, message: '操作过于频繁，请稍后再试' });
            }
            const username = req.session.user.username;
            const cardIndex = Number(req.body?.cardIndex);

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

            const responseBody = {
                success: true,
                cardIndex,
                cardType,
                goodCount: state.good_count,
                badCount: state.bad_count,
                ended: state.ended,
                reward,
                newBalance: rewardBalance
            };
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            res.json(responseBody);
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
            const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1 || \':flip\', 0)) AS locked', [req.session.user.username]);
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

            if (!Number.isSafeInteger(state.good_count) || state.good_count < 1) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '至少翻到一张好牌后才能退出' });
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

            const responseBody = {
                success: true,
                reward,
                newBalance: rewardResult.balance
            };
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            res.json(responseBody);
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
        const tierKey = String(req.body?.tier || '').trim();
        const countNum = Number(req.body?.count);

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

        const blindboxPool = blindboxPools.get(tierKey);

        if (!blindboxPool.length) {
            return res.status(500).json({ success: false, message: '礼物池为空' });
        }

        const totalCost = tier.cost * countNum;
        let rewards = [];
        let sortedRewards = [];

        let client;
        let balanceAfter = null;
        let batchId = null;
        let firstInventoryId = null;
        let bilibiliRoomId = null;
        try {
            client = await pool.connect();
            await client.query('BEGIN');

            const lock = await client.query(
                'SELECT pg_try_advisory_xact_lock(hashtextextended($1 || \':blindbox\', 0)) AS locked',
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

            for (let i = 0; i < countNum; i += 1) {
                const reward = pickBlindboxReward(blindboxPool);
                if (!reward) throw new Error('Blindbox reward selection failed');
                rewards.push({
                    giftId: String(reward.giftId),
                    name: reward.name,
                    value: Number(reward.value) || 0
                });
            }
            sortedRewards = rewards
                .map((item, index) => ({ ...item, originalIndex: index }))
                .sort((a, b) => {
                    if (b.value !== a.value) return b.value - a.value;
                    return a.originalIndex - b.originalIndex;
                });
            const totalRewardValue = sortedRewards.reduce(
                (sum, item) => sum + (Number(item.value) || 0),
                0
            );

            const roomResult = await client.query(
                'SELECT bilibili_room_id FROM users WHERE username = $1',
                [username]
            );
            bilibiliRoomId = roomResult.rows[0]?.bilibili_room_id || null;
            const expiresAt = bilibiliRoomId
                ? "((date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai') + interval '1 day 23 hours 59 minutes 59 seconds') AT TIME ZONE 'Asia/Shanghai')"
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
                        NOW(),
                        NOW(),
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
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
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

            if (bilibiliRoomId && firstInventoryId) {
                await client.query(`
                    INSERT INTO delivery_outbox (event_type, aggregate_id, payload)
                    VALUES ('enqueue_inventory', $1, $2)
                    ON CONFLICT (event_type, aggregate_id) DO NOTHING
                `, [
                    firstInventoryId,
                    JSON.stringify({ username, source: 'blindbox', batchId })
                ]);
            }

            const durableResponse = {
                success: true,
                balanceAfter,
                batchId,
                rewards,
                queued: Boolean(bilibiliRoomId && firstInventoryId),
                enqueueMessage: bilibiliRoomId ? '礼物已加入可恢复发送队列' : null
            };
            await req.finalizeIdempotency?.(client, 200, durableResponse);
            await client.query('COMMIT');
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('Blindbox open error:', error);
            return res.status(500).json({ success: false, message: '服务器错误' });
        } finally {
            client?.release();
        }

        return res.json({
            success: true,
            balanceAfter,
            batchId,
            rewards,
            queued: Boolean(bilibiliRoomId && firstInventoryId),
            enqueueMessage: bilibiliRoomId ? '礼物已加入可恢复发送队列' : null
        });
    });

    // 决斗挑战 Duel 游戏API
    app.post('/api/duel/play', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection, async (req, res) => {
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            const username = req.session.user.username;
            const giftType = typeof req.body?.giftType === 'string'
                ? req.body.giftType.trim()
                : '';
            const power = Number(req.body?.power);

            if (!Object.hasOwn(duelRewards, giftType)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '无效的奖品档位' });
            }
            const duelReward = duelRewards[giftType];

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
            const reward = success ? duelReward.reward : 0;

            const balanceAfterBet = balanceResult.balance;
            let newBalance = balanceAfterBet;
            if (success) {
                const rewardResult = await BalanceLogger.updateBalance({
                    username,
                    amount: reward,
                    operationType: 'duel_win',
                    description: `决斗挑战获胜：${duelReward.name} ${reward} 积分`,
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
                ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
                [
                    username,
                    giftType,
                    reward,
                    power,
                    cost,
                    success
                ]
            );

            const responseBody = {
                success: true,
                duelSuccess: success,
                reward,
                cost,
                balanceAfterBet,
                balanceAfterReward: newBalance,
                newBalance
            };
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');

            if (req.session.user) {
                req.session.user.balance = newBalance;
            }
            res.json(responseBody);
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
    app.get('/api/game-records/:gameType', requireLogin, requireAuthorized, readHeavyRateLimit, async (req, res) => {
        try {
            const { gameType } = req.params;
            const page = Math.min(500, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
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
