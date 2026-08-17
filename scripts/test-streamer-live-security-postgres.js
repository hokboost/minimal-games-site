'use strict';

require('dotenv').config();

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { io } = require('socket.io-client');

const { GAME_DEFINITIONS } = require('../domain/games/registry');
const { CreatorRepository } = require('../repositories/creator-repository');
const { LiveInteractionRepository } = require('../repositories/live-interaction-repository');
const { StreamerGameRepository } = require('../repositories/streamer-game-repository');
const { CreatorProfileService } = require('../services/creator-profile-service');
const { CoopConsentCoordinator } = require('../services/coop-consent-coordinator');
const { LiveInteractionService } = require('../services/live-interaction-service');
const { StreamerGameService } = require('../services/streamer-game-service');
const { evaluateCommunicationBoundary } = require('../services/creator-communication-boundary-policy');
const storySeasonOne = require('../content/streamer-world/story/season-one');
const {
    BrowserSession,
    DisposableDatabase,
    delay,
    reservePort,
    startApp
} = require('../tests/helpers/integration-environment');

const uuid = () => crypto.randomUUID();
const projectRoot = path.resolve(__dirname, '..');

async function createProfile(pool, username) {
    await pool.query(`INSERT INTO creator_profiles(user_id,display_name,timezone,live_interaction_opt_in)
        SELECT id,$2,'UTC',TRUE FROM users WHERE username=$1`, [username, `Profile ${username}`]);
}

async function simulateHistoricalUpgrade(pool, room, creatorId, ownerId) {
    await pool.query('BEGIN');
    try {
        await pool.query('DROP INDEX streamer_game_runs_active_coop_consent_idx');
        await pool.query(`ALTER TABLE streamer_game_runs
            DROP CONSTRAINT streamer_game_runs_consent_revocation_check,
            DROP COLUMN consent_revoked_reason,
            DROP COLUMN consent_revoked_at`);
        await pool.query('ALTER TABLE streamer_game_trusted_events DROP COLUMN response_status');
        await pool.query('DROP INDEX live_interaction_events_acl_replay_idx');
        await pool.query(`ALTER TABLE live_interaction_events
            DROP CONSTRAINT live_interaction_events_audience_check,
            DROP COLUMN audience`);
        const legacy = [
            ['interaction.opened', 'owner', ownerId],
            ['interaction.reported', 'creator', creatorId],
            // This old type has no proven participant audience. The new migration must fail closed.
            ['interaction.closed', 'system', null]
        ];
        for (let index = 0; index < legacy.length; index += 1) {
            const [eventType, actorType, actorUserId] = legacy[index];
            await pool.query(`INSERT INTO live_interaction_events(event_id,interaction_id,sequence,
                protocol_version,event_type,actor_type,actor_user_id,subject_user_id,correlation_id,
                state_revision,payload) VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,$9,'{}'::JSONB)`,
            [uuid(), room.id, index + 1, eventType, actorType, actorUserId, creatorId, uuid(), index + 1]);
        }
        await pool.query('UPDATE live_interactions SET next_sequence=4 WHERE id=$1', [room.id]);
        await pool.query('COMMIT');
    } catch (error) {
        await pool.query('ROLLBACK').catch(() => {});
        throw error;
    }

    const migration = fs.readFileSync(path.join(projectRoot, 'migrations',
        'add_streamer_security_live_acl.sql'), 'utf8');
    await pool.query(migration);
    const rows = (await pool.query(`SELECT sequence,event_type,audience FROM live_interaction_events
        WHERE interaction_id=$1 ORDER BY sequence`, [room.id])).rows;
    assert.deepEqual(rows.map(row => row.audience), ['both', 'creator', 'system']);
    const metadata = (await pool.query(`SELECT column_default,is_nullable FROM information_schema.columns
        WHERE table_schema='public' AND table_name='live_interaction_events' AND column_name='audience'`)).rows[0];
    assert.equal(metadata.column_default, null);
    assert.equal(metadata.is_nullable, 'NO');
}

async function appendLive(repository, room, audience, eventType = 'interaction.nudge', payload = {}) {
    return repository.withTransaction(client => repository.appendEvent(client, {
        eventId: uuid(),
        interactionId: room.id,
        eventType,
        audience,
        actorType: audience === 'creator' ? 'creator' : audience === 'system' ? 'system' : 'owner',
        actorUserId: audience === 'creator' ? room.creatorUserId
            : audience === 'system' ? null : room.ownerUserId,
        subjectUserId: room.creatorUserId,
        correlationId: uuid(),
        stateRevision: room.revision,
        payload
    }));
}

