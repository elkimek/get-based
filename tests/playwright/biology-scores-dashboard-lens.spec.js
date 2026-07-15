import { expect, test } from './coverage-fixture.js';

async function prepareDemoProfile(page) {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(() =>
    typeof window.navigate === 'function'
      && !!window._labState
  );

  await page.evaluate(async () => {
    const [{ getActiveProfileId }, dataModule] = await Promise.all([
      import('/js/profile.js'),
      import('/js/data.js'),
    ]);
    const profileId = getActiveProfileId() || localStorage.getItem('labcharts-active-profile') || 'default';
    localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');

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
      window.buildSidebar?.();
    }

    const { state } = await import('/js/state.js');
    state.importedData.profile = state.importedData.profile || {};
    state.importedData.profile.firstName = 'Alex';
    state.importedData.profile.age = 38;
    const { buildBiologyScoreContextFingerprint, buildBiologyScoreContextFingerprintsByRange } = await import('/js/biology-score-context-ai.js');
    const activeData = dataModule.getActiveData();
    state.importedData.biologyScoreContextAI = { summary: 'Context checked for Playwright demo', suggestions: [], fingerprint: buildBiologyScoreContextFingerprint(activeData), fingerprintsByRange: buildBiologyScoreContextFingerprintsByRange(activeData), unlockedRanges: ['all', '1y', '6m', '3m'], range: 'all', updatedAt: Date.now() };
  });
}

test('dashboard renders Biological Coherence hero and domain rows', async ({ page }) => {
  await prepareDemoProfile(page);

  await page.evaluate(async () => {
    window.navigate?.('dashboard');
    await new Promise(r => setTimeout(r, 300));
  });

  const hero = page.locator('[data-widget-id="biology-score-biologicalCoherence"]').first();
  await expect(hero).toBeVisible();
  await expect(hero.locator('.db-bio-coherence-hero')).toBeVisible();
  await expect(hero.locator('.db-bio-coherence-ring')).toBeVisible();
  await expect(hero.locator('.db-bio-coherence-number')).toContainText('/100');

  const domainRows = hero.locator('.bc-micro-domain');
  await expect(domainRows).toHaveCount(12);

  const firstRow = domainRows.first();
  await expect(firstRow).toHaveAttribute('data-biology-score-action', 'jump-to-domain');
  await expect(firstRow).toHaveAttribute('data-biology-score-id', /.+/);
});

test('dashboard coherence domain row navigates to Biology Scores lens and scrolls to score', async ({ page }) => {
  await prepareDemoProfile(page);

  const targetScoreId = await page.evaluate(async () => {
    window.navigate?.('dashboard');
    await new Promise(r => setTimeout(r, 300));
    const row = document.querySelector('[data-widget-id="biology-score-biologicalCoherence"] .bc-micro-domain[data-biology-score-id]');
    if (!row) throw new Error('No coherence domain row found');
    const id = row.getAttribute('data-biology-score-id');
    row.click();
    return id;
  });

  await page.waitForFunction(
    id => !!document.querySelector(`#biology-score-${CSS.escape(id)}`),
    targetScoreId,
  );
  const targetCard = page.locator(`#biology-score-${targetScoreId}`).first();
  await expect(targetCard).toBeVisible();
});

test('dashboard individual biology score widget is clickable and navigates to its score', async ({ page }) => {
  await prepareDemoProfile(page);

  await page.evaluate(async () => {
    const { showDashboardWidget } = await import('/js/dashboard-widgets.js');
    showDashboardWidget?.('biology-score-metabolicFlexibility', { force: true });
    window.navigate?.('dashboard');
    await new Promise(r => setTimeout(r, 300));
    const widget = document.querySelector('[data-widget-id="biology-score-metabolicFlexibility"]');
    const clickTarget = widget?.querySelector('[data-biology-score-action="jump-to-domain"]');
    if (!clickTarget) throw new Error('Metabolic widget click target not found');
    clickTarget.click();
  });

  await page.waitForFunction(
    () => !!document.querySelector('#biology-score-metabolicFlexibility'),
  );
  await expect(page.locator('#biology-score-metabolicFlexibility').first()).toBeVisible();
});

test('Biology Scores lens renders coherence hero with dashboard toggle and score cards', async ({ page }) => {
  await prepareDemoProfile(page);

  await page.evaluate(async () => {
    window.navigate?.('biology-scores');
    await new Promise(r => setTimeout(r, 500));
  });

  const hero = page.locator('.biology-coherence-hero').first();
  await expect(hero).toBeVisible();
  await expect(hero.locator('[data-lens-page-action]')).toBeVisible();

  // Demo profiles should now be fully unlocked and complete: every individual
  // Biology Score detail card is live, with no "needs more data" disclosure.
  await expect(page.locator('.biology-score-detail')).toHaveCount(18);
  await expect(page.locator('.biology-score-unavailable-group')).toHaveCount(0);
});

test('dashboard domain rows without primaryScoreId get no-jump visual cue', async ({ page }) => {
  await prepareDemoProfile(page);

  await page.evaluate(async () => {
    window.navigate?.('dashboard');
    await new Promise(r => setTimeout(r, 300));
  });

  // All domain rows should have either jump-to-domain action or no-jump class
  const allDomainRows = page.locator('[data-widget-id="biology-score-biologicalCoherence"] .bc-micro-domain');
  await expect(allDomainRows.first()).toBeVisible();

  const results = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-widget-id="biology-score-biologicalCoherence"] .bc-micro-domain'));
    return rows.map(row => ({
      hasJump: row.hasAttribute('data-biology-score-action'),
      hasNoJumpClass: row.classList.contains('bc-micro-domain-no-jump'),
      hasTitle: row.hasAttribute('title'),
    }));
  });

  for (const row of results) {
    // Every row should have a title (either "Jump to..." or "...no individual score available yet")
    expect(row.hasTitle, `domain row missing title`).toBe(true);
    // Rows with jump action should NOT have no-jump class, and vice versa
    if (row.hasJump) {
      expect(row.hasNoJumpClass, `clickable row should not have no-jump class`).toBe(false);
    } else {
      expect(row.hasNoJumpClass, `non-clickable row should have no-jump class`).toBe(true);
    }
  }
});
