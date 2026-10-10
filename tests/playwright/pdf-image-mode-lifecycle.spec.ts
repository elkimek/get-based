import path from 'node:path';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type {Page} from '@playwright/test';
import {expect, test} from './coverage-fixture.js';
import {createDefaultProfileData, migrateProfileData} from '../../js/profile.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {createModuleUrl} from '../helpers/browser-module-url.js';

const fixture = path.resolve('tests/fixtures/pdf-preflight/image-only.pdf');
const moduleUrl = createModuleUrl('pdfImageModeLifecycle');
interface NativeEvent {type: string; key: string | null; target: string; text: string | null; trusted: boolean}
interface LifecycleWindow extends Window {
  pdfLifecycleEvents: NativeEvent[];
  pdfLifecycleCsp: string[];
  pdfConfirmation: {status: 'pending' | 'fulfilled'; value: boolean | null; settlements: number};
}
async function snapshot(page: Page) {
  // Singleton production imports are deliberately unqueried: the test observes
  // the same state/dispatch/store used by the genuine public input handler.
  return page.evaluate(async () => {
    const [{state}, {encryptedGetItem}, {profileStorageKey}, blob, progress] = await Promise.all([
      import('/js/state.js'), import('/js/crypto.js'), import('/js/profile.js'),
      import('/js/blob-storage.js'), import('/js/pdf-import-progress.js'),
    ]);
    const key = profileStorageKey(state.currentProfile, 'imported');
    if (localStorage.getItem('labcharts-encryption-enabled') === 'true'
      || !blob.shouldUseBlob(key) || localStorage.getItem(key) !== null) throw new Error('Expected native IDB, encryption disabled and no localStorage fallback');
    const stored = await encryptedGetItem(key), raw = await blob.getBlob<string>(key);
    if (typeof stored !== 'string' || typeof raw !== 'string') throw new Error('Missing genuine committed profile');
    return {live: structuredClone(state.importedData), stored: JSON.parse(stored) as Record<string, unknown>,
      raw: JSON.parse(raw) as Record<string, unknown>, busy: progress.importDispatch.busy,
      running: progress.isImportRunning(), owner: document.getElementById('confirm-dialog-overlay')?.dataset.escapeOwner ?? null};
  });
}
async function setup(page: Page) {
  await installDiscussionFixture(page.context(), {paused: true});
  const seeded = migrateProfileData({...createDefaultProfileData(), importBenchmarks: [],
    entries: [{date: '2026-06-01', markers: {'thyroid.tsh': 1.23}}],
    notes: [{date: '2026-06-01', text: 'Keep unrelated note'}], contextNotes: 'Keep unrelated context'});
  await page.addInitScript(seeded => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    localStorage.setItem('labcharts-profiles', JSON.stringify([{id: 'default', name: 'Synthetic PDF lifecycle', sex: 'male', createdAt: 1}]));
    localStorage.setItem('labcharts-active-profile', 'default');
    localStorage.setItem('labcharts-default-imported', JSON.stringify(seeded));
    localStorage.setItem('labcharts-ollama', JSON.stringify({url: 'http://127.0.0.1:11434', model: 'fixture-current', mode: 'ollama'}));
    localStorage.setItem('labcharts-analytics-disabled', 'true');
    const observed = window as unknown as LifecycleWindow; observed.pdfLifecycleEvents = []; observed.pdfLifecycleCsp = [];
    document.addEventListener('securitypolicyviolation', event => observed.pdfLifecycleCsp.push(event.violatedDirective));
    for (const type of ['click', 'keydown']) document.addEventListener(type, event => {
      const target = event.target;
      if (target instanceof Element && target.closest('#confirm-dialog-overlay')) observed.pdfLifecycleEvents.push({
        type, key: event instanceof KeyboardEvent ? event.key : null, target: target.id || target.tagName,
        text: target.textContent, trusted: event.isTrusted});
    }, true);
  }, seeded);
  const bytes = await fs.readFile(fixture);
  expect(bytes.length).toBe(701);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe('5eeee0945e5de2a7c8cafcce2c43199d24f040b648797108c4350a9feb47e342');
  const errors: string[] = [], external: string[] = [], consoles: string[] = [], workers: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => consoles.push(message.text()));
  page.on('worker', worker => workers.push(worker.url()));
  const baseURL = test.info().project.use.baseURL;
  if (!baseURL) throw new Error('Use the maintained headless app browser configuration with its actual baseURL');
  const origin = new URL(baseURL).origin;
  await page.context().route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) {external.push(url.href); await route.abort();}
    else await route.continue();
  });
  await page.goto('/app');
  await expect(page.locator('html[data-app-ready]')).toBeAttached();
  expect(await page.locator('#confirm-dialog').count()).toBe(0);
  expect(await page.locator('#confirm-dialog-overlay .confirm-dialog').count()).toBe(0);
  await page.evaluate(async () => {
    const {saveImportedData} = await import('/js/data.js');
    if (!await saveImportedData({immediate: true, skipSync: true})) throw new Error('Synthetic native profile baseline commit failed');
    localStorage.setItem('labcharts-ai-paused', 'false');
  });
  const before = await snapshot(page);
  expect(before.live.importBenchmarks).toEqual([]); expect(before.stored.importBenchmarks).toEqual([]);
  return {before, errors, external, consoles, workers};
}
async function finished(page: Page, before: Awaited<ReturnType<typeof snapshot>>, owner: string | null = null) {
  await expect.poll(async () => {
    const state = await snapshot(page);
    return {busy: state.busy, running: state.running, status: (state.stored.importBenchmarks as Array<{status: string}>).at(-1)?.status};
  }).toEqual({busy: false, running: false, status: 'stopped'});
  const after = await snapshot(page);
  expect(after.owner).toBe(owner);
  for (const channel of ['live', 'stored', 'raw'] as const) {
    const {importBenchmarks: oldRecords, ...oldFields} = before[channel];
    const {importBenchmarks: records, ...fields} = after[channel];
    expect(oldRecords).toEqual([]); expect(fields).toEqual(oldFields);
    expect(records).toHaveLength(1);
  }
  const records = after.stored.importBenchmarks as Array<Record<string, unknown>>;
  expect(after.live.importBenchmarks).toEqual(records); expect(after.raw.importBenchmarks).toEqual(records);
  const record = records[0]!;
  expect(Object.keys(record).sort()).toEqual(['id', 'benchmarkAt', 'updatedAt', 'status', 'stage', 'fileName', 'fileSize', 'inputHash',
    'importMode', 'inputChars', 'pageCount', 'provider', 'modelId', 'runtime', 'timings', 'usage', 'diagnostics', 'textQuality', 'reason', 'totalMs', 'finishedAt'].sort());
  expect(record).toMatchObject({status: 'stopped', stage: 'mode-selection', reason: 'mode-selection', fileName: 'image-only.pdf', fileSize: 701,
    inputHash: '', importMode: 'text', inputChars: 0, pageCount: 0, provider: 'ollama', modelId: 'fixture-current', runtime: null,
    textQuality: 'empty', timings: {}, usage: {}, diagnostics: {}});
  expect(record.id).toMatch(/^bench_/);
  for (const key of ['benchmarkAt', 'updatedAt', 'finishedAt', 'totalMs']) expect(Number.isFinite(record[key])).toBe(true);
  expect(record.benchmarkAt).toBeGreaterThan(0); expect(Number(record.finishedAt)).toBeGreaterThanOrEqual(Number(record.benchmarkAt));
  expect(Number(record.updatedAt)).toBeGreaterThanOrEqual(Number(record.finishedAt)); expect(record.totalMs).toBeGreaterThanOrEqual(0);
  await expect(page.locator('#pdf-input')).toHaveValue('');
  return after;
}
async function audit(page: Page, observed: Awaited<ReturnType<typeof setup>>) {
  expect(observed.workers.some(url => new URL(url).pathname === '/vendor/pdf.worker.min.mjs')).toBe(true);
  expect(observed.consoles.some(text => text.includes('Setting up fake worker.'))).toBe(false);
  expect(observed.errors).toEqual([]); expect(observed.external).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as LifecycleWindow).pdfLifecycleCsp)).toEqual([]);
  return page.evaluate(() => (window as unknown as LifecycleWindow).pdfLifecycleEvents);
}

