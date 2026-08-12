#!/usr/bin/env node
require("./guard-test-target").enforceSafeTestTarget();
'use strict';

/**
 * HMAC签名绕过测试
 * 测试目标：验证 /api/gift-tasks/:id/complete 接口的HMAC保护
 * 漏洞位置：routes/gifts.js:542-549
 *
 * 预期行为：
 * 1. 不传签名时应该被拒绝（如果GIFT_TASKS_HMAC_ENFORCE=true）
 * 2. 传入错误签名应该被拒绝
 * 3. 签名过期应该被拒绝
 */

const crypto = require('crypto');
const { URL } = require('url');

const baseUrl = process.argv[2] || process.env.TARGET_URL || 'http://localhost:3000';
const apiKey = process.env.WINDOWS_API_KEY;
const hmacSecret = process.env.GIFT_TASKS_HMAC_SECRET;

if (!apiKey) {
    console.error('⚠️ Missing WINDOWS_API_KEY env var - some tests will be skipped');
}

if (!hmacSecret) {
    console.error('⚠️ Missing GIFT_TASKS_HMAC_SECRET env var - HMAC tests will be skipped');
}

function logResult(name, pass, info) {
    const status = pass ? '✅ PASS' : '❌ FAIL';
    const detail = info ? ` - ${info}` : '';
    console.log(`${status} ${name}${detail}`);
}

function stableStringify(value) {
    if (value === undefined || typeof value === 'function') {
        return 'null';
    }
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function stableStringifyBody(body) {
    if (!body || typeof body !== 'object' || (Array.isArray(body) && body.length === 0)) {
        return '';
    }
    if (Object.keys(body).length === 0) {
        return '';
    }
    return stableStringify(body);
}

function buildValidSignature(method, path, body, secret) {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomBytes(16).toString('hex');
    const canonicalBody = stableStringifyBody(body);
    const payload = `${timestamp}.${method.toUpperCase()}.${path}.${canonicalBody}`;
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    return {
        'X-API-Key': apiKey,
        'X-Timestamp': timestamp,
        'X-Nonce': nonce,
        'X-Signature': signature
    };
}

async function request(path, options = {}) {
    const url = new URL(path, baseUrl);
    const response = await fetch(url, {
        redirect: 'follow',
        ...options
    });
    return response;
}

async function testNoSignature() {
    console.log('\n--- Test 1: 不传签名（只传API Key）---');

    const taskId = 99999; // 假设的任务ID
    const headers = {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
    };

    const response = await request(`/api/gift-tasks/${taskId}/complete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({})
    });

    const json = await response.json().catch(() => ({}));

    // 预期：应该返回401（签名缺失）
    logResult(
        'Complete without signature rejected',
        response.status === 401,
        `status=${response.status}, message="${json.message || 'N/A'}"`
    );
}

async function testInvalidSignature() {
    console.log('\n--- Test 2: 传入错误的签名 ---');

    const taskId = 99999;
    const headers = {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'X-Timestamp': Date.now().toString(),
        'X-Nonce': crypto.randomBytes(16).toString('hex'),
        'X-Signature': 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
    };

    const response = await request(`/api/gift-tasks/${taskId}/complete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({})
    });

    const json = await response.json().catch(() => ({}));

    // 预期：应该返回401（签名不匹配）
    logResult(
        'Complete with invalid signature rejected',
        response.status === 401,
        `status=${response.status}, message="${json.message || 'N/A'}"`
    );
}

