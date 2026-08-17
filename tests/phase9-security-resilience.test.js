'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const { FLAG_NAMES, readStreamerWorldFlags } = require('../lib/streamer-world-flags');
const {
    applyStreamerWorldProductionDefaults
} = require('../lib/streamer-world-production-defaults');
const {
    BASE_MIGRATION,
    MIGRATIONS,
    assertDatabaseSchemaCurrent,
    migrationTransactionBody
} = require('../lib/database-migrations');
const {
    IDEMPOTENT_WRITE_PATHS,
    MUTATING_ADMIN_PATHS,
    POLICY_NAMES,
    ROUTE_MANIFEST,
    validateRouteManifest
} = require('../routes/manifest');
const {
    EVENT_TYPES,
    ITEM_TYPES,
    LiveProtocolError,
    MAX_EVENT_BYTES,
    PROTOCOL_VERSION,
    envelope,
    semanticHash,
    stableJson,
    validateAck,
    validateCatchUp,
    validateDirectorCommand,
    validateMute,
    validateReport
} = require('../domain/live-interactions/protocol');
const { CreatorRepository } = require('../repositories/creator-repository');
const { QuestV2RuntimeRepository } = require('../repositories/quest-v2-runtime-repository');
const { StoryWorldRepository } = require('../repositories/story-world-repository');
const { LiveInteractionRepository } = require('../repositories/live-interaction-repository');
const { AchievementRepository } = require('../repositories/achievement-repository');

