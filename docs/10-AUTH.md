# 10 · Google 登录

> 浏览层用 Google OAuth + 邮箱白名单。登录页布局仿 Gecko 工卡，颜色走 Fundly 朱红 token。
>
> 相关文档：
> - [06-ARCH-UI.md](./06-ARCH-UI.md) — 本机拓扑
> - [09-RAILWAY.md](./09-RAILWAY.md) — 生产部署

---

## 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 提供方 | Google OAuth 授权码 + PKCE | 私人站点，不引入 NextAuth |
| 会话 | `jose` HS256 cookie `fundly_session`，30 天 | Worker 已有 jose |
| 白名单 | `ALLOWED_EMAILS` 逗号分隔；空 = 放行所有 Google 账号 | 与 Gecko 相同 |
| 登录页 | 仿 Gecko `/login` 工卡 | 家族项目手感一致；`bg-primary` 自动是 #E85D2A |

本机和线上都要登录。缺密钥时受保护的 `/api/*` 返回 503，不裸奔。只有 `AUTH_DISABLED=1` 才关掉登录（单测用）。

---

## 环境变量

| 变量 | 用途 |
|------|------|
| `GOOGLE_CLIENT_ID` | OAuth client id |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret，**不要提交** |
| `SESSION_SECRET` | 签 cookie，随机长串 |
| `ALLOWED_EMAILS` | 例如 `lizheng@lizheng.me` |
| `AUTH_ORIGIN` | 可选，覆盖回调 origin |
| `AUTH_DISABLED=1` | 测试用，关掉登录 |
| `AUTH_DB_PATH` | Independent API-token SQLite; production `/data/auth.db`, local `data/auth.db` |
| `API_ALLOWED_ORIGINS` | Optional comma-separated exact trusted browser origins for credentialed CORS and mutation Origin checks |

本机：仓库根目录 `.env`（已 gitignore）。生产：`railway variable set`。

---

## Google Cloud 回调

OAuth client 必须加上：

- Origin：`https://fundly.hexly.ai`、`https://fundly.dev.hexly.ai`
- Redirect：`https://fundly.hexly.ai/api/auth/callback`、`https://fundly.dev.hexly.ai/api/auth/callback`

可选再加 Railway 默认域 `https://fundly-production-5442.up.railway.app` 及其 `/api/auth/callback`。

---

## 路由

| 路径 | 行为 |
|------|------|
| `GET /login` | 工卡登录页 |
| `GET /api/auth/google` | 302 到 Google |
| `GET /api/auth/callback` | 换 token、写 cookie、回站 |
| `POST /api/auth/logout` | 清 cookie |
| `GET /api/me` | `{ authenticated, authRequired, email, name, avatar }` |
| 其余 `/api/*` | 未登录 401（`/api/live` 除外） |

白名单拒绝 → `/login?error=AccessDenied`。其它 OAuth 失败 → `/login?error=OAuthFailed`。

## Read-only API tokens

Settings → API Tokens manages credentials using the existing Google session. All management POST requests require `application/json` (415 otherwise). State-changing requests reject foreign `Origin` headers (403), allowing only the request origin, `AUTH_ORIGIN` and explicit `API_ALLOWED_ORIGINS`; absent Origin is accepted for CLI clients. Credentialed CORS uses the same policy, with loopback development origins additionally allowed outside production. Configure `AUTH_ORIGIN` when a reverse proxy's internal request origin differs from the public origin. Tokens use `fdk_` plus 32 random base64url bytes; only SHA-256 hex and a 12-character prefix are persisted. The full secret is returned once. Expiry and revocation are enforced on every request; last-use writes are throttled to once a minute.

Without a valid session, `Authorization: Bearer fdk_...` grants only GET/HEAD on explicitly mapped routes and granted read scopes. Unmapped paths, token management and backup/restore remain session-only; wildcard scope does not bypass this boundary. Session behavior is unchanged. See [the API reference](api.md) for scopes, endpoints, examples and errors.

`AUTH_DB_PATH` is automatically initialized independently from `FUNDLY_SQLITE`. Production defaults to `/data/auth.db`, local development to `data/auth.db`. The daily Studio snapshot replaces **only** `fundly.db`; never replace `auth.db` or put tokens in the market database. Market backup/restore does not include the token database: preserve it separately with restricted access.
