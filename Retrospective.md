# Retrospective

Accident narratives and original lessons. Historical instructions below describe their time; the current handbook and its local-isolation contract take precedence.

## 2026-10-16 — Selection database isolation failure

During macro collector validation, `FUNDLY_SQLITE=data/dev.db bun run fetch:selection` unexpectedly wrote selection tables in the live local database because the selection CLI default ignored `FUNDLY_SQLITE`. The agent trusted the environment contract without inspecting that CLI's database resolution first. The mistake was reported immediately; no rollback or live database replacement was attempted. The parser now honors the environment with explicit `--sqlite` precedence, with a regression test. The isolated rerun explicitly targeted `data/dev.db`. Before any collector runs beside a live writer, inspect the actual database-path parser, not only repository documentation or another CLI's behavior.

The initial SQLite backup was interrupted while the live writer kept restarting the backup snapshot. The controller supplied `VACUUM INTO` to create the consistent isolated copy instead.

## 2026-10-16 — Token review: browser and query boundaries

The initial token management API relied on session cookies without checking mutation Origins, and inherited reflected credentialed CORS. Require JSON on management POSTs and validate mutation Origins against the same explicit policy used by CORS; authentication alone is not CSRF protection.

A schema-column whitelist prevents SQL injection, not expensive queries. The first read helper permitted arbitrary column sorts and effectively unlimited offsets on NAV history. Large resources now require indexed identity/range constraints and index-compatible sorting, with bounded offsets. Tests verify declared indexes against real SQLite and inspect the NAV range query plan.

## 2026-10-16 — Token API validation

The first token-store implementation assumed `bun:sqlite` accepted a file `mode` option. The worker typecheck rejected it. File creation now uses the filesystem's restrictive creation mode before SQLite opens it. Check installed runtime declarations before borrowing options from another storage API.

The Vite build also removed the tracked `apps/worker/static/.gitkeep` while cleaning its output directory. It was restored after verification; generated build cleanup must not enter the controller's source commits.

## 2026-10-21 — Navigation chrome needs stable ownership

Each route page owned an application shell and sidebar provider, so changing page
types discarded chrome DOM and local navigation state. Moving the shell alone
was insufficient: navigation groups also used pathname-dependent keys. Share the
authenticated route layout and key groups by identity. The first browser regression
passed on desktop but exposed missing mobile focus restoration: the drawer opener
was an ordinary button outside the Sheet context. Use the public SheetTrigger
instead of manually opening the drawer, and exercise mobile close/focus as well as
desktop node identity before accepting a navigation fix.

## Undated entries migrated from CLAUDE.md

- `v0.1.1` 打在 D1 bind-limit 修复之前。不要移动已发布 tag；含导入修复的版本走 `0.1.2`。
- 可变表不能只 `INSERT OR IGNORE`，否则业绩/经理永远停在首次导入。
- 已拆除 Cloudflare Worker 与 D1 `fundly-db`。不要再 `deploy:web` / `import:d1`。
- Railway 灌库不要走 `volume files upload`（4GB 会 session closed，906MB gzip 约 6MB/min）。容器从 Backy/R2 直拉再 gunzip；换库后必须 `railway restart`。
