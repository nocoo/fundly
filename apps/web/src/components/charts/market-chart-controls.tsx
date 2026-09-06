import { Button } from '@nocoo/basalt';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@nocoo/basalt/components/popover';
import { ToggleGroup, ToggleGroupItem } from '@nocoo/basalt/components/toggle-group';
import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CandlestickBar } from './candlestick-chart';

export type ChartYears = 1 | 3 | 5;
export type ChartInterval = 'day' | 'week' | 'month';
export const INTERVAL_LABEL = { day: '日K', week: '周K', month: '月K' } as const;
export const defaultInterval = (years: ChartYears): ChartInterval =>
  years === 1 ? 'day' : years === 3 ? 'week' : 'month';

export interface MarketBarsResponse {
  instrument: {
    id: string;
    name: string;
    symbol: string;
    unit: string;
    volumeUnit: string | null;
  } | null;
  bars: CandlestickBar[];
  range: {
    years: ChartYears;
    interval: ChartInterval;
    requestedFrom: string | null;
    requestedTo: string | null;
    availableFrom: string | null;
    availableTo: string | null;
    displayedFrom: string | null;
    displayedTo: string | null;
    dailyCount: number;
    isPartial: boolean;
    changePct: number | null;
  } | null;
}

export function ChartControls({
  years,
  interval,
  onYearsChange,
  onIntervalChange,
}: {
  years: ChartYears;
  interval: ChartInterval;
  onYearsChange: (years: ChartYears) => void;
  onIntervalChange: (interval: ChartInterval) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        type="single"
        value={String(years)}
        onValueChange={(value) => value && onYearsChange(Number(value) as ChartYears)}
        aria-label="观察范围"
      >
        {[1, 3, 5].map((value) => (
          <ToggleGroupItem key={value} value={String(value)}>
            {value} 年
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <ToggleGroup
        type="single"
        value={interval}
        onValueChange={(value) => value && onIntervalChange(value as ChartInterval)}
        aria-label="K线周期"
      >
        {(['day', 'week', 'month'] as const).map((value) => (
          <ToggleGroupItem key={value} value={value}>
            {INTERVAL_LABEL[value]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

const SOURCE_NAMES: Record<string, string> = {
  fuyao: '同花顺 · 扶摇金融 API',
  shfe: '上海期货交易所',
  cboe: 'Cboe',
  ecb: '欧洲中央银行 ECB',
  fred: '美联储 FRED',
  chinamoney_shibor: '中国货币网 · Shibor',
  chinamoney_lpr: '中国货币网 · LPR',
};

export function DataInfo({
  name,
  source,
  date,
  collectedAt,
  children,
}: {
  name: string;
  source?: string | null;
  date?: string | null;
  collectedAt?: number | null;
  children?: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-basalt-muted-foreground hover:text-basalt-foreground"
          aria-label={`${name}数据说明`}
        >
          <Info className="h-3.5 w-3.5" strokeWidth={1.5} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <PopoverTitle>{name}</PopoverTitle>
        <div className="mt-2 space-y-1.5 text-xs leading-relaxed text-basalt-muted-foreground">
          {source ? <p>来源：{SOURCE_NAMES[source.toLowerCase()] ?? source}</p> : null}
          <p>数据日期：{date || '未提供'}</p>
          {collectedAt ? (
            <p>
              采集时间：
              {new Date(collectedAt).toLocaleString('zh-CN', {
                timeZone: 'Asia/Shanghai',
                hour12: false,
              })}
            </p>
          ) : null}
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function HistoryRange({ data }: { data?: MarketBarsResponse }) {
  const range = data?.range;
  if (!range) return null;
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-basalt-muted-foreground"
      data-history-range=""
    >
      <span className="font-mono tabular-nums">
        {range.displayedFrom || '—'} — {range.displayedTo || '—'}
      </span>
      <span>
        {range.isPartial ? '可用历史 · ' : ''}
        {range.dailyCount} 个交易日 · {data.bars.length} 根{INTERVAL_LABEL[range.interval]}
      </span>
    </div>
  );
}
