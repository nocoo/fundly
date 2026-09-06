#!/usr/bin/env bun
/**
 * 选 ETF 与选股全量数据初始化与增量采集 CLI
 * 命令行参数：
 * --scope: 'all' | 'etf' | 'stock' (默认 'all')
 * --etf-limit: 采集有界深采池 ETF 上限 (默认 60)
 * --stock-limit: 采集有界深采池股票上限 (默认 80)
 * --symbols: 指定采集的 codes (逗号分隔，如 '600519.SH,510300.SH')
 * --sqlite: 数据库路径 (默认 data/fundly.db)
 * --skip-deep: 跳过耗时的五年历史与财报深采，仅刷新目录与快照/估值
 */

import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { openDb } from '../src/db/repo.ts';
import {
  materializeAllEtfs,
  materializeAllStocks,
  normalizeSecurityName,
} from '../src/db/selection-materialize.ts';
import {
  initSelectionSchema,
  replaceSelectionDailyBars,
  replaceSelectionEtfFinancials,
  replaceSelectionEtfHoldings,
  replaceSelectionEtfMaterialized,
  replaceSelectionEtfNav,
  replaceSelectionStockMaterialized,
  updateSelectionCollectionStatus,
  upsertSelectionEtfCatalog,
  upsertSelectionEtfProfile,
  upsertSelectionStockCatalog,
  upsertSelectionStockIndicators,
  upsertSelectionStockSnapshots,
  upsertSelectionStockStatements,
  upsertSelectionStockValuations,
} from '../src/db/selection-repo.ts';
import { fuyaoHistoryWindows } from '../src/fetchers/market-fuyao-collection.ts';
import { MarketReader } from '../src/fetchers/market-reader.ts';
import {
  fetchEtfDailyBars,
  fetchEtfFinancials,
  fetchEtfHoldings,
  fetchEtfNavPoints,
  fetchEtfProfile,
  fetchStockForwardBars,
  fetchStockIndicators,
  fetchStockStatements,
  fetchStockValuationsBatch,
} from '../src/fetchers/selection-fuyao.ts';
import { deriveEtfDirectionTag } from '../src/metrics/selection-calc.ts';
import { logger } from '../src/utils/logger.ts';
import { chinaMarketDate, marketNumber, shiftMarketDate } from '../src/utils/market-validation.ts';
import type {
  SelectionDailyBar,
  SelectionEtfCatalogItem,
  SelectionStockCatalogItem,
  SelectionStockSnapshotQuote,
} from '../src/utils/selection-types.ts';

const args = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    scope: { type: 'string', default: 'all' },
    'etf-limit': { type: 'string', default: '60' },
    'stock-limit': { type: 'string', default: '80' },
    symbols: { type: 'string' },
    sqlite: { type: 'string', default: 'data/fundly.db' },
    'skip-deep': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: false,
});

if (args.values.help) {
  console.log(`
用法: bun run scripts/fetch-selection.ts [options]

选项:
  --scope <all|etf|stock>      采集范围 (默认: all)
  --etf-limit <number>         ETF 深采池上限 (默认: 60)
  --stock-limit <number>       股票深采池上限 (默认: 80)
  --symbols <list>             指定补采代码 (逗号分隔，如 600519.SH,510300.SH)
  --sqlite <path>              数据库路径 (默认: data/fundly.db)
  --skip-deep                  跳过耗时深采，仅同步全目录/快照/估值
  -h, --help                   显示帮助
`);
  process.exit(0);
}

const sqlitePath = args.values.sqlite;
if (!existsSync(sqlitePath)) {
  console.error(`Database not found at ${sqlitePath}. Initialize the database first.`);
  process.exit(1);
}

const db = openDb(sqlitePath);
initSelectionSchema(db);

const apiKey = process.env.HITHINK_FINANCE_API_KEY;
if (!apiKey) {
  console.error('HITHINK_FINANCE_API_KEY is not configured in environment.');
  process.exit(1);
}

