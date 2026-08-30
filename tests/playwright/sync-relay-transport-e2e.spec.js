import { expect, test } from '@playwright/test';

const TRANSPORT_E2E_ENABLED = process.env.SYNC_TRANSPORT_E2E === '1';
const RELAY_URL = process.env.SYNC_TRANSPORT_RELAY || 'ws://127.0.0.1:4000';
const SELF_URL = process.env.SYNC_TRANSPORT_SELF_URL || 'http://127.0.0.1:4003';
const EVOLU_CLIENT = process.env.SYNC_TRANSPORT_EVOLU_CLIENT || 'v8';
const APP_URL = EVOLU_CLIENT === 'v7' ? '/app?evolu-client=v7' : '/app';
const BASELINE_CONTEXT = 'transport-e2e-baseline';
const UPDATED_CONTEXT = 'transport-e2e-updated';
const OFFLINE_CONTEXT = 'transport-e2e-offline-recovery';

test.skip(!TRANSPORT_E2E_ENABLED, 'requires an explicit disposable Evolu relay');
test.describe.configure({ mode: 'serial' });

function legalAcceptance() {
  return {
    accepted: true,
    termsVersion: '2026-08-22',
    privacyVersion: '2026-08-22',
    acceptedAt: '2026-08-06T00:00:00.000Z',
    appVersion: 'sync-transport-e2e',
    location: 'sync-transport-e2e',
  };
}

async function createDevice(browser, label) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addInitScript(({ relayUrl, selfUrl, acceptance, debug }) => {
    if (!/^https?:$/.test(location.protocol)) return;
    localStorage.setItem('labcharts-sync-relay', relayUrl);
    localStorage.setItem('labcharts-self-url', selfUrl);
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify(acceptance));
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
    localStorage.setItem('labcharts-analytics-disabled', 'true');
    localStorage.setItem('labcharts-default-onboarded', 'profile-set');
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
    localStorage.setItem('labcharts-default-ai-reminder-dismissed', '1');
    localStorage.setItem('labcharts-onboard-extras-done-default', '1');
    localStorage.setItem('labcharts-onboard-provider-skipped-default', '1');
    if (debug) localStorage.setItem('labcharts-debug', 'true');
  }, {
    relayUrl: RELAY_URL,
    selfUrl: SELF_URL,
    acceptance: legalAcceptance(),
    debug: process.env.SYNC_TRANSPORT_DEBUG === '1',
  });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
  if (process.env.SYNC_TRANSPORT_DEBUG === '1') {
    page.on('console', message => {
      if (message.text().includes('[sync]')) console.log(`${label}: ${message.text()}`);
    });
  }
  page.setDefaultTimeout(20_000);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(async () => {
    const { state } = await import('/js/state.js');
    return state.currentProfile === 'default' && !!state.importedData;
  });
  return { context, page, label, errors };
}

async function waitForOwner(page, expectedOwnerId = null) {
  const readOwnerId = async () => page.evaluate(async () => {
    const runtime = await import('/js/sync-runtime.js');
    return runtime.getSyncAppOwner()?.id ? String(runtime.getSyncAppOwner().id) : null;
  });
  if (expectedOwnerId) {
    await expect.poll(readOwnerId, {
      timeout: 30_000,
      intervals: [100, 250, 500, 1000],
    }).toBe(expectedOwnerId);
  } else {
    await expect.poll(async () => typeof await readOwnerId(), {
      timeout: 30_000,
      intervals: [100, 250, 500, 1000],
    }).toBe('string');
  }

  return page.evaluate(async () => {
    const [{ getMnemonic }, runtime] = await Promise.all([
      import('/js/sync.js'),
      import('/js/sync-runtime.js'),
    ]);
    const owner = runtime.getSyncAppOwner();
    return { ownerId: String(owner.id), mnemonic: getMnemonic() };
  });
}

async function enableNewIdentity(page) {
  await page.evaluate(async () => {
    const { enableSync } = await import('/js/sync.js');
    await enableSync({ skipPush: false });
  });
  return waitForOwner(page);
}

async function joinIdentity(page, mnemonic, ownerId) {
  await page.evaluate(async () => {
    const { enableSync } = await import('/js/sync.js');
    // Match the Settings "Join existing device" path: the throwaway owner is
    // intentionally provisional until restoreFromMnemonic accepts the seed.
    await enableSync({ skipPush: true, persist: false });
  });
  await waitForOwner(page);

  const reloaded = page.waitForEvent('load', { timeout: 30_000 });
  let restored = true;
  try {
    restored = await page.evaluate(async words => {
      const { restoreFromMnemonic } = await import('/js/sync.js');
      return restoreFromMnemonic(words);
    }, mnemonic);
  } catch (error) {
    // Evolu's restore reloads the app as part of the successful reset, which
    // can destroy this evaluation context before its boolean crosses back to
    // Playwright. The owner-id assertion below is the authoritative result.
    if (!/Execution context was destroyed|navigation/i.test(error?.message || '')) throw error;
  }
  expect(restored).toBe(true);
  await reloaded;
  await waitForOwner(page, ownerId);
}

