'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { counts: storyCounts, seasons } = require('../content/streamer-world/story');
const questCatalog = require('../content/streamer-world/quests');
const gameCatalog = require('../content/streamer-world/games');
const gameBatchOneV1 = require('../content/streamer-world/games/batch-one');
const gameBatchTwoV1 = require('../content/streamer-world/games/batch-two');
const { ACHIEVEMENTS } = require('../content/streamer-world/achievements/catalog');
const { validateFullStoryCatalog, validateStoryAuthorship } = require('../domain/story/authorship-validator');
const { AchievementRuleError, progressFor, publicAchievement, validateDefinition, validateTrustedEvent } = require('../domain/achievements/rules');
const { AchievementService } = require('../services/achievement-service');
const { readStreamerWorldFlags } = require('../lib/streamer-world-flags');
const mazeEngine = require('../domain/dream-maze/engine');
const predictionEngine = require('../domain/keeper-prediction/engine');

const root = path.join(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root,file),'utf8');

test('five authored seasons exceed every story content minimum', () => {
    const minimums = {
        episodes: 60,
        nodes: 720,
        choices: 600,
        endings: 25,
        memories: 50,
        ownerInterventions: 30,
        bilingualBeats: 1200,
        uniqueTexts: 2400
    };
    for (const [key, minimum] of Object.entries(minimums)) {
        assert.ok(storyCounts[key] >= minimum, `${key}: ${storyCounts[key]} / ${minimum}`);
    }
    assert.deepEqual(seasons.map(season => ({
        slug: season.slug,
        episodes: season.episodes.length,
        nodes: season.nodes.length,
        choices: season.nodes.filter(node => node.type === 'choice')
            .reduce((sum, node) => sum + node.options.length, 0)
    })), [
        { slug: 'signal-between-us', episodes: 12, nodes: 274, choices: 120 },
        { slug: 'tides-of-return', episodes: 12, nodes: 360, choices: 240 },
        { slug: 'city-of-borrowed-hours', episodes: 12, nodes: 360, choices: 240 },
        { slug: 'archive-of-wild-stars', episodes: 12, nodes: 360, choices: 240 },
        { slug: 'homeward-constellation', episodes: 12, nodes: 360, choices: 240 }
    ]);
    assert.equal(storyCounts.nodes, 1714);
    assert.equal(storyCounts.choices, 1080);
    assert.deepEqual(validateFullStoryCatalog(seasons),storyCounts);
    assert.equal(new Set(seasons.flatMap(season=>season.episodes.map(episode=>`${season.slug}:${episode.slug}`))).size,60);
});

test('every authored choice has a visible outcome, result node, and four durable consequences', () => {
    for (const season of seasons) for (const node of season.nodes.filter(item=>item.type==='choice')) {
        for (const option of node.options) {
            assert.ok(option.label.zh.length>=4 && option.label.en.length>=4);
            assert.ok(option.outcome.zh.length>=4 && option.outcome.en.length>=4);
            assert.ok(season.nodesById.has(option.next));
            assert.deepEqual(option.effects.map(effect=>effect.type),['set_flag','increment_axis','increment_character','add_route']);
        }
    }
});

test('authorship validator rejects exact duplication and repeated sentence skeletons', () => {
    const plain = season => structuredClone({ slug:season.slug,title:season.title,episodes:season.episodes,nodes:season.nodes,memories:season.memories,messages:season.messages });
    assert.doesNotThrow(()=>validateStoryAuthorship([plain(seasons[0])]));
    const clone = plain(seasons[1]);
    clone.nodes[1].text = clone.nodes[0].text;
    assert.throws(()=>validateStoryAuthorship([clone]),/Repeated visible text/);
    const crossEpisode = plain(seasons[1]);
    const otherEpisode = crossEpisode.nodes.findIndex(node=>node.episode!==crossEpisode.nodes[0].episode);
    crossEpisode.nodes[otherEpisode].text = crossEpisode.nodes[0].text;
    assert.throws(()=>validateStoryAuthorship([crossEpisode]),/Repeated visible text/);
    const skeleton = plain(seasons[1]);
    const nouns = ['anchor','beacon','compass','drum','ember','foghorn','glass','harbor','island','jasmine'];
    const zhNouns = ['锚点','信标','罗盘','鼓面','余烬','雾笛','玻璃','港湾','岛屿','茉莉'];
    skeleton.nodes = skeleton.nodes.map((node,index)=>index<10?{...node,text:{zh:`同一个机器句骨架正在反复出现而只替换${zhNouns[index]}`,en:`The same machine sentence skeleton repeats while replacing only ${nouns[index]}`}}:node);
    assert.throws(()=>validateStoryAuthorship([skeleton]),/Repeated sentence skeleton/);
});

