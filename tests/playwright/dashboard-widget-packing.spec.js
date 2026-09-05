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
  await expect(grid).toHaveClass(/is-adaptive/);
  await expect.poll(() => grid.locator(':scope > .dashboard-widget').evaluateAll(cards => {
    const boxes = cards.map(card => card.getBoundingClientRect());
    return boxes.length > 2 && boxes.every((a, i) => boxes.slice(i + 1).every(b => a.right <= b.x + 1 || b.right <= a.x + 1 || a.bottom <= b.y + 1 || b.bottom <= a.y + 1));
  })).toBe(true);
  const pair = await grid.locator('[data-widget-id="focus"], [data-widget-id="spotlight"]').evaluateAll(cards => cards.map(card => {
    const r = card.getBoundingClientRect();
    return { width: r.width, bottom: r.bottom };
  }));
  expect(pair).toHaveLength(2);
  expect(Math.abs(pair[0].bottom - pair[1].bottom)).toBeLessThanOrEqual(1);
  expect(pair[0].width).not.toBe(pair[1].width);
  await expect(grid.locator('.db-spotlight .db-spark')).toHaveCSS('height', '80px');
  await page.screenshot({ path: '/tmp/getbased-packed-dashboard.png' });
});

test('desktop rows adapt widths and heights after content and order changes', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto('/app', { waitUntil: 'load' });
  await page.addStyleTag({ url: '/css/dashboard-widgets.css' });
  await page.evaluate(async () => {
    const main = document.createElement('div');
    main.id = 'packing-fixture';
    document.body.appendChild(main);
    main.innerHTML = '<div class="dashboard-widgets" style="width:1000px">' + [
      ['short', 'half', 'Short text. '.repeat(8)], ['tall', 'half', 'Longer explanation. '.repeat(60)],
      ['wide', 'full', 'Full-width content'], ['filler', 'half', 'Another card'], ['end', 'full', 'Last wide card'],
    ].map(([id, size, text]) => `<section id="${id}" class="dashboard-widget dashboard-widget-${size}"><div>${text}</div></section>`).join('') + '</div>';
    (await import('/js/dashboard-widget-packing.js')).setupDashboardWidgetPacking(main);
  });
  const grid = page.locator('#packing-fixture .dashboard-widgets');
  await expect(grid).toHaveClass(/is-adaptive/);
  const boxes = () => grid.locator('.dashboard-widget').evaluateAll(cards => cards.map(card => {
    const r = card.getBoundingClientRect();
    return { id: card.id, x: r.x, y: r.y, right: r.right, bottom: r.bottom };
  }));
  await expect.poll(async () => {
    const [short, tall, wide, filler] = await boxes();
    return short.right - short.x < tall.right - tall.x && Math.abs(short.bottom - tall.bottom) < 1 && filler.y > wide.y;
  }).toBe(true);
  expect((await boxes()).map(card => card.id)).toEqual(['short', 'tall', 'wide', 'filler', 'end']);
  await page.locator('#short > div').evaluate(card => { card.textContent = 'New long explanation. '.repeat(120); });
  await expect.poll(async () => {
    const [short, tall] = await boxes();
    return short.right - short.x > tall.right - tall.x;
  }).toBe(true);
  await expect.poll(async () => {
    const all = await boxes();
    return all.every((a, i) => all.slice(i + 1).every(b => a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y));
  }).toBe(true);
  await grid.evaluate(el => el.classList.add('is-organizing'));
  await expect(grid).toHaveClass(/is-adaptive/);
  await grid.evaluate(el => el.insertBefore(el.querySelector('#filler'), el.querySelector('#tall')));
  await expect.poll(async () => {
    const all = await boxes();
    return all[0].y === all[1].y && all[1].id === 'filler' && all[2].y > all[1].y;
  }).toBe(true);
  await grid.evaluate(el => { el.classList.remove('is-organizing'); el.style.width = '500px'; });
  await expect(grid).not.toHaveClass(/is-adaptive/);
  await grid.evaluate(el => { el.style.width = '1000px'; });
  await expect(grid).toHaveClass(/is-adaptive/);
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
