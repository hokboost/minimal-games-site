'use strict';

const crypto = require('node:crypto');
const {
    getTemplate,
    TEMPLATES
} = require('../content/streamer-world/live-interactions/templates');
const {
    nextRoomState
} = require('../domain/live-interactions/engine');
const {
    LiveProtocolError,
    semanticHash,
    validateAck,
    validateCatchUp,
    validateDirectorCommand,
    validateOpenCommand,
    validateReconsent
} = require('../domain/live-interactions/protocol');
const participantCommands = require('./live-interaction-participant-commands');
const {
    evaluateCommunicationBoundary
} = require('./creator-communication-boundary-policy');

class LiveInteractionServiceError extends Error {
    constructor(code, status, message) {
        super(message);
        this.name = 'LiveInteractionServiceError';
        this.code = code;
        this.status = status;
    }
}

const itemEvent = {
    nudge: 'interaction.nudge',
    clue: 'interaction.clue',
    celebration: 'interaction.celebration',
    story_letter: 'interaction.story_letter',
    quest_invite: 'interaction.quest_invite',
    poll: 'interaction.poll_opened',
    game_invite: 'interaction.game_invite',
    story_intervention: 'interaction.story_intervention'
};
function boundaryState(account, boundaries, room, now, options = {}) {
    const result = evaluateCommunicationBoundary({
        account,
        preferences: boundaries?.preferences,
        quietHours: boundaries?.quietHours,
        interactionWindows: boundaries?.interactionWindows,
        report: boundaries?.report,
        room,
        itemType: options.itemType,
        gameId: options.gameId,
        now
    });
    return {
        ...result,
        canShowPresence: result.allowRealtime
    };
}

function requireRevision(room, expected) {
    if (room.revision !== expected) throw new LiveInteractionServiceError('LIVE_REVISION_CONFLICT', 409,
        'Interaction changed in another session');
}

function roomProjection(room, boundary, viewerRole) {
    return {
        id: room.id,
        key: room.key,
        status: room.status,
        revision: room.revision,
        lastSequence: room.visibleLastSequence ?? room.nextSequence - 1,
        highestAckSequence: room.highestAckSequence,
        creatorUsername: room.creatorUsername,
        ownerUsername: room.ownerUsername,
        presence: viewerRole === 'owner' ? (boundary.canShowPresence ? room.availability : 'offline') : room
            .availability,
        mutedUntil: viewerRole === 'creator' ? room.mutedUntil : (boundary.muted ? 'active' : null),
        quiet: viewerRole === 'creator' ? boundary.quiet : undefined
    };
}

