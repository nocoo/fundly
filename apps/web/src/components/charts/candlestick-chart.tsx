/**
 * 真实日 K 线与量能走势组件 (Candlestick Chart + Volume)
 */

import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { useQuoteColor } from '@/hooks/use-quote-color';
import { CHART_TYPE, chartTickStyle, GRID_PROPS } from '@/lib/chart-config';
import { formatCompact } from '@/lib/format-number';
import { quoteToneClass } from '@/lib/quote-color';
import { cn } from '@/lib/utils';

export interface CandlestickBar {
  date: string;
  periodStart?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
  turnover?: number | null;
}

interface CandlestickChartProps {
  bars: CandlestickBar[];
  height?: number | 'fill';
  className?: string;
  unit?: string;
  volumeUnit?: string | null;
  ariaLabel?: string;
}

export function CandlestickChart({
  bars,
  height = 300,
  className,
  unit = '点',
  volumeUnit = '手',
  ariaLabel = '日K线走势图',
}: CandlestickChartProps) {
  const chartId = useId();
  const titleId = `${chartId}-title`;
  const descId = `${chartId}-desc`;
  const [containerWidth, setContainerWidth] = useState<number>(640);
  const observerRef = useRef<ResizeObserver | null>(null);
  const plotObserverRef = useRef<ResizeObserver | null>(null);
  const [canvasHeight, setCanvasHeight] = useState(400);
  const chartHeight = height === 'fill' ? canvasHeight : height;
  const plotCallbackRef = useCallback((node: HTMLDivElement | null) => {
    plotObserverRef.current?.disconnect();
    if (!node) return;
    const resize = () => setCanvasHeight(Math.max(120, Math.floor(node.clientHeight)));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    plotObserverRef.current = observer;
  }, []);
  const { color: quoteColor } = useQuoteColor();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const containerCallbackRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (node) {
      setContainerWidth(Math.floor(node.clientWidth || 640));
      const ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry && entry.contentRect.width > 0) {
          setContainerWidth(Math.floor(entry.contentRect.width));
        }
      });
      ro.observe(node);
      observerRef.current = ro;
    }
  }, []);

  const upColor =
    quoteColor === 'red-up' ? 'var(--color-destructive-text)' : 'var(--color-success-text)';
  const downColor =
    quoteColor === 'red-up' ? 'var(--color-success-text)' : 'var(--color-destructive-text)';

  const hasVolume = useMemo(() => {
    return bars.some(
      (b) => b.volume !== null && b.volume !== undefined && typeof b.volume === 'number',
    );
  }, [bars]);

  const { minPrice, maxPrice, priceRange, maxVolume, points, priceHeight, volumeHeight, margin } =
    useMemo(() => {
      const margin = { top: 10, right: 68, bottom: 20, left: 6 };
      const plotWidth = Math.max(100, containerWidth - margin.left - margin.right);
      const plotHeight = Math.max(80, chartHeight - margin.top - margin.bottom);
      const priceHeight = hasVolume ? Math.max(50, plotHeight * 0.77) : plotHeight;
      const volumeHeight = hasVolume ? Math.max(25, plotHeight * 0.18) : 0;

      if (!bars || bars.length === 0) {
        return {
          minPrice: 0,
          maxPrice: 1,
          priceRange: 1,
          maxVolume: 0,
          points: [],
          priceHeight,
          volumeHeight,
          margin,
        };
      }

      let minP = Number.POSITIVE_INFINITY;
      let maxP = Number.NEGATIVE_INFINITY;
      let maxV = 0;

      for (const b of bars) {
        if (b.low < minP) minP = b.low;
        if (b.high > maxP) maxP = b.high;
        if (b.volume !== null && b.volume !== undefined && b.volume > maxV) maxV = b.volume;
      }

      if (!Number.isFinite(minP) || !Number.isFinite(maxP)) {
        minP = 0;
        maxP = 1;
      }

      const padding = (maxP - minP) * 0.05 || maxP * 0.05 || 1;
      const adjustedMin = Math.max(0, minP - padding);
      const adjustedMax = maxP + padding;
      const priceRange = adjustedMax - adjustedMin || 1;

      const n = bars.length;
      const barWidth = Math.max(0.4, Math.min(18, (plotWidth / n) * 0.68));
      const step = plotWidth / n;

      const points = bars.map((b, i) => {
        const x = margin.left + i * step + step / 2;
        const yOpen = margin.top + priceHeight * (1 - (b.open - adjustedMin) / priceRange);
        const yClose = margin.top + priceHeight * (1 - (b.close - adjustedMin) / priceRange);
        const yHigh = margin.top + priceHeight * (1 - (b.high - adjustedMin) / priceRange);
        const yLow = margin.top + priceHeight * (1 - (b.low - adjustedMin) / priceRange);

        const isUp = b.close >= b.open;
        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));

        const vTop = margin.top + priceHeight + (plotHeight - priceHeight - volumeHeight);
        const vHeight =
          maxV > 0 && b.volume !== null && b.volume !== undefined
            ? (b.volume / maxV) * volumeHeight
            : 0;
        const yVol = vTop + volumeHeight - vHeight;

        return {
          ...b,
          x,
          yOpen,
          yClose,
          yHigh,
          yLow,
          bodyTop,
          bodyHeight,
          barWidth,
          isUp,
          yVol,
          vHeight,
        };
      });

      return {
        minPrice: adjustedMin,
        maxPrice: adjustedMax,
        priceRange,
        maxVolume: maxV,
        points,
        priceHeight,
        volumeHeight,
        margin,
      };
    }, [bars, chartHeight, containerWidth, hasVolume]);

  const hasBars = bars.length > 0;
  const activeIndex =
    hasBars && hoverIndex !== null && hoverIndex >= 0 && hoverIndex < bars.length
      ? hoverIndex
      : hasBars
        ? bars.length - 1
        : 0;
  const activeBar = hasBars ? bars[activeIndex] : null;
  const prevBar = hasBars && activeIndex > 0 ? bars[activeIndex - 1] : null;
  const activePoint = hasBars ? points[activeIndex] : null;

  const activeChangePct =
    activeBar && prevBar && prevBar.close > 0
      ? Number((((activeBar.close - prevBar.close) / prevBar.close) * 100).toFixed(2))
      : null;

  const tickCount = chartHeight > 400 ? 6 : 4;
  const priceTicks = Array.from(
    { length: tickCount },
    (_, i) => maxPrice - (priceRange * i) / (tickCount - 1),
  );
  const timeTickCount = Math.min(bars.length, containerWidth > 700 ? 6 : 3);
  const timeTicks = Array.from({ length: timeTickCount }, (_, i) =>
    Math.round((i * (bars.length - 1)) / Math.max(1, timeTickCount - 1)),
  );

  const valueText = activeBar
    ? `${activeBar.date}：开盘 ${activeBar.open}，最高 ${activeBar.high}，最低 ${activeBar.low}，收盘 ${activeBar.close}${unit ? ` ${unit}` : ''}${
        activeChangePct !== null
          ? `，较前收 ${activeChangePct > 0 ? `+${activeChangePct}%` : `${activeChangePct}%`}`
          : ''
      }`
    : '无数据';

  const handleTouch = useCallback(
    (e: React.TouchEvent<SVGSVGElement>) => {
      const touch = e.touches[0];
      if (!touch) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = touch.clientX - rect.left;
      const plotLeft = margin.left;
      const plotRight = containerWidth - margin.right;
      if (mouseX < plotLeft || mouseX > plotRight) return;
      const n = points.length;
      if (n === 0) return;
      const step = (plotRight - plotLeft) / n;
      const idx = Math.min(n - 1, Math.max(0, Math.floor((mouseX - plotLeft) / step)));
      setHoverIndex(idx);
    },
    [containerWidth, margin.left, margin.right, points.length],
  );

  return (
    <div
      ref={containerCallbackRef}
      role="slider"
      aria-label={ariaLabel}
      aria-disabled={!hasBars}
      tabIndex={hasBars ? 0 : -1}
      aria-valuemin={0}
      aria-valuemax={hasBars ? bars.length - 1 : 0}
      aria-valuenow={hasBars ? activeIndex : 0}
      aria-valuetext={valueText}
      data-candlestick-chart=""
      data-active-candle-date={activeBar?.date ?? ''}
      onKeyDown={(e) => {
        if (!hasBars) return;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setHoverIndex(Math.max(0, activeIndex - 1));
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          setHoverIndex(Math.min(bars.length - 1, activeIndex + 1));
        } else if (e.key === 'Home') {
          e.preventDefault();
          setHoverIndex(0);
        } else if (e.key === 'End') {
          e.preventDefault();
          setHoverIndex(bars.length - 1);
        } else if (e.key === 'Escape') {
          setHoverIndex(null);
        }
      }}
      className={cn(
        'relative flex flex-col select-none outline-none focus-visible:ring-1 focus-visible:ring-basalt-border',
        height === 'fill' && 'h-full min-h-0',
        className,
      )}
    >
      {activeBar ? (
        <div className="flex flex-wrap items-center shrink-0 gap-x-3 gap-y-1 px-0.5 pb-3 text-[11px] font-mono tabular-nums leading-none">
          <span className="text-basalt-foreground font-semibold">
            {activeBar.periodStart && activeBar.periodStart !== activeBar.date
              ? `${activeBar.periodStart} ~ `
              : ''}
            {activeBar.date}
          </span>
          <span>
            <span className="text-basalt-muted-foreground mr-0.5">开</span>
            <span className="text-basalt-foreground">{activeBar.open}</span>
          </span>
          <span>
            <span className="text-basalt-muted-foreground mr-0.5">高</span>
            <span className="text-basalt-foreground">{activeBar.high}</span>
          </span>
          <span>
            <span className="text-basalt-muted-foreground mr-0.5">低</span>
            <span className="text-basalt-foreground">{activeBar.low}</span>
          </span>
          <span>
            <span className="text-basalt-muted-foreground mr-0.5">收</span>
            <span
              className={cn(
                'font-semibold',
                quoteToneClass(activeBar.close >= activeBar.open ? 'up' : 'down', quoteColor),
              )}
            >
              {activeBar.close}
            </span>
            {unit ? (
              <span className="text-basalt-muted-foreground ml-0.5 font-normal">{unit}</span>
            ) : null}
          </span>
          {activeChangePct !== null ? (
            <span>
              <span className="text-basalt-muted-foreground mr-0.5">较前收</span>
              <span
                className={cn(
                  'font-semibold',
                  quoteToneClass(
                    activeChangePct > 0 ? 'up' : activeChangePct < 0 ? 'down' : 'flat',
                    quoteColor,
                  ),
                )}
              >
                {activeChangePct > 0 ? `+${activeChangePct}%` : `${activeChangePct}%`}
              </span>
            </span>
          ) : null}
          <span>
            <span className="text-basalt-muted-foreground mr-0.5">量</span>
            <span className="text-basalt-muted-foreground">
              {(() => {
                if (activeBar.volume === null || activeBar.volume === undefined) {
                  return volumeUnit === null ? '不适用' : '未提供';
                }
                if (activeBar.volume === 0) return '0';
                return `${formatCompact(activeBar.volume)}${volumeUnit ? ` ${volumeUnit}` : ''}`;
              })()}
            </span>
          </span>
        </div>
      ) : null}

      <div
        ref={plotCallbackRef}
        className={cn('relative w-full', height === 'fill' && 'min-h-0 flex-1')}
        style={height === 'fill' ? undefined : { height }}
      >
        {!hasBars ? (
          <div className="flex h-full w-full items-center justify-center text-xs text-basalt-muted-foreground">
            暂无 K 线数据
          </div>
        ) : (
          <svg
            id={chartId}
            width={containerWidth}
            height={chartHeight}
            aria-labelledby={`${titleId} ${descId}`}
            className="overflow-visible"
            onMouseLeave={() => setHoverIndex(null)}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const mouseX = e.clientX - rect.left;
              const plotLeft = margin.left;
              const plotRight = containerWidth - margin.right;
              if (mouseX < plotLeft || mouseX > plotRight) return;

              const n = points.length;
              const step = (plotRight - plotLeft) / n;
              const idx = Math.min(n - 1, Math.max(0, Math.floor((mouseX - plotLeft) / step)));
              setHoverIndex(idx);
            }}
            onTouchStart={handleTouch}
            onTouchMove={handleTouch}
          >
            <title id={titleId}>{ariaLabel}</title>
            <desc id={descId}>
              {`${points[0]?.date ?? ''}至${points[points.length - 1]?.date ?? ''}K线与成交量走势`}
            </desc>

            {priceTicks.map((p) => {
              const y = margin.top + priceHeight * (1 - (p - minPrice) / priceRange);
              return (
                <g key={`price-tick-${p}`}>
                  <line
                    x1={margin.left}
                    y1={y}
                    x2={containerWidth - margin.right}
                    y2={y}
                    stroke={GRID_PROPS.stroke}
                    strokeOpacity={GRID_PROPS.strokeOpacity}
                    strokeDasharray={GRID_PROPS.strokeDasharray}
                  />
                  <text
                    x={containerWidth - margin.right + 4}
                    y={y + 3}
                    fontSize={CHART_TYPE.axisFontSize}
                    fill={chartTickStyle('axis').fill}
                    className="font-mono tabular-nums"
                  >
                    {p >= 100 ? p.toFixed(1) : p.toFixed(2)}
                  </text>
                </g>
              );
            })}

            {hasVolume && volumeHeight > 0 ? (
              <g>
                <line
                  x1={margin.left}
                  y1={margin.top + priceHeight + 6}
                  x2={containerWidth - margin.right}
                  y2={margin.top + priceHeight + 6}
                  stroke={GRID_PROPS.stroke}
                  strokeOpacity={0.12}
                />
                <text
                  x={containerWidth - margin.right + 4}
                  y={margin.top + priceHeight + 14}
                  fontSize={CHART_TYPE.axisFontSize - 2}
                  fill={chartTickStyle('axis').fill}
                  className="font-mono tabular-nums"
                >
                  {maxVolume > 0
                    ? `${formatCompact(maxVolume)}${volumeUnit ? ` ${volumeUnit}` : ''}`
                    : ''}
                </text>
              </g>
            ) : null}

            {points.map((p) => {
              const color = p.isUp ? upColor : downColor;
              return (
                <g key={p.date} data-candle-date={p.date}>
                  <line x1={p.x} y1={p.yHigh} x2={p.x} y2={p.yLow} stroke={color} strokeWidth={1} />
                  <rect
                    x={p.x - p.barWidth / 2}
                    y={p.bodyTop}
                    width={p.barWidth}
                    height={p.bodyHeight}
                    fill={color}
                    rx={0.5}
                  />
                  {p.vHeight > 0 ? (
                    <rect
                      x={p.x - p.barWidth / 2}
                      y={p.yVol}
                      width={p.barWidth}
                      height={p.vHeight}
                      fill={color}
                      opacity={0.65}
                      rx={0.5}
                    />
                  ) : null}
                </g>
              );
            })}

            {activePoint && hoverIndex !== null ? (
              <g>
                <line
                  x1={activePoint.x}
                  y1={margin.top}
                  x2={activePoint.x}
                  y2={margin.top + priceHeight}
                  stroke={chartTickStyle('axis').fill}
                  strokeOpacity={0.4}
                  strokeDasharray="2 2"
                />
                <line
                  x1={margin.left}
                  y1={activePoint.yClose}
                  x2={containerWidth - margin.right}
                  y2={activePoint.yClose}
                  stroke={chartTickStyle('axis').fill}
                  strokeOpacity={0.4}
                  strokeDasharray="2 2"
                />
                <circle
                  cx={activePoint.x}
                  cy={activePoint.yClose}
                  r={2.5}
                  fill={activePoint.isUp ? upColor : downColor}
                  stroke="var(--color-background, currentColor)"
                  strokeWidth={1}
                />
              </g>
            ) : null}

            {points.length > 0 ? (
              <g
                fill={chartTickStyle('axis').fill}
                fontSize={CHART_TYPE.axisFontSize}
                className="font-mono"
              >
                {timeTicks.map((index, i) => (
                  <text
                    key={index}
                    x={points[index]?.x}
                    y={chartHeight - 2}
                    textAnchor={i === 0 ? 'start' : i === timeTicks.length - 1 ? 'end' : 'middle'}
                  >
                    {points[index]?.date}
                  </text>
                ))}
              </g>
            ) : null}
          </svg>
        )}
      </div>
    </div>
  );
}
