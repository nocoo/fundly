import { Hono } from 'hono';
import { d1Exec } from '../lib/executor';
import { parseFundListQuery } from '../lib/fund-query';
import {
  getDataStats,
  getFundDetail,
  getFundNav,
  listFunds,
  listFundTypes,
} from '../lib/funds-service';
import type { AppEnv } from '../lib/types';

function requestedSource(c: {
  req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined };
}) {
  return c.req.header('x-fundly-source') ?? c.req.query('source') ?? null;
}

const app = new Hono<AppEnv>();

app.get('/api/source', (c) => {
  return c.json({ source: 'd1', allowed: ['d1'], rejected: requestedSource(c) === 'sqlite' });
});

app.get('/api/funds', async (c) => {
  const exec = d1Exec(c.env.DB);
  const query = parseFundListQuery({
    q: c.req.query('q'),
    fundType: c.req.query('fundType'),
    typeL1: c.req.query('typeL1'),
    typeL2: c.req.query('typeL2'),
    mvpOnly: c.req.query('mvpOnly'),
    hasNav: c.req.query('hasNav'),
    sort: c.req.query('sort'),
    dir: c.req.query('dir'),
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
  });
  return c.json(await listFunds(exec, query));
});

app.get('/api/fund-types', async (c) => {
  return c.json({ items: await listFundTypes(d1Exec(c.env.DB)) });
});

app.get('/api/stats', async (c) => {
  return c.json(await getDataStats(d1Exec(c.env.DB)));
});

app.get('/api/funds/:code/nav', async (c) => {
  return c.json({
    items: await getFundNav(d1Exec(c.env.DB), c.req.param('code'), {
      from: c.req.query('from'),
      limit: c.req.query('limit'),
    }),
  });
});

app.get('/api/funds/:code', async (c) => {
  const detail = await getFundDetail(d1Exec(c.env.DB), c.req.param('code'));
  if (!detail) return c.json({ error: 'Not found' }, 404);
  return c.json(detail);
});

export default app;
