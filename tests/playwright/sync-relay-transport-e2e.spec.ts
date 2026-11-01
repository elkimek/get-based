import {waitForAsyncCondition} from '../helpers/awaited-condition.js';
import type {DeltaItemRow} from "../../js/sync-delta-row-codec.js";
import type { Browser } from '@playwright/test';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

const TRANSPORT_E2E_ENABLED = process.env.SYNC_TRANSPORT_E2E === '1';
const RELAY_URL = process.env.SYNC_TRANSPORT_RELAY || 'ws://127.0.0.1:4000';
const SELF_URL = process.env.SYNC_TRANSPORT_SELF_URL || 'http://127.0.0.1:4003';
const EVOLU_CLIENT = process.env.SYNC_TRANSPORT_EVOLU_CLIENT || 'v8';
const APP_URL = EVOLU_CLIENT === 'v7' ? '/app?evolu-client=v7' : '/app';
// Frozen canonical bridge from c1135b1fc04999cf76ffa854cfe6723e41d7068a.
// This runs the actual previous web/common graph, without adapting its API to
// the current client or mocking transport, owner proof, storage, or compaction.
const previousBridge = EVOLU_CLIENT === 'v8-mixed' ? stripTypeScriptTypes(
  readFileSync(new URL('../fixtures/evolu8-web-3.1-bridge.ts.txt', import.meta.url), 'utf8'),
) : null;
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
    policyScope: 'self-hosted-notice',
    acceptedAt: '2026-08-06T00:00:00.000Z',
    appVersion: 'sync-transport-e2e',
    location: 'sync-transport-e2e',
  };
}

async function createDevice(browser: Browser, label: string) {
  const context = await browser.newContext({ serviceWorkers: 'block', baseURL: String(test.info().project.use.baseURL) });
  if (previousBridge && label.endsWith('device A')) {
    await context.route(url => url.pathname === '/js/sync-evolu8-candidate.js', route => route.fulfill({
      contentType: 'text/javascript', body: previousBridge,
    }));
  }
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
  const errors: unknown[] = [];
  const consoleErrors: string[] = [], syncWarnings: string[] = [];
  const statusErrors: unknown[] = [];
  let observedStatusPages = 0;
  await context.exposeBinding('__testSyncStatus', (_source, event: {ready?: boolean; error?: unknown}) => {
    if (event.ready) observedStatusPages++; else statusErrors.push(event.error);
  });
  await context.addInitScript(() => {
    if (!/^https?:$/.test(location.protocol)) return;
    const report = (event: unknown) => (window as unknown as {__testSyncStatus: (event: unknown) => Promise<unknown>}).__testSyncStatus(event);
    void import('/js/sync-state.js').then(sync => {
      const inspect: Parameters<typeof sync.subscribeSyncStatus>[0] = status => {
        if (status.databaseError || status.lastError || status.replication === 'Error') {
          void report({error: {databaseError: status.databaseError, lastError: status.lastError, replication: status.replication}});
        }
      };
      sync.subscribeSyncStatus(inspect); inspect(sync.getSyncStatus());
      return report({ready: true});
    }).catch(error => report({error: {observer: String(error)}}));
  });
  page.on('pageerror', (error: unknown) => errors.push(`${label}: ${(error as {message: unknown}).message}`));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
    if (message.type() === 'warning' && message.text().startsWith('[sync]')) syncWarnings.push(message.text());
  });
  if (process.env.SYNC_TRANSPORT_DEBUG === '1') {
    page.on('console', message => {
      if (message.text().includes('[sync]')) console.log(`${label}: ${message.text()}`);
    });
  }
  page.setDefaultTimeout(20_000);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForAsyncCondition(() => page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return state.currentProfile === 'default' && !!state.importedData;
  }), 20_000);
  return { context, page, label, errors, consoleErrors, syncWarnings, statusErrors, get observedStatusPages() {return observedStatusPages;} };
}

async function waitForOwner(page: Page, expectedOwnerId: unknown = null) {
  const readOwnerId = async () => page.evaluate(async () => {
    const runtime = await import('/js/sync-runtime.js');
    return runtime.getSyncAppOwner()?.id ? String(runtime.getSyncAppOwner()!.id) : null;
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

  // Owner availability precedes startup repair. Finish that phase before
  // the next scenario writes a newer value on another device, otherwise
  // the fixture accidentally tests competing whole-profile writes.
  let idleReads = 0;
  await expect.poll(async () => {
    const idle = await page.evaluate(async () => {
      const [rebroadcast, pull, syncState] = await Promise.all([
        import('/js/sync-pull-rebroadcast.js'), import('/js/sync-pull.js'), import('/js/sync-state.js'),
      ]);
      return !rebroadcast.isSyncRebroadcastSettling() && !pull.isSyncPulling()
        && syncState.getSyncStatus().push !== 'pending';
    });
    idleReads = idle ? idleReads + 1 : 0;
    return idleReads;
  }, { timeout: 30_000, intervals: [250, 500, 750] }).toBeGreaterThanOrEqual(3);

  return page.evaluate(async () => {
    const [{ getMnemonic }, runtime] = await Promise.all([
      import('/js/sync.js'),
      import('/js/sync-runtime.js'),
    ]);
    const owner = runtime.getSyncAppOwner();
    return { ownerId: String(owner!.id), mnemonic: getMnemonic() };
  });
}

async function enableNewIdentity(page: Page) {
  await page.evaluate(async () => {
    const { enableSync } = await import('/js/sync.js');
    await enableSync({ skipPush: false });
  });
  return waitForOwner(page);
}

async function joinIdentity(page: Page, mnemonic:string|null, ownerId: unknown) {
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
      return (restoreFromMnemonic as (input:typeof words)=>ReturnType<typeof restoreFromMnemonic>)(words);
    }, mnemonic);
  } catch (error) {
    // Evolu's restore reloads the app as part of the successful reset, which
    // can destroy this evaluation context before its boolean crosses back to
    // Playwright. The owner-id assertion below is the authoritative result.
    if (!(/Execution context was destroyed|navigation/i.test as (value:unknown)=>boolean)((error as {message: unknown})?.message || '')) throw error;
  }
  expect(restored).toBe(true);
  await reloaded;
  await waitForOwner(page, ownerId);
}

async function rotateIdentityWithLocalData(page: Page) {
  const previous = await waitForOwner(page);
  const reloaded = page.waitForEvent('load', { timeout: 30_000 });
  const rotated = await page.evaluate(async () => {
    const { ensureBip39, restoreFromMnemonic } = await import('/js/sync-identity.js');
    const bip39 = await ensureBip39();
    const mnemonic = await bip39.generateMnemonic(256);
    const ok = await restoreFromMnemonic(mnemonic, { seedLocal: true });
    return { ok, mnemonic };
  });
  expect(rotated.ok).toBe(true);
  await reloaded;
  const next = await waitForOwner(page);
  expect(next.ownerId).not.toBe(previous.ownerId);
  expect(next.mnemonic).toBe(rotated.mnemonic);
  return next;
}

async function profileIds(page: Page) {
  return page.evaluate(async () => (await import('/js/profile.js')).getProfiles().map(profile => profile.id));
}

async function profileDiagnostics(page: Page) {
  return page.evaluate(async () => {
    const profiles = (await import('/js/profile.js')).getProfiles();
    const keys = Array.from({ length: localStorage.length }, (_, index: number) => localStorage.key(index)).filter(Boolean);
    return profiles.map(profile => ({
      profile,
      localKeys: keys.filter(key => key!.includes(profile.id)),
    }));
  });
}

async function waitForProfilePresence(page: Page, profileId:unknown, present: unknown) {
  await expect.poll(async () => ((await profileIds(page)).includes as (value:unknown)=>boolean)(profileId), {
    timeout: 30_000,
    intervals: [100, 250, 500, 1000],
  }).toBe(present);
}

async function activateProfile(page: Page, profileId: string) {
  await page.evaluate(async id => (await import('/js/profile.js')).loadProfile(id), profileId);
  await expect.poll(() => page.evaluate(async id => (
    (await import('/js/state.js')).state.currentProfile === id
  ), profileId), { timeout: 30_000 }).toBe(true);
}

async function captureProfileSnapshot(page: Page, profileId: string) {
  return page.evaluate(async id => {
    const [{ state }, profileModule] = await Promise.all([
      import('/js/state.js'),
      import('/js/profile.js'),
    ]);
    const profile = profileModule.getProfiles().find(candidate => candidate.id === id);
    if (!profile || state.currentProfile !== id) throw new Error(`Profile ${id} is not active`);
    return {
      profile: ((JSON.parse as (text: unknown) => unknown)(JSON.stringify(profile)) as unknown),
      importedData: ((JSON.parse as (text: unknown) => unknown)(JSON.stringify(state.importedData)) as unknown),
    };
  }, profileId);
}

async function restoreProfileSnapshot(page: Page, snapshot: unknown) {
  await page.evaluate(async restored => {
    const [crypto, storageKeys, profileModule, restoreState] = await Promise.all([
      import('/js/crypto.js'),
      import('/js/profile-storage-key.js'),
      import('/js/profile.js'),
      import('/js/sync-backup-restore-state.js'),
    ]);
    const profileId = ((restored as {profile: unknown}).profile as {id: unknown}).id;
    await crypto.encryptedSetItem(
      (storageKeys.profileStorageKey as (profileId:unknown,suffix:Parameters<typeof storageKeys.profileStorageKey>[1])=>ReturnType<typeof storageKeys.profileStorageKey>)(profileId, 'imported'),
      JSON.stringify((restored as {importedData: unknown}).importedData),
    );
    await (profileModule.saveProfiles as (profiles:unknown[])=>ReturnType<typeof profileModule.saveProfiles>)([(restored as {profile: unknown}).profile]);
    (localStorage.setItem as (key:string,value:unknown)=>void)('labcharts-active-profile', profileId);
    restoreState.prepareRestoredProfilesForSync({ profiles: [{ profileId }] });
  }, snapshot);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForOwner(page);
  await waitForProfilePresence(page, ((snapshot as {profile: unknown}).profile as {id: unknown}).id, true);
  await expect.poll(async () => page.evaluate(async id => (
    (await import('/js/state.js')).state.currentProfile === id
  ), ((snapshot as {profile: unknown}).profile as {id: unknown}).id), { timeout: 30_000 }).toBe(true);
}

async function clearAllProfileData(page: Page, oldProfileId: unknown) {
  const clearPromise = page.evaluate(async () => (
    (await import('/js/export.js')).clearAllData()
  ));
  await page.locator('#confirm-ok').click();
  await clearPromise;
  return page.evaluate(async oldId => {
    const [{ state }, profileModule] = await Promise.all([
      import('/js/state.js'),
      import('/js/profile.js'),
    ]);
    return {
      activeProfileId: state.currentProfile,
      contextNotes: state.importedData?.contextNotes || '',
      noteCount: state.importedData?.notes?.length || 0,
      profileIds: profileModule.getProfiles().map(profile => profile.id),
      oldDeleteIntent: localStorage.getItem(`labcharts-profile-delete-intent-${oldId}`),
    };
  }, oldProfileId);
}

