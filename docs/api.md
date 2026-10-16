# Fundly read API and API tokens

Base URL: `https://fundly.hexly.ai`. Responses are JSON. Market data is read-only; requests never collect or backfill missing data. Encode path identifiers with `encodeURIComponent` (especially manager names and instrument IDs).

## Authentication and scopes

Browser sessions continue to use Google OAuth and the HTTP-only `fundly_session` cookie. Create credentials under **Settings → API Tokens** while signed in. The full secret is returned only once. Treat it as a password; do not place it in URLs, browser storage, logs or Git.

```sh
curl -H "Authorization: Bearer $FUNDLY_TOKEN" https://fundly.hexly.ai/api/read/funds/basic-info
```

A valid session takes precedence over Authorization. Without a session, tokens permit only GET/HEAD, only explicitly mapped routes, and only their granted scopes. Even `*:read` cannot manage tokens, access backups or reach a newly added/unmapped route. Invalid/revoked/expired credentials return 401; insufficient scope, session-only paths and token mutations return 403. Invalid query/input returns 400. Missing collected tables return 503 with `{ "ready": false, "error": "Resource not collected" }`; an existing empty table returns an empty list, not invented data. The public `/api/live` health endpoint needs no credential.

| Scope | Access |
| --- | --- |
| `funds:read` | Fund catalog, NAV, yields, performance/ranking, fees, dividends, risk, portfolio, siblings and trend JSON; existing fund UI APIs |
| `managers:read` | Manager profiles and fund tenure links |
| `market:read` | Macro instruments, quotes, bars, observations, industries/constituents, ETF research, relations and source/batch status |
| `stocks:read` | All independent `selection_*` stock/ETF catalog, snapshots, bars, NAV, holdings, valuation, financial and materialized resources; existing stock/ETF UI APIs |
| `selection:read` | Fund screening derived metrics (`/api/read/funds/select-metrics`) |
| `daily:read` | Daily report metadata and Markdown |
| `stats:read` | Data stats/source, collection log and schema version metadata |
| `*:read` | All mapped read routes above (not session-only routes) |

Scope mapping is centralized in `apps/worker/src/lib/token-auth.ts` and its fixed resource catalog `read-resources.ts`. There is no SQL endpoint or caller-selected table. Resource row types are exported as `ReadRow<Path>` / `ReadResponse<Path>`; fields are nullable string/number values. JSON columns remain JSON-encoded strings, not automatically parsed objects.

## Token management (session only)

All timestamps are Unix milliseconds; nullable timestamps are JSON null. No response includes `token_hash`. Management responses use `Cache-Control: no-store`.

All token-management POST requests (including revoke with an empty body) require `Content-Type: application/json`; missing/other media types return 415. State-changing session requests reject an `Origin` header unless it matches the request's own origin, `AUTH_ORIGIN`, or the comma-separated exact origins in `API_ALLOWED_ORIGINS`. Origin-less CLI requests remain supported. CORS sends credentials only for these trusted origins; it never reflects arbitrary origins. Non-production development additionally permits HTTP/HTTPS loopback origins (`localhost`, `127.0.0.1`, `[::1]`, any port). Production does not enable that development exception. Behind a reverse proxy, configure `AUTH_ORIGIN` as the public application origin; forwarded-host headers do not expand the allowlist. Only add fully trusted applications to `API_ALLOWED_ORIGINS`, since credentialed CORS grants browser access to session APIs.

