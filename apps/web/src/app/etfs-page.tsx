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
import { useImeSearch } from '@/hooks/use-ime-search';
import { useQuoteColor } from '@/hooks/use-quote-color';
import {
  ETF_LENS_DESCRIPTIONS,
  ETF_LENS_LABEL,
  type EtfLens,
  etfUrlSearch,
  parseEtfSearch,
  readStoredEtfFilters,
  storeEtfFilters,
} from '@/lib/etf-vm';
import { formatCount, formatMetric, formatPercent } from '@/lib/format-number';
import { etfDetailTo, originFromList } from '@/lib/list-origin';
import { quoteChangeClass } from '@/lib/quote-color';

interface EtfRow {
  symbol: string;
  ticker: string;
  name: string;
  exchange: string;
  assetClass: string;
  directionTag: string | null;
  linkedFundCode: string | null;
  marketPrice: number | null;
  changePct: number | null;
  turnover: number | null;
  avgTurnover20d: number | null;
  unitNav: number | null;
  premiumDiscountPct: number | null;
  totalExpensePct: number | null;
  mgmtFeePct: number | null;
  custodyFeePct: number | null;
  scaleYi: number | null;
  scalePeriod: string | null;
  historyAsof: string | null;
  navRiskBasis: string | null;
  navRiskAsof: string | null;
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
  points1y: number | null;
  points3y: number | null;
  points5y: number | null;
  sparkline: number[];
  sparklineType: 'price' | 'nav' | 'none';
  hasMarketBars: boolean;
  hasNavHistory: boolean;
  hasDeepResearch: boolean;
}

interface EtfApiResponse {
  ready: boolean;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  coverage: {
    catalogCount: number;
    withNavCount: number;
    withBarsCount: number;
    withScaleCount: number;
    withFeesCount: number;
  };
  categories: Array<{ category: string; count: number }>;
  rows: EtfRow[];
  asof: {
    tradeDate: string | null;
    navDate: string | null;
    updatedAt: number | null;
  };
}

