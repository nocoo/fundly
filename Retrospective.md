# Retrospective

Accident narratives and original lessons. Historical instructions below describe their time; the current handbook and its local-isolation contract take precedence.

## Undated entries migrated from CLAUDE.md

- `v0.1.1` 打在 D1 bind-limit 修复之前。不要移动已发布 tag；含导入修复的版本走 `0.1.2`。
- 可变表不能只 `INSERT OR IGNORE`，否则业绩/经理永远停在首次导入。
- 已拆除 Cloudflare Worker 与 D1 `fundly-db`。不要再 `deploy:web` / `import:d1`。
- Railway 灌库不要走 `volume files upload`（4GB 会 session closed，906MB gzip 约 6MB/min）。容器从 Backy/R2 直拉再 gunzip；换库后必须 `railway restart`。
