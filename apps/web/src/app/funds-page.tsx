import { Search } from 'lucide-react';
import { AppShell } from '@/components/layout';
import { EmptyState } from '@/components/ui/empty-state';

export default function FundsPage() {
  return (
    <AppShell breadcrumbs={[{ label: '基金浏览' }]}>
      <EmptyState
        icon={Search}
        title="基金浏览"
        description="列表、类型过滤和详情会在采集库接入后出现。现在只保留路由和侧栏入口。"
      />
    </AppShell>
  );
}
