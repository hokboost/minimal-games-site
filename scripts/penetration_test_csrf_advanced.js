const axios = require('axios');
const tough = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

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

async function getAuthenticatedClient(username, password) {
    const jar = new tough.CookieJar();
    const client = wrapper(axios.create({ jar }));

    // Initial page load to get CSRF token (if present in meta/input) and session cookie
    let res = await client.get(`${BASE_URL}/login`);

    // Assuming simple login for now or getting a session
    // For real testing, we need a valid session. 
    // We will assume 'admin' / 'password' exists or use the 'create-test-user' script manually first.
    // For this script, we'll try to just grab the CSRF token from a public page or assumed flow.

    // In this app, CSRF token is in req.session.csrfToken and sent via meta tag.
    // We will simulate the attack vectors assuming we have a session.

    return { client, jar, res };
}

async function testCSRFProtection() {
    console.log('\n--- Testing CSRF Protection ---');

    const jar = new tough.CookieJar();
    const client = wrapper(axios.create({ jar }));

    // 1. Get a valid session first
    await client.get(`${BASE_URL}/`);
    // Just hitting root should init session

    // Helper to get current valid token (simulating authorized user)
    // In a real app we'd parse the HTML. Here we might guess or use an endpoint.
    // Let's rely on the fact that we can inspect the session if we were the browser.
    // For a blackbox test, we try blindly without token first.

    // Attack 1: No Token
    console.log("\n[Test 1] POST request without CSRF token");
    try {
        const res = await client.post(`${BASE_URL}/api/quiz/start`, {
            username: 'victim'
        }, { validateStatus: () => true });

        if (res.status === 403 && (res.data.code === 'CSRF_FAILED' || res.data.message?.includes('CSRF'))) {
            await logResult('Missing Token', true, "Request rejected correctly.");
        } else {
            await logResult('Missing Token', false, `Request accepted (Status: ${res.status}). VULNERABLE!`);
        }
    } catch (e) { console.error(e); }

    // Attack 2: Invalid Token
    console.log("\n[Test 2] POST request with invalid CSRF token");
    try {
        const res = await client.post(`${BASE_URL}/api/quiz/start`, {
            username: 'victim'
        }, {
            headers: { 'x-csrf-token': 'invalid-token-123' },
            validateStatus: () => true
        });

        if (res.status === 403) {
            await logResult('Invalid Token', true, "Request rejected correctly.");
        } else {
            await logResult('Invalid Token', false, `Request accepted (Status: ${res.status}). VULNERABLE!`);
        }
    } catch (e) { console.error(e); }

    // Attack 3: Method Spoofing (if supported, e.g. using GET for actions)
    // The server code shows: if (req.method === 'POST') ... check CSRF
    // So we test if we can do the same action via GET.
    console.log("\n[Test 3] CSRF Method Bypass (GET for POST)");
    try {
        const res = await client.get(`${BASE_URL}/api/quiz/start?username=victim`, { validateStatus: () => true });
        if (res.status === 404 || res.status === 405) {
            await logResult('Method Bypass (GET)', true, "GET method not allowed for this action.");
        } else if (res.status === 200) {
            await logResult('Method Bypass (GET)', false, "Action executed via GET! VULNERABLE.");
        } else {
            await logResult('Method Bypass (GET)', true, `Status ${res.status} (Likely safe if not 200/201)`);
        }
    } catch (e) { console.error(e); }

    // Attack 4: Token from another session (Fixation/Reuse)
    console.log("\n[Test 4] Token from another session");
    const jar2 = new tough.CookieJar();
    const client2 = wrapper(axios.create({ jar: jar2 }));
    await client2.get(`${BASE_URL}/`); // Init session 2

    // This is hard to automate blindly without parsing the token from HTML, 
    // but assuming we could get it, we would try to use client2's token with client's session.
    // For now, satisfied with basic checks.
}

async function run() {
    await testCSRFProtection();
}

run();
