export type NavEnds = { acc: number | null; unit: number | null };

export function navReturn(
  start: NavEnds | null,
  last: NavEnds | null,
  opts: { requireAcc?: boolean } = {},
): number | null {
  if (!start || !last) return null;
  if (start.acc != null && last.acc != null && start.acc > 0 && Number.isFinite(last.acc)) {
    return (last.acc / start.acc - 1) * 100;
  }
  if (opts.requireAcc) return null;
  if (start.unit != null && last.unit != null && start.unit > 0 && Number.isFinite(last.unit)) {
    return (last.unit / start.unit - 1) * 100;
  }
  return null;
}
