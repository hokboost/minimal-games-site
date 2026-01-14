#!/usr/bin/env node
'use strict';

const { URL } = require('url');

const baseUrl = process.argv[2] || process.env.TARGET_URL || 'https://www.wuguijiang.com';
const username = process.env.AUTH_USER;
const password = process.env.AUTH_PASS;

const slotCount = Number(process.env.SLOT_COUNT || 50);
const slotConcurrency = Number(process.env.SLOT_CONCURRENCY || 10);
const scratchCount = Number(process.env.SCRATCH_COUNT || 20);
const duelCount = Number(process.env.DUEL_COUNT || 20);

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
            'Content-Type': 'application/x-www-form-urlencoded',
            'x-csrf-token': csrfToken
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

async function testTamper(csrfTokens) {
    const slotMismatch = await request('/api/slot/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfTokens.slot },
        body: JSON.stringify({ username: 'attacker', betAmount: 10 })
    });
    logResult('Slot username mismatch blocked', slotMismatch.status === 403, `status=${slotMismatch.status}`);

    const slotRange = await request('/api/slot/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfTokens.slot },
        body: JSON.stringify({ username, betAmount: 0 })
    });
    logResult('Slot bet out of range blocked', slotRange.status === 400, `status=${slotRange.status}`);

    const scratchMismatch = await request('/api/scratch/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfTokens.scratch },
        body: JSON.stringify({ username: 'attacker', tier: 5, winCount: 5 })
    });
    logResult('Scratch username mismatch blocked', scratchMismatch.status === 403, `status=${scratchMismatch.status}`);

    const duelInvalid = await request('/api/duel/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfTokens.duel },
        body: JSON.stringify({ giftType: 'crown', power: 0 })
    });
    logResult('Duel power out of range blocked', duelInvalid.status === 400, `status=${duelInvalid.status}`);

    const stoneNoCsrf = await request('/api/stone/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });
    logResult('Stone add without CSRF blocked', stoneNoCsrf.status === 403, `status=${stoneNoCsrf.status}`);

    const flipInvalid = await request('/api/flip/flip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfTokens.flip },
        body: JSON.stringify({ cardIndex: 99 })
    });
    logResult('Flip invalid card blocked', flipInvalid.status === 400, `status=${flipInvalid.status}`);
}

async function runSlotStress(csrfToken) {
    let ok = 0;
    let fail = 0;
    let lastStatus = null;

    const tasks = Array.from({ length: slotCount }, (_, i) => i);
    let index = 0;

    async function worker() {
        while (index < tasks.length) {
            const current = index;
            index += 1;
            const response = await request('/api/slot/play', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify({ username, betAmount: 1 })
            });
            lastStatus = response.status;
            if (response.status === 200) {
                ok += 1;
            } else {
                fail += 1;
            }
            if (current % 10 === 0) {
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
        }
    }

    const workers = Array.from({ length: slotConcurrency }, () => worker());
    await Promise.all(workers);

    logResult('Slot stress', fail === 0, `ok=${ok} fail=${fail} lastStatus=${lastStatus}`);
}

async function runScratchBatch(csrfToken) {
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < scratchCount; i += 1) {
        const response = await request('/api/scratch/play', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify({ username, tier: 5, winCount: 5 })
        });
        if (response.status === 200) {
            ok += 1;
        } else {
            fail += 1;
        }
        if (i % 5 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 120));
        }
    }
    logResult('Scratch batch', fail === 0, `ok=${ok} fail=${fail}`);
}

async function runDuelBatch(csrfToken) {
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < duelCount; i += 1) {
        const response = await request('/api/duel/play', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify({ giftType: 'crown', power: 1 })
        });
        if (response.status === 200) {
            ok += 1;
        } else {
            fail += 1;
        }
        if (i % 5 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 120));
        }
    }
    logResult('Duel batch', fail === 0, `ok=${ok} fail=${fail}`);
}

async function main() {
    console.log(`Target: ${baseUrl}`);
    console.log(`Slot count=${slotCount}, concurrency=${slotConcurrency}, scratch=${scratchCount}, duel=${duelCount}`);

    console.log('--- Login ---');
    const loggedIn = await login();
    if (!loggedIn) {
        console.log('Login failed; aborting.');
        process.exit(1);
    }

    console.log('--- CSRF tokens ---');
    const slotCsrf = await fetchCsrf('/slot');
    const scratchCsrf = await fetchCsrf('/scratch');
    const duelCsrf = await fetchCsrf('/duel');
    const stoneCsrf = await fetchCsrf('/stone');
    const flipCsrf = await fetchCsrf('/flip');

    logResult('Slot CSRF found', !!slotCsrf, slotCsrf ? 'ok' : 'missing');
    logResult('Scratch CSRF found', !!scratchCsrf, scratchCsrf ? 'ok' : 'missing');
    logResult('Duel CSRF found', !!duelCsrf, duelCsrf ? 'ok' : 'missing');
    logResult('Stone CSRF found', !!stoneCsrf, stoneCsrf ? 'ok' : 'missing');
    logResult('Flip CSRF found', !!flipCsrf, flipCsrf ? 'ok' : 'missing');

    console.log('--- Tamper checks ---');
    await testTamper({
        slot: slotCsrf || '',
        scratch: scratchCsrf || '',
        duel: duelCsrf || '',
        stone: stoneCsrf || '',
        flip: flipCsrf || ''
    });

    console.log('--- Stress tests ---');
    await runSlotStress(slotCsrf || '');
    await runScratchBatch(scratchCsrf || '');
    await runDuelBatch(duelCsrf || '');
}

main().catch((error) => {
    console.error('Test error:', error.message);
    process.exit(1);
});
