'use strict';

function findTarget() {
    const argumentUrl = process.argv.slice(2).find((value) => /^https?:\/\//i.test(value));
    return argumentUrl
        || process.env.TARGET_URL
        || process.env.BASE_URL
        || 'http://localhost:3000';
}

function enforceSafeTestTarget() {
    if (process.env.ALLOW_MUTATING_SECURITY_TESTS !== 'I_ACKNOWLEDGE_TEST_SIDE_EFFECTS') {
        throw new Error(
            'Security simulations require ALLOW_MUTATING_SECURITY_TESTS=I_ACKNOWLEDGE_TEST_SIDE_EFFECTS'
        );
    }
    const target = new URL(findTarget());
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
        throw new Error('Test target must be an HTTP(S) origin without embedded credentials');
    }
    const local = ['localhost', '127.0.0.1', '::1'].includes(target.hostname);
    if (!local) {
        if (process.env.ALLOW_REMOTE_SECURITY_TESTS !== 'I_ACKNOWLEDGE_REMOTE_TARGET') {
            throw new Error('Remote tests require ALLOW_REMOTE_SECURITY_TESTS=I_ACKNOWLEDGE_REMOTE_TARGET');
        }
        if (!/^[A-Za-z0-9._-]{3,80}$/.test(String(process.env.CHANGE_TICKET || ''))) {
            throw new Error('Remote tests require a CHANGE_TICKET identifier');
        }
    }
    return target.origin;
}

module.exports = { enforceSafeTestTarget };
