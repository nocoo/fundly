import { Input } from '@nocoo/basalt';
import { useEffect, useState } from 'react';

export function NumericDraftInput({
  value,
  onChange,
  disabled,
  className,
  ariaLabel,
}: {
  value: number;
  onChange: (val: number) => void;
  disabled?: boolean;
  step?: number | string;
  min?: number | string;
  max?: number | string;
  className?: string;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState<string>(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === '' || trimmed === '-' || Number.isNaN(Number(trimmed))) {
      setDraft(String(value));
      return;
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num)) {
      setDraft(String(value));
      return;
    }
    onChange(num);
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      disabled={disabled}
      className={className}
      value={draft}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        // 允许输入过程中的负号、空串以及小数输入
        if (val === '' || val === '-' || /^-?\d*\.?\d*$/.test(val)) {
          setDraft(val);
        }
      }}
      onBlur={commit}
      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
    />
  );
}
