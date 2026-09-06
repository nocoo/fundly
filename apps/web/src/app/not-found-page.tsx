import { Button, LayerCard } from '@nocoo/basalt';
import { ArrowLeft, ArrowUpRight, FileQuestion } from 'lucide-react';
import { Link } from 'react-router';
import { AppShell } from '@/components/layout';
import { ResearchHeader } from '@/components/layout/research-layout';

export default function NotFoundPage() {
  return (
    <AppShell breadcrumbs={[{ label: '未找到' }]}>
      <div className="research-page">
        <ResearchHeader
          title="页面未找到"
          icon={FileQuestion}
          description="这个路径没有对应的研究页面。"
        />
        <LayerCard className="flex min-h-[420px] flex-col items-center justify-center gap-5 p-8 text-center">
          <span className="font-mono text-6xl font-medium tracking-tight text-basalt-primary/75">
            404
          </span>
          <div>
            <h2 className="text-lg font-semibold">换个入口，继续研究</h2>
            <p className="mt-2 text-sm text-basalt-muted-foreground">
              可以回到仪表盘，或直接进入市场与基金。
            </p>
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/">
                <ArrowLeft className="size-4" strokeWidth={1.5} />
                回到仪表盘
              </Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/market">
                宏观大屏 <ArrowUpRight className="size-4" strokeWidth={1.5} />
              </Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/funds">
                基金浏览 <ArrowUpRight className="size-4" strokeWidth={1.5} />
              </Link>
            </Button>
          </div>
        </LayerCard>
      </div>
    </AppShell>
  );
}
