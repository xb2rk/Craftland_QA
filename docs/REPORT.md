# Craftland Quality Analyzer — Contest Submission Report

> **Project:** Craftland Quality Analyzer — AI-assisted change review for Craftland / UGC game repositories
> **Stack:** Express + TypeScript · React 19 + Ant Design 6 + Tailwind CSS 4 · MySQL / File / Memory persistence · Insea AI Workflow
> **Status:** Working MVP — backend `tsc` clean + 53/53 vitest · frontend `tsc -b` clean + 24/24 vitest + `vite build` green · live smoke verified

---

## 1. Executive Summary

Game updates break for reasons that are hard to see in a diff: a balance number changes in one CSV, the formula that consumes it lives in another file, and the player-facing consequence only appears after release.

**Craftland Quality Analyzer** answers one question for every change — ***should this go in?*** — by combining:

1. **Deterministic static analysis** (Git diff, CSV integrity audits, config comparison, localization checks), and
2. **Evidence-grounded AI review** via the Insea workflow (Prompt + Manifest + DataList attachments), with strict anti-hallucination rules and schema normalization.

Point it at a local game repository, select two revisions (or one version), and it returns a verdict-first report: risk verdict, plain-language assessment, findings grouped by game system (Combat / Economy / Progression / Other), recommended tests, unknowns, and full traceable evidence down to file + line ranges.

Unlike generic AI code reviewers, the system understands Craftland-style projects: gameplay CSVs with header/type/data rows, FC tuple configs (`CustomConfig.fcc`, `GameConfig.fcg`), data-graph projections (`ItemCatalog`, `ZombieData`, `BossData`), and localization tables (`key.csv`).

---

## 2. Problem Statement

Through discovery on a real Craftland project (`PlantsVsZombiesFCC`), we identified three recurring failure modes:

**P1. Designers cannot read diffs; developers cannot read design intent.**
A 50-file diff hides whether "sword price 100 → 150" breaks economy, pacing, or new-player flow. Existing tools show *what changed*, never *what it means for gameplay*.

**P2. High-impact tuning values are scattered and silently dead.**
Critical parameters live both in CSVs (`PlantData`, `ZombieData`, `BossData`, `ShopSlotData`, …) and as hard-coded FC tuple defaults. Some configs are documented but have no effect. Two confirmed real-world examples from discovery:

- `BossConfig.FightSpawnIntervalPct = 50` (documented as "spawn 2× faster during boss") **has no effect** — the implementation returns the base interval unchanged for any value ≤ 100, and slows spawning for values > 100.
- `BossConfig.SpawnMinColumnIndex / SpawnMaxColumnIndex` **have no runtime consumer** — getters exist, but `Server_ZombieSpawner.SelectBossSpawnColumn` hard-codes edge-column exclusion instead.

A CSV-only checker misses both classes entirely.

**P3. AI reviewers hallucinate without repository evidence.**
Naive LLM tools invent files, line numbers, and config keys. For game teams this is worse than no review — it creates false confidence before a playtest or release.

---

## 3. Objectives

1. **Bridge design and code:** explain every change in plain language with gameplay impact, not justUNIFIED diff output.
2. **Never invent evidence:** every AI claim must cite repository-relative paths + line ranges from attached sources; gaps are reported as *unknowns*, not facts.
3. **Never break the UI on AI output:** normalize all AI responses to a canonical schema with safe defaults and guarded rendering.
4. **Stay local-first and safe:** read-only Git inspection (no checkout, no mutation), secret/binary exclusion, capped context, argument-array Git execution.
5. **Serve the whole team:** designer (hypothetical tuning), developer (diff + release text), QA/localization (table QA + translations) — in one tool.

---

## 4. Proposed Solution — System Overview

```
Local game repo on disk
  → Inspect (branch, HEAD, file inventory)
  → Compare baseRef..currentRef (changed files + unified diff)
  → Deterministic checks (CSV audits, config comparison, localization checks)
  → AI stage (Insea workflow: Prompt + Manifest + DataList)
  → Normalized report (canonical schema, safe defaults)
  → Persisted run (file / memory / MySQL) → Verdict-first UI
```

**Two system-wide guarantees:**

