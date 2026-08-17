'use strict';

const formatterCache = new Map();

function validInstant(value) {
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
        throw new TypeError('Daily calendar requires a valid server instant');
    }
    return value;
}

function canonicalTimezone(value) {
    if (typeof value !== 'string' || value.length < 1 || value.length > 100
        || value.trim() !== value || !/^[A-Za-z0-9_+./-]+$/.test(value)) {
        throw new TypeError('Invalid IANA timezone');
    }
    try {
        return new Intl.DateTimeFormat('en-CA', { timeZone: value }).resolvedOptions().timeZone;
    } catch {
        throw new TypeError('Invalid IANA timezone');
    }
}

function formatter(timezone) {
    const canonical = canonicalTimezone(timezone);
    if (!formatterCache.has(canonical)) {
        formatterCache.set(canonical, new Intl.DateTimeFormat('en-CA-u-ca-iso8601', {
            timeZone: canonical,
            calendar: 'iso8601',
            numberingSystem: 'latn',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23'
        }));
    }
    return { canonical, value: formatterCache.get(canonical) };
}

function localParts(instant, timezone) {
    validInstant(instant);
    const selected = formatter(timezone);
    const fields = Object.fromEntries(selected.value.formatToParts(instant)
        .filter(part => part.type !== 'literal')
        .map(part => [part.type, part.value]));
    const parts = {
        year: Number(fields.year),
        month: Number(fields.month),
        day: Number(fields.day),
        hour: Number(fields.hour),
        minute: Number(fields.minute),
        second: Number(fields.second)
    };
    if (!Number.isInteger(parts.year) || !Number.isInteger(parts.month)
        || !Number.isInteger(parts.day) || !Number.isInteger(parts.hour)
        || !Number.isInteger(parts.minute) || !Number.isInteger(parts.second)) {
        throw new TypeError('Unable to resolve IANA calendar fields');
    }
    return Object.freeze({ ...parts, timezone: selected.canonical });
}

function pad(value) {
    return String(value).padStart(2, '0');
}

function calendarKey(parts) {
    return `${String(parts.year).padStart(4, '0')}-${pad(parts.month)}-${pad(parts.day)}`;
}

function calendarKeyForInstant(instant, timezone) {
    return calendarKey(localParts(validInstant(instant), timezone));
}

function utcEpoch(parts) {
    const result = new Date(0);
    result.setUTCFullYear(parts.year, parts.month - 1, parts.day);
    result.setUTCHours(parts.hour || 0, parts.minute || 0, parts.second || 0, 0);
    return result.getTime();
}

function nextCalendarDate(parts) {
    const next = new Date(0);
    next.setUTCFullYear(parts.year, parts.month - 1, parts.day + 1);
    next.setUTCHours(0, 0, 0, 0);
    return Object.freeze({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1,
        day: next.getUTCDate(), hour: 0, minute: 0, second: 0 });
}

function instantForLocalMidnight(dateParts, timezone) {
    const target = { year: dateParts.year, month: dateParts.month, day: dateParts.day,
        hour: 0, minute: 0, second: 0 };
    const targetEpoch = utcEpoch(target);
    let candidate = targetEpoch;
    for (let iteration = 0; iteration < 6; iteration += 1) {
        const observed = localParts(new Date(candidate), timezone);
        const adjustment = targetEpoch - utcEpoch(observed);
        candidate += adjustment;
        if (adjustment === 0) break;
    }
    const resolved = localParts(new Date(candidate), timezone);
    if (resolved.year !== target.year || resolved.month !== target.month || resolved.day !== target.day
        || resolved.hour !== 0 || resolved.minute !== 0 || resolved.second !== 0) {
        throw new TypeError('IANA timezone has no resolvable local midnight for this date');
    }
    return new Date(candidate);
}

function dailyCalendarWindow(instant, timezone) {
    const now = validInstant(instant);
    const today = localParts(now, timezone);
    const canonical = today.timezone;
    const start = instantForLocalMidnight(today, canonical);
    const end = instantForLocalMidnight(nextCalendarDate(today), canonical);
    if (!(start <= now && now < end) || end <= start) {
        throw new TypeError('Invalid creator-local daily calendar window');
    }
    return Object.freeze({
        calendarKey: calendarKey(today),
        timezone: canonical,
        windowStart: start.toISOString(),
        windowEnd: end.toISOString()
    });
}

module.exports = {
    calendarKeyForInstant,
    canonicalTimezone,
    dailyCalendarWindow,
    instantForLocalMidnight,
    localParts
};
