'use strict';

const crypto = require('crypto');

const SIGNATURE_VERSION = '3';

function stableStringify(value) {
    if (value === undefined || typeof value === 'function') return 'null';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    return `{${Object.keys(value).sort().map((key) => (
        `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(',')}}`;
}

function stableStringifyBody(body) {
    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) return '';
    return stableStringify(body);
}

function canonicalRequest({ timestamp, nonce, workerId, method, path, body }) {
    return [
        SIGNATURE_VERSION,
        String(timestamp),
        String(nonce),
        String(workerId),
        String(method).toUpperCase(),
        String(path),
        stableStringifyBody(body)
    ].join('\n');
}

function signRequest(secret, request) {
    return crypto.createHmac('sha256', secret)
        .update(canonicalRequest(request))
        .digest('hex');
}

function signaturesMatch(actual, expected) {
    if (typeof actual !== 'string' || !/^[a-fA-F0-9]{64}$/.test(actual)) return false;
    const actualBuffer = Buffer.from(actual, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    return actualBuffer.length === expectedBuffer.length
        && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

module.exports = {
    SIGNATURE_VERSION,
    canonicalRequest,
    signRequest,
    signaturesMatch,
    stableStringify,
    stableStringifyBody
};
