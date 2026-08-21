import { describe, expect, test } from 'bun:test';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type BackyHistory,
  downloadRestore,
  loadBackyCredentials,
  pickLatestProd,
  putDirectFile,
  restoreUrlFor,
} from '../src/backup/backy.ts';

function history(rows: Array<Partial<BackyHistory['recent_backups'][number]>>): BackyHistory {
  return {
    project_name: 'fundly',
    environment: null,
    total_backups: rows.length,
    recent_backups: rows.map((row, i) => ({
      id: row.id ?? `id-${i}`,
      tag: row.tag ?? 'fundly-db',
      environment: row.environment ?? 'test',
      file_size: row.file_size ?? 10,
      is_single_json: row.is_single_json ?? 0,
      created_at: row.created_at ?? '2026-08-21T00:00:00.000Z',
    })),
  };
}

describe('backy credentials and urls', () => {
  test('requires both env vars', () => {
    expect(() => loadBackyCredentials({})).toThrow(
      'BACKY_WEBHOOK_URL and BACKY_TOKEN are required',
    );
    expect(() =>
      loadBackyCredentials({ BACKY_WEBHOOK_URL: 'https://backy.hexly.ai/api/webhook/x' }),
    ).toThrow();
    expect(
      loadBackyCredentials({
        BACKY_WEBHOOK_URL: ' https://backy.hexly.ai/api/webhook/x ',
        BACKY_TOKEN: ' tok ',
      }),
    ).toEqual({
      webhookUrl: 'https://backy.hexly.ai/api/webhook/x',
      token: 'tok',
    });
  });

  test('builds restore url from webhook origin', () => {
    expect(restoreUrlFor('https://backy.hexly.ai/api/webhook/abc', 'bid')).toBe(
      'https://backy.hexly.ai/api/restore/bid',
    );
  });
});

describe('pickLatestProd', () => {
  test('returns null without prod rows', () => {
    expect(pickLatestProd(history([{ environment: 'test' }]))).toBeNull();
  });

  test('picks newest prod by created_at', () => {
    const picked = pickLatestProd(
      history([
        { id: 'old', environment: 'prod', created_at: '2026-08-20T00:00:00.000Z' },
        { id: 'test', environment: 'test', created_at: '2026-08-22T00:00:00.000Z' },
        { id: 'new', environment: 'prod', created_at: '2026-08-21T12:00:00.000Z' },
      ]),
    );
    expect(picked?.id).toBe('new');
  });
});

describe('putDirectFile', () => {
  test('forwards init headers unchanged', async () => {
    const seen: { headers: Headers | null } = { headers: null };
    const fetchImpl = async (_input: string | URL | Request, init?: RequestInit) => {
      seen.headers = new Headers(init?.headers);
      return new Response(null, { status: 200 });
    };
    await putDirectFile(
      {
        upload_id: 'u',
        put_url: 'https://r2.example/put',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/gzip',
          'Content-Length': '67',
          'If-None-Match': '*',
        },
        file_key: 'k',
        expires_in: 3600,
        max_bytes: 5000000000,
      },
      'body',
      fetchImpl,
    );
    expect(seen.headers?.get('Content-Type')).toBe('application/gzip');
    expect(seen.headers?.get('Content-Length')).toBe('67');
    expect(seen.headers?.get('If-None-Match')).toBe('*');
  });
});

describe('downloadRestore', () => {
  test('re-signs after 403 then writes expected bytes', async () => {
    const dest = join(tmpdir(), `fundly-dl-${Date.now()}.bin`);
    const payload = 'hello-backy';
    let restoreGets = 0;
    let fileGets = 0;
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/api/restore/')) {
        restoreGets += 1;
        return Response.json({
          url: `https://r2.example/obj?n=${restoreGets}`,
          backup_id: 'b1',
          project_id: 'p',
          file_size: payload.length,
          expires_in: 900,
        });
      }
      fileGets += 1;
      if (fileGets === 1) return new Response('expired', { status: 403 });
      return new Response(payload, {
        status: 200,
        headers: { 'Content-Length': String(payload.length) },
      });
    };
    const creds = {
      webhookUrl: 'https://backy.hexly.ai/api/webhook/x',
      token: 't',
    };
    const link = await downloadRestore(creds, 'b1', dest, fetchImpl);
    expect(link.backup_id).toBe('b1');
    expect(restoreGets).toBe(2);
    expect(await Bun.file(dest).text()).toBe(payload);
    unlinkSync(dest);
  });

  test('rejects size mismatch', async () => {
    const dest = join(tmpdir(), `fundly-dl-bad-${Date.now()}.bin`);
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/api/restore/')) {
        return Response.json({
          url: 'https://r2.example/obj',
          backup_id: 'b1',
          project_id: 'p',
          file_size: 99,
          expires_in: 900,
        });
      }
      return new Response('short', { status: 200, headers: { 'Content-Length': '99' } });
    };
    await expect(
      downloadRestore(
        { webhookUrl: 'https://backy.hexly.ai/api/webhook/x', token: 't' },
        'b1',
        dest,
        fetchImpl,
      ),
    ).rejects.toThrow('downloaded 5 bytes, expected 99');
    try {
      unlinkSync(dest);
    } catch {
      /* may not exist */
    }
  });
});
