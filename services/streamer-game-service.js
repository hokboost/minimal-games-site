'use strict';

const crypto = require('node:crypto');
const { stableStringify } = require('../lib/idempotency');
const packs = require('../content/streamer-world/games');
const constellation = require('../domain/constellation-repair/engine');
const signal = require('../domain/signal-duet/engine');
const mystery = require('../domain/mystery-board/engine');
const weaver = require('../domain/story-weaver/engine');
const crafting = require('../domain/studio-crafting/engine');
const meteor = require('../domain/meteor-defense/engine');
const maze = require('../domain/dream-maze/engine');
const bingo = require('../domain/broadcast-bingo/engine');
const echo = require('../domain/echo-memory/engine');
const prediction = require('../domain/keeper-prediction/engine');
const { DIFFICULTIES, MODES, assertKeys } = require('../domain/streamer-games/shared');
const { dailyCalendarWindow } = require('../domain/streamer-games/daily-calendar');
const { sourceGrantForEvent } = require('../domain/rewards/source-grant-policy');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GAME_IDS = Object.freeze(Object.keys(packs));
const ENGINE_REGISTRY = Object.freeze({
    'constellation-v1': constellation,
    'constellation-v2': constellation,
    'signal-v1': signal,
    'signal-v2': signal,
    'mystery-v1': mystery,
    'mystery-v2': mystery,
    'weaver-v1': weaver,
    'weaver-v2': weaver,
    'crafting-v1': crafting,
    'crafting-v2': crafting,
    'meteor-v1': meteor,
    'meteor-v2': meteor,
    'maze-v1': maze,
    'maze-v2': maze,
    'bingo-v1': bingo,
    'bingo-v2': bingo,
    'echo-v1': echo,
    'echo-v2': echo,
    'prediction-v1': prediction,
    'prediction-v2': prediction
});

class StreamerGameServiceError extends Error {
    constructor(code, status, message) {
        super(message);
        this.name = 'StreamerGameServiceError';
        this.code = code;
        this.status = status;
    }
}

function hash(value) {
    return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function validateUuid(value, field) {
    if (typeof value !== 'string' || !UUID.test(value)) throw new StreamerGameServiceError('INVALID_INPUT', 400, `Invalid ${field}`);
    return value;
}

function validateStart(raw, expectedGameId) {
    const value = assertKeys(raw, ['commandId', 'gameId', 'challengeId', 'difficulty', 'mode'], 'start command');
    validateUuid(value.commandId, 'commandId');
    if (value.gameId !== expectedGameId || !GAME_IDS.includes(value.gameId)) throw new StreamerGameServiceError('INVALID_GAME', 400, 'Unknown game');
    if (!DIFFICULTIES.includes(value.difficulty) || !MODES.includes(value.mode)) throw new StreamerGameServiceError('INVALID_INPUT', 400, 'Invalid difficulty or mode');
    if (typeof value.challengeId !== 'string' || !/^[a-z][a-z0-9-]{2,79}$/.test(value.challengeId)) throw new StreamerGameServiceError('INVALID_INPUT', 400, 'Invalid challenge');
    return value;
}

function validateAction(raw, expectedGameId) {
    const value = assertKeys(raw, ['commandId', 'gameId', 'runId', 'expectedRevision', 'action'], 'action command');
    validateUuid(value.commandId, 'commandId');
    validateUuid(value.runId, 'runId');
    if (value.gameId !== expectedGameId || !GAME_IDS.includes(value.gameId)) throw new StreamerGameServiceError('INVALID_GAME', 400, 'Unknown game');
    if (!Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0 || value.expectedRevision > 100000) throw new StreamerGameServiceError('INVALID_REVISION', 400, 'Invalid revision');
    if (!value.action || typeof value.action !== 'object' || Array.isArray(value.action)) throw new StreamerGameServiceError('INVALID_INPUT', 400, 'Invalid action');
    return value;
}

function validateTrustedBingoEvent(raw, pack) {
    const value = assertKeys(raw, ['sourceType', 'sourceEventId', 'username', 'eventKey', 'payload'], 'trusted bingo event');
    if (!['admin_confirmed_live', 'server_observed_live', 'reviewed_evidence'].includes(value.sourceType)) {
        throw new StreamerGameServiceError('GAME_TRUSTED_SOURCE_REJECTED', 400, 'Untrusted event source');
    }
    if (typeof value.sourceEventId !== 'string' || !/^[A-Za-z0-9:_.-]{8,160}$/.test(value.sourceEventId)
        || typeof value.username !== 'string' || value.username.length > 100) {
        throw new StreamerGameServiceError('INVALID_INPUT', 400, 'Invalid trusted event identity');
    }
    if (!pack.safeEventKinds.some(([key]) => key === value.eventKey)) {
        throw new StreamerGameServiceError('GAME_TRUSTED_EVENT_REJECTED', 400, 'Event is not on the safe allowlist');
    }
    if (!value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)
        || Buffer.byteLength(stableStringify(value.payload), 'utf8') > 2048) {
        throw new StreamerGameServiceError('INVALID_INPUT', 400, 'Invalid trusted event payload');
    }
    return value;
}

