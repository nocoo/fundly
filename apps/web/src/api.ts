import { canToggleSource, readStoredSource } from './lib/source';

export async function fetchAPI<T>(url: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (canToggleSource()) {
    headers['X-Fundly-Source'] = readStoredSource();
  }
  const res = await fetch(url, { credentials: 'include', headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}
