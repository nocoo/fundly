import { ToggleGroup, ToggleGroupItem } from '@nocoo/basalt/components/toggle-group';
import { useDailyWidthMode } from '@/hooks/use-daily-width-mode';
import { DAILY_WIDTH_MODE_OPTIONS, type DailyWidthMode } from '@/lib/daily-width-mode';

/** Header control: 全宽 / 限宽, persisted in localStorage. */
export function DailyWidthToggle() {
  const { mode, setMode } = useDailyWidthMode();
  return (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(value) => value && setMode(value as DailyWidthMode)}
      aria-label="日报内容宽度"
    >
      {DAILY_WIDTH_MODE_OPTIONS.map((option) => (
        <ToggleGroupItem key={option.id} value={option.id}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
