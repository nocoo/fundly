import { describe, expect, test } from 'bun:test';
import {
  extractMacroStatTiles,
  isTableSection,
  parseChangeCell,
  parseSectionBody,
  peelDisclaimer,
  splitDailySections,
} from './daily-md';

const SAMPLE = `## 概述

跨资产读法。

> 示例占位，非实时行情。

## 全球宏观

| 标的 | 最新 | 涨跌 | 备注 |
|------|------|------|------|
| S&P 500 | 5,500 | -0.4% | 高位整理 |
| NASDAQ | 17,200 | -0.6% | 科技 |
| VIX | 16.0 | +0.8 | 点位 |
| US 10Y | 4.05% | -3 bp | 收益率 |
| DXY | 101.0 | -0.3% | 美元 |

短评。

## 贵金属

| 标的 | 最新 | 涨跌 | 备注 |
|------|------|------|------|
| Gold futures (GC) | 2,500 | +0.6% | 示意 |

## 要闻

1. **标题** 正文

仅供信息参考，不构成投资建议。
`;

describe('splitDailySections', () => {
  test('splits on H2 in order', () => {
    const sections = splitDailySections(SAMPLE);
    expect(sections.map((s) => s.title)).toEqual(['概述', '全球宏观', '贵金属', '要闻']);
    expect(sections[0]?.body).toContain('跨资产读法');
    expect(sections[1]?.body).toContain('S&P 500');
  });
});

describe('parseSectionBody', () => {
  test('extracts GFM table and surrounding prose', () => {
    const sections = splitDailySections(SAMPLE);
    const macro = sections.find((s) => s.title === '全球宏观');
    expect(macro).toBeTruthy();
    const parsed = parseSectionBody(macro?.body ?? '');
    expect(parsed.table?.headers).toEqual(['标的', '最新', '涨跌', '备注']);
    expect(parsed.table?.rows.length).toBe(5);
    expect(parsed.table?.rows[0]?.[0]).toBe('S&P 500');
    expect(parsed.after).toContain('短评');
  });

  test('preserves escaped pipes and trims rows to header width', () => {
    const body = `| A | B | C |
|---|---|---|
| risk-on \\| risk-off | keep | extra | dropped |
| only-one | two |`;
    const parsed = parseSectionBody(body);
    expect(parsed.table?.headers).toEqual(['A', 'B', 'C']);
    expect(parsed.table?.rows).toEqual([
      ['risk-on | risk-off', 'keep', 'extra'],
      ['only-one', 'two', ''],
    ]);
  });
});

describe('parseChangeCell', () => {
  test('parses percent bp points and flat', () => {
    expect(parseChangeCell('-0.4%')).toMatchObject({ kind: 'percent', value: -0.4 });
    expect(parseChangeCell('+0.6%')).toMatchObject({ kind: 'percent', value: 0.6 });
    expect(parseChangeCell('-3 bp')).toMatchObject({ kind: 'bp', value: -3 });
    expect(parseChangeCell('+0.8')).toMatchObject({ kind: 'points', value: 0.8 });
    expect(parseChangeCell('持平')).toMatchObject({ kind: 'text', tone: 'flat' });
    expect(parseChangeCell('—')).toMatchObject({ kind: 'text', tone: 'flat' });
  });
});

describe('isTableSection / extractMacroStatTiles', () => {
  test('recognizes table sections and pulls key stats', () => {
    expect(isTableSection('全球宏观')).toBe(true);
    expect(isTableSection('要闻')).toBe(false);
    const tiles = extractMacroStatTiles(splitDailySections(SAMPLE));
    expect(tiles.map((t) => t.label)).toEqual(['S&P 500', 'VIX', 'US 10Y', 'DXY']);
    expect(tiles[0]?.change).toContain('-0.4');
    expect(tiles[0]?.tone).toBe('down');
  });
});

describe('peelDisclaimer', () => {
  test('strips trailing disclaimer from last section', () => {
    const { sections, disclaimer } = peelDisclaimer(splitDailySections(SAMPLE));
    expect(disclaimer).toContain('仅供信息参考');
    const news = sections.find((s) => s.title === '要闻');
    expect(news?.body).not.toContain('仅供信息参考');
  });
});
