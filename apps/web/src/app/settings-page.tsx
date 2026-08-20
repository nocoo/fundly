import { AppShell } from '@/components/layout';
import { useQuoteColor } from '@/hooks/use-quote-color';
import { QUOTE_COLOR_OPTIONS } from '@/lib/quote-color';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const { color, setColor } = useQuoteColor();

  return (
    <AppShell breadcrumbs={[{ label: '设置' }]}>
      <h1 className="mb-4 text-xl font-semibold">设置</h1>
      <section className="rounded-card bg-secondary p-4 ring-1 ring-border/40 md:p-5">
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
    </AppShell>
  );
}
