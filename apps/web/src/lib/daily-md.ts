/** Client-side helpers: split daily markdown into H2 sections and parse GFM tables. */

export interface DailySection {
  /** Heading text without leading ## ; empty for preamble before first H2. */
  title: string;
  /** Raw markdown body under this heading (may include tables + prose). */
  body: string;
}

export interface GfmTable {
  headers: string[];
  rows: string[][];
}

export interface ParsedSectionBody {
  /** Leading prose before the first table (markdown). */
  before: string;
  table: GfmTable | null;
  /** Trailing prose after the table (markdown). */
  after: string;
}

const H2_SPLIT_RE = /^##\s+(.+?)\s*$/gm;

/** Split markdown on H2 headings. Preamble (no title) is kept if non-empty. */
export function splitDailySections(markdown: string): DailySection[] {
  const text = markdown.replace(/^\uFEFF/, '');
  const sections: DailySection[] = [];
  let lastIndex = 0;
  let lastTitle = '';
  const re = new RegExp(H2_SPLIT_RE.source, 'gm');
  for (let match = re.exec(text); match !== null; match = re.exec(text)) {
    const chunk = text.slice(lastIndex, match.index).trim();
    if (lastTitle || chunk) {
      sections.push({ title: lastTitle, body: chunk });
    }
    lastTitle = (match[1] ?? '').trim();
    lastIndex = re.lastIndex;
  }
  const tail = text.slice(lastIndex).trim();
  if (lastTitle || tail) {
    sections.push({ title: lastTitle, body: tail });
  }
  return sections;
}

function splitCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function isSeparatorRow(line: string): boolean {
  const cells = splitCells(line);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{3,}:?$/.test(c));
}

/** Extract the first GFM table from a section body; leave surrounding prose. */
export function parseSectionBody(body: string): ParsedSectionBody {
  const lines = body.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const next = lines[i + 1] ?? '';
    if (line.includes('|') && next && isSeparatorRow(next)) {
      const tableStart = i;
      const headers = splitCells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length) {
        const rowLine = lines[i] ?? '';
        if (!rowLine.includes('|') || isSeparatorRow(rowLine)) break;
        if (rowLine.trim() === '') break;
        const cells = splitCells(rowLine);
        // pad / trim to header width
        const row = headers.map((_, idx) => cells[idx] ?? '');
        rows.push(row);
        i += 1;
      }
      const before = lines.slice(0, tableStart).join('\n').trim();
      const after = lines.slice(i).join('\n').trim();
      return { before, table: { headers, rows }, after };
    }
    i += 1;
  }
  return { before: body.trim(), table: null, after: '' };
}

/** Sections that should prefer Basalt table rendering when a GFM table is present. */
export const TABLE_SECTION_TITLES = new Set(['全球宏观', '贵金属', '科技龙头观察', '中国相关资产']);

export function isTableSection(title: string): boolean {
  const bare = title.replace(/^[^\w\u4e00-\u9fff]+/, '').trim();
  return TABLE_SECTION_TITLES.has(title) || TABLE_SECTION_TITLES.has(bare);
}

export type ChangeParse =
  | { kind: 'percent'; value: number; display: string }
  | { kind: 'bp'; value: number; display: string }
  | { kind: 'points'; value: number; display: string }
  | { kind: 'text'; display: string; tone: 'up' | 'down' | 'flat' };

/**
 * Parse a 涨跌 cell into a signed numeric tone when possible.
 * Handles: -0.4%, +0.8%, -3 bp, +0.8, 持平, —, 0.0%
 */
export function parseChangeCell(raw: string): ChangeParse {
  const s = raw.replace(/[🟢🔴]/gu, '').trim();
  if (!s || s === '—' || s === '-' || s === '–' || s === '持平' || s === '平') {
    return { kind: 'text', display: s || '—', tone: 'flat' };
  }

  const bp = /^([+-]?\d+(?:\.\d+)?)\s*bp$/i.exec(s);
  if (bp) {
    const value = Number(bp[1]);
    if (Number.isFinite(value)) {
      const sign = value > 0 ? '+' : '';
      return { kind: 'bp', value, display: `${sign}${value} bp` };
    }
  }

  const pct = /^([+-]?\d+(?:\.\d+)?)\s*%$/.exec(s);
  if (pct) {
    const value = Number(pct[1]);
    if (Number.isFinite(value)) {
      return {
        kind: 'percent',
        value,
        display: s.startsWith('+') || s.startsWith('-') ? s : value > 0 ? `+${s}` : s,
      };
    }
  }

  const plain = /^([+-]\d+(?:\.\d+)?)$/.exec(s);
  if (plain) {
    const value = Number(plain[1]);
    if (Number.isFinite(value)) {
      return { kind: 'points', value, display: s };
    }
  }

  const lower = s.toLowerCase();
  if (/涨|升|强|up/.test(lower)) return { kind: 'text', display: s, tone: 'up' };
  if (/跌|降|弱|down/.test(lower)) return { kind: 'text', display: s, tone: 'down' };
  return { kind: 'text', display: s, tone: 'flat' };
}

