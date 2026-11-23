import { describe, expect, it } from 'bun:test';
import { typeBadgeColor } from './type-badge';

describe('typeBadgeColor', () => {
  it('is stable for the same label', () => {
    expect(typeBadgeColor('混合型')).toBe(typeBadgeColor('混合型'));
    expect(['blue', 'amber', 'rose', 'teal', 'violet', 'success']).toContain(
      typeBadgeColor('混合型'),
    );
  });
});
