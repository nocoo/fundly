import { useCallback, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
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
import {
  contextReturnKeys,
  DEFAULT_DIM_KEY,
  DEFAULT_TYPE_L1,
  dimByKey,
  listRank,
  normalizeRankingState,
  parseRankingSearch,
  RISK_MIN_SAMPLES,
  rankingApiPath,
  rankingStatesEqual,
  rankingUrlState,
  TYPE_L1_ALL,
  visibleDims,
} from '@/lib/ranking-vm';

interface RankRow {
  fund_code: string;
  fund_name: string;
  fund_type: string;
  return_1m: number | null;
  return_1y: number | null;
  return_3m: number | null;
  return_6m: number | null;
  rank_pct_1m: number | null;
  rank_pct_3m: number | null;
  rank_pct_6m: number | null;
  rank_pct_1y: number | null;
  sharpe_1y: number | null;
  max_drawdown_1y: number | null;
  volatility_1y: number | null;
  calmar_1y: number | null;
  nav_samples_1y: number | null;
}

interface ListResponse {
  items: RankRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  capabilities: { risk: boolean };
}

const CONTEXT_LABEL: Record<'return_1y' | 'return_1m', string> = {
  return_1y: '近1年',
  return_1m: '近1月',
};

export default function RankingPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const parsed = useMemo(() => parseRankingSearch(params), [params]);
  const { data: types } = useSWR<{ items: { fund_type: string; n: number }[] }>(
    '/api/fund-types',
    fetchAPI,
  );
  const { data, error, isLoading, isValidating } = useSWR<ListResponse>(
    rankingApiPath(parsed),
    fetchAPI,
    { keepPreviousData: true },
  );
  const risk = data?.capabilities.risk !== false;
  const normalized = useMemo(
    () => normalizeRankingState(parsed, types?.items ?? [], risk),
    [parsed, types, risk],
  );

  useEffect(() => {
    if (rankingStatesEqual(parsed, normalized)) return;
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(rankingUrlState(normalized))) {
      if (value == null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  }, [normalized, params, parsed, setParams]);

  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === '') next.delete(key);
        else next.set(key, value);
      }
      if (!('page' in patch)) next.set('page', '1');
      if (next.get('page') === '1') next.delete('page');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const dim = data?.sort && data.sort !== normalized.dim.key ? dimByKey(data.sort) : normalized.dim;
  const l1Options = listTypeL1(types?.items ?? []).map((item) => ({
    value: item.value,
    label: `${item.label} (${formatCount(item.n)})`,
  }));
  const l2Options = listTypeL2(types?.items ?? [], normalized.typeL1).map((item) => ({
    value: item.value,
    label: `${item.label} (${formatCount(item.n)})`,
  }));
  const dimOptions = visibleDims(Boolean(data?.capabilities.risk)).map((item) => ({
    value: item.key,
    label: item.label,
  }));
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const contextKeys = contextReturnKeys(dim);
  const rankPctKey = dim.rankPct;
  const showSamples = dim.group === 'risk';

  return (
    <AppShell breadcrumbs={[{ label: '基金排名' }]}>
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
          onChange={(value) => set({ dim: value === DEFAULT_DIM_KEY ? null : value })}
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
            未选大类时货币与股票会排在同一榜，跨类型比较意义有限。
          </p>
        ) : null}
        {showSamples ? (
          <p className="text-xs text-muted-foreground">
            风险榜仅纳入净值样本 ≥ {formatCount(RISK_MIN_SAMPLES)} 的基金；不足一年按已有历史计算。
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          A/C/H 等份额按基金代码分别入榜，未做主基金去重。
        </p>
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
                <TableHead className="w-16 text-right">名次</TableHead>
                <TableHead>代码</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead className="text-right">{dim.label}</TableHead>
                {contextKeys.map((key) => (
                  <TableHead key={key} className="text-right">
                    {CONTEXT_LABEL[key]}
                  </TableHead>
                ))}
                {rankPctKey ? <TableHead className="text-right">同类%</TableHead> : null}
                {showSamples ? <TableHead className="text-right">样本</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">
                    这一页没有基金。
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((row, index) => (
                  <TableRow
                    key={row.fund_code}
                    className="cursor-pointer"
                    onClick={() => navigate(`/funds/${row.fund_code}`)}
                  >
                    <TableCell className="text-right tabular-nums">
                      {formatCount(listRank(data.page, data.pageSize, index))}
                    </TableCell>
                    <TableCell>
                      <Link className="text-foreground" to={`/funds/${row.fund_code}`}>
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
                    {contextKeys.map((key) => (
                      <TableCell key={key}>
                        <Metric value={row[key]} kind="percent" signed align="end" />
                      </TableCell>
                    ))}
                    {rankPctKey ? (
                      <TableCell>
                        <Metric value={row[rankPctKey]} kind="percent" align="end" />
                      </TableCell>
                    ) : null}
                    {showSamples ? (
                      <TableCell className="text-right tabular-nums">
                        {formatCount(row.nav_samples_1y)}
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
