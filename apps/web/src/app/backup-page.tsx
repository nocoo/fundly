import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useBacky } from '@/hooks/use-backy';
import { envBadgeClass, formatFileSize, formatTimeAgo } from '@/lib/backy-format';
import { canEditBackyForm, canMutateBackups } from '@/lib/backy-vm';
import { cn } from '@/lib/utils';

export default function BackupPage() {
  const {
    status,
    webhookUrl,
    setWebhookUrl,
    token,
    setToken,
    loading,
    busy,
    message,
    refresh,
    saveConfig,
    testConnection,
    push,
    restore,
  } = useBacky();
  const ready = status ? canMutateBackups(status) : false;
  const editing = canEditBackyForm(busy);
  const rows = status?.history?.recent_backups ?? [];

  return (
    <AppShell breadcrumbs={[{ label: '备份' }]}>
      <h1 className="mb-4 text-xl font-semibold">备份</h1>
      {loading && !status && <p className="text-sm text-muted-foreground">加载中…</p>}
      {status && !status.available && (
        <p className="mb-4 text-sm text-muted-foreground">备份只在本机 API 上可用。</p>
      )}

      <section className="mb-4 rounded-card bg-secondary p-4 ring-1 ring-border/40 md:p-5">
        <h2 className="text-sm font-semibold">连接</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Webhook 和 API Key 保存在本机数据库，不会写进代码。
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Webhook URL
            <input
              value={webhookUrl}
              placeholder="https://backy.hexly.ai/api/webhook/…"
              onChange={(event) => setWebhookUrl(event.target.value)}
              disabled={!editing}
              className="h-9 rounded-widget border border-border bg-secondary px-3 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            API Key
            <input
              type="password"
              value={token}
              placeholder={status?.hasToken ? '已保存，留空则不改' : '粘贴 API Key'}
              onChange={(event) => setToken(event.target.value)}
              disabled={!editing}
              autoComplete="off"
              className="h-9 rounded-widget border border-border bg-secondary px-3 text-sm text-foreground"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void saveConfig()} disabled={!editing}>
            {busy === 'save' ? <Loader2 className="animate-spin" /> : null}
            保存
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void testConnection()}
            disabled={!ready || busy !== null}
          >
            {busy === 'test' ? <Loader2 className="animate-spin" /> : null}
            测试连接
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void push()}
            disabled={!ready || busy !== null}
          >
            {busy === 'push' ? <Loader2 className="animate-spin" /> : null}
            立即备份
          </Button>
        </div>
        {message ? (
          <p
            className={cn(
              'mt-3 text-sm',
              message.ok ? 'text-muted-foreground' : 'text-destructive-text',
            )}
          >
            {message.text}
          </p>
        ) : null}
      </section>

      <section className="rounded-card bg-secondary pb-2 ring-1 ring-border/40">
        <div className="flex items-center justify-between px-3 pt-3">
          <div>
            <h2 className="text-sm font-semibold">最近备份</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {status?.history
                ? `共 ${status.history.total_backups} 份`
                : '保存连接后会列出远程记录'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refresh()}
            disabled={!ready || busy !== null}
          >
            刷新
          </Button>
        </div>
        <Table className="[&_td:first-child]:pl-3 [&_td:last-child]:pr-3 [&_th:first-child]:pl-3 [&_th:last-child]:pr-3">
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>标签</TableHead>
              <TableHead>环境</TableHead>
              <TableHead className="text-right">大小</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  {status?.error ?? '还没有备份记录。'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatTimeAgo(row.created_at)}
                  </TableCell>
                  <TableCell>
                    <span className="truncate" title={row.tag}>
                      {row.tag || row.id}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                        envBadgeClass(row.environment),
                      )}
                    >
                      {row.environment}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatFileSize(row.file_size)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={busy !== null}
                      onClick={() => {
                        if (window.confirm('用这份备份覆盖本机数据库？请先停采集和本机 API。')) {
                          void restore(row.id);
                        }
                      }}
                    >
                      {busy === 'restore' ? <Loader2 className="animate-spin" /> : null}
                      恢复
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </AppShell>
  );
}
