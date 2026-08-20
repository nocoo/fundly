export type ExtraSeries = {
  name: string;
  values: number[];
};

export type AllocationExtra = {
  categories: string[];
  series: ExtraSeries[];
  latest: { name: string; value: number }[];
};

export type ScaleExtra = {
  points: { date: string; value: number; mom: string | null }[];
  latest: { date: string; value: number };
};

export type HolderExtra = {
  categories: string[];
  series: ExtraSeries[];
  latest: { name: string; value: number }[];
};

export type RankingPoint = {
  date: string;
  rank: number;
  peers: number | null;
};

export type ScoreExtra = {
  avr: number | null;
  items: { name: string; value: number }[];
};

export type FundExtras = {
  allocation: AllocationExtra | null;
  scale: ScaleExtra | null;
  holders: HolderExtra | null;
  ranking: RankingPoint[];
  scores: ScoreExtra | null;
};

const RANK_POINTS = 400;

export function emptyFundExtras(): FundExtras {
  return { allocation: null, scale: null, holders: null, ranking: [], scores: null };
}

export function parseFundExtras(row: Record<string, unknown> | null): FundExtras {
  if (!row) return emptyFundExtras();
  return {
    allocation: parseAllocation(row.asset_allocation_json),
    scale: parseScale(row.scale_history_json),
    holders: parseHolders(row.holder_structure_json),
    ranking: parseRanking(row.ranking_trend_json),
    scores: parseScores(row.performance_5d_json),
  };
}

function parseJson(raw: unknown): unknown {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function stringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function numberList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const item of raw) {
    const n = typeof item === 'number' ? item : Number(item);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function namedSeries(raw: unknown, length: number): ExtraSeries[] {
  if (!Array.isArray(raw) || length === 0) return [];
  const out: ExtraSeries[] = [];
  for (const item of raw) {
    const rec = asRecord(item);
    if (!rec) continue;
    const name = String(rec.name ?? '').trim();
    const values = numberList(rec.data);
    if (!name || values.length !== length) continue;
    out.push({ name, values });
  }
  return out;
}

function latestOf(series: ExtraSeries[], last: number): { name: string; value: number }[] {
  return series.map((item) => ({ name: item.name, value: item.values[last] as number }));
}

function parseAllocation(raw: unknown): AllocationExtra | null {
  const rec = asRecord(parseJson(raw));
  if (!rec) return null;
  const categories = stringList(rec.categories);
  const series = namedSeries(rec.series, categories.length);
  if (categories.length === 0 || series.length === 0) return null;
  return {
    categories,
    series,
    latest: latestOf(series, categories.length - 1),
  };
}

function parseScale(raw: unknown): ScaleExtra | null {
  const rec = asRecord(parseJson(raw));
  if (!rec) return null;
  const categories = stringList(rec.categories);
  const rows = Array.isArray(rec.series) ? rec.series : [];
  if (categories.length === 0 || rows.length !== categories.length) return null;
  const points: ScaleExtra['points'] = [];
  for (let i = 0; i < categories.length; i++) {
    const item = asRecord(rows[i]);
    const value = typeof item?.y === 'number' ? item.y : Number(item?.y);
    if (!Number.isFinite(value)) continue;
    const momRaw = item?.mom;
    points.push({
      date: categories[i] as string,
      value,
      mom: typeof momRaw === 'string' && momRaw.trim() ? momRaw.trim() : null,
    });
  }
  const latest = points[points.length - 1];
  if (!latest) return null;
  return { points, latest: { date: latest.date, value: latest.value } };
}

function parseHolders(raw: unknown): HolderExtra | null {
  const rec = asRecord(parseJson(raw));
  if (!rec) return null;
  const categories = stringList(rec.categories);
  const series = namedSeries(rec.series, categories.length);
  if (categories.length === 0 || series.length === 0) return null;
  return {
    categories,
    series,
    latest: latestOf(series, categories.length - 1),
  };
}

function parseRanking(raw: unknown): RankingPoint[] {
  const parsed = parseJson(raw);
  if (!Array.isArray(parsed)) return [];
  const points: RankingPoint[] = [];
  for (const item of parsed) {
    const rec = asRecord(item);
    if (!rec) continue;
    const date = tsToDate(typeof rec.x === 'number' ? rec.x : Number(rec.x));
    const rank = typeof rec.y === 'number' ? rec.y : Number(rec.y);
    if (!date || !Number.isFinite(rank)) continue;
    const peersRaw = rec.sc;
    const peers =
      typeof peersRaw === 'number'
        ? peersRaw
        : typeof peersRaw === 'string'
          ? Number(peersRaw)
          : Number.NaN;
    points.push({
      date,
      rank,
      peers: Number.isFinite(peers) ? peers : null,
    });
  }
  return downsample(points, RANK_POINTS);
}

function parseScores(raw: unknown): ScoreExtra | null {
  const rec = asRecord(parseJson(raw));
  if (!rec) return null;
  const names = stringList(rec.categories);
  const values = numberList(rec.data);
  if (names.length === 0 || names.length !== values.length) return null;
  const avrRaw = rec.avr;
  const avr =
    typeof avrRaw === 'number' ? avrRaw : typeof avrRaw === 'string' ? Number(avrRaw) : Number.NaN;
  return {
    avr: Number.isFinite(avr) ? avr : null,
    items: names.map((name, i) => ({ name, value: values[i] as number })),
  };
}

export function tsToDate(ts: number): string | null {
  if (!Number.isFinite(ts) || ts <= 0) return null;
  const d = new Date(ts + 8 * 60 * 60 * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function downsample<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items;
  const step = (items.length - 1) / (limit - 1);
  const out: T[] = [];
  for (let i = 0; i < limit; i++) {
    out.push(items[Math.round(i * step)] as T);
  }
  return out;
}