`ApiToken = { id, name, token_prefix, scopes: string[], status: "active"|"revoked", created_by, created_at, last_used_at, expires_at, revoked_at }`.

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /api/tokens` | Session cookie | `{ items: ApiToken[] }` |
| `POST /api/tokens` | `{ name: string, scopes: string[], expires_in_days?: integer }`; trimmed name 1–100 characters, nonempty known scopes, expiry 1–3650 days | 201: `{ ...ApiToken, token: "fdk_..." }` once |
| `POST /api/tokens/:id/revoke` | Session cookie | `{ ok: true }`; idempotent for existing tokens, 404 if absent |
| `DELETE /api/tokens/:id` | Session cookie | `{ ok: true }`; 409 while active (including expired but not revoked), 404 if absent |

Session-only examples (`FUNDLY_SESSION_COOKIE` contains the browser's `fundly_session=...`; keep it private):

```sh
curl -b "$FUNDLY_SESSION_COOKIE" https://fundly.hexly.ai/api/tokens
curl -b "$FUNDLY_SESSION_COOKIE" -H 'Content-Type: application/json' -d '{"name":"research-bot","scopes":["funds:read"],"expires_in_days":30}' https://fundly.hexly.ai/api/tokens
curl -b "$FUNDLY_SESSION_COOKIE" -H 'Content-Type: application/json' -X POST "https://fundly.hexly.ai/api/tokens/$TOKEN_ID/revoke"
curl -b "$FUNDLY_SESSION_COOKIE" -X DELETE "https://fundly.hexly.ai/api/tokens/$TOKEN_ID"
```

`fdk_` is followed by 32 cryptographically random bytes encoded as base64url. Only SHA-256 hex and the first 12 characters are stored. `last_used_at` updates at most once a minute. There is no token renewal or recovery: revoke and create a replacement. All permitted Google-session users can manage this private application's tokens; `created_by` is attribution, not a separate ownership boundary.

`AUTH_DB_PATH` selects a separate automatically initialized SQLite file. Default: `/data/auth.db` in production/Railway; `data/auth.db` in development. **Do not point it at `fundly.db`.** Daily Studio market snapshots replace only `fundly.db`; they must not overwrite/delete `auth.db`. Market backups/restores do not back up this credential store. Preserve/back up `auth.db` separately with restricted access.

## Uniform resource queries

All fixed `/api/read/...` routes in the catalog below accept the same query contract:

| Parameter | Meaning |
| --- | --- |
| `code` | Exact match on the catalog's **code key** (fund code, qualified symbol, instrument ID, etc.) |
| `codes=a,b,c` | Batch exact matches on that key, 1–500 nonempty values; combined with other filters using AND |
| `<column>=value` | Exact filter on any whitelisted column; e.g. `symbol=600519.SH`, `stock_code=600519`, `manager_id=...`, `asset_type=stock`, `statement_type=income`, `fiscal_year=2025`. Unknown parameters/columns fail with 400 |
| `from`, `to` | Inclusive range on the catalog's **range key**; calendar-valid YYYY-MM-DD for text dates, integer timestamps/years for numeric columns |
| `date_field` | Override range key with a whitelisted column, e.g. `date_field=publish_date`; still uses that column's numeric/text validation |
| `fields=a,b` | Projection; column whitelist shown below. Omit for all columns. Expressions, wildcards and unknown names are rejected |
| `sort` | One whitelisted column; large tables additionally require an index-compatible sort (see below). Small tables default to the first primary-key column; large tables default to a filtered index's leading key or the bounded range date |
| `order` | `asc` (default) or `desc`; small tables append primary-key tie breakers, large tables follow the selected index's remaining keys |
| `limit` | Integer 1–5000; default 100; larger values are rejected rather than silently clamped |
| `offset` | Integer 0–100000; default 0. Larger values return 400; narrow code/date filters instead of deep offsets |

Response: `{ items: Array<Partial<Row>>, limit: number, offset: number, has_more: boolean }`. Fetch the next page with `offset + limit` while `has_more`. No expensive total-count query is performed. Each response uses one read-only SQLite snapshot; separate pages can see a newer daily publication. Use a date range when reproducing research. SQL identifiers come only from the fixed catalog, and all filter/range/pagination values are bound parameters.

### Large-table query safeguards

The following tables require **an indexed identity filter** (`code`/`codes`, `symbol`, or an indexed fund/stock/manager/instrument/index ID) **or both `from` and `to` on the default date column backed by a date-leading index**, spanning at most 366 days. A custom `date_field`, a one-sided date range, a name/asset-type filter, or a small limit alone does not authorize an unbounded read. Tables without a date-leading index require an identity filter. Violations return 400 before reading data, for sessions and tokens alike.

Allowed sort columns must follow an actual index: all preceding index columns must have singleton exact filters, and the index's leading column must be constrained by an identity filter or the bounded date range. Batch identities cannot be treated as singleton prefixes. For example, NAV with one `code` may sort by `nav_date`; batch NAV may sort by `fund_code`, or by `nav_date` when it also supplies a bounded date range. Date-only queries must sort by that date. Sorting NAV by `unit_nav`, even with a code filter, returns 400. The index policy is tested against real SQLite schemas and `EXPLAIN QUERY PLAN` verifies the date-only NAV path avoids full scans and temporary sort trees.

| Large table | Index key sequences available to this API |
| --- | --- |
| `fund_nav`, `fund_money_yield` | `(fund_code, nav_date)`, `(nav_date)` |
| `fund_portfolio` | `(fund_code, report_date, stock_code)`, `(report_date)`, `(stock_code)` |
| `fund_manager_link` | `(fund_code, manager_id, start_date)`, `(fund_code)`, `(manager_id)` |
| `fund_dividend` | `(fund_code, event_date, event_type)`, `(event_date)` |
| `market_daily_bar` | `(instrument_id, trade_date)`, `(trade_date)` |
| `market_series_observation` | `(instrument_id, observation_date)`, `(observation_date)` |
| `market_etf_holding` | `(instrument_id, report_date, stock_code)` |
| `market_index_member` | `(index_id, stock_code)`, `(stock_code)` |
| `selection_daily_bar` | `(asset_type, symbol, adjust, trade_date)`, `(symbol, trade_date)`; requires symbol identity, not asset type alone |
| `selection_etf_nav` | `(symbol, nav_date)`, `(nav_date)` |
| `selection_etf_financials` | `(symbol, end_date, publish_date)` |
| `selection_etf_holding` | `(symbol, report_date, stock_code)` |
| `selection_stock_financial_statement` | `(symbol, statement_type, fiscal_year)` |
| `selection_stock_financial_indicators` | `(symbol, report)` |

Examples:

```sh
# Batch fund basics
curl -H "Authorization: Bearer $FUNDLY_TOKEN" 'https://fundly.hexly.ai/api/read/funds/basic-info?codes=000001,000002&fields=fund_code,fund_name,fund_type'
# NAV range, including the end date
curl -H "Authorization: Bearer $FUNDLY_TOKEN" 'https://fundly.hexly.ai/api/read/funds/nav?code=000001&from=2025-01-01&to=2025-12-31&sort=nav_date&limit=5000'
# Reverse lookup: funds holding a stock (not an exact full-portfolio exposure claim)
curl -H "Authorization: Bearer $FUNDLY_TOKEN" 'https://fundly.hexly.ai/api/read/funds/portfolio?stock_code=600519&from=2026-01-01&to=2026-09-30&sort=report_date&order=desc'
# Manager profile and all managed-fund tenure records
curl -H "Authorization: Bearer $FUNDLY_TOKEN" 'https://fundly.hexly.ai/api/read/managers/profiles?code=MANAGER_ID'
curl -H "Authorization: Bearer $FUNDLY_TOKEN" 'https://fundly.hexly.ai/api/read/managers/funds?manager_id=MANAGER_ID'
# Financial history by statement and year; ETF holdings
curl -H "Authorization: Bearer $FUNDLY_TOKEN" 'https://fundly.hexly.ai/api/read/stocks/stock-financial-statement?symbol=600519.SH&statement_type=income&fiscal_year=2025'
curl -H "Authorization: Bearer $FUNDLY_TOKEN" 'https://fundly.hexly.ai/api/read/stocks/etf-holding?symbol=510300.SH&from=2025-01-01&sort=report_date'
# Qualified macro instrument ID
curl -H "Authorization: Bearer $FUNDLY_TOKEN" 'https://fundly.hexly.ai/api/read/market/series-observation?code=rate:LPR.1Y&sort=observation_date&order=desc'
```

### Fixed resource catalog

Each row below is a separate registered GET endpoint (also supports HEAD), with the common parameters and response above. The table names record the schema audit, not a parameter accepted from callers. All listed columns may be projected or exactly filtered. Sorting large tables is limited by the index policy above. In catalog examples, replace `EXAMPLE_CODE` with the resource's code key. `selection_stock_valuation` and quote snapshots only store the current observation: filtering dates does **not** create historical valuations. `selection_stock_financial_indicators.report` is a source period label; use an exact `report=2025-4` filter, not a fabricated calendar date. Fund ranking history and other trend payloads are available in `fund_trend_extra`; share siblings also have the existing derived route below.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/funds/basic-info` | `fund_basic_info` | `funds:read` | `fund_code` | `updated_at` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/funds/basic-info?limit=100"`

