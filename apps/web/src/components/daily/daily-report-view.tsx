import { Button, LayerCard } from '@nocoo/basalt';
import { Popover, PopoverContent, PopoverTrigger } from '@nocoo/basalt/components/popover';
import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { PanelHeading, StatTile } from '@/components/layout/research-layout';
import { useQuoteColor } from '@/hooks/use-quote-color';
import {
  type DailySection,
  extractMacroStatTiles,
  extractSectionNote,
  formatSectionTitle,
  isTableSection,
  parseSectionBody,
  partitionDailyReportSections,
  peelDisclaimer,
  splitDailySections,
} from '@/lib/daily-md';
import { dailyStatInfo } from '@/lib/daily-stat-info';
import { quoteToneClass } from '@/lib/quote-color';
import { cn } from '@/lib/utils';
import { DailyQuoteTable } from './daily-quote-table';
import { MarkdownBody } from './markdown-body';

/** Circled Info popover for section methodology / 口径 notes (same pattern as StatInfoAction). */
function SectionNoteAction({ note, label }: { note: string; label: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0 text-basalt-muted-foreground hover:text-basalt-foreground"
          aria-label={`${label} 说明`}
        >
          <Info className="h-3 w-3" strokeWidth={1.5} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        className="w-72 max-w-[min(18rem,90vw)] text-left text-xs leading-relaxed"
      >
        {note}
      </PopoverContent>
    </Popover>
  );
}

function ProseSectionCard({
  section,
  fallbackTitle,
}: {
  section: DailySection;
  fallbackTitle: string;
}) {
  const rawTitle = section.title || fallbackTitle;
  const title = section.title ? formatSectionTitle(section.title) : rawTitle;
  const { note, body } = extractSectionNote(section.body);
  return (
    <LayerCard padding="none" className="daily-section-card">
      <PanelHeading
        title={title}
        action={
          note ? <SectionNoteAction note={note} label={rawTitle || fallbackTitle} /> : undefined
        }
      />
      <LayerCard.Body className="daily-section-body">
        <MarkdownBody markdown={body} />
      </LayerCard.Body>
    </LayerCard>
  );
}

function TableSectionCard({ section }: { section: DailySection }) {
  const { note, body: cleaned } = extractSectionNote(section.body);
  const parsed = parseSectionBody(cleaned);
  const heading = formatSectionTitle(section.title || '行情');
  const label = section.title || '行情';
  return (
    <LayerCard padding="none" className="daily-section-card">
      <PanelHeading
        title={heading}
        action={note ? <SectionNoteAction note={note} label={label} /> : undefined}
      />
      <LayerCard.Body className="daily-section-body">
        {parsed.before ? <MarkdownBody markdown={parsed.before} className="mb-3" /> : null}
        {parsed.table ? <DailyQuoteTable table={parsed.table} /> : null}
        {parsed.after ? <MarkdownBody markdown={parsed.after} className="mt-3" /> : null}
      </LayerCard.Body>
    </LayerCard>
  );
}

/** One prose row: pair side-by-side when both exist; full-width single card otherwise. */
function ProsePairRow({
  left,
  right,
  leftFallback,
  rightFallback,
}: {
  left: DailySection | undefined;
  right: DailySection | undefined;
  leftFallback: string;
  rightFallback: string;
}) {
  if (!left && !right) return null;
  if (left && right) {
    return (
      <div className="daily-prose-row">
        <ProseSectionCard section={left} fallbackTitle={leftFallback} />
        <ProseSectionCard section={right} fallbackTitle={rightFallback} />
      </div>
    );
  }
  const only = left ?? right;
  if (!only) return null;
  return <ProseSectionCard section={only} fallbackTitle={left ? leftFallback : rightFallback} />;
}

function StatInfoAction({ label }: { label: string }) {
  const text = dailyStatInfo(label);
  if (!text) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0 text-basalt-muted-foreground hover:text-basalt-foreground"
          aria-label={`${label} 说明`}
        >
          <Info className="h-3 w-3" strokeWidth={1.5} />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-64 text-left text-xs leading-relaxed">
        {text}
      </PopoverContent>
    </Popover>
  );
}

export function DailyReportView({ markdown }: { markdown: string }) {
  const rawSections = splitDailySections(markdown);
  const { color: quoteColor } = useQuoteColor();
  const tiles = extractMacroStatTiles(rawSections);
  const { sections: main, disclaimer } = peelDisclaimer(rawSections);
  const { overview, observations, goodNews, badNews, rest } = partitionDailyReportSections(main);

  const restNodes: ReactNode[] = [];
  for (let idx = 0; idx < rest.length; idx += 1) {
    const section = rest[idx];
    if (!section) continue;
    if (!section.title && !section.body.trim()) continue;

    if (isTableSection(section.title)) {
      restNodes.push(<TableSectionCard key={`t-${section.title}-${idx}`} section={section} />);
      continue;
    }

    restNodes.push(
      <ProseSectionCard
        key={`p-${section.title || 'body'}-${idx}`}
        section={section}
        fallbackTitle={idx === 0 ? '正文' : '附注'}
      />,
    );
  }

  const hasLead = overview != null || observations != null || goodNews != null || badNews != null;

  return (
    <div className="daily-report">
      {hasLead ? (
        <div className="daily-prose-grid">
          <ProsePairRow
            left={overview}
            right={observations}
            leftFallback="概述"
            rightFallback="观察要点"
          />
          <ProsePairRow
            left={goodNews}
            right={badNews}
            leftFallback="好消息"
            rightFallback="坏消息"
          />
        </div>
      ) : null}

      {tiles.length > 0 ? (
        <div className="research-stats daily-stat-strip">
          {tiles.map((tile) => (
            <StatTile
              key={tile.label}
              label={tile.label}
              value={
                <span
                  className={cn(
                    'font-mono font-semibold tabular-nums',
                    quoteToneClass(tile.tone, quoteColor),
                  )}
                >
                  {tile.change}
                </span>
              }
              hint={tile.latest ? `最新 ${tile.latest}` : undefined}
              action={<StatInfoAction label={tile.label} />}
            />
          ))}
        </div>
      ) : null}

      {restNodes}

      <p className="daily-disclaimer">{disclaimer ?? '仅供信息参考，不构成投资建议。'}</p>
    </div>
  );
}
