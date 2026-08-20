import { RANK_RETURN_FIELDS, type RankReturnField } from './fields';

export type RankStat = { rank: number; n: number; pct: number };

export function rankPct(betterCount: number, n: number): number | null {
  if (!(n > 0) || betterCount < 0) return null;
  return (100 * (betterCount + 1)) / n;
}

export function formatRankTriple(stat: RankStat | null | undefined): string | null {
  if (!stat || !(stat.rank > 0) || !(stat.n > 0) || !Number.isFinite(stat.pct)) return null;
  return `${stat.rank} / ${stat.n} / ${stat.pct.toFixed(2)}%`;
}

function asRankStat(raw: unknown): RankStat | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const rank = typeof rec.rank === 'number' ? rec.rank : Number(rec.rank);
  const n = typeof rec.n === 'number' ? rec.n : Number(rec.n);
  const pct = typeof rec.pct === 'number' ? rec.pct : Number(rec.pct);
  if (!(rank > 0) || !(n > 0) || !Number.isFinite(pct)) return null;
  return { rank, n, pct };
}

export function parseRankStats(raw: unknown): RankStats | null {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.trim() === '') return null;
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  const rec = obj as Record<string, unknown>;
  const out = emptyRankStats();
  for (const key of Object.keys(out) as Array<keyof RankStats>) {
    out[key] = asRankStat(rec[key]);
  }
  return out;
}

export function assignRanks(
  values: Array<{ fundCode: string; value: number | null }>,
): Map<string, RankStat | null> {
  const eligible = values.filter(
    (item): item is { fundCode: string; value: number } => item.value != null,
  );
  const n = eligible.length;
  const out = new Map<string, RankStat | null>();
  for (const item of values) out.set(item.fundCode, null);
  for (const item of eligible) {
    let better = 0;
    for (const peer of eligible) {
      if (peer.value > item.value) better += 1;
    }
    const pct = rankPct(better, n);
    out.set(item.fundCode, pct == null ? null : { rank: better + 1, n, pct });
  }
  return out;
}

export type RankPercents = {
  rank_pct_1m: number | null;
  rank_pct_3m: number | null;
  rank_pct_6m: number | null;
  rank_pct_1y: number | null;
  rank_pct_2y: number | null;
  rank_pct_3y: number | null;
  rank_pct_5y: number | null;
};

export type RankedFund = {
  fundCode: string;
  fundType: string;
  returns: Record<RankReturnField, number | null>;
};

const RANK_KEY: Record<RankReturnField, keyof RankPercents> = {
  return_1m: 'rank_pct_1m',
  return_3m: 'rank_pct_3m',
  return_6m: 'rank_pct_6m',
  return_1y: 'rank_pct_1y',
  return_2y: 'rank_pct_2y',
  return_3y: 'rank_pct_3y',
  return_5y: 'rank_pct_5y',
};

export type RankStats = {
  rank_pct_1m: RankStat | null;
  rank_pct_3m: RankStat | null;
  rank_pct_6m: RankStat | null;
  rank_pct_1y: RankStat | null;
  rank_pct_2y: RankStat | null;
  rank_pct_3y: RankStat | null;
  rank_pct_5y: RankStat | null;
};

export type RankBundle = {
  percents: RankPercents;
  stats: RankStats;
};

export function emptyRankPercents(): RankPercents {
  return {
    rank_pct_1m: null,
    rank_pct_3m: null,
    rank_pct_6m: null,
    rank_pct_1y: null,
    rank_pct_2y: null,
    rank_pct_3y: null,
    rank_pct_5y: null,
  };
}

export function emptyRankStats(): RankStats {
  return {
    rank_pct_1m: null,
    rank_pct_3m: null,
    rank_pct_6m: null,
    rank_pct_1y: null,
    rank_pct_2y: null,
    rank_pct_3y: null,
    rank_pct_5y: null,
  };
}

export function rankPeerGroups(rows: RankedFund[]): Map<string, RankBundle> {
  const out = new Map<string, RankBundle>();
  const byType = new Map<string, RankedFund[]>();
  for (const row of rows) {
    const list = byType.get(row.fundType) ?? [];
    list.push(row);
    byType.set(row.fundType, list);
  }
  for (const group of byType.values()) {
    const assigned = {} as Record<RankReturnField, Map<string, RankStat | null>>;
    for (const field of RANK_RETURN_FIELDS) {
      assigned[field] = assignRanks(
        group.map((item) => ({ fundCode: item.fundCode, value: item.returns[field] })),
      );
    }
    for (const item of group) {
      const percents = emptyRankPercents();
      const stats = emptyRankStats();
      for (const field of RANK_RETURN_FIELDS) {
        const key = RANK_KEY[field];
        const stat = assigned[field]?.get(item.fundCode) ?? null;
        stats[key] = stat;
        percents[key] = stat?.pct ?? null;
      }
      out.set(item.fundCode, { percents, stats });
    }
  }
  return out;
}
