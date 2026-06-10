import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?syncTombstonesCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function expectAll(outcomes) {
  const failed = Object.entries(outcomes)
    .filter(([, value]) => value !== true)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  expect(failed).toEqual([]);
}

test('sync tombstones browser coverage exercises relay delete quarantine and pending paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const outcomes = await page.evaluate(async ({ tombstonesUrl }) => {
    const [tombstones, { state }, blobStorage] = await Promise.all([
      import(tombstonesUrl),
      import('/js/state.js'),
      import('/js/blob-storage.js'),
    ]);
    const outcomes = {};
    const profileIds = ['keep', 'wipe', 'batch-a', 'batch-b', 'rejectme', 'lastonly'];
    const saved = {
      profilesState: state.profiles ? JSON.parse(JSON.stringify(state.profiles)) : state.profiles,
      importedData: JSON.parse(JSON.stringify(state.importedData || {})),
      currentProfile: state.currentProfile,
      activeProfile: localStorage.getItem('labcharts-active-profile'),
      profiles: localStorage.getItem('labcharts-profiles'),
      encryptionEnabled: localStorage.getItem('labcharts-encryption-enabled'),
    };
    const tombKey = id => `labcharts-tombstone-pending-${id}`;
    const profileKey = (id, suffix) => `labcharts-${id}-${suffix}`;
    const toasts = () => Array.from(document.querySelectorAll('.notification-toast')).map(el => el.textContent || '');
    const clearToasts = () => document.querySelectorAll('.notification-toast').forEach(el => el.remove());
    const setProfiles = (profiles, current = profiles[0]?.id || 'keep') => {
      state.profiles = profiles;
      state.currentProfile = current;
      localStorage.setItem('labcharts-profiles', JSON.stringify(profiles));
      localStorage.setItem('labcharts-active-profile', current);
    };
    const seedResidue = id => {
      localStorage.setItem(profileKey(id, 'imported'), JSON.stringify({ entries: [{ date: '2026-06-10', markers: { glucose: 91 } }] }));
      localStorage.setItem(profileKey(id, 'units'), 'US');
      localStorage.setItem(profileKey(id, 'showAltUnits'), 'on');
      localStorage.setItem(`labcharts-${id}-chat`, '[{"role":"user","content":"delete me"}]');
      localStorage.setItem(`labcharts-${id}-chat-threads`, '[{"id":"one"}]');
      localStorage.setItem(`labcharts-${id}-chat-t_one`, '[{"role":"assistant","content":"thread"}]');
      localStorage.setItem(`labcharts-${id}-sync-ts`, 'old');
    };
    const makeEvolu = ({ profileRows = [], tombRows = [], throwRows = false } = {}) => {
      const calls = [];
      return {
        calls,
        getQueryRows(query) {
          if (throwRows) throw new Error('query failed');
          if (query === 'profiles') return profileRows;
          if (query === 'tombs') return tombRows;
          return [];
        },
        update(table, args) {
          calls.push({ table, args });
        },
      };
    };
    const configure = ({ evolu, syncEnabled = true, pushProfile = async () => {} } = {}) => {
      tombstones.configureSyncTombstones({
        getEvolu: () => evolu || null,
        getProfileQuery: () => 'profiles',
        getTombstoneQuery: () => 'tombs',
        isSyncEnabled: () => syncEnabled,
        pushProfile,
        debug: () => {},
      });
    };

    try {
      localStorage.removeItem('labcharts-encryption-enabled');
      for (const id of profileIds) {
        localStorage.removeItem(tombKey(id));
        for (const suffix of ['imported', 'units', 'suppOverlay', 'noteOverlay', 'rangeMode', 'showAltUnits', 'suppImpact']) {
          localStorage.removeItem(profileKey(id, suffix));
        }
        for (const suffix of ['chat', 'chat-threads', 'chat-t_one', 'chatRailOpen', 'chatPersonality', 'chatPersonalityCustom', 'focusCard', 'contextHealth', 'onboarded', 'emptyTour', 'tour', 'cycleTour', 'phaseOverlay', 'sync-ts']) {
          localStorage.removeItem(`labcharts-${id}-${suffix}`);
        }
        await blobStorage.deleteBlob(profileKey(id, 'imported')).catch(() => {});
      }

      const relay = makeEvolu({ profileRows: [{ id: 'row-wipe', profileId: 'wipe' }] });
      configure({ evolu: relay, syncEnabled: false });
      const relaySyncOff = await tombstones.deleteProfileFromRelay('wipe');
      configure({ evolu: relay, syncEnabled: true });
      const relayBadId = await tombstones.deleteProfileFromRelay('');
      const relayNoRow = await tombstones.deleteProfileFromRelay('missing');
      localStorage.setItem(profileKey('wipe', 'sync-ts'), 'old-sync');
      const relayOk = await tombstones.deleteProfileFromRelay('wipe');
      configure({ evolu: makeEvolu({ throwRows: true }), syncEnabled: true });
      const relayError = await tombstones.deleteProfileFromRelay('wipe');
      outcomes.deleteProfileFromRelayCoversSkipSuccessAndError =
        relaySyncOff.reason === 'sync-off'
        && relayBadId.reason === 'bad-id'
        && relayNoRow.reason === 'no-row'
        && relayOk.ok === true
        && relay.calls[0]?.table === 'profileData'
        && relay.calls[0]?.args?.id === 'row-wipe'
        && relay.calls[0]?.args?.profileId === 'wipe'
        && relay.calls[0]?.args?.isDeleted === 1
        && localStorage.getItem(profileKey('wipe', 'sync-ts')) === null
        && relayError.ok === false
        && relayError.error.includes('query failed');

      setProfiles([{ id: 'keep', name: 'Keep' }, { id: 'wipe', name: 'Wipe' }], 'wipe');
      seedResidue('wipe');
      configure({ evolu: makeEvolu({ tombRows: [{ profileId: 'wipe' }] }) });
      await tombstones.applyRemoteTombstones();
      outcomes.singleRemoteTombstoneWipesProfileAndResidue =
        state.profiles.length === 1
        && state.profiles[0].id === 'keep'
        && !localStorage.getItem(profileKey('wipe', 'units'))
        && !localStorage.getItem(profileKey('wipe', 'showAltUnits'))
        && !localStorage.getItem(`labcharts-wipe-chat`)
        && !localStorage.getItem(`labcharts-wipe-chat-t_one`)
        && toasts().some(text => text.includes('Profile was deleted on another device'));
      clearToasts();

      setProfiles([{ id: 'keep', name: 'Keep' }, { id: 'wipe', name: 'Wipe' }], 'keep');
      configure({ evolu: makeEvolu({ tombRows: [
        { dataJson: JSON.stringify({ _v: 3, profile: { id: 'wipe' } }) },
      ] }) });
      await tombstones.applyRemoteTombstones();
      outcomes.remoteTombstoneFallsBackToPayloadProfileId = state.profiles.length === 1
        && state.profiles[0].id === 'keep';

      setProfiles([{ id: 'keep', name: 'Keep' }, { id: 'wipe', name: 'Wipe' }], 'keep');
      configure({ evolu: makeEvolu({ tombRows: [{ profileId: 'keep' }, { profileId: 'wipe' }] }) });
      await tombstones.applyRemoteTombstones();
      outcomes.allProfilesTombstonedSafetyKeepsLocalProfiles =
        state.profiles.length === 2
        && tombstones.listPendingTombstones().length === 0;

      setProfiles([
        { id: 'keep', name: 'Keep' },
        { id: 'batch-a', name: 'Batch A' },
        { id: 'batch-b', name: 'Batch B' },
      ], 'keep');
      configure({ evolu: makeEvolu({ tombRows: [{ profileId: 'batch-a' }, { profileId: 'batch-b' }] }) });
      await tombstones.applyRemoteTombstones();
      const pending = tombstones.listPendingTombstones().map(p => p.id).sort();
      outcomes.batchTombstonesQuarantineInsteadOfWiping =
        state.profiles.length === 3
        && pending.join('|') === 'batch-a|batch-b'
        && localStorage.getItem(tombKey('batch-a'))?.includes('remote')
        && toasts().some(text => text.includes('2 profiles deleted on another device'));
      clearToasts();

      seedResidue('batch-a');
      const applied = await tombstones.applyPendingTombstone('batch-a');
      outcomes.applyPendingTombstoneWipesSinglePendingProfile =
        applied.ok === true
        && state.profiles.map(p => p.id).sort().join('|') === 'batch-b|keep'
        && localStorage.getItem(tombKey('batch-a')) === null
        && localStorage.getItem(profileKey('batch-a', 'units')) === null;

      setProfiles([{ id: 'lastonly', name: 'Last Only' }], 'lastonly');
      localStorage.setItem(tombKey('lastonly'), JSON.stringify({ at: Date.now(), source: 'remote' }));
      const protectedLast = await tombstones.applyPendingTombstone('lastonly');
      outcomes.applyPendingTombstoneRejectsOnlyProfile = protectedLast.ok === false
        && protectedLast.reason === 'last-profile';

      setProfiles([{ id: 'keep', name: 'Keep' }, { id: 'rejectme', name: 'Reject Me' }], 'keep');
      localStorage.setItem(tombKey('rejectme'), JSON.stringify({ at: Date.now(), source: 'remote' }));
      configure({ evolu: makeEvolu(), syncEnabled: false });
      const rejectSyncOff = await tombstones.rejectPendingTombstone('rejectme');
      configure({ evolu: makeEvolu(), syncEnabled: true });
      const rejectNoData = await tombstones.rejectPendingTombstone('rejectme');
      localStorage.setItem(tombKey('rejectme'), JSON.stringify({ at: Date.now(), source: 'remote' }));
      localStorage.setItem(profileKey('rejectme', 'imported'), '{bad json');
      const rejectBadJson = await tombstones.rejectPendingTombstone('rejectme');
      localStorage.setItem(profileKey('rejectme', 'imported'), JSON.stringify({ entries: [{ id: 1 }] }));
      const pushed = [];
      configure({ evolu: makeEvolu(), syncEnabled: true, pushProfile: async (profileId, data) => pushed.push({ profileId, data }) });
      const rejectSuccess = await tombstones.rejectPendingTombstone('rejectme');
      outcomes.rejectPendingTombstoneCoversSyncDataAndPushPaths =
        rejectSyncOff.reason === 'sync-off'
        && rejectNoData.reason === 'no-local-data'
        && rejectBadJson.reason === 'bad-local-json'
        && rejectSuccess.ok === true
        && pushed[0]?.profileId === 'rejectme'
        && pushed[0]?.data?.entries?.[0]?.id === 1
        && localStorage.getItem(tombKey('rejectme')) === null;
    } finally {
      tombstones.configureSyncTombstones({
        getEvolu: () => null,
        getProfileQuery: () => null,
        getTombstoneQuery: () => null,
        isSyncEnabled: () => false,
        pushProfile: async () => {},
        debug: () => {},
      });
      state.profiles = saved.profilesState;
      state.importedData = saved.importedData;
      state.currentProfile = saved.currentProfile;
      if (saved.activeProfile == null) localStorage.removeItem('labcharts-active-profile');
      else localStorage.setItem('labcharts-active-profile', saved.activeProfile);
      if (saved.profiles == null) localStorage.removeItem('labcharts-profiles');
      else localStorage.setItem('labcharts-profiles', saved.profiles);
      if (saved.encryptionEnabled == null) localStorage.removeItem('labcharts-encryption-enabled');
      else localStorage.setItem('labcharts-encryption-enabled', saved.encryptionEnabled);
      for (const id of profileIds) {
        localStorage.removeItem(tombKey(id));
        for (const suffix of ['imported', 'units', 'suppOverlay', 'noteOverlay', 'rangeMode', 'showAltUnits', 'suppImpact']) {
          localStorage.removeItem(profileKey(id, suffix));
        }
        for (const suffix of ['chat', 'chat-threads', 'chat-t_one', 'chatRailOpen', 'chatPersonality', 'chatPersonalityCustom', 'focusCard', 'contextHealth', 'onboarded', 'emptyTour', 'tour', 'cycleTour', 'phaseOverlay', 'sync-ts']) {
          localStorage.removeItem(`labcharts-${id}-${suffix}`);
        }
        await blobStorage.deleteBlob(profileKey(id, 'imported')).catch(() => {});
      }
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
    }
    return outcomes;
  }, { tombstonesUrl: moduleUrl('/js/sync-tombstones.js') });

  expectAll(outcomes);
});
