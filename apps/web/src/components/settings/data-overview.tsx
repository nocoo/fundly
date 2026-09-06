import { Button, LayerCard } from '@nocoo/basalt';
import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { DataInfo } from '@/components/charts/market-chart-controls';
import { SeriesChart } from '@/components/charts/series-chart';
import { SharePie } from '@/components/charts/share-pie';
import { PanelHeading, ResearchEmpty, StatTile } from '@/components/layout/research-layout';
import { formatCompact } from '@/lib/chart-data';
import {
  coverageBars,
  type DataStats,
  fetchStatusSlices,
  satelliteBars,
  tableCountRows,
  typeL1Bars,
} from '@/lib/data-stats-vm';
import { formatCount } from '@/lib/format-number';

export function DataOverview() {
  const { data: stats, error, isLoading, mutate } = useSWR<DataStats>('/api/stats', fetchAPI);
  const {
    data: types,
    error: typesError,
    mutate: retryTypes,
  } = useSWR<{ items: { fund_type: string; n: number }[] }>('/api/fund-types', fetchAPI);
  const l1 = typeL1Bars(types?.items ?? []);
  const coverage = stats ? coverageBars(stats) : [];
  const satellites = stats ? satelliteBars(stats) : [];
  const fetchSlices = stats ? fetchStatusSlices(stats) : [];
  const rows = stats ? tableCountRows(stats) : [];

  if (error)
    return (
      <LayerCard>
        <ResearchEmpty
          title="数据状态加载失败"
          description={error.message}
          action={
            <Button variant="outline" size="sm" onClick={() => void mutate()}>
              重试
            </Button>
          }
        />
      </LayerCard>
    );
  if (isLoading || !stats)
    return (
      <LayerCard>
        <LayerCard.Loading label="加载数据状态" />
      </LayerCard>
    );

  return (
    <div className="research-page">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-basalt-muted-foreground">
        <span>
          净值截至 <span className="font-mono">{stats.navSpan.max || '—'}</span> · 业绩截至{' '}
          <span className="font-mono">{stats.lastPerfDate || '—'}</span>
        </span>
        <DataInfo
          name="数据状态"
          source="东方财富"
          date={stats.navSpan.max}
          collectedAt={stats.lastFetchAt}
        >
          <p>历史净值起始日：{stats.navSpan.min || '—'}。</p>
          <p>最近采集状态：{stats.lastFetchStatus || '未提供'}。</p>
        </DataInfo>
      </div>
      <div className="research-stats">
        <StatTile label="基金产品" value={formatCount(stats.counts.fund_basic_info)} />
        <StatTile label="历史净值记录" value={formatCount(stats.counts.fund_nav)} />
        <StatTile label="MVP 研究池" value={formatCount(stats.flags?.mvp)} />
        <StatTile label="通过 4433" value={formatCount(stats.flags?.pass4433)} />
      </div>
      <div className="research-data-grid">
        <LayerCard padding="none">
          <PanelHeading title="基金大类分布" />
          <LayerCard.Body>
            {l1.length ? (
              <SeriesChart
                type="bar"
                orientation="horizontal"
                points={l1}
                series={[{ key: 'n', label: '只数' }]}
                colorByCategory={false}
                height={260}
                valueFormatter={formatCompact}
                ariaLabel="基金大类分布"
              />
            ) : (
              <ResearchEmpty
                title={typesError ? '类型加载失败' : '暂无类型数据'}
                action={
                  typesError ? (
                    <Button variant="outline" size="sm" onClick={() => void retryTypes()}>
                      重试
                    </Button>
                  ) : null
                }
              />
            )}
          </LayerCard.Body>
        </LayerCard>
        <LayerCard padding="none">
          <PanelHeading
            title="指标记录覆盖"
            action={
              <DataInfo name="记录覆盖" date={stats.lastPerfDate}>
                <p>
                  按记录行数与基金总数比较。持仓、任职等可能一只基金多条记录，此图不代表去重后的基金覆盖率。
                </p>
              </DataInfo>
            }
          />
          <LayerCard.Body>
            {coverage.length ? (
              <SeriesChart
                type="bar"
                orientation="horizontal"
                points={coverage}
                series={[
                  { key: 'have', label: '已有记录（上限为基金总数）' },
                  { key: 'gap', label: '距基金总数' },
                ]}
                height={260}
                valueFormatter={formatCompact}
                ariaLabel="指标记录覆盖"
              />
            ) : (
              <ResearchEmpty title="暂无覆盖数据" />
            )}
          </LayerCard.Body>
        </LayerCard>
        <LayerCard padding="none">
          <PanelHeading title="采集记录状态" />
          <LayerCard.Body>
            {fetchSlices.length ? (
              <SharePie items={fetchSlices} height={260} />
            ) : (
              <ResearchEmpty title="暂无采集日志" />
            )}
          </LayerCard.Body>
        </LayerCard>
        <LayerCard padding="none">
          <PanelHeading title="扩展资料记录" />
          <LayerCard.Body>
            {satellites.length ? (
              <SeriesChart
                type="bar"
                orientation="horizontal"
                points={satellites}
                series={[{ key: 'n', label: '行' }]}
                colorByCategory={false}
                height={260}
                valueFormatter={formatCompact}
                ariaLabel="扩展资料记录"
              />
            ) : (
              <ResearchEmpty title="暂无扩展数据" />
            )}
          </LayerCard.Body>
        </LayerCard>
      </div>
      <LayerCard padding="none">
        <PanelHeading title="资料明细" description="各类数据的记录行数" />
        <LayerCard.Body className="grid gap-x-8 gap-y-0 py-2 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <div key={row.key} className="research-fact-row">
              <span>{row.label}</span>
              <span className="font-mono tabular-nums">{formatCount(row.n)}</span>
            </div>
          ))}
        </LayerCard.Body>
      </LayerCard>
    </div>
  );
}
