import { createBlankPage } from '../helpers/browser-blank-page.js';
import { createModuleUrl } from '../helpers/browser-module-url.js';
import { expect, test } from './coverage-fixture.js';

const moduleUrl = createModuleUrl('syncPullRefreshCoverage');

const openBlankPage = createBlankPage({
  path: "/sync-pull-refresh-browser-coverage", status: 200, body: '<!doctype html><html><head><title>Sync pull refresh coverage</title></head><body><div id="notification-container"></div></body></html>',
});

test('sync pull refresh browser coverage exercises active refresh and stale hash cleanup paths', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ refreshUrl, refreshRuntimeUrl, maintenanceUrl, stateUrl }) => {
    const [refreshModule, refreshRuntime, maintenance, { state }] = await Promise.all([
      (import(refreshUrl) as Promise<unknown>) as Promise<Pick<typeof import('../../js/sync-pull-active-refresh.js'), "refreshActiveProfileAfterPull">>,
      (import(refreshRuntimeUrl) as Promise<unknown>) as Promise<Pick<typeof import('../../js/sync-pull-active-refresh-runtime.js'), "configureSyncPullActiveRefreshDeps">>,
      (import(maintenanceUrl) as Promise<unknown>) as Promise<Pick<typeof import('../../js/sync-pull-maintenance.js'), "clearStaleSyncHashKeysOnce">>,
      (import(stateUrl) as Promise<unknown>) as Promise<Pick<typeof import('../../js/state.js'), "state">>,
    ]);
    const outcomes: Record<string, unknown> = {};
    const clone = (value: unknown): unknown => value == null ? value : JSON.parse(JSON.stringify(value));
    const activeProfileId = `sync-refresh-${Date.now()}`;
    const original = {
      state: {
        currentProfile: state.currentProfile,
        currentView: state.currentView,
        importedData: clone(state.importedData),
      },
    };
    const calls: Array<string | {type?:string;category?:unknown;options?:{preserveScroll?:unknown}|null}> = [];
    const previousThreadDeps = refreshRuntime.configureSyncPullActiveRefreshDeps({
      buildSidebar: () => { calls.push('buildSidebar'); },
      loadChatHistory: () => { calls.push('loadChatHistory'); },
      loadChatThreads: () => { calls.push('loadChatThreads'); },
      ensureActiveThread: () => { calls.push('ensureActiveThread'); },
      navigate: (category, options) => { calls.push({ type: 'navigate', category, options: options || null }); },
      renderThreadList: () => { calls.push('renderThreadList'); },
    });
    const debugCalls: string[] = [];
    let syncAppliedEvents = 0;
    const onSyncApplied = () => { syncAppliedEvents += 1; };

    try {
      window.addEventListener('labcharts-sync-applied', onSyncApplied);

      state.currentProfile = activeProfileId;
      state.currentView = 'light';
      (state as {importedData: unknown}).importedData = { entries: [{ date: '2026-06-01' }] };
      const inactiveResult = (refreshModule.refreshActiveProfileAfterPull as (options: Omit<NonNullable<Parameters<typeof refreshModule.refreshActiveProfileAfterPull>[0]>, "merged"> & {merged?: unknown}) => ReturnType<typeof refreshModule.refreshActiveProfileAfterPull>)({
        profileId: `${activeProfileId}-other`,
        merged: { entries: [] },
        localDataChanged: true,
        debug: (...args) => { debugCalls.push(args.join(' ')); },
      });
      outcomes.inactiveProfileSkipsRefresh = inactiveResult === false
        && state.importedData.entries[0]!.date === '2026-06-01'
        && calls.length === 0;

      const noChangeResult = (refreshModule.refreshActiveProfileAfterPull as (options: Omit<NonNullable<Parameters<typeof refreshModule.refreshActiveProfileAfterPull>[0]>, "merged"> & {merged?: unknown}) => ReturnType<typeof refreshModule.refreshActiveProfileAfterPull>)({
        profileId: activeProfileId,
        merged: { entries: [], contextNotes: 'No visible data change' },
        chatApplied: true,
        localDataChanged: false,
        debug: (...args) => { debugCalls.push(args.join(' ')); },
      });
      outcomes.noVisibleChangeRefreshesChatAndSidebarWithoutNavigation =
        noChangeResult === true
        && calls.includes('loadChatThreads')
        && calls.includes('ensureActiveThread')
        && calls.includes('renderThreadList')
        && calls.includes('loadChatHistory')
        && calls.includes('buildSidebar')
        && !calls.some(call => (call as {type?: unknown} | null | undefined)?.type === 'navigate')
        && state.importedData.contextNotes === 'No visible data change';

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay show';
      document.body.appendChild(overlay);
      calls.length = 0;
      const firstToastCount = document.querySelectorAll('.notification-toast').length;
      const localEchoResult = (refreshModule.refreshActiveProfileAfterPull as (options: Omit<NonNullable<Parameters<typeof refreshModule.refreshActiveProfileAfterPull>[0]>, "merged"> & {merged?: unknown}) => ReturnType<typeof refreshModule.refreshActiveProfileAfterPull>)({
        profileId: activeProfileId,
        merged: { entries: [{ date: '2026-06-01T12:00:00.000Z' }], lightCircadian: null },
        localDataChanged: true,
        localCommitEcho: true,
        debug: (...args) => { debugCalls.push(args.join(' ')); },
      });
      outcomes.localCommitEchoRefreshesWithoutMisleadingRemoteToast =
        localEchoResult === true
        && calls.some(call => (call as {type?: unknown} | null | undefined)?.type === 'navigate')
        && document.querySelectorAll('.notification-toast').length === firstToastCount
        && syncAppliedEvents === 1
        && debugCalls.some(message => (message as {includes(value:string):unknown}).includes('Suppressed local commit echo toast'));

      calls.length = 0;
      const changedResult = (refreshModule.refreshActiveProfileAfterPull as (options: Omit<NonNullable<Parameters<typeof refreshModule.refreshActiveProfileAfterPull>[0]>, "merged"> & {merged?: unknown}) => ReturnType<typeof refreshModule.refreshActiveProfileAfterPull>)({
        profileId: activeProfileId,
        merged: { entries: [{ date: '2026-06-02' }], lightCircadian: null },
        localDataChanged: true,
        debug: (...args) => { debugCalls.push(args.join(' ')); },
      });
      const navigateCall = calls.find(call => (call as {type?: unknown} | null | undefined)?.type === 'navigate');
      const toastAfterFirstChange = document.querySelectorAll('.notification-toast').length;
      outcomes.visibleChangeNavigatesWithModalScrollPreservedAndDispatches =
        changedResult === true
        && (navigateCall as {category?: unknown} | null | undefined)?.category === 'light'
        && (navigateCall as {options?: {preserveScroll?: unknown} | null} | null | undefined)?.options?.preserveScroll === true
        && toastAfterFirstChange === firstToastCount + 1
        && syncAppliedEvents === 2;

      calls.length = 0;
      (refreshModule.refreshActiveProfileAfterPull as (options: Omit<NonNullable<Parameters<typeof refreshModule.refreshActiveProfileAfterPull>[0]>, "merged"> & {merged?: unknown}) => ReturnType<typeof refreshModule.refreshActiveProfileAfterPull>)({
        profileId: activeProfileId,
        merged: { entries: [{ date: '2026-06-03' }] },
        remoteBroughtNewRows: true,
        debug: () => {},
      });
      outcomes.repeatVisibleChangeSuppressesDuplicateToastButStillDispatches =
        document.querySelectorAll('.notification-toast').length === toastAfterFirstChange
        && calls.some(call => (call as {type?: unknown} | null | undefined)?.type === 'navigate')
        && syncAppliedEvents === 3;
      overlay.remove();

      localStorage.removeItem('labcharts-sync-hash-v2-migrated');
      localStorage.setItem('labcharts-alpha-sync-hash', 'stale-a');
      localStorage.setItem('labcharts-beta-sync-hash', 'stale-b');
      localStorage.setItem('labcharts-gamma-sync-hash-extra', 'keep');
      const maintenanceDebug: unknown[] = [];
      maintenance.clearStaleSyncHashKeysOnce(message => { maintenanceDebug.push(message); });
      outcomes.maintenanceClearsOnlyLegacySyncHashKeysOnce =
        localStorage.getItem('labcharts-alpha-sync-hash') == null
        && localStorage.getItem('labcharts-beta-sync-hash') == null
        && localStorage.getItem('labcharts-gamma-sync-hash-extra') === 'keep'
        && localStorage.getItem('labcharts-sync-hash-v2-migrated') === '1'
        && maintenanceDebug.some(message => (message as {includes(value:string):unknown}).includes('Cleared 2 stale -sync-hash keys'));

      localStorage.removeItem('labcharts-sync-hash-v2-migrated');
      localStorage.setItem('labcharts-default-debug-sync-hash', 'stale-default');
      maintenance.clearStaleSyncHashKeysOnce();
      outcomes.maintenanceDefaultDebugCallbackPathSweepsSafely =
        localStorage.getItem('labcharts-default-debug-sync-hash') == null
        && localStorage.getItem('labcharts-sync-hash-v2-migrated') === '1';

      localStorage.setItem('labcharts-delta-sync-hash', 'still-stale');
      maintenance.clearStaleSyncHashKeysOnce(() => { maintenanceDebug.push('unexpected second debug'); });
      outcomes.maintenanceMigrationFlagPreventsRepeatedSweeps =
        localStorage.getItem('labcharts-delta-sync-hash') === 'still-stale'
        && !maintenanceDebug.includes('unexpected second debug');

      outcomes.allOutcomesReached = true;
    } finally {
      window.removeEventListener('labcharts-sync-applied', onSyncApplied);
      state.currentProfile = original.state.currentProfile;
      state.currentView = original.state.currentView;
      (state as {importedData: unknown}).importedData = original.state.importedData;
      refreshRuntime.configureSyncPullActiveRefreshDeps(previousThreadDeps);
      document.querySelector('.modal-overlay.show')?.remove();
      document.querySelectorAll('.notification-toast').forEach(toast => toast.remove());
      localStorage.removeItem('labcharts-sync-hash-v2-migrated');
      localStorage.removeItem('labcharts-alpha-sync-hash');
      localStorage.removeItem('labcharts-beta-sync-hash');
      localStorage.removeItem('labcharts-gamma-sync-hash-extra');
      localStorage.removeItem('labcharts-default-debug-sync-hash');
      localStorage.removeItem('labcharts-delta-sync-hash');
    }

    return outcomes;
  }, {
    refreshUrl: moduleUrl('/js/sync-pull-active-refresh.js'),
    refreshRuntimeUrl: '/js/sync-pull-active-refresh-runtime.js',
    maintenanceUrl: moduleUrl('/js/sync-pull-maintenance.js'),
    stateUrl: '/js/state.js',
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
