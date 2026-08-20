import { hashString } from './utils';

const BADGE_TONES = [
  'bg-chart-1 text-foreground',
  'bg-chart-2 text-foreground',
  'bg-chart-3 text-foreground',
  'bg-chart-4 text-foreground',
  'bg-chart-5 text-foreground',
  'bg-chart-6 text-foreground',
  'bg-chart-7 text-foreground',
  'bg-chart-8 text-foreground',
  'bg-chart-9 text-foreground',
  'bg-chart-10 text-foreground',
  'bg-chart-11 text-foreground',
  'bg-chart-12 text-foreground',
  'bg-chart-13 text-foreground',
  'bg-chart-14 text-foreground',
  'bg-chart-15 text-foreground',
  'bg-chart-16 text-foreground',
] as const;

export function typeBadgeClass(label: string): string {
  const index = hashString(label) % BADGE_TONES.length;
  return BADGE_TONES[index] ?? BADGE_TONES[0];
}
