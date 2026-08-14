'use strict';

function findTarget({ argv = process.argv, env = process.env } = {}) {
    const argumentUrl = argv.slice(2).find((value) => /^https?:\/\//i.test(value));
    if (env.TARGET_URL && env.BASE_URL) {
        const targetOrigin = new URL(env.TARGET_URL).origin;
        const baseOrigin = new URL(env.BASE_URL).origin;
        if (targetOrigin !== baseOrigin) {
            throw new Error('TARGET_URL and BASE_URL must resolve to the same origin');
        }
    }
    return argumentUrl
        || env.TARGET_URL
        || env.BASE_URL
        || 'http://localhost:3000';
}

function enforceSafeTestTarget({ argv = process.argv, env = process.env } = {}) {
    if (env.ALLOW_MUTATING_SECURITY_TESTS !== 'I_ACKNOWLEDGE_TEST_SIDE_EFFECTS') {
        throw new Error(
            'Security simulations require ALLOW_MUTATING_SECURITY_TESTS=I_ACKNOWLEDGE_TEST_SIDE_EFFECTS'
        );
    }
    const target = new URL(findTarget({ argv, env }));
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
        throw new Error('Test target must be an HTTP(S) origin without embedded credentials');
    }
    const local = ['localhost', '127.0.0.1', '::1'].includes(target.hostname);
    if (!local) {
        if (env.ALLOW_REMOTE_SECURITY_TESTS !== 'I_ACKNOWLEDGE_REMOTE_TARGET') {
            throw new Error('Remote tests require ALLOW_REMOTE_SECURITY_TESTS=I_ACKNOWLEDGE_REMOTE_TARGET');
        }
        if (!/^[A-Za-z0-9._-]{3,80}$/.test(String(env.CHANGE_TICKET || ''))) {
            throw new Error('Remote tests require a CHANGE_TICKET identifier');
        }
    }
    return target.origin;
}

module.exports = { enforceSafeTestTarget, findTarget };