Columns: `fund_code`, `fund_name`, `fund_type`, `pinyin_abbr`, `pinyin_full`, `in_mvp_pool`, `created_at`, `updated_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/funds/performance` | `fund_performance` | `funds:read` | `fund_code` | `data_date` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/funds/performance?limit=100"`

Columns: `fund_code`, `return_1m`, `return_3m`, `return_6m`, `return_1y`, `return_2y`, `return_3y`, `return_5y`, `return_ytd`, `return_since_start`, `rank_pct_1m`, `rank_pct_3m`, `rank_pct_6m`, `rank_pct_1y`, `rank_pct_2y`, `rank_pct_3y`, `rank_pct_5y`, `pass_4433`, `rank_stats_json`, `data_date`, `updated_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/funds/nav` | `fund_nav` | `funds:read` | `fund_code` | `nav_date` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/funds/nav?code=EXAMPLE_CODE&limit=100"`

Columns: `fund_code`, `nav_date`, `unit_nav`, `acc_nav`, `daily_return`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/funds/money-yield` | `fund_money_yield` | `funds:read` | `fund_code` | `nav_date` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/funds/money-yield?code=EXAMPLE_CODE&limit=100"`

Columns: `fund_code`, `nav_date`, `million_income`, `seven_day_yield`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/funds/trend-extra` | `fund_trend_extra` | `funds:read` | `fund_code` | `updated_at` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/funds/trend-extra?limit=100"`

Columns: `fund_code`, `asset_allocation_json`, `scale_history_json`, `holder_structure_json`, `ranking_trend_json`, `performance_5d_json`, `grand_total_json`, `updated_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/stats/fetch-log` | `fetch_log` | `stats:read` | `fund_code` | `created_at` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/stats/fetch-log?limit=100"`

