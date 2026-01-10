#!/usr/bin/env node
'use strict';

/**
 * 管理接口防护自测脚本
 * 默认使用管理员账号 hokboost（或 ADMIN_USER/ADMIN_PASS）登录，
 * 测试签名校验和管理员限流是否生效。
 *
 * 用法示例：
 *   ADMIN_PASS=hokboost ADMIN_SIGN_SECRET=... TARGET_URL=https://wuguijiang.com node scripts/security_test_admin_guardrails.js
 */

const { URL } = require('url');
const crypto = require('crypto');

const baseUrl = process.env.TARGET_URL || process.argv[2] || 'http://localhost:3000';
const adminUser = process.env.ADMIN_USER || 'hokboost';
const adminPass = process.env.ADMIN_PASS || 'hokboost';
const signSecret = process.env.ADMIN_SIGN_SECRET || '';

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

async function request(path, options = {}, redirectDepth = 0) {
    const url = new URL(path, baseUrl);
    const headers = { ...(options.headers || {}) };
    const cookies = cookieHeader();
    if (cookies) headers.cookie = cookies;

    const response = await fetch(url, {
        redirect: 'follow',
        ...options,
        headers
    });
    setCookieFromResponse(response);

    const status = response.status;
    const location = response.headers.get('location');
    const shouldFollow = [301, 302, 303, 307, 308].includes(status) && location && redirectDepth < 3;
    if (shouldFollow) {
        // 对 GET/HEAD/OPTIONS 再次 GET 目标；对其他方法保持同方法
        const nextMethod = ['GET', 'HEAD', 'OPTIONS'].includes((options.method || 'GET').toUpperCase())
            ? 'GET'
            : options.method;
        return request(location, { ...options, method: nextMethod }, redirectDepth + 1);
    }

    return response;
}

function logResult(name, pass, info) {
    const status = pass ? 'PASS' : 'FAIL';
    const detail = info ? ` - ${info}` : '';
    console.log(`[${status}] ${name}${detail}`);
}

async function loginAdmin() {
    const loginPage = await request('/login');
    const html = await loginPage.text();
    const csrfMatch = html.match(/name="_csrf" value="([^"]+)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : null;

    logResult('Login page', loginPage.status === 200, `status=${loginPage.status}`);
    logResult('Login CSRF found', !!csrfToken, csrfToken || 'missing');
    if (!csrfToken) return false;

    const body = new URLSearchParams({
        username: adminUser,
        password: adminPass,
        _csrf: csrfToken
    }).toString();

    const resp = await request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });
    const ok = resp.status === 302 || resp.status === 303;
    logResult('Login submit', ok, `status=${resp.status}`);
    return ok;
}

function signRequest(method, fullUrl, body = {}) {
    if (!signSecret) return {};
    const ts = Date.now();
    const urlObj = new URL(fullUrl);
    const raw = `${ts}:${method.toUpperCase()}:${urlObj.pathname}${urlObj.search}:${JSON.stringify(body)}`;
    const sig = crypto.createHmac('sha256', signSecret).update(raw).digest('hex');
    return { ts, sig };
}

async function testSignedRequest() {
    if (!signSecret) {
        console.log('[SKIP] ADMIN_SIGN_SECRET 未设置，跳过签名校验测试');
        return;
    }
    const endpoint = '/api/admin/balance/logs?page=1&limit=1';
    const { ts, sig } = signRequest('GET', new URL(endpoint, baseUrl));

    const resp = await request(endpoint, {
        method: 'GET',
        headers: {
            'x-sig-ts': ts.toString(),
            'x-signature': sig
        }
    });
    logResult('Signed admin request', resp.status === 200, `status=${resp.status}`);

    const respNoSig = await request(endpoint, { method: 'GET' });
    logResult('Missing signature rejected', respNoSig.status === 401 || respNoSig.status === 403, `status=${respNoSig.status}`);
}

async function testAdminRateLimit() {
    const endpoint = '/api/admin/security-events';
    const statuses = [];
    for (let i = 0; i < 20; i += 1) {
        const { ts, sig } = signRequest('GET', new URL(endpoint, baseUrl));
        const resp = await request(endpoint, {
            method: 'GET',
            headers: signSecret ? { 'x-sig-ts': ts.toString(), 'x-signature': sig } : {}
        });
        statuses.push(resp.status);
    }
    const overLimit = statuses.filter((s) => s === 429).length > 0;
    logResult('Admin rate limit triggers', overLimit, `statuses=${statuses.join(',')}`);
}

async function main() {
    console.log(`Target: ${baseUrl}`);
    const loggedIn = await loginAdmin();
    if (!loggedIn) {
        console.error('登录失败，终止后续测试');
        process.exit(1);
    }
    await testSignedRequest();
    await testAdminRateLimit();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
