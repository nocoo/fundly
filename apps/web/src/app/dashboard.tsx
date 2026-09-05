import { Button, LayerCard } from '@nocoo/basalt';
import { PageHeader } from '@nocoo/basalt/components/page-header';
import { SectionRule } from '@nocoo/basalt/components/section-rule';
import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { SeriesChart } from '@/components/charts/series-chart';
import { AppShell } from '@/components/layout';
import { CHART_HEIGHTS } from '@/lib/chart-config';
import { cleanNamedPoints, formatCompact } from '@/lib/chart-data';
import { formatCount } from '@/lib/format-number';
import { formatFundTypeLabel } from '@/lib/fund-type';

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
    (types?.items ?? []).slice(0, 12).map((item) => ({
      name: formatFundTypeLabel(item.fund_type),
      value: item.n,
    })),
    'n',
  );
  const fundCount = stats?.counts.fund_basic_info;
  const navCount = stats?.counts.fund_nav;

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="仪表盘"
          description={
            isLoading && !stats
              ? '加载中…'
              : '中国公募基金全市场数据全景，包含基础只数、净值行数与类型分布。'
          }
          actions={
            error ? (
              <Button variant="outline" size="sm" onClick={() => void mutate()}>
                重试
              </Button>
            ) : null
          }
        />

        {error && <p className="text-sm text-basalt-danger">{error.message}</p>}

        <SectionRule title="数据概览" hint="全市场基金基础信息与净值采集总计。">
          <div className="grid gap-3 md:grid-cols-3">
            <KpiCard label="基金只数" value={formatCount(fundCount)} />
            <KpiCard label="净值行" value={formatCount(navCount)} />
            <KpiCard
              label="净值区间"
              value={stats ? `${stats.navSpan.min ?? '—'} → ${stats.navSpan.max ?? '—'}` : '—'}
              compact
            />
          </div>
        </SectionRule>

        <SectionRule title="分类统计" hint="按基金大类统计前 12 大分类只数分布。">
          <LayerCard className="overflow-visible">
            <LayerCard.Header className="text-sm font-semibold text-basalt-foreground">
              基金类型分布（前 12）
            </LayerCard.Header>
            <LayerCard.Body className="overflow-visible">
              {typesError && (
                <p className="text-sm text-basalt-danger">类型分布加载失败：{typesError.message}</p>
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
                !typesError && <p className="text-sm text-basalt-muted-foreground">暂无类型数据</p>
              )}
            </LayerCard.Body>
          </LayerCard>
        </SectionRule>
      </div>
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
    <LayerCard>
      <div className="mb-4 h-1 w-10 rounded-full bg-basalt-primary" />
      <p className="text-xs text-basalt-muted-foreground">{label}</p>
      <p
        className={
          compact
            ? 'mt-2 text-right text-sm font-medium tabular-nums text-basalt-foreground'
            : 'mt-2 text-right text-2xl font-semibold tracking-tight tabular-nums text-basalt-foreground'
        }
      >
        {value}
      </p>
    </LayerCard>
  );
}
