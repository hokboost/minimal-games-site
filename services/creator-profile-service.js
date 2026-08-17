'use strict';

const {
    CreatorValidationError,
    VISIBILITIES,
    validateInteractionWindows,
    validatePreferences,
    validateProfile,
    validateQuietHours,
    validateRoomId
} = require('../domain/creators/profile');
const { projectRelationship } = require('../domain/creators/relationship');

class CreatorServiceError extends Error {
    constructor(code, status, message) {
        super(message);
        this.name = 'CreatorServiceError';
        this.code = code;
        this.status = status;
    }
}

function boundedNote(value, maximum = 300) {
    const note = typeof value === 'string' ? value.normalize('NFKC').trim() : '';
    if (note.length > maximum || /[\u0000-\u001f\u007f]/u.test(note)) {
        throw new CreatorValidationError('Invalid note', 'note');
    }
    return note;
}

function positiveId(value, field = 'id') {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) {
        throw new CreatorValidationError(`Invalid ${field}`, field);
    }
    return id;
}

class CreatorProfileService {
    constructor({ repository, gameIds = [], consentCoordinator = null, ownerUsername = null }) {
        if (!repository?.withTransaction || !repository?.loadDashboard) {
            throw new TypeError('CreatorProfileService requires a creator repository');
        }
        this.repository = repository;
        this.gameIds = [...new Set(gameIds.map(String))];
        this.consentCoordinator = consentCoordinator;
        this.ownerUsername = ownerUsername || null;
    }

    async requireUser(client, username) {
        const user = await this.repository.lockUser(client, username);
        if (!user) throw new CreatorServiceError('CREATOR_ACCOUNT_UNAVAILABLE', 403, 'Account unavailable');
        return user;
    }

    async finalize(context, client, status, body) {
        if (typeof context?.finalizeIdempotency === 'function') {
            await context.finalizeIdempotency(client, status, body);
        }
    }

    async dashboard(username) {
        const dashboard = await this.repository.loadDashboard(username);
        if (!dashboard) throw new CreatorServiceError('CREATOR_ACCOUNT_UNAVAILABLE', 403, 'Account unavailable');
        return { ...dashboard, gameIds: this.gameIds };
    }

    async updateProfile(username, input, context = {}) {
        const profile = validateProfile(input);
        return this.repository.withTransaction(async (client) => {
            const user = await this.requireUser(client, username);
            const previous = await this.repository.getProfile(client, user.id);
            const currentVersion = previous?.version || 0;
            if (profile.expectedVersion !== currentVersion) {
                throw new CreatorServiceError('CREATOR_PROFILE_VERSION_CONFLICT', 409, 'Profile changed in another session');
            }
            const saved = await this.repository.saveProfile(client, user.id, profile);
            if (this.consentCoordinator && previous?.liveInteractionOptIn === true
                && saved.liveInteractionOptIn !== true) {
                await this.consentCoordinator.withdrawCreator(client, Number(user.id), 'global_opt_out', {
                    actorUserId: Number(user.id),
                    actorUsername: username,
                    requestId: context.requestId
                }, { closeRooms: true });
            }
            await this.repository.appendConsentEvent(client, {
                userId: user.id,
                actorType: 'creator',
                actorUsername: username,
                eventType: previous ? 'creator.profile.updated' : 'creator.profile.created',
                previousState: previous || {},
                nextState: saved,
                requestId: context.requestId
            });
            if (!previous) {
                const inserted = await this.repository.appendRelationshipEvent(client, {
                    userId: user.id,
                    eventType: 'creator.profile.created',
                    xpDelta: 10,
                    sourceType: 'creator_profile',
                    sourceId: 'onboarding-v1',
                    summaryZh: '创建主播世界资料',
                    summaryEn: 'Created a Creator World profile'
                });
                const current = await this.repository.lockRelationship(client, user.id);
                if (inserted) {
                    await this.repository.saveRelationship(
                        client,
                        user.id,
                        projectRelationship(current.totalXp + 10)
                    );
                }
                await this.repository.ensureWelcomeMemory(client, user.id);
                await this.repository.ensureWelcomeInbox(client, user.id);
            }
            const body = { success: true, profile: saved };
            await this.finalize(context, client, 200, body);
            return body;
        });
    }

