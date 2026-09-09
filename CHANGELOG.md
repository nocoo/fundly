## 0.6.3 — 2026-09-10

- feat(web): widen daily limited layout to 78rem and keep full-width mode
- feat(web): peel section methodology notes into circled-i popovers; tighten prose list styling
- feat(web): promote after-only dimension commentary above quote tables
- feat(api): optional daily `methodology` frontmatter on list/detail + DataInfo
- content: rewrite 2026-09-09 / 2026-09-10 dailies as bullet prose + table-first commentary
- docs: align 17-MACRO-DAILY contract with bullets, methodology, and table order

## 0.6.1 — 2026-09-09

- chore: bump basalt to 2.1.2
- Merge pull request #2 from nocoo/co/20260905-fundly-cleanup
- docs: standardize bilingual project README
- chore: remove unused fundsFiltersEqual helper

## 0.6.0 — 2026-09-06

- docs: align deployment notes for 0.6.0
- docs: record selection coverage and final acceptance
- feat(web): deepen research details and preserve drilldown origins
- fix(web): bound selection inputs and preserve explicit filter states
- test(api): cover selection filters and disclosure contracts
- fix(selection): validate collection and preserve research snapshots
- fix(selection): refine stock currency alignment, financial slice tri-state, and filter controls
- feat(web): add interactive sorting, filters, and pick thresholds for ETF and stock lists
- feat(web): implement ETF and stock research screens, details, and navigation
- fix(api): align selection DTOs, negative valuation order, and query sanitization
- feat(api): implement selection readonly endpoints for etfs and stocks
- feat(selection): implement selection schema, repo, calc and cli
- docs: plan ETF and stock research workspaces

## 0.5.0 — 2026-09-06

- fix: synchronize package release versions
- docs: document macro research features
- feat: unify fund research page design
- feat: add macro market dashboard
- feat: expose market research api
- feat: collect macro market data

## 0.4.0 — 2026-09-05

- fix(scripts): match APP_VERSION string constant in sidebar when cutting release
- fix(web): align sidebar logo position and eliminate toggle jitter
- fix(web): remove low-contrast hover link color and use hover underline
- fix(web): resolve codex review issues on table wrap, contrast, dom nesting and unstyled collapsible
- fix(web): refine chart card overflow, safe danger tokens and collapsible trigger
- fix(web): address review findings on table scroll, tooltip clipping and link semantics
- feat(web): migrate pages and base components to basalt controls
- feat(web): migrate app shell, login card and sidebar to basalt

## 0.3.0 — 2026-08-25

- fix: detect share after product tags
- fix: parse share letters after normalize
- fix: add other share class score
- fix: score stored share class only
- fix: parse share letters in js first
- fix: trim share base after suffix
- fix: block currency etf share tails
- fix: shrink share-letter sql under limit
- fix: glob currency share suffixes too
- fix: match share letters case-sensitively
- fix: exclude unknown sales from fee peer
- fix: align share sql and cost fee docs
- fix: prefer select fee and flatten aliases
- fix: join select table for cost sort
- fix: sort costs from fees without select table
- fix: sort unknown fees after known costs
- fix: compute worst month from prior close
- fix: restore money dim from stored filters
- fix: empty sql when sort column missing
- fix: keep first grand total fund series
- feat: switch money yield and keep select q
- fix: project missing select columns as null
- test: cover select filters and siblings
- test: cover hold dca and structure metrics
- feat: show grand total chart and siblings
- fix: compute select from readonly snapshot
- fix: assert v2 and select metric columns
- feat: parse picks filters in select pages
- fix: bind search score after where
- fix: complete select query capabilities
- fix: empty select sql when satellite tables missing
- fix: picks sql dca months and hs300 align
- docs: sync schema scripts and ui for select
- feat: add select pages and restore nav group
- feat: expose select sort keys and picks filters
- feat: add select metrics and migrate v2 restore
- fix: compute risk and long ranks on tr nav
- fix: compare schema version with max row
- docs: align grandtotal wording and i fixture
- docs: exclude etf lof fof from share f
- docs: close search signal and chart axes
- docs: close structure search review holes
- docs: name real-time-fund license
- docs: fix excess bench and search recall
- docs: credit real-time-fund reference
- docs: learn search and structure from jigubao
- docs: include F/G share classes
- docs: close sixth select design review
- docs: close fifth select design review
- docs: close fourth select design review
- docs: fix select design third review
- docs: close remaining select design review
- docs: fix select design after review
- docs: add fund screening system design
- feat: move data stats into settings
- fix: put detail back beside title
- feat: add back button on fund detail
- feat: restore list origin and persist filters
- fix: typecheck process.env as auth env
- fix: accept schema v2 in empty snapshot test
- chore: merge origin/main for 0.2.0 release
- docs(phase2): full coverage report + sync 02-SCHEMA/03-SCRIPTS
- feat(satellites): fees + manager + portfolio fetchers + scripts
- feat(dividend): fund_dividend fetcher via fhsp HTML
- feat(analytics): local risk metrics (vol/mdd/sharpe/sortino/calmar)
- feat(schema): add 6 satellite tables for Phase 2

## 0.2.0 — 2026-08-22

