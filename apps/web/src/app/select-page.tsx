import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { AppShell } from '@/components/layout';
import { FilterCheck } from '@/components/ui/filter-check';
import { FilterChips } from '@/components/ui/filter-chips';
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
import { FundTypeBadges } from '@/components/ui/type-badge';
import { useImeSearch } from '@/hooks/use-ime-search';
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
  readStoredSelect,
  SELECT_PAGE_SIZE,
  type SelectLens,
  type SelectState,
  selectApiPath,
  selectSearchDirty,
  selectSearchEmpty,
  selectUrlState,
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
  capabilities?: {
    risk: boolean;
    riskDims: Record<string, boolean>;
    select: boolean;
    selectDims: Record<string, boolean>;
  };
}

export function RankingRedirect() {
  const location = useLocation();
  return <Navigate to={rankingRedirectPath(location.search)} replace />;
}

export default function SelectPage() {
  const { lens: rawLens = 'return' } = useParams();
  if (!isSelectLens(rawLens)) return <Navigate to="/select/return" replace />;
  return <SelectLensPage key={rawLens} lens={rawLens} />;
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
    () => normalizeSelectState(parsed, types?.items ?? [], lens),
    [parsed, types, lens],
  );
  const api = selectApiPath(lens, normalized);
  const { data, error, isLoading, isValidating } = useSWR<ListResponse>(api, fetchAPI);

  const applyState = useCallback(
    (state: SelectState) => {
      const next = new URLSearchParams();
      for (const [key, value] of Object.entries(selectUrlState(state, lens))) {
        if (value != null && value !== '') next.set(key, value);
      }
      setParams(next, { replace: true });
    },
    [lens, setParams],
  );

  const set = useCallback(
    (patch: Partial<SelectState>) => {
      applyState({ ...normalized, ...patch, page: patch.page ?? 1 });
    },
    [applyState, normalized],
  );

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    if (!selectSearchEmpty(params)) return;
    const stored = readStoredSelect(lens);
    if (Object.keys(stored).length === 0) return;
    applyState(normalizeSelectState({ ...normalized, ...stored }, types?.items ?? [], lens));
  }, [applyState, lens, normalized, params, types]);

  useEffect(() => {
    if (!hydrated.current) return;
    writeStoredSelect(lens, normalized);
    if (selectSearchDirty(params, normalized, lens)) applyState(normalized);
  }, [applyState, lens, normalized, params]);

  const listOrigin = originFromList(location.pathname, location.search) ?? {
    path: `/select/${lens}`,
    search: location.search,
  };
  const openDetail = (code: string) => {
    const loc = fundDetailTo(code, listOrigin);
    navigate(loc.to, { state: loc.state });
  };

  const dim = normalized.dim;
  const l1Options = listTypeL1(types?.items ?? []).map((item) => ({
    value: item.value,
    label: `${item.label} (${formatCount(item.n)})`,
  }));
  const l2Options = listTypeL2(types?.items ?? [], normalized.typeL1).map((item) => ({
    value: item.value,
    label: `${item.label} (${formatCount(item.n)})`,
  }));
  const dimOptions = dimsFor(lens, normalized.typeL1).map((item) => ({
    value: item.key,
    label: item.label,
  }));
  const search = useImeSearch(normalized.q, (value) => set({ q: value }));
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const dimReady = dimCapability(lens, dim.key, data?.capabilities);
  const emptyHint = !dimReady
    ? dim.key === 'seven_day_yield'
      ? '该维尚未计算，请跑 bun run fetch:daily。'
      : lens === 'risk'
        ? '该维尚未计算，请跑 bun run compute:risk。'
        : '该维尚未计算，请跑 bun run compute:select。'
    : '这一页没有基金。';

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
              typeL1: value === DEFAULT_TYPE_L1 ? DEFAULT_TYPE_L1 : value,
              typeL2: '',
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
            onChange={(value) => set({ typeL2: value === 'all' ? '' : value })}
          />
        ) : null}
        <div className="max-w-sm">
          <Input
            value={search.value}
            placeholder="搜索代码 / 简称 / 拼音"
            onChange={search.onChange}
            onCompositionStart={search.onCompositionStart}
            onCompositionEnd={search.onCompositionEnd}
          />
        </div>
        <FilterChips
          label="维度"
          value={dim.key}
          options={dimOptions}
          onChange={(value) =>
            set({
              dim:
                dimsFor(lens, normalized.typeL1).find((item) => item.key === value) ??
                defaultDim(lens, normalized.typeL1),
            })
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          <FilterCheck
            label="仅 4433"
            checked={normalized.pass4433}
            onChange={(checked) => set({ pass4433: checked })}
          />
          {lens === 'picks' ? (
            <>
              <FilterCheck
                label="仅 MVP"
                checked={normalized.mvpOnly}
                onChange={(checked) => set({ mvpOnly: checked })}
              />
              <FilterCheck
                label="样本≥200"
                checked={normalized.minSamples != null}
                onChange={(checked) => set({ minSamples: checked ? 200 : null })}
              />
              <FilterCheck
                label="费率前50%"
                checked={normalized.feePeer != null}
                onChange={(checked) => set({ feePeer: checked ? 50 : null })}
              />
              <FilterCheck
                label="回撤前50%"
                checked={normalized.ddPeer != null}
                onChange={(checked) => set({ ddPeer: checked ? 50 : null })}
              />
              <FilterCheck
                label="规模前50%"
                checked={normalized.scalePeer != null}
                onChange={(checked) => set({ scalePeer: checked ? 50 : null })}
              />
              <FilterCheck
                label="前十大≤60%"
                checked={normalized.top10Max != null}
                onChange={(checked) => set({ top10Max: checked ? 60 : null })}
              />
            </>
          ) : null}
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
                {dim.rankPct ? <TableHead className="text-right">同类%</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={dim.rankPct ? 6 : 5} className="text-muted-foreground">
                    {emptyHint}
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
                      <div className="flex flex-col items-end gap-0.5">
                        <Metric
                          value={
                            dim.key === 'all_in_fee_pct'
                              ? (row.all_in_fee_pct ?? row.fee_shown_pct)
                              : row[dim.key]
                          }
                          kind={dim.kind}
                          signed={dim.signed}
                          align="end"
                        />
                        {dim.key === 'all_in_fee_pct' && row.sales_fee_known === 0 ? (
                          <span className="text-[11px] text-muted-foreground">销服未知</span>
                        ) : null}
                      </div>
                    </TableCell>
                    {dim.rankPct ? (
                      <TableCell>
                        <Metric value={row[dim.rankPct]} kind="percent" align="end" />
                      </TableCell>
                    ) : null}
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
              onClick={() => set({ page: normalized.page - 1 })}
            >
              上一页
            </button>
            <button
              type="button"
              className="text-sm text-muted-foreground"
              disabled={normalized.page >= pages}
              onClick={() => set({ page: normalized.page + 1 })}
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function dimCapability(
  lens: SelectLens,
  key: string,
  caps: ListResponse['capabilities'] | undefined,
): boolean {
  if (!caps) return true;
  if (key.startsWith('return_')) return true;
  if (caps.riskDims[key] != null) return caps.riskDims[key] as boolean;
  if (caps.selectDims[key] != null) return caps.selectDims[key] as boolean;
  return lens === 'return';
}