Columns: `id`, `fund_code`, `source`, `endpoint`, `status`, `http_code`, `error_msg`, `duration_ms`, `created_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/stats/schema-version` | `schema_version` | `stats:read` | `version` | `applied_at` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/stats/schema-version?limit=100"`

Columns: `version`, `applied_at`, `description`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/funds/risk-metrics` | `fund_risk_metrics` | `funds:read` | `fund_code` | `data_date` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/funds/risk-metrics?limit=100"`

Columns: `fund_code`, `data_date`, `volatility_1y`, `volatility_3y`, `volatility_5y`, `max_drawdown_1y`, `max_drawdown_3y`, `max_drawdown_5y`, `max_drawdown_all`, `sharpe_1y`, `sharpe_3y`, `sharpe_5y`, `sortino_1y`, `sortino_3y`, `calmar_1y`, `calmar_3y`, `annual_return_1y`, `annual_return_3y`, `annual_return_5y`, `nav_samples_1y`, `nav_samples_3y`, `nav_samples_5y`, `updated_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/funds/dividend` | `fund_dividend` | `funds:read` | `fund_code` | `event_date` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/funds/dividend?code=EXAMPLE_CODE&limit=100"`

Columns: `fund_code`, `event_date`, `event_type`, `dividend_per_share`, `split_ratio`, `remark`, `updated_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/funds/fees` | `fund_fees` | `funds:read` | `fund_code` | `updated_at` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/funds/fees?limit=100"`

Columns: `fund_code`, `mgmt_fee_pct`, `custodian_fee_pct`, `sales_service_fee_pct`, `subscription_fee_max`, `redemption_fee_max`, `min_subscribe_amount`, `raw_json`, `updated_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/managers/profiles` | `fund_manager` | `managers:read` | `manager_id` | `updated_at` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/managers/profiles?limit=100"`

Columns: `manager_id`, `name`, `company`, `updated_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/managers/funds` | `fund_manager_link` | `managers:read` | `fund_code` | `start_date` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/managers/funds?code=EXAMPLE_CODE&limit=100"`

Columns: `fund_code`, `manager_id`, `start_date`, `end_date`, `tenure_days`, `return_during`, `updated_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/funds/portfolio` | `fund_portfolio` | `funds:read` | `fund_code` | `report_date` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/funds/portfolio?code=EXAMPLE_CODE&limit=100"`

Columns: `fund_code`, `report_date`, `stock_code`, `stock_name`, `hold_pct`, `hold_shares`, `hold_value_wan`, `updated_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/funds/select-metrics` | `fund_select_metrics` | `selection:read` | `fund_code` | `updated_at` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/funds/select-metrics?limit=100"`

Columns: `fund_code`, `ulcer_1y`, `underwater_ratio_1y`, `max_underwater_days_1y`, `max_consec_down_1y`, `down_day_ratio_1y`, `worst_month_1y`, `recovery_days_1y`, `recovery_status_1y`, `dca_cagr_3y`, `dca_vs_lump_3y`, `dca_month_win_3y`, `dca_month_vol_3y`, `all_in_fee_pct`, `sales_fee_known`, `share_class`, `share_group_key`, `scale_yi`, `scale_asof`, `equity_ratio_pct`, `alloc_asof`, `inst_holder_pct`, `holder_asof`, `top10_weight_pct`, `port_asof`, `excess_hs300_1y`, `excess_asof`, `select_score`, `score_asof`, `updated_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/market/collection-batch` | `market_collection_batch` | `market:read` | `source_key` | `completed_at` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/market/collection-batch?limit=100"`

Columns: `batch_id`, `source_key`, `collection_mode`, `started_at`, `completed_at`, `expected_items`, `actual_items`, `quote_count`, `bar_count`, `observation_count`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/market/etf-profile` | `market_etf_profile` | `market:read` | `instrument_id` | `collected_at` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/market/etf-profile?limit=100"`

Columns: `instrument_id`, `established_date`, `fund_scale`, `fund_manager`, `management_company`, `source`, `collected_at`, `raw_json`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/market/etf-holding` | `market_etf_holding` | `market:read` | `instrument_id` | `report_date` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/market/etf-holding?code=EXAMPLE_CODE&limit=100"`

Columns: `instrument_id`, `report_date`, `stock_code`, `stock_name`, `asset_type`, `hold_pct`, `hold_shares`, `hold_value_wan`, `published_at`, `source`, `collected_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/market/instrument` | `market_instrument` | `market:read` | `symbol` | `updated_at` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/market/instrument?limit=100"`

Columns: `instrument_id`, `asset_class`, `symbol`, `name`, `exchange`, `currency`, `unit`, `trading_calendar`, `is_active`, `created_at`, `updated_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/market/symbol-alias` | `market_symbol_alias` | `market:read` | `instrument_id` | `updated_at` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/market/symbol-alias?limit=100"`

