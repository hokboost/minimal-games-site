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

function createClient() {
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

    async function fetchCsrf(path) {
        const response = await request(path);
        const text = await response.text();
        const match = text.match(/data-csrf-token="([^"]+)"/);
        return match ? match[1] : null;
    }

    return {
        request,
        requestNoCookies,
        fetchCsrf
    };
}

function logResult(name, pass, info) {
    const status = pass ? 'PASS' : 'FAIL';
    const detail = info ? ` - ${info}` : '';
    console.log(`[${status}] ${name}${detail}`);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function login(client) {
    const loginPage = await client.request('/login');
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

    const response = await client.request('/login', {
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

async function fetchBalance(client) {
    const logResponse = await client.request('/api/balance/logs?limit=1');
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

    const response = await client.request('/gifts');
    const text = await response.text();
    const match = text.match(/id="currentBalance">([^<]+)</);
    if (!match) return null;
    const num = Number(match[1].replace(/[^\d.-]/g, ''));
    return Number.isFinite(num) ? num : null;
}

async function testCsrfReplayCrossSession(clientA, clientB, tokenA) {
    const response = await clientB.request('/api/gifts/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': tokenA },
        body: JSON.stringify({ giftType: 'heartbox', cost: 150, quantity: 1 })
    });
    logResult('CSRF token replay across sessions blocked', [401, 403].includes(response.status), `status=${response.status}`);
}

async function testUnauthorizedAccess(client) {
    const endpoints = [
        '/admin',
        '/api/gifts/history',
        '/api/wish/backpack',
        '/api/stone/state',
        '/api/game-records/slot'
    ];

    for (const path of endpoints) {
        const response = await client.requestNoCookies(path);
        const pass = [401, 403, 302].includes(response.status);
        logResult(`Unauth blocked ${path}`, pass, `status=${response.status}`);
    }
}

async function testAdminAbuse(client, csrfToken) {
    const attempts = [
        ['/api/admin/update-balance', { username, balance: 999999 }],
        ['/api/admin/add-electric-coin', { username, amount: 999999 }],
        ['/api/admin/authorize-user', { username }],
        ['/api/admin/reset-password', { username, newPassword: '123456' }]
    ];

    for (const [path, payload] of attempts) {
        const response = await client.request(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(payload)
        });
        logResult(`Admin abuse blocked ${path}`, response.status === 403, `status=${response.status}`);
    }
}

async function testGiftExchangeTamper(client, csrfToken) {
    const cases = [
        { name: 'sql-like gift', payload: { giftType: "heartbox';DROP TABLE users;--", cost: 1, quantity: 1 } },
        { name: 'path gift', payload: { giftType: '../../etc/passwd', cost: 1, quantity: 1 } },
        { name: 'wrong cost', payload: { giftType: 'heartbox', cost: 1, quantity: 1 } },
        { name: 'float cost', payload: { giftType: 'heartbox', cost: 149.5, quantity: 1 } },
        { name: 'negative qty', payload: { giftType: 'heartbox', cost: 150, quantity: -1 } },
        { name: 'zero qty', payload: { giftType: 'heartbox', cost: 0, quantity: 0 } },
        { name: 'huge qty', payload: { giftType: 'heartbox', cost: 150 * 1000, quantity: 1000 } }
    ];

    for (const testCase of cases) {
        const response = await client.request('/api/gifts/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(testCase.payload)
        });
        logResult(`Gift exchange blocked (${testCase.name})`, [400, 403, 429].includes(response.status), `status=${response.status}`);
    }
}

async function testExchangeConcurrency(client, csrfToken, count = 200) {
    const payload = { giftType: 'heartbox', cost: 1, quantity: 1 };
    let ok = 0;
    let fail = 0;

    const tasks = Array.from({ length: count }, () => {
        return client.request('/api/gifts/exchange', {
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
    logResult('Exchange concurrency blocked', fail === 0, `ok=${ok} fail=${fail}`);
}

async function testScratchTamper(client, csrfToken) {
    const cases = [
        { name: 'invalid tier', payload: { username, tier: 999, winCount: 5 }, expected: 400 },
        { name: 'negative tier', payload: { username, tier: -5, winCount: 5 }, expected: 400 },
        { name: 'string tier', payload: { username, tier: '1 OR 1=1', winCount: 5 }, expected: 400 },
        { name: 'wrong user', payload: { username: 'attacker', tier: 5, winCount: 5 }, expected: 403 }
    ];

    for (const testCase of cases) {
        const response = await client.request('/api/scratch/play', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(testCase.payload)
        });
        const pass = response.status === testCase.expected || response.status === 429;
        logResult(`Scratch blocked (${testCase.name})`, pass, `status=${response.status}`);
    }
}

async function testSlotTamper(client, csrfToken) {
    const cases = [
        { name: 'string bet', payload: { username, betAmount: '1 OR 1=1' }, expected: 400 },
        { name: 'float bet', payload: { username, betAmount: 1.5 }, expected: 400 },
        { name: 'negative bet', payload: { username, betAmount: -1 }, expected: 400 },
        { name: 'zero bet', payload: { username, betAmount: 0 }, expected: 400 },
        { name: 'huge bet', payload: { username, betAmount: 999999 }, expected: 400 },
        { name: 'wrong user', payload: { username: 'attacker', betAmount: 1 }, expected: 403 }
    ];

    for (const testCase of cases) {
        const response = await client.request('/api/slot/play', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(testCase.payload)
        });
        const pass = response.status === testCase.expected || response.status === 429;
        logResult(`Slot blocked (${testCase.name})`, pass, `status=${response.status}`);
    }
}

async function testWishTamper(client, csrfToken) {
    const invalidGift = await client.request('/api/wish/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ giftType: 'invalid' })
    });
    logResult('Wish invalid gift blocked', [400, 429].includes(invalidGift.status), `status=${invalidGift.status}`);

    const invalidBatch = await client.request('/api/wish-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ batchCount: 9, giftType: 'deepsea_singer' })
    });
    logResult('Wish batch count blocked', [400, 429].includes(invalidBatch.status), `status=${invalidBatch.status}`);
}

