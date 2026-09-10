import { Button } from '@nocoo/basalt';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import useSWR from 'swr';
import { ApiError, fetchAPI } from '@/api';
import { DataInfo } from '@/components/charts/market-chart-controls';
import { DailyReportView } from '@/components/daily/daily-report-view';
import { DailyWidthToggle } from '@/components/daily/daily-width-toggle';
import { AppShell } from '@/components/layout';
import { ResearchEmpty, ResearchHeader } from '@/components/layout/research-layout';
import { useDailyWidthMode } from '@/hooks/use-daily-width-mode';
import { dailyPageWidthClass } from '@/lib/daily-width-mode';
import { cn } from '@/lib/utils';
import './research-pages.css';
import './daily-page.css';

export interface DailyDetail {
  date: string;
  title: string;
  summary: string;
  markdown: string;
  weekday?: string;
  session?: string;
  methodology?: string;
  sources?: string[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function BackLink() {
  return (
    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
      <Link to="/daily" aria-label="返回日报列表">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
      </Link>
    </Button>
  );
}

export default function DailyDetailPage() {
  const { date: rawDate } = useParams<{ date: string }>();
  const date = rawDate ?? '';
  const valid = DATE_RE.test(date);
  const { mode: widthMode } = useDailyWidthMode();
  const { data, error, isLoading, mutate } = useSWR<DailyDetail>(
    valid ? `/api/daily/${date}` : null,
    fetchAPI,
  );

  const notFound = error instanceof ApiError && error.status === 404;
  const title = data?.title?.trim() || '财经日报';
  const sourceLabel = data?.sources?.join(' · ') ?? null;

  return (
    <AppShell breadcrumbs={[{ label: '日报', href: '/daily' }, { label: valid ? date : '详情' }]}>
      <div className={cn('research-page', dailyPageWidthClass(widthMode))}>
        <ResearchHeader
          leading={<BackLink />}
          title={title}
          description={
            data ? (
              <span className="daily-header-desc">
                {data.summary ? <span>{data.summary}</span> : null}
                <span className="daily-header-meta">
                  {data.weekday ? <span>{data.weekday}</span> : null}
                  {data.session ? (
                    <span className="daily-header-session">{data.session}</span>
                  ) : null}
                  <DataInfo name="数据说明" source={sourceLabel} date={data.date}>
                    {data.sources && data.sources.length > 0 ? (
                      <p>来源列表：{data.sources.join('、')}</p>
                    ) : (
                      <p>来源未在 frontmatter 中声明。</p>
                    )}
                    {data.session ? <p>会话口径：{data.session}</p> : null}
                    {data.methodology ? <p>数据口径：{data.methodology}</p> : null}
                    <p>文件：content/macro-daily/{data.date}.md</p>
                  </DataInfo>
                </span>
              </span>
            ) : valid ? (
              date
            ) : (
              '日期格式无效'
            )
          }
          actions={<DailyWidthToggle />}
        />

        {!valid ? (
          <ResearchEmpty
            title="日期无效"
            description="路径须为 /daily/YYYY-MM-DD。"
            action={
              <Button variant="outline" size="sm" asChild>
                <Link to="/daily">回到日报列表</Link>
              </Button>
            }
          />
        ) : error && notFound ? (
          <ResearchEmpty
            title="未找到该日日报"
            description={`没有 content/macro-daily/${date}.md，或文件尚未部署到当前环境。`}
            action={
              <Button variant="outline" size="sm" asChild>
                <Link to="/daily">回到日报列表</Link>
              </Button>
            }
          />
        ) : error ? (
          <ResearchEmpty
            title="无法加载日报"
            description={error instanceof Error ? error.message : '请稍后重试。'}
            action={
              <button
                type="button"
                className="text-xs text-basalt-primary underline-offset-2 hover:underline"
                onClick={() => void mutate()}
              >
                重试
              </button>
            }
          />
        ) : isLoading || !data ? (
          <div className="research-empty" aria-busy="true">
            <p className="text-sm text-basalt-muted-foreground">加载中…</p>
          </div>
        ) : (
          <DailyReportView markdown={data.markdown} />
        )}
      </div>
    </AppShell>
  );
}
