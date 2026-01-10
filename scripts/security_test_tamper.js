#!/usr/bin/env node
'use strict';

const { URL } = require('url');

const baseUrl = process.argv[2] || process.env.TARGET_URL || 'https://www.wuguijiang.com';
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

async function testAdminProtection() {
    const response = await request('/api/admin/update-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'test', balance: 999999 })
    });
    logResult('Admin balance update blocked', response.status === 403, `status=${response.status}`);
}

async function testGiftExchangeTamper() {
    const response = await request('/api/gifts/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftType: 'heartbox', cost: 1, quantity: 1 })
    });
    const pass = response.status === 400;
    logResult('Gift exchange cost tamper blocked', pass, `status=${response.status}`);
}

async function testDuelTamper(csrfToken) {
    const noCsrf = await request('/api/duel/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftType: '至尊奖', power: 80 })
    });
    logResult('Duel without CSRF blocked', noCsrf.status === 403, `status=${noCsrf.status}`);

    const invalidGift = await request('/api/duel/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ giftType: 'invalid', power: 80 })
    });
    logResult('Duel invalid gift blocked', invalidGift.status === 400, `status=${invalidGift.status}`);
}

async function testWishTamper(csrfToken) {
    const noCsrf = await request('/api/wish/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftType: 'deepsea_singer' })
    });
    logResult('Wish without CSRF blocked', noCsrf.status === 403, `status=${noCsrf.status}`);

    const invalidGift = await request('/api/wish/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ giftType: 'invalid' })
    });
    logResult('Wish invalid gift blocked', invalidGift.status === 400, `status=${invalidGift.status}`);
}

async function testOtherGameCsrf(csrfTokens) {
    const stone = await request('/api/stone/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: 0 })
    });
    logResult('Stone replace without CSRF blocked', stone.status === 403, `status=${stone.status}`);

    const flip = await request('/api/flip/flip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: 0 })
    });
    logResult('Flip without CSRF blocked', flip.status === 403, `status=${flip.status}`);

    const stoneInvalid = await request('/api/stone/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfTokens.stone },
        body: JSON.stringify({ index: 99 })
    });
    logResult('Stone invalid index blocked', stoneInvalid.status === 400, `status=${stoneInvalid.status}`);
}

async function testGiftTasksAccess() {
    const response = await request('/api/gift-tasks');
    logResult('Gift tasks protected', response.status === 401 || response.status === 403, `status=${response.status}`);
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
    const duelCsrf = await fetchCsrf('/duel');
    const wishCsrf = await fetchCsrf('/wish');
    const stoneCsrf = await fetchCsrf('/stone');
    logResult('Duel CSRF found', !!duelCsrf, duelCsrf ? 'ok' : 'missing');
    logResult('Wish CSRF found', !!wishCsrf, wishCsrf ? 'ok' : 'missing');
    logResult('Stone CSRF found', !!stoneCsrf, stoneCsrf ? 'ok' : 'missing');

    console.log('--- Tamper tests ---');
    await testAdminProtection();
    await testGiftExchangeTamper();
    await testDuelTamper(duelCsrf || '');
    await testWishTamper(wishCsrf || '');
    await testOtherGameCsrf({ stone: stoneCsrf || '' });
    await testGiftTasksAccess();
}

main().catch((error) => {
    console.error('Test error:', error.message);
    process.exit(1);
});
