'use strict';

const ADMIN_NAME_PATTERN = /^[\p{L}\p{N}_-]{3,32}$/u;

function parseAdminTotpSecrets(rawValue) {
    if (!rawValue) return new Map();
    let parsed;
    try {
        parsed = JSON.parse(rawValue);
    } catch {
        throw new Error('ADMIN_TOTP_SECRETS_JSON must be valid JSON');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('ADMIN_TOTP_SECRETS_JSON must be an object');
    }
    const secrets = new Map();
    for (const [rawUsername, rawSecret] of Object.entries(parsed)) {
        const username = rawUsername.normalize('NFKC').trim();
        const secret = String(rawSecret || '').replace(/[\s=-]/g, '').toUpperCase();
        if (!ADMIN_NAME_PATTERN.test(username)
            || !/^[A-Z2-7]{16,}$/.test(secret)) {
            throw new Error(`Invalid administrator MFA entry: ${username}`);
        }
        secrets.set(username, secret);
    }
    if (secrets.size === 0) throw new Error('ADMIN_TOTP_SECRETS_JSON must not be empty');
    return secrets;
}

function getAdminTotpSecret(username, env = process.env) {
    return parseAdminTotpSecrets(env.ADMIN_TOTP_SECRETS_JSON).get(username) || null;
}

module.exports = { getAdminTotpSecret, parseAdminTotpSecrets };
