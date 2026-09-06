import { Button, Input, LayerCard } from '@nocoo/basalt';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@nocoo/basalt/components/table';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { DataInfo } from '@/components/charts/market-chart-controls';
import { MiniTrend } from '@/components/charts/mini-trend';
import { AppShell } from '@/components/layout';
import { ListPagination, ResearchEmpty, ResearchHeader } from '@/components/layout/research-layout';
import { FilterChips } from '@/components/ui/filter-chips';
import { FilterDropdown } from '@/components/ui/filter-dropdown';
import { useImeSearch } from '@/hooks/use-ime-search';
import { formatCount, formatMetric, formatPercent } from '@/lib/format-number';
import { originFromList, stockDetailTo } from '@/lib/list-origin';
import {
  parseStockSearch,
  readStoredStockFilters,
  STOCK_LENS_DESCRIPTIONS,
  STOCK_LENS_LABEL,
  type StockLens,
  stockUrlSearch,
  storeStockFilters,
} from '@/lib/stock-vm';

interface StockRow {
  symbol: string;
  ticker: string;
  name: string;
  exchange: string;
  industryName: string | null;
  isFinancial: boolean;
  tradeDate: string | null;
  price: number | null;
  changePct: number | null;
  turnover: number | null;
  avgTurnover20d: number | null;
  peTtm: number | null;
  peMrq: number | null;
  pbMrq: number | null;
  psTtm: number | null;
  pcfTtm: number | null;
  return1y: number | null;
  return3y: number | null;
  return5y: number | null;
  cagr1y: number | null;
  cagr3y: number | null;
  cagr5y: number | null;
  maxDrawdown1y: number | null;
  maxDrawdown3y: number | null;
  maxDrawdown5y: number | null;
  volatility1y: number | null;
  volatility3y: number | null;
  volatility5y: number | null;
  return20d: number | null;
  return60d: number | null;
  ma60Bias: number | null;
  sparkline: number[];
  fiscalYear: number | null;
  periodEnd: string | null;
  reportDate: string | null;
  currency: string | null;
  roeWeighted: number | null;
  roeDeductedWeighted: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  debtRatio: number | null;
  operatingIncome: number | null;
  revenueYoy: number | null;
  netProfit: number | null;
  parentNetProfit: number | null;
  profitYoy: number | null;
  revenueCagr3y: number | null;
  profitCagr3y: number | null;
  operatingCashFlow: number | null;
  cashProfitRatio: number | null;
  capex: number | null;
  cashMinusCapex: number | null;
  hasDeepResearch: boolean;
  hasPriceHistory: boolean;
  hasFinancials: boolean;
}

interface StockApiResponse {
  ready: boolean;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  coverage: {
    catalogCount: number;
    withValuationCount: number;
    withHistoryCount: number;
    withFinancialsCount: number;
  };
  industries: Array<{ industry: string; count: number }>;
  fiscalYears: number[];
  rows: StockRow[];
  asof: {
    tradeDate: string | null;
    valuationTimestamp: number | null;
    historyAsof: string | null;
    updatedAt: number | null;
  };
}

