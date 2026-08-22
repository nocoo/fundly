import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { AppShell } from '@/components/layout';
import { FilterCheck } from '@/components/ui/filter-check';
import { FilterChips } from '@/components/ui/filter-chips';
import { Metric } from '@/components/ui/metric';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FundTypeBadges } from '@/components/ui/type-badge';
import { formatCount } from '@/lib/format-number';
import { listTypeL1, listTypeL2 } from '@/lib/fund-type';
import { fundDetailLink, fundDetailTo, originFromList, writeListOrigin } from '@/lib/list-origin';
import { DEFAULT_TYPE_L1, listRank, TYPE_L1_ALL } from '@/lib/ranking-vm';
import {
  defaultDim,
  dimsFor,
  isSelectLens,
  LENS_LABEL,
  normalizeSelectState,
  parseSelectSearch,
  rankingRedirectPath,
  SELECT_PAGE_SIZE,
  type SelectLens,
  selectApiPath,
  writeStoredSelect,
} from '@/lib/select-vm';

interface SelectRow {
  fund_code: string;
  fund_name: string;
  fund_type: string;
  [key: string]: string | number | null;
}

interface ListResponse {
  items: SelectRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
}

export function RankingRedirect() {
  const location = useLocation();
  return <Navigate to={rankingRedirectPath(location.search)} replace />;
}

export default function SelectPage() {
  const { lens: rawLens = 'return' } = useParams();
  if (!isSelectLens(rawLens)) return <Navigate to="/select/return" replace />;
  return <SelectLensPage lens={rawLens} />;
}

function SelectLensPage({ lens }: { lens: SelectLens }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const hydrated = useRef(false);
  const parsed = useMemo(() => parseSelectSearch(params, lens), [params, lens]);
  const { data: types } = useSWR<{ items: { fund_type: string; n: number }[] }>(
    '/api/fund-types',
    fetchAPI,
  );
  const normalized = useMemo(
    () => normalizeSelectState(parsed, types?.items ?? []),
    [parsed, types],
  );
  const api = selectApiPath(lens, normalized);
  const { data, error, isLoading, isValidating } = useSWR<ListResponse>(api, fetchAPI);

  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === '') next.delete(key);
        else next.set(key, value);
      }
      if (!('page' in patch)) next.delete('page');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    writeStoredSelect(lens, normalized);
  }, [lens, normalized]);

  const listOrigin = originFromList(location.pathname, location.search) ?? {
    path: `/select/${lens}`,
    search: location.search,
  };
  const openDetail = (code: string) => {
    const loc = fundDetailTo(code, listOrigin);
    navigate(loc.to, { state: loc.state });
  };

  const dim =
    data?.sort && data.sort !== normalized.dim.key
      ? (dimsFor(lens).find((item) => item.key === data.sort) ?? normalized.dim)
      : normalized.dim;
  const l1Options = listTypeL1(types?.items ?? []).map((item) => ({
    value: item.value,
    label: `${item.label} (${formatCount(item.n)})`,
  }));
  const l2Options = listTypeL2(types?.items ?? [], normalized.typeL1).map((item) => ({
    value: item.value,
    label: `${item.label} (${formatCount(item.n)})`,
  }));
  const dimOptions = dimsFor(lens).map((item) => ({ value: item.key, label: item.label }));
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <AppShell breadcrumbs={[{ label: '选基' }, { label: LENS_LABEL[lens] }]}>
      <div className="mb-5 space-y-3 rounded-card bg-secondary p-3 ring-1 ring-border/40">
        <FilterChips
          label="大类"
          value={normalized.typeL1}
          options={l1Options}
          includeAll
          allValue={TYPE_L1_ALL}
          onChange={(value) =>
            set({
              typeL1: value === DEFAULT_TYPE_L1 ? null : value,
              typeL2: null,
            })
          }
        />
        {l2Options.length > 0 ? (
          <FilterChips
            label="细类"
            value={normalized.typeL2 || 'all'}
            options={l2Options}
            includeAll
            allLabel="全部细类"
            onChange={(value) => set({ typeL2: value === 'all' ? null : value })}
          />
        ) : null}
        <FilterChips
          label="维度"
          value={dim.key}
          options={dimOptions}
          onChange={(value) => set({ dim: value === defaultDim(lens).key ? null : value })}
        />
        <div className="flex flex-wrap items-center gap-2">
          <FilterCheck
            label="仅 4433"
            checked={normalized.pass4433}
            onChange={(checked) => set({ pass4433: checked ? '1' : null })}
          />
        </div>
        {normalized.typeL1 === TYPE_L1_ALL ? (
          <p className="text-xs text-muted-foreground">
            跨类型混排不可比，行内百分位仍按完整基金类型。
          </p>
        ) : null}
      </div>

      {error && <p className="text-sm text-destructive-text">{error.message}</p>}
      {isLoading && !data && <p className="text-sm text-muted-foreground">加载中…</p>}

      {data && (
        <div className="rounded-card bg-secondary ring-1 ring-border/40">
          <p className="px-3 pt-3 text-xs text-muted-foreground">
            共 {formatCount(data.total)} 只 · 第 {formatCount(data.page)}/{formatCount(pages)} 页 ·
            每页 {formatCount(SELECT_PAGE_SIZE)}
            {isValidating ? ' · 更新中…' : ''}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16 text-right">名次</TableHead>
                <TableHead>代码</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead className="text-right">{dim.label}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    {lens === 'return' || lens === 'risk'
                      ? '这一页没有基金。'
                      : '尚未计算该维，请跑 bun run compute:select。'}
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((row, index) => (
                  <TableRow
                    key={row.fund_code}
                    className="cursor-pointer"
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest('a')) return;
                      openDetail(row.fund_code);
                    }}
                  >
                    <TableCell className="text-right tabular-nums">
                      {formatCount(listRank(data.page, data.pageSize, index))}
                    </TableCell>
                    <TableCell>
                      <Link
                        className="text-foreground"
                        to={fundDetailLink(row.fund_code, listOrigin).to}
                        state={fundDetailLink(row.fund_code, listOrigin).state}
                        onClick={() => writeListOrigin(listOrigin)}
                      >
                        {row.fund_code}
                      </Link>
                    </TableCell>
                    <TableCell>{row.fund_name}</TableCell>
                    <TableCell>
                      <FundTypeBadges type={row.fund_type} />
                    </TableCell>
                    <TableCell>
                      <Metric
                        value={row[dim.key]}
                        kind={dim.kind}
                        signed={dim.signed}
                        align="end"
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="flex gap-2 p-3">
            <button
              type="button"
              className="text-sm text-muted-foreground"
              disabled={normalized.page <= 1}
              onClick={() => set({ page: String(normalized.page - 1) })}
            >
              上一页
            </button>
            <button
              type="button"
              className="text-sm text-muted-foreground"
              disabled={normalized.page >= pages}
              onClick={() => set({ page: String(normalized.page + 1) })}
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
