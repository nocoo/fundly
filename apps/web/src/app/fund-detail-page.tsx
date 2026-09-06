import { Button, LayerCard } from '@nocoo/basalt';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@nocoo/basalt/components/tabs';
import { ToggleGroup, ToggleGroupItem } from '@nocoo/basalt/components/toggle-group';
import { ArrowLeft, CircleOff } from 'lucide-react';
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { ChartEmptyMask } from '@/components/charts/chart-empty-mask';
import { FundMarketChart } from '@/components/charts/fund-market-chart';
import {
  ChartControls,
  type ChartInterval,
  type ChartYears,
  DataInfo,
  defaultInterval,
} from '@/components/charts/market-chart-controls';
import { ScoreRadar } from '@/components/charts/radar-chart';
import { SeriesChart } from '@/components/charts/series-chart';
import { SharePie } from '@/components/charts/share-pie';
import { AppShell } from '@/components/layout';
import { PanelHeading, ResearchHeader, StatTile } from '@/components/layout/research-layout';
import { CopyField } from '@/components/ui/copy-field';
import { Metric } from '@/components/ui/metric';
import { FundTypeBadges } from '@/components/ui/type-badge';
import { useChartPrefs } from '@/hooks/use-chart-prefs';
import { useIsMobile } from '@/hooks/use-mobile';
import { resolveBenchmark } from '@/lib/benchmark-defaults';
import { CHART_HEIGHTS, GROWTH_STROKE, refStroke, seriesStroke } from '@/lib/chart-config';
import type { ChartPoint, ChartSeries } from '@/lib/chart-data';
import { alignedNavGrowthDomains, buildGrowthPoints } from '@/lib/chart-growth';
import {
  fieldCopyText,
  fieldNumberKind,
  formatAxisMetric,
  formatCount,
  formatMetric,
  isSignedPercentField,
} from '@/lib/format-number';
import {
  clipTimePoints,
  type FundExtras,
  grandTotalChart,
  rankingChart,
  scaleChart,
  seriesChartFromCategories,
} from '@/lib/fund-extra-vm';
import {
  LIST_LABEL,
  type ListOrigin,
  listBackLabel,
  listHref,
  resolveListOrigin,
} from '@/lib/list-origin';
import { parseRangeYears, rangeBounds, utcTs } from '@/lib/time-window';
import { cn } from '@/lib/utils';

interface FieldView {
  key: string;
  label: string;
  group: string;
  value: string | number | null;
  empty: boolean;
}

interface FundNavItem {
  nav_date: string;
  unit_nav: number | null;
  million_income: number | null;
  seven_day_yield: number | null;
}

interface DetailResponse {
  fields: FieldView[];
  extras: FundExtras;
  navCount: number;
  marketInstrument?: { id: string; symbol: string; name: string } | null;
}

const HEADER_FIELD_KEYS = new Set(['fund_type', 'data_date', 'scale_date']);
const PANEL = 240;

function BackToList({
  origin,
  variant = 'ghost',
}: {
  origin: ListOrigin;
  variant?: 'ghost' | 'outline';
}) {
  return (
    <Button variant={variant} size="icon" className="h-8 w-8 shrink-0" asChild>
      <Link to={listHref(origin)} aria-label={listBackLabel(origin)}>
        <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
      </Link>
    </Button>
  );
}

