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

  // 根据路由匹配 lens: /etfs -> 'browse', /select-etf/:lens -> :lens
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

  const { data, error, isLoading } = useSWR<EtfApiResponse>(apiPath, fetchAPI);

  useEffect(() => {
    storeEtfFilters(lens, state);
  }, [lens, state]);

  function updateFilter(patch: Partial<typeof state>) {
    const next = { ...state, ...patch };
    const queryStr = etfUrlSearch(next, lens);
    navigate(`${location.pathname}${queryStr}`, { replace: true });
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

  return (
    <AppShell>
      <ResearchHeader
        title={title}
        description={subtitle}
        actions={
          <div className="flex items-center gap-3">
            <DataInfo name="口径说明">
              <p>
                持续费用包含管理与托管费；披露规模以定期报告为准；年化收益与最大回撤为几何年化计算；折溢价仅在同日有真实收盘与净值时计算。
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
            <span className="text-xs text-basalt-muted-foreground">真实日 K 覆盖</span>
            <div className="research-stat-value">{formatCount(data.coverage.withBarsCount)}</div>
            <span className="text-[11px] text-basalt-muted-foreground">五年真实无复权</span>
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
          <div className="relative w-52">
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
        </div>

        {/* 精选镜头专属门槛 */}
        {lens === 'picks' && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-2 w-full mt-1 border-basalt-border/50 text-xs text-basalt-muted-foreground">
            <span>精选硬条件交集：</span>
            <Button
              variant={state.maxFeeEnabled ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => updateFilter({ maxFeeEnabled: !state.maxFeeEnabled, page: 1 })}
            >
              费率 ≤ {state.maxFee}% {state.maxFeeEnabled ? '(已启用)' : '(已关)'}
            </Button>
            <Button
              variant={state.minScaleEnabled ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => updateFilter({ minScaleEnabled: !state.minScaleEnabled, page: 1 })}
            >
              规模 ≥ {state.minScale}亿 {state.minScaleEnabled ? '(已启用)' : '(已关)'}
            </Button>
            <Button
              variant={state.maxDrawdownEnabled ? 'secondary' : 'outline'}
              size="sm"
              onClick={() =>
                updateFilter({ maxDrawdownEnabled: !state.maxDrawdownEnabled, page: 1 })
              }
            >
              回撤 ≤ {state.maxDrawdown}% {state.maxDrawdownEnabled ? '(已启用)' : '(已关)'}
            </Button>
            <Button
              variant={state.minTurnoverEnabled ? 'secondary' : 'outline'}
              size="sm"
              onClick={() =>
                updateFilter({ minTurnoverEnabled: !state.minTurnoverEnabled, page: 1 })
              }
            >
              20日均成交 ≥ {(state.minTurnover / 10000).toFixed(0)}万{' '}
              {state.minTurnoverEnabled ? '(已启用)' : '(已关)'}
            </Button>
          </div>
        )}
      </LayerCard>

      {/* 数据表格区 */}
      <LayerCard className="p-0 overflow-hidden">
        {isLoading ? (
          <LayerCard.Loading label="正在查询 ETF 列表数据..." className="py-24" />
        ) : error || !data?.ready ? (
          <ResearchEmpty
            title={data?.ready === false ? '数据表尚未同步就绪' : '数据加载遇到异常'}
            description="请在终端运行 bun run fetch:selection 采集并物化数据表。"
          />
        ) : data.rows.length === 0 ? (
          <ResearchEmpty
            title="未找到符合条件的 ETF"
            description="尝试放宽筛选条件、搜索词或切换资产类别。"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">序号</TableHead>
                  <TableHead className="w-36">代码 / 简称</TableHead>
                  <TableHead className="w-24">资产类</TableHead>
                  <TableHead className="w-24">方向分类</TableHead>
                  <TableHead className="w-24 text-right">最新价</TableHead>
                  <TableHead className="w-24 text-right">涨跌幅</TableHead>
                  <TableHead className="w-28 text-right">披露规模</TableHead>
                  {lens === 'liquidity' && (
                    <>
                      <TableHead className="w-28 text-right">当日成交</TableHead>
                      <TableHead className="w-32 text-right">20日均成交</TableHead>
                      <TableHead className="w-28 text-right">折溢价率</TableHead>
                    </>
                  )}
                  {lens === 'cost' && (
                    <>
                      <TableHead className="w-24 text-right">管理费</TableHead>
                      <TableHead className="w-24 text-right">托管费</TableHead>
                      <TableHead className="w-28 text-right">持续费率合计</TableHead>
                    </>
                  )}
                  {(lens === 'risk' || lens === 'allocation' || lens === 'picks') && (
                    <>
                      <TableHead className="w-28 text-right">周期收益</TableHead>
                      <TableHead className="w-28 text-right">年化收益 CAGR</TableHead>
                      <TableHead className="w-28 text-right">最大回撤</TableHead>
                      <TableHead className="w-28 text-right">年化波动</TableHead>
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
                        {row.scaleYi !== null ? `${row.scaleYi} 亿` : '—'}
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
                              <span>
                                {row.premiumDiscountPct > 0
                                  ? `+${row.premiumDiscountPct}%`
                                  : `${row.premiumDiscountPct}%`}
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
                            {/* 最大回撤无正号与涨跌色 */}
                            {ddVal !== null ? `${ddVal}%` : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatPercent(volVal)}
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
                            深度覆盖
                          </span>
                        ) : row.hasMarketBars ? (
                          <span className="px-1.5 py-0.5 rounded bg-basalt-muted text-basalt-muted-foreground text-[10px]">
                            行情
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
