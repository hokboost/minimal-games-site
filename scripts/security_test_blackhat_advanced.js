#!/usr/bin/env node
'use strict';

const { URL } = require('url');
const crypto = require('crypto');

const baseUrl = process.argv[2] || process.env.TARGET_URL || 'https://www.wuguijiang.com';
const username = process.env.AUTH_USER;
const password = process.env.AUTH_PASS;

const concurrency = Number(process.env.CONCURRENCY || 100);
const allowReal = process.env.REAL_EXCHANGE !== '0';
const maxRealSpend = Number(process.env.MAX_REAL_SPEND || 50);

const slotBet = Number(process.env.SLOT_BET || 1);
const giftType = process.env.GIFT_TYPE || 'fanlight';
const giftUnitCost = Number(process.env.GIFT_UNIT_COST || 1);
const giftQuantity = Number(process.env.GIFT_QTY || 1);

const apiKey = process.env.WINDOWS_API_KEY || '';
const hmacSecret = process.env.GIFT_TASKS_HMAC_SECRET || '';

if (!username || !password) {
    console.error('Missing AUTH_USER or AUTH_PASS env vars.');
    process.exit(1);
}

const cookieJar = new Map();

function setCookieFromResponse(response) {
    const rawList = response.headers.raw?.()['set-cookie'];
    const cookies = rawList && Array.isArray(rawList) && rawList.length > 0
        ? rawList
        : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
    cookies.forEach((raw) => {
        if (!raw) return;
        raw.split(/,(?=[^;]+?=)/).forEach((part) => {
            const first = part.split(';')[0];
            const [name, value] = first.split('=');
            if (name && value !== undefined) {
                cookieJar.set(name.trim(), value.trim());
            }
        });
    });
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
        redirect: 'manual', // manual follow to capture Set-Cookie
        ...options,
        headers
    });
    setCookieFromResponse(response);

    const status = response.status;
    const location = response.headers.get('location');
    const shouldFollow = [301, 302, 303, 307, 308].includes(status) && location && (options._depth || 0) < 5;
    if (shouldFollow) {
        const nextMethod = ['GET', 'HEAD', 'OPTIONS'].includes((options.method || 'GET').toUpperCase())
            ? 'GET'
            : 'GET'; // normalize to GET after login redirect
        return request(location, { ...options, method: nextMethod, body: undefined, _depth: (options._depth || 0) + 1 });
    }

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

function logSkip(name, info) {
    const detail = info ? ` - ${info}` : '';
    console.log(`[SKIP] ${name}${detail}`);
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
            'Content-Type': 'application/x-www-form-urlencoded',
            'x-csrf-token': csrfToken
        },
        body
    });

    const location = response.headers.get('location') || '';
    const text = await response.text();
    // 认为 200 但没有再出现登录表单即视为成功（适配无“游戏中心”文案的首页）
    const looksLikeLoginForm = /name=["']username["']|name=["']password["']|<form[^>]*login/i.test(text);
    const pass = response.status === 302 || response.status === 303 || (response.status === 200 && !looksLikeLoginForm);
    logResult('Login submit', pass, `status=${response.status} location=${location}`);

    if (!pass) {
        console.log('--- Login response body (truncated) ---');
        console.log(text.slice(0, 400));
    }

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
            // fall back
        }
    }

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

function buildSignatureHeaders(method, path, body, secret, timestampOverride, nonceOverride) {
    const timestamp = timestampOverride || Date.now().toString();
    const nonce = nonceOverride || crypto.randomBytes(8).toString('hex');
    const canonicalBody = stableStringifyBody(body);
    const payload = `${timestamp}.${method.toUpperCase()}.${path}.${canonicalBody}`;
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return {
        'X-Timestamp': timestamp,
        'X-Nonce': nonce,
        'X-Signature': signature
    };
}

async function testContentTypeConfusion(csrfTokens) {
    const jsonBody = JSON.stringify({ username, betAmount: slotBet });
    const response = await request('/api/slot/play', {
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain',
            'X-CSRF-Token': csrfTokens.slot
        },
        body: jsonBody
    });
    logResult('Slot JSON body with text/plain blocked', [400, 403, 415].includes(response.status), `status=${response.status}`);

    const formBody = JSON.stringify({ giftType, cost: giftUnitCost * giftQuantity, quantity: giftQuantity });
    const exchange = await request('/api/gifts/exchange', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-CSRF-Token': csrfTokens.gifts
        },
        body: formBody
    });
    logResult('Gift exchange JSON with form content-type blocked', [400, 403, 415].includes(exchange.status), `status=${exchange.status}`);
}

async function testParamPollution(csrfTokens) {
    const body = `username=${encodeURIComponent(username)}&betAmount=1&betAmount=2`;
    const response = await request('/api/slot/play', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-CSRF-Token': csrfTokens.slot
        },
        body
    });
    logResult('Slot parameter pollution blocked', response.status === 400, `status=${response.status}`);

    const exchangeBody = `giftType=${encodeURIComponent(giftType)}&cost=${giftUnitCost}&cost=${giftUnitCost * 2}&quantity=1`;
    const exchange = await request('/api/gifts/exchange', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-CSRF-Token': csrfTokens.gifts
        },
        body: exchangeBody
    });
    logResult('Gift exchange parameter pollution blocked', response.status === 400 || response.status === 403, `status=${exchange.status}`);
}

