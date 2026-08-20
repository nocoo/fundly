import { describe, expect, it } from 'bun:test';
import {
  hasFundExtras,
  rankingChart,
  scaleChart,
  scoreChart,
  seriesChartFromCategories,
} from './fund-extra-vm';

describe('fund extra view models', () => {
  it('maps category series onto chart points', () => {
    const chart = seriesChartFromCategories(
      ['2025-09-30', '2026-06-30'],
      [
        { name: '股票占净比', values: [87.82, 86.78] },
        { name: '债券占净比', values: [4.88, 4.42] },
      ],
    );
    expect(chart.points[1]).toEqual({
      name: '2026-06-30',
      股票占净比: 86.78,
      债券占净比: 4.42,
    });
    expect(chart.series.map((s) => s.key)).toEqual(['股票占净比', '债券占净比']);
  });

  it('maps scale, ranking, and scores', () => {
    expect(
      scaleChart({
        points: [{ date: '2026-06-30', value: 49.59, mom: '33.44%' }],
        latest: { date: '2026-06-30', value: 49.59 },
      }).points[0],
    ).toEqual({ name: '2026-06-30', scale: 49.59 });
    expect(rankingChart([{ date: '2013-01-04', rank: 82, peers: 163 }]).points[0]).toEqual({
      name: '2013-01-04',
      rank: 82,
    });
    expect(scoreChart({ avr: 83.5, items: [{ name: '选证能力', value: 80 }] }).points[0]).toEqual({
      name: '选证能力',
      score: 80,
    });
  });

  it('detects whether any extra block has data', () => {
    expect(hasFundExtras(null)).toBe(false);
    expect(
      hasFundExtras({
        allocation: null,
        scale: null,
        holders: null,
        ranking: [],
        scores: null,
      }),
    ).toBe(false);
    expect(
      hasFundExtras({
        allocation: null,
        scale: { points: [], latest: { date: '2026-06-30', value: 1 } },
        holders: null,
        ranking: [],
        scores: null,
      }),
    ).toBe(true);
  });
});
