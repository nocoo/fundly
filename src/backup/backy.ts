export type BackyEnvironment = 'dev' | 'prod' | 'staging' | 'test';

export type BackyCredentials = {
  webhookUrl: string;
  token: string;
};

export type BackyBackup = {
  id: string;
  tag: string;
  environment: string;
  file_size: number;
  is_single_json: number;
  created_at: string;
};

export type BackyHistory = {
  project_name: string;
  environment: string | null;
  total_backups: number;
  recent_backups: BackyBackup[];
};

export type DirectUploadInit = {
  upload_id: string;
  put_url: string;
  method: string;
  headers: Record<string, string>;
  file_key: string;
  expires_in: number;
  max_bytes: number;
};

export type BackupCreated = {
  id: string;
  project_id: string;
  file_size: number;
  created_at: string;
};

export type RestoreLink = {
  url: string;
  backup_id: string;
  project_id: string;
  file_size: number;
  expires_in: number;
};

type FetchLike = typeof fetch;

export function loadBackyCredentials(
  env: Record<string, string | undefined> = process.env,
): BackyCredentials {
  const webhookUrl = env.BACKY_WEBHOOK_URL?.trim() ?? '';
  const token = env.BACKY_TOKEN?.trim() ?? '';
  if (!webhookUrl || !token) {
    throw new Error('BACKY_WEBHOOK_URL and BACKY_TOKEN are required');
  }
  return { webhookUrl, token };
}

export function restoreOrigin(webhookUrl: string): string {
  return new URL(webhookUrl).origin;
}

export function restoreUrlFor(webhookUrl: string, backupId: string): string {
  return `${restoreOrigin(webhookUrl)}/api/restore/${backupId}`;
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

export function pickLatestProd(history: BackyHistory): BackyBackup | null {
  const prod = history.recent_backups.filter((row) => row.environment === 'prod');
  if (prod.length === 0) return null;
  return prod.reduce((latest, row) => (row.created_at > latest.created_at ? row : latest));
}

async function readError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `${fallback} (HTTP ${res.status})`;
}

export async function headWebhook(
  creds: BackyCredentials,
  fetchImpl: FetchLike = fetch,
): Promise<number> {
  const res = await fetchImpl(creds.webhookUrl, {
    method: 'HEAD',
    headers: authHeader(creds.token),
  });
  if (!res.ok) throw new Error(await readError(res, 'backy head failed'));
  return res.status;
}

export async function listBackups(
  creds: BackyCredentials,
  fetchImpl: FetchLike = fetch,
): Promise<BackyHistory> {
  const res = await fetchImpl(creds.webhookUrl, { headers: authHeader(creds.token) });
  if (!res.ok) throw new Error(await readError(res, 'backy list failed'));
  return (await res.json()) as BackyHistory;
}

export async function initDirectUpload(
  creds: BackyCredentials,
  body: {
    file_name: string;
    content_type: string;
    file_size: number;
    environment: BackyEnvironment;
    tag: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<DirectUploadInit> {
  const res = await fetchImpl(`${creds.webhookUrl}/uploads`, {
    method: 'POST',
    headers: { ...authHeader(creds.token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, 'backy init upload failed'));
  return (await res.json()) as DirectUploadInit;
}

export async function putDirectFile(
  init: DirectUploadInit,
  body: BodyInit,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const res = await fetchImpl(init.put_url, {
    method: init.method || 'PUT',
    headers: init.headers,
    body,
  });
  if (!res.ok) throw new Error(await readError(res, 'backy put failed'));
}

export async function completeDirectUpload(
  creds: BackyCredentials,
  uploadId: string,
  fetchImpl: FetchLike = fetch,
): Promise<BackupCreated> {
  const res = await fetchImpl(`${creds.webhookUrl}/uploads/${uploadId}/complete`, {
    method: 'POST',
    headers: authHeader(creds.token),
  });
  if (!res.ok) throw new Error(await readError(res, 'backy complete failed'));
  return (await res.json()) as BackupCreated;
}

export async function abortDirectUpload(
  creds: BackyCredentials,
  uploadId: string,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const res = await fetchImpl(`${creds.webhookUrl}/uploads/${uploadId}`, {
    method: 'DELETE',
    headers: authHeader(creds.token),
  });
  if (!res.ok) throw new Error(await readError(res, 'backy abort failed'));
}

export async function fetchRestoreLink(
  creds: BackyCredentials,
  backupId: string,
  fetchImpl: FetchLike = fetch,
): Promise<RestoreLink> {
  const res = await fetchImpl(restoreUrlFor(creds.webhookUrl, backupId), {
    headers: authHeader(creds.token),
  });
  if (!res.ok) throw new Error(await readError(res, 'backy restore link failed'));
  return (await res.json()) as RestoreLink;
}

export async function downloadToFile(
  url: string,
  dest: string,
  expectedBytes: number | null,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const res = await fetchImpl(url);
  if (!res.ok) {
    const err = new Error(await readError(res, 'backy download failed')) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  await Bun.write(dest, res);
  const actual = (await Bun.file(dest).stat()).size;
  const advertised = Number(res.headers.get('content-length')) || expectedBytes;
  if (advertised && actual !== advertised) {
    throw new Error(`downloaded ${actual} bytes, expected ${advertised}`);
  }
}

export async function downloadRestore(
  creds: BackyCredentials,
  backupId: string,
  dest: string,
  fetchImpl: FetchLike = fetch,
): Promise<RestoreLink> {
  let last: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const link = await fetchRestoreLink(creds, backupId, fetchImpl);
    try {
      await downloadToFile(link.url, dest, link.file_size, fetchImpl);
      return link;
    } catch (error) {
      last = error instanceof Error ? error : new Error(String(error));
      const status = (error as { status?: number }).status;
      if (status !== 403 && attempt === 0 && status !== undefined && status < 500) throw last;
    }
  }
  throw last ?? new Error('backy download failed');
}
