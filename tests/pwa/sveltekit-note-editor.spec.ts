import path from 'node:path';
import fs from 'node:fs/promises';
import {expect, test, type Page} from '@playwright/test';
import {createDefaultProfileData, migrateProfileData} from '../../js/profile.js';
import type {ProfileData} from '../../types/app-state.js';
import {getConfiguredArrayItemId} from '../../js/data-merge.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';

const seedNotes = [
  {date: '2026-09-01', text: 'Keep original <note> & one'},
  {date: '2026-09-01', text: 'Keep separate same-date note'},
];
const added = {date: '2026-09-02', text: 'Offline <literal> & "quote"\nSecond line'};
const edited = {...added, text: 'Offline revised note\nKeep multiline text'};
interface EventReceipt {type: string; target: string; trusted: boolean; value: string | null}
interface ObservedWindow extends Window {notePwaEvents: EventReceipt[]; notePwaCsp(value: string): Promise<void>}
interface ProfileSnapshot {stored: Record<string, unknown>}
/** Read committed native IDB without importing source URLs pruned by static assembly. */
async function profile(page: Page): Promise<ProfileSnapshot> {
  return page.evaluate(async () => {
    const key = 'labcharts-default-imported';
    if (localStorage.getItem('labcharts-active-profile') !== 'default'
      || localStorage.getItem('labcharts-encryption-enabled') === 'true'
      || localStorage.getItem(key) !== null) throw new Error('Expected native IDB with encryption disabled and no localStorage fallback');
    const open = indexedDB.open('labcharts-blobs', 1);
    open.onupgradeneeded = () => open.transaction?.abort();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);});
    try {
      const tx = db.transaction('kv', 'readonly'), request = tx.objectStore('kv').get(key);
      const value = await new Promise<string>((resolve, reject) => {
        tx.oncomplete = () => typeof request.result === 'string' ? resolve(request.result) : reject(new Error('Missing native committed Note profile'));
        tx.onabort = () => reject(tx.error || new Error('Native profile read aborted'));
        tx.onerror = () => reject(tx.error || request.error);
      });
      return {stored: JSON.parse(value) as Record<string, unknown>};
    } finally {db.close();}
  });
}
function unrelated(snapshot: ProfileSnapshot) {
  return Object.fromEntries(['entries', 'refOverrides', 'profile', 'contextNotes', 'markerNotes', 'sunDefaults'].map(key => [key, snapshot.stored[key]]));
}
async function assertNotes(page: Page, notes: typeof seedNotes, before: ProfileSnapshot) {
  const snapshot = await profile(page);
  expect(snapshot.stored.notes).toEqual(notes);
  expect(unrelated(snapshot)).toEqual(unrelated(before)); return snapshot;
}
async function showNotes(page: Page) {
  const closeChat = page.getByRole('button', {name: 'Close chat', exact: true});
  if (await closeChat.isVisible()) await closeChat.click();
  const add = page.locator('.dashboard-notes-widget .add-note-btn');
  if (!await add.isVisible()) {
    await page.locator('[data-dashboard-widget-action="open-picker"]:visible').first().click();
    await page.locator('[data-dashboard-widget-id="notes"]').click();
    const close = page.locator('[data-dashboard-widget-action="close-picker"]');
    if (await close.isVisible()) await close.click();
  }
  await expect(add).toBeVisible();
}
const editor = (page: Page) => page.locator('#modal-overlay.show #detail-modal');
async function save(page: Page) {
  await editor(page).locator('[data-note-action="save"]').click();
  await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
}
async function closeClients(page: Page) {
  for (const client of page.context().pages()) await client.close();
  expect(page.context().pages()).toHaveLength(0);
}

