import { useCallback, useSyncExternalStore } from 'react';
import {
  DAILY_WIDTH_MODE_EVENT,
  type DailyWidthMode,
  DEFAULT_DAILY_WIDTH_MODE,
  readStoredDailyWidthMode,
  writeStoredDailyWidthMode,
} from '@/lib/daily-width-mode';

function subscribe(cb: () => void) {
  window.addEventListener(DAILY_WIDTH_MODE_EVENT, cb);
  return () => window.removeEventListener(DAILY_WIDTH_MODE_EVENT, cb);
}

export function useDailyWidthMode(): {
  mode: DailyWidthMode;
  setMode: (next: DailyWidthMode) => void;
} {
  const mode = useSyncExternalStore(
    subscribe,
    readStoredDailyWidthMode,
    () => DEFAULT_DAILY_WIDTH_MODE,
  );
  const setMode = useCallback((next: DailyWidthMode) => {
    writeStoredDailyWidthMode(next);
  }, []);
  return { mode, setMode };
}