async function setSyntheticData(page, action) {
  return page.evaluate(async requestedAction => {
    const [{ state }, dataModule, mergeModule] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/data-merge.js'),
    ]);
    if (requestedAction === 'seed') {
      state.importedData.contextNotes = 'transport-e2e-baseline';
      state.importedData.notes = [{
        date: '2026-08-06T08:00:00.000Z',
        text: 'baseline-note',
        updatedAt: '2026-08-06T08:00:00.000Z',
      }];
    } else if (requestedAction === 'update-a') {
      state.importedData.contextNotes = 'transport-e2e-updated';
      state.importedData.notes.push({
        date: '2026-08-06T09:00:00.000Z',
        text: 'from-device-a',
        updatedAt: '2026-08-06T09:00:00.000Z',
      });
    } else if (requestedAction === 'offline-context') {
      state.importedData.contextNotes = 'transport-e2e-offline-recovery';
    } else if (requestedAction === 'concurrent-a') {
      state.importedData.notes.push({
        date: '2026-08-06T10:00:00.000Z',
        text: 'concurrent-a',
        updatedAt: '2026-08-06T10:00:00.000Z',
      });
    } else if (requestedAction === 'concurrent-b') {
      state.importedData.notes.push({
        date: '2026-08-06T10:00:01.000Z',
        text: 'concurrent-b',
        updatedAt: '2026-08-06T10:00:01.000Z',
      });
    } else if (requestedAction === 'delete-baseline') {
      const index = state.importedData.notes.findIndex(note => note.text === 'baseline-note');
      if (index >= 0) mergeModule.deleteImportedArrayItem(state.importedData, 'notes', index);
    } else {
      throw new Error(`Unknown synthetic mutation: ${requestedAction}`);
    }
    return dataModule.saveImportedData();
  }, action);
}

async function syncNow(page) {
  return page.evaluate(async () => {
    const result = await (await import('/js/sync.js')).syncNow();
    return result ? {
      ok: result.ok ?? null,
      skipped: result.skipped ?? false,
      reason: result.reason ?? null,
    } : null;
  });
}

async function relayStorage(page) {
  return page.evaluate(async () => {
    const result = await (await import('/js/sync.js')).fetchOwnerStorageFromRelay();
    return result && {
      storedBytes: result.storedBytes,
      quotaBytes: result.quotaBytes,
      messageCount: result.messageCount,
      lastWriteToken: result.lastWriteToken,
    };
  });
}

async function waitForStableRelayStorage(page, { minimumMessages = 1 } = {}) {
  let previous = null;
  let stableReads = 0;
  let latest = null;
  await expect.poll(async () => {
    latest = await relayStorage(page);
    const key = latest && `${latest.storedBytes}:${latest.messageCount}:${latest.lastWriteToken || ''}`;
    if (latest?.messageCount >= minimumMessages && key === previous) stableReads++;
    else stableReads = 0;
    previous = key;
    return stableReads;
  }, { timeout: 30_000, intervals: [250, 500, 750] }).toBeGreaterThanOrEqual(2);
  return latest;
}

async function contextNotes(page) {
  return page.evaluate(async () => (await import('/js/state.js')).state.importedData?.contextNotes || '');
}

async function noteTexts(page) {
  return page.evaluate(async () => ((await import('/js/state.js')).state.importedData?.notes || [])
    .map(note => note.text).sort());
}

async function waitForContext(page, expected) {
  await expect.poll(() => contextNotes(page), {
    timeout: 30_000,
    intervals: [100, 250, 500, 1000],
  }).toBe(expected);
}

async function waitForNotes(page, expected) {
  await expect.poll(() => noteTexts(page), {
    timeout: 30_000,
    intervals: [100, 250, 500, 1000],
  }).toEqual([...expected].sort());
}

