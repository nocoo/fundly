import { parseShareClass } from '../analytics/share-class';

export type SearchSignals = {
  raw: string;
  normalized: string;
  core: string;
  tokens: string[];
  hasEtf: boolean;
  hasLof: boolean;
  hasLink: boolean;
  shareLetter: string;
};

export type SearchCandidate = {
  fundCode: string;
  fundName: string;
  pinyinAbbr: string | null;
  pinyinFull: string | null;
  shareLetter: string;
};

export function parseSearchQuery(raw: string): SearchSignals {
  const normalized = raw
    .trim()
    .toUpperCase()
    .replace(/[（(]/g, '(')
    .replace(/[）)]/g, ')')
    .replace(/[·•]/g, '')
    .replace(/\s+/g, '');
  const hasEtf = normalized.includes('ETF');
  const hasLof = normalized.includes('LOF');
  const hasLink = normalized.includes('联接') || normalized.includes('聯接');
  const parsedShare = parseShareClass(raw).letter;
  const shareLetter = parsedShare || (/^[A-I]$/.test(normalized) ? normalized : '');
  const core = normalized
    .replace(/基金/g, '')
    .replace(/ETF联接/g, '')
    .replace(/ETF聯接/g, '')
    .replace(/联接[A-Z]?/g, '')
    .replace(/聯接[A-Z]?/g, '')
    .replace(/ETF/g, '')
    .replace(/LOF/g, '')
    .replace(/[A-Z](?:类)?$/g, '');
  const tokens = (core.match(/[\u4e00-\u9fa5]{2,}|[A-Z]{2,}|\d{2,}/g) ?? []).filter(Boolean);
  return { raw, normalized, core, tokens, hasEtf, hasLof, hasLink, shareLetter };
}

function hay(candidate: SearchCandidate): string {
  return `${candidate.fundCode}${candidate.fundName}${candidate.pinyinAbbr ?? ''}${candidate.pinyinFull ?? ''}`.toUpperCase();
}

export function searchRecalls(query: SearchSignals, candidate: SearchCandidate): boolean {
  if (/^\d{6}$/.test(query.normalized)) return candidate.fundCode === query.normalized;
  if (query.tokens.length > 0) {
    const text = hay(candidate);
    return query.tokens.every((token) => text.includes(token.toUpperCase()));
  }
  if (query.hasEtf || query.hasLof || query.hasLink) {
    const name = candidate.fundName.toUpperCase();
    if (query.hasEtf && !name.includes('ETF')) return false;
    if (query.hasLof && !name.includes('LOF')) return false;
    if (query.hasLink && !name.includes('联接') && !name.includes('聯接')) return false;
    return true;
  }
  if (query.shareLetter) {
    return parseShareClass(candidate.fundName).letter === query.shareLetter;
  }
  return false;
}

export function searchQueryKind(
  query: SearchSignals,
): 'empty' | 'code' | 'tokens' | 'signal' | 'share' {
  if (/^\d{6}$/.test(query.normalized)) return 'code';
  if (query.tokens.length > 0) return 'tokens';
  if (query.hasEtf || query.hasLof || query.hasLink) return 'signal';
  if (query.shareLetter) return 'share';
  return 'empty';
}

export function searchScore(query: SearchSignals, candidate: SearchCandidate): number {
  if (!searchRecalls(query, candidate)) return Number.POSITIVE_INFINITY;
  const code = candidate.fundCode.toUpperCase();
  const name = candidate.fundName.toUpperCase();
  const abbr = (candidate.pinyinAbbr ?? '').toUpperCase();
  const full = (candidate.pinyinFull ?? '').toUpperCase();
  let score = 6;
  if (code === query.normalized) score = 0;
  else if (code.startsWith(query.normalized)) score = 1;
  else if (
    abbr === query.normalized ||
    full === query.normalized ||
    abbr.startsWith(query.normalized)
  )
    score = 2;
  else if (query.core && name.includes(query.core)) score = 3;
  else if (query.tokens.length > 0) score = 4;
  if (score > 0) {
    const candEtf = name.includes('ETF');
    const candLof = name.includes('LOF');
    const candLink = name.includes('联接') || name.includes('聯接');
    if (query.hasEtf !== candEtf) score += 4;
    if (query.hasLof !== candLof) score += 4;
    if (query.hasLink !== candLink) score += 4;
    if (query.shareLetter) {
      const letter = candidate.shareLetter || parseShareClass(candidate.fundName).letter;
      if (letter === query.shareLetter) score -= 1;
      else if (letter) score += 3;
    }
  }
  return score;
}
