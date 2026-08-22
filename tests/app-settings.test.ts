import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadStoredBackyCredentials,
  readBackyConfig,
  saveBackyConfig,
} from '../src/backup/settings.ts';

function tmpDb(): string {
  const dir = join(tmpdir(), `fundly-set-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'fundly.db');
  new Database(path, { create: true }).close();
  return path;
}

describe('backy settings store', () => {
  test('saves url and token then reads them back', () => {
    const path = tmpDb();
    const saved = saveBackyConfig(path, {
      webhookUrl: ' https://backy.hexly.ai/api/webhook/abc ',
      token: ' secret-token ',
    });
    expect(saved).toEqual({
      webhookUrl: 'https://backy.hexly.ai/api/webhook/abc',
      hasToken: true,
    });
    expect(readBackyConfig(path)).toEqual(saved);
    expect(loadStoredBackyCredentials(path)).toEqual({
      webhookUrl: 'https://backy.hexly.ai/api/webhook/abc',
      token: 'secret-token',
    });
  });

  test('keeps previous token when save omits it', () => {
    const path = tmpDb();
    saveBackyConfig(path, { webhookUrl: 'https://backy.hexly.ai/api/webhook/a', token: 'keep' });
    saveBackyConfig(path, { webhookUrl: 'https://backy.hexly.ai/api/webhook/b' });
    expect(loadStoredBackyCredentials(path).token).toBe('keep');
    expect(loadStoredBackyCredentials(path).webhookUrl).toBe(
      'https://backy.hexly.ai/api/webhook/b',
    );
  });

  test('rejects empty or invalid url', () => {
    const path = tmpDb();
    expect(() => saveBackyConfig(path, { webhookUrl: '  ' })).toThrow('webhook url is required');
    expect(() => saveBackyConfig(path, { webhookUrl: 'not-a-url' })).toThrow('invalid');
  });

  test('load throws when nothing is stored', () => {
    const path = tmpDb();
    expect(() => loadStoredBackyCredentials(path)).toThrow('not configured');
  });
});
