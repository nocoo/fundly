import { describe, expect, it } from 'bun:test';
import { typeBadgeVariant } from './type-badge';

describe('typeBadgeVariant', () => {
  it('is stable for the same label', () => {
    expect(typeBadgeVariant('混合型')).toBe(typeBadgeVariant('混合型'));
    expect(['blue', 'orange', 'red', 'teal', 'purple', 'success']).toContain(
      typeBadgeVariant('混合型'),
    );
  });
});
