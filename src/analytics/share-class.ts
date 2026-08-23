const SHARE_SUFFIX =
  /^(.+?)((?:人民币|美元现汇|美元现钞|美元汇|美元)[A-I]类?|[A-I]类?(?:人民币|美元现汇|美元现钞|美元汇|美元)|[A-I]类?)$/;

function normalizeCurrency(raw: string): string {
  if (raw === '美元汇') return '美元现汇';
  return raw;
}

function productAcronymBlocksShare(base: string, letter: string): boolean {
  if (letter === 'F' && /(?:ET|LO|FO)$/.test(base)) return true;
  if (letter === 'I' && /QDI$/.test(base)) return true;
  return false;
}

export type ParsedShareClass = {
  shareClass: string;
  base: string;
  letter: string;
};

export function trimShareName(name: string): string {
  return name.replace(/^[\t\n\r \u00a0\u3000]+|[\t\n\r \u00a0\u3000]+$/g, '');
}

export function parseShareClass(name: string): ParsedShareClass {
  const text = trimShareName(name);
  const match = SHARE_SUFFIX.exec(text);
  if (!match) return { shareClass: '', base: '', letter: '' };
  const rest = trimShareName(match[1] ?? '');
  const suffix = match[2] ?? '';
  const letterMatch = /[A-I]/.exec(suffix);
  const letter = letterMatch?.[0] ?? '';
  if (!letter || rest.length < 2 || productAcronymBlocksShare(rest, letter)) {
    return { shareClass: '', base: '', letter: '' };
  }
  const currencyMatch = suffix.match(/人民币|美元现汇|美元现钞|美元汇|美元/);
  const currency = currencyMatch ? normalizeCurrency(currencyMatch[0]) : '';
  return { shareClass: `${currency}${letter}`, base: rest, letter };
}

export function assignShareGroups(
  rows: Array<{ fundCode: string; fundName: string }>,
): Map<string, { shareClass: string; shareGroupKey: string }> {
  const parsed = rows.map((row) => ({
    fundCode: row.fundCode,
    ...parseShareClass(row.fundName),
  }));
  const byBase = new Map<string, Set<string>>();
  for (const row of parsed) {
    if (!row.base || !row.shareClass) continue;
    const set = byBase.get(row.base) ?? new Set<string>();
    set.add(row.shareClass);
    byBase.set(row.base, set);
  }
  const out = new Map<string, { shareClass: string; shareGroupKey: string }>();
  for (const row of parsed) {
    const classes = row.base ? byBase.get(row.base) : undefined;
    const grouped = Boolean(row.base && row.shareClass && classes && classes.size > 1);
    out.set(row.fundCode, {
      shareClass: grouped ? row.shareClass : '',
      shareGroupKey: grouped ? row.base : '',
    });
  }
  return out;
}
