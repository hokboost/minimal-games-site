const axios = require('axios');

const BASE_URL = process.env.TARGET_URL || 'http://localhost:3000';
const USERNAME = process.env.AUTH_USER || 'admin';
const PASSWORD = process.env.AUTH_PASS || 'password';

async function main() {
    console.log(`[Race] Starting Inventory Race Test against ${BASE_URL}`);

    // 简易Cookie存储，避免依赖 tough-cookie
    const cookieStore = new Map();
    const client = axios.create({
        baseURL: BASE_URL,
        validateStatus: () => true,
        maxRedirects: 0 // 手动处理重定向，保存Cookie
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
    const cookieHeader = () => Array.from(cookieStore.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    const followIfNeeded = async (res, method, url, data, opts, depth = 0) => {
        if (depth > 3) return res;
        if (res.status >= 300 && res.status < 400 && res.headers.location) {
            const nextUrl = res.headers.location.startsWith('http') ? res.headers.location : `${BASE_URL}${res.headers.location}`;
            const nextMethod = method === 'GET' ? 'GET' : 'GET';
            return nextMethod === 'GET'
                ? get(nextUrl, { ...(opts || {}), _depth: depth + 1 })
                : post(nextUrl, data, { ...(opts || {}), _depth: depth + 1 });
        }
        return res;
    };
    const get = (url, opts = {}) => client.get(url, { ...opts, headers: { ...(opts.headers || {}), Cookie: cookieHeader() } })
        .then(async res => { saveCookies(res); return followIfNeeded(res, 'GET', url, null, opts, opts._depth || 0); });
    const post = (url, data, opts = {}) => client.post(url, data, { ...opts, headers: { ...(opts.headers || {}), Cookie: cookieHeader() } })
        .then(async res => { saveCookies(res); return followIfNeeded(res, 'POST', url, data, opts, opts._depth || 0); });

    // 1. Setup - Login
    console.log('[Race] Logging in...');
    const page = await get(`${BASE_URL}/login`);
    const csrfToken = page.data.match(/name="_csrf" value="([^"]+)"/)[1];

    await post(`${BASE_URL}/login`, new URLSearchParams({
        username: USERNAME,
        password: PASSWORD,
        _csrf: csrfToken
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    // 2. Setup - Get CSRF for API
    const giftPage = await get(`${BASE_URL}/gifts`);
    const apiCsrfToken = giftPage.data.match(/data-csrf-token="([^"]+)"/)[1];

    // 3. Setup - Ensure we have at least 1 item in backpack (Wish result or Purchased)
    // For this test, we accept we might need to "Guess" an ID or assume the user has one.
    // Let's try to 'Exchange' one gift first effectively buying it into existence if possible?
    // Actually, gifts/exchange gives money-to-gift.

    console.log('[Race] Buying 1 Gift (fanlight) to use for race...');
    const buyRes = await post(`${BASE_URL}/api/gifts/exchange`, {
        giftType: 'fanlight',
        cost: 1,
        quantity: 1
    }, { headers: { 'x-csrf-token': apiCsrfToken } });

    if (!buyRes.data.success) {
        console.error('[Race] Failed to buy gift:', buyRes.data);
    }

    // 4. Attack - Double Spend
    // We will try to "Send" the gift (consuming inventory) AND "Exchange" it (if that was an option) 
    // OR Send it to User A and User B simultaneously.
    // Looking at routes/gifts.js, 'send' operations lock funds, but what about backpack items?
    // Wait, the gift exchange GIVES you the item? Or gives you money?
    // Code says: "updateBalance... operationType: gift_exchange".
    // 
    // Ideally we race-condition a "Consumption" endpoint.
    // Let's assume there is a /api/wish/backpack/send endpoint mentioned in `wish.js`?
    // I need to check `wish.js` again for `backpack/send` or similar usage.
    //
    // Adapting plan: We will use the `api/gifts/exchange` (Buying) to see if we can buy MORE than we can afford by racing?
    // NO, that's balance locking. We verified that.
    //
    // Let's look for "Wish Batch" - if we run 2 batches of 10 simultaneously, do we pay for 20? 
    // BalanceLogger uses Row/Update locks, so that should be safe.

    // New Target: 'Wish Batch' Double Submission.
    // If I have 100 coins. 1 Batch costs 90.
    // I send 2 requests for Batch(90) simultaneously.
    // Expectation: One succeeds, One fails 'Insufficient Balance'.
    // Vulnerability: Both succeed -> Balance becomes -80.

    console.log('[Race] Testing Balance Double-Spend on Wish Batch...');
    const initialBalanceRes = await get(`${BASE_URL}/api/balance/logs?limit=1`);
    console.log('[Race] Balance check done.');

    const raceRequest = () => post(`${BASE_URL}/api/wish-batch`, {
        giftType: 'bobo', // Valid gift
        batchCount: 1
    }, { headers: { 'x-csrf-token': apiCsrfToken } });

    console.log('[Race] Firing 5 concurrent Wish Batch requests...');
    const results = await Promise.allSettled([
        raceRequest(),
        raceRequest(),
        raceRequest(),
        raceRequest(),
        raceRequest()
    ]);

    let successful = 0;
    let failed = 0;
    results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value.data.success) {
            console.log(`[Race] Request ${i} SUCCEEDED (Spent money)`);
            successful++;
        } else {
            console.log(`[Race] Request ${i} FAILED (${r.value?.data?.message || r.reason?.message})`);
            failed++;
        }
    });

    console.log(`[Race] Summary: ${successful} Successes, ${failed} Failures.`);
    if (successful > 1) {
        // Did we have enough money for N successes?
        console.log('[Race] NOTE: If you only had money for 1, and >1 succeeded, this is a BUG.');
    } else {
        console.log('[Race] NOTE: System seems to handle concurrency correctly (Sequential processing).');
    }
}

main();