const reader = new MarketReader({
  mode: 'live',
  apiKey,
  intervalMs: 400,
  timeoutMs: 15000,
});

const scope = args.values.scope;
const etfLimit = Math.max(1, Number(args.values['etf-limit']) || 60);
const stockLimit = Math.max(1, Number(args.values['stock-limit']) || 80);
const specificSymbols = args.values.symbols
  ? new Set(args.values.symbols.split(',').map((s) => s.trim()))
  : null;
const skipDeep = Boolean(args.values['skip-deep']);

async function run(): Promise<void> {
  const startedAt = Date.now();
  logger.info('starting selection collection', { scope, etfLimit, stockLimit, skipDeep });

  // 1. 同步 ETF 目录并关联本地基金
  if (scope === 'all' || scope === 'etf') {
    await syncEtfCatalog();
  }

  // 2. 同步股票目录并标记行业与金融业
  if (scope === 'all' || scope === 'stock') {
    await syncStockCatalog();
  }

  // 3. 全市场股票快照与批量估值
  if (scope === 'all' || scope === 'stock') {
    await syncStockSnapshotsAndValuations();
  }

  // 4. 有界研究池深采 (五年日 K、ETF NAV/财务/持仓、股票财报与能力指标)
  if (!skipDeep) {
    if (scope === 'all' || scope === 'etf') {
      await deepCollectEtfs();
    }
    if (scope === 'all' || scope === 'stock') {
      await deepCollectStocks();
    }
  }

  // 5. 物化筛选宽表
  logger.info('materializing selection tables');
  const etfRows = materializeAllEtfs(db);
  replaceSelectionEtfMaterialized(db, etfRows);

  const stockRows = materializeAllStocks(db);
  replaceSelectionStockMaterialized(db, stockRows);

  logger.info('selection collection completed successfully', {
    durationMs: Date.now() - startedAt,
    etfsMaterialized: etfRows.length,
    stocksMaterialized: stockRows.length,
  });
}

/**
 * 1. 同步 ETF 目录并严格核验关联本地基金
 */
async function syncEtfCatalog(): Promise<void> {
  logger.info('fetching ETF catalog from Fuyao');
  const attemptAt = Date.now();
  try {
    const res = await reader.fuyao('/api/meta/tickers/list', {
      asset_type: 'fund-etf',
      limit: 10000,
    });

    // 预载本地基金基础信息 (同 6 位 code 且去空白大写名称完全一致)
    const localFunds = db
      .query('SELECT fund_code, fund_name, fund_type FROM fund_basic_info')
      .all() as Array<{ fund_code: string; fund_name: string; fund_type: string }>;
    const localMap = new Map<string, { fundName: string; fundType: string }>();
    for (const f of localFunds) {
      localMap.set(f.fund_code, {
        fundName: normalizeSecurityName(f.fund_name),
        fundType: f.fund_type,
      });
    }

    const catalogItems: SelectionEtfCatalogItem[] = [];
    let linkedCount = 0;

    for (const item of res.item) {
      const symbol = typeof item.thscode === 'string' ? item.thscode : '';
      const ticker = typeof item.ticker === 'string' ? item.ticker : symbol.slice(0, 6);
      const name = typeof item.name === 'string' ? item.name : '';
      const exchange = typeof item.exchange === 'string' ? item.exchange : symbol.slice(7);
      if (!symbol || !ticker) continue;

      let linkedFundCode: string | null = null;
      let linkMethod: string | null = null;
      let assetClass = '待核验';

      const local = localMap.get(ticker);
      if (local && local.fundName === normalizeSecurityName(name)) {
        linkedFundCode = ticker;
        linkMethod = 'exact_code_and_clean_name';
        linkedCount++;
        // 根据本地 fund_type 归类资产
        const ft = local.fundType;
        if (ft.includes('股票') || ft.includes('指数型-股票')) {
          assetClass = '境内权益';
        } else if (ft.includes('海外') || ft.includes('QDII')) {
          assetClass = '境外权益';
        } else if (ft.includes('债券') || ft.includes('固收')) {
          assetClass = '固收';
        } else if (ft.includes('货币')) {
          assetClass = '货币';
        } else {
          assetClass = '其他';
        }
      }

      const directionTag = deriveEtfDirectionTag(name, assetClass);

      catalogItems.push({
        symbol,
        ticker,
        name,
        exchange,
        assetClass,
        directionTag,
        linkedFundCode,
        linkMethod,
        createdAt: attemptAt,
        updatedAt: attemptAt,
      });
    }

    upsertSelectionEtfCatalog(db, catalogItems);
    updateSelectionCollectionStatus(db, {
      scope: 'etf_catalog',
      lastSuccessAt: Date.now(),
      lastAttemptAt: attemptAt,
      success: true,
      catalogCount: catalogItems.length,
      validCount: linkedCount,
      errorMessage: null,
      detailsJson: JSON.stringify({ linkedCount }),
      updatedAt: Date.now(),
    });
    logger.info('ETF catalog synced', { total: catalogItems.length, linkedCount });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    updateSelectionCollectionStatus(db, {
      scope: 'etf_catalog',
      lastSuccessAt: null,
      lastAttemptAt: attemptAt,
      success: false,
      catalogCount: 0,
      validCount: 0,
      errorMessage: msg,
      updatedAt: Date.now(),
    });
    throw error;
  }
}

