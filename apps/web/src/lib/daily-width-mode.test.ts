import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_DAILY_WIDTH_MODE,
  dailyPageWidthClass,
  parseDailyWidthMode,
  readStoredDailyWidthMode,
  writeStoredDailyWidthMode,
} from './daily-width-mode';

describe('parseDailyWidthMode', () => {
  it('defaults to full', () => {
    expect(parseDailyWidthMode(null)).toBe(DEFAULT_DAILY_WIDTH_MODE);
    expect(parseDailyWidthMode(undefined)).toBe('full');
    expect(parseDailyWidthMode('nope')).toBe('full');
    expect(parseDailyWidthMode('full')).toBe('full');
  });

  it('accepts limited', () => {
    expect(parseDailyWidthMode('limited')).toBe('limited');
  });
});

describe('dailyPageWidthClass & storage', () => {
  it('maps modes to page classes and persists to localStorage', () => {
    expect(dailyPageWidthClass('full')).toBe('daily-page--full');
    expect(dailyPageWidthClass('limited')).toBe('daily-page--limited');
    expect(readStoredDailyWidthMode()).toBe('full');
    const store = new Map<string, string>();
    const events: string[] = [];
    const prev = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (k: string) => store.get(k) ?? null,
          setItem: (k: string, v: string) => store.set(k, v),
        },
        dispatchEvent: (e: Event) => events.push(e.type),
      },
    });
    try {
      writeStoredDailyWidthMode('limited');
      expect(readStoredDailyWidthMode()).toBe('limited');
      expect(events).toHaveLength(1);
    } finally {
      if (prev) Object.defineProperty(globalThis, 'window', prev);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });
});
