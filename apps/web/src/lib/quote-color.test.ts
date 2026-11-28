import { describe, expect, it } from 'bun:test';
import {
  parseQuoteColor,
  quoteChangeClass,
  quoteToneClass,
  readStoredQuoteColor,
  writeStoredQuoteColor,
} from './quote-color';

describe('parseQuoteColor', () => {
  it('defaults to red-up', () => {
    expect(parseQuoteColor(null)).toBe('red-up');
    expect(parseQuoteColor('nope')).toBe('red-up');
    expect(parseQuoteColor('green-up')).toBe('green-up');
  });
});

describe('quoteToneClass & storage', () => {
  it('uses red-up by default and flips for green-up', () => {
    expect(quoteToneClass('up', 'red-up')).toContain('destructive');
    expect(quoteToneClass('down', 'red-up')).toContain('success');
    expect(quoteToneClass('up', 'green-up')).toContain('success');
    expect(quoteToneClass('down', 'green-up')).toContain('destructive');
    expect(quoteToneClass('flat', 'red-up')).toContain('muted');
    expect(quoteChangeClass(2.5, 'red-up')).toContain('destructive');
  });

  it('reads and writes quote color in localStorage', () => {
    expect(readStoredQuoteColor()).toBe('red-up');
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
      writeStoredQuoteColor('green-up');
      expect(readStoredQuoteColor()).toBe('green-up');
      expect(events).toHaveLength(1);
    } finally {
      if (prev) Object.defineProperty(globalThis, 'window', prev);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });
});
