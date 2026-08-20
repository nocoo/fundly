import { useMemo, useState } from 'react';
import { AppShell } from '@/components/layout';
import { FundTypeBadges } from '@/components/ui/type-badge';
import { useChartPrefs } from '@/hooks/use-chart-prefs';
import { useQuoteColor } from '@/hooks/use-quote-color';
import { DEFAULT_BENCHMARKS } from '@/lib/benchmark-defaults';
import { parseRefRates } from '@/lib/chart-growth';
import { splitFundType } from '@/lib/fund-type';
import { QUOTE_COLOR_OPTIONS } from '@/lib/quote-color';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const { color, setColor } = useQuoteColor();
  const { prefs, setPrefs } = useChartPrefs();
  const [rateDraft, setRateDraft] = useState(
    [prefs.refRates[0], prefs.refRates[1]].map((n) => (n === undefined ? '' : String(n))),
  );

  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const type of Object.keys(DEFAULT_BENCHMARKS)) {
      const { l1 } = splitFundType(type);
      const list = map.get(l1) ?? [];
      list.push(type);
      map.set(l1, list);
    }
    return [...map.entries()];
  }, []);

  const commitRates = (next: string[]) => {
    setRateDraft(next);
    setPrefs({ ...prefs, refRates: parseRefRates(next.map((x) => x.trim()).filter(Boolean)) });
  };

  return (
    <AppShell breadcrumbs={[{ label: '设置' }]}>
      <h1 className="mb-4 text-xl font-semibold">设置</h1>

      <section className="mb-4 rounded-card bg-secondary p-4 ring-1 ring-border/40 md:p-5">
        <h2 className="text-sm font-semibold">涨跌颜色</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          用于收益率等带方向的数字。默认红涨绿跌。
        </p>
        <fieldset className="mt-4 m-0 inline-flex items-center gap-0.5 rounded-full border-0 bg-muted p-0.5 ring-1 ring-border/70">
          <legend className="sr-only">涨跌颜色</legend>
          {QUOTE_COLOR_OPTIONS.map((option) => {
            const pressed = color === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={pressed}
                title={option.hint}
                onClick={() => setColor(option.id)}
                className={cn(
                  'inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                  pressed
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            );
          })}
        </fieldset>
      </section>

      <section className="mb-4 rounded-card bg-secondary p-4 ring-1 ring-border/40 md:p-5">
        <h2 className="text-sm font-semibold">参考增长线</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          最多两条年化收益率虚线，叠在基金增长曲线上。留空则不画。
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {[0, 1].map((index) => (
            <label key={index} className="flex flex-col gap-1 text-xs text-muted-foreground">
              年化 {index + 1}
              <input
                type="number"
                step="0.1"
                className="h-9 w-28 rounded-widget border border-border bg-secondary px-3 text-sm text-foreground tabular-nums"
                value={rateDraft[index] ?? ''}
                placeholder="如 2"
                onChange={(e) => {
                  const next = [...rateDraft];
                  next[index] = e.target.value;
                  commitRates(next);
                }}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-card bg-secondary p-4 ring-1 ring-border/40 md:p-5">
        <h2 className="text-sm font-semibold">分类基准基金</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          每个类型必须有一只基准，增长图会叠加其虚线。默认选该分类里盘子大、历史长的代表产品。
        </p>
        <div className="mt-4 flex flex-col gap-4">
          {groups.map(([l1, types]) => (
            <div key={l1}>
              <div className="mb-2">
                <FundTypeBadges type={l1} />
              </div>
              <div className="flex flex-col gap-2">
                {types.map((type) => {
                  const fallback = DEFAULT_BENCHMARKS[type];
                  const code = prefs.benchmarks[type] || fallback?.code || '';
                  return (
                    <label
                      key={type}
                      className="grid items-center gap-2 text-xs text-muted-foreground md:grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)]"
                    >
                      <FundTypeBadges type={type} />
                      <input
                        key={`${type}-${code}`}
                        defaultValue={code}
                        spellCheck={false}
                        className="h-8 rounded-widget border border-border bg-secondary px-2 font-mono text-sm text-foreground"
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          setPrefs({
                            ...prefs,
                            benchmarks: {
                              ...prefs.benchmarks,
                              [type]: next || fallback?.code || code,
                            },
                          });
                        }}
                      />
                      <span className="truncate text-[11px]">{fallback?.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
