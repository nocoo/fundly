import type { RankPercents } from './ranks';

const QUARTER = 25;
const THIRD = 100 / 3;

export function pass4433(ranks: RankPercents): 0 | 1 {
  const need: Array<[number | null, number]> = [
    [ranks.rank_pct_1y, QUARTER],
    [ranks.rank_pct_2y, QUARTER],
    [ranks.rank_pct_3y, QUARTER],
    [ranks.rank_pct_5y, QUARTER],
    [ranks.rank_pct_6m, THIRD],
    [ranks.rank_pct_3m, THIRD],
  ];
  for (const [value, cap] of need) {
    if (value == null || !(value <= cap)) return 0;
  }
  return 1;
}
