import { CircleOff } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import { useParams } from 'react-router';
import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { SeriesChart } from '@/components/charts/series-chart';
import { AppShell } from '@/components/layout';
import { EmptyState } from '@/components/ui/empty-state';
import { Metric } from '@/components/ui/metric';
import { FundTypeBadges } from '@/components/ui/type-badge';
import { useChartPrefs } from '@/hooks/use-chart-prefs';
import { resolveBenchmark } from '@/lib/benchmark-defaults';
import { CHART_HEIGHTS } from '@/lib/chart-config';
import type { ChartSeries } from '@/lib/chart-data';
import { buildGrowthPoints } from '@/lib/chart-growth';
import {
  fieldNumberKind,
  formatCount,
  formatMetric,
  isSignedPercentField,
} from '@/lib/format-number';
import {
  type FundExtras,
  hasFundExtras,
  rankingChart,
  scaleChart,
  scoreChart,
  seriesChartFromCategories,
} from '@/lib/fund-extra-vm';

interface FieldView {
  key: string;
  label: string;
  group: string;
  value: string | number | null;
  empty: boolean;
}

interface DetailResponse {
  fields: FieldView[];
  extras: FundExtras;
  navCount: number;
}

const HEADER_FIELD_KEYS = new Set(['fund_type']);

export default function FundDetailPage() {
  const { code = '' } = useParams();
  const { data, error, isLoading } = useSWR<DetailResponse>(
    code ? `/api/funds/${code}` : null,
    fetchAPI,
  );
  const { data: nav, error: navError } = useSWR<{
    items: { nav_date: string; unit_nav: number }[];
  }>(code ? `/api/funds/${code}/nav?limit=400` : null, fetchAPI);
  const { prefs } = useChartPrefs();
  const fundType = String(data?.fields.find((f) => f.key === 'fund_type')?.value ?? '');
  const bench = resolveBenchmark(fundType, prefs.benchmarks);
  const showBench = Boolean(bench && bench.code !== code);
  const { data: benchNav } = useSWR<{ items: { nav_date: string; unit_nav: number }[] }>(
    showBench && bench ? `/api/funds/${bench.code}/nav?limit=400` : null,
    fetchAPI,
  );
  const growth = useMemo(() => {
    const primary = (nav?.items ?? []).map((item) => ({ date: item.nav_date, nav: item.unit_nav }));
    const benchPoints = (benchNav?.items ?? []).map((item) => ({
      date: item.nav_date,
      nav: item.unit_nav,
    }));
    return buildGrowthPoints(primary, {
      ...(showBench ? { bench: benchPoints } : {}),
      refRates: prefs.refRates,
    });
  }, [nav, benchNav, showBench, prefs.refRates]);

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

  const growthSeries: ChartSeries[] = [
    { key: 'growth', label: String(name) },
    ...(showBench && bench
      ? [{ key: 'bench', label: `基准 ${bench.name}`, dashed: true as const }]
      : []),
    ...prefs.refRates.map((rate, index) => ({
      key: `ref_${index}`,
      label: `年化 ${rate.toFixed(2)}%`,
      dashed: true as const,
    })),
  ];

  return (
    <AppShell breadcrumbs={[{ label: '基金浏览', href: '/funds' }, { label: String(name) }]}>
      <h1 className="mb-2 text-xl font-semibold">
        {name} <span className="text-muted-foreground text-base">{code}</span>
      </h1>
      {fundType ? <FundTypeBadges type={fundType} wrap className="mb-4" /> : null}

      {navError && (
        <p className="mb-4 text-sm text-destructive-text">净值加载失败：{navError.message}</p>
      )}
      {growth.length > 1 && (
        <article className="mb-6 rounded-card bg-secondary p-4 ring-1 ring-border/40 md:p-5">
          <p className="mb-4 text-sm font-semibold text-foreground">
            净值增长（最近 {formatCount(growth.length)} 点）
          </p>
          <SeriesChart
            type="line"
            points={growth}
            series={growthSeries}
            height={CHART_HEIGHTS.compact}
            valueFormatter={(value) => formatMetric(value, 'percent', { signed: true })}
            xMinTickGap={48}
            ariaLabel="净值增长"
          />
        </article>
      )}

      {hasFundExtras(data.extras) ? <FundExtraSections extras={data.extras} /> : null}

      {groups.map((group) => {
        const fields = data.fields.filter(
          (f) => f.group === group && !HEADER_FIELD_KEYS.has(f.key),
        );
        if (fields.length === 0) return null;
        return (
          <section key={group} className="mb-6">
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">{group}</h2>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {fields.map((f) =>
                f.empty ? (
                  <div
                    key={f.key}
                    className="flex min-w-0 items-center gap-2 rounded-widget bg-secondary px-3 py-2 text-sm ring-1 ring-border/40"
                  >
                    <CircleOff className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                    <span className="text-muted-foreground">{f.label}：暂无数据</span>
                  </div>
                ) : (
                  <div
                    key={f.key}
                    className="min-w-0 rounded-widget bg-secondary px-3 py-2 text-sm ring-1 ring-border/40"
                  >
                    <span className="text-muted-foreground">{f.label}</span>
                    <FieldValue fieldKey={f.key} value={f.value} />
                  </div>
                ),
              )}
            </div>
          </section>
        );
      })}
      <p className="text-xs text-muted-foreground">净值点数 {formatCount(data.navCount)}</p>
    </AppShell>
  );
}

