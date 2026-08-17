'use strict';

function isRetryableCapacityResponse(response) {
    if (!response || typeof response.status !== 'function'
        || typeof response.headers !== 'function') return false;
    return response.status() === 503
        && response.headers()['idempotency-status'] === 'retryable';
}

function shouldRecordServerFailure(response) {
    return response.status() >= 500 && !isRetryableCapacityResponse(response);
}

function matchesFinalPostResponse(response, pathname) {
    return new URL(response.url()).pathname === pathname
        && response.request().method() === 'POST'
        && !isRetryableCapacityResponse(response);
}

module.exports = {
    isRetryableCapacityResponse,
    matchesFinalPostResponse,
    shouldRecordServerFailure
};
