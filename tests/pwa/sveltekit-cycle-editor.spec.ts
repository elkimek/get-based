import path from 'node:path';
import fs from 'node:fs/promises';
import {expect, test, type Page} from '@playwright/test';
import {createDefaultProfileData, migrateProfileData} from '../../js/profile.js';
import {calculateCycleStats, createCyclePeriod, upgradeMenstrualCycleProfile, type CyclePeriod} from '../../js/cycle-summary.js';
import {PERIOD_SYMPTOMS} from '../../js/constants.js';
import type {ProfileData} from '../../types/app-state.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readComparisonAcceptanceProfile} from '../helpers/nutrition-comparison-fixture.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';

const FIXED_ISO = '2026-08-07T12:00:00.000Z', FIXED_TIME = Date.parse(FIXED_ISO);
const IMPORT_ID = 'synthetic-editor-drip-batch';
type CycleProfile = NonNullable<ReturnType<typeof upgradeMenstrualCycleProfile>>;
interface ProfileRecords extends Record<string, unknown> {menstrualCycle: CycleProfile | null; changeHistory: unknown[]}
interface RawRecords {daily: Record<string, unknown>[]; imports: Record<string, unknown>[]; meta: Record<string, unknown>[]}
const rawSeed: RawRecords = {
  daily: [
    {source: 'drip', date: '2026-06-01', importId: IMPORT_ID, importedAt: 1, bleeding: {flow: 'moderate', excluded: false}, note: 'Preserve raw <observation>'},
    {source: 'drip', date: '2026-06-02', importId: IMPORT_ID, importedAt: 1, bbtC: 36.65},
  ],
  imports: [{importId: IMPORT_ID, source: 'drip', importedAt: '2026-06-06T00:00:00.000Z', sourceFile: 'Synthetic editor.csv', observationCount: 2, periodCount: 1}],
  meta: [{k: 'synthetic-editor-cycle-meta', v: {note: 'Preserve until accepted Cycle clear'}, updatedAt: 1}],
};
async function profile(page: Page): Promise<ProfileRecords> {return await page.evaluate(readComparisonAcceptanceProfile) as ProfileRecords;}
/** Read committed records only; an absent/changed schema is a failure, not a newly created fixture. */
async function raw(page: Page): Promise<RawRecords> {
  return page.evaluate(async () => {
    const open = indexedDB.open('labcharts-cycle-default', 2);
    open.onupgradeneeded = () => open.transaction?.abort();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);});
    try {
      const tx = db.transaction(['daily-observations', 'imports', 'meta'], 'readonly');
      const daily = tx.objectStore('daily-observations').getAll(), imports = tx.objectStore('imports').getAll(), meta = tx.objectStore('meta').getAll();
      return await new Promise<RawRecords>((resolve, reject) => {
        tx.oncomplete = () => resolve({daily: daily.result, imports: imports.result, meta: meta.result});
        tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    } finally {db.close();}
  });
}
async function openRoute(page: Page, route: string) {
  const closeChat = page.getByRole('button', {name: 'Close chat', exact: true}); if (await closeChat.isVisible()) await closeChat.click();
  const menu = page.getByRole('button', {name: 'Menu', exact: true});
  if (await menu.isVisible() && !await page.locator('#sidebar-nav').evaluate(node => node.classList.contains('mobile-open'))) await menu.click();
  await page.locator(`[data-nav-action="navigate"][data-nav-route="${route}"]`).click();
}
const editor = (page: Page) => page.locator('#modal-overlay.show #detail-modal.cycle-modal');
async function openEditor(page: Page) {
  await openRoute(page, 'body');
  await page.locator('.lens-page-widgets[data-lens-route="body"] [data-widget-id="cycle"] [data-cycle-action="open-editor"]').first().click();
  await expect(editor(page)).toBeVisible();
  await expect(editor(page).locator('.gb-modal-title')).toHaveText('Menstrual Cycle');
  await expect(editor(page).locator('.cycle-modal-head[data-cycle-editor-view]')).toBeVisible();
  await expect(editor(page).locator('img,script,[onclick]')).toHaveCount(0);
}
async function inspectEditor(page: Page, expected: CycleProfile) {
  const modal = editor(page); await expect(modal).toBeVisible();
  await expect(modal.locator('#mc-cycle-status')).toHaveValue(String(expected.cycleStatus));
  await expect(modal.locator('#mc-contraceptive')).toHaveValue(String(expected.contraceptive || ''));
  await expect(modal.locator('#mc-conditions')).toHaveValue(String(expected.conditions || ''));
  const stats = calculateCycleStats(expected.periods);
  for (const [id, value] of [['cycle-length', stats.cycleLength], ['period-length', stats.periodLength], ['regularity', stats.regularity], ['flow', stats.flow]] as const) {
    if (value !== null) await expect(modal.locator(`#mc-${id}-auto`)).toHaveAttribute('data-value', String(value));
  }
  await expect(modal.locator('.cycle-log-item [data-cycle-action="delete-period"]')).toHaveCount(expected.periods.length);
  expect(await modal.locator('.cycle-log-item [data-cycle-action="delete-period"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-cycle-start-date')))).toEqual(expected.periods.map(row => row.startDate).reverse());
  for (const row of expected.periods) {
    const item = modal.locator('.cycle-log-item').filter({has: page.locator(`[data-cycle-action="delete-period"][data-cycle-start-date="${row.startDate}"]`)});
    if (row.notes) await expect(item.locator('.cycle-period-note')).toHaveText(String(row.notes));
    await expect(item.locator('.period-symptom-tag')).toHaveText(row.symptoms);
  }
  await expect(modal.locator('#mc-period-start')).toHaveValue('2026-08-07');
  await expect(modal.locator('#mc-period-symptoms button')).toHaveText(PERIOD_SYMPTOMS);
  await expect(modal.locator('#mc-period-symptoms button[aria-pressed="true"]')).toHaveCount(0);
  const coverage = modal.locator('.cycle-import-summary-section[data-cycle-import-view]');
  await expect(coverage.locator('.cycle-import-coverage')).toContainText(`${expected.coverage.periodCount} observed periods`);
  await expect(coverage.locator('.cycle-import-coverage')).toContainText('2 local daily observations');
  await expect(coverage.getByRole('button', {name: 'Remove batch 1', exact: true})).toHaveAttribute('data-cycle-import-import-id', IMPORT_ID);
}
async function fillPeriod(page: Page, start: string, end: string, flow = 'moderate', notes = '') {
  const modal = editor(page); await modal.locator('#mc-period-start').fill(start); await modal.locator('#mc-period-end').fill(end);
  await modal.locator('#mc-period-flow').selectOption(flow); await modal.locator('#mc-period-notes').fill(notes);
}
async function expectRecords(page: Page, expected: ProfileRecords, expectedRaw: RawRecords = rawSeed) {
  await expect.poll(() => profile(page)).toEqual(expected);
  expect(await raw(page)).toEqual(expectedRaw);
}
function changedProfile(base: ProfileRecords, periods: CyclePeriod[], changes: Record<string, unknown> = {}, history = base.changeHistory): ProfileRecords {
  if (!base.menstrualCycle) throw new Error('Expected existing Cycle context');
  const stats = calculateCycleStats(base.menstrualCycle.periods);
  const synced = {...base.menstrualCycle, cycleLength: stats.cycleLength ?? base.menstrualCycle.cycleLength ?? 28,
    periodLength: stats.periodLength ?? base.menstrualCycle.periodLength ?? 5, regularity: stats.regularity ?? base.menstrualCycle.regularity ?? 'regular',
    flow: stats.flow ?? base.menstrualCycle.flow ?? 'moderate', ...changes, periods};
  return {...base, menstrualCycle: upgradeMenstrualCycleProfile(synced, {now: FIXED_ISO}), changeHistory: history};
}
function withCycleHistory(base: ProfileRecords): ProfileRecords {
  const item = {field: 'menstrualCycle', date: '2026-08-07', snapshot: base.menstrualCycle, updatedAt: FIXED_TIME};
  const history = base.changeHistory as Array<Record<string, unknown>>;
  const index = history.findIndex(entry => entry.field === 'menstrualCycle' && entry.date === '2026-08-07');
  return {...base, changeHistory: index < 0 ? [...history, item] : history.map((entry, i) => i === index ? {...entry, ...item} : entry)};
}
async function closeClients(page: Page) {for (const client of page.context().pages()) await client.close(); expect(page.context().pages()).toHaveLength(0);}

