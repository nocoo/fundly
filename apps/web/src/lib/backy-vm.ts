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

export type BackyStatus = {
  available: boolean;
  configured: boolean;
  environment: string;
  webhookHost: string | null;
  history: BackyHistory | null;
  error?: string;
};

export function unavailableStatus(): BackyStatus {
  return {
    available: false,
    configured: false,
    environment: 'prod',
    webhookHost: null,
    history: null,
  };
}

export function canMutateBackups(status: BackyStatus): boolean {
  return status.available && status.configured;
}

export function historyCountLabel(history: BackyHistory | null): string {
  if (!history) return '0 份';
  return `${history.total_backups} 份`;
}
