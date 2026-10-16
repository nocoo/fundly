import { Button, Checkbox, Input, LayerCard } from '@nocoo/basalt';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@nocoo/basalt/components/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@nocoo/basalt/components/table';
import { useState } from 'react';
import {
  API_TOKEN_SCOPES,
  type ApiTokenItem,
  type ApiTokenScope,
  useApiTokens,
} from '@/hooks/use-api-tokens';

const date = (value: number | null) => (value === null ? '—' : new Date(value).toLocaleString());
export function ApiTokens() {
  const vm = useApiTokens();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiTokenScope[]>([]);
  const [expiry, setExpiry] = useState('');
  const [confirm, setConfirm] = useState<{
    item: ApiTokenItem;
    action: 'revoke' | 'remove';
  } | null>(null);
  const [copyState, setCopyState] = useState('复制');
  return (
    <LayerCard>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">API Tokens</h2>
          <p className="text-xs text-basalt-muted-foreground">
            用于自动化只读查询；凭证独立于每日替换的行情数据库。
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(value) => {
            if (!vm.busy) setOpen(value);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" disabled={vm.busy}>
              创建 Token
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>创建 API Token</DialogTitle>
              <DialogDescription>
                选择最小权限。完整 Token 仅在创建成功后显示一次。
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={async (event) => {
                event.preventDefault();
                if (await vm.create(name, scopes, expiry)) {
                  setOpen(false);
                  setName('');
                  setScopes([]);
                  setExpiry('');
                  setCopyState('复制');
                }
              }}
            >
              <div className="space-y-1">
                <label htmlFor="token-name" className="text-xs">
                  名称
                </label>
                <Input
                  id="token-name"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <fieldset className="grid grid-cols-2 gap-2">
                <legend className="mb-2 text-xs">只读权限</legend>
                {API_TOKEN_SCOPES.map((scope) => (
                  <label
                    key={scope}
                    htmlFor={`token-scope-${scope}`}
                    className="flex items-center gap-2 text-xs"
                  >
                    <Checkbox
                      id={`token-scope-${scope}`}
                      checked={scopes.includes(scope)}
                      onCheckedChange={(checked) =>
                        setScopes((current) =>
                          checked ? [...current, scope] : current.filter((item) => item !== scope),
                        )
                      }
                    />
                    {scope}
                  </label>
                ))}
              </fieldset>
              <div className="space-y-1">
                <label htmlFor="token-expiry" className="text-xs">
                  有效天数（留空永不过期）
                </label>
                <Input
                  id="token-expiry"
                  type="number"
                  min={1}
                  max={3650}
                  step={1}
                  value={expiry}
                  onChange={(event) => setExpiry(event.target.value)}
                />
              </div>
              {vm.actionError && (
                <p role="alert" className="text-xs text-basalt-destructive">
                  {vm.actionError}
                </p>
              )}
              <DialogFooter>
                <Button type="submit" disabled={vm.busy || !name.trim() || !scopes.length}>
                  {vm.busy ? '创建中…' : '创建'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {vm.error && (
        <div role="alert" className="mb-3 text-xs">
          加载失败：{vm.error.message}{' '}
          <Button variant="outline" size="sm" onClick={() => void vm.reload()}>
            重试
          </Button>
        </div>
      )}
      {vm.actionError && !open && (
        <p role="alert" className="mb-3 text-xs text-basalt-destructive">
          {vm.actionError}
        </p>
      )}
      {vm.isLoading ? (
        <LayerCard.Loading label="加载 API Tokens" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {['名称 / 前缀', '权限', '创建时间', '最后使用', '过期时间', '状态', '操作'].map(
                (label) => (
                  <TableHead key={label}>{label}</TableHead>
                ),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {!vm.items.length && (
              <TableRow>
                <TableCell colSpan={7}>暂无 Token</TableCell>
              </TableRow>
            )}
            {vm.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div>{item.name}</div>
                  <code className="text-xs">{item.token_prefix}…</code>
                </TableCell>
                <TableCell className="max-w-48 whitespace-normal text-xs">
                  {item.scopes.join(', ')}
                </TableCell>
                <TableCell className="text-xs">{date(item.created_at)}</TableCell>
                <TableCell className="text-xs">{date(item.last_used_at)}</TableCell>
                <TableCell className="text-xs">
                  {item.expires_at === null ? '永不过期' : date(item.expires_at)}
                </TableCell>
                <TableCell>
                  {item.status === 'revoked'
                    ? '已撤销'
                    : item.expires_at !== null && item.expires_at <= Date.now()
                      ? '已过期'
                      : '有效'}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={vm.busy}
                    onClick={() =>
                      setConfirm({ item, action: item.status === 'revoked' ? 'remove' : 'revoke' })
                    }
                  >
                    {item.status === 'revoked' ? '删除' : '撤销'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog
        open={vm.secret !== null}
        onOpenChange={(value) => {
          if (!value) vm.clearSecret();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>保存你的 Token</DialogTitle>
            <DialogDescription>
              仅显示一次，关闭后无法再次查看。请存入密码管理器，不要提交到代码或分享。
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="新创建的 API Token"
            readOnly
            value={vm.secret ?? ''}
            className="font-mono text-xs"
          />
          <DialogFooter>
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(vm.secret ?? '');
                  setCopyState('已复制');
                } catch {
                  setCopyState('复制失败，请手动复制');
                }
              }}
            >
              {copyState}
            </Button>
            <Button variant="outline" onClick={vm.clearSecret}>
              已保存，关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={confirm !== null}
        onOpenChange={(value) => {
          if (!value && !vm.busy) setConfirm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm?.action === 'remove' ? '删除 Token 记录' : '撤销 Token'}
            </DialogTitle>
            <DialogDescription>
              {confirm?.item.name}：
              {confirm?.action === 'remove' ? '永久删除已撤销的记录。' : '立即停止访问，无法恢复。'}
            </DialogDescription>
          </DialogHeader>
          {vm.actionError && (
            <p role="alert" className="text-xs text-basalt-destructive">
              {vm.actionError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={vm.busy} onClick={() => setConfirm(null)}>
              取消
            </Button>
            <Button
              disabled={vm.busy}
              onClick={async () => {
                if (
                  confirm &&
                  (await (confirm.action === 'remove'
                    ? vm.remove(confirm.item.id)
                    : vm.revoke(confirm.item.id)))
                )
                  setConfirm(null);
              }}
            >
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LayerCard>
  );
}