function FieldValue({ fieldKey, value }: { fieldKey: string; value: string | number | null }) {
  const kind = fieldNumberKind(fieldKey);
  if (kind) {
    return <Metric value={value} kind={kind} signed={isSignedPercentField(fieldKey)} />;
  }
  return <div className="min-w-0 break-words font-medium">{String(value)}</div>;
}

function FundExtraSections({ extras }: { extras: FundExtras }) {
  const allocation = extras.allocation
    ? seriesChartFromCategories(extras.allocation.categories, extras.allocation.series)
    : null;
  const holders = extras.holders
    ? seriesChartFromCategories(extras.holders.categories, extras.holders.series)
    : null;
  const scale = extras.scale ? scaleChart(extras.scale) : null;
  const ranking = extras.ranking.length > 1 ? rankingChart(extras.ranking) : null;
  const scores = extras.scores ? scoreChart(extras.scores) : null;

  return (
    <div className="mb-6 space-y-6">
      {scores ? (
        <ExtraCard
          title={
            extras.scores?.avr != null
              ? `五维能力（均分 ${formatMetric(extras.scores.avr, 'nav')}）`
              : '五维能力'
          }
        >
          <LatestPills items={extras.scores?.items ?? []} kind="count" />
          <SeriesChart
            type="bar"
            orientation="horizontal"
            points={scores.points}
            series={scores.series}
            height={CHART_HEIGHTS.compact}
            colorByCategory={false}
            valueFormatter={(value) => formatMetric(value, 'count')}
            ariaLabel="五维能力"
          />
        </ExtraCard>
      ) : null}
      {allocation && extras.allocation ? (
        <ExtraCard title="资产配置">
          <LatestPills items={extras.allocation.latest} kind="percent" />
          <SeriesChart
            type="line"
            points={allocation.points}
            series={allocation.series}
            height={CHART_HEIGHTS.compact}
            valueFormatter={(value) => formatMetric(value, 'percent')}
            xMinTickGap={48}
            ariaLabel="资产配置"
          />
        </ExtraCard>
      ) : null}
      {scale && extras.scale ? (
        <ExtraCard title="规模变动">
          <LatestPills
            items={[{ name: extras.scale.latest.date, value: extras.scale.latest.value }]}
            kind="scale"
          />
          <SeriesChart
            type="bar"
            points={scale.points}
            series={scale.series}
            height={CHART_HEIGHTS.compact}
            colorByCategory={false}
            valueFormatter={(value) => formatMetric(value, 'scale')}
            ariaLabel="规模变动"
          />
        </ExtraCard>
      ) : null}
      {holders && extras.holders ? (
        <ExtraCard title="持有人结构">
          <LatestPills items={extras.holders.latest} kind="percent" />
          <SeriesChart
            type="line"
            points={holders.points}
            series={holders.series}
            height={CHART_HEIGHTS.compact}
            valueFormatter={(value) => formatMetric(value, 'percent')}
            xMinTickGap={48}
            ariaLabel="持有人结构"
          />
        </ExtraCard>
      ) : null}
      {ranking ? (
        <ExtraCard title="同类排名走势">
          <SeriesChart
            type="line"
            points={ranking.points}
            series={ranking.series}
            height={CHART_HEIGHTS.compact}
            valueFormatter={(value) => formatMetric(value, 'count')}
            xMinTickGap={48}
            ariaLabel="同类排名走势"
          />
        </ExtraCard>
      ) : null}
    </div>
  );
}

function ExtraCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="rounded-card bg-secondary p-4 ring-1 ring-border/40 md:p-5">
      <p className="mb-4 text-sm font-semibold text-foreground">{title}</p>
      {children}
    </article>
  );
}

function LatestPills({
  items,
  kind,
}: {
  items: { name: string; value: number }[];
  kind: 'percent' | 'count' | 'scale';
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4 flex min-w-0 flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item.name}
          className="rounded-md bg-background/60 px-2 py-1 text-xs text-muted-foreground ring-1 ring-border/40"
        >
          {item.name}{' '}
          <span className="font-medium text-foreground">{formatMetric(item.value, kind)}</span>
        </span>
      ))}
    </div>
  );
}
