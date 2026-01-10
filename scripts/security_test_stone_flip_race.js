#!/usr/bin/env node
'use strict';

const { URL } = require('url');

const baseUrl = process.argv[2] || process.env.TARGET_URL || 'https://www.wuguijiang.com';
const username = process.env.AUTH_USER;
const password = process.env.AUTH_PASS;
const redeemAttempts = Number(process.env.REDEEM_ATTEMPTS || 10);
const cashoutAttempts = Number(process.env.CASHOUT_ATTEMPTS || 10);

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

    if (!csrfToken) return null;

    const body = new URLSearchParams({
        username,
        password,
        _csrf: csrfToken
    }).toString();

    const response = await request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });

    const pass = response.status === 302 || response.status === 303;
    const location = response.headers.get('location') || '';
    logResult('Login submit', pass, `status=${response.status} location=${location}`);
    return pass ? csrfToken : null;
}

async function fetchCsrf(path) {
    const response = await request(path);
    const text = await response.text();
    const match = text.match(/data-csrf-token="([^"]+)"/);
    return match ? match[1] : null;
}

async function stoneFill(csrfToken) {
    const response = await request('/api/stone/fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({})
    });
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, payload };
}

async function stoneRedeemOnce(csrfToken) {
    const response = await request('/api/stone/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({})
    });
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, payload };
}

async function flipStart(csrfToken) {
    const response = await request('/api/flip/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({})
    });
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, payload };
}

async function flipCard(csrfToken, cardIndex) {
    const response = await request('/api/flip/flip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ cardIndex })
    });
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, payload };
}

async function flipCashoutOnce(csrfToken) {
    const response = await request('/api/flip/cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({})
    });
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, payload };
}

async function concurrentRedeem(csrfToken) {
    const tasks = Array.from({ length: redeemAttempts }, () => stoneRedeemOnce(csrfToken));
    const results = await Promise.all(tasks);
    const rewards = results.map((r) => Number(r.payload?.reward) || 0);
    const successCount = results.filter((r) => r.status === 200 && r.payload?.success).length;
    const totalReward = rewards.reduce((a, b) => a + b, 0);
    console.log('Stone redeem concurrent results:', results.map((r) => r.status));
    logResult('Stone redeem concurrent', successCount <= 1, `success=${successCount} totalReward=${totalReward}`);
}

async function concurrentCashout(csrfToken) {
    const tasks = Array.from({ length: cashoutAttempts }, () => flipCashoutOnce(csrfToken));
    const results = await Promise.all(tasks);
    const rewards = results.map((r) => Number(r.payload?.reward) || 0);
    const successCount = results.filter((r) => r.status === 200 && r.payload?.success !== false).length;
    const totalReward = rewards.reduce((a, b) => a + b, 0);
    console.log('Flip cashout concurrent results:', results.map((r) => r.status));
    logResult('Flip cashout concurrent', successCount <= 1, `success=${successCount} totalReward=${totalReward}`);
}

async function main() {
    console.log(`Target: ${baseUrl}`);
    console.log(`Redeem attempts: ${redeemAttempts}, cashout attempts: ${cashoutAttempts}`);

    console.log('--- Login ---');
    const loginOk = await login();
    if (!loginOk) {
        console.log('Login failed; aborting.');
        process.exit(1);
    }

    const csrfStone = await fetchCsrf('/stone');
    const csrfFlip = await fetchCsrf('/flip');
    logResult('Stone CSRF found', !!csrfStone, csrfStone ? 'ok' : 'missing');
    logResult('Flip CSRF found', !!csrfFlip, csrfFlip ? 'ok' : 'missing');
    if (!csrfStone || !csrfFlip) {
        process.exit(1);
    }

    console.log('--- Stone fill + concurrent redeem ---');
    const fill = await stoneFill(csrfStone);
    logResult('Stone fill', fill.status === 200 && fill.payload?.success, `status=${fill.status}`);
    await concurrentRedeem(csrfStone);

    console.log('--- Flip start + cashout race (best effort, random board) ---');
    const start = await flipStart(csrfFlip);
    logResult('Flip start', start.status === 200 && start.payload?.success, `status=${start.status}`);

    // Try flipping first 2 cards to increase good_count chance; randomness applies
    await flipCard(csrfFlip, 0).catch(() => {});
    await flipCard(csrfFlip, 1).catch(() => {});
    await concurrentCashout(csrfFlip);
}

main().catch((error) => {
    console.error('Test error:', error.message);
    process.exit(1);
});
