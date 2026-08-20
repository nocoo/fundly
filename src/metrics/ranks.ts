import { RANK_RETURN_FIELDS, type RankReturnField } from './fields';

export function rankPct(betterCount: number, n: number): number | null {
  if (!(n > 0) || betterCount < 0) return null;
  return (100 * (betterCount + 1)) / n;
}

export function assignRanks(
  values: Array<{ fundCode: string; value: number | null }>,
): Map<string, number | null> {
  const eligible = values.filter(
    (item): item is { fundCode: string; value: number } => item.value != null,
  );
  const n = eligible.length;
  const out = new Map<string, number | null>();
  for (const item of values) out.set(item.fundCode, null);
  for (const item of eligible) {
    let better = 0;
    for (const peer of eligible) {
      if (peer.value > item.value) better += 1;
    }
    out.set(item.fundCode, rankPct(better, n));
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

export function rankPeerGroups(rows: RankedFund[]): Map<string, RankPercents> {
  const out = new Map<string, RankPercents>();
  const byType = new Map<string, RankedFund[]>();
  for (const row of rows) {
    const list = byType.get(row.fundType) ?? [];
    list.push(row);
    byType.set(row.fundType, list);
  }
  for (const group of byType.values()) {
    const assigned = {} as Record<RankReturnField, Map<string, number | null>>;
    for (const field of RANK_RETURN_FIELDS) {
      assigned[field] = assignRanks(
        group.map((item) => ({ fundCode: item.fundCode, value: item.returns[field] })),
      );
    }
    for (const item of group) {
      const percents = emptyRankPercents();
      for (const field of RANK_RETURN_FIELDS) {
        percents[RANK_KEY[field]] = assigned[field]?.get(item.fundCode) ?? null;
      }
      out.set(item.fundCode, percents);
    }
  }
  return out;
}