- **Evidence-only AI.** Prompts enforce: distinguish fact / inference / hypothesis, never invent files or line numbers, request more context when confidence is low, put missing data in `unknowns`, return strict JSON only.
- **Resilient rendering.** Backend `report-normalizer` coerces every AI response to the canonical shape; frontend renders guarded sections with empty states plus a Raw JSON fallback.

---

## 5. Key Features

### 5.1 Dual-revision AI Review (`/review`)

Compare any two refs (`HEAD~1 → WORKTREE` by default, with branch/commit search). Configurable goal, review lens (balance, flow safety, recovery, bug risk), verbosity, focus files, and reviewer notes. Output: risk verdict banner, assessment, top concerns, issues by game system, full diff, exports (JSON / diff / issues checklist), grounded follow-up Q&A, and rerun.

### 5.2 Single-version Version Tools (`/version`)

- **Writers:** commit message / PR description drafts for `parent → ref`, auto-discovering repo conventions (`AGENTS.md`, `CONTRIBUTING.md`, PR templates) plus per-project style notes. Deterministic template fallback when AI is off. Per-project draft history.
- **Localization:** `key.csv` QA (duplicate keys, empty values per language code, row widths) + AI narrative; translate-preview scoped to language/key with CSV download (never writes back); glossary preservation for game terms; follow-up ask box.
- **What-if:** conversational hypothetical tuning ("what if sword price were 150?") — drafted into an exact edit, evaluated against the version **without touching the repo**. Threads persist per project.

### 5.3 Run Management (`/runs`, `/runs/:id`)

Searchable AI history with status/lens filters, verdict risk tags, **two-run A/B compare** (deterministic delta of two completed runs), and JSON import/export for cross-machine sharing. Run detail is verdict-first with system-grouped issues and evidence links.

### 5.4 Deterministic Analysis Engine

- Craftland-aware CSV parser (header / type / data rows).
- Per-table key profiles (e.g., `MergeTierData` allows multiple rows per tier — not a duplicate error).
- Cross-table reference checks, seed-pool rate totals, shop-pool consistency, tier ordering.
- FC tuple config awareness (`CustomConfig.fcc`, `GameConfig.fcg`) + dead-config detection (getter with no consumers).
- Keyed record add/remove + field-value change reporting.

### 5.5 Safe Local-First Infrastructure

Read-only snapshots via `git show <ref>:<path>`, filesystem reads for worktree (including untracked files), `ANALYZED_ROOTS` sandboxing, path-escape rejection, secret/binary/size exclusion, and three persistence drivers: `memory` (tests), `file` (default — one JSON per run, survives restarts), `mysql` (shared/prod).

---

## 6. System Architecture and Technology

### 6.1 Architecture

**Backend** (`backend/src`, Express 5 + TypeScript 7, Zod validation, Pino logging, OpenAPI at `GET /openapi.json`):

- `http/` — app wiring, route groups, validators, error middleware, OpenAPI doc
- `modules/analysis/` — orchestration split into `runners/` (analysis, comparison), `questions/` (grounded Q&A), `whatif/`, `runs/` (import)
- `modules/ai/` — per-stage prompt builders (`prompts/`), context builder, Insea multipart client, report normalizer
- `modules/{git,projects,discovery,configs,writers,localization}/` — single-responsibility domains
- `persistence/` — repository interface × 3 drivers (`memory`, `file`, `mysql`)
- `database/` — MySQL 8 pool + migrations

**Frontend** (`frontend/src`, React 19 + Ant Design 6 + Tailwind 4 + React Query 5 + Recharts):

- `pages/` — one component per route (Overview, Review, Version, Runs, RunDetail, Settings)
- `components/review/` — Review panels (diff viewer, files-changed table, writers, localization, what-if)
- `api/` — typed client + React Query hooks (polling while runs are active)
- `projects/` + `settings/` + `whatif/` — localStorage-backed user state
- Shared design system in `components/ui/` + `theme/tokens.ts`

### 6.2 AI Workflow (Insea Contract v1)

Three stages over the same endpoint (`POST ${AI_WORKFLOW_URL}`, multipart `Prompt` + `Manifest` + repeated `DataList`), full contract in `docs/ai-workflow-contract.md`:

