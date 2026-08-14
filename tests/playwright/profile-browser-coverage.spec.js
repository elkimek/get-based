import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?profileCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('profile browser coverage exercises migration height and latitude helpers', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ profileUrl }) => {
    const [{ state }, profile] = await Promise.all([
      import('/js/state.js'),
      import(profileUrl),
    ]);
    const outcomes = {};
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const storageKeys = [
      'labcharts-active-profile',
      'labcharts-location-cache',
      'labcharts-profiles',
      'labcharts-sync-enabled',
    ];
    const saved = {
      profiles: clone(state.profiles),
      currentProfile: state.currentProfile,
      storage: Object.fromEntries(storageKeys.map(key => [key, localStorage.getItem(key)])),
      locationDisplay: document.getElementById('loc-lat-display'),
    };
    let previousProfileDeps = null;
    const profileId = 'profile-browser-coverage';
    let latitudeCalls = 0;

    try {
      const migrated = {
        entries: [{
          date: '2026-05-01',
          markers: { 'biochemistry.alpUkatL': 1.2 },
          markerSources: { 'biochemistry.alpUkatL': { file: 'fixture.pdf' } },
        }],
        customMarkers: {
          'biochemistry.alpUkatL': { name: 'ALP (ukat/l)', unit: 'ukat/l' },
        },
        markerLabels: {
          'biochemistry.alpUkatL': 'Fixture ALP',
        },
        manualValues: {
          'biochemistry.alpUkatL:2026-05-01': 1.2,
        },
        markerValueNotes: {
          'biochemistry.alpUkatL:2026-05-01': 'fasted',
        },
      };
      profile.migrateProfileData(migrated);
      outcomes.migrationRemapsUnitSuffixedMarkerAndMetadata =
        migrated.entries[0].markers['biochemistry.alp'] === 1.2
        && migrated.entries[0].markers['biochemistry.alpUkatL'] === undefined
        && migrated.entries[0].markerSources['biochemistry.alp']?.file === 'fixture.pdf'
        && migrated.entries[0].markerSources['biochemistry.alpUkatL'] === undefined
        && migrated.customMarkers['biochemistry.alpUkatL'] === undefined
        && migrated.markerLabels['biochemistry.alp'] === 'Fixture ALP'
        && migrated.manualValues['biochemistry.alp:2026-05-01'] === 1.2
        && migrated.markerValueNotes['biochemistry.alp:2026-05-01'] === 'fasted';

      state.currentProfile = profileId;
      state.profiles = [{
        id: profileId,
        name: 'Profile Coverage',
        location: { country: '', zip: '' },
        height: null,
        heightUnit: 'cm',
        tags: [],
        notes: '',
        status: 'active',
        avatar: null,
        pinned: false,
        createdAt: Date.now() - 1000,
        lastUpdated: Date.now() - 1000,
      }];
      localStorage.setItem('labcharts-active-profile', profileId);
      localStorage.setItem('labcharts-sync-enabled', 'false');
      await profile.setProfileHeight(profileId, 181, 'cm');
      const height = profile.getProfileHeight(profileId);
      outcomes.profileHeightSetterUpdatesActiveProfile =
        height.height === 181
        && height.unit === 'cm'
        && state.profiles[0].lastUpdated > state.profiles[0].createdAt;

      localStorage.removeItem('labcharts-location-cache');
      document.getElementById('loc-lat-display')?.remove();
      const latDisplay = document.createElement('div');
      latDisplay.id = 'loc-lat-display';
      document.body.appendChild(latDisplay);
      previousProfileDeps = profile.configureProfileDeps({
        fetchImpl: async () => {
          latitudeCalls += 1;
          return new Response(JSON.stringify({
            latitude: -34.6,
            longitude: -58.4,
            accuracyKm: 11,
            label: 'C1000, Buenos Aires, Argentina',
            source: 'postal-area',
            resolvedAt: Date.now(),
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        },
        isDebugMode: () => false,
      });

      await profile.detectLatitudeWithAI('Argentina', 'C1000');
      await profile.detectLatitudeWithAI('Argentina', 'C1000');
      const cache = profile.getLocationCache();
      outcomes.latitudeDetectionCachesAndRendersResult =
        latitudeCalls === 1
        && cache['argentina|c1000']?.lat === -34.6
        && cache['argentina|c1000']?.lon === -58.4
        && /35.*S/.test(latDisplay.textContent || '')
        && latDisplay.style.color === 'var(--green)';
    } finally {
      state.profiles = saved.profiles;
      state.currentProfile = saved.currentProfile;
      for (const [key, value] of Object.entries(saved.storage)) {
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      if (previousProfileDeps) profile.configureProfileDeps(previousProfileDeps);
      document.getElementById('loc-lat-display')?.remove();
      if (saved.locationDisplay) document.body.appendChild(saved.locationDisplay);
    }

    return outcomes;
  }, {
    profileUrl: moduleUrl('/js/profile.js'),
  });

  const expectedOutcomes = [
    'migrationRemapsUnitSuffixedMarkerAndMetadata',
    'profileHeightSetterUpdatesActiveProfile',
    'latitudeDetectionCachesAndRendersResult',
  ];
  for (const key of expectedOutcomes) {
    expect(results, `outcome key '${key}' was never set`).toHaveProperty(key);
  }
  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
