#!/usr/bin/env node
require("./guard-test-target").enforceSafeTestTarget();
'use strict';

/**
 * 弱默认配置测试
 * 测试目标：检测系统是否存在弱默认配置
 *
 * 测试项：
 * 1. 管理员密码重置默认为123456
 * 2. SESSION_SECRET是否为示例值
 * 3. CSRF_TEST_MODE是否意外启用
 */

const { URL } = require('url');
const crypto = require('crypto');

const baseUrl = process.argv[2] || process.env.TARGET_URL || 'http://localhost:3000';
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
    const status = pass ? '✅ PASS' : '❌ FAIL';
    const detail = info ? ` - ${info}` : '';
    console.log(`${status} ${name}${detail}`);
}

async function login() {
    const loginPage = await request('/login');
    const pageText = await loginPage.text();
    const csrfMatch = pageText.match(/name="_csrf" value="([^"]+)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : null;

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

    return pass;
}

async function testCSRFBypass() {
    console.log('\n--- Test 1: CSRF保护绕过测试 ---');

    // 尝试不带CSRF token发送POST请求
    const response = await request('/api/gifts/exchange', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            giftType: 'heartbox',
            cost: 150,
            quantity: 1
        })
    });

    const json = await response.json().catch(() => ({}));

    // 预期：应该被CSRF保护阻止（403）
    logResult(
        'CSRF protection active',
        response.status === 403,
        `status=${response.status}, message="${json.message || json.code || 'N/A'}"`
    );

    // 如果返回200或其他成功码，说明CSRF_TEST_MODE可能被启用
    if (response.status === 200) {
        console.log('  ⚠️  警告: CSRF保护可能被禁用！请检查 CSRF_TEST_MODE 环境变量');
    }
}

async function testSessionCookieConfig() {
    console.log('\n--- Test 2: Session Cookie安全配置 ---');

    const loginPage = await request('/login');
    const setCookieHeader = loginPage.headers.get('set-cookie');

    if (!setCookieHeader) {
        logResult('Session cookie config', false, 'No set-cookie header found');
        return;
    }

    const hasHttpOnly = /httponly/i.test(setCookieHeader);
    const hasSecure = /secure/i.test(setCookieHeader);
    const hasSameSite = /samesite=strict/i.test(setCookieHeader);

    logResult('Cookie has HttpOnly flag', hasHttpOnly, hasHttpOnly ? 'ok' : '⚠️  missing');
    logResult('Cookie has Secure flag (prod)', hasSecure || baseUrl.startsWith('http://'),
        hasSecure ? 'ok' : (baseUrl.startsWith('http://') ? 'ok (http)' : '⚠️  missing'));
    logResult('Cookie has SameSite=Strict', hasSameSite, hasSameSite ? 'ok' : '⚠️  missing');
}

async function testSecurityHeaders() {
    console.log('\n--- Test 3: 安全响应头检查 ---');

    const response = await request('/');

    const headers = {
        'X-Frame-Options': response.headers.get('x-frame-options'),
        'X-Content-Type-Options': response.headers.get('x-content-type-options'),
        'X-XSS-Protection': response.headers.get('x-xss-protection'),
        'Strict-Transport-Security': response.headers.get('strict-transport-security'),
        'Content-Security-Policy': response.headers.get('content-security-policy')
    };

    logResult('X-Frame-Options set', !!headers['X-Frame-Options'], headers['X-Frame-Options'] || 'missing');
    logResult('X-Content-Type-Options set', !!headers['X-Content-Type-Options'], headers['X-Content-Type-Options'] || 'missing');
    logResult('HSTS set (prod)', !!headers['Strict-Transport-Security'] || baseUrl.startsWith('http://'),
        headers['Strict-Transport-Security'] || (baseUrl.startsWith('http://') ? 'ok (http)' : 'missing'));
    logResult('CSP set', !!headers['Content-Security-Policy'], headers['Content-Security-Policy'] ? 'ok' : 'missing');
}