- fix: bump login page version on release
- ci: gate railway deploys on github actions
- fix: require google login on local api
- feat: add google oauth login page
- docs: record railway deploy walkthrough
- docs: record live railway volume seed
- docs: add railway volume deploy
- feat: add railway serve and volume image
- docs: drop cloudflare worker and d1
- refactor: drop d1 from api and ui
- chore: remove d1 import scripts
- docs: note async backup job
- fix: run backup as background job
- fix: align backup action column
- fix: align backup table cell padding
- fix: accept post for backy config save
- fix: keep backup form fields enabled
- docs: document stored backy credentials
- feat: add dedicated backup page
- feat: store backy credentials in sqlite
- docs: mention backy on settings
- feat: add backy panel on settings
- test: cover remaining backy http helpers
- docs: document backup restore commands
- feat: add backup and restore cli
- feat: add sqlite gzip snapshot
- feat: add backy http client
- docs: fix backy wal and rename races
- docs: tighten backy restore safety
- docs: add backy backup design
- docs: record money-pool fetch timings
- feat: chart money-fund yield when nav empty
- feat: persist money-fund yield series
- fix: probe risk caps with exists
- fix: ranking url cleanup and row clicks
- fix: join risk metrics only for risk sorts
- fix: keep scale axis ticks compact
- feat: add fund ranking page
- feat: extend fund list query for ranking
- feat: add bun run dev:all
- fix: align growth dual axes and chart padding
- fix: read manager and fees from satellites
- fix: drop denormalized basic-info columns
- fix: invert rank axis and restack info
- fix: show nav with three decimal places
- feat: show rank triples and taller nav chart
- feat: store rank as place, peers, percent
- refactor: drive detail returns from metrics
- refactor: extract fund metrics calc package
- docs: record rank refresh runtime
- fix: share return math and require acc
- fix: ignore crawled long-window returns
- feat: live-fill empty detail return windows
- feat: add manual peer rank refresh tool
- feat: dual-axis nav vs comparison growth
- feat: color growth bench and ref lines
- feat: add copyable detail field control
- fix: keep chart origin ticks from overlapping
- feat: move basic info above detail grid
- feat: put basic info first in detail
- fix: center chart legends below plots
- feat: add detail legends and holder pie
- feat: backfill since-inception from nav
- fix: wrap detail field values below labels
- fix: left-align detail field metrics
- fix: right-align numbers only in tables
- fix: drop net assets from allocation %
- feat: chart latest allocation snapshots
- feat: widen detail time-series column
- feat: lay out fund detail in 3 cols
- feat: add time-scale and radar charts
- feat: fetch nav by date window
- feat: lead palette with logo orange
- feat: mask empty fund growth charts
- feat: add header github repo link
- feat: show extras on fund detail
- fix: omit pinyin from fund detail
- feat: parse fund extras in detail api
- feat: browse benchmarks in columns
- feat: make fund table rows clickable
- fix: drop emphasized table link color
- fix: stabilize chart prefs snapshot
- feat: adopt pew chart badge colors
- feat: overlay growth reference lines
- feat: filter funds by type levels
- feat: split fund types into badges
- feat: show detail fields in four cols
- feat: prefix plus on up returns
- feat: apply unified number display
- feat: add quote color setting
- feat: add number format helpers
- fix: keep fund search ime-safe
- docs: note four-layer shell tokens
- fix: restore four-layer luminance
- feat: restyle source toggle
- feat: standardize filter controls
- feat: extract recharts chart helpers
- fix: refuse implicit seed snapshot reuse
- fix: reuse existing seed snapshot file
- fix: seed from immutable sqlite snapshot
- fix: pin seed resume to sqlite snapshot
- fix: skip seed files by packed output
- fix: retry and resume d1 seed files
- feat: allow seeding a single d1 table
- fix: keep sql bindings json-safe
- fix: type query params as sql bindings
- fix: flush oversized seed rows immediately
- docs: list script typecheck and local worker
- fix: parse wrangler token from json
- fix: type sqlite bindings without never
- fix: reject fractional pages below one
- fix: pack seed sql under d1 size limit
- docs: document seed migrate and local d1
- fix: surface secondary dashboard nav errors
- fix: read wrangler token via auth command
- fix: clamp fund page and mark sort state
- fix: require access token for live probe
- fix: typecheck import and local api scripts
- feat: seed empty d1 from sql files

## 0.1.2 — 2026-08-19

- docs: document d1 browse and import
- fix: probe live against schema version
- fix: show matching app version in sidebar
- fix: report worker data source as d1
- fix: show dashboard load and error states
- fix: clamp non-finite fund list pages
- fix: return newest nav window for charts
- fix: apply migrations and accept access probe
- fix: read changelog from previous tag
- fix: import nav after date watermark
- fix: upsert mutable fund tables on import
- fix: run local api from worker package
- fix: typecheck worker bindings without d1 types
- fix: keep d1 insert batches under bind limit

## 0.1.1 — 2026-08-19

- D1 binding, incremental sqlite import, local source toggle
- Fund list/detail/data-admin UI and recharts
- CI and tagged release pipeline

# Changelog

## 0.1.0 — 2026-08-19

- Initial crawler MVP and UI shell.
