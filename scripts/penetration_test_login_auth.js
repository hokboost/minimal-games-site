const axios = require('axios');
const tough = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

const jar = new tough.CookieJar();
const client = wrapper(axios.create({ jar }));

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const RED_COLOR = '\x1b[31m';
const GREEN_COLOR = '\x1b[32m';
const RESET_COLOR = '\x1b[0m';

async function logResult(testName, success, message) {
    if (success) {
        console.log(`${GREEN_COLOR}[PASS] ${testName}: ${message}${RESET_COLOR}`);
    } else {
        console.log(`${RED_COLOR}[FAIL] ${testName}: ${message}${RESET_COLOR}`);
    }
}

async function testSQLInjectionLogin() {
    console.log('\n--- Testing Login SQL Injection ---');
    const payloads = [
        "' OR '1'='1",
        "admin' --",
        "admin' #",
        "' OR 1=1 --",
        "admin'/*"
    ];

    for (const payload of payloads) {
        try {
            const res = await client.post(`${BASE_URL}/login`, {
                username: payload,
                password: 'password123',
                _csrf: 'ignore_for_now_if_middleware_allows_or_fetch_first'
                // Note: Real attack requires CSRF token first, but we check if it blindly bypasses auth
            }, { validateStatus: () => true });

            if (res.status === 200 && res.data.includes('Redirecting to /')) {
                await logResult(`SQLi Payload: ${payload}`, false, "Logged in successfully (VULNERABLE!)");
            } else {
                await logResult(`SQLi Payload: ${payload}`, true, `Blocked/Failed with status ${res.status}`);
            }
        } catch (e) {
            console.error(e.message);
        }
    }
}

async function testBruteForceRateLimit() {
    console.log('\n--- Testing Login Rate Limiting ---');
    const username = 'admin'; // Target user
    const maxAttempts = 220; // Config is ~200
    let blocked = false;

    console.log(`Simulating ${maxAttempts} login attempts...`);

    // Create a new client for a clean session
    const bfJar = new tough.CookieJar();
    const bfClient = wrapper(axios.create({ jar: bfJar }));

    for (let i = 0; i < maxAttempts; i++) {
        const res = await bfClient.post(`${BASE_URL}/login`, {
            username,
            password: `wrongpass${i}`
        }, { validateStatus: () => true });

        if (res.status === 429) {
            await logResult('Rate Limit Check', true, `Blocked after ${i + 1} attempts`);
            blocked = true;
            break;
        }
    }

    if (!blocked) {
        await logResult('Rate Limit Check', false, "Failed to trigger rate limit (VULNERABLE if limit < 200)");
    }
}

async function testBruteForceBypassWithHeaders() {
    console.log('\n--- Testing Rate Limit Bypass via Headers ---');
    // Try to spoof IP
    const spoofHeaders = {
        'X-Forwarded-For': '10.0.0.1',
        'X-Real-IP': '10.0.0.1'
    };

    const res = await client.post(`${BASE_URL}/login`, {
        username: 'admin',
        password: 'wrongpass_spoof'
    }, {
        headers: spoofHeaders,
        validateStatus: () => true
    });

    if (res.status === 429) {
        await logResult('IP Spoofing Bypass', true, "Still blocked (Secure)");
    } else {
        // This essentially just checks if we can make a request, hard to verify bypass without hitting limit first
        // But we can check if the server reflects the IP in logs (manual verification usually)
        console.log("Request with spoofed IP accepted. Verify logs to see if it logged 10.0.0.1 or real IP.");
    }
}

async function run() {
    console.log(`Target: ${BASE_URL}`);
    await testSQLInjectionLogin();
    await testBruteForceRateLimit();
    await testSQLInjectionLogin(); // Run again to see if IP is now blocked globally
}

run();