test('real relay converges devices, resists no-op bloat, recovers offline, and rebuilds', async ({ browser }) => {
  test.setTimeout(240_000);
  const devices = [];
  let cleanupPage = null;

  try {
    const deviceA = await createDevice(browser, 'device A');
    devices.push(deviceA);
    cleanupPage = deviceA.page;

    await setSyntheticData(deviceA.page, 'seed');
    const identity = await enableNewIdentity(deviceA.page);
    expect(identity.mnemonic?.trim().split(/\s+/)).toHaveLength(24);
    const initialStorage = await waitForStableRelayStorage(deviceA.page);
    expect(initialStorage.quotaBytes).toBeGreaterThan(0);

    const deviceB = await createDevice(browser, 'device B');
    devices.push(deviceB);
    await joinIdentity(deviceB.page, identity.mnemonic, identity.ownerId);
    await waitForContext(deviceB.page, BASELINE_CONTEXT);
    await waitForNotes(deviceB.page, ['baseline-note']);

    await setSyntheticData(deviceA.page, 'update-a');
    expect((await syncNow(deviceA.page))?.ok).toBe(true);
    await waitForContext(deviceB.page, UPDATED_CONTEXT);
    await waitForNotes(deviceB.page, ['baseline-note', 'from-device-a']);

    const beforeRefreshes = await waitForStableRelayStorage(deviceA.page);
    for (let i = 0; i < 3; i++) {
      await deviceA.page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
      await waitForOwner(deviceA.page, identity.ownerId);
      const result = await syncNow(deviceA.page);
      expect(result).toMatchObject({ ok: true, skipped: true, reason: 'unchanged' });
    }
    const afterRefreshes = await waitForStableRelayStorage(deviceA.page);
    expect(afterRefreshes.messageCount).toBe(beforeRefreshes.messageCount);
    expect(afterRefreshes.storedBytes).toBe(beforeRefreshes.storedBytes);

    await deviceB.context.setOffline(true);
    await setSyntheticData(deviceA.page, 'offline-context');
    expect((await syncNow(deviceA.page))?.ok).toBe(true);
    await deviceB.context.setOffline(false);
    await syncNow(deviceB.page);
    await waitForContext(deviceB.page, OFFLINE_CONTEXT);

    await deviceB.context.setOffline(true);
    await setSyntheticData(deviceA.page, 'concurrent-a');
    expect((await syncNow(deviceA.page))?.ok).toBe(true);
    await setSyntheticData(deviceB.page, 'concurrent-b');
    await syncNow(deviceB.page);
    await deviceB.context.setOffline(false);
    await syncNow(deviceB.page);
    await waitForNotes(deviceA.page, [
      'baseline-note', 'from-device-a', 'concurrent-a', 'concurrent-b',
    ]);
    await waitForNotes(deviceB.page, [
      'baseline-note', 'from-device-a', 'concurrent-a', 'concurrent-b',
    ]);
    await waitForContext(deviceA.page, OFFLINE_CONTEXT);
    await waitForContext(deviceB.page, OFFLINE_CONTEXT);

    await setSyntheticData(deviceA.page, 'delete-baseline');
    expect((await syncNow(deviceA.page))?.ok).toBe(true);
    await waitForNotes(deviceB.page, ['from-device-a', 'concurrent-a', 'concurrent-b']);
    await waitForContext(deviceA.page, OFFLINE_CONTEXT);
    await waitForContext(deviceB.page, OFFLINE_CONTEXT);

    // Keep a fully-synced paired device offline across compaction. Its local
    // Evolu log still contains every discarded relay message, which is the
    // production path that used to refill a 200 MB owner immediately.
    await deviceB.context.setOffline(true);
    const beforeCompaction = await waitForStableRelayStorage(deviceA.page);
    const compacted = await deviceA.page.evaluate(async () => (
      (await import('/js/sync.js')).compactOwnerSelfServe()
    ));
    expect(compacted.beforeStoredBytes).toBe(beforeCompaction.storedBytes);
    expect(compacted.afterStoredBytes).toBe(0);

    const rebuilt = await deviceA.page.evaluate(async () => (
      (await import('/js/sync-actions.js')).rebuildOwnerRelayState()
    ));
    expect(rebuilt.failed).toBe(0);
    const afterRebuild = await waitForStableRelayStorage(deviceA.page);
    expect(afterRebuild.messageCount).toBeGreaterThan(0);
    await waitForContext(deviceA.page, OFFLINE_CONTEXT);

    const deviceC = await createDevice(browser, 'device C');
    devices.push(deviceC);
    await joinIdentity(deviceC.page, identity.mnemonic, identity.ownerId);
    await waitForContext(deviceC.page, OFFLINE_CONTEXT);
    await waitForNotes(deviceC.page, ['from-device-a', 'concurrent-a', 'concurrent-b']);

    await deviceB.context.setOffline(false);
    await deviceB.page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForOwner(deviceB.page, identity.ownerId);
    await waitForNotes(deviceB.page, ['from-device-a', 'concurrent-a', 'concurrent-b']);
    const afterOldDeviceReconnect = await waitForStableRelayStorage(deviceA.page);
    // Reconciliation may produce a small number of genuinely new messages on
    // the stale device. The discarded pre-compaction log itself must remain
    // filtered, and subsequent reconnects must not grow storage again.
    expect(afterOldDeviceReconnect.messageCount).toBeLessThan(compacted.deletedMessages);
    expect(afterOldDeviceReconnect.storedBytes).toBeLessThan(beforeCompaction.storedBytes);

    await deviceB.page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForOwner(deviceB.page, identity.ownerId);
    await waitForNotes(deviceB.page, ['from-device-a', 'concurrent-a', 'concurrent-b']);
    const afterRepeatedReconnect = await waitForStableRelayStorage(deviceA.page);
    expect(afterRepeatedReconnect.messageCount).toBe(afterOldDeviceReconnect.messageCount);
    expect(afterRepeatedReconnect.storedBytes).toBe(afterOldDeviceReconnect.storedBytes);

    for (const device of devices) expect(device.errors).toEqual([]);
  } finally {
    if (cleanupPage && !cleanupPage.isClosed()) {
      await cleanupPage.evaluate(async () => {
        try { await (await import('/js/sync.js')).compactOwnerSelfServe(); } catch {}
      }).catch(() => {});
    }
    for (const device of devices.reverse()) {
      await device.context.close().catch(() => {});
    }
  }
});
