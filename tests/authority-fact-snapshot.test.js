'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { LiveInteractionRepository } = require('../repositories/live-interaction-repository');
const { QuestV2CatalogRepository } = require('../repositories/quest-v2-catalog-repository');
const { QuestV2RuntimeRepository } = require('../repositories/quest-v2-runtime-repository');
const { RewardCatalogRepository } = require('../repositories/reward-catalog-repository');
const { StoryWorldRepository } = require('../repositories/story-world-repository');
const { StreamerGameRepository } = require('../repositories/streamer-game-repository');

function scriptedClient(rowsByCall) {
    const statements = [];
    return {
        statements,
        async connect() { return this; },
        release() {},
        async query(statement, values) {
            statements.push({ text: String(statement), values });
            return { rows: rowsByCall[statements.length - 1] || [], rowCount: 0 };
        }
    };
}

function assertUserBarrierThenFacts(client, factRelation) {
    assert.equal(client.statements.length, 2);
    assert.doesNotMatch(client.statements[0].text, new RegExp(`\\b${factRelation}\\b`, 'i'),
        'dynamic facts must not be read in the statement that can wait on the user row');
    assert.match(client.statements[0].text, /FOR NO KEY UPDATE/i);
    assert.match(client.statements[1].text, new RegExp(`\\b${factRelation}\\b`, 'i'));
}

test('Live locked account reads fetch creator profile facts only after the user barrier', async () => {
    const pairClient = scriptedClient([
        [{ id: 10, username: 'creator', is_admin: false, authorized: true, deactivated: false,
            account_locked: false },
        { id: 20, username: 'owner', is_admin: true, authorized: true, deactivated: false,
            account_locked: false }],
        [{ user_id: 10, live_interaction_opt_in: false, timezone: 'Asia/Shanghai',
            profile_visibility: 'private', communication_style: 'quiet' }]
    ]);
    const repository = new LiveInteractionRepository({ pool: pairClient });
    const accounts = await repository.lockAccounts(pairClient, 'creator', 'owner');
    assertUserBarrierThenFacts(pairClient, 'creator_profiles');
    assert.equal(accounts.creator.live_interaction_opt_in, false);
    assert.equal(accounts.creator.timezone, 'Asia/Shanghai');
    assert.equal(Object.hasOwn(accounts.creator, 'user_id'), false);

    const actorClient = scriptedClient([
        [{ id: 20, username: 'owner', is_admin: true, authorized: true, deactivated: false,
            account_locked: false }],
        [{ user_id: 20, live_interaction_opt_in: true, timezone: 'UTC',
            profile_visibility: 'owner', communication_style: 'direct' }]
    ]);
    const actor = await repository.readAccount('owner', actorClient, { lock: true });
    assertUserBarrierThenFacts(actorClient, 'creator_profiles');
    assert.equal(actor.profile_visibility, 'owner');
});

test('Streamer Game and Reward multi-account reads merge only post-barrier profile facts', async () => {
    const userRows = [
        { id: 10, username: 'creator', is_admin: false, authorized: true, deactivated: false,
            account_locked: false, balance: 50 },
        { id: 20, username: 'owner', is_admin: true, authorized: true, deactivated: false,
            account_locked: false, balance: 100 }
    ];
    const profileRows = [{ user_id: 10, live_interaction_opt_in: false,
        timezone: 'America/Toronto', communication_style: 'gentle' }];

    const gameClient = scriptedClient([userRows, profileRows]);
    const game = await new StreamerGameRepository({ pool: gameClient })
        .lockAccounts(gameClient, ['owner', 'creator']);
    assertUserBarrierThenFacts(gameClient, 'creator_profiles');
    assert.equal(game.get('creator').live_interaction_opt_in, false);
    assert.equal(game.get('creator').timezone, 'America/Toronto');
    assert.equal(Object.hasOwn(game.get('creator'), 'user_id'), false);

    const rewardClient = scriptedClient([userRows, profileRows]);
    const reward = await new RewardCatalogRepository({ pool: rewardClient })
        .lockAccounts(rewardClient, ['owner', 'creator']);
    assertUserBarrierThenFacts(rewardClient, 'creator_profiles');
    assert.equal(reward.get('creator').live_interaction_opt_in, false);
    assert.equal(reward.get('creator').communication_style, 'gentle');
    assert.equal(Object.hasOwn(reward.get('creator'), 'user_id'), false);
});

test('Story and Quest creator locks read profile and relationship facts after the user barrier', async () => {
    const storyClient = scriptedClient([
        [{ id: 10, username: 'creator' }],
        [{ timezone: 'Asia/Shanghai', story_tone: 'mystery',
            communication_style: 'quiet', live_interaction_opt_in: false }]
    ]);
    const story = await new StoryWorldRepository(storyClient).lockCreator('creator');
    assertUserBarrierThenFacts(storyClient, 'creator_profiles');
    assert.equal(story.timezone, 'Asia/Shanghai');
    assert.equal(story.live_interaction_opt_in, false);
    assert.equal(Object.hasOwn(story, 'user_id'), false);

    const runtimeClient = scriptedClient([
        [{ id: 10, username: 'creator' }],
        [{ timezone: 'America/Toronto', evidence_retention: 'minimum',
            relationship_level: 7 }]
    ]);
    const runtimeCreator = await new QuestV2RuntimeRepository(runtimeClient).lockCreator('creator');
    assertUserBarrierThenFacts(runtimeClient, 'creator_profiles');
    assert.match(runtimeClient.statements[1].text, /\brelationship_profiles\b/i);
    assert.equal(runtimeCreator.relationship_level, 7);
    assert.equal(Object.hasOwn(runtimeCreator, 'user_id'), false);

    const catalogClient = scriptedClient([
        [{ id: 10, username: 'creator' }],
        [{ timezone: 'UTC' }]
    ]);
    const catalogCreator = await new QuestV2CatalogRepository(catalogClient).lockCreator('creator');
    assertUserBarrierThenFacts(catalogClient, 'creator_profiles');
    assert.equal(catalogCreator.timezone, 'UTC');
    assert.equal(Object.hasOwn(catalogCreator, 'user_id'), false);
});

test('Story creator lock preserves the legacy optional-profile projection', async () => {
    const client = scriptedClient([
        [{ id: 10, username: 'creator' }],
        []
    ]);
    const creator = await new StoryWorldRepository(client).lockCreator('creator');
    assert.deepEqual(creator, {
        id: 10,
        username: 'creator',
        timezone: null,
        story_tone: null,
        communication_style: null,
        live_interaction_opt_in: null
    });
});
