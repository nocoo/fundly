import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@nocoo/basalt/components/table';
import { useQuoteColor } from '@/hooks/use-quote-color';
import { changeTone, type GfmTable, parseChangeCell } from '@/lib/daily-md';
import { quoteToneClass } from '@/lib/quote-color';
import { cn } from '@/lib/utils';

type ColRole = 'name' | 'intro' | 'last' | 'change' | 'note';

function isChangeHeader(header: string): boolean {
  return /涨跌|变动|日变动/.test(header);
}

function isNumericHeader(header: string): boolean {
  return /最新|水平|价格|收盘/.test(header);
}

function isIntroHeader(header: string): boolean {
  return /简介|说明|释义/.test(header);
}

function isNameHeader(header: string): boolean {
  return /标的|名称|ticker/i.test(header);
}

function columnRole(header: string, index: number): ColRole {
  if (isChangeHeader(header)) return 'change';
  if (isNumericHeader(header)) return 'last';
  if (isIntroHeader(header)) return 'intro';
  if (isNameHeader(header) || index === 0) return 'name';
  return 'note';
}

function colClass(role: ColRole): string {
  switch (role) {
    case 'name':
      return 'daily-quote-col-name';
    case 'intro':
      return 'daily-quote-col-intro';
    case 'last':
      return 'daily-quote-col-last';
    case 'change':
      return 'daily-quote-col-change';
    default:
      return 'daily-quote-col-note';
  }
}

function changeGlyph(tone: 'up' | 'down' | 'flat'): string {
  if (tone === 'up') return '▲';
  if (tone === 'down') return '▼';
  return '';
}

export function DailyQuoteTable({ table }: { table: GfmTable }) {
  const { color: quoteColor } = useQuoteColor();
  const roles = table.headers.map((h, i) => columnRole(h, i));
  const hasIntro = roles.includes('intro');

  return (
    <div className="daily-quote-table-wrap">
      <Table className={cn('daily-quote-table', hasIntro && 'daily-quote-table--with-intro')}>
        <colgroup>
          {table.headers.map((h, i) => (
            <col key={`col-${h}`} className={colClass(roles[i] ?? 'note')} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow>
            {table.headers.map((h, i) => {
              const role = roles[i] ?? 'note';
              const numeric = role === 'change' || role === 'last';
              return (
                <TableHead
                  key={h}
                  className={cn(
                    'text-[11px] font-semibold text-basalt-muted-foreground',
                    colClass(role),
                    numeric ? 'text-right' : 'text-left',
                  )}
                >
                  {h}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((row) => {
            const rowKey = row.join('|') || 'empty';
            return (
              <TableRow key={rowKey}>
                {table.headers.map((h, ci) => {
                  const cell = row[ci] ?? '';
                  const cellKey = `${rowKey}::${h}`;
                  const role = roles[ci] ?? 'note';

                  if (role === 'change') {
                    const parsed = parseChangeCell(cell);
                    const tone = changeTone(parsed);
                    const glyph = changeGlyph(tone);
                    return (
                      <TableCell
                        key={cellKey}
                        className={cn(colClass(role), 'text-right tabular-nums')}
                      >
                        <span
                          className={cn(
                            'daily-quote-change font-mono text-[15px] font-semibold tabular-nums',
                            quoteToneClass(tone, quoteColor),
                          )}
                        >
                          {glyph ? <span className="daily-quote-change-glyph">{glyph}</span> : null}
                          {parsed.display}
                        </span>
                      </TableCell>
                    );
                  }

                  if (role === 'last') {
                    return (
                      <TableCell
                        key={cellKey}
                        className={cn(colClass(role), 'text-right tabular-nums')}
                      >
                        <span className="daily-quote-last font-mono text-[12px] tabular-nums text-basalt-muted-foreground">
                          {cell || '—'}
                        </span>
                      </TableCell>
                    );
                  }

                  if (role === 'intro') {
                    return (
                      <TableCell key={cellKey} className={cn(colClass(role), 'text-left')}>
                        <span className="daily-quote-intro">{cell || '—'}</span>
                      </TableCell>
                    );
                  }

                  return (
                    <TableCell
                      key={cellKey}
                      className={cn(
                        colClass(role),
                        'text-left text-sm',
                        role === 'name'
                          ? 'font-medium text-basalt-foreground'
                          : 'text-basalt-muted-foreground',
                      )}
                    >
                      {cell || '—'}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
