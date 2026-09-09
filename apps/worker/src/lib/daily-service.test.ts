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

  test('parses title date summary and list sources', () => {
    const raw = `---
title: 测试日报
date: 2026-09-09
summary: 一行摘要
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
      summary: '一行摘要',
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
});

describe('daily filesystem reader', () => {
  test('lists newest first and loads detail markdown', async () => {
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
summary: new
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
      });

      const detail = await getDailyReport(root, '2026-09-09');
      expect(detail?.title).toBe('Newer');
      expect(detail?.markdown).toContain('| a | b |');
      expect(await getDailyReport(root, '2099-01-01')).toBeNull();
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