Columns: `alias_id`, `instrument_id`, `source`, `source_symbol`, `linked_fund_code`, `notes`, `updated_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/market/quote-latest` | `market_quote_latest` | `market:read` | `instrument_id` | `trade_date` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/market/quote-latest?limit=100"`

Columns: `instrument_id`, `source`, `trade_date`, `quote_at`, `is_inferred_date`, `price`, `open`, `high`, `low`, `close`, `prev_close`, `change_pct`, `volume`, `turnover`, `settlement_price`, `prev_settlement`, `source_timestamp`, `collected_at`, `batch_id`, `raw_json`, `open_interest`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/market/daily-bar` | `market_daily_bar` | `market:read` | `instrument_id` | `trade_date` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/market/daily-bar?code=EXAMPLE_CODE&limit=100"`

Columns: `instrument_id`, `trade_date`, `source`, `open`, `high`, `low`, `close`, `volume`, `turnover`, `collected_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/market/series-observation` | `market_series_observation` | `market:read` | `instrument_id` | `observation_date` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/market/series-observation?code=EXAMPLE_CODE&limit=100"`

Columns: `instrument_id`, `observation_date`, `source`, `value`, `unit`, `period_end`, `published_at`, `collected_at`, `change_bp`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/market/index-member` | `market_index_member` | `market:read` | `index_id` | `collected_at` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/market/index-member?code=EXAMPLE_CODE&limit=100"`

Columns: `index_id`, `stock_code`, `stock_name`, `weight`, `rank_order`, `collected_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/market/instrument-relation` | `market_instrument_relation` | `market:read` | `source_id` | `verified_at` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/market/instrument-relation?limit=100"`

Columns: `relation_id`, `source_id`, `target_id`, `relation_type`, `confidence`, `description`, `verified_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/market/breadth` | `market_breadth` | `market:read` | `scope` | `trade_date` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/market/breadth?limit=100"`

Columns: `trade_date`, `scope`, `up_count`, `down_count`, `flat_count`, `total_valid_count`, `total_catalog_count`, `median_change_pct`, `valid_turnover_sum`, `limit_up_count`, `limit_down_count`, `limit_break_count`, `collected_at`, `batch_id`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/market/source-status` | `market_source_status` | `market:read` | `source_key` | `updated_at` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/market/source-status?limit=100"`

Columns: `source_key`, `last_success_at`, `last_trade_date`, `last_status_code`, `last_error_message`, `expected_items`, `actual_items`, `updated_at`, `batch_id`, `collection_mode`, `started_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/stocks/etf-catalog` | `selection_etf_catalog` | `stocks:read` | `symbol` | `updated_at` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/stocks/etf-catalog?limit=100"`

Columns: `symbol`, `ticker`, `name`, `exchange`, `asset_class`, `direction_tag`, `linked_fund_code`, `link_method`, `created_at`, `updated_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/stocks/stock-catalog` | `selection_stock_catalog` | `stocks:read` | `symbol` | `updated_at` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/stocks/stock-catalog?limit=100"`

Columns: `symbol`, `ticker`, `name`, `exchange`, `industry_thscode`, `industry_name`, `is_financial`, `created_at`, `updated_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/stocks/daily-bar` | `selection_daily_bar` | `stocks:read` | `symbol` | `trade_date` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/stocks/daily-bar?code=EXAMPLE_CODE&limit=100"`

Columns: `asset_type`, `symbol`, `adjust`, `trade_date`, `open`, `high`, `low`, `close`, `volume`, `turnover`, `collected_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/stocks/etf-nav` | `selection_etf_nav` | `stocks:read` | `symbol` | `nav_date` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/stocks/etf-nav?code=EXAMPLE_CODE&limit=100"`

Columns: `symbol`, `nav_date`, `unit_nav`, `adj_nav`, `collected_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/stocks/etf-profile` | `selection_etf_profile` | `stocks:read` | `symbol` | `collected_at` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/stocks/etf-profile?limit=100"`

Columns: `symbol`, `estab_date`, `mgmt_name`, `manager_name`, `fund_scale`, `mgmt_fee_pct`, `custody_fee_pct`, `collected_at`, `raw_json`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/stocks/etf-financials` | `selection_etf_financials` | `stocks:read` | `symbol` | `end_date` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/stocks/etf-financials?code=EXAMPLE_CODE&limit=100"`

Columns: `symbol`, `start_date`, `end_date`, `publish_date`, `asset_nav`, `collected_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/stocks/etf-holding` | `selection_etf_holding` | `stocks:read` | `symbol` | `report_date` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/stocks/etf-holding?code=EXAMPLE_CODE&limit=100"`

