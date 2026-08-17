'use strict';

const crypto = require('node:crypto');
const { stableStringify } = require('../lib/idempotency');
const packs = require('../content/streamer-world/games/batch-one');
const constellation = require('../domain/constellation-repair/engine');
const signal = require('../domain/signal-duet/engine');
const mystery = require('../domain/mystery-board/engine');
const weaver = require('../domain/story-weaver/engine');
const crafting = require('../domain/studio-crafting/engine');
const { DIFFICULTIES, MODES, assertKeys } = require('../domain/streamer-games/shared');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GAME_IDS = Object.freeze(Object.keys(packs));
const ENGINE_REGISTRY = Object.freeze({
    'constellation-v1': constellation,
    'signal-v1': signal,
    'mystery-v1': mystery,
    'weaver-v1': weaver,
    'crafting-v1': crafting
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

class StreamerGameService {
    constructor({ repository, liveRepository = null, questV2Service = null, ownerUsername = null,
        publish = async () => {}, clock = () => new Date(), engines = ENGINE_REGISTRY, gamePacks = packs }) {
        if (!repository?.withTransaction) throw new TypeError('StreamerGameService requires repository');
        this.repository = repository;
        this.liveRepository = liveRepository;
        this.questV2Service = questV2Service;
        this.ownerUsername = ownerUsername;
        this.publish = publish;
        this.clock = clock;
        this.engines = engines;
        this.packs = gamePacks;
        this.versionIds = new Map();
        this.validateCatalog();
    }

    validateCatalog() {
        const localized = new Set();
        for (const [gameId, pack] of Object.entries(this.packs)) {
            if (pack.gameId !== gameId || pack.challenges.length < 20 || !this.engines[pack.version]) throw new TypeError('Invalid streamer game pack');
            for (const challenge of pack.challenges) {
                if (!challenge.titleZh || !challenge.titleEn || !challenge.briefZh || !challenge.briefEn) throw new TypeError('Incomplete localized game content');
                for (const text of [challenge.titleZh, challenge.titleEn, challenge.briefZh, challenge.briefEn]) {
                    if (localized.has(text)) throw new TypeError('Duplicate streamer game prose');
                    localized.add(text);
                }
            }
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

    async start(username, expectedGameId, raw, context = {}) {
        const command = validateStart(raw, expectedGameId);
        const semanticHash = hash({ type: 'start', ...command });
        const result = await this.repository.withTransaction(async client => {
            const accounts = await this.repository.lockAccounts(client, [username, command.mode === 'coop' ? this.ownerUsername : null]);
            const creator = accounts.get(username);
            if (!creator || creator.authorized !== true || creator.deactivated === true) throw new StreamerGameServiceError('GAME_ACCOUNT_UNAVAILABLE', 403, 'Creator account unavailable');
            const existing = await this.repository.findStartCommand(client, creator.id, command.gameId, command.commandId);
            const replay = this.replay(existing, semanticHash);
            if (replay) return { body: replay };
            const active = await this.repository.findActiveCreatorRun(client, creator.id, command.gameId);
            if (active) throw new StreamerGameServiceError('GAME_ACTIVE_RUN_EXISTS', 409,
                'Resume the active run before starting another');

            let owner = null;
            let liveInteractionId = null;
            if (command.mode === 'coop') {
                owner = accounts.get(this.ownerUsername);
                if (!this.ownerUsername || !owner || owner.is_admin !== true || owner.authorized !== true || owner.deactivated === true) throw new StreamerGameServiceError('GAME_OWNER_UNAVAILABLE', 409, 'Configured owner unavailable');
                if (creator.live_interaction_opt_in !== true) throw new StreamerGameServiceError('GAME_COOP_CONSENT_REQUIRED', 403, 'Live interaction consent required');
                liveInteractionId = await this.repository.findActiveLiveRoom(client, creator.id, owner.id);
                if (!liveInteractionId) throw new StreamerGameServiceError('GAME_LIVE_ROOM_REQUIRED', 409, 'Active relay room required');
            }

            const version = this.versionFor(command.gameId);
            version.engine.challengeById(command.challengeId, version.pack);
            const startedAt = this.clock();
            const state = version.engine.createState({ ...command, serverStartedAtMs: startedAt.getTime(), contentPack: version.pack });
            const runId = crypto.randomUUID();
            const versionId = this.versionIds.get(`${command.gameId}:${version.version}`);
            if (!versionId) throw new StreamerGameServiceError('GAME_CATALOG_NOT_READY', 503, 'Game catalog not initialized');
            const run = await this.repository.createRun(client, {
                id: runId, gameId: command.gameId, configVersion: version.version, versionId,
                creatorUserId: Number(creator.id), creatorUsername: creator.username,
                ownerUserId: owner ? Number(owner.id) : null, ownerUsername: owner?.username || null,
                liveInteractionId, mode: command.mode, difficulty: command.difficulty, state
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
            partnerUsername: actorRole === 'creator' ? run.ownerUsername : run.creatorUsername, state };
    }

    async action(username, expectedGameId, raw, context = {}) {
        const command = validateAction(raw, expectedGameId);
        const semanticHash = hash({ type: 'action', ...command });
        const result = await this.repository.withTransaction(async client => {
            const identity = await this.repository.readRunIdentity(client, command.runId);
            if (!identity) throw new StreamerGameServiceError('GAME_RUN_NOT_FOUND', 404, 'Game run not found');
            const accounts = await this.repository.lockAccounts(client,
                [identity.creator_username, identity.owner_username]);
            for (const participantUsername of [identity.creator_username, identity.owner_username].filter(Boolean)) {
                const participant = accounts.get(participantUsername);
                if (!participant || participant.authorized !== true || participant.deactivated === true) {
                    throw new StreamerGameServiceError('GAME_ACCOUNT_UNAVAILABLE', 403,
                        'Game participant unavailable');
                }
            }
            const actor = accounts.get(username);
            if (!actor || actor.authorized !== true || actor.deactivated === true) {
                throw new StreamerGameServiceError('GAME_ACCOUNT_UNAVAILABLE', 403, 'Game participant unavailable');
            }
            const locked = await this.repository.lockRun(client, command.runId, username);
            if (!locked || locked.run.gameId !== command.gameId) throw new StreamerGameServiceError('GAME_RUN_NOT_FOUND', 404, 'Game run not found');
            const { run, actorRole, actorUserId } = locked;
            const existing = await this.repository.findCommand(client, run.id, actorUserId, command.commandId);
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
                        { actorRole, elapsedMs, serverNowMs, contentPack: version.pack });
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
            }

            let liveEvent = null;
            if (run.mode === 'coop' && this.liveRepository) {
                liveEvent = await this.liveRepository.appendEvent(client, {
                    eventId: crypto.randomUUID(), interactionId: run.liveInteractionId,
                    eventType: 'interaction.game_state_changed', actorType: actorRole,
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
        let resolved = runId ? await this.repository.readRun(runId, username) : null;
        const history = await this.repository.listHistory(username, gameId, 20);
        if (!resolved && history[0]) resolved = await this.repository.readRun(history[0].id, username);
        const collection = gameId === 'studio-crafting' ? await this.repository.collectionState(username) : null;
        if (!resolved) return { success: true, gameId, run: null, history, collection };
        const version = this.versionFor(gameId, resolved.run);
        const projection = { ...version.engine.project(resolved.run.state, resolved.actorRole, version.pack),
            serverNowMs: this.clock().getTime() };
        return { success: true, gameId, run: this.runProjection(resolved.run, resolved.actorRole,
            projection), history, collection };
    }
}

module.exports = { ENGINE_REGISTRY, GAME_IDS, StreamerGameService, StreamerGameServiceError, hash,
    validateAction, validateStart };
