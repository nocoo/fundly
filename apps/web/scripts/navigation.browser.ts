import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function checkNavigation() {
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(`${location.pathname}: ${message}`);
  };
  const wait = async (predicate: () => unknown, message: string) => {
    const deadline = Date.now() + 10_000;
    while (!predicate()) {
      assert(Date.now() < deadline, message);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  };
  const click = (selector: string, root: ParentNode = document) => {
    const element = root.querySelector<HTMLElement>(selector);
    assert(element, `missing ${selector}`);
    element?.click();
  };
  const title = () => document.querySelector('#main-content > header h1')?.textContent;
  const group = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('aside button')].find(
      (button) => button.textContent?.trim() === label,
    );
  const historyTo = (path: string) => {
    history.pushState(null, '', path);
    dispatchEvent(new PopStateEvent('popstate'));
  };

  await wait(() => document.querySelector('[aria-label="收起侧边栏"]'), 'initial shell');
  const main = document.querySelector('#main-content');
  const header = document.querySelector('#main-content > header');
  const sidebar = document.querySelector('aside');
  const theme = document.querySelector('[aria-label="切换主题"]');
  const retained = () => {
    assert(document.querySelector('#main-content') === main, 'main remounted');
    assert(document.querySelector('#main-content > header') === header, 'header remounted');
    assert(document.querySelector('aside') === sidebar, 'sidebar remounted');
    assert(document.querySelector('[aria-label="切换主题"]') === theme, 'theme remounted');
  };

  group('选股')?.click();
  await wait(() => group('选股')?.getAttribute('aria-expanded') === 'true', 'open group');
  click('a[href="/daily"]', sidebar ?? document);
  await new Promise((resolve) => setTimeout(resolve, 100));
  retained();
  await wait(() => title() === '日报', 'daily title');
  retained();
  assert(group('选股')?.getAttribute('aria-expanded') === 'true', 'group state lost');
  click('[aria-label="收起侧边栏"]');
  await wait(() => document.querySelector('[aria-label="展开侧边栏"]'), 'collapse sidebar');

  for (const [path, expected, heading] of [
    ['/funds', '基金浏览', '基金浏览'],
    ['/select/return', '收益', '选基 · 收益'],
    ['/select/risk', '风险', '选基 · 风险'],
    ['/etfs', undefined, 'ETF浏览'],
    ['/select-etf/liquidity', undefined, '交易质量'],
    ['/stocks', undefined, '股票浏览'],
    ['/select-stock/quality', undefined, '盈利质量'],
    ['/settings', '设置', '设置'],
    ['/backup', '备份', '备份'],
    ['/daily', '日报', '财经日报'],
  ] as const) {
    click(`aside a[href="${path}"]`);
    await wait(
      () =>
        location.pathname === path &&
        title() === expected &&
        document.querySelector('.research-heading h1')?.textContent?.includes(heading),
      `navigation to ${path}`,
    );
    retained();
    assert(document.querySelector('[aria-label="展开侧边栏"]'), 'collapse state lost');
  }

  click('a[href="/daily/2000-01-01"]');
  await wait(() => title() === '2000-01-01', 'daily detail title');
  retained();
  click('header a[href="/daily"]');
  await wait(() => title() === '日报', 'daily breadcrumb link');
  history.back();
  await wait(() => title() === '2000-01-01', 'history back');
  retained();
  history.forward();
  await wait(() => title() === '日报', 'history forward');
  for (const [path, expected] of [
    ['/daily/2000-01-02', '2000-01-02'],
    ['/daily/invalid', '详情'],
  ] as const) {
    historyTo(path);
    await wait(() => title() === expected, 'daily parameter change');
    retained();
  }

  click('aside a[href="/funds"]');
  await wait(() => document.querySelector('a[href="/funds/000001"]'), 'fund list fixture');
  click('a[href="/funds/000001"]');
  await wait(() => title() === '000001', 'loading fund title');
  retained();
  await wait(() => title() === 'Navigation fixture fund', 'loaded fund title');
  assert(header?.querySelector('a[href="/funds"]'), 'fund list breadcrumb');
  retained();
  historyTo('/funds/000002');
  await wait(() => title() === '000002', 'missing fund title');
  await wait(() => main?.textContent?.includes('未找到基金'), 'missing fund state');
  retained();
  historyTo('/select/risk?page=2');
  await wait(
    () => title() === '风险' && document.querySelector('a[href="/funds/000001"]'),
    'origin list',
  );
  const origin = `${location.pathname}${location.search}`;
  click('a[href="/funds/000001"]');
  await wait(() => title() === 'Navigation fixture fund', 'fund with list origin');
  assert(header?.querySelector(`a[href="${origin}"]`)?.textContent === '风险', 'origin breadcrumb');
  assert(
    document.querySelector('aside a[href="/select/risk"][aria-current="page"]'),
    'origin active',
  );
  retained();
  click(`header a[href="${origin}"]`);
  await wait(
    () => `${location.pathname}${location.search}` === origin && title() === '风险',
    'origin return',
  );
  for (const [path, message] of [
    ['/etfs/510300.SH', '未找到该ETF标的'],
    ['/stocks/600519.SH', '未找到该股票标的'],
  ] as const) {
    historyTo(path);
    await wait(() => title() === undefined && main?.textContent?.includes(message), 'detail route');
    retained();
  }

  click('aside a[href="/market"]');
  await wait(() => title() === '宏观大屏', 'market title');
  retained();
  const wallButton = () =>
    [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('大屏模式'),
    );
  wallButton()?.click();
  await wait(() => !document.querySelector('#main-content > header'), 'wall mode hides header');
  assert(!document.querySelector('aside'), 'wall mode hides sidebar');
  assert(document.querySelector('#main-content') === main, 'wall mode remounted main');
  [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent?.includes('退出大屏'))
    ?.click();
  await wait(() => title() === '宏观大屏', 'exit wall mode');
  assert(document.querySelector('[aria-label="展开侧边栏"]'), 'wall mode lost collapse state');
  historyTo('/missing-navigation-fixture');
  await wait(() => title() === '未找到', 'not found title');
  assert(document.querySelector('#main-content') === main, 'not found remounted main');

  return 'desktop navigation, retained chrome, groups, history, metadata and wall mode';
}

