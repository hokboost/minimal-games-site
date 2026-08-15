'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const {
    DisposableDatabase,
    delay,
    reservePort,
    startApp,
    waitForExit
} = require('../tests/helpers/integration-environment');

const FAULT_TOKEN = 'browser-fault-token-0123456789abcdef';

const GAME_PAGES = [
    { path: '/quiz', control: '#start-quiz-btn' },
    { path: '/slot', control: '#spinBtn' },
    { path: '/scratch', control: '.tier-btn' },
    { path: '/spin', control: '#spinButton' },
    { path: '/blindbox', control: '#openBtn' },
    { path: '/stone', control: '#addOneBtn' },
    { path: '/flip', control: '#startBtn' },
    { path: '/duel', control: '#duelBtn' },
    { path: '/dictation', control: '#start-btn' },
    { path: '/wish', control: '.gift-action-btn[data-gift="bobo"][data-count="1"]' },
    { path: '/doudizhu', control: '#startDoudizhuBtn' }
];

async function eventually(check, timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
        try {
            return await check();
        } catch (error) {
            lastError = error;
            await delay(75);
        }
    }
    throw lastError || new Error('Condition did not become true');
}

function assertScreenshotIsNotBlank(buffer, label) {
    const image = PNG.sync.read(buffer);
    let min = 255;
    let max = 0;
    let opaque = 0;
    const step = Math.max(4, Math.floor(image.data.length / 250000 / 4) * 4);
    for (let offset = 0; offset < image.data.length; offset += step) {
        if (image.data[offset + 3] === 0) continue;
        opaque += 1;
        const luminance = Math.round(
            image.data[offset] * 0.2126
            + image.data[offset + 1] * 0.7152
            + image.data[offset + 2] * 0.0722
        );
        min = Math.min(min, luminance);
        max = Math.max(max, luminance);
    }
    assert.ok(opaque > 100, `${label} screenshot contains too few visible pixels`);
    assert.ok(max - min >= 24, `${label} screenshot appears blank`);
}

async function login(page, baseUrl, user) {
    const response = await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    assert.equal(response.status(), 200);
    await page.locator('input[name="username"]').fill(user.username);
    await page.locator('input[name="password"]').fill(user.password);
    await Promise.all([
        page.waitForURL(`${baseUrl}/`),
        page.locator('button[type="submit"]').click()
    ]);
}

