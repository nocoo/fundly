import { describe, expect, it } from 'bun:test';
import { googleStartUrl, loginErrorMessage, loginIdLabel } from './login-vm';

describe('loginErrorMessage', () => {
  it('maps gecko error codes', () => {
    expect(loginErrorMessage(null)).toBeNull();
    expect(loginErrorMessage('AccessDenied')).toBe(
      'Access denied. Your account is not on the allowlist.',
    );
    expect(loginErrorMessage('OAuthFailed')).toBe('Authentication failed. Please try again.');
  });
});

describe('loginIdLabel', () => {
  it('uses the gecko ID 2026-mmdd form', () => {
    expect(loginIdLabel(new Date('2026-08-22T00:00:00.000Z'))).toBe('ID 2026-0822');
  });
});

describe('googleStartUrl', () => {
  it('only forwards same-origin paths', () => {
    expect(googleStartUrl('/funds')).toBe('/api/auth/google?from=%2Ffunds');
    expect(googleStartUrl('https://evil.test')).toBe('/api/auth/google');
  });
});
