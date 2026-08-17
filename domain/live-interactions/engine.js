'use strict';

const {
    LiveProtocolError
} = require('./protocol');

const FINAL_ITEM_STATES = new Set(['accepted', 'declined', 'closed', 'reported', 'expired']);

function transitionItem(item, action, input = {}) {
    if (!item || item.status !== 'delivered') {
        throw new LiveProtocolError('LIVE_ITEM_STATE_CONFLICT', 'Interaction item is no longer actionable');
    }
    let status;
    let eventType;
    let eventPayload;
    if (action === 'accept') {
        status = 'accepted';
        eventType = 'interaction.item_accepted';
        eventPayload = {
            itemId: item.id,
            itemType: item.itemType
        };
    } else if (action === 'decline') {
        status = 'declined';
        eventType = 'interaction.item_declined';
        eventPayload = {
            itemId: item.id,
            itemType: item.itemType
        };
    } else if (action === 'vote' && item.itemType === 'poll') {
        const options = item.payload?.pollOptions || [];
        if (!Number.isInteger(input.optionIndex) || input.optionIndex < 0 || input.optionIndex >= options.length) {
            throw new LiveProtocolError('LIVE_INVALID_INPUT', 'Invalid poll option', 'optionIndex');
        }
        status = 'accepted';
        eventType = 'interaction.poll_voted';
        eventPayload = {
            itemId: item.id,
            optionIndex: input.optionIndex,
            optionLabel: options[input.optionIndex]
        };
    } else {
        throw new LiveProtocolError('LIVE_ITEM_ACTION_INVALID', 'Action is not valid for this item');
    }
    return Object.freeze({
        status,
        eventType,
        eventPayload,
        nextItemRevision: item.revision + 1
    });
}

function nextRoomState(room, action, input = {}) {
    if (!room || room.status !== 'active') throw new LiveProtocolError('LIVE_ROOM_CLOSED', 'Interaction is not active');
    const next = {
        revision: room.revision + 1,
        status: room.status,
        availability: room.availability,
        mutedUntil: room.mutedUntil
    };
    if (action === 'availability') {
        next.availability = input.availability;
    } else if (action === 'mute') {
        next.mutedUntil = input.mutedUntil;
        next.availability = 'offline';
    } else if (action === 'leave') {
        next.status = 'left';
        next.availability = 'offline';
    } else if (action === 'report') {
        next.status = 'reported';
        next.availability = 'offline';
    } else if (action !== 'item' && action !== 'send') {
        throw new LiveProtocolError('LIVE_ACTION_INVALID', 'Invalid interaction action');
    }
    return Object.freeze(next);
}

function isMuted(room, now = new Date()) {
    return Boolean(room?.mutedUntil && new Date(room.mutedUntil).getTime() > now.getTime());
}

module.exports = {
    FINAL_ITEM_STATES,
    isMuted,
    nextRoomState,
    transitionItem
};