import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getDailyReport,
  listDailyReports,
  parseFrontmatter,
  resolveDailyFile,
} from './daily-service.ts';

describe('parseFrontmatter', () => {
  test('returns whole text as body when no frontmatter', () => {
    const { meta, body } = parseFrontmatter('# Hello\n\nworld');
    expect(meta).toEqual({});
    expect(body).toBe('# Hello\n\nworld');
  });

  test('parses title date weekday summary session methodology and list sources', () => {
    const raw = `---
title: 测试日报
date: 2026-09-09
weekday: 周三
summary: 一行摘要
session: 美东上一交易日收盘；Asia/Shanghai 生成
methodology: 美股以 Yahoo 收盘为主；A 股来自本地 SQLite。
sources:
  - Alpha
  - Beta
---

# Body

table time
`;
    const { meta, body } = parseFrontmatter(raw);
    expect(meta).toEqual({
      title: '测试日报',
      date: '2026-09-09',
      weekday: '周三',
      summary: '一行摘要',
      session: '美东上一交易日收盘；Asia/Shanghai 生成',
      methodology: '美股以 Yahoo 收盘为主；A 股来自本地 SQLite。',
      sources: ['Alpha', 'Beta'],
    });
    expect(body.startsWith('# Body')).toBe(true);
  });

  test('parses inline sources array', () => {
    const { meta } = parseFrontmatter(`---
title: T
sources: [A, "B"]
---
x
`);
    expect(meta.sources).toEqual(['A', 'B']);
  });

  test('keeps commas inside quoted sources items', () => {
    const { meta } = parseFrontmatter(`---
title: T
sources: ["Federal Reserve, Board", FRED]
---
x
`);
    expect(meta.sources).toEqual(['Federal Reserve, Board', 'FRED']);
  });
});

describe('daily filesystem reader', () => {
  test('lists newest first and loads detail markdown with optional fields', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fundly-daily-'));
    try {
      const dir = join(root, 'content', 'macro-daily');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, '2026-09-08.md'),
        `---
title: Older
date: 2026-09-08
summary: old
---
old body
`,
      );
      writeFileSync(
        join(dir, '2026-09-09.md'),
        `---
title: Newer
date: 2026-09-09
weekday: 周三
summary: new
session: US cash close
methodology: Yahoo close primary
sources: [Yahoo Finance, FRED]
---
| a | b |
| - | - |
| 1 | 2 |
`,
      );
      writeFileSync(join(dir, 'notes.txt'), 'ignore');
      writeFileSync(join(dir, 'bad-name.md'), 'ignore');

      const list = await listDailyReports(root);
      expect(list.map((x) => x.date)).toEqual(['2026-09-09', '2026-09-08']);
      expect(list[0]).toMatchObject({
        title: 'Newer',
        summary: 'new',
        path: 'content/macro-daily/2026-09-09.md',
        weekday: '周三',
        session: 'US cash close',
        methodology: 'Yahoo close primary',
        sources: ['Yahoo Finance', 'FRED'],
      });
      expect(list[1]?.weekday).toBeUndefined();
      expect(list[1]?.sources).toBeUndefined();
      expect(list[1]?.methodology).toBeUndefined();

      const detail = await getDailyReport(root, '2026-09-09');
      expect(detail?.title).toBe('Newer');
      expect(detail?.weekday).toBe('周三');
      expect(detail?.session).toBe('US cash close');
      expect(detail?.methodology).toBe('Yahoo close primary');
      expect(detail?.sources).toEqual(['Yahoo Finance', 'FRED']);
      expect(detail?.markdown).toContain('| a | b |');
      expect(await getDailyReport(root, '2099-01-01')).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('lists and loads by filename date when frontmatter date differs', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fundly-daily-fm-mismatch-'));
    try {
      const dir = join(root, 'content', 'macro-daily');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, '2026-09-09.md'),
        `---
title: Mismatched FM date
date: 2026-09-08
summary: filename wins for route key
---
body for 2026-09-09 file
`,
      );

      const list = await listDailyReports(root);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        date: '2026-09-09',
        title: 'Mismatched FM date',
        path: 'content/macro-daily/2026-09-09.md',
      });

      const byFilename = await getDailyReport(root, '2026-09-09');
      expect(byFilename).toMatchObject({
        date: '2026-09-09',
        title: 'Mismatched FM date',
      });
      expect(byFilename?.markdown).toContain('body for 2026-09-09 file');

      // Frontmatter date must not become a route key — that file does not exist.
      expect(await getDailyReport(root, '2026-09-08')).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('resolveDailyFile rejects traversal and invalid dates', () => {
    const root = mkdtempSync(join(tmpdir(), 'fundly-daily-safe-'));
    try {
      mkdirSync(join(root, 'content', 'macro-daily'), { recursive: true });
      expect(resolveDailyFile(root, '../etc/passwd')).toBeNull();
      expect(resolveDailyFile(root, '2026-09-09/../../secret')).toBeNull();
      expect(resolveDailyFile(root, 'not-a-date')).toBeNull();
      const ok = resolveDailyFile(root, '2026-09-09');
      expect(ok?.endsWith(`${join('content', 'macro-daily', '2026-09-09.md')}`)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
