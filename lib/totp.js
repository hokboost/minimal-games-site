const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function decodeBase32(value) {
    const normalized = String(value || '')
        .toUpperCase()
        .replace(/[\s=-]/g, '');
    if (!normalized || !/^[A-Z2-7]+$/.test(normalized)) {
        throw new Error('Invalid base32 secret');
    }

    let bits = '';
    for (const character of normalized) {
        bits += BASE32_ALPHABET.indexOf(character).toString(2).padStart(5, '0');
    }

    const bytes = [];
    for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
        bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
    }
    return Buffer.from(bytes);
}

function generateTotp(secret, counter) {
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));
    const digest = crypto.createHmac('sha1', decodeBase32(secret))
        .update(counterBuffer)
        .digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary = digest.readUInt32BE(offset) & 0x7fffffff;
    return String(binary % 1_000_000).padStart(6, '0');
}

function verifyTotp(secret, code, { now = Date.now(), window = 1 } = {}) {
    return matchTotpCounter(secret, code, { now, window }) !== null;
}

function matchTotpCounter(secret, code, { now = Date.now(), window = 1 } = {}) {
    const normalizedCode = String(code || '').trim();
    if (!secret || !/^\d{6}$/.test(normalizedCode)) return null;

    const currentCounter = Math.floor(now / 30_000);
    const provided = Buffer.from(normalizedCode);
    for (let drift = -window; drift <= window; drift += 1) {
        const expected = Buffer.from(generateTotp(secret, currentCounter + drift));
        if (provided.length === expected.length && crypto.timingSafeEqual(provided, expected)) {
            return currentCounter + drift;
        }
    }
    return null;
}

module.exports = {
    decodeBase32,
    generateTotp,
    matchTotpCounter,
    verifyTotp
};
