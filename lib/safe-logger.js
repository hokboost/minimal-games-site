'use strict';

const crypto = require('crypto');

const MAX_STRING_LENGTH = 1000;
const SECRET_KEY_PATTERN = /(?:pass(?:word)?|passwd|secret|token|cookie|authorization|csrf|api[_-]?key|sessdata|bili_jct)/i;
const IDENTIFIER_KEY_PATTERN = /^(?:user(?:name)?|adminUsername|targetUsername|ip(?:Address)?|clientIP|host|database|roomId|workerId|taskId|exchangeId|authorizationId|providerTransactionId|sessionId)$/i;
const installedSymbol = Symbol.for('minimal-games.safe-console-installed');

function cleanString(value) {
    return String(value)
        .replace(/[\r\n\u2028\u2029]+/g, '\\n')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .replace(/\b(?:postgres(?:ql)?):\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]')
        .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
        .replace(/((?:pass(?:word)?|passwd|secret|token|cookie|authorization|csrf|api[_-]?key|sessdata|bili_jct)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
        .replace(/\b[A-Za-z0-9_-]{64,}\b/g, '[REDACTED_LONG_VALUE]')
        .slice(0, MAX_STRING_LENGTH);
}

function hashIdentifier(value) {
    const secret = process.env.LOG_HASH_SECRET || process.env.SESSION_SECRET || 'local-log-redaction';
    return `id:${crypto.createHmac('sha256', secret).update(String(value)).digest('hex').slice(0, 12)}`;
}

function sanitizeLogValue(value, depth = 0, seen = new WeakSet(), key = '') {
    if (IDENTIFIER_KEY_PATTERN.test(key) && value !== null && value !== undefined) {
        return hashIdentifier(value);
    }
    if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') {
        return value;
    }
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'string') {
        if (SECRET_KEY_PATTERN.test(key)) return '[REDACTED]';
        if (IDENTIFIER_KEY_PATTERN.test(key)) return hashIdentifier(value);
        return cleanString(value);
    }
    if (value instanceof Error) {
        return {
            name: cleanString(value.name || 'Error'),
            code: value.code ? cleanString(value.code) : undefined,
            message: process.env.NODE_ENV === 'production'
                ? 'Internal error details redacted'
                : cleanString(value.message || 'Unexpected error')
        };
    }
    if (typeof value !== 'object') return cleanString(value);
    if (depth >= 4 || seen.has(value)) return '[TRUNCATED]';
    seen.add(value);
    if (Array.isArray(value)) {
        return value.slice(0, 20).map((item) => sanitizeLogValue(item, depth + 1, seen));
    }

    const output = {};
    for (const [property, propertyValue] of Object.entries(value).slice(0, 40)) {
        const cleanProperty = cleanString(property).slice(0, 80);
        output[cleanProperty] = SECRET_KEY_PATTERN.test(property)
            ? '[REDACTED]'
            : sanitizeLogValue(propertyValue, depth + 1, seen, property);
    }
    return output;
}

function installSafeConsole() {
    if (globalThis[installedSymbol]) return;
    globalThis[installedSymbol] = true;
    for (const method of ['log', 'warn', 'error', 'info']) {
        const original = console[method].bind(console);
        console[method] = (...values) => original(...values.map((value) => sanitizeLogValue(value)));
    }
}

module.exports = {
    cleanString,
    installSafeConsole,
    sanitizeLogValue
};
