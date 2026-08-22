import { describe, expect, it } from 'bun:test';
import { rankingRedirectPath } from './select-vm';

describe('rankingRedirectPath', () => {
  it('sends return dims to /select/return', () => {
    expect(rankingRedirectPath('?dim=return_1m')).toBe('/select/return?dim=return_1m');
  });

  it('sends risk dims to /select/risk', () => {
    const url = rankingRedirectPath('?dim=sharpe_1y&typeL1=股票型');
    expect(url.startsWith('/select/risk?')).toBe(true);
    expect(new URLSearchParams(url.split('?')[1]).get('dim')).toBe('sharpe_1y');
    expect(new URLSearchParams(url.split('?')[1]).get('typeL1')).toBe('股票型');
  });
});