    async updatePreferences(username, input, context = {}) {
        const preferences = validatePreferences(input?.preferences, { gameIds: this.gameIds });
        return this.repository.withTransaction(async (client) => {
            const user = await this.requireUser(client, username);
            const previous = await this.repository.listPreferences(client, user.id);
            await this.repository.replacePreferences(client, user.id, preferences);
            if (this.consentCoordinator) {
                const globalBlock = preferences.some(preference => preference.type === 'communication'
                    && preference.key === 'all_messages' && preference.value === 'block');
                if (globalBlock) {
                    await this.consentCoordinator.withdrawCreator(client, Number(user.id),
                        'communication_blocked', {
                            actorUserId: Number(user.id),
                            actorUsername: username,
                            requestId: context.requestId
                        }, { closeRooms: true });
                } else {
                    await this.consentCoordinator.withdrawBlockedGames(client, Number(user.id), {
                        actorUserId: Number(user.id),
                        actorUsername: username,
                        requestId: context.requestId
                    });
                }
            }
            await this.repository.appendConsentEvent(client, {
                userId: user.id,
                actorType: 'creator',
                actorUsername: username,
                eventType: 'creator.preferences.replaced',
                previousState: { preferences: previous },
                nextState: { preferences },
                requestId: context.requestId
            });
            const body = { success: true, preferences };
            await this.finalize(context, client, 200, body);
            return body;
        });
    }

    async updateQuietHours(username, input, context = {}) {
        const quietHours = validateQuietHours(input?.quietHours);
        return this.repository.withTransaction(async (client) => {
            const user = await this.requireUser(client, username);
            const previous = await this.repository.listQuietHours(client, user.id);
            await this.repository.replaceQuietHours(client, user.id, quietHours);
            await this.repository.appendConsentEvent(client, {
                userId: user.id,
                actorType: 'creator',
                actorUsername: username,
                eventType: 'creator.quiet_hours.replaced',
                previousState: { quietHours: previous },
                nextState: { quietHours },
                requestId: context.requestId
            });
            const body = { success: true, quietHours };
            await this.finalize(context, client, 200, body);
            return body;
        });
    }

    async updateInteractionWindows(username, input, context = {}) {
        const interactionWindows = validateInteractionWindows(input?.interactionWindows);
        return this.repository.withTransaction(async (client) => {
            const user = await this.requireUser(client, username);
            const profile = await this.repository.getProfile(client, user.id);
            if (!profile) {
                throw new CreatorServiceError('CREATOR_PROFILE_REQUIRED', 409, 'Create a profile with a timezone first');
            }
            const previous = await this.repository.listInteractionWindows(client, user.id);
            await this.repository.replaceInteractionWindows(client, user.id, interactionWindows);
            await this.repository.appendConsentEvent(client, {
                userId: user.id,
                actorType: 'creator',
                actorUsername: username,
                eventType: 'creator.interaction_windows.replaced',
                previousState: { timezone: profile.timezone, interactionWindows: previous },
                nextState: { timezone: profile.timezone, interactionWindows },
                requestId: context.requestId
            });
            const body = { success: true, timezone: profile.timezone, interactionWindows };
            await this.finalize(context, client, 200, body);
            return body;
        });
    }

    async requestRoomBinding(username, input, context = {}) {
        const roomId = validateRoomId(input?.roomId);
        const note = boundedNote(input?.note);
        return this.repository.withTransaction(async (client) => {
            const user = await this.requireUser(client, username);
            if (user.bilibili_room_id === roomId) {
                throw new CreatorServiceError('ROOM_ALREADY_BOUND', 409, 'Room is already bound');
            }
            const active = await this.repository.getActiveRoomRequest(client, user.id);
            if (active) throw new CreatorServiceError('ROOM_REQUEST_ACTIVE', 409, 'An active room request already exists');
            const request = await this.repository.createRoomRequest(client, user, roomId, note);
            await this.repository.appendConsentEvent(client, {
                userId: user.id,
                actorType: 'creator',
                actorUsername: username,
                eventType: 'creator.room_binding.requested',
                previousState: { bilibiliRoomId: user.bilibili_room_id },
                nextState: { requestId: request.id, requestedRoomId: roomId, status: request.status },
                requestId: context.requestId
            });
            const body = { success: true, request };
            await this.finalize(context, client, 201, body);
            return body;
        });
    }