async function allVisible(repository, roomId, username, limit = 37) {
    const events = [];
    let cursor = 0;
    for (let page = 0; page < 100; page += 1) {
        const result = await repository.catchUp(roomId, username, cursor, limit);
        assert.ok(result, `missing active membership for ${username}`);
        events.push(...result.events);
        if (!result.hasMore) return { events, lastSequence: result.lastSequence };
        assert.ok(result.nextAfter > cursor, 'visible cursor did not advance');
        cursor = result.nextAfter;
    }
    throw new Error('Live ACL pagination did not terminate');
}

function socketConnect(baseUrl, cookie) {
    return new Promise((resolve, reject) => {
        const client = io(baseUrl, {
            transports: ['websocket'],
            reconnection: false,
            extraHeaders: { cookie }
        });
        const timer = setTimeout(() => {
            client.close();
            reject(new Error('Socket connection timed out'));
        }, 10000);
        client.once('connect', () => {
            clearTimeout(timer);
            resolve(client);
        });
        client.once('connect_error', error => {
            clearTimeout(timer);
            client.close();
            reject(error);
        });
    });
}

function socketSubscribe(socket, interactionId, afterSequence) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Socket subscription timed out')), 10000);
        socket.emit('live:subscribe', { interactionId, afterSequence, limit: 100 }, response => {
            clearTimeout(timer);
            if (!response?.success) return reject(new Error(`Socket subscription rejected: ${response?.code}`));
            resolve(response);
        });
    });
}

async function waitFor(predicate, message) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await delay(25);
    }
    throw new Error(typeof message === 'function' ? message() : message);
}

async function notifyLive(pool, event, realtimeAudience = 'both') {
    const payload = JSON.stringify({
        version: 1,
        origin: `live-security-${uuid()}`,
        type: 'live_interaction',
        payload: { eventId: event.eventId, interactionId: event.interactionId, realtimeAudience }
    });
    await pool.query(`SELECT pg_notify('minimal_games_socket_events',$1)`, [payload]);
}

async function assertRunReason(pool, runId, reason) {
    const row = (await pool.query(`SELECT status,revision,consent_revoked_reason,consent_revoked_at
        FROM streamer_game_runs WHERE id=$1`, [runId])).rows[0];
    assert.equal(row.status, 'abandoned');
    assert.equal(row.consent_revoked_reason, reason);
    assert.ok(row.consent_revoked_at);
    const events = await pool.query(`SELECT event_type,action_summary FROM streamer_game_events
        WHERE run_id=$1 ORDER BY sequence`, [runId]);
    assert.equal(events.rows.filter(event => event.event_type === 'game.run.abandoned').length, 1);
    assert.equal(events.rows.at(-1).action_summary.reason, reason);
    const audits = await pool.query(`SELECT details FROM streamer_game_audit_log
        WHERE run_id=$1 AND action='streamer_game.consent_revoked'`, [runId]);
    assert.equal(audits.rowCount, 1);
    assert.equal(audits.rows[0].details.reason, reason);
    return row;
}