Columns: `symbol`, `report_date`, `stock_code`, `stock_name`, `asset_type`, `hold_ratio`, `position_capital`, `position_count`, `published_at`, `collected_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/stocks/stock-valuation` | `selection_stock_valuation` | `stocks:read` | `symbol` | `trade_date` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/stocks/stock-valuation?limit=100"`

Columns: `symbol`, `trade_date`, `timestamp`, `pe_ttm`, `pe_mrq`, `pb_mrq`, `ps_ttm`, `pcf_ttm`, `collected_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/stocks/stock-snapshot` | `selection_stock_snapshot` | `stocks:read` | `symbol` | `trade_date` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/stocks/stock-snapshot?limit=100"`

Columns: `symbol`, `trade_date`, `price`, `prev_close`, `change_pct`, `open`, `high`, `low`, `volume`, `turnover`, `is_inferred_date`, `collected_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/stocks/etf-snapshot` | `selection_etf_snapshot` | `stocks:read` | `symbol` | `trade_date` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/stocks/etf-snapshot?limit=100"`

Columns: `symbol`, `trade_date`, `price`, `prev_close`, `change_pct`, `open`, `high`, `low`, `volume`, `turnover`, `is_inferred_date`, `collected_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/stocks/stock-financial-statement` | `selection_stock_financial_statement` | `stocks:read` | `symbol` | `report_date` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/stocks/stock-financial-statement?code=EXAMPLE_CODE&limit=100"`

Columns: `symbol`, `statement_type`, `fiscal_year`, `fiscal_period`, `period_end`, `report_date`, `currency`, `data_json`, `collected_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/stocks/stock-financial-indicators` | `selection_stock_financial_indicators` | `stocks:read` | `symbol` | `collected_at` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/stocks/stock-financial-indicators?code=EXAMPLE_CODE&limit=100"`

Columns: `symbol`, `report`, `abilities_json`, `collected_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/stocks/collection-status` | `selection_collection_status` | `stocks:read` | `scope` | `updated_at` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/stocks/collection-status?limit=100"`

Columns: `scope`, `last_success_at`, `last_attempt_at`, `success`, `catalog_count`, `valid_count`, `error_message`, `details_json`, `updated_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/stocks/etf-materialized` | `selection_etf_materialized` | `stocks:read` | `symbol` | `nav_date` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/stocks/etf-materialized?limit=100"`

Columns: `symbol`, `ticker`, `name`, `exchange`, `asset_class`, `direction_tag`, `linked_fund_code`, `market_trade_date`, `market_price`, `change_pct`, `turnover`, `volume`, `avg_turnover_20d`, `nav_date`, `unit_nav`, `adj_nav`, `premium_discount_pct`, `mgmt_fee_pct`, `custody_fee_pct`, `total_expense_pct`, `scale_yi`, `scale_period`, `scale_disclosure_date`, `scale_source`, `history_asof`, `nav_risk_basis`, `nav_risk_asof`, `return_1y`, `return_3y`, `return_5y`, `cagr_1y`, `cagr_3y`, `cagr_5y`, `max_drawdown_1y`, `max_drawdown_3y`, `max_drawdown_5y`, `volatility_1y`, `volatility_3y`, `volatility_5y`, `points_1y`, `points_3y`, `points_5y`, `sparkline_json`, `sparkline_type`, `has_market_bars`, `has_nav_history`, `has_deep_research`, `updated_at`.

| Endpoint | Schema table | Scope | Code key | Range key |
| --- | --- | --- | --- | --- |
| `GET /api/read/stocks/stock-materialized` | `selection_stock_materialized` | `stocks:read` | `symbol` | `trade_date` |

Example: `curl -H "Authorization: Bearer $FUNDLY_TOKEN" "https://fundly.hexly.ai/api/read/stocks/stock-materialized?limit=100"`

Columns: `symbol`, `ticker`, `name`, `exchange`, `industry_thscode`, `industry_name`, `is_financial`, `trade_date`, `price`, `change_pct`, `turnover`, `volume`, `avg_turnover_20d`, `pe_ttm`, `pe_mrq`, `pb_mrq`, `ps_ttm`, `pcf_ttm`, `valuation_timestamp`, `history_asof`, `return_1y`, `return_3y`, `return_5y`, `cagr_1y`, `cagr_3y`, `cagr_5y`, `max_drawdown_1y`, `max_drawdown_3y`, `max_drawdown_5y`, `volatility_1y`, `volatility_3y`, `volatility_5y`, `return_20d`, `return_60d`, `ma60_bias`, `sparkline_json`, `fiscal_year`, `period_end`, `report_date`, `currency`, `roe_weighted`, `roe_deducted_weighted`, `gross_margin`, `net_margin`, `debt_ratio`, `operating_income`, `revenue_yoy`, `net_profit`, `parent_net_profit`, `profit_yoy`, `revenue_cagr_3y`, `profit_cagr_3y`, `operating_cash_flow`, `cash_profit_ratio`, `capex`, `cash_minus_capex`, `has_deep_research`, `has_price_history`, `has_financials`, `updated_at`.

