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
import { fetchAPI } from '@/api';
import { CandlestickChart } from '@/components/charts/candlestick-chart';
import {
  ChartControls,
  type ChartInterval,
  type ChartYears,
  DataInfo,
} from '@/components/charts/market-chart-controls';
import { AppShell } from '@/components/layout';
import { PanelHeading, ResearchEmpty, ResearchHeader } from '@/components/layout/research-layout';
import { formatMetric, formatPercent } from '@/lib/format-number';
import { listBackLabel, resolveListOrigin, stockDetailTo } from '@/lib/list-origin';

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
          title={detailError ? 'ETF 详情加载失败' : '未找到该 ETF 标的'}
          description={
            detailError
              ? '网络请求或服务暂不可用，请稍后重试。'
              : '该标的可能未在当前目录中，或数据表尚未就绪。'
          }
          action={
            detailError ? (
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
              <div className="flex items-center gap-3">
                {detail.catalog.linkedFundCode && (
                  <Link
                    to={`/funds/${detail.catalog.linkedFundCode}`}
                    className="text-xs text-basalt-primary hover:underline flex items-center gap-1 bg-basalt-primary/10 px-2 py-1 rounded"
                  >
                    查看场内核验基金档案
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                )}
                <DataInfo name="ETF 口径提示">
                  <p>
                    日K线基于交易所真实撮合成交价(无复权)；折溢价率需同日有收盘价与单位净值；披露重仓为基金定期报告公布，非实时组合。
                  </p>
                </DataInfo>
              </div>
            }
          />

          {/* 核心指标 KPI */}
          <div className="research-stats mb-4">
            <LayerCard className="research-stat">
              <span className="text-xs text-basalt-muted-foreground">最新市价 / 净值</span>
              <div className="research-stat-value">
                {formatMetric(detail.metrics.marketPrice, 'nav')}
              </div>
              <span className="text-[11px] text-basalt-muted-foreground">
                净值 {formatMetric(detail.metrics.unitNav, 'nav')}
              </span>
            </LayerCard>
            <LayerCard className="research-stat">
              <span className="text-xs text-basalt-muted-foreground">折溢价率</span>
              <div
                className={`research-stat-value ${
                  (detail.metrics.premiumDiscountPct ?? 0) > 0
                    ? 'text-basalt-red'
                    : (detail.metrics.premiumDiscountPct ?? 0) < 0
                      ? 'text-basalt-green'
                      : ''
                }`}
              >
                {detail.metrics.premiumDiscountPct !== null
                  ? `${detail.metrics.premiumDiscountPct > 0 ? `+${detail.metrics.premiumDiscountPct}` : detail.metrics.premiumDiscountPct}%`
                  : '—'}
              </div>
              <span className="text-[11px] text-basalt-muted-foreground">
                {detail.metrics.navDate ? `净值日 ${detail.metrics.navDate}` : '无同日净值'}
              </span>
            </LayerCard>
            <LayerCard className="research-stat">
              <span className="text-xs text-basalt-muted-foreground">管理 + 托管费</span>
              <div className="research-stat-value">
                {formatPercent(detail.metrics.totalExpensePct)}
              </div>
              <span className="text-[11px] text-basalt-muted-foreground">
                管理 {formatPercent(detail.metrics.mgmtFeePct)} / 托管{' '}
                {formatPercent(detail.metrics.custodyFeePct)}
              </span>
            </LayerCard>
            <LayerCard className="research-stat">
              <span className="text-xs text-basalt-muted-foreground">披露资产规模</span>
              <div className="research-stat-value">
                {detail.metrics.scaleYi ? `${detail.metrics.scaleYi} 亿元` : '—'}
              </div>
              <span className="text-[11px] text-basalt-muted-foreground">
                {detail.metrics.scalePeriod ? `报告期 ${detail.metrics.scalePeriod}` : '暂未披露'}
              </span>
            </LayerCard>
            <LayerCard className="research-stat">
              <span className="text-xs text-basalt-muted-foreground">20日日均成交</span>
              <div className="research-stat-value">
                {formatMetric(detail.metrics.avgTurnover20d, 'compact')}
              </div>
              <span className="text-[11px] text-basalt-muted-foreground">
                当日成交 {formatMetric(detail.metrics.turnover, 'compact')}
              </span>
            </LayerCard>
          </div>

          {/* 大 K 线主体区 (桌面约占三分之二，右侧紧凑摘要) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div className="lg:col-span-2">
              <LayerCard className="p-4 flex flex-col h-[520px]">
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
                    onYearsChange={setYears}
                    onIntervalChange={setInterval}
                  />
                </div>

                <div className="flex-1 min-h-[440px] relative">
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
                      volumeUnit="股"
                    />
                  ) : (
                    <ResearchEmpty
                      title="暂无场内真实 K 线历史"
                      description="该 ETF 未进入深度日 K 采集池，或近期无交易所成交撮合记录。"
                    />
                  )}
                </div>
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
                      {detail.metrics.return1y !== null ? `${detail.metrics.return1y}%` : '—'} /{' '}
                      {detail.metrics.cagr1y !== null ? `${detail.metrics.cagr1y}%` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-basalt-border/50">
                    <span className="text-basalt-muted-foreground">近1年最大回撤</span>
                    <span className="font-mono font-medium">
                      {detail.metrics.maxDrawdown1y !== null
                        ? `${detail.metrics.maxDrawdown1y}%`
                        : '—'}
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
                      {detail.metrics.return3y !== null ? `${detail.metrics.return3y}%` : '—'} /{' '}
                      {detail.metrics.cagr3y !== null ? `${detail.metrics.cagr3y}%` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-basalt-border/50">
                    <span className="text-basalt-muted-foreground">近3年最大回撤</span>
                    <span className="font-mono font-medium">
                      {detail.metrics.maxDrawdown3y !== null
                        ? `${detail.metrics.maxDrawdown3y}%`
                        : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-basalt-border/50">
                    <span className="text-basalt-muted-foreground">近5年收益 / 回撤</span>
                    <span className="font-mono font-medium">
                      {detail.metrics.return5y !== null ? `${detail.metrics.return5y}%` : '—'} /{' '}
                      {detail.metrics.maxDrawdown5y !== null
                        ? `${detail.metrics.maxDrawdown5y}%`
                        : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-basalt-muted-foreground">计算基准依据</span>
                    <span className="font-mono text-[11px] text-basalt-muted-foreground">
                      {detail.metrics.navRiskBasis === 'adj_nav'
                        ? '扶摇复权净值'
                        : detail.metrics.navRiskBasis === 'local_total_return'
                          ? '本地全收益分红链'
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
                  <div className="flex justify-between">
                    <span className="text-basalt-muted-foreground">未注日期静态规模</span>
                    <span className="font-mono">
                      {detail.profile.fundScale
                        ? `${(detail.profile.fundScale / 1e8).toFixed(2)} 亿`
                        : '—'}
                    </span>
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
                <ResearchEmpty title="暂无持仓披露明细" description="该产品尚未公布重仓股持仓。" />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">序号</TableHead>
                        <TableHead>代码 / 标的</TableHead>
                        <TableHead className="text-right">持仓占比</TableHead>
                        <TableHead className="text-right">持股市值</TableHead>
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
                            <Link
                              to={stockDetailTo(h.stockCode, origin).to}
                              state={stockDetailTo(h.stockCode, origin).state}
                              className="font-medium text-xs text-basalt-primary hover:underline block"
                            >
                              {h.stockName}
                            </Link>
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
                  <Table>
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
