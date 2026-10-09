import path from 'node:path';
import fs from 'node:fs/promises';
import {expect, test, type Page} from '@playwright/test';
import {createDefaultProfileData, migrateProfileData} from '../../js/profile.js';
import type {ProfileData} from '../../types/app-state.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readComparisonAcceptanceProfile} from '../helpers/nutrition-comparison-fixture.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';

const FIXED_ISO = '2026-08-07T12:00:00.000Z';
const FIXED_TIME = Date.parse(FIXED_ISO);
const FILE_NAME = 'drip-static-synthetic.csv';
const IMPORT_ID = `drip-${FIXED_TIME}-drip-static-synthetic-csv`;
const DRIP_CSV = [
  'date,temperature.value,temperature.exclude,bleeding.value,bleeding.exclude,note.value,pain.cramps,mood.fatigue',
  '2026-04-01,36.55,false,1,false,start,true,true',
  '2026-04-02,36.62,false,3,false,heavy,false,false',
  '2026-04-03,36.68,false,2,true,excluded,false,false',
  '2026-05-01,36.48,false,2,false,next,false,false',
].join('\n');
const MANUAL_PERIOD = {id: 'period:manual:2026-04-01', startDate: '2026-04-01', endDate: '2026-04-04', flow: 'moderate', symptoms: ['Keep manual symptom'], source: 'manual', confidence: 'observed', updatedAt: '2026-04-05T00:00:00.000Z', notes: 'Keep manual Cycle note'};
interface CycleCompact extends Record<string, unknown> {
  periods: Record<string, unknown>[];
  coverage: {periodCount: number; observationCount: number; firstDate: string; lastDate: string; sources: Record<string, Record<string, unknown>>};
}
interface ProfileRecords extends Record<string, unknown> {menstrualCycle: CycleCompact; changeHistory: unknown[]}
interface CycleStoreSnapshot {daily: Record<string, unknown>[]; imports: Record<string, unknown>[]; meta: Record<string, unknown>[]}
async function profile(page: Page): Promise<ProfileRecords> {
  return await page.evaluate(readComparisonAcceptanceProfile) as ProfileRecords;
}

/** Inspect committed browser storage only; never load application modules or create a fixture database. */
async function cycleStore(page: Page): Promise<CycleStoreSnapshot> {
  return page.evaluate(async () => {
    const name = 'labcharts-cycle-default';
    if (!(await indexedDB.databases()).some(database => database.name === name)) return {daily: [], imports: [], meta: []};
    const open = indexedDB.open(name);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
      open.onupgradeneeded = () => {open.transaction?.abort(); reject(new Error('Cycle acceptance must not create or upgrade storage'));};
    });
    try {
      const tx = db.transaction(['daily-observations', 'imports', 'meta'], 'readonly');
      const daily = tx.objectStore('daily-observations').getAll();
      const imports = tx.objectStore('imports').getAll();
      const meta = tx.objectStore('meta').getAll();
      return await new Promise<CycleStoreSnapshot>((resolve, reject) => {
        tx.oncomplete = () => resolve({daily: daily.result, imports: imports.result, meta: meta.result});
        tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error || daily.error || imports.error || meta.error);
      });
    } finally {db.close();}
  });
}

