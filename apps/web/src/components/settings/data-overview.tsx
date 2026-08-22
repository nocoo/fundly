import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { SeriesChart } from '@/components/charts/series-chart';
import { SharePie } from '@/components/charts/share-pie';
import { CHART_HEIGHTS } from '@/lib/chart-config';
import { formatCompact } from '@/lib/chart-data';
import {
  coverageBars,
  type DataStats,
  fetchStatusSlices,
  glanceKpis,
  satelliteBars,
  tableCountRows,
  typeL1Bars,
} from '@/lib/data-stats-vm';
import { formatCount } from '@/lib/format-number';

export function DataOverview() {
  const { data: stats, error, isLoading } = useSWR<DataStats>('/api/stats', fetchAPI);
  const { data: types } = useSWR<{ items: { fund_type: string; n: number }[] }>(
    '/api/fund-types',
    fetchAPI,
  );
  const l1 = typeL1Bars(types?.items ?? []);
  const coverage = stats ? coverageBars(stats) : [];
  const satellites = stats ? satelliteBars(stats) : [];
  const fetchSlices = stats ? fetchStatusSlices(stats) : [];
  const rows = stats ? tableCountRows(stats) : [];
  const kpis = stats ? glanceKpis(stats) : [];

  return (
    <section id="data" className="mb-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">数据</h2>
        <p className="mt-1 text-xs text-muted-foreground">库表规模、覆盖率和抓取状态。</p>
      </div>
      {isLoading && !stats ? <p className="text-sm text-muted-foreground">加载中…</p> : null}
      {error ? <p className="text-sm text-destructive-text">{error.message}</p> : null}
      {stats ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
            {kpis.map((item) => (
              <article
                key={item.label}
                className="rounded-widget bg-secondary p-3 ring-1 ring-border/40"
              >
                <p className="text-[11px] text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-right text-sm font-semibold tabular-nums">{item.value}</p>
                {item.hint ? (
                  <p className="text-right text-[10px] text-muted-foreground">{item.hint}</p>
                ) : null}
              </article>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            <article className="rounded-card bg-secondary p-3 ring-1 ring-border/40">
              <p className="mb-2 text-xs font-semibold">大类分布</p>
              {l1.length > 0 ? (
                <SeriesChart
                  type="bar"
                  orientation="horizontal"
                  points={l1}
                  series={[{ key: 'n', label: '只数' }]}
                  height={CHART_HEIGHTS.compact}
                  valueFormatter={formatCompact}
                  ariaLabel="基金大类分布"
                />
              ) : (
                <p className="text-xs text-muted-foreground">暂无类型</p>
              )}
            </article>
            <article className="rounded-card bg-secondary p-3 ring-1 ring-border/40">
              <p className="mb-2 text-xs font-semibold">覆盖缺口</p>
              {coverage.length > 0 ? (
                <SeriesChart
                  type="bar"
                  orientation="horizontal"
                  points={coverage}
                  series={[
                    { key: 'have', label: '已有' },
                    { key: 'gap', label: '缺口' },
                  ]}
                  height={CHART_HEIGHTS.compact}
                  valueFormatter={formatCompact}
                  ariaLabel="卫星表覆盖"
                />
              ) : (
                <p className="text-xs text-muted-foreground">暂无覆盖数据</p>
              )}
            </article>
            <article className="rounded-card bg-secondary p-3 ring-1 ring-border/40">
              <p className="mb-2 text-xs font-semibold">抓取状态</p>
              {fetchSlices.length > 0 ? (
                <SharePie items={fetchSlices} height={CHART_HEIGHTS.compact} />
              ) : (
                <p className="text-xs text-muted-foreground">暂无抓取日志</p>
              )}
            </article>
            <article className="rounded-card bg-secondary p-3 ring-1 ring-border/40">
              <p className="mb-2 text-xs font-semibold">卫星表行数</p>
              {satellites.length > 0 ? (
                <SeriesChart
                  type="bar"
                  orientation="horizontal"
                  points={satellites}
                  series={[{ key: 'n', label: '行' }]}
                  height={CHART_HEIGHTS.compact}
                  valueFormatter={formatCompact}
                  ariaLabel="卫星表行数"
                />
              ) : (
                <p className="text-xs text-muted-foreground">暂无卫星表</p>
              )}
            </article>
            <article className="rounded-card bg-secondary p-3 ring-1 ring-border/40 lg:col-span-2">
              <p className="mb-2 text-xs font-semibold">表行数</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                {rows.map((row) => (
                  <div key={row.key} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate text-muted-foreground">{row.label}</span>
                    <span className="tabular-nums font-medium">{formatCount(row.n)}</span>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </>
      ) : null}
    </section>
  );
}