async function setSyntheticData(page: Page, action: unknown) {
  return page.evaluate(async requestedAction => {
    const [{ state }, dataModule, mergeModule] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/data-merge.js'),
    ]);
    if (requestedAction === 'seed') {
      (state.importedData as unknown as {contextNotes: unknown}).contextNotes = 'transport-e2e-baseline';
      (state.importedData as unknown as {notes: unknown}).notes = [{
        date: '2026-08-06T08:00:00.000Z',
        text: 'baseline-note',
        updatedAt: '2026-08-06T08:00:00.000Z',
      }];
    } else if (requestedAction === 'update-a') {
      (state.importedData as unknown as {contextNotes: unknown}).contextNotes = 'transport-e2e-updated';
      state.importedData.notes.push({
        date: '2026-08-06T09:00:00.000Z',
        text: 'from-device-a',
        updatedAt: '2026-08-06T09:00:00.000Z',
      });
    } else if (requestedAction === 'offline-context') {
      (state.importedData as unknown as {contextNotes: unknown}).contextNotes = 'transport-e2e-offline-recovery';
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
      const index = state.importedData.notes.findIndex((note: unknown) => (note as {text: unknown}).text === 'baseline-note');
      if (index >= 0) mergeModule.deleteImportedArrayItem(state.importedData, 'notes', index);
    } else {
      throw new Error(`Unknown synthetic mutation: ${requestedAction}`);
    }
    const saved = await dataModule.saveImportedData();
    if (requestedAction === 'offline-context' && state.importedData.contextNotes !== 'transport-e2e-offline-recovery') {
      const [writes, crypto, profile, dirty] = await Promise.all([
        import('/js/profile-data-writes.js'), import('/js/crypto.js'), import('/js/profile.js'), import('/js/sync-dirty-state.js'),
      ]);
      const raw = await crypto.encryptedGetItem(profile.profileStorageKey(state.currentProfile, 'imported'));
      throw new Error('Offline edit lost before save returned: ' + JSON.stringify({saved,
        live: state.importedData.contextNotes, baseline: writes.profileDataBaseline(state.importedData)?.contextNotes,
        stored: raw ? JSON.parse(raw).contextNotes : null, dirty: !!dirty.getSyncDirtyToken(state.currentProfile)}));
    }
    return saved;
  }, action);
}

async function syncNow(page: Page) {
  return page.evaluate(async () => {
    const result = await (await import('/js/sync.js')).syncNow();
    return result ? {
      ok: result.ok ?? null,
      skipped: result.skipped ?? false,
      reason: result.reason ?? null,
    } : null;
  });
}

