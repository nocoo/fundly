import { describe, expect, it } from 'bun:test';
import { isItemActive, NAV_GROUPS, shouldGroupBeOpenOnMount } from './navigation';

describe('isItemActive', () => {
  it("matches '/' exactly only on '/'", () => {
    expect(isItemActive('/', '/')).toBe(true);
    expect(isItemActive('/', '/funds')).toBe(false);
  });

  it('matches a non-root href as a prefix', () => {
    expect(isItemActive('/funds', '/funds')).toBe(true);
    expect(isItemActive('/funds', '/funds/000001')).toBe(true);
    expect(isItemActive('/ranking', '/funds')).toBe(false);
  });
});

describe('shouldGroupBeOpenOnMount', () => {
  it('opens the group containing the current route', () => {
    const ranking = NAV_GROUPS.find((g) => g.label === '选基');
    if (!ranking) throw new Error("expected '选基' group");
    expect(shouldGroupBeOpenOnMount(ranking, '/ranking')).toBe(true);
  });

  it('respects defaultOpen=true even without a route match', () => {
    const overview = NAV_GROUPS.find((g) => g.label === '总览');
    if (!overview) throw new Error("expected '总览' group");
    expect(shouldGroupBeOpenOnMount(overview, '/funds')).toBe(true);
  });

  it('honours an explicit defaultOpen=false when no item matches', () => {
    expect(
      shouldGroupBeOpenOnMount({ items: [{ href: '/hidden' }], defaultOpen: false }, '/funds'),
    ).toBe(false);
  });
});
