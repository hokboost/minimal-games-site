'use strict';

const crypto = require('node:crypto');

const TEST_ONLY_ACTIONS = new Set(['exit', 'disconnect', 'pause']);

function safeTokenMatch(actual, expected) {
    if (typeof actual !== 'string' || typeof expected !== 'string'
        || Buffer.byteLength(expected, 'utf8') < 32) {
        return false;
    }
    const actualBytes = Buffer.from(actual, 'utf8');
    const expectedBytes = Buffer.from(expected, 'utf8');
    return actualBytes.length === expectedBytes.length
        && crypto.timingSafeEqual(actualBytes, expectedBytes);
}

function enabledFaultRequest(req, point) {
    if (process.env.NODE_ENV !== 'test' || process.env.ENABLE_TEST_FAULT_INJECTION !== 'true') {
        return null;
    }
    const configuredToken = process.env.TEST_FAULT_TOKEN || '';
    const suppliedToken = req.get('x-test-fault-token');
    const requestedPoint = req.get('x-test-fault-point');
    const action = req.get('x-test-fault-action');
    if (!safeTokenMatch(suppliedToken, configuredToken)
        || requestedPoint !== point
        || !TEST_ONLY_ACTIONS.has(action)) {
        return null;
    }
    return action;
}

async function reachTestFaultPoint(req, point) {
    const action = enabledFaultRequest(req, point);
    if (!action) return false;

    process.send?.({
        type: 'test-fault-point',
        point,
        action,
        requestId: req.requestId || null
    });

    if (action === 'exit') {
        await new Promise((resolve) => setTimeout(resolve, 25));
        process.exit(86);
        return true;
    }
    if (action === 'disconnect') {
        req.socket.destroy();
        return true;
    }

    const pauseMs = Math.min(10000, Math.max(
        100,
        Number.parseInt(process.env.TEST_FAULT_PAUSE_MS, 10) || 1500
    ));
    await new Promise((resolve) => setTimeout(resolve, pauseMs));
    return false;
}

module.exports = { reachTestFaultPoint };
