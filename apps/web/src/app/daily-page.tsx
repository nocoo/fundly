import { LayerCard } from '@nocoo/basalt';
import { ChevronRight, Newspaper } from 'lucide-react';
import { Link } from 'react-router';
import useSWR from 'swr';
import { fetchAPI } from '@/api';
import { DailyWidthToggle } from '@/components/daily/daily-width-toggle';
import { AppShell } from '@/components/layout';
import { PanelHeading, ResearchEmpty, ResearchHeader } from '@/components/layout/research-layout';
import { useDailyWidthMode } from '@/hooks/use-daily-width-mode';
import { dailyPageWidthClass } from '@/lib/daily-width-mode';
import { formatCount } from '@/lib/format-number';
import { cn } from '@/lib/utils';
import './research-pages.css';
import './daily-page.css';

export interface DailyListItem {
  date: string;
  title: string;
  summary: string;
  path: string;
  weekday?: string;
  session?: string;
  sources?: string[];
}

export default function DailyPage() {
  const { mode: widthMode } = useDailyWidthMode();
  const { data, error, isLoading, mutate } = useSWR<DailyListItem[]>('/api/daily', fetchAPI);
  const items = data ?? [];

  return (
    <AppShell breadcrumbs={[{ label: '日报' }]}>
      <div className={cn('research-page', dailyPageWidthClass(widthMode))}>
        <ResearchHeader
          title="财经日报"
          icon={Newspaper}
          description="跨资产研究摘要：全球宏观、贵金属、科技龙头与中国资产（指数 + ETF），并以好消息 / 坏消息双列表呈现当日张力。正文来自仓库 Markdown，部署后即可阅读。"
          actions={<DailyWidthToggle />}
        />

        <LayerCard padding="none">
          <PanelHeading
            title="全部日报"
            description={
              isLoading
                ? '加载中…'
                : error
                  ? '加载失败'
                  : items.length > 0
                    ? `共 ${formatCount(items.length)} 篇，按日期新到旧`
                    : '尚无日报文件'
            }
            action={
              error ? (
                <button
                  type="button"
                  className="text-xs text-basalt-primary underline-offset-2 hover:underline"
                  onClick={() => void mutate()}
                >
                  重试
                </button>
              ) : null
            }
          />
          <LayerCard.Body className="p-0">
            {error ? (
              <ResearchEmpty
                title="无法加载日报列表"
                description={error instanceof Error ? error.message : '请稍后重试。'}
              />
            ) : isLoading ? (
              <div className="research-empty" aria-busy="true">
                <p className="text-sm text-basalt-muted-foreground">加载中…</p>
              </div>
            ) : items.length === 0 ? (
              <ResearchEmpty
                title="暂无财经日报"
                description="将 Markdown 放到 content/macro-daily/YYYY-MM-DD.md 并部署后，这里会自动出现列表。"
              />
            ) : (
              <ul className="daily-list">
                {items.map((item) => (
                  <li key={item.date}>
                    <Link to={`/daily/${item.date}`} className="daily-list-item">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <time
                            dateTime={item.date}
                            className="font-mono text-xs tabular-nums text-basalt-muted-foreground"
                          >
                            {item.date}
                          </time>
                          {item.weekday ? (
                            <span className="text-xs text-basalt-muted-foreground">
                              {item.weekday}
                            </span>
                          ) : null}
                          <span className="text-sm font-medium text-basalt-foreground">
                            {item.title}
                          </span>
                        </div>
                        {item.summary ? (
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-basalt-muted-foreground">
                            {item.summary}
                          </p>
                        ) : null}
                        {item.sources && item.sources.length > 0 ? (
                          <div className="daily-source-chips mt-2">
                            {item.sources.map((src) => (
                              <span key={src} className="daily-source-chip">
                                {src}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <ChevronRight
                        className="size-4 shrink-0 text-basalt-muted-foreground"
                        strokeWidth={1.5}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </LayerCard.Body>
        </LayerCard>
      </div>
    </AppShell>
  );
}
