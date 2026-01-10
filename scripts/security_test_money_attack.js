#!/usr/bin/env node
'use strict';

const { URL } = require('url');
const crypto = require('crypto');

const baseUrl = process.argv[2] || process.env.TARGET_URL || 'https://www.wuguijiang.com';
const username = process.env.AUTH_USER;
const password = process.env.AUTH_PASS;
const concurrency = Number(process.env.CONCURRENCY || 20);

const apiKey = process.env.WINDOWS_API_KEY || '';
const hmacSecret = process.env.GIFT_TASKS_HMAC_SECRET || '';

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

async function request(path, options = {}) {
    const url = new URL(path, baseUrl);
    const headers = {
        ...(options.headers || {})
    };
    const cookies = cookieHeader();
    if (cookies) {
        headers.cookie = cookies;
    }
    const response = await fetch(url, {
        redirect: 'follow',
        ...options,
        headers
    });
    setCookieFromResponse(response);
    return response;
}

async function requestNoCookies(path, options = {}) {
    const url = new URL(path, baseUrl);
    const headers = {
        ...(options.headers || {})
    };
    return fetch(url, {
        redirect: 'follow',
        ...options,
        headers
    });
}

function logResult(name, pass, info) {
    const status = pass ? 'PASS' : 'FAIL';
    const detail = info ? ` - ${info}` : '';
    console.log(`[${status}] ${name}${detail}`);
}

async function login() {
    const loginPage = await request('/login');
    const pageText = await loginPage.text();
    const csrfMatch = pageText.match(/name="_csrf" value="([^"]+)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : null;

    logResult('Login page reachable', loginPage.status === 200, `status=${loginPage.status}`);
    logResult('Login CSRF token found', !!csrfToken, csrfToken ? 'ok' : 'missing');

    if (!csrfToken) {
        return false;
    }

    const body = new URLSearchParams({
        username,
        password,
        _csrf: csrfToken
    }).toString();

    const response = await request('/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
    });

    const pass = response.status === 302 || response.status === 303;
    const location = response.headers.get('location') || '';
    logResult('Login submit', pass, `status=${response.status} location=${location}`);
    return pass;
}

async function fetchCsrf(path) {
    const response = await request(path);
    const text = await response.text();
    const match = text.match(/data-csrf-token="([^"]+)"/);
    return match ? match[1] : null;
}

async function fetchBalance() {
    const response = await request('/gifts');
    const text = await response.text();
    const match = text.match(/id="currentBalance">([^<]+)</);
    if (!match) return null;
    const num = Number(match[1].replace(/[^\d.-]/g, ''));
    return Number.isFinite(num) ? num : null;
}

function stableStringify(value) {
    if (value === undefined || typeof value === 'function') {
        return 'null';
    }
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function stableStringifyBody(body) {
    if (!body || typeof body !== 'object' || (Array.isArray(body) && body.length === 0)) {
        return '';
    }
    if (Object.keys(body).length === 0) {
        return '';
    }
    return stableStringify(body);
}

function buildSignatureHeaders(method, path, body, secret) {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomBytes(8).toString('hex');
    const canonicalBody = stableStringifyBody(body);
    const payload = `${timestamp}.${method.toUpperCase()}.${path}.${canonicalBody}`;
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return {
        'X-Timestamp': timestamp,
        'X-Nonce': nonce,
        'X-Signature': signature
    };
}

async function testAdminBalanceAbuse(csrfToken) {
    const endpoints = [
        ['/api/admin/update-balance', { username: username, balance: 999999 }],
        ['/api/admin/add-electric-coin', { username: username, amount: 999999 }],
        ['/api/admin/authorize-user', { username }],
        ['/api/admin/reset-password', { username, newPassword: '123456' }]
    ];

    for (const [path, payload] of endpoints) {
        const response = await request(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(payload)
        });
        logResult(`Admin abuse blocked ${path}`, response.status === 403, `status=${response.status}`);
    }
}

async function testGiftExchangeTamper(csrfToken) {
    const cases = [
        { name: 'invalid gift', payload: { giftType: "heartbox';DROP TABLE users;--", cost: 1, quantity: 1 } },
        { name: 'cost mismatch', payload: { giftType: 'heartbox', cost: 1, quantity: 1 } },
        { name: 'negative qty', payload: { giftType: 'heartbox', cost: 150, quantity: -1 } },
        { name: 'zero qty', payload: { giftType: 'heartbox', cost: 0, quantity: 0 } },
        { name: 'over qty', payload: { giftType: 'heartbox', cost: 150 * 101, quantity: 101 } }
    ];

    for (const testCase of cases) {
        const response = await request('/api/gifts/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(testCase.payload)
        });
        logResult(`Gift exchange tamper blocked (${testCase.name})`, [400, 403].includes(response.status), `status=${response.status}`);
    }
}

async function testGiftExchangeConcurrency(csrfToken) {
    const payload = { giftType: 'heartbox', cost: 1, quantity: 1 };
    let ok = 0;
    let fail = 0;

    const tasks = Array.from({ length: concurrency }, () => {
        return request('/api/gifts/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(payload)
        }).then((response) => {
            if ([400, 403].includes(response.status)) {
                ok += 1;
            } else {
                fail += 1;
            }
        });
    });

    await Promise.all(tasks);
    logResult('Gift exchange concurrency tamper blocked', fail === 0, `ok=${ok} fail=${fail}`);
}

