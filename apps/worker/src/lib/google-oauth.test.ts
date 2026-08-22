import { describe, expect, it } from 'bun:test';
import {
  buildAuthorizeUrl,
  callbackUrl,
  exchangeCode,
  GOOGLE_AUTH_URL,
  pkceChallenge,
  requestOrigin,
} from './google-oauth';

describe('callbackUrl / requestOrigin', () => {
  it('builds the callback on the public origin', () => {
    expect(callbackUrl('https://fundly.hexly.ai')).toBe(
      'https://fundly.hexly.ai/api/auth/callback',
    );
    expect(
      requestOrigin({
        url: 'http://127.0.0.1:7045/api/auth/google',
        host: 'fundly.dev.hexly.ai',
        proto: 'https',
      }),
    ).toBe('https://fundly.dev.hexly.ai');
    expect(
      requestOrigin({
        url: 'http://127.0.0.1:7045/x',
        override: 'https://fundly.hexly.ai/',
      }),
    ).toBe('https://fundly.hexly.ai');
  });
});

describe('buildAuthorizeUrl', () => {
  it('includes client, pkce and callback', async () => {
    const url = new URL(
      await buildAuthorizeUrl({
        clientId: 'cid.apps.googleusercontent.com',
        origin: 'https://fundly.hexly.ai',
        state: 'st',
        verifier: 'verifier-value',
      }),
    );
    expect(url.origin + url.pathname).toBe(GOOGLE_AUTH_URL);
    expect(url.searchParams.get('client_id')).toBe('cid.apps.googleusercontent.com');
    expect(url.searchParams.get('redirect_uri')).toBe('https://fundly.hexly.ai/api/auth/callback');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('code_challenge')).toBe(await pkceChallenge('verifier-value'));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });
});

describe('exchangeCode', () => {
  it('exchanges the code then loads userinfo', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/token')) {
        return Response.json({ access_token: 'tok' });
      }
      return Response.json({
        sub: 'sub-9',
        email: 'a@b.com',
        email_verified: true,
        name: 'A',
        picture: 'https://img/a',
      });
    };
    const profile = await exchangeCode(
      {
        clientId: 'cid',
        clientSecret: 'sec',
        origin: 'https://fundly.hexly.ai',
        code: 'code-1',
        verifier: 'ver',
      },
      fetchImpl,
    );
    expect(profile).toEqual({
      sub: 'sub-9',
      email: 'a@b.com',
      email_verified: true,
      name: 'A',
      picture: 'https://img/a',
    });
    expect(calls).toHaveLength(2);
  });

  it('rejects unverified email', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      if (String(input).includes('/token')) return Response.json({ access_token: 'tok' });
      return Response.json({ sub: 's', email: 'a@b.com', email_verified: false });
    };
    await expect(
      exchangeCode(
        {
          clientId: 'cid',
          clientSecret: 'sec',
          origin: 'https://fundly.hexly.ai',
          code: 'c',
          verifier: 'v',
        },
        fetchImpl,
      ),
    ).rejects.toThrow('not verified');
  });
});