test('static Note first offline use and stopped-origin cold launches retain native edits, cancellation and sync tombstones', async ({page, context}, info) => {
  test.setTimeout(150000);
  await installDiscussionFixture(context, {paused: true});
  await installOfflineStartupDiagnostics(context);
  const demo = JSON.parse(await fs.readFile('data/demo-male.json', 'utf8')) as Pick<ProfileData, 'entries' | 'refOverrides'>;
  const seeded = migrateProfileData({...createDefaultProfileData(), entries: demo.entries, refOverrides: demo.refOverrides,
    profile: {firstName: 'Synthetic', age: 38}, notes: seedNotes, contextNotes: 'Keep unrelated Note context',
    markerNotes: {'thyroid.tsh': 'Keep unrelated marker note'}, sunDefaults: {fitzpatrick: 'II', completedAt: 1}});
  await context.addInitScript(({seeded}) => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('note-pwa-seeded')) return;
    localStorage.setItem('note-pwa-seeded', '1');
    localStorage.setItem('labcharts-profiles', JSON.stringify([{id: 'default', name: 'Synthetic Note profile', sex: 'male', dob: '1987-11-22', createdAt: 1}]));
    localStorage.setItem('labcharts-active-profile', 'default');
    localStorage.setItem('labcharts-analytics-disabled', 'true');
    localStorage.setItem('labcharts-show-product-recs', 'false');
    localStorage.setItem('labcharts-default-imported', JSON.stringify(seeded));
  }, {seeded});
  const errors: string[] = [], csp: string[] = [], external: string[] = [];
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message));
  observe(page); context.on('page', observe);
  await context.exposeBinding('notePwaCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => {
    const observed = window as unknown as ObservedWindow; observed.notePwaEvents = [];
    for (const type of ['keydown', 'input', 'change', 'click']) document.addEventListener(type, event => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('#detail-modal,#confirm-dialog-overlay')) return;
      observed.notePwaEvents.push({type, target: target.id || target.getAttribute('data-note-action') || target.tagName,
        trusted: event.isTrusted, value: target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target.value : null});
    }, true);
    document.addEventListener('securitypolicyviolation', event => {void observed.notePwaCsp(event.violatedDirective);});
  });
  const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
  const server = await startKitServer(artifact); let closed = false;
  const phases: Array<{phase: string; profile: ProfileSnapshot; events: EventReceipt[]}> = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== server.origin) {external.push(url.href); await route.abort();}
    else await route.continue();
  });
  const record = async (target: Page, phase: string, snapshot: ProfileSnapshot) => {
    phases.push({phase, profile: snapshot, events: await target.evaluate(() => (window as unknown as ObservedWindow).notePwaEvents)});
  };
  try {
    await ready(page, server.origin); await ready(page, server.origin);
    const before = await profile(page); expect(before.stored.notes).toEqual(seedNotes);
    await showNotes(page); await expect(page.locator('#note-textarea')).toHaveCount(0);
    // Close the actual listener, prove host HTTP unavailable, then first-open Note from its SW cache.
    await server.close(); closed = true;
    await expect(fetch(server.origin + '/index.html')).rejects.toThrow();
    await page.locator('.dashboard-notes-widget .add-note-btn').click();
    await expect(page.locator('#note-textarea')).toBeFocused();
    await page.locator('#note-textarea').fill('Unsubmitted offline draft');
    await editor(page).locator('[data-note-action="close"]').last().click();
    expect(await profile(page)).toEqual(before);
    await page.locator('.dashboard-notes-widget .add-note-btn').click();
    await page.locator('#note-date-input').fill(added.date);
    await page.locator('#note-textarea').fill('  ' + added.text + '  ');
    await save(page); const saved = await assertNotes(page, [...seedNotes, added], before);
    await record(page, 'first-offline-add', saved); await closeClients(page);
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage(); await ready(cold, server.origin); await showNotes(cold);
      const expected = launch === 0 ? added : edited;
      await assertNotes(cold, [...seedNotes, expected], before);
      await cold.locator('.dashboard-notes-widget .note-card-action[data-dashboard-widget-action="open-note-editor"][data-dashboard-widget-index="2"]').filter({hasText: 'Edit'}).click();
      await expect(cold.locator('#note-textarea')).toHaveValue(expected.text);
      await expect(cold.locator('#note-date-input')).toHaveValue(expected.date);
      await expect(cold.locator('#note-textarea')).toBeFocused();
      if (launch === 0) {
        const committed = await profile(cold);
        await cold.locator('#note-textarea').fill('Cancelled after cold launch');
        await cold.keyboard.press('Escape'); await expect(cold.locator('#modal-overlay')).not.toHaveClass(/show/);
        expect(await profile(cold)).toEqual(committed);
        await cold.locator('.dashboard-notes-widget .note-card-action[data-dashboard-widget-action="open-note-editor"][data-dashboard-widget-index="2"]').filter({hasText: 'Edit'}).click();
        await cold.locator('#note-textarea').fill(edited.text); await save(cold);
        const changed = await assertNotes(cold, [...seedNotes, edited], before);
        expect((changed.stored._deleted as {notes: unknown[]}).notes).toEqual([getConfiguredArrayItemId('notes', added)]);
        await record(cold, 'cold-1-edit', changed);
      } else {
        const committed = await profile(cold);
        await editor(cold).locator('[data-note-action="delete"]').click();
        await expect(cold.locator('#confirm-cancel')).toBeFocused(); await cold.locator('#confirm-cancel').click();
        expect(await profile(cold)).toEqual(committed);
        await editor(cold).locator('[data-note-action="delete"]').click(); await cold.locator('#confirm-ok').click();
        await expect(cold.locator('#modal-overlay')).not.toHaveClass(/show/);
        const deleted = await assertNotes(cold, seedNotes, before);
        expect((deleted.stored._deleted as {notes: unknown[]}).notes).toEqual([getConfiguredArrayItemId('notes', added), getConfiguredArrayItemId('notes', edited)]);
        await record(cold, 'cold-2-delete', deleted);
      }
      await cold.close(); expect(context.pages()).toHaveLength(0);
    }
    const final = await context.newPage(); await ready(final, server.origin);
    const deleted = await assertNotes(final, seedNotes, before);
    expect((deleted.stored._deleted as {notes: unknown[]}).notes).toEqual([getConfiguredArrayItemId('notes', added), getConfiguredArrayItemId('notes', edited)]);
    await record(final, 'cold-3-deletion-retained', deleted);
    await final.close(); expect(context.pages()).toHaveLength(0);
    expect(errors).toEqual([]); expect(csp).toEqual([]); expect(external).toEqual([]);
    expect(phases.flatMap(phase => phase.events).some(event => event.trusted && event.type === 'input' && event.target === 'note-textarea')).toBe(true);
    await info.attach('note-stopped-origin-acceptance', {body: JSON.stringify({stoppedOrigin: true, coldLaunches: 3, before, phases,
      boundary: 'Synthetic native IDB with encryption disabled; date fill seam disclosed; actual SW and stopped HTTP origin; no OS installation claim'}, null, 2), contentType: 'application/json'});
  } finally {if (!closed) await server.close();}
});