function attachFailureCollection(page, failures) {
    page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
    page.on('response', (response) => {
        if (response.status() >= 500) {
            failures.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`);
        }
    });
}

async function verifyGamePage(page, baseUrl, game, profileName) {
    const response = await page.goto(`${baseUrl}${game.path}`, { waitUntil: 'domcontentloaded' });
    assert.equal(response.status(), 200, `${profileName} ${game.path} did not load`);
    await page.locator(game.control).first().waitFor({ state: 'visible' });
    await page.waitForTimeout(250);
    const layout = await page.evaluate((selector) => {
        const root = document.documentElement;
        const body = document.body;
        const control = document.querySelector(selector);
        const rect = control?.getBoundingClientRect();
        return {
            horizontalOverflow: Math.max(root.scrollWidth, body.scrollWidth) - window.innerWidth,
            bodyHeight: body.getBoundingClientRect().height,
            controlWidth: rect?.width || 0,
            controlHeight: rect?.height || 0,
            controlClippedX: control ? control.scrollWidth - control.clientWidth : 0,
            controlClippedY: control ? control.scrollHeight - control.clientHeight : 0
        };
    }, game.control);
    assert.ok(layout.horizontalOverflow <= 2, `${profileName} ${game.path} overflows horizontally by ${layout.horizontalOverflow}px`);
    assert.ok(layout.bodyHeight > 100, `${profileName} ${game.path} body is collapsed`);
    assert.ok(layout.controlWidth >= 20 && layout.controlHeight >= 20, `${profileName} ${game.path} primary control is collapsed`);
    assert.ok(layout.controlClippedX <= 3 && layout.controlClippedY <= 3, `${profileName} ${game.path} primary control text is clipped`);
    assertScreenshotIsNotBlank(await page.screenshot(), `${profileName} ${game.path}`);
}

async function waitForApiAction(page, pathname, trigger) {
    const responsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === pathname && response.request().method() === 'POST';
    }, { timeout: 15000 });
    await trigger();
    const response = await responsePromise;
    const body = await response.json();
    assert.ok(response.status() < 500, `${pathname} returned ${response.status()}`);
    assert.equal(body.success, true, `${pathname} failed: ${body.message || response.status()}`);
    return { body, response };
}

async function countRows(pool, table, username) {
    if (!/^[a-z_]+$/.test(table)) throw new Error('Unsafe table name');
    const result = await pool.query(
        `SELECT COUNT(*)::integer AS count FROM ${table} WHERE username = $1`,
        [username]
    );
    return Number(result.rows[0].count);
}

async function testSlotRecovery(page, context, database, user, app) {
    await page.goto(`${page.baseUrl}/slot`, { waitUntil: 'domcontentloaded' });
    const countBeforeLoss = await countRows(database.pool, 'slot_results', user.username);
    let intercepted = false;
    await page.route('**/api/slot/play', async (route) => {
        if (intercepted) return route.continue();
        intercepted = true;
        return route.continue({
            headers: {
                ...route.request().headers(),
                'x-test-fault-token': FAULT_TOKEN,
                'x-test-fault-point': 'slot.after_commit',
                'x-test-fault-action': 'exit'
            }
        });
    });
    await page.locator('#bet-amount').fill('17');
    await page.locator('#spinBtn').click();
    await eventually(async () => {
        assert.equal(await countRows(database.pool, 'slot_results', user.username), countBeforeLoss + 1);
    });
    assert.equal((await waitForExit(app.child)).code, 86);
    assert.equal(intercepted, true);
    await page.waitForFunction(() => !document.getElementById('spinBtn').disabled);
    const pendingBeforeReload = await page.evaluate(() => JSON.parse(
        sessionStorage.getItem('minimal-games-pending-idempotency-v1') || '[]'
    ));
    assert.equal(pendingBeforeReload.length, 1, 'Lost response did not retain its idempotency key');
    await delay(500);
    assert.equal(await countRows(database.pool, 'slot_results', user.username), countBeforeLoss + 1);
    await page.unroute('**/api/slot/play');
    const replacement = await startApp({
        databaseName: database.name,
        port: Number(new URL(app.baseUrl).port),
        label: 'browser-e2e-restarted',
        faultToken: FAULT_TOKEN,
        poolMax: 8
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#bet-amount').fill('17');
    const replay = await waitForApiAction(page, '/api/slot/play', () => page.locator('#spinBtn').click());
    assert.equal(replay.response.headers()['idempotency-status'], 'replayed');
    const countAfterReplay = await countRows(database.pool, 'slot_results', user.username);
    if (countAfterReplay !== countBeforeLoss + 1) {
        const records = await database.pool.query(`
            SELECT idempotency_key, status
            FROM idempotency_keys
            WHERE username = $1 AND request_path = '/api/slot/play'
            ORDER BY created_at
        `, [user.username]);
        throw new Error(`Lost-response replay duplicated a result: ${JSON.stringify(records.rows)}`);
    }

    await page.waitForFunction(() => !document.getElementById('spinBtn').disabled, null, { timeout: 10000 });
    await page.locator('#bet-amount').fill('18');
    const countBeforeDoubleClick = await countRows(database.pool, 'slot_results', user.username);
    await waitForApiAction(page, '/api/slot/play', () => page.locator('#spinBtn').evaluate((button) => {
        button.click();
        button.click();
    }));
    await eventually(async () => {
        assert.equal(await countRows(database.pool, 'slot_results', user.username), countBeforeDoubleClick + 1);
    });

    await page.locator('#spinBtn').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.getElementById('spinBtn').disabled, null, { timeout: 10000 });
    await page.locator('#bet-amount').fill('19');
    const countBeforeOffline = await countRows(database.pool, 'slot_results', user.username);
    await context.setOffline(true);
    await page.locator('#spinBtn').click();
    await page.waitForFunction(() => !document.getElementById('spinBtn').disabled);
    await context.setOffline(false);
    await waitForApiAction(page, '/api/slot/play', () => page.locator('#spinBtn').click());
    await eventually(async () => {
        assert.equal(await countRows(database.pool, 'slot_results', user.username), countBeforeOffline + 1);
    });

    const countBeforeNavigation = await countRows(database.pool, 'slot_results', user.username);
    await page.goto(`${page.baseUrl}/profile`, { waitUntil: 'domcontentloaded' });
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.goForward({ waitUntil: 'domcontentloaded' });
    assert.equal(await countRows(database.pool, 'slot_results', user.username), countBeforeNavigation);
    return replacement;
}

async function exerciseEveryGame(page, database, user) {
    await page.goto(`${page.baseUrl}/quiz`, { waitUntil: 'domcontentloaded' });
    await waitForApiAction(page, '/api/quiz/start', () => page.locator('#start-quiz-btn').evaluate((button) => {
        button.click();
        button.click();
    }));
    await page.locator('.option').first().waitFor({ state: 'visible' });
    const questionStartedAt = Date.now();
    await waitForApiAction(page, '/api/quiz/next', () => page.locator('.option').first().click());
    assert.ok(Date.now() - questionStartedAt < 2500, 'Quiz option transition is unexpectedly slow');

    await page.goto(`${page.baseUrl}/scratch`, { waitUntil: 'domcontentloaded' });
    await waitForApiAction(page, '/api/scratch/play', () => page.locator('.tier-btn').first().click());
    await page.locator('#game-board').waitFor({ state: 'visible' });

    await page.goto(`${page.baseUrl}/spin`, { waitUntil: 'domcontentloaded' });
    await waitForApiAction(page, '/api/spin', () => page.locator('#spinButton').click());

    await page.goto(`${page.baseUrl}/blindbox`, { waitUntil: 'domcontentloaded' });
    await waitForApiAction(page, '/api/blindbox/open', () => page.locator('#openBtn').evaluate((button) => {
        button.click();
        button.click();
    }));
    assert.equal(await countRows(database.pool, 'blindbox_logs', user.username), 1);

    await page.goto(`${page.baseUrl}/stone`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.getElementById('addOneBtn').disabled);
    await waitForApiAction(page, '/api/stone/add', () => page.locator('#addOneBtn').click());
    assert.equal(await countRows(database.pool, 'stone_logs', user.username), 1);

    await page.goto(`${page.baseUrl}/flip`, { waitUntil: 'domcontentloaded' });
    await page.locator('.flip-card:not(.disabled)').first().waitFor({ state: 'visible' });
    await waitForApiAction(page, '/api/flip/flip', () => page.locator('.flip-card:not(.disabled)').first().click());
    assert.equal(await countRows(database.pool, 'flip_logs', user.username), 1);

    await page.goto(`${page.baseUrl}/duel`, { waitUntil: 'domcontentloaded' });
    await page.locator('.reward-item').last().click();
    await page.locator('#powerInput').fill('1');
    await waitForApiAction(page, '/api/duel/play', () => page.locator('#duelBtn').click());
    assert.equal(await countRows(database.pool, 'duel_logs', user.username), 1);

    await page.goto(`${page.baseUrl}/dictation`, { waitUntil: 'domcontentloaded' });
    await page.locator('#start-btn').click();
    await page.locator('#confirm-start-btn').waitFor({ state: 'visible' });
    await waitForApiAction(page, '/api/dictation/start', () => page.locator('#confirm-start-btn').click());
    assert.equal(await countRows(database.pool, 'dictation_sessions', user.username), 1);

    await page.goto(`${page.baseUrl}/wish`, { waitUntil: 'domcontentloaded' });
    const wishButton = page.locator('.gift-action-btn[data-gift="bobo"][data-count="1"]');
    await waitForApiAction(page, '/api/wish/play', () => wishButton.evaluate((button) => {
        button.click();
        button.click();
    }));
    assert.equal(await countRows(database.pool, 'wish_sessions', user.username), 1);

    await page.goto(`${page.baseUrl}/doudizhu`, { waitUntil: 'domcontentloaded' });
    const doudizhuStart = await waitForApiAction(
        page,
        '/api/doudizhu/start',
        () => page.locator('#startDoudizhuBtn').evaluate((button) => {
            button.click();
            button.click();
        })
    );
    assert.equal(await countRows(database.pool, 'doudizhu_games', user.username), 1);
    assert.equal(doudizhuStart.body.state.humanSeat >= 0, true);
    assert.equal(doudizhuStart.body.state.humanSeat <= 2, true);
    assert.equal(doudizhuStart.body.state.hand.length >= 1, true);
    assert.equal(Object.hasOwn(doudizhuStart.body.state, 'hands'), false);
}

async function run() {
    if (!fs.existsSync(chromium.executablePath())) {
        throw new Error('Playwright Chromium is not installed. Run: npx playwright install chromium');
    }
    const database = new DisposableDatabase('browser');
    let app;
    let browser;
    try {
        await database.create();
        const desktopUser = await database.createUser({ username: 'browser_desktop' });
        const mobileUser = await database.createUser({ username: 'browser_mobile' });
        await database.pool.query(`
            INSERT INTO dictation_allowances (username, attempts)
            VALUES ($1, 5), ($2, 5)
            ON CONFLICT (username) DO UPDATE SET attempts = EXCLUDED.attempts
        `, [desktopUser.username, mobileUser.username]);
        const port = await reservePort();
        app = await startApp({
            databaseName: database.name,
            port,
            label: 'browser-e2e',
            faultToken: FAULT_TOKEN,
            poolMax: 8
        });
        browser = await chromium.launch({ headless: true });

        const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const desktopPage = await desktopContext.newPage();
        desktopPage.baseUrl = app.baseUrl;
        const desktopFailures = [];
        attachFailureCollection(desktopPage, desktopFailures);
        desktopPage.on('dialog', (dialog) => dialog.accept());
        await login(desktopPage, app.baseUrl, desktopUser);
        for (const game of GAME_PAGES) {
            await verifyGamePage(desktopPage, app.baseUrl, game, 'desktop');
        }
        app = await testSlotRecovery(desktopPage, desktopContext, database, desktopUser, app);
        await exerciseEveryGame(desktopPage, database, desktopUser);
        assert.deepEqual(desktopFailures, [], `Desktop browser failures:\n${desktopFailures.join('\n')}`);
        await desktopContext.close();

        const mobileContext = await browser.newContext({
            viewport: { width: 390, height: 844 },
            deviceScaleFactor: 2,
            isMobile: true,
            hasTouch: true
        });
        const mobilePage = await mobileContext.newPage();
        mobilePage.baseUrl = app.baseUrl;
        const mobileFailures = [];
        attachFailureCollection(mobilePage, mobileFailures);
        mobilePage.on('dialog', (dialog) => dialog.accept());
        await login(mobilePage, app.baseUrl, mobileUser);
        for (const game of GAME_PAGES) {
            await verifyGamePage(mobilePage, app.baseUrl, game, 'mobile');
        }
        assert.deepEqual(mobileFailures, [], `Mobile browser failures:\n${mobileFailures.join('\n')}`);
        await mobileContext.close();

        console.log(`Browser E2E passed for all ${GAME_PAGES.length} games on desktop and mobile`);
    } finally {
        await browser?.close().catch(() => {});
        await app?.stop().catch(() => {});
        await database.close();
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