for (const choice of ['Cancel', 'Tab then Escape'] as const) {
  test('real scanned PDF creates its absent warning host and settles once with ' + choice, async ({page}, info) => {
    const observed = await setup(page);
    await page.locator('#pdf-input').setInputFiles(fixture); // Physical file automation seam; not an OS picker claim.
    const dialog = page.getByRole('alertdialog', {name: 'Scanned PDF', exact: true});
    await expect(dialog).toBeVisible(); await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toContainText('Limited text extracted');
    await expect(dialog.getByRole('button')).toHaveText(['Cancel', 'Try text anyway', 'Use image mode']);
    await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
    const pending = await snapshot(page);
    expect(pending.busy).toBe(true); expect(pending.running).toBe(true); expect(pending.owner).toBe('pdf-image-mode');
    if (choice === 'Cancel') await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
    else {
      await page.keyboard.press('Tab');
      await expect(dialog.getByRole('button', {name: 'Try text anyway', exact: true})).toBeFocused();
      await page.keyboard.press('Escape');
    }
    await expect(dialog).not.toBeVisible();
    const after = await finished(page, observed.before);
    await page.keyboard.press('Escape'); // A stale key handler must not change the terminal native record/dispatch.
    expect(await snapshot(page)).toEqual(after);
    const events = await audit(page, observed);
    if (choice === 'Cancel') expect(events.some(event => event.type === 'click' && event.text?.trim() === 'Cancel' && event.trusted)).toBe(true);
    else expect(events.filter(event => event.type === 'keydown').map(event => [event.key, event.trusted])).toEqual([['Tab', true], ['Escape', true]]);
    await info.attach('native-pdf-image-lifecycle', {body: JSON.stringify({choice, before: observed.before, after, events,
      workers: observed.workers, boundary: 'Real physical PDF/native FileList/parser/dedicated worker/native choices and IDB; synthetic profile/provider configuration; no OS-picker, provider completion or marker import claim'}), contentType: 'application/json'});
  });
}

