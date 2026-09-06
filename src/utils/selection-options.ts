import { parseArgs } from 'node:util';

export interface SelectionOptions {
  scope: 'all' | 'etf' | 'stock';
  etfLimit: number;
  stockLimit: number;
  symbols: string[];
  sqlite: string;
  skipDeep: boolean;
  watch: boolean;
  intervalMinutes: number;
  help: boolean;
}

function boundedInteger(value: string, name: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < min || parsed > max)
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return parsed;
}

/** Validate before opening the database or calling the provider. */
export function parseSelectionOptions(argv: string[]): SelectionOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      scope: { type: 'string', default: 'all' },
      'etf-limit': { type: 'string', default: '60' },
      'stock-limit': { type: 'string', default: '80' },
      symbols: { type: 'string' },
      sqlite: { type: 'string', default: 'data/fundly.db' },
      'skip-deep': { type: 'boolean', default: false },
      watch: { type: 'boolean', default: false },
      'interval-minutes': { type: 'string', default: '1440' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  });
  if (!['all', 'etf', 'stock'].includes(values.scope))
    throw new Error('scope must be all, etf or stock');
  const symbols =
    values.symbols === undefined
      ? []
      : values.symbols.split(',').map((s) => s.trim().toUpperCase());
  if (
    symbols.some((s) => !/^\d{6}\.(SH|SZ|BJ)$/.test(s)) ||
    new Set(symbols).size !== symbols.length ||
    symbols.length > 200
  )
    throw new Error('symbols must be unique full exchange codes, at most 200');
  if (values['skip-deep'] && symbols.length)
    throw new Error('symbols cannot be combined with skip-deep');
  if (!values.sqlite.trim()) throw new Error('sqlite path cannot be empty');
  return {
    scope: values.scope as SelectionOptions['scope'],
    etfLimit: boundedInteger(values['etf-limit'], 'etf-limit', 1, 200),
    stockLimit: boundedInteger(values['stock-limit'], 'stock-limit', 1, 200),
    symbols,
    sqlite: values.sqlite,
    skipDeep: values['skip-deep'],
    watch: values.watch,
    intervalMinutes: boundedInteger(values['interval-minutes'], 'interval-minutes', 15, 10080),
    help: values.help,
  };
}

export function selectResearchPool(
  rows: Array<{ symbol: string; group: string | null; size: number | null }>,
  anchors: readonly string[],
  limit: number,
): string[] {
  const available = new Set(rows.map((r) => r.symbol));
  const chosen = new Set(anchors.filter((s) => available.has(s)).slice(0, limit));
  const sorted = rows
    .filter((r) => r.size !== null && r.size > 0)
    .sort(
      (a, b) =>
        (b.size ?? Number.NEGATIVE_INFINITY) - (a.size ?? Number.NEGATIVE_INFINITY) ||
        a.symbol.localeCompare(b.symbol),
    );
  const groups = new Map<string, string[]>();
  for (const row of sorted) {
    if (!row.group || chosen.has(row.symbol)) continue;
    const group = groups.get(row.group) ?? [];
    group.push(row.symbol);
    groups.set(row.group, group);
  }
  for (let round = 0; chosen.size < limit; round++) {
    let added = false;
    for (const group of groups.values()) {
      const symbol = group[round];
      if (symbol && chosen.size < limit) {
        chosen.add(symbol);
        added = true;
      }
    }
    if (!added) break;
  }
  for (const row of sorted) if (chosen.size < limit) chosen.add(row.symbol);
  return [...chosen];
}
