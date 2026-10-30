import { expect, test } from './coverage-fixture.js';
import { seedDashboardControlProfile, dashboardHealth } from '../helpers/dashboard-control-fixture.js';
for (const failed of [false, true]) test(`an exact source refresh handoff reports native ${failed ? 'failure' : 'completion'} only after human Update now`, async ({ page, context }) => {
  await context.route('https://**/*', route => route.abort());
  let calls = 0, release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/proxy', async route => {
    const body = route.request().postDataJSON();
    if (body.wearable_runtime_config) return route.fulfill({ contentType: 'application/json', body: '{"configured":{"oura":true}}' });
    if (body.method !== 'GET' || typeof body.url !== 'string' || !body.url.startsWith('https://api.ouraring.com/')) throw new Error('Unexpected synthetic wearable request');
    calls++; await pending;
    if (failed) await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Synthetic unavailable source"}' });
    else await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: body.url.includes('/daily_sleep?') ? [{ day: new Date().toISOString().slice(0, 10), score: 83 }] : [] }) });
  });
  await seedDashboardControlProfile(page);
  const seeded = await page.evaluate(async () => {
    const { state } = await import('/js/state.js'); (await import('/js/chat-threads.js')).ensureActiveThread(); const vault = await import('/js/wearables-credential-vault.js');
    const generation = await vault.saveWearableCredentials(state.currentProfile, 'oura', { accessToken: 'SYNTHETIC_SOURCE_ACCESS', refreshToken: 'SYNTHETIC_SOURCE_REFRESH' });
    vault.markLocalWearableCredential(state.currentProfile, 'oura', generation);
    state.importedData.wearableConnections = { ...(state.importedData.wearableConnections || {}), oura: { connectedAt: Date.now() - 86400000, lastSyncAt: Date.now() - 3600000, expiresAt: Date.now() + 86400000, hasStoredCredentials: true, credentialGeneration: generation, account: { email: 'PRIVATE_SOURCE_ACCOUNT' } } };
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Source fixture persistence failed');
    const { createAppControlSession } = await import('/js/app-control-session.js'); const session = createAppControlSession('Check my Oura freshness and open its refresh control.', () => true, new AbortController().signal);
    const read = await session.tools.readAppState({ action: 'wearables.sources' });
    return { read, source: structuredClone(state.importedData.wearableConnections.oura), notes: state.importedData.contextNotes, entries: structuredClone(state.importedData.entries) };
  });
  const read = seeded.read as { snapshotId: string; sources: { id: string; refreshAvailable: boolean }[] };
  expect(read.sources.find(source => source.id === 'oura')).toMatchObject({ refreshAvailable: true }); expect(JSON.stringify(read)).not.toMatch(/PRIVATE_SOURCE_ACCOUNT|SYNTHETIC_SOURCE_ACCESS|SYNTHETIC_SOURCE_REFRESH/);
  const before = await dashboardHealth(page); expect(calls).toBe(0);
  const receipt = await page.evaluate(async snapshotId => (await import('/js/agent-tool-bindings.js')).navigateFromAgent({ view: 'wearablesSettings', marker: '', recordId: 'oura', snapshotId }), read.snapshotId);
  expect(receipt, JSON.stringify(receipt)).toMatchObject({ changed: true, opened: 'wearablesSettings', requiresUserAction: true, dataSaved: false, settingsSaved: false }); expect(calls).toBe(0); expect(await dashboardHealth(page)).toBe(before);
  const button = page.locator('[data-adapter="oura"] [data-wearable-settings-action="sync-now"]'); await expect(button).toBeVisible(); await expect(button).toBeFocused();
  try {
    await button.click(); await expect.poll(() => calls).toBe(10); await expect(button).toBeDisabled(); await expect(page.locator('#notification-container')).toContainText('Checking Oura'); expect(await dashboardHealth(page)).toBe(before);
    await button.dispatchEvent('click'); expect(calls).toBe(10); // Native duplicate suppression, even for a queued event.
    release(); await expect(button).toBeEnabled();
    if (failed) { expect(await dashboardHealth(page)).toBe(before); await expect(page.locator('#notification-container')).toContainText('sync failed'); }
    else {
      await expect(page.locator('#notification-container')).toContainText('Oura is up to date. 1 days checked.');
      const rows = await page.evaluate(async () => { const { state } = await import('/js/state.js'); return (await import('/js/wearables-store.js')).getDailyRange(state.currentProfile, 'oura', '0000-01-01', '9999-12-31'); });
      expect(rows).toContainEqual(expect.objectContaining({ source: 'oura', sleep_score: 83 }));
      await expect.poll(() => page.evaluate(async () => { const { state } = await import('/js/state.js'); return Number((state.importedData.wearableConnections?.oura as { lastSyncAt?: number })?.lastSyncAt); })).toBeGreaterThan(Number(seeded.source.lastSyncAt));
    }
    const after = await page.evaluate(async () => { const { state } = await import('/js/state.js'); return { notes: state.importedData.contextNotes, entries: state.importedData.entries }; }); expect(after).toEqual({ notes: seeded.notes, entries: seeded.entries });
  } finally { release(); }
});

test('stale or disabled source snapshots never open Settings or alter health data', async ({ page, context }) => {
  await context.route('https://**/*', route => route.abort()); await seedDashboardControlProfile(page);
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js'); (await import('/js/chat-threads.js')).ensureActiveThread(); const owner = await import('/js/wearable-source-controls.js');
    state.importedData.wearableConnections = { oura: { connectedAt: Date.now(), accessToken: 'SYNTHETIC_LEGACY', expiresAt: Date.now() + 86400000 } };
    const read = owner.readConfiguredWearableSources(state.currentProfile); if (!read.snapshotId) throw new Error('Expected source snapshot'); state.importedData.wearableConnections.oura = { connectedAt: Date.now(), accessToken: 'NEWER_SYNTHETIC' };
    const before = JSON.stringify(state.importedData), receipt = await (await import('/js/agent-tool-bindings.js')).navigateFromAgent({ view: 'wearablesSettings', marker: '', recordId: 'oura', snapshotId: read.snapshotId });
    const after = JSON.stringify(state.importedData); (await import('/js/lab-context-settings.js')).setWearableContextEnabled(false); const beforeDisabledRead = JSON.stringify(state.importedData), hidden = owner.readConfiguredWearableSources(state.currentProfile);
    return { before, after, receipt, hidden, beforeDisabledRead, afterDisabledRead: JSON.stringify(state.importedData) };
  });
  expect(result.receipt).toMatchObject({ changed: false, dataSaved: false }); expect(result.after).toBe(result.before); expect(result.afterDisabledRead).toBe(result.beforeDisabledRead); expect(result.hidden).not.toHaveProperty('sources'); await expect(page.locator('#settings-modal-overlay.show')).toHaveCount(0);
});
