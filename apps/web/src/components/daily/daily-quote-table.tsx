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

function isChangeHeader(header: string): boolean {
  return /涨跌|变动|日变动/.test(header);
}

function isNumericHeader(header: string): boolean {
  return /最新|水平|价格|收盘/.test(header);
}

export function DailyQuoteTable({ table }: { table: GfmTable }) {
  const { color: quoteColor } = useQuoteColor();
  const changeCol = table.headers.findIndex(isChangeHeader);

  return (
    <div className="daily-quote-table-wrap">
      <Table className="daily-quote-table">
        <TableHeader>
          <TableRow>
            {table.headers.map((h) => (
              <TableHead
                key={h}
                className={cn(
                  'text-[11px] font-semibold text-basalt-muted-foreground',
                  isChangeHeader(h) || isNumericHeader(h) ? 'text-right' : 'text-left',
                )}
              >
                {h}
              </TableHead>
            ))}
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
                  if (ci === changeCol || isChangeHeader(h)) {
                    const parsed = parseChangeCell(cell);
                    const tone = changeTone(parsed);
                    return (
                      <TableCell key={cellKey} className="text-right">
                        <span
                          className={cn(
                            'font-mono text-sm font-medium tabular-nums',
                            quoteToneClass(tone, quoteColor),
                          )}
                        >
                          {parsed.display}
                        </span>
                      </TableCell>
                    );
                  }
                  if (isNumericHeader(h)) {
                    return (
                      <TableCell key={cellKey} className="text-right">
                        <span className="font-mono text-sm tabular-nums text-basalt-foreground">
                          {cell || '—'}
                        </span>
                      </TableCell>
                    );
                  }
                  return (
                    <TableCell
                      key={cellKey}
                      className={cn(
                        ci === 0
                          ? 'font-medium text-basalt-foreground'
                          : 'text-basalt-muted-foreground',
                        'text-sm',
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
