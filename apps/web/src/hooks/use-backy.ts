import { useCallback, useEffect, useState } from 'react';
import { fetchAPI } from '@/api';
import { type BackyStatus, unavailableStatus, validateBackyForm } from '@/lib/backy-vm';
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
  const [webhookUrl, setWebhookUrl] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'save' | 'test' | 'push' | 'restore' | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchAPI<BackyStatus>('/api/backy');
      setStatus(next);
      setWebhookUrl(next.webhookUrl);
    } catch {
      setStatus(unavailableStatus());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveConfig = useCallback(async () => {
    const error = validateBackyForm(webhookUrl, token, Boolean(status?.hasToken));
    if (error) {
      setMessage({ ok: false, text: error });
      return;
    }
    setBusy('save');
    setMessage(null);
    try {
      await mutateAPI('/api/backy/config', 'PUT', {
        webhookUrl,
        token: token.trim() || undefined,
      });
      setToken('');
      setMessage({ ok: true, text: '已保存' });
      await refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : '保存失败' });
    } finally {
      setBusy(null);
    }
  }, [refresh, status?.hasToken, token, webhookUrl]);

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

  return {
    status,
    webhookUrl,
    setWebhookUrl,
    token,
    setToken,
    loading,
    busy,
    message,
    refresh,
    saveConfig,
    testConnection,
    push,
    restore,
  };
}
