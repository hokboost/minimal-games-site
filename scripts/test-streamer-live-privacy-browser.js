'use strict';

require('dotenv').config();

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const {
    DisposableDatabase,
    reservePort,
    startApp
} = require('../tests/helpers/integration-environment');

const FEATURES = Object.freeze({
    STREAMER_WORLD_ENABLED: 'true',
    CREATOR_PROFILE_ENABLED: 'true',
    LIVE_INTERACTIONS_ENABLED: 'true',
    STREAMER_NEW_GAMES_ENABLED: 'true'
});

async function login(page, baseUrl, user) {
    const response = await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    assert.equal(response.status(), 200);
    await page.locator('input[name="username"]').fill(user.username);
    await page.locator('input[name="password"]').fill(user.password);
    await Promise.all([
        page.waitForURL(`${baseUrl}/`),
        page.locator('button[type="submit"]').click()
    ]);
    const necessaryOnly = page.locator('.ux-consent-banner .ux-privacy-secondary').first();
    if (await necessaryOnly.isVisible().catch(() => false)) await necessaryOnly.click();
}

async function submitAndReload(page, apiPath, trigger) {
    let response;
    try {
        [response] = await Promise.all([
            page.waitForResponse(candidate => {
                const url = new URL(candidate.url());
                return url.pathname === apiPath && candidate.request().method() !== 'GET';
            }, { timeout: 15000 }),
            trigger()
        ]);
    } catch (error) {
        const diagnostics = await page.evaluate(() => ({
            url: location.href,
            message: document.querySelector('[role="status"], [role="alert"]')?.textContent || '',
            idempotentFetch: typeof window.idempotentFetch,
            profileAssistant: typeof window.CreatorProfileAssistant,
            online: navigator.onLine
        })).catch(() => ({}));
        throw new Error(`${error.message} (${apiPath}; ${JSON.stringify(diagnostics)})`, { cause: error });
    }
    const status = response.status();
    assert.ok(status < 400, `${apiPath}: HTTP ${status}`);
    // Director actions intentionally reload immediately after consuming the
    // fetch body. Validate the response status here and read durable state
    // from PostgreSQL instead of racing Chromium's discarded response body.
    await page.waitForTimeout(500);
    await page.waitForLoadState('domcontentloaded');
    return { status };
}

async function sendFromDirector(ownerPage, creatorUsername, templateKey) {
    await ownerPage.goto(`${ownerPage.baseUrl}/admin/creator-director`, {
        waitUntil: 'domcontentloaded'
    });
    const row = ownerPage.locator(`tr[data-creator="${creatorUsername}"]`);
    await row.locator('[data-director-action="compose"]').click();
    await ownerPage.locator('#director-template').selectOption(templateKey);
    return submitAndReload(ownerPage, '/api/admin/live/send', () => (
        ownerPage.locator('#director-send').click()
    ));
}

async function openRelay(ownerPage, database, creatorUsername) {
    await ownerPage.goto(`${ownerPage.baseUrl}/admin/creator-director`, {
        waitUntil: 'domcontentloaded'
    });
    const row = ownerPage.locator(`tr[data-creator="${creatorUsername}"]`);
    await submitAndReload(ownerPage, '/api/admin/live/open', () => (
        row.locator('[data-director-action="open"]').click()
    ));
    const result = await database.pool.query(`SELECT room.id,room.status,room.revision
        FROM live_interactions room JOIN users creator ON creator.id=room.creator_user_id
        WHERE creator.username=$1 ORDER BY room.id DESC LIMIT 1`, [creatorUsername]);
    assert.equal(result.rowCount, 1);
    assert.equal(result.rows[0].status, 'active');
    return { id: Number(result.rows[0].id), revision: Number(result.rows[0].revision) };
}

async function startConstellationCoop(creatorPage, database, creatorUsername) {
    await creatorPage.goto(`${creatorPage.baseUrl}/constellation-repair`, {
        waitUntil: 'domcontentloaded'
    });
    await creatorPage.locator('input[name="sg-mode"][value="coop"]').check();
    await submitAndReload(creatorPage, '/api/constellation-repair/start', () => (
        creatorPage.locator('#sg-start').click()
    ));
    const result = await database.pool.query(`SELECT run.id,run.status,run.mode,
            run.live_interaction_id,run.consent_revoked_reason
        FROM streamer_game_runs run JOIN users creator ON creator.id=run.creator_user_id
        WHERE creator.username=$1 AND run.game_id='constellation-repair'
        ORDER BY run.started_at DESC,run.id DESC LIMIT 1`, [creatorUsername]);
    assert.equal(result.rowCount, 1);
    assert.equal(result.rows[0].status, 'active');
    assert.equal(result.rows[0].mode, 'coop');
    return {
        id: String(result.rows[0].id),
        interactionId: Number(result.rows[0].live_interaction_id)
    };
}

