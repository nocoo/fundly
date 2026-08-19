import { Cloud, HardDrive } from 'lucide-react';
import { useCallback, useSyncExternalStore } from 'react';
import {
  canToggleSource,
  type DataSource,
  readStoredSource,
  writeStoredSource,
} from '@/lib/source';
import { cn } from '@/lib/utils';

function subscribe(cb: () => void) {
  window.addEventListener('fundly-source', cb);
  return () => window.removeEventListener('fundly-source', cb);
}

const OPTIONS: Array<{
  source: DataSource;
  label: string;
  hint: string;
  Icon: typeof Cloud;
}> = [
  { source: 'sqlite', label: 'SQLite', hint: '本机 data/fundly.db', Icon: HardDrive },
  { source: 'd1', label: 'D1', hint: '远端 Cloudflare D1', Icon: Cloud },
];

export function SourceToggle() {
  const source = useSyncExternalStore(subscribe, readStoredSource, () => 'sqlite' as const);
  const onChange = useCallback((next: DataSource) => {
    if (next === readStoredSource()) return;
    writeStoredSource(next);
    window.location.reload();
  }, []);

  if (!canToggleSource()) return null;

  return (
    <fieldset
      className="m-0 inline-flex items-center gap-0.5 rounded-full border-0 bg-muted p-0.5 ring-1 ring-border/70"
      data-testid="source-toggle"
    >
      <legend className="sr-only">数据源</legend>
      {OPTIONS.map((option) => {
        const pressed = source === option.source;
        const Icon = option.Icon;
        return (
          <button
            key={option.source}
            type="button"
            aria-pressed={pressed}
            aria-label={`${option.label}。${option.hint}`}
            title={option.hint}
            onClick={() => onChange(option.source)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold tracking-wide',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              pressed
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}