class LiveInteractionService {
    constructor({
        repository,
        ownerUsername,
        publish = async () => {},
        games = [],
        gameIds = [],
        storyNodeIds = [],
        storyInterventionRegistry = null,
        questEnabled = false,
        storyEnabled = false,
        achievementService = null,
        consentCoordinator = null,
        clock = () => new Date(),
        boundaryPolicy = evaluateCommunicationBoundary
    }) {
        if (!repository?.withTransaction) throw new TypeError('LiveInteractionService requires repository');
        this.repository = repository;
        this.ownerUsername = ownerUsername || null;
        this.publish = publish;
        const catalog = games.length ? games : gameIds.map(id => ({
            id,
            href: `/${id}`
        }));
        if (catalog.some(game => !/^\/[A-Za-z0-9/_-]{1,119}$/.test(game.href || ''))) throw new TypeError(
            'Live game action paths must be internal allowlisted paths');
        this.gamePaths = new Map(catalog.map(game => [game.id, game.href]));
        this.gameIds = new Set(this.gamePaths.keys());
        this.strictStoryInterventionRegistry = Boolean(storyInterventionRegistry);
        this.storyNodeIds = new Set(storyInterventionRegistry?.nodeIds || storyNodeIds);
        this.storyInterventionRegistry = storyInterventionRegistry || {
            hasBinding: (season, version, nodeId) => this.storyNodeIds.has(nodeId)
        };
        if (typeof this.storyInterventionRegistry.hasBinding !== 'function') {
            throw new TypeError('Story intervention registry requires version-bound lookup');
        }
        this.questEnabled = questEnabled;
        this.storyEnabled = storyEnabled;
        this.achievementService = achievementService;
        this.consentCoordinator = consentCoordinator;
        this.clock = clock;
        this.boundaryPolicy = boundaryPolicy;
        this.validateTemplateCatalog();
    }
    validateTemplateCatalog() {
        const values = Object.values(TEMPLATES);
        if (values.length < 24) throw new TypeError('Live interactions require at least 24 templates');
        const zh = new Set(),
            en = new Set();
        for (const template of values) {
            if (zh.has(template.titleZh) || en.has(template.titleEn)) throw new TypeError(
                'Live template titles must be unique');
            zh.add(template.titleZh);
            en.add(template.titleEn);
            if (template.type === 'story_intervention' && (!template.storyNodeIds.length
                || (this.strictStoryInterventionRegistry && template.storyNodeIds
                    .some(id => !this.storyNodeIds.has(id))))) throw new TypeError(
                'Story intervention template references an unavailable authored node');
            if (template.type === 'game_invite' && template.referenceIds.some(id => !this.gameIds.has(id)))
            throw new TypeError('Game invitation template references an unavailable game');
        }
    }
    assertOwner(username, account) {
        if (!this.ownerUsername || username !== this.ownerUsername || !account || account.username !== this
            .ownerUsername || account.is_admin !== true) {
            throw new LiveInteractionServiceError('LIVE_OWNER_REQUIRED', 403,
                'Configured active owner account required');
        }
    }
    serviceError(code, status, message) {
        return new LiveInteractionServiceError(code, status, message);
    }
    async finalize(context, client, status, body) {
        await context?.finalizeIdempotency?.(client, status, body);
    }
    async afterCommit(result) {
        if (result.fanout) {
            try {
                await this.publish(result.fanout.event, result.fanout.room, result.fanout.audience);
            } catch {
                /* REST catch-up remains authoritative. */ }
        }
        return result.body;
    }
    async boundaries(queryable, account, room, options = {}) {
        const rows = await this.repository.creatorBoundaries(queryable, account.id, room?.id || null);
        const evaluated = this.boundaryPolicy({
            account,
            preferences: rows.preferences,
            quietHours: rows.quietHours,
            interactionWindows: rows.interactionWindows,
            report: rows.report,
            room,
            itemType: options.itemType,
            gameId: options.gameId,
            now: this.clock()
        });
        return {
            rows,
            state: { ...evaluated, canShowPresence: evaluated.allowRealtime }
        };
    }
    async lockContext(client, interactionId, username) {
        const identity = await this.repository.readRoomIdentity(client, interactionId, username);
        if (!identity) return null;
        const accounts = await this.repository.lockAccounts(client, identity.creator_username, identity
            .owner_username);
        const room = await this.repository.lockMemberRoom(client, interactionId, username);
        return room ? {
            room,
            accounts
        } : null;
    }
    replay(existing, hash) {
        if (!existing) return null;
        if (existing.semantic_hash !== hash) throw new LiveInteractionServiceError('LIVE_COMMAND_COLLISION', 409,
            'Command identity was reused with different semantics');
        return existing.response_body;
    }
    async open(ownerUsername, input, context = {}) {
        const command = validateOpenCommand(input);
        const hash = semanticHash({
            action: 'open',
            creatorUsername: command.creatorUsername
        });
        const result = await this.repository.withTransaction(async client => {
            const accounts = await this.repository.lockAccounts(client, command.creatorUsername,
                ownerUsername);
            this.assertOwner(ownerUsername, accounts.owner);
            if (!accounts.creator?.timezone) throw new LiveInteractionServiceError(
                'CREATOR_PROFILE_REQUIRED', 409, 'Creator profile required');
            const priorReport = await this.repository.latestPairReport(client, accounts.creator.id,
                accounts.owner.id, {
                    lock: true
                });
            let room = await this.repository.findActivePair(client, accounts.creator.id, accounts.owner
                .id, {
                    lock: true
                });
            const boundaryRows = await this.repository.creatorBoundaries(client, accounts.creator.id,
                room?.id || null);
            if (!boundaryRows.report && priorReport) {
                boundaryRows.report = {
                    status: priorReport.status,
                    creatorReconsentedAt: priorReport.creator_reconsented_at
                };
            }
            const boundary = this.boundaryPolicy({
                account: accounts.creator,
                preferences: boundaryRows.preferences,
                quietHours: boundaryRows.quietHours,
                interactionWindows: boundaryRows.interactionWindows,
                report: boundaryRows.report,
                room,
                now: this.clock()
            });
            if (!boundary.allowDurable) {
                const code = boundary.reason === 'unresolved_report' ? 'LIVE_PAIR_BLOCKED'
                    : boundary.reason === 'global_opt_out' ? 'LIVE_CONSENT_REQUIRED'
                        : 'LIVE_CONSENT_BLOCKED';
                throw new LiveInteractionServiceError(code, 403,
                    `Creator communication boundary blocks this interaction (${boundary.reason})`);
            }
            if (room) {
                const existing = await this.repository.findCommand(client, room.id, accounts.owner.id,
                    command.commandId);
                const replay = this.replay(existing, hash);
                if (replay) return {
                    body: replay
                };
                const body = {
                    success: true,
                    reused: true,
                    realtimeSuppressed: !boundary.allowRealtime,
                    interaction: {
                        id: room.id,
                        revision: room.revision,
                        status: room.status
                    }
                };
                await this.repository.saveCommand(client, {
                    interactionId: room.id,
                    actorUserId: accounts.owner.id,
                    commandId: command.commandId,
                    commandType: 'interaction.open',
                    semanticHash: hash,
                    expectedRevision: room.revision,
                    eventId: null,
                    status: 201,
                    body
                });
                await this.finalize(context, client, 201, body);
                return {
                    body
                };
            }
            room = await this.repository.createRoom(client, {
                interactionKey: crypto.randomUUID(),
                creatorUserId: accounts.creator.id,
                ownerUserId: accounts.owner.id
            });
            room = {
                ...room,
                creatorUsername: accounts.creator.username,
                ownerUsername: accounts.owner.username
            };
            const next = nextRoomState(room, 'send');
            room = await this.repository.advanceRoom(client, room, next);
            const event = await this.repository.appendEvent(client, {
                eventId: crypto.randomUUID(),
                interactionId: room.id,
                eventType: 'interaction.opened',
                audience: 'both',
                actorType: 'owner',
                actorUserId: accounts.owner.id,
                subjectUserId: accounts.creator.id,
                correlationId: command.commandId,
                stateRevision: room.revision,
                payload: {
                    interactionKey: room.key
                }
            });
            const body = {
                success: true,
                reused: false,
                realtimeSuppressed: !boundary.allowRealtime,
                interaction: {
                    id: room.id,
                    key: room.key,
                    revision: room.revision,
                    status: room.status
                },
                event
            };
            await this.repository.saveCommand(client, {
                interactionId: room.id,
                actorUserId: accounts.owner.id,
                commandId: command.commandId,
                commandType: 'interaction.open',
                semanticHash: hash,
                expectedRevision: 0,
                eventId: event.eventId,
                status: 201,
                body
            });
            await this.repository.insertAudit(client, {
                interactionId: room.id,
                actorUserId: accounts.owner.id,
                actorType: 'owner',
                action: 'live.interaction.opened',
                requestId: context.requestId,
                details: {
                    creatorUsername: command.creatorUsername
                }
            });
            await this.finalize(context, client, 201, body);
            return {
                body,
                fanout: {
                    event,
                    room,
                    audience: boundary.allowRealtime ? 'both' : 'owner'
                }
            };
        });
        return this.afterCommit(result);
    }
    async validateReference(client, creator, command, template) {
        if (command.itemType === 'quest_invite') {
            if (!this.questEnabled || !command.referenceId || !template.referenceIds.includes(command
                .referenceId) || !await this.repository.validateQuestReference(client, creator.id, command
                    .referenceId))
                throw new LiveInteractionServiceError('LIVE_REFERENCE_UNAVAILABLE', 403,
                    'Quest is not available to this creator');
        } else if (command.itemType === 'game_invite') {
            if (!command.referenceId || !template.referenceIds.includes(command.referenceId) || !this.gameIds.has(
                    command.referenceId))
                throw new LiveInteractionServiceError('LIVE_REFERENCE_UNAVAILABLE', 403, 'Game is not registered');
        } else if (command.referenceId !== null) throw new LiveInteractionServiceError('LIVE_REFERENCE_INVALID',
            400, 'This interaction does not accept a reference');
        if (command.itemType === 'story_intervention') {
            const target = this.storyEnabled && template.storyNodeIds.includes(command.targetStoryNode)
                ? await this.repository.validateStoryTarget(client, creator.id, command.targetStoryNode)
                : null;
            if (!target || !this.storyInterventionRegistry.hasBinding(
                target.seasonSlug, Number(target.contentVersion), command.targetStoryNode
            ))
                throw new LiveInteractionServiceError('LIVE_STORY_TARGET_MISMATCH', 409,
                    'Story intervention does not match the current authored node');
        }
    }
    async send(ownerUsername, input, context = {}) {
        const command = validateDirectorCommand(input);
        const hash = semanticHash({
            action: 'send',
            ...command
        });
        const result = await this.repository.withTransaction(async client => {
            const locked = await this.lockContext(client, command.interactionId, ownerUsername);
            const accounts = locked?.accounts || {};
            this.assertOwner(ownerUsername, accounts.owner);
            if (!accounts.creator) throw new LiveInteractionServiceError('LIVE_CREATOR_UNAVAILABLE',
                404, 'Creator unavailable');
            const room = locked.room;
            if (!room || room.memberRole !== 'owner' || room.creatorUserId !== Number(accounts.creator
                    .id) || room.memberStatus !== 'active') throw new LiveInteractionServiceError(
                'LIVE_MEMBERSHIP_REQUIRED', 403, 'Interaction membership required');
            const existing = await this.repository.findCommand(client, room.id, accounts.owner.id,
                command.commandId);
            const replay = this.replay(existing, hash);
            if (replay) return {
                body: replay
            };
            requireRevision(room, command.expectedRevision);
            if (room.status !== 'active') throw new LiveInteractionServiceError('LIVE_ROOM_CLOSED', 409,
                'Interaction is not active');
            const template = getTemplate(command.templateKey, command.itemType);
            if (!template) throw new LiveInteractionServiceError('LIVE_TEMPLATE_NOT_FOUND', 400,
                'Unknown structured template');
            const boundary = await this.boundaries(client, accounts.creator, room, {
                itemType: command.itemType,
                gameId: command.itemType === 'game_invite' ? command.referenceId : null
            });
            if (!boundary.state.allowDurable) {
                const code = boundary.state.reason === 'room_muted' ? 'LIVE_MUTED' : 'LIVE_CONSENT_BLOCKED';
                throw new LiveInteractionServiceError(code,
                    boundary.state.reason === 'room_muted' ? 409 : 403,
                    `Creator communication boundary blocks this interaction (${boundary.state.reason})`);
            }
            await this.validateReference(client, accounts.creator, command, template);
            const expiresAt = new Date(this.clock().getTime() + command.expiresInMinutes * 60000)
                .toISOString();
            const payload = {
                titleZh: template.titleZh,
                titleEn: template.titleEn,
                bodyZh: template.bodyZh,
                bodyEn: template.bodyEn,
                referenceId: command.referenceId,
                pollOptions: command.pollOptions,
                actionPath: command.itemType === 'quest_invite' ? '/quests' : command.itemType ===
                    'game_invite' ? this.gamePaths.get(command.referenceId) : null,
                delivery: boundary.state.allowRealtime ? 'realtime' : 'persistent_inbox_no_push'
            };
            const next = nextRoomState(room, 'send');
            const savedRoom = await this.repository.advanceRoom(client, room, next);
            const item = await this.repository.createItem(client, {
                itemKey: crypto.randomUUID(),
                interactionId: room.id,
                itemType: command.itemType,
                templateKey: command.templateKey,
                status: 'delivered',
                payload,
                semanticHash: semanticHash(payload),
                targetStoryNode: command.targetStoryNode,
                createdByUserId: accounts.owner.id,
                deliverAt: this.clock().toISOString(),
                expiresAt
            });
            const inboxMessageId = await this.repository.appendInbox(client, item, accounts.creator.id,
                accounts.owner.username);
            const event = await this.repository.appendEvent(client, {
                eventId: crypto.randomUUID(),
                interactionId: room.id,
                eventType: itemEvent[command.itemType],
                audience: 'both',
                actorType: 'owner',
                actorUserId: accounts.owner.id,
                subjectUserId: accounts.creator.id,
                correlationId: command.commandId,
                stateRevision: savedRoom.revision,
                payload: {
                    itemId: item.id,
                    itemKey: item.itemKey,
                    itemType: item.itemType,
                    templateKey: item.templateKey,
                    ...payload,
                    targetStoryNode: item.targetStoryNode,
                    expiresAt: item.expiresAt,
                    inboxMessageId
                }
            });
            if (this.achievementService?.recordTrustedEvent) await this.achievementService.recordTrustedEvent(client, accounts.creator.username, {
                sourceType:'live_interaction',sourceEventId:`achievement-live-persisted:${event.eventId}`,
                eventType:'live.item.persisted',occurredAt:this.clock().toISOString(),
                payload:{interactionId:room.id,itemId:item.id,type:item.itemType,quiet:Boolean(boundary.state.quiet),muted:false}
            }, context);
            const body = {
                success: true,
                interactionId: room.id,
                revision: savedRoom.revision,
                item,
                event,
                realtimeSuppressed: !boundary.state.allowRealtime
            };
            await this.repository.saveCommand(client, {
                interactionId: room.id,
                actorUserId: accounts.owner.id,
                commandId: command.commandId,
                commandType: `interaction.send.${command.itemType}`,
                semanticHash: hash,
                expectedRevision: command.expectedRevision,
                eventId: event.eventId,
                status: 201,
                body
            });
            await this.repository.insertAudit(client, {
                interactionId: room.id,
                actorUserId: accounts.owner.id,
                actorType: 'owner',
                action: `live.${command.itemType}.sent`,
                requestId: context.requestId,
                details: {
                    itemId: item.id,
                    templateKey: item.templateKey,
                    realtimeSuppressed: !boundary.state.allowRealtime,
                    boundaryReason: boundary.state.realtimeReason
                }
            });
            await this.finalize(context, client, 201, body);
            return {
                body,
                fanout: {
                    event,
                    room: savedRoom,
                    audience: boundary.state.allowRealtime ? 'both' : 'owner'
                }
            };
        });
        return this.afterCommit(result);
    }
    async reconsent(username, input, context = {}) {
        const command = validateReconsent(input);
        const hash = semanticHash({
            action: 'reconsent',
            ...command
        });
        const result = await this.repository.withTransaction(async client => {
            const room = (await this.lockContext(client, command.interactionId, username))?.room;
            if (!room || room.memberRole !== 'creator' || room.status !== 'closed')
            throw new LiveInteractionServiceError('LIVE_REPORT_NOT_FOUND', 404,
                    'Closed reported interaction not found');
            const actorId = room.creatorUserId;
            const existing = await this.repository.findCommand(client, room.id, actorId, command
                .commandId);
            const replay = this.replay(existing, hash);
            if (replay) return {
                body: replay
            };
            requireRevision(room, command.expectedRevision);
            const report = await this.repository.reconsentReport(client, command.reportId, actorId);
            if (!report || Number(report.interaction_id) !== room.id)
            throw new LiveInteractionServiceError('LIVE_RECONSENT_NOT_ALLOWED', 409,
                    'Report must be resolved before creator reconsent');
            const savedRoom = await this.repository.bumpRoomRevision(client, room);
            const event = await this.repository.appendEvent(client, {
                eventId: crypto.randomUUID(),
                interactionId: room.id,
                eventType: 'interaction.reconsented',
                audience: 'creator',
                actorType: 'creator',
                actorUserId: actorId,
                subjectUserId: actorId,
                correlationId: command.commandId,
                stateRevision: savedRoom.revision,
                payload: {
                    reportId: command.reportId
                }
            });
            if (this.achievementService?.recordTrustedEvent) await this.achievementService.recordTrustedEvent(client, username, {
                sourceType:'live_interaction',sourceEventId:`achievement-live-reconsent:${event.eventId}`,
                eventType:'live.report.reconsented',occurredAt:this.clock().toISOString(),
                payload:{interactionId:room.id,reportId:command.reportId}
            }, context);
            const body = {
                success: true,
                interactionId: room.id,
                revision: savedRoom.revision,
                reconsented: true,
                event
            };
            await this.repository.saveCommand(client, {
                interactionId: room.id,
                actorUserId: actorId,
                commandId: command.commandId,
                commandType: 'interaction.reconsent',
                semanticHash: hash,
                expectedRevision: command.expectedRevision,
                eventId: event.eventId,
                status: 200,
                body
            });
            await this.repository.insertAudit(client, {
                interactionId: room.id,
                actorUserId: actorId,
                actorType: 'creator',
                action: 'live.interaction.reconsented',
                requestId: context.requestId,
                details: {
                    reportId: command.reportId
                }
            });
            await this.finalize(context, client, 200, body);
            return {
                body,
                fanout: {
                    event,
                    room: savedRoom,
                    audience: 'creator'
                }
            };
        });
        return this.afterCommit(result);
    }
    async acknowledge(username, input) {
        const command = validateAck(input);
        return this.repository.withTransaction(async client => {
            const room = (await this.lockContext(client, command.interactionId, username))?.room;
            if (!room || room.memberStatus !== 'active') throw new LiveInteractionServiceError(
                'LIVE_MEMBERSHIP_REQUIRED', 403, 'Active membership required');
            const actorId = room.memberRole === 'creator' ? room.creatorUserId : room.ownerUserId;
            const result = await this.repository.updateAck(client, room, actorId, command.sequence);
            if (result.invalid) throw new LiveInteractionServiceError('LIVE_ACK_AHEAD', 409,
                'Acknowledgement is ahead of durable events');
            return {
                success: true,
                interactionId: room.id,
                highestAckSequence: result.highest,
                lastSequence: result.maximum
            };
        });
    }
    async catchUp(username, query) {
        const input = validateCatchUp(query);
        const result = await this.repository.catchUp(input.interactionId, username, input.afterSequence, input
            .limit);
        if (!result) throw new LiveInteractionServiceError('LIVE_MEMBERSHIP_REQUIRED', 403,
            'Interaction membership required');
        return {
            success: true,
            events: result.events,
            hasMore: result.hasMore,
            nextAfter: result.nextAfter,
            lastSequence: result.lastSequence,
            subscription: {
                role: result.room.memberRole,
                userId: result.room.memberRole === 'creator'
                    ? result.room.creatorUserId : result.room.ownerUserId
            }
        };
    }
    async state(username, interactionId = null) {
        const account = await this.repository.readAccount(username);
        if (!account) throw new LiveInteractionServiceError('LIVE_ACCOUNT_UNAVAILABLE', 403, 'Account unavailable');
        const unavailableState = async () => {
            const recovery = await this.repository.latestReportRecovery?.(username);
            if (!recovery) return {
                success: true,
                rooms: [],
                interaction: null,
                items: [],
                recent: []
            };
            const boundary = await this.boundaries(this.repository.pool, account, recovery.room);
            return {
                success: true,
                rooms: [],
                interaction: roomProjection(recovery.room, boundary.state, 'creator'),
                items: [],
                recent: [],
                report: recovery.report
            };
        };
        const rooms = await this.repository.listCreatorRooms(username);
        const selected = interactionId ? rooms.find(room => room.id === Number(interactionId)) : rooms[0];
        if (!selected) return unavailableState();
        const snapshot = await this.repository.roomState(selected.id, username);
        if (!snapshot) return unavailableState();
        const creatorAccounts = this.repository.readAccountsByIds
            ? await this.repository.readAccountsByIds(rooms.map(room => room.creatorUserId))
            : new Map();
        const evaluatedRooms = await Promise.all(rooms.map(async room => {
            const creatorAccount = creatorAccounts.get(Number(room.creatorUserId))
                || (Number(account.id) === Number(room.creatorUserId) ? account
                    : await this.repository.readAccount(room.creatorUsername));
            if (!creatorAccount) return null;
            return {
                room,
                boundary: await this.boundaries(this.repository.pool, creatorAccount, room)
            };
        }));
        const roomStates = evaluatedRooms.filter(Boolean);
        const selectedState = roomStates.find(value => value.room.id === snapshot.room.id);
        if (!selectedState) return unavailableState();
        return {
            success: true,
            rooms: roomStates.map(value => roomProjection(value.room, value.boundary.state,
                value.room.memberRole)),
            interaction: roomProjection(snapshot.room, selectedState.boundary.state,
                snapshot.room.memberRole),
            items: snapshot.items,
            recent: snapshot.recent,
            report: snapshot.report
        };
    }
    async reportsForLockedActor(client, actor, { includeEvidence = false } = {}, context = {}) {
        const independent = Boolean(actor?.is_admin === true && actor.authorized === true
            && actor.deactivated !== true && actor.account_locked !== true
            && this.ownerUsername && actor.username !== this.ownerUsername);
        const ownerRead = Boolean(actor?.is_admin === true && actor.authorized === true
            && actor.deactivated !== true && actor.account_locked !== true
            && this.ownerUsername && actor.username === this.ownerUsername);
        if ((includeEvidence && !independent) || (!includeEvidence && !ownerRead)) {
            throw new LiveInteractionServiceError('LIVE_INDEPENDENT_MODERATOR_REQUIRED', 403,
                'An independent active moderator is required');
        }
        const reports = await this.repository.listReports(client, { includeEvidence, limit: 50 });
        for (const report of reports) {
            await this.repository.appendSensitiveReadAudit(client, {
                actorUserId: Number(actor.id),
                actorUsername: actor.username,
                interactionId: report.interactionId,
                reportId: report.id,
                accessKind: 'moderation_evidence',
                decision: includeEvidence ? 'granted' : 'redacted',
                fields: includeEvidence
                    ? ['reason_code', 'detail', 'item_id', 'reporter_user_id'] : [],
                requestId: context.requestId,
                metadata: { purpose: 'queue', configuredOwner: ownerRead }
            });
        }
        return reports;
    }

