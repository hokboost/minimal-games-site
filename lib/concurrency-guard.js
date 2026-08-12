'use strict';

function positiveInteger(value, fallback, minimum = 1, maximum = 10000) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isSafeInteger(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, parsed));
}

function createConcurrencyGuard({
    pool,
    maxInFlight = 24,
    maxPerUser = 2,
    maxPoolWaiters = 4,
    maxEventLoopLagMs = 250,
    retryAfterSeconds = 2
} = {}) {
    if (!pool || typeof pool.query !== 'function') {
        throw new TypeError('A PostgreSQL pool is required for concurrency protection');
    }

    const limits = {
        maxInFlight: positiveInteger(maxInFlight, 24),
        maxPerUser: positiveInteger(maxPerUser, 2),
        maxPoolWaiters: positiveInteger(maxPoolWaiters, 4, 0),
        maxEventLoopLagMs: positiveInteger(maxEventLoopLagMs, 250, 25),
        retryAfterSeconds: positiveInteger(retryAfterSeconds, 2, 1, 60)
    };
    let active = 0;
    let eventLoopLagMs = 0;
    let expectedTick = Date.now() + 1000;
    const activeByUser = new Map();
    const lagMonitor = setInterval(() => {
        const now = Date.now();
        eventLoopLagMs = Math.max(0, now - expectedTick);
        expectedTick = now + 1000;
    }, 1000);
    lagMonitor.unref?.();

    function reject(res) {
        res.set('Retry-After', String(limits.retryAfterSeconds));
        return res.status(503).json({
            success: false,
            message: '服务器繁忙，请稍后重试'
        });
    }

    function middleware(req, res, next) {
        const userKey = String(req.session?.user?.username || req.clientIP || 'anonymous');
        const userActive = activeByUser.get(userKey) || 0;
        const poolMax = Number(pool.options?.max) || 20;
        const poolExhausted = Number(pool.totalCount) >= poolMax
            && Number(pool.idleCount) === 0
            && Number(pool.waitingCount) > 0;
        const overloaded = active >= limits.maxInFlight
            || userActive >= limits.maxPerUser
            || Number(pool.waitingCount) > limits.maxPoolWaiters
            || poolExhausted
            || eventLoopLagMs > limits.maxEventLoopLagMs;
        if (overloaded) return reject(res);

        active += 1;
        activeByUser.set(userKey, userActive + 1);
        let released = false;
        const release = () => {
            if (released) return;
            released = true;
            active = Math.max(0, active - 1);
            const current = activeByUser.get(userKey) || 0;
            if (current <= 1) activeByUser.delete(userKey);
            else activeByUser.set(userKey, current - 1);
        };
        res.once('finish', release);
        res.once('close', release);
        try {
            return next();
        } catch (error) {
            release();
            throw error;
        }
    }

    middleware.close = () => clearInterval(lagMonitor);
    middleware.getStats = () => ({
        active,
        users: activeByUser.size,
        eventLoopLagMs,
        limits: { ...limits }
    });
    return middleware;
}

module.exports = {
    createConcurrencyGuard,
    positiveInteger
};
