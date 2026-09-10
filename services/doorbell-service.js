'use strict';

const { createHash, randomInt } = require('node:crypto');
const { parseMoney } = require('../lib/integer-money');
const { PRIZES, canPlayDoorbell, selectSongs, songById, isCorrect, normalizeAnswer, prize } = require('../domain/games/doorbell');
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
        || !['answer', 'original', 'hint', 'next', 'cashout'].includes(raw.type)) fail('INVALID_INPUT', 400, '操作无效');
    Object.assign(value, { runId: uuid(raw.runId), revision: raw.revision, type: raw.type });
    if (raw.type === 'answer') {
        if (typeof raw.answer !== 'string' || raw.answer.length > 100 || !normalizeAnswer(raw.answer)) fail('INVALID_ANSWER', 400, '请填写歌名（最多 100 个字符）');
        value.answer = raw.answer;
    } else if (raw.answer !== undefined) fail('INVALID_INPUT', 400, '此操作不接受答案');
    return value;
}

function project(run, balance) {
    if (!run) return { success: true, balance, prizes: PRIZES, run: null };
    const door = run.status === 'playing' ? run.completed + 1 : Math.max(1, run.results.at(-1)?.door || run.completed);
    const audio = (n, kind) => `/api/doorbell/runs/${run.id}/audio/${n}/${kind}`;
    const results = run.results.map(result => {
        const song = songById(run.song_ids[result.door - 1]);
        return { ...result, title: song.title, artist: song.artist, credit: song.credit, originalUrl: audio(result.door, 'original') };
    });
    return { success: true, balance, prizes: PRIZES, run: {
        id: run.id, status: run.status, revision: run.revision, door, completed: run.completed,
        pot: prize(run.completed), settledAmount: Number(run.settled_amount), results,
        help: { originalUsed: run.original_door !== null, hintUsed: run.hint_door !== null },
        current: run.status === 'playing' ? {
            bellUrl: audio(door, 'bell'),
            originalUrl: run.original_door === door ? audio(door, 'original') : null,
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
            return project(run, account.balance);
        });
    }

    async command(username, raw, start = false, context = {}) {
        const input = validate(raw, start);
        const hash = createHash('sha256').update(JSON.stringify({ start, ...input })).digest('hex');
        return this.transaction(username, async (client, account) => {
            const receipt = (await client.query('SELECT request_hash,response FROM doorbell_commands WHERE user_id=$1 AND command_id=$2', [account.id, input.commandId])).rows[0];
            if (receipt) {
                if (receipt.request_hash !== hash) fail('COMMAND_CONFLICT', 409, '操作编号已使用，请刷新后重试');
                return receipt.response;
            }
            let run;
            if (start) {
                run = (await client.query(`SELECT * FROM doorbell_runs WHERE user_id=$1 AND status IN ('playing','revealed') FOR UPDATE`, [account.id])).rows[0];
                if (!run) run = (await client.query(`INSERT INTO doorbell_runs(id,user_id,song_ids)
                    VALUES($1,$2,$3::JSONB) RETURNING *`, [input.commandId, account.id, JSON.stringify(selectSongs(this.rng))])).rows[0];
            } else {
                run = await this.findRun(client, account, input.runId);
                if (run.revision !== input.revision) fail('STALE_STATE', 409, '进度已更新，请刷新本轮进度后继续');
                if (!['playing', 'revealed'].includes(run.status)) fail('RUN_FINISHED', 409, '本轮已经结束');
                const door = run.completed + 1;
                const song = songById(run.song_ids[Math.min(door - 1, 7)]);
                if (input.type === 'answer') {
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
                    hint_door=$6,hint=$7::JSONB,results=$8::JSONB,settled_amount=$9,settled_at=$10,updated_at=NOW() WHERE id=$1`,
                [run.id, run.status, run.completed, run.revision, run.original_door, run.hint_door,
                    run.hint === null ? null : JSON.stringify(run.hint), JSON.stringify(run.results), run.settled_amount, run.settled_at]);
            }
            const response = project(run, account.balance);
            await client.query(`INSERT INTO doorbell_commands(user_id,command_id,request_hash,run_id,response)
                VALUES($1,$2,$3,$4,$5::JSONB)`, [account.id, input.commandId, hash, run.id, JSON.stringify(response)]);
            return response;
        });
    }

    async audio(username, runId, rawDoor, kind) {
        if (!/^[1-8]$/.test(String(rawDoor)) || !['bell', 'original'].includes(kind)) fail('NOT_FOUND', 404, '音频不存在');
        const door = Number(rawDoor);
        return this.transaction(username, async (client, account) => {
            const run = await this.findRun(client, account, runId);
            const revealed = run.results.some(result => result.door === door);
            const current = run.status === 'playing' && door === run.completed + 1;
            const allowed = kind === 'bell' ? (current || revealed) : (revealed || (current && run.original_door === door));
            if (!allowed) fail('NOT_FOUND', 404, '音频尚未开放');
            return `${songById(run.song_ids[door - 1]).id}-${kind}.mp3`;
        });
    }
}

module.exports = { DoorbellService, DoorbellError, project, validate };