## Existing research endpoints

These retain their page-oriented DTOs and parameters. For batch/field/range/offset access, prefer the uniform resource endpoints above rather than assuming the UI endpoints accept the same parameters. All paths below are GET (HEAD also works).

| Endpoint | Parameters | Scope | Response shape |
| --- | --- | --- | --- |
| `/api/live` | None | Public | `{ status, version, component, timestamp, uptime, database: { connected } }`; 503 on unavailable database |
| `/api/source` | None | `stats:read` | `{ source: "sqlite", allowed: ["sqlite"], rejected: false }` |
| `/api/stats` | None | `stats:read` | `{ counts, navSpan: { min, max }, lastFetchAt, lastFetchStatus, lastPerfDate, flags: { mvp, pass4433 }, fetchStatus }` |
| `/api/funds` | `q`, `fundType`, `typeL1`, `typeL2`, `mvpOnly`, `hasNav`, `pass4433`, `metricNotNull`, `minSamples`, `includeCaps`, `lens=picks`, `feePeer`, `ddPeer`, `scalePeer`, `top10Max`, `sort`, `dir=asc\|desc`, `page`, `pageSize` | `funds:read` | `{ items, total, page, pageSize, sort, capabilities: { risk, riskDims, select, selectDims } }` |
| `/api/fund-types` | None | `funds:read` | `{ items: [{ fund_type, n }] }` |
| `/api/funds/:code` | Fund code | `funds:read` | `{ fields, extras, navCount, marketInstrument }`; 404 if absent |
| `/api/funds/:code/nav` | `from`, `limit` (existing chart window behavior) | `funds:read` | `{ items: [{ nav_date, unit_nav, acc_nav, daily_return, ... }] }`; use `/api/read/funds/nav` for inclusive `to`/offset/fields |
| `/api/funds/:code/siblings` | Fund code | `funds:read` | `{ items: [...] }` derived share-class siblings |
| `/api/market/overview` | None | `market:read` | `{ ready, tradeDate, sourceStatus, indices, breadth, industries, etfs, macroCards }` |
| `/api/market/bars/:id` | `limit` or `years=1\|3\|5`, `interval=day\|week\|month` (interval requires years) | `market:read` | `{ instrument, bars, range }`; 404 if absent |
| `/api/market/series/:id` | `limit` | `market:read` | `{ instrument, observations }`; 404 if absent |
| `/api/market/industries/:id/constituents` | Industry instrument ID | `market:read` | `{ industry, members }`; 404 if absent |
| `/api/market/etfs/:id` | ETF instrument ID | `market:read` | `{ instrument, ... }` including profile, holdings and research metadata; see `MarketEtfDetail` in `market-service.ts` |
| `/api/selection/etfs` | `q`, `category`, `theme`, `years=1\|3\|5`, `lens`, `maxFee`, `minScale`, `maxDrawdown`, `minTurnover`, `hasBars`, `sort`, `order`, `page`, `pageSize` | `stocks:read` | `{ ready, items, total, page, pageSize, coverage, ... }` |
| `/api/selection/etfs/:symbol` | Qualified symbol | `stocks:read` | `{ ready, found, detail: { catalog, metrics, profile, financials, holdings } }` |
| `/api/selection/etfs/:symbol/bars` | `years=1\|3\|5`, `interval=day\|week\|month` | `stocks:read` | `{ ready, found, adjust: "none", years, interval, coverage, bars }` |
| `/api/selection/stocks` | `q`, `exchange`, `industry`, `isFinancial`, `excludeFinancial`, `excludeSt`, `years=1\|3\|5`, `fiscalYear`, `lens`, `maxPe`, `minRoe`, `minRevenueYoy`, `maxDrawdown`, `minTurnover`, `hasHistory`, `hasFinancials`, `sort`, `order`, `page`, `pageSize` | `stocks:read` | `{ ready, items, total, page, pageSize, coverage, ... }` |
| `/api/selection/stocks/:symbol` | Qualified symbol | `stocks:read` | `{ ready, found, detail: { catalog, metrics, valuation, statements, indicators } }` |
| `/api/selection/stocks/:symbol/bars` | `years=1\|3\|5`, `interval=day\|week\|month` | `stocks:read` | `{ ready, found, adjust: "forward", years, interval, coverage, bars }` |
| `/api/daily` | Optional `code`/`codes` (report dates), `from`, `to`, `date_field`, `sort`, `order`, `limit`, `offset`, `fields`; exact field filters | `daily:read` | Array of `{ date, title, summary, path, weekday?, session?, methodology?, sources? }`; projection returns partial items. With no parameters preserves the existing complete newest-first list. With parameters defaults to 100 rows, date ascending; allowed selectable/sort/filter fields: date, title, summary, path, weekday, session, methodology |
| `/api/daily/:date` | `YYYY-MM-DD` | `daily:read` | `{ date, title, summary, markdown, weekday?, session?, methodology?, sources? }`; 404 if absent |

