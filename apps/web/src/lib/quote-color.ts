export type QuoteColor = 'red-up' | 'green-up';

export const QUOTE_COLOR_KEY = 'fundly_quote_color';
export const QUOTE_COLOR_EVENT = 'fundly-quote-color';
export const DEFAULT_QUOTE_COLOR: QuoteColor = 'red-up';

export const QUOTE_COLOR_OPTIONS: Array<{ id: QuoteColor; label: string; hint: string }> = [
  { id: 'red-up', label: '红涨绿跌', hint: 'A 股习惯' },
  { id: 'green-up', label: '绿涨红跌', hint: '国际习惯' },
];

export function parseQuoteColor(raw: string | null | undefined): QuoteColor {
  return raw === 'green-up' ? 'green-up' : DEFAULT_QUOTE_COLOR;
}

export function readStoredQuoteColor(): QuoteColor {
  if (typeof window === 'undefined') return DEFAULT_QUOTE_COLOR;
  return parseQuoteColor(window.localStorage.getItem(QUOTE_COLOR_KEY));
}

export function writeStoredQuoteColor(color: QuoteColor): void {
  window.localStorage.setItem(QUOTE_COLOR_KEY, color);
  window.dispatchEvent(new Event(QUOTE_COLOR_EVENT));
}

export function quoteToneClass(tone: 'up' | 'down' | 'flat', scheme: QuoteColor): string {
  if (tone === 'flat') return 'text-muted-foreground';
  const upIsRed = scheme === 'red-up';
  if (tone === 'up') return upIsRed ? 'text-destructive-text' : 'text-success-text';
  return upIsRed ? 'text-success-text' : 'text-destructive-text';
}
