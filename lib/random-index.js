'use strict';

const crypto = require('crypto');

function randomArrayIndex(length, randomSource = crypto.randomInt) {
    if (!Number.isSafeInteger(length) || length < 1) {
        throw new RangeError('Array length must be a positive safe integer');
    }
    return randomSource(0, length);
}

function randomArrayItem(items, randomSource = crypto.randomInt) {
    if (!Array.isArray(items) || items.length === 0) {
        throw new RangeError('Cannot choose from an empty array');
    }
    return items[randomArrayIndex(items.length, randomSource)];
}

module.exports = { randomArrayIndex, randomArrayItem };
