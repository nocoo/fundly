import { basename, join, resolve, sep } from 'node:path';

export const DAILY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface DailyFrontmatter {
  title?: string;
  date?: string;
  summary?: string;
  sources?: string[];
}

export interface DailyListItem {
  date: string;
  title: string;
  summary: string;
  path: string;
}

export interface DailyDetail {
  date: string;
  title: string;
  summary: string;
  markdown: string;
  sources?: string[];
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Lightweight YAML-ish frontmatter for title/date/summary/sources only. */
export function parseFrontmatter(raw: string): { meta: DailyFrontmatter; body: string } {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) return { meta: {}, body: raw };

  const yaml = match[1] ?? '';
  const body = (match[2] ?? '').replace(/^\r?\n/, '');
  const meta: DailyFrontmatter = {};
  const lines = yaml.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const kv = /^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) {
      i += 1;
      continue;
    }
    const key = kv[1] ?? '';
    const rest = (kv[2] ?? '').trim();
    if (key === 'sources') {
      if (rest === '' || rest === '[]') {
        const items: string[] = [];
        if (rest === '') {
          i += 1;
          while (i < lines.length) {
            const item = lines[i] ?? '';
            const bullet = /^\s*-\s+(.+)$/.exec(item);
            if (!bullet) break;
            items.push(unquote(bullet[1] ?? ''));
            i += 1;
          }
          meta.sources = items;
          continue;
        }
        meta.sources = [];
      } else if (rest.startsWith('[') && rest.endsWith(']')) {
        meta.sources = rest
          .slice(1, -1)
          .split(',')
          .map((s) => unquote(s.trim()))
          .filter(Boolean);
      }
      i += 1;
      continue;
    }
    if (key === 'title' || key === 'date' || key === 'summary') {
      meta[key] = unquote(rest);
    }
    i += 1;
  }
  return { meta, body };
}

function unquote(value: string): string {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

export function resolveDailyDir(repoRoot: string): string {
  return resolve(repoRoot, 'content', 'macro-daily');
}

/**
 * Resolve `content/macro-daily/<date>.md` under repoRoot.
 * Returns null when the path would escape the content directory.
 */
export function resolveDailyFile(repoRoot: string, date: string): string | null {
  if (!DAILY_DATE_RE.test(date)) return null;
  const dir = resolveDailyDir(repoRoot);
  const candidate = resolve(dir, `${date}.md`);
  const dirPrefix = dir.endsWith(sep) ? dir : `${dir}${sep}`;
  if (candidate !== dir && !candidate.startsWith(dirPrefix)) return null;
  if (basename(candidate) !== `${date}.md`) return null;
  return candidate;
}

async function listDirNames(dir: string): Promise<string[] | null> {
  try {
    const names: string[] = [];
    const glob = new Bun.Glob('*');
    for await (const name of glob.scan({ cwd: dir, onlyFiles: false, dot: false })) {
      if (name.includes('/') || name.includes('\\')) continue;
      names.push(name);
    }
    return names;
  } catch {
    return null;
  }
}

async function readTextFile(path: string): Promise<string | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  try {
    return await file.text();
  } catch {
    return null;
  }
}

export async function listDailyReports(repoRoot: string): Promise<DailyListItem[]> {
  const dir = resolveDailyDir(repoRoot);
  const names = await listDirNames(dir);
  if (!names) return [];

  const items: DailyListItem[] = [];
  for (const name of names) {
    if (!name.endsWith('.md')) continue;
    const date = name.slice(0, -3);
    if (!DAILY_DATE_RE.test(date)) continue;
    const filePath = resolveDailyFile(repoRoot, date);
    if (!filePath) continue;
    const raw = await readTextFile(filePath);
    if (raw === null) continue;
    try {
      const { meta } = parseFrontmatter(raw);
      const resolvedDate = meta.date && DAILY_DATE_RE.test(meta.date) ? meta.date : date;
      items.push({
        date: resolvedDate,
        title: meta.title?.trim() || `宏观日报 · ${resolvedDate}`,
        summary: meta.summary?.trim() || '',
        path: `content/macro-daily/${date}.md`,
      });
    } catch {
      // skip unreadable files
    }
  }

  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return items;
}

export async function getDailyReport(repoRoot: string, date: string): Promise<DailyDetail | null> {
  const filePath = resolveDailyFile(repoRoot, date);
  if (!filePath) return null;
  const raw = await readTextFile(filePath);
  if (raw === null) return null;
  const { meta, body } = parseFrontmatter(raw);
  const resolvedDate = meta.date && DAILY_DATE_RE.test(meta.date) ? meta.date : date;
  return {
    date: resolvedDate,
    title: meta.title?.trim() || `宏观日报 · ${resolvedDate}`,
    summary: meta.summary?.trim() || '',
    markdown: body,
    ...(meta.sources && meta.sources.length > 0 ? { sources: meta.sources } : {}),
  };
}

/** Test helper: absolute join under the daily content directory. */
export function dailyContentJoin(repoRoot: string, ...parts: string[]): string {
  return join(resolveDailyDir(repoRoot), ...parts);
}