async function relayStorage(page: Page) {
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

async function waitForStableRelayStorage(page: Page, { minimumMessages = 1 } = {}):Promise<Awaited<ReturnType<typeof relayStorage>>> {
  let previous:string|null = null;
  let stableReads = 0;
  let latest:Awaited<ReturnType<typeof relayStorage>> = null;
  await expect.poll(async () => {
    latest = await relayStorage(page);
    const key = latest && `${latest.storedBytes}:${latest.messageCount}:${latest.lastWriteToken || ''}`;
    if ((latest?.messageCount as number) >= minimumMessages && key === previous) stableReads++;
    else stableReads = 0;
    previous = key;
    return stableReads;
  }, { timeout: 30_000, intervals: [250, 500, 750] }).toBeGreaterThanOrEqual(2);
  return latest;
}

async function contextNotes(page: Page) {
  return page.evaluate(async () => (await import('/js/state.js')).state.importedData?.contextNotes || '');
}

async function noteTexts(page: Page) {
  return page.evaluate(async () => ((await import('/js/state.js')).state.importedData?.notes || [])
    .map(note => note.text).sort());
}

async function syncDiagnostics(page: Page) {
  return page.evaluate(async () => {
    const [runtime, rowCodec, payloadCodec] = await Promise.all([
      import('/js/sync-runtime.js'),
      import('/js/sync-delta-row-codec.js'),
      import('/js/sync-payload-codec.js'),
    ]);
    const evolu = runtime.getSyncEvolu();
    const itemRows = evolu?.getQueryRows<DeltaItemRow>(runtime.getSyncItemRowQuery()) || [];
    const profileRows = evolu?.getQueryRows(runtime.getSyncProfileQuery()) || [];
    const rows: unknown[] = [];
    for (const row of itemRows.filter(candidate => (
      candidate?.arrayName === 'notes' || candidate?.arrayName === 'contextNotes'
    ))) {
      let value: unknown = null;
      try {
        const parsed = await rowCodec.decodeRowPayload(row);
        value = row.arrayName === 'notes' ? (parsed as {text: unknown})?.text || null : (parsed as {v: unknown})?.v ?? null;
      } catch {}
      rows.push({
        id: row.id,
        arrayName: row.arrayName,
        itemId: row.itemId,
        isDeleted: row.isDeleted,
        syncedAt: row.syncedAt,
        value,
      });
    }
    const profiles: unknown[] = [];
    for (const row of profileRows) {
      let contextNotes: unknown = null;
      let noteTexts: unknown[] = [];
      try {
        const payload = await payloadCodec.parseSyncPayload(row.dataJson);
        contextNotes = (payload?.importedData as {contextNotes: unknown})?.contextNotes ?? null;
        noteTexts = (((payload?.importedData as {notes: unknown})?.notes || []) as {text:unknown}[]).map(note => note.text).sort();
      } catch {}
      profiles.push({ id: row.id, syncedAt: row.syncedAt, contextNotes, noteTexts });
    }
    const importedData = (await import('/js/state.js')).state.importedData;
    return {
      state: {
        contextNotes: importedData?.contextNotes ?? null,
        noteTexts: (importedData?.notes || []).map(note => note.text).sort(),
      },
      rows,
      profiles,
      contextVersion: (await import('/js/sync-scalar-snapshot.js')).readScalarVersion((await import('/js/state.js')).state.currentProfile, 'contextNotes'),
      dirty: (await import('/js/sync-dirty-state.js')).getSyncDirtyToken((await import('/js/state.js')).state.currentProfile),
      recentEvents: (await import('/js/sync-state.js')).getRecentSyncEvents(),
    };
  });
}

async function waitForContext(page: Page, expected:unknown) {
  try {
    await expect.poll(() => contextNotes(page), {
      timeout: 30_000,
      intervals: [100, 250, 500, 1000],
    }).toBe(expected);
  } catch (error) {
    console.error('Context sync diagnostics:', JSON.stringify(await syncDiagnostics(page)));
    throw error;
  }
}

async function waitForNotes(page: Page, expected:readonly unknown[]) {
  await expect.poll(() => noteTexts(page), {
    timeout: 30_000,
    intervals: [100, 250, 500, 1000],
  }).toEqual([...expected].sort());
}

test('real relay converges devices, resists no-op bloat, recovers offline, and rebuilds', async ({ browser }) => {
  test.setTimeout(240_000);
  const devices: Array<Awaited<ReturnType<typeof createDevice>>> = [];
  let cleanupPage: Page | null = null;

  try {
    const deviceA = await createDevice(browser, 'device A');
    devices.push(deviceA);
    cleanupPage = deviceA.page;

    await setSyntheticData(deviceA.page, 'seed');
    const identity = await enableNewIdentity(deviceA.page);
    expect(identity.mnemonic?.trim().split(/\s+/)).toHaveLength(24);
    const initialStorage = await waitForStableRelayStorage(deviceA.page);
    expect(initialStorage!.quotaBytes).toBeGreaterThan(0);

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
    expect(afterRefreshes!.messageCount).toBe(beforeRefreshes!.messageCount);
    expect(afterRefreshes!.storedBytes).toBe(beforeRefreshes!.storedBytes);

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

    // The next phase tests deletion after convergence, so let the queued
    // union rebroadcast commit before introducing the delete.
    await waitForStableRelayStorage(deviceA.page);

    await setSyntheticData(deviceA.page, 'delete-baseline');
    expect((await syncNow(deviceA.page))?.ok).toBe(true);
    await waitForNotes(deviceB.page, ['from-device-a', 'concurrent-a', 'concurrent-b']);
    await waitForContext(deviceA.page, OFFLINE_CONTEXT);
    await waitForContext(deviceB.page, OFFLINE_CONTEXT);

    // Keep a fully-synced paired device offline across compaction. Its local
    // Evolu log still contains every discarded relay message, which is the
    // production path that used to refill a 200 MB owner immediately.
    await deviceB.context.setOffline(true);
    await deviceA.page.evaluate(async () => (
      (await import('/js/sync-actions.js')).prepareRelayCompaction()
    ));
    const beforeCompaction = await waitForStableRelayStorage(deviceA.page);
    const compacted = await deviceA.page.evaluate(async () => (
      (await import('/js/sync.js')).compactOwnerSelfServe()
    ));
    expect(compacted!.beforeStoredBytes).toBe(beforeCompaction!.storedBytes);
    expect(compacted!.afterStoredBytes).toBe(0);

    const rebuilt = await deviceA.page.evaluate(async () => (
      (await import('/js/sync-actions.js')).rebuildOwnerRelayState()
    ));
    expect(rebuilt.failed).toBe(0);
    const afterRebuild = await waitForStableRelayStorage(deviceA.page);
    expect(afterRebuild!.messageCount).toBeGreaterThan(0);
    await waitForContext(deviceA.page, OFFLINE_CONTEXT);

    const deviceC = await createDevice(browser, 'device C');
    devices.push(deviceC);
    await joinIdentity(deviceC.page, identity.mnemonic, identity.ownerId);
    await waitForContext(deviceC.page, OFFLINE_CONTEXT);
    await waitForNotes(deviceC.page, ['from-device-a', 'concurrent-a', 'concurrent-b']);

    await deviceB.context.setOffline(false);
    await deviceB.page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForOwner(deviceB.page, identity.ownerId);
    try {
      await waitForNotes(deviceB.page, ['from-device-a', 'concurrent-a', 'concurrent-b']);
      if (process.env.SYNC_TRANSPORT_DEBUG === '1') {
        console.log('Stale-device sync diagnostics:', JSON.stringify(await syncDiagnostics(deviceB.page)));
      }
    } catch (error) {
      console.error('Stale-device sync diagnostics:', JSON.stringify(await syncDiagnostics(deviceB.page)));
      throw error;
    }
    const afterOldDeviceReconnect = await waitForStableRelayStorage(deviceA.page);
    // Reconciliation may produce a small number of genuinely new messages on
    // the stale device. The discarded pre-compaction log itself must remain
    // filtered, and subsequent reconnects must not grow storage again.
    expect(afterOldDeviceReconnect!.messageCount).toBeLessThan(compacted!.deletedMessages as number);
    expect(afterOldDeviceReconnect!.storedBytes).toBeLessThan(beforeCompaction!.storedBytes);

    await deviceB.page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForOwner(deviceB.page, identity.ownerId);
    await waitForNotes(deviceB.page, ['from-device-a', 'concurrent-a', 'concurrent-b']);
    const afterRepeatedReconnect = await waitForStableRelayStorage(deviceA.page);
    expect(afterRepeatedReconnect!.messageCount).toBe(afterOldDeviceReconnect!.messageCount);
    expect(afterRepeatedReconnect!.storedBytes).toBe(afterOldDeviceReconnect!.storedBytes);

    if (EVOLU_CLIENT !== 'v7') {
      await expect.poll(() => deviceB.page.evaluate(async () => (
        (await import('/js/sync-state.js')).getSyncStatus().replication
      )), {timeout: 30_000}).toBe('Synced');
    }

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

test('a blob-only scalar clear survives a delayed live row through the real SDK and relay', async ({ browser }) => {
  test.setTimeout(120_000);
  const devices: Array<Awaited<ReturnType<typeof createDevice>>> = [];
  try {
    const a = await createDevice(browser, 'clear device A'); devices.push(a);
    const identity = await enableNewIdentity(a.page);
    const b = await createDevice(browser, 'clear device B'); devices.push(b);
    await joinIdentity(b.page, identity.mnemonic, identity.ownerId);
    // A durable blob receipt can precede its item-row subscription. Exercise
    // the resulting native planner/mutation path with both actual SDK graphs.
    const clocks = await a.page.evaluate(async () => {
      const [{writeScalarVersion, scalarValueHash}, delta] = await Promise.all([
        import('/js/sync-scalar-snapshot.js'), import('/js/sync-delta.js'),
      ]);
      const before = Date.now();
      if (!writeScalarVersion('default', 'interpretiveLens', {clock: before, hash: scalarValueHash('interpretiveLens', 'delayed value')})) throw new Error('Receipt not saved');
      const plan = await delta._planScalarDelta('default', 'interpretiveLens', null);
      if (plan.ops.length !== 1 || plan.ops[0]!.kind !== 'insert' || !delta._applyArrayDelta('interpretiveLens', plan)) throw new Error('Clear not queued');
      return {before, clear: Date.parse(String(plan.ops[0]!.args.syncedAt))};
    });
    expect(clocks.clear).toBeGreaterThan(clocks.before);
    const rows = (page: Page) => page.evaluate(async () => {
      const runtime = await import('/js/sync-runtime.js');
      const rows = runtime.getSyncEvolu()!.getQueryRows(runtime.getSyncItemRowQuery()) as readonly DeltaItemRow[] | null | undefined;
      return (rows || []).filter(row => row.profileId === 'default' && row.arrayName === 'interpretiveLens');
    });
    await expect.poll(async () => (await rows(b.page)).some(row => row.payload === JSON.stringify({v: null}) && Date.parse(String(row.syncedAt)) === clocks.clear)).toBe(true);
    await a.page.evaluate(async before => {
      const runtime = await import('/js/sync-runtime.js');
      runtime.getSyncEvolu()!.insert('itemRow', {profileId: 'default', arrayName: 'interpretiveLens', itemId: 'interpretiveLens',
        payload: JSON.stringify({v: 'delayed value'}), syncedAt: new Date(before).toISOString()});
    }, clocks.before);
    await expect.poll(async () => (await rows(b.page)).length).toBe(2);
    for (const device of devices) {
      await expect.poll(() => device.page.evaluate(async () => {
        const { _mergeItemRowsIntoImported } = await import('/js/sync-delta.js');
        return (await _mergeItemRowsIntoImported('default', {interpretiveLens: 'delayed value'})).interpretiveLens;
      })).toBeNull();
      expect(device.errors).toEqual([]);
    }
  } finally {
    for (const device of devices.reverse()) await device.context.close().catch(() => {});
  }
});

test('paused note edits do not overwrite context changed on another device', async ({ browser }) => {
  test.setTimeout(150_000);
  const devices: Array<Awaited<ReturnType<typeof createDevice>>> = [];
  try {
    const a = await createDevice(browser, 'device A'); devices.push(a);
    await setSyntheticData(a.page, 'seed');
    const identity = await enableNewIdentity(a.page);
    const b = await createDevice(browser, 'device B'); devices.push(b);
    await joinIdentity(b.page, identity.mnemonic, identity.ownerId);
    await waitForContext(b.page, BASELINE_CONTEXT);
    await setSyntheticData(b.page, 'update-a');
    await syncNow(b.page); await waitForContext(a.page, UPDATED_CONTEXT);
    expect(await b.page.evaluate(() => import('/js/sync.js').then(sync => sync.pauseSync()))).toBe(true);
    expect(await setSyntheticData(a.page, 'offline-context')).toBe(true);
    const manualSync = await syncNow(a.page);
    const afterManualSync = await contextNotes(a.page);
    if (!manualSync?.ok || afterManualSync !== OFFLINE_CONTEXT) console.error('Offline edit lost during manual sync:', JSON.stringify({manualSync, diagnostics: await syncDiagnostics(a.page)}));
    expect(manualSync?.ok).toBe(true);
    expect(afterManualSync).toBe(OFFLINE_CONTEXT);
    await waitForStableRelayStorage(a.page);
    await expect.poll(() => contextNotes(b.page)).toBe(UPDATED_CONTEXT);
    await setSyntheticData(b.page, 'concurrent-b');
    expect(await b.page.evaluate(() => import('/js/sync.js').then(sync => sync.enableSync()))).toBe(true);
    for (const device of [a, b]) {
      await waitForContext(device.page, OFFLINE_CONTEXT);
      await waitForNotes(device.page, ['baseline-note', 'concurrent-b', 'from-device-a']);
    }
    await b.page.evaluate(async () => {
      const { updateProfileMeta } = await import('/js/profile.js');
      await updateProfileMeta('default', { name: 'Relay metadata edit', tags: ['transport-e2e'] });
    });
    await syncNow(b.page);
    for (const device of [a, b]) {
      await expect.poll(() => device.page.evaluate(async () => {
        const { getProfiles } = await import('/js/profile.js');
        return getProfiles().find(profile => profile.id === 'default');
      }), { timeout: 30_000 }).toMatchObject({ name: 'Relay metadata edit', tags: ['transport-e2e'] });
    }
  } finally {
    const first = devices[0]?.page;
    if (first && !first.isClosed()) await first.evaluate(async () => {
      try { await (await import('/js/sync.js')).compactOwnerSelfServe(); } catch {}
    }).catch(() => {});
    for (const device of devices.reverse()) await device.context.close();
  }
});

test('restored profiles survive old tombstones and a new sync identity', async ({ browser }) => {
  test.setTimeout(300_000);
  const devices: Array<Awaited<ReturnType<typeof createDevice>>> = [];
  const profileId = 'default';

  try {
    const deviceA = await createDevice(browser, 'restore device A');
    devices.push(deviceA);
    await setSyntheticData(deviceA.page, 'seed');
    const originalIdentity = await enableNewIdentity(deviceA.page);
    const snapshot = await captureProfileSnapshot(deviceA.page, profileId);

    const deviceB = await createDevice(browser, 'restore device B');
    devices.push(deviceB);
    await joinIdentity(deviceB.page, originalIdentity.mnemonic, originalIdentity.ownerId);
    await waitForNotes(deviceB.page, ['baseline-note']);

    const deleted = await deviceB.page.evaluate(async id => {
      const [sync, policy] = await Promise.all([
        import('/js/sync.js'),
        import('/js/profile-sync-policy.js'),
      ]);
      policy.markLocalProfileDeleteIntent(id, 'local');
      return sync.deleteProfileFromRelay(id);
    }, profileId);
    expect(deleted).toMatchObject({ ok: true });
    await waitForProfilePresence(deviceA.page, profileId, false);
    await waitForProfilePresence(deviceB.page, profileId, false);

    await restoreProfileSnapshot(deviceA.page, snapshot);
    expect((await syncNow(deviceA.page))?.ok).toBe(true);
    await waitForProfilePresence(deviceB.page, profileId, true);
    await activateProfile(deviceB.page, profileId);
    await waitForNotes(deviceA.page, ['baseline-note']);
    await waitForNotes(deviceB.page, ['baseline-note']);
    await expect.poll(() => deviceB.page.evaluate(id => ({
      intent: localStorage.getItem(`labcharts-profile-delete-intent-${id}`),
      pending: localStorage.getItem(`labcharts-tombstone-pending-${id}`),
    }), profileId), { timeout: 30_000 }).toEqual({ intent: null, pending: null });

    const rotatedIdentity = await rotateIdentityWithLocalData(deviceA.page);
    await deviceB.page.evaluate(id => {
      localStorage.setItem(`labcharts-profile-delete-intent-${id}`, JSON.stringify({ at: Date.now(), source: 'old-owner' }));
      localStorage.setItem(`labcharts-tombstone-pending-${id}`, JSON.stringify({ at: Date.now(), source: 'old-owner' }));
    }, profileId);
    await joinIdentity(deviceB.page, rotatedIdentity.mnemonic, rotatedIdentity.ownerId);
    await waitForProfilePresence(deviceB.page, profileId, true);
    await activateProfile(deviceB.page, profileId);
    await waitForNotes(deviceA.page, ['baseline-note']);
    await waitForNotes(deviceB.page, ['baseline-note']);
    expect(await deviceB.page.evaluate(id => ({
      intent: localStorage.getItem(`labcharts-profile-delete-intent-${id}`),
      pending: localStorage.getItem(`labcharts-tombstone-pending-${id}`),
    }), profileId)).toEqual({ intent: null, pending: null });

    expect((await syncNow(deviceB.page))?.ok).toBe(true);
    expect((await syncNow(deviceA.page))?.ok).toBe(true);
    await waitForProfilePresence(deviceA.page, profileId, true);
    await waitForProfilePresence(deviceB.page, profileId, true);
    const newOwnerTombstones = await deviceA.page.evaluate(async id => {
      const runtime = await import('/js/sync-runtime.js');
      return runtime.getSyncEvolu()?.getQueryRows(runtime.getSyncTombstoneQuery())
        ?.filter(row => row?.profileId === id).length || 0;
    }, profileId);
    expect(newOwnerTombstones).toBe(0);

    // "Clear all data" must be a synchronized replacement, not an empty
    // update under the old id. Reusing the id lets older per-item rows rebuild
    // the profile; deleting without a replacement makes the peer invent an
    // extra local fallback profile.
    const cleared = await clearAllProfileData(deviceA.page, profileId);
    expect(cleared.activeProfileId).not.toBe(profileId);
    expect(cleared.profileIds).toEqual([cleared.activeProfileId]);
    expect(cleared.contextNotes).toBe('');
    expect(cleared.noteCount).toBe(0);
    expect(((JSON.parse as (text: unknown) => unknown)(cleared.oldDeleteIntent) as unknown)).toMatchObject({ source: 'clear-all' });
    expect((await syncNow(deviceA.page))?.ok).toBe(true);

    await waitForProfilePresence(deviceB.page, profileId, false);
    await waitForProfilePresence(deviceB.page, cleared.activeProfileId, true);
    await activateProfile(deviceB.page, cleared.activeProfileId);
    await waitForContext(deviceB.page, '');
    await waitForNotes(deviceB.page, []);
    const finalProfileIds = await profileIds(deviceB.page);
    if (finalProfileIds.length !== 1 || finalProfileIds[0] !== cleared.activeProfileId) {
      console.error('Clear-all profile diagnostics:', JSON.stringify(await profileDiagnostics(deviceB.page)));
    }
    expect(finalProfileIds).toEqual([cleared.activeProfileId]);
    for (const device of devices) expect(device.errors).toEqual([]);
  } finally {
    await Promise.all(devices.map(device => device.context.close().catch(() => {})));
  }
});

test('identity rotation with partial backup recovery stops repeat uploads and later completes', async ({browser}) => {
  test.setTimeout(120_000);
  const devices: Array<Awaited<ReturnType<typeof createDevice>>> = [];
  const a = await createDevice(browser, 'recovery device A'); devices.push(a);
  try {
    await setSyntheticData(a.page, 'seed');
    await a.page.evaluate(async () => {
      const {state} = await import('/js/state.js');
      state.importedData.customMarkers = {'custom.synthetic': {name: 'Synthetic marker', unit: 'u', group: null}};
      await (await import('/js/data.js')).saveImportedData();
    });
    const previous = await enableNewIdentity(a.page);
    await a.page.evaluate(async () => { (await import('/js/sync.js')).pauseSync(); });
    const ids = await a.page.evaluate(async () => {
      const profile = await import('/js/profile.js');
      const demo = await profile.createProfile('Synthetic recovery demo', {tags: ['demo'], skipInitialSync: true});
      const unavailable = await profile.createProfile('Synthetic unavailable recovery', {skipInitialSync: true});
      await profile.switchProfile('default');
      await (await import('/js/crypto.js')).encryptedRemoveItem(profile.profileStorageKey(unavailable, 'imported'));
      (await import('/js/sync-backup-restore-state.js')).prepareRestoredProfilesForSync({profiles: [
        {profileId: 'default'}, {profileId: demo}, {profileId: unavailable},
      ]});
      return {demo, unavailable};
    });
    const reloaded = a.page.waitForEvent('load', {timeout: 30_000});
    const rotating = a.page.evaluate(async () => (await import('/js/sync-diagnose-identity-actions.js')).confirmRotateIdentity());
    await a.page.locator('#confirm-ok').click(); await rotating;
    await a.page.locator('#rotate-saved-check').check();
    await a.page.locator('#rotate-apply-btn').click();
    await reloaded;
    await expect.poll(() => a.page.evaluate(async oldOwner => {
      const owner = (await import('/js/sync-runtime.js')).getSyncAppOwner();
      return !!owner?.id && owner.id !== oldOwner;
    }, previous.ownerId), {timeout: 30_000}).toBe(true);
    const pending = () => a.page.evaluate(async () => (await import('/js/sync-backup-restore-state.js')).getPendingBackupRestoreProfileIds());
    await expect.poll(pending, {timeout: 10_000}).toEqual([ids.unavailable]);
    const before = await waitForStableRelayStorage(a.page);
    await a.page.waitForTimeout(2000);
    const after = await waitForStableRelayStorage(a.page);
    expect(after?.messageCount).toBe(before?.messageCount);
    expect(after?.storedBytes).toBe(before?.storedBytes);
    const recoveredOwner = await waitForOwner(a.page);
    for (let reload = 0; reload < 2; reload++) {
      await a.page.reload({waitUntil: 'domcontentloaded'}); await waitForOwner(a.page, recoveredOwner.ownerId);
      await expect.poll(pending).toEqual([ids.unavailable]);
      const quiet = await waitForStableRelayStorage(a.page);
      expect(quiet?.messageCount).toBe(before?.messageCount); expect(quiet?.storedBytes).toBe(before?.storedBytes);
    }
    expect((await profileIds(a.page)).sort()).toEqual(['default', ids.demo, ids.unavailable].sort());
    await waitForContext(a.page, BASELINE_CONTEXT);
    await waitForNotes(a.page, ['baseline-note']);

    // Restore only this fixture's deliberately unavailable local snapshot, then
    // use the real manual retry path. Existing committed data must stay intact.
    await a.page.evaluate(async profileId => {
      const profile = await import('/js/profile.js');
      const data = profile.createDefaultProfileData(); data.contextNotes = 'transport-recovered-inactive';
      await (await import('/js/crypto.js')).encryptedSetItem(profile.profileStorageKey(profileId, 'imported'), JSON.stringify(data));
      (await import('/js/sync-dirty-state.js')).markSyncProfileDirty(profileId);
    }, ids.unavailable);
    expect((await syncNow(a.page))?.ok).toBe(true);
    await expect.poll(pending).toEqual([]);
    const identity = await waitForOwner(a.page);
    const b = await createDevice(browser, 'recovery device B'); devices.push(b);
    await joinIdentity(b.page, identity.mnemonic, identity.ownerId);
    await activateProfile(b.page, 'default'); await waitForContext(b.page, BASELINE_CONTEXT); await waitForNotes(b.page, ['baseline-note']);
    await activateProfile(b.page, ids.unavailable); await waitForContext(b.page, 'transport-recovered-inactive');
    expect((await profileIds(b.page)).sort()).toEqual(['default', ids.unavailable].sort());
    if (EVOLU_CLIENT === 'v8') for (const device of devices) {
      await expect.poll(() => device.page.evaluate(async () => {
        const evolu = (await import('/js/sync-runtime.js')).getSyncEvolu();
        if (!evolu?.subscribeOwnerSyncStatus) throw new Error('Missing actual modern SDK sync status');
        let phase = ''; const stop = evolu.subscribeOwnerSyncStatus(status => { phase = status.type; }); stop(); return phase;
      }), {timeout: 30_000}).toBe('Synced');
    }
    for (const device of devices) expect(device.errors).toEqual([]);
  } finally {
    await a.page.evaluate(async () => (await import('/js/sync.js')).pauseSync()).catch(() => {});
    for (const device of devices.reverse()) await device.context.close();
  }
});

test('native identity rotation retains its owner and data when recovery storage is full', async ({browser}) => {
  const a = await createDevice(browser, 'journal failure device A');
  try {
    await setSyntheticData(a.page, 'seed');
    const previous = await enableNewIdentity(a.page);
    await a.page.evaluate(async () => (await import('/js/sync.js')).pauseSync());
    await a.page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'labcharts-sync-backup-restore-pending') throw new DOMException('Synthetic full storage', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    const rotating = a.page.evaluate(async () => (await import('/js/sync-diagnose-identity-actions.js')).confirmRotateIdentity());
    await a.page.locator('#confirm-ok').click(); await rotating;
    await a.page.locator('#rotate-saved-check').check();
    await a.page.locator('#rotate-apply-btn').click();
    const message = 'Could not save sync recovery progress. Your identity and local data are unchanged. Free browser storage, then retry.';
    const error = a.page.getByRole('alert').filter({hasText: message});
    await expect(error).toBeVisible();
    await expect(error).toHaveText('✗ ' + message);
    await expect(a.page.locator('#rotate-apply-btn')).toBeEnabled();
    // Successful rotation schedules a reload after 500ms. A failed durable
    // preflight must leave the existing owner and snapshot intact instead.
    await a.page.waitForTimeout(1000);
    expect((await waitForOwner(a.page)).ownerId).toBe(previous.ownerId);
    await waitForContext(a.page, BASELINE_CONTEXT);
    await waitForNotes(a.page, ['baseline-note']);
    expect(a.errors).toEqual([]);
  } finally {
    await a.page.evaluate(async () => (await import('/js/sync.js')).pauseSync()).catch(() => {});
    await a.context.close();
  }
});

test('rejected identity rotation restores normal incoming sync with an unavailable local profile', async ({browser}) => {
  const a = await createDevice(browser, 'rejected rotation device A');
  const devices = [a];
  try {
    await setSyntheticData(a.page, 'seed');
    const previous = await enableNewIdentity(a.page);
    const b = await createDevice(browser, 'rejected rotation device B'); devices.push(b);
    await joinIdentity(b.page, previous.mnemonic, previous.ownerId);
    await waitForContext(b.page, BASELINE_CONTEXT);
    await a.page.evaluate(async () => {
      (await import('/js/sync.js')).pauseSync();
      await (await import('/js/profile.js')).createProfile('Synthetic unavailable local profile', {skipInitialSync: true});
      const evolu = (await import('/js/sync-runtime.js')).getSyncEvolu();
      if (!evolu) throw new Error('Missing actual fixture SDK');
      // Fail only the owner reset; existing SDK queries and transport remain real.
      const rejected = new Proxy(evolu, {get(target, property, receiver) {
        if (property === 'restoreAppOwner') return async () => { throw new Error('Synthetic owner reset rejection'); };
        return Reflect.get(target, property, receiver);
      }});
      (await import('/js/sync-identity.js')).configureSyncIdentity({getEvolu: () => rejected});
    });
    const rotating = a.page.evaluate(async () => (await import('/js/sync-diagnose-identity-actions.js')).confirmRotateIdentity());
    await a.page.locator('#confirm-ok').click(); await rotating;
    await a.page.locator('#rotate-saved-check').check();
    await a.page.locator('#rotate-apply-btn').click();
    await expect(a.page.getByRole('alert').filter({hasText: 'Invalid mnemonic'})).toBeVisible();
    expect((await waitForOwner(a.page)).ownerId).toBe(previous.ownerId);
    expect(await a.page.evaluate(async () => (await import('/js/sync-backup-restore-state.js')).getPendingBackupRestoreProfileIds())).toEqual([]);
    await setSyntheticData(b.page, 'update-a'); await syncNow(b.page);
    await waitForContext(a.page, UPDATED_CONTEXT); await waitForNotes(a.page, ['baseline-note', 'from-device-a']);
    for (const device of devices) expect(device.errors).toEqual([]);
  } finally {
    for (const device of devices.reverse()) await device.context.close();
  }
});

test('same-browser old-owner tab cannot acknowledge an in-flight identity handoff', async ({browser}) => {
 test.setTimeout(120_000);
 const a = await createDevice(browser, 'multi-tab handoff device A');
 try {
  await setSyntheticData(a.page, 'seed');
  const previous = await enableNewIdentity(a.page);
  const other = await a.context.newPage();
  await other.goto(APP_URL);
  await waitForOwner(other, previous.ownerId);
  await a.page.evaluate(async () => {
   const runtime = await import('/js/sync-runtime.js');
   const actual = runtime.getSyncEvolu();
   if (!actual) throw new Error('Missing real SDK');
   let release!: () => void;
   const gate = new Promise<void>(resolve => {release=resolve;});
   const probe=window as unknown as {__handoffRelease:()=>void;__handoffStarted:boolean};
   probe.__handoffRelease=release; probe.__handoffStarted=false;
   const held=new Proxy(actual,{get(target,property,receiver){
    if(property==='restoreAppOwner')return async (mnemonic:string,options?:{reload?:boolean})=>{probe.__handoffStarted=true;await gate;return target.restoreAppOwner(mnemonic,options);};
    return Reflect.get(target,property,receiver);
   }});
   (await import('/js/sync-identity.js')).configureSyncIdentity({getEvolu:()=>held});
  });
  const rotating=a.page.evaluate(async () => (await import('/js/sync-diagnose-identity-actions.js')).confirmRotateIdentity());
  await a.page.locator('#confirm-ok').click();await rotating;
  await a.page.locator('#rotate-saved-check').check();await a.page.locator('#rotate-apply-btn').click();
  await expect.poll(()=>a.page.evaluate(()=>(window as unknown as {__handoffStarted:boolean}).__handoffStarted)).toBe(true);
  const queued=()=>other.evaluate(async()=>(await import('/js/sync-backup-restore-state.js')).getPendingBackupRestoreProfileIds());
  expect(await queued()).toEqual(['default']);
  expect((await other.evaluate(async()=>(await import('/js/sync-runtime.js')).getSyncAppOwner()))?.id).toBe(previous.ownerId);
  await other.evaluate(async()=>(await import('/js/sync.js')).syncNow());
  expect(await queued()).toEqual(['default']);
  await other.close();
  const reloaded=a.page.waitForEvent('load');await a.page.evaluate(()=>(window as unknown as {__handoffRelease:()=>void}).__handoffRelease());await reloaded;
  await expect.poll(()=>a.page.evaluate(async old=>(await import('/js/sync-runtime.js')).getSyncAppOwner()?.id!==old,previous.ownerId)).toBe(true);
  await waitForContext(a.page,BASELINE_CONTEXT);
  await waitForNotes(a.page,['baseline-note']);
  const peer=await createDevice(browser,'multi-tab fresh peer');
  try{const identity=await waitForOwner(a.page);await joinIdentity(peer.page,identity.mnemonic,identity.ownerId);await waitForContext(peer.page,BASELINE_CONTEXT);await waitForNotes(peer.page,['baseline-note']);}finally{await peer.context.close();}
 }finally{await a.context.close();}
});


test('pending recovery follows an explicit join and normal incoming edits resume', async ({browser}) => {
  test.setTimeout(180_000);
  const a = await createDevice(browser, 'switch-pending device A');
  const devices = [a];
  try {
    await setSyntheticData(a.page, 'seed'); await enableNewIdentity(a.page);
    await a.page.evaluate(async () => (await import('/js/sync.js')).pauseSync());
    const inactive = await a.page.evaluate(async () => {
      const profiles = await import('/js/profile.js');
      const id = await profiles.createProfile('Synthetic pending identity switch', {skipInitialSync: true});
      await profiles.switchProfile('default');
      await (await import('/js/crypto.js')).encryptedRemoveItem(profiles.profileStorageKey(id, 'imported'));
      return id;
    });
    await rotateIdentityWithLocalData(a.page);
    const pending = () => a.page.evaluate(async () => (await import('/js/sync-backup-restore-state.js')).getPendingBackupRestoreProfileIds());
    await expect.poll(pending).toEqual([inactive]);
    const b = await createDevice(browser, 'switch-pending device B'); devices.push(b);
    await setSyntheticData(b.page, 'seed'); const target = await enableNewIdentity(b.page);
    await setSyntheticData(b.page, 'update-a'); await syncNow(b.page);
    await a.page.evaluate(async id => {
      const profiles = await import('/js/profile.js');
      const data = profiles.createDefaultProfileData(); data.contextNotes = 'synthetic pending data retained through join';
      await (await import('/js/crypto.js')).encryptedSetItem(profiles.profileStorageKey(id, 'imported'), JSON.stringify(data));
      (await import('/js/sync-dirty-state.js')).markSyncProfileDirty(id);
    }, inactive);
    await joinIdentity(a.page, target.mnemonic, target.ownerId);
    await expect.poll(pending).toEqual([]);
    await waitForContext(a.page, UPDATED_CONTEXT);
    await waitForProfilePresence(b.page, inactive, true);
    await activateProfile(a.page, inactive); await waitForContext(a.page, 'synthetic pending data retained through join');
    await activateProfile(a.page, 'default');
    await setSyntheticData(b.page, 'offline-context'); expect((await syncNow(b.page))?.ok).toBe(true);
    await waitForContext(a.page, OFFLINE_CONTEXT);
    for (const device of devices) expect(device.errors).toEqual([]);
  } finally {for (const device of devices.reverse()) await device.context.close();}
});


test('deleting an unavailable recovery profile unblocks incoming changes without reviving it', async ({browser}) => {
  test.setTimeout(120_000);
  const a = await createDevice(browser, 'deleted recovery device A');
  const devices = [a];
  try {
    await setSyntheticData(a.page, 'seed'); await enableNewIdentity(a.page);
    await a.page.evaluate(async () => (await import('/js/sync.js')).pauseSync());
    const inactive = await a.page.evaluate(async () => {
      const profiles = await import('/js/profile.js');
      const id = await profiles.createProfile('Synthetic deleted pending recovery', {skipInitialSync: true});
      await profiles.switchProfile('default');
      await (await import('/js/crypto.js')).encryptedRemoveItem(profiles.profileStorageKey(id, 'imported'));
      return id;
    });
    await rotateIdentityWithLocalData(a.page);
    const pending = () => a.page.evaluate(async () => (await import('/js/sync-backup-restore-state.js')).getPendingBackupRestoreProfileIds());
    await expect.poll(pending).toEqual([inactive]);
    const identity = await waitForOwner(a.page);
    const b = await createDevice(browser, 'deleted recovery device B'); devices.push(b);
    await joinIdentity(b.page, identity.mnemonic, identity.ownerId);
    const deleting = a.page.evaluate(async id => (await import('/js/profile.js')).deleteProfile(id), inactive);
    await a.page.locator('#confirm-ok').click(); await deleting;
    expect(await profileIds(a.page)).toEqual(['default']);
    await syncNow(a.page); await expect.poll(pending).toEqual([]);
    await a.page.reload({waitUntil: 'domcontentloaded'}); await waitForOwner(a.page, identity.ownerId);
    expect(await pending()).toEqual([]); expect(await profileIds(a.page)).toEqual(['default']);
    await waitForContext(a.page, BASELINE_CONTEXT); await waitForNotes(a.page, ['baseline-note']);
    await setSyntheticData(b.page, 'update-a'); expect((await syncNow(b.page))?.ok).toBe(true);
    await waitForContext(a.page, UPDATED_CONTEXT);
    expect(await profileIds(a.page)).toEqual(['default']); expect(await profileIds(b.page)).toEqual(['default']);
    for (const device of devices) expect(device.errors).toEqual([]);
  } finally {for (const device of devices.reverse()) await device.context.close();}
});


test('a profile reload during a queued local save retains the edit and newer draft across devices', async ({browser}) => {
  test.setTimeout(120_000);
  const a = await createDevice(browser, 'save reload device A');
  const devices = [a];
  try {
    await setSyntheticData(a.page, 'seed'); const identity = await enableNewIdentity(a.page);
    const b = await createDevice(browser, 'save reload device B'); devices.push(b);
    await joinIdentity(b.page, identity.mnemonic, identity.ownerId); await waitForContext(b.page, BASELINE_CONTEXT);
    expect(await a.page.evaluate(async () => (await import('/js/sync.js')).pauseSync())).toBe(true);
    await a.page.evaluate(async text => {
      const {state} = await import('/js/state.js'); const data = await import('/js/data.js');
      const probe = window as Window & {__releaseSaveLock?: () => void; __pendingProfileSave?: Promise<boolean>; __originalImported?: unknown};
      let entered!: () => void, release!: () => void;
      const ready = new Promise<void>(resolve => { entered = resolve; });
      const gate = new Promise<void>(resolve => { release = resolve; });
      void navigator.locks.request('getbased-profile-data:default', async () => { entered(); await gate; });
      await ready; probe.__releaseSaveLock = release;
      probe.__originalImported = state.importedData; state.importedData.contextNotes = text;
      probe.__pendingProfileSave = data.saveImportedData();
    }, OFFLINE_CONTEXT);
    await a.page.evaluate(async () => (await import('/js/profile.js')).loadProfile('default'));
    expect(await a.page.evaluate(async () => {
      const {state} = await import('/js/state.js');
      return {replaced: state.importedData !== (window as Window & {__originalImported?: unknown}).__originalImported,
        profile: state.currentProfile, context: state.importedData.contextNotes};
    })).toEqual({replaced: true, profile: 'default', context: BASELINE_CONTEXT});
    await a.page.evaluate(async () => {
      const {state} = await import('/js/state.js');
      state.importedData.notes.push({date: '2026-08-06T10:00:00.000Z', text: 'concurrent-a', updatedAt: '2026-08-06T10:00:00.000Z'});
    });
    expect(await a.page.evaluate(async () => {
      const probe = window as Window & {__releaseSaveLock?: () => void; __pendingProfileSave?: Promise<boolean>};
      probe.__releaseSaveLock!(); return probe.__pendingProfileSave;
    })).toBe(true);
    expect(await contextNotes(a.page)).toBe(OFFLINE_CONTEXT);
    await waitForNotes(a.page, ['baseline-note', 'concurrent-a']);
    expect(await a.page.evaluate(async () => (await import('/js/data.js')).saveImportedData())).toBe(true);
    expect(await a.page.evaluate(async () => (await import('/js/sync.js')).enableSync())).toBe(true);
    await waitForContext(b.page, OFFLINE_CONTEXT); await waitForNotes(b.page, ['baseline-note', 'concurrent-a']);
    for (const device of devices) expect(device.errors).toEqual([]);
  } finally {
    await a.page.evaluate(() => (window as Window & {__releaseSaveLock?: () => void}).__releaseSaveLock?.()).catch(() => {});
    for (const device of devices.reverse()) await device.context.close();
  }
});

test('a delayed Force resend cannot roll back a newer committed edit', async ({browser}) => {
  test.setTimeout(120_000);
  const a = await createDevice(browser, 'ordered push device A'); const devices = [a];
  try {
    await setSyntheticData(a.page, 'seed'); const identity = await enableNewIdentity(a.page);
    const b = await createDevice(browser, 'ordered push device B'); devices.push(b);
    await joinIdentity(b.page, identity.mnemonic, identity.ownerId); await waitForContext(b.page, BASELINE_CONTEXT);
    await a.page.evaluate(async () => {
      const {state} = await import('/js/state.js'); const data = await import('/js/data.js');
      state.importedData.contextNotes = 'older forced snapshot ' + 'x'.repeat(1024);
      if (!await data.saveImportedData()) throw new Error('Could not save synthetic older edit');
      const NativeCompressionStream = CompressionStream;
      let release!: () => void; const gate = new Promise<void>(resolve => {release = resolve;});
      const probe = {entered: false, release, older: null as Promise<void> | null,
        restore: () => {globalThis.CompressionStream = NativeCompressionStream;}};
      (window as Window & {__orderedPush?: typeof probe}).__orderedPush = probe;
      let armed = true;
      // Keep the browser's real gzip bytes; delay just one stream completion.
      // SQLite, SDK queries, owner proof and relay transport remain untouched.
      globalThis.CompressionStream = new Proxy(NativeCompressionStream, {construct(target, args) {
        const actual = Reflect.construct(target, args) as CompressionStream;
        if (!armed) return actual;
        armed = false; probe.entered = true;
        return {writable: actual.writable, readable: actual.readable.pipeThrough(new TransformStream({
          transform(chunk, controller) {controller.enqueue(chunk);}, async flush() {await gate;},
        }))};
      }});
      probe.older = (await import('/js/sync.js')).forceResendCurrentProfile();
    });
    await expect.poll(() => a.page.evaluate(() => (window as Window & {__orderedPush?: {entered: boolean}}).__orderedPush?.entered)).toBe(true);
    expect(await setSyntheticData(a.page, 'offline-context')).toBe(true);
    await a.page.evaluate(async () => (await import('/js/sync.js')).forceResendCurrentProfile());
    await waitForContext(b.page, OFFLINE_CONTEXT);
    expect(await b.page.evaluate(async () => (await import('/js/sync.js')).pauseSync())).toBe(true);
    await a.page.evaluate(async () => {
      const probe = (window as Window & {__orderedPush?: {release(): void; older: Promise<void>; restore(): void}}).__orderedPush;
      if (!probe) throw new Error('Missing ordered push fixture');
      probe.release(); await probe.older; probe.restore();
    });
    await expect.poll(async () => {
      const diagnostics = await syncDiagnostics(a.page);
      return (diagnostics.rows as {arrayName: string; syncedAt: string; value: unknown}[])
        .filter(row => row.arrayName === 'contextNotes').sort((x,y) => y.syncedAt.localeCompare(x.syncedAt))[0]?.value;
    }).toBe(OFFLINE_CONTEXT);
    expect(await contextNotes(a.page)).toBe(OFFLINE_CONTEXT);
    for (const device of devices) expect(device.errors).toEqual([]);
  } finally {
    await a.page.evaluate(async () => {
      const probe = (window as Window & {__orderedPush?: {release(): void; older: Promise<void>; restore(): void}}).__orderedPush;
      if (probe) {probe.release(); await probe.older.catch(() => {}); probe.restore();}
    }).catch(() => {});
    for (const device of devices.reverse()) await device.context.close();
  }
});

test('duplicate logical rows and a later deletion reconcile through real SDK mutations',async({browser})=>{
 test.setTimeout(120_000);
 const a=await createDevice(browser,'duplicate rows device A'),devices=[a];
 try {
  await setSyntheticData(a.page,'seed');const identity=await enableNewIdentity(a.page);
  const b=await createDevice(browser,'duplicate rows device B');devices.push(b);
  await joinIdentity(b.page,identity.mnemonic,identity.ownerId);await waitForContext(b.page,BASELINE_CONTEXT);
  for(const device of devices)expect(await device.page.evaluate(async()=> (await import('/js/sync.js')).pauseSync())).toBe(true);
  const time=Date.now();
  const write=async(page:Page,value:string,clock:number,id?:string)=>page.evaluate(async({value,clock,id})=>{
   const runtime=await import('/js/sync-runtime.js'),state=(await import('/js/state.js')).state;
   const sdk=runtime.getSyncEvolu()!,query=runtime.getSyncItemRowQuery();
   const fields={profileId:state.currentProfile,arrayName:'markerNotes',itemId:'transport_duplicate',payload:JSON.stringify({k:'transport_duplicate',v:value}),syncedAt:new Date(clock).toISOString()};
   await new Promise<void>(resolve=>{if(id)sdk.update('itemRow',{id,...fields,isDeleted:1},{onComplete:resolve});else sdk.insert('itemRow',fields,{onComplete:resolve});});
   await sdk.loadQuery(query);
   return String(sdk.getQueryRows<DeltaItemRow>(query)!.find(row=>row.arrayName===fields.arrayName&&row.itemId===fields.itemId&&row.payload===fields.payload)!.id);
  },{value,clock,id});
  const first=await write(a.page,'alpha',time);await write(b.page,'beta',time);
  const rows=async(page:Page)=>page.evaluate(async()=>{
   const runtime=await import('/js/sync-runtime.js'),sdk=runtime.getSyncEvolu()!,query=runtime.getSyncItemRowQuery();await sdk.loadQuery(query);
   return sdk.getQueryRows<DeltaItemRow>(query)!.filter(row=>row.arrayName==='markerNotes'&&row.itemId==='transport_duplicate').map(row=>({id:String(row.id),deleted:!!row.isDeleted}));
  });
  for(const device of devices)await expect.poll(async()=> (await rows(device.page)).length).toBe(2);
  const merged=async(page:Page)=>page.evaluate(async()=>{
   const runtime=await import('/js/sync-runtime.js'),sdk=runtime.getSyncEvolu()!,query=runtime.getSyncItemRowQuery();await sdk.loadQuery(query);
   const matching=sdk.getQueryRows<DeltaItemRow>(query)!.filter(row=>row.arrayName==='markerNotes'&&row.itemId==='transport_duplicate');
   const data={markerNotes:{}};await (await import('/js/sync-delta-map-merge.js')).mergeMapRowsIntoImported(data,'markerNotes',matching);return data.markerNotes;
  });
  expect(await merged(a.page)).toEqual(await merged(b.page));
  await write(a.page,'deleted',time+1000,first);
  for(const device of devices){await expect.poll(async()=> (await rows(device.page)).some(row=>row.id===first&&row.deleted)).toBe(true);expect(await merged(device.page)).toEqual({});}
  await write(b.page,'restored',time+2000);
  for(const device of devices){await expect.poll(async()=> (await rows(device.page)).length).toBe(3);expect(await merged(device.page)).toEqual({transport_duplicate:'restored'});expect(device.errors).toEqual([]);}
 } finally {for(const device of devices.reverse())await device.context.close();}
});

for (const legacy of [false, true]) test(`an in-place equal-timestamp array edit reaches a reloaded receiving device (${legacy ? 'legacy snapshots' : 'current receipts'})`, async ({browser}) => {
  test.setTimeout(120_000);
  const a = await createDevice(browser, 'array receipt device A'), devices = [a];
  const readMinutes = (page: Page) => page.evaluate(async () =>
    ((await import('/js/state.js')).state.importedData.sunSessions || []).find(item => item.id === 'transport_array')?.minutes);
  const writeMinutes = (page: Page, minutes: number) => page.evaluate(async minutes => {
    const {state} = await import('/js/state.js');
    (state.importedData as unknown as {sunSessions: unknown}).sunSessions = [{
      id: 'transport_array', date: '2026-08-06', minutes, updatedAt: Date.parse('2026-08-06T08:00:00Z'),
    }];
    await (await import('/js/data.js')).saveImportedData();
  }, minutes);
  const rowIds = (page: Page) => page.evaluate(async () => {
    const runtime = await import('/js/sync-runtime.js'), sdk = runtime.getSyncEvolu()!, query = runtime.getSyncItemRowQuery();
    await sdk.loadQuery(query);
    return sdk.getQueryRows<DeltaItemRow>(query)!.filter(row => row.arrayName === 'sunSessions' && row.itemId === 'transport_array').map(row => String(row.id));
  });
  try {
    await setSyntheticData(a.page, 'seed'); const identity = await enableNewIdentity(a.page);
    await writeMinutes(a.page, 10); expect((await syncNow(a.page))?.ok).toBe(true);
    const b = await createDevice(browser, 'array receipt device B'); devices.push(b);
    await joinIdentity(b.page, identity.mnemonic, identity.ownerId);
    await expect.poll(() => readMinutes(b.page)).toBe(10);
    await expect.poll(() => b.page.evaluate(async () => {
      const state = (await import('/js/state.js')).state;
      return !!(await import('/js/sync-delta-snapshot.js')).readArrayVersions(state.currentProfile, 'sunSessions').transport_array;
    })).toBe(true);
    const originalRows = await rowIds(b.page); expect(originalRows).toHaveLength(1);
    await b.page.reload({waitUntil: 'load'}); await waitForContext(b.page, BASELINE_CONTEXT);
    await expect.poll(() => readMinutes(b.page)).toBe(10);
    if (legacy) {
      expect(await b.page.evaluate(async () => (await import('/js/sync.js')).pauseSync())).toBe(true);
      // Recreate the previous install's receipt format while retaining the
      // real health data, SQLite rows, SDK transport, and profile persistence.
      await b.page.evaluate(async () => {
        const state = (await import('/js/state.js')).state;
        const version = (await import('/js/sync-delta-snapshot.js')).readArrayVersions(state.currentProfile, 'sunSessions').transport_array;
        if (!version) throw new Error('Missing initial receipt for migration fixture');
        const key = `labcharts-${state.currentProfile}-delta-sunSessions`;
        localStorage.setItem(key, JSON.stringify({transport_array: version.hash}));
        localStorage.setItem(`${key}-meta`, JSON.stringify({plannedAt: version.clock - 1}));
        localStorage.removeItem(`${key}-versions`);
      });
    }
    await writeMinutes(a.page, 20); expect((await syncNow(a.page))?.ok).toBe(true);
    if (legacy) {
      await expect.poll(() => b.page.evaluate(async () => {
        const runtime = await import('/js/sync-runtime.js'), sdk = runtime.getSyncEvolu()!, query = runtime.getSyncItemRowQuery();
        await sdk.loadQuery(query);
        const row = sdk.getQueryRows<DeltaItemRow>(query)!.find(row => row.arrayName === 'sunSessions' && row.itemId === 'transport_array');
        return row ? (JSON.parse(String(row.payload)) as {minutes?: number}).minutes : null;
      })).toBe(20);
      expect(await readMinutes(b.page)).toBe(10);
      expect(await b.page.evaluate(async () => (await import('/js/sync.js')).enableSync())).toBe(true);
    }
    await expect.poll(() => readMinutes(b.page), {timeout: 30_000}).toBe(20);
    expect(await rowIds(b.page)).toEqual(originalRows);
    await writeMinutes(b.page, 10); expect((await syncNow(b.page))?.ok).toBe(true);
    await expect.poll(() => readMinutes(a.page), {timeout: 30_000}).toBe(10);
    await b.page.evaluate(async () => {
      (await import('/js/state.js')).state.importedData.sunSessions = [];
      await (await import('/js/data.js')).saveImportedData();
    });
    expect((await syncNow(b.page))?.ok).toBe(true);
    await expect.poll(() => readMinutes(a.page), {timeout: 30_000}).toBeUndefined();
    await writeMinutes(b.page, 10);
    // An incoming pull can start after the local restoration was saved but
    // before its row write is queued. Its old deletion must not erase it.
    await b.page.evaluate(async () => (await import('/js/sync-pull.js')).forcePull());
    expect(await readMinutes(b.page)).toBe(10);
    expect((await syncNow(b.page))?.ok).toBe(true);
    try {
      await expect.poll(() => readMinutes(a.page), {timeout: 30_000}).toBe(10);
    } catch (error) {
      for (const device of devices) console.error('Array restore diagnostics:', JSON.stringify(await device.page.evaluate(async () => {
        const runtime = await import('/js/sync-runtime.js'), sdk = runtime.getSyncEvolu()!, query = runtime.getSyncItemRowQuery();
        await sdk.loadQuery(query);
        const state = (await import('/js/state.js')).state;
        return {
          rows: sdk.getQueryRows<DeltaItemRow>(query)!.filter(row => row.arrayName === 'sunSessions' && row.itemId === 'transport_array'),
          live: state.importedData.sunSessions,
          receipt: (await import('/js/sync-delta-snapshot.js')).readArrayVersions(state.currentProfile, 'sunSessions'),
          dirty: (await import('/js/sync-dirty-state.js')).getSyncDirtyToken(state.currentProfile),
          events: (await import('/js/sync-state.js')).getRecentSyncEvents(),
        };
      })));
      throw error;
    }
    expect(await rowIds(a.page)).toEqual(originalRows);
    for (const device of devices) expect(device.errors).toEqual([]);
  } finally { for (const device of devices.reverse()) await device.context.close(); }
});

test('all registered sync surfaces converge bidirectionally with clean console and durable storage', async ({browser, playwright}) => {
  test.setTimeout(180_000);
  const peerBrowser = process.env.SYNC_TRANSPORT_PEER_BROWSER === 'firefox'
    ? await playwright.firefox.launch({executablePath: playwright.firefox.executablePath(), args: [], headless: true, timeout: 30_000}) : null;
  const a = await createDevice(browser, 'surface device A'), devices = [a];
  const paths = [
    'sunSessions', 'lightDevices', 'deviceSessions', 'lightAudits', 'lightMeasurements', 'lightEnvironment.rooms', 'lightEnvironment.screens',
    'entries', 'notes', 'supplements', 'healthGoals', 'changeHistory', 'chatSummaries', 'importSnapshots', 'nutritionMeals',
    'markerNotes', 'markerValueNotes', 'customMarkers', 'markerPlacements', 'labOrdering', 'manualValues', 'labPanelTombstones', 'manualMetricTombstones', 'manualBodyReadings',
    'refOverrides', 'categoryLabels', 'categoryIcons', 'markerLabels', 'wearablePrimaryOverride', 'biologyScoreAI', 'genetics.snps', 'geneticsSnpTombstones', 'geneticsLifecycle', 'lightDailyVerdicts', 'contextSourceSettings',
    'diagnoses', 'diet', 'exercise', 'sleepRest', 'lightCircadian', 'stress', 'loveLife', 'environment', 'interpretiveLens', 'contextNotes',
    'menstrualCycle', 'emfAssessment', 'genetics', 'biometrics', 'lightEnvironment.burdenAI', 'agentAccess', 'agentAccessWearableSeriesDays',
    'sunCorrelations', 'lifelightProfile', 'sunDefaults', 'channelMixAI', 'biologyScoreContextAI', 'wearableSummary', 'wearableCardOrder', 'nutritionContextDays', 'nutritionTargets',
  ];
  const snapshot = (page: Page) => page.evaluate(async paths => {
    const {state} = await import('/js/state.js'), crypto = await import('/js/crypto.js');
    const stored = JSON.parse((await crypto.encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')))!) as Record<string, unknown>;
    const project = (source: unknown) => Object.fromEntries(paths.map(path => [path, path.split('.').reduce<unknown>((value, part) =>
      value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, source)]));
    return {live: project(state.importedData), stored: project(stored)};
  }, paths);
  const health = (page: Page) => page.evaluate(async () => {
    const sync = await import('/js/sync-state.js'), status = sync.getSyncStatus();
    return {databaseError: status.databaseError, lastError: status.lastError, replication: status.replication,
      dirty: (await import('/js/sync-dirty-state.js')).getSyncDirtyToken((await import('/js/state.js')).state.currentProfile),
      errors: sync.getRecentSyncEvents().filter(event => event.kind === 'error')};
  });
  try {
    const registry = await a.page.evaluate(async () => {
      const {DELTA_ARRAYS, DELTA_MAPS, DELTA_SCALARS} = await import('/js/sync-delta-surfaces.js');
      return [...DELTA_ARRAYS, ...DELTA_MAPS, ...DELTA_SCALARS].sort();
    });
    expect([...paths].sort()).toEqual(registry);
    expect(await a.page.evaluate(async () => {
      const {state} = await import('/js/state.js'), now = Date.now() - 60_000, date = '2026-08-06';
      const {appendLabOrderMove} = await import('/js/lab-ordering-core.js');
      const row = (id: string) => ({id, date, updatedAt: now});
      Object.assign(state.importedData, {
        sunSessions: [{...row('surface_sun'), minutes: 10}],
        lightDevices: [{...row('surface_device'), name: 'Synthetic lamp'}],
        deviceSessions: [{...row('surface_session'), deviceId: 'surface_device', duration: 300}],
        lightAudits: [{...row('surface_audit'), notes: 'Synthetic audit'}],
        lightMeasurements: [{...row('surface_measurement'), lux: 100}],
        lightEnvironment: {rooms: [{...row('surface_room'), name: 'Synthetic room'}], screens: [{...row('surface_screen'), name: 'Synthetic screen'}], burdenAI: {text: 'Synthetic burden', updatedAt: now}},
        entries: [{date, markers: {'lipids.apoB': .8}, updatedAt: now}],
        notes: [{date, text: 'Synthetic note', updatedAt: now}],
        supplements: [{id: 'surface_supplement', name: 'Synthetic supplement', startDate: date, updatedAt: now}],
        healthGoals: [{text: 'Synthetic goal', severity: 'low', updatedAt: now}],
        changeHistory: [{field: 'contextNotes', date: date + 'T08:00:00Z', value: 'Synthetic context'}],
        chatSummaries: [{id: 'surface_summary', threadId: 'surface_thread', title: 'Synthetic summary', updatedAt: now}],
        importSnapshots: [{...row('surface_import'), fileName: 'synthetic.csv', entries: []}],
        nutritionMeals: [{id: 'surface_meal', eatenAt: date + 'T12:00:00Z', name: 'Synthetic meal', reviewed: true, nutrients: {protein: 20}, images: []}],
        markerNotes: {'lipids.apoB': 'Synthetic marker note'},
        markerValueNotes: {'lipids.apoB:2026-08-06': 'Synthetic value note'},
        customMarkers: {'synthetic.value': {name: 'Synthetic value', unit: 'u', categoryLabel: 'Synthetic'}},
        markerPlacements: {'builtin:lipids.apoB': {categoryKey: 'lipids'}},
        labOrdering: {markers: appendLabOrderMove(null, {item: 'lipids.apoB', after: 'biochemistry.glucose'}, 'surface_order_A', now)},
        labPanelTombstones: {'removed_panel.2026-08-01': {deletedAt: now, restoredAt: 0, updatedAt: now}},
        geneticsSnpTombstones: {rs999: {deletedAt: now, restoredAt: 0, updatedAt: now}},
        geneticsLifecycle: {maternal: {deletedAt: now, restoredAt: 0, updatedAt: now}},
        manualValues: {'synthetic.value:2026-08-06': 12},
        manualMetricTombstones: {'weight.2026-08-06': 0},
        manualBodyReadings: {'weight.2026-08-06': {value: 80, updatedAt: now}},
        refOverrides: {'lipids.apoB': {refMin: 0, refMax: 1.2}},
        categoryLabels: {synthetic: 'Synthetic category'}, categoryIcons: {synthetic: 'science'}, markerLabels: {'lipids.apoB': 'Synthetic ApoB label'},
        wearablePrimaryOverride: {weight: 'manual'}, biologyScoreAI: {cardiovascular: {text: 'Synthetic interpretation', updatedAt: now}},
        genetics: {source: 'synthetic', snps: {rs123: {genotype: 'AA'}}},
        lightDailyVerdicts: {'2026-08-06': {text: 'Synthetic verdict'}}, contextSourceSettings: {'lab-markers': false},
        diagnoses: {conditions: [{name: 'Synthetic condition'}]}, diet: {type: 'Synthetic diet'}, exercise: {frequency: 'Synthetic frequency'},
        sleepRest: {quality: 'Synthetic quality'}, lightCircadian: {amLight: 'Synthetic light'}, stress: {level: 'Synthetic stress'},
        loveLife: {status: 'Synthetic status'}, environment: {setting: 'Synthetic setting'},
        interpretiveLens: 'Synthetic lens', contextNotes: 'Synthetic context',
        menstrualCycle: {cycleLength: 28}, emfAssessment: {assessments: []}, biometrics: {weight: [{date, value: 80, unit: 'kg'}]},
        agentAccess: {version: 1, enabled: false}, agentAccessWearableSeriesDays: 30,
        sunCorrelations: {enabled: true}, lifelightProfile: {profileId: 'synthetic'}, sunDefaults: {fitzpatrick: 3},
        channelMixAI: {text: 'Synthetic mix'}, biologyScoreContextAI: {text: 'Synthetic context interpretation', updatedAt: now},
        wearableSummary: {metrics: {weight: {latest: 80, unit: 'kg', at: now}}}, wearableCardOrder: ['weight', 'sleep'],
        nutritionContextDays: 30, nutritionTargets: {protein: 100},
        wearableConnections: {syntheticVendor: {accessToken: 'synthetic-device-local-only'}},
      });
      localStorage.setItem('labcharts-default-units', 'EU');
      localStorage.setItem('labcharts-default-rangeMode', 'both');
      localStorage.setItem('labcharts-openrouter-model', 'synthetic-sync-model');
      const crypto = await import('/js/crypto.js');
      await crypto.encryptedSetItem('labcharts-default-chat-threads', JSON.stringify([{id: 'surface_thread', name: 'Synthetic thread', createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), messageCount: 1}]));
      await crypto.encryptedSetItem('labcharts-default-chat-t_surface_thread', JSON.stringify([{id: 'surface_message', role: 'user', content: 'Synthetic chat message', createdAt: now}]));
      return (await import('/js/data.js')).saveImportedData();
    })).toBe(true);
    const expected = await snapshot(a.page);
    expect(Object.values(expected.stored)).not.toContain(undefined);
    const identity = await enableNewIdentity(a.page);
    const b = await createDevice(peerBrowser ?? browser, 'surface device B'); devices.push(b);
    await joinIdentity(b.page, identity.mnemonic, identity.ownerId);
    // Importing manual readings also derives a summary and anomaly history.
    // First verify every original value; then flush those new derived records
    // and require exact agreement of the complete live and durable profiles.
    const original = (value: Awaited<ReturnType<typeof snapshot>>) => Object.fromEntries(
      Object.entries(value.stored).filter(([path]) => path !== 'wearableSummary' && path !== 'changeHistory'));
    await expect.poll(async () => original(await snapshot(b.page)), {timeout: 45_000}).toEqual(original(expected));
    expect((await snapshot(b.page)).stored.changeHistory).toEqual(expect.arrayContaining(expected.stored.changeHistory as unknown[]));
    expect((await snapshot(b.page)).stored.wearableSummary).toMatchObject({metrics: {weight: {latest: 80}}});
    expect((await syncNow(b.page))?.ok).toBe(true);
    await waitForStableRelayStorage(a.page);
    const settled = await snapshot(b.page);
    await expect.poll(() => snapshot(a.page), {timeout: 45_000}).toEqual(settled);
    const settings = (page: Page) => page.evaluate(async () => ({
      units: localStorage.getItem('labcharts-default-units'), range: localStorage.getItem('labcharts-default-rangeMode'),
      model: localStorage.getItem('labcharts-openrouter-model'),
      messages: JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem('labcharts-default-chat-t_surface_thread')) || '[]') as unknown[],
      connections: (await import('/js/state.js')).state.importedData.wearableConnections,
    }));
    await expect.poll(() => settings(b.page)).toMatchObject({units: 'EU', range: 'both', model: 'synthetic-sync-model', messages: [{id: 'surface_message', content: 'Synthetic chat message'}]});
    expect((await settings(b.page)).connections?.syntheticVendor).toBeUndefined();
    expect(await b.page.evaluate(async () => {
      const {state} = await import('/js/state.js'), now = Date.now();
      const {appendLabOrderMove} = await import('/js/lab-ordering-core.js');
      state.importedData.labOrdering = {markers: appendLabOrderMove(state.importedData.labOrdering?.markers ?? null, {item: 'lipids.apoB', before: 'biochemistry.glucose'}, 'surface_order_B', now)};
      state.importedData.labPanelTombstones = {'removed_panel.2026-08-01': {deletedAt: now, restoredAt: 0, updatedAt: now}};
      state.importedData.geneticsSnpTombstones = {rs999: {deletedAt: now, restoredAt: 0, updatedAt: now}};
      state.importedData.geneticsLifecycle = {maternal: {deletedAt: now, restoredAt: 0, updatedAt: now}};
      state.importedData.contextNotes = 'Synthetic reverse edit';
      state.importedData.markerNotes['lipids.apoB'] = 'Synthetic reverse marker note';
      state.importedData.nutritionTargets = {protein: 110};
      state.importedData.sunSessions![0] = {...state.importedData.sunSessions![0], minutes: 20, updatedAt: now};
      state.importedData.entries[0]!.markers['lipids.apoB'] = .9;
      state.importedData.entries[0]!.updatedAt = now;
      localStorage.setItem('labcharts-default-units', 'US');
      const crypto = await import('/js/crypto.js'), key = 'labcharts-default-chat-t_surface_thread';
      const messages = JSON.parse((await crypto.encryptedGetItem(key))!) as unknown[];
      messages.push({id: 'surface_reply', role: 'assistant', content: 'Synthetic reverse chat message', createdAt: now});
      await (await import('/js/chat-threads.js')).loadChatThreads();
      state.currentThreadId = 'surface_thread';
      state.chatHistory = messages as typeof state.chatHistory;
      if (!await (await import('/js/chat-history.js')).saveChatHistory({preservePersonality: true})) return false;
      return (await import('/js/data.js')).saveImportedData();
    })).toBe(true);
    expect((await syncNow(b.page))?.ok).toBe(true);
    const reversed = await snapshot(b.page);
    await expect.poll(() => snapshot(a.page), {timeout: 45_000}).toEqual(reversed);
    await expect.poll(async () => (await settings(a.page)).messages).toHaveLength(2);
    await expect.poll(async () => (await settings(a.page)).units).toBe('US');
    expect(await a.page.evaluate(async () => {
      delete (await import('/js/state.js')).state.importedData.markerNotes['lipids.apoB'];
      return (await import('/js/data.js')).saveImportedData();
    })).toBe(true);
    expect((await syncNow(a.page))?.ok).toBe(true);
    const deletionStarted = Date.now();
    const deletionDiagnostics = async () => Promise.all(devices.map(async device => ({device: device.label,
      data: await device.page.evaluate(async () => {
        const runtime = await import('/js/sync-runtime.js'), sdk = runtime.getSyncEvolu()!;
        return {live: (await import('/js/state.js')).state.importedData.markerNotes,
          rows: sdk.getQueryRows<DeltaItemRow>(runtime.getSyncItemRowQuery())!.filter(row => row.arrayName === 'markerNotes'),
          status: (await import('/js/sync-state.js')).getSyncStatus(),
          events: (await import('/js/sync-state.js')).getRecentSyncEvents()};
      })})));
    let slowDeletionReported = false;
    await expect.poll(async () => {
      const notes = (await snapshot(b.page)).stored.markerNotes;
      if (!slowDeletionReported && Date.now() - deletionStarted > 5000 && Object.keys(notes as object).length) {
        slowDeletionReported = true;
        console.log('[sync-e2e-map-deletion-pending]', JSON.stringify(await deletionDiagnostics()));
      }
      return notes;
    }, {timeout: 30_000}).toEqual({});
    const mapDeletionMs = Date.now() - deletionStarted;
    expect(await b.page.evaluate(async () => {
      (await import('/js/state.js')).state.importedData.markerNotes['lipids.apoB'] = 'Synthetic reverse marker note';
      return (await import('/js/data.js')).saveImportedData();
    })).toBe(true);
    expect((await syncNow(b.page))?.ok).toBe(true);
    await expect.poll(() => snapshot(a.page), {timeout: 45_000}).toEqual(reversed);
    const wire = (page: Page) => page.evaluate(async () => {
      const runtime = await import('/js/sync-runtime.js'), sdk = runtime.getSyncEvolu()!;
      await sdk.loadQuery(runtime.getSyncProfileQuery()); await sdk.loadQuery(runtime.getSyncItemRowQuery());
      const row = sdk.getQueryRows<{dataJson: string}>(runtime.getSyncProfileQuery())![0]!;
      return {profile: await (await import('/js/sync-payload.js')).parseSyncPayload(row.dataJson),
        items: sdk.getQueryRows<DeltaItemRow>(runtime.getSyncItemRowQuery())!.map(row => ({id: row.id, surface: row.arrayName, syncedAt: row.syncedAt}))};
    });
    const beforeReloads = await waitForStableRelayStorage(a.page);
    const beforeWire = await wire(a.page);
    for (const device of devices) {
      await device.page.reload({waitUntil: 'domcontentloaded'}); await waitForOwner(device.page, identity.ownerId);
      await expect.poll(() => snapshot(device.page), {timeout: 45_000}).toEqual(reversed);
      await expect.poll(async () => (await settings(device.page)).messages).toHaveLength(2);
      await expect.poll(() => health(device.page), {timeout: 30_000}).toMatchObject({databaseError: null, lastError: null, dirty: null, errors: []});
      // The frozen previous-v8 bridge and v7 predate owner-status telemetry.
      if (EVOLU_CLIENT === 'v8' || (EVOLU_CLIENT === 'v8-mixed' && device === b)) {
        await expect.poll(async () => (await health(device.page)).replication, {timeout: 30_000}).toBe('Synced');
      } else expect((await health(device.page)).replication).toBeUndefined();
      expect(device.errors).toEqual([]);
      expect(device.consoleErrors).toEqual([]);
      expect(device.observedStatusPages).toBeGreaterThanOrEqual(2);
      expect(device.statusErrors).toEqual([]);
      expect(device.syncWarnings.filter(message => message !== '[sync] another push is in-flight')).toEqual([]);
    }
    const afterReloads = await waitForStableRelayStorage(a.page);
    if (afterReloads!.messageCount !== beforeReloads!.messageCount) {
      const afterWire = await wire(a.page);
      const diffs = (a: unknown, b: unknown, path = ''): string[] => {
        if (JSON.stringify(a) === JSON.stringify(b)) return [];
        if (a && b && typeof a === 'object' && typeof b === 'object') return [...new Set([...Object.keys(a), ...Object.keys(b)])]
          .flatMap(key => diffs((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], path ? path + '.' + key : key));
        return [path + ': ' + JSON.stringify(a) + ' -> ' + JSON.stringify(b)];
      };
      console.error('Reload wire differences:', JSON.stringify({profile: diffs(beforeWire.profile, afterWire.profile),
        rows: afterWire.items.filter(row => beforeWire.items.find(old => old.id === row.id)?.syncedAt !== row.syncedAt)}));
    }
    expect(afterReloads!.messageCount).toBe(beforeReloads!.messageCount);
    expect(afterReloads!.storedBytes).toBe(beforeReloads!.storedBytes);
    console.log('[sync-e2e]', JSON.stringify({surfaces: paths.length, sdk: EVOLU_CLIENT,
      peer: peerBrowser ? 'firefox' : 'chromium', consoleErrors: 0, uncaughtErrors: 0, syncLogErrors: 0, unexpectedSyncWarnings: 0, reloadStorageGrowth: 0, mapDeletionMs}));
  } finally {
    for (const device of devices.reverse()) await device.context.close();
    await peerBrowser?.close();
  }
});
