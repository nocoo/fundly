# Fundly

Personal fund, ETF, stock, and macro research: Bun collectors (`src/fetchers/`, `src/db/`, `src/metrics/`), SQLite (`data/fundly.db`, prod `FUNDLY_SQLITE`), Vite/React/Basalt reader (`apps/web/`, pure ViewModels), and Hono on Bun API (`apps/worker/scripts/app.ts`; prod CD targets jp4 Docker despite dir name).
Docs: [README](README.md) · [Index](docs/README.md) · [Arch](docs/01-ARCHITECTURE.md) · [UI](docs/06-ARCH-UI.md) · [Auth](docs/10-AUTH.md) · [Collab](docs/18-COLLABORATION.md) · [jp4 Deploy](docs/19-JP4-DEPLOY.md) · [Retrospective](Retrospective.md)

## Commands

Run from root with Bun 1.3+ (CI: Bun `1.4.4`, Node `26.12.1`, TS `7.0.2`). Root, `apps/web`, and `apps/worker` each own a `bun.lock`. Env template: `.env.example` (ignored `.env`, `data/`); dev login requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ALLOWED_EMAILS`.

```sh
bun install --frozen-lockfile
bun install --cwd apps/web --frozen-lockfile
bun install --cwd apps/worker --frozen-lockfile
bun run db:init # empty local DB; never run collectors/restores just to test code
bun run dev:all # https://fundly.dev.hexly.ai -> Vite :7044 + API :7045
bun run typecheck && bun run typecheck:scripts && bun run typecheck:web # S1
bun run lint # S2 Biome check-only
bun run test && bun run test:web # L1 unit & web suites
bun run test:coverage # L1 CI coverage
bun test apps/worker/scripts/market-api.test.ts apps/worker/scripts/selection-api.test.ts apps/worker/scripts/daily-api.test.ts apps/worker/scripts/read-api.test.ts # L2 API
bun run build:web # B1 -> apps/worker/static/
bun run start # serve built UI + API
bun run release # authorized version bump + tag
```

## Invariants

- **Toolchain**: Bun/ESM, `bun:sqlite`, built-in `fetch`, Bun test, Biome only—no Node SQLite adapters, Vitest/Jest, or duplicate utility deps. Frameworks must not rewrite this file.
- **Separation**: Split collection (`src/`, `scripts/`, `tests/`) from web/API (`apps/`) in atomic commits; keep metric models and web ViewModels pure and decoupled from I/O and Views.
- **Runtime**: Production serves from jp4 Docker (`/data/fundly/data` -> `/data`); market browsing is read-only, while backup settings/restore use explicit write paths.
- **Deprecated targets**: Keep `railway.toml` / [09-RAILWAY.md](docs/09-RAILWAY.md) for rollback only—never run `railway up`, re-enable Railway auto-deploy, or revive Worker/D1 (`deploy:web`, `import:d1`).
- **Auth & tokens**: Keep Google OAuth/PKCE, allowlist (`ALLOWED_EMAILS` empty allows all Google accounts), fail-closed missing-auth checks, and separate `AUTH_DB_PATH` ([10-AUTH.md](docs/10-AUTH.md)).
- **Secrets**: `HITHINK_FINANCE_API_KEY` is server-only. Never commit databases, backups, raw credentials, or unmeasured/fabricated data-scale claims.
- **Collection**: Use Eastmoney `pingzhongdata.js` (not category-ranking endpoints) for whole-market NAV; keep 5 QPS limit, bounded deep collection, and explicit-only collector/watch starts.
- **Data integrity**: Upsert mutable source tables (`INSERT OR IGNORE` alone freezes rows). Code releases never populate prod SQLite; keep coverage/missing states—no trading or invented data.
- **Release**: `bun run release` (syncs root/app/runtime versions) + [source-release.yml](.github/workflows/source-release.yml); authorized only, immutable tags on green `main` CI.
- **Production ops**: CD runs via [deploy.yml](.github/workflows/deploy.yml) ([jp4](docs/19-JP4-DEPLOY.md), [Backy](docs/08-BACKY.md)); restart after DB swap and check `/api/live` (code push != DB coverage).
- **Docs**: Number new Chinese docs sequentially (uppercase hyphenated) and update the index on splits/mergers ([18-COLLABORATION.md](docs/18-COLLABORATION.md)).

## Quality & Local Gates

Follows `system1-quality`; CI slot definitions and pinned `base-ci` revision live in [quality-slots.yml](.github/workflows/quality-slots.yml) (via [ci.yml](.github/workflows/ci.yml); `quality / Z1: Gate` required on `main` before release/deploy). Raise enforcement rather than weakening the contract. Statuses: `enforced`, `planned`, `manual`, `N/A`.

- **Enforced in CI**: `S1 Types`, `S2 Lint`, `S3 Workflow`, `G1 Secrets`, `G2 Dependencies` (3 `bun.lock` files), `B1 Build`, `L1 Unit`, `L2 Runtime` (in-process Hono + temp SQLite), `Z1 Gate`.
- **CI gaps**: `S2` lacks `--error-on-warnings` (`planned`); `L1` lacks a 4-metric >=95% gate (`planned`); standalone HTTP/CLI `L3` and browser `L4 E2E` are `planned`.
- **N/A & manual**: `L3 Integration` is `N/A` in CI (covered by `L1`/`L2`); `P1 Package` is `N/A` (private app); docs/claims review is `manual` ([18-COLLABORATION.md](docs/18-COLLABORATION.md)).
- **Local hooks**: None configured (`planned`: staged-index `pre-commit` <30s for `S1/S2/G1/L1`; pushed-ref `pre-push` <3min for `B1/L2/G2`). Never bypass checks; direct `main` pushes rely on CI Gate.

## Resources & Isolation

| Lane | Endpoint / State | Boundary |
| --- | --- | --- |
| Dev | `https://fundly.dev.hexly.ai`, Vite `:7044` / API `:7045` | Local `FUNDLY_SQLITE` (`data/fundly.db`) + `AUTH_DB_PATH` (`data/auth.db`) |
| Tests | Per-run temp SQLite (unit + in-process API suites) | Isolated fixtures only; never touch daily-dev or prod DBs |
| Prod | `https://fundly.hexly.ai`, jp4 `/data/fundly/data` (`127.0.0.1:17040`) | Read-only checks unless authorized; Railway volume for rollback ref only |

Future HTTP/browser/CLI harnesses must allocate per-run temp SQLite and ports, validate test context before writes/restores, and clean only their own temp dir. No Cloudflare test resources belong here.

## Retrospective

Record incident narratives and migration lessons in [Retrospective.md](Retrospective.md); promote recurring project constraints to `Invariants` above and deterministic checks to tests/hooks.
