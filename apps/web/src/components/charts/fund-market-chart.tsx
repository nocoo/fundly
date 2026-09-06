import { Button, LayerCard } from '@nocoo/basalt';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router';
import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { ResearchEmpty } from '@/components/layout/research-layout';
import { Metric } from '@/components/ui/metric';
import { formatMetric } from '@/lib/format-number';
import { CandlestickChart } from './candlestick-chart';
import {
  type ChartInterval,
  type ChartYears,
  DataInfo,
  HistoryRange,
  INTERVAL_LABEL,
  type MarketBarsResponse,
} from './market-chart-controls';

export function FundMarketChart({
  instrument,
  years,
  interval,
  onViewNav,
}: {
  instrument: { id: string; name: string; symbol: string };
  years: ChartYears;
  interval: ChartInterval;
  onViewNav: () => void;
}) {
  const { data, error, isLoading, mutate } = useSWR<MarketBarsResponse>(
    `/api/market/bars/${encodeURIComponent(instrument.id)}?years=${years}&interval=${interval}`,
    fetchAPI,
  );
  const latest = data?.bars.at(-1);
  const high = data?.bars.length ? Math.max(...data.bars.map((bar) => bar.high)) : null;
  const low = data?.bars.length ? Math.min(...data.bars.map((bar) => bar.low)) : null;
  const marketParams = new URLSearchParams({
    instrument: instrument.id,
    years: String(years),
    interval,
  });

  return (
    <div
      className="research-fund-chart-body"
      data-fund-market-chart={instrument.id}
      aria-busy={isLoading}
    >
      {isLoading ? (
        <LayerCard.Loading label="加载场内行情" className="my-auto" />
      ) : error || !latest || !data ? (
        <div className="my-auto">
          <ResearchEmpty
            title={error ? '场内行情加载失败' : '所选范围暂无交易行情'}
            description="仍可切换查看基金净值与基准。"
            action={
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => void mutate()}>
                  重试
                </Button>
                <Button variant="ghost" size="sm" onClick={onViewNav}>
                  查看净值
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <>
          <div className="research-chart-summary">
            <div>
              <div className="flex items-center gap-1 text-xs text-basalt-muted-foreground">
                收盘价 · {instrument.symbol}
                <DataInfo name="场内交易行情" source="fuyao" date={latest.date}>
                  <p>
                    交易所未复权价格。周 K、月 K
                    由真实日线聚合；基金净值和收益指标使用各自数据口径。
                  </p>
                </DataInfo>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-3xl font-semibold tracking-tight tabular-nums">
                  {formatMetric(latest.close, 'nav')}
                </span>
                <span className="text-xs text-basalt-muted-foreground">
                  {data.instrument?.unit || '元'}
                </span>
              </div>
            </div>
            <div className="research-chart-metrics">
              <div>
                <span>区间涨跌</span>
                <Metric value={data.range?.changePct} kind="percent" signed />
              </div>
              <div>
                <span>区间最高</span>
                <strong>{formatMetric(high, 'nav')}</strong>
              </div>
              <div>
                <span>区间最低</span>
                <strong>{formatMetric(low, 'nav')}</strong>
              </div>
            </div>
          </div>
          <div className="research-candle-plot">
            <CandlestickChart
              key={`${instrument.id}-${years}-${interval}`}
              bars={data.bars}
              height="fill"
              unit={data.instrument?.unit || '元'}
              volumeUnit={data.instrument?.volumeUnit}
              ariaLabel={`${instrument.name} ${years}年${INTERVAL_LABEL[interval]}`}
            />
          </div>
          <HistoryRange data={data} />
        </>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-basalt-border/55 pt-3">
        <span className="text-[11px] text-basalt-muted-foreground">场内交易价格 · 含成交量</span>
        <Button variant="ghost" size="sm" asChild className="h-7 text-xs">
          <Link to={`/market?${marketParams}`}>
            放入宏观视野 <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
          </Link>
        </Button>
      </div>
    </div>
  );
}
