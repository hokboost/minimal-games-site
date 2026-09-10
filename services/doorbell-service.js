'use strict';

const { createHash, randomInt, randomUUID } = require('node:crypto');
const { parseMoney } = require('../lib/integer-money');
const { PRIZES, PILOT_USER_ID, canPlayDoorbell, selectSongs, songById, isCorrect, normalizeAnswer, prize } = require('../domain/games/doorbell');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class DoorbellError extends Error {
    constructor(code, status, message) { super(message); this.code = code; this.status = status; }
}
function fail(code, status, message) { throw new DoorbellError(code, status, message); }
function uuid(value) { if (typeof value !== 'string' || !UUID.test(value)) fail('INVALID_INPUT', 400, '请求编号无效，请刷新后重试'); return value.toLowerCase(); }
function validate(raw, start) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('INVALID_INPUT', 400, '请求格式无效');
    const keys = start ? ['commandId', 'csrfToken'] : ['commandId', 'runId', 'revision', 'type', 'answer', 'csrfToken'];
    if (Object.keys(raw).some(key => !keys.includes(key))) fail('INVALID_INPUT', 400, '请求包含无效字段');
    const value = { commandId: uuid(raw.commandId) };
    if (start) return value;
    if (!Number.isSafeInteger(raw.revision) || raw.revision < 0
        || !['listen', 'answer', 'original', 'hint', 'next', 'cashout'].includes(raw.type)) fail('INVALID_INPUT', 400, '操作无效');
    Object.assign(value, { runId: uuid(raw.runId), revision: raw.revision, type: raw.type });
    if (raw.type === 'answer') {
        if (typeof raw.answer !== 'string' || raw.answer.length > 100 || !normalizeAnswer(raw.answer)) fail('INVALID_ANSWER', 400, '请填写歌名（最多 100 个字符）');
        value.answer = raw.answer;
    } else if (raw.answer !== undefined) fail('INVALID_INPUT', 400, '此操作不接受答案');
    return value;
}

function project(run, balance, remainingAttempts = null) {
    if (!run) return { success: true, balance, remainingAttempts, prizes: PRIZES, run: null };
    const door = run.status === 'playing' ? run.completed + 1 : Math.max(1, run.results.at(-1)?.door || run.completed);
    const audio = (n, kind) => `/api/doorbell/runs/${run.id}/audio/${n}/${kind}`;
    const results = run.results.map(result => {
        const song = songById(run.song_ids[result.door - 1]);
        return { ...result, title: song.title, artist: song.artist, credit: song.credit, originalUrl: audio(result.door, 'chorus') };
    });
    return { success: true, balance, remainingAttempts, prizes: PRIZES, run: {
        id: run.id, status: run.status, revision: run.revision, door, completed: run.completed,
        pot: prize(run.completed), settledAmount: Number(run.settled_amount), results,
        help: { originalUsed: run.original_door !== null, hintUsed: run.hint_door !== null },
        current: run.status === 'playing' ? {
            bellPlayed: (run.bell_doors || []).includes(door),
            hint: run.hint_door === door ? run.hint : null
        } : null
    } };
}

class DoorbellService {
    constructor({ pool, balanceLogger, rng = randomInt }) { this.pool = pool; this.balanceLogger = balanceLogger; this.rng = rng; }

