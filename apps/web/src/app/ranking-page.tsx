import { Button, LayerCard } from '@nocoo/basalt';
import { PageHeader } from '@nocoo/basalt/components/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@nocoo/basalt/components/table';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { AppShell } from '@/components/layout';
import { FilterCheck } from '@/components/ui/filter-check';
import { FilterChips } from '@/components/ui/filter-chips';
import { Metric } from '@/components/ui/metric';
import { FundTypeBadges } from '@/components/ui/type-badge';
import { formatCount } from '@/lib/format-number';
import { listTypeL1, listTypeL2 } from '@/lib/fund-type';
import { fundDetailLink, fundDetailTo, originFromList, writeListOrigin } from '@/lib/list-origin';
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
  rankingSearchDirty,
  rankingSearchEmpty,
  rankingUrlState,
  readStoredRanking,
  riskKeysFromCaps,
  TYPE_L1_ALL,
  visibleDims,
  writeStoredRanking,
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
  capabilities: { risk: boolean; riskDims?: Record<string, boolean> };
}

const CONTEXT_LABEL: Record<'return_1y' | 'return_1m', string> = {
  return_1y: '近1年',
  return_1m: '近1月',
};

export default function RankingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const hydrated = useRef(false);
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
  const riskKeys = useMemo(() => riskKeysFromCaps(data?.capabilities), [data?.capabilities]);
  const normalized = useMemo(
    () => normalizeRankingState(parsed, types?.items ?? [], riskKeys),
    [parsed, types, riskKeys],
  );

  useEffect(() => {
    if (hydrated.current) return;
    if (!rankingSearchEmpty(params)) {
      hydrated.current = true;
      return;
    }
    const stored = readStoredRanking();
    hydrated.current = true;
    if (!stored) return;
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(rankingUrlState(stored))) {
      if (value) next.set(key, value);
    }
    if ([...next.keys()].length === 0) return;
    setParams(next, { replace: true });
  }, [params, setParams]);

  useEffect(() => {
    if (!rankingSearchDirty(params, normalized)) return;
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(rankingUrlState(normalized))) {
      if (value == null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  }, [normalized, params, setParams]);

  const persistReady = useRef(false);
  useEffect(() => {
    if (!persistReady.current) {
      persistReady.current = true;
      return;
    }
    writeStoredRanking(normalized);
  }, [normalized]);

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

  const listOrigin = originFromList(location.pathname, location.search) ?? {
    path: '/ranking' as const,
    search: location.search,
  };

  const openDetail = (code: string) => {
    const loc = fundDetailTo(code, listOrigin);
    navigate(loc.to, { state: loc.state });
  };

  const dim = data?.sort && data.sort !== normalized.dim.key ? dimByKey(data.sort) : normalized.dim;
  const l1Options = listTypeL1(types?.items ?? []).map((item) => ({
    value: item.value,
    label: `${item.label} (${formatCount(item.n)})`,
  }));
  const l2Options = listTypeL2(types?.items ?? [], normalized.typeL1).map((item) => ({
    value: item.value,
    label: `${item.label} (${formatCount(item.n)})`,
  }));
  const dimOptions = visibleDims(riskKeys === 'unknown' ? [] : riskKeys).map((item) => ({
    value: item.key,
    label: item.label,
  }));
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const contextKeys = contextReturnKeys(dim);
  const rankPctKey = dim.rankPct;
  const showSamples = dim.group === 'risk';
  const colSpan = 5 + contextKeys.length + (rankPctKey ? 1 : 0) + (showSamples ? 1 : 0);

  return (
    <AppShell breadcrumbs={[{ label: '基金排名' }]}>
      <div className="space-y-6">
        <PageHeader
          title="基金排名"
          description="按收益率、夏普比率、最大回撤等多维度全市场基金排名与百分位对比。"
          filters={
            <div className="space-y-2.5">
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
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <FilterCheck
                  label="仅 4433"
                  checked={normalized.pass4433}
                  onChange={(checked) => set({ pass4433: checked ? '1' : null })}
                />
              </div>
              {normalized.typeL1 === TYPE_L1_ALL ? (
                <p className="text-xs text-basalt-muted-foreground">
                  未选大类时货币与股票会排在同一榜，跨类型比较意义有限。
                </p>
              ) : null}
              {showSamples ? (
                <p className="text-xs text-basalt-muted-foreground">
                  风险榜仅纳入净值样本 ≥ {formatCount(RISK_MIN_SAMPLES)}{' '}
                  的基金；不足一年按已有历史计算。
                </p>
              ) : null}
            </div>
          }
        />

        {error && <p className="text-sm text-basalt-danger">{error.message}</p>}
        {isLoading && !data && <p className="text-sm text-basalt-muted-foreground">加载中…</p>}

        {data && (
          <LayerCard>
            <LayerCard.Header className="flex items-center justify-between text-xs text-basalt-muted-foreground">
              <span>
                共 {formatCount(data.total)} 只 · 第 {formatCount(data.page)}/{formatCount(pages)}{' '}
                页 · 每页 {formatCount(data.pageSize)}
                {isValidating ? ' · 更新中…' : ''}
              </span>
            </LayerCard.Header>
            <LayerCard.Body className="p-0">
              <div className="overflow-x-auto">
                <Table className="[&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
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
                        <TableCell
                          colSpan={colSpan}
                          className="text-center text-basalt-muted-foreground py-8"
                        >
                          这一页没有基金。
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.items.map((row, index) => (
                        <TableRow
                          key={row.fund_code}
                          className="cursor-pointer"
                          onClick={(event: React.MouseEvent) => {
                            if ((event.target as HTMLElement).closest('a')) return;
                            openDetail(row.fund_code);
                          }}
                        >
                          <TableCell className="text-right tabular-nums">
                            {formatCount(listRank(data.page, data.pageSize, index))}
                          </TableCell>
                          <TableCell>
                            <Link
                              className="font-medium text-basalt-foreground hover:text-basalt-primary hover:underline"
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
              </div>
            </LayerCard.Body>
            <LayerCard.Footer className="flex items-center gap-2 p-3">
              <Button
                variant="outline"
                size="sm"
                disabled={data.page <= 1}
                onClick={() => set({ page: String(data.page - 1) })}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={data.page >= pages}
                onClick={() => set({ page: String(data.page + 1) })}
              >
                下一页
              </Button>
            </LayerCard.Footer>
          </LayerCard>
        )}
      </div>
    </AppShell>
  );
}
