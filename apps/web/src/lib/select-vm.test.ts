import { describe, expect, it } from 'bun:test';
import { parseSelectSearch, rankingRedirectPath, selectApiPath, selectUrlState } from './select-vm';

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

describe('parseSelectSearch', () => {
  it('keeps picks defaults and honors off flags', () => {
    const on = parseSelectSearch(new URLSearchParams(), 'picks');
    expect(on.pass4433).toBe(true);
    expect(on.feePeer).toBe(50);
    expect(on.ddPeer).toBe(50);
    expect(on.minSamples).toBe(200);
    expect(on.scalePeer).toBeNull();
    expect(on.top10Max).toBeNull();
    const off = parseSelectSearch(
      new URLSearchParams(
        'pass4433=off&feePeer=off&ddPeer=off&minSamples=off&scalePeer=50&top10Max=60',
      ),
      'picks',
    );
    expect(off.pass4433).toBe(false);
    expect(off.feePeer).toBeNull();
    expect(off.ddPeer).toBeNull();
    expect(off.minSamples).toBeNull();
    expect(off.scalePeer).toBe(50);
    expect(off.top10Max).toBe(60);
  });

  it('floors fractional pages', () => {
    expect(parseSelectSearch(new URLSearchParams('page=1.9'), 'return').page).toBe(1);
  });
});

describe('selectApiPath', () => {
  it('emits picks rule knobs including off', () => {
    const state = parseSelectSearch(
      new URLSearchParams('pass4433=off&feePeer=off&mvpOnly=1'),
      'picks',
    );
    const url = selectApiPath('picks', state);
    expect(url).toContain('lens=picks');
    expect(url).toContain('pass4433=off');
    expect(url).toContain('feePeer=off');
    expect(url).toContain('ddPeer=50');
    expect(url).toContain('mvpOnly=1');
    expect(selectUrlState(state, 'picks').pass4433).toBe('off');
  });
});
