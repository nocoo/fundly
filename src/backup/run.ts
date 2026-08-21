import { dirname } from 'node:path';
import { DEFAULT_DB_PATH } from '../db/repo.ts';
import {
  abortDirectUpload,
  type BackupCreated,
  type BackyEnvironment,
  completeDirectUpload,
  downloadRestore,
  initDirectUpload,
  listBackups,
  loadBackyCredentials,
  pickLatestProd,
  putDirectFile,
} from './backy.ts';
import {
  acquireLock,
  assertDiskSpace,
  assertFundlyDb,
  backupNeedBytes,
  checkpointWal,
  clearStaleWorkFiles,
  exclusiveRename,
  gunzipFile,
  gzipFile,
  recoverInterruptedRestore,
  releaseLock,
  removeIfExists,
  replaceWithForce,
  restoreNeedBytes,
  snapGzipPath,
  snapPath,
  vacuumInto,
} from './snapshot.ts';

export type BackupOptions = {
  sqlite?: string;
  environment?: BackyEnvironment;
  tag?: string;
};

export type RestoreOptions = {
  sqlite?: string;
  to?: string;
  id?: string;
  force?: boolean;
};

export function resolveSqlite(path?: string): string {
  return path ?? process.env.FUNDLY_SQLITE ?? DEFAULT_DB_PATH;
}

export function resolveEnvironment(value?: string): BackyEnvironment {
  const raw = value ?? process.env.BACKY_ENV ?? 'prod';
  if (raw === 'dev' || raw === 'prod' || raw === 'staging' || raw === 'test') return raw;
  throw new Error(`invalid BACKY_ENV: ${raw}`);
}

export async function runBackup(opts: BackupOptions = {}): Promise<BackupCreated> {
  const sqlite = resolveSqlite(opts.sqlite);
  const creds = loadBackyCredentials();
  assertFundlyDb(sqlite);
  assertDiskSpace(dirname(sqlite), backupNeedBytes(sqlite));
  acquireLock(sqlite);
  clearStaleWorkFiles(sqlite);
  const snap = snapPath(sqlite);
  const gz = snapGzipPath(sqlite);
  let uploadId: string | null = null;
  try {
    vacuumInto(sqlite, snap);
    await gzipFile(snap, gz);
    const fileSize = (await Bun.file(gz).stat()).size;
    const init = await initDirectUpload(creds, {
      file_name: 'fundly.db.gz',
      content_type: 'application/gzip',
      file_size: fileSize,
      environment: opts.environment ?? resolveEnvironment(),
      tag: opts.tag ?? 'fundly-db',
    });
    uploadId = init.upload_id;
    await putDirectFile(init, Bun.file(gz));
    const created = await completeDirectUpload(creds, init.upload_id);
    return created;
  } catch (error) {
    if (uploadId) {
      await abortDirectUpload(creds, uploadId).catch(() => undefined);
    }
    throw error;
  } finally {
    clearStaleWorkFiles(sqlite);
    releaseLock(sqlite);
  }
}

export async function runRestore(
  opts: RestoreOptions = {},
): Promise<{ id: string; target: string }> {
  const target = opts.to ?? resolveSqlite(opts.sqlite);
  const creds = loadBackyCredentials();
  acquireLock(target);
  try {
    try {
      recoverInterruptedRestore(target);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('interrupted replace')) throw error;
    }
    clearStaleWorkFiles(target);

    const exists = await Bun.file(target).exists();
    if (exists && !opts.force) throw new Error(`target exists, pass --force to replace: ${target}`);

    const history = await listBackups(creds);
    const chosen = opts.id
      ? history.recent_backups.find((row) => row.id === opts.id)
      : pickLatestProd(history);
    if (!chosen) {
      throw new Error(opts.id ? `backup not found: ${opts.id}` : 'no prod backup');
    }

    if (exists && opts.force) checkpointWal(target);

    const dl = `${target}.backy-dl.gz`;
    const restored = `${target}.restored`;
    const link = await downloadRestore(creds, chosen.id, dl);
    assertDiskSpace(dirname(target), restoreNeedBytes(link.file_size));
    await gunzipFile(dl, restored);
    assertFundlyDb(restored);

    if (exists && opts.force) replaceWithForce(restored, target);
    else exclusiveRename(restored, target);

    removeIfExists(dl);
    return { id: chosen.id, target };
  } catch (error) {
    clearStaleWorkFiles(target);
    throw error;
  } finally {
    releaseLock(target);
  }
}
