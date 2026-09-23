import { expect, test } from './coverage-fixture.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/app');
  await page.evaluate(async () => {
    const [{ state }, store] = await Promise.all([import('/js/state.js'), import('/js/sun-sessions-store.js?recovery-browser')]);
    state.currentProfile = 'sun-recovery';
    state.importedData = { entries: [], sunSessions: [], sunDefaults: { fitzpatrick: 'II' } };
    store.configureSunSessionsStore({
      fetchAtmosphere: async () => ({ uvIndex: 3 }), reconstructSpectrum: () => ({}),
      computeChannelDoses: ({ durationMin }) => ({ vitamin_d: durationMin }),
      erythemalSED: () => 1, fractionOfMED: () => 0.1, retinalUVdose: () => 2, solarZenithAngle: () => 40,
      maybeAnalyzeSessionAfterFinish: () => {},
    });
  });
});

test('computed sun session survives real profile persistence and page reload', async ({ page }) => {
  const id = await page.evaluate(async () => {
    const store = await import('/js/sun-sessions-store.js?recovery-browser');
    const id = await store.logCompletedSession({ startedAt: Date.now() - 600000, endedAt: Date.now(), durationMin: 10, location: { lat: 50, lon: 14 } });
    const result = await store.hydrateSession(id);
    if (!result || result.calculationStatus !== 'computed') throw Error('Hydration did not complete');
    return id;
  });
  await page.reload();
  const saved = await page.evaluate(async () => {
    const { encryptedGetItem } = await import('/js/crypto.js');
    return JSON.parse(await encryptedGetItem('labcharts-sun-recovery-imported')).sunSessions;
  });
  expect(saved).toHaveLength(1); expect(saved[0]).toMatchObject({ id, durationMin: 10, doses: { vitamin_d: 10 }, calculationStatus: 'computed' });
});

for (const boundary of ['profile switch', 'deletion']) {
  test(`delayed weather cannot persist or analyze after ${boundary}`, async ({ page }) => {
    const result = await page.evaluate(async boundary => {
      const [{ state }, store, { encryptedGetItem }] = await Promise.all([import('/js/state.js'), import('/js/sun-sessions-store.js?recovery-browser'), import('/js/crypto.js')]);
      const id = await store.logCompletedSession({ startedAt: Date.now() - 600000, endedAt: Date.now(), durationMin: 10, location: { lat: 50, lon: 14 } });
      let release, entered;
      const started = new Promise(resolve => { entered = resolve; });
      let analysis = 0;
      store.configureSunSessionsStore({ fetchAtmosphere: () => { entered(); return new Promise(resolve => { release = resolve; }); }, maybeAnalyzeSessionAfterFinish: () => { analysis++; } });
      const pending = store.hydrateSession(id); await started;
      if (boundary === 'deletion') await store.deleteSession(id);
      else { state.currentProfile = 'sun-recovery-other'; state.importedData = { entries: [], sunSessions: [] }; }
      release({ uvIndex: 99 });
      const hydrated = await pending;
      const original = JSON.parse(await encryptedGetItem('labcharts-sun-recovery-imported'));
      return { hydrated, analysis, sessions: original.sunSessions, other: await encryptedGetItem('labcharts-sun-recovery-other-imported') };
    }, boundary);
    expect(result.hydrated).toBeNull(); expect(result.analysis).toBe(0); expect(result.other).toBeNull();
    if (boundary === 'deletion') expect(result.sessions).toEqual([]);
    else expect(result.sessions[0]).toMatchObject({ doses: null, calculationStatus: 'pending' });
  });
}

test('live runtime reset discards pending weather and a restarted ticker recovers', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const active = await import('/js/sun-active-session.js?recovery-browser');
    const sess = { id: 'live-recovery', startedAt: Date.now() - 10000, location: { lat: 50, lon: 14 }, bodyExposure: { fraction: 0.1 } };
    let release, calls = 0;
    active.configureSunActiveSession({ getSessions: () => [sess], getActiveSession: () => sess,
      fetchAtmosphere: () => { calls++; return calls === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve({ uvIndex: 3 }); },
      reconstructSpectrum: () => ({}), computeChannelDoses: () => ({ vitamin_d: 1 }), solarZenithAngle: () => 40,
    });
    try {
      active.ensureActiveTicker(); active.resetSunActiveSessionState(); release({ uvIndex: 99 }); await Promise.resolve();
      const stale = active.liveDosesFor(sess);
      active.ensureActiveTicker(); await Promise.resolve();
      return { stale, current: active.liveDosesFor(sess)?.atm?.uvIndex, calls };
    } finally { active.resetSunActiveSessionState(); }
  });
  expect(result).toEqual({ stale: null, current: 3, calls: 2 });
});
