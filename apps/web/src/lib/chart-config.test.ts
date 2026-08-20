import { describe, expect, it } from 'bun:test';
import { barCornerRadius, getChartColor, getChartToken, withAlpha } from './chart-config';

describe('chart palette', () => {
  it('wraps past the 14-stop Pew palette', () => {
    expect(getChartColor(0)).toBe('hsl(var(--chart-1))');
    expect(getChartColor(14)).toBe('hsl(var(--chart-1))');
    expect(getChartColor(-1)).toBe('hsl(var(--chart-14))');
    expect(getChartToken(1)).toBe('chart-2');
  });

  it('builds slash-alpha fills from HSL tokens', () => {
    expect(withAlpha('chart-1', 0.18)).toBe('hsl(var(--chart-1) / 0.18)');
  });

  it('caps only the outer bar corners', () => {
    expect(barCornerRadius('vertical')).toEqual([4, 4, 0, 0]);
    expect(barCornerRadius('horizontal')).toEqual([0, 4, 4, 0]);
  });
});
