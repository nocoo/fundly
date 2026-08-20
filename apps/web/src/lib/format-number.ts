export type NumberKind = 'percent' | 'count' | 'nav' | 'scale' | 'compact';
export type QuoteTone = 'up' | 'down' | 'flat';

const EMPTY = '—';

export function toDisplayNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function formatMetric(
  value: unknown,
  kind: NumberKind,
  opts: { signed?: boolean } = {},
): string {
  const n = toDisplayNumber(value);
  if (n === null) return EMPTY;
  if (kind === 'percent') {
    const body = `${n.toFixed(2)}%`;
    return opts.signed && n > 0 ? `+${body}` : body;
  }
  if (kind === 'nav' || kind === 'scale') return n.toFixed(2);
  if (kind === 'compact') {
    return new Intl.NumberFormat('zh-CN', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);
  }
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(n);
}

export function formatCount(value: unknown): string {
  return formatMetric(value, 'count');
}

export function formatPercent(value: unknown): string {
  return formatMetric(value, 'percent');
}

export function formatNav(value: unknown): string {
  return formatMetric(value, 'nav');
}

export function formatCompact(value: unknown): string {
  return formatMetric(value, 'compact');
}

export function formatAxisMetric(value: unknown, kind: NumberKind): string {
  const n = toDisplayNumber(value);
  if (n === null) return EMPTY;
  if (kind === 'percent') {
    const body = `${Math.round(n)}%`;
    return n > 0 ? `+${body}` : body;
  }
  return formatCompact(n);
}

export function quoteTone(value: unknown): QuoteTone {
  const n = toDisplayNumber(value);
  if (n === null || n === 0) return 'flat';
  return n > 0 ? 'up' : 'down';
}

export function isSignedPercentField(key: string): boolean {
  return key.startsWith('return_');
}

export function fieldNumberKind(key: string): NumberKind | null {
  if (key.startsWith('return_') || key.startsWith('rank_pct_') || key === 'fee_rate') {
    return 'percent';
  }
  if (key === 'fund_scale') return 'scale';
  if (key === 'pass_4433') return 'count';
  return null;
}

export function fieldCopyText(key: string, value: string | number | null): string | null {
  if (value === null || value === '') return null;
  const kind = fieldNumberKind(key);
  if (!kind) return String(value);
  const text = formatMetric(value, kind, { signed: isSignedPercentField(key) });
  return text === EMPTY ? null : text;
}
