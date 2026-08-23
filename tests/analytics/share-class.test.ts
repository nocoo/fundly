import { describe, expect, test } from 'bun:test';
import { assignShareGroups, parseShareClass } from '../../src/analytics/share-class.ts';

describe('parseShareClass', () => {
  test('parses currency before and after the letter', () => {
    expect(parseShareClass('易方达原油A类人民币')).toEqual({
      shareClass: '人民币A',
      base: '易方达原油',
      letter: 'A',
    });
    expect(parseShareClass('鹏华全球中短债(QDII)美元现汇C')).toEqual({
      shareClass: '美元现汇C',
      base: '鹏华全球中短债(QDII)',
      letter: 'C',
    });
  });

  test('does not treat ETF/LOF/FOF/QDII tails as share letters', () => {
    expect(parseShareClass('某沪深300ETF').letter).toBe('');
    expect(parseShareClass('某黄金LOF').letter).toBe('');
    expect(parseShareClass('某全球QDII').letter).toBe('');
    expect(parseShareClass('某沪深300ETF人民币').letter).toBe('');
    expect(parseShareClass('某ET 人民币F').letter).toBe('');
    expect(parseShareClass('某QDI I').letter).toBe('');
  });

  test('trims the base after stripping the suffix', () => {
    expect(parseShareClass('甲 A').letter).toBe('');
    expect(parseShareClass('甲乙A\t').letter).toBe('A');
    expect(parseShareClass('指数A\u00a0').letter).toBe('A');
  });

  test('groups only when a sibling class exists', () => {
    const groups = assignShareGroups([
      { fundCode: '1', fundName: '易方达安悦超短债A' },
      { fundCode: '2', fundName: '易方达安悦超短债C' },
      { fundCode: '3', fundName: '易方达安悦超短债F' },
      { fundCode: '4', fundName: '孤独的股票A' },
    ]);
    expect(groups.get('1')?.shareGroupKey).toBe('易方达安悦超短债');
    expect(groups.get('3')?.shareClass).toBe('F');
    expect(groups.get('4')?.shareGroupKey).toBe('');
  });
});
