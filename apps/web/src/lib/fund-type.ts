export type SplitFundType = {
  raw: string;
  l1: string;
  l2: string;
};

export function splitFundType(raw: string): SplitFundType {
  const text = raw.trim();
  const cut = text.indexOf('-');
  if (cut <= 0 || cut === text.length - 1) {
    return { raw: text, l1: text, l2: '' };
  }
  return { raw: text, l1: text.slice(0, cut), l2: text.slice(cut + 1) };
}

export function joinFundType(l1: string, l2: string): string {
  return l2 ? `${l1}-${l2}` : l1;
}

export function formatFundTypeLabel(raw: string): string {
  const split = splitFundType(raw);
  return split.l2 ? `${split.l1} · ${split.l2}` : split.l1;
}

export function listTypeL1(items: Array<{ fund_type: string; n: number }>): Array<{
  value: string;
  label: string;
  n: number;
}> {
  const map = new Map<string, number>();
  for (const item of items) {
    const { l1 } = splitFundType(item.fund_type);
    map.set(l1, (map.get(l1) ?? 0) + item.n);
  }
  return [...map.entries()]
    .map(([value, n]) => ({ value, label: value, n }))
    .sort((a, b) => b.n - a.n);
}

export function buildTypeTree(rawTypes: string[]): Array<{
  l1: string;
  items: Array<{ raw: string; l2: string }>;
}> {
  const map = new Map<string, Array<{ raw: string; l2: string }>>();
  for (const raw of rawTypes) {
    const { l1, l2 } = splitFundType(raw);
    const list = map.get(l1) ?? [];
    list.push({ raw, l2 });
    map.set(l1, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
    .map(([l1, items]) => ({
      l1,
      items: [...items].sort((a, b) => a.l2.localeCompare(b.l2, 'zh-CN')),
    }));
}

export function listTypeL2(
  items: Array<{ fund_type: string; n: number }>,
  l1: string,
): Array<{ value: string; label: string; n: number }> {
  if (!l1) return [];
  const rows: Array<{ value: string; label: string; n: number }> = [];
  for (const item of items) {
    const split = splitFundType(item.fund_type);
    if (split.l1 !== l1 || !split.l2) continue;
    rows.push({ value: split.l2, label: split.l2, n: item.n });
  }
  return rows.sort((a, b) => b.n - a.n);
}
