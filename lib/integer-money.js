'use strict';

const MAX_SAFE_MONEY = Number.MAX_SAFE_INTEGER;

function parseInteger(value, label = 'integer', { min = -MAX_SAFE_MONEY, max = MAX_SAFE_MONEY } = {}) {
    if (typeof value === 'string' && !/^-?\d+$/.test(value)) {
        throw new TypeError(`${label} must be an integer`);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
        throw new RangeError(`${label} is outside the supported integer range`);
    }
    return parsed;
}

function parseMoney(value, label = 'money', options = {}) {
    return parseInteger(value, label, options);
}

function multiplyMoney(value, multiplier, label = 'money product') {
    const left = parseMoney(value, `${label} value`);
    const right = parseInteger(multiplier, `${label} multiplier`);
    const result = left * right;
    if (!Number.isSafeInteger(result)) {
        throw new RangeError(`${label} is outside the supported integer range`);
    }
    return result;
}

module.exports = {
    MAX_SAFE_MONEY,
    multiplyMoney,
    parseInteger,
    parseMoney
};
