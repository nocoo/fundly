import { LayerCard } from '@nocoo/basalt';
import type { ReactNode } from 'react';
import { PanelHeading, StatTile } from '@/components/layout/research-layout';
import { useQuoteColor } from '@/hooks/use-quote-color';
import {
  bareSectionTitle,
  type DailySection,
  extractMacroStatTiles,
  formatSectionTitle,
  isNewsPairSection,
  isTableSection,
  parseSectionBody,
  peelDisclaimer,
  splitDailySections,
} from '@/lib/daily-md';
import { quoteToneClass } from '@/lib/quote-color';
import { cn } from '@/lib/utils';
import { DailyQuoteTable } from './daily-quote-table';
import { MarkdownBody } from './markdown-body';

function ProseSectionCard({
  section,
  fallbackTitle,
}: {
  section: DailySection;
  fallbackTitle: string;
}) {
  const rawTitle = section.title || fallbackTitle;
  const title = section.title ? formatSectionTitle(section.title) : rawTitle;
  return (
    <LayerCard padding="none" className="daily-section-card">
      <PanelHeading title={title} />
      <LayerCard.Body className="daily-section-body">
        <MarkdownBody markdown={section.body} />
      </LayerCard.Body>
    </LayerCard>
  );
}

function TableSectionCard({ section }: { section: DailySection }) {
  const parsed = parseSectionBody(section.body);
  const heading = formatSectionTitle(section.title || '行情');
  return (
    <LayerCard padding="none" className="daily-section-card">
      <PanelHeading title={heading} />
      <LayerCard.Body className="daily-section-body">
        {parsed.before ? <MarkdownBody markdown={parsed.before} className="mb-3" /> : null}
        {parsed.table ? <DailyQuoteTable table={parsed.table} /> : null}
        {parsed.after ? <MarkdownBody markdown={parsed.after} className="mt-3" /> : null}
        {!parsed.table && !parsed.before && !parsed.after ? (
          <MarkdownBody markdown={section.body} />
        ) : null}
      </LayerCard.Body>
    </LayerCard>
  );
}

export function DailyReportView({ markdown }: { markdown: string }) {
  const rawSections = splitDailySections(markdown);
  const { color: quoteColor } = useQuoteColor();
  const tiles = extractMacroStatTiles(rawSections);
  const { sections: main, disclaimer } = peelDisclaimer(rawSections);

  const nodes: ReactNode[] = [];
  for (let idx = 0; idx < main.length; idx += 1) {
    const section = main[idx];
    if (!section) continue;
    if (!section.title && !section.body.trim()) continue;

    if (isTableSection(section.title)) {
      nodes.push(<TableSectionCard key={`t-${section.title}-${idx}`} section={section} />);
      continue;
    }

    // Pair consecutive 好消息 + 坏消息 (either order) into a two-card grid.
    if (isNewsPairSection(section.title)) {
      const next = main[idx + 1];
      if (
        next &&
        isNewsPairSection(next.title) &&
        bareSectionTitle(section.title) !== bareSectionTitle(next.title)
      ) {
        nodes.push(
          <div key={`news-pair-${idx}`} className="daily-news-pair">
            <ProseSectionCard section={section} fallbackTitle="消息" />
            <ProseSectionCard section={next} fallbackTitle="消息" />
          </div>,
        );
        idx += 1; // consume the pair partner
        continue;
      }
      // Single half of the pair → full-width card
      nodes.push(
        <ProseSectionCard
          key={`news-${section.title}-${idx}`}
          section={section}
          fallbackTitle="消息"
        />,
      );
      continue;
    }

    nodes.push(
      <ProseSectionCard
        key={`p-${section.title || 'body'}-${idx}`}
        section={section}
        fallbackTitle={idx === 0 ? '正文' : '附注'}
      />,
    );
  }

  return (
    <div className="daily-report">
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
            />
          ))}
        </div>
      ) : null}

      {nodes}

      <p className="daily-disclaimer">{disclaimer ?? '仅供信息参考，不构成投资建议。'}</p>
    </div>
  );
}
