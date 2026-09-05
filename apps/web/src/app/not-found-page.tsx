import { Button, LayerCard } from '@nocoo/basalt';
import { PageHeader } from '@nocoo/basalt/components/page-header';
import { FileQuestion } from 'lucide-react';
import { Link } from 'react-router';
import { AppShell } from '@/components/layout';

export default function NotFoundPage() {
  return (
    <AppShell breadcrumbs={[{ label: '未找到' }]}>
      <div className="space-y-6">
        <PageHeader title="404" description="请求的页面不存在或已被移除。" />
        <LayerCard className="py-12 text-center">
          <LayerCard.Body className="flex flex-col items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-basalt-muted text-basalt-muted-foreground mb-4">
              <FileQuestion className="h-8 w-8" strokeWidth={1.5} />
            </div>
            <h2 className="text-lg font-semibold text-basalt-foreground">页面不存在</h2>
            <p className="mt-1 text-sm text-basalt-muted-foreground mb-6">
              这个路径没有对应页面，请检查链接或返回仪表盘。
            </p>
            <Button asChild>
              <Link to="/">回到仪表盘</Link>
            </Button>
          </LayerCard.Body>
        </LayerCard>
      </div>
    </AppShell>
  );
}
