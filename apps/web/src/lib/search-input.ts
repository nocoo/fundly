export function isComposingEvent(event: unknown): boolean {
  if (!event || typeof event !== 'object') return false;
  const rec = event as { isComposing?: unknown; nativeEvent?: { isComposing?: unknown } };
  return rec.nativeEvent?.isComposing === true || rec.isComposing === true;
}
