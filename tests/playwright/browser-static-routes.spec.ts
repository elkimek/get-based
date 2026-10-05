import { expect, test } from '@playwright/test';
import { routeCss, routeHtml, routeJavaScript } from '../helpers/browser-static-routes.js';

for (const status of [undefined, 201]) {
  test(`typed literal routes preserve real browser responses with status ${status ?? 'omitted'}`, async ({ page }) => {
    const html = '<!doctype html><link rel="stylesheet" href="/tests/fixture-static.css"><script type="module" src="/tests/fixture-static.js"></script><p>Fixture body</p>';
    const css = 'p { color: rgb(12, 34, 56); }';
    const script = 'document.documentElement.dataset.fixture = "ready";';
    await routeHtml(page, '**/fixture-static', html, status);
    await routeCss(page, '**/tests/fixture-static.css', css, status);
    const handle = await routeJavaScript(page, /\/tests\/fixture-static\.js(?:\?.*)?$/, script, status);
    const response = await page.goto('/fixture-static');
    expect(response?.status()).toBe(status ?? 200);
    expect(await response!.text()).toBe(html);
    await expect(page.locator('html')).toHaveAttribute('data-fixture', 'ready');
    await expect(page.locator('p')).toHaveCSS('color', 'rgb(12, 34, 56)');
    const body = await page.evaluate(async () => {
      const response = await fetch('/tests/fixture-static.js?verify=1');
      return { status: response.status, body: await response.text(), type: response.headers.get('content-type') };
    });
    expect(body).toEqual({ status: status ?? 200, body: script, type: 'application/javascript' });
    await handle.dispose();
    expect(await page.evaluate(() => fetch('/tests/fixture-static.js?removed=1').then(response => response.status))).toBe(404);
  });
}
