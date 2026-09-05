import { Input, LayerCard } from '@nocoo/basalt';
import { PageHeader } from '@nocoo/basalt/components/page-header';
import { SectionRule } from '@nocoo/basalt/components/section-rule';
import { useState } from 'react';
import { AppShell } from '@/components/layout';
import { BenchmarkBrowser } from '@/components/settings/benchmark-browser';
import { DataOverview } from '@/components/settings/data-overview';
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
      <div className="space-y-6">
        <PageHeader
          title="设置"
          description="应用偏好设置，包括数据状态、涨跌配色方案、收益率参考线与分类基准。"
        />

        <DataOverview />

        <SectionRule title="涨跌颜色" hint="用于收益率等带方向的数字。默认红涨绿跌（A股习惯）。">
          <LayerCard>
            <LayerCard.Body>
              <fieldset className="m-0 inline-flex items-center gap-0.5 rounded-full border-0 bg-basalt-muted p-0.5 ring-1 ring-basalt-border/70">
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
                        'inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-basalt-primary/40',
                        pressed
                          ? 'bg-basalt-primary text-basalt-primary-foreground shadow-sm'
                          : 'text-basalt-muted-foreground hover:text-basalt-foreground',
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </fieldset>
            </LayerCard.Body>
          </LayerCard>
        </SectionRule>

        <SectionRule
          title="参考增长线"
          hint="最多两条年化收益率虚线，叠在基金增长曲线上。留空则不画。"
        >
          <LayerCard>
            <LayerCard.Body>
              <div className="flex flex-wrap gap-3">
                {[0, 1].map((index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-1.5 text-xs text-basalt-muted-foreground"
                  >
                    <label htmlFor={`rate-draft-${index}`}>年化 {index + 1}</label>
                    <Input
                      id={`rate-draft-${index}`}
                      type="number"
                      step="0.1"
                      className="h-9 w-28 tabular-nums"
                      value={rateDraft[index] ?? ''}
                      placeholder="如 2"
                      onChange={(e) => {
                        const next = [...rateDraft];
                        next[index] = e.target.value;
                        commitRates(next);
                      }}
                    />
                  </div>
                ))}
              </div>
            </LayerCard.Body>
          </LayerCard>
        </SectionRule>

        <SectionRule
          title="分类基准基金"
          hint="每个类型必须有一只基准，增长图会叠加其虚线。默认选该分类里盘子大、历史长的代表产品。"
        >
          <LayerCard>
            <LayerCard.Body>
              <BenchmarkBrowser
                benchmarks={prefs.benchmarks}
                onChange={(type, code) =>
                  setPrefs({
                    ...prefs,
                    benchmarks: { ...prefs.benchmarks, [type]: code },
                  })
                }
              />
            </LayerCard.Body>
          </LayerCard>
        </SectionRule>
      </div>
    </AppShell>
  );
}