test('all story packs are deeply immutable and hashes remain distinct', () => {
    assert.equal(new Set(seasons.map(season=>season.contentHash)).size,5);
    for (const season of seasons) {
        assert.ok(Object.isFrozen(season));
        assert.ok(Object.isFrozen(season.nodes));
        assert.ok(Object.isFrozen(season.nodes[0]));
        assert.throws(()=>{ season.nodes[0].id='changed'; },TypeError);
    }
});

test('full quest catalog contains 180 authored quests, 30 named chains, and 12 boards', () => {
    assert.deepEqual(questCatalog.counts,{quests:180,chains:30,boards:12});
    assert.equal(new Set(questCatalog.quests.map(item=>item.titleZh)).size,180);
    assert.equal(new Set(questCatalog.quests.map(item=>item.titleEn)).size,180);
    for (const chain of questCatalog.chains) {
        assert.doesNotMatch(chain.titleZh,/(?:航线|路线)\s*\d+$/u);
        assert.doesNotMatch(chain.titleEn,/(?:route|chain)\s*\d+$/iu);
        assert.ok(chain.quests.length>=3);
    }
});

test('shared platform hint text is excluded from authored quest uniqueness', () => {
    const phaseEight = questCatalog.quests.slice(60);
    assert.equal(new Set(phaseEight.map(item=>item.titleZh)).size,120);
    assert.equal(new Set(phaseEight.map(item=>item.descriptionZh)).size,120);
    assert.equal(new Set(phaseEight.map(item=>item.hintZh)).size,1);
    assert.equal(new Set(phaseEight.map(item=>item.completionZh)).size,1);
});

test('version two game packs meet every blueprint content allocation while version one remains readable', () => {
    const expected = {
        'constellation-repair':[20,30],
        'signal-duet':[20,40],
        'mystery-board':[20,20],
        'story-weaver':[20,30],
        'studio-crafting':[20,85],
        'meteor-defense':[20,25],
        'dream-maze':[20,20],
        'broadcast-bingo':[20,20],
        'echo-memory':[20,50],
        'keeper-prediction':[20,20]
    };
    const old = { ...gameBatchOneV1,...gameBatchTwoV1 };
    for (const [gameId,[v1,v2]] of Object.entries(expected)) {
        assert.equal(old[gameId].challenges.length,v1,gameId);
        assert.equal(gameCatalog[gameId].challenges.length,v2,gameId);
        assert.notEqual(old[gameId].version,gameCatalog[gameId].version);
        assert.ok(Object.isFrozen(gameCatalog[gameId]));
    }
    assert.ok(gameCatalog['studio-crafting'].collections.length>=12);
    assert.equal(gameCatalog['dream-maze'].roomLibrary.length,100);
    assert.equal(gameCatalog['dream-maze'].eventDefinitions.length,30);
    assert.equal(gameCatalog['broadcast-bingo'].safeEventKinds.length,120);
    assert.ok(gameCatalog['keeper-prediction'].promptCards.length>=200);
});

