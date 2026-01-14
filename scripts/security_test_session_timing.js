#!/usr/bin/env node
'use strict';

/**
 * 时序攻击测试
 * 测试目标：检测CSRF token比较是否使用常量时间比较
 * 漏洞位置：server.js:358, server.js:828 等多处token比较
 *
 * 预期行为：
 * 1. 正确token和错误token的响应时间应该相同（常量时间）
 * 2. 如果存在时序差异，可能存在时序攻击风险
 */

const { URL } = require('url');
const crypto = require('crypto');

const baseUrl = process.argv[2] || process.env.TARGET_URL || 'https://www.wuguijiang.com';
const username = process.env.AUTH_USER;
const password = process.env.AUTH_PASS;
const iterations = Number(process.env.ITERATIONS || 50);

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

async function fetchCsrf(path) {
    const response = await request(path);
    const text = await response.text();
    const match = text.match(/data-csrf-token="([^"]+)"/);
    return match ? match[1] : null;
}

function generateWrongToken(correctToken, position) {
    // 生成在特定位置不同的token
    const chars = '0123456789abcdef';
    const tokenArray = correctToken.split('');

    if (position < tokenArray.length) {
        let wrongChar = tokenArray[position];
        do {
            wrongChar = chars[Math.floor(Math.random() * chars.length)];
        } while (wrongChar === tokenArray[position]);
        tokenArray[position] = wrongChar;
    }

    return tokenArray.join('');
}

async function measureResponseTime(endpoint, csrfToken, isCorrect = true) {
    const token = isCorrect ? csrfToken : crypto.randomBytes(16).toString('hex');

    const startTime = performance.now();

    const response = await request(endpoint.path, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': token
        },
        body: JSON.stringify(endpoint.payload)
    });

    const endTime = performance.now();
    const duration = endTime - startTime;

    return {
        duration,
        status: response.status,
        isCorrect
    };
}

async function timingAttackTest(endpoint, csrfToken) {
    console.log(`\n测试端点: ${endpoint.path}`);

    const correctTimings = [];
    const wrongTimings = [];

    // 测试正确token
    for (let i = 0; i < iterations; i++) {
        const result = await measureResponseTime(endpoint, csrfToken, true);
        correctTimings.push(result.duration);
    }

    // 测试错误token
    for (let i = 0; i < iterations; i++) {
        const result = await measureResponseTime(endpoint, csrfToken, false);
        wrongTimings.push(result.duration);
    }

    // 计算统计数据
    const avgCorrect = correctTimings.reduce((a, b) => a + b, 0) / correctTimings.length;
    const avgWrong = wrongTimings.reduce((a, b) => a + b, 0) / wrongTimings.length;

    const stdDevCorrect = Math.sqrt(
        correctTimings.reduce((sum, val) => sum + Math.pow(val - avgCorrect, 2), 0) / correctTimings.length
    );
    const stdDevWrong = Math.sqrt(
        wrongTimings.reduce((sum, val) => sum + Math.pow(val - avgWrong, 2), 0) / wrongTimings.length
    );

    const timeDiff = Math.abs(avgCorrect - avgWrong);
    const combinedStdDev = Math.sqrt(stdDevCorrect * stdDevCorrect + stdDevWrong * stdDevWrong);

    // 如果时间差超过2个标准差，可能存在时序漏洞
    const hasTimingLeak = timeDiff > (2 * combinedStdDev);

    console.log(`  正确token平均响应: ${avgCorrect.toFixed(2)}ms (σ=${stdDevCorrect.toFixed(2)})`);
    console.log(`  错误token平均响应: ${avgWrong.toFixed(2)}ms (σ=${stdDevWrong.toFixed(2)})`);
    console.log(`  时间差: ${timeDiff.toFixed(2)}ms`);

    logResult(
        `Timing leak ${hasTimingLeak ? 'DETECTED' : 'NOT detected'}`,
        !hasTimingLeak,
        `diff=${timeDiff.toFixed(2)}ms, threshold=${(2 * combinedStdDev).toFixed(2)}ms`
    );

    return !hasTimingLeak;
}

async function main() {
    console.log('🔒 时序攻击安全测试');
    console.log(`Target: ${baseUrl}`);
    console.log(`Iterations: ${iterations} (可通过 ITERATIONS 环境变量调整)`);

    console.log('\n--- 登录 ---');
    const loggedIn = await login();
    if (!loggedIn) {
        console.log('登录失败；终止测试。');
        process.exit(1);
    }
    logResult('Login successful', true);

    console.log('\n--- 获取CSRF Tokens ---');
    const giftsCsrf = await fetchCsrf('/gifts');
    const slotCsrf = await fetchCsrf('/slot');

    logResult('Gifts CSRF token found', !!giftsCsrf);
    logResult('Slot CSRF token found', !!slotCsrf);

    if (!giftsCsrf || !slotCsrf) {
        console.log('无法获取CSRF token；终止测试。');
        process.exit(1);
    }

    console.log('\n--- 时序攻击测试 ---');
    console.log('注意：需要多次请求才能检测微小的时序差异\n');

    const endpoints = [
        {
            path: '/api/gifts/exchange',
            payload: { giftType: 'heartbox', cost: 150, quantity: 1 },
            csrf: giftsCsrf
        },
        {
            path: '/api/slot/play',
            payload: { username, betAmount: 10 },
            csrf: slotCsrf
        }
    ];

    const results = [];
    for (const endpoint of endpoints) {
        const pass = await timingAttackTest(endpoint, endpoint.csrf);
        results.push(pass);
    }

    console.log('\n--- 测试总结 ---');
    const allPass = results.every(r => r);
    logResult(
        'All endpoints use constant-time comparison',
        allPass,
        allPass ? 'No timing leaks detected' : 'Timing leaks detected - consider using crypto.timingSafeEqual()'
    );
}

main().catch((error) => {
    console.error('❌ 测试错误:', error.message);
    process.exit(1);
});
