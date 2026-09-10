import { Button, LayerCard } from '@nocoo/basalt';
import { PageHeader } from '@nocoo/basalt/components/page-header';
import { ArrowLeft, ArrowRight, Inbox, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatCount } from '@/lib/format-number';
import { cn } from '@/lib/utils';

export function ResearchHeader({
  title,
  description,
  icon: Icon,
  leading,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  /** Focusable control rendered outside PageHeader's h1 (e.g. back link). */
  leading?: ReactNode;
  actions?: ReactNode;
}) {
  const header = (
    <PageHeader
      title={
        <span className="flex min-w-0 items-center gap-2.5">
          {Icon ? <Icon className="size-5 shrink-0 text-basalt-primary" strokeWidth={1.5} /> : null}
          {title}
        </span>
      }
      description={description}
      actions={actions}
    />
  );

  return (
    <div className="research-heading">
      {leading ? (
        <div className="flex min-w-0 items-start gap-2">
          <div className="mt-1 shrink-0">{leading}</div>
          <div className="min-w-0 flex-1">{header}</div>
        </div>
      ) : (
        header
      )}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  action,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <LayerCard className={cn('research-stat', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-basalt-muted-foreground">{label}</span>
        {action}
      </div>
      <div className="research-stat-value">{value}</div>
      {hint ? <div className="text-[11px] text-basalt-muted-foreground">{hint}</div> : null}
    </LayerCard>
  );
}

export function PanelHeading({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <LayerCard.Header className="research-panel-heading">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-basalt-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 text-xs text-basalt-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </LayerCard.Header>
  );
}

export function ListPagination({
  page,
  pages,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <LayerCard.Footer className="research-pagination">
      <span className="text-xs text-basalt-muted-foreground">
        {total > 0
          ? `${formatCount((page - 1) * pageSize + 1)}–${formatCount(Math.min(page * pageSize, total))}`
          : '0'}
        {' / '}
        {formatCount(total)} 只
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.5} /> 上一页
        </Button>
        <span className="min-w-12 text-center font-mono text-xs tabular-nums">
          {page} / {pages}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          下一页 <ArrowRight className="size-3.5" strokeWidth={1.5} />
        </Button>
      </div>
    </LayerCard.Footer>
  );
}

export function ResearchEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="research-empty" role="status">
      <Inbox className="size-7 text-basalt-muted-foreground" strokeWidth={1.25} />
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="max-w-sm text-xs leading-relaxed text-basalt-muted-foreground">
          {description}
        </p>
      ) : null}
      {action}
    </div>
  );
}
