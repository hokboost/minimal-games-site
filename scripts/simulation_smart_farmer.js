const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = process.env.TARGET_URL || 'http://localhost:3000';
const USERNAME = process.env.AUTH_USER || 'admin';
const PASSWORD = process.env.AUTH_PASS || 'password';

// Anti-Anti-Bot Configuration
// The server blocks if:
// 1. minInterval < 50ms (+30 score)
// 2. avgInterval < 500ms (+15 score)
// 3. consistency < 0.05 (+20 score)
// 4. totalRequests > 5000/hr (+25 score)
// Threshold is 90.
//
// Strategy:
// - Maintain Min Interval > 60ms (Safe)
// - Maintain Avg Interval > 550ms (Safe)
// - Add high variance (random delays) to keep consistency > 0.05
// - Monitor 429 warnings and back off dynamicallly.

const MIN_DELAY = 100;
const MAX_DELAY = 1500;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay() {
    // Geo-distributed random delay to mimic human/network variance
    const delay = Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1) + MIN_DELAY);
    return delay;
}

async function main() {
    console.log(`[Bot] Starting Smart Farmer against ${BASE_URL}`);
    console.log(`[Bot] Target: ${USERNAME}`);

    // 简易Cookie存储，避免依赖 tough-cookie
    const cookieStore = new Map();
    const client = axios.create({
        baseURL: BASE_URL,
        validateStatus: () => true,
        maxRedirects: 0 // 手动处理重定向以保存 cookie
    });
    const saveCookies = (res) => {
        const setCookie = res.headers['set-cookie'];
        if (!setCookie) return;
        const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
        arr.forEach((c) => {
            const [pair] = c.split(';');
            const [k, v] = pair.split('=');
            if (k && v !== undefined) cookieStore.set(k.trim(), v.trim());
        });
    };
    const cookieHeader = () => {
        return Array.from(cookieStore.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    };
    const followIfNeeded = async (res, method, url, data, opts, depth = 0) => {
        if (depth > 3) return res;
        if (res.status >= 300 && res.status < 400 && res.headers.location) {
            const nextUrl = res.headers.location.startsWith('http') ? res.headers.location : `${BASE_URL}${res.headers.location}`;
            const nextMethod = method === 'GET' ? 'GET' : 'GET'; // 登录后重定向通常GET
            return nextMethod === 'GET'
                ? get(nextUrl, { ...(opts || {}), _depth: depth + 1 })
                : post(nextUrl, data, { ...(opts || {}), _depth: depth + 1 });
        }
        return res;
    };
    const get = (url, opts = {}) => client.get(url, {
        ...opts,
        headers: { ...(opts.headers || {}), Cookie: cookieHeader() }
    }).then(async res => { saveCookies(res); return followIfNeeded(res, 'GET', url, null, opts, opts._depth || 0); });
    const post = (url, data, opts = {}) => client.post(url, data, {
        ...opts,
        headers: { ...(opts.headers || {}), Cookie: cookieHeader() }
    }).then(async res => { saveCookies(res); return followIfNeeded(res, 'POST', url, data, opts, opts._depth || 0); });

    // 1. Valid Login
    console.log('[Bot] Logging in...');
    try {
        // Get CSRF
        const page = await get(`${BASE_URL}/login`);
        const csrfMatch = page.data.match(/name="_csrf" value="([^"]+)"/);
        const csrfToken = csrfMatch ? csrfMatch[1] : '';

        await post(`${BASE_URL}/login`, new URLSearchParams({
            username: USERNAME,
            password: PASSWORD,
            _csrf: csrfToken
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        console.log('[Bot] Login successful.');
    } catch (e) {
        console.error('[Bot] Login failed:', e.message);
        process.exit(1);
    }

    // 2. Farming Loop (Quiz)
    let totalHarvest = 0;
    let rounds = 0;
    let consecutiveErrors = 0;

    console.log('[Bot] Starting Farming Loop. Press Ctrl+C to stop.');

    // Get Session CSRF for API
    const quizPage = await get(`${BASE_URL}/quiz`);
    const apiCsrfMatch = quizPage.data.match(/data-csrf-token="([^"]+)"/);
    const apiCsrf = apiCsrfMatch ? apiCsrfMatch[1] : '';

    while (rounds < 500) { // Limit to avoid infinite run in tests
        rounds++;
        const start = Date.now();

        try {
            // A. Start Game (Cost 10)
            const startRes = await post(`${BASE_URL}/api/quiz/start`,
                { username: USERNAME },
                { headers: { 'x-csrf-token': apiCsrf } }
            );

            if (startRes.data.success) {
                // B. Answer Questions Loop
                // Don't answer all 15, just do a few to look "real" and fast
                const questionsToAnswer = Math.floor(Math.random() * 5) + 3;

                // Fetch Next
                for (let i = 0; i < questionsToAnswer; i++) {
                    await sleep(randomDelay());
                    // Simulate "reading" time

                    const nextRes = await post(`${BASE_URL}/api/quiz/next`,
                        { username: USERNAME, seen: [] },
                        { headers: { 'x-csrf-token': apiCsrf } }
                    );

                    if (!nextRes.data.success) break;

                    // Fake Submit (we don't actually answer logic here to keep script simple, 
                    // focusing on REQUEST PATTERN evasion. 
                    // If we wanted to actually farm money, we'd need to solve the quiz.)
                    // logic: The server checks answers on /submit.
                    // We will just invoke /next multiple times to simulate activity.
                }

                totalHarvest += 1; // Count "games played"
                process.stdout.write(`\r[Bot] Games: ${totalHarvest} | Status: Healthy 🟢`);
                consecutiveErrors = 0;
            } else {
                process.stdout.write(`\r[Bot] Game Start Failed: ${startRes.data.message} 🔴`);
                consecutiveErrors++;
            }

        } catch (e) {
            const status = e.response ? e.response.status : 'ERR';
            process.stdout.write(`\r[Bot] Error ${status}: ${e.message} 🔴`);

            if (status === 403 || status === 429) {
                console.log('\n[Bot] 🚨 DETECTED! WAF blocked request.');
                console.log(`[Bot] Reason: ${JSON.stringify(e.response.data)}`);
                console.log('[Bot] Backing off for 10 seconds...');
                await sleep(10000);
            }
            consecutiveErrors++;
        }

        if (consecutiveErrors > 5) {
            console.log('\n[Bot] Too many errors. Aborting.');
            break;
        }

        // Crucial Evasion Sleep
        await sleep(randomDelay());
    }

    console.log(`\n[Bot] Finished. Total Games Initiated: ${totalHarvest}`);
}

main();
