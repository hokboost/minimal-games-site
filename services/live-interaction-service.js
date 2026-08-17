'use strict';

const crypto = require('node:crypto');
const {
    getTemplate,
    TEMPLATES
} = require('../content/streamer-world/live-interactions/templates');
const {
    isMuted,
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
const preferenceKey = {
    nudge: 'owner_notes',
    clue: 'owner_notes',
    celebration: 'celebrations',
    story_letter: 'owner_notes',
    quest_invite: 'quest_invites',
    poll: 'owner_notes',
    game_invite: 'game_invites',
    story_intervention: 'owner_notes'
};

function minuteAt(timezone, date) {
    try {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone || 'UTC',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(date).map(p => [p.type, p.value]));
        return {
            weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday),
            minute: Number(parts.hour) * 60 + Number(parts.minute)
        };
    } catch {
        return {
            weekday: 0,
            minute: 0
        };
    }
}

function inWindow(window, clock) {
    if (!window.enabled || Number(window.weekday) !== clock.weekday) return false;
    const start = Number(window.startMinute),
        end = Number(window.endMinute);
    return start < end ? clock.minute >= start && clock.minute < end : clock.minute >= start || clock.minute < end;
}

function boundaryState(account, boundaries, room, now) {
    const clock = minuteAt(account.timezone, now);
    const quiet = boundaries.quietHours.some(w => inWindow(w, clock));
    const liveWindows = boundaries.interactionWindows.filter(w => w.enabled && ['live', 'either'].includes(w.mode));
    const preferred = liveWindows.length === 0 || liveWindows.some(w => inWindow(w, clock));
    const blocked = boundaries.preferences.all_messages === 'block';
    const muted = isMuted(room, now);
    return {
        quiet,
        preferred,
        blocked,
        muted,
        canShowPresence: account.live_interaction_opt_in === true && !quiet && !muted && !blocked && preferred
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
        lastSequence: room.nextSequence - 1,
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
        questEnabled = false,
        storyEnabled = false,
        clock = () => new Date()
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
        this.storyNodeIds = new Set(storyNodeIds);
        this.questEnabled = questEnabled;
        this.storyEnabled = storyEnabled;
        this.clock = clock;
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
            if (template.type === 'story_intervention' && (!template.storyNodeIds.length || template.storyNodeIds
                    .some(id => !this.storyNodeIds.has(id)))) throw new TypeError(
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
    async boundaries(queryable, account, room) {
        const rows = await this.repository.creatorBoundaries(queryable, account.id);
        return {
            rows,
            state: boundaryState(account, rows, room, this.clock())
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
            if (accounts.creator.live_interaction_opt_in !== true)
            throw new LiveInteractionServiceError('LIVE_CONSENT_REQUIRED', 403,
                    'Creator has not opted in');
            const priorReport = await this.repository.latestPairReport(client, accounts.creator.id,
                accounts.owner.id, {
                    lock: true
                });
            if (priorReport && (!['resolved', 'dismissed'].includes(priorReport.status) || !priorReport
                    .creator_reconsented_at)) {
                throw new LiveInteractionServiceError('LIVE_PAIR_BLOCKED', 403,
                    'Interaction remains blocked after a report');
            }
            let room = await this.repository.findActivePair(client, accounts.creator.id, accounts.owner
                .id, {
                    lock: true
                });
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
                    audience: 'both'
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
            if (!this.storyEnabled || !template.storyNodeIds.includes(command.targetStoryNode) || !await this
                .repository.validateStoryTarget(client, creator.id, command.targetStoryNode))
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
            const boundary = await this.boundaries(client, accounts.creator, room);
            if (accounts.creator.live_interaction_opt_in !== true || boundary.state.blocked || boundary
                .rows.preferences[preferenceKey[command.itemType]] === 'block')
            throw new LiveInteractionServiceError('LIVE_CONSENT_BLOCKED', 403,
                    'Creator communication preference blocks this interaction');
            if (boundary.state.muted) throw new LiveInteractionServiceError('LIVE_MUTED', 409,
                'Creator has muted owner interactions');
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
                delivery: boundary.state.quiet ? 'persistent_inbox_no_push' : 'realtime'
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
            const body = {
                success: true,
                interactionId: room.id,
                revision: savedRoom.revision,
                item,
                event,
                realtimeSuppressed: boundary.state.quiet
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
                    realtimeSuppressed: boundary.state.quiet
                }
            });
            await this.finalize(context, client, 201, body);
            return {
                body,
                fanout: {
                    event,
                    room: savedRoom,
                    audience: boundary.state.quiet ? 'owner' : 'both'
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
                actorType: 'creator',
                actorUserId: actorId,
                subjectUserId: actorId,
                correlationId: command.commandId,
                stateRevision: savedRoom.revision,
                payload: {
                    reportId: command.reportId
                }
            });
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
            lastSequence: result.room.nextSequence - 1
        };
    }
    async state(username, interactionId = null) {
        const account = await this.repository.readAccount(username);
        if (!account) throw new LiveInteractionServiceError('LIVE_ACCOUNT_UNAVAILABLE', 403, 'Account unavailable');
        const rooms = await this.repository.listCreatorRooms(username);
        const selected = interactionId ? rooms.find(room => room.id === Number(interactionId)) : rooms[0];
        if (!selected) return {
            success: true,
            rooms: [],
            interaction: null,
            items: [],
            recent: []
        };
        const snapshot = await this.repository.roomState(selected.id, username);
        const boundary = await this.boundaries(this.repository.pool, account, snapshot.room);
        return {
            success: true,
            rooms: rooms.map(room => roomProjection(room, boundary.state, room.memberRole)),
            interaction: roomProjection(snapshot.room, boundary.state, snapshot.room.memberRole),
            items: snapshot.items,
            recent: snapshot.recent,
            report: snapshot.report
        };
    }
    async director(callerUsername, page = 1) {
        if (!this.ownerUsername) throw new LiveInteractionServiceError('LIVE_OWNER_REQUIRED', 403,
            'Configured owner account required');
        const owner = await this.repository.readAccount(callerUsername);
        this.assertOwner(callerUsername, owner);
        const summary = await this.repository.directorSummary(page);
        for (const creator of summary.creators) {
            const account = {
                id: creator.userId,
                timezone: creator.timezone,
                live_interaction_opt_in: creator.liveInteractionOptIn
            };
            const room = creator.interaction ? {
                mutedUntil: creator.interaction.mutedUntil
            } : null;
            const boundary = await this.boundaries(this.repository.pool, account, room);
            creator.presence = creator.interaction && boundary.state.canShowPresence ? creator.interaction
                .availability : 'offline';
            if (creator.interaction) delete creator.interaction.availability;
        }
        return {
            ...summary,
            reports: await this.repository.listReports(),
            templates: Object.values(TEMPLATES)
        };
    }
}

Object.assign(LiveInteractionService.prototype, participantCommands);

module.exports = {
    LiveInteractionService,
    LiveInteractionServiceError,
    boundaryState,
    roomProjection
};
