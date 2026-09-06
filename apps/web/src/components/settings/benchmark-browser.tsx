import { Button, Input } from '@nocoo/basalt';
import { ChevronRight } from 'lucide-react';
import { type ReactNode, useId, useMemo, useState } from 'react';
import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { SeriesChart } from '@/components/charts/series-chart';
import { ResearchEmpty } from '@/components/layout/research-layout';
import { TypeBadge } from '@/components/ui/type-badge';
import { DEFAULT_BENCHMARKS } from '@/lib/benchmark-defaults';
import { formatMetric } from '@/lib/format-number';
import { buildTypeTree } from '@/lib/fund-type';
import { rangeBounds, utcTs } from '@/lib/time-window';
import { cn } from '@/lib/utils';

function Column({ children }: { children: ReactNode }) {
  return <div className="research-benchmark-column">{children}</div>;
}

function Row({
  selected,
  onSelect,
  hasChild,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  hasChild?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex h-auto w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm',
        selected
          ? 'bg-basalt-primary/10 text-basalt-primary hover:bg-basalt-primary/15 hover:text-basalt-primary font-medium'
          : 'text-basalt-foreground hover:bg-basalt-muted/70',
      )}
    >
      <span className="min-w-0 truncate">{children}</span>
      {hasChild ? (
        <ChevronRight
          className="h-3.5 w-3.5 shrink-0 text-basalt-muted-foreground"
          strokeWidth={1.5}
        />
      ) : null}
    </Button>
  );
}

export function BenchmarkBrowser({
  benchmarks,
  onChange,
}: {
  benchmarks: Record<string, string>;
  onChange: (type: string, code: string) => void;
}) {
  const inputId = useId();
  const tree = useMemo(() => buildTypeTree(Object.keys(DEFAULT_BENCHMARKS)), []);
  const [l1, setL1] = useState(tree[0]?.l1 ?? '');
  const group = tree.find((item) => item.l1 === l1) ?? tree[0];
  const [raw, setRaw] = useState(group?.items[0]?.raw ?? '');
  const items = group?.items ?? [];
  const selected = items.find((item) => item.raw === raw) ?? items[0];
  const type = selected?.raw ?? '';
  const fallback = type ? DEFAULT_BENCHMARKS[type] : undefined;
  const code = (type && benchmarks[type]) || fallback?.code || '';
  const custom = Boolean(type && fallback && code !== fallback.code);

  return (
    <div className="research-benchmark">
      <Column>
        {tree.map((node) => (
          <Row
            key={node.l1}
            selected={node.l1 === group?.l1}
            hasChild
            onSelect={() => {
              setL1(node.l1);
              setRaw(node.items[0]?.raw ?? '');
            }}
          >
            <TypeBadge label={node.l1} />
          </Row>
        ))}
      </Column>
      <Column>
        {items.map((item) => (
          <Row
            key={item.raw}
            selected={item.raw === type}
            hasChild
            onSelect={() => setRaw(item.raw)}
          >
            <TypeBadge label={item.l2 || item.raw} />
          </Row>
        ))}
      </Column>
      <div className="research-benchmark-detail min-w-0 overflow-y-auto p-4">
        {type ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1">
              <TypeBadge label={group?.l1 ?? ''} />
              {selected?.l2 ? <TypeBadge label={selected.l2} /> : null}
            </div>
            <div>
              <p className="text-xs text-basalt-muted-foreground">当前基准</p>
              <p className="mt-1 font-mono text-sm tabular-nums text-basalt-foreground">{code}</p>
              <p className="mt-0.5 text-sm text-basalt-foreground">
                {custom ? '自定义基准' : (fallback?.name ?? '—')}
              </p>
              {custom ? (
                <p className="mt-1 text-[11px] text-basalt-muted-foreground">已覆盖默认</p>
              ) : null}
            </div>
            <label
              htmlFor={inputId}
              className="flex flex-col gap-1 text-xs text-basalt-muted-foreground"
            >
              基金代码
              <Input
                id={inputId}
                key={`${type}-${code}`}
                defaultValue={code}
                spellCheck={false}
                className="h-9 font-mono text-sm"
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  onChange(type, next || fallback?.code || code);
                }}
              />
            </label>
            {custom ? (
              <Button
                variant="ghost"
                size="sm"
                className="self-start text-xs text-basalt-muted-foreground hover:text-basalt-foreground"
                onClick={() => onChange(type, fallback?.code || code)}
              >
                恢复默认
              </Button>
            ) : null}
            <BenchmarkPreview code={code} />
          </div>
        ) : (
          <p className="text-sm text-basalt-muted-foreground">选择一个分类</p>
        )}
      </div>
    </div>
  );
}

function BenchmarkPreview({ code }: { code: string }) {
  const bounds = useMemo(() => rangeBounds(1), []);
  const validCode = /^\d{6}$/.test(code);
  const { data, error, isLoading, mutate } = useSWR<{
    items: { nav_date: string; unit_nav: number | null; million_income?: number | null }[];
  }>(validCode ? `/api/funds/${code}/nav?from=${bounds.from}&limit=3000` : null, fetchAPI);
  const money = Boolean(data?.items.some((item) => item.million_income != null));
  const points = (data?.items ?? []).flatMap((item) => {
    const value = money ? item.million_income : item.unit_nav;
    return value != null && Number.isFinite(value)
      ? [{ name: item.nav_date, t: utcTs(item.nav_date), nav: value }]
      : [];
  });
  return (
    <div className="mt-2 border-t border-basalt-border/55 pt-3" data-benchmark-preview={code}>
      <p className="mb-3 text-[11px] text-basalt-muted-foreground">
        {money ? '万份收益' : '基准净值'} · 近 1 年
      </p>
      {points.length > 1 ? (
        <SeriesChart
          type="line"
          points={points}
          series={[{ key: 'nav', label: money ? '万份收益' : '单位净值' }]}
          height={180}
          valueFormatter={(value) => formatMetric(value, 'nav')}
          ariaLabel="基准基金预览"
          timeDomain={{ from: utcTs(bounds.from), to: utcTs(bounds.to) }}
        />
      ) : (
        <ResearchEmpty
          title={
            !validCode
              ? '请输入六位基金代码'
              : isLoading
                ? '加载基准走势…'
                : error
                  ? '基准走势加载失败'
                  : '该基金暂无可用净值'
          }
          action={
            error ? (
              <Button variant="outline" size="sm" onClick={() => void mutate()}>
                重试
              </Button>
            ) : null
          }
        />
      )}
    </div>
  );
}