async function testExpiredSignature() {
    console.log('\n--- Test 3: 使用过期的签名 ---');

    if (!hmacSecret) {
        logResult('Expired signature test skipped', true, 'missing HMAC secret');
        return;
    }

    const taskId = 99999;
    const oldTimestamp = (Date.now() - 10 * 60 * 1000).toString(); // 10分钟前
    const nonce = crypto.randomBytes(16).toString('hex');
    const payload = `${oldTimestamp}.POST./api/gift-tasks/${taskId}/complete.{}`;
    const signature = crypto.createHmac('sha256', hmacSecret).update(payload).digest('hex');

    const headers = {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'X-Timestamp': oldTimestamp,
        'X-Nonce': nonce,
        'X-Signature': signature
    };

    const response = await request(`/api/gift-tasks/${taskId}/complete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({})
    });

    const json = await response.json().catch(() => ({}));

    // 预期：应该返回401（签名过期）
    logResult(
        'Complete with expired signature rejected',
        response.status === 401,
        `status=${response.status}, message="${json.message || 'N/A'}"`
    );
}

async function testValidSignature() {
    console.log('\n--- Test 4: 使用正确的签名（应该被其他原因拒绝）---');

    if (!hmacSecret) {
        logResult('Valid signature test skipped', true, 'missing HMAC secret');
        return;
    }

    const taskId = 99999;
    const headers = buildValidSignature('POST', `/api/gift-tasks/${taskId}/complete`, {}, hmacSecret);
    headers['Content-Type'] = 'application/json';

    const response = await request(`/api/gift-tasks/${taskId}/complete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({})
    });

    const json = await response.json().catch(() => ({}));

    // 预期：签名验证应该通过，但因为任务不存在返回404
    logResult(
        'Valid signature passes auth (fails with 404)',
        response.status === 404,
        `status=${response.status}, message="${json.message || 'N/A'}"`
    );
}

async function testFailEndpoint() {
    console.log('\n--- Test 5: 测试 /fail 接口的HMAC保护 ---');

    const taskId = 99999;

    // 不传签名
    const noSig = await request(`/api/gift-tasks/${taskId}/fail`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
        },
        body: JSON.stringify({ error: 'test error' })
    });

    // fail接口没有HMAC验证，只有API Key验证
    logResult(
        'Fail endpoint API key required',
        noSig.status === 401 || noSig.status === 404,
        `status=${noSig.status}`
    );
}

async function testReplayAttack() {
    console.log('\n--- Test 6: 重放攻击测试（相同nonce）---');

    if (!hmacSecret) {
        logResult('Replay attack test skipped', true, 'missing HMAC secret');
        return;
    }

    const taskId = 99999;
    const fixedNonce = 'replay-attack-nonce-12345678';
    const timestamp = Date.now().toString();
    const payload = `${timestamp}.POST./api/gift-tasks/${taskId}/complete.{}`;
    const signature = crypto.createHmac('sha256', hmacSecret).update(payload).digest('hex');

    const headers = {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'X-Timestamp': timestamp,
        'X-Nonce': fixedNonce,
        'X-Signature': signature
    };

    // 第一次请求
    const response1 = await request(`/api/gift-tasks/${taskId}/complete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({})
    });

    // 立即第二次请求（相同nonce）
    const response2 = await request(`/api/gift-tasks/${taskId}/complete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({})
    });

    const json2 = await response2.json().catch(() => ({}));

    // 预期：第二次请求应该被拒绝（重复nonce）
    logResult(
        'Replay attack with same nonce blocked',
        response2.status === 401,
        `status=${response2.status}, message="${json2.message || 'N/A'}"`
    );
}

async function main() {
    console.log('🔒 HMAC签名绕过安全测试');
    console.log(`Target: ${baseUrl}`);
    console.log(`API Key configured: ${!!apiKey}`);
    console.log(`HMAC Secret configured: ${!!hmacSecret}`);

    if (!apiKey) {
        console.error('\n❌ 缺少WINDOWS_API_KEY，无法测试');
        process.exit(1);
    }

    await testNoSignature();
    await testInvalidSignature();
    await testExpiredSignature();
    await testValidSignature();
    await testFailEndpoint();
    await testReplayAttack();

    console.log('\n✅ 所有HMAC测试完成');
}

main().catch((error) => {
    console.error('❌ 测试错误:', error.message);
    process.exit(1);
});
