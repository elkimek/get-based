import path from 'node:path';
import fs from 'node:fs/promises';
import {expect, test, type Page} from '@playwright/test';
import {createDefaultProfileData} from '../../js/profile.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture, installDiscussionProvider} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readComparisonAcceptanceProfile} from '../helpers/nutrition-comparison-fixture.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';

const topic = 'Synthetic glucose <context>';
const couponCode = 'SYNTHETIC-12';
const catalog = {
  region: 'INTL',
  slots: {
    'biochemistry.glucose': {label: topic, freeActions: ['Synthetic post-meal walk <literal>'], foodForms: ['Synthetic food'], forms: ['Synthetic supplement']},
    'lipids.ldl': {label: 'Synthetic lipid context', freeActions: ['Synthetic outdoor movement']},
    'iron.ferritin': {label: 'Synthetic iron context', freeActions: ['Synthetic iron review']},
    'thyroid.tsh': {label: 'Synthetic thyroid context', freeActions: ['Synthetic thyroid review']},
    'light.morningLight': {label: 'Synthetic morning light', freeActions: ['Synthetic light review']},
  },
  vendors: {fixture: {name: 'Synthetic vendor', homepage: 'https://example.test/', coupon: {code: couponCode, userDiscount: '12%'}}},
  products: {'biochemistry.glucose': [{key: 'synthetic-product', type: 'supplement', name: 'Synthetic <product>', brand: 'Fixture brand',
    dosage: 'Synthetic dose', priceEUR: 5, regions: ['INTL'], vendorKey: 'fixture', affiliateUrl: 'https://example.test/product?partner=fixture'}]},
};
async function localSnapshot(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)!])));
}
async function order(page: Page): Promise<string[]> {
  return page.locator('#recommendations-page .lens-page-widgets > [data-widget-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-widget-id')!));
}
async function openTips(page: Page) {
  const closeChat = page.getByRole('button', {name: 'Close chat', exact: true});
  if (await closeChat.isVisible()) await closeChat.click();
  const menu = page.getByRole('button', {name: 'Menu', exact: true});
  if (await menu.isVisible() && !await page.locator('#sidebar-nav').evaluate(node => node.classList.contains('mobile-open'))) await menu.click();
  await page.locator('[data-nav-action="navigate"][data-nav-route="recommendations"]').click();
  const tips = page.locator('#recommendations-page[data-tips-page-view]');
  await expect(tips).toBeVisible();
  await expect(tips.locator('.lens-page-header h2')).toHaveText('Tips');
  await expect(tips.locator('.lens-page-header')).toContainText('Product links stay behind the disclosure.');
  await expect(tips.getByRole('button', {name: 'Disclosure & settings', exact: true})).toBeVisible();
  await expect(tips.locator('article[data-rec-id]').first()).toBeVisible();
  return tips;
}
const activeSections = (page: Page) => page.locator('#recommendations-page .lens-page-widgets > section:not([data-widget-id="recommendations-bookmarks"]):not([data-widget-id="recommendations-dismissed"])');
const activeCard = (page: Page, id: string) => activeSections(page).locator(`article[data-rec-id="${id}"]`);
const hiddenCard = (page: Page, id: string) => page.locator(`#recommendations-page [data-widget-id="recommendations-dismissed"] article[data-rec-id="${id}"]`);
const bookmarkedCard = (page: Page, id: string) => page.locator(`#recommendations-page [data-widget-id="recommendations-bookmarks"] article[data-rec-id="${id}"]`);
async function inspectDetail(page: Page, id: string, seen: boolean, chromium: boolean): Promise<string> {
  const card = seen ? hiddenCard(page, id) : activeCard(page, id);
  const open = card.getByRole('button', {name: 'View options', exact: true});
  await open.focus(); await page.keyboard.press('Enter');
  const modal = page.locator('#detail-modal.recommendation-detail-modal');
  await expect(page.locator('#modal-overlay')).toHaveClass(/\bshow\b/);
  await expect(modal.locator('h3')).toHaveText(topic);
  await expect(modal.locator('.rec-section-header')).toHaveText('Options');
  await expect(modal.locator('img,script,[onclick]')).toHaveCount(0);
  const section = modal.locator('.rec-section[data-tips-view]');
  if (!seen) {
    await expect(modal.locator('.rec-disclosure-banner')).toBeVisible();
    await expect(section).toBeHidden();
    await modal.getByRole('button', {name: 'Got it', exact: true}).click();
    await expect(modal.locator('.rec-disclosure-banner')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('labcharts-rec-disclosure'))).toBe('seen');
  } else await expect(modal.locator('.rec-disclosure-banner')).toHaveCount(0);
  await expect(section).toBeVisible();
  await expect(section).not.toHaveClass(/(?:^|\s)rec-section-gated(?:\s|$)/);
  await expect(section.locator('.rec-item-free')).toHaveText('Synthetic post-meal walk <literal>');
  await expect(section.locator('.rec-product-info')).toContainText('Fixture brand · Synthetic <product>');
  await expect(section.getByRole('link', {name: 'Change country for product tips', exact: true})).toHaveAttribute('href', '#modal-overlay');
  const product = section.locator('.rec-product-link');
  await expect(product).toHaveAttribute('target', '_blank');
  await expect(product).toHaveAttribute('rel', 'noopener sponsored');
  await expect(product).toHaveAttribute('href', /partner=fixture.*utm_source=getbased/);
  const coupon = section.getByRole('button', {name: `Copy coupon code ${couponCode} to clipboard`, exact: true});
  await expect(coupon).toHaveAttribute('data-code', couponCode);
  await coupon.click();
  await expect(coupon).toHaveText(chromium ? '✓ Copied' : /^(✓ Copied|Press Ctrl\+C)$/);
  const copyMode = (await coupon.textContent())!;
  if (chromium) expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(couponCode);
  await expect(coupon).toHaveText(couponCode);
  await modal.locator('[data-recommendation-detail-action="close"]').click();
  await expect(page.locator('#modal-overlay')).not.toHaveClass(/\bshow\b/);
  return copyMode;
}
async function inspectSettingsAndDiscussion(page: Page, id: string) {
  await page.locator('#recommendations-page').getByRole('button', {name: 'Disclosure & settings', exact: true}).click();
  const settings = page.locator('#settings-modal'); await expect(settings).toBeVisible();
  await settings.locator('[data-settings-action="close"]').click();
  await expect(settings).not.toBeVisible();
  await hiddenCard(page, id).getByRole('button', {name: 'Discuss', exact: true}).click();
  await expect(page.locator('#chat-panel')).toHaveClass(/\bopen\b/);
  await expect(page.locator('#chat-input')).toHaveValue(new RegExp('Tip topic: Synthetic glucose <context>'));
  await page.getByRole('button', {name: 'Close chat', exact: true}).click();
  expect(await page.evaluate(() => (window as unknown as {discussionRequests: unknown[]}).discussionRequests)).toEqual([]);
}

