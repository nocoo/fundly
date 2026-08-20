import { CircleOff } from 'lucide-react';
import { useParams } from 'react-router';
import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { SeriesChart } from '@/components/charts/series-chart';
import { AppShell } from '@/components/layout';
import { EmptyState } from '@/components/ui/empty-state';
import { Metric } from '@/components/ui/metric';
import { CHART_HEIGHTS } from '@/lib/chart-config';
import { cleanNamedPoints, formatNav } from '@/lib/chart-data';
import { fieldNumberKind, formatCount, isSignedPercentField } from '@/lib/format-number';

interface FieldView {
  key: string;
  label: string;
  group: string;
  value: string | number | null;
  empty: boolean;
}

interface DetailResponse {
  fields: FieldView[];
  navCount: number;
}

export default function FundDetailPage() {
  const { code = '' } = useParams();
  const { data, error, isLoading } = useSWR<DetailResponse>(
    code ? `/api/funds/${code}` : null,
    fetchAPI,
  );
  const { data: nav, error: navError } = useSWR<{
    items: { nav_date: string; unit_nav: number }[];
  }>(code ? `/api/funds/${code}/nav?limit=400` : null, fetchAPI);

  if (isLoading) {
    return (
      <AppShell breadcrumbs={[{ label: '基金浏览', href: '/funds' }, { label: code }]}>
        <p className="text-sm text-muted-foreground">加载中…</p>
      </AppShell>
    );
  }
  if (error || !data) {
    const missing = !error || error.message === 'Not found';
    return (
      <AppShell breadcrumbs={[{ label: '基金浏览', href: '/funds' }, { label: code }]}>
        <EmptyState
          icon={CircleOff}
          tone="error"
          title={missing ? '未找到基金' : '加载失败'}
          description={error?.message}
        />
      </AppShell>
    );
  }

  const groups = [...new Set(data.fields.map((f) => f.group))];
  const name = data.fields.find((f) => f.key === 'fund_name')?.value ?? code;
  const navPoints = cleanNamedPoints(
    (nav?.items ?? []).map((item) => ({ name: item.nav_date, value: item.unit_nav })),
    'unit_nav',
  );

  return (
    <AppShell breadcrumbs={[{ label: '基金浏览', href: '/funds' }, { label: String(name) }]}>
      <h1 className="mb-4 text-xl font-semibold">
        {name} <span className="text-muted-foreground text-base">{code}</span>
      </h1>

      {navError && (
        <p className="mb-4 text-sm text-destructive-text">净值加载失败：{navError.message}</p>
      )}
      {navPoints.length > 1 && (
        <article className="mb-6 rounded-card bg-secondary p-4 ring-1 ring-border/40 md:p-5">
          <p className="mb-4 text-sm font-semibold text-foreground">
            单位净值（最近 {formatCount(navPoints.length)} 点）
          </p>
          <SeriesChart
            type="line"
            points={navPoints}
            series={[{ key: 'unit_nav', label: '单位净值' }]}
            height={CHART_HEIGHTS.compact}
            valueFormatter={formatNav}
            xMinTickGap={48}
            ariaLabel="单位净值走势"
          />
        </article>
      )}

      {groups.map((group) => (
        <section key={group} className="mb-6">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">{group}</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {data.fields
              .filter((f) => f.group === group)
              .map((f) =>
                f.empty ? (
                  <div
                    key={f.key}
                    className="flex items-center gap-2 rounded-widget bg-secondary px-3 py-2 text-sm ring-1 ring-border/40"
                  >
                    <CircleOff className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                    <span className="text-muted-foreground">{f.label}：暂无数据</span>
                  </div>
                ) : (
                  <div
                    key={f.key}
                    className="rounded-widget bg-secondary px-3 py-2 text-sm ring-1 ring-border/40"
                  >
                    <span className="text-muted-foreground">{f.label}</span>
                    <FieldValue fieldKey={f.key} value={f.value} />
                  </div>
                ),
              )}
          </div>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">净值点数 {formatCount(data.navCount)}</p>
    </AppShell>
  );
}

function FieldValue({ fieldKey, value }: { fieldKey: string; value: string | number | null }) {
  const kind = fieldNumberKind(fieldKey);
  if (kind) {
    return <Metric value={value} kind={kind} signed={isSignedPercentField(fieldKey)} />;
  }
  return <div className="font-medium">{String(value)}</div>;
}
