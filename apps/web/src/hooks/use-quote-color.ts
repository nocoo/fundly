import { useCallback, useSyncExternalStore } from 'react';
import {
  DEFAULT_QUOTE_COLOR,
  QUOTE_COLOR_EVENT,
  type QuoteColor,
  readStoredQuoteColor,
  writeStoredQuoteColor,
} from '@/lib/quote-color';

function subscribe(cb: () => void) {
  window.addEventListener(QUOTE_COLOR_EVENT, cb);
  return () => window.removeEventListener(QUOTE_COLOR_EVENT, cb);
}

export function useQuoteColor(): {
  color: QuoteColor;
  setColor: (next: QuoteColor) => void;
} {
  const color = useSyncExternalStore(subscribe, readStoredQuoteColor, () => DEFAULT_QUOTE_COLOR);
  const setColor = useCallback((next: QuoteColor) => {
    writeStoredQuoteColor(next);
  }, []);
  return { color, setColor };
}
