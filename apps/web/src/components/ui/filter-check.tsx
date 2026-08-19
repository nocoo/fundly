import { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
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
        'flex cursor-pointer items-center gap-2 rounded-widget border border-border bg-secondary px-3 py-2 text-sm shadow-xs transition-colors',
        'hover:border-foreground/20 hover:bg-accent',
        checked && 'border-primary/40 bg-accent',
      )}
    >
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <label htmlFor={id} className="cursor-pointer font-medium">
        {label}
      </label>
    </div>
  );
}
