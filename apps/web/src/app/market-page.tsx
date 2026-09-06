/** Macro dashboard, with independent source dates and industry / ETF drilldowns. */

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  LayerCard,
} from '@nocoo/basalt';
import { PageHeader } from '@nocoo/basalt/components/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@nocoo/basalt/components/table';
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Globe2,
  Maximize2,
  Minimize2,
  RefreshCw,
} from 'lucide-react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { CandlestickChart } from '@/components/charts/candlestick-chart';
import {
  ChartControls,
  type ChartInterval,
  type ChartYears,
  DataInfo,
  defaultInterval,
  HistoryRange,
  INTERVAL_LABEL,
  type MarketBarsResponse,
} from '@/components/charts/market-chart-controls';
import { MiniTrend } from '@/components/charts/mini-trend';
import './market-page.css';
import { AppShell } from '@/components/layout';
import { useQuoteColor } from '@/hooks/use-quote-color';
import { formatCompact } from '@/lib/format-number';
import { writeListOrigin } from '@/lib/list-origin';
import { quoteChangeClass, quoteToneClass } from '@/lib/quote-color';
import { cn } from '@/lib/utils';

const SNAPSHOT_REFRESH_MS = 60_000;

interface MarketOverviewResponse {
  ready: boolean;
  tradeDate: string;
  sourceStatus: Array<{
    sourceKey: string;
    lastSuccessAt: number | null;
    lastTradeDate: string | null;
    lastStatusCode: number | null;
    lastErrorMessage: string | null;
    collectionMode?: string | null;
    batchId?: string | null;
    startedAt?: number | null;
    expectedItems?: number | null;
    actualItems?: number | null;
  }>;
  indices: Array<{
    id: string;
    symbol: string;
    name: string;
    price: number | null;
    changePct: number | null;
    prevClose: number | null;
    volume: number | null;
    turnover: number | null;
    tradeDate: string | null;
    source: string | null;
    isInferredDate: boolean;
    collectedAt?: number | null;
  }>;
  breadth: {
    tradeDate: string;
    scope: string;
    upCount: number;
    downCount: number;
    flatCount: number;
    totalValidCount: number;
    totalCatalogCount: number;
    medianChangePct: number | null;
    validTurnoverSum: number | null;
    limitUpCount: number | null;
    limitDownCount: number | null;
    limitBreakCount: number | null;
    collectedAt: number;
  } | null;
  industries: Array<{
    id: string;
    symbol: string;
    name: string;
    price: number | null;
    changePct: number | null;
    turnover: number | null;
    tradeDate: string | null;
    source: string | null;
    isInferredDate: boolean;
    collectedAt?: number | null;
    miniBars: Array<{ date: string; open: number; high: number; low: number; close: number }>;
    return20d: number | null;
    return60d: number | null;
    rs20d: number | null;
    rs60d: number | null;
    topConstituents: Array<{
      stockCode: string;
      stockName: string;
      weight: number | null;
      lastPrice: number | null;
      changePct: number | null;
      turnover: number | null;
    }>;
    relatedEtfs: Array<{
      id: string;
      symbol: string;
      name: string;
      price: number | null;
      changePct: number | null;
      linkedFundCode?: string | null;
      relationType: string;
      description?: string | null;
    }>;
  }>;
  etfs: Array<{
    id: string;
    symbol: string;
    name: string;
    price: number | null;
    changePct: number | null;
    turnover: number | null;
    volume: number | null;
    tradeDate: string | null;
    source: string | null;
    isInferredDate: boolean;
    collectedAt?: number | null;
    linkedFundCode?: string | null;
    unitNav?: number | null;
    navDate?: string | null;
    navSource?: string | null;
    premiumDiscountPct?: number | null;
  }>;
  macroCards: Array<{
    id: string;
    symbol: string;
    name: string;
    assetClass: string;
    value: number | null;
    unit: string | null;
    changePct: number | null;
    changeBp?: number | null;
    observationDate: string | null;
    source: string;
    displayType: 'kline' | 'single_value';
    prevClose?: number | null;
    prevSettlement?: number | null;
    settlementPrice?: number | null;
    openInterest?: number | null;
    changeBasis?: string | null;
    comparisonDate?: string | null;
    publishedAt?: string | null;
    frequency?: string | null;
    collectedAt?: number | null;
  }>;
}