function accountAvailable(account) {
    return Boolean(account && account.authorized === true && account.deactivated !== true
        && account.account_locked !== true);
}

class StreamerGameService {
    constructor({ repository, liveRepository = null, questV2Service = null, achievementService = null,
        rewardGrantIntentWriter = null, ownerUsername = null,
        consentCoordinator = null, publish = async () => {}, clock = () => new Date(), engines = ENGINE_REGISTRY,
        gamePacks = packs }) {
        if (!repository?.withTransaction) throw new TypeError('StreamerGameService requires repository');
        this.repository = repository;
        this.liveRepository = liveRepository;
        this.questV2Service = questV2Service;
        this.achievementService = achievementService;
        this.rewardGrantIntentWriter = rewardGrantIntentWriter;
        this.ownerUsername = ownerUsername;
        this.consentCoordinator = consentCoordinator;
        this.publish = publish;
        this.clock = clock;
        this.engines = engines;
        this.packs = gamePacks;
        this.versionIds = new Map();
        this.validateCatalog();
    }

    validateCatalog() {
        const localized = new Set();
        const minimums = {
            'constellation-repair':30,
            'signal-duet':40,
            'mystery-board':20,
            'story-weaver':30,
            'studio-crafting':80,
            'meteor-defense':25,
            'dream-maze':20,
            'broadcast-bingo':20,
            'echo-memory':50,
            'keeper-prediction':20
        };
        for (const [gameId, pack] of Object.entries(this.packs)) {
            if (pack.gameId !== gameId || pack.challenges.length < minimums[gameId] || !this.engines[pack.version]) throw new TypeError('Invalid streamer game pack');
            for (const challenge of pack.challenges) {
                if (!challenge.titleZh || !challenge.titleEn || !challenge.briefZh || !challenge.briefEn) throw new TypeError('Incomplete localized game content');
                for (const text of [challenge.titleZh, challenge.titleEn, challenge.briefZh, challenge.briefEn]) {
                    if (localized.has(text)) throw new TypeError('Duplicate streamer game prose');
                    localized.add(text);
                }
            }
        }
        if (this.packs['studio-crafting'].collections.length < 12
            || this.packs['dream-maze'].roomLibrary.length < 100
            || this.packs['dream-maze'].eventDefinitions.length < 30
            || this.packs['broadcast-bingo'].safeEventKinds.length < 120
            || this.packs['keeper-prediction'].promptCards.length < 200) {
            throw new TypeError('Streamer game content minimum is incomplete');
        }
    }

    async ensureCatalog() {
        await this.repository.withTransaction(async client => {
            for (const pack of Object.values(this.packs)) {
                const contentHash = hash(pack);
                const id = await this.repository.seedVersion(client, pack, contentHash);
                this.versionIds.set(`${pack.gameId}:${pack.version}`, id);
            }
        });
    }

    versionFor(gameId, run = null) {
        const pack = run?.contentSnapshot || this.packs[gameId];
        const version = run?.configVersion || pack?.version;
        const engine = this.engines[version];
        if (!pack || pack.gameId !== gameId || !engine || (run && hash(pack) !== run.contentHash)) {
            throw new StreamerGameServiceError('GAME_VERSION_UNAVAILABLE', 409, 'Bound game version is unavailable');
        }
        return { pack, version, engine, contentHash: hash(pack) };
    }

    replay(existing, semanticHash) {
        if (!existing) return null;
        if (existing.semantic_hash !== semanticHash) throw new StreamerGameServiceError('GAME_COMMAND_COLLISION', 409, 'Command identity collision');
        return existing.response_body;
    }

    coopSecurity() {
        if (!this.consentCoordinator) {
            throw new StreamerGameServiceError('GAME_COOP_SECURITY_UNAVAILABLE', 503,
                'Cooperative consent validation is unavailable');
        }
        return this.consentCoordinator;
    }

    identityRun(identity) {
        return {
            id: identity.id,
            gameId: identity.game_id,
            mode: identity.mode,
            status: identity.status,
            creatorUserId: Number(identity.creator_user_id),
            creatorUsername: identity.creator_username,
            ownerUserId: identity.owner_user_id === null ? null : Number(identity.owner_user_id),
            ownerUsername: identity.owner_username,
            liveInteractionId: identity.live_interaction_id === null ? null : Number(identity.live_interaction_id)
        };
    }

