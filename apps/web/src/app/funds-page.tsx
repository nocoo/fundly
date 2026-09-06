import { Button, Input, LayerCard } from '@nocoo/basalt';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@nocoo/basalt/components/table';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { DataInfo } from '@/components/charts/market-chart-controls';
import { AppShell } from '@/components/layout';
import {
  ListPagination,
  PanelHeading,
  ResearchEmpty,
  ResearchHeader,
} from '@/components/layout/research-layout';
import { FilterCheck } from '@/components/ui/filter-check';
import { FilterDropdown } from '@/components/ui/filter-dropdown';
import { Metric } from '@/components/ui/metric';
import { FundTypeBadges } from '@/components/ui/type-badge';
import { useImeSearch } from '@/hooks/use-ime-search';
import { formatCount } from '@/lib/format-number';
import { listTypeL1, listTypeL2 } from '@/lib/fund-type';
import {
  fundsSearchEmpty,
  fundsUrlState,
  parseFundsSearch,
  readStoredFundsFilters,
  writeStoredFundsFilters,
} from '@/lib/funds-vm';
import { fundDetailLink, fundDetailTo, originFromList, writeListOrigin } from '@/lib/list-origin';

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
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const hydrated = useRef(false);
  const tableViewport = useRef<HTMLDivElement>(null);
  const filters = useMemo(() => parseFundsSearch(params), [params]);
  const { q, typeL1, typeL2, mvpOnly, hasNav, sort, dir, page } = filters;

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (typeL1) p.set('typeL1', typeL1);
    if (typeL2) p.set('typeL2', typeL2);
    if (mvpOnly) p.set('mvpOnly', '1');
    if (hasNav) p.set('hasNav', '1');
    p.set('sort', sort);
    p.set('dir', dir);
    p.set('page', String(page));
    p.set('pageSize', '200');
    return `/api/funds?${p}`;
  }, [q, typeL1, typeL2, mvpOnly, hasNav, sort, dir, page]);

  useEffect(() => {
    if (query) tableViewport.current?.scrollTo({ top: 0 });
  }, [query]);

  const { data, error, isLoading, isValidating, mutate } = useSWR<ListResponse>(query, fetchAPI, {
    keepPreviousData: true,
  });
  const { data: types } = useSWR<{ items: { fund_type: string; n: number }[] }>(
    '/api/fund-types',
    fetchAPI,
  );

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    if (!fundsSearchEmpty(params)) return;
    const stored = readStoredFundsFilters();
    if (!stored) return;
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(fundsUrlState(stored))) {
      if (value) next.set(key, value);
    }
    if ([...next.keys()].length === 0) return;
    setParams(next, { replace: true });
  }, [params, setParams]);

  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      if (!('page' in patch)) next.set('page', '1');
      writeStoredFundsFilters(parseFundsSearch(next));
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const listOrigin = originFromList(location.pathname, location.search) ?? {
    path: '/funds' as const,
    search: location.search,
  };

  const openDetail = (code: string) => {
    const loc = fundDetailTo(code, listOrigin);
    navigate(loc.to, { state: loc.state });
  };

  const search = useImeSearch(q, (value) => set({ q: value || null }));

  const toggleSort = (key: string) => {
    if (sort === key) set({ dir: dir === 'asc' ? 'desc' : 'asc', page: '1' });
    else set({ sort: key, dir: 'asc', page: '1' });
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const l1Options = listTypeL1(types?.items ?? []).map((item) => ({
    value: item.value,
    label: `${item.label} (${formatCount(item.n)})`,
  }));
  const l2Options = listTypeL2(types?.items ?? [], typeL1).map((item) => ({
    value: item.value,
    label: `${item.label} (${formatCount(item.n)})`,
  }));
  const filterActive = Boolean(q || typeL1 || typeL2 || mvpOnly || hasNav);

  const resetFilters = () =>
    set({ q: null, typeL1: null, typeL2: null, mvpOnly: null, hasNav: null });
  const pageDates = [
    ...new Set((data?.items ?? []).flatMap((row) => (row.data_date ? [row.data_date] : []))),
  ].sort();

  return (
    <AppShell breadcrumbs={[{ label: '基金浏览' }]}>
      <div className="research-page research-list-page">
        <ResearchHeader
          title="基金浏览"
          icon={Search}
          description="从全市场找到研究标的，按分类与阶段收益逐层筛选。"
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link to="/select/return">
                多维选基 <ArrowUp className="size-3.5 rotate-45" />
              </Link>
            </Button>
          }
        />
        <LayerCard className="research-toolbar overflow-visible" padding="none">
          <div className="research-search">
            <Search strokeWidth={1.5} aria-hidden="true" />
            <Input
              id="fund-q"
              value={search.value}
              placeholder="代码 / 名称 / 拼音"
              aria-label="关键词"
              onChange={search.onChange}
              onCompositionStart={search.onCompositionStart}
              onCompositionEnd={search.onCompositionEnd}
            />
          </div>
          <FilterDropdown
            label="大类"
            value={typeL1 || 'all'}
            options={l1Options}
            onChange={(value) => set({ typeL1: value === 'all' ? null : value, typeL2: null })}
          />
          {l2Options.length > 0 ? (
            <FilterDropdown
              label="细类"
              value={typeL2 || 'all'}
              options={l2Options}
              onChange={(value) => set({ typeL2: value === 'all' ? null : value })}
            />
          ) : null}
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
          <div className="flex items-center gap-2 md:hidden">
            <FilterDropdown
              label="排序"
              value={sort}
              options={SORTS.map(([value, label]) => ({ value, label }))}
              includeAll={false}
              onChange={toggleSort}
            />
            <Button
              variant="ghost"
              size="sm"
              aria-label="切换排序方向"
              onClick={() => set({ dir: dir === 'asc' ? 'desc' : 'asc' })}
            >
              {dir === 'asc' ? '升序' : '降序'}
            </Button>
          </div>
          {filterActive || search.value ? (
            <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={resetFilters}>
              重置筛选
            </Button>
          ) : null}
        </LayerCard>

        <LayerCard className="research-data-table" padding="none">
          <PanelHeading
            title={
              <span className="flex items-center gap-2">
                {filterActive ? '筛选结果' : '全部基金'}
                <span className="font-mono text-xs font-normal text-basalt-muted-foreground">
                  {data ? formatCount(data.total) : '—'}
                </span>
              </span>
            }
            action={
              <div className="flex items-center gap-2 text-[11px] text-basalt-muted-foreground">
                <span aria-live="polite">{isValidating ? '更新中…' : '点击基金，查看详情'}</span>
                <DataInfo name="基金列表" date={pageDates.at(-1)} source="东方财富">
                  <p>
                    阶段收益按各基金可用数据展示。本页业绩日期：{pageDates[0] || '—'}
                    {pageDates.length > 1 ? ` 至 ${pageDates.at(-1)}` : ''}。
                  </p>
                </DataInfo>
              </div>
            }
          />
          <LayerCard.Body className="flex min-h-0 flex-1 p-0">
            <div ref={tableViewport} className="research-table-viewport" aria-busy={isLoading}>
              {error ? (
                <ResearchEmpty
                  title="基金列表加载失败"
                  description={error.message}
                  action={
                    <Button variant="outline" size="sm" onClick={() => void mutate()}>
                      重试
                    </Button>
                  }
                />
              ) : isLoading && !data ? (
                <LayerCard.Loading label="加载基金列表" />
              ) : data?.items.length === 0 ? (
                <ResearchEmpty
                  title="没有符合条件的基金"
                  description="试试更换关键词或放宽筛选条件。"
                  action={
                    <Button variant="outline" size="sm" onClick={resetFilters}>
                      重置筛选
                    </Button>
                  }
                />
              ) : data ? (
                <Table className="[&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
                  <TableHeader>
                    <TableRow>
                      {SORTS.map(([key, label]) => (
                        <TableHead
                          key={key}
                          aria-sort={
                            sort === key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'
                          }
                          className={
                            RETURN_KEYS.has(key)
                              ? 'text-right'
                              : key === 'fund_code' || key === 'fund_type'
                                ? 'hidden md:table-cell'
                                : undefined
                          }
                        >
                          <Button
                            variant="ghost"
                            className="research-sort"
                            onClick={() => toggleSort(key)}
                          >
                            {label}
                            {sort === key ? (
                              dir === 'asc' ? (
                                <ArrowUp className="size-3 text-basalt-primary" />
                              ) : (
                                <ArrowDown className="size-3 text-basalt-primary" />
                              )
                            ) : null}
                          </Button>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((row) => {
                      const loc = fundDetailLink(row.fund_code, listOrigin);
                      return (
                        <TableRow
                          key={row.fund_code}
                          className="cursor-pointer"
                          onClick={(event: React.MouseEvent) => {
                            if ((event.target as HTMLElement).closest('a')) return;
                            openDetail(row.fund_code);
                          }}
                        >
                          <TableCell className="hidden w-24 font-mono text-xs text-basalt-muted-foreground md:table-cell">
                            {row.fund_code}
                          </TableCell>
                          <TableCell>
                            <Link
                              className="research-fund-name block font-medium text-basalt-foreground hover:text-basalt-primary"
                              title={row.fund_name}
                              to={loc.to}
                              state={loc.state}
                              onClick={() => writeListOrigin(listOrigin)}
                            >
                              {row.fund_name}
                            </Link>
                            <span className="mt-1 block font-mono text-[11px] text-basalt-muted-foreground md:hidden">
                              {row.fund_code}
                            </span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <FundTypeBadges type={row.fund_type} />
                          </TableCell>
                          {(['return_1y', 'return_1m', 'return_3m', 'return_6m'] as const).map(
                            (key) => (
                              <TableCell key={key}>
                                <Metric value={row[key]} kind="percent" signed align="end" />
                              </TableCell>
                            ),
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : null}
            </div>
          </LayerCard.Body>
          {data ? (
            <ListPagination
              page={data.page}
              pages={pages}
              total={data.total}
              pageSize={data.pageSize}
              onPageChange={(value) => set({ page: String(value) })}
            />
          ) : null}
        </LayerCard>
      </div>
    </AppShell>
  );
}