async function testJsonTypeConfusion(csrfTokens) {
    const cases = [
        { name: 'object betAmount', body: { username, betAmount: { $gt: 0 } } },
        { name: 'array betAmount', body: { username, betAmount: [1, 2] } },
        { name: 'null betAmount', body: { username, betAmount: null } }
    ];

    for (const testCase of cases) {
        const response = await request('/api/slot/play', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfTokens.slot
            },
            body: JSON.stringify(testCase.body)
        });
        logResult(`Slot ${testCase.name} blocked`, response.status === 400, `status=${response.status}`);
    }
}

async function testReplayAfterLogout(csrfTokens) {
    const logout = await request('/logout');
    logResult('Logout reachable', [200, 302].includes(logout.status), `status=${logout.status}`);

    const response = await request('/api/slot/play', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfTokens.slot
        },
        body: JSON.stringify({ username, betAmount: slotBet })
    });
    logResult('Old session token blocked after logout', [401, 403].includes(response.status), `status=${response.status}`);
}

async function testConcurrentSlotSpend(csrfTokens, startingBalance) {
    if (!allowReal) {
        logSkip('Concurrent slot spend', 'real spend disabled');
        return;
    }
    if (!Number.isFinite(startingBalance) || startingBalance < slotBet) {
        logSkip('Concurrent slot spend', 'insufficient balance');
        return;
    }

    const maxRequests = Math.min(concurrency, Math.floor(maxRealSpend / slotBet));
    if (maxRequests <= 0) {
        logSkip('Concurrent slot spend', 'max spend too low');
        return;
    }

    let ok = 0;
    let fail = 0;
    const tasks = Array.from({ length: maxRequests }, () => {
        return request('/api/slot/play', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfTokens.slot
            },
            body: JSON.stringify({ username, betAmount: slotBet })
        }).then((response) => {
            if (response.status === 200) {
                ok += 1;
            } else {
                fail += 1;
            }
        });
    });

    await Promise.all(tasks);
    logResult('Concurrent slot spend completed', true, `ok=${ok} fail=${fail}`);
}

async function testGiftTaskSignatures() {
    if (!apiKey || !hmacSecret) {
        logSkip('Gift task signature abuse', 'missing WINDOWS_API_KEY/GIFT_TASKS_HMAC_SECRET');
        return;
    }

    const path = '/api/gift-tasks';
    const validHeaders = buildSignatureHeaders('GET', path, null, hmacSecret);
    const good = await request(path, {
        headers: { 'X-API-Key': apiKey, ...validHeaders }
    });
    logResult('Gift tasks valid signature accepted', good.status === 200, `status=${good.status}`);

    const tampered = await request(path, {
        headers: {
            'X-API-Key': apiKey,
            ...buildSignatureHeaders('GET', '/api/gift-tasks/', null, hmacSecret)
        }
    });
    logResult('Gift tasks path tamper rejected', tampered.status === 401, `status=${tampered.status}`);

    const oldTimestamp = Math.floor(Date.now() / 1000) - 4000;
    const expiredHeaders = buildSignatureHeaders('GET', path, null, hmacSecret, String(oldTimestamp));
    const expired = await request(path, {
        headers: { 'X-API-Key': apiKey, ...expiredHeaders }
    });
    logResult('Gift tasks expired signature rejected', expired.status === 401, `status=${expired.status}`);

    const reuseNonce = crypto.randomBytes(8).toString('hex');
    const headersA = buildSignatureHeaders('GET', path, null, hmacSecret, Date.now().toString(), reuseNonce);
    const first = await request(path, {
        headers: { 'X-API-Key': apiKey, ...headersA }
    });
    logResult('Gift tasks nonce first use accepted', first.status === 200, `status=${first.status}`);

    const headersB = buildSignatureHeaders('GET', path, null, hmacSecret, Date.now().toString(), reuseNonce);
    const second = await request(path, {
        headers: { 'X-API-Key': apiKey, ...headersB }
    });
    logResult('Gift tasks nonce replay rejected', second.status === 401, `status=${second.status}`);
}

async function main() {
    console.log(`Target: ${baseUrl}`);
    console.log(`Concurrency: ${concurrency}, allowReal=${allowReal}, maxSpend=${maxRealSpend}`);

    console.log('--- Login ---');
    const loggedIn = await login();
    if (!loggedIn) {
        console.log('Login failed; aborting.');
        process.exit(1);
    }

    console.log('--- CSRF tokens ---');
    const slotCsrf = await fetchCsrf('/slot');
    const giftsCsrf = await fetchCsrf('/gifts');
    logResult('Slot CSRF found', !!slotCsrf, slotCsrf ? 'ok' : 'missing');
    logResult('Gifts CSRF found', !!giftsCsrf, giftsCsrf ? 'ok' : 'missing');

    const csrfTokens = {
        slot: slotCsrf || '',
        gifts: giftsCsrf || ''
    };

    const balance = await fetchBalance();
    if (Number.isFinite(balance)) {
        logResult('Balance fetched', true, `balance=${balance}`);
    } else {
        logResult('Balance fetched', false, 'missing');
    }

    console.log('--- Payload confusion ---');
    await testContentTypeConfusion(csrfTokens);
    await testParamPollution(csrfTokens);
    await testJsonTypeConfusion(csrfTokens);

    console.log('--- Session replay ---');
    await testReplayAfterLogout(csrfTokens);

    console.log('--- Concurrent spend ---');
    await testConcurrentSlotSpend(csrfTokens, balance);

    console.log('--- Gift task signature abuse ---');
    await testGiftTaskSignatures();
}

main().catch((error) => {
    console.error('Test error:', error.message);
    process.exit(1);
});
