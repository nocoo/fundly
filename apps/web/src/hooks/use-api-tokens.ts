import { useState } from 'react';
import useSWR from 'swr';
import { fetchAPI } from '@/api';

export const API_TOKEN_SCOPES = [
  'funds:read',
  'managers:read',
  'market:read',
  'stocks:read',
  'selection:read',
  'daily:read',
  'stats:read',
  '*:read',
] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];
export type ApiTokenItem = {
  id: string;
  name: string;
  token_prefix: string;
  scopes: ApiTokenScope[];
  status: 'active' | 'revoked';
  created_by: string;
  created_at: number;
  last_used_at: number | null;
  expires_at: number | null;
  revoked_at: number | null;
};
export function useApiTokens() {
  const { data, error, isLoading, mutate } = useSWR<{ items: ApiTokenItem[] }>(
    '/api/tokens',
    fetchAPI,
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  async function action(path: string, method: string, body?: unknown) {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(path, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const result = (await res.json()) as { error?: string; token?: string };
      if (!res.ok) throw new Error(result.error ?? `HTTP ${res.status}`);
      if (result.token) setSecret(result.token);
      await mutate();
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return {
    items: data?.items ?? [],
    error,
    isLoading,
    reload: mutate,
    busy,
    actionError,
    secret,
    clearSecret: () => setSecret(null),
    create: (name: string, scopes: ApiTokenScope[], expiry: string) =>
      action('/api/tokens', 'POST', {
        name,
        scopes,
        ...(expiry.trim() ? { expires_in_days: Number(expiry) } : {}),
      }),
    revoke: (id: string) => action(`/api/tokens/${encodeURIComponent(id)}/revoke`, 'POST'),
    remove: (id: string) => action(`/api/tokens/${encodeURIComponent(id)}`, 'DELETE'),
  };
}
