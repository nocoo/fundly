import { useCallback, useEffect, useState } from 'react';
import { fetchAPI } from '@/api';
import { type BackyStatus, unavailableStatus } from '@/lib/backy-vm';
import { canToggleSource, readStoredSource } from '@/lib/source';

async function mutateAPI<T>(url: string, method: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (canToggleSource()) headers['X-Fundly-Source'] = readStoredSource();
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as T & {
    error?: string;
  };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export function useBacky() {
  const [status, setStatus] = useState<BackyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'test' | 'push' | 'restore' | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchAPI<BackyStatus>('/api/backy');
      setStatus(next);
    } catch {
      setStatus(unavailableStatus());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const testConnection = useCallback(async () => {
    setBusy('test');
    setMessage(null);
    try {
      const result = await mutateAPI<{ status: number }>('/api/backy/test', 'POST');
      setMessage({ ok: true, text: `连接成功 (HTTP ${result.status})` });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : '连接失败' });
    } finally {
      setBusy(null);
    }
  }, []);

  const push = useCallback(async () => {
    setBusy('push');
    setMessage(null);
    try {
      const result = await mutateAPI<{ id: string; file_size: number }>('/api/backy', 'POST');
      setMessage({ ok: true, text: `已上传 ${result.id}` });
      await refresh();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : '推送失败' });
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const restore = useCallback(
    async (id: string) => {
      setBusy('restore');
      setMessage(null);
      try {
        await mutateAPI('/api/backy/restore', 'POST', { id, force: true });
        setMessage({ ok: true, text: `已恢复 ${id}` });
        await refresh();
      } catch (error) {
        setMessage({ ok: false, text: error instanceof Error ? error.message : '恢复失败' });
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  return { status, loading, busy, message, refresh, testConnection, push, restore };
}
