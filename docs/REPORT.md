# Craftland Quality Analyzer — System Report

> Living report for the greenfield rewrite (`feat/greenfield-be`).
> Screenshots belong in `docs/images/` using the filenames referenced below.

## 1. What this is, who it is for, and why

**What.** A local-first web app that reviews changes in a game repository and
explains them in plain language. Point it at a repo on your disk, pick two
revisions (or one version), and it returns: a deterministic change analysis
(CSV integrity, config diffs, git diff) plus an AI narrative (risk verdict,
findings by game system, recommendations, unknowns).

**Who.**

| Role | Uses it to |
|---|---|
| Game designer | Ask "is this change safe?" before a playtest; probe hypothetical tuning edits without touching files |
| Developer | Read the diff, verify a fix, draft commit/PR text that follows repo conventions |
| QA / Localization | Check `key.csv` integrity, preview translations, ask questions about a table |

**Why.** Designers can read a balance change but not a 50-file diff; developers
can read the diff but not the design intent. The tool bridges that gap: every
AI claim is grounded in repository evidence (changed files, deterministic
findings, attached sources), and every page is built around one question —
*should this go in?*

## 2. How it works (the pipeline)

```
local repo on disk
  → inspect (branch, HEAD, file inventory)
  → compare baseRef..currentRef (changed files + unified diff)
  → deterministic checks (CSV audits, config comparison, localization checks)
  → AI stage (Insea workflow: Prompt + Manifest + DataList attachments)
  → normalized report (canonical schema, safe defaults)
  → persisted run (file driver by default) → rendered verdict-first in the UI
```

Two guarantees hold across the whole pipeline:

1. **The AI never invents evidence.** Prompts are evidence-only with
   confidence calibration; unknown coverage is reported as unknowns, not facts.
2. **The UI never breaks on AI output.** The backend normalizes every AI
   response to a canonical shape; the frontend renders guarded sections with
   empty states plus a Raw JSON fallback.

## 3. Architecture

**Backend** (`backend/src`, Express + TypeScript):

- `http/` — app wiring, route groups (`routes/`), zod validators, OpenAPI doc
- `modules/analysis/` — run orchestration split into runners (analysis,
  comparison), question answering, what-if, run import
- `modules/ai/` — prompt builders per stage (`prompts/`), context builder,
  Insea client, report normalizer
- `modules/{git,projects,discovery,configs,writers,localization}/` —
  single-responsibility domains
- `persistence/` — repository interface with three drivers:
  `memory` (tests/ephemeral), `file` (default — one JSON per run, survives
  restarts), `mysql` (shared/prod)

**Frontend** (`frontend/src`, React + Ant Design + Tailwind):

- `pages/` — one component per route; `components/review/` — Review panels
- `api/` — typed client + React Query hooks (polling while runs are active)
- `projects/` + `settings/` + `whatif/` — localStorage-backed user state
- Shared design system in `components/ui/` + `theme/tokens.ts`

## 4. Pages

### 4.1 Overview (`/`)

Project gallery. Each card shows the project name, full local path, and the
last completed verdict; the dashed card adds a project via server folder
browser (or pasted path). Selecting a project makes it active everywhere.

![Overview page](images/overview.png)

*Flow: add/select project → active project follows you to Review and Version
tools.*

### 4.2 Review (`/review`)

Compare **two** versions. A sticky summary bar keeps the pair, lens,
verbosity, and focus visible; the Compare versions card holds both ref pickers
(with branch/commit search), repo metadata, and saved compare presets; below,
three tabs:

- **AI Review** — goal, lens, verbosity, focus files, reviewer notes, run button
- **Git Diff** — GitHub-style unified/split viewer, file filter, jump chips,
  large files start collapsed
- **Files Changed** — searchable table with per-row Focus (narrows the AI to
  those files) and View-in-diff jump

![Review page](images/review.png)

*Flow: pick base → current (default `HEAD~1 → WORKTREE`) → set goal/lens →
Review with AI → verdict-first run detail.*

### 4.3 Version tools (`/version`)

Work with **one** version. A single ref picker drives three tabs:

- **Writers** — commit message or PR description for the change *at* that ref
  (`parent → ref`). The backend discovers repo conventions (`AGENTS.md`,
  `CONTRIBUTING.md`, PR templates) and applies per-project style notes; a
  deterministic template covers AI-off. Draft history is kept per project.
- **Localization** — key.csv QA for the revision: check mode (duplicate keys,
  empty values named by language code, row widths) plus AI narrative;
  translate mode previews AI-filled cells scoped to a language or key, with
  CSV download (nothing is written back). A glossary input preserves game
  terms; an ask box answers follow-ups about the table.
- **What-if** — conversational hypothetical edits ("what if sword price were
  150?"): the prompt is drafted into an exact edit, evaluated against the
  version without touching the repo, threads persist per project.

![Version tools page](images/version.png)

*Flow: pick version → Writers drafts the release text → Localization checks
the table → What-if probes the next tuning idea.*

### 4.4 Runs (`/runs`)

AI history. Search, status/lens filters, verdict risk tags, two-run A/B
compare (deterministic delta of two completed runs), and JSON import/export
for sharing runs across machines.

![Runs page](images/runs.png)

### 4.5 Run detail (`/runs/:id`)

Verdict-first: risk banner, plain-language assessment, top concerns, then AI
report, issues grouped by game system (Combat / Economy / Progression /
Other), the full Changes diff, and Raw JSON. Actions: rerun, ask about the
change (grounded Q&A drawer), export JSON / diff / issues checklist.

![Run detail page](images/run-detail.png)

### 4.6 Settings (`/settings`)

AI defaults (verbosity, lens), reusable prompt templates, backend/AI/
persistence status, and local-data controls (clear projects, threads,
settings).

![Settings page](images/settings.png)

## 5. Backend API (summary)

Full contract at `GET /openapi.json`. Main routes:

- `GET /api/health` — status, persistence driver, AI configured, queued jobs
- `POST /api/projects/inspect|browse` + `GET /api/projects/branches|commits`
- `POST /api/projects/diff` — instant diff preview without a run
- `POST /api/analysis-runs` (+ `/compare`, `/:id`, `/:id/questions`, `/import`)
- `POST /api/projects/whatif` — hypothetical single-cell config edit
- `POST /api/projects/write` — commit/PR draft with conventions
- `POST /api/projects/localization` (+ `/localization/ask`) — table QA,
  translate preview, follow-up questions

## 6. Configuration

Copy `.env.example` to `.env`. Key settings:

| Key | Effect |
|---|---|
| `PERSISTENCE_DRIVER` | `file` (default, durable) · `memory` (ephemeral) · `mysql` (shared) |
| `FILE_STORE_DIR` | Where file-driver runs live (`backend/data/`) |
| `AI_WORKFLOW_URL` + `AI_WORKFLOW_API_KEY` | Both required — URL alone leaves AI off with a warning |
| `ANALYZED_ROOTS` | Comma-separated roots allowed for browsing/inspection |
| `DB_*` | Required when `PERSISTENCE_DRIVER=mysql` |

## 7. Contributions (how to extend)

- **New review lens** — add a value to `AnalysisLens`, one instruction block in
  `prompts/review.prompt.ts`, one label in `ANALYSIS_LENSES`. Prompt version
  bump rides along.
- **New deterministic check** — pure function over file content in the owning
  module + findings with stable codes; covered by a vitest file next to it.
- **New writer kind** — extend `WriterKind`, add rules in `writer.prompt.ts`,
  add the template branch in `deterministicWriterText`.
- **New Version-tools tab** — single-ref panel under `components/review/`,
  wired in `pages/Version.tsx`; no Review changes needed.
- **Rules for every change** — backend `typecheck` + `vitest`, frontend
  `typecheck` + `vitest` + `vite build`, then one live smoke (health + one
  endpoint) before commit.

## 8. Verification status

- Backend: `tsc --noEmit` clean, 53/53 vitest (incl. repository, writer,
  localization, Q&A, what-if suites).
- Frontend: `tsc -b` clean, 24/24 vitest, `vite build` green.
- Live: file-driver durability proven across a server restart (run survived
  with goal + history intact); health + write/localization endpoints probed.