async function openBody(page: Page) {
  const chat = page.getByRole('button', {name: 'Close chat', exact: true});
  if (await chat.isVisible()) await chat.click();
  const menu = page.getByRole('button', {name: 'Menu', exact: true});
  if (await menu.isVisible() && !await page.locator('#sidebar-nav').evaluate(node => node.classList.contains('mobile-open'))) await menu.click();
  await page.locator('[data-nav-action="navigate"][data-nav-route="body"]').click();
  await expect(page.locator('.lens-page-header h2')).toHaveText('Body');
  await expect(page.locator('.lens-page-widgets[data-lens-route="body"] [data-widget-id="cycle"] .cycle-section')).toBeVisible();
}
async function openEditor(page: Page) {
  await openBody(page);
  await page.locator('.lens-page-widgets[data-lens-route="body"] [data-widget-id="cycle"] [data-cycle-action="open-editor"]').first().click();
  const editor = page.locator('#modal-overlay.show #detail-modal.cycle-modal');
  await expect(editor).toBeVisible();
  await expect(editor.locator('.gb-modal-title')).toHaveText('Menstrual Cycle');
  return editor;
}
async function inspectCoverage(page: Page, imported: boolean) {
  const editor = page.locator('#modal-overlay.show #detail-modal.cycle-modal');
  await expect(editor).toBeVisible();
  const coverage = editor.locator('.cycle-import-summary-section[data-cycle-import-view]');
  await expect(coverage).toBeVisible();
  await expect(coverage.locator('.cycle-editor-section-title')).toHaveText('Import Coverage');
  await expect(coverage.locator('.cycle-source-row').filter({has: page.getByText('Manual', {exact: true})})).toContainText('1 periods / 0 local observations');
  await expect(coverage.locator('[data-cycle-import-action="delete-source"][data-cycle-import-source="manual"]')).toHaveCount(0);
  const drip = coverage.locator('.cycle-source-row').filter({has: page.getByText('Drip', {exact: true})});
  if (imported) {
    await expect(coverage.locator('.cycle-import-coverage')).toContainText('2 observed periods');
    await expect(coverage.locator('.cycle-import-coverage')).toContainText('4 local daily observations');
    await expect(drip).toContainText('1 periods / 4 local observations');
    await expect(drip.getByRole('button', {name: 'Remove batch 1', exact: true})).toHaveAttribute('data-cycle-import-import-id', IMPORT_ID);
    await expect(drip.getByRole('button', {name: 'Remove Drip cycle data', exact: true})).toBeVisible();
  } else {
    await expect(coverage.locator('.cycle-import-coverage')).toContainText('1 observed periods');
    await expect(coverage.locator('.cycle-import-coverage')).toContainText('0 local daily observations');
    await expect(drip).toHaveCount(0);
    await expect(coverage.locator('[data-cycle-import-action="delete-import"]')).toHaveCount(0);
  }
  await expect(editor.locator('#mc-period-log-section')).toContainText('Keep manual Cycle note');
  return coverage;
}
async function chooseImport(page: Page) {
  const widget = page.locator('.lens-page-widgets[data-lens-route="body"] [data-widget-id="cycle"]');
  const picker = widget.getByRole('button', {name: 'Import cycle data', exact: true});
  await expect(picker).toHaveAttribute('data-cycle-import-view');
  const input = widget.locator('input.cycle-import-file-input[data-cycle-import-action="select-file"]');
  await expect(input).toBeHidden();
  await expect(input).toHaveAttribute('accept', '.csv,.json,.cluedata,.xml,.zip,text/csv,application/json,application/xml,text/xml,application/zip');
  const chooser = page.waitForEvent('filechooser');
  await picker.click();
  await (await chooser).setFiles({name: FILE_NAME, mimeType: 'text/csv', buffer: Buffer.from(DRIP_CSV)});
  const preview = page.locator('#import-modal-overlay.show #import-modal[data-cycle-import-view]');
  await expect(preview).toBeVisible();
  await expect(preview).not.toHaveAttribute('data-import-review-view');
  await expect(preview.locator('.gb-modal-title')).toHaveText('Review cycle import');
  await expect(preview.locator('.import-review-file').first().locator('strong')).toHaveText(FILE_NAME);
  await expect(preview.locator('.import-review-stats')).toContainText('4 daily observations');
  await expect(preview.locator('.import-review-stats')).toContainText('2 periods found');
  await expect(preview.locator('.import-review-warning')).toContainText('1 imported period overlaps existing entries.');
  await expect(preview.locator('tbody tr')).toHaveCount(2);
  await expect(preview.locator('.cycle-import-row-status-ready')).toHaveCount(1);
  await expect(preview.locator('.cycle-import-privacy-note')).toContainText('Daily details stay on this device.');
  await expect(preview.locator('img,script,[onclick]')).toHaveCount(0);
  const keep = preview.getByRole('radio', {name: 'Keep existing', exact: false});
  const replace = preview.getByRole('radio', {name: 'Replace overlaps', exact: false});
  const confirm = preview.locator('[data-cycle-import-action="confirm"]');
  await expect(keep).toBeChecked(); await expect(replace).not.toBeChecked();
  await expect(preview.locator('.cycle-import-row-status-conflict')).toHaveText('Overlap · skip');
  await expect(confirm).toHaveText('Import 1 period');
  await replace.check();
  await expect(replace).toBeChecked(); await expect(keep).not.toBeChecked();
  await expect(preview.locator('.cycle-import-row-status-conflict')).toHaveText('Overlap · replace');
  await expect(confirm).toHaveText('Import 2 periods');
  await keep.check();
  await expect(keep).toBeChecked(); await expect(replace).not.toBeChecked();
  await expect(preview.locator('.cycle-import-row-status-conflict')).toHaveText('Overlap · skip');
  await expect(confirm).toHaveText('Import 1 period');
  return preview;
}

function assertExpectedMutation(before: ProfileRecords, actual: ProfileRecords) {
  expect(actual).toEqual({...before, menstrualCycle: actual.menstrualCycle, changeHistory: actual.changeHistory});
  expect(actual.menstrualCycle.periods.filter(period => period.source === 'manual')).toEqual([MANUAL_PERIOD]);
  expect(actual.menstrualCycle).toMatchObject({cycleStatus: 'regular', conditions: 'Keep synthetic Cycle context', contraceptive: ''});
  expect(actual.changeHistory).toEqual([...before.changeHistory, {field: 'menstrualCycle', date: '2026-08-07', snapshot: actual.menstrualCycle, updatedAt: FIXED_TIME}]);
}

