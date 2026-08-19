import { Settings } from 'lucide-react';
import { AppShell } from '@/components/layout';
import { EmptyState } from '@/components/ui/empty-state';

export default function SettingsPage() {
  return (
    <AppShell breadcrumbs={[{ label: '设置' }]}>
      <EmptyState
        icon={Settings}
        title="设置"
        description="主题可在右上角切换。数据新鲜度、抓取偏好等会在接入采集状态后补上。"
      />
    </AppShell>
  );
}