    async reportsForActor(callerUsername, { includeEvidence = false } = {}, context = {}) {
        return this.repository.withTransaction(async client => {
            const actor = await this.repository.readAccount(callerUsername, client, { lock: true });
            return this.reportsForLockedActor(client, actor, { includeEvidence }, context);
        });
    }

    async moderationQueue(callerUsername, context = {}) {
        return {
            reports: await this.reportsForActor(callerUsername, { includeEvidence: true }, context),
            templates: []
        };
    }

    async director(callerUsername, page = 1, context = {}) {
        if (!this.ownerUsername) throw new LiveInteractionServiceError('LIVE_OWNER_REQUIRED', 403,
            'Configured owner account required');
        return this.repository.withTransaction(async client => {
            const owner = await this.repository.readAccount(callerUsername, client, { lock: true });
            this.assertOwner(callerUsername, owner);
            const summary = await this.repository.directorSummary(client, page);
            for (const creator of summary.creators) {
                const granted = creator.profileVisibility === 'owner';
                await this.repository.appendSensitiveReadAudit(client, {
                    actorUserId: Number(owner.id),
                    actorUsername: owner.username,
                    targetUserId: creator.userId,
                    accessKind: 'owner_profile',
                    decision: granted ? 'granted' : 'redacted',
                    fields: granted ? [
                        'display_name', 'timezone', 'bilibili_room_id', 'live_interaction_opt_in',
                        'relationship', 'room_request'
                    ] : [],
                    requestId: context.requestId,
                    metadata: { configuredOwner: true, source: 'live_director' }
                });
                const account = {
                    id: creator.userId,
                    username: creator.username,
                    authorized: true,
                    deactivated: false,
                    account_locked: false,
                    timezone: creator.boundaryTimezone || creator.timezone,
                    live_interaction_opt_in: creator.liveInteractionOptIn
                };
                const room = creator.interaction ? {
                    mutedUntil: creator.interaction.mutedUntil
                } : null;
                const boundary = await this.boundaries(client, account, room);
                creator.presence = creator.interaction && boundary.state.canShowPresence
                    ? creator.interaction.availability : 'offline';
                if (creator.interaction) delete creator.interaction.availability;
                delete creator.boundaryTimezone;
            }
            return {
                ...summary,
                reports: await this.reportsForLockedActor(client, owner,
                    { includeEvidence: false }, context),
                templates: Object.values(TEMPLATES)
            };
        });
    }
}

Object.assign(LiveInteractionService.prototype, participantCommands);

module.exports = {
    LiveInteractionService,
    LiveInteractionServiceError,
    boundaryState,
    roomProjection
};