    consentRevokedError(reason) {
        return new StreamerGameServiceError('GAME_COOP_CONSENT_REVOKED', 409,
            `Cooperative consent is no longer active (${reason})`);
    }

    coopBoundaryError(consent) {
        return consent?.withdrawal === false
            ? new StreamerGameServiceError('GAME_COOP_WINDOW_CLOSED', 409,
                `Cooperative interaction is outside the creator's live window (${consent.reason})`)
            : this.consentRevokedError(consent?.reason || 'membership_inactive');
    }

    async start(username, expectedGameId, raw, context = {}) {
        const command = validateStart(raw, expectedGameId);
        const semanticHash = hash({ type: 'start', ...command });
        let result;
        try {
            result = await this.repository.withTransaction(async client => {
            const accounts = await this.repository.lockAccounts(client, [username, command.mode === 'coop' ? this.ownerUsername : null]);
            const creator = accounts.get(username);
            if (!accountAvailable(creator)) throw new StreamerGameServiceError('GAME_ACCOUNT_UNAVAILABLE', 403, 'Creator account unavailable');
            const existing = await this.repository.findStartCommand(client, creator.id, command.gameId, command.commandId);
            const replay = this.replay(existing, semanticHash);
            if (replay) return { body: replay };
            const startedAt = this.clock();
            let dailyCalendar = null;
            if (command.gameId === 'dream-maze') {
                try {
                    dailyCalendar = dailyCalendarWindow(startedAt, creator.timezone);
                } catch {
                    throw new StreamerGameServiceError('GAME_CREATOR_TIMEZONE_REQUIRED', 409,
                        'A valid creator timezone is required for the daily maze');
                }
            }
            const serverDateKey = dailyCalendar?.calendarKey || startedAt.toISOString().slice(0, 10);
            let owner = null;
            let liveInteractionId = null;
            if (command.mode === 'coop') {
                const security = this.coopSecurity();
                owner = accounts.get(this.ownerUsername);
                if (!this.ownerUsername || !accountAvailable(owner) || owner.is_admin !== true) throw new StreamerGameServiceError('GAME_OWNER_UNAVAILABLE', 409, 'Configured owner unavailable');
                if (creator.live_interaction_opt_in !== true) throw new StreamerGameServiceError('GAME_COOP_CONSENT_REQUIRED', 403, 'Live interaction consent required');
                liveInteractionId = await this.repository.findActiveLiveRoom(client, creator.id, owner.id);
                if (!liveInteractionId) throw new StreamerGameServiceError('GAME_LIVE_ROOM_REQUIRED', 409, 'Active relay room required');
                const consent = await security.validateLockedRun(client, {
                    id: null,
                    gameId: command.gameId,
                    mode: 'coop',
                    status: 'active',
                    creatorUserId: Number(creator.id),
                    creatorUsername: creator.username,
                    ownerUserId: Number(owner.id),
                    ownerUsername: owner.username,
                    liveInteractionId
                }, accounts);
                if (!consent.allowed) throw this.coopBoundaryError(consent);
            }
            if (dailyCalendar && await this.repository.findOverlappingDailyMazeRun(client, creator.id,
                dailyCalendar.windowStart, dailyCalendar.windowEnd)) {
                throw new StreamerGameServiceError('GAME_DAILY_ALREADY_PLAYED', 409,
                    'Today\'s deterministic maze has already been started');
            }
            const active = await this.repository.findActiveCreatorRun(client, creator.id, command.gameId);
            if (active) throw new StreamerGameServiceError('GAME_ACTIVE_RUN_EXISTS', 409,
                'Resume the active run before starting another');

            const version = this.versionFor(command.gameId);
            version.engine.challengeById(command.challengeId, version.pack);
            const state = version.engine.createState({ ...command, serverStartedAtMs: startedAt.getTime(),
                serverDateKey, creatorUsername: creator.username, contentPack: version.pack });
            const runId = crypto.randomUUID();
            const versionId = this.versionIds.get(`${command.gameId}:${version.version}`);
            if (!versionId) throw new StreamerGameServiceError('GAME_CATALOG_NOT_READY', 503, 'Game catalog not initialized');
            const run = await this.repository.createRun(client, {
                id: runId, gameId: command.gameId, configVersion: version.version, versionId,
                creatorUserId: Number(creator.id), creatorUsername: creator.username,
                ownerUserId: owner ? Number(owner.id) : null, ownerUsername: owner?.username || null,
                liveInteractionId, mode: command.mode, difficulty: command.difficulty, state,
                dailyKey: dailyCalendar?.calendarKey || null,
                dailyTimezone: dailyCalendar?.timezone || null,
                dailyWindowStart: dailyCalendar?.windowStart || null,
                dailyWindowEnd: dailyCalendar?.windowEnd || null
            });
            const event = await this.repository.appendEvent(client, {
                eventId: crypto.randomUUID(), runId, eventType: 'game.run.started', actorUserId: Number(creator.id),
                stateRevision: 0, actionSummary: { gameId: command.gameId, challengeId: command.challengeId,
                    difficulty: command.difficulty, mode: command.mode }, stateHash: hash(state)
            });
            const projection = { ...version.engine.project(state, 'creator', version.pack),
                serverNowMs: this.clock().getTime() };
            const body = { success: true, run: this.runProjection(run, 'creator', projection), event };
            let liveEvent = null;
            if (command.mode === 'coop' && this.liveRepository) {
                liveEvent = await this.liveRepository.appendEvent(client, {
                    eventId: crypto.randomUUID(), interactionId: liveInteractionId,
                    eventType: 'interaction.game_state_changed', actorType: 'creator',
                    audience: 'both',
                    actorUserId: Number(creator.id), subjectUserId: Number(creator.id),
                    correlationId: command.commandId, stateRevision: 0,
                    payload: { gameId: command.gameId, runId, revision: 0, status: 'active' }
                });
            }
            await this.repository.saveStartCommand(client, { actorUserId: Number(creator.id), gameId: command.gameId,
                commandId: command.commandId, semanticHash, runId, status: 201, body });
            await this.repository.insertAudit(client, { runId, actorUserId: Number(creator.id), action: 'streamer_game.started',
                requestId: context.requestId, details: { gameId: command.gameId, mode: command.mode } });
            await context.finalizeIdempotency?.(client, 201, body);
            return { body, liveEvent, run };
            });
        } catch (error) {
            if (error?.constraint === 'streamer_game_runs_daily_maze_idx') {
                throw new StreamerGameServiceError('GAME_DAILY_ALREADY_PLAYED', 409,
                    'Today\'s deterministic maze has already been started');
            }
            throw error;
        }
        if (result.liveEvent) {
            try {
                await this.publish(result.liveEvent, result.run, 'both');
            } catch {
                // A participant can recover the committed run through private history/state.
            }
        }
        return result.body;
    }