test('scanned PDF leaves a visible native utils confirmation pending and unchanged', async ({page}, info) => {
  const observed = await setup(page);
  await page.evaluate(async utilsUrl => {
    const {showConfirmDialog} = await import(utilsUrl) as typeof import('../../js/utils.js');
    const observed = window as unknown as LifecycleWindow;
    observed.pdfConfirmation = {status: 'pending', value: null, settlements: 0};
    void showConfirmDialog('Keep this original confirmation', {ariaLabel: 'Existing confirmation'}).then(value => {
      observed.pdfConfirmation.status = 'fulfilled'; observed.pdfConfirmation.value = value; observed.pdfConfirmation.settlements++;
    });
  }, moduleUrl('/js/utils.js'));
  const dialog = page.getByRole('alertdialog', {name: 'Existing confirmation', exact: true});
  await expect(dialog).toBeVisible(); await expect(page.locator('#confirm-cancel')).toBeFocused();
  const html = await dialog.evaluate(node => node.outerHTML);
  await page.locator('#pdf-input').setInputFiles(fixture);
  const after = await finished(page, observed.before, 'utils-confirm');
  await expect(dialog).toBeVisible(); expect(await dialog.evaluate(node => node.outerHTML)).toBe(html);
  expect(await page.evaluate(() => (window as unknown as LifecycleWindow).pdfConfirmation)).toEqual({status: 'pending', value: null, settlements: 0});
  await page.locator('#confirm-cancel').click(); await expect(dialog).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as LifecycleWindow).pdfConfirmation)).toEqual({status: 'fulfilled', value: false, settlements: 1});
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (window as unknown as LifecycleWindow).pdfConfirmation)).toEqual({status: 'fulfilled', value: false, settlements: 1});
  expect(await snapshot(page)).toEqual({...after, owner: null});
  const events = await audit(page, observed);
  expect(events.some(event => event.type === 'click' && event.target === 'confirm-cancel' && event.trusted)).toBe(true);
  await info.attach('native-pdf-existing-confirmation', {body: JSON.stringify({before: observed.before, after, originalConfirmationHTML: html,
    events, workers: observed.workers, boundary: 'Public utils confirmation + physical empty PDF selection; no injected host or private handler; exactly one native confirmation outcome'}), contentType: 'application/json'});
});