function source(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function checksum(filename) {
    return crypto.createHash('sha256').update(source(`migrations/${filename}`)).digest('hex');
}

function queryClient(rows = []) {
    const calls = [];
    return {
        calls,
        async query(sql, parameters = []) {
            calls.push({ sql: String(sql), parameters: structuredClone(parameters) });
            return { rows: structuredClone(rows), rowCount: rows.length };
        }
    };
}

const creatorMutationPaths = [
    '/api/creator/profile',
    '/api/creator/preferences',
    '/api/creator/quiet-hours',
    '/api/creator/interaction-windows',
    '/api/creator/room-binding-requests',
    '/api/creator/room-binding-requests/cancel',
    '/api/creator/memories',
    '/api/creator/inbox/read',
    '/api/creator/inbox/archive'
];

const questMutationPaths = [
    '/api/quests/v2/offers/claim',
    '/api/quests/v2/assignments/accept',
    '/api/quests/v2/assignments/decline',
    '/api/quests/v2/assignments/postpone',
    '/api/quests/v2/evidence/submit',
    '/api/quests/v2/assignments/submit',
    '/api/quests/v2/legacy/import'
];

const storyMutationPaths = [
    '/api/story/runs/start',
    '/api/story/actions/commit',
    '/api/story/runs/recover'
];

const liveMutationPaths = [
    '/api/live/items/accept',
    '/api/live/items/decline',
    '/api/live/polls/vote',
    '/api/live/presence',
    '/api/live/mute',
    '/api/live/leave',
    '/api/live/report',
    '/api/live/reconsent'
];

const rewardMutationPaths = [
    '/api/creator-rewards/orders/create',
    '/api/creator-rewards/orders/claim',
    '/api/creator-rewards/orders/cancel',
    '/api/creator-rewards/wishlist/update'
];

test('all Streamer World flags remain disabled by default', () => {
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

test('production launcher enables only missing Streamer World flags', () => {
    const env = { NODE_ENV: 'production', STREAMER_NEW_GAMES_ENABLED: 'false' };
    applyStreamerWorldProductionDefaults(env);
    assert.equal(env.STREAMER_NEW_GAMES_ENABLED, 'false');
    for (const name of FLAG_NAMES.filter(name => name !== 'STREAMER_NEW_GAMES_ENABLED')) {
        assert.equal(env[name], 'true', name);
    }
    assert.equal(readStreamerWorldFlags(env).newGamesEnabled, false);
});

test('production defaults expose games when no product flag is configured', () => {
    const env = { NODE_ENV: 'production' };
    applyStreamerWorldProductionDefaults(env);
    assert.equal(readStreamerWorldFlags(env).newGamesEnabled, true);
    assert.equal(readStreamerWorldFlags(env).storyWorldEnabled, true);
    assert.equal(readStreamerWorldFlags(env).questEngineV2Enabled, true);
});

test('non-production launch does not mutate Streamer World flags', () => {
    const env = { NODE_ENV: 'development' };
    applyStreamerWorldProductionDefaults(env);
    assert.deepEqual(env, { NODE_ENV: 'development' });
});

test('direct server launch applies production defaults before environment validation', () => {
    const serverSource = source('server.js');
    const defaultsOffset = serverSource.indexOf("require('./lib/streamer-world-production-defaults')");
    const validationOffset = serverSource.indexOf("require('./lib/config-validation').validateServerEnvironment()");
    assert.ok(defaultsOffset >= 0, 'server must load Streamer World production defaults');
    assert.ok(validationOffset > defaultsOffset, 'production defaults must precede environment validation');
});

test('flag parser accepts only exact lowercase true', () => {
    const rejected = ['TRUE', 'True', '1', 'yes', 'on', true, 1, ' true', 'true '];
    for (const value of rejected) {
        const flags = readStreamerWorldFlags({ STREAMER_WORLD_ENABLED: value });
        assert.equal(flags.STREAMER_WORLD_ENABLED, false, String(value));
    }
    assert.equal(readStreamerWorldFlags({ STREAMER_WORLD_ENABLED: 'true' }).STREAMER_WORLD_ENABLED, true);
});

test('creator foundation requires both root and profile flags', () => {
    assert.equal(readStreamerWorldFlags({ STREAMER_WORLD_ENABLED: 'true' }).creatorFoundationEnabled, false);
    assert.equal(readStreamerWorldFlags({ CREATOR_PROFILE_ENABLED: 'true' }).creatorFoundationEnabled, false);
    assert.equal(readStreamerWorldFlags({
        STREAMER_WORLD_ENABLED: 'true',
        CREATOR_PROFILE_ENABLED: 'true'
    }).creatorFoundationEnabled, true);
});

test('quest flag cannot bypass creator foundation', () => {
    assert.equal(readStreamerWorldFlags({ QUEST_ENGINE_V2_ENABLED: 'true' }).questEngineV2Enabled, false);
    assert.equal(readStreamerWorldFlags({
        STREAMER_WORLD_ENABLED: 'true',
        QUEST_ENGINE_V2_ENABLED: 'true'
    }).questEngineV2Enabled, false);
    assert.equal(readStreamerWorldFlags({
        STREAMER_WORLD_ENABLED: 'true',
        CREATOR_PROFILE_ENABLED: 'true',
        QUEST_ENGINE_V2_ENABLED: 'true'
    }).questEngineV2Enabled, true);
});

test('story flag cannot bypass creator foundation', () => {
    assert.equal(readStreamerWorldFlags({ STORY_WORLD_ENABLED: 'true' }).storyWorldEnabled, false);
    assert.equal(readStreamerWorldFlags({
        CREATOR_PROFILE_ENABLED: 'true',
        STORY_WORLD_ENABLED: 'true'
    }).storyWorldEnabled, false);
    assert.equal(readStreamerWorldFlags({
        STREAMER_WORLD_ENABLED: 'true',
        CREATOR_PROFILE_ENABLED: 'true',
        STORY_WORLD_ENABLED: 'true'
    }).storyWorldEnabled, true);
});

test('live flag cannot bypass creator foundation', () => {
    assert.equal(readStreamerWorldFlags({ LIVE_INTERACTIONS_ENABLED: 'true' }).liveInteractionsEnabled, false);
    assert.equal(readStreamerWorldFlags({
        STREAMER_WORLD_ENABLED: 'true',
        LIVE_INTERACTIONS_ENABLED: 'true'
    }).liveInteractionsEnabled, false);
    assert.equal(readStreamerWorldFlags({
        STREAMER_WORLD_ENABLED: 'true',
        CREATOR_PROFILE_ENABLED: 'true',
        LIVE_INTERACTIONS_ENABLED: 'true'
    }).liveInteractionsEnabled, true);
});

test('game flag cannot bypass creator foundation', () => {
    assert.equal(readStreamerWorldFlags({ STREAMER_NEW_GAMES_ENABLED: 'true' }).newGamesEnabled, false);
    assert.equal(readStreamerWorldFlags({
        CREATOR_PROFILE_ENABLED: 'true',
        STREAMER_NEW_GAMES_ENABLED: 'true'
    }).newGamesEnabled, false);
    assert.equal(readStreamerWorldFlags({
        STREAMER_WORLD_ENABLED: 'true',
        CREATOR_PROFILE_ENABLED: 'true',
        STREAMER_NEW_GAMES_ENABLED: 'true'
    }).newGamesEnabled, true);
});

test('reward flag cannot bypass creator foundation', () => {
    assert.equal(readStreamerWorldFlags({ STREAMER_REWARD_CATALOG_ENABLED: 'true' }).rewardsEnabled, false);
    assert.equal(readStreamerWorldFlags({
        STREAMER_WORLD_ENABLED: 'true',
        STREAMER_REWARD_CATALOG_ENABLED: 'true'
    }).rewardsEnabled, false);
    assert.equal(readStreamerWorldFlags({
        STREAMER_WORLD_ENABLED: 'true',
        CREATOR_PROFILE_ENABLED: 'true',
        STREAMER_REWARD_CATALOG_ENABLED: 'true'
    }).rewardsEnabled, true);
});

test('achievement flag cannot bypass creator foundation', () => {
    assert.equal(readStreamerWorldFlags({ STREAMER_ACHIEVEMENTS_ENABLED: 'true' }).achievementsEnabled, false);
    assert.equal(readStreamerWorldFlags({
        STREAMER_WORLD_ENABLED: 'true',
        STREAMER_ACHIEVEMENTS_ENABLED: 'true'
    }).achievementsEnabled, false);
    assert.equal(readStreamerWorldFlags({
        STREAMER_WORLD_ENABLED: 'true',
        CREATOR_PROFILE_ENABLED: 'true',
        STREAMER_ACHIEVEMENTS_ENABLED: 'true'
    }).achievementsEnabled, true);
});

test('disabling the root flag rolls every derived feature back at once', () => {
    const enabled = Object.fromEntries(FLAG_NAMES.map(name => [name, 'true']));
    enabled.STREAMER_WORLD_ENABLED = 'false';
    const flags = readStreamerWorldFlags(enabled);
    assert.equal(flags.creatorFoundationEnabled, false);
    assert.equal(flags.questEngineV2Enabled, false);
    assert.equal(flags.storyWorldEnabled, false);
    assert.equal(flags.liveInteractionsEnabled, false);
    assert.equal(flags.newGamesEnabled, false);
    assert.equal(flags.rewardsEnabled, false);
    assert.equal(flags.achievementsEnabled, false);
});

test('owner username is normalized but must match closed account token', () => {
    assert.equal(readStreamerWorldFlags({ STREAMER_WORLD_OWNER_USERNAME: ' owner-name ' }).ownerUsername, 'owner-name');
    assert.equal(readStreamerWorldFlags({ STREAMER_WORLD_OWNER_USERNAME: 'Ｏｗｎｅｒ_01' }).ownerUsername, 'Owner_01');
    assert.equal(readStreamerWorldFlags({ STREAMER_WORLD_OWNER_USERNAME: 'ab' }).ownerUsername, null);
    assert.equal(readStreamerWorldFlags({ STREAMER_WORLD_OWNER_USERNAME: 'owner name' }).ownerUsername, null);
    assert.equal(readStreamerWorldFlags({ STREAMER_WORLD_OWNER_USERNAME: '../owner' }).ownerUsername, null);
    assert.equal(readStreamerWorldFlags({ STREAMER_WORLD_OWNER_USERNAME: 'x'.repeat(33) }).ownerUsername, null);
});

test('route manifest remains duplicate-free and policy-valid', () => {
    assert.equal(validateRouteManifest(ROUTE_MANIFEST), ROUTE_MANIFEST);
    const identities = ROUTE_MANIFEST.map(entry => `${entry.method} ${entry.path}`);
    assert.equal(new Set(identities).size, identities.length);
    assert.ok(ROUTE_MANIFEST.length > 100);
    assert.ok(POLICY_NAMES.has('idempotent'));
    assert.ok(POLICY_NAMES.has('admin-audit'));
});

test('route validator rejects duplicate mutation identity', () => {
    const entry = Object.freeze({ method: 'POST', path: '/api/test', policies: Object.freeze(['csrf']) });
    assert.throws(() => validateRouteManifest([entry, entry]), /Duplicate mutation route descriptor/);
});

test('route validator rejects unknown policy names', () => {
    const entry = Object.freeze({ method: 'POST', path: '/api/test', policies: Object.freeze(['csrf', 'trust-browser']) });
    assert.throws(() => validateRouteManifest([entry]), /Unknown route policy trust-browser/);
});

test('route validator requires cross-site mutation protection', () => {
    const entry = Object.freeze({ method: 'POST', path: '/api/test', policies: Object.freeze(['login']) });
    assert.throws(() => validateRouteManifest([entry]), /lacks cross-site request protection/);
});

test('route validator requires audit policy on administrator mutations', () => {
    const entry = Object.freeze({ method: 'POST', path: '/api/test', policies: Object.freeze(['admin', 'csrf']) });
    assert.throws(() => validateRouteManifest([entry]), /lacks failure audit policy/);
});

test('all creator fixed mutations are protected and idempotent', () => {
    for (const pathValue of creatorMutationPaths) {
        const entry = ROUTE_MANIFEST.find(candidate => candidate.path === pathValue);
        assert.ok(entry, pathValue);
        assert.ok(['POST', 'PUT', 'PATCH'].includes(entry.method), pathValue);
        assert.ok(entry.policies.includes('login'), pathValue);
        assert.ok(entry.policies.includes('authorized'), pathValue);
        assert.ok(entry.policies.includes('csrf'), pathValue);
        assert.ok(entry.policies.includes('idempotent'), pathValue);
        assert.ok(IDEMPOTENT_WRITE_PATHS.includes(pathValue), pathValue);
        assert.doesNotMatch(pathValue, /:[A-Za-z]/, pathValue);
    }
});

test('all Quest V2 fixed mutations are protected and idempotent', () => {
    for (const pathValue of questMutationPaths) {
        const entry = ROUTE_MANIFEST.find(candidate => candidate.path === pathValue);
        assert.ok(entry, pathValue);
        assert.equal(entry.method, 'POST', pathValue);
        assert.ok(entry.policies.includes('login'), pathValue);
        assert.ok(entry.policies.includes('authorized'), pathValue);
        assert.ok(entry.policies.includes('action-rate-limit'), pathValue);
        assert.ok(entry.policies.includes('csrf'), pathValue);
        assert.ok(entry.policies.includes('idempotent'), pathValue);
        assert.doesNotMatch(pathValue, /:[A-Za-z]/, pathValue);
    }
});

test('story write endpoints are fixed and idempotent while preview is read-like', () => {
    for (const pathValue of storyMutationPaths) {
        const entry = ROUTE_MANIFEST.find(candidate => candidate.path === pathValue);
        assert.ok(entry, pathValue);
        assert.ok(entry.policies.includes('idempotent'), pathValue);
        assert.ok(entry.policies.includes('authorized'), pathValue);
        assert.ok(IDEMPOTENT_WRITE_PATHS.includes(pathValue), pathValue);
        assert.doesNotMatch(pathValue, /:[A-Za-z]/, pathValue);
    }
    const preview = ROUTE_MANIFEST.find(entry => entry.path === '/api/story/actions/preview');
    assert.ok(preview);
    assert.ok(preview.policies.includes('csrf'));
    assert.equal(preview.policies.includes('idempotent'), false);
});

test('live persistent actions are fixed, authorized, rate-limited, and idempotent', () => {
    for (const pathValue of liveMutationPaths) {
        const entry = ROUTE_MANIFEST.find(candidate => candidate.path === pathValue);
        assert.ok(entry, pathValue);
        assert.equal(entry.method, 'POST', pathValue);
        assert.ok(entry.policies.includes('authorized'), pathValue);
        assert.ok(entry.policies.includes('basic-rate-limit'), pathValue);
        assert.ok(entry.policies.includes('action-rate-limit'), pathValue);
        assert.ok(entry.policies.includes('csrf'), pathValue);
        assert.ok(entry.policies.includes('idempotent'), pathValue);
    }
});

test('live acknowledgement is CSRF-protected but intentionally not response-idempotent', () => {
    const ack = ROUTE_MANIFEST.find(entry => entry.path === '/api/live/ack');
    assert.ok(ack);
    assert.ok(ack.policies.includes('login'));
    assert.ok(ack.policies.includes('authorized'));
    assert.ok(ack.policies.includes('csrf'));
    assert.equal(ack.policies.includes('idempotent'), false);
    assert.equal(IDEMPOTENT_WRITE_PATHS.includes('/api/live/ack'), false);
});

test('reward creator mutations preserve capacity and idempotency guards', () => {
    for (const pathValue of rewardMutationPaths) {
        const entry = ROUTE_MANIFEST.find(candidate => candidate.path === pathValue);
        assert.ok(entry, pathValue);
        assert.ok(entry.policies.includes('capacity'), pathValue);
        assert.ok(entry.policies.includes('authorized'), pathValue);
        assert.ok(entry.policies.includes('csrf'), pathValue);
        assert.ok(entry.policies.includes('idempotent'), pathValue);
        assert.ok(IDEMPOTENT_WRITE_PATHS.includes(pathValue), pathValue);
    }
});

test('new administrator mutations include failure audit and exact fixed paths', () => {
    const paths = [
        '/api/admin/live/open',
        '/api/admin/live/send',
        '/api/admin/live/reports/moderate',
        '/api/admin/quests/v2/drafts',
        '/api/admin/quests/v2/publish',
        '/api/admin/quests/v2/review',
        '/api/admin/creator-director/reward-grants/create',
        '/api/admin/creator-rewards/reviews/decide',
        '/api/admin/creator-rewards/grants/revoke',
        '/api/admin/streamer-games/bingo-event'
    ];
    for (const pathValue of paths) {
        const entry = ROUTE_MANIFEST.find(candidate => candidate.path === pathValue);
        assert.ok(entry, pathValue);
        assert.ok(entry.policies.includes('admin'), pathValue);
        assert.ok(entry.policies.includes('admin-audit'), pathValue);
        assert.ok(entry.policies.includes('csrf'), pathValue);
        assert.ok(entry.policies.includes('idempotent'), pathValue);
        assert.ok(MUTATING_ADMIN_PATHS.has(pathValue), pathValue);
        assert.doesNotMatch(pathValue, /:[A-Za-z]/, pathValue);
    }
});

test('database migration registry ends in all nine streamer expansion migrations', () => {
    const expectedTail = [
        'add_creator_foundation.sql',
        'add_streamer_quest_engine_v2.sql',
        'add_story_world_season_one.sql',
        'add_live_interaction_platform.sql',
        'add_streamer_games_batch_one.sql',
        'add_streamer_games_batch_two.sql',
        'add_streamer_reward_catalog.sql',
        'add_streamer_achievements_and_archives.sql',
        'add_streamer_phase9_hardening.sql'
    ];
    assert.deepEqual(MIGRATIONS.slice(-expectedTail.length), expectedTail);
    assert.equal(new Set(MIGRATIONS).size, MIGRATIONS.length);
});

test('every registered migration exists as a regular non-symlink file', () => {
    for (const filename of [BASE_MIGRATION, ...MIGRATIONS]) {
        const target = path.join(root, 'migrations', filename);
        const stat = fs.lstatSync(target);
        assert.equal(stat.isFile(), true, filename);
        assert.equal(stat.isSymbolicLink(), false, filename);
        assert.ok(stat.size > 20, filename);
    }
});

test('schema-current check accepts exactly matching applied checksums', async () => {
    const filenames = [BASE_MIGRATION, ...MIGRATIONS];
    const rows = filenames.map(filename => ({
        filename,
        checksum: checksum(filename),
        status: 'applied'
    }));
    const pool = {
        async query(sql, parameters) {
            assert.match(sql, /minimal_games_schema_migrations/);
            assert.deepEqual(parameters[0], filenames);
            return { rows };
        }
    };
    assert.equal(await assertDatabaseSchemaCurrent(pool), true);
});

test('schema-current check fails closed on absent achievement migration', async () => {
    const rows = [BASE_MIGRATION, ...MIGRATIONS]
        .filter(filename => filename !== 'add_streamer_achievements_and_archives.sql')
        .map(filename => ({ filename, checksum: checksum(filename), status: 'applied' }));
    await assert.rejects(assertDatabaseSchemaCurrent({
        async query() {
            return { rows };
        }
    }), /add_streamer_achievements_and_archives\.sql/);
});

test('schema-current check fails closed on Phase9 checksum drift', async () => {
    const rows = [BASE_MIGRATION, ...MIGRATIONS].map(filename => ({
        filename,
        checksum: filename === 'add_streamer_phase9_hardening.sql' ? '0'.repeat(64) : checksum(filename),
        status: 'applied'
    }));
    await assert.rejects(assertDatabaseSchemaCurrent({
        async query() {
            return { rows };
        }
    }), /add_streamer_phase9_hardening\.sql/);
});

test('schema-current check fails closed on in-progress migration status', async () => {
    const rows = [BASE_MIGRATION, ...MIGRATIONS].map(filename => ({
        filename,
        checksum: checksum(filename),
        status: filename === 'add_streamer_phase9_hardening.sql' ? 'applying' : 'applied'
    }));
    await assert.rejects(assertDatabaseSchemaCurrent({
        async query() {
            return { rows };
        }
    }), /add_streamer_phase9_hardening\.sql/);
});

test('migration transaction normalizer removes only wrapper transaction and unsafe session timeout', () => {
    const normalized = migrationTransactionBody(`
        BEGIN;
        SET statement_timeout = 0;
        SET lock_timeout = 0;
        SET search_path = public;
        CREATE TABLE sample(id BIGINT);
        COMMIT;
    `);
    assert.doesNotMatch(normalized, /^\s*BEGIN/i);
    assert.doesNotMatch(normalized, /COMMIT\s*;\s*$/i);
    assert.doesNotMatch(normalized, /statement_timeout/);
    assert.doesNotMatch(normalized, /lock_timeout/);
    assert.match(normalized, /SET LOCAL search_path/);
    assert.match(normalized, /CREATE TABLE sample/);
});

test('Phase9 migration is append-only and contains no destructive table operation', () => {
    const sql = source('migrations/add_streamer_phase9_hardening.sql');
    assert.match(sql, /^BEGIN;/);
    assert.match(sql, /COMMIT;\s*$/);
    assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN|SCHEMA)/i);
    assert.doesNotMatch(sql, /TRUNCATE/i);
    assert.doesNotMatch(sql, /DELETE\s+FROM/i);
    assert.doesNotMatch(sql, /ALTER\s+COLUMN.*TYPE/i);
});

test('Phase9 migration creates bounded creator inbox cursor index', () => {
    const sql = source('migrations/add_streamer_phase9_hardening.sql');
    assert.match(sql, /creator_inbox_user_archive_time_idx/);
    assert.match(sql, /creator_inbox_messages\s*\(user_id, archived_at, sent_at DESC, id DESC\)/);
});

test('Phase9 migration creates Quest assignment and evidence review indexes', () => {
    const sql = source('migrations/add_streamer_phase9_hardening.sql');
    assert.match(sql, /quest_v2_assignments_user_updated_cursor_idx/);
    assert.match(sql, /quest_v2_assignments_review_cursor_idx/);
    assert.match(sql, /status, submitted_at ASC, id ASC/);
    assert.match(sql, /WHERE status IN \('submitted', 'under_review'\)/);
});

test('Phase9 migration creates story recovery and archive indexes', () => {
    const sql = source('migrations/add_streamer_phase9_hardening.sql');
    assert.match(sql, /story_runs_user_campaign_version_cursor_idx/);
    assert.match(sql, /story_runs_active_recovery_idx/);
    assert.match(sql, /WHERE status = 'active'/);
    assert.match(sql, /story_runs\s*\(user_id, campaign_id, content_version_id, updated_at DESC, id DESC\)/);
});

test('Phase9 migration creates live inbox and moderation indexes', () => {
    const sql = source('migrations/add_streamer_phase9_hardening.sql');
    assert.match(sql, /live_interaction_items_room_status_cursor_idx/);
    assert.match(sql, /live_interaction_reports_status_cursor_idx/);
    assert.match(sql, /live_interaction_items\s*\(interaction_id, status, created_at DESC, id DESC\)/);
    assert.match(sql, /live_interaction_reports\s*\(status, created_at DESC, id DESC\)/);
});

test('Phase9 migration creates reward pending and user history indexes', () => {
    const sql = source('migrations/add_streamer_phase9_hardening.sql');
    assert.match(sql, /reward_orders_user_status_cursor_idx/);
    assert.match(sql, /reward_orders_pending_review_cursor_idx/);
    assert.match(sql, /WHERE status = 'pending_approval'/);
    assert.match(sql, /reward_orders\s*\(user_id, status, created_at DESC, id DESC\)/);
});

test('Phase9 migration creates achievement, collection, and archive query indexes', () => {
    const sql = source('migrations/add_streamer_phase9_hardening.sql');
    assert.match(sql, /streamer_achievement_progress_user_unlock_cursor_idx/);
    assert.match(sql, /streamer_collection_holdings_user_acquired_cursor_idx/);
    assert.match(sql, /streamer_season_archives_user_created_cursor_idx/);
    assert.match(sql, /streamer_achievement_progress/);
    assert.match(sql, /streamer_collection_holdings/);
    assert.match(sql, /streamer_season_archives/);
});

test('Quest evidence retention maps only three closed policies to fixed days', () => {
    const service = source('services/quest-v2-service.js');
    assert.match(service, /Object\.freeze\(\{ minimum: 7, standard: 30, extended: 90 \}\)/);
    assert.match(service, /Unknown evidence retention policy/);
    assert.match(service, /retentionUntil/);
    assert.doesNotMatch(service, /Number\(creator\.evidence_retention\)/);
});

test('Quest evidence cleanup is bounded and uses skip-locked ordering', () => {
    const repository = source('repositories/quest-v2-runtime-repository.js');
    assert.match(repository, /redactExpiredEvidenceBatch\(limit = 100\)/);
    assert.match(repository, /retention_until <= NOW\(\)/);
    assert.match(repository, /ORDER BY retention_until, id LIMIT \$1 FOR UPDATE SKIP LOCKED/);
    assert.match(repository, /redacted_at = NOW\(\)/);
    assert.match(repository, /redaction_reason = 'retention_expired'/);
});

test('Quest evidence cleanup clears content bytes but preserves tombstone fields', () => {
    const repository = source('repositories/quest-v2-runtime-repository.js');
    const batch = repository.slice(repository.indexOf('async redactExpiredEvidenceBatch'));
    assert.match(batch, /content = '\{\}'::JSONB/);
    assert.match(batch, /media_bytes = NULL/);
    assert.match(batch, /redacted_at = NOW\(\)/);
    assert.doesNotMatch(batch, /sha256 = NULL/);
    assert.doesNotMatch(batch, /DELETE FROM quest_v2_evidence/);
});

test('Quest retention recurring job is registered and feature gated', () => {
    const server = source('server.js');
    assert.match(server, /registerRecurringJob\('quest-evidence-retention'/);
    assert.match(server, /questV2Service\.redactExpiredEvidence\(\)/);
    assert.match(server, /streamerWorldFlags\.questEngineV2Enabled/);
    assert.doesNotMatch(server, /setInterval\([^)]*redactExpiredEvidence/);
});

test('creator data export is explicitly bounded per private collection', () => {
    const repository = source('repositories/creator-repository.js');
    const exportMethod = repository.slice(repository.indexOf('async exportCreatorData'));
    assert.match(exportMethod, /shared_memories[\s\S]*LIMIT 500/);
    assert.match(exportMethod, /creator_inbox_messages[\s\S]*LIMIT 500/);
    assert.match(exportMethod, /creator_consent_events[\s\S]*LIMIT 500/);
    assert.match(exportMethod, /exportedAt/);
    assert.doesNotMatch(exportMethod, /password_hash|bilibili_cookie|provider_receipt/);
});

test('creator list query binds caller-provided page size and offset parameters', async () => {
    const client = queryClient([]);
    const repository = new CreatorRepository({
        pool: {
            query: client.query.bind(client),
            async connect() {}
        }
    });
    await repository.listAdminSummaries({ limit: 25, offset: 50 });
    const call = client.calls.at(-1);
    assert.match(call.sql, /LIMIT \$1 OFFSET \$2/);
    assert.deepEqual(call.parameters, [25, 50]);
    assert.equal(call.sql.includes('SELECT *'), false);
});

test('Quest assignment query binds page limits instead of interpolating input', async () => {
    const client = queryClient([]);
    const repository = new QuestV2RuntimeRepository(client);
    await repository.listAssignments(7, { limit: 40, offset: 80 });
    const call = client.calls.at(-1);
    assert.match(call.sql, /LIMIT \$2 OFFSET \$3/);
    assert.deepEqual(call.parameters, [7, 40, 80]);
    assert.doesNotMatch(call.sql, /LIMIT 40|OFFSET 80/);
});

test('story administrator audit query binds its result limit', async () => {
    const client = queryClient([]);
    const repository = new StoryWorldRepository(client);
    await repository.listAdminAudit(75);
    const call = client.calls.at(-1);
    assert.match(call.sql, /ORDER BY audit\.id DESC LIMIT \$1/);
    assert.deepEqual(call.parameters, [75]);
    assert.doesNotMatch(call.sql, /LIMIT 75/);
});

test('live catch-up query is monotonic, ordered, and parameter bounded', async () => {
    const client = queryClient([]);
    const repository = new LiveInteractionRepository({
        pool: {
            query: client.query.bind(client),
            async connect() {}
        }
    });
    repository.readMemberRoom = async () => ({ id: 11, memberStatus: 'active' });
    await repository.catchUp(11, 'creator', 39, 50);
    const call = client.calls.at(-1);
    assert.match(call.sql, /interaction_id=\$1 AND sequence>\$2/);
    assert.match(call.sql, /ORDER BY sequence LIMIT \$3/);
    assert.deepEqual(call.parameters, [11, 39, 51]);
    assert.equal(51, 50 + 1);
    assert.doesNotMatch(call.sql, /LIMIT 50/);
});

test('achievement user state remains account scoped and excludes source event rows', async () => {
    const client = queryClient([]);
    const repository = new AchievementRepository(client);
    await repository.state(19);
    assert.equal(client.calls.length, 3);
    for (const call of client.calls) assert.deepEqual(call.parameters, [19]);
    assert.match(client.calls[0].sql, /progress\.user_id=\$1/);
    assert.match(client.calls[1].sql, /WHERE user_id=\$1/);
    assert.match(client.calls[2].sql, /WHERE user_id=\$1/);
    assert.ok(client.calls.every(call => !/provider_receipt|gift_id|bilibili_cookie/.test(call.sql)));
});

test('live protocol version and complete envelope remain below event bus bound', () => {
    assert.equal(PROTOCOL_VERSION, 1);
    assert.equal(MAX_EVENT_BYTES, 6000);
    assert.ok(MAX_EVENT_BYTES < 7500);
    assert.ok(EVENT_TYPES.includes('interaction.game_state_changed'));
    assert.equal(new Set(EVENT_TYPES).size, EVENT_TYPES.length);
    assert.equal(new Set(ITEM_TYPES).size, ITEM_TYPES.length);
});

test('live semantic hashing ignores JSON object insertion order', () => {
    const first = { b: 2, a: { y: 2, x: 1 }, list: [3, 2, 1] };
    const second = { list: [3, 2, 1], a: { x: 1, y: 2 }, b: 2 };
    assert.equal(stableJson(first), stableJson(second));
    assert.equal(semanticHash(first), semanticHash(second));
    assert.match(semanticHash(first), /^[a-f0-9]{64}$/);
    assert.notEqual(semanticHash(first), semanticHash({ ...second, b: 3 }));
});

test('live catch-up validator applies bounded default window', () => {
    assert.deepEqual(validateCatchUp({ interactionId: 9 }), {
        interactionId: 9,
        afterSequence: 0,
        limit: 50
    });
    assert.deepEqual(validateCatchUp({ interactionId: 9, afterSequence: 40, limit: 100 }), {
        interactionId: 9,
        afterSequence: 40,
        limit: 100
    });
});

test('live catch-up validator rejects oversize, zero, and coerced bounds', () => {
    assert.throws(() => validateCatchUp({ interactionId: 9, limit: 101 }), /Invalid limit/);
    assert.throws(() => validateCatchUp({ interactionId: 9, limit: 0 }), /Invalid limit/);
    assert.throws(() => validateCatchUp({ interactionId: 0 }), /Invalid interactionId/);
    assert.throws(() => validateCatchUp({ interactionId: 9, afterSequence: -1 }), /Invalid afterSequence/);
    assert.throws(() => validateCatchUp({ interactionId: 9, limit: 20, owner: 'other' }), /Unknown query field/);
});

test('live acknowledgement validator accepts only nonnegative safe sequence', () => {
    assert.deepEqual(validateAck({ interactionId: 7, sequence: 0 }), { interactionId: 7, sequence: 0 });
    assert.deepEqual(validateAck({ interactionId: 7, sequence: 99 }), { interactionId: 7, sequence: 99 });
    assert.throws(() => validateAck({ interactionId: 7, sequence: -1 }), /Invalid sequence/);
    assert.throws(() => validateAck({ interactionId: 0, sequence: 0 }), /Invalid interactionId/);
    assert.throws(() => validateAck({ interactionId: 7, sequence: 0, username: 'other' }), /Unknown body field/);
});

test('live mute validator constrains duration and body shape', () => {
    const base = {
        commandId: '00000000-0000-4000-a000-000000000001',
        interactionId: 1,
        expectedRevision: 0
    };
    assert.equal(validateMute({ ...base, minutes: 15 }).minutes, 15);
    assert.equal(validateMute({ ...base, minutes: 10080 }).minutes, 10080);
    assert.throws(() => validateMute({ ...base, minutes: 14 }), /Invalid minutes/);
    assert.throws(() => validateMute({ ...base, minutes: 10081 }), /Invalid minutes/);
    assert.throws(() => validateMute({ ...base, minutes: 15, relationshipPenalty: -5 }), /Unknown body field/);
});

test('live report validator constrains reason, detail, and optional item identity', () => {
    const base = {
        commandId: '00000000-0000-4000-a000-000000000001',
        interactionId: 1,
        expectedRevision: 0
    };
    const report = validateReport({ ...base, itemId: null, reasonCode: 'privacy', detail: 'Please stop.' });
    assert.equal(report.reasonCode, 'privacy');
    assert.equal(report.detail, 'Please stop.');
    assert.equal(report.itemId, null);
    assert.throws(() => validateReport({ ...base, reasonCode: 'relationship_loss', detail: '' }), /Invalid reasonCode/);
    assert.throws(() => validateReport({ ...base, reasonCode: 'privacy', detail: 'x'.repeat(501) }), /Invalid detail/);
});

test('Director poll command constrains unique option count and duration', () => {
    const base = {
        commandId: '00000000-0000-4000-a000-000000000001',
        interactionId: 1,
        expectedRevision: 0,
        creatorUsername: 'creator',
        itemType: 'poll',
        templateKey: 'poll.safe-choice'
    };
    const valid = validateDirectorCommand({ ...base, pollOptions: ['A', 'B'], expiresInMinutes: 30 });
    assert.deepEqual(valid.pollOptions, ['A', 'B']);
    assert.equal(valid.expiresInMinutes, 30);
    assert.throws(() => validateDirectorCommand({ ...base, pollOptions: ['A'] }), /two to five/);
    assert.throws(() => validateDirectorCommand({ ...base, pollOptions: ['A', 'A'] }), /must be unique/);
    assert.throws(() => validateDirectorCommand({ ...base, pollOptions: ['A', 'B'], expiresInMinutes: 4 }), /Invalid expiresInMinutes/);
});

test('Director non-story command cannot smuggle a story target', () => {
    const base = {
        commandId: '00000000-0000-4000-a000-000000000001',
        interactionId: 1,
        expectedRevision: 0,
        creatorUsername: 'creator',
        itemType: 'nudge',
        templateKey: 'nudge.safe',
        targetStoryNode: 'secret.ending'
    };
    assert.throws(() => validateDirectorCommand(base), /targetStoryNode only belongs/);
});

test('stored live envelope exposes actor type but no actor account identity', () => {
    const value = envelope({
        interaction_id: 1,
        event_id: '00000000-0000-4000-a000-000000000001',
        sequence: 2,
        event_type: 'interaction.nudge',
        actor_type: 'owner',
        actor_username: 'private-owner',
        subject_user_id: 9,
        created_at: '2026-08-17T00:00:00.000Z',
        payload: { title: 'Safe nudge' },
        correlation_id: '00000000-0000-4000-a000-000000000002',
        state_revision: 3
    });
    assert.deepEqual(value.actor, { type: 'owner' });
    assert.equal(value.actor.username, undefined);
    assert.equal(value.sequence, 2);
    assert.equal(value.version, 1);
    assert.ok(Buffer.byteLength(JSON.stringify(value), 'utf8') < MAX_EVENT_BYTES);
});

test('stored live envelope rejects payload exceeding safe event bus boundary', () => {
    assert.throws(() => envelope({
        interaction_id: 1,
        event_id: '00000000-0000-4000-a000-000000000001',
        sequence: 2,
        event_type: 'interaction.nudge',
        actor_type: 'owner',
        subject_user_id: 9,
        created_at: '2026-08-17T00:00:00.000Z',
        payload: { title: 'x'.repeat(MAX_EVENT_BYTES) },
        correlation_id: '00000000-0000-4000-a000-000000000002',
        state_revision: 3
    }), error => error instanceof LiveProtocolError && error.code === 'LIVE_INVALID_EVENT');
});

test('stored live envelope rejects event type outside closed allowlist', () => {
    assert.throws(() => envelope({
        interaction_id: 1,
        event_id: '00000000-0000-4000-a000-000000000001',
        sequence: 2,
        event_type: 'provider.gift.send',
        actor_type: 'owner',
        subject_user_id: 9,
        created_at: '2026-08-17T00:00:00.000Z',
        payload: {},
        correlation_id: '00000000-0000-4000-a000-000000000002',
        state_revision: 3
    }), error => error instanceof LiveProtocolError && error.code === 'LIVE_INVALID_EVENT');
});

test('Quest, story, game, live, and achievement services do not import gift sender', () => {
    const files = [
        'services/quest-v2-service.js',
        'services/story-world-service.js',
        'services/streamer-game-service.js',
        'services/live-interaction-service.js',
        'services/live-interaction-participant-commands.js',
        'services/achievement-service.js'
    ];
    for (const relativePath of files) {
        const code = source(relativePath);
        assert.doesNotMatch(code, /gift-sender|bilibili.*provider|sendGift|enqueueWishInventorySend/i, relativePath);
        assert.doesNotMatch(code, /delivery_outbox/, relativePath);
    }
});

test('reward service uses existing wish inventory boundary and never imports provider sender', () => {
    const service = source('services/reward-catalog-service.js');
    const repository = source('repositories/reward-catalog-repository.js');
    assert.match(repository, /wish_inventory/);
    assert.match(repository, /source_type/);
    assert.match(repository, /source_batch_id/);
    assert.doesNotMatch(service, /gift-sender|sendGift|provider\.send/i);
    assert.doesNotMatch(repository, /INSERT INTO delivery_outbox|INSERT INTO gift_exchanges/i);
});

test('new frontend modules avoid dynamic script creation and arbitrary HTML assignment', () => {
    const files = [
        'public/js/creator-operation-center.js',
        'public/js/creator-responsive-navigation.js',
        'public/js/games/game-state-narrator.js',
        'public/js/creator-context-help.js',
        'public/js/creator-explorer.js',
        'public/js/admin-workspace-experience.js'
    ];
    for (const relativePath of files) {
        const code = source(relativePath);
        assert.doesNotMatch(code, /createElement\(['"]script/i, relativePath);
        assert.doesNotMatch(code, /eval\s*\(/, relativePath);
        assert.doesNotMatch(code, /new Function\s*\(/, relativePath);
        if (!relativePath.endsWith('creator-context-help.js')) assert.doesNotMatch(code, /\.innerHTML\s*=/, relativePath);
    }
});

test('game state narrator receives only public model API and never reads bootstrap snapshot', () => {
    const code = source('public/js/games/game-state-narrator.js');
    assert.match(code, /window\.StreamerGameModel/);
    assert.doesNotMatch(code, /sg-bootstrap/);
    assert.doesNotMatch(code, /solution|graph|acceptedSourceEvents|submissions/);
    assert.doesNotMatch(code, /provider|gift|balance/i);
    assert.match(code, /MAX_CHANGES = 12/);
});
