import { rankPct } from './ranks';

export type ScoreParts = {
  rank_pct_1y: number | null;
  calmar_1y: number | null;
  ulcer_1y: number | null;
  all_in_fee_pct: number | null;
  sales_fee_known: number;
};

function peerPct(
  value: number | null,
  peers: Array<number | null>,
  higherBetter: boolean,
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const eligible = peers.filter((item): item is number => item != null && Number.isFinite(item));
  if (eligible.length === 0) return null;
  let better = 0;
  for (const peer of eligible) {
    if (higherBetter ? peer > value : peer < value) better += 1;
  }
  return rankPct(better, eligible.length);
}

export function computeSelectScore(fund: ScoreParts, peers: readonly ScoreParts[]): number | null {
  const calmarPct = peerPct(
    fund.calmar_1y,
    peers.map((row) => row.calmar_1y),
    true,
  );
  const ulcerPct = peerPct(
    fund.ulcer_1y,
    peers.map((row) => row.ulcer_1y),
    false,
  );
  const feePeers = peers.filter((row) => row.sales_fee_known === 1);
  const feePct =
    fund.sales_fee_known === 1
      ? peerPct(
          fund.all_in_fee_pct,
          feePeers.map((row) => row.all_in_fee_pct),
          false,
        )
      : null;
  const parts = [fund.rank_pct_1y, calmarPct, ulcerPct, feePct].filter(
    (item): item is number => item != null,
  );
  if (parts.length < 2) return null;
  const flipped = parts.map((pct) => 100 - pct);
  return flipped.reduce((sum, n) => sum + n, 0) / flipped.length;
}
