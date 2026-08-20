import { useQuoteColor } from '@/hooks/use-quote-color';
import { formatMetric, type NumberKind, quoteTone } from '@/lib/format-number';
import { quoteToneClass } from '@/lib/quote-color';
import { cn } from '@/lib/utils';

export function Metric({
  value,
  kind,
  signed = false,
  className,
}: {
  value: unknown;
  kind: NumberKind;
  signed?: boolean;
  className?: string;
}) {
  const { color } = useQuoteColor();
  const tone = signed ? quoteTone(value) : 'flat';
  return (
    <span
      className={cn(
        'inline-block w-full text-right font-medium tabular-nums',
        signed ? quoteToneClass(tone, color) : 'text-foreground',
        className,
      )}
    >
      {formatMetric(value, kind)}
    </span>
  );
}