export default function MarketPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const pendingParams = useRef(searchParams);
  useLayoutEffect(() => {
    pendingParams.current = searchParams;
  }, [searchParams]);
  const { color: quoteColor } = useQuoteColor();
  const chartPanelRef = useRef<HTMLDivElement>(null);
  const years = (
    [1, 3, 5].includes(Number(searchParams.get('years'))) ? Number(searchParams.get('years')) : 1
  ) as ChartYears;
  const rawInterval = searchParams.get('interval');
  const interval: ChartInterval =
    rawInterval === 'day' || rawInterval === 'week' || rawInterval === 'month'
      ? rawInterval
      : defaultInterval(years);
  const selectedInstrumentId =
    searchParams.get('instrument') || searchParams.get('industry') || 'index:000300.SH';
  const isWallMode = searchParams.get('wall') === '1';
  const [showAllMacro, setShowAllMacro] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showEtfBrowser, setShowEtfBrowser] = useState(false);
  const [etfBrowserIds, setEtfBrowserIds] = useState<string[] | null>(null);

  const updateUrlParams = useCallback(
    (patch: Record<string, string | null>) => {
      // Router transitions may defer rendering: merge rapid period / instrument
      // clicks into the pending URL instead of overwriting the previous click.
      const next = new URLSearchParams(pendingParams.current);
      next.delete('window');
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      pendingParams.current = next;
      setSearchParams(next, { replace: true });
    },
    [setSearchParams],
  );

  const selectInstrument = (id: string) => {
    updateUrlParams({ instrument: id, industry: id.startsWith('industry:') ? id : null });
    if (window.matchMedia('(max-width: 1279px)').matches)
      chartPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const changeYears = (value: ChartYears) =>
    updateUrlParams({ years: String(value), interval: defaultInterval(value) });
  const openEtfs = (ids: string[] | null = null) => {
    setEtfBrowserIds(ids);
    setShowEtfBrowser(true);
  };
  const [klineModalTarget, setKlineModalTarget] = useState<{
    id: string;
    name: string;
    unit?: string;
    volumeUnit?: string | null;
  } | null>(null);
  const [klineModalYears, setKlineModalYears] = useState<ChartYears>(1);
  const [klineModalInterval, setKlineModalInterval] = useState<ChartInterval>('day');
  const [seriesModalTarget, setSeriesModalTarget] = useState<{
    id: string;
    name: string;
    unit?: string;
  } | null>(null);
  const [etfModalTarget, setEtfModalTarget] = useState<{ id: string; name: string } | null>(null);
  const [etfModalYears, setEtfModalYears] = useState<ChartYears>(1);
  const [etfModalInterval, setEtfModalInterval] = useState<ChartInterval>('day');
  const [industryModalTarget, setIndustryModalTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const {
    data: overview,
    error,
    isLoading: overviewLoading,
    mutate,
  } = useSWR<MarketOverviewResponse>('/api/market/overview', fetchAPI, {
    refreshInterval: SNAPSHOT_REFRESH_MS,
  });

  const chartTargets = useMemo(
    () =>
      overview
        ? [
            ...[...overview.indices, ...overview.industries].map((item) => ({
              ...item,
              unit: '点',
              volumeUnit: '股',
              assetClass: item.id.startsWith('industry:') ? 'industry' : 'index',
            })),
            ...overview.etfs.map((item) => ({
              ...item,
              unit: '元',
              volumeUnit: '份',
              assetClass: 'etf',
            })),
            ...overview.macroCards
              .filter((item) => item.displayType === 'kline')
              .map((item) => ({
                ...item,
                price: item.value,
                tradeDate: item.observationDate,
                unit: item.unit || '点',
                volumeUnit: item.id.startsWith('comm:SHFE') ? '手' : null,
                turnover: null,
                isInferredDate: false,
              })),
          ]
        : [],
    [overview],
  );
  const activeTarget =
    chartTargets.find((item) => item.id === selectedInstrumentId) ??
    chartTargets.find((item) => item.id === 'index:000300.SH') ??
    chartTargets[0];
  const activeIndustry = overview?.industries.find((item) => item.id === activeTarget?.id);
  const selectedMacro = overview?.macroCards.find((item) => item.id === activeTarget?.id);
  const activeMacroQuote = overview?.macroCards.find((item) => item.id === klineModalTarget?.id);
  const {
    data: mainBarsData,
    error: mainBarsError,
    isLoading: mainBarsLoading,
    mutate: mutateMainBars,
  } = useSWR<MarketBarsResponse>(
    activeTarget
      ? `/api/market/bars/${encodeURIComponent(activeTarget.id)}?years=${years}&interval=${interval}`
      : null,
    fetchAPI,
    { refreshInterval: SNAPSHOT_REFRESH_MS },
  );
  const {
    data: modalBarsData,
    error: modalBarsError,
    isLoading: modalBarsLoading,
    mutate: mutateModalBars,
  } = useSWR<MarketBarsResponse>(
    klineModalTarget
      ? `/api/market/bars/${encodeURIComponent(klineModalTarget.id)}?years=${klineModalYears}&interval=${klineModalInterval}`
      : null,
    fetchAPI,
  );
  // ETF 详情及独立日K线
  const modalEtfDetailUrl = etfModalTarget
    ? `/api/market/etfs/${encodeURIComponent(etfModalTarget.id)}`
    : null;
  const {
    data: etfDetailData,
    error: etfDetailError,
    isLoading: etfDetailLoading,
    mutate: mutateEtfDetail,
  } = useSWR<{
    instrument: { id: string; symbol: string; name: string; linkedFundCode: string | null } | null;
    quote: {
      price: number | null;
      changePct: number | null;
      turnover: number | null;
      volume: number | null;
      tradeDate: string | null;
      source: string | null;
      unitNav: number | null;
      navDate: string | null;
      navSource: string | null;
      premiumDiscountPct: number | null;
    } | null;
    profile: {
      establishedDate: string | null;
      fundScale: number | null;
      fundScaleUnit: string | null;
      fundManager: string | null;
      managementCompany: string | null;
      trackingIndex: string | null;
      publishedAt: string | null;
      source: string | null;
      collectedAt: number | null;
    } | null;
    holdings: Array<{
      stockCode: string;
      stockName: string;
      assetType: string;
      holdPct: number | null;
      holdShares: number | null;
      reportDate: string | null;
      publishedAt: string | null;
      source: string | null;
    }>;
  }>(modalEtfDetailUrl, fetchAPI);

  const modalEtfBarsUrl = etfModalTarget
    ? `/api/market/bars/${encodeURIComponent(etfModalTarget.id)}?years=${etfModalYears}&interval=${etfModalInterval}`
    : null;
  const {
    data: etfBarsData,
    error: etfBarsError,
    isLoading: etfBarsLoading,
    mutate: mutateEtfBars,
  } = useSWR<MarketBarsResponse>(modalEtfBarsUrl, fetchAPI);

  // 单值时间序列历史记录
  const modalSeriesUrl = seriesModalTarget
    ? `/api/market/series/${encodeURIComponent(seriesModalTarget.id)}?limit=60`
    : null;
  const {
    data: seriesData,
    error: seriesError,
    isLoading: seriesLoading,
    mutate: mutateSeries,
  } = useSWR<{
    instrument: { id: string; name: string; symbol: string; unit: string } | null;
    observations: Array<{
      date: string;
      value: number;
      unit: string | null;
      publishedAt: string | null;
      source: string;
    }>;
  }>(modalSeriesUrl, fetchAPI);

  // 行业全量成分股查询
  const modalIndustryConstituentsUrl = industryModalTarget
    ? `/api/market/industries/${encodeURIComponent(industryModalTarget.id)}/constituents`
    : null;
  const {
    data: industryConstituentsData,
    error: industryConstituentsError,
    isLoading: industryConstituentsLoading,
    mutate: mutateIndustryConstituents,
  } = useSWR<{
    industry: { id: string; name: string; symbol: string } | null;
    members: Array<{
      stockCode: string;
      stockName: string;
      weight: number | null;
      rankOrder: number;
      lastPrice: number | null;
      changePct: number | null;
      turnover: number | null;
    }>;
  }>(modalIndustryConstituentsUrl, fetchAPI);

  const displayMacroCards = useMemo(() => {
    const cards = overview?.macroCards ?? [];
    if (showAllMacro) return cards;
    const priority = new Set([
      'risk:CBOE.VIX',
      'comm:FRED.WTI',
      'comm:FRED.BRENT',
      'fx:USDCNY',
      'fx:USDJPY',
      'global:US.SP500',
      'rate:US.DGS10',
      'rate:US.DGS2',
      'rate:US.10Y2Y',
      'rate:SHIBOR.1W',
      'rate:LPR.1Y',
      'rate:LPR.5Y',
    ]);
    return cards.filter((item) => priority.has(item.id) || item.id.startsWith('comm:SHFE.'));
  }, [overview?.macroCards, showAllMacro]);
  const macroGroups = [
    {
      name: '能源与金属',
      cards: displayMacroCards.filter((item) => item.assetClass === 'commodity'),
    },
    {
      name: '汇率与风险',
      cards: displayMacroCards.filter((item) =>
        ['fx', 'global_index', 'risk'].includes(item.assetClass),
      ),
    },
    { name: '利率与资金', cards: displayMacroCards.filter((item) => item.assetClass === 'rate') },
  ];
  const currentListOrigin = { path: '/market' as const, search: location.search };
  const latestCollection = Math.max(
    0,
    ...(overview?.sourceStatus.map((source) => source.lastSuccessAt ?? 0) ?? []),
  );
  const breadth = overview?.breadth;
  const bars = mainBarsData?.bars ?? [];
  const periodHigh = bars.length ? Math.max(...bars.map((bar) => bar.high)) : null;
  const periodLow = bars.length ? Math.min(...bars.map((bar) => bar.low)) : null;
  const rangeChange = mainBarsData?.range?.changePct ?? null;
  const pct = (value: number | null | undefined, suffix = '%') =>
    value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}${suffix}`;
  const price = (value: number | null | undefined, digits = 2) =>
    value == null
      ? '—'
      : value.toLocaleString('en-US', {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        });

  return (
    <AppShell breadcrumbs={[{ label: '宏观大屏' }]} wallMode={isWallMode}>
      <div className={cn('market-dashboard', isWallMode && 'market-dashboard--wall')}>
        <PageHeader
          title={
            <span className="flex items-center gap-2.5">
              <Globe2 className="h-5 w-5 text-basalt-primary" strokeWidth={1.5} />
              市场全景
            </span>
          }
          description={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span>沪深收盘参考 · {overview?.tradeDate || '—'}</span>
              <span data-collection-time="">
                采集更新{' '}
                {latestCollection
                  ? new Date(latestCollection).toLocaleString('zh-CN', {
                      timeZone: 'Asia/Shanghai',
                      hour12: false,
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
              </span>
            </span>
          }
          actions={
            <div className="flex flex-wrap items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={() => openEtfs()}>
                ETF 研究
                <ArrowUpRight className="ml-1 h-3.5 w-3.5" strokeWidth={1.5} />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowStatusModal(true)}>
                <Activity className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
                数据状态
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateUrlParams({ wall: isWallMode ? null : '1' })}
              >
                {isWallMode ? (
                  <Minimize2 className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
                ) : (
                  <Maximize2 className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
                )}
                {isWallMode ? '退出大屏' : '大屏模式'}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="刷新行情"
                title="每分钟同步已采集数据"
                onClick={() => void Promise.allSettled([mutate(), mutateMainBars()])}
              >
                <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </div>
          }
        />
        {error ? (
          <LayerCard className="flex shrink-0 items-center justify-between gap-3 p-3">
            <p role="alert" className="text-xs text-destructive-text">
              市场数据加载失败{overview?.ready ? '，当前保留上次数据。' : '。'}
            </p>
            <Button variant="outline" size="sm" onClick={() => void mutate()}>
              重试
            </Button>
          </LayerCard>
        ) : overviewLoading ? (
          <LayerCard>
            <LayerCard.Loading label="正在加载宏观数据" />
          </LayerCard>
        ) : overview && !overview.ready ? (
          <LayerCard>
            <LayerCard.Empty
              title="暂无市场数据"
              description="完成首次行情采集后，这里将展示宏观概览。"
            />
          </LayerCard>
        ) : null}
        {overview?.ready ? (
          <>
            <section className="market-indices" aria-label="主要指数">
              {overview.indices.map((item) => (
                <LayerCard
                  key={item.id}
                  padding="none"
                  className={cn(
                    'market-index',
                    item.id === activeTarget?.id && 'ring-1 ring-basalt-primary/70',
                  )}
                  data-market-instrument={item.id}
                >
                  <div className="absolute right-2 top-2 z-10">
                    <DataInfo
                      name={item.name}
                      source={item.source}
                      date={item.tradeDate}
                      collectedAt={item.collectedAt}
                    >
                      <p>
                        {item.symbol} · 成交额{' '}
                        {item.turnover == null ? '未提供' : formatCompact(item.turnover)}
                      </p>
                      {item.isInferredDate ? <p>快照日期由沪深交易日历确定。</p> : null}
                    </DataInfo>
                  </div>
                  <Button
                    variant="ghost"
                    className="market-index-button"
                    aria-label={`查看${item.name}K线`}
                    aria-pressed={item.id === activeTarget?.id}
                    onClick={() => selectInstrument(item.id)}
                  >
                    <span className="pr-6 text-xs font-semibold text-basalt-foreground">
                      {item.name}
                    </span>
                    <span className="market-index-price font-mono tabular-nums text-basalt-foreground">
                      {price(item.price)}
                    </span>
                    <span className="flex w-full items-center justify-between gap-1">
                      <span
                        className={cn(
                          'font-mono text-xs font-semibold tabular-nums',
                          quoteChangeClass(item.changePct, quoteColor),
                        )}
                      >
                        {pct(item.changePct)}
                      </span>
                      <span className="font-mono text-[10px] text-basalt-muted-foreground">
                        {item.symbol}
                      </span>
                    </span>
                  </Button>
                </LayerCard>
              ))}
            </section>
            <div className="market-workspace">
              <aside className="market-left" aria-label="市场广度与行业">
                <LayerCard className="market-breadth" padding="sm">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold">市场广度</h2>
                    <DataInfo
                      name="市场广度"
                      source="fuyao"
                      date={breadth?.tradeDate}
                      collectedAt={breadth?.collectedAt}
                    >
                      <p>
                        沪深 A 股 · 有效样本 {breadth?.totalValidCount ?? '—'} /{' '}
                        {breadth?.totalCatalogCount ?? '—'}，排除缺失与重复行情。
                      </p>
                    </DataInfo>
                  </div>
                  {breadth ? (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <p className="text-[11px] text-basalt-muted-foreground">上涨</p>
                          <p
                            className={cn(
                              'mt-1 font-mono text-xl font-semibold tabular-nums',
                              quoteToneClass('up', quoteColor),
                            )}
                          >
                            {breadth.upCount.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-basalt-muted-foreground">下跌</p>
                          <p
                            className={cn(
                              'mt-1 font-mono text-xl font-semibold tabular-nums',
                              quoteToneClass('down', quoteColor),
                            )}
                          >
                            {breadth.downCount.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-basalt-muted-foreground">平盘</p>
                          <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-basalt-muted-foreground">
                            {breadth.flatCount}
                          </p>
                        </div>
                      </div>
                      <div
                        className="my-3 flex h-1.5 overflow-hidden rounded-full bg-basalt-muted"
                        role="img"
                        aria-label={`上涨 ${breadth.upCount}，下跌 ${breadth.downCount}，平盘 ${breadth.flatCount}`}
                      >
                        {[
                          {
                            count: breadth.upCount,
                            color:
                              quoteColor === 'red-up'
                                ? 'var(--color-destructive-text)'
                                : 'var(--color-success-text)',
                          },
                          {
                            count: breadth.flatCount,
                            color: 'var(--color-basalt-muted-foreground)',
                          },
                          {
                            count: breadth.downCount,
                            color:
                              quoteColor === 'red-up'
                                ? 'var(--color-success-text)'
                                : 'var(--color-destructive-text)',
                          },
                        ].map((part, i) => (
                          <span
                            key={i === 0 ? 'up' : i === 1 ? 'flat' : 'down'}
                            style={{
                              width: `${(part.count / (breadth.totalValidCount || 1)) * 100}%`,
                              backgroundColor: part.color,
                            }}
                          />
                        ))}
                      </div>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-[11px]">
                        <div>
                          <dt className="text-basalt-muted-foreground">成交额</dt>
                          <dd className="mt-1 font-mono text-sm font-semibold">
                            {breadth.validTurnoverSum == null
                              ? '—'
                              : formatCompact(breadth.validTurnoverSum)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-basalt-muted-foreground">涨跌中位数</dt>
                          <dd
                            className={cn(
                              'mt-1 font-mono text-sm font-semibold',
                              quoteChangeClass(breadth.medianChangePct, quoteColor),
                            )}
                          >
                            {pct(breadth.medianChangePct)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-basalt-muted-foreground">涨停 / 跌停</dt>
                          <dd className="mt-1 font-mono text-sm">
                            <span className={quoteToneClass('up', quoteColor)}>
                              {breadth.limitUpCount ?? '—'}
                            </span>
                            <span className="mx-1.5 text-basalt-muted-foreground">/</span>
                            <span className={quoteToneClass('down', quoteColor)}>
                              {breadth.limitDownCount ?? '—'}
                            </span>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-basalt-muted-foreground">炸板</dt>
                          <dd className="mt-1 font-mono text-sm">
                            {breadth.limitBreakCount ?? '—'}
                          </dd>
                        </div>
                      </dl>
                    </>
                  ) : (
                    <LayerCard.Empty title="暂无广度统计" />
                  )}
                </LayerCard>
                <LayerCard className="market-industries" padding="sm">
                  <div className="mb-2 flex shrink-0 items-center justify-between">
                    <h2 className="text-sm font-semibold">行业观察</h2>
                    <DataInfo name="行业观察" source="fuyao" date={overview.tradeDate}>
                      <p>
                        {overview.industries.length} 个代表板块，按当日涨跌排序。行内为最近 24
                        个交易日的收盘价曲线；点选后查看长期 K 线。
                      </p>
                    </DataInfo>
                  </div>
                  <div
                    className="market-industry-list"
                    style={{
                      gridTemplateRows: `repeat(${overview.industries.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {overview.industries.map((item) => (
                      <Button
                        key={item.id}
                        variant="ghost"
                        className={cn(
                          'market-industry-row',
                          item.id === activeTarget?.id &&
                            'bg-basalt-accent ring-1 ring-basalt-border',
                        )}
                        aria-label={`选择${item.name}`}
                        aria-pressed={item.id === activeTarget?.id}
                        data-industry-row={item.id}
                        onClick={() => selectInstrument(item.id)}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-basalt-foreground">
                            {item.name}
                          </span>
                          <span className="mt-1 block font-mono text-[10px] text-basalt-muted-foreground">
                            {item.symbol.split('.')[0]}
                          </span>
                        </span>
                        <MiniTrend values={(item.miniBars ?? []).map((bar) => bar.close)} />
                        <span
                          className={cn(
                            'text-right font-mono text-[13px] font-semibold tabular-nums',
                            quoteChangeClass(item.changePct, quoteColor),
                          )}
                        >
                          {pct(item.changePct)}
                        </span>
                      </Button>
                    ))}
                  </div>
                  <p className="mt-2 shrink-0 text-[10px] text-basalt-muted-foreground">
                    近 24 日收盘走势 · 点选查看长期 K 线
                  </p>
                </LayerCard>
              </aside>
              <LayerCard
                ref={chartPanelRef}
                className="market-main-chart"
                padding="none"
                data-main-chart={activeTarget?.id}
              >
                <div className="market-chart-heading">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-semibold tracking-tight">
                          {activeTarget?.name || '市场走势'}
                        </h2>
                        <DataInfo
                          name={activeTarget?.name || '市场走势'}
                          source={activeTarget?.source}
                          date={activeTarget?.tradeDate}
                          collectedAt={activeTarget?.collectedAt}
                        >
                          <p>
                            {activeTarget?.symbol} · {activeTarget?.unit}
                          </p>
                          {activeTarget?.assetClass === 'etf' ? (
                            <p>场内交易价格，未复权；与基金净值及阶段收益的口径不同。</p>
                          ) : null}
                          <p>
                            历史覆盖 {mainBarsData?.range?.availableFrom || '—'} 至{' '}
                            {mainBarsData?.range?.availableTo || '—'}。
                          </p>
                          <p>周 K、月 K 由真实日线聚合，首尾周期按当前可见交易日计算。</p>
                          {mainBarsData?.range?.isPartial ? (
                            <p>可用历史不足所选范围，仅展示已有行情。</p>
                          ) : null}
                          {activeTarget?.id.startsWith('comm:SHFE') ? (
                            <p>
                              固定交割合约，未拼接其他月份合约。行情涨跌较昨结，K 线涨跌较前收。
                            </p>
                          ) : null}
                        </DataInfo>
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-basalt-muted-foreground">
                        {activeTarget?.symbol} ·{' '}
                        {activeTarget?.assetClass === 'industry'
                          ? '行业指数'
                          : activeTarget?.assetClass === 'index'
                            ? '宽基指数'
                            : activeTarget?.assetClass === 'etf'
                              ? '场内基金'
                              : activeTarget?.assetClass === 'commodity'
                                ? '商品期货'
                                : '风险指标'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ChartControls
                        years={years}
                        interval={interval}
                        onYearsChange={changeYears}
                        onIntervalChange={(value) => updateUrlParams({ interval: value })}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="放大K线"
                        onClick={() => {
                          if (activeTarget) {
                            setKlineModalYears(years);
                            setKlineModalInterval(interval);
                            setKlineModalTarget(activeTarget);
                          }
                        }}
                      >
                        <Maximize2 className="h-4 w-4" strokeWidth={1.5} />
                      </Button>
                    </div>
                  </div>
                  <div className="market-chart-stats">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-mono text-3xl font-semibold tracking-tight tabular-nums">
                        {price(activeTarget?.price, activeTarget?.assetClass === 'etf' ? 3 : 2)}
                      </span>
                      <span
                        className={cn(
                          'font-mono text-sm font-semibold tabular-nums',
                          quoteChangeClass(activeTarget?.changePct, quoteColor),
                        )}
                      >
                        {pct(activeTarget?.changePct)}
                      </span>
                      <span className="text-[10px] text-basalt-muted-foreground">
                        {selectedMacro?.changeBasis === 'previous_settlement' ? '较昨结' : '较前收'}
                      </span>
                    </div>
                    <div className="market-range-stats">
                      <div>
                        <span>区间涨跌</span>
                        <strong className={quoteChangeClass(rangeChange, quoteColor)}>
                          {pct(rangeChange)}
                        </strong>
                      </div>
                      <div>
                        <span>区间最高</span>
                        <strong>
                          {price(periodHigh, activeTarget?.assetClass === 'etf' ? 3 : 2)}
                        </strong>
                      </div>
                      <div>
                        <span>区间最低</span>
                        <strong>
                          {price(periodLow, activeTarget?.assetClass === 'etf' ? 3 : 2)}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="market-chart-canvas">
                  {mainBarsLoading ? (
                    <LayerCard.Loading label="正在加载K线" />
                  ) : mainBarsError ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3">
                      <p role="alert" className="text-sm text-destructive-text">
                        K 线数据加载失败
                      </p>
                      <Button variant="outline" size="sm" onClick={() => void mutateMainBars()}>
                        重试
                      </Button>
                    </div>
                  ) : (
                    <CandlestickChart
                      key={`${activeTarget?.id}-${years}-${interval}`}
                      bars={bars}
                      height="fill"
                      unit={activeTarget?.unit}
                      volumeUnit={activeTarget?.volumeUnit}
                      ariaLabel={`${activeTarget?.name} ${years}年${INTERVAL_LABEL[interval]}走势`}
                    />
                  )}
                </div>
                <div className="market-chart-range">
                  <HistoryRange data={mainBarsData} />
                </div>
                {activeIndustry ? (
                  <div className="market-drilldown">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold">
                        活跃成分
                        <span className="ml-2 text-[10px] font-normal text-basalt-muted-foreground">
                          成交额前 5
                        </span>
                      </span>
                      <div className="flex items-center gap-1.5">
                        {activeIndustry.relatedEtfs.length ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() =>
                              openEtfs(activeIndustry.relatedEtfs.map((item) => item.id))
                            }
                          >
                            相关 ETF · {activeIndustry.relatedEtfs.length}
                            <ArrowUpRight className="ml-1 h-3 w-3" />
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setIndustryModalTarget(activeIndustry)}
                        >
                          全部成分
                          <ArrowUpRight className="ml-1 h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="market-constituents">
                      {activeIndustry.topConstituents.map((stock) => (
                        <a
                          key={stock.stockCode}
                          href={`https://quote.eastmoney.com/${stock.stockCode.endsWith('.SH') ? 'sh' : 'sz'}${stock.stockCode.slice(0, 6)}.html`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 rounded-basalt p-2 transition-colors hover:bg-basalt-accent focus-visible:outline-2 focus-visible:outline-basalt-primary"
                        >
                          <span className="block truncate text-xs font-medium">
                            {stock.stockName}
                          </span>
                          <span className="mt-1.5 flex flex-wrap items-baseline justify-between gap-1">
                            <span className="font-mono text-xs tabular-nums">
                              {price(stock.lastPrice)}
                            </span>
                            <span
                              className={cn(
                                'font-mono text-[11px] tabular-nums',
                                quoteChangeClass(stock.changePct, quoteColor),
                              )}
                            >
                              {pct(stock.changePct)}
                            </span>
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="market-chart-context">
                    <span>
                      {activeTarget?.id.startsWith('comm:SHFE')
                        ? `固定合约 ${activeTarget.symbol} · 价格单位 ${activeTarget.unit}`
                        : activeTarget?.assetClass === 'etf'
                          ? '场内交易价格 · 未复权'
                          : '点选左侧行业，查看板块走势与成分股'}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        if (activeTarget?.assetClass === 'etf') {
                          setEtfModalYears(years);
                          setEtfModalInterval(interval);
                          setEtfModalTarget(activeTarget);
                        } else openEtfs();
                      }}
                    >
                      {activeTarget?.assetClass === 'etf' ? '查看 ETF 资料' : '探索相关产品'}
                      <ArrowUpRight className="ml-1 h-3 w-3" />
                    </Button>
                  </div>
                )}
              </LayerCard>
              <LayerCard className="market-assets" padding="sm">
                <div className="mb-3 flex shrink-0 items-center justify-between">
                  <h2 className="text-sm font-semibold">跨资产环境</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1 text-[11px] text-basalt-muted-foreground"
                    onClick={() => setShowAllMacro((value) => !value)}
                  >
                    {showAllMacro ? '收起' : `全部 ${overview.macroCards.length}`}
                    {showAllMacro ? (
                      <ChevronUp className="ml-0.5 h-3 w-3" />
                    ) : (
                      <ChevronDown className="ml-0.5 h-3 w-3" />
                    )}
                  </Button>
                </div>
                <div
                  className={cn('market-asset-groups', showAllMacro && 'market-asset-groups--all')}
                >
                  {macroGroups
                    .filter((group) => group.cards.length)
                    .map((group) => (
                      <section
                        key={group.name}
                        className="market-asset-group"
                        style={{ flexGrow: Math.ceil(group.cards.length / 2) }}
                        aria-label={group.name}
                      >
                        <h3 className="mb-2 text-[11px] font-medium text-basalt-muted-foreground">
                          {group.name}
                        </h3>
                        <div
                          className="market-asset-grid"
                          style={{
                            gridTemplateRows: `repeat(${Math.ceil(group.cards.length / 2)}, minmax(0, 1fr))`,
                          }}
                        >
                          {group.cards.map((card) => (
                            <LayerCard.Well
                              key={card.id}
                              className={cn(
                                'market-asset-card',
                                card.id === activeTarget?.id && 'ring-1 ring-basalt-primary/70',
                              )}
                              data-market-instrument={card.id}
                            >
                              <div className="absolute right-1 top-1 z-10">
                                <DataInfo
                                  name={card.name}
                                  source={card.source}
                                  date={card.observationDate}
                                  collectedAt={card.collectedAt}
                                >
                                  <p>
                                    {card.symbol} · {card.unit}
                                  </p>
                                  <p>
                                    {card.changeBasis === 'previous_settlement'
                                      ? '涨跌幅较上一交易日结算价。'
                                      : card.changeBasis === 'previous_close'
                                        ? '涨跌幅较上一交易日收盘价。'
                                        : `对比前值日期：${card.comparisonDate || '未提供'}。`}
                                  </p>
                                  <p>
                                    {card.frequency === 'monthly'
                                      ? '月度发布，展示最近公布值。'
                                      : card.displayType === 'single_value'
                                        ? '日度参考值，按各来源的发布时间更新。'
                                        : '点选查看真实开高低收 K 线。'}
                                  </p>
                                </DataInfo>
                              </div>
                              <Button
                                variant="ghost"
                                className="market-asset-button"
                                aria-label={`查看${card.name}${card.displayType === 'kline' ? 'K线' : '历史观测'}`}
                                onClick={() =>
                                  card.displayType === 'kline'
                                    ? selectInstrument(card.id)
                                    : setSeriesModalTarget({
                                        id: card.id,
                                        name: card.name,
                                        unit: card.unit ?? undefined,
                                      })
                                }
                              >
                                <span className="block w-full truncate pr-4 text-[11px] font-medium text-basalt-foreground">
                                  {card.name}
                                </span>
                                <span className="market-asset-value font-mono tabular-nums text-basalt-foreground">
                                  {price(
                                    card.value,
                                    card.assetClass === 'fx' || card.id.startsWith('rate:SHIBOR')
                                      ? 4
                                      : 2,
                                  )}
                                </span>
                                <span className="flex w-full items-center justify-between gap-1">
                                  <span className="truncate text-[10px] text-basalt-muted-foreground">
                                    {card.assetClass === 'fx' ? '参考汇率' : card.unit || '—'}
                                  </span>
                                  <span
                                    className={cn(
                                      'whitespace-nowrap font-mono text-[10px] font-semibold tabular-nums',
                                      quoteChangeClass(card.changeBp ?? card.changePct, quoteColor),
                                    )}
                                  >
                                    {card.changeBp != null
                                      ? pct(card.changeBp, ' bp')
                                      : pct(card.changePct)}
                                  </span>
                                </span>
                              </Button>
                            </LayerCard.Well>
                          ))}
                        </div>
                      </section>
                    ))}
                </div>
              </LayerCard>
            </div>
          </>
        ) : null}
      </div>
      <Dialog open={showEtfBrowser} onOpenChange={setShowEtfBrowser}>
        <DialogContent size="xl" className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{etfBrowserIds ? '行业关联 ETF' : 'ETF 研究'}</DialogTitle>
            <DialogDescription>选择产品，查看场内 K 线、基金资料与披露持仓。</DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>产品</TableHead>
                <TableHead className="text-right">场内价格</TableHead>
                <TableHead className="text-right">涨跌幅</TableHead>
                <TableHead className="text-right">成交额</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview?.etfs
                .filter((item) => !etfBrowserIds || etfBrowserIds.includes(item.id))
                .map((item) => (
                  <TableRow key={item.id} data-etf-product={item.id}>
                    <TableCell>
                      <span className="block text-xs font-medium">{item.name}</span>
                      <span className="mt-1 block font-mono text-[11px] text-basalt-muted-foreground">
                        {item.symbol}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {price(item.price, 3)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono text-xs',
                        quoteChangeClass(item.changePct, quoteColor),
                      )}
                    >
                      {pct(item.changePct)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {item.turnover == null ? '—' : formatCompact(item.turnover)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`研究${item.name}`}
                        onClick={() => {
                          setShowEtfBrowser(false);
                          setEtfModalTarget(item);
                          setEtfModalYears(years);
                          setEtfModalInterval(interval);
                        }}
                      >
                        详情
                        <ArrowUpRight className="ml-1 h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
      {/* 弹窗 0：数据源采集状态弹窗 */}
      <Dialog open={showStatusModal} onOpenChange={setShowStatusModal}>
        <DialogContent size="xl" className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" strokeWidth={1.5} />
              <span>数据源采集与运行状态</span>
            </DialogTitle>
            <DialogDescription>
              页面每分钟同步已采集数据，各来源保留自己的日期。当前展示日频行情与参考值，尚未验证盘中延迟；扶摇快照日期按交易日历推断。
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-96 overflow-y-auto mt-2">
            <Table className="[&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
              <TableHeader>
                <TableRow>
                  <TableHead>数据源</TableHead>
                  <TableHead>模式</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>数据日期</TableHead>
                  <TableHead>最近采集成功</TableHead>
                  <TableHead>异常/说明</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview?.sourceStatus?.map((s) => {
                  const isEvidence = s.collectionMode === 'evidence';
                  return (
                    <TableRow key={s.sourceKey}>
                      <TableCell className="font-semibold text-xs text-basalt-foreground font-mono">
                        {s.sourceKey}
                      </TableCell>
                      <TableCell>
                        {isEvidence ? (
                          <Badge variant="warning" className="text-[11px] px-1 py-0">
                            历史证据导入
                          </Badge>
                        ) : (
                          <Badge variant="success" className="text-[11px] px-1 py-0">
                            联网采集
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <span
                          className={cn(
                            s.lastStatusCode === 200
                              ? 'text-success-text'
                              : s.lastStatusCode === 206
                                ? 'text-warning-text'
                                : 'text-destructive-text',
                          )}
                        >
                          {s.lastStatusCode === 200
                            ? '已更新'
                            : s.lastStatusCode === 206
                              ? '部分披露暂缺'
                              : s.lastStatusCode
                                ? '更新失败 · 保留上次数据'
                                : '尚未采集'}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{s.lastTradeDate || '—'}</TableCell>
                      <TableCell className="font-mono text-[11px] text-basalt-muted-foreground">
                        {s.lastSuccessAt
                          ? new Date(s.lastSuccessAt).toLocaleString('zh-CN', { hour12: false })
                          : '—'}
                      </TableCell>
                      <TableCell
                        className="text-xs text-basalt-muted-foreground max-w-[200px] truncate"
                        title={s.lastErrorMessage || ''}
                      >
                        {s.lastErrorMessage || '正常'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* 弹窗 1：真实 K 线弹窗（与主图一致的年限和聚合周期） */}
      <Dialog
        open={Boolean(klineModalTarget)}
        onOpenChange={(open) => !open && setKlineModalTarget(null)}
      >
        <DialogContent size="xl" className="max-h-[92dvh] overflow-y-auto sm:w-[min(90vw,1280px)]">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center justify-between gap-2 pr-6">
              <span>
                {klineModalTarget?.name} · {INTERVAL_LABEL[klineModalInterval]}走势
              </span>
              <ChartControls
                years={klineModalYears}
                interval={klineModalInterval}
                onYearsChange={(value) => {
                  setKlineModalYears(value);
                  setKlineModalInterval(defaultInterval(value));
                }}
                onIntervalChange={setKlineModalInterval}
              />
            </DialogTitle>
            <DialogDescription>
              展示真实开高低收 (OHLC) 烛台与成交量柱，单位：{klineModalTarget?.unit || '点'}。
            </DialogDescription>
          </DialogHeader>
          {activeMacroQuote ? (
            <LayerCard.Well className="p-2.5 text-xs">
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <span>行情日：{activeMacroQuote.observationDate || '未提供'}</span>
                {activeMacroQuote.prevSettlement != null ? (
                  <span>
                    昨结算：<b className="font-mono">{activeMacroQuote.prevSettlement}</b>{' '}
                    {activeMacroQuote.unit}
                  </span>
                ) : null}
                {activeMacroQuote.settlementPrice != null ? (
                  <span>
                    当日结算：<b className="font-mono">{activeMacroQuote.settlementPrice}</b>{' '}
                    {activeMacroQuote.unit}
                  </span>
                ) : null}
                {activeMacroQuote.openInterest != null ? (
                  <span>
                    持仓量：
                    <b className="font-mono">{formatCompact(activeMacroQuote.openInterest)}</b> 手
                  </span>
                ) : null}
                <span className="text-basalt-muted-foreground">
                  来源：{activeMacroQuote.source}
                </span>
              </div>
            </LayerCard.Well>
          ) : null}
          <div className="py-2">
            {modalBarsLoading ? (
              <p className="text-center py-12 text-xs text-basalt-muted-foreground">
                正在加载日K线数据…
              </p>
            ) : modalBarsError ? (
              <div className="flex flex-col items-center justify-center py-12 gap-1.5 text-xs text-basalt-danger">
                <span>K 线数据加载失败</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => void mutateModalBars()}
                >
                  <RefreshCw className="h-3 w-3 mr-1" strokeWidth={1.5} /> 重试
                </Button>
              </div>
            ) : modalBarsData?.bars && modalBarsData.bars.length > 0 ? (
              <CandlestickChart
                bars={modalBarsData.bars}
                height={480}
                unit={klineModalTarget?.unit}
                volumeUnit={klineModalTarget?.volumeUnit}
                ariaLabel={`${klineModalTarget?.name} ${klineModalYears}年${INTERVAL_LABEL[klineModalInterval]}走势`}
              />
            ) : (
              <p className="text-center py-12 text-xs text-basalt-muted-foreground">
                暂无日K线数据
              </p>
            )}
          </div>
          <HistoryRange data={modalBarsData} />
        </DialogContent>
      </Dialog>

      {/* 弹窗 2：单值序列数值与历史表格弹窗 (汇率/利率/宏观指标，不画伪蜡烛) */}
      <Dialog
        open={Boolean(seriesModalTarget)}
        onOpenChange={(open) => !open && setSeriesModalTarget(null)}
      >
        <DialogContent size="base" className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{seriesModalTarget?.name} · 历史观测数据</DialogTitle>
            <DialogDescription>
              单值观测时间序列历史记录（单位：{seriesModalTarget?.unit || '—'}）
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto mt-2">
            {seriesLoading ? (
              <p className="text-center py-12 text-xs text-basalt-muted-foreground">
                正在加载历史序列…
              </p>
            ) : seriesError ? (
              <div className="flex flex-col items-center justify-center py-12 gap-1.5 text-xs text-basalt-danger">
                <span>历史序列加载失败</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => void mutateSeries()}
                >
                  <RefreshCw className="h-3 w-3 mr-1" strokeWidth={1.5} /> 重试
                </Button>
              </div>
            ) : seriesData?.observations && seriesData.observations.length > 0 ? (
              <Table className="[&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
                <TableHeader>
                  <TableRow>
                    <TableHead>观测日期</TableHead>
                    <TableHead className="text-right">数值</TableHead>
                    <TableHead className="text-right">来源机构</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {seriesData.observations.toReversed().map((obs) => (
                    <TableRow key={obs.date}>
                      <TableCell className="font-mono text-xs">{obs.date}</TableCell>
                      <TableCell className="text-right font-mono font-semibold tabular-nums text-xs">
                        {obs.value.toLocaleString('zh-CN', { maximumFractionDigits: 4 })} {obs.unit}
                      </TableCell>
                      <TableCell className="text-right text-[11px] text-basalt-muted-foreground">
                        {obs.source || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center py-12 text-xs text-basalt-muted-foreground">
                暂无历史观测数据
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 弹窗 3：ETF 行情与披露信息弹窗 (含独立 ETF K线、独立 NAV 日期、披露证券资产) */}
      <Dialog
        open={Boolean(etfModalTarget)}
        onOpenChange={(open) => !open && setEtfModalTarget(null)}
      >
        <DialogContent size="xl" className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center justify-between gap-2 pr-6">
              <span>
                {etfDetailData?.instrument?.name || etfModalTarget?.name || 'ETF'}
                {etfDetailData?.instrument?.symbol ? ` (${etfDetailData.instrument.symbol})` : ''}
              </span>
              {etfDetailData?.instrument?.linkedFundCode ? (
                <Link
                  to={`/funds/${etfDetailData.instrument.linkedFundCode}`}
                  onClick={() => writeListOrigin(currentListOrigin)}
                  className="text-xs text-basalt-primary hover:underline font-medium inline-flex items-center"
                >
                  直达主基金详情{' '}
                  <ArrowLeft className="h-3 w-3 ml-0.5 rotate-180" strokeWidth={1.5} />
                </Link>
              ) : null}
            </DialogTitle>
            <DialogDescription>
              场内最新交易快照、独立日K线与季度披露持仓（不代表完整实时配置）。
            </DialogDescription>
          </DialogHeader>

          {etfDetailLoading ? (
            <p className="text-center py-12 text-xs text-basalt-muted-foreground">
              正在加载 ETF 详情…
            </p>
          ) : etfDetailError ? (
            <div className="flex flex-col items-center justify-center py-12 gap-1.5 text-xs text-basalt-danger">
              <span>ETF 详情加载失败</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => void mutateEtfDetail()}
              >
                <RefreshCw className="h-3 w-3 mr-1" strokeWidth={1.5} /> 重试
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-1">
              {/* 核心指标 4 格 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <LayerCard.Well className="p-2">
                  <span className="text-[11px] text-basalt-muted-foreground">
                    最新价 ({etfDetailData?.quote?.tradeDate || '—'})
                  </span>
                  <p className="font-mono font-bold text-sm text-basalt-foreground mt-0.5">
                    {etfDetailData?.quote?.price ?? '—'}
                  </p>
                </LayerCard.Well>
                <LayerCard.Well className="p-2">
                  <span className="text-[11px] text-basalt-muted-foreground">涨跌幅</span>
                  <p
                    className={cn(
                      'font-mono font-bold text-sm mt-0.5',
                      quoteChangeClass(etfDetailData?.quote?.changePct, quoteColor),
                    )}
                  >
                    {etfDetailData?.quote?.changePct !== null &&
                    etfDetailData?.quote?.changePct !== undefined
                      ? `${etfDetailData.quote.changePct > 0 ? '+' : ''}${etfDetailData.quote.changePct.toFixed(2)}%`
                      : '—'}
                  </p>
                </LayerCard.Well>
                <LayerCard.Well className="p-2">
                  <span className="text-[11px] text-basalt-muted-foreground">单位净值 (NAV)</span>
                  <p className="font-mono font-bold text-sm text-basalt-foreground mt-0.5">
                    {etfDetailData?.quote?.unitNav !== null &&
                    etfDetailData?.quote?.unitNav !== undefined
                      ? etfDetailData.quote.unitNav.toFixed(4)
                      : '—'}
                    {etfDetailData?.quote?.navDate ? (
                      <span className="text-[11px] font-normal text-basalt-muted-foreground ml-1 font-mono">
                        ({etfDetailData.quote.navDate})
                      </span>
                    ) : null}
                  </p>
                </LayerCard.Well>
                <LayerCard.Well className="p-2">
                  <span className="text-[11px] text-basalt-muted-foreground">收盘折溢价</span>
                  <p className="font-mono font-bold text-sm text-basalt-foreground mt-0.5">
                    {etfDetailData?.quote?.premiumDiscountPct !== null &&
                    etfDetailData?.quote?.premiumDiscountPct !== undefined ? (
                      <span
                        className={quoteChangeClass(
                          etfDetailData.quote.premiumDiscountPct,
                          quoteColor,
                        )}
                      >
                        {etfDetailData.quote.premiumDiscountPct > 0
                          ? `+${etfDetailData.quote.premiumDiscountPct.toFixed(2)}%`
                          : `${etfDetailData.quote.premiumDiscountPct.toFixed(2)}%`}
                      </span>
                    ) : (
                      <span className="text-basalt-muted-foreground text-xs font-normal">
                        待同日核验
                      </span>
                    )}
                  </p>
                </LayerCard.Well>
              </div>

              {etfDetailData?.profile ? (
                <LayerCard.Well className="p-3 text-xs">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                    <div>
                      <dt className="text-basalt-muted-foreground">成立日期</dt>
                      <dd className="mt-1 font-mono">
                        {etfDetailData.profile.establishedDate || '未提供'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-basalt-muted-foreground">基金规模</dt>
                      <dd className="mt-1 font-mono">
                        {etfDetailData.profile.fundScale !== null
                          ? `${formatCompact(etfDetailData.profile.fundScale)}${etfDetailData.profile.fundScaleUnit || '元'}`
                          : '未提供'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-basalt-muted-foreground">基金经理</dt>
                      <dd className="mt-1">{etfDetailData.profile.fundManager || '未提供'}</dd>
                    </div>
                    <div>
                      <dt className="text-basalt-muted-foreground">基金管理人</dt>
                      <dd className="mt-1">
                        {etfDetailData.profile.managementCompany || '未提供'}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-basalt-muted-foreground">
                    资料说明
                    <DataInfo
                      name="ETF 基金资料"
                      source={etfDetailData.profile.source}
                      date={etfDetailData.profile.publishedAt}
                      collectedAt={etfDetailData.profile.collectedAt}
                    >
                      <p>日期为资料公告日，未提供时保留空值。</p>
                    </DataInfo>
                  </div>
                </LayerCard.Well>
              ) : null}

              {/* ETF 独立日 K 线走势 */}
              <div className="rounded-lg border border-basalt-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
                  <span className="font-semibold text-basalt-foreground">
                    场内 {INTERVAL_LABEL[etfModalInterval]}走势
                  </span>
                  <ChartControls
                    years={etfModalYears}
                    interval={etfModalInterval}
                    onYearsChange={(value) => {
                      setEtfModalYears(value);
                      setEtfModalInterval(defaultInterval(value));
                    }}
                    onIntervalChange={setEtfModalInterval}
                  />
                </div>
                {etfBarsLoading ? (
                  <p className="text-center py-8 text-xs text-basalt-muted-foreground">
                    正在加载 ETF 日K线…
                  </p>
                ) : etfBarsError ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-1 text-xs text-basalt-danger">
                    <span>ETF 日K线加载失败</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 text-xs"
                      onClick={() => void mutateEtfBars()}
                    >
                      重试
                    </Button>
                  </div>
                ) : etfBarsData?.bars && etfBarsData.bars.length > 0 ? (
                  <CandlestickChart
                    bars={etfBarsData.bars}
                    height={340}
                    unit="元"
                    volumeUnit="份"
                    ariaLabel={`${etfModalTarget?.name} ${etfModalYears}年${INTERVAL_LABEL[etfModalInterval]}走势`}
                  />
                ) : (
                  <p className="text-center py-8 text-xs text-basalt-muted-foreground">
                    暂无日K线数据
                  </p>
                )}
                <HistoryRange data={etfBarsData} />
              </div>

              {/* 披露持仓资产清单（诚实空态说明，如黄金ETF无个股披露，国债ETF仅5条债券等） */}
              <div>
                <div className="flex items-center justify-between mb-1 text-xs">
                  <span className="font-semibold text-basalt-foreground">
                    披露重仓证券/资产清单
                  </span>
                  <span className="text-[11px] text-basalt-muted-foreground font-mono">
                    报告期：{etfDetailData?.holdings[0]?.reportDate || '未提供'}
                    {etfDetailData?.holdings[0]?.publishedAt
                      ? ` (公告: ${etfDetailData.holdings[0].publishedAt})`
                      : ''}
                  </span>
                </div>
                {etfDetailData?.holdings && etfDetailData.holdings.length > 0 ? (
                  <div className="max-h-52 overflow-y-auto rounded border border-basalt-border">
                    <Table className="[&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
                      <TableHeader>
                        <TableRow>
                          <TableHead>代码</TableHead>
                          <TableHead>证券/资产名称</TableHead>
                          <TableHead>类别</TableHead>
                          <TableHead className="text-right">持仓占比</TableHead>
                          <TableHead className="text-right">持仓数量（万）</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {etfDetailData.holdings.map((h) => (
                          <TableRow key={h.stockCode}>
                            <TableCell className="font-mono text-xs">{h.stockCode}</TableCell>
                            <TableCell className="font-medium text-xs">{h.stockName}</TableCell>
                            <TableCell className="text-xs text-basalt-muted-foreground">
                              {h.assetType === 'bond'
                                ? '债券'
                                : h.assetType === 'stock'
                                  ? '股票'
                                  : h.assetType || '资产'}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold tabular-nums text-xs">
                              {h.holdPct !== null && h.holdPct !== undefined
                                ? `${h.holdPct.toFixed(2)}%`
                                : '—'}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-basalt-muted-foreground">
                              {h.holdShares !== null && h.holdShares !== undefined
                                ? h.holdShares.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
                                : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-basalt-muted-foreground border border-dashed border-basalt-border rounded-lg">
                    {etfDetailData?.instrument?.id === 'etf:518880.SH'
                      ? '当前数据源暂未提供该黄金 ETF 的可用持仓披露。'
                      : '暂无当前报告期披露持仓记录。'}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 弹窗 4：行业全量成分股列表 */}
      <Dialog
        open={Boolean(industryModalTarget)}
        onOpenChange={(open) => !open && setIndustryModalTarget(null)}
      >
        <DialogContent size="xl" className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {industryConstituentsData?.industry?.name || industryModalTarget?.name} ·
              全部当前成分股清单
            </DialogTitle>
            <DialogDescription>
              行业指数成分股截面清单与最新交易快照（来源：同花顺行业目录）
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto mt-2 rounded border border-basalt-border">
            {industryConstituentsLoading ? (
              <p className="text-center py-12 text-xs text-basalt-muted-foreground">
                正在加载成分股清单…
              </p>
            ) : industryConstituentsError ? (
              <div className="flex flex-col items-center justify-center py-12 gap-1.5 text-xs text-basalt-danger">
                <span>成分股清单加载失败</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => void mutateIndustryConstituents()}
                >
                  <RefreshCw className="h-3 w-3 mr-1" strokeWidth={1.5} /> 重试
                </Button>
              </div>
            ) : industryConstituentsData?.members && industryConstituentsData.members.length > 0 ? (
              <Table className="[&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">序号</TableHead>
                    <TableHead>代码</TableHead>
                    <TableHead>证券名称</TableHead>
                    <TableHead className="text-right">最新价</TableHead>
                    <TableHead className="text-right">涨跌幅</TableHead>
                    <TableHead className="text-right">成交额</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {industryConstituentsData.members.map((m) => (
                    <TableRow key={m.stockCode}>
                      <TableCell className="font-mono text-xs text-basalt-muted-foreground">
                        {m.rankOrder}
                      </TableCell>
                      <TableCell className="font-mono text-xs font-medium">{m.stockCode}</TableCell>
                      <TableCell className="font-medium text-xs">{m.stockName}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-xs">
                        {m.lastPrice !== null && m.lastPrice !== undefined
                          ? m.lastPrice.toFixed(2)
                          : '—'}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-mono tabular-nums text-xs font-semibold',
                          quoteChangeClass(m.changePct, quoteColor),
                        )}
                      >
                        {m.changePct !== null && m.changePct !== undefined
                          ? `${m.changePct > 0 ? '+' : ''}${m.changePct.toFixed(2)}%`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-basalt-muted-foreground tabular-nums">
                        {m.turnover != null ? formatCompact(m.turnover) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center py-12 text-xs text-basalt-muted-foreground">
                暂无成分股记录
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
