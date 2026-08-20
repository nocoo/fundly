import { useCallback, useSyncExternalStore } from 'react';
import {
  CHART_PREFS_EVENT,
  type ChartPrefs,
  defaultChartPrefs,
  readStoredChartPrefs,
  writeStoredChartPrefs,
} from '@/lib/chart-prefs';

function subscribe(cb: () => void) {
  window.addEventListener(CHART_PREFS_EVENT, cb);
  return () => window.removeEventListener(CHART_PREFS_EVENT, cb);
}

export function useChartPrefs(): {
  prefs: ChartPrefs;
  setPrefs: (next: ChartPrefs) => void;
} {
  const prefs = useSyncExternalStore(subscribe, readStoredChartPrefs, defaultChartPrefs);
  const setPrefs = useCallback((next: ChartPrefs) => {
    writeStoredChartPrefs(next);
  }, []);
  return { prefs, setPrefs };
}
