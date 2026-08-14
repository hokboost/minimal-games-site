'use strict';

const WORKER_ID_PATTERN = /^[A-Za-z0-9._:-]{8,100}$/;

function parseWorkerCredentials(rawValue) {
    if (!rawValue) return new Map();
    let parsed;
    try {
        parsed = JSON.parse(rawValue);
    } catch {
        throw new Error('WORKER_CREDENTIALS_JSON must be valid JSON');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('WORKER_CREDENTIALS_JSON must be an object');
    }
    const credentials = new Map();
    for (const [workerId, value] of Object.entries(parsed)) {
        if (!WORKER_ID_PATTERN.test(workerId)
            || !value || typeof value !== 'object' || Array.isArray(value)
            || Buffer.byteLength(String(value.apiKey || ''), 'utf8') < 32
            || Buffer.byteLength(String(value.hmacSecret || ''), 'utf8') < 32) {
            throw new Error(`Invalid worker credential entry: ${workerId}`);
        }
        credentials.set(workerId, Object.freeze({
            apiKey: String(value.apiKey),
            hmacSecret: String(value.hmacSecret)
        }));
    }
    if (credentials.size === 0) throw new Error('WORKER_CREDENTIALS_JSON must not be empty');
    return credentials;
}

module.exports = { WORKER_ID_PATTERN, parseWorkerCredentials };
