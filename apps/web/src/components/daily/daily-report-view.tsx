import { LayerCard } from '@nocoo/basalt';
import { PanelHeading, StatTile } from '@/components/layout/research-layout';
import { useQuoteColor } from '@/hooks/use-quote-color';
import {
  extractMacroStatTiles,
  isTableSection,
  parseSectionBody,
  peelDisclaimer,
  splitDailySections,
} from '@/lib/daily-md';
import { quoteToneClass } from '@/lib/quote-color';
import { cn } from '@/lib/utils';
import { DailyQuoteTable } from './daily-quote-table';
import { MarkdownBody } from './markdown-body';

export function DailyReportView({ markdown }: { markdown: string }) {
  const rawSections = splitDailySections(markdown);
  const { color: quoteColor } = useQuoteColor();
  const tiles = extractMacroStatTiles(rawSections);
  const { sections: main, disclaimer } = peelDisclaimer(rawSections);

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
                  className={cn('font-mono tabular-nums', quoteToneClass(tile.tone, quoteColor))}
                >
                  {tile.change}
                </span>
              }
              hint={tile.latest ? `最新 ${tile.latest}` : undefined}
            />
          ))}
        </div>
      ) : null}

      {main.map((section, idx) => {
        if (!section.title && !section.body.trim()) return null;

        if (isTableSection(section.title)) {
          const parsed = parseSectionBody(section.body);
          const key = section.title || `table-${section.body.slice(0, 24)}`;
          return (
            <LayerCard key={key} padding="none" className="daily-section-card">
              <PanelHeading title={section.title || '行情'} />
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

        const title = section.title || (idx === 0 ? '正文' : '附注');
        const key = section.title || `prose-${section.body.slice(0, 32)}`;
        return (
          <LayerCard key={key} padding="none" className="daily-section-card">
            <PanelHeading title={title} />
            <LayerCard.Body className="daily-section-body">
              <MarkdownBody markdown={section.body} />
            </LayerCard.Body>
          </LayerCard>
        );
      })}

      <p className="daily-disclaimer">{disclaimer ?? '仅供信息参考，不构成投资建议。'}</p>
    </div>
  );
}
