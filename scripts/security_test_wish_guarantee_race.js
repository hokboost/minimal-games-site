#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const { URL } = require('url');

const baseUrl = process.argv[2] || process.env.TARGET_URL || 'https://www.wuguijiang.com';
const username = process.env.AUTH_USER;
const password = process.env.AUTH_PASS;
const attempts = Number(process.env.WISH_ATTEMPTS || 50);
const giftType = process.env.WISH_GIFT || 'deepsea_singer';
const primeFails = Number(process.env.WISH_FAILS || 148); // set to guarantee threshold or higher
const primeBalance = Number(process.env.WISH_BALANCE || 20000);

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

function createDbPool() {
    const pool = new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASS,
        port: process.env.DB_PORT || 5432,
        ssl: { rejectUnauthorized: false }
    });
    return pool;
}

async function primeProgress(pool) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            'UPDATE users SET balance = $1 WHERE username = $2',
            [primeBalance, username]
        );

        const update = await client.query(
            `UPDATE wish_progress
             SET consecutive_fails = $1, total_wishes = GREATEST(total_wishes, 0)
             WHERE username = $2 AND gift_type = $3`,
            [primeFails, username, giftType]
        );
        if (update.rowCount === 0) {
            await client.query(
                `INSERT INTO wish_progress (username, gift_type, total_wishes, consecutive_fails, total_spent, total_rewards_value)
                 VALUES ($1, $2, 0, $3, 0, 0)`,
                [username, giftType, primeFails]
            );
        }
        await client.query('COMMIT');
        logResult('Prime wish progress', true, `fails=${primeFails}, balance=${primeBalance}`);
    } catch (error) {
        await client.query('ROLLBACK');
        logResult('Prime wish progress', false, error.message);
    } finally {
        client.release();
    }
}

async function playOnce(csrfToken) {
    const response = await request('/api/wish/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ giftType })
    });
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, payload };
}

async function main() {
    console.log(`Target: ${baseUrl}`);
    console.log(`Attempts: ${attempts}, gift=${giftType}, primeFails=${primeFails}, primeBalance=${primeBalance}`);

    console.log('--- Login ---');
    const loginOk = await login();
    if (!loginOk) {
        console.log('Login failed; aborting.');
        process.exit(1);
    }

    const csrfWish = await fetchCsrf('/wish');
    logResult('Wish CSRF found', !!csrfWish, csrfWish ? 'ok' : 'missing');
    if (!csrfWish) {
        process.exit(1);
    }

    console.log('--- Prime DB state ---');
    const pool = createDbPool();
    await primeProgress(pool);
    await pool.end();

    console.log('--- Concurrent wish play ---');
    const tasks = Array.from({ length: attempts }, () => playOnce(csrfWish));
    const results = await Promise.all(tasks);
    const rewards = results.map((r) => r.payload?.rewardValue || 0);
    const successCount = results.filter((r) => r.status === 200 && r.payload?.wishSuccess).length;
    const totalReward = rewards.reduce((a, b) => a + b, 0);
    console.log('Wish results statuses:', results.map((r) => r.status));
    logResult('Wish concurrent play', successCount <= 1, `success=${successCount} totalReward=${totalReward}`);
}

main().catch((error) => {
    console.error('Test error:', error.message);
    process.exit(1);
});
