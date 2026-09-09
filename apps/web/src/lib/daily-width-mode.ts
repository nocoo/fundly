export type DailyWidthMode = 'full' | 'limited';

export const DAILY_WIDTH_MODE_KEY = 'fundly_daily_width_mode';
export const DAILY_WIDTH_MODE_EVENT = 'fundly-daily-width-mode';
export const DEFAULT_DAILY_WIDTH_MODE: DailyWidthMode = 'full';

export const DAILY_WIDTH_MODE_OPTIONS: Array<{ id: DailyWidthMode; label: string }> = [
  { id: 'full', label: '全宽' },
  { id: 'limited', label: '限宽' },
];

export function parseDailyWidthMode(raw: string | null | undefined): DailyWidthMode {
  return raw === 'limited' ? 'limited' : DEFAULT_DAILY_WIDTH_MODE;
}

export function readStoredDailyWidthMode(): DailyWidthMode {
  if (typeof window === 'undefined') return DEFAULT_DAILY_WIDTH_MODE;
  return parseDailyWidthMode(window.localStorage.getItem(DAILY_WIDTH_MODE_KEY));
}

export function writeStoredDailyWidthMode(mode: DailyWidthMode): void {
  window.localStorage.setItem(DAILY_WIDTH_MODE_KEY, mode);
  window.dispatchEvent(new Event(DAILY_WIDTH_MODE_EVENT));
}

/** Class applied on the research-page wrapper for width mode. */
export function dailyPageWidthClass(mode: DailyWidthMode): string {
  return mode === 'limited' ? 'daily-page--limited' : 'daily-page--full';
}
