import { Button, Input, LayerCard } from '@nocoo/basalt';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@nocoo/basalt/components/table';
import { Cloud, CloudUpload, Loader2, RefreshCw } from 'lucide-react';
import { AppShell } from '@/components/layout';
import { PanelHeading, ResearchHeader, StatTile } from '@/components/layout/research-layout';
import { useBacky } from '@/hooks/use-backy';
import { envBadgeClass, formatFileSize, formatTimeAgo } from '@/lib/backy-format';
import { canEditBackyForm, canMutateBackups } from '@/lib/backy-vm';
import { formatCount } from '@/lib/format-number';
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

  const latest = rows[0];
  return (
    <AppShell breadcrumbs={[{ label: '备份' }]}>
      <div className="research-page">
        <ResearchHeader
          title="备份"
          icon={Cloud}
          description={
            status && !status.available
              ? '当前环境未启用备份服务。'
              : '管理基金与宏观数据的远程快照。'
          }
        />
        <div className="research-stats" aria-busy={loading}>
          <StatTile
            label="连接配置"
            value={
              <span className="text-xl">
                {status ? (status.configured ? '已配置' : '待配置') : '—'}
              </span>
            }
            hint="Backy 远程存储"
          />
          <StatTile
            label="远程备份"
            value={formatCount(status?.history?.total_backups)}
            hint="数据库快照"
          />
          <StatTile
            label="最近备份"
            value={
              <span className="text-xl">{latest ? formatTimeAgo(latest.created_at) : '—'}</span>
            }
          />
          <StatTile
            label="最新文件大小"
            value={
              <span className="text-xl">{latest ? formatFileSize(latest.file_size) : '—'}</span>
            }
            hint={status?.environment ? `环境 · ${status.environment}` : undefined}
          />
        </div>
        <div className="research-backup-grid">
          <LayerCard padding="none">
            <PanelHeading title="连接设置" description="配置备份服务与访问凭据" />
            <LayerCard.Body className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-basalt-muted-foreground" htmlFor="webhook-url">
                  Webhook URL
                </label>
                <Input
                  id="webhook-url"
                  value={webhookUrl}
                  placeholder="https://backy.hexly.ai/api/webhook/…"
                  onChange={(event) => setWebhookUrl(event.target.value)}
                  disabled={!editing}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-basalt-muted-foreground" htmlFor="api-key">
                  API Key
                </label>
                <Input
                  id="api-key"
                  type="password"
                  value={token}
                  placeholder={status?.hasToken ? '已保存，留空则不改' : '粘贴 API Key'}
                  onChange={(event) => setToken(event.target.value)}
                  disabled={!editing}
                  autoComplete="off"
                  className="h-9 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void saveConfig()}
                  disabled={!editing}
                >
                  {busy === 'save' ? <Loader2 className="size-3.5 animate-spin" /> : null}保存配置
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void testConnection()}
                  disabled={!ready || busy !== null}
                >
                  {busy === 'test' ? <Loader2 className="size-3.5 animate-spin" /> : null}测试连接
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-basalt-muted-foreground">
                凭据保存在本机。已保存的 API Key 不会再次展示。
              </p>
              {message ? (
                <p
                  role="status"
                  className={cn(
                    'text-xs leading-relaxed',
                    message.ok ? 'text-basalt-muted-foreground' : 'text-basalt-danger',
                  )}
                >
                  {message.text}
                </p>
              ) : null}
            </LayerCard.Body>
            <LayerCard.Footer>
              <Button
                size="sm"
                className="w-full"
                onClick={() => void push()}
                disabled={!ready || busy !== null}
              >
                {busy === 'push' ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CloudUpload className="size-3.5" strokeWidth={1.5} />
                )}
                立即备份
              </Button>
            </LayerCard.Footer>
          </LayerCard>
          <LayerCard className="research-backup-history" padding="none">
            <PanelHeading
              title="最近备份"
              description={
                status?.history
                  ? `共 ${status.history.total_backups} 份远程记录`
                  : '连接配置完成后展示远程快照'
              }
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void refresh()}
                  disabled={!ready || busy !== null}
                >
                  <RefreshCw className="size-3.5" strokeWidth={1.5} />
                  刷新
                </Button>
              }
            />
            <LayerCard.Body className="research-table-viewport">
              {loading && !status ? (
                <LayerCard.Loading label="加载备份状态" />
              ) : (
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
                          <TableCell className="text-right font-mono tabular-nums">
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
              )}
            </LayerCard.Body>
            <LayerCard.Footer className="justify-start text-[11px] text-basalt-muted-foreground">
              每份数据库快照包含基金资料、历史净值与已采集的宏观行情。
            </LayerCard.Footer>
          </LayerCard>
        </div>
      </div>
    </AppShell>
  );
}
