'use strict';

module.exports = function requireFunction(source, name, owner = 'dependency') {
    const value = source && source[name];
    if (typeof value !== 'function') {
        throw new TypeError(`Missing required ${owner} function: ${name}`);
    }
    return value;
};
