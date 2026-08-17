'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const rewardPack = require('../content/streamer-world/rewards/catalog');
const { FLAG_NAMES, readStreamerWorldFlags } = require('../lib/streamer-world-flags');
const {
    MODULE_REQUIREMENTS,
    assertStreamerWorldRuntimeReady,
    checkStreamerWorldRuntimeReadiness
} = require('../lib/streamer-world-runtime-readiness');

const root = path.resolve(__dirname, '..');
const ALL_RELATIONS = new Set(Object.values(MODULE_REQUIREMENTS)
    .flatMap((requirement) => requirement.relations));
const ALL_MIGRATIONS = new Set(Object.values(MODULE_REQUIREMENTS)
    .flatMap((requirement) => requirement.migrations));

function closedEnvironment(overrides = {}) {
    return Object.fromEntries([
        ...FLAG_NAMES.map((name) => [name, 'false']),
        ...Object.entries(overrides)
    ]);
}

function enabledEnvironment(moduleFlag, overrides = {}) {
    return closedEnvironment({
        STREAMER_WORLD_ENABLED: 'true',
        CREATOR_PROFILE_ENABLED: 'true',
        [moduleFlag]: 'true',
        ...overrides
    });
}

function isolatedProcessEnvironment(overrides = {}) {
    const environment = { ...process.env };
    for (const name of FLAG_NAMES) delete environment[name];
    delete environment.STREAMER_WORLD_OWNER_USERNAME;
    return Object.assign(environment, overrides);
}

function fakeRuntimeDatabase({
    missingMigrations = [],
    missingRelations = [],
    ownerMatches = 1,
    catalogRows = rewardPack.items.map((item) => ({
        slug: item.slug,
        catalog_version: rewardPack.catalogVersion,
        lifecycle: 'active'
    })),
    budgetRows = rewardPack.budgets.map((budget) => ({
        budget_key: budget.key,
        scope: budget.scope,
        daily_limit: String(budget.dailyLimit),
        lifecycle: 'active'
    }))
} = {}) {
    const migrations = new Set([...ALL_MIGRATIONS]
        .filter((name) => !missingMigrations.includes(name)));
    const relations = new Set([...ALL_RELATIONS]
        .filter((name) => !missingRelations.includes(name)));
    const calls = [];
    return {
        calls,
        async query(sql, parameters = []) {
            const statement = String(sql);
            calls.push({ statement, parameters: structuredClone(parameters) });
            if (statement.includes('streamer-world:migrations')) {
                return {
                    rows: parameters[0]
                        .filter((name) => migrations.has(name))
                        .map((filename) => ({ filename, status: 'applied' }))
                };
            }
            if (statement.includes('streamer-world:relations')) {
                return {
                    rows: parameters[0].map((relation_name) => ({
                        relation_name,
                        ready: relations.has(relation_name)
                    }))
                };
            }
            if (statement.includes('streamer-world:owner')) {
                return { rows: [{ matching_count: ownerMatches }] };
            }
            if (statement.includes('streamer-world:reward-catalog')) {
                return { rows: structuredClone(catalogRows) };
            }
            if (statement.includes('streamer-world:reward-budgets')) {
                return { rows: structuredClone(budgetRows) };
            }
            throw new Error(`Unexpected runtime-readiness query: ${statement}`);
        }
    };
}

test('production boot leaves every missing Streamer World flag closed', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.equal(packageJson.scripts.start, 'node server.js');
    assert.doesNotMatch(
        fs.readFileSync(path.join(root, 'server.js'), 'utf8'),
        /streamer-world-production-defaults/
    );

    const environment = isolatedProcessEnvironment({ NODE_ENV: 'production' });
    const script = `
        const { FLAG_NAMES, readStreamerWorldFlags } = require('./lib/streamer-world-flags');
        const flags = readStreamerWorldFlags(process.env);
        for (const name of FLAG_NAMES) {
            if (flags[name] !== false) throw new Error(name + ' opened without explicit true');
            if (Object.prototype.hasOwnProperty.call(process.env, name)) {
                throw new Error(name + ' was injected during boot');
            }
        }
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
        cwd: root,
        env: environment,
        encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('malformed Streamer World flags fail startup validation instead of being treated as false', () => {
    const script = `
        require('./lib/config-validation').validateServerEnvironment();
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
        cwd: root,
        env: isolatedProcessEnvironment({
            NODE_ENV: 'test',
            STREAMER_WORLD_ENABLED: 'TRUE'
        }),
        encoding: 'utf8'
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /STREAMER_WORLD_ENABLED must be true or false/);
});

