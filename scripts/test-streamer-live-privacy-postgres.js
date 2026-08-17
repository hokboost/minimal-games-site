'use strict';

require('dotenv').config();

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { GAME_DEFINITIONS } = require('../domain/games/registry');
const { publishedStoryInterventionRegistry } = require('../domain/story/published-content-registry');
const { CreatorRepository } = require('../repositories/creator-repository');
const { LiveInteractionRepository } = require('../repositories/live-interaction-repository');
const { QuestV2RuntimeRepository } = require('../repositories/quest-v2-runtime-repository');
const { RewardCatalogRepository } = require('../repositories/reward-catalog-repository');
const { StreamerGameRepository } = require('../repositories/streamer-game-repository');
const { CreatorProfileService } = require('../services/creator-profile-service');
const { LiveInteractionService } = require('../services/live-interaction-service');
const { DisposableDatabase, delay } = require('../tests/helpers/integration-environment');

const uuid = () => crypto.randomUUID();

async function waitForBackendLock(pool, backendPid, label) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        const state = (await pool.query(`SELECT wait_event_type,wait_event
            FROM pg_stat_activity WHERE pid=$1`, [backendPid])).rows[0];
        if (state?.wait_event_type === 'Lock') return state;
        await delay(20);
    }
    throw new Error(`${label} did not reach a PostgreSQL lock wait`);
}

async function assertSensitiveAuditDoesNotDeadlockAccountAuthority(pool, repository, values) {
    const directorClient = await pool.connect();
    const ackClient = await pool.connect();
    let directorOpen = false;
    let ackOpen = false;
    try {
        await directorClient.query('BEGIN');
        directorOpen = true;
        await ackClient.query('BEGIN');
        ackOpen = true;
        await directorClient.query(`SELECT id FROM users WHERE id=$1 FOR SHARE`, [values.ownerId]);
        const ackPid = Number((await ackClient.query('SELECT pg_backend_pid() pid')).rows[0].pid);
        let ackSettled = false;
        const authorityLabel = values.authorityLabel || 'live acknowledgement';
        const lockAccountPair = values.lockAccountPair || (client => repository.lockAccounts(client,
            values.creatorUsername, values.ownerUsername));
        const ackAttempt = lockAccountPair(ackClient).then(value => ({ value }), error => ({ error }))
            .finally(() => { ackSettled = true; });
        await waitForBackendLock(pool, ackPid, `${authorityLabel} account lock`);
        const lockProofClient = await pool.connect();
        try {
            await assert.rejects(lockProofClient.query(`SELECT id FROM users WHERE id=$1
                FOR SHARE NOWAIT`, [values.creatorId]), error => error.code === '55P03',
            `${authorityLabel} must hold the creator row before waiting on the owner row`);
        } finally {
            lockProofClient.release();
        }

        const auditAttempt = repository.appendSensitiveReadAudit(directorClient, {
            actorUserId: values.ownerId,
            actorUsername: values.ownerUsername,
            targetUserId: values.creatorId,
            accessKind: 'owner_profile',
            decision: 'granted',
            fields: ['display_name'],
            requestId: 'audit-account-lock-compatibility',
            metadata: { regression: 'director_account_authority_deadlock', authorityLabel }
        }).then(() => ({ success: true }), error => ({ error }));
        const auditOutcome = await Promise.race([
            auditAttempt,
            delay(3000).then(() => ({ timeout: true }))
        ]);
        assert.equal(auditOutcome.timeout, undefined,
            'sensitive-read audit waited on the creator row held by live acknowledgement');
        assert.equal(auditOutcome.error, undefined,
            `sensitive-read audit failed while acknowledgement waited: ${auditOutcome.error?.code}`);
        if (ackSettled) {
            const prematureAck = await ackAttempt;
            assert.equal(prematureAck.error, undefined,
                `${authorityLabel} deadlocked with sensitive-read audit: ${prematureAck.error?.code}`);
            assert.fail(`${authorityLabel} bypassed the owner authority lock before Director commit`);
        }

        await directorClient.query('COMMIT');
        directorOpen = false;
        const ackOutcome = await ackAttempt;
        assert.equal(ackOutcome.error, undefined,
            `${authorityLabel} account lock failed: ${ackOutcome.error?.code}`);
        await ackClient.query('COMMIT');
        ackOpen = false;
    } finally {
        if (directorOpen) await directorClient.query('ROLLBACK').catch(() => {});
        if (ackOpen) await ackClient.query('ROLLBACK').catch(() => {});
        directorClient.release();
        ackClient.release();
    }
}

