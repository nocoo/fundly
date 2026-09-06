import { Button, Input, LayerCard } from '@nocoo/basalt';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@nocoo/basalt/components/table';
import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { DataInfo } from '@/components/charts/market-chart-controls';
import { MiniTrend } from '@/components/charts/mini-trend';
import { AppShell } from '@/components/layout';
import { ListPagination, ResearchEmpty, ResearchHeader } from '@/components/layout/research-layout';
import { FilterCheck } from '@/components/ui/filter-check';
import { FilterChips } from '@/components/ui/filter-chips';
import { FilterDropdown } from '@/components/ui/filter-dropdown';
import { NumericDraftInput } from '@/components/ui/numeric-draft-input';
import { useImeSearch } from '@/hooks/use-ime-search';
import { useQuoteColor } from '@/hooks/use-quote-color';
import { formatCount, formatMetric, formatPercent } from '@/lib/format-number';
import { originFromList, stockDetailTo } from '@/lib/list-origin';
import { quoteChangeClass } from '@/lib/quote-color';
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
  const { color: quoteColor } = useQuoteColor();

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
    if (state.isFinancial !== undefined) {
      p.set('isFinancial', String(state.isFinancial));
    } else if (state.excludeFinancial !== undefined) {
      p.set('excludeFinancial', state.excludeFinancial ? 'true' : 'false');
    }
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

  const { data, error, isLoading, mutate } = useSWR<StockApiResponse>(apiPath, fetchAPI);

  useEffect(() => {
    storeStockFilters(lens, state);
  }, [lens, state]);

  function updateFilter(patch: Partial<typeof state>) {
    const next = { ...state, ...patch };
    const queryStr = stockUrlSearch(next, lens);
    navigate(`${location.pathname}${queryStr}`, { replace: true });
  }

  function handleSort(key: string) {
    if (state.sort === key) {
      updateFilter({ order: state.order === 'asc' ? 'desc' : 'asc', page: 1 });
    } else {
      updateFilter({ sort: key, order: 'desc', page: 1 });
    }
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

  const sortOptions = useMemo(() => {
    return [
      { value: 'ticker', label: '代码' },
      { value: 'price', label: '最新价' },
      { value: 'changePct', label: '涨跌幅' },
      { value: 'turnover', label: '成交额' },
      { value: 'pe', label: '市盈率 PE(TTM)' },
      { value: 'pb', label: '市净率 PB' },
      { value: 'roe', label: '加权 ROE' },
      { value: 'revenueYoy', label: '营收同比' },
      { value: 'profitYoy', label: '净利同比' },
      { value: 'cashProfitRatio', label: '现金利润比' },
      { value: 'maxDrawdown', label: '最大回撤' },
      { value: 'return', label: '周期收益' },
      { value: 'cagr', label: '年化收益 CAGR' },
      { value: 'ma60Bias', label: '60日均线偏离' },
    ];
  }, []);

  const renderSortHeader = (
    label: string,
    sortField: string,
    align: 'left' | 'right' = 'right',
  ) => {
    const isActive = state.sort === sortField;
    return (
      <button
        type="button"
        className={`inline-flex items-center gap-1 font-semibold hover:text-basalt-foreground transition-colors cursor-pointer select-none ${
          align === 'right' ? 'ml-auto' : ''
        } ${isActive ? 'text-basalt-primary' : 'text-basalt-muted-foreground'}`}
        onClick={() => handleSort(sortField)}
        aria-label={`按${label}排序`}
      >
        <span>{label}</span>
        {isActive ? (
          state.order === 'asc' ? (
            <ArrowUp className="size-3 text-basalt-primary" />
          ) : (
            <ArrowDown className="size-3 text-basalt-primary" />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-40 hover:opacity-100" />
        )}
      </button>
    );
  };

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
                PE/PB 排在最后。
              </p>
              {data?.asof.valuationTimestamp && (
                <p>
                  估值批次时点：{new Date(data.asof.valuationTimestamp).toLocaleDateString('zh-CN')}
                </p>
              )}
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
            <span className="text-[11px] text-basalt-muted-foreground">沪深北全市场标的</span>
          </LayerCard>
          <LayerCard className="research-stat">
            <span className="text-xs text-basalt-muted-foreground">全市场估值覆盖</span>
            <div className="research-stat-value">
              {formatCount(data.coverage.withValuationCount)}
            </div>
            <span className="text-[11px] text-basalt-muted-foreground">最新批次估值快照</span>
          </LayerCard>
          <LayerCard className="research-stat">
            <span className="text-xs text-basalt-muted-foreground">深度池价格历史</span>
            <div className="research-stat-value">{formatCount(data.coverage.withHistoryCount)}</div>
            <span className="text-[11px] text-basalt-muted-foreground">
              前复权真实 OHLC (有界池)
            </span>
          </LayerCard>
          <LayerCard className="research-stat">
            <span className="text-xs text-basalt-muted-foreground">年报资料覆盖</span>
            <div className="research-stat-value">
              {formatCount(data.coverage.withFinancialsCount)}
            </div>
            <span className="text-[11px] text-basalt-muted-foreground">对齐财务报告数据</span>
          </LayerCard>
        </div>
      )}

      {/* 筛选栏 */}
      <LayerCard className="p-3 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* 搜索 */}
          <div className="relative w-48">
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
            includeAll={false}
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
            includeAll={false}
            value={state.industry}
            options={industryOptions}
            onChange={(val) => updateFilter({ industry: val, page: 1 })}
          />

          {/* 金融行业切片 */}
          <FilterDropdown
            label="企业属性"
            includeAll={false}
            value={
              state.isFinancial
                ? 'financial'
                : state.isFinancial === false || state.excludeFinancial
                  ? 'nonFinancial'
                  : 'all'
            }
            options={[
              { value: 'all', label: '全部企业 (含金融)' },
              { value: 'nonFinancial', label: '排除已知金融股' },
              { value: 'financial', label: '仅看金融业 (银行/证券/保险)' },
            ]}
            onChange={(val) => {
              if (val === 'financial') {
                updateFilter({ isFinancial: true, excludeFinancial: false, page: 1 });
              } else if (val === 'nonFinancial') {
                updateFilter({ isFinancial: undefined, excludeFinancial: true, page: 1 });
              } else {
                updateFilter({ isFinancial: undefined, excludeFinancial: false, page: 1 });
              }
            }}
          />

          {/* 财报年份 */}
          {data?.fiscalYears && data.fiscalYears.length > 0 && (
            <FilterDropdown
              label="财报年份"
              includeAll={false}
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

          {/* 覆盖开关 */}
          <FilterCheck
            label="仅有价格历史"
            checked={state.hasHistory}
            onChange={(checked) => updateFilter({ hasHistory: checked, page: 1 })}
          />
          <FilterCheck
            label="仅有年报"
            checked={state.hasFinancials}
            onChange={(checked) => updateFilter({ hasFinancials: checked, page: 1 })}
          />

          {/* 排序下拉 */}
          <FilterDropdown
            label="排序"
            includeAll={false}
            value={state.sort || 'ticker'}
            options={sortOptions}
            onChange={(val) => updateFilter({ sort: val, page: 1 })}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-2 text-xs"
            onClick={() => updateFilter({ order: state.order === 'asc' ? 'desc' : 'asc', page: 1 })}
          >
            {state.order === 'asc' ? '升序 ↑' : '降序 ↓'}
          </Button>
        </div>

        {/* 精选镜头专属门槛：数值可调 + 开闭 */}
        {lens === 'picks' && (
          <div className="flex flex-wrap items-center gap-3 border-t pt-2 w-full mt-1 border-basalt-border/50 text-xs">
            <span className="text-basalt-muted-foreground font-medium">精选硬条件交集：</span>
            <FilterCheck
              label="排除 ST 股"
              checked={state.excludeSt}
              onChange={(checked) => updateFilter({ excludeSt: checked, page: 1 })}
            />

            <div className="flex items-center gap-1.5 bg-basalt-control px-2 py-1 rounded-md border border-basalt-border">
              <FilterCheck
                label="PE 上限"
                checked={state.maxPeEnabled}
                onChange={(checked) => updateFilter({ maxPeEnabled: checked, page: 1 })}
              />
              <NumericDraftInput
                ariaLabel="市盈率 PE(TTM) 上限"
                step="5"
                min="0"
                className="w-16 h-7 text-xs font-mono"
                disabled={!state.maxPeEnabled}
                value={state.maxPe}
                onChange={(val) => updateFilter({ maxPe: val, page: 1 })}
              />
              <span className="text-basalt-muted-foreground text-[11px]">倍 (正数)</span>
            </div>

            <div className="flex items-center gap-1.5 bg-basalt-control px-2 py-1 rounded-md border border-basalt-border">
              <FilterCheck
                label="ROE 下限"
                checked={state.minRoeEnabled}
                onChange={(checked) => updateFilter({ minRoeEnabled: checked, page: 1 })}
              />
              <NumericDraftInput
                ariaLabel="加权 ROE 下限"
                step="1"
                className="w-16 h-7 text-xs font-mono"
                disabled={!state.minRoeEnabled}
                value={state.minRoe}
                onChange={(val) => updateFilter({ minRoe: val, page: 1 })}
              />
              <span className="text-basalt-muted-foreground text-[11px]">%</span>
            </div>

            <div className="flex items-center gap-1.5 bg-basalt-control px-2 py-1 rounded-md border border-basalt-border">
              <FilterCheck
                label="营收增长"
                checked={state.minRevenueYoyEnabled}
                onChange={(checked) => updateFilter({ minRevenueYoyEnabled: checked, page: 1 })}
              />
              <NumericDraftInput
                ariaLabel="营收同比下限"
                step="5"
                className="w-16 h-7 text-xs font-mono"
                disabled={!state.minRevenueYoyEnabled}
                value={state.minRevenueYoy}
                onChange={(val) => updateFilter({ minRevenueYoy: val, page: 1 })}
              />
              <span className="text-basalt-muted-foreground text-[11px]">%</span>
            </div>

            <div className="flex items-center gap-1.5 bg-basalt-control px-2 py-1 rounded-md border border-basalt-border">
              <FilterCheck
                label="回撤上限"
                checked={state.maxDrawdownEnabled}
                onChange={(checked) => updateFilter({ maxDrawdownEnabled: checked, page: 1 })}
              />
              <NumericDraftInput
                ariaLabel="最大回撤深度上限"
                step="5"
                min="0"
                max="100"
                className="w-16 h-7 text-xs font-mono"
                disabled={!state.maxDrawdownEnabled}
                value={state.maxDrawdown}
                onChange={(val) => updateFilter({ maxDrawdown: val, page: 1 })}
              />
              <span className="text-basalt-muted-foreground text-[11px]">%</span>
            </div>

            <div className="flex items-center gap-1.5 bg-basalt-control px-2 py-1 rounded-md border border-basalt-border">
              <FilterCheck
                label="成交额"
                checked={state.minTurnoverEnabled}
                onChange={(checked) => updateFilter({ minTurnoverEnabled: checked, page: 1 })}
              />
              <NumericDraftInput
                ariaLabel="当日成交额下限"
                step="1000"
                min="0"
                className="w-20 h-7 text-xs font-mono"
                disabled={!state.minTurnoverEnabled}
                value={Math.round(state.minTurnover / 10000)}
                onChange={(val) => updateFilter({ minTurnover: val * 10000, page: 1 })}
              />
              <span className="text-basalt-muted-foreground text-[11px]">万元</span>
            </div>
          </div>
        )}
      </LayerCard>

      {/* 数据表格区 */}
      <LayerCard className="p-0 overflow-hidden">
        {isLoading ? (
          <LayerCard.Loading label="正在查询股票列表数据..." className="py-24" />
        ) : error || !data?.ready ? (
          <ResearchEmpty
            title={data?.ready === false ? '股票研究数据表未就绪' : '数据加载异常'}
            description={
              data?.ready === false
                ? '研究数据尚未准备好，请稍后刷新重试。'
                : '网络请求失败，请检查服务状态。'
            }
            action={
              <Button variant="outline" size="sm" onClick={() => void mutate()}>
                <RefreshCw className="size-3.5 mr-1" /> 重试
              </Button>
            }
          />
        ) : data.rows.length === 0 ? (
          <ResearchEmpty
            title="未找到符合条件的股票"
            description="尝试放宽行业、搜索词或切换企业属性（含金融）。"
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateFilter({ industry: 'all', q: '', page: 1 })}
              >
                重置基础筛选
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">序号</TableHead>
                  <TableHead className="w-36">
                    {renderSortHeader('代码/简称', 'ticker', 'left')}
                  </TableHead>
                  <TableHead className="w-24">行业</TableHead>
                  <TableHead className="w-24 text-right">
                    {renderSortHeader('最新价', 'price')}
                  </TableHead>
                  <TableHead className="w-24 text-right">
                    {renderSortHeader('涨跌幅', 'changePct')}
                  </TableHead>
                  <TableHead className="w-28 text-right">
                    {renderSortHeader('成交额', 'turnover')}
                  </TableHead>

                  {lens === 'valuation' && (
                    <>
                      <TableHead className="w-28 text-right">
                        {renderSortHeader('PE (TTM)', 'pe')}
                      </TableHead>
                      <TableHead className="w-24 text-right">
                        {renderSortHeader('PE (MRQ)', 'peMrq')}
                      </TableHead>
                      <TableHead className="w-24 text-right">
                        {renderSortHeader('PB (MRQ)', 'pb')}
                      </TableHead>
                      <TableHead className="w-24 text-right">
                        {renderSortHeader('PS (TTM)', 'ps')}
                      </TableHead>
                      <TableHead className="w-24 text-right">
                        {renderSortHeader('PCF (TTM)', 'pcf')}
                      </TableHead>
                    </>
                  )}

                  {lens === 'quality' && (
                    <>
                      <TableHead className="w-28 text-right">
                        {renderSortHeader('加权 ROE', 'roe')}
                      </TableHead>
                      <TableHead className="w-28 text-right">
                        {renderSortHeader('扣非 ROE', 'roeDeducted')}
                      </TableHead>
                      <TableHead className="w-24 text-right">
                        {renderSortHeader('销售净利率', 'netMargin')}
                      </TableHead>
                      <TableHead className="w-24 text-right">
                        {renderSortHeader('毛利率', 'grossMargin')}
                      </TableHead>
                      <TableHead className="w-24 text-right">
                        {renderSortHeader('资产负债率', 'debtRatio')}
                      </TableHead>
                      <TableHead className="w-20 text-center">财年</TableHead>
                    </>
                  )}

                  {lens === 'growth' && (
                    <>
                      <TableHead className="w-28 text-right">
                        {renderSortHeader('营收同比', 'revenueYoy')}
                      </TableHead>
                      <TableHead className="w-28 text-right">
                        {renderSortHeader('归母净利同比', 'profitYoy')}
                      </TableHead>
                      <TableHead className="w-28 text-right">
                        {renderSortHeader('营收 3年CAGR', 'revenueCagr3y')}
                      </TableHead>
                      <TableHead className="w-28 text-right">
                        {renderSortHeader('净利 3年CAGR', 'profitCagr3y')}
                      </TableHead>
                      <TableHead className="w-20 text-center">财年</TableHead>
                    </>
                  )}

                  {lens === 'cashflow' && (
                    <>
                      <TableHead className="w-28 text-right">
                        {renderSortHeader('经营现金流', 'cashFlow')}
                      </TableHead>
                      <TableHead className="w-28 text-right">
                        {renderSortHeader('现金利润比', 'cashProfitRatio')}
                      </TableHead>
                      <TableHead className="w-28 text-right">
                        {renderSortHeader('资本开支', 'capex')}
                      </TableHead>
                      <TableHead className="w-32 text-right">
                        {renderSortHeader('现金流减开支', 'cashMinusCapex')}
                      </TableHead>
                      <TableHead className="w-20 text-center">财年</TableHead>
                    </>
                  )}

                  {lens === 'trend' && (
                    <>
                      <TableHead className="w-28 text-right">
                        {renderSortHeader('周期收益', 'return')}
                      </TableHead>
                      <TableHead className="w-28 text-right">
                        {renderSortHeader('年化收益 CAGR', 'cagr')}
                      </TableHead>
                      <TableHead className="w-24 text-right">
                        {renderSortHeader('最大回撤', 'maxDrawdown')}
                      </TableHead>
                      <TableHead className="w-24 text-right">
                        {renderSortHeader('年化波动', 'volatility')}
                      </TableHead>
                      <TableHead className="w-24 text-right">
                        {renderSortHeader('20日涨幅', 'return20d')}
                      </TableHead>
                      <TableHead className="w-24 text-right">
                        {renderSortHeader('均线偏离度', 'ma60Bias')}
                      </TableHead>
                    </>
                  )}

                  {lens === 'picks' && (
                    <>
                      <TableHead className="w-24 text-right">
                        {renderSortHeader('PE (TTM)', 'pe')}
                      </TableHead>
                      <TableHead className="w-24 text-right">
                        {renderSortHeader('加权 ROE', 'roe')}
                      </TableHead>
                      <TableHead className="w-24 text-right">
                        {renderSortHeader('营收同比', 'revenueYoy')}
                      </TableHead>
                      <TableHead className="w-24 text-right">
                        {renderSortHeader('最大回撤', 'maxDrawdown')}
                      </TableHead>
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
                          <span className={quoteChangeClass(row.changePct, quoteColor)}>
                            {row.changePct > 0
                              ? `+${row.changePct.toFixed(2)}%`
                              : `${row.changePct.toFixed(2)}%`}
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
                            {row.peTtm !== null ? (
                              <span
                                className={row.peTtm <= 0 ? 'text-basalt-muted-foreground' : ''}
                              >
                                {row.peTtm.toFixed(2)}
                              </span>
                            ) : (
                              '—'
                            )}
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
                              <span className={quoteChangeClass(row.revenueYoy, quoteColor)}>
                                {row.revenueYoy > 0
                                  ? `+${row.revenueYoy.toFixed(2)}%`
                                  : `${row.revenueYoy.toFixed(2)}%`}
                              </span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.profitYoy !== null ? (
                              <span className={quoteChangeClass(row.profitYoy, quoteColor)}>
                                {row.profitYoy > 0
                                  ? `+${row.profitYoy.toFixed(2)}%`
                                  : `${row.profitYoy.toFixed(2)}%`}
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
                              <span className={quoteChangeClass(retVal, quoteColor)}>
                                {retVal > 0 ? `+${retVal.toFixed(2)}%` : `${retVal.toFixed(2)}%`}
                              </span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {cagrVal !== null ? (
                              <span className={quoteChangeClass(cagrVal, quoteColor)}>
                                {cagrVal > 0 ? `+${cagrVal.toFixed(2)}%` : `${cagrVal.toFixed(2)}%`}
                              </span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {/* 最大回撤为正数，不加红绿 */}
                            {ddVal !== null ? `${ddVal.toFixed(2)}%` : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatPercent(volVal)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.return20d !== null
                              ? `${row.return20d > 0 ? `+${row.return20d.toFixed(2)}` : row.return20d.toFixed(2)}%`
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.ma60Bias !== null
                              ? `${row.ma60Bias > 0 ? `+${row.ma60Bias.toFixed(2)}` : row.ma60Bias.toFixed(2)}%`
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
                            {ddVal !== null ? `${ddVal.toFixed(2)}%` : '—'}
                          </TableCell>
                          <TableCell className="text-center text-xs text-basalt-muted-foreground">
                            {row.fiscalYear ?? '—'}
                          </TableCell>
                        </>
                      )}

                      <TableCell className="text-center w-32 p-1">
                        {row.sparkline && row.sparkline.length > 1 ? (
                          <div className="flex flex-col items-center">
                            <MiniTrend values={row.sparkline} />
                            <span className="text-[10px] text-basalt-muted-foreground font-mono leading-none scale-90">
                              前复权
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-basalt-muted-foreground/50">—</span>
                        )}
                      </TableCell>

                      <TableCell className="text-center text-xs">
                        {row.hasDeepResearch ? (
                          <span className="px-1.5 py-0.5 rounded bg-basalt-primary/10 text-basalt-primary text-[10px]">
                            深度池
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

        {/* 分页与统计底栏 */}
        {data && (
          <div className="border-t border-basalt-border p-3">
            <ListPagination
              page={data.page}
              pages={Math.max(1, data.totalPages)}
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
