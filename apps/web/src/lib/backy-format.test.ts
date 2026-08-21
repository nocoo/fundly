import { describe, expect, it } from 'bun:test';
import { envBadgeClass, formatFileSize, formatTimeAgo } from './backy-format';

describe('formatFileSize', () => {
  it('steps through units', () => {
    expect(formatFileSize(20)).toBe('20 B');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(738866150)).toBe('704.6 MB');
    expect(formatFileSize(2 * 1024 * 1024 * 1024)).toBe('2.00 GB');
  });
});

describe('formatTimeAgo', () => {
  const now = Date.parse('2026-08-22T12:00:00.000Z');

  it('uses chinese relative labels', () => {
    expect(formatTimeAgo('2026-08-22T11:59:30.000Z', now)).toBe('刚刚');
    expect(formatTimeAgo('2026-08-22T11:10:00.000Z', now)).toBe('50 分钟前');
    expect(formatTimeAgo('2026-08-22T09:00:00.000Z', now)).toBe('3 小时前');
    expect(formatTimeAgo('2026-08-20T12:00:00.000Z', now)).toBe('2 天前');
  });
});

describe('envBadgeClass', () => {
  it('marks prod separately from other envs', () => {
    expect(envBadgeClass('prod')).toContain('emerald');
    expect(envBadgeClass('test')).toContain('amber');
  });
});