export function changeTone(parsed: ChangeParse): 'up' | 'down' | 'flat' {
  if (parsed.kind === 'text') return parsed.tone;
  if (parsed.value > 0) return 'up';
  if (parsed.value < 0) return 'down';
  return 'flat';
}

export interface MacroStatTile {
  label: string;
  change: string;
  tone: 'up' | 'down' | 'flat';
  latest?: string;
}

const STAT_ALIASES: Array<{ label: string; match: RegExp }> = [
  { label: 'S&P 500', match: /s\s*&\s*p\s*500|标普/i },
  { label: 'VIX', match: /\bvix\b/i },
  { label: 'US 10Y', match: /us\s*10y|10y|美债|10\s*年/i },
  { label: 'DXY', match: /\bdxy\b|美元指数|美元/i },
  { label: 'Gold', match: /gold|黄金|gc\b|gld/i },
];

/**
 * Lightly pull 3–4 key 涨跌 from the 全球宏观 (or 贵金属) table for StatTiles.
 * Returns [] if the table shape is unexpected.
 */
export function extractMacroStatTiles(sections: DailySection[], limit = 4): MacroStatTile[] {
  const macro = sections.find((s) => isTableSection(s.title) && /全球宏观/.test(s.title));
  const gold = sections.find((s) => isTableSection(s.title) && /贵金属|黄金/.test(s.title));
  const candidates: MacroStatTile[] = [];

  for (const section of [macro, gold]) {
    if (!section) continue;
    const { table } = parseSectionBody(section.body);
    if (!table || table.headers.length < 3) continue;
    const changeIdx = table.headers.findIndex((h) => /涨跌|变动|日变动/.test(h));
    const nameIdx = table.headers.findIndex((h) => /标的|名称|ticker/i.test(h));
    const latestIdx = table.headers.findIndex((h) => /最新|水平|价格|收盘/.test(h));
    if (changeIdx < 0 || nameIdx < 0) continue;

    for (const row of table.rows) {
      const name = row[nameIdx] ?? '';
      const changeRaw = row[changeIdx] ?? '';
      const parsed = parseChangeCell(changeRaw);
      for (const alias of STAT_ALIASES) {
        if (!alias.match.test(name)) continue;
        if (candidates.some((c) => c.label === alias.label)) break;
        candidates.push({
          label: alias.label,
          change: parsed.display,
          tone: changeTone(parsed),
          latest: latestIdx >= 0 ? row[latestIdx] : undefined,
        });
        break;
      }
    }
  }

  // Prefer S&P, VIX, US10Y, DXY order; fill with gold if needed
  const order = ['S&P 500', 'VIX', 'US 10Y', 'DXY', 'Gold'];
  const ordered: MacroStatTile[] = [];
  for (const label of order) {
    const hit = candidates.find((c) => c.label === label);
    if (hit) ordered.push(hit);
    if (ordered.length >= limit) break;
  }
  return ordered;
}

const DISCLAIMER_LINE_RE = /仅供信息参考[，,]\s*不构成投资建议。?\s*$/;

/** True when body is only the disclaimer footer line (no H2). */
export function isDisclaimerOnly(section: DailySection): boolean {
  if (section.title) return false;
  const t = section.body.replace(/\s+/g, '');
  return t.includes('仅供信息参考') && t.includes('不构成投资建议');
}

/**
 * Peel a trailing disclaimer line from the last content section.
 * Returns cleaned sections + disclaimer text (or null).
 */
export function peelDisclaimer(sections: DailySection[]): {
  sections: DailySection[];
  disclaimer: string | null;
} {
  if (sections.length === 0) return { sections, disclaimer: null };

  const standalone = sections.findIndex(isDisclaimerOnly);
  if (standalone >= 0) {
    const disc = sections[standalone]?.body.trim() ?? null;
    return {
      sections: sections.filter((_, i) => i !== standalone),
      disclaimer: disc,
    };
  }

  const last = sections[sections.length - 1];
  if (!last) return { sections, disclaimer: null };
  const lines = last.body.split(/\r?\n/);
  // Walk trailing blank lines then check last non-empty line
  let end = lines.length - 1;
  while (end >= 0 && (lines[end] ?? '').trim() === '') end -= 1;
  if (end < 0) return { sections, disclaimer: null };
  const lastLine = (lines[end] ?? '').trim();
  if (!DISCLAIMER_LINE_RE.test(lastLine)) return { sections, disclaimer: null };

  const cleanedBody = lines.slice(0, end).join('\n').replace(/\s+$/, '');
  const next = sections.slice(0, -1);
  if (cleanedBody.trim() || last.title) {
    next.push({ title: last.title, body: cleanedBody });
  }
  return { sections: next, disclaimer: lastLine };
}
