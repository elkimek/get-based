import { expect, test } from './coverage-fixture.js';

const componentPaths = ['PassphraseDialog', 'EncryptionSettings', 'BackupSettings'].map(name => `/js/components/${name}.svelte.native.js`);
test.beforeEach(async ({ page }) => { await page.addInitScript(() => {
  for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
  localStorage.setItem('labcharts-default-onboarded', 'profile-set'); localStorage.setItem('labcharts-analytics-consent-seen', '1');
}); });

test('cold startup leaves protection presentations unloaded and a failed passphrase load retries safely', async ({ page }) => {
  const requested: string[] = [], errors: string[] = []; let attempts = 0;
  page.on('request', request => requested.push(request.url())); page.on('pageerror', error => errors.push(error.message));
  await page.route('**/js/components/PassphraseDialog.svelte.native.js*', async route => {
    attempts++; if (attempts === 1) await route.fulfill({ status: 503, body: 'Synthetic first-use failure' }); else await route.continue();
  });
  await page.goto('/app'); await expect(page.locator('html[data-app-ready]')).toBeAttached();
  expect(requested.filter(url => componentPaths.includes(new URL(url).pathname))).toEqual([]);
  await page.evaluate(async () => { await (await import('/js/crypto-ui.js')).showEnableEncryptionModal(); });
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Passphrase controls', exact: true })).toHaveAttribute('aria-busy', 'false');
  expect(await page.locator('.passphrase-input').count()).toBe(0);
  await page.getByRole('button', { name: 'Retry', exact: true }).click(); await expect(page.locator('#passphrase-set-input')).toBeVisible();
  expect(requested.some(url => new URL(url).pathname === componentPaths[0] && new URL(url).searchParams.get('lazy-retry') === '1')).toBe(true);
  await page.locator('#passphrase-set-input').fill('short'); await page.locator('#passphrase-confirm-input').fill('short'); await page.locator('#passphrase-set-btn').click();
  await expect(page.locator('#passphrase-set-error')).toHaveText('At least 8 characters');
  await page.locator('#passphrase-set-cancel').click(); await expect(page.locator('#passphrase-overlay')).toBeHidden(); expect(errors).toEqual([]);
});

for (const superseded of ['close', 'replace', 'profile'] as const) test(`late passphrase presentation respects a ${superseded} owner`, async ({ page }) => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/js/components/PassphraseDialog.svelte.native.js', async route => { await gate; await route.continue(); });
  await page.goto('/app'); await expect(page.locator('html[data-app-ready]')).toBeAttached();
  await page.evaluate(async () => { await (await import('/js/crypto-ui.js')).showEnableEncryptionModal(); });
  await expect(page.getByRole('status').filter({ hasText: 'Loading passphrase controls' })).toBeVisible();
  await page.evaluate(async mode => {
    if (mode === 'close') (await import('/js/passphrase-component.js')).disposePassphraseDialog();
    else if (mode === 'replace') (await import('/js/crypto-ui.js')).showPassphraseModal(() => {});
    else (await import('/js/state.js')).state.currentProfile = 'synthetic-new-profile';
  }, superseded);
  release(); await page.evaluate(async () => { await (await import('/js/passphrase-component.js')).preparePassphrasePresentation(); });
  if (superseded === 'replace') { await expect(page.locator('#passphrase-unlock-input')).toBeVisible(); await expect(page.locator('#passphrase-set-input')).toHaveCount(0); }
  else { await expect(page.locator('#passphrase-overlay')).toBeHidden(); await expect(page.locator('.passphrase-input')).toHaveCount(0); }
});

test('cold backup presentation retains a folder update arriving during its load', async ({ page }) => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/js/components/BackupSettings.svelte.native.js', async route => { await gate; await route.continue(); });
  await page.goto('/app'); await expect(page.locator('html[data-app-ready]')).toBeAttached();
  await page.evaluate(async () => {
    const host = document.createElement('section'); host.dataset.backupSettingsRoot = ''; document.querySelector('#main-content')!.append(host);
    const view = await import('/js/settings-protection-component.js');
    view.refreshBackupSettings({ encrypted: false, autoStatus: 'Synthetic ready', folder: { supported: true, folderName: 'Old folder', permissionLost: false, lastBackupLabel: 'never' } });
    view.refreshFolderBackupSettings({ supported: true, folderName: 'Latest folder', permissionLost: true, lastBackupLabel: 'now' });
  });
  await expect(page.getByRole('status').filter({ hasText: 'Loading protection controls' })).toBeVisible();
  release(); await expect(page.locator('[data-backup-settings-root]')).toContainText('Latest folder');
  await expect(page.locator('[data-backup-settings-root]')).not.toContainText('Old folder');
  await expect(page.locator('[data-backup-settings-root] [data-backup-action="reauthorize-folder"]')).toBeVisible();
});

