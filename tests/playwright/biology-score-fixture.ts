import type {Page} from '@playwright/test';
export async function prepareDemoProfile(page: Page, { stableInsightEvidence = false } = {}) {
  // Keep the current July demo draws inside the engine's 180-day freshness
  // window. Otherwise this coverage fixture changes behavior as wall-clock
  // time advances and eventually renders every score as stale.
  await page.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));
  await page.goto('/app', { waitUntil: 'load' });
  // New tabs do not inherit coverage-fixture's readiness-aware page methods.
  await page.locator('html[data-app-ready]').waitFor({ state: 'attached' });

  await page.evaluate(async stableInsightEvidence => {
    const [profile, dataModule, navModule] = await Promise.all([
      import('/js/profile.js'),
      import('/js/data.js'),
      import('/js/nav.js'),
    ]);
    const profileId = profile.getActiveProfileId() || localStorage.getItem('labcharts-active-profile') || 'default';
    localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');
    // The startup tour may already be open on a slower, instrumented CI run.
    (await import('/js/tour.js')).endTour({ openEmptyChat: false });

    const { state } = await import('/js/state.js');
    const { buildBiologyScoreContextFingerprint, buildBiologyScoreContextFingerprintsByRange } = await import('/js/biology-score-context-ai.js');
    function reviewContext() {
      const activeData = dataModule.getActiveData();
      const fingerprintsByRange = buildBiologyScoreContextFingerprintsByRange(activeData);
      const reuseAll = stableInsightEvidence && (!state.dateRangeFilter || state.dateRangeFilter === 'all');
      const fingerprint = reuseAll ? fingerprintsByRange.all : buildBiologyScoreContextFingerprint(activeData);
      state.importedData.biologyScoreContextAI = { summary: 'Context checked for Playwright demo', suggestions: [], fingerprint, fingerprintsByRange, unlockedRanges: ['all', '1y', '6m', '3m'], range: 'all', updatedAt: Date.now() };
    }
    const seedDemo = !dataModule.getActiveData()?.dates?.length;
    if (seedDemo) {
      const response = await fetch('data/demo-male.json');
      state.importedData = await response.json();
      state.profileSex = 'male';
      state.profileDob = '1987-11-22';
      if (!stableInsightEvidence) {
        reviewContext();
        await dataModule.saveImportedData();
        navModule.buildSidebar();
      }
    }

    (await import('/js/biology-score-ai.js')).configureBiologyScoreAIDeps({ automaticEnabled: () => false });
    state.importedData.profile ||= {};
    state.importedData.profile.firstName = 'Alex';
    state.importedData.profile.age = 38;
    if (stableInsightEvidence) {
      // Establish the evidence used by this storage/reuse case before committing
      // its review. Hydration of historical Light sessions has separate coverage.
      await profile.setProfileSex(state.currentProfile, state.profileSex);
      await profile.setProfileDob(state.currentProfile, state.profileDob);
      state.importedData.biologyScoreAI = {};
      state.importedData.sunSessions = [];
      state.importedData.deviceSessions = [];
      state.importedData.sunDefaults = { completedAt: Date.now() };
    }
    reviewContext();
    if (stableInsightEvidence) {
      await dataModule.saveImportedData();
      if (seedDemo) navModule.buildSidebar();
    }
  }, stableInsightEvidence);
}
