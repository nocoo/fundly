import { describe, expect, it } from 'bun:test';
import { parseFundExtras, tsToDate } from './fund-extra';

const ALLOCATION = {
  series: [
    { name: '股票占净比', type: null, data: [87.82, 86.78], yAxis: 0 },
    { name: '债券占净比', type: null, data: [4.88, 4.42], yAxis: 0 },
  ],
  categories: ['2025-09-30', '2026-06-30'],
};

const SCALE = {
  categories: ['2025-06-30', '2026-06-30'],
  series: [
    { y: 35.57, mom: '-1.58%' },
    { y: 49.59, mom: '33.44%' },
  ],
};

const HOLDERS = {
  series: [
    { name: '机构持有比例', data: [0.71, 1.34] },
    { name: '个人持有比例', data: [99.29, 98.66] },
  ],
  categories: ['2024-06-30', '2025-12-31'],
};

const SCORES = {
  avr: '83.50',
  categories: ['选证能力', '收益率'],
  data: [80.0, 85.0],
};

describe('parseFundExtras', () => {
  it('returns empty extras when the row is missing', () => {
    expect(parseFundExtras(null)).toEqual({
      allocation: null,
      scale: null,
      holders: null,
      ranking: [],
      scores: null,
    });
  });

  it('parses satellite JSON and keeps the latest snapshot', () => {
    const extras = parseFundExtras({
      asset_allocation_json: JSON.stringify(ALLOCATION),
      scale_history_json: JSON.stringify(SCALE),
      holder_structure_json: JSON.stringify(HOLDERS),
      ranking_trend_json: JSON.stringify([
        { x: 1357228800000, y: 82, sc: '163' },
        { x: 1357488000000, y: 40, sc: '163' },
      ]),
      performance_5d_json: JSON.stringify(SCORES),
    });
    expect(extras.allocation?.latest).toEqual([
      { name: '股票占净比', value: 86.78 },
      { name: '债券占净比', value: 4.42 },
    ]);
    expect(extras.scale?.latest).toEqual({ date: '2026-06-30', value: 49.59 });
    expect(extras.holders?.latest[0]).toEqual({ name: '机构持有比例', value: 1.34 });
    expect(extras.ranking).toEqual([
      { date: '2013-01-04', rank: 82, peers: 163 },
      { date: '2013-01-07', rank: 40, peers: 163 },
    ]);
    expect(extras.scores).toEqual({
      avr: 83.5,
      items: [
        { name: '选证能力', value: 80 },
        { name: '收益率', value: 85 },
      ],
    });
  });

  it('ignores broken JSON and downsamples a long ranking series', () => {
    const ranking = Array.from({ length: 800 }, (_, i) => ({
      x: 1_700_000_000_000 + i * 86_400_000,
      y: i,
      sc: '10',
    }));
    const extras = parseFundExtras({
      asset_allocation_json: '{',
      scale_history_json: JSON.stringify({ categories: ['2026-01-01'], series: [] }),
      ranking_trend_json: JSON.stringify(ranking),
    });
    expect(extras.allocation).toBeNull();
    expect(extras.scale).toBeNull();
    expect(extras.ranking).toHaveLength(400);
    expect(extras.ranking[0]?.rank).toBe(0);
    expect(extras.ranking[399]?.rank).toBe(799);
  });
});

describe('tsToDate', () => {
  it('converts eastmoney timestamps in China time', () => {
    expect(tsToDate(1357228800000)).toBe('2013-01-04');
    expect(tsToDate(0)).toBeNull();
  });
});