    async transaction(username, work) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            // Lock the account first, consistently with other money-changing games.
            const account = (await client.query(`SELECT id,username,balance,authorized,is_admin,deactivated,account_locked
                FROM users WHERE username=$1 FOR UPDATE`, [username])).rows[0];
            if (!canPlayDoorbell(account)) fail('NOT_FOUND', 404, '游戏尚未开放');
            account.balance = parseMoney(account.balance, 'balance', { min: 0 });
            account.remainingAttempts = account.is_admin ? null : await this.ensureAttempts(client, account.id);
            const result = await work(client, account);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK'); throw error;
        } finally { client.release(); }
    }

    async findRun(client, account, id) {
        const run = (await client.query('SELECT * FROM doorbell_runs WHERE id=$1 AND user_id=$2 FOR UPDATE', [uuid(id), account.id])).rows[0];
        if (!run) fail('NOT_FOUND', 404, '本轮闯关不存在');
        return run;
    }

    async state(username) {
        return this.transaction(username, async (client, account) => {
            const run = (await client.query(`SELECT * FROM doorbell_runs WHERE user_id=$1
                ORDER BY created_at DESC, id DESC LIMIT 1`, [account.id])).rows[0];
            return project(run, account.balance, account.remainingAttempts);
        });
    }

    async command(username, raw, start = false, context = {}) {
        const input = validate(raw, start);
        const hash = createHash('sha256').update(JSON.stringify({ start, ...input })).digest('hex');
        return this.transaction(username, async (client, account) => {
            const receipt = (await client.query('SELECT request_hash,response FROM doorbell_commands WHERE user_id=$1 AND command_id=$2', [account.id, input.commandId])).rows[0];
            if (receipt) {
                if (receipt.request_hash !== hash) fail('COMMAND_CONFLICT', 409, '操作编号已使用，请刷新后重试');
                // Older receipts may point the reveal player at the former 15-second clip.
                // Upgrade only the presentation URL; preserve the committed outcome and money.
                const response = receipt.response;
                if (response.remainingAttempts === undefined) response.remainingAttempts = account.remainingAttempts;
                if (response.run) response.run.results = response.run.results.map(result => ({ ...result,
                    originalUrl: `/api/doorbell/runs/${response.run.id}/audio/${result.door}/chorus` }));
                return response;
            }
            let run;
            let playback = null;
            if (start) {
                run = (await client.query(`SELECT * FROM doorbell_runs WHERE user_id=$1 AND status IN ('playing','revealed') FOR UPDATE`, [account.id])).rows[0];
                if (!run) {
                    if (!account.is_admin && account.remainingAttempts < 1) fail('NO_ATTEMPTS', 403, '闯关次数已用完，请联系管理员增加次数');
                    run = (await client.query(`INSERT INTO doorbell_runs(id,user_id,song_ids)
                        VALUES($1,$2,$3::JSONB) RETURNING *`, [input.commandId, account.id, JSON.stringify(selectSongs(this.rng))])).rows[0];
                    if (!account.is_admin) {
                        const before = account.remainingAttempts;
                        account.remainingAttempts--;
                        await client.query('UPDATE doorbell_attempts SET remaining=$2,updated_at=NOW() WHERE user_id=$1', [account.id, account.remainingAttempts]);
                        await client.query(`INSERT INTO doorbell_attempt_logs(command_id,actor_user_id,target_user_id,request_hash,
                            amount,remaining_before,remaining_after,reason,run_id) VALUES($1,$2,$2,$3,-1,$4,$5,'开始闯关',$6)`,
                        [input.commandId, account.id, hash, before, account.remainingAttempts, run.id]);
                    }
                }
            } else {
                run = await this.findRun(client, account, input.runId);
                if (run.revision !== input.revision) fail('STALE_STATE', 409, '进度已更新，请刷新本轮进度后继续');
                if (!['playing', 'revealed'].includes(run.status)) fail('RUN_FINISHED', 409, '本轮已经结束');
                const door = run.completed + 1;
                const song = songById(run.song_ids[Math.min(door - 1, 7)]);
                if (input.type === 'listen') {
                    if (run.status !== 'playing') fail('INVALID_STATE', 409, '本题已经揭晓');
                    if (run.bell_doors.includes(door)) fail('AUDIO_USED', 409, '本扇门的门铃已经播放过了');
                    run.bell_doors.push(door);
                    playback = await this.grantPlayback(client, run, door, 'bell');
                } else if (input.type === 'answer') {
                    if (run.status !== 'playing') fail('INVALID_STATE', 409, '请先进入下一扇门');
                    const correct = isCorrect(song, input.answer);
                    run.results.push({ door, correct });
                    if (correct) run.completed++;
                    run.status = correct ? (run.completed === 8 ? 'won' : 'revealed') : 'failed';
                } else if (input.type === 'hint' || input.type === 'original') {
                    if (run.status !== 'playing') fail('INVALID_STATE', 409, '本题已经揭晓');
                    const field = input.type === 'hint' ? 'hint_door' : 'original_door';
                    if (run[field] !== null) fail('HELP_USED', 409, '这个求助本轮已使用');
                    run[field] = door;
                    if (input.type === 'original') playback = await this.grantPlayback(client, run, door, 'original');
                    if (input.type === 'hint') {
                        const chars = Array.from(song.title);
                        const index = this.rng(chars.length);
                        run.hint = { length: chars.length, index, character: chars[index] };
                    }
                } else if (input.type === 'next') {
                    if (run.status !== 'revealed') fail('INVALID_STATE', 409, '答对本题后才能进入下一扇门');
                    run.status = 'playing';
                } else if (input.type === 'cashout') {
                    // A player may also collect their already-earned pot after refreshing/entering the next door.
                    run.status = 'cashed_out';
                }
                if (['failed', 'won', 'cashed_out'].includes(run.status)) {
                    run.settled_amount = prize(run.completed);
                    run.settled_at = new Date();
                    if (run.settled_amount > 0) {
                        const after = parseMoney(account.balance + run.settled_amount, 'new balance', { min: 0 });
                        await client.query('UPDATE users SET balance=$1 WHERE id=$2', [after, account.id]);
                        await this.balanceLogger.log({ username, operationType: 'doorbell_reward', amount: run.settled_amount,
                            balanceBefore: account.balance, balanceAfter: after,
                            description: `开门大吉：通过 ${run.completed} 扇门，${run.status === 'won' ? '全部通关' : '本轮结算'}`,
                            gameData: { runId: run.id, completed: run.completed, status: run.status },
                            ipAddress: context.ipAddress || null, userAgent: context.userAgent || null,
                            client, managedTransaction: true });
                        account.balance = after;
                    }
                }
                run.revision++;
                await client.query(`UPDATE doorbell_runs SET status=$2,completed=$3,revision=$4,original_door=$5,
                    hint_door=$6,hint=$7::JSONB,results=$8::JSONB,settled_amount=$9,settled_at=$10,bell_doors=$11,updated_at=NOW() WHERE id=$1`,
                [run.id, run.status, run.completed, run.revision, run.original_door, run.hint_door,
                    run.hint === null ? null : JSON.stringify(run.hint), JSON.stringify(run.results), run.settled_amount, run.settled_at, run.bell_doors]);
            }
            const response = project(run, account.balance, account.remainingAttempts);
            if (playback) response.playback = playback;
            await client.query(`INSERT INTO doorbell_commands(user_id,command_id,request_hash,run_id,response)
                VALUES($1,$2,$3,$4,$5::JSONB)`, [account.id, input.commandId, hash, run.id, JSON.stringify(response)]);
            return response;
        });
    }

    async ensureAttempts(client, userId) {
        await client.query(`INSERT INTO doorbell_attempts(user_id,remaining)
            SELECT $1, CASE WHEN EXISTS(SELECT 1 FROM doorbell_runs WHERE user_id=$1 AND status IN ('playing','revealed')) THEN 0 ELSE 1 END
            ON CONFLICT DO NOTHING`, [userId]);
        return (await client.query('SELECT remaining FROM doorbell_attempts WHERE user_id=$1 FOR UPDATE', [userId])).rows[0].remaining;
    }

    async attemptSummary(username) {
        return this.transaction(username, async (client, account) => {
            if (!account.is_admin) fail('ADMIN_REQUIRED', 403, '仅管理员可以管理次数');
            const target = (await client.query('SELECT username FROM users WHERE id=$1', [PILOT_USER_ID])).rows[0];
            if (!target) fail('NOT_FOUND', 404, '试用账号不存在');
            // Reading an existing counter does not need to lock another account.
            const counter = (await client.query('SELECT remaining FROM doorbell_attempts WHERE user_id=$1', [PILOT_USER_ID])).rows[0];
            const logs = (await client.query(`SELECT log.amount,log.remaining_after,log.reason,log.created_at,actor.username AS actor
                FROM doorbell_attempt_logs log JOIN users actor ON actor.id=log.actor_user_id
                WHERE log.target_user_id=$1 ORDER BY log.created_at DESC LIMIT 30`, [PILOT_USER_ID])).rows;
            return { success: true, username: target.username, remaining: counter?.remaining ?? 1, logs };
        });
    }

    async adjustAttempts(username, raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)
            || Object.keys(raw).some(key => !['commandId','delta','reason','csrfToken'].includes(key))) fail('INVALID_INPUT', 400, '请求字段无效');
        const commandId = uuid(raw.commandId);
        if (!Number.isSafeInteger(raw.delta) || raw.delta === 0 || Math.abs(raw.delta) > 100000
            || (raw.reason !== undefined && (typeof raw.reason !== 'string' || raw.reason.length > 200))) fail('INVALID_INPUT', 400, '请输入有效的整数次数');
        const reason = raw.reason?.trim() || (raw.delta > 0 ? '管理员增加次数' : '管理员扣减次数');
        const hash = createHash('sha256').update(JSON.stringify({ delta: raw.delta, reason })).digest('hex');
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const accounts = (await client.query(`SELECT id,username,authorized,is_admin,deactivated,account_locked
                FROM users WHERE username=$1 OR id=$2 ORDER BY id FOR UPDATE`, [username, PILOT_USER_ID])).rows;
            const actor = accounts.find(account => account.username === username);
            if (!canPlayDoorbell(actor) || !actor.is_admin) fail('ADMIN_REQUIRED', 403, '仅管理员可以管理次数');
            if (!accounts.some(account => Number(account.id) === PILOT_USER_ID)) fail('NOT_FOUND', 404, '试用账号不存在');
            const receipt = (await client.query('SELECT * FROM doorbell_attempt_logs WHERE command_id=$1', [commandId])).rows[0];
            if (receipt) {
                if (receipt.actor_user_id !== actor.id || receipt.request_hash !== hash || receipt.run_id !== null) fail('COMMAND_CONFLICT', 409, '操作编号已使用');
                await client.query('COMMIT');
                return { success: true, remaining: receipt.remaining_after };
            }
            const before = await this.ensureAttempts(client, PILOT_USER_ID);
            const after = before + raw.delta;
            if (after < 0 || after > 100000) fail('ATTEMPTS_RANGE', 409, '剩余次数不能小于 0 或大于 100000');
            await client.query('UPDATE doorbell_attempts SET remaining=$2,updated_at=NOW() WHERE user_id=$1', [PILOT_USER_ID, after]);
            await client.query(`INSERT INTO doorbell_attempt_logs(command_id,actor_user_id,target_user_id,request_hash,amount,
                remaining_before,remaining_after,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
            [commandId, actor.id, PILOT_USER_ID, hash, raw.delta, before, after, reason]);
            await client.query('COMMIT');
            return { success: true, remaining: after };
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
    }

    async grantPlayback(client, run, door, kind) {
        const token = randomUUID();
        await client.query(`INSERT INTO doorbell_audio_plays(run_id,door,kind,token,expires_at)
            VALUES($1,$2,$3,$4,NOW()+INTERVAL '60 seconds')`, [run.id, door, kind, token]);
        return { kind, url: `/api/doorbell/runs/${run.id}/audio/${door}/${kind}/${token}` };
    }

    async audio(username, runId, rawDoor, kind, playbackToken) {
        if (!/^[1-8]$/.test(String(rawDoor)) || !['bell', 'original', 'chorus'].includes(kind)) fail('NOT_FOUND', 404, '音频不存在');
        const door = Number(rawDoor);
        return this.transaction(username, async (client, account) => {
            const run = await this.findRun(client, account, runId);
            const revealed = run.results.some(result => result.door === door);
            if (kind === 'chorus') {
                if (!revealed) fail('NOT_FOUND', 404, '副歌将在揭晓后播放');
            } else {
                const current = run.status === 'playing' && door === run.completed + 1;
                if (!current || !UUID.test(String(playbackToken || ''))) fail('NOT_FOUND', 404, '本次播放不可用');
                // One complete response, without range seeking: a refreshed page or reused URL cannot replay it.
                const play = await client.query(`UPDATE doorbell_audio_plays SET consumed_at=NOW()
                    WHERE run_id=$1 AND door=$2 AND kind=$3 AND token=$4
                      AND consumed_at IS NULL AND expires_at>NOW() RETURNING token`, [run.id, door, kind, playbackToken]);
                if (play.rowCount !== 1) fail('AUDIO_USED', 409, '这段 15 秒音频已经播放过了');
            }
            return `${songById(run.song_ids[door - 1]).id}-${kind}.mp3`;
        });
    }
}

module.exports = { DoorbellService, DoorbellError, project, validate };
