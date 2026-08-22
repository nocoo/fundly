export type BackyBackup = {
  id: string;
  tag: string;
  environment: string;
  file_size: number;
  is_single_json: number;
  created_at: string;
};

export type BackyHistory = {
  project_name: string;
  environment: string | null;
  total_backups: number;
  recent_backups: BackyBackup[];
};

export type BackupJob = {
  status: 'running' | 'ok' | 'error';
  message?: string;
  id?: string;
  file_size?: number;
};

export type BackyStatus = {
  available: boolean;
  configured: boolean;
  webhookUrl: string;
  hasToken: boolean;
  environment: string;
  history: BackyHistory | null;
  job?: BackupJob | null;
  error?: string;
};

export function unavailableStatus(): BackyStatus {
  return {
    available: false,
    configured: false,
    webhookUrl: '',
    hasToken: false,
    environment: 'prod',
    history: null,
  };
}

export function validateBackyForm(
  webhookUrl: string,
  token: string,
  hasToken: boolean,
): string | null {
  const url = webhookUrl.trim();
  if (!url) return '请填写 Webhook URL';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
      return 'Webhook URL 需要 http(s)';
  } catch {
    return 'Webhook URL 格式无效';
  }
  if (!token.trim() && !hasToken) return '请填写 API Key';
  return null;
}

export function canMutateBackups(status: BackyStatus): boolean {
  return status.configured;
}

export function canEditBackyForm(busy: string | null): boolean {
  return busy === null;
}

export function historyCountLabel(history: BackyHistory | null): string {
  if (!history) return '0 份';
  return `${history.total_backups} 份`;
}
