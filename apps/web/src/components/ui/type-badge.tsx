import { splitFundType } from '@/lib/fund-type';
import { typeBadgeClass } from '@/lib/type-badge';
import { cn } from '@/lib/utils';

export function TypeBadge({ label, className }: { label: string; className?: string }) {
  if (!label) return null;
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium',
        typeBadgeClass(label),
        className,
      )}
    >
      {label}
    </span>
  );
}

export function FundTypeBadges({ type, className }: { type: string; className?: string }) {
  const split = splitFundType(type);
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      <TypeBadge label={split.l1} />
      {split.l2 ? <TypeBadge label={split.l2} /> : null}
    </span>
  );
}