Examples for existing research DTOs:

```sh
curl https://fundly.hexly.ai/api/live
curl -H "Authorization: Bearer $FUNDLY_TOKEN" https://fundly.hexly.ai/api/source
curl -H "Authorization: Bearer $FUNDLY_TOKEN" https://fundly.hexly.ai/api/stats
curl -H "Authorization: Bearer $FUNDLY_TOKEN" 'https://fundly.hexly.ai/api/funds?pass4433=true&pageSize=50'
curl -H "Authorization: Bearer $FUNDLY_TOKEN" https://fundly.hexly.ai/api/fund-types
curl -H "Authorization: Bearer $FUNDLY_TOKEN" https://fundly.hexly.ai/api/funds/000001
curl -H "Authorization: Bearer $FUNDLY_TOKEN" 'https://fundly.hexly.ai/api/funds/000001/nav?from=2025-01-01&limit=100'
curl -H "Authorization: Bearer $FUNDLY_TOKEN" https://fundly.hexly.ai/api/funds/000001/siblings
curl -H "Authorization: Bearer $FUNDLY_TOKEN" https://fundly.hexly.ai/api/market/overview
curl -H "Authorization: Bearer $FUNDLY_TOKEN" 'https://fundly.hexly.ai/api/market/bars/index:000300.SH?years=1&interval=day'
curl -H "Authorization: Bearer $FUNDLY_TOKEN" 'https://fundly.hexly.ai/api/market/series/rate:LPR.1Y?limit=60'
curl -H "Authorization: Bearer $FUNDLY_TOKEN" https://fundly.hexly.ai/api/market/industries/industry:881121.TI/constituents
curl -H "Authorization: Bearer $FUNDLY_TOKEN" https://fundly.hexly.ai/api/market/etfs/etf:510300.SH
curl -H "Authorization: Bearer $FUNDLY_TOKEN" 'https://fundly.hexly.ai/api/selection/etfs?hasBars=true'
curl -H "Authorization: Bearer $FUNDLY_TOKEN" https://fundly.hexly.ai/api/selection/etfs/510300.SH
curl -H "Authorization: Bearer $FUNDLY_TOKEN" 'https://fundly.hexly.ai/api/selection/etfs/510300.SH/bars?years=1&interval=day'
curl -H "Authorization: Bearer $FUNDLY_TOKEN" 'https://fundly.hexly.ai/api/selection/stocks?hasFinancials=true'
curl -H "Authorization: Bearer $FUNDLY_TOKEN" https://fundly.hexly.ai/api/selection/stocks/600519.SH
curl -H "Authorization: Bearer $FUNDLY_TOKEN" 'https://fundly.hexly.ai/api/selection/stocks/600519.SH/bars?years=1&interval=day'
curl -H "Authorization: Bearer $FUNDLY_TOKEN" 'https://fundly.hexly.ai/api/daily?from=2026-09-01&to=2026-09-30&sort=date&order=desc&limit=20'
curl -H "Authorization: Bearer $FUNDLY_TOKEN" https://fundly.hexly.ai/api/daily/2026-09-09
```

### Session/public authentication and backup routes

`GET /api/me` returns `{ authenticated, authRequired, email, name, avatar }`. `GET /api/auth/google` and `GET /api/auth/callback` perform the OAuth redirect exchange; `POST /api/auth/logout` clears cookies. They are browser authentication routes, not token capabilities. A Bearer-only request cannot use them. Public health remains accessible without authentication.

The following routes remain session-only and are deliberately absent from the token scope map: `GET /api/backy` (configuration and history), `GET /api/backy/job` (job status), `PUT|POST /api/backy/config` (`{ webhookUrl, token? }`), `POST /api/backy/test`, `POST /api/backy` and `POST /api/backy/restore` (`{ id, force? }`). Their response/error and operational behavior are described in [Backy](08-BACKY.md). All token-management routes are listed above. No token can write market data or trigger backup/restore.

### Schema audit boundary

Audited `sqlite3 -readonly data/fundly.db '.schema'` plus `src/db/schema.ts`, `market-schema.ts`, `market-repo.ts` additions, and `selection-schema.ts`/`selection-repo.ts`. Local snapshots can omit stock/ETF tables entirely; read APIs do not migrate or populate the market DB. Integration tests initialize all schemas in a per-run temporary DB and verify that every non-secret application table and column has a registered resource, including empty stock/ETF resources. `app_settings` (Backy credentials), `sqlite_sequence` and token hashes are intentionally not exposed. Daily reports are repository Markdown files, not SQLite tables.
