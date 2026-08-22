import { describe, expect, it } from 'bun:test';
import { isEmailAllowed, loadAuthConfig, parseAllowedEmails } from './auth-config';

describe('parseAllowedEmails', () => {
  it('splits, trims and lowercases', () => {
    expect(parseAllowedEmails('A@B.com,  c@d.com')).toEqual(['a@b.com', 'c@d.com']);
  });

  it('returns empty when unset', () => {
    expect(parseAllowedEmails(undefined)).toEqual([]);
    expect(parseAllowedEmails('')).toEqual([]);
  });
});

describe('isEmailAllowed', () => {
  it('allows anyone when the list is empty', () => {
    expect(isEmailAllowed('anyone@x.com', [])).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(isEmailAllowed('A@B.com', ['a@b.com'])).toBe(true);
    expect(isEmailAllowed('nope@x.com', ['a@b.com'])).toBe(false);
    expect(isEmailAllowed(null, ['a@b.com'])).toBe(false);
  });
});

describe('loadAuthConfig', () => {
  it('is disabled until all secrets exist', () => {
    expect(loadAuthConfig({}, true).enabled).toBe(false);
    expect(loadAuthConfig({}, true).required).toBe(true);
    expect(
      loadAuthConfig(
        {
          GOOGLE_CLIENT_ID: 'id',
          GOOGLE_CLIENT_SECRET: 'secret',
          SESSION_SECRET: 'sess',
          ALLOWED_EMAILS: 'a@b.com',
        },
        true,
      ),
    ).toMatchObject({ enabled: true, required: true, allowedEmails: ['a@b.com'] });
  });

  it('AUTH_DISABLED wins over required', () => {
    const cfg = loadAuthConfig(
      {
        AUTH_DISABLED: '1',
        GOOGLE_CLIENT_ID: 'id',
        GOOGLE_CLIENT_SECRET: 'secret',
        SESSION_SECRET: 'sess',
      },
      true,
    );
    expect(cfg.enabled).toBe(false);
    expect(cfg.required).toBe(false);
  });
});
