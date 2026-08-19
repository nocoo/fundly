export type DataSource = 'sqlite' | 'd1';

export function parseRequestedSource(raw: string | null | undefined): DataSource | null {
  if (raw === 'sqlite' || raw === 'd1') return raw;
  return null;
}

export function resolveDataSource(opts: {
  requested: string | null | undefined;
  environment: string | undefined;
}): { source: DataSource; allowed: DataSource[]; rejected: boolean } {
  const isProd = opts.environment === 'production';
  const requested = parseRequestedSource(opts.requested);

  if (isProd) {
    return {
      source: 'd1',
      allowed: ['d1'],
      rejected: requested === 'sqlite',
    };
  }

  if (requested === 'd1') {
    return { source: 'd1', allowed: ['sqlite', 'd1'], rejected: false };
  }
  return { source: 'sqlite', allowed: ['sqlite', 'd1'], rejected: false };
}
