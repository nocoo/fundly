import { describe, expect, test } from 'bun:test';
import {
  bareSectionTitle,
  changeTone,
  extractMacroStatTiles,
  findSectionByBareTitle,
  formatSectionTitle,
  isNewsPairSection,
  isTableSection,
  parseChangeCell,
  parseSectionBody,
  partitionDailyReportSections,
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
  test('parses percent bp points and flat (ASCII)', () => {
    expect(parseChangeCell('-0.4%')).toMatchObject({ kind: 'percent', value: -0.4 });
    expect(parseChangeCell('+0.6%')).toMatchObject({ kind: 'percent', value: 0.6 });
    expect(parseChangeCell('-3 bp')).toMatchObject({ kind: 'bp', value: -3 });
    expect(parseChangeCell('+0.8')).toMatchObject({ kind: 'points', value: 0.8 });
    expect(parseChangeCell('持平')).toMatchObject({ kind: 'text', tone: 'flat' });
    expect(parseChangeCell('—')).toMatchObject({ kind: 'text', tone: 'flat' });
    expect(parseChangeCell('–')).toMatchObject({ kind: 'text', tone: 'flat' });
    expect(parseChangeCell('-')).toMatchObject({ kind: 'text', tone: 'flat' });
  });

  test('normalizes Unicode minus and parses live MD cells', () => {
    // U+2212 MINUS SIGN as in content/macro-daily/2026-09-09.md
    const unicodeDown = parseChangeCell('−0.58%');
    expect(unicodeDown).toMatchObject({ kind: 'percent', value: -0.58 });
    expect(changeTone(unicodeDown)).toBe('down');

    const points = parseChangeCell('+0.42 点');
    expect(points).toMatchObject({ kind: 'points', value: 0.42 });
    expect(changeTone(points)).toBe('up');

    const pointsTight = parseChangeCell('−0.5点');
    expect(pointsTight).toMatchObject({ kind: 'points', value: -0.5 });
    expect(changeTone(pointsTight)).toBe('down');

    const approx = parseChangeCell('≈0.00%');
    expect(approx).toMatchObject({ kind: 'text', tone: 'flat' });
    expect(parseChangeCell('≈0%')).toMatchObject({ kind: 'text', tone: 'flat' });
    expect(parseChangeCell('≈0.0')).toMatchObject({ kind: 'text', tone: 'flat' });
  });

  test('strips tone emoji before parse', () => {
    expect(parseChangeCell('🟢+0.6%')).toMatchObject({ kind: 'percent', value: 0.6 });
    expect(parseChangeCell('🔴−0.4%')).toMatchObject({ kind: 'percent', value: -0.4 });
  });
});

