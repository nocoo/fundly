import { useCallback, useSyncExternalStore } from 'react';
import { canToggleSource, readStoredSource, writeStoredSource } from '@/lib/source';

function subscribe(cb: () => void) {
  window.addEventListener('fundly-source', cb);
  return () => window.removeEventListener('fundly-source', cb);
}

export function SourceToggle() {
  const source = useSyncExternalStore(subscribe, readStoredSource, () => 'sqlite' as const);
  const onChange = useCallback((next: 'sqlite' | 'd1') => {
    writeStoredSource(next);
    window.location.reload();
  }, []);

  if (!canToggleSource()) return null;

  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      数据源
      <select
        aria-label="数据源"
        className="h-8 rounded-md border border-border bg-secondary px-2 text-foreground"
        value={source}
        onChange={(e) => onChange(e.target.value as 'sqlite' | 'd1')}
      >
        <option value="sqlite">SQLite</option>
        <option value="d1">D1</option>
      </select>
    </label>
  );
}
