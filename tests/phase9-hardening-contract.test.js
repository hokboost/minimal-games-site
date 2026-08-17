'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const {
    BASE_MIGRATION,
    MIGRATIONS,
    migrationTransactionBody
} = require('../lib/database-migrations');
const { FLAG_NAMES, readStreamerWorldFlags } = require('../lib/streamer-world-flags');
const { source } = require('./helpers/phase9-dom');

const hardening = source('migrations/add_streamer_phase9_hardening.sql');
const achievement = source('migrations/add_streamer_achievements_and_archives.sql');

function checksum(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function indexDefinition(name) {
    const matcher = new RegExp(`CREATE INDEX IF NOT EXISTS ${name}\\s+ON ([\\s\\S]*?);`, 'i');
    return hardening.match(matcher)?.[0] || '';
}

function allFalseEnvironment(overrides = {}) {
    return Object.fromEntries([
        ...FLAG_NAMES.map(name => [name, 'false']),
        ...Object.entries(overrides)
    ]);
}

test('Phase 9 migration is append-only and registered after every schema it indexes', () => {
    assert.equal(MIGRATIONS[MIGRATIONS.indexOf('add_streamer_phase9_hardening.sql') - 1],
        'add_streamer_achievements_and_archives.sql');
    assert.ok(MIGRATIONS.indexOf('add_creator_foundation.sql') < MIGRATIONS.indexOf('add_streamer_phase9_hardening.sql'));
    assert.ok(MIGRATIONS.indexOf('add_streamer_quest_engine_v2.sql') < MIGRATIONS.indexOf('add_streamer_phase9_hardening.sql'));
    assert.ok(MIGRATIONS.indexOf('add_story_world_season_one.sql') < MIGRATIONS.indexOf('add_streamer_phase9_hardening.sql'));
    assert.ok(MIGRATIONS.indexOf('add_live_interaction_platform.sql') < MIGRATIONS.indexOf('add_streamer_phase9_hardening.sql'));
    assert.ok(MIGRATIONS.indexOf('add_streamer_reward_catalog.sql') < MIGRATIONS.indexOf('add_streamer_phase9_hardening.sql'));
    assert.equal(new Set(MIGRATIONS).size, MIGRATIONS.length);
});

test('achievement migration is now part of fresh and historical tracked migration contracts', () => {
    assert.ok(MIGRATIONS.includes('add_streamer_achievements_and_archives.sql'));
    assert.match(achievement, /CREATE TABLE IF NOT EXISTS streamer_achievement_definitions/);
    assert.match(achievement, /CREATE TABLE IF NOT EXISTS streamer_achievement_events/);
    assert.match(achievement, /CREATE TABLE IF NOT EXISTS streamer_achievement_progress/);
    assert.match(achievement, /CREATE TABLE IF NOT EXISTS streamer_collection_holdings/);
    assert.match(achievement, /CREATE TABLE IF NOT EXISTS streamer_season_archives/);
    assert.match(achievement, /UNIQUE \(source_type, source_event_id\)/);
    assert.match(achievement, /UNIQUE \(user_id, achievement_id\)/);
});

test('Phase 9 migration keeps explicit transaction boundaries for tracked execution', () => {
    assert.match(hardening, /^BEGIN;/);
    assert.match(hardening, /COMMIT;\s*$/);
    const body = migrationTransactionBody(hardening);
    assert.doesNotMatch(body, /^BEGIN;/);
    assert.doesNotMatch(body, /COMMIT;\s*$/);
    assert.match(body, /creator_inbox_user_archive_time_idx/);
    assert.match(body, /streamer_season_archives_user_created_cursor_idx/);
});

test('Phase 9 migration checksum is stable-length lowercase SHA-256', () => {
    const digest = checksum(hardening);
    assert.equal(digest.length, 64);
    assert.match(digest, /^[0-9a-f]{64}$/);
    assert.equal(digest, checksum(hardening));
    assert.notEqual(digest, checksum(`${hardening}\nSELECT 1;`));
});

test('creator inbox pagination index matches user, archive, time, and tie-break cursor', () => {
    const definition = indexDefinition('creator_inbox_user_archive_time_idx');
    assert.match(definition, /creator_inbox_messages/);
    assert.match(definition, /user_id/);
    assert.match(definition, /archived_at/);
    assert.match(definition, /sent_at DESC/);
    assert.match(definition, /id DESC/);
    assert.doesNotMatch(definition, /created_at/);
});

test('quest journal cursor index matches bounded user history order', () => {
    const definition = indexDefinition('quest_v2_assignments_user_updated_cursor_idx');
    assert.match(definition, /quest_v2_assignments/);
    assert.match(definition, /user_id/);
    assert.match(definition, /updated_at DESC/);
    assert.match(definition, /id DESC/);
});

test('quest review index is partial and excludes terminal history', () => {
    const definition = indexDefinition('quest_v2_assignments_review_cursor_idx');
    assert.match(definition, /status/);
    assert.match(definition, /submitted_at ASC/);
    assert.match(definition, /id ASC/);
    assert.match(definition, /WHERE status IN \('submitted', 'under_review'\)/);
    assert.doesNotMatch(definition, /completed|declined|cancelled/);
});

test('story recovery cursor binds user, campaign, immutable version, and stable time', () => {
    const definition = indexDefinition('story_runs_user_campaign_version_cursor_idx');
    assert.match(definition, /story_runs/);
    assert.match(definition, /user_id/);
    assert.match(definition, /campaign_id/);
    assert.match(definition, /content_version_id/);
    assert.match(definition, /updated_at DESC/);
    assert.match(definition, /id DESC/);
});

test('active story recovery index does not include completed or abandoned runs', () => {
    const definition = indexDefinition('story_runs_active_recovery_idx');
    assert.match(definition, /user_id/);
    assert.match(definition, /updated_at DESC/);
    assert.match(definition, /WHERE status = 'active'/);
    assert.doesNotMatch(definition, /completed|abandoned/);
});

test('live inbox cursor is scoped by interaction and status before chronology', () => {
    const definition = indexDefinition('live_interaction_items_room_status_cursor_idx');
    assert.match(definition, /live_interaction_items/);
    assert.match(definition, /interaction_id/);
    assert.match(definition, /status/);
    assert.match(definition, /created_at DESC/);
    assert.match(definition, /id DESC/);
});

test('live moderation cursor puts status before deterministic report chronology', () => {
    const definition = indexDefinition('live_interaction_reports_status_cursor_idx');
    assert.match(definition, /live_interaction_reports/);
    assert.match(definition, /status/);
    assert.match(definition, /created_at DESC/);
    assert.match(definition, /id DESC/);
});

test('reward user history cursor supports user and status filtering', () => {
    const definition = indexDefinition('reward_orders_user_status_cursor_idx');
    assert.match(definition, /reward_orders/);
    assert.match(definition, /user_id/);
    assert.match(definition, /status/);
    assert.match(definition, /created_at DESC/);
    assert.match(definition, /id DESC/);
});

test('reward review index is partial and cannot scan unrelated terminal orders', () => {
    const definition = indexDefinition('reward_orders_pending_review_cursor_idx');
    assert.match(definition, /created_at ASC/);
    assert.match(definition, /id ASC/);
    assert.match(definition, /WHERE status = 'pending_approval'/);
    assert.doesNotMatch(definition, /claimed|cancelled|revoked/);
});

test('achievement progress cursor stays user scoped and orders unlocks deterministically', () => {
    const definition = indexDefinition('streamer_achievement_progress_user_unlock_cursor_idx');
    assert.match(definition, /streamer_achievement_progress/);
    assert.match(definition, /user_id/);
    assert.match(definition, /unlocked_at DESC/);
    assert.match(definition, /achievement_id DESC/);
});

test('permanent collection cursor supports user-scoped acquired history', () => {
    const definition = indexDefinition('streamer_collection_holdings_user_acquired_cursor_idx');
    assert.match(definition, /streamer_collection_holdings/);
    assert.match(definition, /user_id/);
    assert.match(definition, /acquired_at DESC/);
    assert.match(definition, /id DESC/);
});

test('season archive cursor is user scoped with immutable creation order', () => {
    const definition = indexDefinition('streamer_season_archives_user_created_cursor_idx');
    assert.match(definition, /streamer_season_archives/);
    assert.match(definition, /user_id/);
    assert.match(definition, /created_at DESC/);
    assert.match(definition, /id DESC/);
});

test('Phase 9 hardening migration contains no destructive table or column operation', () => {
    assert.doesNotMatch(hardening, /DROP\s+(TABLE|COLUMN|INDEX)/i);
    assert.doesNotMatch(hardening, /TRUNCATE/i);
    assert.doesNotMatch(hardening, /DELETE\s+FROM/i);
    assert.doesNotMatch(hardening, /UPDATE\s+[A-Za-z_]/i);
    assert.doesNotMatch(hardening, /ALTER\s+TABLE/i);
    assert.doesNotMatch(hardening, /CREATE\s+TABLE/i);
});

test('every Phase 9 index uses IF NOT EXISTS for replay-safe upgrades', () => {
    const creates = Array.from(hardening.matchAll(/CREATE INDEX[^;]+;/gi), match => match[0]);
    assert.equal(creates.length, 12);
    for (const statement of creates) {
        assert.match(statement, /^CREATE INDEX IF NOT EXISTS/i);
        assert.match(statement, /\([^)]+\)/);
    }
});

