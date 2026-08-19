import { describe, expect, it } from 'bun:test';
import { sourceToggleVisible } from './source';

describe('sourceToggleVisible', () => {
  it('is only shown on the local/dev path', () => {
    expect(sourceToggleVisible(true)).toBe(true);
    expect(sourceToggleVisible(false)).toBe(false);
  });
});
