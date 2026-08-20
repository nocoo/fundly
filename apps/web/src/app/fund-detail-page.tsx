import { CircleOff } from 'lucide-react';
import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router';
import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { ChartEmptyMask } from '@/components/charts/chart-empty-mask';
import { ScoreRadar } from '@/components/charts/radar-chart';
import { SeriesChart } from '@/components/charts/series-chart';
import { SharePie } from '@/components/charts/share-pie';
import { AppShell } from '@/components/layout';
import { EmptyState } from '@/components/ui/empty-state';
import { Metric } from '@/components/ui/metric';
import { FundTypeBadges } from '@/components/ui/type-badge';
import { useChartPrefs } from '@/hooks/use-chart-prefs';
import { resolveBenchmark } from '@/lib/benchmark-defaults';
import { CHART_HEIGHTS, seriesStroke } from '@/lib/chart-config';
import type { ChartPoint, ChartSeries } from '@/lib/chart-data';
import { buildGrowthPoints } from '@/lib/chart-growth';
import {
  fieldNumberKind,
  formatAxisMetric,
  formatCount,
  formatMetric,
  isSignedPercentField,
} from '@/lib/format-number';
import {
  clipTimePoints,
  type FundExtras,
  rankingChart,
  scaleChart,
  seriesChartFromCategories,
} from '@/lib/fund-extra-vm';
import { parseRangeYears, RANGE_YEARS, rangeBounds, utcTs } from '@/lib/time-window';
import { cn } from '@/lib/utils';

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
const PANEL = 176;