test('expanded maze rooms and fictional prediction cards are consumed by safe public projections', () => {
    const mazePack=gameCatalog['dream-maze'];
    const maze=mazeEngine.createState({challengeId:mazePack.challenges[0].id,difficulty:'gentle',mode:'solo',contentPack:mazePack,creatorUsername:'creator',serverDateKey:'2026-08-16'});
    const mazePublic=mazeEngine.project(maze,'creator',mazePack);
    assert.ok(mazePack.roomLibrary.some(room=>room.id===mazePublic.room.id));
    assert.equal(Object.hasOwn(mazePublic,'graph'),false);
    assert.equal(Object.hasOwn(mazePublic,'goal'),false);

    const predictionPack=gameCatalog['keeper-prediction'];
    const prediction=predictionEngine.createState({challengeId:predictionPack.challenges[0].id,difficulty:'standard',mode:'coop',contentPack:predictionPack});
    const predictionPublic=predictionEngine.project(prediction,'creator',predictionPack);
    const card=predictionPack.promptCards.find(item=>item.id===predictionPublic.promptCardId);
    assert.equal(predictionPublic.promptZh,card.promptZh);
    assert.deepEqual(predictionPublic.choicesEn,card.choicesEn);
    assert.equal(Object.hasOwn(predictionPublic,'submissions'),false);
});

test('expanded game prose, room definitions, event labels, and prediction prompts are unique', () => {
    const challengeTexts=Object.values(gameCatalog).flatMap(pack=>pack.challenges.flatMap(item=>[item.titleZh,item.titleEn,item.briefZh,item.briefEn]));
    assert.equal(new Set(challengeTexts).size,challengeTexts.length);
    const rooms=gameCatalog['dream-maze'].roomLibrary;
    assert.equal(new Set(rooms.map(item=>item.titleZh)).size,rooms.length);
    assert.equal(new Set(rooms.map(item=>item.descriptionEn)).size,rooms.length);
    const safe=gameCatalog['broadcast-bingo'].safeEventKinds;
    assert.equal(new Set(safe.map(item=>item[0])).size,120);
    assert.equal(new Set(safe.map(item=>item[1])).size,120);
    const cards=gameCatalog['keeper-prediction'].promptCards;
    assert.equal(new Set(cards.map(item=>item.promptZh)).size,cards.length);
    assert.equal(new Set(cards.map(item=>item.promptEn)).size,cards.length);
});

test('the original two hundred challenges carry unique bilingual runtime flavor', () => {
    const keys = [
        'successZh', 'successEn', 'retryZh', 'retryEn', 'accessibilityZh',
        'accessibilityEn', 'questZh', 'questEn', 'storyZh', 'storyEn'
    ];
    const values = [];
    for (const [gameId, pack] of Object.entries(gameCatalog)) {
        for (const challenge of pack.challenges.slice(0, 20)) {
            assert.ok(challenge.flavor, `${gameId}:${challenge.id}`);
            for (const key of keys) {
                assert.ok(challenge.flavor[key].length >= 4, `${gameId}:${challenge.id}:${key}`);
                values.push(`${key.endsWith('Zh') ? 'zh' : 'en'}:${challenge.flavor[key]}`);
            }
        }
    }
    assert.equal(values.length, 2000);
    assert.equal(new Set(values).size, values.length);
    const pack = gameCatalog['constellation-repair'];
    const state = require('../domain/constellation-repair/engine').createState({
        challengeId: pack.challenges[0].id,
        difficulty: 'gentle',
        mode: 'solo',
        contentPack: pack
    });
    const projection = require('../domain/constellation-repair/engine').project(state, 'creator', pack);
    assert.deepEqual(projection.flavor, pack.challenges[0].flavor);
    assert.match(source('public/js/streamer-game.js'), /localized\(state\.flavor, 'accessibility'\)/);
    assert.match(source('public/js/streamer-game.js'), /localized\(state\.flavor, 'quest'\)/);
    assert.match(source('public/js/streamer-game.js'), /localized\(state\.flavor, 'story'\)/);
});

test('achievement catalog has sixty immutable bilingual definitions and fixed collection outcomes', () => {
    assert.equal(ACHIEVEMENTS.length,60);
    assert.equal(new Set(ACHIEVEMENTS.map(item=>item.slug)).size,60);
    assert.equal(new Set(ACHIEVEMENTS.map(item=>item.titleZh)).size,60);
    assert.equal(new Set(ACHIEVEMENTS.map(item=>item.collectionKey)).size,60);
    for (const item of ACHIEVEMENTS) {
        assert.ok(Object.isFrozen(item));
        assert.match(item.contentHash,/^[0-9a-f]{64}$/);
        assert.equal(validateDefinition(item),item);
    }
});

