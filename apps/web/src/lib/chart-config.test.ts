import { describe, expect, it } from 'bun:test';
import {
  barCornerRadius,
  chartWrapperStyle,
  GROWTH_STROKE,
  getChartColor,
  getChartToken,
  refStroke,
  seriesFill,
  seriesStroke,
  seriesStrokeDash,
  withAlpha,
} from './chart-config';

describe('chart palette', () => {
  it('wraps over Basalt’s five-color chart palette', () => {
    expect(getChartColor(0)).toBe('hsl(var(--basalt-chart-1))');
    expect(getChartColor(5)).toBe('hsl(var(--basalt-chart-1))');
    expect(getChartColor(-1)).toBe('hsl(var(--basalt-chart-24))');
    expect(getChartToken(1)).toBe('chart-11');
  });

  it('builds slash-alpha fills from Basalt HSL tokens', () => {
    expect(withAlpha('chart-1', 0.18)).toBe('hsl(var(--basalt-chart-1) / 0.18)');
  });

  it('caps only the outer bar corners', () => {
    expect(barCornerRadius('vertical')).toEqual([4, 4, 0, 0]);
    expect(barCornerRadius('horizontal')).toEqual([0, 4, 4, 0]);
  });

  it('keeps growth fund, bench and refs on distinct roles', () => {
    expect(GROWTH_STROKE.fund).toBe('hsl(var(--basalt-chart-1))');
    expect(GROWTH_STROKE.bench).toBe('hsl(var(--basalt-chart-5))');
    expect(refStroke(0)).toBe('hsl(var(--basalt-chart-axis))');
    expect(refStroke(1)).toBe('hsl(var(--basalt-chart-muted))');
    expect(seriesStroke(0)).toBe('hsl(var(--basalt-chart-1))');
    expect(seriesStrokeDash(0)).toBeUndefined();
    expect(seriesStrokeDash(1)).toBe('6 4');
    expect(seriesFill(0, 0.2)).toBe('hsl(var(--basalt-chart-1) / 0.2)');
    expect(chartWrapperStyle(240)).toEqual({ height: 240 });
  });
});
