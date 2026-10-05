import { createModuleUrl } from '../helpers/browser-module-url.js';
import { expect, test } from './coverage-fixture.js';

const moduleUrl = createModuleUrl('syncPushCoverage');

test('sync push covers browser commit guards cutover drift and watchdog paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ pushUrl, deltaUrl }) => {
    const [syncPush, syncDelta, syncState, { state }] = await Promise.all([
      ((import(pushUrl) as Promise<unknown>) as Promise<Pick<typeof import("../../js/sync-push.js"), "configureSyncPush" | "pushProfile" | "isSyncPushInFlight"> >),
      ((import(deltaUrl) as Promise<unknown>) as Promise<Pick<typeof import("../../js/sync-delta.js"), "configureSyncDelta" | "getDeltaTelemetry"> >),
      import('/js/sync-state.js'),
      import('/js/state.js'),
    ]);
    const outcomes: Record<string,unknown> = {};
    const profileId = `syncpushbrowser${Date.now()}`;
    const profileQuery = { name: 'profile-query' };
    const itemRowQuery = { name: 'item-row-query' };
    const storagePrefix = `labcharts-${profileId}-`;
    const oldProfile = state.currentProfile;
    const oldProfiles = state.profiles;
    const oldImportedData = state.importedData;
    const oldSetTimeout = window.setTimeout;
    const oldWarn = console.warn;
    const oldProfilesStorage = localStorage.getItem('labcharts-profiles');
    const oldRelayWarning = localStorage.getItem('labcharts-relay-quota-warned');
    const oldStorageEntries = new Map(Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index);
      return [key, key ? localStorage.getItem(key) : null] as const;
    }));
    const warnings: string[] = [];
    const wait = (ms:number) => new Promise(resolve => oldSetTimeout(resolve, ms));
    const defaultDisableProfileId = `${profileId}default`;
    const storagePrefixes = [storagePrefix, `labcharts-${defaultDisableProfileId}-`];

    function makeEvolu({ profileRows = [], itemRows = [], completeProfileWrites = true }: {profileRows?: Record<string,unknown>[];itemRows?:Record<string,unknown>[];completeProfileWrites?:boolean} = {}) {
      const calls: {insert:{table:string;args:Record<string,unknown>}[];update:{table:string;args:Record<string,unknown>}[]} = { insert: [], update: [] };
      const evolu = {
        getQueryRows(query: unknown) {
          if (query === profileQuery) return profileRows;
          if (query === itemRowQuery) return itemRows;
          return [];
        },
        insert(table: string, args:Record<string,unknown>, options: {onComplete?:()=>unknown} = {}) {
          calls.insert.push({ table, args });
          if (table === 'profileData') {
            profileRows.push({ id: `profile-row-${profileRows.length + 1}`, ...args });
            if (completeProfileWrites) options.onComplete?.();
            return;
          }
          itemRows.push({ id: `item-row-${itemRows.length + 1}`, ...args });
        },
        update(table: string, args:Record<string,unknown>, options: {onComplete?:()=>unknown} = {}) {
          calls.update.push({ table, args });
          if (table === 'profileData') {
            const index = profileRows.findIndex(row => row.id === args.id);
            if (index >= 0) profileRows[index] = { ...profileRows[index], ...args };
            if (completeProfileWrites) options.onComplete?.();
            return;
          }
          const index = itemRows.findIndex(row => row.id === args.id);
          if (index >= 0) itemRows[index] = { ...itemRows[index], ...args };
          else itemRows.push({ ...args });
        },
      };
      return { evolu, calls, profileRows, itemRows };
    }

    function configure(fake:ReturnType<typeof makeEvolu>, { enabled = true, cutover, disablePhase2Cutover }: {enabled?:boolean;cutover?:unknown;disablePhase2Cutover?:unknown} = {}) {
      (syncDelta.configureSyncDelta as unknown as (deps:{getEvolu?:()=>unknown;getItemRowQuery?:()=>unknown}) => ReturnType<typeof syncDelta.configureSyncDelta>)({
        getEvolu: () => fake.evolu,
        getItemRowQuery: () => itemRowQuery,
      });
      const deps: {getEvolu:()=>typeof fake.evolu;getProfileQuery:()=>typeof profileQuery;isSyncEnabled:()=>boolean;isPhase2CutoverEnabled?:unknown;disablePhase2Cutover?:unknown} = {
        getEvolu: () => fake.evolu,
        getProfileQuery: () => profileQuery,
        isSyncEnabled: () => enabled,
      };
      if (typeof cutover === 'function') deps.isPhase2CutoverEnabled = cutover;
      else if (typeof cutover === 'boolean') deps.isPhase2CutoverEnabled = () => cutover;
      if (typeof disablePhase2Cutover === 'function') deps.disablePhase2Cutover = disablePhase2Cutover;
      (syncPush.configureSyncPush as unknown as (config:typeof deps) => ReturnType<typeof syncPush.configureSyncPush>)(deps);
    }

    try {
      for (const key of [...oldStorageEntries.keys()]) {
        if (storagePrefixes.some(prefix => key?.startsWith(prefix))) localStorage.removeItem(key!);
      }
      localStorage.removeItem('labcharts-relay-quota-warned');
      localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: profileId, name: 'Sync Push Browser' }]));
      state.currentProfile = profileId;
      state.profiles = [{ id: profileId, name: 'Sync Push Browser' }];
      syncState.resetSyncStatus();
      console.warn = (...args) => { warnings.push(args.join(' ')); };

      const defaultGuard = await syncPush.pushProfile(profileId, { sunSessions: [] });
      const defaultSyncFake = makeEvolu();
      syncPush.configureSyncPush({
        getEvolu: () => defaultSyncFake.evolu,
        getProfileQuery: () => profileQuery,
      });
      const defaultSyncDisabled = await syncPush.pushProfile(profileId, { sunSessions: [] });
      const guardFake = makeEvolu();
      configure(guardFake, { enabled: false });
      const syncDisabled = await syncPush.pushProfile(profileId, { sunSessions: [] });
      configure(guardFake, { enabled: true });
      const invalidProfile = await syncPush.pushProfile('', { sunSessions: [] });
      outcomes.guardPathsNoopWithoutWrites =
        defaultGuard === undefined
        && defaultSyncDisabled === undefined
        && syncDisabled === undefined
        && invalidProfile === undefined
        && defaultSyncFake.calls.insert.length === 0
        && defaultSyncFake.calls.update.length === 0
        && guardFake.calls.insert.length === 0
        && guardFake.calls.update.length === 0;

      const fake = makeEvolu();
      state.currentProfile = profileId;
      state.profiles = [{ id: profileId, name: 'Sync Push Browser' }];
      const firstImported = {
        sunSessions: [{ id: 'sun-1', date: '2026-06-09' }],
        lightDevices: [{ id: 'device-1', name: 'Panel' }],
      };
      (state as {importedData: unknown}).importedData = firstImported;
      configure(fake);
      const inserted = await syncPush.pushProfile(profileId, firstImported);
      const statusAfterInsert = syncState.getSyncStatus();
      const syncTsAfterInsert = localStorage.getItem(`${storagePrefix}sync-ts`);
      const telemetryAfterInsert = syncDelta.getDeltaTelemetry(profileId);
      outcomes.committedInsertWritesProfileRowsDeltasStatusAndTelemetry =
        inserted?.ok === true
        && fake.calls.insert.some(call => call.table === 'profileData' && call.args.profileId === profileId)
        && fake.calls.insert.filter(call => call.table === 'itemRow').length >= 2
        && /^\d+$/.test(syncTsAfterInsert || '')
        && statusAfterInsert.push === 'confirmed'
        && (telemetryAfterInsert?.summary?.count as number) >= 1
        && telemetryAfterInsert!.summary.totalOps >= 2
        && telemetryAfterInsert!.summary.totalBlobBytes > 0;

      const secondImported = {
        sunSessions: [{ id: 'sun-1', date: '2026-06-10' }],
        lightDevices: [{ id: 'device-1', name: 'Panel v2' }],
      };
      (state as {importedData: unknown}).importedData = secondImported;
      configure(fake, { cutover: false });
      const updated = await syncPush.pushProfile(profileId, secondImported);
      outcomes.committedUpdateUsesExistingProfileRow =
        updated?.ok === true
        && fake.calls.update.some(call => call.table === 'profileData'
          && call.args.id === 'profile-row-1'
          && call.args.profileId === profileId)
        && syncPush.isSyncPushInFlight() === false;

      const defaultDisableFake = makeEvolu();
      state.currentProfile = defaultDisableProfileId;
      state.profiles = [{ id: defaultDisableProfileId, name: 'Sync Push Default Disable' }];
      (state as {importedData: unknown}).importedData = {
        entries: [{ id: 'entry-default-drift', date: '2026-06-09', markers: {} }],
      };
      configure(defaultDisableFake, { cutover: true });
      const defaultDisablePush = await syncPush.pushProfile(defaultDisableProfileId, state.importedData);
      outcomes.defaultCutoverDisableCallbackIsCovered =
        defaultDisablePush?.ok === true
        && warnings.some(message => message.includes('Phase 2 cutover drift detected'));

      const driftImported = {
        entries: [{ id: 'entry-drift', date: '2026-06-11', markers: {} }],
      };
      state.currentProfile = profileId;
      state.profiles = [{ id: profileId, name: 'Sync Push Browser' }];
      (state as {importedData: unknown}).importedData = driftImported;
      localStorage.setItem(`${storagePrefix}sync-cutover-v2`, '1');
      const updatesBeforeDrift = fake.calls.update.length;
      configure(fake, {
        cutover: () => localStorage.getItem(`${storagePrefix}sync-cutover-v2`) === '1',
        disablePhase2Cutover: (id: unknown) => { localStorage.removeItem(`labcharts-${id}-sync-cutover-v2`); },
      });
      const drifted = await syncPush.pushProfile(profileId, driftImported);
      const driftUpdates = fake.calls.update.slice(updatesBeforeDrift)
        .filter(call => call.table === 'profileData');
      const driftPayload = JSON.parse((driftUpdates[0]?.args?.dataJson || '{}') as string) as unknown as {_v?:unknown;importedData?:{entries?:{id?:unknown}[]}|null};
      outcomes.cutoverDriftWarnsAndStillCommits =
        drifted?.ok === true
        && warnings.some(message => message.includes('Phase 2 cutover drift detected'))
        && localStorage.getItem(`${storagePrefix}sync-cutover-v2`) == null
        && driftUpdates.length === 1
        && driftPayload._v === 3
        && driftPayload.importedData?.entries?.[0]?.id === 'entry-drift';

      const hungFake = makeEvolu({ completeProfileWrites: false });
      configure(hungFake, { cutover: false });
      (window as unknown as {setTimeout:(fn:TimerHandler,delay?:number,...args:unknown[])=>number}).setTimeout = (fn, delay, ...args) => oldSetTimeout(fn, delay === 30_000 ? 0 : delay, ...args);
      const firstPush = syncPush.pushProfile(profileId, { sunSessions: [{ id: 'sun-hung' }] });
      const inFlightBeforeSkip = syncPush.isSyncPushInFlight();
      const skipped = await syncPush.pushProfile(profileId, { sunSessions: [{ id: 'sun-skipped' }] });
      await wait(5);
      const timedOut = await firstPush;
      outcomes.inFlightGuardAndWatchdogRelease =
        inFlightBeforeSkip === true
        && skipped?.reason === 'in-flight'
        && timedOut?.reason === 'timeout'
        && syncPush.isSyncPushInFlight() === false
        && syncState.getSyncStatus().push === 'error'
        && warnings.some(message => message.includes('another push is in-flight'))
        && warnings.some(message => message.includes('Push NOT committed after 30s'));
    } finally {
      window.setTimeout = oldSetTimeout;
      console.warn = oldWarn;
      syncPush.configureSyncPush({
        getEvolu: () => null,
        getProfileQuery: () => null,
        isSyncEnabled: () => false,
        isPhase2CutoverEnabled: () => false,
        disablePhase2Cutover: () => {},
        debug: () => {},
      });
      (syncDelta.configureSyncDelta as unknown as (deps:{getEvolu?:()=>unknown;getItemRowQuery?:()=>unknown}) => ReturnType<typeof syncDelta.configureSyncDelta>)({
        getEvolu: () => null,
        getItemRowQuery: () => null,
      });
      syncState.resetSyncStatus();
      state.currentProfile = oldProfile;
      state.profiles = oldProfiles;
      (state as {importedData: unknown}).importedData = oldImportedData;
      for (const key of Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))) {
        if (storagePrefixes.some(prefix => key?.startsWith(prefix))) localStorage.removeItem(key!);
      }
      if (oldProfilesStorage == null) localStorage.removeItem('labcharts-profiles');
      else localStorage.setItem('labcharts-profiles', oldProfilesStorage);
      if (oldRelayWarning == null) localStorage.removeItem('labcharts-relay-quota-warned');
      else localStorage.setItem('labcharts-relay-quota-warned', oldRelayWarning);
    }

    return outcomes;
  }, {
    pushUrl: moduleUrl('/js/sync-push.js'),
    deltaUrl: '/js/sync-delta.js',
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
