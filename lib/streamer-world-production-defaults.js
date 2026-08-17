'use strict';

const { FLAG_NAMES } = require('./streamer-world-flags');

function applyStreamerWorldProductionDefaults(env = process.env) {
    if (env.NODE_ENV !== 'production') return env;
    for (const name of FLAG_NAMES) {
        if (!Object.prototype.hasOwnProperty.call(env, name)) env[name] = 'true';
    }
    return env;
}

applyStreamerWorldProductionDefaults();

module.exports = { applyStreamerWorldProductionDefaults };