test('live activation without a valid configured owner fails startup validation', () => {
    const script = `
        require('./lib/config-validation').validateServerEnvironment();
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
        cwd: root,
        env: isolatedProcessEnvironment({
            NODE_ENV: 'test',
            STREAMER_WORLD_ENABLED: 'true',
            CREATOR_PROFILE_ENABLED: 'true',
            LIVE_INTERACTIONS_ENABLED: 'true'
        }),
        encoding: 'utf8'
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /LIVE_INTERACTIONS_ENABLED requires STREAMER_WORLD_OWNER_USERNAME/);
});

test('the root kill switch remains usable even when a dependent flag stays true', () => {
    const script = `
        require('./lib/config-validation').validateServerEnvironment();
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
        cwd: root,
        env: isolatedProcessEnvironment({
            NODE_ENV: 'test',
            STREAMER_WORLD_ENABLED: 'false',
            CREATOR_PROFILE_ENABLED: 'true',
            LIVE_INTERACTIONS_ENABLED: 'true'
        }),
        encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('disabled Streamer World performs no dependency probes', async () => {
    const database = fakeRuntimeDatabase();
    const readiness = await checkStreamerWorldRuntimeReadiness(
        database,
        readStreamerWorldFlags(closedEnvironment({ NODE_ENV: 'production' }))
    );
    assert.equal(readiness.ready, true);
    assert.deepEqual(readiness.issues, []);
    assert.equal(database.calls.length, 0);
});

test('the same fail-closed probe gates lifecycle startup and HTTP readiness', () => {
    const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
    assert.match(serverSource, /registerComponent\('streamer-world-runtime-readiness',[\s\S]*?assertStreamerWorldRuntimeReady\(pool, streamerWorldFlags\)/);
    assert.match(serverSource, /async function checkReadiness\(\)[\s\S]*?checkStreamerWorldRuntimeReadiness\([\s\S]*?client,[\s\S]*?streamerWorldFlags/);
    assert.match(serverSource, /streamerWorldRuntime\.ready/);
});

test('Quest and Live cannot become ready without their security hardening migrations', () => {
    assert.ok(MODULE_REQUIREMENTS.questEngineV2.migrations.includes(
        'add_streamer_security_quest_windows.sql'
    ));
    assert.ok(MODULE_REQUIREMENTS.liveInteractions.migrations.includes(
        'add_streamer_security_live_acl.sql'
    ));
    assert.ok(MODULE_REQUIREMENTS.liveInteractions.migrations.includes(
        'add_streamer_security_communication_privacy.sql'
    ));
    assert.ok(MODULE_REQUIREMENTS.liveInteractions.relations.includes(
        'creator_sensitive_read_audit'
    ));
    assert.ok(MODULE_REQUIREMENTS.storyWorld.migrations.includes(
        'add_streamer_story_progression_scopes.sql'
    ));
    assert.ok(MODULE_REQUIREMENTS.storyWorld.relations.includes(
        'story_progression_bindings'
    ));
    assert.ok(MODULE_REQUIREMENTS.questEngineV2.migrations.includes(
        'add_streamer_security_quest_lifecycle.sql'
    ));
    assert.ok(MODULE_REQUIREMENTS.rewards.migrations.includes(
        'add_streamer_reward_security_outbox.sql'
    ));
    assert.ok(MODULE_REQUIREMENTS.questEngineV2.migrations.includes(
        'add_streamer_achievement_producers.sql'
    ));
    assert.ok(MODULE_REQUIREMENTS.newGames.migrations.includes(
        'add_streamer_game_daily_calendar.sql'
    ));
});

test('every enabled module fails startup and readiness when its migration or schema is absent', async () => {
    const cases = [
        ['creatorFoundation', 'CREATOR_PROFILE_ENABLED'],
        ['questEngineV2', 'QUEST_ENGINE_V2_ENABLED'],
        ['storyWorld', 'STORY_WORLD_ENABLED'],
        ['liveInteractions', 'LIVE_INTERACTIONS_ENABLED'],
        ['newGames', 'STREAMER_NEW_GAMES_ENABLED'],
        ['rewards', 'STREAMER_REWARD_CATALOG_ENABLED'],
        ['achievements', 'STREAMER_ACHIEVEMENTS_ENABLED']
    ];

    for (const [moduleName, moduleFlag] of cases) {
        const requirement = MODULE_REQUIREMENTS[moduleName];
        const extra = moduleName === 'liveInteractions'
            ? { STREAMER_WORLD_OWNER_USERNAME: 'owner_account' }
            : {};
        const flags = readStreamerWorldFlags(enabledEnvironment(moduleFlag, extra));

        for (const migration of requirement.migrations) {
            const missingMigration = fakeRuntimeDatabase({
                missingMigrations: [migration]
            });
            const migrationReadiness = await checkStreamerWorldRuntimeReadiness(
                missingMigration,
                flags
            );
            assert.equal(migrationReadiness.ready, false, `${moduleName}: ${migration}`);
            assert.equal(migrationReadiness.modules[moduleName].ready, false, moduleName);
            assert.ok(
                migrationReadiness.issues.includes(`${moduleName}.migration_missing:${migration}`),
                migration
            );
            await assert.rejects(
                assertStreamerWorldRuntimeReady(missingMigration, flags),
                (error) => error.code === 'STREAMER_WORLD_RUNTIME_NOT_READY'
            );
        }

        const missingRelation = fakeRuntimeDatabase({
            missingRelations: [requirement.relations[0]]
        });
        const relationReadiness = await checkStreamerWorldRuntimeReadiness(
            missingRelation,
            flags
        );
        assert.equal(relationReadiness.ready, false, `${moduleName} relation`);
        assert.equal(relationReadiness.modules[moduleName].ready, false, moduleName);
    }
});

test('the complete explicit production module matrix is ready only with all dependencies', async () => {
    const flags = readStreamerWorldFlags({
        ...Object.fromEntries(FLAG_NAMES.map((name) => [name, 'true'])),
        NODE_ENV: 'production',
        STREAMER_WORLD_OWNER_USERNAME: 'owner_account'
    });
    const readiness = await checkStreamerWorldRuntimeReadiness(
        fakeRuntimeDatabase(),
        flags
    );
    assert.equal(readiness.ready, true);
    assert.deepEqual(readiness.issues, []);
    for (const module of Object.values(readiness.modules)) {
        assert.equal(module.enabled, true);
        assert.equal(module.ready, true);
    }
    assert.equal(readiness.owner.ready, true);
    assert.equal(readiness.rewards.ready, true);
});

test('live interactions require exactly one configured active administrator account', async () => {
    const missingOwner = readStreamerWorldFlags(enabledEnvironment('LIVE_INTERACTIONS_ENABLED'));
    const missing = await checkStreamerWorldRuntimeReadiness(fakeRuntimeDatabase(), missingOwner);
    assert.equal(missing.ready, false);
    assert.equal(missing.owner.ready, false);
    assert.ok(missing.issues.includes('live.owner_not_configured'));

    const flags = readStreamerWorldFlags(enabledEnvironment('LIVE_INTERACTIONS_ENABLED', {
        STREAMER_WORLD_OWNER_USERNAME: 'owner_account'
    }));
    for (const ownerMatches of [0, 2]) {
        const result = await checkStreamerWorldRuntimeReadiness(
            fakeRuntimeDatabase({ ownerMatches }),
            flags
        );
        assert.equal(result.ready, false, String(ownerMatches));
        assert.equal(result.owner.ready, false, String(ownerMatches));
        assert.ok(result.issues.includes('live.owner_not_unique_active_admin'));
    }

    const activeOwnerDatabase = fakeRuntimeDatabase({ ownerMatches: 1 });
    const ready = await checkStreamerWorldRuntimeReadiness(activeOwnerDatabase, flags);
    assert.equal(ready.owner.ready, true);
    assert.equal(ready.ready, true);
    const ownerQuery = activeOwnerDatabase.calls.find((call) => (
        call.statement.includes('streamer-world:owner')
    ));
    assert.match(ownerQuery.statement, /is_admin = TRUE/);
    assert.match(ownerQuery.statement, /authorized = TRUE/);
    assert.match(ownerQuery.statement, /deactivated = FALSE/);
    assert.match(ownerQuery.statement, /COALESCE\(account_locked, FALSE\) = FALSE/);
});

test('a locked configured owner cannot satisfy the Live startup/readiness gate', async () => {
    const flags = readStreamerWorldFlags(enabledEnvironment('LIVE_INTERACTIONS_ENABLED', {
        STREAMER_WORLD_OWNER_USERNAME: 'locked_owner'
    }));
    const lockedOwnerDatabase = fakeRuntimeDatabase({ ownerMatches: 0 });
    const readiness = await checkStreamerWorldRuntimeReadiness(lockedOwnerDatabase, flags);
    assert.equal(readiness.ready, false);
    assert.equal(readiness.owner.activeMatches, 0);
    assert.ok(readiness.issues.includes('live.owner_not_unique_active_admin'));
    const ownerQuery = lockedOwnerDatabase.calls.find((call) => (
        call.statement.includes('streamer-world:owner')
    ));
    assert.match(ownerQuery.statement, /COALESCE\(account_locked, FALSE\) = FALSE/);
});

test('reward module requires the complete active catalog and matching active budgets', async () => {
    const flags = readStreamerWorldFlags(enabledEnvironment('STREAMER_REWARD_CATALOG_ENABLED'));
    const catalogMissing = await checkStreamerWorldRuntimeReadiness(
        fakeRuntimeDatabase({ catalogRows: [] }),
        flags
    );
    assert.equal(catalogMissing.ready, false);
    assert.equal(catalogMissing.rewards.catalogReady, false);
    assert.ok(catalogMissing.issues.includes('rewards.catalog_not_ready'));

    const wrongBudgets = rewardPack.budgets.map((budget, index) => ({
        budget_key: budget.key,
        scope: budget.scope,
        daily_limit: String(index === 0 ? budget.dailyLimit + 1 : budget.dailyLimit),
        lifecycle: 'active'
    }));
    const budgetsInvalid = await checkStreamerWorldRuntimeReadiness(
        fakeRuntimeDatabase({ budgetRows: wrongBudgets }),
        flags
    );
    assert.equal(budgetsInvalid.ready, false);
    assert.equal(budgetsInvalid.rewards.budgetsReady, false);
    assert.ok(budgetsInvalid.issues.includes('rewards.budgets_not_ready'));

    const ready = await checkStreamerWorldRuntimeReadiness(fakeRuntimeDatabase(), flags);
    assert.equal(ready.rewards.catalogReady, true);
    assert.equal(ready.rewards.budgetsReady, true);
    assert.equal(ready.ready, true);
});