export default function FundDetailPage() {
  const { code = '' } = useParams();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const pendingParams = useRef(params);
  useLayoutEffect(() => {
    pendingParams.current = params;
  }, [params]);
  const updateParams = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(pendingParams.current);
      for (const [key, value] of Object.entries(patch)) next.set(key, value);
      pendingParams.current = next;
      setParams(next, { replace: true });
    },
    [setParams],
  );
  const isMobile = useIsMobile();
  const listOrigin = resolveListOrigin(location.state);
  const listCrumb = { label: LIST_LABEL[listOrigin.path], href: listHref(listOrigin) };
  const { data, error, isLoading, mutate } = useSWR<DetailResponse>(
    code ? `/api/funds/${code}` : null,
    fetchAPI,
  );
  const showMarket = Boolean(data?.marketInstrument && params.get('chart') !== 'nav');
  const requestedYears = parseRangeYears(params.get('years') ?? '1');
  const years = showMarket && requestedYears === 10 ? 5 : requestedYears;
  const marketYears: ChartYears = years === 10 ? 5 : years;
  const rawInterval = params.get('interval');
  const interval: ChartInterval =
    rawInterval === 'day' || rawInterval === 'week' || rawInterval === 'month'
      ? rawInterval
      : defaultInterval(marketYears);
  const bounds = useMemo(() => rangeBounds(years), [years]);
  const timeDomain = { from: utcTs(bounds.from), to: utcTs(bounds.to) };
  const { data: siblings } = useSWR<{
    items: Array<{
      fund_code: string;
      fund_name: string;
      share_class: string;
      all_in_fee_pct: number | null;
      sales_fee_known: number | null;
    }>;
  }>(code ? `/api/funds/${code}/siblings` : null, fetchAPI);
  const navKey = code ? `/api/funds/${code}/nav?from=${bounds.from}&limit=3000` : null;
  const {
    data: nav,
    error: navError,
    isLoading: navLoading,
    mutate: retryNav,
  } = useSWR<{ items: FundNavItem[] }>(navKey, fetchAPI);
  const { data: latestNavData } = useSWR<{ items: FundNavItem[] }>(
    code ? `/api/funds/${code}/nav?limit=1` : null,
    fetchAPI,
  );
  const { prefs } = useChartPrefs();
  const fundType = String(data?.fields.find((f) => f.key === 'fund_type')?.value ?? '');
  const bench = resolveBenchmark(fundType, prefs.benchmarks);
  const showBench = Boolean(bench && bench.code !== code);
  const { data: benchNav } = useSWR<{ items: { nav_date: string; unit_nav: number }[] }>(
    showBench && bench ? `/api/funds/${bench.code}/nav?from=${bounds.from}&limit=3000` : null,
    fetchAPI,
  );
  const moneyPoints = useMemo(() => {
    const raw = (nav?.items ?? [])
      .filter(
        (item): item is typeof item & { million_income: number } => item.million_income != null,
      )
      .map((item) => ({
        name: item.nav_date,
        income: item.million_income,
        ...(item.seven_day_yield != null ? { yield7: item.seven_day_yield } : {}),
      }));
    return clipTimePoints(raw, bounds.from, bounds.to);
  }, [nav, bounds.from, bounds.to]);
  const isMoneySeries =
    moneyPoints.length > 0 ||
    Boolean(latestNavData?.items.some((item) => item.million_income != null));
  const growth = useMemo(() => {
    if (isMoneySeries) return [];
    const primary = (nav?.items ?? [])
      .filter((item) => item.unit_nav != null)
      .map((item) => ({ date: item.nav_date, nav: item.unit_nav as number }));
    const benchPoints = (benchNav?.items ?? []).map((item) => ({
      date: item.nav_date,
      nav: item.unit_nav,
    }));
    return buildGrowthPoints(primary, {
      ...(showBench ? { bench: benchPoints } : {}),
      refRates: prefs.refRates,
      from: bounds.from,
      to: bounds.to,
    });
  }, [isMoneySeries, nav, benchNav, showBench, prefs.refRates, bounds.from, bounds.to]);
  const growthDomain = useMemo(() => alignedNavGrowthDomains(growth), [growth]);

  if (isLoading) {
    return (
      <AppShell breadcrumbs={[listCrumb, { label: code }]}>
        <div className="flex items-center gap-2">
          <BackToList origin={listOrigin} />
          <p className="text-sm text-basalt-muted-foreground">加载中…</p>
        </div>
      </AppShell>
    );
  }
  if (error || !data) {
    const missing = !error || error.message === 'Not found';
    return (
      <AppShell breadcrumbs={[listCrumb, { label: code }]}>
        <div className="space-y-6">
          <div className="mb-4">
            <BackToList origin={listOrigin} variant="outline" />
          </div>
          <LayerCard className="py-12 text-center">
            <LayerCard.Body className="flex flex-col items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-basalt-danger/10 text-basalt-danger mb-4">
                <CircleOff className="h-8 w-8" strokeWidth={1.5} />
              </div>
              <h2 className="text-lg font-semibold text-basalt-foreground">
                {missing ? '未找到基金' : '加载失败'}
              </h2>
              {!missing ? (
                <Button variant="outline" size="sm" onClick={() => void mutate()}>
                  重试
                </Button>
              ) : null}
              {error?.message ? (
                <p className="mt-1 text-sm text-basalt-muted-foreground mb-4">{error.message}</p>
              ) : null}
            </LayerCard.Body>
          </LayerCard>
        </div>
      </AppShell>
    );
  }

  const name = data.fields.find((f) => f.key === 'fund_name')?.value ?? code;
  const extras = data.extras;
  const allocation = extras.allocation
    ? clipTimePoints(
        seriesChartFromCategories(extras.allocation.categories, extras.allocation.series).points,
        bounds.from,
        bounds.to,
      )
    : [];
  const holders = extras.holders
    ? clipTimePoints(
        seriesChartFromCategories(extras.holders.categories, extras.holders.series).points,
        bounds.from,
        bounds.to,
      )
    : [];
  const scale = extras.scale
    ? clipTimePoints(scaleChart(extras.scale).points, bounds.from, bounds.to)
    : [];
  const ranking = clipTimePoints(
    extras.ranking.length ? rankingChart(extras.ranking).points : [],
    bounds.from,
    bounds.to,
  );
  const grand = extras.grandTotal ? grandTotalChart(extras.grandTotal) : null;
  const grandDomain = grand ? { from: utcTs(grand.from), to: utcTs(grand.to) } : timeDomain;

  const growthSeries: ChartSeries[] = [
    { key: 'nav', label: String(name), color: GROWTH_STROKE.fund },
    ...(showBench && bench
      ? [
          {
            key: 'bench',
            label: `基准 ${bench.name}`,
            dashed: true as const,
            color: GROWTH_STROKE.bench,
            yAxis: 'right' as const,
          },
        ]
      : []),
    ...prefs.refRates.map((rate, index) => ({
      key: `ref_${index}`,
      label: `年化 ${rate.toFixed(2)}%`,
      dashed: true as const,
      color: refStroke(index),
      yAxis: 'right' as const,
    })),
  ];

  const fieldValue = (key: string) => data.fields.find((field) => field.key === key)?.value ?? null;
  const latestNav = latestNavData?.items.at(-1);
  const navDate = latestNav?.nav_date ?? '';
  const profileFields = fieldsOf(data.fields, '基本信息').filter(
    (field) => !['fund_code', 'fund_name'].includes(field.key),
  );
  const rankingFields = fieldsOf(data.fields, '排名');
  const performanceFields = fieldsOf(data.fields, '业绩');
  const changeYears = (next: ChartYears) =>
    updateParams({ years: String(next), interval: defaultInterval(next) });
  const hasStructure = scale.length > 0 || allocation.length > 1 || holders.length > 1;

  return (
    <AppShell breadcrumbs={[listCrumb, { label: String(name) }]}>
      <div className="research-page">
        <ResearchHeader
          title={
            <span className="flex min-w-0 items-center gap-2">
              <BackToList origin={listOrigin} />
              <span className="min-w-0 break-words">{name}</span>
              <span className="shrink-0 font-mono text-sm font-normal text-basalt-muted-foreground">
                {code}
              </span>
            </span>
          }
          description={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {fundType ? <FundTypeBadges type={fundType} wrap /> : null}
              <span>
                净值截至 <span className="font-mono">{navDate || '—'}</span>
              </span>
              <DataInfo name="基金资料" source="东方财富" date={navDate}>
                <p>业绩日期：{String(fieldValue('data_date') ?? '未提供')}</p>
                <p>规模日期：{String(fieldValue('scale_date') ?? '未提供')}</p>
                <p>单位净值与阶段收益分别展示。场内行情使用交易价格，分红、折溢价会造成差异。</p>
              </DataInfo>
              {siblings?.items.length ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span>其他份额</span>
                  {siblings.items.map((item) => (
                    <Link
                      key={item.fund_code}
                      className="font-medium text-basalt-foreground hover:text-basalt-primary"
                      to={`/funds/${item.fund_code}`}
                      state={{ list: listHref(listOrigin) }}
                    >
                      {item.share_class || item.fund_code}
                      {item.all_in_fee_pct != null
                        ? ` · ${formatMetric(item.all_in_fee_pct, 'percent')}`
                        : ''}
                      {item.sales_fee_known === 0 ? '（销服未知）' : ''}
                    </Link>
                  ))}
                </span>
              ) : null}
            </span>
          }
        />

        <div className="research-stats">
          <StatTile
            label={isMoneySeries ? '最新万份收益' : '最新单位净值'}
            value={
              <Metric
                value={isMoneySeries ? latestNav?.million_income : latestNav?.unit_nav}
                kind="nav"
              />
            }
            hint={isMoneySeries ? '每万份基金收益 · 元' : '单位净值 · 元'}
          />
          <StatTile
            label="近 1 年收益"
            value={<Metric value={fieldValue('return_1y')} kind="percent" signed />}
            hint="基金阶段收益"
          />
          <StatTile
            label="基金规模"
            value={<Metric value={fieldValue('fund_scale')} kind="scale" />}
            hint="资产规模 · 亿元"
          />
          <StatTile
            label="管理费率"
            value={<Metric value={fieldValue('fee_rate')} kind="percent" />}
            hint="年度管理费率"
          />
        </div>

        <div className="research-detail-grid">
          <LayerCard
            className="research-fund-chart"
            data-fund-chart-mode={showMarket ? 'market' : isMoneySeries ? 'money' : 'nav'}
          >
            <LayerCard.Header className="research-panel-heading flex-wrap gap-3">
              {data.marketInstrument ? (
                <ToggleGroup
                  type="single"
                  value={showMarket ? 'market' : 'nav'}
                  onValueChange={(value) => {
                    if (value)
                      updateParams({
                        chart: value,
                        ...(value === 'market' && years === 10
                          ? { years: '5', interval: 'month' }
                          : {}),
                      });
                  }}
                  aria-label="基金图表"
                >
                  <ToggleGroupItem value="market">场内 K 线</ToggleGroupItem>
                  <ToggleGroupItem value="nav">净值与基准</ToggleGroupItem>
                </ToggleGroup>
              ) : (
                <h2 className="text-sm font-semibold text-basalt-foreground">
                  {isMoneySeries ? '万份收益 / 七日年化' : '净值与基准'}
                </h2>
              )}
              {showMarket ? (
                <ChartControls
                  years={marketYears}
                  interval={interval}
                  onYearsChange={changeYears}
                  onIntervalChange={(value) => updateParams({ interval: value })}
                />
              ) : (
                <ToggleGroup
                  type="single"
                  value={String(years)}
                  onValueChange={(value) => value && updateParams({ years: value })}
                  aria-label="观察范围"
                >
                  {[1, 3, 5, 10].map((value) => (
                    <ToggleGroupItem key={value} value={String(value)}>
                      {value} 年
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            </LayerCard.Header>
            {showMarket && data.marketInstrument ? (
              <FundMarketChart
                instrument={data.marketInstrument}
                years={marketYears}
                interval={interval}
                onViewNav={() => updateParams({ chart: 'nav' })}
              />
            ) : (
              <div className="research-fund-chart-body">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-basalt-muted-foreground">
                  <span>
                    {isMoneySeries
                      ? '日度收益与七日年化'
                      : '左轴：单位净值 · 右轴：基准与参考收益率'}
                  </span>
                  <DataInfo
                    name={isMoneySeries ? '货币基金收益' : '净值走势'}
                    source="东方财富"
                    date={navDate}
                  >
                    <p>
                      {isMoneySeries
                        ? '万份收益与七日年化采用各自坐标轴。'
                        : '本基金使用单位净值；基准收益率从共同起始日归一化。仅有日净值时保留走势，不生成交易 K 线。'}
                    </p>
                  </DataInfo>
                </div>
                {navLoading ? (
                  <LayerCard.Loading label="加载净值" className="my-auto" />
                ) : navError ? (
                  <div className="m-auto text-center">
                    <p className="mb-3 text-sm text-basalt-danger">净值加载失败</p>
                    <Button variant="outline" size="sm" onClick={() => void retryNav()}>
                      重试
                    </Button>
                  </div>
                ) : (isMoneySeries ? moneyPoints.length : growth.length) < 2 ? (
                  <div className="my-auto">
                    <ChartEmptyMask
                      label={isMoneySeries ? '暂无万份收益' : '所选范围暂无净值数据'}
                    />
                  </div>
                ) : (
                  <>
                    <div className="my-auto">
                      <SeriesChart
                        type="line"
                        points={isMoneySeries ? moneyPoints : growth}
                        series={
                          isMoneySeries
                            ? [
                                { key: 'income', label: '万份收益', color: GROWTH_STROKE.fund },
                                {
                                  key: 'yield7',
                                  label: '七日年化',
                                  dashed: true,
                                  color: GROWTH_STROKE.bench,
                                  yAxis: 'right',
                                },
                              ]
                            : growthSeries
                        }
                        height={isMobile ? 320 : 440}
                        timeDomain={timeDomain}
                        colorByCategory={false}
                        valueFormatter={(value) => formatMetric(value, 'nav')}
                        axisValueFormatter={(value) => formatAxisMetric(value, 'nav')}
                        rightValueFormatter={(value) =>
                          formatMetric(value, 'percent', { signed: !isMoneySeries })
                        }
                        rightAxisValueFormatter={(value) => formatAxisMetric(value, 'percent')}
                        yDomain={isMoneySeries ? undefined : growthDomain?.left}
                        rightYDomain={isMoneySeries ? undefined : growthDomain?.right}
                        ariaLabel={isMoneySeries ? '万份收益与七日年化' : '基金净值与基准走势'}
                      />
                      <SeriesLegend
                        series={
                          isMoneySeries
                            ? [
                                { key: 'income', label: '万份收益', color: GROWTH_STROKE.fund },
                                {
                                  key: 'yield7',
                                  label: '七日年化',
                                  color: GROWTH_STROKE.bench,
                                  dashed: true,
                                },
                              ]
                            : growthSeries
                        }
                      />
                    </div>
                    <div className="mt-auto flex flex-wrap justify-between gap-2 border-t border-basalt-border/55 pt-3 text-[11px] text-basalt-muted-foreground">
                      <span className="font-mono">
                        {String((isMoneySeries ? moneyPoints : growth)[0]?.name)} —{' '}
                        {String((isMoneySeries ? moneyPoints : growth).at(-1)?.name)}
                      </span>
                      <span>
                        {formatCount((isMoneySeries ? moneyPoints : growth).length)} 个观测日 ·
                        日度数据
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </LayerCard>

          <aside className="research-detail-aside" aria-label="基金档案与排名">
            <LayerCard padding="none">
              <PanelHeading
                title="基金档案"
                action={
                  <span className="font-mono text-[11px] text-basalt-muted-foreground">{code}</span>
                }
              />
              <LayerCard.Body className="p-2">
                <div className="research-fields">
                  {profileFields.map((field) => (
                    <CopyField
                      key={field.key}
                      label={field.label}
                      text={field.empty ? null : fieldCopyText(field.key, field.value)}
                      className={
                        field.key === 'fund_company' || field.key === 'fund_manager'
                          ? 'col-span-2'
                          : undefined
                      }
                    >
                      <FieldValue fieldKey={field.key} value={field.value} />
                    </CopyField>
                  ))}
                </div>
              </LayerCard.Body>
            </LayerCard>
            <LayerCard className="flex-1" padding="none">
              <PanelHeading
                title="同类位置"
                action={
                  <DataInfo name="同类排名" date={String(fieldValue('data_date') ?? '')}>
                    <p>排名基于完整基金类型。百分位越小，所在位置越靠前。</p>
                  </DataInfo>
                }
              />
              <LayerCard.Body className="px-4 py-1">
                {rankingFields
                  .filter((field) =>
                    ['rank_pct_1m', 'rank_pct_1y', 'rank_pct_3y', 'rank_pct_5y'].includes(
                      field.key,
                    ),
                  )
                  .map((field) => (
                    <div key={field.key} className="research-fact-row">
                      <span>{field.label.replace('同类排名', '')}</span>
                      <span className="font-mono tabular-nums">
                        {field.empty ? '—' : fieldCopyText(field.key, field.value)}
                      </span>
                    </div>
                  ))}
                <div className="research-fact-row">
                  <span>4433 筛选</span>
                  <span>{fieldValue('pass_4433') === 1 ? '通过' : '未通过'}</span>
                </div>
              </LayerCard.Body>
            </LayerCard>
          </aside>
        </div>

        <Tabs defaultValue="performance">
          <TabsList aria-label="基金研究详情">
            <TabsTrigger value="performance">收益与排名</TabsTrigger>
            <TabsTrigger value="structure">规模与持有人</TabsTrigger>
            <TabsTrigger value="facts">完整资料</TabsTrigger>
          </TabsList>
          <TabsContent value="performance">
            <div className="research-analysis-grid">
              {grand ? (
                <TimeCard
                  title="半年累计收益"
                  empty={grand.points.length < 2}
                  points={grand.points}
                  series={grand.series.map((item, index) => ({
                    ...item,
                    color: index === 0 ? GROWTH_STROKE.fund : refStroke(index - 1),
                    dashed: item.key !== 'fund',
                  }))}
                  timeDomain={grandDomain}
                  format={(value) => formatMetric(value, 'percent', { signed: true })}
                  axisFormat={(value) => formatAxisMetric(value, 'percent')}
                />
              ) : null}
              <TimeCard
                title="同类排名走势"
                empty={ranking.length < 2}
                points={ranking}
                series={[{ key: 'rank', label: '同类排名' }]}
                timeDomain={timeDomain}
                yReversed
                format={(value) => formatMetric(value, 'count')}
                axisFormat={(value) => formatAxisMetric(value, 'count')}
              />
              <LayerCard padding="none">
                <PanelHeading
                  title="五维能力"
                  action={
                    extras.scores?.avr != null ? (
                      <span className="font-mono text-xs">
                        均分 {formatMetric(extras.scores.avr, 'nav')}
                      </span>
                    ) : null
                  }
                />
                <LayerCard.Body>
                  {extras.scores?.items.length ? (
                    <ScoreRadar items={extras.scores.items} height={PANEL} />
                  ) : (
                    <ChartEmptyMask label="暂无五维数据" />
                  )}
                </LayerCard.Body>
              </LayerCard>
            </div>
          </TabsContent>
          <TabsContent value="structure">
            <div className="research-analysis-grid">
              {scale.length > 0 ? (
                <TimeCard
                  title="规模变动"
                  empty={false}
                  points={scale}
                  series={[{ key: 'scale', label: '规模（亿元）' }]}
                  timeDomain={timeDomain}
                  type="bar"
                  format={(value) => formatMetric(value, 'scale')}
                  axisFormat={(value) => formatAxisMetric(value, 'scale')}
                />
              ) : null}
              {allocation.length > 1 ? (
                <TimeCard
                  title="资产配置"
                  empty={false}
                  points={allocation}
                  series={
                    extras.allocation?.series.map((item) => ({
                      key: item.name,
                      label: item.name,
                    })) ?? []
                  }
                  timeDomain={timeDomain}
                  format={(value) => formatMetric(value, 'percent')}
                  axisFormat={(value) => formatAxisMetric(value, 'percent')}
                />
              ) : null}
              {holders.length > 1 ? (
                <TimeCard
                  title="持有人结构"
                  empty={false}
                  points={holders}
                  series={
                    extras.holders?.series.map((item) => ({ key: item.name, label: item.name })) ??
                    []
                  }
                  timeDomain={timeDomain}
                  format={(value) => formatMetric(value, 'percent')}
                  axisFormat={(value) => formatAxisMetric(value, 'percent')}
                />
              ) : null}
              {extras.allocation?.latest.length ? (
                <SnapshotBar title="最新配置" items={extras.allocation.latest} kind="percent" />
              ) : null}
              {extras.holders?.latest.length ? (
                <LayerCard padding="none">
                  <PanelHeading title="最新持有人" />
                  <LayerCard.Body>
                    <SharePie items={extras.holders.latest} height={CHART_HEIGHTS.compact} />
                    <SeriesLegend
                      series={extras.holders.latest.map((item, index) => ({
                        key: item.name,
                        label: `${item.name} ${formatMetric(item.value, 'percent')}`,
                        color: seriesStroke(index),
                      }))}
                    />
                  </LayerCard.Body>
                </LayerCard>
              ) : null}
              {!hasStructure &&
              !extras.allocation?.latest.length &&
              !extras.holders?.latest.length ? (
                <LayerCard className="col-span-full">
                  <ChartEmptyMask label="暂无规模与持有人数据" />
                </LayerCard>
              ) : null}
            </div>
          </TabsContent>
          <TabsContent value="facts">
            <div className="research-analysis-grid">
              <FieldGroup
                title="基本信息"
                fields={data.fields.filter(
                  (field) => field.group === '基本信息' && field.key !== 'fund_type',
                )}
                columns="grid-cols-2"
              />
              <FieldGroup title="阶段业绩" fields={performanceFields} columns="grid-cols-2" />
              <FieldGroup title="完整排名" fields={rankingFields} columns="grid-cols-2" />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function fieldsOf(fields: FieldView[], group: string): FieldView[] {
  return fields.filter((f) => f.group === group && !HEADER_FIELD_KEYS.has(f.key));
}

function TimeCard({
  title,
  empty,
  emptyLabel = '暂无数据',
  points,
  series,
  timeDomain,
  format,
  axisFormat,
  rightFormat,
  rightAxisFormat,
  height = PANEL,
  yReversed = false,
  yDomain,
  rightYDomain,
  type = 'line',
}: {
  title: string;
  empty: boolean;
  emptyLabel?: string;
  points: ChartPoint[];
  series: ChartSeries[];
  timeDomain: { from: number; to: number };
  format: (value: number) => string;
  axisFormat: (value: number) => string;
  rightFormat?: (value: number) => string;
  rightAxisFormat?: (value: number) => string;
  height?: number;
  yReversed?: boolean;
  yDomain?: [number, number];
  rightYDomain?: [number, number];
  type?: 'line' | 'bar';
}) {
  return (
    <LayerCard className="overflow-visible" padding="none">
      <PanelHeading title={title} />
      <LayerCard.Body className="overflow-visible">
        {empty ? (
          <ChartEmptyMask label={emptyLabel} />
        ) : (
          <>
            <SeriesChart
              type={type}
              points={points}
              series={series}
              height={height}
              timeDomain={timeDomain}
              colorByCategory={false}
              valueFormatter={format}
              axisValueFormatter={axisFormat}
              rightValueFormatter={rightFormat}
              rightAxisValueFormatter={rightAxisFormat}
              yReversed={yReversed}
              yDomain={yDomain}
              rightYDomain={rightYDomain}
              ariaLabel={title}
            />
            <SeriesLegend series={series} />
          </>
        )}
      </LayerCard.Body>
    </LayerCard>
  );
}

function SeriesLegend({ series }: { series: ChartSeries[] }) {
  if (series.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
      {series.map((item, index) => {
        const color = item.color ?? seriesStroke(index);
        return (
          <li
            key={item.key}
            className="flex min-w-0 items-center gap-1.5 text-[11px] text-basalt-muted-foreground"
          >
            <span
              className="h-0.5 w-3.5 shrink-0 rounded-full"
              style={
                item.dashed
                  ? { borderTop: `2px dashed ${color}`, height: 0, background: 'transparent' }
                  : { background: color }
              }
            />
            <span className="truncate">{item.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

function SnapshotBar({
  title,
  items,
  kind,
}: {
  title: string;
  items: { name: string; value: number }[];
  kind: 'percent' | 'count' | 'scale';
}) {
  const points = items.map((item) => ({ name: item.name, value: item.value }));
  return (
    <LayerCard className="overflow-visible" padding="none">
      <PanelHeading title={title} />
      <LayerCard.Body className="overflow-visible">
        {points.length === 0 ? (
          <ChartEmptyMask label={`暂无${title}`} />
        ) : (
          <>
            <SeriesChart
              type="bar"
              orientation="horizontal"
              points={points}
              series={[{ key: 'value', label: title }]}
              height={Math.max(140, points.length * 36)}
              valueFormatter={(value) => formatMetric(value, kind)}
              ariaLabel={title}
            />
            <SeriesLegend
              series={points.map((point, index) => ({
                key: String(point.name),
                label: String(point.name),
                color: seriesStroke(index),
              }))}
            />
          </>
        )}
      </LayerCard.Body>
    </LayerCard>
  );
}

function FieldGroup({
  title,
  fields,
  columns = 'grid-cols-1',
}: {
  title: string;
  fields: FieldView[];
  columns?: string;
}) {
  if (fields.length === 0) return null;
  return (
    <LayerCard padding="none">
      <PanelHeading title={title} />
      <LayerCard.Body className={cn('grid gap-1 p-2', columns)}>
        {fields.map((f) => (
          <CopyField
            key={f.key}
            label={f.label}
            text={f.empty ? null : fieldCopyText(f.key, f.value)}
          >
            {f.empty ? null : <FieldValue fieldKey={f.key} value={f.value} />}
          </CopyField>
        ))}
      </LayerCard.Body>
    </LayerCard>
  );
}

function FieldValue({ fieldKey, value }: { fieldKey: string; value: string | number | null }) {
  if (typeof value === 'string') {
    return <div className="w-full min-w-0 whitespace-normal break-words font-medium">{value}</div>;
  }
  const kind = fieldNumberKind(fieldKey);
  if (kind) {
    return <Metric value={value} kind={kind} signed={isSignedPercentField(fieldKey)} />;
  }
  return (
    <div className="w-full min-w-0 whitespace-normal break-words font-medium">{String(value)}</div>
  );
}
