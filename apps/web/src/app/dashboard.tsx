import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { SeriesChart } from '@/components/charts/series-chart';
import { AppShell } from '@/components/layout';
import { CHART_HEIGHTS } from '@/lib/chart-config';
import { cleanNamedPoints, formatCompact } from '@/lib/chart-data';
import { formatCount } from '@/lib/format-number';

interface Stats {
  counts: Record<string, number>;
  navSpan: { min: string | null; max: string | null };
}

export default function Dashboard() {
  const { data: stats, error, isLoading, mutate } = useSWR<Stats>('/api/stats', fetchAPI);
  const { data: types, error: typesError } = useSWR<{ items: { fund_type: string; n: number }[] }>(
    '/api/fund-types',
    fetchAPI,
  );
  const chart = cleanNamedPoints(
    (types?.items ?? []).slice(0, 12).map((item) => ({ name: item.fund_type, value: item.n })),
    'n',
  );
  const fundCount = stats?.counts.fund_basic_info;
  const navCount = stats?.counts.fund_nav;

  return (
    <AppShell>
      <h1 className="mb-4 text-xl font-semibold">仪表盘</h1>
      {isLoading && !stats && <p className="text-sm text-muted-foreground">加载中…</p>}
      {error && (
        <p className="mb-3 text-sm text-destructive-text">
          {error.message}{' '}
          <button type="button" className="underline" onClick={() => void mutate()}>
            重试
          </button>
        </p>
      )}
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <KpiCard label="基金只数" value={formatCount(fundCount)} />
        <KpiCard label="净值行" value={formatCount(navCount)} />
        <KpiCard
          label="净值区间"
          value={stats ? `${stats.navSpan.min ?? '—'} → ${stats.navSpan.max ?? '—'}` : '—'}
          compact
        />
      </div>
      <article className="rounded-card bg-secondary p-4 ring-1 ring-border/40 md:p-5">
        <p className="mb-4 text-sm font-semibold text-foreground">基金类型分布（前 12）</p>
        {typesError && (
          <p className="text-sm text-destructive-text">类型分布加载失败：{typesError.message}</p>
        )}
        {chart.length > 0 ? (
          <SeriesChart
            type="bar"
            orientation="horizontal"
            points={chart}
            series={[{ key: 'n', label: '基金只数' }]}
            height={CHART_HEIGHTS.standard}
            valueFormatter={formatCompact}
            ariaLabel="基金类型分布"
          />
        ) : (
          !typesError && <p className="text-sm text-muted-foreground">暂无类型数据</p>
        )}
      </article>
    </AppShell>
  );
}

function KpiCard({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <article className="rounded-card bg-secondary p-4 ring-1 ring-border/40 md:p-5">
      <div className="mb-4 h-1 w-10 rounded-full bg-primary" />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          compact
            ? 'mt-2 text-right text-sm font-medium tabular-nums'
            : 'mt-2 text-right text-2xl font-semibold tracking-tight tabular-nums'
        }
      >
        {value}
      </p>
    </article>
  );
}
