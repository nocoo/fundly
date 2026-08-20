import { describe, expect, it, mock } from 'bun:test';
import { writeClipboard } from './clipboard';

describe('writeClipboard', () => {
  it('reports success when the clipboard write resolves', async () => {
    const writeText = mock(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    expect(await writeClipboard('000001')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('000001');
  });

  it('reports failure when the clipboard write rejects', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('denied')) },
    });
    expect(await writeClipboard('000001')).toBe(false);
  });
});