    async cancelRoomBindingRequest(username, requestId, context = {}) {
        const id = positiveId(requestId, 'requestId');
        return this.repository.withTransaction(async (client) => {
            const user = await this.requireUser(client, username);
            const request = await this.repository.cancelRoomRequest(client, user.id, id);
            if (!request) throw new CreatorServiceError('ROOM_REQUEST_NOT_ACTIVE', 409, 'Room request is not active');
            await this.repository.appendConsentEvent(client, {
                userId: user.id,
                actorType: 'creator',
                actorUsername: username,
                eventType: 'creator.room_binding.cancelled',
                previousState: { requestId: id, status: 'active' },
                nextState: { requestId: id, status: 'cancelled' },
                requestId: context.requestId
            });
            const body = { success: true, request };
            await this.finalize(context, client, 200, body);
            return body;
        });
    }

    async updateMemory(username, memoryId, input, context = {}) {
        const id = positiveId(memoryId, 'memoryId');
        const visibility = String(input?.visibility || 'private');
        if (!VISIBILITIES.includes(visibility)) throw new CreatorValidationError('Invalid visibility', 'visibility');
        const state = {
            pinned: input?.pinned === true,
            archived: input?.archived === true,
            hidden: input?.hidden === true,
            visibility
        };
        return this.repository.withTransaction(async (client) => {
            const user = await this.requireUser(client, username);
            const updated = await this.repository.updateMemoryState(client, user.id, id, state);
            if (!updated) throw new CreatorServiceError('MEMORY_NOT_FOUND', 404, 'Memory not found');
            const body = { success: true, memory: { id, ...state } };
            await this.finalize(context, client, 200, body);
            return body;
        });
    }

    async updateInbox(username, messageId, action, context = {}) {
        const id = positiveId(messageId, 'messageId');
        if (!['read', 'archive'].includes(action)) throw new CreatorValidationError('Invalid inbox action', 'action');
        return this.repository.withTransaction(async (client) => {
            const user = await this.requireUser(client, username);
            const updated = await this.repository.updateInboxState(client, user.id, id, action);
            if (!updated) throw new CreatorServiceError('INBOX_MESSAGE_NOT_FOUND', 404, 'Inbox message not found');
            const body = { success: true, message: { id, action } };
            await this.finalize(context, client, 200, body);
            return body;
        });
    }

    async adminSummaries(callerUsername, page = 1, context = {}) {
        const normalizedPage = Number(page);
        const safePage = Number.isSafeInteger(normalizedPage) && normalizedPage > 0 ? normalizedPage : 1;
        const limit = 50;
        return this.repository.withTransaction(async client => {
            const actor = await this.repository.readAdminAccount(client, callerUsername);
            if (!actor || actor.is_admin !== true || actor.authorized !== true
                || actor.deactivated === true || actor.account_locked === true) {
                throw new CreatorServiceError('CREATOR_PROFILE_READ_FORBIDDEN', 403,
                    'Active administrator account required');
            }
            const includeOwnerPrivate = Boolean(this.ownerUsername
                && actor.username === this.ownerUsername);
            const creators = await this.repository.listAdminSummaries(client, {
                limit,
                offset: (safePage - 1) * limit,
                includeOwnerPrivate
            });
            for (const creator of creators) {
                const granted = includeOwnerPrivate && creator.profileVisibility === 'owner';
                await this.repository.appendSensitiveReadAudit(client, {
                    actorUserId: Number(actor.id),
                    actorUsername: actor.username,
                    targetUserId: creator.userId,
                    accessKind: 'owner_profile',
                    decision: granted ? 'granted' : 'redacted',
                    fields: granted ? [
                        'display_name', 'timezone', 'bilibili_room_id', 'live_interaction_opt_in',
                        'relationship', 'room_request'
                    ] : [],
                    requestId: context.requestId,
                    metadata: { configuredOwner: includeOwnerPrivate }
                });
            }
            return { page: safePage, pageSize: limit, creators };
        });
    }

    async exportData(username) {
        const data = await this.repository.exportCreatorData(username);
        if (!data) throw new CreatorServiceError('CREATOR_ACCOUNT_UNAVAILABLE', 403, 'Account unavailable');
        return data;
    }
}

module.exports = { CreatorProfileService, CreatorServiceError };
