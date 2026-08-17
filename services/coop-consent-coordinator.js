'use strict';

const crypto = require('node:crypto');
const { stableStringify } = require('../lib/idempotency');
const { evaluateCoopConsent } = require('../domain/streamer-games/consent');
const {
    evaluateCommunicationBoundary
} = require('./creator-communication-boundary-policy');

function stateHash(value) {
    return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

class CoopConsentCoordinator {
    constructor({ gameRepository, liveRepository, ownerUsername = null, clock = () => new Date(),
        boundaryPolicy = evaluateCommunicationBoundary }) {
        if (!gameRepository?.abandonRunForConsent || !liveRepository?.lockCoopConsent) {
            throw new TypeError('Co-op consent coordinator requires game and live repositories');
        }
        this.gameRepository = gameRepository;
        this.liveRepository = liveRepository;
        this.ownerUsername = ownerUsername;
        this.clock = clock;
        this.boundaryPolicy = boundaryPolicy;
    }

    nextAbandonedState(run, reason) {
        return {
            ...run.state,
            status: 'abandoned',
            history: [...(run.state.history || []), {
                type: 'consent_revoked',
                reason,
                at: this.clock().toISOString()
            }].slice(-80)
        };
    }

    async abandonLockedRun(client, run, reason, context = {}) {
        if (!run || run.mode !== 'coop' || run.status !== 'active') return null;
        const nextState = this.nextAbandonedState(run, reason);
        const saved = await this.gameRepository.abandonRunForConsent(client, run, nextState, reason,
            this.clock());
        if (!saved) return null;
        const event = await this.gameRepository.appendEvent(client, {
            eventId: crypto.randomUUID(),
            runId: run.id,
            eventType: 'game.run.abandoned',
            actorUserId: context.actorUserId || null,
            stateRevision: saved.revision,
            actionSummary: { actionType: 'consent_revoked', reason, automatic: true },
            stateHash: stateHash(nextState)
        });
        await this.gameRepository.insertAudit(client, {
            runId: run.id,
            actorUserId: context.actorUserId || null,
            action: 'streamer_game.consent_revoked',
            requestId: context.requestId || null,
            details: { reason, actorUsername: context.actorUsername || null,
                revision: saved.revision, immutableEventId: event.eventId }
        });
        return { run: saved, event, reason };
    }

    async validateLockedRun(client, run, accounts, { interactive = true } = {}) {
        if (run.mode !== 'coop') return { allowed: true, reason: null, room: null };
        const room = await this.liveRepository.lockCoopConsent(client, {
            interactionId: run.liveInteractionId,
            creatorUserId: run.creatorUserId,
            ownerUserId: run.ownerUserId,
            gameId: run.gameId
        });
        let boundary = null;
        if (room) {
            const creator = accounts.get(run.creatorUsername);
            const rows = await this.liveRepository.creatorBoundaries(client, run.creatorUserId, room.id);
            boundary = this.boundaryPolicy({
                account: creator,
                preferences: rows.preferences,
                quietHours: rows.quietHours,
                interactionWindows: rows.interactionWindows,
                report: rows.report,
                room,
                gameId: run.gameId,
                now: this.clock()
            });
        }
        const policyAllowed = boundary
            ? (interactive ? boundary.allowInteractive : boundary.allowDurable) : true;
        const policyReason = boundary
            ? (interactive ? boundary.realtimeReason : boundary.reason) : null;
        const result = evaluateCoopConsent({
            run,
            creator: accounts.get(run.creatorUsername),
            owner: accounts.get(run.ownerUsername),
            room,
            ownerUsername: this.ownerUsername,
            communicationBoundary: boundary ? {
                allowed: policyAllowed,
                reason: policyReason,
                withdrawal: boundary.reason !== null
            } : null,
            now: this.clock()
        });
        return { ...result, room, boundary };
    }

    async abandonIfInvalid(client, run, accounts, context = {}) {
        const consent = await this.validateLockedRun(client, run, accounts);
        if (consent.allowed) return { ...consent, abandoned: null };
        return { ...consent,
            abandoned: consent.withdrawal === false ? null
                : await this.abandonLockedRun(client, run, consent.reason, context) };
    }

    async withdrawInteraction(client, interactionId, reason, context = {}) {
        const runs = await this.gameRepository.lockActiveCoopRunsForInteraction(client, interactionId);
        const abandoned = [];
        for (const run of runs) {
            const result = await this.abandonLockedRun(client, run, reason, context);
            if (result) abandoned.push(result);
        }
        return abandoned;
    }

    async withdrawCreator(client, creatorUserId, reason, context = {}, { closeRooms = false } = {}) {
        if (closeRooms) await this.liveRepository.revokeCreatorRooms(client, creatorUserId, reason, context);
        const runs = await this.gameRepository.lockActiveCoopRunsForCreator(client, creatorUserId);
        const abandoned = [];
        for (const run of runs) {
            const result = await this.abandonLockedRun(client, run, reason, context);
            if (result) abandoned.push(result);
        }
        return abandoned;
    }

    async withdrawBlockedGames(client, creatorUserId, context = {}) {
        const runs = await this.gameRepository.lockBlockedActiveCoopRunsForCreator(client, creatorUserId);
        const abandoned = [];
        for (const run of runs) {
            const reason = run.blockedByAllMessages ? 'communication_blocked' : 'game_preference_blocked';
            const result = await this.abandonLockedRun(client, run, reason, context);
            if (result) abandoned.push(result);
        }
        return abandoned;
    }
}

module.exports = { CoopConsentCoordinator, stateHash };