async function testSlotTamper(csrfToken) {
    const cases = [
        { name: 'string injection', payload: { username, betAmount: '1 OR 1=1' }, expected: 400 },
        { name: 'negative', payload: { username, betAmount: -1 }, expected: 400 },
        { name: 'zero', payload: { username, betAmount: 0 }, expected: 400 },
        { name: 'huge', payload: { username, betAmount: 999999 }, expected: 400 }
    ];

    for (const testCase of cases) {
        const response = await request('/api/slot/play', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(testCase.payload)
        });
        logResult(`Slot tamper blocked (${testCase.name})`, response.status === testCase.expected, `status=${response.status}`);
    }
}

async function testDuelTamper(csrfToken) {
    const cases = [
        { name: 'invalid gift', payload: { giftType: 'invalid', power: 50 }, expected: 400 },
        { name: 'low power', payload: { giftType: 'crown', power: 0 }, expected: 400 },
        { name: 'high power', payload: { giftType: 'crown', power: 81 }, expected: 400 }
    ];
    for (const testCase of cases) {
        const response = await request('/api/duel/play', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(testCase.payload)
        });
        logResult(`Duel tamper blocked (${testCase.name})`, response.status === testCase.expected, `status=${response.status}`);
    }
}

async function testWishTamper(csrfToken) {
    const invalidGift = await request('/api/wish/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ giftType: 'invalid' })
    });
    logResult('Wish invalid gift blocked', invalidGift.status === 400, `status=${invalidGift.status}`);

    const batchInvalid = await request('/api/wish-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ batchCount: 9, giftType: 'deepsea_singer' })
    });
    logResult('Wish batch count tamper blocked', batchInvalid.status === 400, `status=${batchInvalid.status}`);
}

async function testGiftTasksAuth() {
    const noAuth = await requestNoCookies('/api/gift-tasks');
    logResult('Gift tasks unauth blocked', [401, 403].includes(noAuth.status), `status=${noAuth.status}`);

    if (!apiKey || !hmacSecret) {
        logResult('Gift tasks signature tests skipped', true, 'missing env');
        return;
    }

    const path = '/api/gift-tasks';
    const badSigHeaders = {
        'X-API-Key': apiKey,
        'X-Timestamp': Date.now().toString(),
        'X-Nonce': 'deadbeef',
        'X-Signature': 'deadbeef'
    };
    const badSig = await request(path, { headers: badSigHeaders });
    logResult('Gift tasks invalid signature blocked', badSig.status === 401, `status=${badSig.status}`);

    const goodSigHeaders = buildSignatureHeaders('GET', path, null, hmacSecret);
    const missingKey = await request(path, { headers: goodSigHeaders });
    logResult('Gift tasks missing key blocked', missingKey.status === 401, `status=${missingKey.status}`);
}

async function testBalanceUnchanged(beforeBalance) {
    const afterBalance = await fetchBalance();
    if (beforeBalance === null || afterBalance === null) {
        logResult('Balance check', false, 'unable to read balance');
        return;
    }
    logResult('Balance unchanged after tamper tests', beforeBalance === afterBalance, `before=${beforeBalance} after=${afterBalance}`);
}

async function main() {
    console.log(`Target: ${baseUrl}`);
    console.log(`Concurrency: ${concurrency}`);

    console.log('--- Login ---');
    const loggedIn = await login();
    if (!loggedIn) {
        console.log('Login failed; aborting.');
        process.exit(1);
    }

    const beforeBalance = await fetchBalance();
    if (beforeBalance !== null) {
        logResult('Balance fetched', true, `balance=${beforeBalance}`);
    } else {
        logResult('Balance fetched', false, 'missing');
    }

    console.log('--- CSRF tokens ---');
    const giftsCsrf = await fetchCsrf('/gifts');
    const slotCsrf = await fetchCsrf('/slot');
    const duelCsrf = await fetchCsrf('/duel');
    const wishCsrf = await fetchCsrf('/wish');
    const profileCsrf = await fetchCsrf('/profile');

    logResult('Gifts CSRF found', !!giftsCsrf, giftsCsrf ? 'ok' : 'missing');
    logResult('Slot CSRF found', !!slotCsrf, slotCsrf ? 'ok' : 'missing');
    logResult('Duel CSRF found', !!duelCsrf, duelCsrf ? 'ok' : 'missing');
    logResult('Wish CSRF found', !!wishCsrf, wishCsrf ? 'ok' : 'missing');
    logResult('Profile CSRF found', !!profileCsrf, profileCsrf ? 'ok' : 'missing');

    console.log('--- Admin abuse ---');
    await testAdminBalanceAbuse(profileCsrf || '');

    console.log('--- Gift exchange tamper ---');
    await testGiftExchangeTamper(giftsCsrf || '');
    await testGiftExchangeConcurrency(giftsCsrf || '');

    console.log('--- Slot tamper ---');
    await testSlotTamper(slotCsrf || '');

    console.log('--- Duel tamper ---');
    await testDuelTamper(duelCsrf || '');

    console.log('--- Wish tamper ---');
    await testWishTamper(wishCsrf || '');

    console.log('--- Gift tasks auth ---');
    await testGiftTasksAuth();

    console.log('--- Balance check ---');
    await testBalanceUnchanged(beforeBalance);
}

main().catch((error) => {
    console.error('Test error:', error.message);
    process.exit(1);
});