test('achievement rule validation rejects unknown events, filters, and distinct fields', () => {
    const base = {slug:'valid-achievement',eventType:'game.run.completed',target:1,filters:{gameId:'signal-duet'},hidden:false,season:null,collectionKey:'valid-item'};
    assert.equal(validateDefinition(base),base);
    assert.throws(()=>validateDefinition({...base,eventType:'browser.claimed'}),AchievementRuleError);
    assert.throws(()=>validateDefinition({...base,filters:{providerId:'secret'}}),/Unknown achievement filter/);
    assert.throws(()=>validateDefinition({...base,filters:{distinct:'username'}}),/Unknown distinct/);
});

test('trusted achievement payload is closed and authority source must be server shaped', () => {
    const event = {sourceType:'streamer_game',sourceEventId:'game-run:00000000-0000-4000-a000-000000000001',eventType:'game.run.completed',occurredAt:'2026-08-16T10:00:00.000Z',payload:{runId:'00000000-0000-4000-a000-000000000001',gameId:'signal-duet',challengeId:'beat-one',difficulty:'gentle',mode:'solo',score:10,authoritativeScore:true,resumed:false}};
    assert.equal(validateTrustedEvent(event).payload.gameId,'signal-duet');
    assert.throws(()=>validateTrustedEvent({...event,payload:{...event.payload,providerId:'hidden'}}),/unknown fields/);
    assert.throws(()=>validateTrustedEvent({...event,sourceType:'browser'}),AchievementRuleError);
});

test('distinct progress counts a semantic key once and ordinary progress increments once per unique source event', () => {
    const event = {eventType:'game.run.completed',payload:{gameId:'signal-duet'}};
    const definition = {eventType:event.eventType,filters:{distinct:'gameId'}};
    const first = progressFor(definition,event,[]);
    const replay = progressFor(definition,event,first.keys);
    assert.equal(first.progressDelta,1);
    assert.equal(replay.progressDelta,0);
    assert.deepEqual(replay.keys,['string:signal-duet']);
});

test('hidden achievement projection leaks no title, condition, progress, or collection before unlock', () => {
    const definition = {slug:'hidden-one',hidden:true,title_zh:'秘密标题',title_en:'Secret title',description_zh:'秘密条件',description_en:'Secret condition',target:5,collection_key:'secret-item'};
    assert.deepEqual(publicAchievement(definition,null,'en'),{slug:'hidden-one',hidden:true,locked:true});
    const visible = publicAchievement(definition,{progress:5,unlocked_at:'2026-01-01T00:00:00.000Z'},'en');
    assert.equal(visible.title,'Secret title');
    assert.equal(visible.collectionKey,'secret-item');
});

