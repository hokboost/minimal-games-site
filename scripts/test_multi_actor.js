#!/usr/bin/env node
'use strict';

/**
 * 综合测试脚本：同时模拟正常玩家与“作弊”玩家
 *
 * 正常玩家（NORMAL_USER/PASS）：
 *  - Quiz: start -> 3题 -> submit
 *  - Slot, Scratch, Spin 各 1 次
 *  - Flip: start -> flip(0)
 *  - Wish: play 1 次
 *
 * 作弊玩家（CHEAT_USER/PASS）：
 *  - Quiz: start -> 3题 -> submit -> 重放同一答案（应被拒绝/无奖励）
 *  - Flip: start 后并发 cashout 2 次（应只允许一次）
 *
 * 环境变量：
 *   TARGET_URL (默认 https://www.wuguijiang.com)
 *   NORMAL_USER / NORMAL_PASS
 *   CHEAT_USER  / CHEAT_PASS
 */

const fetch = require('node-fetch');
const { URL } = require('url');

const baseUrl = process.env.TARGET_URL || 'https://www.wuguijiang.com';
const normalUser = process.env.NORMAL_USER || '尧顺宇';
const normalPass = process.env.NORMAL_PASS || 'yaoshunyu';
const cheatUser = process.env.CHEAT_USER || '测试';
const cheatPass = process.env.CHEAT_PASS || '111111';

class Actor {
    constructor(username, password) {
        this.username = username;
        this.password = password;
        this.jar = new Map();
        this.csrf = null;
    }
    setCookie(res) {
        const sc = res.headers.get('set-cookie');
        if (!sc) return;
        sc.split(',').forEach((p) => {
            const kv = p.split(';')[0];
            const [k, v] = kv.split('=');
            if (k && v !== undefined) this.jar.set(k.trim(), v.trim());
        });
    }
    cookieHeader() {
        return this.jar.size
            ? { cookie: [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ') }
            : {};
    }
    async request(path, options = {}) {
        const url = new URL(path, baseUrl);
        const res = await fetch(url, {
            redirect: 'manual',
            ...options,
            headers: { ...(options.headers || {}), ...this.cookieHeader() }
        });
        this.setCookie(res);
        return res;
    }
    async login() {
        const lp = await this.request('/login');
        const csrf = (await lp.text()).match(/name="_csrf" value="([^"]+)"/)?.[1];
        if (!csrf) throw new Error('login csrf missing');
        await this.request('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ username: this.username, password: this.password, _csrf: csrf }).toString()
        });
        const qp = await this.request('/quiz');
        this.csrf = (await qp.text()).match(/data-csrf-token="([^"]+)"/)?.[1];
        if (!this.csrf) throw new Error('quiz csrf missing');
    }
}

async function runNormal(actor) {
    const logs = [];
    const log = (label, status, payload) => logs.push({ label, status, payload });
    try {
        await actor.login();
        // Quiz
        const start = await actor.request('/api/quiz/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': actor.csrf },
            body: JSON.stringify({ username: actor.username })
        });
        log('quiz_start', start.status, await start.json().catch(() => ({})));

        const answers = [];
        const seen = [];
        for (let i = 0; i < 3; i += 1) {
            const q = await actor.request('/api/quiz/next', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': actor.csrf },
                body: JSON.stringify({ username: actor.username, seen, questionIndex: i })
            });
            const payload = await q.json().catch(() => ({}));
            log(`quiz_next_${i}`, q.status, payload);
            if (payload.success && payload.question) {
                seen.push(payload.question.id);
                const idx = Math.floor(Math.random() * payload.question.options.length);
                answers.push({ token: payload.token, answerIndex: idx });
            }
        }
        const submit = await actor.request('/api/quiz/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': actor.csrf },
            body: JSON.stringify({ username: actor.username, answers })
        });
        log('quiz_submit', submit.status, await submit.json().catch(() => ({})));

        // Slot
        const slot = await actor.request('/api/slot/play', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': actor.csrf },
            body: JSON.stringify({ username: actor.username, betAmount: 5 })
        });
        log('slot', slot.status, await slot.json().catch(() => ({})));

        // Scratch
        const scratch = await actor.request('/api/scratch/play', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': actor.csrf },
            body: JSON.stringify({ username: actor.username, tier: 5, winCount: 5 })
        });
        log('scratch', scratch.status, await scratch.json().catch(() => ({})));

        // Spin
        const spin = await actor.request('/api/spin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': actor.csrf }
        });
        log('spin', spin.status, await spin.json().catch(() => ({})));

        // Flip: start + flip(0)
        const flipStart = await actor.request('/api/flip/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': actor.csrf }
        });
        log('flip_start', flipStart.status, await flipStart.json().catch(() => ({})));
        const flip = await actor.request('/api/flip/flip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': actor.csrf },
            body: JSON.stringify({ cardIndex: 0 })
        });
        log('flip_flip0', flip.status, await flip.json().catch(() => ({})));

        // Wish: bobo
        const wish = await actor.request('/api/wish/play', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': actor.csrf },
            body: JSON.stringify({ giftType: 'bobo' })
        });
        log('wish', wish.status, await wish.json().catch(() => ({})));
    } catch (e) {
        log('error', 'exception', e.message);
    }
    return logs;
}

