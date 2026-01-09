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

async function testAuthPages() {
    const pages = [
        '/profile',
        '/gifts',
        '/wish',
        '/slot',
        '/spin',
        '/scratch',
        '/stone',
        '/flip',
        '/duel',
        '/quiz'
    ];

    for (const page of pages) {
        const response = await request(page);
        const pass = response.status === 200 || response.status === 302;
        logResult(`Page ${page}`, pass, `status=${response.status}`);
    }
}

async function testAuthApis() {
    const apis = [
        '/api/gifts/history',
        '/api/wish/backpack',
        '/api/stone/state',
        '/api/flip/state',
        '/api/game-records/slot',
        '/api/game-records/quiz'
    ];

    for (const api of apis) {
        const response = await request(api);
        const pass = response.status === 200;
        logResult(`API ${api}`, pass, `status=${response.status}`);
    }
}

async function testForbiddenAdmin() {
    const response = await request('/admin');
    const pass = response.status === 403 || response.status === 302;
    logResult('Admin access blocked', pass, `status=${response.status}`);
}

async function main() {
    console.log(`Target: ${baseUrl}`);
    console.log('--- Login ---');
    const loggedIn = await login();
    if (!loggedIn) {
        console.log('Login failed; aborting.');
        process.exit(1);
    }
    console.log('--- Pages ---');
    await testAuthPages();
    console.log('--- APIs ---');
    await testAuthApis();
    console.log('--- Admin access ---');
    await testForbiddenAdmin();
}

main().catch((error) => {
    console.error('Test error:', error.message);
    process.exit(1);
});
