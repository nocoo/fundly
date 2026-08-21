import { Cloud, History, Loader2, Plug, RefreshCw, RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBacky } from '@/hooks/use-backy';
import { envBadgeClass, formatFileSize, formatTimeAgo } from '@/lib/backy-format';
import { canMutateBackups, historyCountLabel } from '@/lib/backy-vm';
import { cn } from '@/lib/utils';

export function BackySettings() {
  const { status, loading, busy, message, refresh, testConnection, push, restore } = useBacky();
  const ready = status ? canMutateBackups(status) : false;

  return (
    <section className="rounded-card bg-secondary p-4 ring-1 ring-border/40 md:p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple/10">
          <Cloud className="h-5 w-5 text-purple" strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="text-sm font-semibold">远程备份</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            把本机 SQLite 快照推到 Backy / R2，换机再拉回来。
          </p>
        </div>
        {status?.environment ? (
          <span
            className={cn(
              'ml-auto inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium',
              envBadgeClass(status.environment),
            )}
          >
            {status.environment}
          </span>
        ) : null}
      </div>

      {loading && !status ? (
        <p className="text-xs text-muted-foreground">加载中…</p>
      ) : !status?.available ? (
        <p className="text-xs text-muted-foreground">
          备份只在本机 API 上可用，请用 `bun run dev:all`。
        </p>
      ) : !status.configured ? (
        <p className="text-xs text-muted-foreground">
          未配置 <code>BACKY_WEBHOOK_URL</code> / <code>BACKY_TOKEN</code>。
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          已连接 {status.webhookHost ?? 'Backy'}。密钥走环境变量，页面不保存。
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void testConnection()}
          disabled={!ready || busy !== null}
        >
          {busy === 'test' ? <Loader2 className="animate-spin" /> : <Plug />}
          测试连接
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void push()}
          disabled={!ready || busy !== null}
        >
          {busy === 'push' ? <Loader2 className="animate-spin" /> : <Send />}
          推送备份
        </Button>
      </div>

      {message ? (
        <p className={cn('mt-3 text-xs', message.ok ? 'text-foreground' : 'text-destructive')}>
          {message.text}
        </p>
      ) : null}

      {ready ? (
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <History className="h-4 w-4 text-muted-foreground" />
              远程备份记录
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {historyCountLabel(status?.history ?? null)}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void refresh()}
              disabled={busy !== null}
            >
              <RefreshCw className={loading ? 'animate-spin' : undefined} />
            </Button>
          </div>

          {status?.history && status.history.recent_backups.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {status.history.recent_backups.map((entry) => (
                <div
                  key={entry.id}
                  className="space-y-1 rounded-widget border bg-muted/50 p-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                        envBadgeClass(entry.environment),
                      )}
                    >
                      {entry.environment}
                    </span>
                    <span className="text-muted-foreground">{formatFileSize(entry.file_size)}</span>
                  </div>
                  <p className="truncate text-muted-foreground" title={entry.tag}>
                    {entry.tag}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-muted-foreground">{formatTimeAgo(entry.created_at)}</p>
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={busy !== null}
                      onClick={() => {
                        if (window.confirm(`用 ${entry.id} 覆盖本机库？请先停采集和 dev:all。`)) {
                          void restore(entry.id);
                        }
                      }}
                    >
                      {busy === 'restore' ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                      恢复
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">暂无备份记录</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
