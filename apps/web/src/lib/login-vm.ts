export function loginErrorMessage(error: string | null | undefined): string | null {
  if (!error) return null;
  if (error === 'AccessDenied') {
    return 'Access denied. Your account is not on the allowlist.';
  }
  return 'Authentication failed. Please try again.';
}

export function loginIdLabel(now: Date): string {
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `ID 2026-${stamp.slice(4)}`;
}

export function googleStartUrl(from: string | null | undefined): string {
  if (!from?.startsWith('/') || from.startsWith('//')) return '/api/auth/google';
  return `/api/auth/google?from=${encodeURIComponent(from)}`;
}
