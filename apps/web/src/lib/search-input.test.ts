import { describe, expect, it } from 'bun:test';
import { isComposingEvent } from './search-input';

describe('isComposingEvent', () => {
  it('reads the native composing flag first', () => {
    expect(isComposingEvent({ isComposing: false, nativeEvent: { isComposing: true } })).toBe(true);
    expect(isComposingEvent({ isComposing: true })).toBe(true);
    expect(isComposingEvent({})).toBe(false);
    expect(isComposingEvent(null)).toBe(false);
  });
});