test('backup presentation retries its failed first load and never mounts into a retired host', async ({ page }) => {
  let attempts = 0, release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/js/components/BackupSettings.svelte.native.js*', async route => {
    attempts++; if (attempts === 1) await route.fulfill({ status: 503, body: 'Synthetic first-use failure' }); else { await gate; await route.continue(); }
  });
  await page.goto('/app'); await expect(page.locator('html[data-app-ready]')).toBeAttached();
  await page.evaluate(async () => {
    const host = document.createElement('section'); host.dataset.backupSettingsRoot = ''; host.id = 'old-protection-host'; document.querySelector('#main-content')!.append(host);
    (await import('/js/settings-protection-component.js')).refreshBackupSettings({ encrypted: false, autoStatus: 'Old owner', folder: { supported: false, folderName: null, permissionLost: false, lastBackupLabel: '' } });
  });
  const retiredRetry = await page.locator('[data-backup-settings-root]').getByRole('button', { name: 'Retry', exact: true }).elementHandle();
  await retiredRetry!.click();
  await page.evaluate(async () => {
    const view = await import('/js/settings-protection-component.js'), retired = view.getBackupSettingsView()!;
    view.disposeSettingsProtection(); document.getElementById('old-protection-host')!.remove();
    const host = document.createElement('section'); host.dataset.backupSettingsRoot = ''; document.querySelector('#main-content')!.append(host);
    view.refreshBackupSettings({ encrypted: true, autoStatus: 'Current owner', folder: { supported: false, folderName: null, permissionLost: false, lastBackupLabel: '' } });
    retired.setSnapshots([{ id: 'old', dateLabel: 'Retired summary', profileCount: '1', encrypted: false }]);
    view.getBackupSettingsView()!.setSnapshots([{ id: 'current', dateLabel: 'Current summary', profileCount: '2', encrypted: true }]);
  });
  await retiredRetry!.evaluate(button => { if (!(button instanceof HTMLButtonElement)) throw new Error('Expected a retired Retry button'); button.click(); });
  release(); await expect(page.locator('[data-backup-settings-root]')).toContainText('Current owner'); await expect(page.locator('[data-backup-settings-root]')).not.toContainText('Old owner');
  await expect(page.locator('[data-backup-settings-root] .backup-snapshot-item')).toHaveCount(1);
  await expect(page.locator('[data-backup-settings-root]')).toContainText('Current summary'); await expect(page.locator('[data-backup-settings-root]')).not.toContainText('Retired summary');
});

for (const failed of ['EncryptionSettings', 'BackupSettings']) test(`saved backup summaries survive a failed ${failed} presentation`, async ({ page }) => {
  let attempts = 0;
  await page.route(`**/js/components/${failed}.svelte.native.js*`, async route => {
    attempts++; if (failed === 'EncryptionSettings' || attempts === 1) await route.fulfill({ status: 503, body: 'Synthetic first-use failure' }); else await route.continue();
  });
  await page.goto('/app'); await expect(page.locator('html[data-app-ready]')).toBeAttached();
  await page.evaluate(async () => {
    const open = indexedDB.open('labcharts-backups', 2);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains('snapshots')) open.result.createObjectStore('snapshots', { keyPath: 'id', autoIncrement: true });
      if (!open.result.objectStoreNames.contains('folder-handle')) open.result.createObjectStore('folder-handle');
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    const tx = db.transaction('snapshots', 'readwrite'); tx.objectStore('snapshots').put({ id: 19, createdAt: '2026-01-01T00:00:00Z', encrypted: true,
      snapshot: { profiles: [{ id: 'one', privateData: 'Never render this' }, { id: 'two' }] } });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
    for (const kind of ['encryption', 'backup']) { const host = document.createElement('section'); host.setAttribute(`data-${kind}-settings-root`, ''); document.querySelector('#main-content')!.append(host); }
    await (await import('/js/crypto-ui.js')).loadBackupSnapshots();
  });
  const backup = page.locator('[data-backup-settings-root]');
  if (failed === 'BackupSettings') {
    await page.evaluate(async () => (await import('/js/settings-protection-component.js')).refreshFolderBackupSettings({ supported: true, folderName: 'Recovered folder', permissionLost: false, lastBackupLabel: 'now' }));
    await backup.getByRole('button', { name: 'Retry', exact: true }).click(); await expect(backup).toContainText('Recovered folder');
  }
  await expect(backup.locator('#backup-snapshots-toggle')).toBeVisible();
  await page.evaluate(async () => (await import('/js/crypto-ui.js')).toggleBackupSnapshots());
  await expect(backup.locator('.backup-snapshot-item')).toHaveCount(1); await expect(backup).toContainText('2 profile(s) • encrypted');
  await expect(backup.locator('[data-crypto-snapshot-id="19"]')).toBeVisible(); await expect(backup).not.toContainText('Never render this');
});
