export type TotalReturnNav = {
  navDate: string;
  unitNav: number;
  dailyReturn: number | null;
};

export type TotalReturnEvent = {
  eventDate: string;
  eventType: 'dividend' | 'split';
  dividendPerShare: number | null;
  splitRatio: number | null;
};

export type TotalReturnPoint = {
  navDate: string;
  trNav: number;
};

export function buildTotalReturn(
  navs: readonly TotalReturnNav[],
  events: readonly TotalReturnEvent[] = [],
): TotalReturnPoint[] | null {
  const sorted = [...navs]
    .filter((row) => Number.isFinite(row.unitNav) && row.unitNav > 0 && row.navDate)
    .sort((a, b) => a.navDate.localeCompare(b.navDate));
  if (sorted.length === 0) return null;

  const byDate = new Map<string, TotalReturnEvent[]>();
  for (const event of events) {
    if (!event.eventDate) continue;
    const list = byDate.get(event.eventDate) ?? [];
    list.push(event);
    byDate.set(event.eventDate, list);
  }

  const first = sorted[0];
  if (!first) return null;
  const out: TotalReturnPoint[] = [{ navDate: first.navDate, trNav: 1 }];
  let prev = first;
  let tr = 1;
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    if (!cur) continue;
    const daily = cur.dailyReturn;
    let ret: number | null = null;
    let usedUnitRatio = false;
    if (daily != null && Number.isFinite(daily)) {
      ret = daily / 100;
    } else if (prev.unitNav > 0 && Number.isFinite(cur.unitNav)) {
      usedUnitRatio = true;
      let add = 0;
      let split = 1;
      for (const event of byDate.get(cur.navDate) ?? []) {
        if (event.eventType === 'dividend' && event.dividendPerShare != null) {
          add += event.dividendPerShare;
        }
        if (
          event.eventType === 'split' &&
          event.splitRatio != null &&
          Number.isFinite(event.splitRatio) &&
          event.splitRatio > 0
        ) {
          split *= event.splitRatio;
        }
      }
      ret = (cur.unitNav + add) / prev.unitNav - 1;
      tr = tr * (1 + ret) * split;
      out.push({ navDate: cur.navDate, trNav: tr });
      prev = cur;
      continue;
    }
    if (ret == null || !Number.isFinite(ret)) {
      prev = cur;
      continue;
    }
    if (!usedUnitRatio) {
      tr *= 1 + ret;
      out.push({ navDate: cur.navDate, trNav: tr });
    }
    prev = cur;
  }
  return out.length > 0 ? out : null;
}

export function trWindowReturn(
  points: readonly TotalReturnPoint[] | null,
  startDate: string,
  endDate: string,
): number | null {
  if (!points || points.length < 2 || startDate >= endDate) return null;
  let start: TotalReturnPoint | null = null;
  let end: TotalReturnPoint | null = null;
  for (const point of points) {
    if (point.navDate <= startDate) start = point;
    if (point.navDate <= endDate) end = point;
    if (point.navDate > endDate) break;
  }
  if (!start || !end || start.trNav <= 0 || end.navDate <= start.navDate) return null;
  return (end.trNav / start.trNav - 1) * 100;
}
