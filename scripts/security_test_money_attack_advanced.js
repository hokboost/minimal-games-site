#!/usr/bin/env node
'use strict';

const { URL } = require('url');
const crypto = require('crypto');

const baseUrl = process.argv[2] || process.env.TARGET_URL || 'https://www.wuguijiang.com';
const username = process.env.AUTH_USER;
const password = process.env.AUTH_PASS;
const concurrency = Number(process.env.CONCURRENCY || 100);
const realExchange = process.env.REAL_EXCHANGE === '1';
const realGiftType = process.env.REAL_GIFT_TYPE || 'fanlight';
const realUnitCost = Number(process.env.REAL_UNIT_COST || 1);
const realQty = Number(process.env.REAL_QTY || 1);

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
        redirect: 'manual',
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
        redirect: 'manual',
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
    const logResponse = await request('/api/balance/logs?limit=1');
    if (logResponse.status === 200) {
        try {
            const data = await logResponse.json();
            const latest = data.logs && data.logs[0];
            if (latest && Number.isFinite(Number(latest.balance_after))) {
                return Number(latest.balance_after);
            }
        } catch (error) {
            // fall back to gifts page
        }
    }

    const response = await request('/gifts');
    const text = await response.text();
    const match = text.match(/id="currentBalance">([^<]+)</);
    if (!match) return null;
    const num = Number(match[1].replace(/[^\d.-]/g, ''));
    return Number.isFinite(num) ? num : null;
}

async function testCsrfReplay(csrfToken) {
    const response = await requestNoCookies('/api/gifts/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ giftType: 'heartbox', cost: 150, quantity: 1 })
    });
    logResult('CSRF replay without session blocked', [401, 403].includes(response.status), `status=${response.status}`);
}

async function testSessionFixation(csrfToken) {
    const response = await requestNoCookies('/api/gifts/exchange', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            'Cookie': 'minimal_games_sid=malformed'
        },
        body: JSON.stringify({ giftType: 'heartbox', cost: 150, quantity: 1 })
    });
    logResult('Session fixation blocked', [401, 403].includes(response.status), `status=${response.status}`);
}

async function testConcurrencyTamper(csrfToken) {
    const payload = { giftType: 'heartbox', cost: 1, quantity: 1 };
    let ok = 0;
    let fail = 0;

    const tasks = Array.from({ length: concurrency }, () => {
        return request('/api/gifts/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(payload)
        }).then((response) => {
            if ([400, 403, 429].includes(response.status)) {
                ok += 1;
            } else {
                fail += 1;
            }
        });
    });

    await Promise.all(tasks);
    logResult('High concurrency tamper blocked', fail === 0, `ok=${ok} fail=${fail}`);
}

async function testRealExchangeConcurrency(csrfToken) {
    if (!realExchange) {
        logResult('Real exchange concurrency', true, 'skipped');
        return { successCount: 0, cost: 0 };
    }

    const cost = realUnitCost * realQty;
    const payload = { giftType: realGiftType, cost, quantity: realQty };

    const tasks = Array.from({ length: 2 }, () => {
        return request('/api/gifts/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(payload)
        }).then(async (response) => {
            let data = null;
            try {
                data = await response.json();
            } catch (error) {
                data = null;
            }
            return { status: response.status, data };
        });
    });

    const results = await Promise.all(tasks);
    const successCount = results.filter((item) => item.status === 200 && item.data?.success).length;
    const blockedCount = results.filter((item) => item.status === 400).length;

    logResult(
        'Real exchange concurrency',
        successCount === 1 && blockedCount === 1,
        `success=${successCount} blocked=${blockedCount}`
    );

    return { successCount, cost };
}

async function testNonJsonBody(csrfToken) {
    const response = await request('/api/gifts/exchange', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-CSRF-Token': csrfToken
        },
        body: 'giftType=heartbox&cost=1&quantity=1'
    });
    logResult('Form body tamper blocked', [400, 403, 429].includes(response.status), `status=${response.status}`);
}

async function testFloatCost(csrfToken) {
    const response = await request('/api/gifts/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ giftType: 'heartbox', cost: 149.5, quantity: 1 })
    });
    logResult('Float cost blocked', [400, 403, 429].includes(response.status), `status=${response.status}`);
}

async function testBalanceUnchanged(beforeBalance, expectedDelta = 0) {
    const afterBalance = await fetchBalance();
    if (beforeBalance === null || afterBalance === null) {
        logResult('Balance check', false, 'unable to read balance');
        return;
    }
    const expected = beforeBalance - expectedDelta;
    logResult('Balance check after tests', expected === afterBalance, `expected=${expected} actual=${afterBalance}`);
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
    logResult('Gifts CSRF found', !!giftsCsrf, giftsCsrf ? 'ok' : 'missing');

    console.log('--- Replay / fixation ---');
    await testCsrfReplay(giftsCsrf || '');
    await testSessionFixation(giftsCsrf || '');

    console.log('--- Concurrency tamper ---');
    await testConcurrencyTamper(giftsCsrf || '');
    const realResult = await testRealExchangeConcurrency(giftsCsrf || '');

    console.log('--- Content-type / float tests ---');
    await testNonJsonBody(giftsCsrf || '');
    await testFloatCost(giftsCsrf || '');

    console.log('--- Balance check ---');
    const expectedDelta = realResult.successCount > 0 ? realResult.cost : 0;
    await testBalanceUnchanged(beforeBalance, expectedDelta);
}

main().catch((error) => {
    console.error('Test error:', error.message);
    process.exit(1);
});
