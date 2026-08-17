#!/usr/bin/env node
'use strict';

require('dotenv').config();

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { applyTrackedMigration } = require('../lib/database-migrations');
const { initialStoryState } = require('../domain/story/effects');
const seasonOne = require('../content/streamer-world/story/season-one');
const seasonTwo = require('../content/streamer-world/story/season-2');
const BalanceLogger = require('../balance-logger');
const { QuestV2Service } = require('../services/quest-v2-service');
const { StoryWorldService } = require('../services/story-world-service');
const { RewardCatalogRepository } = require('../repositories/reward-catalog-repository');
const { DisposableDatabase } = require('../tests/helpers/integration-environment');

if (process.env.ALLOW_DATABASE_CREATE_TEST !== 'true') {
    throw new Error('Set ALLOW_DATABASE_CREATE_TEST=true to run the disposable story progression test');
}

async function transaction(pool, work) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

async function createCreator(database, username) {
    const account = await database.createUser({ username });
    await database.pool.query(`
        INSERT INTO creator_profiles(user_id,display_name,timezone,live_interaction_opt_in)
        SELECT id,$2,'UTC',TRUE FROM users WHERE username=$1
    `, [username, `Story security ${username}`]);
    return account;
}

async function count(pool, relation, predicate = 'TRUE', values = []) {
    if (!/^[a-z_][a-z0-9_]*$/.test(relation)) throw new Error('Unsafe test relation');
    return Number((await pool.query(`SELECT COUNT(*) AS count FROM ${relation} WHERE ${predicate}`,
        values)).rows[0].count);
}

async function runRow(pool, runId) {
    return (await pool.query(`SELECT id,user_id,content_version_id,status,current_episode,
        current_node_id,revision,state_snapshot,checkpoint_snapshot
        FROM story_runs WHERE id=$1`, [runId])).rows[0];
}

async function positionAtNode(pool, runId, content, nodeId, revision = 5) {
    const node = content.nodesById.get(nodeId);
    assert.ok(node, `missing story node ${nodeId}`);
    const checkpointState = initialStoryState();
    await pool.query(`UPDATE story_runs
        SET status='active',completed_at=NULL,current_episode=$2,current_node_id=$3,
            revision=$4,state_snapshot=$5::JSONB,checkpoint_snapshot=$6::JSONB,updated_at=NOW()
        WHERE id=$1`, [runId,node.episode,node.id,revision,JSON.stringify(initialStoryState()),
        JSON.stringify({ nodeId:content.entryNode,revision:0,state:checkpointState })]);
    return checkpointState;
}

async function verifyHistoricalUpgrade(database, storyService) {
    const creator = await createCreator(database,'story_legacy_scope');
    const started = await storyService.start(creator.username,{season:seasonOne.slug,replay:false},
        {requestId:'story-legacy-start'});
    const source = (await database.pool.query(`SELECT run.content_version_id,event.event_id
        FROM story_runs run JOIN story_events event ON event.run_id=run.id
        WHERE run.id=$1 AND event.action='start'`, [started.runId])).rows[0];
    await database.pool.query(`INSERT INTO story_unlock_intents(
        user_id,content_version_id,unlock_type,unlock_key,source_event_id,
        progression_scope,provenance_type,economic_eligible
    ) SELECT id,$2,'reward_catalog_visibility','legacy.story.visibility',$3,
        'branch_local','legacy_unverified',FALSE FROM users WHERE username=$1`,
    [creator.username,source.content_version_id,source.event_id]);

    await database.pool.query('DROP TRIGGER IF EXISTS trg_story_unlock_progression_validation ON story_unlock_intents');
    await database.pool.query('DROP TRIGGER IF EXISTS trg_story_unlock_intent_protection ON story_unlock_intents');
    await database.pool.query('DROP INDEX IF EXISTS idx_story_unlock_economic_entitlement');
    for (const column of [
        'progression_scope','provenance_type','provenance_key',
        'published_binding_hash','economic_eligible'
    ]) {
        await database.pool.query(`ALTER TABLE story_unlock_intents DROP COLUMN IF EXISTS ${column}`);
    }
    await database.pool.query(`DELETE FROM minimal_games_schema_migrations
        WHERE filename='add_streamer_story_progression_scopes.sql'`);
    const client = await database.pool.connect();
    try {
        await applyTrackedMigration(client,'add_streamer_story_progression_scopes.sql',()=>{});
    } finally {
        client.release();
    }
    const migrated = (await database.pool.query(`SELECT progression_scope,provenance_type,
        provenance_key,published_binding_hash,economic_eligible
        FROM story_unlock_intents WHERE unlock_key='legacy.story.visibility'`)).rows[0];
    assert.deepEqual(migrated,{
        progression_scope:'branch_local', provenance_type:'legacy_unverified',
        provenance_key:null, published_binding_hash:null, economic_eligible:false
    });
    const ledger = (await database.pool.query(`SELECT status FROM minimal_games_schema_migrations
        WHERE filename='add_streamer_story_progression_scopes.sql'`)).rows[0];
    assert.equal(ledger?.status,'applied');
}

