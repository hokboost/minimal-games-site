'use strict';

const rewardPack = require('../content/streamer-world/rewards/catalog');

function freezeRequirement(requirement) {
    return Object.freeze({
        enabledFlag: requirement.enabledFlag,
        migrations: Object.freeze([...requirement.migrations]),
        relations: Object.freeze([...requirement.relations])
    });
}

const MODULE_REQUIREMENTS = Object.freeze({
    creatorFoundation: freezeRequirement({
        enabledFlag: 'creatorFoundationEnabled',
        migrations: ['add_creator_foundation.sql'],
        relations: ['creator_profiles', 'creator_preferences']
    }),
    questEngineV2: freezeRequirement({
        enabledFlag: 'questEngineV2Enabled',
        migrations: [
            'add_streamer_quest_engine_v2.sql',
            'add_streamer_security_quest_windows.sql',
            'add_streamer_security_quest_lifecycle.sql',
            'add_streamer_achievement_producers.sql'
        ],
        relations: [
            'quest_v2_definitions',
            'quest_v2_assignments',
            'quest_v2_trusted_events',
            'quest_v2_assignment_event_consumptions',
            'quest_v2_chain_completions',
            'quest_v2_appeals'
        ]
    }),
    storyWorld: freezeRequirement({
        enabledFlag: 'storyWorldEnabled',
        migrations: [
            'add_story_world_season_one.sql',
            'add_streamer_story_progression_scopes.sql'
        ],
        relations: [
            'story_content_versions',
            'story_runs',
            'story_events',
            'story_progression_bindings'
        ]
    }),
    liveInteractions: freezeRequirement({
        enabledFlag: 'liveInteractionsEnabled',
        migrations: [
            'add_live_interaction_platform.sql',
            'add_streamer_security_live_acl.sql',
            'add_streamer_security_communication_privacy.sql'
        ],
        relations: [
            'live_interactions',
            'live_interaction_members',
            'live_interaction_events',
            'creator_sensitive_read_audit'
        ]
    }),
    newGames: freezeRequirement({
        enabledFlag: 'newGamesEnabled',
        migrations: [
            'add_streamer_games_batch_one.sql',
            'add_streamer_games_batch_two.sql',
            'add_streamer_game_daily_calendar.sql'
        ],
        relations: [
            'streamer_game_versions',
            'streamer_game_runs',
            'streamer_game_trusted_events'
        ]
    }),
    rewards: freezeRequirement({
        enabledFlag: 'rewardsEnabled',
        migrations: [
            'add_streamer_reward_catalog.sql',
            'add_streamer_reward_security_outbox.sql'
        ],
        relations: [
            'reward_catalog_items',
            'reward_catalog_versions',
            'reward_catalog_budgets',
            'reward_orders',
            'reward_grant_intents',
            'reward_grant_intent_events'
        ]
    }),
    achievements: freezeRequirement({
        enabledFlag: 'achievementsEnabled',
        migrations: ['add_streamer_achievements_and_archives.sql'],
        relations: [
            'streamer_achievement_definitions',
            'streamer_achievement_events',
            'streamer_achievement_progress'
        ]
    })
});

function unique(values) {
    return [...new Set(values)];
}

function disabledResult() {
    return {
        ready: true,
        modules: Object.fromEntries(Object.keys(MODULE_REQUIREMENTS).map((name) => [name, {
            enabled: false,
            ready: true,
            missingMigrations: [],
            missingRelations: []
        }])),
        owner: { required: false, ready: true, activeMatches: null },
        rewards: {
            required: false,
            ready: true,
            catalogReady: true,
            budgetsReady: true
        },
        issues: []
    };
}

function catalogIsReady(rows) {
    const activeSlugs = new Set(rows
        .filter((row) => row.lifecycle === 'active'
            && row.catalog_version === rewardPack.catalogVersion)
        .map((row) => row.slug));
    return rewardPack.items.every((item) => activeSlugs.has(item.slug));
}

function budgetsAreReady(rows) {
    const byKey = new Map(rows.map((row) => [row.budget_key, row]));
    return rewardPack.budgets.every((expected) => {
        const actual = byKey.get(expected.key);
        return actual?.lifecycle === 'active'
            && actual.scope === expected.scope
            && Number(actual.daily_limit) === expected.dailyLimit;
    });
}

