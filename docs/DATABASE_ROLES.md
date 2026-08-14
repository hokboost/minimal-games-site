# Production database roles

Production deployments use separate PostgreSQL identities:

- `minimal_games_migrator` owns the schema and is used only by `npm run migrate` in a one-shot deployment job.
- `minimal_games_runtime` is used by the web process. It is not an owner and has no `CREATE`, `ALTER`, `DROP`, `TRIGGER`, or `SET ROLE` capability.
- `minimal_games_audit` has read-only access for reconciliation exports.

The production web process only verifies migration filenames and checksums. It never executes migrations.

Example grants must be adapted to the deployment database and executed by its owner:

```sql
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO minimal_games_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO minimal_games_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO minimal_games_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE minimal_games_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO minimal_games_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE minimal_games_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO minimal_games_runtime;
```

Do not grant table ownership, schema `CREATE`, `BYPASSRLS`, superuser, or membership in the migrator role to the runtime identity.
