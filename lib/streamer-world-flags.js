'use strict';

const FLAG_NAMES = Object.freeze([
    'STREAMER_WORLD_ENABLED',
    'CREATOR_PROFILE_ENABLED',
    'QUEST_ENGINE_V2_ENABLED',
    'STORY_WORLD_ENABLED',
    'LIVE_INTERACTIONS_ENABLED',
    'STREAMER_NEW_GAMES_ENABLED',
    'STREAMER_REWARD_CATALOG_ENABLED'
]);

function readBoolean(env, name) {
    return env[name] === 'true';
}

function readStreamerWorldFlags(env = process.env) {
    const values = Object.fromEntries(FLAG_NAMES.map((name) => [name, readBoolean(env, name)]));
    const configuredOwner = String(env.STREAMER_WORLD_OWNER_USERNAME || '').normalize('NFKC').trim();
    const ownerUsername = /^[\p{L}\p{N}_-]{3,32}$/u.test(configuredOwner) ? configuredOwner : null;
    return Object.freeze({
        ...values,
        creatorFoundationEnabled: values.STREAMER_WORLD_ENABLED && values.CREATOR_PROFILE_ENABLED,
        questEngineV2Enabled: values.STREAMER_WORLD_ENABLED
            && values.CREATOR_PROFILE_ENABLED
            && values.QUEST_ENGINE_V2_ENABLED,
        storyWorldEnabled: values.STREAMER_WORLD_ENABLED
            && values.CREATOR_PROFILE_ENABLED
            && values.STORY_WORLD_ENABLED,
        liveInteractionsEnabled: values.STREAMER_WORLD_ENABLED
            && values.CREATOR_PROFILE_ENABLED
            && values.LIVE_INTERACTIONS_ENABLED,
        ownerUsername
    });
}

module.exports = { FLAG_NAMES, readStreamerWorldFlags };
