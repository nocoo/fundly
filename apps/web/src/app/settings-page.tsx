import { useState } from 'react';
import { AppShell } from '@/components/layout';
import { BenchmarkBrowser } from '@/components/settings/benchmark-browser';
import { useChartPrefs } from '@/hooks/use-chart-prefs';
import { useQuoteColor } from '@/hooks/use-quote-color';
import { parseRefRates } from '@/lib/chart-growth';
import { QUOTE_COLOR_OPTIONS } from '@/lib/quote-color';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const { color, setColor } = useQuoteColor();
  const { prefs, setPrefs } = useChartPrefs();
  const [rateDraft, setRateDraft] = useState(
    [prefs.refRates[0], prefs.refRates[1]].map((n) => (n === undefined ? '' : String(n))),
  );

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
        <BenchmarkBrowser
          benchmarks={prefs.benchmarks}
          onChange={(type, code) =>
            setPrefs({
              ...prefs,
              benchmarks: { ...prefs.benchmarks, [type]: code },
            })
          }
        />
      </section>
    </AppShell>
  );
}