export function EtfsPage({ forcedLens }: { forcedLens?: EtfLens }) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ lens?: string }>();
  const [searchParams] = useSearchParams();
  const { color: quoteColor } = useQuoteColor();

  const lens: EtfLens = forcedLens ?? (params.lens as EtfLens) ?? 'browse';

  const initialSearch = useMemo(() => {
    if (searchParams.toString()) return searchParams.toString();
    const stored = readStoredEtfFilters(lens);
    return stored ? etfUrlSearch(stored, lens) : '';
  }, [searchParams, lens]);

  const state = useMemo(() => parseEtfSearch(initialSearch, lens), [initialSearch, lens]);

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
    if (state.category) p.set('category', state.category);
    if (state.theme && state.theme !== 'all') p.set('theme', state.theme);
    if (state.years) p.set('years', state.years);
    if (state.hasBars) p.set('hasBars', 'true');
    p.set('lens', lens);
    if (lens === 'picks') {
      if (state.maxFeeEnabled) p.set('maxFee', String(state.maxFee));
      if (state.minScaleEnabled) p.set('minScale', String(state.minScale));
      if (state.maxDrawdownEnabled) p.set('maxDrawdown', String(state.maxDrawdown));
      if (state.minTurnoverEnabled) p.set('minTurnover', String(state.minTurnover));
    }
    if (state.sort) p.set('sort', state.sort);
    if (state.order) p.set('order', state.order);
    p.set('page', String(state.page));
    p.set('pageSize', '50');
    return `/api/selection/etfs?${p.toString()}`;
  }, [state, lens]);

  const { data, error, isLoading, mutate } = useSWR<EtfApiResponse>(apiPath, fetchAPI);

  useEffect(() => {
    storeEtfFilters(lens, state);
  }, [lens, state]);

  function updateFilter(patch: Partial<typeof state>) {
    const next = { ...state, ...patch };
    const queryStr = etfUrlSearch(next, lens);
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
        path: '/etfs' as const,
        search: location.search,
      },
    [location.pathname, location.search],
  );

  const title = ETF_LENS_LABEL[lens] ?? '选 ETF';
  const subtitle = ETF_LENS_DESCRIPTIONS[lens] ?? '';

  const sortOptions = useMemo(() => {
    const list = [
      { value: 'ticker', label: '默认（代码升序）' },
      { value: 'scale', label: '规模' },
      { value: 'price', label: '最新价' },
      { value: 'changePct', label: '涨跌幅' },
      { value: 'fee', label: '持续费率' },
      { value: 'return', label: '周期收益' },
      { value: 'cagr', label: '年化收益 CAGR' },
      { value: 'maxDrawdown', label: '最大回撤' },
      { value: 'volatility', label: '年化波动' },
      { value: 'avgTurnover20d', label: '20日均成交额' },
    ];
    if (lens === 'liquidity') {
      list.push({ value: 'premiumDiscount', label: '折溢价率' });
    }
    return list;
  }, [lens]);

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
            <DataInfo name="口径说明">
              <p>
                持续费用包含管理与托管费；披露规模以定期报告为准；最大回撤为正数深度（不加正号）；折溢价仅在同日有真实收盘与净值时计算。
              </p>
              {data?.asof.navDate && <p>本地净值时效：{data.asof.navDate}</p>}
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
            <span className="text-xs text-basalt-muted-foreground">全目录 ETF</span>
            <div className="research-stat-value">{formatCount(data.coverage.catalogCount)}</div>
            <span className="text-[11px] text-basalt-muted-foreground">场内标的身份</span>
          </LayerCard>
          <LayerCard className="research-stat">
            <span className="text-xs text-basalt-muted-foreground">有效净值覆盖</span>
            <div className="research-stat-value">{formatCount(data.coverage.withNavCount)}</div>
            <span className="text-[11px] text-basalt-muted-foreground">
              占比 {formatPercent((data.coverage.withNavCount / data.coverage.catalogCount) * 100)}
            </span>
          </LayerCard>
          <LayerCard className="research-stat">
            <span className="text-xs text-basalt-muted-foreground">场内日 K 覆盖</span>
            <div className="research-stat-value">{formatCount(data.coverage.withBarsCount)}</div>
            <span className="text-[11px] text-basalt-muted-foreground">真实不复权历史</span>
          </LayerCard>
          <LayerCard className="research-stat">
            <span className="text-xs text-basalt-muted-foreground">披露规模覆盖</span>
            <div className="research-stat-value">{formatCount(data.coverage.withScaleCount)}</div>
            <span className="text-[11px] text-basalt-muted-foreground">已披露资产净值</span>
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
              placeholder="代码 / 名称搜索..."
              className="pl-8 h-9 text-xs"
              value={value}
              onChange={onChange}
              onCompositionStart={onCompositionStart}
              onCompositionEnd={onCompositionEnd}
            />
          </div>

          {/* 资产类别 */}
          <FilterDropdown
            label="资产类别"
            value={state.category}
            options={[
              { value: 'all', label: '全部资产' },
              { value: '境内权益', label: '境内权益' },
              { value: '境外权益', label: '境外权益' },
              { value: '固收', label: '固收债券' },
              { value: '货币', label: '货币型' },
              { value: '其他', label: '其他类' },
              { value: '待核验', label: '待核验' },
            ]}
            onChange={(val) => updateFilter({ category: val, page: 1 })}
          />

          {/* 方向分类 */}
          <FilterDropdown
            label="名称分类"
            value={state.theme}
            options={[
              { value: 'all', label: '全部分类' },
              { value: '宽基', label: '宽基' },
              { value: '红利低波', label: '红利低波' },
              { value: '行业主题', label: '行业主题' },
              { value: '跨境海外', label: '跨境海外' },
              { value: '固收货币', label: '固收货币' },
              { value: '其他', label: '其他' },
            ]}
            onChange={(val) => updateFilter({ theme: val, page: 1 })}
          />

          {/* 年限周期切换 */}
          {(lens === 'risk' || lens === 'allocation' || lens === 'picks') && (
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
            label="仅有场内行情"
            checked={state.hasBars}
            onChange={(checked) => updateFilter({ hasBars: checked, page: 1 })}
          />

          {/* 排序下拉 */}
          <FilterDropdown
            label="排序字段"
            value={state.sort || 'ticker'}
            options={sortOptions}
            onChange={(val) => updateFilter({ sort: val === 'ticker' ? '' : val, page: 1 })}
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

        {/* 精选镜头专属门槛：数值可调 + 可开闭 */}
        {lens === 'picks' && (
          <div className="flex flex-wrap items-center gap-3 border-t pt-2 w-full mt-1 border-basalt-border/50 text-xs">
            <span className="text-basalt-muted-foreground font-medium">精选门槛交集：</span>
            <div className="flex items-center gap-1.5 bg-basalt-control px-2 py-1 rounded-md border border-basalt-border">
              <FilterCheck
                label="费率上限"
                checked={state.maxFeeEnabled}
                onChange={(checked) => updateFilter({ maxFeeEnabled: checked, page: 1 })}
              />
              <Input
                type="number"
                step="0.05"
                min="0.05"
                max="5"
                className="w-16 h-7 text-xs font-mono"
                disabled={!state.maxFeeEnabled}
                value={state.maxFee}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateFilter({ maxFee: Number(e.target.value) || 0.6, page: 1 })
                }
              />
              <span className="text-basalt-muted-foreground text-[11px]">%</span>
            </div>

            <div className="flex items-center gap-1.5 bg-basalt-control px-2 py-1 rounded-md border border-basalt-border">
              <FilterCheck
                label="规模下限"
                checked={state.minScaleEnabled}
                onChange={(checked) => updateFilter({ minScaleEnabled: checked, page: 1 })}
              />
              <Input
                type="number"
                step="1"
                min="0"
                className="w-16 h-7 text-xs font-mono"
                disabled={!state.minScaleEnabled}
                value={state.minScale}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateFilter({ minScale: Number(e.target.value) || 2.0, page: 1 })
                }
              />
              <span className="text-basalt-muted-foreground text-[11px]">亿元</span>
            </div>

            <div className="flex items-center gap-1.5 bg-basalt-control px-2 py-1 rounded-md border border-basalt-border">
              <FilterCheck
                label="回撤上限"
                checked={state.maxDrawdownEnabled}
                onChange={(checked) => updateFilter({ maxDrawdownEnabled: checked, page: 1 })}
              />
              <Input
                type="number"
                step="5"
                min="5"
                max="100"
                className="w-16 h-7 text-xs font-mono"
                disabled={!state.maxDrawdownEnabled}
                value={state.maxDrawdown}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateFilter({ maxDrawdown: Number(e.target.value) || 35.0, page: 1 })
                }
              />
              <span className="text-basalt-muted-foreground text-[11px]">%</span>
            </div>

            <div className="flex items-center gap-1.5 bg-basalt-control px-2 py-1 rounded-md border border-basalt-border">
              <FilterCheck
                label="20日均成交"
                checked={state.minTurnoverEnabled}
                onChange={(checked) => updateFilter({ minTurnoverEnabled: checked, page: 1 })}
              />
              <Input
                type="number"
                step="500"
                min="0"
                className="w-20 h-7 text-xs font-mono"
                disabled={!state.minTurnoverEnabled}
                value={Math.round(state.minTurnover / 10000)}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateFilter({
                    minTurnover: (Number(e.target.value) || 1000) * 10000,
                    page: 1,
                  })
                }
              />
              <span className="text-basalt-muted-foreground text-[11px]">万元</span>
            </div>
          </div>
        )}
      </LayerCard>

      {/* 数据表格区 */}
      <LayerCard className="p-0 overflow-hidden">
        {isLoading ? (
          <LayerCard.Loading label="正在查询 ETF 列表数据..." className="py-24" />
        ) : error || !data?.ready ? (
          <ResearchEmpty
            title={data?.ready === false ? 'ETF 研究数据表未就绪' : '数据加载异常'}
            description={
              data?.ready === false
                ? '系统尚未生成选基与选 ETF 物化视图，请稍后刷新重试。'
                : '网络请求失败，请检查连接后重试。'
            }
            action={
              <Button variant="outline" size="sm" onClick={() => void mutate()}>
                <RefreshCw className="size-3.5 mr-1" /> 重试
              </Button>
            }
          />
        ) : data.rows.length === 0 ? (
          <ResearchEmpty
            title="未找到符合条件的 ETF"
            description="尝试调整搜索词、放宽资产类别或关闭部分精选门槛。"
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateFilter({ category: 'all', theme: 'all', q: '', page: 1 })}
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
                  <TableHead className="w-24">资产类</TableHead>
                  <TableHead className="w-24">方向分类</TableHead>
                  <TableHead className="w-24 text-right">
                    {renderSortHeader('最新价', 'price')}
                  </TableHead>
                  <TableHead className="w-24 text-right">
                    {renderSortHeader('涨跌幅', 'changePct')}
                  </TableHead>
                  <TableHead className="w-28 text-right">
                    {renderSortHeader('披露规模', 'scale')}
                  </TableHead>
                  {lens === 'liquidity' && (
                    <>
                      <TableHead className="w-28 text-right">
                        {renderSortHeader('当日成交', 'turnover')}
                      </TableHead>
                      <TableHead className="w-32 text-right">
                        {renderSortHeader('20日均成交', 'avgTurnover20d')}
                      </TableHead>
                      <TableHead className="w-28 text-right">
                        {renderSortHeader('同日折溢价', 'premiumDiscount')}
                      </TableHead>
                    </>
                  )}
                  {lens === 'cost' && (
                    <>
                      <TableHead className="w-24 text-right">
                        {renderSortHeader('管理费', 'mgmtFee')}
                      </TableHead>
                      <TableHead className="w-24 text-right">
                        {renderSortHeader('托管费', 'custodyFee')}
                      </TableHead>
                      <TableHead className="w-28 text-right">
                        {renderSortHeader('两费合计', 'fee')}
                      </TableHead>
                    </>
                  )}
                  {(lens === 'risk' || lens === 'allocation' || lens === 'picks') && (
                    <>
                      <TableHead className="w-28 text-right">
                        {renderSortHeader('周期收益', 'return')}
                      </TableHead>
                      <TableHead className="w-28 text-right">
                        {renderSortHeader('年化收益 CAGR', 'cagr')}
                      </TableHead>
                      <TableHead className="w-28 text-right">
                        {renderSortHeader('最大回撤', 'maxDrawdown')}
                      </TableHead>
                      <TableHead className="w-28 text-right">
                        {renderSortHeader('年化波动', 'volatility')}
                      </TableHead>
                    </>
                  )}
                  <TableHead className="w-32 text-center">趋势走势</TableHead>
                  <TableHead className="w-24 text-center">覆盖状态</TableHead>
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
                          to={etfDetailTo(row.symbol, currentOrigin).to}
                          state={etfDetailTo(row.symbol, currentOrigin).state}
                          className="font-medium text-xs text-basalt-primary hover:underline block"
                        >
                          {row.name}
                        </Link>
                        <span className="text-[11px] font-mono text-basalt-muted-foreground">
                          {row.symbol}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-basalt-muted-foreground">
                        {row.assetClass}
                      </TableCell>
                      <TableCell className="text-xs text-basalt-muted-foreground">
                        {row.directionTag ?? '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatMetric(row.marketPrice, 'nav')}
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
                        {row.scaleYi !== null ? `${row.scaleYi.toFixed(2)} 亿` : '—'}
                      </TableCell>

                      {lens === 'liquidity' && (
                        <>
                          <TableCell className="text-right font-mono text-xs">
                            {formatMetric(row.turnover, 'compact')}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatMetric(row.avgTurnover20d, 'compact')}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.premiumDiscountPct !== null ? (
                              <span
                                className={quoteChangeClass(row.premiumDiscountPct, quoteColor)}
                              >
                                {row.premiumDiscountPct > 0
                                  ? `+${row.premiumDiscountPct.toFixed(2)}%`
                                  : `${row.premiumDiscountPct.toFixed(2)}%`}
                              </span>
                            ) : (
                              <span className="text-basalt-muted-foreground/60">—</span>
                            )}
                          </TableCell>
                        </>
                      )}

                      {lens === 'cost' && (
                        <>
                          <TableCell className="text-right font-mono text-xs">
                            {formatPercent(row.mgmtFeePct)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatPercent(row.custodyFeePct)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">
                            {formatPercent(row.totalExpensePct)}
                          </TableCell>
                        </>
                      )}

                      {(lens === 'risk' || lens === 'allocation' || lens === 'picks') && (
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
                            {/* 最大回撤为正数深度，不加正号或红绿变化色 */}
                            {ddVal !== null ? `${ddVal.toFixed(2)}%` : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatPercent(volVal)}
                          </TableCell>
                        </>
                      )}

                      <TableCell
                        className="text-center w-32 p-1"
                        title={
                          row.sparklineType === 'price'
                            ? '价格曲线'
                            : row.sparklineType === 'nav'
                              ? '净值总回报曲线'
                              : '暂无序列'
                        }
                      >
                        {row.sparkline && row.sparkline.length > 1 ? (
                          <div className="flex flex-col items-center">
                            <MiniTrend values={row.sparkline} />
                            <span className="text-[10px] text-basalt-muted-foreground font-mono leading-none scale-90">
                              {row.sparklineType === 'price' ? '价格' : '净值'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-basalt-muted-foreground/50">—</span>
                        )}
                      </TableCell>

                      <TableCell className="text-center text-xs">
                        {row.hasDeepResearch ? (
                          <span className="px-1.5 py-0.5 rounded bg-basalt-primary/10 text-basalt-primary text-[10px]">
                            深度覆盖
                          </span>
                        ) : row.hasMarketBars ? (
                          <span className="px-1.5 py-0.5 rounded bg-basalt-muted text-basalt-muted-foreground text-[10px]">
                            行情
                          </span>
                        ) : row.hasNavHistory ? (
                          <span className="px-1.5 py-0.5 rounded bg-basalt-accent text-basalt-foreground text-[10px]">
                            净值
                          </span>
                        ) : (
                          <span className="text-basalt-muted-foreground/50 text-[10px]">
                            仅目录
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
export default EtfsPage;
