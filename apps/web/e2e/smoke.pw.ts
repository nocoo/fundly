import { expect, test } from '@playwright/test';

test.describe('Fundly standalone UI smoke', () => {
  test('renders core navigation routes against an initialized empty SQLite database', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const serverErrors: string[] = [];

    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });
    page.on('response', (response) => {
      if (response.status() >= 500) {
        serverErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    const pageHeading = page.locator('header[aria-labelledby] h1');

    await page.goto('/');
    await expect(page.locator('#main-content')).toBeVisible();
    await expect(pageHeading).toContainText('仪表盘');
    await expect(page.getByText('全市场基金')).toBeVisible();

    for (const [href, heading] of [
      ['/market', '市场全景'],
      ['/daily', '财经日报'],
    ] as const) {
      await page.locator(`aside a[href="${href}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
      await expect(pageHeading).toContainText(heading);
    }

    await page.locator('aside').getByRole('button', { name: '选基' }).click();
    await page.locator('aside a[href="/funds"]').click();
    await expect(page).toHaveURL(/\/funds$/);
    await expect(pageHeading).toContainText('基金浏览');

    await page.goto('/etfs');
    await expect(pageHeading).toContainText('ETF浏览');

    await page.goto('/stocks');
    await expect(pageHeading).toContainText('股票浏览');

    expect(pageErrors).toEqual([]);
    expect(serverErrors).toEqual([]);
  });

  test('renders standalone login page cleanly', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.goto('/login');
    await expect(page.locator('.research-login')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: '登录研究工作台' })).toBeVisible();
    await expect(page.locator('a[href^="/api/auth/google"]')).toBeVisible();

    expect(pageErrors).toEqual([]);
  });
});