    runProjection(run, actorRole, state) {
        return { id: run.id, gameId: run.gameId, configVersion: run.configVersion, mode: run.mode,
            difficulty: run.difficulty, status: run.status, revision: run.revision, score: run.score,
            actorRole, creatorUsername: run.creatorUsername, relayInteractionId: run.liveInteractionId,
            partnerUsername: actorRole === 'creator' ? run.ownerUsername : run.creatorUsername,
            consentRevokedReason: run.consentRevokedReason || null,
            consentRevokedAt: run.consentRevokedAt || null,
            resumed: run.resumed === true,
            state };
    }

    async recordCompletionAchievements(client, run, nextState, context = {}) {
        const event = {
            sourceType: 'streamer_game',
            sourceEventId: `achievement-game-run:${run.id}`,
            eventType: 'game.run.completed',
            occurredAt: this.clock().toISOString(),
            payload: {
                runId: run.id,
                gameId: run.gameId,
                challengeId: nextState.challengeId,
                difficulty: run.difficulty,
                mode: run.mode,
                score: Number(nextState.score || 0),
                authoritativeScore: true,
                resumed: run.resumed === true
            }
        };
        let achievement = null;
        if (this.achievementService?.recordTrustedEvent) {
            achievement = await this.achievementService.recordTrustedEvent(
                client, run.creatorUsername, event, context
            );
        }
        const reward = sourceGrantForEvent('game', event);
        if (reward && this.rewardGrantIntentWriter?.enqueue) {
            await this.rewardGrantIntentWriter.enqueue(client, {
                ...reward,
                userId: Number(run.creatorUserId)
            });
        }
        return { event, achievement };
    }

