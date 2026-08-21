import { cn } from '@/lib/utils';

export type ChipOption = {
  value: string;
  label: string;
};

export function FilterChips({
  label,
  value,
  options,
  onChange,
  includeAll = false,
  allValue = 'all',
  allLabel = '全部',
}: {
  label?: string;
  value: string;
  options: ChipOption[];
  onChange: (value: string) => void;
  includeAll?: boolean;
  allValue?: string;
  allLabel?: string;
}) {
  const items: ChipOption[] = includeAll
    ? [{ value: allValue, label: allLabel }, ...options]
    : options;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {label ? (
        <span className="mr-1 text-xs font-medium text-muted-foreground">{label}</span>
      ) : null}
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            type="button"
            key={item.value}
            aria-pressed={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'rounded-widget border px-3 py-1.5 text-sm font-medium shadow-xs transition-colors',
              active
                ? 'border-primary/40 bg-accent text-primary'
                : 'border-border bg-secondary text-foreground hover:border-foreground/20 hover:bg-accent',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
