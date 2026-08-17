'use strict';

class LiveSocketGateway {
    constructor({
        service,
        enabled,
        authorize
    }) {
        if (!service?.catchUp || typeof authorize !== 'function') throw new TypeError(
            'Live socket gateway requires service and session authorizer');
        this.service = service;
        this.enabled = Boolean(enabled);
        this.authorize = authorize;
    }
    attach(socket) {
        const auth = socket.authenticatedUser;
        if (!auth?.username || !auth.userId) return;
        socket.join(`live:user:${auth.userId}`);
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
                const result = await this.service.catchUp(auth.username, {
                    interactionId: input?.interactionId,
                    afterSequence: input?.afterSequence ?? 0,
                    limit: input?.limit ?? 100
                });
                socket.join(`live:interaction:${Number(input.interactionId)}`);
                socket.emit('live:events', {
                    version: 1,
                    ...result
                });
                return respond(callback, {
                    success: true,
                    lastSequence: result.lastSequence
                });
            } catch (error) {
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