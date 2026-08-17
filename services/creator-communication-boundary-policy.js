'use strict';

const DAY_MINUTES = 24 * 60;
const WEEKDAYS = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

const ITEM_PREFERENCE_KEYS = Object.freeze({
    nudge: 'owner_notes',
    clue: 'owner_notes',
    celebration: 'celebrations',
    story_letter: 'owner_notes',
    quest_invite: 'quest_invites',
    poll: 'owner_notes',
    game_invite: 'game_invites',
    story_intervention: 'owner_notes',
    reward_grant: 'celebrations'
});

function localClock(timezone, now) {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
        throw new TypeError('Communication boundary requires a valid server time');
    }
    let parts;
    try {
        parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone || 'UTC',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(now).map(part => [part.type, part.value]));
    } catch {
        return null;
    }
    const weekday = WEEKDAYS.indexOf(parts.weekday);
    const hour = Number(parts.hour);
    const minute = Number(parts.minute);
    if (weekday < 0 || !Number.isInteger(hour) || !Number.isInteger(minute)) return null;
    return Object.freeze({ weekday, minute: hour * 60 + minute });
}

function windowContains(window, clock) {
    if (!clock || window?.enabled !== true) return false;
    const weekday = Number(window.weekday);
    const start = Number(window.startMinute);
    const end = Number(window.endMinute);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6
        || !Number.isInteger(start) || start < 0 || start >= DAY_MINUTES
        || !Number.isInteger(end) || end < 0 || end >= DAY_MINUTES
        || start === end) return false;
    if (start < end) {
        return weekday === clock.weekday && clock.minute >= start && clock.minute < end;
    }
    // An overnight row belongs to its starting weekday. Its after-midnight
    // segment is therefore matched against the previous local weekday.
    return (weekday === clock.weekday && clock.minute >= start)
        || ((weekday + 1) % 7 === clock.weekday && clock.minute < end);
}

function preferenceValue(preferences, type, key) {
    if (!key) return 'neutral';
    if (Array.isArray(preferences)) {
        return preferences.find(value => value?.type === type && value?.key === key)?.value || 'neutral';
    }
    if (!preferences || typeof preferences !== 'object') return 'neutral';
    if (preferences[type] && typeof preferences[type] === 'object') {
        return preferences[type][key] || 'neutral';
    }
    return preferences[`${type}:${key}`]
        || (type === 'communication' ? preferences[key] : null)
        || 'neutral';
}

function accountActive(account) {
    return Boolean(account && account.authorized === true && account.deactivated !== true
        && account.account_locked !== true && account.accountLocked !== true);
}

function optedIn(account) {
    return account?.live_interaction_opt_in === true || account?.liveInteractionOptIn === true;
}

function reportBlocks(report) {
    if (!report) return false;
    const status = report.status || report.reportStatus;
    const reconsentedAt = report.creator_reconsented_at || report.creatorReconsentedAt;
    return ['open', 'reviewing'].includes(status)
        || (['resolved', 'dismissed'].includes(status) && !reconsentedAt);
}

function roomMuted(room, now) {
    const value = room?.mutedUntil || room?.creatorMutedUntil || room?.creator_muted_until;
    return Boolean(value && Number.isFinite(new Date(value).getTime())
        && new Date(value).getTime() > now.getTime());
}

function evaluateCommunicationBoundary({
    account,
    preferences = {},
    quietHours = [],
    interactionWindows = [],
    room = null,
    report = null,
    itemType = null,
    gameId = null,
    now = new Date()
} = {}) {
    const clock = localClock(account?.timezone, now);
    const quiet = Array.isArray(quietHours) && quietHours.some(window => windowContains(window, clock));
    const enabledWindows = Array.isArray(interactionWindows)
        ? interactionWindows.filter(window => window?.enabled === true) : [];
    const liveWindows = enabledWindows.filter(window => ['live', 'either'].includes(window.mode));
    const preferred = enabledWindows.length === 0
        || liveWindows.some(window => windowContains(window, clock));
    const asyncWindows = enabledWindows.filter(window => ['async', 'either'].includes(window.mode));
    const asyncPreferred = enabledWindows.length === 0
        || asyncWindows.some(window => windowContains(window, clock));
    const muted = roomMuted(room, now);
    const allMessagesBlocked = preferenceValue(preferences, 'communication', 'all_messages') === 'block';
    const itemPreferenceKey = ITEM_PREFERENCE_KEYS[itemType] || null;
    const itemBlocked = itemPreferenceKey
        ? preferenceValue(preferences, 'communication', itemPreferenceKey) === 'block' : false;
    const gameBlocked = gameId
        ? preferenceValue(preferences, 'game', String(gameId)) === 'block' : false;
    const unresolvedReport = reportBlocks(report);
    let reason = null;
    if (!accountActive(account)) reason = 'creator_account_inactive';
    else if (!optedIn(account)) reason = 'global_opt_out';
    else if (allMessagesBlocked) reason = 'communication_blocked';
    else if (unresolvedReport) reason = 'unresolved_report';
    else if (muted) reason = 'room_muted';
    else if (gameBlocked) reason = 'game_preference_blocked';
    else if (itemBlocked) reason = 'item_preference_blocked';
    const allowDurable = reason === null;
    const allowRealtime = allowDurable && !quiet && preferred;
    const allowInteractive = allowRealtime;
    return Object.freeze({
        allowDurable,
        allowRealtime,
        allowInteractive,
        blocked: allMessagesBlocked || itemBlocked || gameBlocked || unresolvedReport || !accountActive(account)
            || !optedIn(account),
        muted,
        quiet,
        preferred,
        asyncPreferred,
        reason,
        realtimeReason: allowDurable && quiet ? 'quiet_hours'
            : allowDurable && !preferred ? 'outside_preferred_window' : reason
    });
}

module.exports = {
    ITEM_PREFERENCE_KEYS,
    accountActive,
    evaluateCommunicationBoundary,
    localClock,
    preferenceValue,
    reportBlocks,
    windowContains
};
