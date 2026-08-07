import { expect, test } from './coverage-fixture.js';

const TRANSLUCENT_THEMES = ['glass', 'synth-sunrise', 'neuromancer'];

function parseCssColor(value) {
  const match = String(value || '').match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;
  const parts = match[1].split(',').map(part => part.trim());
  return {
    r: Number(parts[0]),
    g: Number(parts[1]),
    b: Number(parts[2]),
    a: parts[3] === undefined ? 1 : Number(parts[3]),
  };
}

function luminance(channel) {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(foreground, background) {
  const fg = 0.2126 * luminance(foreground.r) + 0.7152 * luminance(foreground.g) + 0.0722 * luminance(foreground.b);
  const bg = 0.2126 * luminance(background.r) + 0.7152 * luminance(background.g) + 0.0722 * luminance(background.b);
  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
}

async function prepareDemoProfile(page) {
  // Keep the current July demo draws inside the engine's 180-day freshness
  // window. Otherwise this coverage fixture changes behavior as wall-clock
  // time advances and eventually renders every score as stale.
  await page.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(async () => {
    const { state } = await import('/js/state.js');
    return !!state;
  });

  await page.evaluate(async () => {
    const [{ getActiveProfileId }, dataModule, navModule] = await Promise.all([
      import('/js/profile.js'),
      import('/js/data.js'),
      import('/js/nav.js'),
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
      navModule.buildSidebar();
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
    (await import('/js/views.js')).navigate('dashboard');
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

test('translucent themes keep the dashboard coherence score center readable', async ({ page }) => {
  await prepareDemoProfile(page);
  await page.evaluate(async () => {
    (await import('/js/views.js')).navigate('dashboard');
    await new Promise(r => setTimeout(r, 300));
  });

  const hero = page.locator('[data-widget-id="biology-score-biologicalCoherence"]').first();
  await expect(hero.locator('.db-bio-coherence-ring')).toBeVisible();

  for (const theme of TRANSLUCENT_THEMES) {
    await page.evaluate(async nextTheme => {
      await (await import('/js/theme.js')).setTheme(nextTheme);
      await new Promise(requestAnimationFrame);
    }, theme);

    const styles = await hero.evaluate(element => {
      const ring = element.querySelector('.db-bio-coherence-ring');
      const number = element.querySelector('.db-bio-coherence-number strong');
      const rootStyle = getComputedStyle(document.documentElement);
      const centerToken = rootStyle.getPropertyValue('--biology-coherence-center-bg').trim();
      const probe = document.createElement('span');
      probe.style.backgroundColor = centerToken;
      document.body.appendChild(probe);
      const centerColor = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        centerColor,
        numberColor: number ? getComputedStyle(number).color : '',
        ringBackground: ring ? getComputedStyle(ring).backgroundImage : '',
      };
    });

    const foreground = parseCssColor(styles.numberColor);
    const center = parseCssColor(styles.centerColor);
    expect(foreground, `${theme} score color ${styles.numberColor}`).toBeTruthy();
    expect(center, `${theme} center color ${styles.centerColor}`).toBeTruthy();
    expect(center.a, `${theme} center must be opaque`).toBe(1);
    expect(styles.ringBackground, `${theme} ring must use ${styles.centerColor}`).toContain(styles.centerColor);
    expect(
      contrastRatio(foreground, center),
      `${theme} score contrast (${styles.numberColor} on ${styles.centerColor})`,
    ).toBeGreaterThanOrEqual(4.5);
  }
});

test('dashboard coherence domain row navigates to Biology Scores lens and scrolls to score', async ({ page }) => {
  await prepareDemoProfile(page);

  const targetScoreId = await page.evaluate(async () => {
    (await import('/js/views.js')).navigate('dashboard');
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
    (await import('/js/views.js')).navigate('dashboard');
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
    (await import('/js/views.js')).navigate('biology-scores');
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
    (await import('/js/views.js')).navigate('dashboard');
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
