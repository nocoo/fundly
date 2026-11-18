import { Button } from '@nocoo/basalt';
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
    <div className="flex min-w-0 flex-wrap items-center gap-1.5" data-filter-chips="">
      {label ? (
        <span className="mr-1 text-xs font-medium text-basalt-muted-foreground">{label}</span>
      ) : null}
      {items.map((item) => {
        const active = item.value === value;
        return (
          <Button
            variant="ghost"
            size="sm"
            key={item.value}
            aria-pressed={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'h-auto rounded-lg px-3 py-1.5 text-xs font-medium',
              active
                ? 'bg-basalt-primary/10 text-basalt-primary ring-1 ring-basalt-primary/30 hover:bg-basalt-primary/15 hover:text-basalt-primary'
                : 'text-basalt-muted-foreground hover:text-basalt-foreground',
            )}
          >
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}
