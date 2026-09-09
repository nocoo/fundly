import { Button, LayerCard } from '@nocoo/basalt';
import { ArrowLeft, Newspaper } from 'lucide-react';
import { Link, useParams } from 'react-router';
import useSWR from 'swr';
import { ApiError, fetchAPI } from '@/api';
import { MarkdownBody } from '@/components/daily/markdown-body';
import { AppShell } from '@/components/layout';
import { PanelHeading, ResearchEmpty, ResearchHeader } from '@/components/layout/research-layout';
import './research-pages.css';
import './daily-page.css';

export interface DailyDetail {
  date: string;
  title: string;
  summary: string;
  markdown: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function DailyDetailPage() {
  const { date: rawDate } = useParams<{ date: string }>();
  const date = rawDate ?? '';
  const valid = DATE_RE.test(date);
  const { data, error, isLoading, mutate } = useSWR<DailyDetail>(
    valid ? `/api/daily/${date}` : null,
    fetchAPI,
  );

  const notFound = error instanceof ApiError && error.status === 404;
  const title = data?.title ?? (valid ? `📊 财经日报 · ${date}` : '财经日报');

  return (
    <AppShell breadcrumbs={[{ label: '日报', href: '/daily' }, { label: valid ? date : '详情' }]}>
      <div className="research-page">
        <ResearchHeader
          title={title}
          icon={Newspaper}
          description={data?.summary || (valid ? date : '日期格式无效')}
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link to="/daily">
                <ArrowLeft className="size-3.5" strokeWidth={1.5} />
                返回列表
              </Link>
            </Button>
          }
        />

        <LayerCard padding="none">
          <PanelHeading
            title="正文"
            description={data ? `content/macro-daily/${data.date}.md` : undefined}
          />
          <LayerCard.Body className="daily-detail-body">
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
              <MarkdownBody markdown={data.markdown} />
            )}
          </LayerCard.Body>
        </LayerCard>
      </div>
    </AppShell>
  );
}
