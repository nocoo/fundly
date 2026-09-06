/** Exchange-local calendar dates and finite source values. */
export function marketNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function isMarketDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function chinaMarketDate(ms: number): string {
  const shifted = new Date(ms + 8 * 60 * 60 * 1000);
  return Number.isFinite(ms) && Number.isFinite(shifted.getTime())
    ? shifted.toISOString().slice(0, 10)
    : '';
}

export function shiftMarketDate(date: string, days: number): string {
  if (!isMarketDate(date)) throw new Error('Invalid market date');
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

export function validOhlc(bar: {
  open: number;
  high: number;
  low: number;
  close: number;
}): boolean {
  return (
    [bar.open, bar.high, bar.low, bar.close].every(Number.isFinite) &&
    bar.low <= Math.min(bar.open, bar.close) &&
    bar.high >= Math.max(bar.open, bar.close)
  );
}

/** RFC 4180 fields, including quoted commas in ECB descriptions. */
export function marketCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (ch === ',' || ch === '\n' || ch === '\r')) {
      row.push(cell);
      cell = '';
      if (ch !== ',') {
        if (row.some((v) => v !== '')) rows.push(row);
        row = [];
        if (ch === '\r' && input[i + 1] === '\n') i++;
      }
    } else cell += ch;
  }
  if (quoted) throw new Error('Unclosed CSV field');
  row.push(cell);
  if (row.some((v) => v !== '')) rows.push(row);
  const headers = rows.shift()?.map((v) => v.trim()) ?? [];
  return rows.map((values) =>
    Object.fromEntries(headers.map((key, i) => [key, values[i]?.trim() ?? ''])),
  );
}
