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
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
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
import { AppShell } from '@/components/layout';
import {
  PanelHeading,
  ResearchEmpty,
  ResearchHeader,
  StatTile,
} from '@/components/layout/research-layout';
import { formatMetric, formatPercent } from '@/lib/format-number';
import {
  fundDetailLink,
  isDomesticStockHolding,
  listBackLabel,
  resolveListOrigin,
  stockDetailLink,
} from '@/lib/list-origin';

import type { EtfRowDto } from '../../../../apps/worker/src/lib/selection-service';

interface EtfDetailResponse {
  ready: boolean;
  found: boolean;
  detail: {
    catalog: {
      symbol: string;
      ticker: string;
      name: string;
      exchange: string;
      assetClass: string;
      directionTag: string | null;
      linkedFundCode: string | null;
    };
    metrics: EtfRowDto;
    profile: {
      estabDate: string | null;
      mgmtName: string | null;
      managerName: string | null;
      fundScale: number | null;
      mgmtFeePct: number | null;
      custodyFeePct: number | null;
    };
    financials: Array<{
      startDate: string;
      endDate: string;
      publishDate: string;
      assetNav: number | null;
    }>;
    holdings: Array<{
      reportDate: string;
      stockCode: string;
      stockName: string;
      assetType: string;
      holdRatio: number | null;
      positionCapital: number | null;
      positionCount: number | null;
    }>;
  };
}

