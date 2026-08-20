import { useQuoteColor } from '@/hooks/use-quote-color';
import { formatMetric, type NumberKind, quoteTone } from '@/lib/format-number';
import { quoteToneClass } from '@/lib/quote-color';
import { cn } from '@/lib/utils';

export function Metric({
  value,
  kind,
  signed = false,
  align = 'start',
  className,
}: {
  value: unknown;
  kind: NumberKind;
  signed?: boolean;
  align?: 'start' | 'end';
  className?: string;
}) {
  const { color } = useQuoteColor();
  const tone = signed ? quoteTone(value) : 'flat';
  return (
    <span
      className={cn(
        'inline-block font-medium tabular-nums',
        align === 'end' ? 'w-full text-right' : 'text-left',
        signed ? quoteToneClass(tone, color) : 'text-foreground',
        className,
      )}
    >
      {formatMetric(value, kind, { signed })}
    </span>
  );
}
