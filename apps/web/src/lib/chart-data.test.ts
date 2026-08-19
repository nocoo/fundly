import { describe, expect, it } from 'bun:test';
import {
  categoryFromChartClick,
  cleanNamedPoints,
  formatCompact,
  formatNav,
  toFiniteNumber,
  tooltipRowsFromPayload,
} from './chart-data';

describe('toFiniteNumber', () => {
  it('keeps finite numbers', () => {
    expect(toFiniteNumber(1.25)).toBe(1.25);
    expect(toFiniteNumber(0)).toBe(0);
  });

  it('parses numeric strings and drops junk', () => {
    expect(toFiniteNumber('3.14')).toBe(3.14);
    expect(toFiniteNumber('')).toBeNull();
    expect(toFiniteNumber('  ')).toBeNull();
    expect(toFiniteNumber('n/a')).toBeNull();
    expect(toFiniteNumber(Number.NaN)).toBeNull();
    expect(toFiniteNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toFiniteNumber(null)).toBeNull();
    expect(toFiniteNumber(undefined)).toBeNull();
  });
});

describe('cleanNamedPoints', () => {
  it('drops empty names and non-finite values', () => {
    expect(
      cleanNamedPoints([
        { name: '股票型', value: 12 },
        { name: '  ', value: 3 },
        { name: '混合型', value: 'x' },
        { name: '债券型', value: '8' },
      ]),
    ).toEqual([
      { name: '股票型', value: 12 },
      { name: '债券型', value: 8 },
    ]);
  });

  it('writes a custom value key', () => {
    expect(cleanNamedPoints([{ name: '2024-01-01', value: 1.2 }], 'unit_nav')).toEqual([
      { name: '2024-01-01', unit_nav: 1.2 },
    ]);
  });
});

describe('tooltipRowsFromPayload', () => {
  it('skips non-finite payload values', () => {
    expect(
      tooltipRowsFromPayload([
        { name: '单位净值', value: 1.2345, color: '#abc' },
        { name: '空', value: 'x' },
      ]),
    ).toEqual([{ label: '单位净值', value: 1.2345, color: '#abc' }]);
  });
});

describe('categoryFromChartClick', () => {
  it('reads a non-empty active label', () => {
    expect(categoryFromChartClick({ activeLabel: '股票型' })).toBe('股票型');
    expect(categoryFromChartClick({ activeLabel: 2 })).toBe('2');
    expect(categoryFromChartClick({ activeLabel: '' })).toBeNull();
    expect(categoryFromChartClick({})).toBeNull();
    expect(categoryFromChartClick(null)).toBeNull();
  });
});

describe('formatters', () => {
  it('formats compact counts and nav', () => {
    expect(formatCompact(Number.NaN)).toBe('—');
    expect(formatNav(1.2)).toBe('1.2000');
    expect(formatNav(Number.NaN)).toBe('—');
    expect(formatCompact(15300).replace(/[^\d万kK]/g, '').length).toBeGreaterThan(0);
  });
});