export default function FundDetailPage() {
  const { code = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const years = parseRangeYears(params.get('years'));
  const bounds = useMemo(() => rangeBounds(years), [years]);
  const timeDomain = { from: utcTs(bounds.from), to: utcTs(bounds.to) };
  const { data, error, isLoading } = useSWR<DetailResponse>(
    code ? `/api/funds/${code}` : null,
    fetchAPI,
  );
  const navKey = code ? `/api/funds/${code}/nav?from=${bounds.from}&limit=3000` : null;
  const { data: nav, error: navError } = useSWR<{
    items: { nav_date: string; unit_nav: number }[];
  }>(navKey, fetchAPI);
  const { prefs } = useChartPrefs();
  const fundType = String(data?.fields.find((f) => f.key === 'fund_type')?.value ?? '');
  const bench = resolveBenchmark(fundType, prefs.benchmarks);
  const showBench = Boolean(bench && bench.code !== code);
  const { data: benchNav } = useSWR<{ items: { nav_date: string; unit_nav: number }[] }>(
    showBench && bench ? `/api/funds/${bench.code}/nav?from=${bounds.from}&limit=3000` : null,
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
      from: bounds.from,
      to: bounds.to,
    });
  }, [nav, benchNav, showBench, prefs.refRates, bounds.from, bounds.to]);

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

  const name = data.fields.find((f) => f.key === 'fund_name')?.value ?? code;
  const extras = data.extras;
  const allocation = extras.allocation
    ? clipTimePoints(
        seriesChartFromCategories(extras.allocation.categories, extras.allocation.series).points,
        bounds.from,
        bounds.to,
      )
    : [];
  const holders = extras.holders
    ? clipTimePoints(
        seriesChartFromCategories(extras.holders.categories, extras.holders.series).points,
        bounds.from,
        bounds.to,
      )
    : [];
  const scale = extras.scale
    ? clipTimePoints(scaleChart(extras.scale).points, bounds.from, bounds.to)
    : [];
  const ranking = clipTimePoints(
    extras.ranking.length ? rankingChart(extras.ranking).points : [],
    bounds.from,
    bounds.to,
  );

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
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            {name} <span className="text-muted-foreground text-base">{code}</span>
          </h1>
          {fundType ? <FundTypeBadges type={fundType} wrap className="mt-2" /> : null}
        </div>
        <fieldset className="m-0 inline-flex items-center gap-0.5 rounded-full bg-muted p-0.5 ring-1 ring-border/70">
          <legend className="sr-only">时间范围</legend>
          {RANGE_YEARS.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={years === item}
              onClick={() => {
                const next = new URLSearchParams(params);
                if (item === 5) next.delete('years');
                else next.set('years', String(item));
                setParams(next, { replace: true });
              }}
              className={cn(
                'h-7 rounded-full px-2.5 text-xs font-semibold',
                years === item
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item}年
            </button>
          ))}
        </fieldset>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[3fr_1fr_1fr]">
        <div className="flex flex-col gap-4">
          <TimeCard
            title="净值增长"
            empty={growth.length < 2}
            emptyLabel={navError ? `净值加载失败：${navError.message}` : '暂无净值数据'}
            points={growth}
            series={growthSeries}
            timeDomain={timeDomain}
            format={(value) => formatMetric(value, 'percent', { signed: true })}
            axisFormat={(value) => formatAxisMetric(value, 'percent')}
          />
          <TimeCard
            title="同类排名"
            empty={ranking.length < 2}
            points={ranking}
            series={[{ key: 'rank', label: '同类排名' }]}
            timeDomain={timeDomain}
            format={(value) => formatMetric(value, 'count')}
            axisFormat={(value) => formatAxisMetric(value, 'count')}
          />
          <TimeCard
            title="规模变动"
            empty={scale.length < 1}
            points={scale}
            series={[{ key: 'scale', label: '规模（亿元）' }]}
            timeDomain={timeDomain}
            type="bar"
            format={(value) => formatMetric(value, 'scale')}
            axisFormat={(value) => formatAxisMetric(value, 'scale')}
          />
          <TimeCard
            title="资产配置"
            empty={allocation.length < 2}
            points={allocation}
            series={
              extras.allocation
                ? extras.allocation.series.map((item) => ({ key: item.name, label: item.name }))
                : []
            }
            timeDomain={timeDomain}
            format={(value) => formatMetric(value, 'percent')}
            axisFormat={(value) => formatAxisMetric(value, 'percent')}
          />
          <TimeCard
            title="持有人结构"
            empty={holders.length < 2}
            points={holders}
            series={
              extras.holders
                ? extras.holders.series.map((item) => ({ key: item.name, label: item.name }))
                : []
            }
            timeDomain={timeDomain}
            format={(value) => formatMetric(value, 'percent')}
            axisFormat={(value) => formatAxisMetric(value, 'percent')}
          />
        </div>

        <div className="flex flex-col gap-4">
          <article className="rounded-card bg-secondary p-4 ring-1 ring-border/40 md:p-5">
            <p className="mb-4 text-sm font-semibold text-foreground">
              {extras.scores?.avr != null
                ? `五维能力（均分 ${formatMetric(extras.scores.avr, 'nav')}）`
                : '五维能力'}
            </p>
            {extras.scores && extras.scores.items.length > 0 ? (
              <ScoreRadar items={extras.scores.items} height={CHART_HEIGHTS.standard} />
            ) : (
              <ChartEmptyMask label="暂无五维数据" />
            )}
          </article>
          <SnapshotBar title="最新配置" items={extras.allocation?.latest ?? []} kind="percent" />
          <article className="rounded-card bg-secondary p-4 ring-1 ring-border/40 md:p-5">
            <p className="mb-3 text-sm font-semibold text-foreground">最新持有人</p>
            {extras.holders && extras.holders.latest.length > 0 ? (
              <>
                <SeriesLegend
                  series={extras.holders.latest.map((item, index) => ({
                    key: item.name,
                    label: `${item.name} ${formatMetric(item.value, 'percent')}`,
                    color: seriesStroke(index),
                  }))}
                />
                <SharePie items={extras.holders.latest} height={CHART_HEIGHTS.compact} />
              </>
            ) : (
              <ChartEmptyMask label="暂无最新持有人" />
            )}
          </article>
        </div>

        <div className="flex flex-col gap-4">
          <FieldGroup title="业绩" fields={fieldsOf(data.fields, '业绩')} />
          <p className="text-xs leading-5 text-muted-foreground">
            图中净值 {formatCount(growth.length)} 个交易日
            {growth.length > 0
              ? ` · ${String(growth[0]?.name)} → ${String(growth[growth.length - 1]?.name)}`
              : ''}
            。与左栏净值增长同一窗口，不是单位净值本身。
          </p>
          <FieldGroup title="基本信息" fields={fieldsOf(data.fields, '基本信息')} />
          <FieldGroup title="排名" fields={fieldsOf(data.fields, '排名')} />
        </div>
      </div>
    </AppShell>
  );
}

