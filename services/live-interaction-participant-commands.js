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
                    audience: 'both',
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

            if (action === 'accept') {
                const boundary = await this.boundaries(client, locked.accounts.creator, room, {
                    itemType: item.itemType,
                    gameId: item.itemType === 'game_invite' ? item.payload?.referenceId : null
                });
                if (!boundary.state.allowDurable) {
                    throw this.serviceError('LIVE_CONSENT_BLOCKED', 403,
                        `Creator communication boundary blocks this acceptance (${boundary.state.reason})`);
                }
            }

            const transition = transitionItem(item, action, command);
            const savedRoom = await this.repository.advanceRoom(client, room, nextRoomState(room, 'item'));
            const savedItem = await this.repository.transitionItem(client, item, transition);
            const event = await this.repository.appendEvent(client, {
                eventId: crypto.randomUUID(),
                interactionId: room.id,
                eventType: transition.eventType,
                audience: 'both',
                actorType: 'creator',
                actorUserId: actorId,
                subjectUserId: actorId,
                correlationId: command.commandId,
                stateRevision: savedRoom.revision,
                payload: transition.eventPayload
            });
            if (this.achievementService?.recordTrustedEvent) await this.achievementService.recordTrustedEvent(client, username, {
                sourceType:'live_interaction',sourceEventId:`achievement-live-resolved:${event.eventId}`,
                eventType:'live.item.resolved',occurredAt:this.clock().toISOString(),
                payload:{interactionId:room.id,itemId:item.id,type:item.itemType,status:savedItem.status}
            }, context);
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
            if (this.consentCoordinator && ['mute', 'leave'].includes(action)) {
                await this.consentCoordinator.withdrawInteraction(client, room.id,
                    action === 'mute' ? 'room_muted' : 'participant_left', {
                        actorUserId: actorId,
                        actorUsername: username,
                        requestId: context.requestId
                    });
            }

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
                audience: 'both',
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
                audience: action === 'availability' && !boundary.state.allowRealtime
                    ? 'creator' : 'both',
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
            if (this.consentCoordinator) {
                await this.consentCoordinator.withdrawInteraction(client, room.id, 'unresolved_report', {
                    actorUserId: actorId,
                    actorUsername: username,
                    requestId: context.requestId
                });
            }
            await this.repository.markRoomMembersInactive(client, room.id);
            const event = await this.repository.appendEvent(client, {
                eventId: crypto.randomUUID(),
                interactionId: room.id,
                eventType: 'interaction.reported',
                audience: 'creator',
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

    async moderate(moderatorUsername, input, context = {}) {
        const command = validateModeration(input);
        const hash = semanticHash({ action: 'moderate', ...command });
        const result = await this.repository.withTransaction(async client => {
            const locked = await this.repository.lockModerationContext(client, {
                interactionId: command.interactionId,
                reportId: command.reportId,
                moderatorUsername
            });
            const room = locked?.room;
            const moderator = locked?.moderator;
            if (!locked || !this.ownerUsername || locked.owner?.username !== this.ownerUsername
                || !moderator || moderator.is_admin !== true || moderator.authorized !== true
                || moderator.deactivated === true || moderator.account_locked === true
                || moderator.username === this.ownerUsername
                || Number(moderator.id) === Number(locked.owner?.id)) {
                throw this.serviceError('LIVE_INDEPENDENT_MODERATOR_REQUIRED', 403,
                    'An independent active moderator is required');
            }
            if (!room || room.status !== 'reported' || locked.report?.status
                && !['open', 'reviewing'].includes(locked.report.status)) {
                throw this.serviceError('LIVE_REPORT_NOT_FOUND', 404, 'Reported interaction not found');
            }

            const existing = await this.repository.findCommand(
                client,
                room.id,
                Number(moderator.id),
                command.commandId
            );
            const replay = this.replay(existing, hash);
            if (replay) return { body: replay };
            requireRevision(this, room, command.expectedRevision);

            const resolved = await this.repository.resolveReport(
                client,
                command.reportId,
                Number(moderator.id),
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
                audience: 'creator',
                actorType: 'moderator',
                actorUserId: Number(moderator.id),
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
            await this.repository.appendSensitiveReadAudit(client, {
                actorUserId: Number(moderator.id),
                actorUsername: moderator.username,
                interactionId: room.id,
                reportId: command.reportId,
                accessKind: 'moderation_evidence',
                decision: 'granted',
                fields: ['reason_code', 'detail', 'item_id', 'reporter_user_id'],
                requestId: context.requestId,
                metadata: { purpose: 'resolution', resolution: command.resolution }
            });
            return saveParticipantCommand(this, client, {
                context,
                body,
                event,
                room: savedRoom,
                audience: 'creator',
                command: {
                    interactionId: room.id,
                    actorUserId: Number(moderator.id),
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
                    actorUserId: Number(moderator.id),
                    actorType: 'moderator',
                    action: 'live.report.moderated',
                    requestId: context.requestId,
                    details: { reportId: command.reportId, resolution: command.resolution,
                        moderatorUsername: moderator.username }
                }
            });
        });
        return this.afterCommit(result);
    }
};

module.exports = participantCommands;
