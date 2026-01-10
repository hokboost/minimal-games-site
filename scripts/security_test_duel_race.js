#!/usr/bin/env node
'use strict';

/**
 * Duel 并发/篡改安全测试
 *
 * - 登录获取 CSRF
 * - 并发发起正常决斗请求 N 次
 * - 同时测试各种篡改：无效礼物、负功力、超范围功力、字符串功力、空礼物
 *
 * 环境变量：
 *   TARGET_URL  (默认 https://www.wuguijiang.com)
 *   AUTH_USER   登录用户名
 *   AUTH_PASS   登录密码
 *   CONCURRENCY 并发数（默认 10）
 */

const fetch = require('node-fetch');
const { URL } = require('url');

const baseUrl = process.env.TARGET_URL || 'https://www.wuguijiang.com';
const username = process.env.AUTH_USER;
const password = process.env.AUTH_PASS;
const concurrency = Number(process.env.CONCURRENCY || 10);

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
    return Array.from(cookieJar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function request(path, options = {}, timeoutMs = 30000) {
    const url = new URL(path, baseUrl);
    const headers = { ...(options.headers || {}) };
    const cookies = cookieHeader();
    if (cookies) headers.cookie = cookies;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const resp = await fetch(url, { redirect: 'follow', ...options, headers, signal: controller.signal });
        setCookieFromResponse(resp);
        return resp;
    } finally {
        clearTimeout(t);
    }
}

function log(label, pass, detail) {
    const status = pass ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${label}${detail ? ' - ' + detail : ''}`);
}

async function loginAndCsrf() {
    const loginPage = await request('/login');
    const html = await loginPage.text();
    const csrfMatch = html.match(/name="_csrf" value="([^"]+)"/);
    const csrf = csrfMatch ? csrfMatch[1] : null;
    log('Login page', loginPage.status === 200, `status=${loginPage.status}`);
    log('Login CSRF', !!csrf, csrf ? 'ok' : 'missing');
    if (!csrf) return null;

    const body = new URLSearchParams({ username, password, _csrf: csrf }).toString();
    const resp = await request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });
    const ok = resp.status === 302 || resp.status === 303;
    log('Login submit', ok, `status=${resp.status} location=${resp.headers.get('location')}`);
    if (!ok) return null;

    // 决斗页取 CSRF
    const duelPage = await request('/duel');
    const duelHtml = await duelPage.text();
    const duelCsrfMatch = duelHtml.match(/name="_csrf" value="([^"]+)"/) || duelHtml.match(/data-csrf-token="([^"]+)"/);
    const duelCsrf = duelCsrfMatch ? duelCsrfMatch[1] : null;
    log('Duel CSRF', !!duelCsrf, duelCsrf ? 'ok' : `status=${duelPage.status}`);
    return duelCsrf;
}

async function duelCall(csrf, body) {
    const resp = await request('/api/duel/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify(body)
    });
    let payload = {};
    try { payload = await resp.json(); } catch (e) {}
    return { status: resp.status, payload };
}

async function run() {
    console.log(`Target: ${baseUrl}`);
    const csrf = await loginAndCsrf();
    if (!csrf) process.exit(1);

    // 并发合法请求
    const normalBody = { giftType: 'iron', power: 10 };
    const normalPromises = [];
    for (let i = 0; i < concurrency; i += 1) {
        normalPromises.push(duelCall(csrf, normalBody));
    }
    const normalResults = await Promise.all(normalPromises);
    const normalSuccess = normalResults.filter(r => r.status === 200 && r.payload.success).length;
    log('Duel concurrent normal', true, `ok=${normalSuccess}/${normalResults.length}`);

    // 篡改测试
    const tamperBodies = [
        { giftType: 'unknown', power: 10, label: 'invalid gift' },
        { giftType: 'iron', power: -5, label: 'negative power' },
        { giftType: 'iron', power: 0, label: 'zero power' },
        { giftType: 'iron', power: 999, label: 'huge power' },
        { giftType: 'iron', power: 'DROP TABLE', label: 'string power' },
        { giftType: '', power: 10, label: 'empty gift' }
    ];
    for (const tb of tamperBodies) {
        const r = await duelCall(csrf, { giftType: tb.giftType, power: tb.power });
        log(`Duel tamper ${tb.label}`, r.status >= 400 && r.status < 500, `status=${r.status} msg=${r.payload.message || ''}`);
    }
}

run().catch((err) => {
    console.error('Test error:', err);
    process.exit(1);
});
