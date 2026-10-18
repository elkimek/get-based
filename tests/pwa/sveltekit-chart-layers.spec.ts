import fs from 'node:fs/promises';
import {expect, test, type Page} from '@playwright/test';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';
import {activate, artifactInputs, cacheReceipt, profile} from './kit-native-receipts.js';

const authored = ['js/chart-layers-presentation.js', 'js/components/ChartLayersDropdown.svelte.html.js'] as const;
// Native public URLs remain checked below; the optimized graph composes these
// genuine child sources instead of importing their unused standalone facades.
const artifactOwners = ['js/chart-layers-presentation.js','js/components/ChartLayersDropdown.svelte'] as const;
const modules = [...artifactOwners, 'js/data-view-controls.js', 'js/state.js'] as const;
const sheets = ['css/category-views.css', 'styles.css', 'css/chat-redesign.css'] as const;
interface ChartLayerChange {action: string | null; checked: boolean; trusted: boolean}
interface ObservedWindow extends Window {
  chartLayersPwaEvent(event: ChartLayerChange): Promise<void>;
  chartLayersPwaCsp(directive: string): Promise<void>;
}
type Artifact = Awaited<ReturnType<typeof artifactInputs>>;
type ProtectedProfile = Awaited<ReturnType<typeof profile>>;
interface Phase {
  phase: number;
  profile: ProtectedProfile;
  overlay: string | null;
}

async function workflow(page: Page) {
  const close = page.getByRole('button', {name: 'Close chat', exact: true});
  if (await close.isVisible()) await activate(page, close);
  const menu = page.getByRole('button', {name: 'Menu', exact: true});
  if (await menu.isVisible()) await activate(page, menu);
  // nav.ts builds this real category shortcut from imported biochemistry data.
  const category = page.locator('#sidebar-nav .nav-item[data-category="biochemistry"][data-nav-action="navigate"]');
  await expect(category).toBeVisible();
  await activate(page, category);
  await expect(category).toHaveClass(/\bactive\b/);
  const trigger = page.locator('.chart-layers-trigger'), dropdown = page.locator('#chart-layers-dropdown');
  await expect(trigger).toBeVisible();
  await expect(dropdown).toBeHidden();
  await activate(page, trigger);
  await expect(dropdown).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(dropdown.locator('.chart-layers-row')).toHaveCount(1);
  const note = page.locator('[data-lab-data-change="set-note-overlay"]');
  await expect(note).not.toBeChecked();
  await activate(page, note);
  await expect(note).toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('labcharts-default-noteOverlay'))).toBe('on');
  // setOverlayMode calls the actual current category; showCategory replaces its
  // complete markup, so locators intentionally resolve the newly rendered nodes.
  await expect(dropdown).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await activate(page, trigger);
  await expect(dropdown).toBeVisible();
  await activate(page, note);
  await expect(note).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('labcharts-default-noteOverlay'))).toBe('off');
  await expect(dropdown).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await activate(page, trigger);
  await expect(dropdown).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dropdown).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
}

