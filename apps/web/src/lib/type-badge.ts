import type { TagColor } from '@nocoo/basalt/components/tag-badge';
import { hashString } from './utils';

const TAG_COLOR_POOL = [
  'blue',
  'amber',
  'rose',
  'teal',
  'violet',
  'success',
] as const satisfies readonly TagColor[];

export function typeBadgeColor(label: string): TagColor {
  const index = hashString(label) % TAG_COLOR_POOL.length;
  return TAG_COLOR_POOL[index] ?? TAG_COLOR_POOL[0];
}
