# Streamer World activation and kill switches

Streamer World is fail-closed in every environment, including production. A module is enabled only when its flag is present with the exact lowercase value `true`. Missing flags are disabled. Values such as `TRUE`, `1`, `yes`, an empty string, or whitespace-padded values are invalid configuration and stop application startup.

The root and Creator Foundation switches are prerequisites for every Streamer World module:

```text
STREAMER_WORLD_ENABLED=true
CREATOR_PROFILE_ENABLED=true
```

Enable only the required module switches after migrations have been applied:

```text
QUEST_ENGINE_V2_ENABLED=true
STORY_WORLD_ENABLED=true
LIVE_INTERACTIONS_ENABLED=true
STREAMER_NEW_GAMES_ENABLED=true
STREAMER_REWARD_CATALOG_ENABLED=true
STREAMER_ACHIEVEMENTS_ENABLED=true
```

There are no production defaults and the launcher never inserts missing values. A deployment whose environment omits these variables starts with Streamer World disabled.

## Activation prerequisites

Before enabling a module, run the tracked migrations with the migration process and confirm `npm run test:migrations` against an authorized disposable PostgreSQL database. The web process never applies production migrations. At startup and on `/ready`, each enabled module verifies its tracked migration records and critical relations.

`LIVE_INTERACTIONS_ENABLED=true` additionally requires `STREAMER_WORLD_OWNER_USERNAME` to name exactly one account that is currently an administrator, authorized, not deactivated, and not locked. Missing, malformed, inactive, locked, deactivated, non-admin, or non-unique ownership configuration keeps the service unready and prevents startup.

`STREAMER_REWARD_CATALOG_ENABLED=true` additionally requires the complete expected active catalog version and all configured active budget rows with their reviewed scopes and limits. Catalog or budget drift prevents startup and makes readiness fail closed. These checks do not bypass or alter the existing balance ledger, inventory, gift outbox, provider receipt, or uncertain-delivery rules.

Use `/ready` for the public ready/unavailable result. The token-protected `/internal/ready` response includes the per-module dependency result. `/live` and `/health` are liveness probes and do not establish that Streamer World dependencies are safe.

## Emergency kill switch

For the fastest complete Streamer World shutdown:

1. Set `STREAMER_WORLD_ENABLED=false` explicitly on every web instance.
2. Restart or redeploy every instance.
3. Confirm `/ready` returns ready and verify Streamer World routes are unavailable.

This disables all derived Streamer World modules without deleting catalog data, progress, audit history, rewards, balances, inventory, or gift reconciliation state.

For an isolated module shutdown, set only its module flag to `false` and restart every instance. Setting `CREATOR_PROFILE_ENABLED=false` also closes every dependent module. Do not remove flags as an emergency convention: removal is safe and disabled, but an explicit `false` documents operator intent and is easier to audit.

The external-value switches remain independent safety boundaries:

```text
EXTERNAL_GIFTS_ENABLED=false
PK_EXTERNAL_SEND_ENABLED=false
```

Disabling Streamer World does not resolve, retry, refund, or discard uncertain provider operations. Continue using the existing reconciliation process for those records.
