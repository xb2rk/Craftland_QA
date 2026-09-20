# Craftland Quality Analyzer

Local-first internal tool for comparing Git revisions, checking game
configuration quality and asking an Insea AI workflow to analyze code/config
impact on gameplay and feature flow.

## Current MVP

- React, Tailwind CSS and Ant Design frontend.
- Express and TypeScript backend.
- Local Git project inspection without checkout or source mutation.
- `baseRef` versus commit/branch or `WORKTREE` comparison.
- Generic source/config discovery; no fixed dependency on one game template.
- Deterministic CSV structure and key checks.
- Insea multipart integration using `Prompt`, `Manifest` and repeated
  `DataList` file fields.
- MySQL schema and repository, with in-memory fallback when DB variables are
  not configured.

## Analysis flows

`Inspect project` is optional: it previews a local project tree but does not
start an analysis. `Run analysis` always presents its queued/running/completed
state and deterministic findings, including when Inspect was not used.

For one direct revision comparison, enter `baseRef` and `currentRef`. The
backend materializes read-only snapshots for both selected commits and sends
paired changed config/source evidence to the AI workflow. The deterministic
pass also reports keyed CSV record additions/removals and field-value changes.

For an A/B review, run two original analyses using committed refs (not
`WORKTREE`), then select the completed runs in **Compare completed analyses**.
The third run compares the two exact current commits and records the source
run IDs for traceability. This is designed for Version A → Version B → A/B
comparison reviews.

If the backend AI workflow variables are absent, the UI explicitly reports
`AI is not configured on this server`; deterministic checks still complete but
no LLM impact report is produced.

## Project structure

```text
backend/
  src/
    database/
    domain/
    repositories/
    services/
  tests/

frontend/
  src/

docs/
```

## Local setup

Requirements:

- Node.js
- pnpm or npm
- Git CLI
- MySQL 8 when persistence is enabled

Install:

```bash
pnpm install
```

Copy environment variables:

```powershell
Copy-Item .env.example .env
```

Fill the real AI key only in `.env`:

```dotenv
AI_WORKFLOW_URL=https://ai.insea.io/api/workflows/25537/run
AI_WORKFLOW_API_KEY=your-real-key
```

The frontend never receives the key.

## Run locally

Start backend and frontend:

```bash
pnpm dev
```

URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`
- Health check: `http://localhost:3000/api/health`

## Test and build

```bash
pnpm test
pnpm build
```

Run workspaces separately:

```bash
pnpm test:backend
pnpm test:frontend
pnpm --filter @craftland-analyzer/backend build
pnpm --filter @craftland-analyzer/frontend build
```

## MySQL

When no `DB_*` variables are set, the backend uses an in-memory repository.
This is useful for local UI/API development but analysis history is lost on
restart.

To use MySQL:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=craftland_quality_analyzer
DB_USER=your-user
DB_PASSWORD=your-password
```

After the database is created, apply migrations:

```bash
pnpm --filter @craftland-analyzer/backend migrate
```

Do not run the migration until the target database and scope have been
reviewed. See `docs/database-migration-plan.md`.

## API

Inspect a local project:

```http
POST /api/projects/inspect
Content-Type: application/json

{
  "localPath": "C:\\Projects\\MyGame"
}
```

Run analysis:

```http
POST /api/analysis-runs
Content-Type: application/json

{
  "localPath": "C:\\Projects\\MyGame",
  "baseRef": "origin/main",
  "currentRef": "WORKTREE",
  "goal": "Check balance impact, flow safety and recovery risks."
}
```

Compare two completed runs:

```http
POST /api/analysis-runs/compare
Content-Type: application/json

{
  "analysisRunAId": "uuid-of-run-a",
  "analysisRunBId": "uuid-of-run-b",
  "goal": "Compare spawn pacing and player-flow impact."
}
```

Read analysis:

```text
GET /api/analysis-runs
GET /api/analysis-runs/:id
```

## Security boundaries

- Git commands use argument arrays rather than shell-composed commands.
- The analyzer does not checkout or modify the inspected project.
- `.env`, keys, certificates and common generated/cache directories are
  excluded from AI context.
- Absolute source paths are not returned to the frontend.
- AI authorization headers are never persisted by application code.
- AI context is capped by file count and total bytes.

## Current limitations

- MySQL database creation has not been executed.
- Garena MCP authentication must work before database creation through Demo
  System.
- AI follow-up context rounds and simulation charts are subsequent MVP phases.
- Compiler/toolchain execution is not enabled automatically; arbitrary commands
  from users are intentionally rejected.