async function run() {
    if (!fs.existsSync(chromium.executablePath())) {
        throw new Error('Playwright Chromium is not installed');
    }
    const database = new DisposableDatabase('live_privacy_browser');
    let app;
    let browser;
    try {
        await database.create();
        const owner = await database.createUser({ username: 'privacy_owner', isAdmin: true });
        const creator = await database.createUser({ username: 'privacy_creator' });
        const moderator = await database.createUser({ username: 'privacy_moderator', isAdmin: true });
        const port = await reservePort();
        app = await startApp({
            databaseName: database.name,
            port,
            label: 'live-privacy-browser',
            poolMax: 10,
            startupTimeoutMs: 90000,
            extraEnv: { ...FEATURES, STREAMER_WORLD_OWNER_USERNAME: owner.username }
        });
        browser = await chromium.launch({ headless: true });
        const ownerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const creatorContext = await browser.newContext({ viewport: { width: 1024, height: 900 } });
        const moderatorContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        assert.notEqual(ownerContext, creatorContext, 'owner and creator must use isolated contexts');
        assert.notEqual(moderatorContext, ownerContext,
            'independent moderator must use a distinct authenticated context');
        const ownerPage = await ownerContext.newPage();
        const creatorPage = await creatorContext.newPage();
        const moderatorPage = await moderatorContext.newPage();
        ownerPage.baseUrl = app.baseUrl;
        creatorPage.baseUrl = app.baseUrl;
        moderatorPage.baseUrl = app.baseUrl;
        const browserFailures = [];
        for (const [label, page] of [['owner', ownerPage], ['creator', creatorPage],
            ['moderator', moderatorPage]]) {
            page.on('dialog', dialog => dialog.type() === 'prompt'
                ? dialog.accept('Browser safety report') : dialog.accept());
            page.on('pageerror', error => browserFailures.push(`${label}: ${error.message}`));
            page.on('response', response => {
                if (response.status() >= 500) {
                    browserFailures.push(`${label}: HTTP ${response.status()} ${new URL(response.url()).pathname}`);
                }
            });
        }
        await Promise.all([
            login(ownerPage, app.baseUrl, owner),
            login(creatorPage, app.baseUrl, creator),
            login(moderatorPage, app.baseUrl, moderator)
        ]);

        await creatorPage.goto(`${app.baseUrl}/creator/profile`, { waitUntil: 'domcontentloaded' });
        await creatorPage.locator('[name="displayName"]').fill('Boundary Creator');
        await creatorPage.locator('[name="timezone"]').fill('UTC');
        await creatorPage.locator('[name="profileVisibility"]').selectOption('owner');
        await creatorPage.locator('[name="liveInteractionOptIn"]').check();
        await submitAndReload(creatorPage, '/api/creator/profile', () => (
            creatorPage.locator('#creator-profile-form').evaluate(form => form.requestSubmit())
        ));

        await ownerPage.goto(`${app.baseUrl}/admin/creator-director`, { waitUntil: 'domcontentloaded' });
        await assert.doesNotReject(() => ownerPage.locator(`tr[data-creator="${creator.username}"]`)
            .getByText('Boundary Creator').waitFor());
        let interactionId = (await openRelay(ownerPage, database, creator.username)).id;

        await creatorPage.goto(`${app.baseUrl}/live-room`, { waitUntil: 'domcontentloaded' });
        await creatorPage.locator('#live-connection').getByText(/Connected|已连接/).waitFor({ timeout: 15000 });
        const initialItems = await creatorPage.locator('#live-items .live-item').count();
        await sendFromDirector(ownerPage, creator.username, 'nudge.gentle-reset');
        await creatorPage.locator('#live-items .live-item').nth(initialItems).waitFor({ timeout: 15000 });
        const catchUp = await creatorPage.evaluate(async id => {
            const response = await fetch(`/api/live/events?interactionId=${id}&afterSequence=0&limit=100`);
            return { status: response.status, body: await response.json() };
        }, interactionId);
        assert.equal(catchUp.status, 200);
        assert.ok(catchUp.body.events.some(event => event.eventType === 'interaction.nudge'));

        const reportedRun = await startConstellationCoop(creatorPage, database, creator.username);
        assert.equal(reportedRun.interactionId, interactionId);
        await creatorPage.goto(`${app.baseUrl}/live-room`, { waitUntil: 'domcontentloaded' });
        await submitAndReload(creatorPage, '/api/live/report', () => (
            creatorPage.locator('#live-room-actions [data-action="report"]').click()
        ));
        const reported = await database.pool.query(`SELECT report.id,report.status,report.detail,
                room.status room_status,room.revision,run.status run_status,
                run.consent_revoked_reason
            FROM live_interaction_reports report
            JOIN live_interactions room ON room.id=report.interaction_id
            JOIN streamer_game_runs run ON run.id=$1
            WHERE report.interaction_id=$2 ORDER BY report.id DESC LIMIT 1`,
        [reportedRun.id, interactionId]);
        assert.equal(reported.rowCount, 1);
        assert.equal(reported.rows[0].status, 'open');
        assert.equal(reported.rows[0].detail, 'Browser safety report');
        assert.equal(reported.rows[0].room_status, 'reported');
        assert.equal(reported.rows[0].run_status, 'abandoned');
        assert.equal(reported.rows[0].consent_revoked_reason, 'unresolved_report');
        const reportId = Number(reported.rows[0].id);

        await ownerPage.goto(`${app.baseUrl}/admin/creator-director`, { waitUntil: 'domcontentloaded' });
        const ownerReport = ownerPage.locator(`[data-report-id="${reportId}"]`);
        await ownerReport.waitFor();
        assert.equal(await ownerReport.getByText('Browser safety report').count(), 0,
            'reported evidence must be hidden from the configured owner');
        assert.equal(await ownerReport.locator('[data-report-action]').count(), 0,
            'configured owner must not receive moderation controls');

        await moderatorPage.goto(`${app.baseUrl}/admin/creator-director`, {
            waitUntil: 'domcontentloaded'
        });
        const moderatorReport = moderatorPage.locator(`[data-report-id="${reportId}"]`);
        await moderatorReport.getByText('Browser safety report').waitFor();
        await submitAndReload(moderatorPage, '/api/admin/live/reports/moderate', () => (
            moderatorReport.locator('[data-report-action="resolved"]').click()
        ));
        const resolution = await database.pool.query(`SELECT report.status,
                report.creator_reconsented_at,reviewer.username reviewer_username
            FROM live_interaction_reports report
            JOIN users reviewer ON reviewer.id=report.reviewer_user_id WHERE report.id=$1`, [reportId]);
        assert.equal(resolution.rows[0].status, 'resolved');
        assert.equal(resolution.rows[0].reviewer_username, moderator.username);
        assert.equal(resolution.rows[0].creator_reconsented_at, null);

        await ownerPage.goto(`${app.baseUrl}/admin/creator-director`, { waitUntil: 'domcontentloaded' });
        const preReconsentOpen = ownerPage.waitForResponse(response => (
            new URL(response.url()).pathname === '/api/admin/live/open'
        ));
        await ownerPage.locator(`tr[data-creator="${creator.username}"] [data-director-action="open"]`)
            .click();
        const preReconsentResponse = await preReconsentOpen;
        assert.equal(preReconsentResponse.status(), 403,
            'moderator resolution alone must not restore owner interaction');
        assert.equal((await preReconsentResponse.json()).code, 'LIVE_PAIR_BLOCKED');

        await creatorPage.goto(`${app.baseUrl}/live-room`, { waitUntil: 'domcontentloaded' });
        await submitAndReload(creatorPage, '/api/live/reconsent', () => (
            creatorPage.locator('#live-room-actions [data-action="reconsent"]').click()
        ));
        const reconsented = await database.pool.query(`SELECT creator_reconsented_at
            FROM live_interaction_reports WHERE id=$1`, [reportId]);
        assert.ok(reconsented.rows[0].creator_reconsented_at,
            'creator explicit reconsent must be durable before a new relay can open');

        interactionId = (await openRelay(ownerPage, database, creator.username)).id;
        const leftRun = await startConstellationCoop(creatorPage, database, creator.username);
        assert.equal(leftRun.interactionId, interactionId);
        await creatorPage.goto(`${app.baseUrl}/live-room`, { waitUntil: 'domcontentloaded' });
        await submitAndReload(creatorPage, '/api/live/leave', () => (
            creatorPage.locator('#live-room-actions [data-action="leave"]').click()
        ));
        const left = await database.pool.query(`SELECT status,consent_revoked_reason
            FROM streamer_game_runs WHERE id=$1`, [leftRun.id]);
        assert.equal(left.rows[0].status, 'abandoned');
        assert.equal(left.rows[0].consent_revoked_reason, 'participant_left');

        interactionId = (await openRelay(ownerPage, database, creator.username)).id;

        await creatorPage.goto(`${app.baseUrl}/creator/profile`, { waitUntil: 'domcontentloaded' });
        const local = new Date();
        const weekday = local.getUTCDay();
        const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
        const quietWeekday = minute < 60 ? (weekday + 6) % 7 : weekday;
        const quietStart = (minute + 24 * 60 - 60) % (24 * 60);
        const quietEnd = (minute + 60) % (24 * 60);
        const time = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
        const quietRow = creatorPage.locator(`.creator-quiet-row[data-weekday="${quietWeekday}"]`);
        await quietRow.locator('.quiet-enabled').check();
        await quietRow.locator('.quiet-start').fill(time(quietStart));
        await quietRow.locator('.quiet-end').fill(time(quietEnd));
        await submitAndReload(creatorPage, '/api/creator/quiet-hours', () => (
            creatorPage.locator('#creator-quiet-form').evaluate(form => form.requestSubmit())
        ));

        await creatorPage.goto(`${app.baseUrl}/live-room`, { waitUntil: 'domcontentloaded' });
        await creatorPage.locator('#live-connection').getByText(/Connected|已连接/).waitFor({ timeout: 15000 });
        const beforeQuietSend = await creatorPage.locator('#live-items .live-item').count();
        await sendFromDirector(ownerPage, creator.username, 'nudge.one-breath');
        await creatorPage.waitForTimeout(900);
        assert.equal(await creatorPage.locator('#live-items .live-item').count(), beforeQuietSend,
            'quiet hours must suppress live push');
        const durable = await database.pool.query(`SELECT item.id,inbox.id inbox_id
            FROM live_interaction_items item JOIN creator_inbox_messages inbox
              ON (inbox.metadata->>'itemId')::BIGINT=item.id
            WHERE item.interaction_id=$1 AND item.template_key='nudge.one-breath'`, [interactionId]);
        assert.equal(durable.rowCount, 1, 'quiet delivery must remain durable in item and inbox tables');
        await creatorPage.reload({ waitUntil: 'domcontentloaded' });
        assert.equal(await creatorPage.locator('#live-items .live-item').count(), beforeQuietSend + 1,
            'durable quiet item must appear after REST-backed reload');

        await creatorPage.goto(`${app.baseUrl}/creator/profile`, { waitUntil: 'domcontentloaded' });
        await creatorPage.locator('[data-preference-type="communication"][data-preference-key="all_messages"] select')
            .selectOption('block');
        await submitAndReload(creatorPage, '/api/creator/preferences', () => (
            creatorPage.locator('#creator-preferences-form').evaluate(form => form.requestSubmit())
        ));
        await ownerPage.goto(`${app.baseUrl}/admin/creator-director`, { waitUntil: 'domcontentloaded' });
        const blockedRow = ownerPage.locator(`tr[data-creator="${creator.username}"]`);
        const blockedResponsePromise = ownerPage.waitForResponse(response => (
            new URL(response.url()).pathname === '/api/admin/live/open'
        ));
        await blockedRow.locator('[data-director-action="open"]').click();
        const blockedResponse = await blockedResponsePromise;
        assert.equal(blockedResponse.status(), 403);
        assert.equal((await blockedResponse.json()).code, 'LIVE_CONSENT_BLOCKED');
        const room = (await database.pool.query(`SELECT status FROM live_interactions WHERE id=$1`,
            [interactionId])).rows[0];
        assert.equal(room.status, 'closed', 'hard block must synchronously freeze the prior room');
        assert.deepEqual(browserFailures, [], browserFailures.join('\n'));
        console.log('live privacy Playwright: isolated creator/owner/moderator, coop report/leave, reconsent, catch-up, quiet durability, and revoke flow passed');
    } catch (error) {
        if (app?.output?.length) {
            console.error(`Live privacy browser application output:\n${app.output.join('').slice(-20000)}`);
        }
        throw error;
    } finally {
        await browser?.close().catch(() => {});
        await app?.stop().catch(() => {});
        await database.close();
    }
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
