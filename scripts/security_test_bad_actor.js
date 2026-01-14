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
    const headers = { ...(options.headers || {}) };
    const cookies = cookieHeader();
    if (cookies) headers.cookie = cookies;
    const response = await fetch(url, {
        redirect: 'manual',
        ...options,
        headers
    });
    setCookieFromResponse(response);

    const status = response.status;
    const location = response.headers.get('location');
    const shouldFollow = [301, 302, 303, 307, 308].includes(status) && location && (options._depth || 0) < 5;
    if (shouldFollow) {
        const nextMethod = ['GET', 'HEAD', 'OPTIONS'].includes((options.method || 'GET').toUpperCase()) ? 'GET' : 'GET';
        return request(location, { ...options, method: nextMethod, body: undefined, _depth: (options._depth || 0) + 1 });
    }

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

    const location = response.headers.get('location') || '';
    const text = await response.text();
    const looksLikeLoginForm = /name=["']username["']|name=["']password["']|<form[^>]*login/i.test(text);
    const pass = response.status === 302 || response.status === 303 || (response.status === 200 && !looksLikeLoginForm);
    logResult('Login submit', pass, `status=${response.status} location=${location}`);
    if (!pass) {
        console.log('--- Login body (truncated) ---');
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

async function testGiftExchangeAbuse() {
    const invalidGift = await request('/api/gifts/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': testGiftExchangeAbuse.csrf || '' },
        body: JSON.stringify({ giftType: "heartbox';DROP TABLE users;--", cost: 1, quantity: 1 })
    });
    logResult('Gift exchange SQLi payload blocked', [400, 403].includes(invalidGift.status), `status=${invalidGift.status}`);

    const costMismatch = await request('/api/gifts/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': testGiftExchangeAbuse.csrf || '' },
        body: JSON.stringify({ giftType: 'heartbox', cost: 1, quantity: 1 })
    });
    logResult('Gift exchange cost tamper blocked', costMismatch.status === 400, `status=${costMismatch.status}`);

    const negativeQty = await request('/api/gifts/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': testGiftExchangeAbuse.csrf || '' },
        body: JSON.stringify({ giftType: 'heartbox', cost: 150, quantity: -1 })
    });
    logResult('Gift exchange negative qty blocked', negativeQty.status === 400, `status=${negativeQty.status}`);

    const tooMany = await request('/api/gifts/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': testGiftExchangeAbuse.csrf || '' },
        body: JSON.stringify({ giftType: 'heartbox', cost: 150 * 101, quantity: 101 })
    });
    logResult('Gift exchange over-quantity blocked', tooMany.status === 400, `status=${tooMany.status}`);
}

async function testGameTamper(csrfTokens) {
    const slotLarge = await request('/api/slot/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfTokens.slot },
        body: JSON.stringify({ username, betAmount: 999999 })
    });
    logResult('Slot huge bet blocked', slotLarge.status === 400, `status=${slotLarge.status}`);

    const slotString = await request('/api/slot/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfTokens.slot },
        body: JSON.stringify({ username, betAmount: '1 OR 1=1' })
    });
    logResult('Slot invalid bet blocked', slotString.status === 400, `status=${slotString.status}`);

    const scratchTier = await request('/api/scratch/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfTokens.scratch },
        body: JSON.stringify({ username, tier: 999, winCount: 5 })
    });
    logResult('Scratch invalid tier blocked', scratchTier.status === 400, `status=${scratchTier.status}`);

    const wishBatch = await request('/api/wish-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfTokens.wish },
        body: JSON.stringify({ batchCount: 9, giftType: 'deepsea_singer' })
    });
    logResult('Wish batch count tamper blocked', wishBatch.status === 400, `status=${wishBatch.status}`);

    const duelPower = await request('/api/duel/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfTokens.duel },
        body: JSON.stringify({ giftType: 'crown', power: 999 })
    });
    logResult('Duel power tamper blocked', duelPower.status === 400, `status=${duelPower.status}`);
}

async function testGiftTasksUnauthorized() {
    const response = await request('/api/gift-tasks');
    logResult('Gift tasks without key blocked', response.status === 401 || response.status === 403, `status=${response.status}`);
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
    const slotCsrf = await fetchCsrf('/slot');
    const scratchCsrf = await fetchCsrf('/scratch');
    const wishCsrf = await fetchCsrf('/wish');
    const duelCsrf = await fetchCsrf('/duel');
    const giftsCsrf = await fetchCsrf('/gifts');

    logResult('Slot CSRF found', !!slotCsrf, slotCsrf ? 'ok' : 'missing');
    logResult('Scratch CSRF found', !!scratchCsrf, scratchCsrf ? 'ok' : 'missing');
    logResult('Wish CSRF found', !!wishCsrf, wishCsrf ? 'ok' : 'missing');
    logResult('Duel CSRF found', !!duelCsrf, duelCsrf ? 'ok' : 'missing');
    logResult('Gifts CSRF found', !!giftsCsrf, giftsCsrf ? 'ok' : 'missing');

    console.log('--- Gift exchange abuse ---');
    testGiftExchangeAbuse.csrf = giftsCsrf || '';
    await testGiftExchangeAbuse();

    console.log('--- Game tamper tests ---');
    await testGameTamper({
        slot: slotCsrf || '',
        scratch: scratchCsrf || '',
        wish: wishCsrf || '',
        duel: duelCsrf || ''
    });

    console.log('--- Gift tasks auth ---');
    await testGiftTasksUnauthorized();
}

main().catch((error) => {
    console.error('Test error:', error.message);
    process.exit(1);
});
