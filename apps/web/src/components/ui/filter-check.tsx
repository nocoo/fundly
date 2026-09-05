import { Checkbox } from '@nocoo/basalt';
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
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-lg border border-basalt-border bg-basalt-control px-3 py-1.5 text-sm font-medium transition-colors',
        'hover:border-basalt-foreground/20 hover:bg-basalt-accent',
        checked && 'border-basalt-primary/40 bg-basalt-accent text-basalt-foreground',
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        tabIndex={-1}
        className="pointer-events-none"
      />
      <span>{label}</span>
    </button>
  );
}