function memoryHarness({ failCollection = false } = {}) {
    const holder = { current:{definitions:ACHIEVEMENTS.map((item,index)=>({id:index+1,slug:item.slug,event_type:item.eventType,target:item.target,filters:item.filters,hidden:item.hidden,season:item.season,collection_key:item.collectionKey,title_zh:item.titleZh,title_en:item.titleEn,description_zh:item.descriptionZh,description_en:item.descriptionEn})),events:[],progress:new Map(),unlocks:[],collection:[],audits:[]} };
    let eventId = 1;
    const repositoryFactory = () => ({
        lockUser:async username=>username==='creator'?{id:7,username}:null,
        readUser:async username=>username==='creator'?{id:7,username}:null,
        definitions:async type=>holder.current.definitions.filter(item=>item.event_type===type),
        insertEvent:async value=>{
            const prior=holder.current.events.find(item=>item.source_type===value.sourceType&&item.source_event_id===value.sourceEventId);
            if(prior)return{inserted:false,row:prior};
            const row={id:eventId++,user_id:value.userId,source_type:value.sourceType,source_event_id:value.sourceEventId,event_type:value.eventType,payload:value.payload,semantic_hash:value.semanticHash};holder.current.events.push(row);return{inserted:true,row};
        },
        unlocksForEvent:async id=>holder.current.unlocks.filter(item=>item.eventId===id).map(item=>item.slug).sort(),
        lockProgress:async(userId,achievementId)=>{const key=`${userId}:${achievementId}`;if(!holder.current.progress.has(key))holder.current.progress.set(key,{user_id:userId,achievement_id:achievementId,progress:0,progress_keys:[],revision:0,unlocked_at:null});return structuredClone(holder.current.progress.get(key));},
        updateProgress:async(row,progress,keys,lastEventId,unlocked)=>{const key=`${row.user_id}:${row.achievement_id}`,current=holder.current.progress.get(key);if(current.revision!==row.revision)return null;const saved={...current,progress,progress_keys:[...keys],revision:current.revision+1,last_event_id:lastEventId,unlocked_at:unlocked?'2026-08-16T10:00:00.000Z':null};holder.current.progress.set(key,saved);return saved;},
        insertUnlock:async(userId,achievementId,id)=>{if(holder.current.unlocks.some(item=>item.userId===userId&&item.achievementId===achievementId))return false;const definition=holder.current.definitions.find(item=>item.id===achievementId);holder.current.unlocks.push({userId,achievementId,eventId:id,slug:definition.slug});return true;},
        insertCollection:async(userId,itemKey,slug)=>{if(failCollection)throw new Error('collection failure');if(holder.current.collection.some(item=>item.item_key===itemKey))return false;holder.current.collection.push({userId,item_key:itemKey,source_type:'achievement',source_id:slug});return true;},
        archiveSeason:async()=>true,
        audit:async value=>holder.current.audits.push(value),
        seed:async definitions=>definitions.length,
        state:async()=>({achievements:[],collection:[],archives:[]})
    });
    const pool={connect:async()=>{let snapshot;return{query:async sql=>{if(sql==='BEGIN')snapshot=structuredClone({definitions:holder.current.definitions,events:holder.current.events,progress:[...holder.current.progress],unlocks:holder.current.unlocks,collection:holder.current.collection,audits:holder.current.audits});if(sql==='ROLLBACK'){holder.current={...snapshot,progress:new Map(snapshot.progress)};}return{rows:[]};},release(){}};}};
    return {holder,pool,repositoryFactory};
}

function gameEvent(overrides={}) {
    return {sourceType:'streamer_game',sourceEventId:'achievement-game:00000000-0000-4000-a000-000000000001',eventType:'game.run.completed',occurredAt:'2026-08-16T10:00:00.000Z',payload:{runId:'00000000-0000-4000-a000-000000000001',gameId:'signal-duet',challengeId:'beat-one',difficulty:'gentle',mode:'solo',score:10,authoritativeScore:true,resumed:false},...overrides};
}

test('trusted achievement event unlocks and grants a fixed collection item exactly once', async () => {
    const memory=memoryHarness();const service=new AchievementService({pool:memory.pool,repositoryFactory:memory.repositoryFactory});
    const first=await service.transaction(client=>service.recordTrustedEvent(client,'creator',gameEvent(),{requestId:'req-1'}));
    const replay=await service.transaction(client=>service.recordTrustedEvent(client,'creator',gameEvent(),{requestId:'req-2'}));
    assert.equal(first.replayed,false);assert.ok(first.unlocked.includes('signal-duet-listener'));
    assert.equal(replay.replayed,true);assert.deepEqual(replay.unlocked,first.unlocked.slice().sort());
    assert.equal(memory.holder.current.events.length,1);assert.equal(memory.holder.current.collection.filter(item=>item.item_key==='duet-metronome').length,1);
});

