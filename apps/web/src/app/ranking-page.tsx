import { Trophy } from 'lucide-react';
import { AppShell } from '@/components/layout';
import { EmptyState } from '@/components/ui/empty-state';

export default function RankingPage() {
  return (
    <AppShell breadcrumbs={[{ label: '排名' }]}>
      <EmptyState
        icon={Trophy}
        title="排名"
        description="4433、夏普、回撤等榜单会在 Phase 2 计算完成后出现。"
      />
    </AppShell>
  );
}
