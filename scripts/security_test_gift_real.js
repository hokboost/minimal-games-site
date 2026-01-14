#!/usr/bin/env node
'use strict';

const { URL } = require('url');

const baseUrl = process.argv[2] || process.env.TARGET_URL || 'https://www.wuguijiang.com';
const username = process.env.AUTH_USER;
const password = process.env.AUTH_PASS;
const giftType = process.env.GIFT_TYPE || 'heartbox';
const unitCost = Number(process.env.UNIT_COST || 150);
const qty = Number(process.env.QTY || 1);
const repeat = Number(process.env.REPEAT || 2);

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

async function exchangeOnce(csrfToken, quantity) {
    const cost = unitCost * quantity;
    const response = await request('/api/gifts/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ giftType, cost, quantity })
    });
    let payload = null;
    try {
        payload = await response.json();
    } catch (error) {
        payload = null;
    }
    return { response, payload, cost };
}

async function main() {
    console.log(`Target: ${baseUrl}`);
    console.log(`Gift: ${giftType}, unit=${unitCost}, qty=${qty}, repeat=${repeat}`);

    console.log('--- Login ---');
    const loggedIn = await login();
    if (!loggedIn) {
        console.log('Login failed; aborting.');
        process.exit(1);
    }

    const csrfToken = await fetchCsrf('/gifts');
    logResult('Gifts CSRF found', !!csrfToken, csrfToken ? 'ok' : 'missing');
    if (!csrfToken) {
        process.exit(1);
    }

    const beforeBalance = await fetchBalance();
    if (beforeBalance === null) {
        logResult('Balance fetched', false, 'missing');
    } else {
        logResult('Balance fetched', true, `balance=${beforeBalance}`);
    }

    console.log('--- Real exchange tests ---');
    let expectedBalance = beforeBalance;

    for (let i = 0; i < repeat; i += 1) {
        const result = await exchangeOnce(csrfToken, qty);
        const ok = result.response.status === 200 && result.payload?.success;
        const message = result.payload?.message ? `message=${result.payload.message}` : '';
        logResult(`Exchange attempt ${i + 1}`, ok, `status=${result.response.status} ${message}`);
        if (ok && typeof expectedBalance === 'number') {
            expectedBalance -= result.cost;
        }
    }

    const afterBalance = await fetchBalance();
    if (typeof beforeBalance === 'number' && typeof afterBalance === 'number') {
        logResult('Balance decreased as expected', afterBalance === expectedBalance, `expected=${expectedBalance} actual=${afterBalance}`);
    } else {
        logResult('Balance decreased as expected', false, 'missing');
    }
}

main().catch((error) => {
    console.error('Test error:', error.message);
    process.exit(1);
});
