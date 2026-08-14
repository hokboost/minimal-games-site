'use strict';

const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { BoundedSemaphore } = require('./bounded-semaphore');

const workerSlots = new BoundedSemaphore(2);

async function normalizePng(image, {
    expectedWidth,
    expectedHeight,
    maxOutputBytes = 1.5 * 1024 * 1024
}) {
    let release;
    try {
        release = await workerSlots.acquire(250);
    } catch {
        const error = new Error('PNG normalization queue is full');
        error.code = 'PNG_QUEUE_FULL';
        throw error;
    }
    try {
        return await new Promise((resolve, reject) => {
            const worker = new Worker(path.join(__dirname, 'png-normalizer-worker.js'));
            const timeout = setTimeout(() => {
                worker.terminate().catch(() => {});
                reject(new Error('PNG normalization timed out'));
            }, 5000);
            timeout.unref?.();
            worker.once('message', (result) => {
                clearTimeout(timeout);
                worker.terminate().catch(() => {});
                if (result?.error) return reject(new Error(result.error));
                return resolve({ ...result, buffer: Buffer.from(result.buffer) });
            });
            worker.once('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
            worker.postMessage({ image, expectedWidth, expectedHeight, maxOutputBytes });
        });
    } finally {
        release();
    }
}

module.exports = { normalizePng };
