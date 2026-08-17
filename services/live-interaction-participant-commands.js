'use strict';

const crypto = require('node:crypto');
const { nextRoomState, transitionItem } = require('../domain/live-interactions/engine');
const {
    semanticHash,
    validateAvailability,
    validateItemAction,
    validateLeave,
    validateModeration,
    validateMute,
    validateReport
} = require('../domain/live-interactions/protocol');

function requireRevision(service, room, expectedRevision) {
    if (room.revision !== expectedRevision) {
        throw service.serviceError(
            'LIVE_REVISION_CONFLICT',
            409,
            'Interaction changed in another session'
        );
    }
}

async function saveParticipantCommand(service, client, values) {
    await service.repository.saveCommand(client, values.command);
    await service.repository.insertAudit(client, values.audit);
    await service.finalize(values.context, client, values.command.status, values.body);
    return {
        body: values.body,
        fanout: {
            event: values.event,
            room: values.room,
            audience: values.audience
        }
    };
}

const participantCommands = {
    async itemAction(username, input, action, context = {}) {
        const command = validateItemAction(input, action);
        const hash = semanticHash({ action, ...command });
        const result = await this.repository.withTransaction(async client => {
            const locked = await this.lockContext(client, command.interactionId, username);
            const room = locked?.room;
            if (!room || room.memberRole !== 'creator' || room.memberStatus !== 'active') {
                throw this.serviceError('LIVE_MEMBERSHIP_REQUIRED', 403, 'Creator membership required');
            }

            const actorId = room.creatorUserId;
            const existing = await this.repository.findCommand(client, room.id, actorId, command.commandId);
            const replay = this.replay(existing, hash);
            if (replay) return { body: replay };

            requireRevision(this, room, command.expectedRevision);
            const item = await this.repository.lockItem(client, room.id, command.itemId);
            if (!item) throw this.serviceError('LIVE_ITEM_NOT_FOUND', 404, 'Interaction item not found');

            if (item.status === 'delivered' && item.expiresAt &&
                new Date(item.expiresAt).getTime() <= this.clock().getTime()) {
                const savedRoom = await this.repository.advanceRoom(client, room, nextRoomState(room, 'item'));
                const savedItem = await this.repository.transitionItem(client, item, {
                    status: 'expired',
                    nextItemRevision: item.revision + 1
                });
                const event = await this.repository.appendEvent(client, {
                    eventId: crypto.randomUUID(),
                    interactionId: room.id,
                    eventType: 'interaction.item_expired',
                    actorType: 'system',
                    actorUserId: null,
                    subjectUserId: actorId,
                    correlationId: command.commandId,
                    stateRevision: savedRoom.revision,
                    payload: { itemId: item.id, itemType: item.itemType }
                });
                const body = {
                    success: true,
                    expired: true,
                    code: 'LIVE_ITEM_EXPIRED',
                    message: 'Interaction item has expired',
                    interactionId: room.id,
                    revision: savedRoom.revision,
                    item: savedItem,
                    event
                };
                return saveParticipantCommand(this, client, {
                    context,
                    body,
                    event,
                    room: savedRoom,
                    audience: 'both',
                    command: {
                        interactionId: room.id,
                        actorUserId: actorId,
                        commandId: command.commandId,
                        commandType: `interaction.item.${action}`,
                        semanticHash: hash,
                        expectedRevision: command.expectedRevision,
                        eventId: event.eventId,
                        status: 200,
                        body
                    },
                    audit: {
                        interactionId: room.id,
                        actorUserId: actorId,
                        actorType: 'creator',
                        action: 'live.item.expired',
                        requestId: context.requestId,
                        details: { itemId: item.id, itemType: item.itemType }
                    }
                });
            }

            const transition = transitionItem(item, action, command);
            const savedRoom = await this.repository.advanceRoom(client, room, nextRoomState(room, 'item'));
            const savedItem = await this.repository.transitionItem(client, item, transition);
            const event = await this.repository.appendEvent(client, {
                eventId: crypto.randomUUID(),
                interactionId: room.id,
                eventType: transition.eventType,
                actorType: 'creator',
                actorUserId: actorId,
                subjectUserId: actorId,
                correlationId: command.commandId,
                stateRevision: savedRoom.revision,
                payload: transition.eventPayload
            });
            const body = {
                success: true,
                interactionId: room.id,
                revision: savedRoom.revision,
                item: savedItem,
                event
            };
            return saveParticipantCommand(this, client, {
                context,
                body,
                event,
                room: savedRoom,
                audience: 'both',
                command: {
                    interactionId: room.id,
                    actorUserId: actorId,
                    commandId: command.commandId,
                    commandType: `interaction.item.${action}`,
                    semanticHash: hash,
                    expectedRevision: command.expectedRevision,
                    eventId: event.eventId,
                    status: 200,
                    body
                },
                audit: {
                    interactionId: room.id,
                    actorUserId: actorId,
                    actorType: 'creator',
                    action: `live.item.${action}`,
                    requestId: context.requestId,
                    details: { itemId: item.id, itemType: item.itemType }
                }
            });
        });
        return this.afterCommit(result);
    },

    async creatorAction(username, input, action, context = {}) {
        const command = action === 'availability'
            ? validateAvailability(input)
            : action === 'mute' ? validateMute(input) : validateLeave(input);
        const hash = semanticHash({ action, ...command });
        const result = await this.repository.withTransaction(async client => {
            const locked = await this.lockContext(client, command.interactionId, username);
            const room = locked?.room;
            if (!room || room.memberRole !== 'creator' || room.memberStatus !== 'active') {
                throw this.serviceError('LIVE_MEMBERSHIP_REQUIRED', 403, 'Creator membership required');
            }

            const actorId = room.creatorUserId;
            const existing = await this.repository.findCommand(client, room.id, actorId, command.commandId);
            const replay = this.replay(existing, hash);
            if (replay) return { body: replay };
            requireRevision(this, room, command.expectedRevision);

            const boundary = action === 'availability'
                ? await this.boundaries(client, locked.accounts.creator, room)
                : null;
            const values = action === 'availability'
                ? { availability: command.availability }
                : action === 'mute'
                    ? { mutedUntil: new Date(this.clock().getTime() + command.minutes * 60000).toISOString() }
                    : {};
            const next = nextRoomState(room, action, values);
            const savedRoom = await this.repository.advanceRoom(client, room, next);
            if (action === 'leave') await this.repository.markMemberLeft(client, room.id, actorId);

            const eventTypes = {
                availability: 'interaction.availability_changed',
                mute: 'interaction.muted',
                leave: 'interaction.left'
            };
            const payload = action === 'availability'
                ? {
                    availability: boundary.state.canShowPresence ? command.availability : 'offline',
                    visibility: boundary.state.canShowPresence ? 'shared' : 'suppressed'
                }
                : action === 'mute' ? { mutedUntil: next.mutedUntil } : { left: true };
            const event = await this.repository.appendEvent(client, {
                eventId: crypto.randomUUID(),
                interactionId: room.id,
                eventType: eventTypes[action],
                actorType: 'creator',
                actorUserId: actorId,
                subjectUserId: actorId,
                correlationId: command.commandId,
                stateRevision: savedRoom.revision,
                payload
            });
            const body = {
                success: true,
                interactionId: room.id,
                revision: savedRoom.revision,
                status: savedRoom.status,
                event
            };
            return saveParticipantCommand(this, client, {
                context,
                body,
                event,
                room: savedRoom,
                audience: 'both',
                command: {
                    interactionId: room.id,
                    actorUserId: actorId,
                    commandId: command.commandId,
                    commandType: `interaction.${action}`,
                    semanticHash: hash,
                    expectedRevision: command.expectedRevision,
                    eventId: event.eventId,
                    status: 200,
                    body
                },
                audit: {
                    interactionId: room.id,
                    actorUserId: actorId,
                    actorType: 'creator',
                    action: `live.interaction.${action}`,
                    requestId: context.requestId,
                    details: payload
                }
            });
        });
        return this.afterCommit(result);
    },

    async report(username, input, context = {}) {
        const command = validateReport(input);
        const hash = semanticHash({ action: 'report', ...command });
        const result = await this.repository.withTransaction(async client => {
            const room = (await this.lockContext(client, command.interactionId, username))?.room;
            if (!room || room.memberRole !== 'creator' || room.memberStatus !== 'active') {
                throw this.serviceError('LIVE_MEMBERSHIP_REQUIRED', 403, 'Creator membership required');
            }

            const actorId = room.creatorUserId;
            const existing = await this.repository.findCommand(client, room.id, actorId, command.commandId);
            const replay = this.replay(existing, hash);
            if (replay) return { body: replay };
            requireRevision(this, room, command.expectedRevision);

            if (command.itemId) {
                const item = await this.repository.lockItem(client, room.id, command.itemId);
                if (!item) throw this.serviceError('LIVE_ITEM_NOT_FOUND', 404, 'Interaction item not found');
                if (item.status === 'delivered') {
                    await this.repository.transitionItem(client, item, {
                        status: 'reported',
                        nextItemRevision: item.revision + 1
                    });
                }
            }

            const savedRoom = await this.repository.advanceRoom(client, room, nextRoomState(room, 'report'));
            const reportKey = crypto.randomUUID();
            await this.repository.insertReport(client, {
                reportKey,
                interactionId: room.id,
                itemId: command.itemId,
                reporterUserId: actorId,
                reasonCode: command.reasonCode,
                detail: command.detail
            });
            const event = await this.repository.appendEvent(client, {
                eventId: crypto.randomUUID(),
                interactionId: room.id,
                eventType: 'interaction.reported',
                actorType: 'creator',
                actorUserId: actorId,
                subjectUserId: actorId,
                correlationId: command.commandId,
                stateRevision: savedRoom.revision,
                payload: { itemId: command.itemId, reportOpened: true }
            });
            const body = {
                success: true,
                interactionId: room.id,
                revision: savedRoom.revision,
                status: 'reported',
                reportKey,
                event
            };
            return saveParticipantCommand(this, client, {
                context,
                body,
                event,
                room: savedRoom,
                audience: 'creator',
                command: {
                    interactionId: room.id,
                    actorUserId: actorId,
                    commandId: command.commandId,
                    commandType: 'interaction.report',
                    semanticHash: hash,
                    expectedRevision: command.expectedRevision,
                    eventId: event.eventId,
                    status: 201,
                    body
                },
                audit: {
                    interactionId: room.id,
                    actorUserId: actorId,
                    actorType: 'creator',
                    action: 'live.interaction.reported',
                    requestId: context.requestId,
                    details: { reportKey, itemId: command.itemId }
                }
            });
        });
        return this.afterCommit(result);
    },

    async moderate(ownerUsername, input, context = {}) {
        const command = validateModeration(input);
        const hash = semanticHash({ action: 'moderate', ...command });
        const result = await this.repository.withTransaction(async client => {
            const locked = await this.lockContext(client, command.interactionId, ownerUsername);
            const room = locked?.room;
            const accounts = locked?.accounts || {};
            this.assertOwner(ownerUsername, accounts.owner);
            if (!room || room.memberRole !== 'owner' || room.status !== 'reported') {
                throw this.serviceError('LIVE_REPORT_NOT_FOUND', 404, 'Reported interaction not found');
            }

            const existing = await this.repository.findCommand(
                client,
                room.id,
                room.ownerUserId,
                command.commandId
            );
            const replay = this.replay(existing, hash);
            if (replay) return { body: replay };
            requireRevision(this, room, command.expectedRevision);

            const resolved = await this.repository.resolveReport(
                client,
                command.reportId,
                room.ownerUserId,
                command.resolution
            );
            if (!resolved || Number(resolved.report.interaction_id) !== room.id) {
                throw this.serviceError('LIVE_REPORT_NOT_FOUND', 404, 'Report not found');
            }
            const savedRoom = {
                ...room,
                ...resolved.room,
                creatorUsername: room.creatorUsername,
                ownerUsername: room.ownerUsername
            };
            const event = await this.repository.appendEvent(client, {
                eventId: crypto.randomUUID(),
                interactionId: room.id,
                eventType: 'interaction.report_resolved',
                actorType: 'owner',
                actorUserId: room.ownerUserId,
                subjectUserId: room.creatorUserId,
                correlationId: command.commandId,
                stateRevision: savedRoom.revision,
                payload: { reportId: command.reportId, resolution: command.resolution }
            });
            const body = {
                success: true,
                interactionId: room.id,
                revision: savedRoom.revision,
                status: 'closed',
                reportStatus: command.resolution,
                event
            };
            return saveParticipantCommand(this, client, {
                context,
                body,
                event,
                room: savedRoom,
                audience: 'creator',
                command: {
                    interactionId: room.id,
                    actorUserId: room.ownerUserId,
                    commandId: command.commandId,
                    commandType: 'interaction.report.moderate',
                    semanticHash: hash,
                    expectedRevision: command.expectedRevision,
                    eventId: event.eventId,
                    status: 200,
                    body
                },
                audit: {
                    interactionId: room.id,
                    actorUserId: room.ownerUserId,
                    actorType: 'owner',
                    action: 'live.report.moderated',
                    requestId: context.requestId,
                    details: { reportId: command.reportId, resolution: command.resolution }
                }
            });
        });
        return this.afterCommit(result);
    }
};

module.exports = participantCommands;