test('same source identity with changed payload fails closed without extra progress', async () => {
    const memory=memoryHarness();const service=new AchievementService({pool:memory.pool,repositoryFactory:memory.repositoryFactory});
    await service.transaction(client=>service.recordTrustedEvent(client,'creator',gameEvent(),{}));
    await assert.rejects(service.transaction(client=>service.recordTrustedEvent(client,'creator',gameEvent({payload:{...gameEvent().payload,score:11}}),{})),error=>error.code==='ACHIEVEMENT_EVENT_COLLISION');
    assert.equal(memory.holder.current.events.length,1);
});

test('collection settlement failure rolls back event, progress, unlock, collection, and audit', async () => {
    const memory=memoryHarness({failCollection:true});const service=new AchievementService({pool:memory.pool,repositoryFactory:memory.repositoryFactory});
    await assert.rejects(service.transaction(client=>service.recordTrustedEvent(client,'creator',gameEvent(),{})),/collection failure/);
    assert.equal(memory.holder.current.events.length,0);assert.equal(memory.holder.current.progress.size,0);assert.equal(memory.holder.current.unlocks.length,0);assert.equal(memory.holder.current.collection.length,0);assert.equal(memory.holder.current.audits.length,0);
});

test('strict lowercase achievement flag defaults off and requires creator foundation', () => {
    assert.equal(readStreamerWorldFlags({}).achievementsEnabled,false);
    assert.equal(readStreamerWorldFlags({STREAMER_ACHIEVEMENTS_ENABLED:'true'}).achievementsEnabled,false);
    assert.equal(readStreamerWorldFlags({STREAMER_WORLD_ENABLED:'true',CREATOR_PROFILE_ENABLED:'true',STREAMER_ACHIEVEMENTS_ENABLED:'true'}).achievementsEnabled,true);
    assert.equal(readStreamerWorldFlags({STREAMER_WORLD_ENABLED:'true',CREATOR_PROFILE_ENABLED:'true',STREAMER_ACHIEVEMENTS_ENABLED:'TRUE'}).achievementsEnabled,false);
});

test('achievement migration is append-only, one-way, unique, versioned, and provider isolated', () => {
    const sql=source('migrations/add_streamer_achievements_and_archives.sql');
    assert.match(sql,/UNIQUE \(source_type, source_event_id\)/);
    assert.match(sql,/UNIQUE \(user_id, achievement_id\)/);
    assert.match(sql,/achievement definitions are immutable/);
    assert.match(sql,/streamer achievement history is append-only/);
    assert.match(sql,/streamer_season_archives/);
    assert.doesNotMatch(sql,/delivery_outbox|gift_exchanges|provider_receipt|BalanceLogger/i);
});

test('achievement modules never import balance, gift provider, sender, or outbox boundaries', () => {
    for(const file of ['domain/achievements/rules.js','repositories/achievement-repository.js','services/achievement-service.js','routes/creator-achievements.js']){
        const code=source(file);assert.doesNotMatch(code,/BalanceLogger|gift-provider|delivery_outbox|enqueueWishInventorySend|provider_receipt/);
    }
});

test('achievement page is bilingual, escaped by EJS, mobile responsive, and read-only', () => {
    const view=source('views/creator-achievements.ejs'),css=source('public/creator-achievements.css'),routes=source('routes/creator-achievements.js');
    assert.match(view,/隐藏坐标/);assert.match(view,/Hidden coordinate/);assert.doesNotMatch(view,/<%-\s*item\./);
    assert.match(css,/@media\(max-width:600px\)/);assert.doesNotMatch(routes,/app\.(post|put|patch|delete)\(/i);
});

test('live, story, game, and quest integrations call achievement settlement inside existing transaction paths', () => {
    assert.match(source('services/story-world-service.js'),/achievementService\.recordTrustedEvent\(client/);
    assert.match(source('services/streamer-game-service.js'),/achievementService\.recordTrustedEvent\(client/);
    assert.match(source('services/quest-v2-service.js'),/achievementService\.recordTrustedEvent\(client/);
    assert.match(source('services/live-interaction-participant-commands.js'),/achievementService\.recordTrustedEvent\(client/);
    assert.match(source('services/live-interaction-service.js'),/achievement-live-reconsent/);
});