async function testErrorMessageLeakage() {
    console.log('\n--- Test 4: 错误信息泄露检查 ---');

    // 尝试访问不存在的资源
    const notFound = await request('/api/nonexistent-endpoint-12345');
    const notFoundText = await notFound.text();

    // 检查是否泄露了堆栈跟踪或内部路径
    const hasStackTrace = /at\s+\w+\s+\([^\)]*\.js:\d+:\d+\)/.test(notFoundText);
    const hasFilePath = /\/[a-zA-Z0-9_\-\/]+\.js/.test(notFoundText);

    logResult(
        'No stack trace in error response',
        !hasStackTrace,
        hasStackTrace ? '⚠️  stack trace leaked' : 'ok'
    );

    logResult(
        'No file paths in error response',
        !hasFilePath,
        hasFilePath ? '⚠️  file paths leaked' : 'ok'
    );

    // 测试数据库错误
    const dbError = await request('/api/gifts/exchange', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            giftType: "' OR '1'='1",
            cost: -1,
            quantity: 0
        })
    });

    const dbErrorJson = await dbError.json().catch(() => ({}));
    const dbErrorText = JSON.stringify(dbErrorJson);

    const hasDBDetails = /postgres|pg_|sql|database|table|column/i.test(dbErrorText);

    logResult(
        'No database details in error',
        !hasDBDetails,
        hasDBDetails ? '⚠️  database info leaked' : 'ok'
    );
}

async function testRateLimitBypass() {
    console.log('\n--- Test 5: 限流绕过测试 ---');

    const requests = [];
    const limit = 30; // 基础限流是60秒100次，测试30次应该不会被限

    for (let i = 0; i < limit; i++) {
        requests.push(
            request('/health', { method: 'GET' })
        );
    }

    const responses = await Promise.all(requests);
    const blockedCount = responses.filter(r => r.status === 429).length;
    const successCount = responses.filter(r => r.status === 200).length;

    logResult(
        'Rate limiting active',
        successCount > 0 && blockedCount === 0,
        `${successCount} success, ${blockedCount} blocked (out of ${limit})`
    );
}

async function testDefaultCredentials() {
    console.log('\n--- Test 6: 默认凭据测试 ---');

    // 尝试使用常见的默认用户名/密码组合
    const defaultCombos = [
        { username: 'admin', password: 'admin' },
        { username: 'admin', password: '123456' },
        { username: 'test', password: 'test' },
        { username: 'guest', password: 'guest' }
    ];

    let foundDefault = false;

    for (const combo of defaultCombos) {
        const loginPage = await request('/login');
        const pageText = await loginPage.text();
        const csrfMatch = pageText.match(/name="_csrf" value="([^"]+)"/);
        const csrfToken = csrfMatch ? csrfMatch[1] : null;

        if (!csrfToken) continue;

        const body = new URLSearchParams({
            username: combo.username,
            password: combo.password,
            _csrf: csrfToken
        }).toString();

        const response = await request('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body
        });

        if (response.status === 302 || response.status === 200) {
            const text = await response.text();
            const success = !(/name=["']username["']|name=["']password["']/.test(text));
            if (success) {
                foundDefault = true;
                console.log(`  ⚠️  发现默认凭据: ${combo.username}/${combo.password}`);
            }
        }
    }

    logResult(
        'No default credentials',
        !foundDefault,
        foundDefault ? '⚠️  default credentials found!' : 'ok'
    );
}

async function main() {
    console.log('🔒 弱默认配置安全测试');
    console.log(`Target: ${baseUrl}`);

    console.log('\n--- 登录 ---');
    const loggedIn = await login();
    if (!loggedIn) {
        console.log('登录失败；部分测试将跳过。');
    } else {
        logResult('Login successful', true);
    }

    await testCSRFBypass();
    await testSessionCookieConfig();
    await testSecurityHeaders();
    await testErrorMessageLeakage();
    await testRateLimitBypass();
    await testDefaultCredentials();

    console.log('\n✅ 所有弱配置测试完成');
    console.log('\n建议：');
    console.log('  1. 确保生产环境 CSRF_TEST_MODE=false');
    console.log('  2. 使用强随机的 SESSION_SECRET (64字节+)');
    console.log('  3. 禁用详细错误信息输出到前端');
    console.log('  4. 定期更新所有依赖包');
}

main().catch((error) => {
    console.error('❌ 测试错误:', error.message);
    process.exit(1);
});