    async action(username, expectedGameId, raw, context = {}) {
        const command = validateAction(raw, expectedGameId);
        const semanticHash = hash({ type: 'action', ...command });
        const result = await this.repository.withTransaction(async client => {
            const identity = await this.repository.readRunIdentity(client, command.runId);
            if (!identity) throw new StreamerGameServiceError('GAME_RUN_NOT_FOUND', 404, 'Game run not found');
            const identityRun = this.identityRun(identity);
            const accounts = await this.repository.lockAccounts(client,
                [identity.creator_username, identity.owner_username]);
            for (const participantUsername of [identity.creator_username, identity.owner_username].filter(Boolean)) {
                const participant = accounts.get(participantUsername);
                if (!accountAvailable(participant)) {
                    throw new StreamerGameServiceError('GAME_ACCOUNT_UNAVAILABLE', 403,
                        'Game participant unavailable');
                }
            }
            const actor = accounts.get(username);
            if (!accountAvailable(actor)) {
                throw new StreamerGameServiceError('GAME_ACCOUNT_UNAVAILABLE', 403, 'Game participant unavailable');
            }
            let consent = { allowed: true, reason: null };
            if (identityRun.mode === 'coop') {
                consent = await this.coopSecurity().validateLockedRun(client, identityRun, accounts);
            }
            const locked = await this.repository.lockRun(client, command.runId, username);
            if (!locked || locked.run.gameId !== command.gameId) throw new StreamerGameServiceError('GAME_RUN_NOT_FOUND', 404, 'Game run not found');
            const { run, actorRole, actorUserId } = locked;
            const existing = await this.repository.findCommand(client, run.id, actorUserId, command.commandId);
            if (!consent.allowed) {
                if (existing) {
                    if (existing.semantic_hash !== semanticHash) throw new StreamerGameServiceError(
                        'GAME_COMMAND_COLLISION', 409, 'Command identity collision');
                    if (['GAME_COOP_CONSENT_REVOKED', 'GAME_COOP_WINDOW_CLOSED']
                        .includes(existing.response_body?.code)) {
                        await context.finalizeIdempotency?.(client, 409, existing.response_body);
                        return { body: existing.response_body, consentError: consent };
                    }
                }
                const abandoned = consent.withdrawal === false ? null
                    : await this.coopSecurity().abandonLockedRun(client, run, consent.reason, {
                        actorUserId,
                        actorUsername: username,
                        requestId: context.requestId
                    });
                const error = this.coopBoundaryError(consent);
                const body = { success: false, code: error.code, message: error.message };
                if (!existing) {
                    await this.repository.saveCommand(client, {
                        runId: run.id,
                        actorUserId,
                        commandId: command.commandId,
                        commandType: `game.${run.gameId}.consent_rejected`,
                        semanticHash,
                        expectedRevision: command.expectedRevision,
                        eventId: abandoned?.event?.eventId || null,
                        status: 409,
                        body
                    });
                }
                await context.finalizeIdempotency?.(client, 409, body);
                return { body, consentError: consent };
            }
            const replay = this.replay(existing, semanticHash);
            if (replay) return { body: replay };
            if (run.status !== 'active') throw new StreamerGameServiceError('GAME_RUN_TERMINAL', 409, 'Game run is terminal');
            if (run.revision !== command.expectedRevision) throw new StreamerGameServiceError('GAME_REVISION_CONFLICT', 409, 'Game changed in another session');

            const version = this.versionFor(run.gameId, run);
            const serverNowMs = this.clock().getTime();
            const elapsedMs = Math.max(0, Math.min(600000, serverNowMs - Number(run.state.startedAtMs || serverNowMs)));
            let nextState;
            const abandoning = command.action.type === 'abandon';
            if (abandoning) {
                assertKeys(command.action, ['type'], 'abandon action');
                if (actorRole !== 'creator') {
                    throw new StreamerGameServiceError('GAME_ACTION_REJECTED', 403,
                        'Only the creator can end an active run');
                }
                nextState = {
                    ...run.state,
                    status: 'abandoned',
                    history: [...(run.state.history || []), {
                        type: 'abandon',
                        actorRole: 'creator'
                    }].slice(-80)
                };
            } else {
                try {
                    nextState = version.engine.applyAction(run.state, command.action,
                        { actorRole, elapsedMs, serverNowMs, contentPack: version.pack, trusted: false });
                } catch (error) {
                    throw new StreamerGameServiceError('GAME_ACTION_REJECTED', 400, error.message);
                }
            }
            const saved = await this.repository.updateRun(client, run, nextState);
            if (!saved) throw new StreamerGameServiceError('GAME_REVISION_CONFLICT', 409, 'Game changed concurrently');
            const terminal = ['completed', 'failed', 'abandoned'].includes(nextState.status);
            const event = await this.repository.appendEvent(client, {
                eventId: crypto.randomUUID(), runId: run.id,
                eventType: terminal ? `game.run.${nextState.status}` : 'game.action.committed',
                actorUserId, stateRevision: saved.revision,
                actionSummary: { actionType: command.action.type, actorRole, terminal }, stateHash: hash(nextState)
            });

            let quest = null;
            if (nextState.status === 'completed') {
                const hookPayload = { runId: run.id, gameId: run.gameId, configVersion: run.configVersion,
                    challengeId: nextState.challengeId, difficulty: run.difficulty, mode: run.mode, score: nextState.score };
                await this.repository.insertHookIntent(client, { runId: run.id, intentType: 'quest_event',
                    intentKey: `game:${run.gameId}:completed`, payload: hookPayload });
                await this.repository.insertHookIntent(client, { runId: run.id, intentType: 'story_unlock',
                    intentKey: `story:game:${run.gameId}`, payload: hookPayload });
                await this.repository.insertHookIntent(client, { runId: run.id, intentType: 'achievement_progress',
                    intentKey: `achievement:game:${run.gameId}`, payload: hookPayload });
                if (run.gameId === 'studio-crafting') {
                    const slot = nextState.roomSlots.findIndex(item => item === nextState.challengeId);
                    await this.repository.settleCraftingCollection(client, run, nextState.challengeId, slot);
                }
                if (this.questV2Service) {
                    quest = await this.questV2Service.recordInternalTrustedEvent(client, {
                        sourceType: 'streamer_game', sourceEventId: `game-run:${run.id}`, username: run.creatorUsername,
                        eventType: 'game.run.completed', occurredAt: this.clock().toISOString(), payload: hookPayload
                    }, context);
                }
                await this.recordCompletionAchievements(client, run, nextState, context);
            }

            let liveEvent = null;
            if (run.mode === 'coop' && this.liveRepository) {
                liveEvent = await this.liveRepository.appendEvent(client, {
                    eventId: crypto.randomUUID(), interactionId: run.liveInteractionId,
                    eventType: 'interaction.game_state_changed', actorType: actorRole,
                    audience: 'both',
                    actorUserId, subjectUserId: run.creatorUserId, correlationId: command.commandId,
                    stateRevision: saved.revision, payload: { gameId: run.gameId, runId: run.id,
                        revision: saved.revision, status: nextState.status }
                });
            }
            const projection = { ...version.engine.project(nextState, actorRole, version.pack), serverNowMs: this.clock().getTime() };
            const body = { success: true, run: this.runProjection(saved, actorRole, projection), event,
                ...(quest ? { quest } : {}) };
            await this.repository.saveCommand(client, { runId: run.id, actorUserId, commandId: command.commandId,
                commandType: `game.${run.gameId}.${command.action.type}`, semanticHash,
                expectedRevision: command.expectedRevision, eventId: event.eventId, status: 200, body });
            await this.repository.insertAudit(client, { runId: run.id, actorUserId, action: 'streamer_game.action',
                requestId: context.requestId, details: { gameId: run.gameId, actionType: command.action.type,
                    revision: saved.revision, terminal: nextState.status } });
            await context.finalizeIdempotency?.(client, 200, body);
            return { body, liveEvent, run: saved };
        });
        if (result.consentError) throw this.coopBoundaryError(result.consentError);
        if (result.liveEvent) {
            try {
                await this.publish(result.liveEvent, result.run, 'both');
            } catch {
                // REST state remains authoritative after commit.
            }
        }
        return result.body;
    }

