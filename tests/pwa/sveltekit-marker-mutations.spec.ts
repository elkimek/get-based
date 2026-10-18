import fs from 'node:fs/promises';
import {expect, test, type Page} from '@playwright/test';
import {startKitServer} from './kit-server.js';
import {activate, artifactInputs, profile} from './kit-native-receipts.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';

const glucose = 'biochemistry_glucose', movedGlucose = 'lipids_glucose';
const custom = 'biochemistry_syntheticManualMarker', customKey = 'biochemistry.syntheticManualMarker';
const date = '2026-08-02', glucoseNote = 'Manual glucose <literal> & fasting', customNote = 'Custom <literal> & durable';
const mutationTime = Date.parse('2026-10-17T12:00:00Z');
const modules = ['js/state.js', 'js/marker-detail-modal-impl.js', 'js/marker-detail-editing.js',
  'js/marker-detail-store.js', 'js/marker-detail-custom-markers.js', 'js/marker-detail-placement.js',
  'js/category-customization.js', 'js/components/ManualMarkerEntry.svelte.html.js',
  'js/components/CustomMarkerForm.svelte.html.js'] as const;
const sheets = ['css/marker-detail-modal.css', 'css/modal-shared.css', 'css/category-views.css', 'styles.css'] as const;
type Receipt = Awaited<ReturnType<typeof profile>>;
interface Entry {date: string; markers: Record<string, number>; updatedAt?: number; context?: Record<string, unknown>; markerSources?: Record<string, {file: null; at: number}>}
interface MutationData extends Record<string, unknown> {
  entries: Entry[]; manualValues: Record<string, unknown>; markerValueNotes: Record<string, unknown>;
  refOverrides: Record<string, unknown>; customMarkers: Record<string, Record<string, unknown>>;
  markerPlacements: Record<string, unknown>; markerLabels?: Record<string, unknown>;
}
interface NativeEvent {type: string; action: string | null; id: string; key: string | null; trusted: boolean}
interface ObservedWindow extends Window {markerMutationEvent(value: NativeEvent): Promise<void>; markerMutationCsp(value: string): Promise<void>}
const data = (receipt: Receipt) => receipt.stored as MutationData;
const action = (name: string) => '#detail-modal [data-marker-detail-action="' + name + '"]';
async function sidebar(page: Page) {
  const close = page.getByRole('button', {name: 'Close chat', exact: true}); if (await close.isVisible()) await activate(page, close);
  const menu = page.getByRole('button', {name: 'Menu', exact: true});
  if (await menu.isVisible() && !await page.locator('#sidebar-nav').evaluate(node => node.classList.contains('mobile-open'))) await activate(page, menu);
}
async function openMarker(page: Page, category: string, id: string, name: string) {
  await sidebar(page);
  const nav = page.locator('#sidebar-nav .nav-item[data-nav-action="navigate"][data-category="' + category + '"]');
  await activate(page, nav);
  await activate(page, page.locator('#main-content .chart-card-main[data-marker-detail-id="' + id + '"]'));
  await expect(page.locator('#detail-modal')).toHaveAttribute('data-sync-refresh-item-id', id);
  await expect(page.locator('#detail-modal h3')).toContainText(name);
}
async function closeMarker(page: Page) {
  await page.keyboard.press('Escape'); await expect(page.locator('#modal-overlay')).toBeHidden();
}
async function fillManual(page: Page, value: string, note: string) {
  await expect(page.locator('#me-value')).toBeFocused();
  await page.locator('#me-date').fill(date); await page.locator('#me-value').fill(value);
  await page.locator('#me-sample-time').fill('08:15'); await page.locator('#me-fasting').selectOption('fasting');
  await page.locator('#me-note').fill('  ' + note + '  ');
}
async function historyValue(page: Page, id: string, expected: string) {
  await expect(page.locator('#detail-modal')).toHaveAttribute('data-sync-refresh-item-id', id);
  await expect(page.locator(action('edit-marker-value') + '[data-marker-detail-date="' + date + '"]')).toContainText(expected);
}
function protectedFields(value: Record<string, unknown>) {
  const allowed = new Set(['entries', 'manualValues', 'markerValueNotes', 'refOverrides', 'customMarkers', 'markerPlacements', 'markerLabels']);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !allowed.has(key)));
}