/**
 * 2. 同步股票目录并关联行业与金融业
 */
async function syncStockCatalog(): Promise<void> {
  logger.info('fetching stock catalog and industry constituents');
  const attemptAt = Date.now();
  try {
    const res = await reader.fuyao('/api/meta/tickers/list', {
      asset_type: 'a-share',
      limit: 10000,
    });

    // 查询同花顺行业目录中已核验的银行、证券、保险行业
    // 银行: 881155.TI, 证券: 881157.TI, 保险: 881156.TI
    const financialIndustries = new Set(['881155.TI', '881157.TI', '881156.TI']);
    const industryMap = new Map<string, { thscode: string; name: string; isFinancial: boolean }>();

    // 尝试拉取银行、证券、保险行业成员以识别金融股
    for (const indCode of ['881155.TI', '881157.TI', '881156.TI']) {
      try {
        const mems = await reader.fuyao('/api/a-share-index/constituents/ths-stock-list', {
          thscode: indCode,
        });
        const indName =
          indCode === '881155.TI' ? '银行' : indCode === '881157.TI' ? '证券' : '保险';
        for (const m of mems.item) {
          const sym = typeof m.thscode === 'string' ? m.thscode : '';
          if (sym) {
            industryMap.set(sym, { thscode: indCode, name: indName, isFinancial: true });
          }
        }
      } catch {
        // ignore
      }
    }

    // 补充宏观已采的行业成员 (从 market_index_member 提取已知行业)
    const knownMems = db
      .query(
        `SELECT m.stock_code, m.index_id, i.name
         FROM market_index_member m
         LEFT JOIN market_instrument i ON i.instrument_id = m.index_id
         WHERE m.index_id LIKE 'industry:%'`,
      )
      .all() as Array<{ stock_code: string; index_id: string; name: string | null }>;
    for (const km of knownMems) {
      if (!industryMap.has(km.stock_code)) {
        const indThscode = km.index_id.slice(9);
        industryMap.set(km.stock_code, {
          thscode: indThscode,
          name: km.name ?? '',
          isFinancial: financialIndustries.has(indThscode),
        });
      }
    }

    const catalogItems: SelectionStockCatalogItem[] = [];
    for (const item of res.item) {
      const symbol = typeof item.thscode === 'string' ? item.thscode : '';
      const ticker = typeof item.ticker === 'string' ? item.ticker : symbol.slice(0, 6);
      const name = typeof item.name === 'string' ? item.name : '';
      const exchange = typeof item.exchange === 'string' ? item.exchange : symbol.slice(7);
      if (!symbol || !ticker) continue;

      const ind = industryMap.get(symbol);
      catalogItems.push({
        symbol,
        ticker,
        name,
        exchange,
        industryThscode: ind?.thscode ?? null,
        industryName: ind?.name ?? null,
        isFinancial: ind?.isFinancial ?? false,
        createdAt: attemptAt,
        updatedAt: attemptAt,
      });
    }

    upsertSelectionStockCatalog(db, catalogItems);
    updateSelectionCollectionStatus(db, {
      scope: 'stock_catalog',
      lastSuccessAt: Date.now(),
      lastAttemptAt: attemptAt,
      success: true,
      catalogCount: catalogItems.length,
      validCount: catalogItems.filter((c) => c.industryName !== null).length,
      errorMessage: null,
      updatedAt: Date.now(),
    });
    logger.info('stock catalog synced', { total: catalogItems.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    updateSelectionCollectionStatus(db, {
      scope: 'stock_catalog',
      lastSuccessAt: null,
      lastAttemptAt: attemptAt,
      success: false,
      catalogCount: 0,
      validCount: 0,
      errorMessage: msg,
      updatedAt: Date.now(),
    });
    throw error;
  }
}

/**
 * 3. 全市场股票快照与批量估值 (每批最多 100 只)
 */
async function syncStockSnapshotsAndValuations(): Promise<void> {
  const attemptAt = Date.now();
  logger.info('fetching stock snapshots and valuations');
  try {
    // A. 股票全市场快照 (分页拉取)
    let offset = 0;
    const limit = 1000;
    let total = 0;
    const snapshots: SelectionStockSnapshotQuote[] = [];

    while (true) {
      const res = await reader.fuyao('/api/a-share/prices/snapshot', {
        offset,
        limit,
      });
      for (const item of res.item) {
        const symbol = typeof item.thscode === 'string' ? item.thscode : '';
        if (!symbol) continue;
        const rawDate = typeof item.trade_date === 'string' ? item.trade_date : '';
        const tradeDate = rawDate || chinaMarketDate(res.timestamp ?? Date.now());

        snapshots.push({
          symbol,
          tradeDate,
          price: marketNumber(item.last_price ?? item.price),
          prevClose: marketNumber(item.prev_price ?? item.prev_close),
          changePct: marketNumber(item.price_change_ratio_pct ?? item.change_pct),
          open: marketNumber(item.open_price ?? item.open),
          high: marketNumber(item.high_price ?? item.high),
          low: marketNumber(item.low_price ?? item.low),
          volume: marketNumber(item.volume),
          turnover: marketNumber(item.turnover),
          isInferredDate: !rawDate,
          collectedAt: res.collectedAt,
        });
      }
      total = res.total ?? snapshots.length;
      offset += limit;
      if (offset >= total || res.item.length === 0) break;
    }

    upsertSelectionStockSnapshots(db, snapshots);
    logger.info('stock snapshots updated', { count: snapshots.length });

    // B. 全市场股票批量估值 (分批，每批 100 codes)
    const stockRows = db
      .query('SELECT symbol FROM selection_stock_catalog ORDER BY ticker ASC')
      .all() as Array<{ symbol: string }>;
    const allSymbols = stockRows.map((r) => r.symbol);

    let valCount = 0;
    for (let i = 0; i < allSymbols.length; i += 100) {
      const chunk = allSymbols.slice(i, i + 100);
      try {
        const vals = await fetchStockValuationsBatch(reader, chunk);
        upsertSelectionStockValuations(db, vals);
        valCount += vals.length;
      } catch (err) {
        logger.warn('batch valuation chunk failed', {
          start: i,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    updateSelectionCollectionStatus(db, {
      scope: 'stock_valuation',
      lastSuccessAt: Date.now(),
      lastAttemptAt: attemptAt,
      success: true,
      catalogCount: allSymbols.length,
      validCount: valCount,
      errorMessage: null,
      updatedAt: Date.now(),
    });
    logger.info('stock valuations updated', { total: valCount });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    updateSelectionCollectionStatus(db, {
      scope: 'stock_valuation',
      lastSuccessAt: null,
      lastAttemptAt: attemptAt,
      success: false,
      catalogCount: 0,
      validCount: 0,
      errorMessage: msg,
      updatedAt: Date.now(),
    });
    throw error;
  }
}

/**
 * 4. 有界深采池 ETF (最多 60 只)
 */
async function deepCollectEtfs(): Promise<void> {
  const attemptAt = Date.now();
  logger.info('starting ETF deep research collection', { etfLimit });

  // 选定池：包含 8 只宏观 ETF，510300/510310/159919/513100/511010，其余按规模补齐
  const mandatory = [
    '510300.SH',
    '510310.SH',
    '159919.SZ',
    '513100.SH',
    '511010.SH',
    '510500.SH',
    '588000.SH',
    '159915.SZ',
    '512010.SH',
    '512880.SH',
    '512660.SH',
  ];

  let targetSymbols = mandatory;
  if (specificSymbols) {
    targetSymbols = [...specificSymbols].filter((s) => s.startsWith('51') || s.startsWith('15'));
  } else {
    // 补充规模较大的 ETF 直至达到 etfLimit
    const scaleRows = db
      .query(
        `SELECT symbol FROM selection_etf_catalog
         ORDER BY ticker ASC
         LIMIT ?`,
      )
      .all(etfLimit * 2) as Array<{ symbol: string }>;
    const candidates = new Set([...mandatory, ...scaleRows.map((r) => r.symbol)]);
    targetSymbols = [...candidates].slice(0, etfLimit);
  }

  const todayStr = chinaMarketDate(Date.now());
  const fromStr = shiftMarketDate(todayStr, -1826);
  const windows = fuyaoHistoryWindows(fromStr, todayStr, true);

  let successCount = 0;
  for (const symbol of targetSymbols) {
    logger.info('collecting ETF deep data', { symbol });
    try {
      // A. Profile
      const prof = await fetchEtfProfile(reader, symbol);
      if (prof) upsertSelectionEtfProfile(db, prof);

      // B. 披露规模
      const fins = await fetchEtfFinancials(reader, symbol);
      if (fins.length > 0) replaceSelectionEtfFinancials(db, symbol, fins);

      // C. 披露持仓
      const holds = await fetchEtfHoldings(reader, symbol);
      if (holds.length > 0) replaceSelectionEtfHoldings(db, symbol, holds);

      // D. 五年 NAV
      const navs = await fetchEtfNavPoints(reader, symbol);
      if (navs.length > 0) replaceSelectionEtfNav(db, symbol, navs);

      // E. 五年真实日 K：分窗口请求，每只完整合并后一次性替换；若失败保留旧历史
      const allBars: SelectionDailyBar[] = [];
      let kSuccess = true;
      for (const w of windows) {
        try {
          const wBars = await fetchEtfDailyBars(
            reader,
            symbol,
            Date.parse(`${w.from}T00:00:00+08:00`),
            Date.parse(`${w.to}T00:00:00+08:00`),
          );
          allBars.push(...wBars);
        } catch (kErr) {
          kSuccess = false;
          logger.warn('ETF historical window failed', {
            symbol,
            window: w,
            error: kErr instanceof Error ? kErr.message : String(kErr),
          });
          break;
        }
      }
      if (kSuccess && allBars.length > 0) {
        replaceSelectionDailyBars(db, 'etf', symbol, 'none', allBars);
      }

      successCount++;
    } catch (err) {
      logger.warn('ETF deep collection failed for symbol', {
        symbol,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  updateSelectionCollectionStatus(db, {
    scope: 'etf_deep',
    lastSuccessAt: Date.now(),
    lastAttemptAt: attemptAt,
    success: successCount > 0,
    catalogCount: targetSymbols.length,
    validCount: successCount,
    errorMessage: null,
    updatedAt: Date.now(),
  });
  logger.info('ETF deep collection completed', { successCount, targetCount: targetSymbols.length });
}

/**
 * 5. 有界深采池 股票 (最多 80 只)
 */
async function deepCollectStocks(): Promise<void> {
  const attemptAt = Date.now();
  logger.info('starting stock deep research collection', { stockLimit });

  const mandatory = ['600519.SH', '000001.SZ', '300750.SZ', '688981.SH', '601398.SH'];

  let targetSymbols = mandatory;
  if (specificSymbols) {
    targetSymbols = [...specificSymbols].filter((s) => !s.startsWith('51') && !s.startsWith('15'));
  } else {
    // 从成交额最大的股票中补充
    const activeRows = db
      .query(
        `SELECT symbol FROM selection_stock_snapshot
         ORDER BY turnover DESC
         LIMIT ?`,
      )
      .all(stockLimit * 2) as Array<{ symbol: string }>;
    const candidates = new Set([...mandatory, ...activeRows.map((r) => r.symbol)]);
    targetSymbols = [...candidates].slice(0, stockLimit);
  }

  const todayStr = chinaMarketDate(Date.now());
  const fromStr = shiftMarketDate(todayStr, -1826);
  const startMs = Date.parse(`${fromStr}T00:00:00+08:00`);
  const endMs = Date.parse(`${todayStr}T00:00:00+08:00`);

  let successCount = 0;
  for (const symbol of targetSymbols) {
    logger.info('collecting stock deep data', { symbol });
    try {
      // A. 前复权日 K (单次完整五年窗口，失败保留旧历史)
      try {
        const bars = await fetchStockForwardBars(reader, symbol, startMs, endMs);
        if (bars.length > 0) {
          replaceSelectionDailyBars(db, 'stock', symbol, 'forward', bars);
        }
      } catch (kErr) {
        logger.warn('stock forward bars failed', {
          symbol,
          error: kErr instanceof Error ? kErr.message : String(kErr),
        });
      }

      // B. 财报原始三张表 (annual, limit=5)
      try {
        const income = await fetchStockStatements(reader, symbol, 'income', 5);
        const balance = await fetchStockStatements(reader, symbol, 'balance', 5);
        const cashFlow = await fetchStockStatements(reader, symbol, 'cash_flow', 5);
        upsertSelectionStockStatements(db, [...income, ...balance, ...cashFlow]);

        // C. 能力指标：按最新完整年报 (以 income 最新 fiscal_year 为准) 取指标
        const latestYear = Math.max(...income.map((i) => i.fiscalYear), 0);
        if (latestYear > 0) {
          const report = `${latestYear}-4`;
          const inds = await fetchStockIndicators(reader, symbol, report);
          if (inds) upsertSelectionStockIndicators(db, inds);
        }
      } catch (stmtErr) {
        logger.warn('stock financials failed', {
          symbol,
          error: stmtErr instanceof Error ? stmtErr.message : String(stmtErr),
        });
      }

      successCount++;
    } catch (err) {
      logger.warn('stock deep collection failed for symbol', {
        symbol,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  updateSelectionCollectionStatus(db, {
    scope: 'stock_deep',
    lastSuccessAt: Date.now(),
    lastAttemptAt: attemptAt,
    success: successCount > 0,
    catalogCount: targetSymbols.length,
    validCount: successCount,
    errorMessage: null,
    updatedAt: Date.now(),
  });
  logger.info('stock deep collection completed', {
    successCount,
    targetCount: targetSymbols.length,
  });
}

await run();
