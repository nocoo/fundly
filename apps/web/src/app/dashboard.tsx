import { Button, LayerCard } from '@nocoo/basalt';
import {
  ArrowUpRight,
  Globe2,
  LayoutDashboard,
  type LucideIcon,
  Search,
  Shield,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router';
import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { DataInfo } from '@/components/charts/market-chart-controls';
import { SeriesChart } from '@/components/charts/series-chart';
import { AppShell } from '@/components/layout';
import {
  PanelHeading,
  ResearchEmpty,
  ResearchHeader,
  StatTile,
} from '@/components/layout/research-layout';
import { cleanNamedPoints, formatCompact } from '@/lib/chart-data';
import type { DataStats } from '@/lib/data-stats-vm';
import { formatCount } from '@/lib/format-number';
import { formatFundTypeLabel, listTypeL1 } from '@/lib/fund-type';
import { DASHBOARD_ENTRIES } from '@/lib/navigation';

const ENTRY_ICONS: Record<string, LucideIcon> = { LineChart: Globe2, Search, TrendingUp, Shield };
const ENTRIES = DASHBOARD_ENTRIES.map((entry) => ({
  ...entry,
  Icon: ENTRY_ICONS[entry.icon] ?? Search,
}));

export default function Dashboard() {
  const { data: stats, error, isLoading, mutate } = useSWR<DataStats>('/api/stats', fetchAPI);
  const {
    data: types,
    error: typesError,
    isLoading: typesLoading,
    mutate: retryTypes,
  } = useSWR<{ items: { fund_type: string; n: number }[] }>('/api/fund-types', fetchAPI);
  const chart = cleanNamedPoints(
    (types?.items ?? [])
      .slice(0, 12)
      .map((item) => ({ name: formatFundTypeLabel(item.fund_type), value: item.n })),
    'n',
  );
  const categories = listTypeL1(types?.items ?? []);
  const fundCount = stats?.counts.fund_basic_info;

  return (
    <AppShell>
      <div className="research-page">
        <ResearchHeader
          title="仪表盘"
          icon={LayoutDashboard}
          description={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>从市场全景，到基金研究</span>
              <span>
                净值截至 <span className="font-mono">{stats?.navSpan.max || '—'}</span>
              </span>
            </span>
          }
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link to="/market?wall=1">
                <Globe2 className="size-3.5" strokeWidth={1.5} /> 打开宏观大屏{' '}
                <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
              </Link>
            </Button>
          }
        />

        {error ? (
          <LayerCard>
            <ResearchEmpty
              title="数据概览加载失败"
              description={error.message}
              action={
                <Button variant="outline" size="sm" onClick={() => void mutate()}>
                  重试
                </Button>
              }
            />
          </LayerCard>
        ) : null}
        <div className="research-stats" aria-busy={isLoading}>
          <StatTile
            label="全市场基金"
            value={formatCount(fundCount)}
            hint="公募基金产品"
            action={
              <DataInfo
                name="基金数据"
                source="东方财富"
                date={stats?.navSpan.max}
                collectedAt={stats?.lastFetchAt}
              >
                <p>
                  历史净值：{stats?.navSpan.min || '—'} 至 {stats?.navSpan.max || '—'}。
                </p>
              </DataInfo>
            }
          />
          <StatTile
            label="历史净值"
            value={formatCount(stats?.counts.fund_nav)}
            hint="累计净值记录"
          />
          <StatTile label="MVP 研究池" value={formatCount(stats?.flags?.mvp)} hint="已纳入研究池" />
          <StatTile
            label="通过 4433"
            value={formatCount(stats?.flags?.pass4433)}
            hint="满足长期与短期排名筛选"
          />
        </div>

        <div className="research-overview-grid">
          <LayerCard padding="none">
            <PanelHeading
              title="基金类型分布"
              description="按产品数量观察全市场结构 · 前 12 个细分类型"
              action={<span className="text-[11px] text-basalt-muted-foreground">单位：只</span>}
            />
            <LayerCard.Body className="flex-1 overflow-visible">
              {typesError ? (
                <ResearchEmpty
                  title="类型分布加载失败"
                  action={
                    <Button variant="outline" size="sm" onClick={() => void retryTypes()}>
                      重试
                    </Button>
                  }
                />
              ) : typesLoading ? (
                <LayerCard.Loading label="加载类型分布" />
              ) : chart.length ? (
                <SeriesChart
                  type="bar"
                  orientation="horizontal"
                  points={chart}
                  series={[{ key: 'n', label: '基金只数' }]}
                  colorByCategory={false}
                  height={Math.max(340, chart.length * 31)}
                  valueFormatter={formatCompact}
                  ariaLabel="基金类型分布"
                />
              ) : (
                <ResearchEmpty title="暂无类型数据" />
              )}
            </LayerCard.Body>
            <LayerCard.Footer className="justify-between text-[11px] text-basalt-muted-foreground">
              <span>{formatCount(types?.items.length)} 个细分类型</span>
              <Link
                to="/funds"
                className="inline-flex items-center gap-1 hover:text-basalt-primary"
              >
                浏览全部基金 <ArrowUpRight className="size-3" />
              </Link>
            </LayerCard.Footer>
          </LayerCard>
          <LayerCard padding="none">
            <PanelHeading title="研究入口" description="横看市场，纵看产品" />
            <LayerCard.Body className="flex flex-1 flex-col gap-1 p-2">
              {ENTRIES.map(({ href, Icon, title, description }) => (
                <Button key={href} variant="ghost" asChild className="research-entry flex-1">
                  <Link to={href}>
                    <span className="flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-basalt-primary/8 text-basalt-primary">
                        <Icon className="size-[18px]" strokeWidth={1.5} />
                      </span>
                      <span className="flex flex-col gap-1.5">
                        <span className="text-sm font-semibold text-basalt-foreground">
                          {title}
                        </span>
                        <span className="text-xs font-normal text-basalt-muted-foreground">
                          {description}
                        </span>
                      </span>
                    </span>
                    <ArrowUpRight
                      className="size-4 shrink-0 text-basalt-muted-foreground"
                      strokeWidth={1.5}
                    />
                  </Link>
                </Button>
              ))}
            </LayerCard.Body>
          </LayerCard>
        </div>

        <LayerCard padding="none">
          <PanelHeading title="按大类探索" description="选择类别，进入对应基金列表" />
          <LayerCard.Body className="research-category-grid p-3">
            {categories.map((category) => (
              <Button
                key={category.value}
                variant="ghost"
                asChild
                className="research-category-link"
              >
                <Link to={`/funds?${new URLSearchParams({ typeL1: category.value })}`}>
                  <span className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="flex justify-between gap-2">
                      <span className="text-xs font-medium">{category.label}</span>
                      <span className="font-mono text-xs text-basalt-muted-foreground">
                        {formatCount(category.n)}
                      </span>
                    </span>
                    <span
                      className="h-1 w-full overflow-hidden rounded-full bg-basalt-muted"
                      aria-hidden="true"
                    >
                      <span
                        className="block h-full rounded-full bg-basalt-primary/65"
                        style={{ width: `${fundCount ? (category.n / fundCount) * 100 : 0}%` }}
                      />
                    </span>
                  </span>
                </Link>
              </Button>
            ))}
            {!categories.length ? (
              <div className="col-span-full text-sm text-basalt-muted-foreground">
                {typesLoading ? '加载中…' : '暂无基金分类'}
              </div>
            ) : null}
          </LayerCard.Body>
        </LayerCard>
      </div>
    </AppShell>
  );
}