test('static Tips detail/catalog actions and complete preference records survive two genuinely disconnected closed-client launches', async ({page, context, browserName}) => {
  test.setTimeout(180000);
  await installDiscussionFixture(context, {provider: 'ollama', paused: true});
  await installDiscussionProvider(context, {seedProvider: false});
  await installOfflineStartupDiagnostics(context);
  const errors: string[] = [], csp: string[] = [], external: string[] = [];
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message));
  observe(page); context.on('page', observe);
  await context.exposeBinding('tipsDetailsCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    void (window as unknown as {tipsDetailsCsp(value: string): Promise<void>}).tipsDetailsCsp(event.violatedDirective);
  }));
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'), [async (request, response) => {
    if (new URL(request.url!, 'http://localhost').pathname !== '/data/recommendations.json') return false;
    response.setHeader('Content-Type', 'application/json'); response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify(catalog)); return true;
  }]);
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== server.origin) {external.push(url.origin + url.pathname); await route.abort();}
    else await route.continue();
  });
  const chromium = browserName === 'chromium';
  if (chromium) await context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: server.origin});
  try {
    await page.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));
    // Seed once before application startup through a same-origin JSON document. Cold clients never reseed.
    await page.goto(server.origin + '/data/recommendations.json');
    await page.evaluate(async defaults => {
      // Provider credentials are seeded once; cold clients retain the encrypted record bytes.
      localStorage.setItem('labcharts-ollama', JSON.stringify({url: 'http://127.0.0.1:11434', model: 'fixture-model', mode: 'ollama'}));
      localStorage.setItem('labcharts-show-product-recs', 'true');
      localStorage.setItem('labcharts-profiles', JSON.stringify([{id: 'default', name: 'Alex', sex: 'male', dob: '1987-11-22', createdAt: 1}]));
      localStorage.setItem('labcharts-active-profile', 'default');
      const profile = {...defaults, profile: {firstName: 'Alex', age: 38}, contextNotes: 'Preserve unrelated Tips context',
        markerNotes: {'thyroid.tsh': 'Preserve unrelated marker note'}, notes: [{date: '2026-07-14', text: 'Preserve unrelated note'}],
        entries: [{date: '2026-06-14', markers: {'biochemistry.glucose': 7, 'lipids.ldl': 4.5, 'iron.ferritin': 12, 'thyroid.tsh': 5.5}},
          {date: '2026-07-14', markers: {'biochemistry.glucose': 8, 'lipids.ldl': 5, 'iron.ferritin': 10, 'thyroid.tsh': 6}}]};
      const request = indexedDB.open('labcharts-blobs', 1);
      request.onupgradeneeded = () => {if (!request.result.objectStoreNames.contains('kv')) request.result.createObjectStore('kv');};
      const db = await new Promise<IDBDatabase>((resolve, reject) => {request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);});
      try {
        const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(JSON.stringify(profile), 'labcharts-default-imported');
        await new Promise<void>((resolve, reject) => {tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);});
      } finally {db.close();}
    }, createDefaultProfileData());
    const loading = [{phase: 'initial-online', readyMs: await ready(page, server.origin)}];
    // Re-enter through the controlled app after installation so its real catalog fetch is cached by the worker.
    loading.push({phase: 'controlled-online', readyMs: await ready(page, server.origin)});
    const profileBefore = await page.evaluate(readComparisonAcceptanceProfile);
    await openTips(page);
    await expect.poll(() => page.evaluate(async () => {
      const response = await caches.match(new URL('/data/recommendations.json', location.href).href);
      if (!response) return null;
      const json = await response.json() as {slots: Record<string, {label: string}>};
      return json.slots['biochemistry.glucose']?.label;
    })).toBe(topic);
    const target = activeSections(page).locator('article[data-rec-id^="labs:"]').filter({has: page.locator('[data-dashboard-rec-action="open-detail"][data-dashboard-rec-slot-key="biochemistry.glucose"]')});
    await expect(target).toHaveCount(1);
    const id = (await target.getAttribute('data-rec-id'))!; expect(id).toBeTruthy();
    await expect(target.locator('.rec-next-head strong')).toHaveText(topic);
    const copyModes = [await inspectDetail(page, id, false, chromium)];
    await activeCard(page, id).getByRole('button', {name: 'Bookmark', exact: true}).click();
    await expect(bookmarkedCard(page, id)).toBeVisible();
    await activeCard(page, id).getByRole('button', {name: 'Hide', exact: true}).click();
    await expect(hiddenCard(page, id)).toBeVisible(); await expect(activeCard(page, id)).toHaveCount(0);
    const originalOrder = await order(page); expect(originalOrder.length).toBeGreaterThan(1);
    const first = page.locator(`#recommendations-page section[data-widget-id="${originalOrder[0]!}"]`);
    await first.getByRole('button', {name: 'Move page section down', exact: true}).focus(); await page.keyboard.press('Enter');
    const persistedOrder = [originalOrder[1]!, originalOrder[0]!, ...originalOrder.slice(2)];
    await expect.poll(() => order(page)).toEqual(persistedOrder);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('labcharts-default-lensPageOrder-recommendations-v1')!))).toEqual(persistedOrder);
    await page.locator('#recommendations-page .lens-page-header').getByRole('button', {name: 'Remove from Dashboard', exact: true}).click();
    await expect(page.locator('#recommendations-page .lens-page-header').getByRole('button', {name: 'Add to Dashboard', exact: true})).toBeVisible();
    await inspectSettingsAndDiscussion(page, id);
    expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(profileBefore);
    const stored = await localSnapshot(page);
    expect(JSON.parse(stored['labcharts-default-recommendations-saved-v1']!)).toEqual([id]);
    expect(JSON.parse(stored['labcharts-default-recommendations-dismissed-v1']!)).toEqual([id]);
    const dashboardKey = Object.keys(stored).filter(key => /^labcharts-default-dashboardWidgetsV\d+$/.test(key));
    expect(dashboardKey).toHaveLength(1);
    expect((JSON.parse(stored[dashboardKey[0]!]!) as {hidden: string[]}).hidden).toContain('recommendations');
    for (const client of context.pages()) await client.close(); expect(context.pages()).toHaveLength(0);
    await server.close();
    // Firefox offline emulation rejects worker navigation while request routing
    // is enabled. Removing interception lets the real offline worker respond.
    if (browserName === 'firefox') {
      await context.unroute('**/*');
      context.on('request', request => {const url = new URL(request.url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== server.origin) external.push(url.origin + url.pathname);});
    }
    // WebKit's emulator rejects even a literal cached navigation without routing;
    // its cold clients still face an actually stopped origin and blocked external requests.
    const browserOfflineEmulation = browserName !== 'webkit';
    if (browserOfflineEmulation) await context.setOffline(true);
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage(); await cold.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));
      loading.push({phase: `disconnected-cold-${launch + 1}`, readyMs: await ready(cold, server.origin)});
      await openTips(cold); expect(await order(cold)).toEqual(persistedOrder);
      await expect(cold.locator('#recommendations-page .lens-page-header').getByRole('button', {name: 'Add to Dashboard', exact: true})).toBeVisible();
      expect(await localSnapshot(cold)).toEqual(stored);
      expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(profileBefore);
      await expect(bookmarkedCard(cold, id)).toBeVisible(); await expect(hiddenCard(cold, id)).toBeVisible();
      copyModes.push(await inspectDetail(cold, id, true, chromium));
      await hiddenCard(cold, id).getByRole('button', {name: 'Show', exact: true}).click();
      await expect(activeCard(cold, id)).toBeVisible();
      await activeCard(cold, id).getByRole('button', {name: 'Hide', exact: true}).click();
      await hiddenCard(cold, id).getByRole('button', {name: 'Bookmarked', exact: true}).click();
      await expect(bookmarkedCard(cold, id)).toHaveCount(0);
      await hiddenCard(cold, id).getByRole('button', {name: 'Bookmark', exact: true}).click();
      await expect(bookmarkedCard(cold, id)).toBeVisible();
      await inspectSettingsAndDiscussion(cold, id);
      expect(await order(cold)).toEqual(persistedOrder);
      expect(await localSnapshot(cold)).toEqual(stored);
      expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(profileBefore);
      for (const client of context.pages()) await client.close(); expect(context.pages()).toHaveLength(0);
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]); expect(external).toEqual([]);
    await fs.writeFile(test.info().outputPath('tips-details-acceptance.json'), JSON.stringify({loading, recommendationId: id, persistedOrder, copyModes,
      originStopped: true, browserOfflineEmulation, profileUnchanged: true, fullLocalStorageUnchangedOnColdLaunches: true, reseededColdClients: false, discussionRequestsSent: 0}, null, 2));
  } finally {
    for (const client of context.pages()) if (!client.isClosed()) await client.close();
    await server.close();
  }
});
