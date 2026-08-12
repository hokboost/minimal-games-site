'use strict';

const path = require('node:path');
const { Worker } = require('node:worker_threads');

function runWishSimulation({ count, successRate, guaranteeThreshold, timeoutMs = 5000 }) {
    const workerPath = path.join(__dirname, '..', 'workers', 'wish-simulation-worker.js');
    return new Promise((resolve, reject) => {
        const worker = new Worker(workerPath, {
            workerData: { count, successRate, guaranteeThreshold }
        });
        let settled = false;
        const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            callback(value);
        };
        const timeout = setTimeout(() => {
            worker.terminate().catch(() => {});
            finish(reject, new Error('Wish simulation timed out'));
        }, timeoutMs);
        timeout.unref?.();
        worker.once('message', (result) => finish(resolve, result));
        worker.once('error', (error) => finish(reject, error));
        worker.once('exit', (code) => {
            if (code !== 0) finish(reject, new Error('Wish simulation worker stopped unexpectedly'));
        });
    });
}

module.exports = { runWishSimulation };
