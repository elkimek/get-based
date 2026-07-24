import { expect, test } from './coverage-fixture.js';

test('default and light startup stay cold without optional theme presentation', async ({ page }) => {
  let stylesheetRequests = 0;
  await page.route('**/themes-extra.css*', route => {
    stylesheetRequests += 1;
    return route.continue();
  });

  await page.goto('/app', { waitUntil: 'load' });
  await expect(page.locator('link[data-extra-themes-stylesheet]')).toHaveCount(0);
  expect(stylesheetRequests).toBe(0);

  await page.evaluate(() => localStorage.setItem('labcharts-theme', 'light'));
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('link[data-extra-themes-stylesheet]')).toHaveCount(0);
  expect(stylesheetRequests).toBe(0);

  const sunsetAccent = await page.evaluate(async () => {
    (await import('/js/theme.js')).setSunsetMode(true);
    return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  });
  expect(sunsetAccent).toBe('#ffb000');
  expect(stylesheetRequests).toBe(0);
});

test('stored optional theme loads before first paint at the original cascade position', async ({ page }) => {
  let stylesheetRequests = 0;
  await page.addInitScript(() => localStorage.setItem('labcharts-theme', 'glass'));
  await page.route('**/themes-extra.css*', route => {
    stylesheetRequests += 1;
    return route.continue();
  });

  await page.goto('/app', { waitUntil: 'load' });
  const outcome = await page.evaluate(() => {
    const link = document.querySelector('link[data-extra-themes-stylesheet]');
    const anchor = document.querySelector('[data-extra-themes-stylesheet-anchor]');
    return {
      theme: document.documentElement.dataset.theme,
      radius: getComputedStyle(document.documentElement).getPropertyValue('--radius').trim(),
      loaded: link?.sheet !== null,
      linkPrecedesAnchor: link?.nextElementSibling === anchor,
    };
  });

  expect(stylesheetRequests).toBe(1);
  expect(outcome).toEqual({
    theme: 'glass',
    radius: '22px',
    loaded: true,
    linkPrecedesAnchor: true,
  });
});

test('optional theme changes single-flight presentation and apply the latest selection', async ({ page }) => {
  let stylesheetRoute;
  let stylesheetRequests = 0;
  await page.route('**/themes-extra.css*', route => {
    stylesheetRequests += 1;
    stylesheetRoute = route;
  });
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(async () => {
    const theme = await import('/js/theme.js');
    window.__extraThemesReady = Promise.all([
      theme.setTheme('glass'),
      theme.setTheme('cyberterm'),
    ]);
  });
  await expect.poll(() => !!stylesheetRoute).toBe(true);
  await expect(page.locator('link[data-extra-themes-stylesheet]')).toHaveCount(1);
  await stylesheetRoute.fulfill({
    status: 200,
    contentType: 'text/css',
    body: '[data-theme="cyberterm"] { --coverage-extra-theme: ready; }',
  });

  const outcome = await page.evaluate(async () => {
    const results = await window.__extraThemesReady;
    const link = document.querySelector('link[data-extra-themes-stylesheet]');
    const anchor = document.querySelector('[data-extra-themes-stylesheet-anchor]');
    return {
      results,
      theme: document.documentElement.dataset.theme,
      storedTheme: localStorage.getItem('labcharts-theme'),
      token: getComputedStyle(document.documentElement).getPropertyValue('--coverage-extra-theme').trim(),
      linkPrecedesAnchor: link?.nextElementSibling === anchor,
    };
  });

  expect(stylesheetRequests).toBe(1);
  expect(outcome).toEqual({
    results: [true, true],
    theme: 'cyberterm',
    storedTheme: 'cyberterm',
    token: 'ready',
    linkPrecedesAnchor: true,
  });
});

test('optional theme load failure restores dark and retries with a fresh URL', async ({ page }) => {
  const stylesheetRequests = [];
  await page.route('**/themes-extra.css*', route => {
    stylesheetRequests.push(route.request().url());
    return route.abort('failed');
  });
  await page.goto('/app', { waitUntil: 'load' });

  const firstLoaded = await page.evaluate(async () => (await import('/js/theme.js')).setTheme('glass'));
  expect(firstLoaded).toBe(false);
  await expect(page.locator('link[data-extra-themes-stylesheet]')).toHaveCount(0);
  await expect(page.locator('.notification-toast')).toContainText('Restored Modern Minimal');
  expect(await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme || 'dark',
    storedTheme: localStorage.getItem('labcharts-theme'),
  }))).toEqual({ theme: 'dark', storedTheme: 'dark' });

  await page.unroute('**/themes-extra.css*');
  const retry = await page.evaluate(async () => {
    const loaded = await (await import('/js/theme.js')).setTheme('glass');
    const link = document.querySelector('link[data-extra-themes-stylesheet]');
    return {
      loaded,
      theme: document.documentElement.dataset.theme,
      storedTheme: localStorage.getItem('labcharts-theme'),
      href: link?.href || '',
      radius: getComputedStyle(document.documentElement).getPropertyValue('--radius').trim(),
    };
  });

  expect(stylesheetRequests).toHaveLength(1);
  expect(retry.loaded).toBe(true);
  expect(retry.theme).toBe('glass');
  expect(retry.storedTheme).toBe('glass');
  expect(retry.radius).toBe('22px');
  expect(new URL(retry.href).searchParams.get('lazy-retry')).toBe('1');
});
