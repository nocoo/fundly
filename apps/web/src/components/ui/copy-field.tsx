import { Check, Copy } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { writeClipboard } from '@/lib/clipboard';
import { cn } from '@/lib/utils';

const SHELL =
  'min-w-0 rounded-widget border border-border bg-secondary px-3 py-2 text-sm shadow-xs';

export function CopyField({
  label,
  text,
  children,
}: {
  label: string;
  text?: string | null;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!text) {
    return (
      <div className={cn(SHELL, 'flex flex-col items-start gap-0.5')}>
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">暂无数据</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        void writeClipboard(text).then((ok) => {
          if (ok) setCopied(true);
        });
      }}
      aria-label={copied ? `已复制${label}` : `复制${label}`}
      className={cn(
        SHELL,
        'group relative flex cursor-pointer flex-col items-start gap-0.5 text-left outline-none transition-colors',
        'hover:border-foreground/20 hover:bg-accent',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <div className="w-full min-w-0 pr-6">{children ?? text}</div>
      <span
        aria-hidden
        className={cn(
          'absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-md text-muted-foreground transition-opacity',
          copied
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
        )}
      >
        {copied ? <Check className="size-3.5" strokeWidth={1.75} /> : <Copy className="size-3.5" />}
      </span>
    </button>
  );
}
