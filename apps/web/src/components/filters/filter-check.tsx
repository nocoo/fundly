import { Checkbox } from '@nocoo/basalt';
import { useId } from 'react';
import { cn } from '@/lib/utils';

export function FilterCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-lg border border-basalt-border bg-basalt-control px-3 py-1.5 text-sm font-medium transition-colors select-none',
        'hover:border-basalt-foreground/20 hover:bg-basalt-accent',
        checked && 'border-basalt-primary/40 bg-basalt-accent text-basalt-foreground',
      )}
    >
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <label htmlFor={id} className="cursor-pointer">
        {label}
      </label>
    </div>
  );
}
