'use strict';
(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LiveReplayState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
    function create({
        interactionId,
        lastSequence = 0,
        recent = []
    }) {
        const state = {
            interactionId: Number(interactionId),
            lastSequence: Number(lastSequence),
            seen: new Set(recent.map(event => event.eventId)),
            recent: [...recent].slice(-30)
        };
        state.synchronize = (sequence, events = []) => {
            state.lastSequence = Math.max(state.lastSequence, Number(sequence) || 0);
            for (const event of events) {
                state.seen.add(event.eventId);
                if (event.sequence > state.lastSequence) state.lastSequence = event.sequence;
            }
            state.recent = [...events].slice(-30);
        };
        state.apply = event => {
            if (!event || event.version !== 1 || Number(event.interactionId) !== state.interactionId) return {
                kind: 'invalid'
            };
            if (state.seen.has(event.eventId) || Number(event.sequence) <= state.lastSequence) {
                if (event.eventId) state.seen.add(event.eventId);
                return {
                    kind: 'duplicate',
                    ack: state.lastSequence
                };
            }
            if (Number(event.sequence) !== state.lastSequence + 1) return {
                kind: 'gap',
                after: state.lastSequence
            };
            state.seen.add(event.eventId);
            state.lastSequence = Number(event.sequence);
            state.recent = [...state.recent, event].slice(-30);
            return {
                kind: 'applied',
                ack: state.lastSequence
            };
        };
        return state;
    }
    return Object.freeze({
        create
    });
});