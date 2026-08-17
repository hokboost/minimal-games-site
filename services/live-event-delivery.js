'use strict';

const ROLE_AUDIENCES = new Set(['creator', 'owner', 'both']);

function roleRoom(interactionId, role, userId) {
    const id = Number(interactionId);
    const actorId = Number(userId);
    if (!Number.isSafeInteger(id) || id < 1 || !['creator', 'owner'].includes(role)
        || !Number.isSafeInteger(actorId) || actorId < 1) {
        throw new TypeError('Invalid live subscription room identity');
    }
    return `live:interaction:${id}:${role}:user:${actorId}`;
}

class LiveEventDelivery {
    constructor({ sockets, loadEvent, authorizeSession, authorizeRecipient }) {
        if (typeof sockets !== 'function' || typeof loadEvent !== 'function'
            || typeof authorizeSession !== 'function' || typeof authorizeRecipient !== 'function') {
            throw new TypeError('Live event delivery requires socket, event, session, and recipient adapters');
        }
        this.sockets = sockets;
        this.loadEvent = loadEvent;
        this.authorizeSession = authorizeSession;
        this.authorizeRecipient = authorizeRecipient;
    }

    async deliver(delivery) {
        const requested = delivery?.realtimeAudience || 'both';
        if (!ROLE_AUDIENCES.has(requested)) return false;
        const stored = await this.loadEvent(delivery?.eventId || delivery?.event);
        if (!stored || !ROLE_AUDIENCES.has(stored.audience)) return false;
        let emitted = false;
        for (const socket of this.sockets()) {
            const auth = socket?.authenticatedUser;
            const subscription = socket?.liveInteractionSubscriptions?.get?.(stored.interactionId);
            if (!auth || !subscription || subscription.userId !== Number(auth.userId)) continue;
            let sessionAllowed = false;
            try {
                sessionAllowed = await this.authorizeSession(auth);
            } catch {
                sessionAllowed = false;
            }
            if (!sessionAllowed) continue;
            const replayFloor = Number(subscription.replayFloorSequence);
            if (Number.isSafeInteger(replayFloor) && replayFloor >= 0
                && Number(stored.sequence) <= replayFloor) continue;
            let recipientAllowed = false;
            try {
                recipientAllowed = await this.authorizeRecipient(stored, subscription, auth, requested);
            } catch {
                recipientAllowed = false;
            }
            if (!recipientAllowed) continue;
            if (!(subscription.deliveredEventIds instanceof Set)) {
                subscription.deliveredEventIds = new Set();
            }
            if (subscription.deliveredEventIds.has(stored.eventId)) continue;
            socket.emit('live:event', stored);
            subscription.deliveredEventIds.add(stored.eventId);
            if (subscription.deliveredEventIds.size > 256) {
                subscription.deliveredEventIds.delete(subscription.deliveredEventIds.values().next().value);
            }
            emitted = true;
        }
        return emitted;
    }
}

module.exports = { LiveEventDelivery, roleRoom };