test('static Chart Layers first use offline and two zero-page cold launches retain profile and overlay choice', async ({page, context}, info) => {
  test.setTimeout(120000);
  const artifact: Artifact = await artifactInputs(modules, sheets);
  const declarations = await fs.readFile('service-worker-assets.js', 'utf8');
  for (const module of authored) expect(declarations).toContain("'/" + module + "'");
  const seeded = JSON.parse(await fs.readFile(new URL('../fixtures/client-list-overview/pwa-profile.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  expect(Object.keys(seeded)).toHaveLength(39);
  expect(seeded.notes).toHaveLength(1);
  expect(seeded.supplements).toEqual([]);
  expect(seeded.menstrualCycle).toBeNull();
  await installDiscussionFixture(context, {provider: 'openrouter', paused: true});
  await installOfflineStartupDiagnostics(context);
  await context.addInitScript(seeded => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('chart-layers-pwa-seeded')) return;
    localStorage.setItem('chart-layers-pwa-seeded', '1');
    localStorage.setItem('labcharts-theme', 'dark');
    localStorage.setItem('labcharts-profiles', JSON.stringify([{id: 'default', name: 'Synthetic chart profile', sex: 'male', dob: '1987-11-22', createdAt: 1}]));
    localStorage.setItem('labcharts-active-profile', 'default');
    localStorage.setItem('labcharts-default-imported', JSON.stringify(seeded));
    localStorage.setItem('labcharts-default-noteOverlay', 'off');
    localStorage.setItem('labcharts-analytics-disabled', 'true');
    localStorage.setItem('labcharts-show-product-recs', 'false');
    // Existing returning-user fixture uses actual walltime and ordinary startup.
    localStorage.setItem('labcharts-last-manual-backup', new Date().toISOString());
  }, seeded);
  const errors: string[] = [], external: string[] = [], events: ChartLayerChange[] = [], csp: string[] = [];
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message));
  observe(page); context.on('page', observe);
  await context.exposeBinding('chartLayersPwaEvent', (_, event: ChartLayerChange) => events.push(event));
  await context.exposeBinding('chartLayersPwaCsp', (_, directive: string) => csp.push(directive));
  await context.addInitScript(() => {
    const observed = window as unknown as ObservedWindow;
    document.addEventListener('change', event => {
      const element = event.target;
      if (element instanceof HTMLInputElement && element.hasAttribute('data-lab-data-change'))
        void observed.chartLayersPwaEvent({action: element.getAttribute('data-lab-data-change'), checked: element.checked, trusted: event.isTrusted});
    }, true);
    document.addEventListener('securitypolicyviolation', event => {void observed.chartLayersPwaCsp(event.violatedDirective);});
  });
  const server = await startKitServer(artifact.directory);
  let stopped = false;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== server.origin) {external.push(url.href); await route.abort();}
    else await route.continue();
  });
  const phases: Phase[] = [];
  try {
    await ready(page, server.origin); await ready(page, server.origin);
    await expect(page.locator('.chart-layers-trigger')).toHaveCount(0);
    const before = await profile(page, artifact.state), cache = await cacheReceipt(page, artifact);
    expect(before.stored).toEqual(seeded);
    await server.close(); stopped = true;
    await expect(fetch(server.origin + '/index.html')).rejects.toThrow();
    for (let phase = 0; phase < 3; phase++) {
      if (phase) {expect(context.pages()).toHaveLength(0); page = await context.newPage(); await ready(page, server.origin);}
      expect(await profile(page, artifact.state)).toEqual(before);
      await workflow(page);
      expect(await profile(page, artifact.state)).toEqual(before);
      expect(await cacheReceipt(page, artifact)).toEqual(cache);
      phases.push({phase, profile: await profile(page, artifact.state),
        overlay: await page.evaluate(() => localStorage.getItem('labcharts-default-noteOverlay'))});
      await page.close();
      expect(context.pages()).toHaveLength(0);
    }
    expect(events).toEqual(Array.from({length: 3}, () => [
      {action: 'set-note-overlay', checked: true, trusted: true},
      {action: 'set-note-overlay', checked: false, trusted: true},
    ]).flat());
    expect(errors).toEqual([]); expect(csp).toEqual([]); expect(external).toEqual([]);
    expect(await artifactInputs(modules, sheets)).toEqual(artifact);
    await info.attach('chart-layers-offline-cold-acceptance', {
      body: JSON.stringify({artifact, before, cache, phases, events, errors, csp, external,
        boundary: 'Actual static app route; first Notes layer construction with stopped origin and two zero-page cold launches. Real checkbox changes persist on/off through category reconstruction; Escape restores trigger focus. Whole 39-field committed profile and native IDB/registry receipt exact. Source-map-bound two new modules and exact cached bytes; established test-only worker/version seam. Discussion fixture paused. Native separate fixture covers Supplements/Cycle and three layouts. Four existing headless projects; no OS install, physical hardware, provider or whole-app acceptance.'}, null, 2),
      contentType: 'application/json',
    });
  } finally {if (!stopped) await server.close();}
});
