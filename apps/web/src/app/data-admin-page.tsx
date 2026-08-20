import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { AppShell } from '@/components/layout';
import { formatCount } from '@/lib/format-number';

interface Stats {
  counts: Record<string, number>;
  navSpan: { min: string | null; max: string | null };
  lastFetchAt: number | null;
  lastFetchStatus: string | null;
  lastPerfDate: string | null;
}

const LABELS: Record<string, string> = {
  fund_basic_info: '基金基本信息',
  fund_performance: '阶段业绩',
  fund_nav: '历史净值',
  fund_trend_extra: '扩展 JSON',
  fetch_log: '抓取日志',
};

export default function DataAdminPage() {
  const { data, error, isLoading } = useSWR<Stats>('/api/stats', fetchAPI);

  return (
    <AppShell breadcrumbs={[{ label: '数据管理' }]}>
      <h1 className="mb-4 text-xl font-semibold">数据管理</h1>
      {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
      {error && <p className="text-sm text-destructive-text">{error.message}</p>}
      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(data.counts).map(([table, n]) => (
              <div key={table} className="rounded-card bg-secondary p-4 ring-1 ring-border/40">
                <p className="text-xs text-muted-foreground">{LABELS[table] ?? table}</p>
                <p className="text-right text-2xl font-semibold tabular-nums">{formatCount(n)}</p>
                <p className="text-[11px] text-muted-foreground">{table}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-card bg-secondary p-4 text-sm ring-1 ring-border/40">
            <p>
              净值覆盖：{data.navSpan.min ?? '—'} → {data.navSpan.max ?? '—'}
            </p>
            <p>业绩最新日：{data.lastPerfDate ?? '—'}</p>
            <p>
              最近抓取：
              {data.lastFetchAt
                ? `${new Date(data.lastFetchAt).toISOString()}（${data.lastFetchStatus}）`
                : '—'}
            </p>
          </div>
        </>
      )}
    </AppShell>
  );
}
