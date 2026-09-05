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
        <span className="mr-1 text-xs font-medium text-basalt-muted-foreground">{label}</span>
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
              'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
              active
                ? 'border-basalt-primary/40 bg-basalt-accent text-basalt-primary font-semibold'
                : 'border-basalt-border bg-basalt-control text-basalt-foreground hover:border-basalt-foreground/20 hover:bg-basalt-accent',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
