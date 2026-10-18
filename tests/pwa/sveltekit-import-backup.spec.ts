import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createDefaultProfileData } from '../../js/profile.js';
import type { ProfileData } from '../../types/app-state.js';
import type { BackupSnapshot } from '../../js/backup.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { readComparisonAcceptanceProfile } from '../helpers/nutrition-comparison-fixture.js';
import { startKitServer } from './kit-server.js';

const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
const originalNote = 'Retain the original synthetic note.';
const importedNote = 'Imported <literal> note & selected facts.';
const payload = {
  entries: [
    { date: '2026-04-01', markers: { 'biochemistry.glucose': 5.1 } },
    { date: '2026-05-01', markers: { 'biochemistry.glucose': 5.4 } },
  ],
  notes: [{ date: '2026-05-01', text: importedNote }],
  contextNotes: 'Synthetic JSON import context.',
};

async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function readProfile(page: Page): Promise<ProfileData> {
  return await page.evaluate(readComparisonAcceptanceProfile) as ProfileData;
}
async function closeChat(page: Page) {
  const close = page.getByRole('button', { name: 'Close chat', exact: true });
  if (await close.isVisible()) await close.click();
}
async function importJSON(page: Page, json: unknown, name: string) {
  await closeChat(page);
  await page.locator('#profile-selector [data-nav-action="open-client-list"]').click();
  await expect(page.locator('#client-list-overlay')).toHaveClass(/\bshow\b/);
  await page.locator('#client-list-modal [data-cl-action="toggle-tools-menu"]').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#client-list-modal [data-cl-action="trigger-json-import"]').click();
  await (await chooser).setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)) });
  await expect(page.locator('#client-list-overlay')).not.toHaveClass(/\bshow\b/);
}
async function openBackup(page: Page) {
  await closeChat(page);
  await page.locator('[data-shell-action="open-settings"]:visible').first().click();
  await page.locator('#settings-nav-data').click();
  await expect(page.locator('#backup-section [data-protection-view="backup"]')).toBeVisible();
}
async function chooseRestore(page: Page, backup: Buffer) {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#backup-section').getByRole('button', { name: 'Restore Backup', exact: true }).click();
  await (await chooser).setFiles({ name: 'synthetic-roundtrip-backup.json', mimeType: 'application/json', buffer: backup });
  await expect(page.locator('#confirm-dialog-overlay')).toHaveClass(/\bshow\b/);
  await expect(page.locator('#confirm-dialog-overlay')).toContainText('This will overwrite 1 profile(s).');
}

