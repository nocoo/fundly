import { Button, Input, LayerCard } from '@nocoo/basalt';
import { PageHeader } from '@nocoo/basalt/components/page-header';
import { SectionRule } from '@nocoo/basalt/components/section-rule';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@nocoo/basalt/components/table';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout';
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
      <div className="space-y-6">
        <PageHeader
          title="备份"
          description={
            status && !status.available
              ? '备份只在本机 API 上可用。'
              : '通过 Backy 远程备份与恢复 SQLite 数据库。'
          }
        />

        {loading && !status && <p className="text-sm text-basalt-muted-foreground">加载中…</p>}

        <SectionRule title="连接设置" hint="Webhook 和 API Key 保存在本机数据库，不会写进代码。">
          <LayerCard>
            <LayerCard.Body className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1.5 text-xs text-basalt-muted-foreground">
                  <label htmlFor="webhook-url">Webhook URL</label>
                  <Input
                    id="webhook-url"
                    value={webhookUrl}
                    placeholder="https://backy.hexly.ai/api/webhook/…"
                    onChange={(event) => setWebhookUrl(event.target.value)}
                    disabled={!editing}
                    className="h-9"
                  />
                </div>
                <div className="flex flex-col gap-1.5 text-xs text-basalt-muted-foreground">
                  <label htmlFor="api-key">API Key</label>
                  <Input
                    id="api-key"
                    type="password"
                    value={token}
                    placeholder={status?.hasToken ? '已保存，留空则不改' : '粘贴 API Key'}
                    onChange={(event) => setToken(event.target.value)}
                    disabled={!editing}
                    autoComplete="off"
                    className="h-9"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void saveConfig()}
                  disabled={!editing}
                >
                  {busy === 'save' ? <Loader2 className="animate-spin h-3.5 w-3.5 mr-1" /> : null}
                  保存
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void testConnection()}
                  disabled={!ready || busy !== null}
                >
                  {busy === 'test' ? <Loader2 className="animate-spin h-3.5 w-3.5 mr-1" /> : null}
                  测试连接
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void push()}
                  disabled={!ready || busy !== null}
                >
                  {busy === 'push' ? <Loader2 className="animate-spin h-3.5 w-3.5 mr-1" /> : null}
                  立即备份
                </Button>
              </div>
              {message ? (
                <p
                  className={cn(
                    'text-sm',
                    message.ok ? 'text-basalt-muted-foreground' : 'text-basalt-danger',
                  )}
                >
                  {message.text}
                </p>
              ) : null}
            </LayerCard.Body>
          </LayerCard>
        </SectionRule>

        <SectionRule
          title="最近备份"
          hint={
            status?.history
              ? `共 ${status.history.total_backups} 份远程备份记录`
              : '保存连接后会列出远程记录'
          }
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refresh()}
              disabled={!ready || busy !== null}
            >
              刷新
            </Button>
          }
        >
          <LayerCard>
            <LayerCard.Body className="p-0">
              <div className="overflow-x-auto">
                <Table className="[&_th]:whitespace-nowrap [&_td]:whitespace-nowrap [&_td:first-child]:pl-3 [&_td:last-child]:pr-3 [&_th:first-child]:pl-3 [&_th:last-child]:pr-3">
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
                        <TableCell
                          colSpan={5}
                          className="text-center text-basalt-muted-foreground py-8"
                        >
                          {status?.error ?? '还没有备份记录。'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap text-basalt-muted-foreground">
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
                              size="sm"
                              disabled={busy !== null}
                              onClick={() => {
                                if (
                                  window.confirm('用这份备份覆盖本机数据库？请先停采集和本机 API。')
                                ) {
                                  void restore(row.id);
                                }
                              }}
                            >
                              {busy === 'restore' ? (
                                <Loader2 className="animate-spin h-3.5 w-3.5 mr-1" />
                              ) : null}
                              恢复
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </LayerCard.Body>
          </LayerCard>
        </SectionRule>
      </div>
    </AppShell>
  );
}
