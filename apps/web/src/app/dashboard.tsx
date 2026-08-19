import { BarChart3, Database, Search, Trophy } from 'lucide-react';
import { Link } from 'react-router';
import { AppShell } from '@/components/layout';
import { EmptyState } from '@/components/ui/empty-state';
import { emptyDashboard } from '@/lib/dashboard-vm';

export default function Dashboard() {
  const snapshot = emptyDashboard();

  return (
    <AppShell>
      <EmptyState
        icon={BarChart3}
        title="数据还在采集"
        description={snapshot.message}
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to="/funds"
              className="inline-flex h-9 items-center gap-2 rounded-widget bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Search className="h-4 w-4" strokeWidth={1.5} />
              浏览基金
            </Link>
            <Link
              to="/ranking"
              className="inline-flex h-9 items-center gap-2 rounded-widget border border-border bg-secondary px-4 text-sm font-medium hover:bg-accent"
            >
              <Trophy className="h-4 w-4" strokeWidth={1.5} />
              查看排名
            </Link>
          </div>
        }
      />
      <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Database className="h-3.5 w-3.5" strokeWidth={1.5} />
        采集完成后这里会显示全市场数量、MVP 池和最新净值日
      </p>
    </AppShell>
  );
}
