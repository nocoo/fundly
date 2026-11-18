import { Badge } from '@nocoo/basalt';
import { splitFundType } from '@/lib/fund-type';
import { typeBadgeVariant } from '@/lib/type-badge';
import { cn } from '@/lib/utils';

export function TypeBadge({
  label,
  className,
  truncate = true,
}: {
  label: string;
  className?: string;
  truncate?: boolean;
}) {
  if (!label) return null;
  return (
    <Badge
      variant={typeBadgeVariant(label)}
      className={cn(
        'max-w-full text-[11px]',
        truncate ? 'truncate' : 'whitespace-normal break-all',
        className,
      )}
    >
      {label}
    </Badge>
  );
}

export function FundTypeBadges({
  type,
  className,
  wrap = false,
}: {
  type: string;
  className?: string;
  wrap?: boolean;
}) {
  const split = splitFundType(type);
  return (
    <span
      className={cn(
        wrap ? 'flex min-w-0 flex-wrap' : 'inline-flex flex-nowrap',
        'items-center gap-1',
        className,
      )}
    >
      <TypeBadge label={split.l1} truncate={!wrap} />
      {split.l2 ? <TypeBadge label={split.l2} truncate={!wrap} /> : null}
    </span>
  );
}
