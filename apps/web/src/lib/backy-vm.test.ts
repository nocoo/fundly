import { describe, expect, it } from 'bun:test';
import { canMutateBackups, historyCountLabel, unavailableStatus } from './backy-vm';

describe('backy vm', () => {
  it('treats worker 404 as unavailable', () => {
    const status = unavailableStatus();
    expect(status.available).toBe(false);
    expect(canMutateBackups(status)).toBe(false);
  });

  it('labels history count', () => {
    expect(historyCountLabel(null)).toBe('0 份');
    expect(
      historyCountLabel({
        project_name: 'fundly',
        environment: null,
        total_backups: 3,
        recent_backups: [],
      }),
    ).toBe('3 份');
  });
});
