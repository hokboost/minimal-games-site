#!/usr/bin/env node
'use strict';

/**
 * 正常玩家冒烟脚本：
 * - 登录
 * - Quiz: start -> next(3) -> submit
 * - Slot: play 1 次
 * - Scratch: play 1 次
 * - Spin: play 1 次
 * - Flip: start -> flip 第一张 -> cashout
 * - Wish: play 1 次
 *
 * 环境变量：
 *   TARGET_URL (默认 https://www.wuguijiang.com)
 *   AUTH_USER   登录用户名
 *   AUTH_PASS   登录密码
 */

const { URL } = require('url');
const fetch = require('node-fetch');

const baseUrl = process.env.TARGET_URL || 'https://www.wuguijiang.com';
const username = process.env.AUTH_USER;
const password = process.env.AUTH_PASS;

if (!username || !password) {
    console.error('Missing AUTH_USER or AUTH_PASS env vars.');
    process.exit(1);
}

const cookieJar = new Map();

function setCookieFromResponse(response) {
    const setCookie = response.headers.get('set-cookie');
    if (!setCookie) return;
    const parts = setCookie.split(',');
    for (const part of parts) {
        const first = part.split(';')[0];
        const [name, value] = first.split('=');
        if (name && value !== undefined) {
            cookieJar.set(name.trim(), value.trim());
        }
    }
}

function cookieHeader() {
    if (cookieJar.size === 0) return '';
    return Array.from(cookieJar.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
}

async function request(path, options = {}, timeoutMs = 60000) {
    const url = new URL(path, baseUrl);
    const headers = { ...(options.headers || {}) };
    const cookies = cookieHeader();
    if (cookies) headers.cookie = cookies;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            redirect: 'follow',
            ...options,
            headers,
            signal: controller.signal
        });
        setCookieFromResponse(response);
        return response;
    } finally {
        clearTimeout(timeout);
    }
}

function log(name, pass, detail) {
    const status = pass ? 'PASS' : 'FAIL';
    const extra = detail ? ` - ${detail}` : '';
    console.log(`[${status}] ${name}${extra}`);
}

async function login() {
    const loginPage = await request('/login');
    const html = await loginPage.text();
    const csrfMatch = html.match(/name="_csrf" value="([^"]+)"/);
    const csrf = csrfMatch ? csrfMatch[1] : null;
    log('Login page', loginPage.status === 200, `status=${loginPage.status}`);
    log('Login CSRF', !!csrf, csrf ? 'ok' : 'missing');
    if (!csrf) return false;

    const body = new URLSearchParams({ username, password, _csrf: csrf }).toString();
    const resp = await request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });
    const ok = resp.status === 302 || resp.status === 303;
    log('Login submit', ok, `status=${resp.status} location=${resp.headers.get('location')}`);
    return ok;
}

async function fetchCsrfFromQuiz() {
    const resp = await request('/quiz');
    const text = await resp.text();
    const match = text.match(/data-csrf-token="([^"]+)"/);
    const csrf = match ? match[1] : null;
    log('Quiz page CSRF', !!csrf, csrf ? 'ok' : 'missing');
    return csrf;
}

async function quizFlow(csrf) {
    try {
        const start = await request('/api/quiz/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
            body: JSON.stringify({ username })
        });
        const startPayload = await start.json().catch(() => ({}));
        log('Quiz start', start.status === 200 && startPayload.success, `status=${start.status}`);
        if (!startPayload.success) return;

        const answers = [];
        const seen = [];
        for (let i = 0; i < 3; i += 1) {
            const qResp = await request('/api/quiz/next', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
                body: JSON.stringify({ username, seen, questionIndex: i })
            });
            const payload = await qResp.json().catch(() => ({}));
            if (!payload.success) {
                log('Quiz next', false, `status=${qResp.status} msg=${payload.message}`);
                break;
            }
            seen.push(payload.question.id);
            const answerIndex = Math.floor(Math.random() * payload.question.options.length);
            answers.push({ token: payload.token, answerIndex });
        }

        const submit = await request('/api/quiz/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
            body: JSON.stringify({ username, answers })
        });
        const submitPayload = await submit.json().catch(() => ({}));
        log('Quiz submit', submit.status === 200 && submitPayload.success, `status=${submit.status} score=${submitPayload.score} reward=${submitPayload.reward}`);
    } catch (err) {
        log('Quiz flow', false, err.message);
    }
}

async function slotFlow(csrf) {
    try {
        const resp = await request('/api/slot/play', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
            body: JSON.stringify({ username, betAmount: 5 })
        });
        const payload = await resp.json().catch(() => ({}));
        log('Slot play', resp.status === 200 && payload.success, `status=${resp.status} payout=${payload.payout}`);
    } catch (err) {
        log('Slot flow', false, err.message);
    }
}

async function scratchFlow(csrf) {
    try {
        const resp = await request('/api/scratch/play', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
            body: JSON.stringify({ username, tier: 5, winCount: 5 })
        });
        const payload = await resp.json().catch(() => ({}));
        log('Scratch play', resp.status === 200 && payload.success, `status=${resp.status} reward=${payload.reward}`);
    } catch (err) {
        log('Scratch flow', false, err.message);
    }
}

async function spinFlow(csrf) {
    try {
        const resp = await request('/api/spin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }
        });
        const payload = await resp.json().catch(() => ({}));
        log('Spin play', resp.status === 200 && payload.success, `status=${resp.status} prize=${payload.prize}`);
    } catch (err) {
        log('Spin flow', false, err.message);
    }
}

async function flipFlow(csrf) {
    try {
        const start = await request('/api/flip/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }
        });
        const startPayload = await start.json().catch(() => ({}));
        log('Flip start', start.status === 200 && startPayload.success, `status=${start.status}`);

        const flip = await request('/api/flip/flip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
            body: JSON.stringify({ cardIndex: 0 })
        });
        const flipPayload = await flip.json().catch(() => ({}));
        log('Flip card', flip.status === 200 && flipPayload.success, `status=${flip.status} type=${flipPayload.cardType}`);

        const cashout = await request('/api/flip/cashout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }
        });
        const cashPayload = await cashout.json().catch(() => ({}));
        log('Flip cashout', cashout.status === 200 && cashPayload.success, `status=${cashout.status} reward=${cashPayload.reward}`);
    } catch (err) {
        log('Flip flow', false, err.message);
    }
}

async function wishFlow(csrf) {
    try {
        const resp = await request('/api/wish/play', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
            body: JSON.stringify({ giftType: 'bobo' })
        });
        const payload = await resp.json().catch(() => ({}));
        log('Wish play', resp.status === 200 && payload.success, `status=${resp.status} success=${payload.reward ? 'hit' : 'miss'}`);
    } catch (err) {
        log('Wish flow', false, err.message);
    }
}

async function main() {
    console.log(`Target: ${baseUrl}`);
    const loggedIn = await login();
    if (!loggedIn) process.exit(1);

    const csrf = await fetchCsrfFromQuiz();
    if (!csrf) process.exit(1);

    await quizFlow(csrf);
    await slotFlow(csrf);
    await scratchFlow(csrf);
    await spinFlow(csrf);
    await flipFlow(csrf);
    await wishFlow(csrf);
}

main().catch((err) => {
    console.error('Smoke test error:', err);
    process.exit(1);
});
