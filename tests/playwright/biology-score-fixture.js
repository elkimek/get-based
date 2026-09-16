export async function prepareDemoProfile(page) {
  // Keep the current July demo draws inside the engine's 180-day freshness
  // window. Otherwise this coverage fixture changes behavior as wall-clock
  // time advances and eventually renders every score as stale.
  await page.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));
  await page.goto('/app', { waitUntil: 'load' });
  // New tabs do not inherit coverage-fixture's readiness-aware page methods.
  await page.locator('html[data-app-ready]').waitFor({ state: 'attached' });

  await page.evaluate(async () => {
    const [{ getActiveProfileId }, dataModule, navModule] = await Promise.all([
      import('/js/profile.js'),
      import('/js/data.js'),
      import('/js/nav.js'),
    ]);
    const profileId = getActiveProfileId() || localStorage.getItem('labcharts-active-profile') || 'default';
    localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');
    // The startup tour may already be open on a slower, instrumented CI run.
    (await import('/js/tour.js')).endTour({ openEmptyChat: false });

    if (!dataModule.getActiveData()?.dates?.length) {
      const resp = await fetch('data/demo-male.json');
      const { state } = await import('/js/state.js');
      state.importedData = await resp.json();
      state.profileSex = 'male';
      state.profileDob = '1987-11-22';
      const { buildBiologyScoreContextFingerprint, buildBiologyScoreContextFingerprintsByRange } = await import('/js/biology-score-context-ai.js');
      const activeData = dataModule.getActiveData();
      state.importedData.biologyScoreContextAI = { summary: 'Context checked for Playwright demo', suggestions: [], fingerprint: buildBiologyScoreContextFingerprint(activeData), fingerprintsByRange: buildBiologyScoreContextFingerprintsByRange(activeData), unlockedRanges: ['all', '1y', '6m', '3m'], range: 'all', updatedAt: Date.now() };
      await dataModule.saveImportedData();
      navModule.buildSidebar();
    }

    (await import('/js/biology-score-ai.js')).configureBiologyScoreAIDeps({ automaticEnabled: () => false });
    const { state } = await import('/js/state.js');
    state.importedData.profile = state.importedData.profile || {};
    state.importedData.profile.firstName = 'Alex';
    state.importedData.profile.age = 38;
    const { buildBiologyScoreContextFingerprint, buildBiologyScoreContextFingerprintsByRange } = await import('/js/biology-score-context-ai.js');
    const activeData = dataModule.getActiveData();
    state.importedData.biologyScoreContextAI = { summary: 'Context checked for Playwright demo', suggestions: [], fingerprint: buildBiologyScoreContextFingerprint(activeData), fingerprintsByRange: buildBiologyScoreContextFingerprintsByRange(activeData), unlockedRanges: ['all', '1y', '6m', '3m'], range: 'all', updatedAt: Date.now() };
  });
}