| Stage | Input | Output |
|---|---|---|
| `context_selection` | Goal, filtered tree, changed files, diff summary, CSV/script catalogs | Files to read (full/chunk/search), search terms, initial hypotheses |
| `impact_analysis` | File contents + diffs, old/current CSV rows, config consumers, deterministic findings | Config consistency, code/gameplay impact, flow & recovery risk, tests, simulations, file/line evidence, unknowns |
| `report_synthesis` | Partial findings + simulations + compiler/test output | Verdict (`pass` / `pass_with_warnings` / `needs_review` / `fail` / `insufficient_evidence`), quality score, designer + developer sections |

Transport guardrails: `upload_name` unique per request (`file-0001.csv`, …), `relative_path` in Manifest as source of truth, 100 MiB transport cap with lower per-stage budgets (e.g., 30 files / 20 MiB), retry only on timeout/429/5xx (max 2), schema validation before persistence, diagnostics on violation.

### 6.3 API Summary

- `GET /api/health` — status, persistence driver, AI configured, queued jobs
- `POST /api/projects/inspect|browse` · `GET /api/projects/branches|commits`
- `POST /api/projects/diff` — instant diff preview without a run
- `POST /api/analysis-runs` (+ `/compare`, `/:id`, `/:id/questions`, `/import`)
- `POST /api/projects/whatif` · `POST /api/projects/write` · `POST /api/projects/localization` (+ `/localization/ask`)

---

## 7. Implementation Results and Demonstration

### 7.1 What the judges can try in 5 minutes

1. **Add a project** on Overview (`/`) via server folder browser → card shows name, path, last verdict.
2. **Review a balance change** on Review (`/review`): pick `HEAD~1 → WORKTREE`, set goal "check balance impact", run → verdict banner + Combat/Economy findings with file:line evidence.
3. **Probe a hypothetical** on Version → What-if: "what if zombie HP were doubled?" → evaluated answer without editing the repo.
4. **Check localization** on Version → Localization: run check mode on `key.csv`, preview a translation, download CSV.
5. **Draft release text** on Version → Writers: generate commit/PR text following the repo's own conventions.
6. **Compare two runs** on Runs (`/runs`): select two completed runs → deterministic A/B delta + JSON export.

### 7.2 Evidence of effectiveness

- Discovery audit on `PlantsVsZombiesFCC` (18 gameplay CSVs + `key.csv`) produced the two dead-config findings above with exact evidence (`CustomConfig.fcc:206`, `GameConfig.fcg:242`, `Server_ZombieSpawner.fcg:288` / `:349`) — the precise class of issue the tool is designed to surface as *config intent vs. actual formula vs. observed result + recommended test*.
- Positive safeguards (central combat cadence, stale-handle validation, merge capacity-check-before-spend with refund, spawner empty-garden pause, per-player pacing cleanup) are reported as confirmed protections, not just absence of findings.

### 7.3 Verification status

- **Backend:** `tsc --noEmit` clean; **53/53 vitest** (repository, writer, localization, Q&A, what-if suites).
- **Frontend:** `tsc -b` clean; **24/24 vitest**; `vite build` green.
- **Live:** file-driver durability proven across a server restart (run survived with goal + history intact); health + write/localization endpoints probed.
- **Process gate for every change:** backend typecheck + vitest, frontend typecheck + vitest + build, then one live smoke (health + one endpoint) before commit.

---

## 8. Innovation and Competitive Advantage

1. **Hybrid deterministic + LLM analysis, not LLM-only.** Pure functions catch structural errors with stable codes; the LLM handles semantics (comment-vs-formula, cross-system gameplay impact) — and must cite deterministic evidence.
2. **Craftland-aware, not generic.** Header/type/data CSV parsing, per-table key profiles, FC tuple configs, data-graph consumer mapping, and domain context profiles (plant combat, zombie spawning, boss flow, seed pool, merge, shop) seeded from real discovery.
3. **What-if without mutation.** Hypothetical edits are drafted to exact cells and evaluated read-only — designers can experiment safely.
4. **Localization as a first-class citizen.** QA + glossary-aware translate preview + ask box, with a strict never-write-back guarantee.
5. **Reproducibility by design.** Canonical report schema, run import/export, A/B run compare with source-run traceability, per-project presets and histories.

