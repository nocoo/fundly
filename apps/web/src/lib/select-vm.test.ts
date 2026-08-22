import { describe, expect, it } from 'bun:test';
import {
  defaultDim,
  normalizeSelectState,
  parseSelectSearch,
  parseStoredSelect,
  rankingRedirectPath,
  selectApiPath,
  selectSearchDirty,
  selectSearchEmpty,
  selectUrlState,
} from './select-vm';

describe('rankingRedirectPath', () => {
  it('sends return dims to /select/return', () => {
    expect(rankingRedirectPath('?dim=return_1m')).toBe('/select/return?dim=return_1m');
  });

  it('drops unknown ranking dims instead of substring matching', () => {
    expect(rankingRedirectPath('?dim=sharpe_fake')).toBe('/select/return');
    expect(rankingRedirectPath('?dim=return_bad')).toBe('/select/return');
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

  it('switches money L1 to seven-day yield', () => {
    const money = parseSelectSearch(new URLSearchParams('typeL1=货币型'), 'return');
    expect(money.dim.key).toBe('seven_day_yield');
    expect(selectApiPath('return', money)).toContain('seven_day_yield');
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

describe('normalizeSelectState', () => {
  const types = [
    { fund_type: '混合型-偏股', n: 10 },
    { fund_type: '股票型-标准', n: 4 },
  ];

  it('resets unknown L1/L2 and floors the page', () => {
    const state = parseSelectSearch(
      new URLSearchParams('typeL1=债券型&typeL2=不存在&page=2.8'),
      'return',
    );
    const got = normalizeSelectState(state, types, 'return');
    expect(got.typeL1).toBe('混合型');
    expect(got.typeL2).toBe('');
    expect(got.page).toBe(2);
    expect(got.dim.key).toBe('return_1y');
  });

  it('drops L2 that does not belong to the selected L1', () => {
    const state = parseSelectSearch(new URLSearchParams('typeL1=股票型&typeL2=偏股'), 'risk');
    const got = normalizeSelectState(state, types, 'risk');
    expect(got.typeL1).toBe('股票型');
    expect(got.typeL2).toBe('');
    expect(got.dim.key).toBe('max_drawdown_1y');
  });
});

describe('select url and stored state', () => {
  it('omits default mixed-type picks knobs from the url', () => {
    const state = parseSelectSearch(new URLSearchParams(), 'picks');
    expect(selectUrlState(state, 'picks')).toMatchObject({
      typeL1: null,
      dim: null,
      pass4433: null,
      feePeer: null,
      ddPeer: null,
      minSamples: null,
    });
    expect(selectSearchEmpty(new URLSearchParams())).toBe(true);
    expect(selectSearchDirty(new URLSearchParams('pass4433=1'), state, 'picks')).toBe(true);
  });

  it('restores a stored money-fund seven-day dim', () => {
    const stored = parseStoredSelect(
      { typeL1: '货币型', dim: 'seven_day_yield', page: 1 },
      'return',
    );
    expect(stored.dim?.key).toBe('seven_day_yield');
    const base = parseSelectSearch(new URLSearchParams('typeL1=货币型'), 'return');
    const got = normalizeSelectState(
      { ...base, ...stored, dim: stored.dim ?? base.dim },
      [{ fund_type: '货币型', n: 3 }],
      'return',
    );
    expect(got.dim.key).toBe('seven_day_yield');
  });

  it('reads stored json including off peers', () => {
    expect(parseStoredSelect(null, 'picks')).toEqual({});
    const stored = parseStoredSelect(
      {
        typeL1: '股票型',
        typeL2: '标准',
        dim: 'scale_yi',
        pass4433: '1',
        page: 3,
        mvpOnly: true,
        minSamples: 'off',
        feePeer: 'off',
        ddPeer: 40,
        scalePeer: 50,
        top10Max: 60,
      },
      'picks',
    );
    expect(stored.dim?.key).toBe('scale_yi');
    expect(stored.minSamples).toBeNull();
    expect(stored.feePeer).toBeNull();
    expect(stored.ddPeer).toBe(40);
    expect(stored.mvpOnly).toBe(true);
    expect(defaultDim('cost').key).toBe('all_in_fee_pct');
  });
});
