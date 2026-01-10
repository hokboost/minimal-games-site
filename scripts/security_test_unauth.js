#!/usr/bin/env node
'use strict';

const { URL } = require('url');

const baseUrl = process.argv[2] || process.env.TARGET_URL || 'https://wuguijiang.com';
const registerAttempts = Number(process.env.REGISTER_ATTEMPTS || 5);

const cookieJar = new Map();

function setCookieFromResponse(response) {
    const setCookie = response.headers.get('set-cookie');
    if (!setCookie) return;
    const firstPart = setCookie.split(';')[0];
    const [name, value] = firstPart.split('=');
    if (name && value !== undefined) {
        cookieJar.set(name.trim(), value.trim());
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

function pickHeader(response, key) {
    const value = response.headers.get(key);
    return value || '';
}

async function testSecurityHeaders() {
    const response = await request('/');
    const csp = pickHeader(response, 'content-security-policy');
    const hsts = pickHeader(response, 'strict-transport-security');
    const xfo = pickHeader(response, 'x-frame-options');
    const xcto = pickHeader(response, 'x-content-type-options');

    logResult('CSP header present', !!csp, csp ? 'ok' : 'missing');
    logResult('HSTS header present', !!hsts, hsts ? 'ok' : 'missing');
    logResult('X-Frame-Options present', !!xfo, xfo ? 'ok' : 'missing');
    logResult('X-Content-Type-Options present', !!xcto, xcto ? 'ok' : 'missing');
}

async function testUnauthorizedEndpoints() {
    const endpoints = [
        { name: 'Admin page', path: '/admin', expected: [401, 403, 302] },
        { name: 'Gift tasks (no auth)', path: '/api/gift-tasks', expected: [401, 403] },
        { name: 'Gift history (no auth)', path: '/api/gifts/history', expected: [401, 403] },
        { name: 'Wish backpack (no auth)', path: '/api/wish/backpack', expected: [401, 403] },
        { name: 'Stone state (no auth)', path: '/api/stone/state', expected: [401, 403] },
        { name: 'Game records (no auth)', path: '/api/game-records/slot', expected: [401, 403] }
    ];

    for (const endpoint of endpoints) {
        const response = await request(endpoint.path);
        const pass = endpoint.expected.includes(response.status);
        logResult(endpoint.name, pass, `status=${response.status}`);
    }
}

async function testRegisterCsrf() {
    const registerPage = await request('/register');
    const pageText = await registerPage.text();
    const csrfMatch = pageText.match(/name="_csrf" value="([^"]+)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : null;

    logResult('Register page reachable', registerPage.status === 200, `status=${registerPage.status}`);
    logResult('Register CSRF token found', !!csrfToken, csrfToken ? 'ok' : 'missing');

    const noCsrfResponse = await request('/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'username=test&password=123456'
    });
    logResult('Register without CSRF rejected', noCsrfResponse.status === 403, `status=${noCsrfResponse.status}`);

    if (csrfToken) {
        const shortPassResponse = await request('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `username=test&password=123&_csrf=${encodeURIComponent(csrfToken)}`
        });
        const pass = shortPassResponse.status === 200;
        logResult('Register weak password rejected', pass, `status=${shortPassResponse.status}`);
    }
}

async function testRegisterBurst() {
    let tooMany = 0;
    let forbidden = 0;
    let ok = 0;

    for (let i = 0; i < registerAttempts; i += 1) {
        const response = await request('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'username=rate_test&password=123456'
        });
        if (response.status === 429) {
            tooMany += 1;
        } else if (response.status === 403) {
            forbidden += 1;
        } else if (response.status === 200) {
            ok += 1;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
    }

    logResult(
        'Register burst (no CSRF) throttling',
        tooMany > 0 || forbidden > 0,
        `429=${tooMany}, 403=${forbidden}, 200=${ok}`
    );
}

async function main() {
    console.log(`Target: ${baseUrl}`);
    console.log(`Register attempts: ${registerAttempts}`);
    console.log('--- Security headers ---');
    await testSecurityHeaders();
    console.log('--- Unauthorized endpoints ---');
    await testUnauthorizedEndpoints();
    console.log('--- CSRF checks ---');
    await testRegisterCsrf();
    console.log('--- Register burst (no CSRF) ---');
    await testRegisterBurst();
}

main().catch((error) => {
    console.error('Test error:', error.message);
    process.exit(1);
});