Compared to plain `git diff` viewers or generic AI PR reviewers, the system reduces the critical gap — from *"which files changed"* to *"is this safe to ship, what breaks, and what should we test next?"* — with every claim traceable to a file and line.

---

## 9. Impact and Practical Application

| Beneficiary | Before | With this tool |
|---|---|---|
| Game designer | Guesses balance impact; waits for playtest to discover breaks | Probes tuning ideas via What-if; gets plain-language risk + test plan before playtest |
| Developer | Manually traces config consumers across CSV + FC files | Receives consumer chains, dead-config flags, and convention-following release drafts |
| QA / Localization | Spreadsheet eyeballing of `key.csv`; missed dupes/empties | One-click integrity audit + scoped translate preview + follow-up questions |
| Team / release | "Looks fine, ship it" | Verdict (`pass` → `fail`), blocking vs. non-blocking findings, unknowns, and exportable audit trail |

Deployment is lightweight: copy `.env.example` to `.env`, set `PERSISTENCE_DRIVER=file` (default), optionally `AI_WORKFLOW_URL` + `AI_WORKFLOW_API_KEY` and `ANALYZED_ROOTS`; deterministic checks work even with AI off.

---

## 10. Limitations and Future Work

**Current limitations:**

- Compiler/toolchain execution is intentionally disabled; user-supplied arbitrary commands are rejected.
- Simulation charts and multi-round AI follow-up context are staged for the next MVP phase.
- MySQL creation in the target environment is pending review (see `docs/database-migration-plan.md`).

**Roadmap:**

1. Formula extractor + call/import graph generated from source on every analysis (dead-config and comment-vs-formula checks fully automated).
2. Monte Carlo simulation adapters (probability, pacing, stat curves, economy) driven by AI `simulation_requests`.
3. FC parser/indexer (imports, graphs, functions, enums, tuples, calls) + config registry mapping CSV resources to data-graph loaders.
4. Expanded lens library and per-project quality gates (verdict → pass/fail policy).

---

## 11. Conclusion

Craftland Quality Analyzer turns risky game changes into reviewable, evidence-backed decisions. By grounding every AI conclusion in deterministic repository facts — and by designing for designers, developers, and QA alike — it catches silent misconfigurations, explains gameplay consequences in plain language, and leaves an auditable trail from verdict back to the exact line that caused it.

The MVP is implemented, tested (77/77 unit tests green), and verified live. The next step is deeper automation: full source-derived dependency graphs and simulation-backed balance predictions.

---

## Appendix A. Configuration

Copy `.env.example` to `.env`:

| Key | Effect |
|---|---|
| `PERSISTENCE_DRIVER` | `file` (default, durable) · `memory` (ephemeral) · `mysql` (shared) |
| `FILE_STORE_DIR` | Where file-driver runs live (`backend/data/`) |
| `AI_WORKFLOW_URL` + `AI_WORKFLOW_API_KEY` | Both required — URL alone leaves AI off with a warning |
| `ANALYZED_ROOTS` | Comma-separated roots allowed for browsing/inspection |
| `DB_*` | Required when `PERSISTENCE_DRIVER=mysql` |

## Appendix B. How to Extend (for maintainers)

- **New review lens** — add a value to `AnalysisLens`, one instruction block in `prompts/review.prompt.ts`, one label in `ANALYSIS_LENSES`.
- **New deterministic check** — pure function over file content in the owning module + findings with stable codes; vitest file next to it.
- **New writer kind** — extend `WriterKind`, add rules in `writer.prompt.ts`, add the template branch in `deterministicWriterText`.
- **New Version-tools tab** — single-ref panel under `components/review/`, wired in `pages/Version.tsx`.

## Appendix C. Screenshots

Place captures in `docs/images/` with these filenames (referenced by earlier versions of this report):

- `overview.png` — project gallery (`/`)
- `review.png` — dual-revision review (`/review`)
- `version.png` — writers / localization / what-if (`/version`)
- `runs.png` — history + A/B compare (`/runs`)
- `run-detail.png` — verdict-first detail (`/runs/:id`)
- `settings.png` — AI defaults, templates, status (`/settings`)
