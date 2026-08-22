export async function fetchAPI<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  if (
    res.status === 401 &&
    typeof window !== 'undefined' &&
    window.location.pathname !== '/login'
  ) {
    window.location.assign('/login');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}