async function main() {
    const database = new DisposableDatabase('live_security');
    const apps = [];
    const sockets = [];
    try {
        await database.create();
        const owner = await database.createUser({ username: 'owner_acl', isAdmin: true });
        const aclCreator = await database.createUser({ username: 'creator_acl' });
        const scenarioNames = ['creator_mute', 'creator_leave', 'creator_report',
            'creator_optout', 'creator_race', 'creator_account', 'creator_unauthorized'];
        for (const username of scenarioNames) await database.createUser({ username });
        for (const username of [aclCreator.username, ...scenarioNames]) {
            await createProfile(database.pool, username);
        }
        const identities = (await database.pool.query(`SELECT id,username FROM users
            WHERE username=ANY($1::TEXT[])`, [[owner.username, aclCreator.username, ...scenarioNames]])).rows;
        const ids = new Map(identities.map(row => [row.username, Number(row.id)]));

        const liveRepository = new LiveInteractionRepository({ pool: database.pool });
        const aclRoom = await liveRepository.withTransaction(client => liveRepository.createRoom(client, {
            interactionKey: uuid(), creatorUserId: ids.get(aclCreator.username), ownerUserId: ids.get(owner.username)
        }));
        aclRoom.creatorUserId = ids.get(aclCreator.username);
        aclRoom.ownerUserId = ids.get(owner.username);
        await simulateHistoricalUpgrade(database.pool, aclRoom, aclRoom.creatorUserId,
            aclRoom.ownerUserId);

        const historicalCreator = await liveRepository.catchUp(aclRoom.id, aclCreator.username, 0, 20);
        const historicalOwner = await liveRepository.catchUp(aclRoom.id, owner.username, 0, 20);
        assert.deepEqual(historicalCreator.events.map(value => value.audience), ['both', 'creator']);
        assert.deepEqual(historicalOwner.events.map(value => value.audience), ['both']);
        assert.equal(historicalCreator.events.some(value => value.eventType === 'interaction.closed'), false);
        assert.equal(historicalOwner.events.some(value => value.eventType === 'interaction.closed'), false);

        for (let index = 0; index < 240; index += 1) {
            const audience = ['creator', 'owner', 'both', 'system'][index % 4];
            await appendLive(liveRepository, aclRoom, audience,
                audience === 'system' ? 'interaction.closed' : 'interaction.nudge', { index });
        }
        const creatorVisible = await allVisible(liveRepository, aclRoom.id, aclCreator.username);
        const ownerVisible = await allVisible(liveRepository, aclRoom.id, owner.username);
        assert.ok(creatorVisible.events.length > 100 && ownerVisible.events.length > 100);
        assert.ok(creatorVisible.events.every(value => ['creator', 'both'].includes(value.audience)));
        assert.ok(ownerVisible.events.every(value => ['owner', 'both'].includes(value.audience)));
        assert.equal(new Set(creatorVisible.events.map(value => value.eventId)).size,
            creatorVisible.events.length);
        assert.equal(new Set(ownerVisible.events.map(value => value.eventId)).size,
            ownerVisible.events.length);
        const physicalMaximum = Number((await database.pool.query(`SELECT MAX(sequence) maximum
            FROM live_interaction_events WHERE interaction_id=$1`, [aclRoom.id])).rows[0].maximum);
        assert.ok(physicalMaximum > creatorVisible.lastSequence);
        await liveRepository.withTransaction(async client => {
            const room = await liveRepository.lockMemberRoom(client, aclRoom.id, aclCreator.username);
            const ahead = await liveRepository.updateAck(client, room, aclRoom.creatorUserId,
                physicalMaximum);
            assert.equal(ahead.invalid, true);
            const accepted = await liveRepository.updateAck(client, room, aclRoom.creatorUserId,
                creatorVisible.lastSequence);
            assert.equal(accepted.invalid, false);
        });
        const creatorState = await liveRepository.roomState(aclRoom.id, aclCreator.username);
        const ownerState = await liveRepository.roomState(aclRoom.id, owner.username);
        assert.ok(creatorState.recent.every(value => ['creator', 'both'].includes(value.audience)));
        assert.ok(ownerState.recent.every(value => ['owner', 'both'].includes(value.audience)));

        const portA = await reservePort();
        const featureEnvironment = {
            STREAMER_WORLD_ENABLED: 'true',
            CREATOR_PROFILE_ENABLED: 'true',
            LIVE_INTERACTIONS_ENABLED: 'true',
            STREAMER_WORLD_OWNER_USERNAME: owner.username
        };
        apps.push(await startApp({ databaseName: database.name, port: portA,
            label: 'live-security-a', poolMax: 12, startupTimeoutMs: 90000,
            extraEnv: featureEnvironment }));
        let portB = await reservePort();
        while (portB === portA) portB = await reservePort();
        apps.push(await startApp({ databaseName: database.name, port: portB,
            label: 'live-security-b', poolMax: 12, startupTimeoutMs: 90000,
            extraEnv: featureEnvironment }));
        const ownerBrowser = await new BrowserSession(apps[0].baseUrl).login(owner);
        const creatorBrowser = await new BrowserSession(apps[1].baseUrl).login(aclCreator);
        const ownerSocket = await socketConnect(apps[0].baseUrl, ownerBrowser.cookieHeader());
        const creatorSocket = await socketConnect(apps[1].baseUrl, creatorBrowser.cookieHeader());
        sockets.push(ownerSocket, creatorSocket);
        const received = { owner: [], creator: [] };
        ownerSocket.on('live:event', value => received.owner.push(value));
        creatorSocket.on('live:event', value => received.creator.push(value));
        await socketSubscribe(ownerSocket, aclRoom.id, physicalMaximum);
        await socketSubscribe(creatorSocket, aclRoom.id, physicalMaximum);

        const delivered = [];
        for (const audience of ['creator', 'owner', 'both', 'system']) {
            const stored = await appendLive(liveRepository, aclRoom, audience,
                audience === 'system' ? 'interaction.closed' : 'interaction.nudge',
                { multiInstance: true, audience });
            delivered.push(stored);
            await notifyLive(database.pool, stored);
        }
        const bothEvent = delivered.find(value => value.audience === 'both');
        for (const [role, identity] of [['owner', owner], ['creator', aclCreator]]) {
            const context = await liveRepository.realtimeRecipientContext(bothEvent, {
                role, userId: ids.get(identity.username)
            }, { userId: ids.get(identity.username), username: identity.username }, 'both');
            assert.ok(context, `${role} durable realtime ACL context was unexpectedly absent`);
            assert.equal(evaluateCommunicationBoundary({ ...context, now: new Date() }).allowRealtime,
                true, `${role} communication boundary unexpectedly denied realtime`);
        }
        try {
            await waitFor(() => received.owner.length === 2 && received.creator.length === 2,
                () => `two instances did not deliver role-isolated events: ${JSON.stringify({
                    owner: received.owner.map(value => [value.eventId, value.audience]),
                    creator: received.creator.map(value => [value.eventId, value.audience])
                })}`);
        } catch (error) {
            error.message += `\napp logs:\n${apps.map(app => app.output.join('')).join('\n---\n')}`;
            throw error;
        }
        assert.deepEqual(received.owner.map(value => value.audience), ['owner', 'both']);
        assert.deepEqual(received.creator.map(value => value.audience), ['creator', 'both']);
        for (const value of delivered) {
            const expected = value.audience === 'both' ? 2
                : ['creator', 'owner'].includes(value.audience) ? 1 : 0;
            const count = [...received.owner, ...received.creator]
                .filter(receivedEvent => receivedEvent.eventId === value.eventId).length;
            assert.equal(count, expected);
        }
        const creatorRest = await creatorBrowser.request(`/api/live/events?interactionId=${aclRoom.id}&afterSequence=0&limit=100`);
        const ownerRest = await ownerBrowser.request(`/api/live/events?interactionId=${aclRoom.id}&afterSequence=0&limit=100`);
        assert.equal(creatorRest.status, 200);
        assert.equal(ownerRest.status, 200);
        assert.ok((await creatorRest.json()).events.every(value => ['creator', 'both'].includes(value.audience)));
        assert.ok((await ownerRest.json()).events.every(value => ['owner', 'both'].includes(value.audience)));

        await database.pool.query(`UPDATE creator_profiles SET live_interaction_opt_in=FALSE
            WHERE user_id=$1`, [aclRoom.creatorUserId]);
        const beforeRevoked = { owner: received.owner.length, creator: received.creator.length };
        const afterOptOut = await appendLive(liveRepository, aclRoom, 'both');
        await notifyLive(database.pool, afterOptOut);
        await delay(250);
        assert.deepEqual({ owner: received.owner.length, creator: received.creator.length }, beforeRevoked,
            'stale sockets received an event after global opt-out');
        await database.pool.query(`UPDATE creator_profiles SET live_interaction_opt_in=TRUE
            WHERE user_id=$1`, [aclRoom.creatorUserId]);

        const gameRepository = new StreamerGameRepository({ pool: database.pool });
        const coordinator = new CoopConsentCoordinator({ gameRepository,
            liveRepository, ownerUsername: owner.username });
        const gameService = new StreamerGameService({ repository: gameRepository, liveRepository,
            ownerUsername: owner.username, consentCoordinator: coordinator });
        await gameService.ensureCatalog();
        const liveService = new LiveInteractionService({ repository: liveRepository,
            ownerUsername: owner.username, consentCoordinator: coordinator,
            games: GAME_DEFINITIONS, storyNodeIds: storySeasonOne.nodes.map(node => node.id) });

        async function pairAndRun(username, gameId = 'keeper-prediction') {
            const opened = await liveService.open(owner.username, {
                commandId: uuid(), creatorUsername: username
            });
            const started = await gameService.start(username, gameId, {
                commandId: uuid(), gameId,
                challengeId: gameId === 'keeper-prediction' ? 'sky-library' : 'harbor-watch',
                difficulty: 'gentle', mode: 'coop'
            });
            return { interaction: opened.interaction, run: started.run };
        }

        const mute = await pairAndRun('creator_mute');
        await liveService.creatorAction('creator_mute', { commandId: uuid(),
            interactionId: mute.interaction.id, expectedRevision: mute.interaction.revision,
            minutes: 15 }, 'mute');
        await assertRunReason(database.pool, mute.run.id, 'room_muted');

        const leave = await pairAndRun('creator_leave');
        await liveService.creatorAction('creator_leave', { commandId: uuid(),
            interactionId: leave.interaction.id, expectedRevision: leave.interaction.revision }, 'leave');
        await assertRunReason(database.pool, leave.run.id, 'participant_left');

        const report = await pairAndRun('creator_report');
        await liveService.report('creator_report', { commandId: uuid(),
            interactionId: report.interaction.id, expectedRevision: report.interaction.revision,
            itemId: null, reasonCode: 'unwanted_contact', detail: 'stop' });
        await assertRunReason(database.pool, report.run.id, 'unresolved_report');

        const creatorRepository = new CreatorRepository({ pool: database.pool });
        const creatorService = new CreatorProfileService({ repository: creatorRepository,
            gameIds: GAME_DEFINITIONS.map(game => game.id), consentCoordinator: coordinator });
        const optout = await pairAndRun('creator_optout');
        await creatorService.updateProfile('creator_optout', {
            displayName: 'Opt out creator', timezone: 'UTC', interactionTones: [],
            liveInteractionOptIn: false, expectedVersion: 1
        });
        await assertRunReason(database.pool, optout.run.id, 'global_opt_out');

        const account = await pairAndRun('creator_account');
        await gameRepository.withTransaction(async client => {
            const locked = await client.query(`SELECT id FROM users WHERE username=$1 FOR UPDATE`,
                ['creator_account']);
            await client.query(`UPDATE users SET deactivated=TRUE,authorized=FALSE WHERE id=$1`,
                [locked.rows[0].id]);
            await coordinator.withdrawCreator(client, Number(locked.rows[0].id),
                'account_deactivated', { actorUsername: owner.username }, { closeRooms: true });
        });
        await assertRunReason(database.pool, account.run.id, 'account_deactivated');

        const unauthorized = await pairAndRun('creator_unauthorized');
        const unauthorizedResponse = await ownerBrowser.postJson('/api/admin/unauthorize-user', {
            username: 'creator_unauthorized'
        }, { idempotencyKey: uuid() });
        assert.equal(unauthorizedResponse.status, 200,
            `authorization revocation failed: ${await unauthorizedResponse.text()}`);
        await assertRunReason(database.pool, unauthorized.run.id, 'creator_account_inactive');

        for (const socket of sockets.splice(0)) socket.close();
        for (const app of apps.splice(0)) await app.stop();

        const race = await pairAndRun('creator_race');
        const originalReplace = creatorRepository.replacePreferences.bind(creatorRepository);
        let reachedPreferenceWrite;
        let releasePreferenceWrite;
        const atPreferenceWrite = new Promise(resolve => { reachedPreferenceWrite = resolve; });
        const releasePreference = new Promise(resolve => { releasePreferenceWrite = resolve; });
        creatorRepository.replacePreferences = async (...args) => {
            reachedPreferenceWrite();
            await releasePreference;
            return originalReplace(...args);
        };
        const preferencePromise = creatorService.updatePreferences('creator_race', {
            preferences: [{ type: 'game', key: 'keeper-prediction', value: 'block' }]
        });
        await atPreferenceWrite;
        const actionPromise = gameService.action(owner.username, 'keeper-prediction', {
            commandId: uuid(), gameId: 'keeper-prediction', runId: race.run.id,
            expectedRevision: 0, action: { type: 'submit', choice: 0, prediction: 0 }
        }).then(value => ({ value }), error => ({ error }));
        await delay(100);
        releasePreferenceWrite();
        await preferencePromise;
        const actionResult = await actionPromise;
        assert.equal(actionResult.error?.code, 'GAME_COOP_CONSENT_REVOKED');
        await assertRunReason(database.pool, race.run.id, 'game_preference_blocked');
        const committedActions = await database.pool.query(`SELECT 1 FROM streamer_game_events
            WHERE run_id=$1 AND event_type='game.action.committed'`, [race.run.id]);
        assert.equal(committedActions.rowCount, 0,
            'owner action committed after the creator preference revocation won');
        const eventCount = Number((await database.pool.query(`SELECT COUNT(*) count
            FROM streamer_game_events WHERE run_id=$1`, [race.run.id])).rows[0].count);
        const terminal = await gameService.state('creator_race', 'keeper-prediction', race.run.id);
        assert.equal(terminal.run.status, 'abandoned');
        assert.equal(terminal.run.consentRevokedReason, 'game_preference_blocked');
        await gameService.state('creator_race', 'keeper-prediction', race.run.id);
        assert.equal(Number((await database.pool.query(`SELECT COUNT(*) count
            FROM streamer_game_events WHERE run_id=$1`, [race.run.id])).rows[0].count), eventCount,
        'terminal state reads repeated the consent-revocation side effect');

        console.log('live security PostgreSQL: historical ACL, 240-event pagination, two-instance Socket ACL, and consent races passed');
    } finally {
        for (const socket of sockets) socket.close();
        for (const app of apps.reverse()) await app.stop().catch(() => {});
        await database.close();
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