test('fresh migration test verifies all streamer vertical slice tables', () => {
    const script = source('scripts/test-fresh-migrations.js');
    assert.match(script, /creator_profiles/);
    assert.match(script, /quest_v2_assignments/);
    assert.match(script, /story_runs/);
    assert.match(script, /live_interaction_events/);
    assert.match(script, /streamer_game_runs/);
    assert.match(script, /reward_orders/);
    assert.match(script, /streamer_achievement_definitions/);
    assert.match(script, /streamer_achievement_progress/);
    assert.match(script, /streamer_season_archives/);
});

test('varchar transition parameters keep one explicit PostgreSQL type in assignments and conditions', () => {
    const story = source('repositories/story-world-repository.js');
    assert.ok((story.match(/\$3::VARCHAR\(20\)/g) || []).length >= 2);
    assert.match(story, /status=\$3::VARCHAR\(20\)/);
    assert.match(story, /CASE WHEN \$3::VARCHAR\(20\)='completed'/);

    const live = source('repositories/live-interaction-repository.js');
    assert.ok((live.match(/\$3::VARCHAR\(20\)/g) || []).length >= 2);
    assert.match(live, /status=\$3::VARCHAR\(20\)/);
    assert.match(live, /CASE WHEN \$3::VARCHAR\(20\) IN \('left','closed'\)/);

    const rewards = source('repositories/reward-catalog-repository.js');
    assert.ok((rewards.match(/\$8::VARCHAR\(24\)/g) || []).length >= 2);
    assert.ok((rewards.match(/\$2::VARCHAR\(24\)/g) || []).length >= 7);
    assert.match(rewards, /status=\$2::VARCHAR\(24\)/);
    assert.match(rewards, /CASE WHEN \$2::VARCHAR\(24\)='revoked'/);

    const quests = source('repositories/quest-v2-runtime-repository.js');
    assert.ok((quests.match(/\$4::VARCHAR\(20\)/g) || []).length >= 7);
    assert.ok((quests.match(/\$2::VARCHAR\(20\)/g) || []).length >= 2);
    assert.ok((quests.match(/\$6::VARCHAR\(20\)/g) || []).length >= 2);
    assert.match(quests, /status = \$4::VARCHAR\(20\)/);
    assert.match(quests, /CASE WHEN \$4::VARCHAR\(20\) = 'completed'/);
    assert.match(quests, /SET status = CASE \$2::VARCHAR\(20\)/);
    assert.match(quests, /status, posted_at[\s\S]*\$6::VARCHAR\(20\)/);

    const admin = source('routes/admin.js');
    assert.ok((admin.match(/\$1::VARCHAR\(20\)/g) || []).length >= 2);
    assert.match(admin, /SET result = \$1::VARCHAR\(20\)/);
    assert.match(admin, /CASE WHEN \$1::VARCHAR\(20\) = 'in_progress'/);
});

