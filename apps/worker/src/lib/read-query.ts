import type { Hono } from 'hono';
import type { QueryExec, SqlBinding } from './executor';
import {
  READ_RESOURCES,
  type ReadResource,
  type ReadResourcePath,
  type ReadResponse,
} from './read-resources';

export class ReadQueryError extends Error {}
const quote = (identifier: string) => `"${identifier}"`;
export const LARGE_TABLE_INDEXES: Readonly<Record<string, readonly (readonly string[])[]>> = {
  fund_nav: [['fund_code', 'nav_date'], ['nav_date']],
  fund_money_yield: [['fund_code', 'nav_date'], ['nav_date']],
  fund_portfolio: [['fund_code', 'report_date', 'stock_code'], ['report_date'], ['stock_code']],
  fund_manager_link: [['fund_code', 'manager_id', 'start_date'], ['fund_code'], ['manager_id']],
  fund_dividend: [['fund_code', 'event_date', 'event_type'], ['event_date']],
  market_daily_bar: [['instrument_id', 'trade_date'], ['trade_date']],
  market_series_observation: [['instrument_id', 'observation_date'], ['observation_date']],
  market_etf_holding: [['instrument_id', 'report_date', 'stock_code']],
  market_index_member: [['index_id', 'stock_code'], ['stock_code']],
  selection_daily_bar: [
    ['asset_type', 'symbol', 'adjust', 'trade_date'],
    ['symbol', 'trade_date'],
  ],
  selection_etf_nav: [['symbol', 'nav_date'], ['nav_date']],
  selection_etf_financials: [['symbol', 'end_date', 'publish_date']],
  selection_etf_holding: [['symbol', 'report_date', 'stock_code']],
  selection_stock_financial_statement: [['symbol', 'statement_type', 'fiscal_year']],
  selection_stock_financial_indicators: [['symbol', 'report']],
};
export function buildReadQuery(resource: ReadResource, query: Record<string, string>) {
  const columns = Object.keys(resource.columns);
  const column = (value: string): string => {
    if (!columns.includes(value)) throw new ReadQueryError(`Unknown column: ${value}`);
    return quote(value);
  };
  const selected = query.fields === undefined ? columns : query.fields.split(',');
  if (!selected.length || selected.length > columns.length)
    throw new ReadQueryError('Invalid fields');
  const fields = [...new Set(selected)].map(column).join(', ');
  let sort = query.sort ?? resource.keys[0] ?? columns[0] ?? '';
  column(sort);
  const order = query.order ?? 'asc';
  if (order !== 'asc' && order !== 'desc') throw new ReadQueryError('order must be asc or desc');
  const integer = (key: string, fallback: number, max: number) => {
    const raw = query[key];
    if (raw === undefined) return fallback;
    if (
      !/^\d+$/.test(raw) ||
      !Number.isSafeInteger(Number(raw)) ||
      Number(raw) > max ||
      (key === 'limit' && Number(raw) < 1)
    )
      throw new ReadQueryError(`Invalid ${key} (maximum ${max})`);
    return Number(raw);
  };
  const limit = integer('limit', 100, 5000);
  const offset = integer('offset', 0, 100000);
  const clauses: string[] = [];
  const params: SqlBinding[] = [];
  const special = [
    'fields',
    'sort',
    'order',
    'limit',
    'offset',
    'code',
    'codes',
    'from',
    'to',
    'date_field',
  ];
  for (const [key, value] of Object.entries(query)) {
    if (special.includes(key)) continue;
    clauses.push(`${column(key)} = ?`);
    params.push(value);
  }
  if (query.code !== undefined) {
    clauses.push(`${column(resource.code)} = ?`);
    params.push(query.code);
  }
  if (query.codes !== undefined) {
    const codes = [...new Set(query.codes.split(','))];
    if (codes.length > 500 || codes.some((code) => !code.trim()))
      throw new ReadQueryError('codes requires 1–500 nonempty codes');
    clauses.push(`${column(resource.code)} IN (${codes.map(() => '?').join(',')})`);
    params.push(...codes);
  }
  const date = query.date_field ?? resource.date;
  if (query.date_field !== undefined) column(query.date_field);
  if (query.from !== undefined || query.to !== undefined) {
    if (!date) throw new ReadQueryError('Resource has no date column');
    const rangeValue = (value: string): string | number => {
      if (resource.columns[date] === 'number') {
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
          throw new ReadQueryError('Numeric date field requires an integer');
        return Number(value);
      }
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value
      )
        throw new ReadQueryError('Dates must be YYYY-MM-DD');
      return value;
    };
    const from = query.from === undefined ? undefined : rangeValue(query.from);
    const to = query.to === undefined ? undefined : rangeValue(query.to);
    if (from !== undefined && to !== undefined && from > to)
      throw new ReadQueryError('from must not exceed to');
    if (from !== undefined) {
      clauses.push(`${column(date)} >= ?`);
      params.push(from);
    }
    if (to !== undefined) {
      clauses.push(`${column(date)} <= ?`);
      params.push(to);
    }
  }
  const indexes = LARGE_TABLE_INDEXES[resource.table];
  let orderingKeys = [sort, ...resource.keys.filter((key) => key !== sort)];
  if (indexes) {
    const exact = (key: string) =>
      query[key] ||
      (key === resource.code
        ? query.code || (query.codes?.split(',').length === 1 ? query.codes : undefined)
        : undefined);
    const identityKeys = [
      resource.code,
      'symbol',
      'fund_code',
      'stock_code',
      'instrument_id',
      'manager_id',
      'index_id',
    ];
    const hasIdentity = indexes.some(
      (index) =>
        identityKeys.includes(index[0] ?? '') &&
        Boolean(exact(index[0] ?? '') || (index[0] === resource.code && query.codes)),
    );
    const boundedDate =
      date !== null &&
      date === resource.date &&
      indexes.some((index) => index[0] === date) &&
      query.from !== undefined &&
      query.to !== undefined &&
      (resource.columns[date] === 'number'
        ? Number(query.to) - Number(query.from)
        : Date.parse(query.to) - Date.parse(query.from)) <=
        366 * 86400000;
    if (!hasIdentity && !boundedDate)
      throw new ReadQueryError(
        'Large tables require an indexed code/symbol filter or indexed date range of at most 366 days',
      );
    if (query.sort === undefined) {
      sort = hasIdentity
        ? (indexes.find((index) =>
            Boolean(exact(index[0] ?? '') || (index[0] === resource.code && query.codes)),
          )?.[0] ?? sort)
        : (date ?? sort);
    }
    if (!hasIdentity && sort !== date)
      throw new ReadQueryError('Date-only large-table queries must sort by the range date');
    const sortIndex = indexes.find((index) => {
      const position = index.indexOf(sort);
      const first = index[0] ?? '';
      const constrained = Boolean(
        exact(first) || (first === resource.code && query.codes) || (boundedDate && first === date),
      );
      return (
        constrained && position >= 0 && index.slice(0, position).every((key) => Boolean(exact(key)))
      );
    });
    if (!sortIndex)
      throw new ReadQueryError(
        'Large-table sort must follow an index; preceding index columns require exact filters',
      );
    orderingKeys = sortIndex.slice(sortIndex.indexOf(sort));
  }
  const ordering = orderingKeys.map((key) => `${column(key)} ${order}`).join(', ');
  return {
    sql: `SELECT ${fields} FROM ${quote(resource.table)}${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY ${ordering} LIMIT ? OFFSET ?`,
    params: [...params, limit + 1, offset],
    limit,
    offset,
    selected,
    sort,
    order,
  };
}
export function registerReadRoutes(
  app: Hono,
  snapshot: <T>(read: (executor: QueryExec) => Promise<T>) => Promise<T>,
): void {
  for (const resource of READ_RESOURCES) {
    app.get(resource.path, async (c) => {
      let query: ReturnType<typeof buildReadQuery>;
      try {
        query = buildReadQuery(resource, c.req.query());
      } catch (error) {
        if (error instanceof ReadQueryError) return c.json({ error: error.message }, 400);
        throw error;
      }
      const result = await snapshot(async (exec) => {
        const schema = await exec.all<{ name: string }>(
          `PRAGMA table_info(${quote(resource.table)})`,
        );
        const columns = new Set(schema.map((column) => column.name));
        if (!Object.keys(resource.columns).every((column) => columns.has(column))) return null;
        const items = await exec.all<Partial<Record<string, string | number | null>>>(
          query.sql,
          query.params,
        );
        return {
          items: items.slice(0, query.limit),
          limit: query.limit,
          offset: query.offset,
          has_more: items.length > query.limit,
        } satisfies ReadResponse<ReadResourcePath>;
      });
      if (!result) return c.json({ error: 'Resource not collected', ready: false }, 503);
      return c.json(result);
    });
  }
}
