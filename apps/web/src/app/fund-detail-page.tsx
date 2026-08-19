import { CircleOff } from 'lucide-react';
import { useParams } from 'react-router';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { AppShell } from '@/components/layout';
import { EmptyState } from '@/components/ui/empty-state';

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
  const { data: nav } = useSWR<{ items: { nav_date: string; unit_nav: number }[] }>(
    code ? `/api/funds/${code}/nav?limit=400` : null,
    fetchAPI,
  );

  if (isLoading) {
    return (
      <AppShell breadcrumbs={[{ label: '基金浏览', href: '/funds' }, { label: code }]}>
        <p className="text-sm text-muted-foreground">加载中…</p>
      </AppShell>
    );
  }
  if (error || !data) {
    return (
      <AppShell breadcrumbs={[{ label: '基金浏览', href: '/funds' }, { label: code }]}>
        <EmptyState icon={CircleOff} tone="error" title="未找到基金" description={error?.message} />
      </AppShell>
    );
  }

  const groups = [...new Set(data.fields.map((f) => f.group))];
  const name = data.fields.find((f) => f.key === 'fund_name')?.value ?? code;

  return (
    <AppShell breadcrumbs={[{ label: '基金浏览', href: '/funds' }, { label: String(name) }]}>
      <h1 className="mb-4 text-xl font-semibold">
        {name} <span className="text-muted-foreground text-base">{code}</span>
      </h1>

      {nav?.items && nav.items.length > 1 && (
        <div className="mb-6 h-64 rounded-card bg-secondary p-3">
          <p className="mb-2 text-sm text-muted-foreground">
            单位净值（最近 {nav.items.length} 点）
          </p>
          <ResponsiveContainer width="100%" height="90%">
            <LineChart data={nav.items}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="nav_date" hide />
              <YAxis domain={['auto', 'auto']} width={48} />
              <Tooltip />
              <Line type="monotone" dataKey="unit_nav" stroke="hsl(var(--primary))" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
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
                    className="flex items-center gap-2 rounded-widget bg-secondary px-3 py-2 text-sm"
                  >
                    <CircleOff className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                    <span className="text-muted-foreground">{f.label}：暂无数据</span>
                  </div>
                ) : (
                  <div key={f.key} className="rounded-widget bg-secondary px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{f.label}</span>
                    <div className="font-medium">{String(f.value)}</div>
                  </div>
                ),
              )}
          </div>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">
        净值点数 {data.navCount.toLocaleString('zh-CN')}
      </p>
    </AppShell>
  );
}
