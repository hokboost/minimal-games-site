'use strict';

const { roleRoom } = require('./live-event-delivery');

class LiveSocketGateway {
    constructor({
        service,
        enabled,
        authorize,
        authorizeGameSubscription = null
    }) {
        if (!service?.catchUp || typeof authorize !== 'function') throw new TypeError(
            'Live socket gateway requires service and session authorizer');
        this.service = service;
        this.enabled = Boolean(enabled);
        this.authorize = authorize;
        this.authorizeGameSubscription = authorizeGameSubscription;
    }
    attach(socket) {
        const auth = socket.authenticatedUser;
        if (!auth?.username || !auth.userId) return;
        socket.liveInteractionSubscriptions = new Map();
        const timestamps = [];
        const limited = () => {
            const now = Date.now();
            while (timestamps.length && timestamps[0] < now - 10000) timestamps.shift();
            if (timestamps.length >= 30) return true;
            timestamps.push(now);
            return false;
        };
        const respond = (callback, value) => {
            if (typeof callback === 'function') callback(value);
        };
        const failure = (error) => ({
            success: false,
            code: error?.code || 'LIVE_SOCKET_ERROR',
            message: Number.isInteger(error?.status) ? error.message : 'Live interaction unavailable'
        });
        const current = async callback => {
            let allowed = false;
            try {
                allowed = await this.authorize(auth);
            } catch {
                allowed = false;
            }
            if (allowed) return true;
            respond(callback, {
                success: false,
                code: 'SESSION_REVOKED',
                message: 'Session is no longer authorized'
            });
            socket.disconnect(true);
            return false;
        };
        socket.on('live:subscribe', async (input, callback) => {
            if (!this.enabled) return respond(callback, {
                success: false,
                code: 'FEATURE_DISABLED'
            });
            if (limited()) return respond(callback, {
                success: false,
                code: 'LIVE_RATE_LIMIT'
            });
            if (!await current(callback)) return;
            try {
                const interactionId = Number(input?.interactionId);
                const previous = socket.liveInteractionSubscriptions.get(interactionId);
                if (previous) {
                    socket.leave?.(roleRoom(previous.interactionId, previous.role, previous.userId));
                    socket.liveInteractionSubscriptions.delete(interactionId);
                }
                let subscription;
                if (input?.gameId !== undefined || input?.runId !== undefined) {
                    if (typeof this.authorizeGameSubscription !== 'function') {
                        const unavailable = new Error('Game subscription unavailable');
                        unavailable.code = 'GAME_SUBSCRIPTION_UNAVAILABLE';
                        unavailable.status = 403;
                        throw unavailable;
                    }
                    subscription = await this.authorizeGameSubscription(auth.username, {
                        interactionId,
                        gameId: input?.gameId,
                        runId: input?.runId
                    });
                }
                const result = await this.service.catchUp(auth.username, {
                    interactionId,
                    afterSequence: input?.afterSequence ?? 0,
                    limit: input?.limit ?? 100
                });
                subscription ||= result.subscription;
                if (!subscription || !['creator', 'owner'].includes(subscription.role)
                    || Number(subscription.userId) !== Number(auth.userId)) {
                    const denied = new Error('Active live membership required');
                    denied.code = 'LIVE_MEMBERSHIP_REQUIRED';
                    denied.status = 403;
                    throw denied;
                }
                const preciseRoom = roleRoom(interactionId, subscription.role, auth.userId);
                const replayFloorSequence = Number(result.nextAfter ?? input?.afterSequence ?? 0);
                socket.join(preciseRoom);
                socket.liveInteractionSubscriptions.set(interactionId, {
                    interactionId,
                    role: subscription.role,
                    userId: Number(auth.userId),
                    room: preciseRoom,
                    gameId: input?.gameId || null,
                    runId: input?.runId || null,
                    replayFloorSequence: Number.isSafeInteger(replayFloorSequence)
                        && replayFloorSequence >= 0 ? replayFloorSequence : 0,
                    deliveredEventIds: new Set((result.events || []).map(event => event.eventId))
                });
                socket.emit('live:events', {
                    version: 1,
                    ...result
                });
                return respond(callback, {
                    success: true,
                    lastSequence: result.lastSequence
                });
            } catch (error) {
                const interactionId = Number(input?.interactionId);
                const previous = socket.liveInteractionSubscriptions.get(interactionId);
                if (previous) {
                    socket.leave?.(previous.room || roleRoom(previous.interactionId, previous.role,
                        previous.userId));
                    socket.liveInteractionSubscriptions.delete(interactionId);
                }
                return respond(callback, failure(error));
            }
        });
        socket.on('live:ack', async (input, callback) => {
            if (!this.enabled) return respond(callback, {
                success: false,
                code: 'FEATURE_DISABLED'
            });
            if (limited()) return respond(callback, {
                success: false,
                code: 'LIVE_RATE_LIMIT'
            });
            if (!await current(callback)) return;
            try {
                return respond(callback, await this.service.acknowledge(auth.username, input));
            } catch (error) {
                return respond(callback, failure(error));
            }
        });
        socket.on('live:presence', async (input, callback) => {
            if (!this.enabled) return respond(callback, {
                success: false,
                code: 'FEATURE_DISABLED'
            });
            if (limited()) return respond(callback, {
                success: false,
                code: 'LIVE_RATE_LIMIT'
            });
            if (!await current(callback)) return;
            try {
                return respond(callback, await this.service.creatorAction(auth.username, input,
                    'availability'));
            } catch (error) {
                return respond(callback, failure(error));
            }
        });
    }
}

module.exports = {
    LiveSocketGateway
};