async function verifyRecoveryAndQuest(database, storyService) {
    const creator = await createCreator(database,'story_recovery_security');
    const started = await storyService.start(creator.username,{season:seasonOne.slug,replay:false},
        {requestId:'story-recovery-start'});
    const checkpointState = await positionAtNode(database.pool,started.runId,seasonOne,
        'locked-window.special',5);
    await storyService.commit(creator.username,{
        runId:started.runId,action:'advance',expectedRevision:5,language:'en'
    },{requestId:'story-recovery-branch-commit'});

    const branch = await runRow(database.pool,started.runId);
    assert.equal(Number(branch.revision),6);
    assert.equal(branch.state_snapshot.unlocks['game:star-map-repair'],true);
    assert.equal(branch.state_snapshot.memories['locked-window.memory'],true);
    assert.equal(branch.state_snapshot.messages['locked-window.letter'],true);
    assert.equal(branch.state_snapshot.completedEpisodes['locked-window'],true);
    const durableBefore = {
        memories:await count(database.pool,'story_memories','first_run_id=$1',[started.runId]),
        messages:await count(database.pool,'creator_inbox_messages',
            "metadata->>'runId'=$1",[String(started.runId)]),
        clears:await count(database.pool,'story_first_clears','run_id=$1',[started.runId]),
        quest:await count(database.pool,'quest_v2_trusted_events',
            "event_type='story.episode.completed' AND payload->>'runId'=$1",[String(started.runId)]),
        relationshipEvents:await count(database.pool,'relationship_events',
            "user_id=$1 AND source_type='story_world' AND event_type='story.episode.completed'",
            [branch.user_id]),
        relationshipXp:Number((await database.pool.query(
            'SELECT total_xp FROM relationship_profiles WHERE user_id=$1',[branch.user_id]
        )).rows[0].total_xp),
        unlocks:await count(database.pool,'story_unlock_intents',
            "user_id=$1 AND unlock_key='star-map-repair'",[branch.user_id])
    };
    assert.deepEqual(durableBefore,{
        memories:1,messages:1,clears:1,quest:1,relationshipEvents:1,relationshipXp:5,unlocks:1
    });
    const provenance = (await database.pool.query(`SELECT progression_scope,provenance_type,
        provenance_key,published_binding_hash,economic_eligible FROM story_unlock_intents
        WHERE user_id=$1 AND unlock_key='star-map-repair'`,[branch.user_id])).rows[0];
    assert.equal(provenance.progression_scope,'account_entitlement');
    assert.equal(provenance.provenance_type,'episode_first_clear');
    assert.equal(provenance.provenance_key,'locked-window');
    assert.match(provenance.published_binding_hash,/^[a-f0-9]{64}$/);
    assert.equal(provenance.economic_eligible,false);

    const beforeRollback = {
        run:await runRow(database.pool,started.runId),
        events:await count(database.pool,'story_events','run_id=$1',[started.runId]),
        audits:await count(database.pool,'story_audit_log','run_id=$1',[started.runId]),
        assets:await count(database.pool,'story_run_assets','run_id=$1',[started.runId])
    };
    await assert.rejects(storyService.recover(creator.username,{
        runId:started.runId,expectedRevision:6,language:'en'
    },{
        requestId:'story-recovery-rollback',
        finalizeIdempotency:async()=>{ throw new Error('story recovery finalize rollback'); }
    }),/story recovery finalize rollback/);
    const afterRollback = {
        run:await runRow(database.pool,started.runId),
        events:await count(database.pool,'story_events','run_id=$1',[started.runId]),
        audits:await count(database.pool,'story_audit_log','run_id=$1',[started.runId]),
        assets:await count(database.pool,'story_run_assets','run_id=$1',[started.runId])
    };
    assert.deepEqual(afterRollback,beforeRollback);

    const recovered = await storyService.recover(creator.username,{
        runId:started.runId,expectedRevision:6,language:'en'
    },{requestId:'story-recovery-success'});
    assert.deepEqual(recovered.story.progress.unlocks,[]);
    const restored = await runRow(database.pool,started.runId);
    assert.deepEqual(restored.state_snapshot,checkpointState);
    assert.equal(Number(restored.revision),7);
    assert.equal(await count(database.pool,'story_run_assets','run_id=$1',[started.runId]),0);
    assert.deepEqual({
        memories:await count(database.pool,'story_memories','first_run_id=$1',[started.runId]),
        messages:await count(database.pool,'creator_inbox_messages',
            "metadata->>'runId'=$1",[String(started.runId)]),
        clears:await count(database.pool,'story_first_clears','run_id=$1',[started.runId]),
        quest:await count(database.pool,'quest_v2_trusted_events',
            "event_type='story.episode.completed' AND payload->>'runId'=$1",[String(started.runId)]),
        relationshipEvents:await count(database.pool,'relationship_events',
            "user_id=$1 AND source_type='story_world' AND event_type='story.episode.completed'",
            [branch.user_id])
    },{memories:1,messages:1,clears:1,quest:1,relationshipEvents:1});

    const replay = await storyService.recover(creator.username,{
        runId:started.runId,expectedRevision:6,language:'en'
    },{requestId:'story-recovery-success'});
    assert.deepEqual(replay,recovered);
    await assert.rejects(storyService.recover(creator.username,{
        runId:started.runId,expectedRevision:7,language:'en'
    },{requestId:'story-recovery-success'}),error=>error?.code==='STORY_COMMAND_COLLISION');

    await positionAtNode(database.pool,started.runId,seasonOne,'locked-window.special',7);
    await storyService.commit(creator.username,{
        runId:started.runId,action:'advance',expectedRevision:7,language:'en'
    },{requestId:'story-repeat-first-clear'});
    assert.deepEqual({
        memories:await count(database.pool,'story_memories','first_run_id=$1',[started.runId]),
        messages:await count(database.pool,'creator_inbox_messages',
            "metadata->>'runId'=$1",[String(started.runId)]),
        clears:await count(database.pool,'story_first_clears','run_id=$1',[started.runId]),
        quest:await count(database.pool,'quest_v2_trusted_events',
            "event_type='story.episode.completed' AND payload->>'runId'=$1",[String(started.runId)]),
        relationshipEvents:await count(database.pool,'relationship_events',
            "user_id=$1 AND source_type='story_world' AND event_type='story.episode.completed'",
            [branch.user_id]),
        relationshipXp:Number((await database.pool.query(
            'SELECT total_xp FROM relationship_profiles WHERE user_id=$1',[branch.user_id]
        )).rows[0].total_xp),
        unlocks:await count(database.pool,'story_unlock_intents',
            "user_id=$1 AND unlock_key='star-map-repair'",[branch.user_id])
    },{memories:1,messages:1,clears:1,quest:1,relationshipEvents:1,relationshipXp:5,unlocks:1});

    const eventCount = await count(database.pool,'story_events','run_id=$1',[started.runId]);
    const raced = await Promise.allSettled([
        storyService.recover(creator.username,{runId:started.runId,expectedRevision:8,language:'en'},
            {requestId:'story-race-recover'}),
        storyService.commit(creator.username,{runId:started.runId,action:'advance',expectedRevision:8,language:'en'},
            {requestId:'story-race-commit'})
    ]);
    assert.equal(raced.filter(item=>item.status==='fulfilled').length,1);
    assert.equal(raced.filter(item=>item.status==='rejected').length,1);
    assert.equal(await count(database.pool,'story_events','run_id=$1',[started.runId]),eventCount+1);
}