async function insertProfile(pool, username, visibility = 'owner') {
    await pool.query(`INSERT INTO creator_profiles(
        user_id,display_name,bio,timezone,communication_style,live_interaction_opt_in,
        profile_visibility,evidence_retention
    ) SELECT id,$2,'creator private biography','UTC','live',TRUE,$3,'minimum'
      FROM users WHERE username=$1`, [username, `Private ${username}`, visibility]);
    await pool.query(`INSERT INTO relationship_profiles(user_id)
        SELECT id FROM users WHERE username=$1 ON CONFLICT DO NOTHING`, [username]);
}

async function main() {
    const database = new DisposableDatabase('live_privacy');
    try {
        await database.create();
        const owner = await database.createUser({ username: 'privacy_owner_pg', isAdmin: true });
        const moderator = await database.createUser({ username: 'privacy_moderator_pg', isAdmin: true });
        const ordinary = await database.createUser({ username: 'privacy_admin_pg', isAdmin: true });
        const revoked = await database.createUser({ username: 'privacy_revoked_pg', isAdmin: true });
        const locked = await database.createUser({ username: 'privacy_locked_pg', isAdmin: true });
        const unauthorized = await database.createUser({ username: 'privacy_unauthorized_pg', isAdmin: true });
        const raceAdmin = await database.createUser({ username: 'privacy_race_admin_pg', isAdmin: true });
        const creator = await database.createUser({ username: 'privacy_creator_pg' });
        const optoutCreator = await database.createUser({ username: 'privacy_optout_creator_pg' });
        const lateAuthority = await database.createUser({ username: 'privacy_late_authority_pg', isAdmin: true });
        await insertProfile(database.pool, creator.username);
        await insertProfile(database.pool, optoutCreator.username);
        await database.pool.query('UPDATE users SET deactivated=TRUE WHERE username=$1', [revoked.username]);
        await database.pool.query(`UPDATE users SET account_locked=TRUE,account_locked_at=NOW(),
            account_locked_by=$2,account_lock_reason='privacy integration test'
            WHERE username=$1`, [locked.username, owner.username]);
        await database.pool.query('UPDATE users SET authorized=FALSE WHERE username=$1', [unauthorized.username]);

        const creatorRepository = new CreatorRepository({ pool: database.pool });
        const creatorService = new CreatorProfileService({ repository: creatorRepository,
            gameIds: GAME_DEFINITIONS.map(game => game.id), ownerUsername: owner.username });
        const ownerSummary = await creatorService.adminSummaries(owner.username, 1,
            { requestId: 'privacy-owner-read' });
        const ordinarySummary = await creatorService.adminSummaries(ordinary.username, 1,
            { requestId: 'privacy-admin-read' });
        const ownerCreator = ownerSummary.creators.find(row => row.username === creator.username);
        const ordinaryCreator = ordinarySummary.creators.find(row => row.username === creator.username);
        assert.equal(ownerCreator.displayName, `Private ${creator.username}`);
        assert.equal(ownerCreator.timezone, 'UTC');
        assert.equal(ordinaryCreator.displayName, null);
        assert.equal(ordinaryCreator.timezone, null);
        assert.equal((await creatorService.dashboard(creator.username)).profile.displayName,
            `Private ${creator.username}`);
        const noConfiguredOwner = new CreatorProfileService({ repository: creatorRepository });
        assert.equal((await noConfiguredOwner.adminSummaries(owner.username, 1)).creators
            .find(row => row.username === creator.username).displayName, null);
        for (const username of [revoked.username, locked.username, unauthorized.username]) {
            await assert.rejects(creatorService.adminSummaries(username, 1),
                error => error.code === 'CREATOR_PROFILE_READ_FORBIDDEN');
        }

        const blockingClient = await database.pool.connect();
        await blockingClient.query('BEGIN');
        await blockingClient.query('UPDATE users SET deactivated=TRUE WHERE username=$1',
            [raceAdmin.username]);
        let raceSettled = false;
        const racedRead = creatorService.adminSummaries(raceAdmin.username, 1)
            .then(value => ({ value }), error => ({ error }))
            .finally(() => { raceSettled = true; });
        await delay(150);
        assert.equal(raceSettled, false, 'sensitive read did not wait for account revocation lock');
        await blockingClient.query('COMMIT');
        blockingClient.release();
        assert.equal((await racedRead).error?.code, 'CREATOR_PROFILE_READ_FORBIDDEN');

        const liveRepository = new LiveInteractionRepository({ pool: database.pool });
        const fanout = [];
        const liveService = new LiveInteractionService({
            repository: liveRepository,
            ownerUsername: owner.username,
            games: GAME_DEFINITIONS,
            storyInterventionRegistry: publishedStoryInterventionRegistry,
            clock: () => new Date('2026-08-17T12:00:00.000Z'),
            publish: async (event, room, audience) => fanout.push({ event, room, audience })
        });
        const optoutCreatorId = Number((await database.pool.query(
            'SELECT id FROM users WHERE username=$1', [optoutCreator.username])).rows[0].id);
        const optoutWriter = await database.pool.connect();
        let optoutWriterOpen = false;
        let optoutOpenPromise;
        try {
            await optoutWriter.query('BEGIN');
            optoutWriterOpen = true;
            await optoutWriter.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [optoutCreatorId]);
            await optoutWriter.query(`UPDATE creator_profiles SET live_interaction_opt_in=FALSE,
                version=version+1 WHERE user_id=$1`, [optoutCreatorId]);
            let optoutOpenSettled = false;
            optoutOpenPromise = liveService.open(owner.username, {
                commandId: uuid(), creatorUsername: optoutCreator.username
            }).then(value => ({ value }), error => ({ error }))
                .finally(() => { optoutOpenSettled = true; });
            await delay(150);
            assert.equal(optoutOpenSettled, false,
                'Live open must wait for the creator profile authority barrier');
            await optoutWriter.query('COMMIT');
            optoutWriterOpen = false;
        } finally {
            if (optoutWriterOpen) await optoutWriter.query('ROLLBACK').catch(() => {});
            optoutWriter.release();
        }
        const optoutOpen = await Promise.race([
            optoutOpenPromise,
            delay(5000).then(() => { throw new Error('Live opt-out/open authority race timed out'); })
        ]);
        assert.equal(optoutOpen.error?.code, 'LIVE_CONSENT_REQUIRED',
            'a Live open waiting behind committed opt-out must observe the new profile fact');
        const optoutSideEffects = await database.pool.query(`SELECT
            (SELECT COUNT(*) FROM live_interactions WHERE creator_user_id=$1)::INTEGER rooms,
            (SELECT COUNT(*) FROM live_interaction_events event JOIN live_interactions room
                ON room.id=event.interaction_id WHERE room.creator_user_id=$1)::INTEGER events`,
        [optoutCreatorId]);
        assert.deepEqual(optoutSideEffects.rows[0], { rooms: 0, events: 0 },
            'rejected post-opt-out Live open must not persist a room or event');
        const opened = await liveService.open(owner.username, {
            commandId: uuid(), creatorUsername: creator.username
        });
        let revision = opened.interaction.revision;

        const gameInvite = await liveService.send(owner.username, {
            commandId: uuid(), creatorUsername: creator.username,
            interactionId: opened.interaction.id, expectedRevision: revision,
            itemType: 'game_invite', templateKey: 'game-invite.quiz-round', referenceId: 'quiz'
        });
        revision = gameInvite.revision;
        const creatorId = Number((await database.pool.query('SELECT id FROM users WHERE username=$1',
            [creator.username])).rows[0].id);
        const ownerId = Number((await database.pool.query('SELECT id FROM users WHERE username=$1',
            [owner.username])).rows[0].id);
        const lateAuthorityId = Number((await database.pool.query('SELECT id FROM users WHERE username=$1',
            [lateAuthority.username])).rows[0].id);
        assert.ok(creatorId < lateAuthorityId,
            'reward/Quest audit lock regression needs the target creator before the actor in global ID order');
        await assertSensitiveAuditDoesNotDeadlockAccountAuthority(database.pool, liveRepository, {
            ownerId: lateAuthorityId,
            ownerUsername: lateAuthority.username,
            creatorId,
            creatorUsername: creator.username,
            authorityLabel: 'live acknowledgement'
        });
        const streamerGameRepository = new StreamerGameRepository({ pool: database.pool });
        await assertSensitiveAuditDoesNotDeadlockAccountAuthority(database.pool, liveRepository, {
            ownerId: lateAuthorityId,
            ownerUsername: lateAuthority.username,
            creatorId,
            creatorUsername: creator.username,
            authorityLabel: 'streamer game co-op',
            lockAccountPair: client => streamerGameRepository.lockAccounts(client,
                [creator.username, lateAuthority.username])
        });
        const rewardRepository = new RewardCatalogRepository({ pool: database.pool });
        await assertSensitiveAuditDoesNotDeadlockAccountAuthority(database.pool, liveRepository, {
            ownerId: lateAuthorityId,
            ownerUsername: lateAuthority.username,
            creatorId,
            creatorUsername: creator.username,
            authorityLabel: 'reward owner grant',
            lockAccountPair: client => rewardRepository.lockAccounts(client,
                [lateAuthority.username, creator.username])
        });
        await assertSensitiveAuditDoesNotDeadlockAccountAuthority(database.pool, liveRepository, {
            ownerId: lateAuthorityId,
            ownerUsername: lateAuthority.username,
            creatorId,
            creatorUsername: creator.username,
            authorityLabel: 'quest review',
            lockAccountPair: client => new QuestV2RuntimeRepository(client)
                .lockReviewerAndSubject(lateAuthority.username, creatorId)
        });
        await database.pool.query(`INSERT INTO creator_preferences(
            user_id,preference_type,preference_key,preference_value,source
        ) VALUES($1,'game','quiz','block','creator')`, [creatorId]);
        await assert.rejects(liveService.itemAction(creator.username, {
            commandId: uuid(), interactionId: opened.interaction.id,
            expectedRevision: revision, itemId: gameInvite.item.id
        }, 'accept'), error => error.code === 'LIVE_CONSENT_BLOCKED');
        const xpBefore = Number((await database.pool.query('SELECT total_xp FROM relationship_profiles WHERE user_id=$1',
            [creatorId])).rows[0].total_xp);
        const declined = await liveService.itemAction(creator.username, {
            commandId: uuid(), interactionId: opened.interaction.id,
            expectedRevision: revision, itemId: gameInvite.item.id
        }, 'decline');
        revision = declined.revision;
        const xpAfter = Number((await database.pool.query('SELECT total_xp FROM relationship_profiles WHERE user_id=$1',
            [creatorId])).rows[0].total_xp);
        assert.equal(xpAfter, xpBefore, 'declining or blocking a game changed relationship XP');
        await database.pool.query(`DELETE FROM creator_preferences
            WHERE user_id=$1 AND preference_type='game' AND preference_key='quiz'`, [creatorId]);

        const privateCreatorEvent = await liveRepository.appendEvent(database.pool, {
            eventId: uuid(), interactionId: opened.interaction.id,
            eventType: 'interaction.availability_changed', audience: 'creator',
            actorType: 'creator', actorUserId: creatorId, subjectUserId: creatorId,
            correlationId: uuid(), stateRevision: revision, payload: { marker: 'creator-private' }
        });
        const privateSystemEvent = await liveRepository.appendEvent(database.pool, {
            eventId: uuid(), interactionId: opened.interaction.id,
            eventType: 'interaction.availability_changed', audience: 'system',
            actorType: 'system', actorUserId: null, subjectUserId: creatorId,
            correlationId: uuid(), stateRevision: revision, payload: { marker: 'system-private' }
        });
        const ownerVisibleEvent = await liveRepository.appendEvent(database.pool, {
            eventId: uuid(), interactionId: opened.interaction.id,
            eventType: 'interaction.availability_changed', audience: 'owner',
            actorType: 'owner', actorUserId: ownerId, subjectUserId: creatorId,
            correlationId: uuid(), stateRevision: revision, payload: { marker: 'owner-visible' }
        });
        const ownerAuditBefore = Number((await database.pool.query(`SELECT COUNT(*) count
            FROM creator_sensitive_read_audit WHERE actor_user_id=$1 AND access_kind='owner_profile'`,
        [ownerId])).rows[0].count);
        const director = await liveService.director(owner.username, 1,
            { requestId: 'director-one-snapshot' });
        const directorCreator = director.creators.find(row => row.username === creator.username);
        assert.equal(directorCreator.displayName, `Private ${creator.username}`);
        assert.equal(directorCreator.profileVisibility, 'owner');
        const directorSequences = directorCreator.interaction.recentHistory.map(event => event.sequence);
        assert.ok(directorSequences.includes(ownerVisibleEvent.sequence));
        assert.ok(!directorSequences.includes(privateCreatorEvent.sequence));
        assert.ok(!directorSequences.includes(privateSystemEvent.sequence));
        assert.equal(directorCreator.interaction.lastSequence, ownerVisibleEvent.sequence,
            'Director visible high-water must not advance across creator/system-only events');
        const ownerAuditAfter = Number((await database.pool.query(`SELECT COUNT(*) count
            FROM creator_sensitive_read_audit WHERE actor_user_id=$1 AND access_kind='owner_profile'`,
        [ownerId])).rows[0].count);
        assert.equal(ownerAuditAfter - ownerAuditBefore, director.creators.length,
            'each Director profile row must receive exactly one audit in its locked snapshot');

        await database.pool.query(`INSERT INTO creator_quiet_hours(
            user_id,weekday,start_minute,end_minute,enabled
        ) VALUES($1,1,600,900,TRUE)`, [creatorId]);
        const quiet = await liveService.send(owner.username, {
            commandId: uuid(), creatorUsername: creator.username,
            interactionId: opened.interaction.id, expectedRevision: revision,
            itemType: 'nudge', templateKey: 'nudge.one-breath'
        });
        revision = quiet.revision;
        assert.equal(quiet.item.payload.delivery, 'persistent_inbox_no_push');
        assert.equal(fanout.at(-1).audience, 'owner');
        const durableQuiet = await database.pool.query(`SELECT item.id,inbox.id inbox_id
            FROM live_interaction_items item JOIN creator_inbox_messages inbox
              ON (inbox.metadata->>'itemId')::BIGINT=item.id
            WHERE item.id=$1`, [quiet.item.id]);
        assert.equal(durableQuiet.rowCount, 1);
        await database.pool.query('DELETE FROM creator_quiet_hours WHERE user_id=$1', [creatorId]);

        const reported = await liveService.report(creator.username, {
            commandId: uuid(), interactionId: opened.interaction.id, expectedRevision: revision,
            itemId: quiet.item.id, reasonCode: 'harassment', detail: 'owner-only private evidence'
        }, { requestId: 'creator-report' });
        assert.equal(reported.status, 'reported');
        const frozen = (await database.pool.query(`SELECT room.status,
            bool_and(member.member_status='left') members_frozen
            FROM live_interactions room JOIN live_interaction_members member ON member.interaction_id=room.id
            WHERE room.id=$1 GROUP BY room.status`, [opened.interaction.id])).rows[0];
        assert.deepEqual(frozen, { status: 'reported', members_frozen: true });

        const ownerReports = await liveService.reportsForActor(owner.username,
            { includeEvidence: false }, { requestId: 'owner-redacted-report' });
        assert.equal(ownerReports[0].detail, null);
        assert.equal(ownerReports[0].reasonCode, null);
        const moderatorReports = await liveService.reportsForActor(moderator.username,
            { includeEvidence: true }, { requestId: 'moderator-evidence-read' });
        assert.equal(moderatorReports[0].detail, 'owner-only private evidence');
        const lateRoomId = Number((await database.pool.query(`INSERT INTO live_interactions(
            interaction_key,creator_user_id,owner_user_id,status
        ) VALUES($1,$2,$3,'reported') RETURNING id`, [uuid(), creatorId, lateAuthorityId])).rows[0].id);
        const lateReportId = Number((await database.pool.query(`INSERT INTO live_interaction_reports(
            report_key,interaction_id,reporter_user_id,reason_code,status
        ) VALUES($1,$2,$3,'privacy','open') RETURNING id`, [uuid(), lateRoomId, creatorId])).rows[0].id);
        await assertSensitiveAuditDoesNotDeadlockAccountAuthority(database.pool, liveRepository, {
            ownerId: lateAuthorityId,
            ownerUsername: lateAuthority.username,
            creatorId,
            creatorUsername: creator.username,
            authorityLabel: 'live report moderation',
            lockAccountPair: client => liveRepository.lockModerationContext(client, {
                interactionId: lateRoomId,
                reportId: lateReportId,
                moderatorUsername: moderator.username
            })
        });
        await assert.rejects(liveService.reportsForActor(revoked.username, { includeEvidence: true }),
            error => error.code === 'LIVE_INDEPENDENT_MODERATOR_REQUIRED');
        await assert.rejects(liveService.moderate(owner.username, {
            commandId: uuid(), interactionId: opened.interaction.id,
            expectedRevision: reported.revision, reportId: moderatorReports[0].id, resolution: 'resolved'
        }), error => error.code === 'LIVE_INDEPENDENT_MODERATOR_REQUIRED');
        await assert.rejects(database.pool.query(`UPDATE live_interaction_reports SET status='resolved',
            reviewer_user_id=(SELECT id FROM users WHERE username=$2) WHERE id=$1`,
        [moderatorReports[0].id, owner.username]), error => error.code === 'P0001');
        const moderated = await liveService.moderate(moderator.username, {
            commandId: uuid(), interactionId: opened.interaction.id,
            expectedRevision: reported.revision, reportId: moderatorReports[0].id, resolution: 'resolved'
        }, { requestId: 'moderator-resolution' });
        assert.equal(moderated.reportStatus, 'resolved');
        await assert.rejects(liveService.open(owner.username, {
            commandId: uuid(), creatorUsername: creator.username
        }), error => error.code === 'LIVE_PAIR_BLOCKED');
        const reconsented = await liveService.reconsent(creator.username, {
            commandId: uuid(), interactionId: opened.interaction.id,
            expectedRevision: moderated.revision, reportId: moderatorReports[0].id
        });
        assert.equal(reconsented.reconsented, true);
        assert.ok((await liveService.open(owner.username, {
            commandId: uuid(), creatorUsername: creator.username
        })).interaction.id > opened.interaction.id);

        const ownerLock = await database.pool.connect();
        await ownerLock.query('BEGIN');
        await ownerLock.query('UPDATE users SET deactivated=TRUE WHERE id=$1', [ownerId]);
        let directorRaceSettled = false;
        const directorRace = liveService.director(owner.username, 1,
            { requestId: 'director-owner-revocation-race' })
            .then(value => ({ value }), error => ({ error }))
            .finally(() => { directorRaceSettled = true; });
        await delay(150);
        assert.equal(directorRaceSettled, false,
            'Director snapshot did not wait for the configured-owner revocation lock');
        await ownerLock.query('COMMIT');
        ownerLock.release();
        assert.equal((await directorRace).error?.code, 'LIVE_OWNER_REQUIRED',
            'revoked configured owner must not receive a post-revocation snapshot');

        const readAudit = await database.pool.query(`SELECT id,actor_username,access_kind,decision,fields
            FROM creator_sensitive_read_audit ORDER BY id`);
        assert.ok(readAudit.rows.some(row => row.actor_username === owner.username
            && row.access_kind === 'owner_profile' && row.decision === 'granted'));
        assert.ok(readAudit.rows.some(row => row.actor_username === ordinary.username
            && row.access_kind === 'owner_profile' && row.decision === 'redacted'));
        assert.ok(readAudit.rows.some(row => row.actor_username === owner.username
            && row.access_kind === 'moderation_evidence' && row.decision === 'redacted'));
        assert.ok(readAudit.rows.some(row => row.actor_username === moderator.username
            && row.access_kind === 'moderation_evidence' && row.decision === 'granted'));
        await assert.rejects(database.pool.query(`UPDATE creator_sensitive_read_audit
            SET decision='redacted' WHERE id=$1`, [readAudit.rows[0].id]),
        error => error.code === 'P0001');
        const migration = await database.pool.query(`SELECT status FROM minimal_games_schema_migrations
            WHERE filename='add_streamer_security_communication_privacy.sql'`);
        assert.equal(migration.rows[0]?.status, 'applied');
        assert.equal((await database.pool.query(`SELECT to_regclass(
            'public.creator_sensitive_read_audit') relation`)).rows[0].relation,
        'creator_sensitive_read_audit');
        console.log('live privacy PostgreSQL: ACL redaction, read-lock race, durable quiet delivery, game block, independent moderation, and reconsent passed');
    } finally {
        await database.close();
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
