import { useQuoteColor } from '@/hooks/use-quote-color';
import { quoteChangeClass } from '@/lib/quote-color';

/** Decorative closing-price trend; the industry button supplies the accessible label. */
export function MiniTrend({ values }: { values: number[] }) {
  const { color } = useQuoteColor();
  const first = values[0];
  const last = values[values.length - 1];
  if (first === undefined || last === undefined) {
    return <span className="text-xs text-basalt-muted-foreground">—</span>;
  }
  const low = Math.min(...values);
  const high = Math.max(...values);
  const range = high - low;
  const y = (value: number) => (range ? 3 + (1 - (value - low) / range) * 28 : 17);
  const points = values
    .map(
      (value, i) => `${values.length === 1 ? 48 : 2 + (i * 92) / (values.length - 1)},${y(value)}`,
    )
    .join(' ');
  return (
    <svg
      viewBox="0 0 96 34"
      className={`h-9 w-full ${quoteChangeClass(last - first, color)}`}
      aria-hidden="true"
      data-mini-trend=""
    >
      {values.length === 1 ? (
        <circle cx={48} cy={17} r={1.75} fill="currentColor" />
      ) : (
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
