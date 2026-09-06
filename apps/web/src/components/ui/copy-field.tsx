import { Button } from '@nocoo/basalt';
import { Check, Copy } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { writeClipboard } from '@/lib/clipboard';
import { cn } from '@/lib/utils';

const SHELL = 'research-field min-w-0 text-sm';

export function CopyField({
  label,
  text,
  children,
  className,
}: {
  label: string;
  text?: string | null;
  children?: ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!text) {
    return (
      <div className={cn(SHELL, 'flex flex-col items-start gap-1', className)}>
        <span className="text-xs text-basalt-muted-foreground">{label}</span>
        <span className="text-sm text-basalt-muted-foreground">—</span>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      onClick={() => {
        void writeClipboard(text).then((ok) => {
          if (ok) setCopied(true);
        });
      }}
      aria-label={copied ? `已复制${label}` : `复制${label}`}
      className={cn(
        SHELL,
        'group relative flex h-auto w-full cursor-pointer flex-col items-start gap-1 whitespace-normal text-left font-normal',
        className,
      )}
    >
      <span className="text-xs text-basalt-muted-foreground">{label}</span>
      <div className="w-full min-w-0 pr-6 text-basalt-foreground">{children ?? text}</div>
      <span
        aria-hidden
        className={cn(
          'absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-md text-basalt-muted-foreground transition-opacity',
          copied
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
        )}
      >
        {copied ? <Check className="size-3.5" strokeWidth={1.75} /> : <Copy className="size-3.5" />}
      </span>
    </Button>
  );
}
