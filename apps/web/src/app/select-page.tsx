import { Button, Input, LayerCard } from '@nocoo/basalt';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@nocoo/basalt/components/table';
import { ChevronDown, Search, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
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
import { FilterChips } from '@/components/ui/filter-chips';
import { FilterDropdown } from '@/components/ui/filter-dropdown';
import { Metric } from '@/components/ui/metric';
import { FundTypeBadges } from '@/components/ui/type-badge';
import { useImeSearch } from '@/hooks/use-ime-search';
import { formatCount, formatMetric } from '@/lib/format-number';
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
  const [filtersOpen, setFiltersOpen] = useState(false);
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
  const { data, error, isLoading, isValidating, mutate } = useSWR<ListResponse>(api, fetchAPI);

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
    ? '该指标暂未收录，请选择其他维度。'
    : '没有符合条件的基金，试试放宽筛选范围。';
  const descriptions: Record<SelectLens, string> = {
    return: '比较阶段收益与同类位置，发现值得深入研究的基金。',
    risk: '从回撤、波动和风险调整收益，观察基金的风险特征。',
    hold: '关注水下时间、连跌与修复过程，理解真实持有体验。',
    dca: '比较定投年化、月度胜率与波动，观察长期投入表现。',
    cost: '横向比较基金持有成本，结合份额类型查看费率。',
    picks: '结合收益、风险、规模与费用，收敛研究范围。',
  };
  const resetFilters = () => applyState(parseSelectSearch(new URLSearchParams(), lens));

  return (
    <AppShell breadcrumbs={[{ label: '选基' }, { label: LENS_LABEL[lens] }]}>
      <div className="research-page research-list-page">
        <ResearchHeader
          title={`选基 · ${LENS_LABEL[lens]}`}
          icon={SlidersHorizontal}
          description={descriptions[lens]}
        />
        <nav className="flex flex-wrap items-center gap-1" aria-label="选基视角">
          {(Object.entries(LENS_LABEL) as [SelectLens, string][]).map(([key, label]) => (
            <Button
              key={key}
              variant={key === lens ? 'secondary' : 'ghost'}
              size="sm"
              asChild
              className={key === lens ? 'text-basalt-primary' : 'text-basalt-muted-foreground'}
            >
              <Link to={`/select/${key}`} aria-current={key === lens ? 'page' : undefined}>
                {label}
              </Link>
            </Button>
          ))}
        </nav>
        <div className="research-selection">
          <LayerCard className="research-filter-panel" padding="none">
            <PanelHeading
              title="筛选条件"
              action={
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={resetFilters}
                  >
                    重置
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 md:hidden"
                    aria-label={filtersOpen ? '收起筛选' : '展开筛选'}
                    aria-expanded={filtersOpen}
                    onClick={() => setFiltersOpen(!filtersOpen)}
                  >
                    <ChevronDown className={filtersOpen ? 'size-4 rotate-180' : 'size-4'} />
                  </Button>
                </div>
              }
            />
            <div className="research-filter-body" data-collapsed={!filtersOpen}>
              <div className="research-filter-section">
                <div className="research-search">
                  <Search strokeWidth={1.5} aria-hidden="true" />
                  <Input
                    value={search.value}
                    aria-label="搜索基金"
                    placeholder="代码 / 名称 / 拼音"
                    onChange={search.onChange}
                    onCompositionStart={search.onCompositionStart}
                    onCompositionEnd={search.onCompositionEnd}
                  />
                </div>
                <FilterDropdown
                  label="大类"
                  value={normalized.typeL1}
                  options={l1Options}
                  onChange={(value) =>
                    set({ typeL1: value === DEFAULT_TYPE_L1 ? DEFAULT_TYPE_L1 : value, typeL2: '' })
                  }
                />
                {l2Options.length > 0 ? (
                  <FilterDropdown
                    label="细类"
                    value={normalized.typeL2 || 'all'}
                    options={l2Options}
                    allLabel="全部细类"
                    onChange={(value) => set({ typeL2: value === 'all' ? '' : value })}
                  />
                ) : null}
              </div>
              <div className="research-filter-section">
                <FilterChips
                  label="观察维度"
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
              </div>
              <div className="research-filter-section">
                <span className="research-filter-label">附加条件</span>
                <div className="research-filter-options">
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
              </div>
              <div className="research-filter-section text-xs leading-relaxed text-basalt-muted-foreground">
                {normalized.typeL1 === TYPE_L1_ALL
                  ? '当前为跨类型混排；行内百分位仍按完整基金类型计算。'
                  : '同类比较按完整基金类型计算。点击结果可查看净值、收益与基金档案。'}
              </div>
            </div>
          </LayerCard>
          <LayerCard className="research-data-table" padding="none">
            <PanelHeading
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {dim.label}
                  <span className="text-xs font-normal text-basalt-muted-foreground">
                    {normalized.typeL2 ||
                      (normalized.typeL1 === TYPE_L1_ALL ? '全部类型' : normalized.typeL1)}
                  </span>
                </span>
              }
              action={
                <div className="flex items-center gap-2 text-[11px] text-basalt-muted-foreground">
                  <span aria-live="polite">
                    {isValidating
                      ? '更新中…'
                      : `${formatCount(data?.total)} 只 · ${dim.dir === 'desc' ? '从高到低' : '从低到高'}`}
                  </span>
                  <DataInfo name="选基指标">
                    <p>按所选维度排序；指标缺失时显示空态。排名和收益使用各基金可用数据。</p>
                  </DataInfo>
                </div>
              }
            />
            <LayerCard.Body className="research-table-viewport" aria-busy={isLoading}>
              {error ? (
                <ResearchEmpty
                  title="选基数据加载失败"
                  description={error.message}
                  action={
                    <Button variant="outline" size="sm" onClick={() => void mutate()}>
                      重试
                    </Button>
                  }
                />
              ) : isLoading && !data ? (
                <LayerCard.Loading label="加载选基结果" />
              ) : data ? (
                <Table className="[&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16 text-right">名次</TableHead>
                      <TableHead className="hidden md:table-cell">代码</TableHead>
                      <TableHead>名称</TableHead>
                      <TableHead className="hidden md:table-cell">类型</TableHead>
                      <TableHead className="text-right">{dim.label}</TableHead>
                      {dim.rankPct ? (
                        <TableHead className="hidden text-right md:table-cell">同类%</TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={dim.rankPct ? 6 : 5}
                          className="text-center text-basalt-muted-foreground py-8"
                        >
                          {emptyHint}
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
                          <TableCell className="text-right font-mono text-xs tabular-nums text-basalt-muted-foreground">
                            {formatCount(listRank(data.page, data.pageSize, index))}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Link
                              className="font-mono text-xs text-basalt-muted-foreground hover:text-basalt-primary"
                              to={fundDetailLink(row.fund_code, listOrigin).to}
                              state={fundDetailLink(row.fund_code, listOrigin).state}
                              onClick={() => writeListOrigin(listOrigin)}
                            >
                              {row.fund_code}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Link
                              className="research-fund-name block font-medium hover:text-basalt-primary"
                              title={row.fund_name}
                              to={fundDetailLink(row.fund_code, listOrigin).to}
                              state={fundDetailLink(row.fund_code, listOrigin).state}
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
                          <TableCell>
                            {dim.key === 'recovery_days_1y' && row.recovery_status_1y === 'open' ? (
                              <p className="text-right text-sm text-basalt-muted-foreground">
                                未收复
                              </p>
                            ) : (
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
                                {dim.rankPct ? (
                                  <span className="text-[10px] text-basalt-muted-foreground md:hidden">
                                    同类 {formatMetric(row[dim.rankPct], 'percent')}
                                  </span>
                                ) : null}
                                {dim.key === 'all_in_fee_pct' && row.sales_fee_known === 0 ? (
                                  <span className="text-[11px] text-basalt-muted-foreground">
                                    销服未知
                                  </span>
                                ) : null}
                              </div>
                            )}
                          </TableCell>
                          {dim.rankPct ? (
                            <TableCell className="hidden md:table-cell">
                              <Metric value={row[dim.rankPct]} kind="percent" align="end" />
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              ) : null}
            </LayerCard.Body>
            {data ? (
              <ListPagination
                page={data.page}
                pages={pages}
                total={data.total}
                pageSize={data.pageSize || SELECT_PAGE_SIZE}
                onPageChange={(page) => set({ page })}
              />
            ) : null}
          </LayerCard>
        </div>
      </div>
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
