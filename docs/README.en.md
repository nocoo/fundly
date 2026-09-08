<p align="center">
  <img src="../apps/web/public/logo.svg" width="128" height="128" alt="Fundly" />
</p>

<h1 align="center">Fundly</h1>

<p align="center">Collect fund and market data to compare products, risks, and macro conditions in a private web app.</p>

<p align="center">
  <a href="https://fundly.hexly.ai">Website</a> ·
  <a href="../README.md">简体中文</a>
</p>

## What it does

Fundly is a personal research tool for Chinese mutual funds, ETFs, A-shares, and macro markets. Bun scripts collect data and compute metrics, SQLite stores the results, and React pages access them through a Hono API.

Market queries do not trigger upstream collection. Catalogs, price history, financial reports, and metrics have separate coverage; the interface keeps missing values and source information visible. Deploying code does not upload a local database. The project has no trading-order function, and its metrics and screens require your own investment judgment.

## Features

- Search fund codes, names, and share classes, then inspect NAV history, period returns, peer rankings, dividends, fees, manager history, and holdings.
- Compare funds by return, risk, holding experience, recurring investment, cost, and screening conditions, with 4433 screening, Sharpe / Calmar metrics, and multifactor scores.
- Screen ETFs by allocation, liquidity, size and cost, and return and risk; inspect prices, NAV, and premiums or discounts.
- Compare A-shares by valuation, profitability, growth, cash flow, and price trends, with candlesticks, financial statements, and financial metrics.
- Browse indices, industries, market breadth, commodities, exchange rates, and interest rates in a macro dashboard, then open related ETF and fund pages.
- Control access with Google sign-in and an email allowlist, and manage SQLite backups and restoration through Backy pages or scripts.

A general strategy-backtesting engine and Discord notifications are not implemented. Existing recurring-investment pages show metrics calculated from historical NAV data and do not automate trading.

## Usage

The [hosted site](https://fundly.hexly.ai) requires Google sign-in. Access depends on the deployer's email allowlist.

| Page | Path |
| --- | --- |
| Overview and macro dashboard | `/`, `/market` |
| Fund browsing and comparisons | `/funds`, `/select/*` |
| ETF browsing and comparisons | `/etfs`, `/select-etf/*` |
| Stock browsing and comparisons | `/stocks`, `/select-stock/*` |
| Backups and settings | `/backup`, `/settings` |

Fund data mainly comes from Eastmoney / Tiantian Fund. ETFs, stocks, and some macro data use Fuyao Financial-API. Other macro sources include SHFE, Cboe, ECB, ChinaMoney, and FRED. See the [data-source guide](04-DATA_SOURCES.md) and [macro implementation guide](14-MACRO-IMPLEMENTATION.md) for definitions, history windows, and missing-data handling.

### Installation and database

Use Bun 1.3 or newer on macOS / Linux. The root, web, and API packages have separate dependencies and lockfiles.

```bash
git clone https://github.com/nocoo/fundly.git
cd fundly
bun install --frozen-lockfile
bun install --frozen-lockfile --cwd apps/web
bun install --frozen-lockfile --cwd apps/worker
bun run db:init
```

The default database is `data/fundly.db`. Initialization creates tables without historical data. Collect data yourself or restore an existing backup. Common collection and calculation commands:

| Command | Purpose |
| --- | --- |
| `bun run fetch:list` | Refresh the fund catalog |
| `bun run fetch:nav` | Collect historical NAV and performance for the MVP pool, with resume enabled by default |
| `bun run fetch:daily` | Incrementally update NAV and performance |
| `bun run refresh:select` | Refresh the full pool, then compute ranks, risk, and fund-screening metrics |
| `bun run fetch:macro` | Collect macro and cross-asset market data |
| `bun run fetch:selection` | Refresh ETF / stock catalogs, quotes, and bounded detailed data |

Fuyao sources require the server-side `HITHINK_FINANCE_API_KEY`; keep it out of frontend variables. Macro and ETF / stock scripts support `--watch`, which must be started explicitly. The web service does not start collection jobs automatically. See the [script reference](03-SCRIPTS.md) for scope, database paths, and rate limits, and the [ETF](15-ETF-SCREENING.md) and [stock](16-STOCK-SCREENING.md) guides for targeted collection.

## Development

Create a root `.env` from `.env.example` and fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, and `ALLOWED_EMAILS`. An empty email allowlist permits every account that completes Google sign-in.

```bash
cp .env.example .env
bun run dev:all
```

Vite uses port 7044 and the API uses 7045. The repository's normal development address is `https://fundly.dev.hexly.ai`. Configure the local HTTPS proxy described in the [UI architecture guide](06-ARCH-UI.md) and register `https://fundly.dev.hexly.ai/api/auth/callback` with Google OAuth. Local and deployed environments both require sign-in; protected APIs return 503 when authentication is unconfigured. See the [authentication guide](10-AUTH.md).

```bash
bun run typecheck
bun run typecheck:scripts
bun run typecheck:web
bun run lint
bun run build:web
```

The web build writes to `apps/worker/static/`. `bun run start` uses Bun to serve both static pages and the API. Production entry points are defined in [Dockerfile](../Dockerfile) and [railway.toml](../railway.toml), with `FUNDLY_SQLITE` pointing to a database on a persistent volume. Despite the directory name `apps/worker`, the current deployment runs Bun / Hono and no longer depends on Cloudflare Workers or D1.

Market APIs query SQLite through read-only connections. Backup configuration, backup creation, and restoration separately write or replace data; see the [Backy guide](08-BACKY.md).

| Directory | Contents |
| --- | --- |
| `src/fetchers`, `scripts` | Collection code and command entry points |
| `src/db`, `src/metrics` | SQLite access and metric calculations |
| `apps/web` | React pages, viewmodels, and charts |
| `apps/worker` | Hono API, authentication, and Bun server |
| `tests` | Collection and calculation tests |
| `data` | Local database, excluded from commits |

## Tests

| Layer | Command |
| --- | --- |
| Collection, parsing, and metric unit tests | `bun run test` |
| Web viewmodels, authentication, and API tests | `bun run test:web` |
| Macro and product API integration tests | `bun test apps/worker/scripts/market-api.test.ts apps/worker/scripts/selection-api.test.ts` |

Tests use Bun's built-in runner. API integration tests call Hono with temporary SQLite databases. Run `bun run test:coverage` for a report. There is currently no separate browser end-to-end test command.

## Stack

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-14151A?logo=bun&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![React](https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white)

| Area | Implementation |
| --- | --- |
| Collection and storage | TypeScript, Bun fetch, bun:sqlite |
| Web | React, Vite, React Router, Basalt, Tailwind CSS, Recharts, SWR |
| API and authentication | Hono, Google OAuth / PKCE, jose |
| Development and hosting | Bun test, Biome, Docker, Railway Volume |

## Documentation

- [Documentation index](README.md)
- [Architecture](01-ARCHITECTURE.md) and [database schema](02-SCHEMA.md)
- [Fund-screening definitions](12-FUND-SCREENING.md)
- [Deployment and persistent volumes](09-RAILWAY.md)
- [Changelog](../CHANGELOG.md)

Screening methods and data interfaces draw on [GoFundBot](https://github.com/Sebastian6848/GoFundBot) and [AKShare](https://github.com/akfamily/akshare). See the [credits](05-CREDITS.md).

## License

[MIT](../LICENSE) © 2026 Zheng Li
