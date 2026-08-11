const crypto = require('crypto');

function parseCookies(header = '') {
    const cookies = {};
    String(header).split(';').forEach((part) => {
        const separator = part.indexOf('=');
        if (separator <= 0) return;
        const name = part.slice(0, separator).trim();
        const rawValue = part.slice(separator + 1).trim();
        try {
            cookies[name] = decodeURIComponent(rawValue);
        } catch (error) {
            cookies[name] = rawValue;
        }
    });
    return cookies;
}

function decodeSignedSessionCookie(value, secret) {
    if (typeof value !== 'string' || !value.startsWith('s:') || !secret) return null;
    const signed = value.slice(2);
    const separator = signed.lastIndexOf('.');
    if (separator <= 0) return null;

    const sessionId = signed.slice(0, separator);
    const signature = signed.slice(separator + 1);
    const expected = crypto.createHmac('sha256', secret)
        .update(sessionId)
        .digest('base64')
        .replace(/=+$/, '');
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (actualBuffer.length !== expectedBuffer.length
        || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
        return null;
    }
    return sessionId;
}

module.exports = {
    parseCookies,
    decodeSignedSessionCookie
};
