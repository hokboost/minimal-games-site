'use strict';

const { randomInt } = require('node:crypto');

const USERNAME_PATTERN = /^[\p{L}\p{N}_-]{3,32}$/u;
const INTEGER_PATTERN = /^\d+$/;

function normalizeUsername(value) {
    return typeof value === 'string' ? value.normalize('NFKC').trim() : '';
}

function parseId(value) {
    const normalized = typeof value === 'number' ? String(value) : String(value || '').trim();
    if (!INTEGER_PATTERN.test(normalized)) return null;
    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function enabledUsers() {
    const configured = String(process.env.TASK_CARDS_ENABLED_USERS || 'hokboost')
        .split(',')
        .map(normalizeUsername)
        .filter((username) => USERNAME_PATTERN.test(username));
    return new Set(configured.length > 0 ? configured : ['hokboost']);
}

module.exports = function registerTaskRoutes(app, deps) {
    const requireFunction = require('../lib/require-function');
    const { scopedAuditRequestId } = require('../lib/admin-audit-failure');
    const {
        pool,
        BalanceLogger,
        generateCSRFToken,
        requireLogin,
        requireAuthorized,
        requireAdmin,
        requireRecentAdminAuth,
        requireCSRF,
        security
    } = deps;

    if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
        throw new TypeError('Task routes require a database pool');
    }
    requireFunction({ generateCSRFToken }, 'generateCSRFToken', 'task route dependency');
    const basicRateLimit = requireFunction(security, 'basicRateLimit', 'security middleware');
    const userActionRateLimit = requireFunction(security, 'userActionRateLimit', 'security middleware');
    const adminRateLimit = requireFunction(security, 'adminRateLimit', 'security middleware');
    const adminStrictLimit = requireFunction(security, 'adminStrictLimit', 'security middleware');
    const csrfProtection = requireFunction({ requireCSRF }, 'requireCSRF', 'route dependency');
    const userGuards = [requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit];
    const adminGuards = [requireLogin, requireAdmin, adminRateLimit, adminStrictLimit];
    const adminWriteGuards = [...adminGuards, requireRecentAdminAuth];

    const isEnabled = (username) => enabledUsers().has(normalizeUsername(username));
    const localized = (row, key, lang) => row[`${key}_${lang === 'zh' ? 'zh' : 'en'}`];

    function mapCard(row, lang) {
        return {
            id: Number(row.id),
            templateId: Number(row.template_id),
            status: row.status,
            title: localized(row, 'title', lang),
            rewardPoints: Number(row.reward_points),
            completeLabel: localized(row, 'complete_label', lang),
            progressLabel: localized(row, 'progress_label', lang),
            abandonLabel: localized(row, 'abandon_label', lang),
            encouragement: localized(row, 'encouragement', lang),
            assignedAt: row.assigned_at,
            claimedAt: row.claimed_at,
            dueAt: row.due_at,
            submittedAt: row.submitted_at,
            progressExtensions: Number(row.progress_extensions || 0)
        };
    }

    function mapEvent(row) {
        return {
            id: Number(row.id),
            title: row.title,
            description: row.description,
            rewardPoints: Number(row.reward_points),
            status: row.status,
            assignedAt: row.assigned_at,
            dueAt: row.due_at,
            submittedAt: row.submitted_at
        };
    }

    async function replenishOffers(client, username, assignedBy) {
        const existing = await client.query(`
            SELECT template_id
            FROM task_card_assignments
            WHERE username = $1 AND status IN ('offered', 'claimed', 'pending_approval')
            ORDER BY id
            FOR UPDATE
        `, [username]);
        let missing = Math.max(0, 3 - existing.rows.length);
        if (missing === 0) return;
        const outstandingTemplateIds = existing.rows.map((row) => Number(row.template_id));
        const recentTerminal = await client.query(`
            SELECT template_id
            FROM task_card_assignments
            WHERE username = $1 AND status IN ('approved', 'abandoned', 'expired')
            ORDER BY resolved_at DESC, id DESC
            LIMIT 1
        `, [username]);
        const excluded = [
            ...outstandingTemplateIds,
            ...recentTerminal.rows.map((row) => Number(row.template_id))
        ];
        let candidates = await client.query(`
            SELECT id
            FROM task_card_templates
            WHERE active = TRUE
              AND NOT (id = ANY($1::bigint[]))
            ORDER BY id
        `, [excluded]);
        if (candidates.rowCount === 0) {
            candidates = await client.query(`
                SELECT id FROM task_card_templates
                WHERE active = TRUE AND NOT (id = ANY($1::bigint[]))
                ORDER BY id
            `, [outstandingTemplateIds]);
        }
        const available = candidates.rows.map((row) => Number(row.id));
        while (missing > 0 && available.length > 0) {
            const index = randomInt(available.length);
            const templateId = available.splice(index, 1)[0];
            await client.query(`
                INSERT INTO task_card_assignments (
                    username, template_id, reward_points, assigned_by
                )
                SELECT $1, id, reward_points, $3
                FROM task_card_templates
                WHERE id = $2 AND active = TRUE
            `, [username, templateId, assignedBy]);
            missing -= 1;
        }
    }

    async function normalizeExpirations(client, username) {
        await client.query(`
            UPDATE task_card_assignments
            SET status = 'expired', resolved_at = NOW()
            WHERE username = $1 AND status = 'claimed' AND due_at <= NOW()
        `, [username]);
        await client.query(`
            UPDATE event_task_assignments
            SET status = 'expired', resolved_at = NOW()
            WHERE username = $1 AND status = 'active' AND due_at <= NOW()
        `, [username]);
        if (isEnabled(username)) {
            const hasAssignmentHistory = await client.query(
                'SELECT 1 FROM task_card_assignments WHERE username = $1 LIMIT 1',
                [username]
            );
            if (hasAssignmentHistory.rowCount > 0) await replenishOffers(client, username, 'system');
        }
    }

    async function loadUserState(username, lang) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`task-cards:${username}`]);
            await normalizeExpirations(client, username);
            const [cards, events] = await Promise.all([
                client.query(`
                    SELECT a.*, t.title_zh, t.title_en,
                           t.complete_label_zh, t.complete_label_en,
                           t.progress_label_zh, t.progress_label_en,
                           t.abandon_label_zh, t.abandon_label_en,
                           t.encouragement_zh, t.encouragement_en
                    FROM task_card_assignments a
                    JOIN task_card_templates t ON t.id = a.template_id
                    WHERE a.username = $1
                      AND a.status IN ('offered', 'claimed', 'pending_approval')
                    ORDER BY CASE a.status WHEN 'claimed' THEN 0 WHEN 'pending_approval' THEN 0 ELSE 1 END,
                             a.assigned_at, a.id
                `, [username]),
                client.query(`
                    SELECT id, title, description, reward_points, status,
                           assigned_at, due_at, submitted_at
                    FROM event_task_assignments
                    WHERE username = $1 AND status IN ('active', 'pending_approval')
                    ORDER BY due_at, id
                `, [username])
            ]);
            await client.query('COMMIT');
            const mappedCards = cards.rows.map((row) => mapCard(row, lang));
            return {
                featureEnabled: isEnabled(username),
                canClaim: !mappedCards.some((card) => ['claimed', 'pending_approval'].includes(card.status)),
                cards: isEnabled(username) ? mappedCards : [],
                eventTasks: events.rows.map(mapEvent)
            };
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    }

    async function auditAdmin(client, req, action, targetUsername, details) {
        const adminUsername = req.session.user.username;
        await client.query(`
            INSERT INTO admin_audit_log (
                request_id, admin_username, action, target_username, details, ip_address
            ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            scopedAuditRequestId(adminUsername, req.idempotencyKey || req.requestId),
            adminUsername,
            action,
            targetUsername,
            JSON.stringify({ ...details, result: 'success', authStrength: 'recent_password' }),
            req.clientIP
        ]);
    }

    app.get('/tasks', ...userGuards, async (req, res) => {
        try {
            const username = req.session.user.username;
            const [state, balanceResult] = await Promise.all([
                loadUserState(username, res.locals.lang),
                pool.query('SELECT balance FROM users WHERE username = $1', [username])
            ]);
            res.set('Cache-Control', 'private, no-store');
            return res.render('tasks', {
                title: res.locals.lang === 'zh' ? '任务卡片' : 'Task Cards',
                user: req.session.user,
                balance: balanceResult.rows[0]?.balance ?? null,
                csrfToken: generateCSRFToken(req),
                initialTaskState: state
            });
        } catch (error) {
            console.error('任务卡页面加载失败:', error);
            return res.status(503).send(res.locals.lang === 'zh' ? '任务卡暂时无法加载' : 'Task cards are temporarily unavailable');
        }
    });

    app.get('/api/tasks/state', ...userGuards, async (req, res) => {
        try {
            res.set('Cache-Control', 'private, no-store');
            return res.json({
                success: true,
                ...(await loadUserState(req.session.user.username, res.locals.lang))
            });
        } catch (error) {
            console.error('读取任务卡失败:', error);
            return res.status(503).json({ success: false, message: '任务卡暂时无法加载' });
        }
    });

    app.post('/api/tasks/claim', ...userGuards, csrfProtection, async (req, res) => {
        const assignmentId = parseId(req.body?.assignmentId);
        const username = req.session.user.username;
        if (!isEnabled(username)) return res.status(403).json({ success: false, code: 'FEATURE_DISABLED', message: '任务卡尚未对这个账号开放' });
        if (!assignmentId) return res.status(400).json({ success: false, message: '任务卡参数无效' });
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`task-cards:${username}`]);
            await normalizeExpirations(client, username);
            const active = await client.query(`
                SELECT 1 FROM task_card_assignments
                WHERE username = $1 AND status IN ('claimed', 'pending_approval')
                LIMIT 1 FOR UPDATE
            `, [username]);
            if (active.rowCount > 0) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, code: 'ACTIVE_TASK_EXISTS', message: '先完成或放弃当前任务，才能领取下一张哦' });
            }
            const claimed = await client.query(`
                UPDATE task_card_assignments
                SET status = 'claimed', claimed_at = NOW(), due_at = NOW() + INTERVAL '7 days'
                WHERE id = $1 AND username = $2 AND status = 'offered'
                RETURNING id
            `, [assignmentId, username]);
            if (claimed.rowCount !== 1) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, code: 'TASK_CHANGED', message: '这张任务卡的状态已经变化，请刷新' });
            }
            const responseBody = { success: true, state: await loadStateWithin(client, username, res.locals.lang) };
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            return res.json(responseBody);
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('领取任务卡失败:', error);
            return res.status(500).json({ success: false, message: '领取失败，请稍后再试' });
        } finally {
            client.release();
        }
    });

    async function loadStateWithin(client, username, lang) {
        const [cards, events] = await Promise.all([
            client.query(`
                SELECT a.*, t.title_zh, t.title_en,
                       t.complete_label_zh, t.complete_label_en,
                       t.progress_label_zh, t.progress_label_en,
                       t.abandon_label_zh, t.abandon_label_en,
                       t.encouragement_zh, t.encouragement_en
                FROM task_card_assignments a JOIN task_card_templates t ON t.id = a.template_id
                WHERE a.username = $1 AND a.status IN ('offered', 'claimed', 'pending_approval')
                ORDER BY CASE a.status WHEN 'claimed' THEN 0 WHEN 'pending_approval' THEN 0 ELSE 1 END, a.assigned_at, a.id
            `, [username]),
            client.query(`
                SELECT id, title, description, reward_points, status, assigned_at, due_at, submitted_at
                FROM event_task_assignments
                WHERE username = $1 AND status IN ('active', 'pending_approval')
                ORDER BY due_at, id
            `, [username])
        ]);
        const mappedCards = cards.rows.map((row) => mapCard(row, lang));
        return {
            featureEnabled: isEnabled(username),
            canClaim: !mappedCards.some((card) => ['claimed', 'pending_approval'].includes(card.status)),
            cards: isEnabled(username) ? mappedCards : [],
            eventTasks: events.rows.map(mapEvent)
        };
    }

    app.post('/api/tasks/action', ...userGuards, csrfProtection, async (req, res) => {
        const assignmentId = parseId(req.body?.assignmentId);
        const action = typeof req.body?.action === 'string' ? req.body.action : '';
        const username = req.session.user.username;
        if (!isEnabled(username)) return res.status(403).json({ success: false, code: 'FEATURE_DISABLED', message: '任务卡尚未对这个账号开放' });
        if (!assignmentId || !['complete', 'almost', 'abandon'].includes(action)) {
            return res.status(400).json({ success: false, message: '任务卡操作无效' });
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`task-cards:${username}`]);
            const locked = await client.query(`
                SELECT a.id, a.status, a.due_at, a.progress_extensions,
                       t.encouragement_zh, t.encouragement_en
                FROM task_card_assignments a JOIN task_card_templates t ON t.id = a.template_id
                WHERE a.id = $1 AND a.username = $2
                FOR UPDATE OF a
            `, [assignmentId, username]);
            const card = locked.rows[0];
            if (!card || card.status !== 'claimed' || new Date(card.due_at) <= new Date()) {
                if (card?.status === 'claimed') {
                    await client.query("UPDATE task_card_assignments SET status = 'expired', resolved_at = NOW() WHERE id = $1", [assignmentId]);
                    await replenishOffers(client, username, 'system');
                    await client.query('COMMIT');
                } else {
                    await client.query('ROLLBACK');
                }
                return res.status(409).json({ success: false, code: 'TASK_CHANGED', message: '任务已过期或状态已经变化' });
            }
            let encouragement = null;
            if (action === 'complete') {
                await client.query(`
                    UPDATE task_card_assignments
                    SET status = 'pending_approval', submitted_at = NOW()
                    WHERE id = $1
                `, [assignmentId]);
            } else if (action === 'almost') {
                if (Number(card.progress_extensions) >= 1) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ success: false, code: 'ALREADY_EXTENDED', message: '这张卡已经延长过一次啦，继续加油完成它吧' });
                }
                await client.query(`
                    UPDATE task_card_assignments
                    SET due_at = due_at + INTERVAL '3 days', progress_extensions = progress_extensions + 1
                    WHERE id = $1
                `, [assignmentId]);
                encouragement = res.locals.lang === 'zh' ? card.encouragement_zh : card.encouragement_en;
            } else {
                await client.query(`
                    UPDATE task_card_assignments
                    SET status = 'abandoned', resolved_at = NOW()
                    WHERE id = $1
                `, [assignmentId]);
                await replenishOffers(client, username, 'system');
            }
            const responseBody = {
                success: true,
                encouragement,
                state: await loadStateWithin(client, username, res.locals.lang)
            };
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            return res.json(responseBody);
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('更新任务卡失败:', error);
            return res.status(500).json({ success: false, message: '操作失败，请稍后再试' });
        } finally {
            client.release();
        }
    });

    app.post('/api/tasks/event-complete', ...userGuards, csrfProtection, async (req, res) => {
        const assignmentId = parseId(req.body?.assignmentId);
        const username = req.session.user.username;
        if (!assignmentId) return res.status(400).json({ success: false, message: '活动任务参数无效' });
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query(`
                UPDATE event_task_assignments
                SET status = 'pending_approval', submitted_at = NOW()
                WHERE id = $1 AND username = $2 AND status = 'active' AND due_at > NOW()
                RETURNING id
            `, [assignmentId, username]);
            if (result.rowCount !== 1) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, code: 'TASK_CHANGED', message: '活动任务已过期或状态已经变化' });
            }
            const responseBody = { success: true, state: await loadStateWithin(client, username, res.locals.lang) };
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            return res.json(responseBody);
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('提交活动任务失败:', error);
            return res.status(500).json({ success: false, message: '提交失败，请稍后再试' });
        } finally {
            client.release();
        }
    });

    app.get('/api/admin/tasks', ...adminGuards, async (req, res) => {
        try {
            const [templates, pendingCards, pendingEvents] = await Promise.all([
                pool.query(`SELECT id, slug, title_zh, title_en, reward_points FROM task_card_templates WHERE active = TRUE ORDER BY id`),
                pool.query(`
                    SELECT a.id, a.username, a.reward_points, a.submitted_at, t.title_zh, t.title_en
                    FROM task_card_assignments a JOIN task_card_templates t ON t.id = a.template_id
                    WHERE a.status = 'pending_approval' ORDER BY a.submitted_at, a.id LIMIT 100
                `),
                pool.query(`
                    SELECT id, username, title, description, reward_points, submitted_at
                    FROM event_task_assignments WHERE status = 'pending_approval'
                    ORDER BY submitted_at, id LIMIT 100
                `)
            ]);
            res.set('Cache-Control', 'private, no-store');
            return res.json({ success: true, templates: templates.rows, pendingCards: pendingCards.rows, pendingEvents: pendingEvents.rows });
        } catch (error) {
            console.error('管理员读取任务失败:', error);
            return res.status(503).json({ success: false, message: '任务管理暂不可用' });
        }
    });

    app.post('/api/admin/tasks/assign-offers', ...adminWriteGuards, csrfProtection, async (req, res) => {
        const username = normalizeUsername(req.body?.username);
        const templateIds = Array.isArray(req.body?.templateIds) ? req.body.templateIds.map(parseId) : [];
        if (!USERNAME_PATTERN.test(username) || templateIds.length !== 3 || templateIds.includes(null) || new Set(templateIds).size !== 3) {
            return res.status(400).json({ success: false, message: '请选择一个有效用户和三张不同的任务卡' });
        }
        if (!isEnabled(username)) return res.status(403).json({ success: false, message: '该用户暂未加入任务卡测试名单' });
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`task-cards:${username}`]);
            const target = await client.query('SELECT deactivated FROM users WHERE username = $1 FOR UPDATE', [username]);
            if (target.rowCount !== 1 || target.rows[0].deactivated) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: '用户不存在或已停用' });
            }
            const active = await client.query("SELECT 1 FROM task_card_assignments WHERE username = $1 AND status IN ('claimed', 'pending_approval') FOR UPDATE", [username]);
            if (active.rowCount > 0) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '用户已有进行中或待审核任务，不能替换候选卡' });
            }
            const templates = await client.query('SELECT id, reward_points FROM task_card_templates WHERE id = ANY($1::bigint[]) AND active = TRUE', [templateIds]);
            if (templates.rowCount !== 3) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '任务模板不存在或已停用' });
            }
            await client.query("UPDATE task_card_assignments SET status = 'abandoned', resolved_at = NOW() WHERE username = $1 AND status = 'offered'", [username]);
            const rewards = new Map(templates.rows.map((row) => [Number(row.id), Number(row.reward_points)]));
            for (const templateId of templateIds) {
                await client.query(`
                    INSERT INTO task_card_assignments (username, template_id, reward_points, assigned_by)
                    VALUES ($1, $2, $3, $4)
                `, [username, templateId, rewards.get(templateId), req.session.user.username]);
            }
            const responseBody = { success: true, message: '三张任务卡已分配' };
            await auditAdmin(client, req, 'assign_task_card_offers', username, { templateIds });
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            return res.json(responseBody);
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('分配任务卡失败:', error);
            return res.status(500).json({ success: false, message: '分配失败' });
        } finally {
            client.release();
        }
    });

    app.post('/api/admin/tasks/assign-event', ...adminWriteGuards, csrfProtection, async (req, res) => {
        const username = normalizeUsername(req.body?.username);
        const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
        const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
        const rewardPoints = Number(req.body?.rewardPoints);
        const days = req.body?.days === undefined ? 7 : Number(req.body.days);
        if (!USERNAME_PATTERN.test(username) || !title || title.length > 240 || !description || description.length > 2000
            || !Number.isSafeInteger(rewardPoints) || rewardPoints < 1 || rewardPoints > 100000000
            || !Number.isSafeInteger(days) || days < 1 || days > 90) {
            return res.status(400).json({ success: false, message: '活动任务参数无效' });
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const target = await client.query('SELECT deactivated FROM users WHERE username = $1 FOR UPDATE', [username]);
            if (target.rowCount !== 1 || target.rows[0].deactivated) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: '用户不存在或已停用' });
            }
            const inserted = await client.query(`
                INSERT INTO event_task_assignments (
                    username, title, description, reward_points, assigned_by, due_at
                ) VALUES ($1, $2, $3, $4, $5, NOW() + ($6 * INTERVAL '1 day'))
                RETURNING id, due_at
            `, [username, title, description, rewardPoints, req.session.user.username, days]);
            const responseBody = { success: true, message: '限时活动任务已分配', task: mapEvent({ ...inserted.rows[0], title, description, reward_points: rewardPoints, status: 'active', assigned_at: new Date().toISOString() }) };
            await auditAdmin(client, req, 'assign_event_task', username, { taskId: Number(inserted.rows[0].id), rewardPoints, days });
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            return res.json(responseBody);
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('分配活动任务失败:', error);
            return res.status(500).json({ success: false, message: '活动任务分配失败' });
        } finally {
            client.release();
        }
    });

    app.post('/api/admin/tasks/review', ...adminWriteGuards, csrfProtection, async (req, res) => {
        const assignmentId = parseId(req.body?.assignmentId);
        const taskType = req.body?.taskType;
        const decision = req.body?.decision;
        const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : '';
        if (!assignmentId || !['card', 'event'].includes(taskType) || !['approve', 'return'].includes(decision)) {
            return res.status(400).json({ success: false, message: '审核参数无效' });
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const table = taskType === 'card' ? 'task_card_assignments' : 'event_task_assignments';
            const result = await client.query(`
                SELECT id, username, reward_points
                FROM ${table}
                WHERE id = $1 AND status = 'pending_approval'
                FOR UPDATE
            `, [assignmentId]);
            if (result.rowCount !== 1) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: '任务已被审核或状态已经变化' });
            }
            const task = result.rows[0];
            if (decision === 'approve') {
                const balanceResult = await BalanceLogger.updateBalance({
                    username: task.username,
                    amount: Number(task.reward_points),
                    operationType: taskType === 'card' ? 'task_card_reward' : 'event_task_reward',
                    description: taskType === 'card' ? '任务卡审核通过奖励' : '限时活动任务审核通过奖励',
                    gameData: { taskType, assignmentId },
                    ipAddress: req.clientIP,
                    userAgent: req.userAgent,
                    requestId: req.idempotencyKey,
                    requireSufficientBalance: false,
                    client,
                    managedTransaction: true
                });
                if (!balanceResult.success) throw new Error('Task reward posting failed');
                await client.query(`
                    UPDATE ${table}
                    SET status = 'approved', resolved_at = NOW(), reviewed_by = $2, review_note = $3
                    WHERE id = $1
                `, [assignmentId, req.session.user.username, note || null]);
                if (taskType === 'card') await replenishOffers(client, task.username, req.session.user.username);
            } else {
                if (taskType === 'card') {
                    await client.query(`
                        UPDATE task_card_assignments
                        SET status = 'claimed', submitted_at = NULL,
                            due_at = GREATEST(due_at, NOW()) + INTERVAL '3 days',
                            reviewed_by = $2, review_note = $3
                        WHERE id = $1
                    `, [assignmentId, req.session.user.username, note || null]);
                } else {
                    await client.query(`
                        UPDATE event_task_assignments
                        SET status = 'active', submitted_at = NULL,
                            due_at = GREATEST(due_at, NOW()) + INTERVAL '3 days',
                            reviewed_by = $2, review_note = $3
                        WHERE id = $1
                    `, [assignmentId, req.session.user.username, note || null]);
                }
            }
            const responseBody = { success: true, message: decision === 'approve' ? '审核通过，奖励已到账' : '任务已退回并延长3天' };
            await auditAdmin(client, req, decision === 'approve' ? 'approve_task_reward' : 'return_task_submission', task.username, { taskType, assignmentId, note });
            await req.finalizeIdempotency?.(client, 200, responseBody);
            await client.query('COMMIT');
            return res.json(responseBody);
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('审核任务失败:', error);
            return res.status(500).json({ success: false, message: '审核失败' });
        } finally {
            client.release();
        }
    });
};
