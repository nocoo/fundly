import { describe, expect, it } from 'bun:test';
import { typeBadgeClass } from './type-badge';

describe('typeBadgeClass', () => {
  it('is stable for the same label and differs across labels', () => {
    expect(typeBadgeClass('混合型')).toBe(typeBadgeClass('混合型'));
    expect(typeBadgeClass('混合型')).not.toBe(typeBadgeClass('指数型'));
    expect(typeBadgeClass('混合型')).toContain('bg-chart-');
    expect(typeBadgeClass('混合型')).toContain('text-white');
  });
});
