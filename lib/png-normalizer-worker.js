'use strict';

const { parentPort } = require('node:worker_threads');
const { PNG } = require('pngjs');

parentPort.once('message', ({ image, expectedWidth, expectedHeight, maxOutputBytes }) => {
    try {
        const decoded = PNG.sync.read(Buffer.from(image), { checkCRC: true });
        if (decoded.width !== expectedWidth || decoded.height !== expectedHeight) {
            throw new Error('PNG dimensions changed while decoding');
        }
        const buffer = PNG.sync.write(decoded, { colorType: 6 });
        if (buffer.length > maxOutputBytes) throw new Error('PNG output exceeds limit');
        parentPort.postMessage({ buffer, width: decoded.width, height: decoded.height });
    } catch {
        parentPort.postMessage({ error: 'invalid_png' });
    }
});
