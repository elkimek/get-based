import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({
    accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22',
    policyScope: 'self-hosted-notice', acceptedAt: '2026-09-05T00:00:00Z',
    appVersion: 'packing-test', location: 'packing-test',
  })));
});

test('the real demo dashboard packs without overlapping cards', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    await (await import('/js/export.js')).loadDemoData('female');
    window.endTour?.();
    for (const id of ['tour-overlay', 'tour-spotlight', 'tour-tooltip']) document.getElementById(id)?.remove();
    await (await import('/js/chat-panel.js')).closeChatPanel();
    (await import('/js/views.js')).navigate('dashboard');
  });
  const grid = page.locator('#main-content .dashboard-widgets');
  await expect(grid).toHaveClass(/is-packed/);
  await expect.poll(() => grid.locator(':scope > .dashboard-widget').evaluateAll(cards => {
    const boxes = cards.map(card => card.getBoundingClientRect());
    return boxes.length > 2 && boxes.every((a, i) => boxes.slice(i + 1).every(b => a.right <= b.x + 1 || b.right <= a.x + 1 || a.bottom <= b.y + 1 || b.bottom <= a.y + 1));
  })).toBe(true);
  await page.screenshot({ path: '/tmp/getbased-packed-dashboard.png' });
});

test('desktop cards fill usable gaps and respond to content, width, and organize changes', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto('/app', { waitUntil: 'load' });
  await page.addStyleTag({ url: '/css/dashboard-widgets.css' });
  await page.evaluate(async () => {
    const main = document.createElement('div');
    main.id = 'packing-fixture';
    document.body.appendChild(main);
    main.innerHTML = '<div class="dashboard-widgets" style="width:1000px">' + [
      ['short', 'half', 120], ['tall', 'half', 360], ['wide', 'full', 90], ['filler', 'half', 100], ['end', 'full', 80],
    ].map(([id, size, height]) => `<section id="${id}" class="dashboard-widget dashboard-widget-${size}" style="height:${height}px;box-sizing:border-box">${id}</section>`).join('') + '</div>';
    (await import('/js/dashboard-widget-packing.js')).setupDashboardWidgetPacking(main);
  });
  const grid = page.locator('#packing-fixture .dashboard-widgets');
  await expect(grid).toHaveClass(/is-packed/);
  const boxes = () => grid.locator('.dashboard-widget').evaluateAll(cards => cards.map(card => {
    const r = card.getBoundingClientRect();
    return { id: card.id, x: r.x, y: r.y, right: r.right, bottom: r.bottom };
  }));
  await expect.poll(async () => {
    const [short, tall, wide, filler] = await boxes();
    return filler.y < wide.y && filler.x === short.x && filler.bottom < tall.bottom;
  }).toBe(true);
  expect((await boxes()).map(card => card.id)).toEqual(['short', 'tall', 'wide', 'filler', 'end']);
  await page.locator('#filler').evaluate(card => { card.style.height = '300px'; });
  await expect.poll(async () => {
    const all = await boxes();
    return all.every((a, i) => all.slice(i + 1).every(b => a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y));
  }).toBe(true);
  await grid.evaluate(el => el.classList.add('is-organizing'));
  await expect(grid).not.toHaveClass(/is-packed/);
  await grid.evaluate(el => { el.classList.remove('is-organizing'); el.style.width = '500px'; });
  await expect(grid).not.toHaveClass(/is-packed/);
  await grid.evaluate(el => { el.style.width = '1000px'; });
  await expect(grid).toHaveClass(/is-packed/);
});

test('a final lone card after a full-width widget expands without changing its saved size', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.addStyleTag({ url: '/css/dashboard-widgets.css' });
  await page.evaluate(async () => {
    const main = document.createElement('div');
    main.id = 'packing-fixture';
    document.body.appendChild(main);
    main.innerHTML = '<div class="dashboard-widgets" style="width:1000px"><section class="dashboard-widget dashboard-widget-full">Nutrition</section><section class="dashboard-widget dashboard-widget-half">Score</section></div>';
    (await import('/js/dashboard-widget-packing.js')).setupDashboardWidgetPacking(main);
  });
  const cards = page.locator('#packing-fixture .dashboard-widget');
  await expect.poll(async () => cards.last().evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(1000);
  await expect(cards.last()).toHaveClass(/dashboard-widget-half/);
});
