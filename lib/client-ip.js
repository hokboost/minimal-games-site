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

function isTrustedProxyAddress(rawAddress) {
    const address = normalizeIp(rawAddress);
    if (!address) return false;

    if (net.isIPv4(address)) {
        const octets = address.split('.').map(Number);
        return octets[0] === 10
            || octets[0] === 127
            || (octets[0] === 169 && octets[1] === 254)
            || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
            || (octets[0] === 192 && octets[1] === 168);
    }

    const lower = address.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    const firstGroup = Number.parseInt(lower.split(':')[0] || '0', 16);
    return firstGroup >= 0xfe80 && firstGroup <= 0xfebf;
}

function isRenderEnvironment(env = process.env) {
    return env.RENDER === 'true' || Boolean(env.RENDER_SERVICE_ID);
}

function getClientIp(req, options = {}) {
    const trustForwardedHeaders = options.trustForwardedHeaders ?? isRenderEnvironment();
    const socketAddress = req.socket?.remoteAddress || req.connection?.remoteAddress;

    // Render documents the first X-Forwarded-For value as the real client IP.
    // Only accept it from a private/loopback ingress connection.
    if (trustForwardedHeaders && isTrustedProxyAddress(socketAddress)) {
        const header = req.headers?.['x-forwarded-for'];
        const forwarded = Array.isArray(header) ? header[0] : header;
        const firstForwarded = String(forwarded || '').split(',', 1)[0];
        const normalizedForwarded = normalizeIp(firstForwarded);
        if (normalizedForwarded) return normalizedForwarded;
    }

    if (trustForwardedHeaders && !isTrustedProxyAddress(socketAddress)) {
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