test('static JSON import and downloaded backup restore preserve canonical records through an offline cold launch', async ({ page, context }, info) => {
  test.setTimeout(150000);
  await installDiscussionFixture(context, { provider: 'openrouter', paused: true });
  await context.addInitScript(({ defaults, originalNote }) => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('import-backup-seeded')) return;
    localStorage.setItem('import-backup-seeded', '1');
    localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: 'default', name: 'Synthetic import profile', createdAt: 1 }]));
    localStorage.setItem('labcharts-active-profile', 'default');
    localStorage.setItem('labcharts-theme', 'dark');
    localStorage.setItem('labcharts-default-units', 'EU');
    localStorage.setItem('labcharts-analytics-disabled', 'true');
    localStorage.setItem('labcharts-show-product-recs', 'false');
    localStorage.setItem('labcharts-last-manual-backup', new Date().toISOString());
    localStorage.setItem('labcharts-default-imported', JSON.stringify({
      ...defaults, notes: [{ date: '2026-03-01', text: originalNote }],
    }));
  }, { defaults: createDefaultProfileData(), originalNote });
  const errors: string[] = [], csp: string[] = [], external: string[] = [];
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message));
  observe(page); context.on('page', observe);
  await context.exposeBinding('importBackupCsp', (_, directive: string) => { csp.push(directive); });
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    void (window as unknown as { importBackupCsp(value: string): Promise<void> }).importBackupCsp(event.violatedDirective);
  }));
  const server = await startKitServer(artifact);
  let stopped = false;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['http:', 'https:'].includes(url.protocol) || url.origin === server.origin) return route.continue();
    external.push(url.href); return route.abort();
  });
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page);
    const initial = await readProfile(page);
    expect(initial.entries).toEqual([]);
    expect(initial.notes.map(note => note.text)).toEqual([originalNote]);

    // Exercise the real public file chooser and client-list change delegate.
    await importJSON(page, { unrelated: 'invalid synthetic format' }, 'invalid-synthetic.json');
    await expect(page.locator('#notification-container')).toContainText('Invalid JSON format: missing entries array');
    expect(await readProfile(page)).toEqual(initial);
    await importJSON(page, payload, 'synthetic-lab-records.json');
    await expect(page.locator('#notification-container')).toContainText('Imported 2 date entries');
    await expect.poll(async () => (await readProfile(page)).entries.length).toBe(2);
    const imported = await readProfile(page);
    expect(imported.entries.map(entry => ({ date: entry.date, markers: entry.markers }))).toEqual(payload.entries);
    expect(imported.notes.map(note => note.text)).toEqual([originalNote, importedNote]);
    expect(imported.contextNotes).toBe(payload.contextNotes);
    expect(await page.evaluate(() => localStorage.getItem('labcharts-active-profile'))).toBe('default');

    // Rendering must consume the imported values, not only the persisted JSON.
    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    if (await menu.isVisible()) await menu.click();
    await page.locator('.nav-item[data-category="biochemistry"]').click();
    await page.locator('[data-category-page-action="switch-view"][data-category-page-category="biochemistry"][data-category-page-view="table"]').click();
    await expect(page.locator('.data-table-wrapper')).toContainText('Glucose');
    await expect(page.locator('.data-table-wrapper')).toContainText('5.4');

    await openBackup(page);
    const downloading = page.waitForEvent('download');
    await page.locator('#backup-section').getByRole('button', { name: 'Download Backup', exact: true }).click();
    const download = await downloading, downloadedPath = await download.path();
    expect(downloadedPath).not.toBeNull();
    const backupBytes = await fs.readFile(downloadedPath!);
    const backup = JSON.parse(backupBytes.toString()) as BackupSnapshot;
    expect(backup).toMatchObject({ format: 'labcharts-backup', version: 1, encrypted: false });
    expect(backup.profiles).toHaveLength(1);
    const backedUp = backup.profiles.find(profile => profile.profileId === 'default');
    expect(backedUp).toBeDefined();
    expect(JSON.parse(backedUp!.keys.imported!)).toEqual(imported);
    await info.attach('synthetic-import-backup', { body: backupBytes, contentType: 'application/json' });
    await page.locator('#settings-modal [data-settings-action="close"]').click();

    // Change the data through the same public import before restoring the
    // downloaded backup, so a no-op restore cannot pass this journey.
    await importJSON(page, {
      entries: [{ date: '2026-06-01', markers: { 'biochemistry.glucose': 6.2 } }],
      notes: [{ date: '2026-06-01', text: 'This post-backup note must disappear after restore.' }],
      contextNotes: 'Post-backup context that must be replaced.',
    }, 'synthetic-after-backup.json');
    await expect(page.locator('#notification-container')).toContainText('Imported 1 date entry');
    await expect.poll(async () => (await readProfile(page)).entries.length).toBe(3);
    const changed = await readProfile(page);
    expect(changed.contextNotes).toBe('Post-backup context that must be replaced.');
    expect(changed).not.toEqual(imported);

    await openBackup(page); await chooseRestore(page, backupBytes);
    await page.locator('#confirm-cancel').click();
    expect(await readProfile(page)).toEqual(changed);
    await chooseRestore(page, backupBytes);
    const reloaded = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame() });
    await page.locator('#confirm-ok').click();
    await reloaded; await ready(page);
    expect(await readProfile(page)).toEqual(imported);
    expect(await page.evaluate(() => localStorage.getItem('labcharts-active-profile'))).toBe('default');
    await expect(page.locator('#profile-selector .profile-compact-name')).toHaveText('Synthetic import profile');

    await page.close(); expect(context.pages()).toHaveLength(0);
    await server.close(); stopped = true;
    await expect(fetch(server.origin + '/index.html')).rejects.toThrow();
    const cold = await context.newPage();
    await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold);
    expect(await readProfile(cold)).toEqual(imported);
    await expect(cold.locator('#profile-selector .profile-compact-name')).toHaveText('Synthetic import profile');
    expect(errors).toEqual([]); expect(csp).toEqual([]); expect(external).toEqual([]);
  } finally {
    await context.unrouteAll({ behavior: 'ignoreErrors' });
    if (!stopped) await server.close();
  }
});