test('fresh migration test verifies every principal Phase 9 cursor index', () => {
    const script = source('scripts/test-fresh-migrations.js');
    assert.match(script, /creator_inbox_user_archive_time_idx/);
    assert.match(script, /quest_v2_assignments_user_updated_cursor_idx/);
    assert.match(script, /story_runs_user_campaign_version_cursor_idx/);
    assert.match(script, /live_interaction_items_room_status_cursor_idx/);
    assert.match(script, /reward_orders_user_status_cursor_idx/);
    assert.match(script, /streamer_achievement_progress_user_unlock_cursor_idx/);
});

test('historical migration verification includes every streamer platform layer', () => {
    const script = source('scripts/test-fresh-migrations.js');
    assert.match(script, /creator_foundation_upgraded/);
    assert.match(script, /quest_engine_upgraded/);
    assert.match(script, /story_world_upgraded/);
    assert.match(script, /live_platform_upgraded/);
    assert.match(script, /streamer_games_upgraded/);
    assert.match(script, /reward_catalog_upgraded/);
    assert.match(script, /achievements_upgraded/);
});

test('fresh migration verification runs EXPLAIN for six high-traffic page queries', () => {
    const script = source('scripts/test-fresh-migrations.js');
    assert.match(script, /EXPLAIN \(FORMAT JSON\)[\s\S]*creator_inbox_messages/);
    assert.match(script, /EXPLAIN \(FORMAT JSON\)[\s\S]*quest_v2_assignments/);
    assert.match(script, /EXPLAIN \(FORMAT JSON\)[\s\S]*story_runs/);
    assert.match(script, /EXPLAIN \(FORMAT JSON\)[\s\S]*live_interaction_items/);
    assert.match(script, /EXPLAIN \(FORMAT JSON\)[\s\S]*reward_orders/);
    assert.match(script, /EXPLAIN \(FORMAT JSON\)[\s\S]*streamer_achievement_progress/);
});

