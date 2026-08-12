'use strict';

const { parentPort, workerData } = require('node:worker_threads');
const { randomInt } = require('node:crypto');

const count = Number(workerData?.count);
const successRate = Number(workerData?.successRate);
const rawThreshold = workerData?.guaranteeThreshold;
const guaranteeThreshold = rawThreshold === null ? null : Number(rawThreshold);

if (!Number.isSafeInteger(count) || count < 1 || count > 100000
    || !Number.isFinite(successRate) || successRate < 0 || successRate > 1
    || (guaranteeThreshold !== null
        && (!Number.isSafeInteger(guaranteeThreshold) || guaranteeThreshold < 0))) {
    throw new Error('Invalid wish simulation input');
}

let consecutiveFails = 0;
let successCount = 0;
for (let index = 0; index < count; index += 1) {
    const guaranteed = guaranteeThreshold !== null && consecutiveFails >= guaranteeThreshold;
    const success = guaranteed || (randomInt(0, 1000000) / 1000000) < successRate;
    if (success) {
        successCount += 1;
        consecutiveFails = 0;
    } else {
        consecutiveFails += 1;
    }
}

parentPort.postMessage({ successCount, consecutiveFails });
