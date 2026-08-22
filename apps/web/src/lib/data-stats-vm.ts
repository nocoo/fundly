import { formatCount } from './format-number';
import { listTypeL1 } from './fund-type';

export const TABLE_LABELS: Record<string, string> = {
  fund_basic_info: '基金基本信息',
  fund_performance: '阶段业绩',
  fund_nav: '历史净值',
  fund_trend_extra: '扩展 JSON',
  fetch_log: '抓取日志',
  fund_risk_metrics: '风险指标',
  fund_dividend: '分红送配',
  fund_fees: '费率',
  fund_manager: '基金经理',
  fund_manager_link: '任职关系',
  fund_portfolio: '持仓',
  fund_money_yield: '货币收益',
};

export const COVERAGE_KEYS = [
  ['fund_performance', '业绩'],
  ['fund_risk_metrics', '风险'],
  ['fund_fees', '费率'],
  ['fund_dividend', '分红'],
  ['fund_manager_link', '任职'],
  ['fund_portfolio', '持仓'],
] as const;

export type DataStats = {
  counts: Record<string, number>;
  navSpan: { min: string | null; max: string | null };
  lastFetchAt: number | null;
  lastFetchStatus: string | null;
  lastPerfDate: string | null;
  flags?: { mvp: number; pass4433: number };
  fetchStatus?: { status: string; n: number }[];
};

export function typeL1Bars(
  items: Array<{ fund_type: string; n: number }>,
): Array<{ name: string; n: number }> {
  return listTypeL1(items).map((item) => ({ name: item.label, n: item.n }));
}

export function coverageBars(stats: DataStats): Array<{ name: string; have: number; gap: number }> {
  const funds = stats.counts.fund_basic_info ?? 0;
  return COVERAGE_KEYS.filter(([key]) => stats.counts[key] != null).map(([key, name]) => {
    const have = Math.min(stats.counts[key] ?? 0, funds);
    return { name, have, gap: Math.max(0, funds - have) };
  });
}

export function satelliteBars(stats: DataStats): Array<{ name: string; n: number }> {
  return [
    'fund_risk_metrics',
    'fund_dividend',
    'fund_fees',
    'fund_manager',
    'fund_manager_link',
    'fund_portfolio',
    'fund_money_yield',
    'fund_trend_extra',
  ]
    .filter((key) => stats.counts[key] != null)
    .map((key) => ({ name: TABLE_LABELS[key] ?? key, n: stats.counts[key] ?? 0 }));
}

export function fetchStatusSlices(stats: DataStats): Array<{ name: string; value: number }> {
  return (stats.fetchStatus ?? []).map((row) => ({ name: row.status || 'unknown', value: row.n }));
}

export function tableCountRows(stats: DataStats): Array<{ key: string; label: string; n: number }> {
  return Object.entries(stats.counts)
    .map(([key, n]) => ({ key, label: TABLE_LABELS[key] ?? key, n }))
    .sort((a, b) => b.n - a.n);
}

export function glanceKpis(
  stats: DataStats,
): Array<{ label: string; value: string; hint?: string }> {
  const funds = stats.counts.fund_basic_info ?? 0;
  const mvp = stats.flags?.mvp ?? 0;
  const pass = stats.flags?.pass4433 ?? 0;
  const pct = (n: number) => (funds > 0 ? `${((n / funds) * 100).toFixed(1)}%` : '—');
  return [
    { label: '基金', value: formatCount(funds) },
    { label: 'MVP', value: formatCount(mvp), hint: pct(mvp) },
    { label: '4433', value: formatCount(pass), hint: pct(pass) },
    { label: '净值行', value: formatCount(stats.counts.fund_nav ?? 0) },
    {
      label: '净值区间',
      value: `${stats.navSpan.min ?? '—'} → ${stats.navSpan.max ?? '—'}`,
    },
    { label: '业绩日', value: stats.lastPerfDate ?? '—' },
    { label: '最近抓取', value: stats.lastFetchStatus ?? '—' },
  ];
}