export function EtfDetailPage() {
  const { symbol = '' } = useParams<{ symbol: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const [years, setYears] = useState<ChartYears>(1);
  const [interval, setInterval] = useState<ChartInterval>('day');

  const origin = useMemo(() => resolveListOrigin(location.state, '/etfs'), [location.state]);

  const {
    data: detailData,
    error: detailError,
    isLoading: isDetailLoading,
    mutate: mutateDetail,
  } = useSWR<EtfDetailResponse>(
    symbol ? `/api/selection/etfs/${encodeURIComponent(symbol)}` : null,
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
      ? `/api/selection/etfs/${encodeURIComponent(symbol)}/bars?years=${years}&interval=${interval}`
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
          onClick={() => navigate(origin.search ? `${origin.path}${origin.search}` : origin.path)}
          className="text-xs text-basalt-muted-foreground hover:text-basalt-foreground gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          {listBackLabel(origin)}
        </Button>
      </div>

      {isDetailLoading ? (
        <LayerCard.Loading label="正在读取 ETF 档案详情..." className="py-24" />
      ) : detailError || !detailData?.found || !detail ? (
        <ResearchEmpty
          title={notFound ? '未找到该ETF标的' : notReady ? 'ETF资料尚未就绪' : 'ETF详情加载失败'}
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
            description={`${detail.catalog.symbol} · ${detail.catalog.assetClass} · ${detail.catalog.directionTag ?? '未分类'} · 交易所 ${detail.catalog.exchange}`}
            actions={
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-basalt-muted-foreground">
                  行情 {detail.metrics.marketTradeDate ?? '暂无'} · 净值{' '}
                  {detail.metrics.navDate ?? '暂无'}
                </span>
                {detail.catalog.linkedFundCode && (
                  <Link
                    {...fundDetailLink(detail.catalog.linkedFundCode, origin)}
                    className="text-xs text-basalt-primary hover:underline flex items-center gap-1 bg-basalt-primary/10 px-2 py-1 rounded"
                  >
                    基金档案
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                )}
                <DataInfo
                  name="ETF 口径提示"
                  source="fuyao"
                  date={detail.metrics.marketTradeDate ?? detail.metrics.navDate}
                >
                  <p>
                    行情及披露资料来自扶摇
                    Financial-API，已核验的基金资料补充自东方财富。净值风险数据截止{' '}
                    {detail.metrics.navRiskAsof ?? '暂无'}；规模披露日{' '}
                    {detail.metrics.scaleDisclosureDate ?? '来源未提供'}
                    。管理与托管费不含券商佣金及买卖价差。
                  </p>
                  <p>
                    日K线基于交易所真实撮合成交价(无复权)；折溢价率需同日有收盘价与单位净值；披露重仓为基金定期报告公布，非实时组合。
                  </p>
                </DataInfo>
              </div>
            }
          />

          {/* 核心指标 KPI */}
          <div className="selection-summary" data-selection-summary>
            <StatTile
              label="最新市价"
              value={formatMetric(detail.metrics.marketPrice, 'nav')}
              hint={`单位净值 ${formatMetric(detail.metrics.unitNav, 'nav')}`}
            />
            <StatTile
              label="同日收盘折溢价"
              value={formatMetric(detail.metrics.premiumDiscountPct, 'percent', { signed: true })}
              hint="仅同日收盘价与单位净值可比"
            />
            <StatTile
              label="管理 + 托管费 / 年"
              value={formatPercent(detail.metrics.totalExpensePct)}
              hint={`管理 ${formatPercent(detail.metrics.mgmtFeePct)} · 托管 ${formatPercent(detail.metrics.custodyFeePct)}`}
            />
            <StatTile
              label="披露资产规模"
              value={`${formatMetric(detail.metrics.scaleYi, 'scale')}${detail.metrics.scaleYi === null ? '' : ' 亿'}`}
              hint={
                detail.metrics.scalePeriod ? `报告期 ${detail.metrics.scalePeriod}` : '暂无披露规模'
              }
            />
            <StatTile
              label="20 日均成交额"
              value={formatMetric(detail.metrics.avgTurnover20d, 'compact')}
              hint={`当日成交 ${formatMetric(detail.metrics.turnover, 'compact')}`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div className="lg:col-span-2">
              <LayerCard className="selection-candle-panel">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">场内价格走势</span>
                    <span className="text-xs text-basalt-muted-foreground bg-basalt-muted px-1.5 py-0.5 rounded">
                      不复权真实成交
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
                    <LayerCard.Loading label="正在加载日 K 线历史走势..." className="h-full" />
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
                      volumeUnit="份"
                    />
                  ) : (
                    <ResearchEmpty
                      title="暂无场内真实 K 线历史"
                      description="当前资料尚未包含这只 ETF 的场内价格历史，已有净值与披露资料仍可查阅。"
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

            {/* 右侧：风险收益与资料摘要 */}
            <div className="flex flex-col gap-3">
              <LayerCard className="p-4 flex-1">
                <PanelHeading title="多周期收益与风险" />
                <div className="space-y-3 mt-3 text-xs">
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
                    <span className="text-basalt-muted-foreground">近1年年化波动</span>
                    <span className="font-mono font-medium">
                      {formatPercent(detail.metrics.volatility1y)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-basalt-border/50">
                    <span className="text-basalt-muted-foreground">近3年收益 / CAGR</span>
                    <span className="font-mono font-medium">
                      {formatPercent(detail.metrics.return3y)} /{' '}
                      {formatPercent(detail.metrics.cagr3y)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-basalt-border/50">
                    <span className="text-basalt-muted-foreground">近3年最大回撤</span>
                    <span className="font-mono font-medium">
                      {formatPercent(detail.metrics.maxDrawdown3y)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-basalt-border/50">
                    <span className="text-basalt-muted-foreground">近5年收益 / 回撤</span>
                    <span className="font-mono font-medium">
                      {formatPercent(detail.metrics.return5y)} /{' '}
                      {formatPercent(detail.metrics.maxDrawdown5y)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-basalt-muted-foreground">计算基准依据</span>
                    <span className="font-mono text-[11px] text-basalt-muted-foreground">
                      {detail.metrics.navRiskBasis === 'adj_nav'
                        ? '扶摇复权净值'
                        : detail.metrics.navRiskBasis === 'local_total_return'
                          ? '分红再投资净值（东方财富）'
                          : '暂无净值序列'}
                    </span>
                  </div>
                </div>
              </LayerCard>

              <LayerCard className="p-4">
                <PanelHeading title="产品档案" />
                <div className="space-y-2 mt-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-basalt-muted-foreground">管理人</span>
                    <span>{detail.profile.mgmtName ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-basalt-muted-foreground">现任经理</span>
                    <span>{detail.profile.managerName ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-basalt-muted-foreground">成立日期</span>
                    <span className="font-mono">{detail.profile.estabDate ?? '—'}</span>
                  </div>
                </div>
              </LayerCard>
            </div>
          </div>

          {/* 下方：披露重仓持仓与定期披露规模历史 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 定期披露持股 */}
            <LayerCard className="p-4">
              <div className="flex items-center justify-between mb-2">
                <PanelHeading title="定期披露持仓" />
                {detail.holdings.length > 0 && (
                  <span className="text-xs text-basalt-muted-foreground">
                    报告期: {detail.holdings[0]?.reportDate}
                  </span>
                )}
              </div>
              {detail.holdings.length === 0 ? (
                <ResearchEmpty
                  title="暂无持仓披露明细"
                  description="当前来源没有可用的持仓明细，不代表该产品没有持仓。"
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table className="[&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">序号</TableHead>
                        <TableHead>代码 / 标的</TableHead>
                        <TableHead className="text-right">持仓占比</TableHead>
                        <TableHead className="text-right">持仓市值</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.holdings.map((h, i) => (
                        <TableRow key={h.stockCode}>
                          <TableCell className="text-xs text-basalt-muted-foreground">
                            {i + 1}
                          </TableCell>
                          <TableCell>
                            {/* 支持下钻进入股票详情 */}
                            {isDomesticStockHolding(h.stockCode, h.assetType) ? (
                              <Link
                                to={stockDetailLink(h.stockCode, origin).to}
                                state={{
                                  ...stockDetailLink(h.stockCode, origin).state,
                                  returnEtf: detail.catalog.symbol,
                                }}
                                className="font-medium text-xs text-basalt-primary hover:underline block"
                              >
                                {h.stockName}
                              </Link>
                            ) : (
                              <span className="font-medium text-xs block">{h.stockName}</span>
                            )}
                            <span className="text-[11px] font-mono text-basalt-muted-foreground">
                              {h.stockCode}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatPercent(h.holdRatio)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatMetric(h.positionCapital, 'compact')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </LayerCard>

            {/* 定期披露资产规模 */}
            <LayerCard className="p-4">
              <PanelHeading title="资产规模披露历史" />
              {detail.financials.length === 0 ? (
                <ResearchEmpty
                  title="暂无规模报告历史"
                  description="尚未采集到定期的资产净值记录。"
                />
              ) : (
                <div className="overflow-x-auto mt-2">
                  <Table className="[&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
                    <TableHeader>
                      <TableRow>
                        <TableHead>报告期截止</TableHead>
                        <TableHead>信息披露日</TableHead>
                        <TableHead className="text-right">资产净值</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.financials.map((f) => (
                        <TableRow key={`${f.endDate}-${f.publishDate}`}>
                          <TableCell className="font-mono text-xs">{f.endDate}</TableCell>
                          <TableCell className="font-mono text-xs text-basalt-muted-foreground">
                            {f.publishDate}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">
                            {f.assetNav !== null ? `${(f.assetNav / 1e8).toFixed(2)} 亿元` : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </LayerCard>
          </div>
        </>
      )}
    </AppShell>
  );
}
export default EtfDetailPage;