export function StocksPage({ forcedLens }: { forcedLens?: StockLens }) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ lens?: string }>();
  const [searchParams] = useSearchParams();

  // 根据路由匹配 lens: /stocks -> 'browse', /select-stock/:lens -> :lens
  const lens: StockLens = forcedLens ?? (params.lens as StockLens) ?? 'browse';

  const initialSearch = useMemo(() => {
    if (searchParams.toString()) return searchParams.toString();
    const stored = readStoredStockFilters(lens);
    return stored ? stockUrlSearch(stored, lens) : '';
  }, [searchParams, lens]);

  const state = useMemo(() => parseStockSearch(initialSearch, lens), [initialSearch, lens]);

  const [localQ, setLocalQ] = useState(state.q);

  useEffect(() => {
    setLocalQ(state.q);
  }, [state.q]);

  const { value, onChange, onCompositionStart, onCompositionEnd } = useImeSearch(localQ, (val) => {
    setLocalQ(val);
    updateFilter({ q: val, page: 1 });
  });

  const apiPath = useMemo(() => {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.exchange && state.exchange !== 'all') p.set('exchange', state.exchange);
    if (state.industry && state.industry !== 'all') p.set('industry', state.industry);
    if (state.excludeFinancial) p.set('excludeFinancial', 'true');
    if (state.isFinancial !== undefined) p.set('isFinancial', String(state.isFinancial));
    if (state.excludeSt) p.set('excludeSt', 'true');
    if (state.years) p.set('years', state.years);
    if (state.fiscalYear) p.set('fiscalYear', String(state.fiscalYear));
    if (state.hasHistory) p.set('hasHistory', 'true');
    if (state.hasFinancials) p.set('hasFinancials', 'true');
    p.set('lens', lens);

    if (lens === 'picks') {
      if (state.maxPeEnabled) p.set('maxPe', String(state.maxPe));
      if (state.minRoeEnabled) p.set('minRoe', String(state.minRoe));
      if (state.minRevenueYoyEnabled) p.set('minRevenueYoy', String(state.minRevenueYoy));
      if (state.maxDrawdownEnabled) p.set('maxDrawdown', String(state.maxDrawdown));
      if (state.minTurnoverEnabled) p.set('minTurnover', String(state.minTurnover));
    }

    if (state.sort) p.set('sort', state.sort);
    if (state.order) p.set('order', state.order);
    p.set('page', String(state.page));
    p.set('pageSize', '50');
    return `/api/selection/stocks?${p.toString()}`;
  }, [state, lens]);

  const { data, error, isLoading } = useSWR<StockApiResponse>(apiPath, fetchAPI);

  useEffect(() => {
    storeStockFilters(lens, state);
  }, [lens, state]);

  function updateFilter(patch: Partial<typeof state>) {
    const next = { ...state, ...patch };
    const queryStr = stockUrlSearch(next, lens);
    navigate(`${location.pathname}${queryStr}`, { replace: true });
  }

  const currentOrigin = useMemo(
    () =>
      originFromList(location.pathname, location.search) ?? {
        path: '/stocks' as const,
        search: location.search,
      },
    [location.pathname, location.search],
  );

  const title = STOCK_LENS_LABEL[lens] ?? '选股研究';
  const subtitle = STOCK_LENS_DESCRIPTIONS[lens] ?? '';

  const industryOptions = useMemo(() => {
    const base = [{ value: 'all', label: '全部行业' }];
    if (!data?.industries) return base;
    return [
      ...base,
      ...data.industries.map((i) => ({ value: i.industry, label: `${i.industry} (${i.count})` })),
    ];
  }, [data?.industries]);

  return (
    <AppShell>
      <ResearchHeader
        title={title}
        description={subtitle}
        actions={
          <div className="flex items-center gap-3">
            <DataInfo name="指标口径说明">
              <p>
                财务数据默认最新完整年报口径，排他性对齐同币种期末；金融行业排除于通用现金流和负债率筛选；前复权历史价格走势真实替换；负
                PE 永远不入选低估值。
              </p>
            </DataInfo>
            {data?.asof.tradeDate && (
              <span className="text-xs text-basalt-muted-foreground">
                行情日: {data.asof.tradeDate}
              </span>
            )}
          </div>
        }
      />

      {/* 顶部指标卡：概览统计 */}
      {data?.ready && data.coverage && (
        <div className="research-stats mb-4">
          <LayerCard className="research-stat">
            <span className="text-xs text-basalt-muted-foreground">全 A 股目录</span>
            <div className="research-stat-value">{formatCount(data.coverage.catalogCount)}</div>
            <span className="text-[11px] text-basalt-muted-foreground">沪深北全市场</span>
          </LayerCard>
          <LayerCard className="research-stat">
            <span className="text-xs text-basalt-muted-foreground">全市场估值覆盖</span>
            <div className="research-stat-value">
              {formatCount(data.coverage.withValuationCount)}
            </div>
            <span className="text-[11px] text-basalt-muted-foreground">最新批次估值快照</span>
          </LayerCard>
          <LayerCard className="research-stat">
            <span className="text-xs text-basalt-muted-foreground">深度研究池价格历史</span>
            <div className="research-stat-value">{formatCount(data.coverage.withHistoryCount)}</div>
            <span className="text-[11px] text-basalt-muted-foreground">
              占比{' '}
              {((data.coverage.withHistoryCount / data.coverage.catalogCount) * 100).toFixed(1)}%
            </span>
          </LayerCard>
          <LayerCard className="research-stat">
            <span className="text-xs text-basalt-muted-foreground">五年完整年报覆盖</span>
            <div className="research-stat-value">
              {formatCount(data.coverage.withFinancialsCount)}
            </div>
            <span className="text-[11px] text-basalt-muted-foreground">财报与能力指标</span>
          </LayerCard>
        </div>
      )}

      {/* 筛选栏 */}
      <LayerCard className="p-3 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* 搜索 */}
          <div className="relative w-52">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-basalt-muted-foreground" />
            <Input
              placeholder="代码 / 股票简称搜索..."
              className="pl-8 h-9 text-xs"
              value={value}
              onChange={onChange}
              onCompositionStart={onCompositionStart}
              onCompositionEnd={onCompositionEnd}
            />
          </div>

          {/* 市场板块 */}
          <FilterDropdown
            label="交易板块"
            value={state.exchange}
            options={[
              { value: 'all', label: '全部市场 (含北交所)' },
              { value: 'SH,SZ', label: '沪深 A 股' },
              { value: 'SH', label: '上交所' },
              { value: 'SZ', label: '深交所' },
              { value: 'BJ', label: '北交所' },
            ]}
            onChange={(val) => updateFilter({ exchange: val, page: 1 })}
          />

          {/* 行业分类 */}
          <FilterDropdown
            label="所属行业"
            value={state.industry}
            options={industryOptions}
            onChange={(val) => updateFilter({ industry: val, page: 1 })}
          />

          {/* 财报年份 */}
          {data?.fiscalYears && data.fiscalYears.length > 0 && (
            <FilterDropdown
              label="财报年份"
              value={state.fiscalYear ? String(state.fiscalYear) : 'latest'}
              options={[
                { value: 'latest', label: '最新完整年报' },
                ...data.fiscalYears.map((y) => ({ value: String(y), label: `${y}年度` })),
              ]}
              onChange={(val) =>
                updateFilter({ fiscalYear: val === 'latest' ? undefined : Number(val), page: 1 })
              }
            />
          )}

          {/* 趋势年限 */}
          {lens === 'trend' && (
            <FilterChips
              label="计算周期"
              value={state.years}
              options={[
                { value: '1', label: '近1年' },
                { value: '3', label: '近3年' },
                { value: '5', label: '近5年' },
              ]}
              onChange={(val) => updateFilter({ years: val as '1' | '3' | '5', page: 1 })}
            />
          )}

          {/* 金融股开关 */}
          {(lens === 'valuation' || lens === 'browse') && (
            <Button
              variant={state.excludeFinancial ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => updateFilter({ excludeFinancial: !state.excludeFinancial, page: 1 })}
            >
              {state.excludeFinancial ? '已排除金融业' : '排除金融业'}
            </Button>
          )}
        </div>

        {/* 精选镜头专属门槛 */}
        {lens === 'picks' && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-2 w-full mt-1 border-basalt-border/50 text-xs text-basalt-muted-foreground">
            <span>精选硬条件交集：</span>
            <Button
              variant={state.excludeSt ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => updateFilter({ excludeSt: !state.excludeSt, page: 1 })}
            >
              {state.excludeSt ? '已剔除 ST' : '包含 ST 股'}
            </Button>
            <Button
              variant={state.maxPeEnabled ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => updateFilter({ maxPeEnabled: !state.maxPeEnabled, page: 1 })}
            >
              PE(TTM) 正且 ≤ {state.maxPe} {state.maxPeEnabled ? '(已开)' : '(已关)'}
            </Button>
            <Button
              variant={state.minRoeEnabled ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => updateFilter({ minRoeEnabled: !state.minRoeEnabled, page: 1 })}
            >
              ROE ≥ {state.minRoe}% {state.minRoeEnabled ? '(已开)' : '(已关)'}
            </Button>
            <Button
              variant={state.minRevenueYoyEnabled ? 'secondary' : 'outline'}
              size="sm"
              onClick={() =>
                updateFilter({ minRevenueYoyEnabled: !state.minRevenueYoyEnabled, page: 1 })
              }
            >
              营收增长 ≥ {state.minRevenueYoy}% {state.minRevenueYoyEnabled ? '(已开)' : '(已关)'}
            </Button>
            <Button
              variant={state.maxDrawdownEnabled ? 'secondary' : 'outline'}
              size="sm"
              onClick={() =>
                updateFilter({ maxDrawdownEnabled: !state.maxDrawdownEnabled, page: 1 })
              }
            >
              最大回撤 ≤ {state.maxDrawdown}% {state.maxDrawdownEnabled ? '(已开)' : '(已关)'}
            </Button>
            <Button
              variant={state.minTurnoverEnabled ? 'secondary' : 'outline'}
              size="sm"
              onClick={() =>
                updateFilter({ minTurnoverEnabled: !state.minTurnoverEnabled, page: 1 })
              }
            >
              成交额 ≥ {(state.minTurnover / 10000).toFixed(0)}万{' '}
              {state.minTurnoverEnabled ? '(已开)' : '(已关)'}
            </Button>
          </div>
        )}
      </LayerCard>

      {/* 数据表格区 */}
      <LayerCard className="p-0 overflow-hidden">
        {isLoading ? (
          <LayerCard.Loading label="正在查询股票列表数据..." className="py-24" />
        ) : error || !data?.ready ? (
          <ResearchEmpty
            title={data?.ready === false ? '数据表尚未同步就绪' : '数据加载遇到异常'}
            description="请在终端运行 bun run fetch:selection 采集并物化数据表。"
          />
        ) : data.rows.length === 0 ? (
          <ResearchEmpty
            title="未找到符合条件的股票"
            description="尝试调整行业、放宽搜索词或精选指标门槛。"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">序号</TableHead>
                  <TableHead className="w-36">代码 / 简称</TableHead>
                  <TableHead className="w-24">行业</TableHead>
                  <TableHead className="w-24 text-right">最新价</TableHead>
                  <TableHead className="w-24 text-right">涨跌幅</TableHead>
                  <TableHead className="w-28 text-right">成交额</TableHead>

                  {lens === 'valuation' && (
                    <>
                      <TableHead className="w-28 text-right">PE (TTM)</TableHead>
                      <TableHead className="w-24 text-right">PE (MRQ)</TableHead>
                      <TableHead className="w-24 text-right">PB (MRQ)</TableHead>
                      <TableHead className="w-24 text-right">PS (TTM)</TableHead>
                      <TableHead className="w-24 text-right">PCF (TTM)</TableHead>
                    </>
                  )}

                  {lens === 'quality' && (
                    <>
                      <TableHead className="w-28 text-right">加权 ROE</TableHead>
                      <TableHead className="w-28 text-right">扣非 ROE</TableHead>
                      <TableHead className="w-24 text-right">销售净利率</TableHead>
                      <TableHead className="w-24 text-right">毛利率</TableHead>
                      <TableHead className="w-24 text-right">资产负债率</TableHead>
                      <TableHead className="w-20 text-center">财年</TableHead>
                    </>
                  )}

                  {lens === 'growth' && (
                    <>
                      <TableHead className="w-28 text-right">营收同比</TableHead>
                      <TableHead className="w-28 text-right">归母净利同比</TableHead>
                      <TableHead className="w-28 text-right">营收 3年CAGR</TableHead>
                      <TableHead className="w-28 text-right">净利 3年CAGR</TableHead>
                      <TableHead className="w-20 text-center">财年</TableHead>
                    </>
                  )}

                  {lens === 'cashflow' && (
                    <>
                      <TableHead className="w-28 text-right">经营现金流</TableHead>
                      <TableHead className="w-28 text-right">现金利润比</TableHead>
                      <TableHead className="w-28 text-right">资本开支</TableHead>
                      <TableHead className="w-32 text-right">现金流减开支</TableHead>
                      <TableHead className="w-20 text-center">财年</TableHead>
                    </>
                  )}

                  {lens === 'trend' && (
                    <>
                      <TableHead className="w-28 text-right">周期收益</TableHead>
                      <TableHead className="w-28 text-right">年化收益 CAGR</TableHead>
                      <TableHead className="w-24 text-right">最大回撤</TableHead>
                      <TableHead className="w-24 text-right">年化波动</TableHead>
                      <TableHead className="w-24 text-right">20日涨幅</TableHead>
                      <TableHead className="w-24 text-right">均线偏离度</TableHead>
                    </>
                  )}

                  {lens === 'picks' && (
                    <>
                      <TableHead className="w-24 text-right">PE (TTM)</TableHead>
                      <TableHead className="w-24 text-right">加权 ROE</TableHead>
                      <TableHead className="w-24 text-right">营收同比</TableHead>
                      <TableHead className="w-24 text-right">最大回撤</TableHead>
                      <TableHead className="w-20 text-center">财年</TableHead>
                    </>
                  )}

                  <TableHead className="w-32 text-center">前复权走势</TableHead>
                  <TableHead className="w-24 text-center">研究覆盖</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row, idx) => {
                  const retVal =
                    state.years === '3'
                      ? row.return3y
                      : state.years === '5'
                        ? row.return5y
                        : row.return1y;
                  const cagrVal =
                    state.years === '3'
                      ? row.cagr3y
                      : state.years === '5'
                        ? row.cagr5y
                        : row.cagr1y;
                  const ddVal =
                    state.years === '3'
                      ? row.maxDrawdown3y
                      : state.years === '5'
                        ? row.maxDrawdown5y
                        : row.maxDrawdown1y;
                  const volVal =
                    state.years === '3'
                      ? row.volatility3y
                      : state.years === '5'
                        ? row.volatility5y
                        : row.volatility1y;

                  return (
                    <TableRow key={row.symbol} className="hover:bg-basalt-muted/50">
                      <TableCell className="text-xs text-basalt-muted-foreground">
                        {(data.page - 1) * data.pageSize + idx + 1}
                      </TableCell>
                      <TableCell>
                        <Link
                          to={stockDetailTo(row.symbol, currentOrigin).to}
                          state={stockDetailTo(row.symbol, currentOrigin).state}
                          className="font-medium text-xs text-basalt-primary hover:underline block"
                        >
                          {row.name}
                        </Link>
                        <span className="text-[11px] font-mono text-basalt-muted-foreground">
                          {row.symbol}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-basalt-muted-foreground">
                        {row.industryName ?? '未分类'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatMetric(row.price, 'nav')}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.changePct !== null ? (
                          <span
                            className={
                              row.changePct > 0
                                ? 'text-basalt-red'
                                : row.changePct < 0
                                  ? 'text-basalt-green'
                                  : ''
                            }
                          >
                            {row.changePct > 0 ? `+${row.changePct}%` : `${row.changePct}%`}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatMetric(row.turnover, 'compact')}
                      </TableCell>

                      {lens === 'valuation' && (
                        <>
                          <TableCell className="text-right font-mono text-xs font-semibold">
                            {row.peTtm !== null ? row.peTtm.toFixed(2) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.peMrq !== null ? row.peMrq.toFixed(2) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.pbMrq !== null ? row.pbMrq.toFixed(2) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.psTtm !== null ? row.psTtm.toFixed(2) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.pcfTtm !== null ? row.pcfTtm.toFixed(2) : '—'}
                          </TableCell>
                        </>
                      )}

                      {lens === 'quality' && (
                        <>
                          <TableCell className="text-right font-mono text-xs font-semibold">
                            {formatPercent(row.roeWeighted)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatPercent(row.roeDeductedWeighted)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatPercent(row.netMargin)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatPercent(row.grossMargin)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatPercent(row.debtRatio)}
                          </TableCell>
                          <TableCell className="text-center text-xs text-basalt-muted-foreground">
                            {row.fiscalYear ?? '—'}
                          </TableCell>
                        </>
                      )}

                      {lens === 'growth' && (
                        <>
                          <TableCell className="text-right font-mono text-xs">
                            {row.revenueYoy !== null ? (
                              <span
                                className={
                                  row.revenueYoy > 0
                                    ? 'text-basalt-red'
                                    : row.revenueYoy < 0
                                      ? 'text-basalt-green'
                                      : ''
                                }
                              >
                                {row.revenueYoy > 0 ? `+${row.revenueYoy}%` : `${row.revenueYoy}%`}
                              </span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.profitYoy !== null ? (
                              <span
                                className={
                                  row.profitYoy > 0
                                    ? 'text-basalt-red'
                                    : row.profitYoy < 0
                                      ? 'text-basalt-green'
                                      : ''
                                }
                              >
                                {row.profitYoy > 0 ? `+${row.profitYoy}%` : `${row.profitYoy}%`}
                              </span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatPercent(row.revenueCagr3y)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatPercent(row.profitCagr3y)}
                          </TableCell>
                          <TableCell className="text-center text-xs text-basalt-muted-foreground">
                            {row.fiscalYear ?? '—'}
                          </TableCell>
                        </>
                      )}

                      {lens === 'cashflow' && (
                        <>
                          <TableCell className="text-right font-mono text-xs">
                            {row.operatingCashFlow !== null
                              ? `${(row.operatingCashFlow / 1e8).toFixed(2)} 亿`
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">
                            {row.cashProfitRatio !== null ? row.cashProfitRatio.toFixed(2) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.capex !== null ? `${(row.capex / 1e8).toFixed(2)} 亿` : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.cashMinusCapex !== null
                              ? `${(row.cashMinusCapex / 1e8).toFixed(2)} 亿`
                              : '—'}
                          </TableCell>
                          <TableCell className="text-center text-xs text-basalt-muted-foreground">
                            {row.fiscalYear ?? '—'}
                          </TableCell>
                        </>
                      )}

                      {lens === 'trend' && (
                        <>
                          <TableCell className="text-right font-mono text-xs">
                            {retVal !== null ? (
                              <span
                                className={
                                  retVal > 0
                                    ? 'text-basalt-red'
                                    : retVal < 0
                                      ? 'text-basalt-green'
                                      : ''
                                }
                              >
                                {retVal > 0 ? `+${retVal}%` : `${retVal}%`}
                              </span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {cagrVal !== null ? (
                              <span
                                className={
                                  cagrVal > 0
                                    ? 'text-basalt-red'
                                    : cagrVal < 0
                                      ? 'text-basalt-green'
                                      : ''
                                }
                              >
                                {cagrVal > 0 ? `+${cagrVal}%` : `${cagrVal}%`}
                              </span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {ddVal !== null ? `${ddVal}%` : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatPercent(volVal)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.return20d !== null
                              ? `${row.return20d > 0 ? `+${row.return20d}` : row.return20d}%`
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.ma60Bias !== null
                              ? `${row.ma60Bias > 0 ? `+${row.ma60Bias}` : row.ma60Bias}%`
                              : '—'}
                          </TableCell>
                        </>
                      )}

                      {lens === 'picks' && (
                        <>
                          <TableCell className="text-right font-mono text-xs">
                            {row.peTtm !== null ? row.peTtm.toFixed(2) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">
                            {formatPercent(row.roeWeighted)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatPercent(row.revenueYoy)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {ddVal !== null ? `${ddVal}%` : '—'}
                          </TableCell>
                          <TableCell className="text-center text-xs text-basalt-muted-foreground">
                            {row.fiscalYear ?? '—'}
                          </TableCell>
                        </>
                      )}

                      <TableCell className="text-center w-32 p-1">
                        {row.sparkline && row.sparkline.length > 1 ? (
                          <MiniTrend values={row.sparkline} />
                        ) : (
                          <span className="text-xs text-basalt-muted-foreground/50">—</span>
                        )}
                      </TableCell>

                      <TableCell className="text-center text-xs">
                        {row.hasDeepResearch ? (
                          <span className="px-1.5 py-0.5 rounded bg-basalt-primary/10 text-basalt-primary text-[10px]">
                            深度财报
                          </span>
                        ) : row.hasPriceHistory ? (
                          <span className="px-1.5 py-0.5 rounded bg-basalt-muted text-basalt-muted-foreground text-[10px]">
                            行情
                          </span>
                        ) : (
                          <span className="text-basalt-muted-foreground/50 text-[10px]">
                            快照估值
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* 分页组件 */}
        {data && data.totalPages > 1 && (
          <div className="border-t border-basalt-border p-3">
            <ListPagination
              page={data.page}
              pages={data.totalPages}
              total={data.total}
              pageSize={data.pageSize}
              onPageChange={(p) => updateFilter({ page: p })}
            />
          </div>
        )}
      </LayerCard>
    </AppShell>
  );
}
export default StocksPage;
