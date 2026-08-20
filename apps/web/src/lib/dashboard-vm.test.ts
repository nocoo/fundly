import { describe, expect, it } from 'bun:test';
import { emptyDashboard, formatCount } from './dashboard-vm';

describe('emptyDashboard', () => {
  it('returns a placeholder snapshot with null metrics', () => {
    const snap = emptyDashboard();
    expect(snap.status).toBe('placeholder');
    expect(snap.fundCount).toBeNull();
    expect(snap.mvpCount).toBeNull();
    expect(snap.lastNavDate).toBeNull();
    expect(snap.pass4433Count).toBeNull();
    expect(snap.message.length).toBeGreaterThan(0);
  });
});

describe('formatCount', () => {
  it('renders a dash for missing values', () => {
    expect(formatCount(null)).toBe('—');
  });

  it('formats integers with zh-CN grouping', () => {
    expect(formatCount(15300).replace(/[^\d]/g, '')).toBe('15300');
  });
});
