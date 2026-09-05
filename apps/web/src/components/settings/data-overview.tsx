import { LayerCard } from '@nocoo/basalt';
import { SectionRule } from '@nocoo/basalt/components/section-rule';
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
    <SectionRule title="数据概览" hint="库表规模、覆盖率和抓取状态。">
      {isLoading && !stats ? <p className="text-sm text-basalt-muted-foreground">加载中…</p> : null}
      {error ? <p className="text-sm text-basalt-danger">{error.message}</p> : null}
      {stats ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
            {kpis.map((item) => (
              <LayerCard key={item.label} className="p-3">
                <p className="text-[11px] text-basalt-muted-foreground">{item.label}</p>
                <p className="mt-1 text-right text-sm font-semibold tabular-nums text-basalt-foreground">
                  {item.value}
                </p>
                {item.hint ? (
                  <p className="text-right text-[10px] text-basalt-muted-foreground">{item.hint}</p>
                ) : null}
              </LayerCard>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            <LayerCard className="overflow-visible">
              <LayerCard.Header className="text-xs font-semibold text-basalt-foreground">
                大类分布
              </LayerCard.Header>
              <LayerCard.Body className="overflow-visible">
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
                  <p className="text-xs text-basalt-muted-foreground">暂无类型</p>
                )}
              </LayerCard.Body>
            </LayerCard>

            <LayerCard className="overflow-visible">
              <LayerCard.Header className="text-xs font-semibold text-basalt-foreground">
                覆盖缺口
              </LayerCard.Header>
              <LayerCard.Body className="overflow-visible">
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
                  <p className="text-xs text-basalt-muted-foreground">暂无覆盖数据</p>
                )}
              </LayerCard.Body>
            </LayerCard>

            <LayerCard className="overflow-visible">
              <LayerCard.Header className="text-xs font-semibold text-basalt-foreground">
                抓取状态
              </LayerCard.Header>
              <LayerCard.Body className="overflow-visible">
                {fetchSlices.length > 0 ? (
                  <SharePie items={fetchSlices} height={CHART_HEIGHTS.compact} />
                ) : (
                  <p className="text-xs text-basalt-muted-foreground">暂无抓取日志</p>
                )}
              </LayerCard.Body>
            </LayerCard>

            <LayerCard className="overflow-visible">
              <LayerCard.Header className="text-xs font-semibold text-basalt-foreground">
                卫星表行数
              </LayerCard.Header>
              <LayerCard.Body className="overflow-visible">
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
                  <p className="text-xs text-basalt-muted-foreground">暂无卫星表</p>
                )}
              </LayerCard.Body>
            </LayerCard>

            <LayerCard className="lg:col-span-2">
              <LayerCard.Header className="text-xs font-semibold text-basalt-foreground">
                表行数
              </LayerCard.Header>
              <LayerCard.Body>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                  {rows.map((row) => (
                    <div
                      key={row.key}
                      className="flex items-baseline justify-between gap-2 text-xs"
                    >
                      <span className="truncate text-basalt-muted-foreground">{row.label}</span>
                      <span className="tabular-nums font-medium text-basalt-foreground">
                        {formatCount(row.n)}
                      </span>
                    </div>
                  ))}
                </div>
              </LayerCard.Body>
            </LayerCard>
          </div>
        </div>
      ) : null}
    </SectionRule>
  );
}
