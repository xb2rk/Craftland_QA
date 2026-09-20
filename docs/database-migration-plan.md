# MySQL Database Migration Plan

No database command in this document has been executed.

## Database creation

Proposed command:

```sql
CREATE DATABASE craftland_quality_analyzer
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

Scope and impact:

- Creates one new database named `craftland_quality_analyzer`.
- Does not modify or delete an existing database.
- Does not grant users or change server-level permissions.
- Fails if a database with the same name already exists.

The creation command must be run through Garena MCP Demo System after its
authentication is working and after the database name is confirmed.

## Initial migration

Migration file:

`backend/src/database/migrations/001_initial.sql`

It creates:

- `project_profiles`
- `analysis_runs`
- `analysis_files`
- `findings`
- `ai_exchanges`
- `simulation_runs`

It also creates foreign keys and indexes only inside the new database.

The migration does not:

- inspect or mutate a Craftland game repository;
- store raw source code;
- store AI API keys;
- alter tables outside `craftland_quality_analyzer`.

## Runtime data

The database stores:

- analysis metadata and Git revision identifiers;
- discovered file metadata and hashes;
- deterministic/compiler/AI/simulation findings;
- structured AI reports and usage metadata;
- simulation input/output.

Raw repository source remains on the local machine and is not persisted in
MySQL.

## Rollback

No destructive automatic rollback is included in MVP. If a migration fails, it
rolls back its transaction where MySQL permits transactional DDL behavior, and
the failure must be reviewed before retrying.

Dropping tables or the database requires a separate explicit approval and is
not part of the normal migration workflow.
