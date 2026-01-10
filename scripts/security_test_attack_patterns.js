#!/usr/bin/env node
'use strict';

const { URL } = require('url');
const crypto = require('crypto');

const baseUrl = process.argv[2] || process.env.TARGET_URL || 'https://www.wuguijiang.com';
const username = process.env.AUTH_USER;
const password = process.env.AUTH_PASS;

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
    const response = await fetch(url, {
        redirect: 'follow',
        ...options,
        headers
    });
    return response;
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

async function testAdminEndpoints(csrfToken) {
    const updateBalance = await request('/api/admin/update-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ username: 'test', balance: 999999 })
    });
    logResult('Admin update balance blocked', updateBalance.status === 403, `status=${updateBalance.status}`);

    const deleteAccount = await request('/api/admin/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ username: 'test' })
    });
    logResult('Admin delete account blocked', deleteAccount.status === 403, `status=${deleteAccount.status}`);
}

async function testGiftExchangeCsrf() {
    const missingCsrf = await request('/api/gifts/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftType: 'heartbox', cost: 150, quantity: 1 })
    });
    logResult('Gift exchange without CSRF blocked', missingCsrf.status === 403, `status=${missingCsrf.status}`);
}

async function testBackpackTamper(csrfToken) {
    const invalidId = await request('/api/wish/backpack/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ inventoryId: '1 OR 1=1' })
    });
    logResult('Backpack send invalid id blocked', invalidId.status === 400, `status=${invalidId.status}`);
}

async function testGiftTasksSignature() {
    if (!apiKey || !hmacSecret) {
        console.log('[SKIP] Gift tasks signature tests (missing WINDOWS_API_KEY/GIFT_TASKS_HMAC_SECRET)');
        return;
    }

    const path = '/api/gift-tasks';
    const invalidHeaders = {
        'X-API-Key': apiKey,
        'X-Timestamp': Date.now().toString(),
        'X-Nonce': 'badnonce',
        'X-Signature': 'deadbeef'
    };
    const badSignature = await request(path, {
        headers: invalidHeaders
    });
    logResult('Gift tasks invalid signature blocked', badSignature.status === 401, `status=${badSignature.status}`);

    const goodSignatureHeaders = buildSignatureHeaders('GET', path, null, hmacSecret);
    const missingKey = await request(path, {
        headers: {
            ...goodSignatureHeaders
        }
    });
    logResult('Gift tasks missing key blocked', missingKey.status === 401, `status=${missingKey.status}`);
}

async function testAuthBypass() {
    const response = await requestNoCookies('/api/gifts/history');
    logResult('Gift history requires login', response.status === 401 || response.status === 403, `status=${response.status}`);
}

async function main() {
    console.log(`Target: ${baseUrl}`);
    console.log('--- Login ---');
    const loggedIn = await login();
    if (!loggedIn) {
        console.log('Login failed; aborting.');
        process.exit(1);
    }

    console.log('--- CSRF tokens ---');
    const giftsCsrf = await fetchCsrf('/gifts');
    const profileCsrf = await fetchCsrf('/profile');
    logResult('Gifts CSRF found', !!giftsCsrf, giftsCsrf ? 'ok' : 'missing');
    logResult('Profile CSRF found', !!profileCsrf, profileCsrf ? 'ok' : 'missing');

    console.log('--- Admin endpoint abuse ---');
    await testAdminEndpoints(profileCsrf || '');

    console.log('--- Gift exchange CSRF ---');
    await testGiftExchangeCsrf();

    console.log('--- Backpack tamper ---');
    await testBackpackTamper(profileCsrf || '');

    console.log('--- Gift tasks signature ---');
    await testGiftTasksSignature();

    console.log('--- Auth bypass ---');
    await testAuthBypass();
}

main().catch((error) => {
    console.error('Test error:', error.message);
    process.exit(1);
});