test('all streamer feature flags default closed for absent environment', () => {
    const flags = readStreamerWorldFlags({});
    for (const name of FLAG_NAMES) assert.equal(flags[name], false, name);
    assert.equal(flags.creatorFoundationEnabled, false);
    assert.equal(flags.questEngineV2Enabled, false);
    assert.equal(flags.storyWorldEnabled, false);
    assert.equal(flags.liveInteractionsEnabled, false);
    assert.equal(flags.newGamesEnabled, false);
    assert.equal(flags.rewardsEnabled, false);
    assert.equal(flags.achievementsEnabled, false);
    assert.equal(flags.ownerUsername, null);
});

test('lowercase true is the only value that opens a feature flag', () => {
    for (const value of ['TRUE', 'True', '1', 'yes', 'on', true, 1, '', ' false ', ' true ']) {
        const flags = readStreamerWorldFlags({ STREAMER_WORLD_ENABLED: value });
        assert.equal(flags.STREAMER_WORLD_ENABLED, false, String(value));
    }
    assert.equal(readStreamerWorldFlags({ STREAMER_WORLD_ENABLED: 'true' }).STREAMER_WORLD_ENABLED, true);
});

test('creator foundation requires both world and profile flags', () => {
    assert.equal(readStreamerWorldFlags(allFalseEnvironment()).creatorFoundationEnabled, false);
    assert.equal(readStreamerWorldFlags(allFalseEnvironment({ STREAMER_WORLD_ENABLED: 'true' })).creatorFoundationEnabled, false);
    assert.equal(readStreamerWorldFlags(allFalseEnvironment({ CREATOR_PROFILE_ENABLED: 'true' })).creatorFoundationEnabled, false);
    assert.equal(readStreamerWorldFlags(allFalseEnvironment({
        STREAMER_WORLD_ENABLED: 'true',
        CREATOR_PROFILE_ENABLED: 'true'
    })).creatorFoundationEnabled, true);
});

test('quest engine requires world, profile, and its own independent flag', () => {
    assert.equal(readStreamerWorldFlags(allFalseEnvironment({
        STREAMER_WORLD_ENABLED: 'true',
        CREATOR_PROFILE_ENABLED: 'true'
    })).questEngineV2Enabled, false);
    assert.equal(readStreamerWorldFlags(allFalseEnvironment({
        STREAMER_WORLD_ENABLED: 'true',
        QUEST_ENGINE_V2_ENABLED: 'true'
    })).questEngineV2Enabled, false);
    assert.equal(readStreamerWorldFlags(allFalseEnvironment({
        CREATOR_PROFILE_ENABLED: 'true',
        QUEST_ENGINE_V2_ENABLED: 'true'
    })).questEngineV2Enabled, false);
    assert.equal(readStreamerWorldFlags(allFalseEnvironment({
        STREAMER_WORLD_ENABLED: 'true',
        CREATOR_PROFILE_ENABLED: 'true',
        QUEST_ENGINE_V2_ENABLED: 'true'
    })).questEngineV2Enabled, true);
});

