import { type ChangeEvent, type CompositionEvent, useEffect, useRef, useState } from 'react';
import { isComposingEvent } from '@/lib/search-input';

export function useImeSearch(
  committed: string,
  onCommit: (value: string) => void,
  delay = 300,
): {
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onCompositionStart: () => void;
  onCompositionEnd: (event: CompositionEvent<HTMLInputElement>) => void;
} {
  const [draft, setDraft] = useState(committed);
  const composing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onCommitRef = useRef(onCommit);
  const committedRef = useRef(committed);
  onCommitRef.current = onCommit;
  committedRef.current = committed;

  useEffect(() => {
    setDraft(committed);
  }, [committed]);

  useEffect(() => {
    return () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
    };
  }, []);

  const schedule = (value: string) => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    if (composing.current || value === committedRef.current) return;
    timer.current = setTimeout(() => {
      if (!composing.current) onCommitRef.current(value);
    }, delay);
  };

  return {
    value: draft,
    onChange: (event) => {
      const next = event.target.value;
      composing.current = isComposingEvent(event.nativeEvent) || composing.current;
      setDraft(next);
      schedule(next);
    },
    onCompositionStart: () => {
      composing.current = true;
      if (timer.current !== undefined) clearTimeout(timer.current);
    },
    onCompositionEnd: (event) => {
      composing.current = false;
      const next = event.currentTarget.value;
      setDraft(next);
      schedule(next);
    },
  };
}
