import { hashString } from './utils';

const BADGE_VARIANTS = ['blue', 'orange', 'red', 'teal', 'purple', 'success'] as const;

export function typeBadgeVariant(label: string): (typeof BADGE_VARIANTS)[number] {
  const index = hashString(label) % BADGE_VARIANTS.length;
  return BADGE_VARIANTS[index] ?? BADGE_VARIANTS[0];
}