test('story world requires world, profile, and story flags without quest dependency', () => {
    const flags = readStreamerWorldFlags(allFalseEnvironment({
        STREAMER_WORLD_ENABLED: 'true',
        CREATOR_PROFILE_ENABLED: 'true',
        STORY_WORLD_ENABLED: 'true'
    }));
    assert.equal(flags.storyWorldEnabled, true);
    assert.equal(flags.questEngineV2Enabled, false);
    assert.equal(flags.liveInteractionsEnabled, false);
    assert.equal(flags.newGamesEnabled, false);
    assert.equal(flags.rewardsEnabled, false);
    assert.equal(flags.achievementsEnabled, false);
});

test('live platform requires world, profile, and live flags without configured owner projection', () => {
    const flags = readStreamerWorldFlags(allFalseEnvironment({
        STREAMER_WORLD_ENABLED: 'true',
        CREATOR_PROFILE_ENABLED: 'true',
        LIVE_INTERACTIONS_ENABLED: 'true'
    }));
    assert.equal(flags.liveInteractionsEnabled, true);
    assert.equal(flags.ownerUsername, null);
    assert.equal(flags.storyWorldEnabled, false);
    assert.equal(flags.questEngineV2Enabled, false);
});

test('new games require independent game flag and preserve every other module off', () => {
    const flags = readStreamerWorldFlags(allFalseEnvironment({
        STREAMER_WORLD_ENABLED: 'true',
        CREATOR_PROFILE_ENABLED: 'true',
        STREAMER_NEW_GAMES_ENABLED: 'true'
    }));
    assert.equal(flags.newGamesEnabled, true);
    assert.equal(flags.questEngineV2Enabled, false);
    assert.equal(flags.storyWorldEnabled, false);
    assert.equal(flags.liveInteractionsEnabled, false);
    assert.equal(flags.rewardsEnabled, false);
    assert.equal(flags.achievementsEnabled, false);
});

test('reward catalog requires independent reward flag and keeps gift send configuration separate', () => {
    const flags = readStreamerWorldFlags(allFalseEnvironment({
        STREAMER_WORLD_ENABLED: 'true',
        CREATOR_PROFILE_ENABLED: 'true',
        STREAMER_REWARD_CATALOG_ENABLED: 'true',
        EXTERNAL_GIFTS_ENABLED: 'true'
    }));
    assert.equal(flags.rewardsEnabled, true);
    assert.equal(flags.EXTERNAL_GIFTS_ENABLED, undefined);
    assert.equal(flags.achievementsEnabled, false);
    assert.equal(flags.liveInteractionsEnabled, false);
});

test('achievements require independent achievement flag and do not open rewards', () => {
    const flags = readStreamerWorldFlags(allFalseEnvironment({
        STREAMER_WORLD_ENABLED: 'true',
        CREATOR_PROFILE_ENABLED: 'true',
        STREAMER_ACHIEVEMENTS_ENABLED: 'true'
    }));
    assert.equal(flags.achievementsEnabled, true);
    assert.equal(flags.rewardsEnabled, false);
    assert.equal(flags.storyWorldEnabled, false);
    assert.equal(flags.newGamesEnabled, false);
});

test('global world rollback closes every module without modifying individual flag values', () => {
    const env = Object.fromEntries(FLAG_NAMES.map(name => [name, 'true']));
    env.STREAMER_WORLD_ENABLED = 'false';
    const flags = readStreamerWorldFlags(env);
    assert.equal(flags.CREATOR_PROFILE_ENABLED, true);
    assert.equal(flags.QUEST_ENGINE_V2_ENABLED, true);
    assert.equal(flags.STORY_WORLD_ENABLED, true);
    assert.equal(flags.LIVE_INTERACTIONS_ENABLED, true);
    assert.equal(flags.STREAMER_NEW_GAMES_ENABLED, true);
    assert.equal(flags.STREAMER_REWARD_CATALOG_ENABLED, true);
    assert.equal(flags.STREAMER_ACHIEVEMENTS_ENABLED, true);
    assert.equal(flags.creatorFoundationEnabled, false);
    assert.equal(flags.questEngineV2Enabled, false);
    assert.equal(flags.storyWorldEnabled, false);
    assert.equal(flags.liveInteractionsEnabled, false);
    assert.equal(flags.newGamesEnabled, false);
    assert.equal(flags.rewardsEnabled, false);
    assert.equal(flags.achievementsEnabled, false);
});