    async state(username, gameId, runId = null) {
        if (!GAME_IDS.includes(gameId)) throw new StreamerGameServiceError('INVALID_GAME', 400, 'Unknown game');
        if (runId !== null) validateUuid(runId, 'runId');
        let history = await this.repository.listHistory(username, gameId, 20);
        const selectedRunId = runId || history[0]?.id || null;
        const collection = gameId === 'studio-crafting' ? await this.repository.collectionState(username) : null;
        if (!selectedRunId) {
            const available = await this.repository.withTransaction(async client =>
                accountAvailable((await this.repository.lockAccounts(client, [username])).get(username)));
            if (!available) throw new StreamerGameServiceError('GAME_ACCOUNT_UNAVAILABLE', 403,
                'Game participant unavailable');
            return { success: true, gameId, run: null, history, collection };
        }
        const checked = await this.repository.withTransaction(async client => {
            const identity = await this.repository.readRunIdentity(client, selectedRunId);
            if (!identity || identity.game_id !== gameId) return { resolved: null };
            const runIdentity = this.identityRun(identity);
            const accounts = await this.repository.lockAccounts(client,
                [identity.creator_username, identity.owner_username]);
            const actor = accounts.get(username);
            if (!accountAvailable(actor)
                || ![Number(identity.creator_user_id), Number(identity.owner_user_id)]
                    .filter(Number.isSafeInteger).includes(Number(actor.id))) {
                return { resolved: null };
            }
            let consent = { allowed: true, reason: null };
            if (runIdentity.mode === 'coop' && runIdentity.status === 'active') {
                consent = await this.coopSecurity().validateLockedRun(client, runIdentity, accounts, {
                    interactive: false
                });
            }
            const resolved = await this.repository.lockRun(client, selectedRunId, username);
            if (!resolved) return { resolved: null };
            if (!consent.allowed) {
                if (consent.withdrawal !== false) {
                    await this.coopSecurity().abandonLockedRun(client, resolved.run, consent.reason, {
                        actorUserId: Number(actor.id),
                        actorUsername: username
                    });
                }
                return { consentError: consent };
            }
            if (resolved.actorRole === 'creator' && resolved.run.status === 'active'
                && resolved.run.resumed !== true
                && typeof this.repository.markRunResumed === 'function') {
                const resumed = await this.repository.markRunResumed(client, resolved.run,
                    Number(actor.id), hash(resolved.run.state));
                if (resumed) resolved.run.resumed = true;
            }
            return { resolved };
        });
        if (checked.consentError) throw this.coopBoundaryError(checked.consentError);
        if (!checked.resolved) throw new StreamerGameServiceError('GAME_RUN_NOT_FOUND', 404,
            'Game run not found');
        history = await this.repository.listHistory(username, gameId, 20);
        const version = this.versionFor(gameId, checked.resolved.run);
        const projection = { ...version.engine.project(checked.resolved.run.state,
            checked.resolved.actorRole, version.pack), serverNowMs: this.clock().getTime() };
        return { success: true, gameId, run: this.runProjection(checked.resolved.run,
            checked.resolved.actorRole, projection), history, collection };
    }