async function verifyEconomicBoundary(database, storyService) {
    const creator = await createCreator(database,'story_economic_security');
    const started = await storyService.start(creator.username,{season:seasonTwo.slug,replay:false},
        {requestId:'story-economic-start'});
    await positionAtNode(database.pool,started.runId,seasonTwo,'storm-name-market.archive',5);
    const beforeOrders = await count(database.pool,'reward_orders');
    await storyService.commit(creator.username,{
        runId:started.runId,action:'advance',expectedRevision:5,language:'en'
    },{requestId:'story-economic-first-clear'});
    const run = await runRow(database.pool,started.runId);
    const entitlement = (await database.pool.query(`SELECT * FROM story_unlock_intents
        WHERE user_id=$1 AND unlock_key='tides.storm-label'`,[run.user_id])).rows[0];
    assert.equal(entitlement.progression_scope,'account_entitlement');
    assert.equal(entitlement.provenance_type,'episode_first_clear');
    assert.equal(entitlement.provenance_key,'storm-name-market');
    assert.equal(entitlement.economic_eligible,true);
    assert.match(entitlement.published_binding_hash,/^[a-f0-9]{64}$/);
    await assert.rejects(database.pool.query(`UPDATE story_progression_bindings
        SET economic_eligible=FALSE WHERE binding_hash=$1`,[entitlement.published_binding_hash]),
    /published story progression binding is immutable/);
    await assert.rejects(database.pool.query(`UPDATE story_unlock_intents
        SET economic_eligible=FALSE WHERE id=$1`,[entitlement.id]),
    /story unlock provenance is immutable|published registry/);

    const startEvent = (await database.pool.query(`SELECT event_id FROM story_events
        WHERE run_id=$1 AND action='start'`,[started.runId])).rows[0].event_id;
    await database.pool.query(`INSERT INTO story_unlock_intents(
        user_id,content_version_id,unlock_type,unlock_key,source_event_id,
        progression_scope,provenance_type,provenance_key,economic_eligible
    ) VALUES($1,$2,'reward_catalog_visibility','branch.only.visibility',$3,
        'branch_local','branch_effect','branch.only',FALSE)`,
    [run.user_id,run.content_version_id,startEvent]);
    const rewards = new RewardCatalogRepository({pool:database.pool});
    await transaction(database.pool,async client=>{
        assert.equal(await rewards.hasVisibilityUnlock(client,run.user_id,
            'story_unlock','tides.storm-label'),true);
        assert.equal(await rewards.hasVisibilityUnlock(client,run.user_id,
            'story_unlock','reward.story-lantern'),true,
        'the immutable reward catalog alias resolves to the published milestone');
        assert.equal(await rewards.hasVisibilityUnlock(client,run.user_id,
            'story_unlock','branch.only.visibility'),false);
    });
    await assert.rejects(database.pool.query(`INSERT INTO story_unlock_intents(
        user_id,content_version_id,unlock_type,unlock_key,source_event_id,
        progression_scope,provenance_type,provenance_key,published_binding_hash,economic_eligible
    ) VALUES($1,$2,'reward_catalog_visibility','forged.visibility',$3,
        'account_entitlement','episode_first_clear','storm-name-market',$4,TRUE)`,
    [run.user_id,run.content_version_id,startEvent,'f'.repeat(64)]),
    /published registry/);

    const forgedCreator = await createCreator(database,'story_forged_entitlement');
    const forgedRun = await storyService.start(forgedCreator.username,{
        season:seasonTwo.slug,replay:false
    },{requestId:'story-forged-start'});
    const forgedIdentity = (await database.pool.query(`SELECT run.id AS run_id,
        run.user_id,run.content_version_id,event.event_id
        FROM story_runs run JOIN story_events event ON event.run_id=run.id
        WHERE run.id=$1 AND event.action='start'`,[forgedRun.runId])).rows[0];
    await database.pool.query(`INSERT INTO story_first_clears(
        user_id,content_version_id,episode_slug,run_id,source_event_id
    ) VALUES($1,$2,'storm-name-market',$3,$4)`,[
        forgedIdentity.user_id,forgedIdentity.content_version_id,
        forgedIdentity.run_id,forgedIdentity.event_id
    ]);
    await assert.rejects(database.pool.query(`INSERT INTO story_unlock_intents(
        user_id,content_version_id,unlock_type,unlock_key,source_event_id,
        progression_scope,provenance_type,provenance_key,published_binding_hash,economic_eligible
    ) VALUES($1,$2,'reward_catalog_visibility','tides.storm-label',$3,
        'account_entitlement','episode_first_clear','storm-name-market',$4,TRUE)`,
    [forgedIdentity.user_id,forgedIdentity.content_version_id,forgedIdentity.event_id,
        entitlement.published_binding_hash]),/matching first-clear provenance/,
    'a forged first-clear record at the wrong published node cannot authorize an entitlement');
    assert.equal(await count(database.pool,'reward_orders'),beforeOrders,
        'story unlock persistence never creates a reward order directly');
    assert.equal(await count(database.pool,'reward_grant_intents'),0,
        'checkpoint and first-clear persistence never crosses the reward outbox');

    await storyService.recover(creator.username,{
        runId:started.runId,expectedRevision:6,language:'en'
    },{requestId:'story-economic-recover'});
    assert.deepEqual((await runRow(database.pool,started.runId)).state_snapshot,initialStoryState());
    await transaction(database.pool,async client=>{
        assert.equal(await rewards.hasVisibilityUnlock(client,run.user_id,
            'story_unlock','tides.storm-label'),true,
        'a reviewed irreversible first clear remains an account entitlement');
    });
}

async function main() {
    const database = new DisposableDatabase('story_progression');
    try {
        await database.create();
        const questService = new QuestV2Service({pool:database.pool,BalanceLogger});
        await questService.initialize();
        const storyService = new StoryWorldService({
            pool:database.pool,
            contents:[seasonOne,seasonTwo],
            questV2Service:questService,
            questIntegrationEnabled:true,
            clock:()=>new Date('2026-08-17T12:00:00.000Z')
        });
        await storyService.initialize();
        await storyService.initialize();
        assert.equal(await count(database.pool,'story_progression_bindings'),
            storyService.progressionRegistry.bindings.length,
        'published progression binding seed is restart-idempotent');
        await verifyHistoricalUpgrade(database,storyService);
        await verifyRecoveryAndQuest(database,storyService);
        await verifyEconomicBoundary(database,storyService);
        console.log('Story progression PostgreSQL security verification passed');
    } finally {
        await database.close();
    }
}

main().catch(error=>{
    console.error(error);
    process.exitCode=1;
});
