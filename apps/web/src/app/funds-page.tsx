import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { AppShell } from '@/components/layout';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface FundRow {
  fund_code: string;
  fund_name: string;
  fund_type: string;
  return_1m: number | null;
  return_3m: number | null;
  return_6m: number | null;
  return_1y: number | null;
  data_date: string | null;
}

interface ListResponse {
  items: FundRow[];
  total: number;
  page: number;
  pageSize: number;
}

const SORTS = [
  ['fund_code', '代码'],
  ['fund_name', '名称'],
  ['fund_type', '类型'],
  ['return_1y', '近1年'],
  ['return_1m', '近1月'],
  ['return_3m', '近3月'],
  ['return_6m', '近6月'],
] as const;

function num(v: number | null) {
  return v === null || Number.isNaN(v) ? '—' : v.toFixed(2);
}

export default function FundsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const fundType = params.get('fundType') ?? '';
  const mvpOnly = params.get('mvpOnly') === '1';
  const hasNav = params.get('hasNav') === '1';
  const sort = params.get('sort') ?? 'fund_code';
  const dir = params.get('dir') === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, Number(params.get('page') ?? 1));

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (fundType) p.set('fundType', fundType);
    if (mvpOnly) p.set('mvpOnly', '1');
    if (hasNav) p.set('hasNav', '1');
    p.set('sort', sort);
    p.set('dir', dir);
    p.set('page', String(page));
    p.set('pageSize', '200');
    return `/api/funds?${p}`;
  }, [q, fundType, mvpOnly, hasNav, sort, dir, page]);

  const { data, error, isLoading } = useSWR<ListResponse>(query, fetchAPI);
  const { data: types } = useSWR<{ items: { fund_type: string; n: number }[] }>(
    '/api/fund-types',
    fetchAPI,
  );

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (!('page' in patch)) next.set('page', '1');
    setParams(next);
  };

  const toggleSort = (key: string) => {
    if (sort === key) set({ dir: dir === 'asc' ? 'desc' : 'asc', page: '1' });
    else set({ sort: key, dir: 'asc', page: '1' });
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <AppShell breadcrumbs={[{ label: '基金浏览' }]}>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor="fund-q">
          关键词
          <Input
            id="fund-q"
            value={q}
            placeholder="代码 / 名称 / 拼音"
            onChange={(e) => set({ q: e.target.value || null })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor="fund-type">
          类型
          <select
            id="fund-type"
            className="h-9 rounded-md border border-border bg-secondary px-2 text-sm text-foreground"
            value={fundType}
            onChange={(e) => set({ fundType: e.target.value || null })}
          >
            <option value="">全部类型</option>
            {(types?.items ?? []).map((t) => (
              <option key={t.fund_type} value={t.fund_type}>
                {t.fund_type} ({t.n})
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={mvpOnly}
            onChange={(e) => set({ mvpOnly: e.target.checked ? '1' : null })}
          />
          MVP 池
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hasNav}
            onChange={(e) => set({ hasNav: e.target.checked ? '1' : null })}
          />
          有净值
        </label>
      </div>

      {error && <p className="text-sm text-destructive-text">{error.message}</p>}
      {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}

      {data && (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            共 {data.total.toLocaleString('zh-CN')} 只 · 第 {data.page}/{pages} 页 · 每页{' '}
            {data.pageSize}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                {SORTS.map(([key, label]) => (
                  <TableHead key={key}>
                    <button type="button" className="font-medium" onClick={() => toggleSort(key)}>
                      {label}
                      {sort === key ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((row) => (
                <TableRow key={row.fund_code}>
                  <TableCell>
                    <Link className="text-primary hover:underline" to={`/funds/${row.fund_code}`}>
                      {row.fund_code}
                    </Link>
                  </TableCell>
                  <TableCell>{row.fund_name}</TableCell>
                  <TableCell>{row.fund_type}</TableCell>
                  <TableCell>{num(row.return_1y)}</TableCell>
                  <TableCell>{num(row.return_1m)}</TableCell>
                  <TableCell>{num(row.return_3m)}</TableCell>
                  <TableCell>{num(row.return_6m)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1 text-sm disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => set({ page: String(page - 1) })}
            >
              上一页
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1 text-sm disabled:opacity-40"
              disabled={page >= pages}
              onClick={() => set({ page: String(page + 1) })}
            >
              下一页
            </button>
          </div>
        </>
      )}
    </AppShell>
  );
}
