import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type FilterOption = {
  value: string;
  label: string;
};

export function FilterDropdown({
  label,
  value,
  onChange,
  options,
  includeAll = true,
  allLabel = '全部',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  includeAll?: boolean;
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const items: FilterOption[] = includeAll
    ? [{ value: 'all', label: allLabel }, ...options]
    : options;
  const selected = items.find((item) => item.value === value) ?? items[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex max-w-[min(100vw-2rem,20rem)] items-center gap-1.5 rounded-widget border border-border bg-secondary px-3 py-2 text-sm shadow-xs transition-colors',
          'text-foreground hover:border-foreground/20 hover:bg-accent',
          open && 'border-primary/40 bg-accent',
        )}
      >
        <span className="shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
        <span className="min-w-0 truncate font-medium">{selected?.label ?? allLabel}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute top-full left-0 z-50 mt-1 max-h-80 min-w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
          style={{ minWidth: '12rem' }}
        >
          {items.map((item) => {
            const active = item.value === value;
            return (
              <button
                type="button"
                key={item.value}
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                  active
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-foreground hover:bg-accent',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {active ? (
                  <Check
                    className="h-3.5 w-3.5 shrink-0 text-primary"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