describe('formatSectionTitle / isTableSection', () => {
  test('adds tasteful emoji without doubling', () => {
    expect(formatSectionTitle('概述')).toBe('📌 概述');
    expect(formatSectionTitle('全球宏观')).toBe('🌐 全球宏观');
    expect(formatSectionTitle('贵金属')).toBe('🥇 贵金属');
    expect(formatSectionTitle('科技龙头')).toBe('💻 科技龙头');
    expect(formatSectionTitle('科技龙头观察')).toBe('💻 科技龙头观察');
    expect(formatSectionTitle('中国资产')).toBe('🇨🇳 中国资产');
    expect(formatSectionTitle('中国相关资产')).toBe('🇨🇳 中国相关资产');
    expect(formatSectionTitle('好消息')).toBe('✅ 好消息');
    expect(formatSectionTitle('坏消息')).toBe('⚠️ 坏消息');
    expect(formatSectionTitle('要闻')).toBe('📰 要闻');
    expect(formatSectionTitle('观察要点')).toBe('🔭 观察要点');
    // Already-prefixed MD still strips leading emoji then re-applies once.
    expect(formatSectionTitle('🌐 全球宏观')).toBe('🌐 全球宏观');
    expect(formatSectionTitle('📌概述')).toBe('📌 概述');
  });

  test('isTableSection matches bare and emoji-prefixed titles (new + legacy)', () => {
    expect(isTableSection('全球宏观')).toBe(true);
    expect(isTableSection('🌐 全球宏观')).toBe(true);
    expect(isTableSection('🥇贵金属')).toBe(true);
    expect(isTableSection('科技龙头')).toBe(true);
    expect(isTableSection('科技龙头观察')).toBe(true);
    expect(isTableSection('中国资产')).toBe(true);
    expect(isTableSection('中国相关资产')).toBe(true);
    expect(isTableSection('🇨🇳 中国资产')).toBe(true);
    expect(isTableSection('要闻')).toBe(false);
    expect(isTableSection('📰 要闻')).toBe(false);
    expect(isTableSection('好消息')).toBe(false);
    expect(isTableSection('坏消息')).toBe(false);
  });

  test('bareSectionTitle strips emoji prefix for 中国资产', () => {
    expect(bareSectionTitle('🇨🇳 中国资产')).toBe('中国资产');
    expect(bareSectionTitle('中国资产')).toBe('中国资产');
  });

  test('isNewsPairSection matches 好消息 / 坏消息 bare and prefixed', () => {
    expect(isNewsPairSection('好消息')).toBe(true);
    expect(isNewsPairSection('坏消息')).toBe(true);
    expect(isNewsPairSection('✅ 好消息')).toBe(true);
    expect(isNewsPairSection('⚠️ 坏消息')).toBe(true);
    expect(isNewsPairSection('要闻')).toBe(false);
    expect(isNewsPairSection('概述')).toBe(false);
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

  test('maps DXY and US 10Y to exact instruments, not CNY or 2Y decoys', () => {
    const md = `## 全球宏观

| 标的 | 最新 | 涨跌 | 备注 |
|------|------|------|------|
| 美元兑人民币 | 7.20 | +0.1% | FX |
| 美元指数 | 101.0 | -0.3% | DXY |
| 美债 2Y | 4.80% | +1 bp | short |
| 美债 10Y | 4.05% | -3 bp | belly |
`;
    const tiles = extractMacroStatTiles(splitDailySections(md));
    const byLabel = Object.fromEntries(tiles.map((t) => [t.label, t]));
    expect(byLabel.DXY?.latest).toBe('101.0');
    expect(byLabel.DXY?.change).toContain('-0.3');
    expect(byLabel['US 10Y']?.latest).toBe('4.05%');
    expect(byLabel['US 10Y']?.change).toContain('-3');
    // Decoys must not win via broad aliases + duplicate suppression.
    expect(tiles.some((t) => t.latest === '7.20' || t.latest === '4.80%')).toBe(false);
  });

  test('also accepts US 10Y latin label among decoys', () => {
    const md = `## 全球宏观

| 标的 | 最新 | 涨跌 |
|------|------|------|
| 美元兑人民币 | 7.20 | +0.1% |
| 美元指数 | 101.0 | -0.3% |
| 美债 2Y | 4.80% | +1 bp |
| US 10Y | 4.05% | -3 bp |
`;
    const tiles = extractMacroStatTiles(splitDailySections(md));
    expect(tiles.find((t) => t.label === 'US 10Y')?.latest).toBe('4.05%');
    expect(tiles.find((t) => t.label === 'DXY')?.latest).toBe('101.0');
  });

  test('extracts tiles from live-style Unicode change cells', () => {
    const md = `## 🌐 全球宏观

| 标的 | 最新 | 涨跌 | 备注 |
|------|------|------|------|
| S&P 500 | 7,673.52 | −0.58% | Yahoo |
| VIX | 15.72 | +0.42 点 | Cboe |
| 美债 10Y | 4.806% | +2.2 bp | Yahoo |
| 美元指数 | 98.84 | −0.32% | Yahoo |
| USD/CNY | 6.7105 | ≈0.00% | ECB |
`;
    const tiles = extractMacroStatTiles(splitDailySections(md));
    expect(tiles.map((t) => t.label)).toEqual(['S&P 500', 'VIX', 'US 10Y', 'DXY']);
    expect(tiles[0]?.tone).toBe('down');
    expect(tiles[0]?.change).toContain('-0.58');
    expect(tiles[1]?.tone).toBe('up');
    expect(tiles[1]?.change).toContain('0.42');
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

describe('partitionDailyReportSections / findSectionByBareTitle', () => {
  test('pulls lead prose and keeps tables in rest order', () => {
    const md = `## 概述

Thesis.

## 全球宏观

| 标的 | 最新 | 涨跌 |
|------|------|------|
| S&P 500 | 1 | -0.1% |

## 观察要点

- next

## 好消息

- up

## 坏消息

- down

## 贵金属

| 标的 | 最新 | 涨跌 |
|------|------|------|
| Gold | 2 | +0.2% |
`;
    const parts = partitionDailyReportSections(splitDailySections(md));
    expect(parts.overview?.body).toContain('Thesis');
    expect(parts.observations?.body).toContain('next');
    expect(parts.goodNews?.body).toContain('up');
    expect(parts.badNews?.body).toContain('down');
    expect(parts.rest.map((s) => s.title)).toEqual(['全球宏观', '贵金属']);
  });

  test('matches emoji-prefixed titles and omits missing lead cells', () => {
    const md = `## 📌 概述

Only overview.

## 🌐 全球宏观

| 标的 | 最新 | 涨跌 |
|------|------|------|
| VIX | 16 | +1 |
`;
    const sections = splitDailySections(md);
    expect(findSectionByBareTitle(sections, '概述')?.body).toContain('Only overview');
    const parts = partitionDailyReportSections(sections);
    expect(parts.overview).toBeTruthy();
    expect(parts.observations).toBeUndefined();
    expect(parts.goodNews).toBeUndefined();
    expect(parts.badNews).toBeUndefined();
    expect(parts.rest.map((s) => bareSectionTitle(s.title))).toEqual(['全球宏观']);
  });
});