async function checkMobile() {
  const wait = async (predicate: () => unknown, message: string) => {
    const deadline = Date.now() + 10_000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error(`Mobile navigation timed out: ${message}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  };
  const button = () => document.querySelector<HTMLButtonElement>('[aria-label="打开导航菜单"]');
  await wait(button, 'menu trigger');
  const main = document.querySelector('#main-content');
  const header = document.querySelector('#main-content > header');
  button()?.click();
  await wait(() => document.querySelector('[role="dialog"] a[href="/daily"]'), 'drawer opens');
  document.querySelector<HTMLAnchorElement>('[role="dialog"] a[href="/daily"]')?.click();
  await wait(
    () => location.pathname === '/daily' && !document.querySelector('[role="dialog"]'),
    'drawer closes',
  );
  await wait(() => document.activeElement === button(), 'focus returns to trigger');
  if (document.querySelector('#main-content') !== main) throw new Error('Mobile main remounted');
  if (document.querySelector('#main-content > header') !== header)
    throw new Error('Mobile header remounted');
  if (document.body.style.overflow === 'hidden') throw new Error('Mobile scroll stayed locked');
  return 'mobile drawer closes, restores focus and unlocks scrolling';
}

test('real navigation retains authenticated chrome without document requests', async () => {
  const chrome =
    process.env.CHROME_BIN ??
    (process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : 'google-chrome');
  const profile = await mkdtemp(join(tmpdir(), 'fundly-navigation-'));
  let documents = 0;
  let authenticated = true;
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const { pathname } = new URL(request.url);
      if (request.headers.get('sec-fetch-dest') === 'document') documents++;
      if (pathname === '/api/me') {
        return Response.json({
          authenticated,
          authRequired: true,
          name: 'Navigation fixture',
          email: 'fixture@example.invalid',
          avatar: null,
        });
      }
      if (pathname === '/api/daily') {
        return Response.json([
          { date: '2000-01-01', title: 'Navigation fixture', summary: '', path: '' },
        ]);
      }
      if (pathname === '/api/funds') {
        return Response.json({
          items: [{ fund_code: '000001', fund_name: 'Navigation fixture fund', fund_type: '' }],
          total: 1,
          page: 1,
          pageSize: 20,
        });
      }
      if (pathname === '/api/funds/000001') {
        await Bun.sleep(600);
        return Response.json({
          fields: [{ key: 'fund_name', value: 'Navigation fixture fund', group: '基本信息' }],
          extras: {
            allocation: null,
            scale: null,
            holders: null,
            ranking: [],
            scores: null,
            grandTotal: null,
          },
          navCount: 0,
        });
      }
      if (pathname.startsWith('/api/'))
        return Response.json({ error: 'Not found' }, { status: 404 });
      const file = Bun.file(new URL(`../../worker/static${pathname}`, import.meta.url));
      if (await file.exists()) {
        if (/\/daily-page-.*\.js$/.test(pathname)) await Bun.sleep(500);
        return new Response(file);
      }
      return new Response(Bun.file(new URL('../../worker/static/index.html', import.meta.url)));
    },
  });
  let browser: ReturnType<typeof Bun.spawn> | undefined;
  let socket: WebSocket | undefined;
  try {
    browser = Bun.spawn(
      [
        chrome,
        '--headless',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        'about:blank',
      ],
      { stdout: 'ignore', stderr: 'ignore' },
    );
    let port = '';
    const deadline = Date.now() + 15_000;
    while (!port) {
      port =
        (await readFile(join(profile, 'DevToolsActivePort'), 'utf8').catch(() => '')).split(
          '\n',
        )[0] ?? '';
      if (Date.now() > deadline) throw new Error('Chrome did not start; set CHROME_BIN');
      await Bun.sleep(50);
    }
    const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
      method: 'PUT',
    }).then((response) => response.json() as Promise<{ webSocketDebuggerUrl: string }>);
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket?.addEventListener('open', () => resolve(), { once: true });
      socket?.addEventListener('error', reject, { once: true });
    });
    let nextId = 0;
    const command = (method: string, params: Record<string, unknown> = {}) => {
      const id = ++nextId;
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 30_000);
        const onMessage = (event: MessageEvent) => {
          const message = JSON.parse(String(event.data));
          if (message.id !== id) return;
          clearTimeout(timeout);
          socket?.removeEventListener('message', onMessage);
          if (message.error) reject(new Error(JSON.stringify(message.error)));
          else resolve(message.result);
        };
        socket?.addEventListener('message', onMessage);
        socket?.send(JSON.stringify({ id, method, params }));
      });
    };
    const evaluate = async (expression: string) => {
      const result = await command('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      expect(result.exceptionDetails, JSON.stringify(result.exceptionDetails)).toBeUndefined();
      return result.result as { value?: unknown };
    };
    await command('Page.enable');
    await command('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await command('Page.navigate', { url: server.url.href });
    await Bun.sleep(300);
    console.log((await evaluate(`(${checkNavigation.toString()})()`)).value);
    expect(documents).toBe(1);
    await command('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await command('Page.navigate', { url: server.url.href });
    await Bun.sleep(300);
    console.log((await evaluate(`(${checkMobile.toString()})()`)).value);
    expect(documents).toBe(2);
    authenticated = false;
    await command('Page.navigate', { url: `${server.url}settings?fixture=1` });
    await Bun.sleep(1200);
    const login = await evaluate(
      `({ path: location.pathname, search: location.search, shell: Boolean(document.querySelector('#main-content')), login: Boolean(document.querySelector('.research-login')) })`,
    );
    expect(login.value).toEqual({
      path: '/login',
      search: '?from=%2Fsettings%3Ffixture%3D1',
      shell: false,
      login: true,
    });
    expect(documents).toBe(3);
  } finally {
    socket?.close();
    browser?.kill();
    await browser?.exited;
    await server.stop(true);
    await rm(profile, { recursive: true, force: true });
  }
}, 90_000);
