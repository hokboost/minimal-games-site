'use strict';

const CONSENT_REASONS = Object.freeze([
    'live_room_inactive', 'membership_inactive', 'global_opt_out',
    'unresolved_report', 'room_muted', 'communication_blocked',
    'game_preference_blocked', 'creator_account_inactive',
    'owner_account_inactive', 'owner_role_invalid', 'participant_left',
    'account_deactivated', 'account_locked'
]);

function accountActive(account) {
    return Boolean(account && account.authorized === true && account.deactivated !== true
        && account.account_locked !== true);
}

function evaluateCoopConsent({ run, creator, owner, room, ownerUsername,
    communicationBoundary = null, now = new Date() }) {
    if (!run || run.mode !== 'coop') return Object.freeze({ allowed: true, reason: null });
    if (!accountActive(creator)) {
        return Object.freeze({ allowed: false,
            reason: creator?.account_locked === true ? 'account_locked' : 'creator_account_inactive' });
    }
    if (!accountActive(owner)) {
        return Object.freeze({ allowed: false,
            reason: owner?.account_locked === true ? 'account_locked' : 'owner_account_inactive' });
    }
    if (!ownerUsername || owner.username !== ownerUsername || owner.is_admin !== true) {
        return Object.freeze({ allowed: false, reason: 'owner_role_invalid' });
    }
    if (!room || Number(room.id) !== Number(run.liveInteractionId)
        || Number(room.creatorUserId) !== Number(run.creatorUserId)
        || Number(room.ownerUserId) !== Number(run.ownerUserId)
        || room.status !== 'active') {
        return Object.freeze({ allowed: false, reason: 'live_room_inactive' });
    }
    if (room.creatorMemberStatus !== 'active' || room.ownerMemberStatus !== 'active') {
        return Object.freeze({ allowed: false, reason: 'membership_inactive' });
    }
    if (communicationBoundary && communicationBoundary.allowed !== true) {
        return Object.freeze({
            allowed: false,
            reason: communicationBoundary.reason,
            withdrawal: communicationBoundary.withdrawal !== false
        });
    }
    // Compatibility for isolated callers that have not yet supplied the
    // authoritative policy result. Production always supplies it.
    if (!communicationBoundary) {
        if (room.liveInteractionOptIn !== true) {
            return Object.freeze({ allowed: false, reason: 'global_opt_out' });
        }
        if (room.reportStatus && (['open', 'reviewing'].includes(room.reportStatus)
            || (['resolved', 'dismissed'].includes(room.reportStatus) && !room.creatorReconsentedAt))) {
            return Object.freeze({ allowed: false, reason: 'unresolved_report' });
        }
        if (room.mutedUntil && new Date(room.mutedUntil).getTime() > now.getTime()) {
            return Object.freeze({ allowed: false, reason: 'room_muted' });
        }
        if (room.allMessagesPreference === 'block') {
            return Object.freeze({ allowed: false, reason: 'communication_blocked' });
        }
        if (room.gamePreference === 'block') {
            return Object.freeze({ allowed: false, reason: 'game_preference_blocked' });
        }
    }
    return Object.freeze({ allowed: true, reason: null, withdrawal: false });
}

module.exports = { CONSENT_REASONS, evaluateCoopConsent };
