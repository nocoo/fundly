import './selection-details.css';
import { Button, LayerCard } from '@nocoo/basalt';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@nocoo/basalt/components/table';
import { ArrowLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import useSWR from 'swr';
import { ApiError, fetchAPI } from '@/api';
import { CandlestickChart } from '@/components/charts/candlestick-chart';
import {
  ChartControls,
  type ChartInterval,
  type ChartYears,
  DataInfo,
  defaultInterval,
} from '@/components/charts/market-chart-controls';
import { StockFinancialChart } from '@/components/charts/stock-financial-chart';
import { AppShell } from '@/components/layout';
import {
  PanelHeading,
  ResearchEmpty,
  ResearchHeader,
  StatTile,
} from '@/components/layout/research-layout';
import { Metric } from '@/components/ui/metric';
import { formatMetric, formatPercent } from '@/lib/format-number';
import { listBackLabel, listHref, readReturnEtf, resolveListOrigin } from '@/lib/list-origin';

import type { StockRowDto } from '../../../../apps/worker/src/lib/selection-service';

interface StockDetailResponse {
  ready: boolean;
  found: boolean;
  detail: {
    catalog: {
      symbol: string;
      ticker: string;
      name: string;
      exchange: string;
      industryThscode: string | null;
      industryName: string | null;
      isFinancial: boolean;
    };
    metrics: StockRowDto;
    valuation: {
      tradeDate: string | null;
      timestamp: number | null;
      peTtm: number | null;
      peMrq: number | null;
      pbMrq: number | null;
      psTtm: number | null;
      pcfTtm: number | null;
    };
    statements: Array<{
      fiscalYear: number;
      periodEnd: string;
      reportDate: string;
      currency: string;
      income: Record<string, unknown> | null;
      balance: Record<string, unknown> | null;
      cashFlow: Record<string, unknown> | null;
    }>;
    indicators: Array<{
      report: string;
      abilities: Array<{
        ability: string;
        indicators: Array<{ index_id: string; value: string | number | null }>;
      }>;
    }>;
  };
}

export function StockDetailPage() {
  const { symbol = '' } = useParams<{ symbol: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const [years, setYears] = useState<ChartYears>(1);
  const [interval, setInterval] = useState<ChartInterval>('day');

  const origin = useMemo(() => resolveListOrigin(location.state, '/stocks'), [location.state]);
  const returnEtf = readReturnEtf(location.state);

  const {
    data: detailData,
    error: detailError,
    isLoading: isDetailLoading,
    mutate: mutateDetail,
  } = useSWR<StockDetailResponse>(
    symbol ? `/api/selection/stocks/${encodeURIComponent(symbol)}` : null,
    fetchAPI,
  );

  const {
    data: barsData,
    error: barsError,
    isLoading: isBarsLoading,
    mutate: mutateBars,
  } = useSWR<{
    bars: Array<{
      date: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number | null;
      turnover: number | null;
    }>;
    coverage: {
      hasBars: boolean;
      totalBars: number;
      startDate: string;
      endDate: string;
      isFullWindow: boolean;
    };
  }>(
    symbol
      ? `/api/selection/stocks/${encodeURIComponent(symbol)}/bars?years=${years}&interval=${interval}`
      : null,
    fetchAPI,
  );

  const detail = detailData?.detail;
  const notFound = detailError instanceof ApiError && detailError.status === 404;
  const notReady = detailError instanceof ApiError && detailError.status === 503;

  return (
    <AppShell>
      <div className="mb-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            returnEtf
              ? navigate(`/etfs/${returnEtf}`, { state: { list: listHref(origin) } })
              : navigate(listHref(origin))
          }
          className="text-xs text-basalt-muted-foreground hover:text-basalt-foreground gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          {returnEtf ? '返回 ETF 详情' : listBackLabel(origin)}
        </Button>
      </div>

      {isDetailLoading ? (
        <LayerCard.Loading label="正在读取股票档案详情..." className="py-24" />
      ) : detailError || !detailData?.found || !detail ? (
        <ResearchEmpty
          title={notFound ? '未找到该股票标的' : notReady ? '股票资料尚未就绪' : '股票详情加载失败'}
          description={
            notFound
              ? '当前目录中没有这个代码，可以返回列表重新查找。'
              : notReady
                ? '研究资料尚未完成首次同步，请稍后查看。'
                : detailError
                  ? '网络请求或服务暂不可用，请稍后重试。'
                  : '当前没有可用的标的资料，请稍后重试。'
          }
          action={
            !notFound ? (
              <Button variant="outline" size="sm" onClick={() => void mutateDetail()}>
                重试加载
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ResearchHeader
            title={detail.catalog.name}
            description={`${detail.catalog.symbol} · ${detail.catalog.industryName ?? '行业未分类'} · 交易所 ${detail.catalog.exchange}`}
            actions={
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-basalt-muted-foreground">
                  扶摇 · 行情 {detail.metrics.tradeDate ?? '暂无'}
                  {detail.metrics.fiscalYear ? ` · ${detail.metrics.fiscalYear} 年报` : ''}
                </span>
                {detail.catalog.industryName && (
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      to={`/select-stock/valuation?exchange=all&industry=${encodeURIComponent(detail.catalog.industryName)}`}
                    >
                      同行业比较
                    </Link>
                  </Button>
                )}
                <DataInfo name="股票口径提示" source="fuyao" date={detail.metrics.tradeDate}>
                  <p>
                    日 K
                    走势为前复权历史价格（经企业行动分红送配等连续调整计算，允许除权产生的负值，非原始撮合价）；财务数据按年度会计期间严格对齐；金融股不参与通用现金质量筛选。
                  </p>
                  <p>
                    估值源日期{' '}
                    {detail.metrics.valuationTimestamp
                      ? new Date(detail.metrics.valuationTimestamp).toLocaleDateString('zh-CN')
                      : '暂无'}
                    （上游批内最新有效时间，并非每项指标同时更新）；财报期末{' '}
                    {detail.metrics.periodEnd ?? '暂无'}，披露/修订日{' '}
                    {detail.metrics.reportDate ?? '暂无'}。历史图不代表原始成交价。
                  </p>
                </DataInfo>
              </div>
            }
          />

          <div className="selection-summary" data-selection-summary>
            <StatTile
              label="最新价格"
              value={formatMetric(detail.metrics.price, 'ratio')}
              hint={<Metric value={detail.metrics.changePct} kind="percent" signed />}
            />
            <StatTile
              label="PE / TTM"
              value={formatMetric(detail.metrics.peTtm, 'ratio')}
              hint={`PB / MRQ ${formatMetric(detail.metrics.pbMrq, 'ratio')}`}
            />
            <StatTile
              label="加权 ROE"
              value={formatPercent(detail.metrics.roeWeighted)}
              hint={`扣非 ROE ${formatPercent(detail.metrics.roeDeductedWeighted)}`}
            />
            <StatTile
              label="年报营收同比"
              value={<Metric value={detail.metrics.revenueYoy} kind="percent" signed />}
              hint={`归母净利润 ${formatMetric(detail.metrics.profitYoy, 'percent', { signed: true })}`}
            />
            <StatTile
              label="经营现金流 / 净利润"
              value={formatMetric(detail.metrics.cashProfitRatio, 'ratio')}
              hint={
                detail.catalog.isFinancial
                  ? '金融行业单独比较'
                  : `资产负债率 ${formatPercent(detail.metrics.debtRatio)}`
              }
            />
          </div>

          {/* 大 K 线主体区 (前复权) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div className="lg:col-span-2">
              <LayerCard className="selection-candle-panel">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">前复权价格走势</span>
                    <span className="text-xs text-basalt-muted-foreground bg-basalt-muted px-1.5 py-0.5 rounded">
                      前复权 (真实 OHLC)
                    </span>
                  </div>
                  <ChartControls
                    years={years}
                    interval={interval}
                    onYearsChange={(value) => {
                      setYears(value);
                      setInterval(defaultInterval(value));
                    }}
                    onIntervalChange={setInterval}
                  />
                </div>

                <div className="selection-candle-body">
                  {isBarsLoading ? (
                    <LayerCard.Loading label="正在加载前复权 K 线历史走势..." className="h-full" />
                  ) : barsError ? (
                    <ResearchEmpty
                      title="K 线历史加载失败"
                      description="网络请求错误，请点击重试。"
                      action={
                        <Button variant="outline" size="sm" onClick={() => void mutateBars()}>
                          重试
                        </Button>
                      }
                    />
                  ) : barsData?.bars && barsData.bars.length > 0 ? (
                    <CandlestickChart
                      bars={barsData.bars}
                      height="fill"
                      unit="元"
                      volumeUnit="股"
                    />
                  ) : (
                    <ResearchEmpty
                      title="暂无前复权 K 线数据"
                      description="当前研究资料尚未包含这只股票的价格历史，已有行情与估值仍可查阅。"
                    />
                  )}
                </div>
                {barsData?.bars.length ? (
                  <p className="mt-2 text-[11px] text-basalt-muted-foreground">
                    {barsData.coverage.startDate} — {barsData.coverage.endDate} ·{' '}
                    {barsData.coverage.totalBars} 根
                    {interval === 'day' ? '日' : interval === 'week' ? '周' : '月'} K
                    {barsData.coverage.isFullWindow ? '' : ` · 已有历史不足 ${years} 年`}
                  </p>
                ) : null}
              </LayerCard>
            </div>

            {/* 右侧：估值与趋势指标摘要 */}
            <div className="flex flex-col gap-3">
              <LayerCard className="p-4 flex-1">
                <PanelHeading title="估值与趋势指标" />
                <div className="space-y-3 mt-3 text-xs">
                  <div className="flex justify-between py-1 border-b border-basalt-border/50">
                    <span className="text-basalt-muted-foreground">市盈率 PE (TTM / MRQ)</span>
                    <span className="font-mono font-medium">
                      {detail.metrics.peTtm?.toFixed(2) ?? '—'} /{' '}
                      {detail.metrics.peMrq?.toFixed(2) ?? '—'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-basalt-border/50">
                    <span className="text-basalt-muted-foreground">市销率 / 市现率</span>
                    <span className="font-mono font-medium">
                      {detail.metrics.psTtm?.toFixed(2) ?? '—'} /{' '}
                      {detail.metrics.pcfTtm?.toFixed(2) ?? '—'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-basalt-border/50">
                    <span className="text-basalt-muted-foreground">近1年收益 / CAGR</span>
                    <span className="font-mono font-medium">
                      {formatPercent(detail.metrics.return1y)} /{' '}
                      {formatPercent(detail.metrics.cagr1y)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-basalt-border/50">
                    <span className="text-basalt-muted-foreground">近1年最大回撤</span>
                    <span className="font-mono font-medium">
                      {formatPercent(detail.metrics.maxDrawdown1y)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-basalt-border/50">
                    <span className="text-basalt-muted-foreground">20日 / 60日涨跌</span>
                    <span className="font-mono font-medium">
                      {formatPercent(detail.metrics.return20d)} /{' '}
                      {formatPercent(detail.metrics.return60d)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-basalt-border/50">
                    <span className="text-basalt-muted-foreground">60日均线偏离度</span>
                    <span className="font-mono font-medium">
                      {formatPercent(detail.metrics.ma60Bias)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-basalt-muted-foreground">估值源更新日期</span>
                    <span className="font-mono text-[11px] text-basalt-muted-foreground">
                      {detail.metrics.valuationTimestamp
                        ? new Date(detail.metrics.valuationTimestamp).toLocaleDateString('zh-CN')
                        : '—'}
                    </span>
                  </div>
                </div>
              </LayerCard>

              <LayerCard className="p-4">
                <PanelHeading title="经营质量概览" />
                <div className="space-y-2 mt-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-basalt-muted-foreground">销售毛利率</span>
                    <span className="font-mono">{formatPercent(detail.metrics.grossMargin)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-basalt-muted-foreground">销售净利率</span>
                    <span className="font-mono">{formatPercent(detail.metrics.netMargin)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-basalt-muted-foreground">营收 3年CAGR</span>
                    <span className="font-mono">{formatPercent(detail.metrics.revenueCagr3y)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-basalt-muted-foreground">净利 3年CAGR</span>
                    <span className="font-mono">{formatPercent(detail.metrics.profitCagr3y)}</span>
                  </div>
                </div>
              </LayerCard>
            </div>
          </div>

          {/* 下方：五年财报数据表 */}
          <LayerCard className="p-4 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <PanelHeading
                title="年度经营趋势与财报"
                description="采用当前披露的年度修订值；缺失金额留空。"
              />
              <span className="text-xs text-basalt-muted-foreground whitespace-nowrap">
                {detail.statements.length} 个会计年度 · 金额以亿计
              </span>
            </div>

            {detail.statements.length === 0 ? (
              <ResearchEmpty
                title="暂无年报披露数据"
                description="当前资料中尚无该股票的年度报表。"
              />
            ) : (
              <div>
                <StockFinancialChart
                  statements={detail.statements}
                  currency={detail.metrics.currency ?? detail.statements[0]?.currency ?? 'CNY'}
                />
                <div className="overflow-x-auto">
                  <Table className="[&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">会计年份</TableHead>
                        <TableHead className="w-28">期末截止日</TableHead>
                        <TableHead className="w-28">披露/修订日</TableHead>
                        <TableHead>币种</TableHead>
                        <TableHead className="w-28 text-right">营业收入</TableHead>
                        <TableHead className="w-28 text-right">合并净利润</TableHead>
                        <TableHead className="w-28 text-right">归母净利润</TableHead>
                        <TableHead className="w-28 text-right">经营现金流</TableHead>
                        <TableHead className="w-28 text-right">购建资产开支</TableHead>
                        <TableHead className="w-28 text-right">现金减开支</TableHead>
                        <TableHead className="w-28 text-right">资产负债率</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.statements.map((s) => {
                        const inc = s.income ?? {};
                        const bal = s.balance ?? {};
                        const cf = s.cashFlow ?? {};
                        const rev =
                          typeof inc.operating_income === 'number'
                            ? (inc.operating_income / 1e8).toFixed(2)
                            : '—';
                        const np =
                          typeof inc.net_profit === 'number'
                            ? (inc.net_profit / 1e8).toFixed(2)
                            : '—';
                        const pnp =
                          typeof inc.parent_holder_net_profit === 'number'
                            ? (inc.parent_holder_net_profit / 1e8).toFixed(2)
                            : '—';
                        const ocf =
                          typeof cf.act_cash_flow_net === 'number'
                            ? (cf.act_cash_flow_net / 1e8).toFixed(2)
                            : '—';
                        const capex =
                          typeof cf.pay_fixed_assets_etc_cash === 'number'
                            ? (cf.pay_fixed_assets_etc_cash / 1e8).toFixed(2)
                            : '—';
                        const netCf =
                          typeof cf.act_cash_flow_net === 'number' &&
                          typeof cf.pay_fixed_assets_etc_cash === 'number'
                            ? ((cf.act_cash_flow_net - cf.pay_fixed_assets_etc_cash) / 1e8).toFixed(
                                2,
                              )
                            : '—';
                        const debt =
                          typeof bal.total_debt === 'number' &&
                          typeof bal.assets_total === 'number' &&
                          bal.assets_total > 0
                            ? `${((bal.total_debt / bal.assets_total) * 100).toFixed(2)}%`
                            : '—';

                        return (
                          <TableRow key={s.fiscalYear}>
                            <TableCell className="font-semibold text-xs">
                              {s.fiscalYear} 年度
                            </TableCell>
                            <TableCell className="font-mono text-xs text-basalt-muted-foreground">
                              {s.periodEnd}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-basalt-muted-foreground">
                              {s.reportDate}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{s.currency}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{rev}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{np}</TableCell>
                            <TableCell className="text-right font-mono text-xs font-semibold">
                              {pnp}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">{ocf}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{capex}</TableCell>
                            <TableCell className="text-right font-mono text-xs font-semibold">
                              {netCf}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">{debt}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </LayerCard>
        </>
      )}
    </AppShell>
  );
}
export default StockDetailPage;
