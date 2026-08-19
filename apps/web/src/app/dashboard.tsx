import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { AppShell } from '@/components/layout';

interface Stats {
  counts: Record<string, number>;
  navSpan: { min: string | null; max: string | null };
}

export default function Dashboard() {
  const { data: stats } = useSWR<Stats>('/api/stats', fetchAPI);
  const { data: types } = useSWR<{ items: { fund_type: string; n: number }[] }>(
    '/api/fund-types',
    fetchAPI,
  );
  const chart = (types?.items ?? []).slice(0, 12);

  return (
    <AppShell>
      <h1 className="mb-4 text-xl font-semibold">仪表盘</h1>
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-card bg-secondary p-4">
          <p className="text-xs text-muted-foreground">基金只数</p>
          <p className="text-2xl font-semibold">
            {(stats?.counts.fund_basic_info ?? 0).toLocaleString('zh-CN')}
          </p>
        </div>
        <div className="rounded-card bg-secondary p-4">
          <p className="text-xs text-muted-foreground">净值行</p>
          <p className="text-2xl font-semibold">
            {(stats?.counts.fund_nav ?? 0).toLocaleString('zh-CN')}
          </p>
        </div>
        <div className="rounded-card bg-secondary p-4">
          <p className="text-xs text-muted-foreground">净值区间</p>
          <p className="text-sm font-medium">
            {stats?.navSpan.min ?? '—'} → {stats?.navSpan.max ?? '—'}
          </p>
        </div>
      </div>
      <div className="h-80 rounded-card bg-secondary p-3">
        <p className="mb-2 text-sm text-muted-foreground">基金类型分布（前 12）</p>
        <ResponsiveContainer width="100%" height="90%">
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="fund_type" hide />
            <YAxis />
            <Tooltip />
            <Bar dataKey="n" fill="hsl(var(--primary))" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </AppShell>
  );
}