    async authorizeSocketSubscription(username, input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
            throw new StreamerGameServiceError('INVALID_INPUT', 400, 'Invalid game subscription');
        }
        const interactionId = Number(input.interactionId);
        if (!Number.isSafeInteger(interactionId) || interactionId < 1
            || !GAME_IDS.includes(input.gameId)) {
            throw new StreamerGameServiceError('INVALID_INPUT', 400, 'Invalid game subscription');
        }
        const runId = validateUuid(input.runId, 'runId');
        const checked = await this.repository.withTransaction(async client => {
            const identity = await this.repository.readRunIdentity(client, runId);
            if (!identity || identity.game_id !== input.gameId
                || Number(identity.live_interaction_id) !== interactionId
                || identity.mode !== 'coop') {
                return { missing: true };
            }
            const runIdentity = this.identityRun(identity);
            const accounts = await this.repository.lockAccounts(client,
                [identity.creator_username, identity.owner_username]);
            const actor = accounts.get(username);
            if (!accountAvailable(actor)) return { missing: true };
            const consent = await this.coopSecurity().validateLockedRun(client, runIdentity, accounts);
            const locked = await this.repository.lockRun(client, runId, username);
            if (!locked) return { missing: true };
            if (!consent.allowed) {
                if (consent.withdrawal !== false) {
                    await this.coopSecurity().abandonLockedRun(client, locked.run, consent.reason, {
                        actorUserId: Number(actor.id), actorUsername: username
                    });
                }
                return { consentError: consent };
            }
            if (locked.run.status !== 'active') {
                throw new StreamerGameServiceError('GAME_RUN_TERMINAL', 409,
                    'Game run is terminal');
            }
            return { subscription: { role: locked.actorRole, userId: Number(actor.id),
                interactionId, gameId: input.gameId, runId } };
        });
        if (checked.consentError) throw this.coopBoundaryError(checked.consentError);
        if (checked.missing) throw new StreamerGameServiceError('GAME_RUN_NOT_FOUND', 404,
            'Game run not found');
        return checked.subscription;
    }

    async recordTrustedBingoEvent(raw, context = {}) {
        if (!this.ownerUsername || context.actorUsername !== this.ownerUsername) {
            throw new StreamerGameServiceError('GAME_OWNER_REQUIRED', 403,
                'Only the configured owner can confirm a live bingo event');
        }
        const command = validateTrustedBingoEvent(raw, this.packs['broadcast-bingo']);
        const semanticHash = hash(command);
        const result = await this.repository.withTransaction(async client => {
            const accounts = await this.repository.lockAccounts(client, [command.username, context.actorUsername]);
            const creator = accounts.get(command.username);
            const owner = accounts.get(context.actorUsername);
            if (!accountAvailable(creator)) {
                throw new StreamerGameServiceError('GAME_ACCOUNT_UNAVAILABLE', 403, 'Creator account unavailable');
            }
            if (!accountAvailable(owner) || owner.is_admin !== true) {
                throw new StreamerGameServiceError('GAME_OWNER_REQUIRED', 403,
                    'Configured owner account unavailable');
            }
            const existing = await this.repository.findTrustedGameEvent(client, command.sourceType, command.sourceEventId);
            if (existing) {
                if (existing.semantic_hash !== semanticHash) {
                    throw new StreamerGameServiceError('GAME_TRUSTED_EVENT_COLLISION', 409,
                        'Trusted event identity collision');
                }
                const status = Number(existing.response_status || 200);
                await context.finalizeIdempotency?.(client, status, existing.response_body);
                return status >= 400 ? {
                    consentError: {
                        reason: existing.response_body?.reason || 'membership_inactive',
                        withdrawal: existing.response_body?.code !== 'GAME_COOP_WINDOW_CLOSED'
                    },
                    body: existing.response_body
                } : existing.response_body;
            }
            const active = await this.repository.findActiveCreatorRun(client, creator.id,
                'broadcast-bingo', { lock: false });
            if (!active) {
                const body = { success: true, matched: false, runId: null };
                await this.repository.insertTrustedGameEvent(client, { creatorUserId: creator.id, ...command,
                    semanticHash, runId: null, status: 200, body });
                await context.finalizeIdempotency?.(client, 200, body);
                return body;
            }
            const identity = await this.repository.readRunIdentity(client, active.id);
            if (!identity) throw new StreamerGameServiceError('GAME_RUN_NOT_FOUND', 404,
                'Game run not found');
            const runIdentity = this.identityRun(identity);
            let consent = { allowed: true, reason: null };
            if (runIdentity.mode === 'coop') {
                consent = await this.coopSecurity().validateLockedRun(client, runIdentity, accounts);
            }
            const locked = await this.repository.lockRun(client, active.id, command.username);
            if (!locked || locked.run.status !== 'active') {
                const body = { success: true, matched: false, runId: null };
                await this.repository.insertTrustedGameEvent(client, { creatorUserId: creator.id, ...command,
                    semanticHash, runId: null, status: 200, body });
                await context.finalizeIdempotency?.(client, 200, body);
                return body;
            }
            const { run, actorUserId } = locked;
            if (!consent.allowed) {
                if (consent.withdrawal !== false) {
                    await this.coopSecurity().abandonLockedRun(client, run, consent.reason, {
                        actorUserId: Number(owner.id),
                        actorUsername: context.actorUsername,
                        requestId: context.requestId
                    });
                }
                const error = this.coopBoundaryError(consent);
                const body = { success: false, code: error.code, reason: consent.reason,
                    message: error.message };
                await this.repository.insertTrustedGameEvent(client, { creatorUserId: creator.id, ...command,
                    semanticHash, runId: run.id, status: 409, body });
                await context.finalizeIdempotency?.(client, 409, body);
                return { consentError: consent, body };
            }
            const version = this.versionFor(run.gameId, run);
            const nextState = version.engine.applyAction(run.state, { type: 'trusted_event',
                eventKey: command.eventKey, sourceEventId: command.sourceEventId },
            { actorRole: 'creator', trusted: true, contentPack: version.pack });
            const saved = await this.repository.updateRun(client, run, nextState);
            if (!saved) throw new StreamerGameServiceError('GAME_REVISION_CONFLICT', 409, 'Game changed concurrently');
            const event = await this.repository.appendEvent(client, { eventId: crypto.randomUUID(), runId: run.id,
                eventType: nextState.status === 'completed' ? 'game.run.completed' : 'game.action.committed',
                actorUserId, stateRevision: saved.revision,
                actionSummary: { actionType: 'trusted_event', sourceType: command.sourceType }, stateHash: hash(nextState) });
            if (nextState.status === 'completed') {
                const hookPayload = { runId: run.id, gameId: run.gameId, configVersion: run.configVersion,
                    challengeId: nextState.challengeId, difficulty: run.difficulty, mode: run.mode, score: nextState.score };
                for (const [intentType, intentKey] of [['quest_event', 'game:broadcast-bingo:completed'],
                    ['story_unlock', 'story:game:broadcast-bingo'], ['achievement_progress', 'achievement:game:broadcast-bingo']]) {
                    await this.repository.insertHookIntent(client, { runId: run.id, intentType, intentKey, payload: hookPayload });
                }
                if (this.questV2Service) {
                    await this.questV2Service.recordInternalTrustedEvent(client, {
                        sourceType: 'streamer_game', sourceEventId: `game-run:${run.id}`,
                        username: run.creatorUsername, eventType: 'game.run.completed',
                        occurredAt: this.clock().toISOString(), payload: hookPayload
                    }, context);
                }
                await this.recordCompletionAchievements(client, run, nextState, context);
            }
            await this.repository.insertAudit(client, { runId: run.id, actorUserId,
                action: 'streamer_game.trusted_bingo_event', requestId: context.requestId,
                details: { sourceType: command.sourceType, eventKey: command.eventKey, revision: saved.revision } });
            const body = { success: true, matched: true, runId: run.id, revision: saved.revision,
                status: nextState.status, eventId: event.eventId };
            await this.repository.insertTrustedGameEvent(client, { creatorUserId: creator.id, ...command,
                semanticHash, runId: run.id, status: 200, body });
            await context.finalizeIdempotency?.(client, 200, body);
            return body;
        });
        if (result?.consentError) throw this.coopBoundaryError(result.consentError);
        return result;
    }
}

module.exports = { ENGINE_REGISTRY, GAME_IDS, StreamerGameService, StreamerGameServiceError, hash,
    validateAction, validateStart, validateTrustedBingoEvent };