test('static Cycle editor preserves complete health/raw records through real field, period, history, modal and cold-launch actions', async ({page, context, browserName}) => {
  test.setTimeout(180000);
  await installDiscussionFixture(context, {provider: 'openrouter', paused: true}); await installOfflineStartupDiagnostics(context);
  const demo = JSON.parse(await fs.readFile('data/demo-male.json', 'utf8')) as Pick<ProfileData, 'entries' | 'refOverrides'>;
  const periods = [
    createCyclePeriod({startDate: '2026-04-01', endDate: '2026-04-05', flow: 'moderate', notes: 'Manual <April>', symptoms: ['Literal <symptom>'], updatedAt: '2026-04-06T00:00:00.000Z'}),
    createCyclePeriod({startDate: '2026-05-01', endDate: '2026-05-05', flow: 'moderate', notes: 'Manual May', updatedAt: '2026-05-06T00:00:00.000Z'}),
    createCyclePeriod({startDate: '2026-06-01', endDate: '2026-06-05', flow: 'moderate', source: 'drip', importId: IMPORT_ID, notes: 'Imported <June>', updatedAt: '2026-06-06T00:00:00.000Z'}),
  ];
  if (periods.some(period => !period)) throw new Error('Synthetic period construction failed');
  const cycle = upgradeMenstrualCycleProfile({cycleStatus: 'regular', contraceptive: '', conditions: 'Synthetic <condition>', periods,
    coverage: {observationCount: 2, firstDate: '2026-06-01', lastDate: '2026-06-02', sources: {drip: {periods: 1, observations: 2, importIds: [IMPORT_ID], importedAt: '2026-06-06T00:00:00.000Z'}}}}, {now: FIXED_ISO});
  const seeded = migrateProfileData({...createDefaultProfileData(), entries: demo.entries, refOverrides: demo.refOverrides,
    profile: {firstName: 'Alex', age: 38}, contextNotes: 'Keep unrelated Cycle editor context', markerNotes: {'thyroid.tsh': 'Keep unrelated marker note'},
    notes: [{date: '2026-07-14', text: 'Keep unrelated note'}], changeHistory: [{field: 'contextNotes', date: '2026-07-14', snapshot: 'Keep unrelated Cycle editor context', updatedAt: 1}], menstrualCycle: cycle});
  const errors: string[] = [], csp: string[] = [], external: string[] = [];
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message)); observe(page); context.on('page', observe);
  await context.exposeBinding('cycleEditorCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    void (window as unknown as {cycleEditorCsp(value: string): Promise<void>}).cycleEditorCsp(event.violatedDirective);
  }));
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== server.origin) {external.push(url.origin + url.pathname); await route.abort();}
    else await route.continue();
  });
  try {
    await page.clock.setFixedTime(new Date(FIXED_ISO));
    // Once-only synthetic setup before the real app starts. Cold clients never run this seed.
    await page.goto(server.origin + '/data/demo-male.json');
    await page.evaluate(async ({seeded, rawSeed}) => {
      localStorage.setItem('labcharts-profiles', JSON.stringify([{id: 'default', name: 'Alex', sex: 'female', dob: '1987-11-22', createdAt: 1}]));
      localStorage.setItem('labcharts-active-profile', 'default');
      const blobs = indexedDB.open('labcharts-blobs', 1);
      blobs.onupgradeneeded = () => blobs.result.createObjectStore('kv');
      const blobDb = await new Promise<IDBDatabase>((resolve, reject) => {blobs.onsuccess = () => resolve(blobs.result); blobs.onerror = () => reject(blobs.error);});
      try {
        const tx = blobDb.transaction('kv', 'readwrite'); tx.objectStore('kv').put(JSON.stringify(seeded), 'labcharts-default-imported');
        await new Promise<void>((resolve, reject) => {tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);});
      } finally {blobDb.close();}
      const open = indexedDB.open('labcharts-cycle-default', 2);
      open.onupgradeneeded = () => {
        const db = open.result, daily = db.createObjectStore('daily-observations', {keyPath: ['source', 'date', 'importId']});
        daily.createIndex('by_source', 'source'); daily.createIndex('by_source_date', ['source', 'date']); daily.createIndex('by_date', 'date'); daily.createIndex('by_import', 'importId');
        db.createObjectStore('imports', {keyPath: 'importId'}).createIndex('by_source', 'source'); db.createObjectStore('meta', {keyPath: 'k'});
      };
      const db = await new Promise<IDBDatabase>((resolve, reject) => {open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);});
      try {
        const tx = db.transaction(['daily-observations', 'imports', 'meta'], 'readwrite');
        for (const row of rawSeed.daily) tx.objectStore('daily-observations').put(row);
        for (const row of rawSeed.imports) tx.objectStore('imports').put(row);
        for (const row of rawSeed.meta) tx.objectStore('meta').put(row);
        await new Promise<void>((resolve, reject) => {tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);});
      } finally {db.close();}
    }, {seeded, rawSeed});
    const loading = [{phase: 'initial-online', readyMs: await ready(page, server.origin)}];
    loading.push({phase: 'controlled-online', readyMs: await ready(page, server.origin)});
    const before = await profile(page); expect(before).toEqual(JSON.parse(JSON.stringify(seeded))); expect(await raw(page)).toEqual(rawSeed);
    const directoryBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('labcharts-profiles')!) as Record<string, unknown>[]);
    await openEditor(page); await inspectEditor(page, before.menstrualCycle!);
    for (const status of ['perimenopause', 'postmenopause', 'pregnant', 'breastfeeding', 'absent', 'regular']) {
      await editor(page).locator('#mc-cycle-status').selectOption(status);
      for (const field of ['#mc-active-fields', '#mc-period-log-section']) {
        if (status === 'regular' || status === 'perimenopause') await expect(editor(page).locator(field)).toBeVisible();
        else await expect(editor(page).locator(field)).toBeHidden();
      }
      await expectRecords(page, before);
    }
    for (const [start, end, message] of [
      ['', '2026-07-05', 'Start date is required'], ['2026-07-01', '', 'End date is required'],
      ['2026-07-05', '2026-07-01', 'End date must be on or after start date'],
      ['2026-05-01', '2026-05-05', 'A period entry with this start date already exists'],
      ['2026-05-03', '2026-05-08', 'This overlaps with an existing period entry'],
    ]) {
      await fillPeriod(page, start!, end!); await editor(page).getByRole('button', {name: 'Add period', exact: true}).click();
      await expect(page.locator('.notification-toast.error').filter({hasText: message!})).toBeVisible(); await expectRecords(page, before);
    }
    await editor(page).locator('#mc-contraceptive').selectOption('Copper IUD'); await editor(page).locator('#mc-conditions').fill('  Edited <condition>  ');
    await fillPeriod(page, '2026-07-01', '2026-07-05', 'heavy', '  Manual <new note>  ');
    // The preserved outer label names the first button from the surrounding symptom text.
    const cramps = editor(page).locator('#mc-period-symptoms button[data-cycle-action="toggle-symptom"][data-value="Cramps"]');
    await expect(cramps).toHaveCount(1); await expect(cramps).toHaveText('Cramps');
    expect(await cramps.evaluate(node => node.tagName)).toBe('BUTTON');
    await cramps.focus(); await page.keyboard.press('Space'); await expect(cramps).toHaveAttribute('aria-pressed', 'true'); await expect(cramps).toHaveClass(/\bactive\b/);
    await cramps.click(); await expect(cramps).toHaveAttribute('aria-pressed', 'false'); await cramps.click();
    await editor(page).getByRole('button', {name: 'Add period', exact: true}).click();
    const addedPeriod = createCyclePeriod({startDate: '2026-07-01', endDate: '2026-07-05', flow: 'heavy', notes: 'Manual <new note>', symptoms: ['Cramps'], updatedAt: FIXED_ISO})!;
    const added = changedProfile(before, [...before.menstrualCycle!.periods, addedPeriod], {contraceptive: 'Copper IUD', conditions: 'Edited <condition>'});
    await expectRecords(page, added); await inspectEditor(page, added.menstrualCycle!);
    expect(addedPeriod).toMatchObject({id: 'period:manual:2026-07-01', source: 'manual', confidence: 'observed', updatedAt: FIXED_ISO});
    await editor(page).getByRole('button', {name: 'Cancel', exact: true}).click(); await expectRecords(page, added);
    await openEditor(page); await editor(page).locator('[data-cycle-action="delete-period"][data-cycle-start-date="2026-07-01"]').click();
    const deleted = changedProfile(added, added.menstrualCycle!.periods.filter(period => period.startDate !== '2026-07-01'));
    await expectRecords(page, deleted); await inspectEditor(page, deleted.menstrualCycle!);
    // Compact imported-row deletion leaves raw observations/import metadata intact.
    await editor(page).locator('[data-cycle-action="delete-period"][data-cycle-start-date="2026-06-01"]').click();
    const compactDeleted = changedProfile(deleted, deleted.menstrualCycle!.periods.filter(period => period.startDate !== '2026-06-01'));
    await expectRecords(page, compactDeleted); await inspectEditor(page, compactDeleted.menstrualCycle!);
    await editor(page).locator('#mc-contraceptive').selectOption('FAM'); await editor(page).locator('#mc-conditions').fill('Saved <condition>');
    await fillPeriod(page, '2026-07-01', '2026-07-04', 'moderate', 'Pending <Save>');
    const fatigue = editor(page).locator('#mc-period-symptoms button[data-cycle-action="toggle-symptom"][data-value="Fatigue"]');
    await expect(fatigue).toHaveCount(1); await expect(fatigue).toHaveText('Fatigue');
    await expect(fatigue).toHaveAccessibleName('Fatigue'); await expect(fatigue).toHaveAttribute('aria-pressed', 'false');
    await fatigue.click(); await expect(fatigue).toHaveAttribute('aria-pressed', 'true');
    await editor(page).getByRole('button', {name: 'Save', exact: true}).click();
    const savedPeriod = createCyclePeriod({startDate: '2026-07-01', endDate: '2026-07-04', flow: 'moderate', notes: 'Pending <Save>', symptoms: ['Fatigue'], updatedAt: FIXED_ISO})!;
    let saved = withCycleHistory(changedProfile(compactDeleted, [...compactDeleted.menstrualCycle!.periods, savedPeriod], {contraceptive: 'FAM', conditions: 'Saved <condition>'}));
    await expectRecords(page, saved);
    await expect(page.locator('#tour-tooltip')).toBeVisible(); await page.locator('#tour-tooltip').getByRole('button', {name: 'Skip', exact: true}).click();
    expect(await page.evaluate(() => localStorage.getItem('labcharts-default-cycleTour'))).toBe('completed');
    await openEditor(page); await inspectEditor(page, saved.menstrualCycle!);
    // Inactive Save must not add the hidden default current-day pending period.
    await editor(page).locator('#mc-cycle-status').selectOption('postmenopause');
    await editor(page).getByRole('button', {name: 'Save', exact: true}).click();
    saved = withCycleHistory(changedProfile(saved, saved.menstrualCycle!.periods, {cycleStatus: 'postmenopause'}));
    await expectRecords(page, saved); await openEditor(page); await expect(editor(page).locator('#mc-period-log-section')).toBeHidden();
    await editor(page).locator('#mc-cycle-status').selectOption('regular');
    // Restore active status without implicitly adding another default pending period.
    await fillPeriod(page, '', ''); await editor(page).getByRole('button', {name: 'Save', exact: true}).click();
    saved = withCycleHistory(changedProfile(saved, saved.menstrualCycle!.periods, {cycleStatus: 'regular'}));
    await expectRecords(page, saved); await openEditor(page); await inspectEditor(page, saved.menstrualCycle!);
    await editor(page).getByRole('button', {name: 'Close cycle editor', exact: true}).click();
    // Reuse the real shared detail host through a Labs delegate, without synthetic controls.
    await openRoute(page, 'labs');
    await page.locator('.lens-page-widgets[data-lens-route="labs"] [data-dashboard-widget-action="open-marker-detail"]').first().click();
    const detail = page.locator('#modal-overlay.show #detail-modal'); await expect(detail).toBeVisible(); await expect(detail).toHaveClass('modal marker-detail-modal');
    await expect(detail.locator('[data-cycle-editor-view]')).toHaveCount(0);
    await detail.locator('[data-marker-detail-action="close-modal"]').first().click();
    await expectRecords(page, saved);
    await openEditor(page); await inspectEditor(page, saved.menstrualCycle!);
    await editor(page).getByRole('button', {name: 'Close cycle editor', exact: true}).click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('labcharts-profiles')!))).toEqual(directoryBefore.map(entry => ({...entry, lastUpdated: FIXED_TIME})));
    await closeClients(page); await server.close();
    // Verified emulator boundaries match the existing Cycle/Tips acceptance specs.
    if (browserName === 'firefox') {
      await context.unroute('**/*'); context.on('request', request => {const url = new URL(request.url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== server.origin) external.push(url.origin + url.pathname);});
    }
    const browserOfflineEmulation = browserName !== 'webkit'; if (browserOfflineEmulation) await context.setOffline(true);
    const cold = await context.newPage(); await cold.clock.setFixedTime(new Date(FIXED_ISO));
    loading.push({phase: 'origin-stopped-cold-1', readyMs: await ready(cold, server.origin)}); await expectRecords(cold, saved);
    await openEditor(cold); await inspectEditor(cold, saved.menstrualCycle!);
    await editor(cold).getByRole('button', {name: 'Clear All', exact: true}).click();
    const confirmation = cold.locator('#confirm-dialog-overlay.show [role="alertdialog"]');
    await expect(confirmation.locator('.confirm-message')).toHaveText('Clear all menstrual cycle data? This cannot be undone.');
    await confirmation.locator('#confirm-cancel').click(); await expectRecords(cold, saved); await expect(editor(cold)).toBeVisible();
    await editor(cold).getByRole('button', {name: 'Clear All', exact: true}).click(); await confirmation.locator('#confirm-ok').click();
    const cleared = withCycleHistory({...saved, menstrualCycle: null}); const emptyRaw = {daily: [], imports: [], meta: []};
    await expectRecords(cold, cleared, emptyRaw); await expect(cold.locator('#modal-overlay')).not.toHaveClass(/\bshow\b/);
    await closeClients(cold);
    const second = await context.newPage(); await second.clock.setFixedTime(new Date(FIXED_ISO));
    loading.push({phase: 'origin-stopped-cold-2', readyMs: await ready(second, server.origin)}); await expectRecords(second, cleared, emptyRaw);
    await openEditor(second); await expect(editor(second).locator('.cycle-log-item')).toHaveCount(0);
    await expect(editor(second).getByRole('button', {name: 'Clear All', exact: true})).toHaveCount(0);
    await expect(editor(second).locator('.cycle-auto-value.mc-auto-pending')).toHaveCount(4);
    await editor(second).getByRole('button', {name: 'Cancel', exact: true}).click(); await expectRecords(second, cleared, emptyRaw);
    expect(await second.evaluate(() => JSON.parse(localStorage.getItem('labcharts-profiles')!))).toEqual(directoryBefore.map(entry => ({...entry, lastUpdated: FIXED_TIME})));
    await closeClients(second); expect(errors).toEqual([]); expect(csp).toEqual([]); expect(external).toEqual([]);
    await fs.writeFile(test.info().outputPath('cycle-editor-acceptance.json'), JSON.stringify({loading, browserOfflineEmulation, stoppedOrigin: true, coldReseeding: false,
      completeProfileAndRawEquality: true, exactHistoryAndPeriodIdentity: true, sharedDetailHostReuse: true, statusVariants: 6}, null, 2));
  } finally {for (const client of context.pages()) if (!client.isClosed()) await client.close(); await server.close();}
});
