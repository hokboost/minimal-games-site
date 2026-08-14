'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const DPAPI_HEADER = 'MGS-DPAPI-V1\n';
const MAX_COOKIE_BYTES = 2 * 1024 * 1024;
const MAX_PROTECTED_COOKIE_BYTES = 3 * 1024 * 1024;
const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'bilibili-cookie-dpapi.ps1');

function runPowerShell(mode, { input = '', targetPath = null } = {}) {
    if (process.platform !== 'win32') {
        throw new Error('Windows DPAPI is unavailable on this platform');
    }
    const args = [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        SCRIPT_PATH,
        '-Mode',
        mode
    ];
    if (targetPath) args.push('-Path', targetPath);
    const result = spawnSync('powershell.exe', args, {
        input,
        encoding: 'utf8',
        maxBuffer: MAX_COOKIE_BYTES * 2,
        windowsHide: true,
        timeout: 15000
    });
    if (result.error || result.status !== 0) {
        throw new Error(`Windows DPAPI ${mode.toLowerCase()} failed`, {
            cause: result.error || new Error(String(result.stderr || '').slice(0, 500))
        });
    }
    return result.stdout;
}

function protectCookieText(plaintext) {
    if (typeof plaintext !== 'string' || !plaintext || Buffer.byteLength(plaintext) > MAX_COOKIE_BYTES) {
        throw new Error('Cookie payload is empty or too large');
    }
    const encoded = runPowerShell('Protect', { input: plaintext }).trim();
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
        throw new Error('Windows DPAPI returned an invalid payload');
    }
    return Buffer.from(`${DPAPI_HEADER}${encoded}`, 'utf8');
}

function decodeCookieBuffer(buffer, { allowPlaintext = false } = {}) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_PROTECTED_COOKIE_BYTES) {
        throw new Error('Cookie file is empty or too large');
    }
    if (buffer.subarray(0, Buffer.byteLength(DPAPI_HEADER)).toString('utf8') === DPAPI_HEADER) {
        const encoded = buffer.subarray(Buffer.byteLength(DPAPI_HEADER)).toString('ascii').trim();
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
            throw new Error('DPAPI cookie payload is invalid');
        }
        const plaintext = runPowerShell('Unprotect', { input: encoded });
        if (!plaintext || Buffer.byteLength(plaintext, 'utf8') > MAX_COOKIE_BYTES) {
            throw new Error('Decrypted cookie payload is empty or too large');
        }
        return plaintext;
    }
    if (process.platform === 'win32' && !allowPlaintext) {
        throw new Error('Plaintext Bilibili cookies are disabled on Windows');
    }
    if (buffer.length > MAX_COOKIE_BYTES) {
        throw new Error('Plaintext cookie payload is too large');
    }
    return buffer.toString('utf8');
}

function hardenCookieAcl(targetPath) {
    const result = runPowerShell('LockAcl', { targetPath }).trim();
    if (result !== 'locked') throw new Error('Windows cookie ACL verification failed');
}

module.exports = {
    DPAPI_HEADER,
    MAX_COOKIE_BYTES,
    MAX_PROTECTED_COOKIE_BYTES,
    decodeCookieBuffer,
    hardenCookieAcl,
    protectCookieText
};
