import { describe, expect, it } from 'bun:test';
import { readStoredJson, writeStoredJson } from './stored-json';

describe('stored-json', () => {
  it('returns null when window is undefined and reads/writes valid JSON when present', () => {
    expect(readStoredJson('k')).toBeNull();
    writeStoredJson('k', { a: 1 });

    const store = new Map<string, string>();
    const prev = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (k: string) => store.get(k) ?? null,
          setItem: (k: string, v: string) => {
            store.set(k, v);
          },
        },
      },
    });
    try {
      expect(readStoredJson('missing')).toBeNull();
      writeStoredJson('k', { a: 1 });
      expect(readStoredJson('k')).toEqual({ a: 1 });
      store.set('bad', '{');
      expect(readStoredJson('bad')).toBeNull();
    } finally {
      if (prev) Object.defineProperty(globalThis, 'window', prev);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });
});