test('static authored Cycle import, conflict choices and batch removal persist across two closed-client offline launches', async ({page, context, browserName}) => {
  test.setTimeout(180000);
  await installDiscussionFixture(context, {provider: 'openrouter', paused: true});
  await installOfflineStartupDiagnostics(context);
  const demo = JSON.parse(await fs.readFile('data/demo-male.json', 'utf8')) as Pick<ProfileData, 'entries' | 'refOverrides'>;
  // Seed the same canonical representation loadProfile adopts in memory. Legacy demo
  // values otherwise first reach committed storage when an unrelated Cycle save occurs.
  const profileData = migrateProfileData({...createDefaultProfileData(), entries: demo.entries, refOverrides: demo.refOverrides,
    profile: {firstName: 'Alex', age: 38}, contextNotes: 'Keep unrelated Cycle context', markerNotes: {'thyroid.tsh': 'Keep unrelated marker note'}, notes: [{date: '2026-07-14', text: 'Keep unrelated Cycle note'}],
    changeHistory: [{field: 'contextNotes', date: '2026-07-14', snapshot: 'Keep unrelated Cycle context', updatedAt: 1}],
    menstrualCycle: {cycleStatus: 'regular', conditions: 'Keep synthetic Cycle context', contraceptive: '', periods: [MANUAL_PERIOD]},
  });
  await context.addInitScript(profileData => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('static-cycle-seeded')) return;
    localStorage.setItem('static-cycle-seeded', '1');
    localStorage.setItem('labcharts-profiles', JSON.stringify([{id: 'default', name: 'Alex', sex: 'female', dob: '1987-11-22', createdAt: 1}]));
    localStorage.setItem('labcharts-active-profile', 'default');
    localStorage.setItem('labcharts-default-imported', JSON.stringify(profileData));
  }, profileData);
  const errors: string[] = [], csp: string[] = [], external: string[] = [];
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message));
  observe(page); context.on('page', observe);
  await context.exposeBinding('staticCycleCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    void (window as unknown as {staticCycleCsp(value: string): Promise<void>}).staticCycleCsp(event.violatedDirective);
  }));
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== server.origin) {external.push(url.origin + url.pathname); await route.abort();}
    else await route.continue();
  });
  try {
    await page.clock.setFixedTime(new Date(FIXED_ISO));
    const loading = [{phase: 'initial-online', readyMs: await ready(page, server.origin)}];
    const before = await profile(page);
    const originalProfiles = await page.evaluate(() => JSON.parse(localStorage.getItem('labcharts-profiles') || '[]') as Record<string, unknown>[]);
    await openEditor(page); await inspectCoverage(page, false);
    await page.getByRole('button', {name: 'Close cycle editor', exact: true}).click();
    expect(await profile(page)).toEqual(before);
    const initialStore = await cycleStore(page);
    expect(initialStore.daily).toEqual([]); expect(initialStore.imports).toEqual([]);
    let preview = await chooseImport(page);
    await preview.getByRole('button', {name: 'Close import preview', exact: true}).click();
    await expect(page.locator('#import-modal-overlay')).not.toHaveClass(/\bshow\b/);
    expect(await profile(page)).toEqual(before); expect(await cycleStore(page)).toEqual(initialStore);
    preview = await chooseImport(page);
    expect(await profile(page)).toEqual(before); expect(await cycleStore(page)).toEqual(initialStore);
    await preview.locator('[data-cycle-import-action="confirm"]').click();
    await expect(page.locator('#import-modal-overlay')).not.toHaveClass(/\bshow\b/);
    await expect(page.locator('#modal-overlay.show #detail-modal.cycle-modal')).toBeVisible();
    await inspectCoverage(page, true);
    const committed = await profile(page), committedStore = await cycleStore(page);
    assertExpectedMutation(before, committed);
    expect(committed.menstrualCycle.periods).toEqual([MANUAL_PERIOD, {id: 'period:drip:2026-05-01', startDate: '2026-05-01', endDate: '2026-05-01', flow: 'moderate', symptoms: [], source: 'drip', confidence: 'observed', updatedAt: FIXED_ISO, importId: IMPORT_ID}]);
    expect(committed.menstrualCycle.coverage).toMatchObject({periodCount: 2, observationCount: 4, firstDate: '2026-04-01', lastDate: '2026-05-01', sources: {drip: {periods: 1, observations: 4, importIds: [IMPORT_ID]}}});
    expect(committedStore.daily).toEqual([
      {source: 'drip', date: '2026-04-01', importId: IMPORT_ID, importedAt: FIXED_TIME, bleeding: {flow: 'light', excluded: false}, symptoms: ['Cramps', 'Fatigue'], bbtC: 36.55, note: 'start'},
      {source: 'drip', date: '2026-04-02', importId: IMPORT_ID, importedAt: FIXED_TIME, bleeding: {flow: 'heavy', excluded: false}, bbtC: 36.62, note: 'heavy'},
      {source: 'drip', date: '2026-04-03', importId: IMPORT_ID, importedAt: FIXED_TIME, bleeding: {flow: 'moderate', excluded: true}, bbtC: 36.68, note: 'excluded'},
      {source: 'drip', date: '2026-05-01', importId: IMPORT_ID, importedAt: FIXED_TIME, bleeding: {flow: 'moderate', excluded: false}, bbtC: 36.48, note: 'next'},
    ]);
    expect(committedStore.imports).toEqual([{importId: IMPORT_ID, source: 'drip', sourceFile: FILE_NAME, importedAt: FIXED_ISO, observationCount: 4, periodCount: 2, detectedRange: {firstDate: '2026-04-01', lastDate: '2026-05-01'}}]);
    expect(committedStore.meta).toEqual(initialStore.meta);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('labcharts-profiles') || '[]'))).toEqual(originalProfiles.map(entry => ({...entry, lastUpdated: FIXED_TIME})));
    await page.close();
    expect(context.pages()).toHaveLength(0);
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

    const cold = await context.newPage();
    await cold.clock.setFixedTime(new Date(FIXED_ISO));
    loading.push({phase: 'offline-cold-1', readyMs: await ready(cold, server.origin)});
    expect(await profile(cold)).toEqual(committed); expect(await cycleStore(cold)).toEqual(committedStore);
    await openEditor(cold);
    const coverage = await inspectCoverage(cold, true);
    const remove = coverage.locator(`[data-cycle-import-action="delete-import"][data-cycle-import-import-id="${IMPORT_ID}"]`);
    await remove.click();
    const confirmation = cold.locator('#confirm-dialog-overlay.show [role="alertdialog"]');
    await expect(confirmation).toBeVisible();
    await expect(confirmation.locator('.confirm-message')).toHaveText('Remove this imported cycle batch?');
    await confirmation.locator('#confirm-cancel').click();
    await expect(cold.locator('#confirm-dialog-overlay')).not.toHaveClass(/\bshow\b/);
    expect(await profile(cold)).toEqual(committed); expect(await cycleStore(cold)).toEqual(committedStore);
    await remove.click();
    await expect(confirmation).toBeVisible();
    await confirmation.locator('#confirm-ok').click();
    await expect(cold.locator('#confirm-dialog-overlay')).not.toHaveClass(/\bshow\b/);
    await inspectCoverage(cold, false);
    const removed = await profile(cold), removedStore = await cycleStore(cold);
    assertExpectedMutation(before, removed);
    expect(removed.menstrualCycle.periods).toEqual([MANUAL_PERIOD]);
    expect(removed.menstrualCycle.coverage).toMatchObject({periodCount: 1, observationCount: 0, firstDate: '2026-04-01', lastDate: '2026-04-04'});
    expect(Object.keys(removed.menstrualCycle.coverage.sources)).toEqual(['manual']);
    expect(removedStore).toEqual(initialStore);
    await cold.close();
    expect(context.pages()).toHaveLength(0);

    const second = await context.newPage();
    await second.clock.setFixedTime(new Date(FIXED_ISO));
    loading.push({phase: 'offline-cold-2', readyMs: await ready(second, server.origin)});
    expect(await profile(second)).toEqual(removed); expect(await cycleStore(second)).toEqual(removedStore);
    await openEditor(second); await inspectCoverage(second, false);
    await second.getByRole('button', {name: 'Close cycle editor', exact: true}).click();
    expect(await profile(second)).toEqual(removed); expect(await cycleStore(second)).toEqual(removedStore);
    expect(await second.evaluate(() => JSON.parse(localStorage.getItem('labcharts-profiles') || '[]'))).toEqual(originalProfiles.map(entry => ({...entry, lastUpdated: FIXED_TIME})));
    await second.close();
    expect(errors).toEqual([]); expect(csp).toEqual([]); expect(external).toEqual([]);
    await fs.writeFile(test.info().outputPath('cycle-import-loading.json'), JSON.stringify({loading, importId: IMPORT_ID, rawObservationCount: committedStore.daily.length, committedPeriodCount: committed.menstrualCycle.periods.length, removedPeriodCount: removed.menstrualCycle.periods.length, closedClientOfflineLaunches: 2, originStopped: true, browserOfflineEmulation}, null, 2));
  } finally {
    for (const target of context.pages()) if (!target.isClosed()) await target.close();
    await server.close();
  }
});