test('profile rollback closes every dependent module while global world remains enabled', () => {
    const env = Object.fromEntries(FLAG_NAMES.map(name => [name, 'true']));
    env.CREATOR_PROFILE_ENABLED = 'false';
    const flags = readStreamerWorldFlags(env);
    assert.equal(flags.STREAMER_WORLD_ENABLED, true);
    assert.equal(flags.creatorFoundationEnabled, false);
    assert.equal(flags.questEngineV2Enabled, false);
    assert.equal(flags.storyWorldEnabled, false);
    assert.equal(flags.liveInteractionsEnabled, false);
    assert.equal(flags.newGamesEnabled, false);
    assert.equal(flags.rewardsEnabled, false);
    assert.equal(flags.achievementsEnabled, false);
});

test('one module rollback leaves sibling modules available', () => {
    const env = Object.fromEntries(FLAG_NAMES.map(name => [name, 'true']));
    env.LIVE_INTERACTIONS_ENABLED = 'false';
    const flags = readStreamerWorldFlags(env);
    assert.equal(flags.creatorFoundationEnabled, true);
    assert.equal(flags.questEngineV2Enabled, true);
    assert.equal(flags.storyWorldEnabled, true);
    assert.equal(flags.liveInteractionsEnabled, false);
    assert.equal(flags.newGamesEnabled, true);
    assert.equal(flags.rewardsEnabled, true);
    assert.equal(flags.achievementsEnabled, true);
});

test('configured owner normalization accepts bounded Unicode account names', () => {
    assert.equal(readStreamerWorldFlags({ STREAMER_WORLD_OWNER_USERNAME: '  owner_01  ' }).ownerUsername, 'owner_01');
    assert.equal(readStreamerWorldFlags({ STREAMER_WORLD_OWNER_USERNAME: '  站主账号  ' }).ownerUsername, '站主账号');
    assert.equal(readStreamerWorldFlags({ STREAMER_WORLD_OWNER_USERNAME: 'Ｏｗｎｅｒ１２３' }).ownerUsername, 'Owner123');
});

test('configured owner parsing rejects path, control, spacing, and oversized values', () => {
    for (const value of [
        '../owner',
        'owner/admin',
        'owner admin',
        'ow',
        'a'.repeat(33),
        'owner@example',
        'owner\nadmin',
        '<owner>',
        'owner:admin'
    ]) {
        assert.equal(readStreamerWorldFlags({ STREAMER_WORLD_OWNER_USERNAME: value }).ownerUsername, null, value);
    }
});

test('flag result is frozen against runtime mutation', () => {
    const flags = readStreamerWorldFlags({
        STREAMER_WORLD_ENABLED: 'true',
        CREATOR_PROFILE_ENABLED: 'true'
    });
    assert.equal(Object.isFrozen(flags), true);
    assert.throws(() => {
        flags.creatorFoundationEnabled = false;
    }, TypeError);
    assert.equal(flags.creatorFoundationEnabled, true);
});

test('config validation lists every streamer flag under strict lowercase boolean parser', () => {
    const validation = source('lib/config-validation.js');
    assert.match(validation, /const \{ FLAG_NAMES, readStreamerWorldFlags \} = require\('\.\/streamer-world-flags'\)/);
    assert.match(validation, /for \(const name of FLAG_NAMES\) validateBoolean\(name\)/);
    assert.match(validation, /!\['true', 'false'\]\.includes\(value\)/);
    assert.match(validation, /must be true or false/);
});

test('environment example defaults every streamer feature off', () => {
    const example = source('.env.example');
    for (const name of FLAG_NAMES) {
        assert.match(example, new RegExp(`^${name}=false$`, 'm'), name);
        assert.doesNotMatch(example, new RegExp(`^${name}=true$`, 'm'), name);
    }
});

test('migration baseline remains immutable and separate from append-only Phase 9 file', () => {
    assert.equal(BASE_MIGRATION, '000_base_schema.sql');
    assert.notEqual(BASE_MIGRATION, 'add_streamer_phase9_hardening.sql');
    assert.ok(MIGRATIONS.indexOf(BASE_MIGRATION) === -1);
    assert.ok(MIGRATIONS.indexOf('add_streamer_phase9_hardening.sql') >= 0);
});

test('Phase 9 migration does not alter existing gift, ledger, or provider state machines', () => {
    assert.doesNotMatch(hardening, /wish_inventory/i);
    assert.doesNotMatch(hardening, /gift_exchanges/i);
    assert.doesNotMatch(hardening, /delivery_outbox/i);
    assert.doesNotMatch(hardening, /balance_logs/i);
    assert.doesNotMatch(hardening, /provider/i);
    assert.doesNotMatch(hardening, /uncertain/i);
});
