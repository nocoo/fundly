# Fundly

Personal fund, ETF, stock and macro research using Bun collection, SQLite and a private web reader.
Profile: ts-worker-web (Bun/Hono server on Railway, despite the `apps/worker` directory name).
Direction: [architecture](docs/01-ARCHITECTURE.md), [UI architecture](docs/06-ARCH-UI.md).

## Sources of Truth

This handbook is the contract. Hooks, CI and config enforce it; raise enforcement to meet requirements, never reduce the contract. Frameworks must not rewrite this file.

| Fact | Where |
| --- | --- |
| Human docs | [README.md](README.md), [docs/README.md](docs/README.md) |
| Version | Root `package.json`; synchronize app versions during release |
| Enforcement | `.github/workflows/ci.yml` and three package manifests |
| Environment | Ignored `.env`, tracked `.env.example`; ignored `data/` |
| Accidents | [Retrospective.md](Retrospective.md) |

## Project Invariants

- Use Bun/ESM, `bun:sqlite`, built-in fetch, Bun test and Biome. Preserve this toolchain without adding Node SQLite adapters, Vitest/Jest or duplicate utility dependencies.
- Separate collection (`src/`, `scripts/`, `tests/`) from browser/API changes (`apps/`) in atomic commits. Metric models stay pure and independent of I/O/Views.
- Railway serves the app with a persistent SQLite volume. Market browsing is read-only; backup settings/restore use explicit write paths. Removed Cloudflare Worker/D1 deployments stay removed.
- Keep Google OAuth/PKCE and configured email access rules. `ALLOWED_EMAILS` empty currently allows all authenticated Google accounts; missing required auth configuration rejects protected APIs.
- `HITHINK_FINANCE_API_KEY` is server-only. Do not commit databases, backups, raw credentials or fabricated data-scale claims.
- Use Eastmoney `pingzhongdata.js`, not the category-ranking endpoint for whole-market NAV. Preserve the global 5 QPS limit and bounded deep collection; starts/watch loops remain explicit.
- A code release does not populate the production volume. Preserve source coverage/missing states, mutable upserts and historical data; no trading or invented collection results.

## Stack / Layout

| Component | Choice |
| --- | --- |
| Collection | Bun + TypeScript 7.0.2, `src/fetchers/`, `src/db/`, `src/metrics/` |
| Web | Vite/React/Basalt, `apps/web/`; pure ViewModels |
| API | Hono on Bun, `apps/worker/scripts/app.ts`, read-only market SQLite |
| Data | `data/fundly.db`; production path selected by `FUNDLY_SQLITE` |

Detailed document numbering, collection constraints and historical status are in [collaboration guide](docs/18-COLLABORATION.md). Number new Chinese docs sequentially with uppercase hyphenated names; update the index on splits/merges.

## Commands

Run from root with Bun 1.3+ (CI 1.3.14). Each of the three packages owns a lockfile.

```sh
bun install --frozen-lockfile
bun install --cwd apps/web --frozen-lockfile
bun install --cwd apps/worker --frozen-lockfile
bun run dev:all
bun run typecheck
bun run typecheck:scripts
bun run typecheck:web
bun run lint
bun run build:web
bun run test
bun run test:web
bun run test:coverage
```

Initialize an intended empty local database with `bun run db:init`; do not run collectors or restores merely to test code. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ALLOWED_EMAILS` for normal dev login. `build:web` writes `apps/worker/static/`; `bun run start` serves the built UI and API.

## Verification

6DQ = L1/L2/L3 + G1/G2 + D1. Status: `enforced`, `planned`, `manual`, `N/A`. Required L1: statements/branches/functions/lines each ≥95%, no skipped/focused tests.

| Piece | Requirement and current reality | Status | Evidence |
| --- | --- | --- | --- |
| L1 | ≥95% each across collectors, scripts and app logic | planned | CI runs Bun coverage; no four-metric 95% gate. Historical 2026-09-06 lines/functions were 89.62%/87.13% |
| L2 | Real HTTP for every endpoint/method plus real SQLite | planned | `bun test apps/worker/scripts/market-api.test.ts apps/worker/scripts/selection-api.test.ts` uses Hono in-process requests with temporary SQLite |
| L3 | Browser research/login and process-level collection workflows | planned | No independent system runner |
| G1 | All TypeScript lanes and check-only lint, zero warnings/errors | planned | CI runs types and Biome; `lint` lacks explicit warning-failure option |
| G2 | Required OSV and gitleaks, all three lockfiles | enforced | Shared quality CI lists root, Web and API Bun locks |
| D1 | Per-run temporary data with target guards before fixture writes/cleanup | planned | Temporary SQLite tests exist; full HTTP/CLI/browser isolation is missing |
| Build | Vite output | enforced | CI `build:web` |
| Docs | Chinese numbered docs, measured claims and current commands | manual | Review and [document rules](docs/18-COLLABORATION.md) |

No repository pre-commit/pre-push hook is currently configured. Required target: check-only index-snapshot L1/G1 <30s; stdin pushed-ref L2/G2 in parallel <3min. Never bypass commit or branch-push checks. CI Gate must be green and current with main for the normal PR merge flow.

## Resources / Isolation

| Purpose | Resource | Isolation |
| --- | --- | --- |
| Dev | Caddy `https://fundly.dev.hexly.ai`, Vite 7044 / API 7045 | Intended local `FUNDLY_SQLITE` |
| Unit/in-process API | Test-created SQLite | No production/daily-dev database fixtures |
| Production | Railway volume, normally `/data` | Never use for automated test writes |

Future HTTP/browser/CLI harnesses must own new temporary SQLite and ports, validate their test context before writes/restores, and clean only their own directory. No Cloudflare test resources belong to this runtime.

## Operations / Release

Authorized releases use `bun run release` and [Railway runbook](docs/09-RAILWAY.md). Tags must refer to passing main CI and remain immutable. Backup/restore procedures are in [Backy](docs/08-BACKY.md); after replacing the production database, restart the app. Inspect public `/api/live` for the deployed version; code push alone does not verify database coverage.

## Retrospective

Narratives and migration lessons live in [Retrospective.md](Retrospective.md). Keep recurring project rules short; cross-project lessons go to global rules/nmem and deterministic checks to tests/hooks.

- Mutable source tables require updating existing rows; `INSERT OR IGNORE` alone freezes them.
- Never move published tags or revive removed `deploy:web` / `import:d1` commands.
