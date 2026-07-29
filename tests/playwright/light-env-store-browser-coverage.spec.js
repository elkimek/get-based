import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?lightEnvStoreBrowserCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/light-env-store-browser-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.goto('/light-env-store-browser-coverage', { waitUntil: 'load' });
}

function expectAll(outcomes) {
  const failed = Object.entries(outcomes)
    .filter(([, value]) => value !== true)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  expect(failed).toEqual([]);
}

test('light environment store browser coverage persists room screen and tombstone mutations', async ({ page }) => {
  await openBlankPage(page);

  const outcomes = await page.evaluate(async ({ storeUrl }) => {
    const [
      store,
      { state },
      { profileStorageKey },
      { encryptedGetItem, encryptedRemoveItem },
    ] = await Promise.all([
      import(storeUrl),
      import('/js/state.js'),
      import('/js/profile.js'),
      import('/js/crypto.js'),
    ]);
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const saved = {
      importedData: clone(state.importedData),
      currentProfile: state.currentProfile,
    };
    const todayLocal = () => {
      const d = new Date();
      return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
      ].join('-');
    };
    const profileId = `light-env-store-browser-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const importedKey = profileStorageKey(profileId, 'imported');
    const outcomes = {};

    try {
      state.currentProfile = profileId;
      state.importedData = null;
      const noDataRoom = await store.addRoom('No data');
      const noDataScreen = await store.addScreen('phone');
      const noDataRoomDelete = await store.deleteRoom('missing-room');
      const noDataScreenDelete = await store.deleteScreen('missing-screen');
      outcomes.nullImportedDataGuardsReturnNullOrFalse =
        store.getEnvironment() === null
        && noDataRoom === null
        && noDataScreen === null
        && noDataRoomDelete === false
        && noDataScreenDelete === false;

      state.importedData = {
        entries: [],
        sunDefaults: { homeLight: 'halogen' },
        lightMeasurements: [],
      };
      const initialized = store.getEnvironment();
      initialized.rooms.push({
        id: 'legacy-room',
        name: 'Legacy Room',
        eveningUseAfterSunset: true,
      });
      initialized.screens.push({
        id: 'stale-screen',
        device: 'tablet',
        roomId: null,
        todayOverride: { date: '1999-01-01', active: false },
      });
      store.getEnvironment();
      outcomes.getEnvironmentInitializesAndNormalizesLegacyEveningFields =
        Array.isArray(initialized.rooms)
        && Array.isArray(initialized.screens)
        && initialized.rooms[0].eveningHoursAfterSunset === 2
        && !('eveningUseAfterSunset' in initialized.rooms[0])
        && store.isActiveToday(initialized.screens[0]) === true;

      const roomId = await store.addRoom('Bedroom');
      const env = store.getEnvironment();
      const room = env.rooms.find(r => r.id === roomId);
      const persistedAfterAdd = JSON.parse(await encryptedGetItem(importedKey));
      outcomes.addRoomUsesBrowserIdDefaultsAndPersists =
        typeof roomId === 'string'
        && /^room_[a-z0-9_]+$/i.test(roomId)
        && room?.name === 'Bedroom'
        && room.primarySource === 'halogen'
        && room.hoursOccupiedPerDay === 8
        && room.eveningHoursAfterSunset === null
        && persistedAfterAdd.lightEnvironment.rooms.some(r => r.id === roomId);

      const updatedRoom = await store.updateRoom(roomId, {
        primarySource: 'led-cool',
        eveningUseAfterSunset: true,
      });
      const missingRoomUpdate = await store.updateRoom('missing-room', { primarySource: 'incandescent' });
      await store.setTodayActive('room', roomId, false);
      const missingTodayUpdate = await store.setTodayActive('room', 'missing-room', true);
      outcomes.updateRoomAndTodayOverrideNormalizeAndStamp =
        updatedRoom === room
        && room.primarySource === 'led-cool'
        && room.eveningHoursAfterSunset === 2
        && !('eveningUseAfterSunset' in room)
        && Number.isFinite(room.updatedAt)
        && room.todayOverride.date === todayLocal()
        && room.todayOverride.active === false
        && store.isActiveToday(room) === false
        && missingRoomUpdate === null
        && missingTodayUpdate === null;

      const portableId = await store.addScreen('phone');
      const roomScreenId = await store.addScreen('monitor', roomId);
      const roomScreen = env.screens.find(s => s.id === roomScreenId);
      const portable = env.screens.find(s => s.id === portableId);
      const portableBucket = store.getScreensForRoom(null);
      const roomBucket = store.getScreensForRoom(roomId);
      const updatedScreen = await store.updateScreen(roomScreenId, {
        hoursPerDay: 5,
        eveningUseAfterSunset: 1.5,
        blueBlockerEnabled: true,
      });
      const missingScreenUpdate = await store.updateScreen('missing-screen', { hoursPerDay: 1 });
      const screenTodayUpdate = await store.setTodayActive('screen', roomScreenId, false);
      const missingScreenTodayUpdate = await store.setTodayActive('screen', 'missing-screen', true);
      outcomes.addUpdateFilterScreensAndScreenTodayOverride =
        /^scr_[a-z0-9_]+$/i.test(portableId)
        && /^scr_[a-z0-9_]+$/i.test(roomScreenId)
        && portableBucket.some(s => s.id === portableId)
        && !portableBucket.some(s => s.id === roomScreenId)
        && roomBucket.some(s => s.id === roomScreenId)
        && !roomBucket.some(s => s.id === portableId)
        && updatedScreen === roomScreen
        && roomScreen.hoursPerDay === 5
        && roomScreen.eveningUseAfterSunset === 1.5
        && roomScreen.blueBlockerEnabled === true
        && screenTodayUpdate === roomScreen
        && roomScreen.todayOverride.date === todayLocal()
        && roomScreen.todayOverride.active === false
        && store.isActiveToday(roomScreen) === false
        && Number.isFinite(roomScreen.updatedAt)
        && missingScreenUpdate === null
        && missingScreenTodayUpdate === null
        && portable.roomId === null;

      const deleteScreenResult = await store.deleteScreen(portableId);
      const missingScreenDelete = await store.deleteScreen('missing-screen');
      outcomes.deleteScreenRemovesAndTombstones =
        deleteScreenResult === true
        && missingScreenDelete === false
        && !env.screens.some(s => s.id === portableId)
        && state.importedData._deleted['lightEnvironment.screens'].includes(portableId);

      state.importedData.lightMeasurements = [
        { id: 'linked-measure', roomId, tool: 'lux', value: 10 },
        { id: 'kept-measure', roomId: 'other-room', tool: 'lux', value: 20 },
      ];
      const deleteRoomResult = await store.deleteRoom(roomId);
      const missingRoomDelete = await store.deleteRoom('missing-room');
      outcomes.deleteRoomCascadesMeasurementsScreensAndTombstones =
        deleteRoomResult === true
        && missingRoomDelete === false
        && !env.rooms.some(r => r.id === roomId)
        && !state.importedData.lightMeasurements.some(m => m.id === 'linked-measure')
        && state.importedData.lightMeasurements.some(m => m.id === 'kept-measure')
        && env.screens.find(s => s.id === roomScreenId)?.roomId === null
        && state.importedData._deleted['lightEnvironment.rooms'].includes(roomId)
        && state.importedData._deleted.lightMeasurements.includes('linked-measure');
    } finally {
      await encryptedRemoveItem(importedKey).catch(() => {});
      state.importedData = saved.importedData;
      state.currentProfile = saved.currentProfile;
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return outcomes;
  }, {
    storeUrl: moduleUrl('/js/light-env-store.js'),
  });

  expectAll(outcomes);
});
