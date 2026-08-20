import { describe, expect, it } from 'bun:test';
import {
  formatFundTypeLabel,
  joinFundType,
  listTypeL1,
  listTypeL2,
  splitFundType,
} from './fund-type';

describe('splitFundType', () => {
  it('splits on the first hyphen', () => {
    expect(splitFundType('混合型-偏股')).toEqual({ raw: '混合型-偏股', l1: '混合型', l2: '偏股' });
    expect(splitFundType('QDII-混合偏股')).toEqual({
      raw: 'QDII-混合偏股',
      l1: 'QDII',
      l2: '混合偏股',
    });
    expect(splitFundType('股票型')).toEqual({ raw: '股票型', l1: '股票型', l2: '' });
    expect(splitFundType('Reits')).toEqual({ raw: 'Reits', l1: 'Reits', l2: '' });
  });

  it('joins and formats labels', () => {
    expect(joinFundType('混合型', '偏股')).toBe('混合型-偏股');
    expect(joinFundType('股票型', '')).toBe('股票型');
    expect(formatFundTypeLabel('混合型-偏股')).toBe('混合型 · 偏股');
    expect(formatFundTypeLabel('股票型')).toBe('股票型');
  });
});

describe('type lists', () => {
  const items = [
    { fund_type: '混合型-偏股', n: 10 },
    { fund_type: '混合型-灵活', n: 4 },
    { fund_type: '股票型', n: 3 },
  ];

  it('rolls L1 counts and lists L2 for a parent', () => {
    expect(listTypeL1(items)).toEqual([
      { value: '混合型', label: '混合型', n: 14 },
      { value: '股票型', label: '股票型', n: 3 },
    ]);
    expect(listTypeL2(items, '混合型')).toEqual([
      { value: '偏股', label: '偏股', n: 10 },
      { value: '灵活', label: '灵活', n: 4 },
    ]);
    expect(listTypeL2(items, '股票型')).toEqual([]);
  });
});
