import { describe, expect, it } from 'bun:test';
import {
  canMutateBackups,
  historyCountLabel,
  unavailableStatus,
  validateBackyForm,
} from './backy-vm';

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

  it('validates the connection form', () => {
    expect(validateBackyForm('', '', false)).toBe('请填写 Webhook URL');
    expect(validateBackyForm('nope', '', false)).toBe('Webhook URL 格式无效');
    expect(validateBackyForm('https://backy.hexly.ai/api/webhook/x', '', false)).toBe(
      '请填写 API Key',
    );
    expect(validateBackyForm('https://backy.hexly.ai/api/webhook/x', '', true)).toBeNull();
    expect(validateBackyForm('https://backy.hexly.ai/api/webhook/x', 'tok', false)).toBeNull();
  });
});
