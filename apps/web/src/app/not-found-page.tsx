import { FileQuestion } from 'lucide-react';
import { Link } from 'react-router';
import { AppShell } from '@/components/layout';
import { EmptyState } from '@/components/ui/empty-state';

export default function NotFoundPage() {
  return (
    <AppShell breadcrumbs={[{ label: '未找到' }]}>
      <EmptyState
        icon={FileQuestion}
        title="页面不存在"
        description="这个路径没有对应页面。"
        action={
          <Link
            to="/"
            className="inline-flex h-9 items-center rounded-widget bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            回到仪表盘
          </Link>
        }
      />
    </AppShell>
  );
}
