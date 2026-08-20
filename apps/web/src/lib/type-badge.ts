import { hashString } from './utils';

const BADGE_TONES = [
  'bg-chart-1 text-white',
  'bg-chart-2 text-white',
  'bg-chart-3 text-white',
  'bg-chart-4 text-white',
  'bg-chart-5 text-white',
  'bg-chart-6 text-white',
  'bg-chart-7 text-white',
  'bg-chart-8 text-white',
  'bg-chart-9 text-white',
  'bg-chart-10 text-white',
  'bg-chart-11 text-white',
  'bg-chart-12 text-white',
  'bg-chart-13 text-white',
  'bg-chart-14 text-white',
] as const;

export function typeBadgeClass(label: string): string {
  const index = hashString(label) % BADGE_TONES.length;
  return BADGE_TONES[index] ?? BADGE_TONES[0];
}
