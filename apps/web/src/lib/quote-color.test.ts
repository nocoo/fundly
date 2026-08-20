import { describe, expect, it } from 'bun:test';
import { parseQuoteColor, quoteToneClass } from './quote-color';

describe('parseQuoteColor', () => {
  it('defaults to red-up', () => {
    expect(parseQuoteColor(null)).toBe('red-up');
    expect(parseQuoteColor('nope')).toBe('red-up');
    expect(parseQuoteColor('green-up')).toBe('green-up');
  });
});

describe('quoteToneClass', () => {
  it('uses red-up by default and flips for green-up', () => {
    expect(quoteToneClass('up', 'red-up')).toContain('destructive');
    expect(quoteToneClass('down', 'red-up')).toContain('success');
    expect(quoteToneClass('up', 'green-up')).toContain('success');
    expect(quoteToneClass('down', 'green-up')).toContain('destructive');
    expect(quoteToneClass('flat', 'red-up')).toContain('muted');
  });
});
