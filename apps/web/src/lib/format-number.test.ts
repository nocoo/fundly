import { describe, expect, it } from 'bun:test';
import {
  fieldCopyText,
  fieldNumberKind,
  formatAxisMetric,
  formatCompact,
  formatCount,
  formatMetric,
  formatNav,
  formatPercent,
  isSignedPercentField,
  quoteTone,
} from './format-number';

describe('formatMetric', () => {
  it('renders percents to two places including zero', () => {
    expect(formatPercent(0)).toBe('0.00%');
    expect(formatPercent(1.2)).toBe('1.20%');
    expect(formatMetric(1.2, 'percent', { signed: true })).toBe('+1.20%');
    expect(formatMetric(0, 'percent', { signed: true })).toBe('0.00%');
    expect(formatPercent(-19.784)).toBe('-19.78%');
    expect(formatMetric(-19.784, 'percent', { signed: true })).toBe('-19.78%');
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(Number.NaN)).toBe('—');
  });

  it('renders counts and nav without a percent sign', () => {
    expect(formatCount(15300).replace(/[^\d]/g, '')).toBe('15300');
    expect(formatCount(null)).toBe('—');
    expect(formatNav(1.2)).toBe('1.200');
    expect(formatNav(1.409)).toBe('1.409');
    expect(formatMetric(12.3, 'scale')).toBe('12.30');
  });

  it('keeps compact counts for charts', () => {
    expect(formatCompact(Number.NaN)).toBe('—');
    expect(formatCompact(15300).replace(/[^\d万kK]/g, '').length).toBeGreaterThan(0);
  });

  it('keeps axis ticks compact without two decimals', () => {
    expect(formatAxisMetric(12.34, 'percent')).toBe('+12%');
    expect(formatAxisMetric(-3.8, 'percent')).toBe('-4%');
    expect(formatAxisMetric(1.2, 'nav')).toBe('1.200');
    expect(formatAxisMetric(1.4094, 'nav')).toBe('1.409');
  });
});

describe('quoteTone', () => {
  it('classifies signed moves and treats zero as flat', () => {
    expect(quoteTone(1.2)).toBe('up');
    expect(quoteTone(-0.01)).toBe('down');
    expect(quoteTone(0)).toBe('flat');
    expect(quoteTone(null)).toBe('flat');
  });
});

describe('field kinds', () => {
  it('maps detail keys to display kinds', () => {
    expect(fieldNumberKind('return_1y')).toBe('percent');
    expect(fieldNumberKind('rank_pct_1m')).toBe('percent');
    expect(fieldNumberKind('fee_rate')).toBe('percent');
    expect(fieldNumberKind('fund_scale')).toBe('scale');
    expect(fieldNumberKind('pass_4433')).toBe('count');
    expect(fieldNumberKind('fund_name')).toBeNull();
    expect(isSignedPercentField('return_1m')).toBe(true);
    expect(isSignedPercentField('rank_pct_1y')).toBe(false);
  });

  it('fieldCopyText copies the displayed value', () => {
    expect(fieldCopyText('fund_code', '000001')).toBe('000001');
    expect(fieldCopyText('return_1y', 1.2)).toBe('+1.20%');
    expect(fieldCopyText('fund_scale', 12.3)).toBe('12.30');
    expect(fieldCopyText('rank_pct_1y', '1 / 5000 / 0.02%')).toBe('1 / 5000 / 0.02%');
    expect(fieldCopyText('fund_name', null)).toBeNull();
    expect(fieldCopyText('fund_name', '')).toBeNull();
  });
});