async function runCheat(actor) {
    const logs = [];
    const log = (label, status, payload) => logs.push({ label, status, payload });
    try {
        await actor.login();
        // Quiz normal submit
        const start = await actor.request('/api/quiz/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': actor.csrf },
            body: JSON.stringify({ username: actor.username })
        });
        log('quiz_start', start.status, await start.json().catch(() => ({})));

        const answers = [];
        const seen = [];
        for (let i = 0; i < 3; i += 1) {
            const q = await actor.request('/api/quiz/next', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': actor.csrf },
                body: JSON.stringify({ username: actor.username, seen, questionIndex: i })
            });
            const payload = await q.json().catch(() => ({}));
            log(`quiz_next_${i}`, q.status, payload);
            if (payload.success && payload.question) {
                seen.push(payload.question.id);
                const idx = Math.floor(Math.random() * payload.question.options.length);
                answers.push({ token: payload.token, answerIndex: idx });
            }
        }
        const submit1 = await actor.request('/api/quiz/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': actor.csrf },
            body: JSON.stringify({ username: actor.username, answers })
        });
        log('quiz_submit_once', submit1.status, await submit1.json().catch(() => ({})));

        // Replay same answers (作弊重放)
        const submit2 = await actor.request('/api/quiz/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': actor.csrf },
            body: JSON.stringify({ username: actor.username, answers })
        });
        log('quiz_submit_replay', submit2.status, await submit2.json().catch(() => ({})));

        // Flip: start, then并发cashout 2次（预期一成功一失败）
        const flipStart = await actor.request('/api/flip/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': actor.csrf }
        });
        log('flip_start', flipStart.status, await flipStart.json().catch(() => ({})));

        const cashTasks = [1, 2].map((i) =>
            actor.request('/api/flip/cashout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': actor.csrf }
            }).then(async (r) => ({ idx: i, status: r.status, body: await r.json().catch(() => ({})) }))
        );
        const cashResults = await Promise.all(cashTasks);
        log('flip_cashout_parallel', 'multi', cashResults);
    } catch (e) {
        log('error', 'exception', e.message);
    }
    return logs;
}

async function main() {
    console.log(`Target=${baseUrl}`);
    console.log(`Normal user=${normalUser} | Cheat user=${cheatUser}`);

    const normalActor = new Actor(normalUser, normalPass);
    const cheatActor = new Actor(cheatUser, cheatPass);

    const [normalLogs, cheatLogs] = await Promise.all([
        runNormal(normalActor),
        runCheat(cheatActor)
    ]);

    console.log('\n=== Normal actor logs ===');
    normalLogs.forEach((l) => console.log(l));

    console.log('\n=== Cheat actor logs ===');
    cheatLogs.forEach((l) => console.log(l));
}

main().catch((e) => {
    console.error('fatal', e);
    process.exit(1);
});