function fieldsOf(fields: FieldView[], group: string): FieldView[] {
  return fields.filter((f) => f.group === group && !HEADER_FIELD_KEYS.has(f.key));
}

function TimeCard({
  title,
  empty,
  emptyLabel = '暂无数据',
  points,
  series,
  timeDomain,
  format,
  axisFormat,
  type = 'line',
}: {
  title: string;
  empty: boolean;
  emptyLabel?: string;
  points: ChartPoint[];
  series: ChartSeries[];
  timeDomain: { from: number; to: number };
  format: (value: number) => string;
  axisFormat: (value: number) => string;
  type?: 'line' | 'bar';
}) {
  return (
    <article className="rounded-card bg-secondary p-4 ring-1 ring-border/40 md:p-5">
      <p className="mb-2 text-sm font-semibold text-foreground">{title}</p>
      {empty ? (
        <ChartEmptyMask label={emptyLabel} />
      ) : (
        <>
          <SeriesLegend series={series} />
          <SeriesChart
            type={type}
            points={points}
            series={series}
            height={PANEL}
            timeDomain={timeDomain}
            colorByCategory={false}
            valueFormatter={format}
            axisValueFormatter={axisFormat}
            ariaLabel={title}
          />
        </>
      )}
    </article>
  );
}

function SeriesLegend({ series }: { series: ChartSeries[] }) {
  if (series.length === 0) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
      {series.map((item, index) => {
        const color = item.color ?? seriesStroke(index);
        return (
          <li
            key={item.key}
            className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <span
              className="h-0.5 w-3.5 shrink-0 rounded-full"
              style={
                item.dashed
                  ? { borderTop: `2px dashed ${color}`, height: 0, background: 'transparent' }
                  : { background: color }
              }
            />
            <span className="truncate">{item.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

function SnapshotBar({
  title,
  items,
  kind,
}: {
  title: string;
  items: { name: string; value: number }[];
  kind: 'percent' | 'count' | 'scale';
}) {
  const points = items.map((item) => ({ name: item.name, value: item.value }));
  return (
    <article className="rounded-card bg-secondary p-4 ring-1 ring-border/40 md:p-5">
      <p className="mb-3 text-sm font-semibold text-foreground">{title}</p>
      {points.length === 0 ? (
        <ChartEmptyMask label={`暂无${title}`} />
      ) : (
        <SeriesChart
          type="bar"
          orientation="horizontal"
          points={points}
          series={[{ key: 'value', label: title }]}
          height={Math.max(140, points.length * 36)}
          valueFormatter={(value) => formatMetric(value, kind)}
          ariaLabel={title}
        />
      )}
    </article>
  );
}

function FieldGroup({ title, fields }: { title: string; fields: FieldView[] }) {
  if (fields.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="grid gap-2">
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
              className="flex min-w-0 flex-col items-start gap-0.5 rounded-widget bg-secondary px-3 py-2 text-sm ring-1 ring-border/40"
            >
              <span className="text-muted-foreground">{f.label}</span>
              <FieldValue fieldKey={f.key} value={f.value} />
            </div>
          ),
        )}
      </div>
    </section>
  );
}

function FieldValue({ fieldKey, value }: { fieldKey: string; value: string | number | null }) {
  const kind = fieldNumberKind(fieldKey);
  if (kind) {
    return <Metric value={value} kind={kind} signed={isSignedPercentField(fieldKey)} />;
  }
  return (
    <div className="w-full min-w-0 whitespace-normal break-words font-medium">{String(value)}</div>
  );
}