test('static public marker actions persist manual values, custom edits, reference ranges and canonical placement through an offline cold launch', async ({page, context}, info) => {
  test.setTimeout(180000);
  const artifact = await artifactInputs(modules, sheets);
  const seeded = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-profile.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  seeded.entries = [{date: '2026-08-01', markers: {'biochemistry.glucose': 5.2, 'lipids.cholesterol': 4.4}}];
  seeded.customMarkers = {}; seeded.markerPlacements = {}; seeded.markerLabels = {};
  const registry = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-registry.json', import.meta.url), 'utf8')) as Record<string, unknown>[];
  await installDiscussionFixture(context, {provider: 'openrouter', paused: true}); await installOfflineStartupDiagnostics(context);
  const foreign = '{"synthetic":"unrelated profile bytes <&>","entries":[]}';
  await context.addInitScript(({seeded, registry, foreign}) => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('marker-mutation-seeded')) return;
    localStorage.setItem('marker-mutation-seeded', '1'); localStorage.setItem('labcharts-theme', 'dark');
    localStorage.setItem('labcharts-encryption-enabled', 'false'); localStorage.setItem('labcharts-profiles', JSON.stringify(registry));
    localStorage.setItem('labcharts-active-profile', 'default'); localStorage.setItem('labcharts-default-imported', JSON.stringify(seeded));
    localStorage.setItem('labcharts-inactive-synthetic-imported', foreign);
    localStorage.setItem('labcharts-default-units', 'EU'); localStorage.setItem('labcharts-default-rangeMode', 'both');
    localStorage.setItem('labcharts-analytics-disabled', 'true'); localStorage.setItem('labcharts-show-product-recs', 'false');
    localStorage.setItem('labcharts-last-manual-backup', new Date().toISOString());
  }, {seeded, registry, foreign});
  const errors: string[] = [], csp: string[] = [], external: string[] = [], events: NativeEvent[] = [];
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message)); observe(page); context.on('page', observe);
  await context.exposeBinding('markerMutationEvent', (_, value: NativeEvent) => {events.push(value);});
  await context.exposeBinding('markerMutationCsp', (_, value: string) => {csp.push(value);});
  await context.addInitScript(() => {
    const observed = window as unknown as ObservedWindow;
    for (const type of ['click', 'keydown']) document.addEventListener(type, event => {
      if (!(event.target instanceof Element)) return;
      if (event instanceof KeyboardEvent && event.key !== 'Enter') return;
      const control = event.target.closest('[data-marker-detail-action]');
      if (!control && event.target.id !== 'me-value' && event.target.id !== 'prompt-dialog-input') return;
      void observed.markerMutationEvent({type, action: control?.getAttribute('data-marker-detail-action') ?? null,
        id: event.target.id, key: event instanceof KeyboardEvent ? event.key : null, trusted: event.isTrusted});
    }, true);
    document.addEventListener('securitypolicyviolation', event => {void observed.markerMutationCsp(event.violatedDirective);});
  });
  const server = await startKitServer(artifact.directory); let stopped = false;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== server.origin) {external.push(url.href); await route.abort();}
    else await route.continue();
  });
  let before: Receipt | null = null, saved: Receipt | null = null;
  try {
    await ready(page, server.origin); before = await profile(page, artifact.state);
    expect(before.live).toEqual(before.stored); expect(before.stored).toEqual(seeded);
    expect(before.profiles).toEqual(registry);
    expect(before.stored).not.toHaveProperty('_deletedClearedAt');
    await page.clock.setFixedTime(new Date(mutationTime));
    const minimum = await page.evaluate(() => Date.now()); expect(minimum).toBe(mutationTime);
    await openMarker(page, 'biochemistry', glucose, 'Glucose');
    await activate(page, page.locator(action('open-manual-entry'))); await fillManual(page, '5.6', glucoseNote);
    await page.locator('#me-value').press('Enter'); await historyValue(page, glucose, '5.6');
    await expect.poll(async () => data(await profile(page, artifact.state)).entries.find(entry => entry.date === date)?.markers['biochemistry.glucose']).toBe(5.6);
    await expect(page.locator('#detail-modal .mv-collection-context').first()).toContainText('Collected 08:15');
    await expect(page.locator('#detail-modal .mv-value-note-text').filter({hasText: glucoseNote})).toHaveText(glucoseNote);

    await activate(page, page.locator(action('edit-ref-range') + '[data-marker-detail-type="ref"]'));
    await page.locator('#ref-edit-min').fill('4'); await page.locator('#ref-edit-max').fill('6.2');
    await activate(page, page.locator(action('save-ref-range')));
    await expect(page.locator('#ref-edit-min')).toHaveCount(0);
    await expect.poll(async () => data(await profile(page, artifact.state)).refOverrides['biochemistry.glucose']).toEqual({refMin: 4, refMax: 6.2, refSource: 'manual'});
    await activate(page, page.locator(action('open-marker-placement')));
    await page.locator('#marker-placement-category').selectOption('lipids');
    await activate(page, page.locator(action('save-marker-placement')));
    await historyValue(page, movedGlucose, '5.6'); await expect(page.locator('#detail-modal')).toContainText('Originally Biochemistry');
    await closeMarker(page);

    await sidebar(page); await activate(page, page.locator('#sidebar-nav .sidebar-add-marker[data-nav-action="open-custom-marker"]'));
    await expect(page.locator('#sidebar-nav')).not.toHaveClass(/\bmobile-open\b/);
    await expect(page.locator('#sidebar-backdrop')).toBeHidden();
    await expect(page.locator('#modal-overlay')).toBeVisible();
    // Native actionability verifies the mobile navigation cannot intercept Save.
    await page.locator(action('save-custom-marker')).click({trial: true});
    await expect(page.locator('#cm-name')).toBeFocused(); await page.locator('#cm-category').selectOption('biochemistry');
    await page.locator('#cm-name').fill('Synthetic Manual Marker'); await page.locator('#cm-unit').fill('AU');
    await page.locator('#cm-ref-min').fill('1'); await page.locator('#cm-ref-max').fill('10');
    await page.locator('#cm-opt-min').fill('2'); await page.locator('#cm-opt-max').fill('8');
    await activate(page, page.locator(action('save-custom-marker')));
    await fillManual(page, '3.5', customNote); await activate(page, page.locator(action('save-manual-entry')));
    await historyValue(page, custom, '3.5');
    await activate(page, page.locator(action('edit-marker-value') + '[data-marker-detail-date="' + date + '"]'));
    const edit = page.locator('#detail-modal .mv-value input.ref-edit-input'); await expect(edit).toBeFocused();
    await edit.fill('4.25'); await edit.press('Enter'); await historyValue(page, custom, '4.25');
    await activate(page, page.locator(action('rename-marker')));
    await expect(page.locator('#prompt-dialog-input')).toBeFocused(); await page.locator('#prompt-dialog-input').fill('Synthetic Renamed Marker');
    await page.locator('#prompt-dialog-input').press('Enter');
    await expect(page.locator('#detail-modal h3')).toContainText('Synthetic Renamed Marker');
    const maximum = await page.evaluate(() => Date.now()); expect(maximum).toBe(mutationTime);
    await expect.poll(async () => data(await profile(page, artifact.state)).markerLabels?.[customKey]).toBe('Synthetic Renamed Marker');
    saved = await profile(page, artifact.state); expect(saved.live).toEqual(saved.stored);
    const committed = data(saved), customDefinition = committed.customMarkers[customKey]; expect(customDefinition).toBeDefined();
    expect(customDefinition!.markerId).toMatch(/^custom:[a-f0-9]{32}$/);
    expect(committed.customMarkers).toEqual({[customKey]: {markerId: customDefinition!.markerId, name: 'Synthetic Manual Marker', unit: 'AU', refMin: 1, refMax: 10, categoryLabel: 'Biochemistry'}});
    expect(committed.refOverrides).toEqual({...data(before).refOverrides,
      'biochemistry.glucose': {refMin: 4, refMax: 6.2, refSource: 'manual'}, [customKey]: {optimalMin: 2, optimalMax: 8}});
    expect(committed.markerPlacements).toEqual({'gb:marker:glucose': {categoryKey: 'lipids'}});
    expect(committed.markerLabels).toEqual({[customKey]: 'Synthetic Renamed Marker'});
    expect(committed.manualValues).toEqual({['biochemistry.glucose:' + date]: true, [customKey + ':' + date]: true});
    expect(committed.markerValueNotes).toEqual({['biochemistry.glucose:' + date]: glucoseNote, [customKey + ':' + date]: customNote});
    expect(committed.entries).toHaveLength(2); expect(committed.entries.find(entry => entry.date === '2026-08-01')).toEqual(data(before).entries[0]);
    const entered = committed.entries.find(entry => entry.date === date)!; expect(entered).toBeDefined();
    expect(entered.markers).toEqual({'biochemistry.glucose': 5.6, [customKey]: 4.25});
    expect(entered.context).toEqual({sampleTime: '08:15', fasting: true});
    expect(Object.keys(entered.markerSources ?? {}).sort()).toEqual(['biochemistry.glucose', customKey].sort());
    for (const source of Object.values(entered.markerSources!)) {expect(source.file).toBeNull(); expect(source.at).toBeGreaterThanOrEqual(minimum); expect(source.at).toBeLessThanOrEqual(maximum);}
    expect(entered.updatedAt).toBeGreaterThanOrEqual(minimum); expect(entered.updatedAt).toBeLessThanOrEqual(maximum);
    // Explicit manual entry clears this date's row tombstone for sync peers.
    // The fixed clock qualifies its exact metadata while every other protected
    // field and all other tombstone paths/dates remain checked by full equality.
    expect(protectedFields(committed)).toEqual({...protectedFields(before.stored),
      _deletedClearedAt: {entries: {[date]: mutationTime}}});
    const finalRegistry = saved.profiles as Record<string, unknown>[];
    expect(finalRegistry).toHaveLength(registry.length);
    for (const original of registry) {
      const row = finalRegistry.find(value => value.id === original.id)!;
      if (original.id === 'default') {expect({...row, lastUpdated: original.lastUpdated}).toEqual(original); expect(row.lastUpdated).toBeGreaterThanOrEqual(minimum); expect(row.lastUpdated).toBeLessThanOrEqual(maximum);}
      else expect(row).toEqual(original);
    }
    expect(await page.evaluate(() => localStorage.getItem('labcharts-inactive-synthetic-imported'))).toBe(foreign);
    await closeMarker(page); await server.close(); stopped = true; await expect(fetch(server.origin + '/index.html')).rejects.toThrow();
    await page.close(); expect(context.pages()).toHaveLength(0); page = await context.newPage(); await ready(page, server.origin);
    expect(await profile(page, artifact.state)).toEqual(saved);
    await openMarker(page, 'lipids', movedGlucose, 'Glucose'); await historyValue(page, movedGlucose, '5.6');
    await expect(page.locator('#detail-modal')).toContainText('Originally Biochemistry');
    await expect(page.locator(action('edit-ref-range') + '[data-marker-detail-type="ref"]')).toHaveAttribute('aria-label', 'Edit Reference range, currently 4 to 6.2');
    await closeMarker(page); await openMarker(page, 'biochemistry', custom, 'Synthetic Renamed Marker'); await historyValue(page, custom, '4.25');
    await expect(page.locator('#detail-modal .mv-value-note-text').filter({hasText: customNote})).toHaveText(customNote);
    expect(await profile(page, artifact.state)).toEqual(saved);
    expect(await page.evaluate(() => localStorage.getItem('labcharts-inactive-synthetic-imported'))).toBe(foreign);
    for (const name of ['save-custom-marker', 'save-manual-entry', 'edit-marker-value', 'save-ref-range', 'save-marker-placement', 'rename-marker'])
      expect(events.filter(event => event.type === 'click' && event.action === name)).toEqual([{type: 'click', action: name, id: '', key: null, trusted: true}]);
    expect(events.some(event => event.type === 'keydown' && event.id === 'me-value' && event.key === 'Enter' && event.trusted)).toBe(true);
    expect(events.some(event => event.type === 'keydown' && event.id === 'prompt-dialog-input' && event.key === 'Enter' && event.trusted)).toBe(true);
    expect(errors).toEqual([]); expect(csp).toEqual([]); expect(external).toEqual([]);
    expect(await artifactInputs(modules, sheets)).toEqual(artifact);
  } finally {
    await info.attach('static-marker-mutation-receipt', {body: JSON.stringify({artifact, before, saved, events, errors, csp, external, stopped,
      boundary: 'Actual static app, native delegated pointer/touch and Enter mutations, complete live/committed IDB profile, canonical source keys, unrelated registry/profile protection and zero-page offline cold launch with stopped HTTP listener. Synthetic prebootstrap unencrypted profile, paused credential-free AI and existing kit-test-a worker/version seam. No direct mutation-function calls, backend, provider, physical install or full-app acceptance.'}, null, 2), contentType: 'application/json'});
    if (!stopped) await server.close();
  }
});
