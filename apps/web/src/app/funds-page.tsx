import { useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { AppShell } from '@/components/layout';
import { FilterCheck } from '@/components/ui/filter-check';
import { FilterDropdown } from '@/components/ui/filter-dropdown';
import { Input } from '@/components/ui/input';
import { Metric } from '@/components/ui/metric';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useImeSearch } from '@/hooks/use-ime-search';
import { formatCount } from '@/lib/format-number';

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

const RETURN_KEYS = new Set(['return_1y', 'return_1m', 'return_3m', 'return_6m']);

export default function FundsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const fundType = params.get('fundType') ?? '';
  const mvpOnly = params.get('mvpOnly') === '1';
  const hasNav = params.get('hasNav') === '1';
  const sort = params.get('sort') ?? 'fund_code';
  const dir = params.get('dir') === 'desc' ? 'desc' : 'asc';
  const rawPage = Number(params.get('page') ?? 1);
  const page =
    Number.isFinite(rawPage) && rawPage >= 1 ? Math.min(100_000, Math.floor(rawPage)) : 1;

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

  const { data, error, isLoading, isValidating } = useSWR<ListResponse>(query, fetchAPI, {
    keepPreviousData: true,
  });
  const { data: types } = useSWR<{ items: { fund_type: string; n: number }[] }>(
    '/api/fund-types',
    fetchAPI,
  );

  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      if (!('page' in patch)) next.set('page', '1');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const search = useImeSearch(q, (value) => set({ q: value || null }));

  const toggleSort = (key: string) => {
    if (sort === key) set({ dir: dir === 'asc' ? 'desc' : 'asc', page: '1' });
    else set({ sort: key, dir: 'asc', page: '1' });
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const typeOptions = (types?.items ?? []).map((item) => ({
    value: item.fund_type,
    label: `${item.fund_type} (${formatCount(item.n)})`,
  }));
  const filterActive = Boolean(q || fundType || mvpOnly || hasNav);

  return (
    <AppShell breadcrumbs={[{ label: '基金浏览' }]}>
      <div className="mb-5 rounded-card bg-secondary p-3 ring-1 ring-border/40">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="fund-q"
            value={search.value}
            placeholder="代码 / 名称 / 拼音"
            aria-label="关键词"
            className="h-[38px] w-52 shadow-xs"
            onChange={search.onChange}
            onCompositionStart={search.onCompositionStart}
            onCompositionEnd={search.onCompositionEnd}
          />
          <FilterDropdown
            label="类型"
            value={fundType || 'all'}
            options={typeOptions}
            onChange={(value) => set({ fundType: value === 'all' ? null : value })}
          />
          <FilterCheck
            label="MVP 池"
            checked={mvpOnly}
            onChange={(checked) => set({ mvpOnly: checked ? '1' : null })}
          />
          <FilterCheck
            label="有净值"
            checked={hasNav}
            onChange={(checked) => set({ hasNav: checked ? '1' : null })}
          />
          <button
            type="button"
            disabled={!filterActive && !search.value}
            onClick={() => set({ q: null, fundType: null, mvpOnly: null, hasNav: null })}
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:invisible"
          >
            重置
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive-text">{error.message}</p>}
      {isLoading && !data && <p className="text-sm text-muted-foreground">加载中…</p>}

      {data && (
        <div className="rounded-card bg-secondary ring-1 ring-border/40">
          <p className="px-3 pt-3 text-xs text-muted-foreground">
            共 {formatCount(data.total)} 只 · 第 {formatCount(data.page)}/{formatCount(pages)} 页 ·
            每页 {formatCount(data.pageSize)}
            {isValidating ? ' · 更新中…' : ''}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                {SORTS.map(([key, label]) => (
                  <TableHead
                    key={key}
                    aria-sort={sort === key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={RETURN_KEYS.has(key) ? 'text-right' : undefined}
                  >
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
                  <TableCell>
                    <Metric value={row.return_1y} kind="percent" signed />
                  </TableCell>
                  <TableCell>
                    <Metric value={row.return_1m} kind="percent" signed />
                  </TableCell>
                  <TableCell>
                    <Metric value={row.return_3m} kind="percent" signed />
                  </TableCell>
                  <TableCell>
                    <Metric value={row.return_6m} kind="percent" signed />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex gap-2 p-3">
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1 text-sm disabled:opacity-40"
              disabled={data.page <= 1}
              onClick={() => set({ page: String(data.page - 1) })}
            >
              上一页
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1 text-sm disabled:opacity-40"
              disabled={data.page >= pages}
              onClick={() => set({ page: String(data.page + 1) })}
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
