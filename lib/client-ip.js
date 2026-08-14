const net = require('node:net');

function normalizeIp(rawValue) {
    if (rawValue === undefined || rawValue === null) return null;

    let value = String(rawValue).trim();
    if (!value) return null;

    if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1).trim();
    }
    const bracketed = value.match(/^\[([^\]]+)](?::\d+)?$/);
    if (bracketed) value = bracketed[1];

    const zoneIndex = value.indexOf('%');
    if (zoneIndex !== -1) value = value.slice(0, zoneIndex);
    if (value.toLowerCase().startsWith('::ffff:')) value = value.slice(7);

    return net.isIP(value) ? value : null;
}

function isTrustedProxyAddress(rawAddress, env = process.env) {
    const address = normalizeIp(rawAddress);
    if (!address) return false;
    if (address === '127.0.0.1' || address === '::1') return true;
    const configured = String(env.TRUSTED_PROXY_ADDRESSES || '')
        .split(',')
        .map(normalizeIp)
        .filter(Boolean);
    return configured.includes(address);
}

function isRenderEnvironment(env = process.env) {
    return env.RENDER === 'true' || Boolean(env.RENDER_SERVICE_ID);
}

function getClientIp(req, options = {}) {
    const trustForwardedHeaders = options.trustForwardedHeaders ?? isRenderEnvironment();
    const socketAddress = req.socket?.remoteAddress || req.connection?.remoteAddress;

    // Render documents the first X-Forwarded-For value as the real client IP.
    // Only accept it from a private/loopback ingress connection.
    if (trustForwardedHeaders && isTrustedProxyAddress(socketAddress, options.env || process.env)) {
        const header = req.headers?.['x-forwarded-for'];
        const forwarded = Array.isArray(header) ? header[0] : header;
        const firstForwarded = String(forwarded || '').split(',', 1)[0];
        const normalizedForwarded = normalizeIp(firstForwarded);
        if (normalizedForwarded) return normalizedForwarded;
    }

    if (trustForwardedHeaders && !isTrustedProxyAddress(socketAddress, options.env || process.env)) {
        return normalizeIp(socketAddress) || null;
    }
    return normalizeIp(req.ip) || normalizeIp(socketAddress) || null;
}

module.exports = {
    getClientIp,
    isRenderEnvironment,
    isTrustedProxyAddress,
    normalizeIp
};
