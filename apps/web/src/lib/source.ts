export type DataSource = 'sqlite' | 'd1';

const KEY = 'fundly_source';

export function readStoredSource(): DataSource {
  if (typeof window === 'undefined') return 'sqlite';
  return window.localStorage.getItem(KEY) === 'd1' ? 'd1' : 'sqlite';
}

export function writeStoredSource(source: DataSource): void {
  window.localStorage.setItem(KEY, source);
  window.dispatchEvent(new Event('fundly-source'));
}

export function sourceToggleVisible(isDev: boolean): boolean {
  return isDev;
}

export function canToggleSource(): boolean {
  return sourceToggleVisible(import.meta.env.DEV);
}
