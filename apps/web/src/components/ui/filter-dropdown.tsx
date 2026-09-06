import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nocoo/basalt/components/select';

export type FilterOption = { value: string; label: string };

export function FilterDropdown({
  label,
  value,
  onChange,
  options,
  includeAll = true,
  allLabel = '全部',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  includeAll?: boolean;
  allLabel?: string;
}) {
  const items = includeAll ? [{ value: 'all', label: allLabel }, ...options] : options;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        aria-label={label}
        className="h-9 w-auto min-w-32 max-w-full gap-2 text-xs"
      >
        <span className="shrink-0 text-basalt-muted-foreground">{label}</span>
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
