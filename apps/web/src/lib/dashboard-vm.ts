export type DashboardStatus = 'placeholder' | 'ready' | 'error';

export interface DashboardSnapshot {
  status: DashboardStatus;
  fundCount: number | null;
  mvpCount: number | null;
  lastNavDate: string | null;
  pass4433Count: number | null;
  failedFetchCount: number | null;
  message: string;
}

export function emptyDashboard(): DashboardSnapshot {
  return {
    status: 'placeholder',
    fundCount: null,
    mvpCount: null,
    lastNavDate: null,
    pass4433Count: null,
    failedFetchCount: null,
    message:
      '全市场列表和净值由本地爬虫写入 SQLite。接上之后，这里会显示基金数量、最新净值和 4433 过线只数。',
  };
}

export { formatCount } from './format-number';
