import { ChevronRight } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { TypeBadge } from '@/components/ui/type-badge';
import { DEFAULT_BENCHMARKS } from '@/lib/benchmark-defaults';
import { buildTypeTree } from '@/lib/fund-type';
import { cn } from '@/lib/utils';

function Column({ children }: { children: ReactNode }) {
  return (
    <div className="h-full w-44 shrink-0 overflow-y-auto border-r border-border">{children}</div>
  );
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
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-sm',
        selected ? 'bg-accent text-foreground' : 'text-foreground hover:bg-muted/70',
      )}
    >
      <span className="min-w-0 truncate">{children}</span>
      {hasChild ? (
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
      ) : null}
    </button>
  );
}

export function BenchmarkBrowser({
  benchmarks,
  onChange,
}: {
  benchmarks: Record<string, string>;
  onChange: (type: string, code: string) => void;
}) {
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
    <div className="mt-4 flex h-[22rem] overflow-hidden rounded-widget bg-secondary ring-1 ring-border/40">
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
      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        {type ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1">
              <TypeBadge label={group?.l1 ?? ''} />
              {selected?.l2 ? <TypeBadge label={selected.l2} /> : null}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">当前基准</p>
              <p className="mt-1 font-mono text-sm tabular-nums">{code}</p>
              <p className="mt-0.5 text-sm">{fallback?.name ?? '—'}</p>
              {custom ? <p className="mt-1 text-[11px] text-muted-foreground">已覆盖默认</p> : null}
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              基金代码
              <input
                key={`${type}-${code}`}
                defaultValue={code}
                spellCheck={false}
                className="h-9 rounded-widget border border-border bg-secondary px-3 font-mono text-sm text-foreground"
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  onChange(type, next || fallback?.code || code);
                }}
              />
            </label>
            {custom ? (
              <button
                type="button"
                className="self-start text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onChange(type, fallback?.code || code)}
              >
                恢复默认
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">选择一个分类</p>
        )}
      </div>
    </div>
  );
}
