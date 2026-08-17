'use strict';

const TRANSITIONS = Object.freeze({
    offered: Object.freeze(['accepted', 'declined', 'expired']),
    accepted: Object.freeze(['active', 'cancelled']),
    active: Object.freeze(['submitted', 'completed', 'declined', 'expired', 'cancelled']),
    submitted: Object.freeze(['under_review', 'returned']),
    under_review: Object.freeze(['active', 'completed', 'returned', 'rejected']),
    returned: Object.freeze(['submitted', 'declined', 'cancelled']),
    completed: Object.freeze([]),
    declined: Object.freeze([]),
    rejected: Object.freeze([]),
    expired: Object.freeze([]),
    cancelled: Object.freeze([])
});

class QuestTransitionError extends Error {
    constructor(from, to) {
        super(`Quest assignment cannot transition from ${from} to ${to}`);
        this.name = 'QuestTransitionError';
        this.code = 'QUEST_TRANSITION_INVALID';
    }
}

function assertTransition(from, to) {
    if (!TRANSITIONS[from]?.includes(to)) throw new QuestTransitionError(from, to);
    return Object.freeze({ from, to });
}

module.exports = { TRANSITIONS, QuestTransitionError, assertTransition };