async function testDuelTamper(client, csrfToken) {
    const invalidGift = await client.request('/api/duel/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ giftType: 'invalid', power: 50 })
    });
    logResult('Duel invalid gift blocked', [400, 429].includes(invalidGift.status), `status=${invalidGift.status}`);

    const invalidPower = await client.request('/api/duel/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ giftType: 'crown', power: 999 })
    });
    logResult('Duel power blocked', [400, 429].includes(invalidPower.status), `status=${invalidPower.status}`);
}

async function testBackpackSendTamper(client, csrfToken) {
    const invalid = await client.request('/api/wish/backpack/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ inventoryId: '1 OR 1=1' })
    });
    logResult('Backpack invalid id blocked', [400, 429].includes(invalid.status), `status=${invalid.status}`);
}

async function testSessionLogout(client) {
    const response = await client.request('/logout');
    logResult('Logout reachable', [200, 302].includes(response.status), `status=${response.status}`);
}

async function main() {
    console.log(`Target: ${baseUrl}`);

    const clientA = createClient();

    console.log('--- Login ---');
    const loggedInA = await login(clientA);
    if (!loggedInA) {
        console.log('Login failed; aborting.');
        process.exit(1);
    }

    const beforeBalance = await fetchBalance(clientA);
    logResult('Balance fetched', beforeBalance !== null, beforeBalance !== null ? `balance=${beforeBalance}` : 'missing');

    const giftsCsrfA = await clientA.fetchCsrf('/gifts');
    const slotCsrfA = await clientA.fetchCsrf('/slot');
    const scratchCsrfA = await clientA.fetchCsrf('/scratch');
    const duelCsrfA = await clientA.fetchCsrf('/duel');
    const wishCsrfA = await clientA.fetchCsrf('/wish');
    const profileCsrfA = await clientA.fetchCsrf('/profile');

    logResult('Gifts CSRF found', !!giftsCsrfA, giftsCsrfA ? 'ok' : 'missing');
    logResult('Slot CSRF found', !!slotCsrfA, slotCsrfA ? 'ok' : 'missing');
    logResult('Scratch CSRF found', !!scratchCsrfA, scratchCsrfA ? 'ok' : 'missing');
    logResult('Duel CSRF found', !!duelCsrfA, duelCsrfA ? 'ok' : 'missing');
    logResult('Wish CSRF found', !!wishCsrfA, wishCsrfA ? 'ok' : 'missing');
    logResult('Profile CSRF found', !!profileCsrfA, profileCsrfA ? 'ok' : 'missing');

    console.log('--- Unauth access ---');
    await testUnauthorizedAccess(clientA);

    console.log('--- Admin abuse ---');
    await testAdminAbuse(clientA, profileCsrfA || '');

    console.log('--- Exchange tamper ---');
    await testGiftExchangeTamper(clientA, giftsCsrfA || '');
    await testExchangeConcurrency(clientA, giftsCsrfA || '', 200);

    console.log('--- Scratch tamper ---');
    await sleep(1500);
    await testScratchTamper(clientA, scratchCsrfA || '');

    console.log('--- Slot tamper ---');
    await sleep(1500);
    await testSlotTamper(clientA, slotCsrfA || '');

    console.log('--- Wish tamper ---');
    await sleep(1500);
    await testWishTamper(clientA, wishCsrfA || '');

    console.log('--- Duel tamper ---');
    await sleep(1500);
    await testDuelTamper(clientA, duelCsrfA || '');

    console.log('--- Backpack tamper ---');
    await sleep(1500);
    await testBackpackSendTamper(clientA, profileCsrfA || '');

    console.log('--- Balance check ---');
    const afterBalance = await fetchBalance(clientA);
    if (beforeBalance !== null && afterBalance !== null) {
        logResult('Balance unchanged after suite', beforeBalance === afterBalance, `before=${beforeBalance} after=${afterBalance}`);
    } else {
        logResult('Balance unchanged after suite', false, 'missing');
    }

    console.log('--- CSRF cross-session replay (last) ---');
    if (giftsCsrfA) {
        const clientB = createClient();
        const loggedInB = await login(clientB);
        if (loggedInB) {
            await testCsrfReplayCrossSession(clientA, clientB, giftsCsrfA);
        } else {
            logResult('CSRF cross-session replay skipped', false, 'login failed');
        }
    } else {
        logResult('CSRF cross-session replay skipped', false, 'missing token');
    }

    console.log('--- Logout ---');
    await testSessionLogout(clientA);
}

main().catch((error) => {
    console.error('Test error:', error.message);
    process.exit(1);
});
