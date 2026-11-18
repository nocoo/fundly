import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

const AVATAR_COLORS = [
  'bg-basalt-primary text-basalt-primary-foreground',
  'bg-basalt-badge-teal text-basalt-badge-teal-foreground',
  'bg-basalt-badge-purple text-basalt-badge-purple-foreground',
  'bg-basalt-badge-green text-basalt-badge-green-foreground',
  'bg-basalt-warning text-basalt-warning-foreground',
  'bg-basalt-info text-basalt-info-foreground',
] as const;

export function getAvatarColor(name: string): string {
  const index = hashString(name) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index] ?? AVATAR_COLORS[0];
}