async function checkStreamerWorldRuntimeReadiness(database, flags) {
    if (!database?.query || !flags || typeof flags !== 'object') {
        throw new TypeError('Streamer World runtime readiness requires a database and flags');
    }

    const result = disabledResult();
    const enabledEntries = Object.entries(MODULE_REQUIREMENTS)
        .filter(([, requirement]) => flags[requirement.enabledFlag] === true);
    if (enabledEntries.length === 0) return result;

    const requiredMigrations = unique(enabledEntries.flatMap(([, value]) => value.migrations));
    const requiredRelations = unique(enabledEntries.flatMap(([, value]) => value.relations));
    const [migrationResult, relationResult] = await Promise.all([
        database.query(`
            /* streamer-world:migrations */
            SELECT filename, status
            FROM minimal_games_schema_migrations
            WHERE filename = ANY($1::TEXT[])
        `, [requiredMigrations]),
        database.query(`
            /* streamer-world:relations */
            SELECT required.relation_name,
                   to_regclass('public.' || required.relation_name) IS NOT NULL AS ready
            FROM unnest($1::TEXT[]) AS required(relation_name)
        `, [requiredRelations])
    ]);
    const appliedMigrations = new Set(migrationResult.rows
        .filter((row) => row.status === 'applied')
        .map((row) => row.filename));
    const availableRelations = new Set(relationResult.rows
        .filter((row) => row.ready === true)
        .map((row) => row.relation_name));

    for (const [moduleName, requirement] of Object.entries(MODULE_REQUIREMENTS)) {
        const enabled = flags[requirement.enabledFlag] === true;
        if (!enabled) continue;
        const missingMigrations = requirement.migrations
            .filter((name) => !appliedMigrations.has(name));
        const missingRelations = requirement.relations
            .filter((name) => !availableRelations.has(name));
        const ready = missingMigrations.length === 0 && missingRelations.length === 0;
        result.modules[moduleName] = {
            enabled,
            ready,
            missingMigrations,
            missingRelations
        };
        for (const name of missingMigrations) {
            result.issues.push(`${moduleName}.migration_missing:${name}`);
        }
        for (const name of missingRelations) {
            result.issues.push(`${moduleName}.relation_missing:${name}`);
        }
    }

    if (flags.liveInteractionsEnabled === true) {
        result.owner.required = true;
        if (!flags.ownerUsername) {
            result.owner.ready = false;
            result.owner.activeMatches = 0;
            result.issues.push('live.owner_not_configured');
        } else {
            const ownerResult = await database.query(`
                /* streamer-world:owner */
                SELECT COUNT(*)::INTEGER AS matching_count
                FROM users
                WHERE username = $1
                  AND is_admin = TRUE
                  AND authorized = TRUE
                  AND deactivated = FALSE
                  AND COALESCE(account_locked, FALSE) = FALSE
            `, [flags.ownerUsername]);
            const activeMatches = Number(ownerResult.rows[0]?.matching_count || 0);
            result.owner.activeMatches = activeMatches;
            result.owner.ready = activeMatches === 1;
            if (!result.owner.ready) {
                result.issues.push('live.owner_not_unique_active_admin');
            }
        }
    }

    if (flags.rewardsEnabled === true) {
        result.rewards.required = true;
        if (result.modules.rewards.ready) {
            const [catalogResult, budgetResult] = await Promise.all([
                database.query(`
                    /* streamer-world:reward-catalog */
                    SELECT item.slug, version.catalog_version, version.lifecycle
                    FROM reward_catalog_items AS item
                    JOIN reward_catalog_versions AS version ON version.item_id = item.id
                    WHERE item.slug = ANY($1::TEXT[])
                `, [rewardPack.items.map((item) => item.slug)]),
                database.query(`
                    /* streamer-world:reward-budgets */
                    SELECT budget_key, scope, daily_limit, lifecycle
                    FROM reward_catalog_budgets
                    WHERE budget_key = ANY($1::TEXT[])
                `, [rewardPack.budgets.map((budget) => budget.key)])
            ]);
            result.rewards.catalogReady = catalogIsReady(catalogResult.rows);
            result.rewards.budgetsReady = budgetsAreReady(budgetResult.rows);
        } else {
            result.rewards.catalogReady = false;
            result.rewards.budgetsReady = false;
        }
        result.rewards.ready = result.rewards.catalogReady && result.rewards.budgetsReady;
        if (!result.rewards.catalogReady) result.issues.push('rewards.catalog_not_ready');
        if (!result.rewards.budgetsReady) result.issues.push('rewards.budgets_not_ready');
    }

    result.ready = Object.values(result.modules).every((module) => module.ready)
        && result.owner.ready
        && result.rewards.ready;
    return result;
}

async function assertStreamerWorldRuntimeReady(database, flags) {
    const result = await checkStreamerWorldRuntimeReadiness(database, flags);
    if (result.ready) return result;
    const error = new Error(`Streamer World runtime is not ready: ${result.issues.join(', ')}`);
    error.code = 'STREAMER_WORLD_RUNTIME_NOT_READY';
    error.readiness = result;
    throw error;
}

module.exports = {
    MODULE_REQUIREMENTS,
    assertStreamerWorldRuntimeReady,
    checkStreamerWorldRuntimeReadiness
};
