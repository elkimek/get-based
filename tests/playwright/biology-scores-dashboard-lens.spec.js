import { expect, test } from './coverage-fixture.js';

const TRANSLUCENT_THEMES = ['glass', 'synth-sunrise', 'neuromancer'];

import { prepareDemoProfile } from './biology-score-fixture.js';

test('dashboard renders Biological Coherence hero and domain rows', async ({ page }) => {
  await prepareDemoProfile(page);

  await page.evaluate(async () => {
    (await import('/js/views.js')).navigate('dashboard');
    await new Promise(r => setTimeout(r, 300));
  });

  const hero = page.locator('[data-widget-id="biology-score-biologicalCoherence"]').first();
  await expect(hero).toBeVisible();
  await expect(hero.locator('.db-bio-coherence-hero')).toBeVisible();
  await expect(hero.locator('.db-hero-bio-bar-track')).toBeVisible();
  await expect(hero.locator('.db-hero-bio-num')).toContainText('/100');
  await expect(hero.locator('.dashboard-widget-source, .db-bio-coherence-eyebrow')).toHaveCount(0);
  await expect(hero.locator('.dashboard-widget-description')).toHaveCount(0);

  const domainRows = hero.locator('.bc-micro-domain');
  await expect(domainRows).toHaveCount(12);

  const firstRow = domainRows.first();
  await expect(firstRow).toHaveAttribute('data-biology-score-action', 'jump-to-domain');
  await expect(firstRow).toHaveAttribute('data-biology-score-id', /.+/);
});

test('coherence and sub-score widgets retain the original dashboard theme styles', async ({ page }) => {
  await prepareDemoProfile(page);
  await page.evaluate(async () => (await import('/js/views.js')).navigate('dashboard'));
  const gradients = new Set();
  for (const theme of ['dark', 'light', ...TRANSLUCENT_THEMES, 'cyberterm']) {
    await page.evaluate(async nextTheme => {
      await (await import('/js/theme.js')).setTheme(nextTheme);
      await new Promise(requestAnimationFrame);
    }, theme);
    const styles = await page.evaluate(() => {
      const read = id => {
        const number = document.querySelector(`[data-widget-id="${id}"] .db-hero-bio-num`);
        const style = getComputedStyle(number);
        return { color: style.color, background: style.backgroundImage, clip: style.backgroundClip, fill: style.webkitTextFillColor, size: style.fontSize, family: style.fontFamily };
      };
      return { age: read('bio-age'), subscore: read('biology-score-metabolicFlexibility'), coherence: read('biology-score-biologicalCoherence') };
    });
    expect(styles.subscore, theme).toEqual(styles.age);
    expect(styles.coherence, theme).toEqual(styles.subscore);
    if (theme === 'cyberterm') {
      expect(styles.coherence.background).toBe('none');
      expect(styles.coherence.color).not.toBe('rgba(0, 0, 0, 0)');
    } else {
      expect(styles.coherence.background).toContain('linear-gradient');
      expect(styles.coherence.clip).toBe('text');
    }
    gradients.add(styles.coherence.background);
  }
  expect(gradients.size).toBeGreaterThan(2);
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
  await hero.locator('.biology-coherence-breakdown > summary').click();
  await expect(hero.locator('[data-lens-page-action]')).toBeVisible();

  // Demo profiles should now be fully unlocked and complete: every individual
  // Biology Score detail card is live, with no "needs more data" disclosure.
  await expect(page.locator('.biology-score-detail')).toHaveCount(18);
  await expect(page.locator('[data-biology-group=baseline]')).toBeVisible();
  await expect(page.locator('[data-biology-group=advanced]')).toBeVisible();
  await expect(page.locator('.biology-score-coverage-planner')).toHaveAttribute('open', '');
  await expect(page.locator('.biology-score-coverage-planner > summary')).toHaveText('Plan additional labs');
  await expect(page.locator('.biology-score-question .biology-score-question-kicker, .biology-coverage-section-kicker')).toHaveCount(0);
  const thyroid = page.locator('#biology-score-thyroidCoherence');
  await expect(thyroid.locator('.biology-score-table').first()).not.toBeVisible();
  await thyroid.locator(':scope > .biology-score-summary').click();
  await expect(thyroid.locator('.biology-score-table').first()).toBeVisible();
  await expect(thyroid.locator('.biology-score-ai-details').getByRole('button', { name: 'Explain score' })).toBeVisible();
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


test('scores stay accessible without AI and mobile details preserve all controls', async ({ page }) => {
  await prepareDemoProfile(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    delete state.importedData.biologyScoreContextAI;
    (await import('/js/views.js')).navigate('biology-scores');
  });
  await expect(page.locator('.biology-score-compact')).toHaveCount(18);
  await expect(page.locator('.biology-score-compact[open]')).toHaveCount(0);
  await expect(page.locator('.biology-score-context-gate')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/biology-scores-desktop-after.png', fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const kidney = page.locator('#biology-score-fluidFiltrationCoherence');
  await expect(kidney).toContainText('Kidney & Filtration');
  await kidney.locator(':scope > .biology-score-summary').click();
  await expect(kidney.locator('.biology-score-table').first()).toBeVisible();
  await expect(kidney.locator('.lens-widget-dashboard-toggle')).toBeVisible();
  await kidney.locator('.biology-score-methodology > summary').click();
  await expect(kidney.getByRole('link', { name: 'Biological background' })).toBeVisible();
  await expect(kidney).toContainText('cystatin');
  const prose = kidney.locator('.biology-score-methodology .biology-reading-body > p').first();
  expect(await prose.evaluate(el => el.getBoundingClientRect().right <= innerWidth && el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await prose.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/biology-scores-mobile-after.png', fullPage: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const context = page.locator('.biology-context-review-details');
  await context.locator(':scope > summary').click();
  await expect(context.locator('[data-biology-context-flag]')).toHaveCount(4);
  await expect(context.locator('[data-biology-context-flag="postmenopause"]')).toHaveCount(0);
  const lowMuscle = context.locator('[data-biology-context-flag="lowMuscleMass"]');
  await lowMuscle.setChecked(true);
  await expect.poll(() => page.evaluate(async () => (await import('/js/state.js')).state.importedData.diagnoses.flags.lowMuscleMass)).toBe(true);
});


test('score dials and domain bars stay visible on wide screens with historical data', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await prepareDemoProfile(page);
  await page.clock.setFixedTime(new Date('2026-09-16T12:00:00Z'));
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { invalidateActiveDataCache } = await import('/js/data.js');
    state.importedData.entries = [{ date: '2026-01-16', markers: {
      'thyroid.tsh': 1.5, 'thyroid.ft3': 4.8,
      'lipids.apoB': .8, 'lipids.apoAI': 1.6,
      'biochemistry.glucose': 5.2, 'diabetes.insulin': 9,
      'lipids.triglycerides': 1.2, 'lipids.hdl': 1.3,
      'biochemistry.ggt': .4, 'proteins.hsCRP': .7,
      'iron.ferritin': 100, 'iron.transferrinSat': 30, 'hematology.hemoglobin': 150,
    } }, { date: '2024-07-08', markers: { 'thyroid.ft4': 16 } }];
    state.dateRangeFilter = 'all';
    invalidateActiveDataCache();
    (await import('/js/views.js')).navigate('biology-scores');
  });
  const thyroid = page.locator('#biology-score-thyroidCoherence');
  await expect(page.locator('.biology-coherence-overview .biology-score-dial-number')).not.toContainText('—');
  await expect(page.locator('.biology-coherence-overview')).toContainText('Mixed-date estimate · Jul 2024 – Jan 2026');
  await expect(page.locator('.biology-coherence-domain-row').first()).toBeVisible();
  await expect(thyroid.locator(':scope > .biology-score-summary')).toContainText('Mixed-date estimate');
  await expect(thyroid.locator('.biology-score-dial-number').first()).not.toContainText('—');
  await expect(page.locator('#biology-score-cardiovascularLipoprotein > .biology-score-summary')).toContainText('Historical score');
  const rows = page.locator('.biology-score-lens-row');
  const positions = await rows.evaluateAll(elements => elements.slice(0, 3).map(el => ({ x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y, width: el.getBoundingClientRect().width })));
  expect(new Set(positions.map(p => Math.round(p.y))).size).toBe(1);
  expect(new Set(positions.map(p => Math.round(p.x))).size).toBe(3);
  expect(positions.every(p => p.width < 500)).toBe(true);
  expect(await page.locator('.biology-scores-page').evaluate(el => el.getBoundingClientRect().width)).toBeLessThanOrEqual(1400);
  await page.screenshot({ path: '/tmp/biology-scores-wide-restored.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await thyroid.scrollIntoViewIfNeeded();
  await expect(thyroid.locator('.biology-score-dial').first()).toBeVisible();
  await thyroid.locator(':scope > .biology-score-summary').click();
  await expect(thyroid.locator('.biology-score-history-note')).toBeVisible();
  expect(await thyroid.evaluate(el => el.getBoundingClientRect().right <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/biology-scores-mobile-restored.png' });
});

test('domain bars and several score cards are visible without opening disclosures', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await prepareDemoProfile(page);
  await page.evaluate(async () => (await import('/js/views.js')).navigate('biology-scores'));
  await expect(page.locator('.biology-coherence-domain-row').first()).toBeVisible();
  await expect(page.locator('.biology-domain-meter').first()).toBeVisible();
  const dials = page.locator('.biology-score-compact > .biology-score-summary .biology-score-dial');
  await expect(dials).toHaveCount(18);
  await page.locator('.biology-score-lens-row').first().scrollIntoViewIfNeeded();
  const visible = await dials.evaluateAll(elements => elements.filter(el => el.getBoundingClientRect().bottom <= innerHeight).length);
  expect(visible).toBeGreaterThanOrEqual(3);
  await page.screenshot({ path: '/tmp/biology-scores-desktop-restored.png' });
});

test('overview colors, readable details and visible planning follow the app table design', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await prepareDemoProfile(page);
  await page.evaluate(async () => (await import('/js/views.js')).navigate('biology-scores'));
  const colors = await page.locator('.biology-coherence-domain-row').evaluateAll(rows => rows.map(row => ({
    score: Number(row.querySelector('strong').textContent),
    color: getComputedStyle(row.querySelector('.biology-domain-meter > span')).backgroundColor,
  })));
  expect(colors.find(row => row.score >= 85).color).not.toBe(colors.find(row => row.score < 35).color);
  const planning = page.locator('.biology-planning-grid');
  await expect(planning.locator('.biology-planning-card[open]')).toHaveCount(2);
  const panelHeights = await planning.locator('.biology-planning-card').evaluateAll(elements => elements.map(el => Math.round(el.getBoundingClientRect().height)));
  expect(panelHeights[0]).toBe(panelHeights[1]);
  expect(await planning.evaluate(el => el.getBoundingClientRect().top)).toBeLessThan(await page.locator('.lens-page-widgets').first().evaluate(el => el.getBoundingClientRect().top));
  await expect(planning.getByRole('button', { name: 'Make lab plan' })).toBeVisible();
  await page.screenshot({ path: '/tmp/biology-scores-planning.png' });
  await page.locator('.biology-coherence-breakdown > summary').click();
  await expect(page.locator('.biology-coherence-breakdown .biology-reading-facts > div')).toHaveCount(4);
  await page.locator('.biology-coherence-breakdown').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/biology-scores-overview-method.png' });
  const thyroid = page.locator('#biology-score-thyroidCoherence');
  await thyroid.locator(':scope > .biology-score-summary').click();
  const table = thyroid.locator('.biology-score-marker-section .data-table').first();
  await expect(table).toBeVisible();
  expect(await table.locator('thead th').first().evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  const headingPositions = await table.locator('thead th').evaluateAll(cells => cells.map(el => Math.round(el.getBoundingClientRect().y)));
  expect(new Set(headingPositions).size).toBe(1);
  await thyroid.locator('.biology-score-expanded').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/biology-scores-marker-table.png' });
  await thyroid.locator('.biology-score-methodology > summary').click();
  await expect(thyroid.locator('.biology-score-methodology .biology-reading-facts > div')).toHaveCount(4);
  await thyroid.locator('.biology-score-methodology').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/biology-scores-method.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await thyroid.locator('.biology-score-methodology').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: '/tmp/biology-scores-method-mobile.png' });
});

test('opening and closing a score keeps its toggle under the pointer in every grid column', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await prepareDemoProfile(page);
  await page.evaluate(async () => (await import('/js/views.js')).navigate('biology-scores'));
  await page.evaluate(async () => (await import('/js/utils.js')).dismissAnalyticsConsent());
  for (const width of [1440, 1201, 1100, 390, 320]) {
    await page.setViewportSize({ width, height: 1050 });
    for (const index of [0, 1, 2]) {
      const card = page.locator('.biology-score-compact').nth(index);
      const summary = card.locator(':scope > .biology-score-summary');
      await summary.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      const before = await summary.boundingBox();
      const point = { x: before.x + before.width - 40, y: before.y + before.height - 30 };
      await page.mouse.click(point.x, point.y);
      await expect(card).toHaveAttribute('open', '');
      const after = await summary.boundingBox();
      expect(Math.abs(after.x - before.x)).toBeLessThan(2);
      expect(Math.abs(after.y - before.y)).toBeLessThan(2);
      expect(Math.abs(after.height - before.height)).toBeLessThan(2);
      const panel = await card.locator('.biology-score-expanded').boundingBox();
      const grid = await card.locator('xpath=ancestor::div[contains(@class, "lens-page-widgets")]').boundingBox();
      expect(Math.abs(panel.x - grid.x)).toBeLessThan(3);
      expect(Math.abs(panel.width - grid.width)).toBeLessThan(3);
      await page.mouse.click(point.x, point.y);
      await expect(card).not.toHaveAttribute('open', '');
      await expect(page.locator('.biology-score-compact[open]')).toHaveCount(0);
    }
  }
  const keyboardSummary = page.locator('.biology-score-compact [data-biology-score-action=toggle-score]').first();
  await keyboardSummary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.biology-score-compact[open]')).toHaveCount(1);
  await page.keyboard.press('Space');
  await expect(page.locator('.biology-score-compact[open]')).toHaveCount(0);
});

test('card AI explains without expanding or changing the score and supports retry', async ({ page }) => {
  await prepareDemoProfile(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.biologyScoreAI = {};
    (await import('/js/biology-score-ai.js')).configureBiologyScoreAIDeps({
      hasAIProvider: () => true, isAIPaused: () => false,
      callClaudeAPI: async () => { throw new Error('Synthetic gateway unavailable. Retry.'); },
    });
    (await import('/js/views.js')).navigate('biology-scores');
  });
  const card = page.locator('#biology-score-thyroidCoherence');
  const score = await card.locator('.biology-score-dial-number').textContent();
  const teaser = card.locator('[data-biology-score-ai-summary]');
  await teaser.getByRole('button').click();
  await expect(teaser.locator('.biology-score-ai-error')).toContainText('Synthetic gateway unavailable');
  await expect(teaser.getByRole('button')).toBeEnabled();
  await expect(card).not.toHaveAttribute('open', '');
  await page.evaluate(async () => {
    (await import('/js/biology-score-ai.js')).configureBiologyScoreAIDeps({ callClaudeAPI: async () => ({ text: JSON.stringify({ summary: 'Your thyroid markers broadly agree. Free T3 lowers the fit. Check collection context.', explanation: '## Main signal\nFree T3 contributes most to the lower range fit.\n\n## Context\n- Read these values with collection context.\n- The score remains deterministic.' }) }) });
  });
  await teaser.getByRole('button').click();
  await expect(teaser).toContainText('Your thyroid markers broadly agree');
  await expect(teaser.locator('.biology-score-ai-error')).toBeEmpty();
  await expect(card.locator('.biology-score-dial-number')).toHaveText(score);
  await expect(card).not.toHaveAttribute('open', '');
  await page.evaluate(async () => (await import('/js/views.js')).navigate('biology-scores'));
  await expect(teaser).toContainText('Your thyroid markers broadly agree');
  await teaser.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/biology-score-ai-summary.png' });
  await card.locator(':scope > .biology-score-summary').click();
  await expect(card.locator('.biology-score-ai-answer')).toContainText('The score remains deterministic');
});

test('complete independent AI insights fit equal cards and full rich text is readable on mobile', async ({ page }) => {
  await prepareDemoProfile(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { getActiveData } = await import('/js/data.js');
    const { computeBiologyScores } = await import('/js/biology-scores.js');
    const { getScoreAIMaterialKey } = await import('/js/biology-score-sections.js');
    const scores = computeBiologyScores(getActiveData());
    state.importedData.biologyScoreAI = Object.fromEntries(scores.map(s => [s.id, {
      summary: s.id === 'thyroidCoherence' ? 'Thyroid markers broadly agree, but these results come from different dates. The core panel is complete, while timing limits confidence in this estimate. Check the markers together to see whether this pattern still reflects your current state.' : 'The core markers mostly agree. Some results need context. Review the next check.',
      text: '## Main signal\nThis is the separate, fuller explanation of the core marker pattern.\n\n## Context\n- **Collection dates:** These results span different dates.\n- **Additional markers:** These add context to the core score.\n\n## Next check\nFinal detail remains readable.',
      materialFingerprint: getScoreAIMaterialKey(s), updatedAt: Date.now(),
    }]));
    (await import('/js/views.js')).navigate('biology-scores');
  });
  await page.evaluate(async () => (await import('/js/utils.js')).dismissAnalyticsConsent());
  const overview = page.locator('#biology-score-biologicalCoherence');
  await overview.locator('.biology-coherence-interpretation > summary').click();
  await expect(overview.locator('.biology-score-ai-answer .chat-h2')).toHaveCount(3);
  await overview.locator('.biology-coherence-interpretation > summary').click();
  for (const width of [1440, 1201, 1100, 390, 320]) {
    await page.setViewportSize({ width, height: 1050 });
    await page.waitForTimeout(300);
    const sizes = await page.locator('.biology-score-compact > .biology-score-summary').evaluateAll(elements => elements.slice(0, 6).map(el => ({ top: Math.round(el.getBoundingClientRect().top), height: Math.round(el.getBoundingClientRect().height) })));
    for (const top of new Set(sizes.map(size => size.top))) expect(new Set(sizes.filter(size => size.top === top).map(size => size.height)).size).toBe(1);
    if (width === 390) {
      const thyroidHeight = await page.locator('#biology-score-thyroidCoherence > .biology-score-summary').evaluate(el => el.getBoundingClientRect().height);
      expect(thyroidHeight).toBeGreaterThan(sizes[0].height);
    }
    const insights = await page.locator('.biology-score-compact .biology-score-ai-teaser-text').evaluateAll(elements => elements.map(el => ({ clamp: getComputedStyle(el).webkitLineClamp, bottom: el.getBoundingClientRect().bottom, boxBottom: el.parentElement.getBoundingClientRect().bottom, text: el.textContent })));
    for (const insight of insights) {
      expect(insight.clamp).toBe('none');
      expect(insight.bottom).toBeLessThanOrEqual(insight.boxBottom + 1);
      expect(insight.text).not.toMatch(/…|\.\.\./);
    }
    await expect(page.locator('[data-biology-score-action="read-score-ai"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (width === 1440) {
      await page.locator('#biology-score-thyroidCoherence > .biology-score-summary').scrollIntoViewIfNeeded();
      await page.screenshot({ path: '/tmp/biology-score-equal-cards.png' });
    }
  }
  const thyroid = page.locator('#biology-score-thyroidCoherence');
  await page.setViewportSize({ width: 1440, height: 1050 });
  await thyroid.locator(':scope > .biology-score-summary').click();
  await thyroid.locator('.biology-score-ai').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/biology-score-full-explanation-desktop.png' });
  await page.setViewportSize({ width: 390, height: 1050 });
  await expect(thyroid).toHaveAttribute('open', '');
  await expect(thyroid.locator('.biology-score-ai-answer')).toContainText('Final detail remains readable.');
  await expect(thyroid.locator('.biology-score-ai-answer .chat-h2')).toHaveCount(3);
  const list = thyroid.locator('.biology-score-ai-answer ul');
  expect(await list.evaluate(el => parseFloat(getComputedStyle(el).paddingInlineStart))).toBeGreaterThanOrEqual(24);
  expect(await list.locator('li').first().evaluate(el => el.getBoundingClientRect().left - el.closest('.biology-score-ai').getBoundingClientRect().left)).toBeGreaterThan(32);
  const answer = thyroid.locator('.biology-score-ai-answer');
  expect(await answer.evaluate(el => getComputedStyle(el).webkitLineClamp)).toBe('none');
  await answer.evaluate(el => el.scrollIntoView({ block: 'end', behavior: 'instant' }));
  expect(await answer.evaluate(el => el.getBoundingClientRect().bottom <= innerHeight)).toBe(true);
  await page.screenshot({ path: '/tmp/biology-score-full-explanation-mobile.png' });
});

test('background telemetry does not discard AI and a real input edit preserves a labeled prior answer', async ({ page }) => {
  await prepareDemoProfile(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.biologyScoreAI = {};
    (await import('/js/biology-score-ai.js')).configureBiologyScoreAIDeps({
      hasAIProvider: () => true, isAIPaused: () => false,
      callClaudeAPI: async () => {
        state.importedData.wearableSummary = { metrics: { hrv_rmssd: { rolling: { d7: 41 } } } };
        return { text: JSON.stringify({ summary: 'Explanation survives an unrelated telemetry refresh.', explanation: '## Context\nBackground telemetry does not alter the marker evidence.' }) };
      },
    });
    (await import('/js/views.js')).navigate('biology-scores');
  });
  const card = page.locator('#biology-score-thyroidCoherence');
  const teaser = card.locator('[data-biology-score-ai-summary]');
  await teaser.locator('[data-biology-score-action="interpret-score-ai"]').click();
  await expect(teaser).toContainText('Explanation survives an unrelated telemetry refresh.');
  await expect(teaser).not.toContainText('refresh needed');
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    (await import('/js/biology-score-ai.js')).configureBiologyScoreAIDeps({ callClaudeAPI: async () => {
      state.importedData.entries.filter(entry => entry.markers?.['thyroid.tsh'] != null).forEach(entry => { entry.markers['thyroid.tsh'] = 14; });
      (await import('/js/data.js')).invalidateActiveDataCache();
      return { text: JSON.stringify({ summary: 'Saved explanation for the inputs at request time.', explanation: '## Context\nThis explanation reflects the original marker evidence.' }) };
    } });
  });
  await teaser.locator('[data-biology-score-action="interpret-score-ai"]').click();
  await expect(teaser).toContainText('Saved explanation for the inputs at request time.');
  await expect(teaser).toContainText('refresh needed');
  await expect(teaser.locator('.biology-score-ai-error')).toBeEmpty();
});


test('automatic shared insights survive reload and backups; refresh scopes stay explicit', async ({ page }) => {
  test.setTimeout(60000);
  // Exercise startup maintenance overlapping a slower device's first render.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await prepareDemoProfile(page);
  const calls = [];
  await page.exposeFunction('recordBiologyAIRequest', ids => calls.push(ids));
  const installProvider = async () => page.evaluate(async () => {
    (await import('/js/biology-score-ai.js')).configureBiologyScoreAIDeps({
      automaticEnabled: () => true, hasAIProvider: () => true, isAIPaused: () => false,
      callClaudeAPI: async request => {
        const ids = Object.keys(request.jsonSchema.properties);
        await globalThis.recordBiologyAIRequest(ids);
        const answer = { summary: 'The core markers show a mixed pattern. Read them with their collection dates. Additional tests may help clarify the result.', explanation: '## Main signal\nThe supplied core markers determine this score.\n\n## Context\nReview the collection dates and supporting markers.\n\n## Next check\nUse the suggested next check.' };
        return { text: JSON.stringify(ids.includes('summary') ? answer : Object.fromEntries(ids.map(id => [id, answer]))) };
      },
    });
  });
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { setProfileSex, setProfileDob } = await import('/js/profile.js');
    await setProfileSex(state.currentProfile, state.profileSex);
    await setProfileDob(state.currentProfile, state.profileDob);
    state.importedData.biologyScoreAI = {};
    // Persisted Light context used to make six scores look different on F5:
    // AI captured one fingerprint before the lazy rollup hooks were installed.
    state.importedData.sunDefaults = { completedAt: Date.now() };
    await (await import('/js/data.js')).saveImportedData();
  });
  await installProvider();
  await page.evaluate(async () => (await import('/js/views.js')).navigate('biology-scores'));
  const first = page.locator('#biology-score-metabolicFlexibility [data-biology-score-ai-summary]');
  await expect(first).toContainText('The core markers show a mixed pattern.');
  expect(calls).toHaveLength(1);
  expect(calls[0].length).toBeGreaterThan(10);
  const exported = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { buildFullBackupSnapshot, parseBackupSnapshot, serializeBackupSnapshot } = await import('/js/backup.js');
    const { buildClientExportObject } = await import('/js/export.js');
    const snapshot = parseBackupSnapshot(serializeBackupSnapshot(await buildFullBackupSnapshot()));
    const data = JSON.parse(snapshot.profiles.find(p => p.profileId === state.currentProfile).keys.imported);
    const json = await buildClientExportObject(state.currentProfile, false, false);
    state.importedData.biologyScoreAI = {};
    await (await import('/js/data.js')).saveImportedData();
    await (await import('/js/export-import.js')).importDataJSON(new File([JSON.stringify(json)], 'biology-roundtrip.json', { type: 'application/json' }));
    return { backup: data.biologyScoreAI, json: json.biologyScoreAI, restored: state.importedData.biologyScoreAI };
  });
  expect(exported.json).toEqual(exported.backup);
  expect(exported.restored).toEqual(exported.backup);
  expect(Object.keys(exported.json).length).toBeGreaterThan(10);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(async () => !!(await import('/js/state.js')).state.importedData.biologyScoreAI?.metabolicFlexibility?.summary);
  await installProvider();
  await page.evaluate(async () => {
    (await import('/js/views.js')).navigate('biology-scores');
    await (await import('/js/biology-scores.js')).loadBiologyScoreInsights();
  });
  await expect(first).toContainText('The core markers show a mixed pattern.');
  await expect(first).not.toContainText('refresh needed');
  await expect(page.locator('.biology-score-ai-teaser-label').filter({ hasText: 'refresh needed' })).toHaveCount(0);
  expect(calls).toHaveLength(1);
  await first.getByRole('button').click();
  await expect(first.getByRole('button')).toBeEnabled();
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual(['summary', 'explanation']);
  await page.locator('#biology-score-biologicalCoherence [data-biology-score-ai-summary] button').click();
  await expect(first.getByRole('button')).toBeEnabled();
  expect(calls).toHaveLength(3);
  expect(calls[2]).toEqual(calls[0]);
});

test('one refresh survives a harmless same-profile object replacement', async ({ page }) => {
  await prepareDemoProfile(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    (await import('/js/biology-score-ai.js')).configureBiologyScoreAIDeps({
      hasAIProvider: () => true, isAIPaused: () => false,
      callClaudeAPI: async () => {
        state.importedData = structuredClone(state.importedData);
        state.importedData.contextNotes = state.importedData.contextNotes || '';
        return { text: JSON.stringify({ summary: 'Saved on the first refresh. The same marker evidence still applies.', explanation: '## Main signal\nThis interpretation survives same-profile hydration.' }) };
      },
    });
    (await import('/js/views.js')).navigate('biology-scores');
  });
  const teaser = page.locator('#biology-score-metabolicFlexibility [data-biology-score-ai-summary]');
  await teaser.getByRole('button').click();
  await expect(teaser).toContainText('Saved on the first refresh.');
  await expect(teaser).not.toContainText('refresh needed');
  await expect(teaser.locator('.biology-score-ai-error')).toBeEmpty();
});

test('processing uses shared gray dots, preserves saved text, and survives navigation', async ({ page }) => {
  await prepareDemoProfile(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.biologyScoreAI = {};
    (await import('/js/biology-score-ai.js')).configureBiologyScoreAIDeps({
      hasAIProvider: () => true, isAIPaused: () => false,
      callClaudeAPI: request => new Promise((resolve, reject) => {
        const answer = { summary: 'The markers broadly agree. Review their collection dates.', explanation: '## Main signal\nThe core markers provide the main signal.\n\n## Context\nThese are saved details.' };
        globalThis.finishBiologyProcessing = fail => {
          if (fail) { reject(new Error('Synthetic connection lost. Retry.')); return; }
          const ids = Object.keys(request.jsonSchema.properties);
          resolve({ text: JSON.stringify(ids.includes('summary') ? answer : Object.fromEntries(ids.map(id => [id, answer]))) });
        };
      }),
    });
    (await import('/js/views.js')).navigate('biology-scores');
    (await import('/js/utils.js')).dismissAnalyticsConsent();
  });
  const card = page.locator('#biology-score-thyroidCoherence');
  const teaser = card.locator('[data-biology-score-ai-summary]');
  const number = await card.locator('.biology-score-dial-number').textContent();
  await expect(page.locator('.biology-score-ai-teaser-label')).not.toContainText(['AI insight']);
  const originalLabel = await teaser.getByRole('button').textContent();
  await teaser.getByRole('button').click();
  await expect(teaser).toHaveAttribute('aria-busy', 'true');
  await expect(teaser.getByRole('button')).toHaveText(originalLabel);
  await expect(teaser.getByRole('button')).toBeDisabled();
  await expect(teaser.locator('.biology-score-ai-teaser-label')).toHaveText('Assessing');
  const dot = teaser.locator('.ctx-health-dot-shimmer');
  await page.addStyleTag({ url: '/css/context-profile.css' });
  const contextGradient = await page.evaluate(() => {
    const reference = document.createElement('span');
    reference.className = 'ctx-health-dot ctx-health-dot-green ctx-health-dot-shimmer';
    document.body.append(reference);
    const gradient = getComputedStyle(reference).backgroundImage;
    reference.remove();
    return gradient;
  });
  expect(await dot.evaluate(el => getComputedStyle(el).backgroundImage)).toBe(contextGradient);
  expect(await dot.evaluate(el => getComputedStyle(el).boxShadow)).toBe('none');
  expect(await dot.evaluate(el => getComputedStyle(el).animationName)).toBe('shimmer');
  expect(await dot.evaluate(el => getComputedStyle(el).backgroundImage)).toContain('linear-gradient');
  await expect(teaser.locator('.biology-score-ai-skeleton > span')).toHaveCount(3);
  await card.locator(':scope > .biology-score-summary').click();
  await expect(card.locator('.biology-score-ai')).toHaveAttribute('aria-busy', 'true');
  await expect(card.locator('.biology-score-ai-processing')).toContainText('Assessing markers');
  await page.evaluate(async () => (await import('/js/views.js')).navigate('biology-scores'));
  await expect(teaser).toHaveAttribute('aria-busy', 'true');
  await teaser.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/biology-processing-desktop.png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await dot.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await page.evaluate(() => globalThis.finishBiologyProcessing(false));
  await expect(teaser).toHaveAttribute('aria-busy', 'false');
  await expect(teaser).toContainText('The markers broadly agree.');
  await expect(teaser.locator('.biology-score-ai-teaser-label')).toBeEmpty();
  await expect(teaser.locator('.ctx-health-dot-shimmer')).toHaveCount(0);
  await expect(card.locator('.biology-score-dial-number')).toHaveText(number);
  await teaser.getByRole('button').click();
  await expect(teaser).toContainText('The markers broadly agree.');
  await expect(teaser.getByRole('button')).toHaveText('Refresh');
  await expect(card.locator('.biology-score-ai-answer')).toContainText('These are saved details.');
  await page.evaluate(() => globalThis.finishBiologyProcessing(true));
  await expect(teaser).toHaveAttribute('aria-busy', 'false');
  await expect(teaser.locator('.biology-score-ai-error')).toContainText('Synthetic connection lost');
  await expect(teaser.getByRole('button')).toBeEnabled();
  await expect(teaser).toContainText('The markers broadly agree.');
  const overview = page.locator('#biology-score-biologicalCoherence [data-biology-score-ai-summary]');
  await overview.getByRole('button').click();
  await expect(overview).toHaveAttribute('aria-busy', 'true');
  expect(await page.locator('[data-biology-score-ai-summary][aria-busy="true"]').count()).toBeGreaterThan(10);
  await page.setViewportSize({ width: 390, height: 900 });
  await overview.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/biology-processing-mobile.png' });
  await page.evaluate(() => globalThis.finishBiologyProcessing(false));
  await expect(page.locator('[data-biology-score-ai-summary][aria-busy="true"]')).toHaveCount(0);
});


test('delayed Light hydration reuses all six saved insights and a single refresh stays current', async ({ page }) => {
  await prepareDemoProfile(page);
  const calls = [];
  await page.exposeFunction('recordLightBiologyRequest', ids => calls.push(ids));
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { getActiveData } = await import('/js/data.js');
    const { configureBiologyScoresRuntimeDeps, prepareBiologyScoresContext } = await import('/js/biology-scores-runtime.js');
    const { configureProfileContextLightDeps } = await import('/js/profile-context.js');
    const { computeBiologyScores } = await import('/js/biology-scores.js');
    const { getScoreAIMaterialKey } = await import('/js/biology-score-sections.js');
    await prepareBiologyScoresContext();
    state.importedData.sunSessions = [{ endedAt: Date.now() }];
    configureProfileContextLightDeps({ rollingVitaminDIU: () => 1800, rollingChannelTotals: () => ({ circadian: 250 }) });
    state.importedData.biologyScoreAI = Object.fromEntries(computeBiologyScores(getActiveData()).map(score => [score.id, {
      summary: 'Saved insight remains useful. Review the collection dates.', text: '## Context\nThe saved marker evidence is unchanged.',
      materialFingerprint: getScoreAIMaterialKey(score), updatedAt: Date.now(),
    }]));
    // These represent previously saved answers, including their durable snapshot.
    await (await import('/js/data.js')).saveImportedData();
    // Warm saved context, followed by a cold page before its async hooks arrive.
    configureProfileContextLightDeps({ rollingVitaminDIU: null, rollingChannelTotals: null });
    const ready = new Promise(resolve => { globalThis.finishLightHydration = () => {
      configureProfileContextLightDeps({ rollingVitaminDIU: () => 1801, rollingChannelTotals: () => ({ circadian: 250 }) });
      resolve();
    }; });
    configureBiologyScoresRuntimeDeps({ prepareContext: () => ready });
    (await import('/js/biology-score-ai.js')).configureBiologyScoreAIDeps({
      automaticEnabled: () => true, hasAIProvider: () => true, isAIPaused: () => false,
      callClaudeAPI: async request => {
        await globalThis.recordLightBiologyRequest(Object.keys(request.jsonSchema.properties));
        // Live estimate drifts while the explanation is being produced.
        configureProfileContextLightDeps({ rollingVitaminDIU: () => 1802 });
        return { text: JSON.stringify({ summary: 'Fresh interpretation saved once. The marker evidence is unchanged.', explanation: '## Context\nSmall dose-estimate changes do not change the interpretation.' }) };
      },
    });
    (await import('/js/views.js')).navigate('biology-scores');
    const { loadBiologyScoreInsights } = await import('/js/biology-scores.js');
    globalThis.biologyReadyCheck = Promise.all([loadBiologyScoreInsights(), loadBiologyScoreInsights()]);
  });
  // Longer than all three reconciliation timers: readiness, not timing, wins.
  await page.waitForTimeout(1200);
  expect(calls).toHaveLength(0);
  await page.evaluate(async () => { globalThis.finishLightHydration(); await globalThis.biologyReadyCheck; });
  const affected = ['cardiovascularLipoprotein', 'redoxStress', 'anabolicRecoverySignal', 'hormoneAxis', 'stressResilience', 'boneMineralSignal'];
  for (const id of affected) {
    const teaser = page.locator(`[data-biology-score-ai-summary="${id}"]`);
    await expect(teaser).toContainText('Saved insight remains useful.');
    await expect(teaser).not.toContainText('refresh needed');
  }
  expect(calls).toHaveLength(0);
  const cardiovascular = page.locator('[data-biology-score-ai-summary="cardiovascularLipoprotein"]');
  await page.evaluate(async () => {
    const { configureProfileContextLightDeps } = await import('/js/profile-context.js');
    configureProfileContextLightDeps({ rollingVitaminDIU: null, rollingChannelTotals: null });
    const ready = new Promise(resolve => { globalThis.finishSingleLightHydration = () => {
      configureProfileContextLightDeps({ rollingVitaminDIU: () => 1801, rollingChannelTotals: () => ({ circadian: 250 }) });
      resolve();
    }; });
    (await import('/js/biology-scores-runtime.js')).configureBiologyScoresRuntimeDeps({ prepareContext: () => ready });
  });
  await cardiovascular.getByRole('button').click();
  expect(calls).toHaveLength(0);
  await page.evaluate(() => globalThis.finishSingleLightHydration());
  await expect(cardiovascular).toContainText('Fresh interpretation saved once.');
  await expect(cardiovascular).not.toContainText('refresh needed');
  await page.evaluate(async () => (await import('/js/biology-scores.js')).loadBiologyScoreInsights());
  expect(calls).toEqual([['summary', 'explanation']]);
});


for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`whole feature reading and marker navigation at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize(viewport);
    await prepareDemoProfile(page);
    await page.evaluate(async () => {
      const { state } = await import('/js/state.js');
      const { getActiveData } = await import('/js/data.js');
      const { computeBiologyScores } = await import('/js/biology-scores.js');
      const { getScoreAIMaterialKey } = await import('/js/biology-score-sections.js');
      // Synthetic saved responses exercise the reading layout without AI calls.
      state.importedData.biologyScoreAI = Object.fromEntries(computeBiologyScores(getActiveData()).map(score => [score.id, {
        summary: 'Results show a mix of range fits. Check the markers driving this score and their collection context before deciding what to repeat.',
        text: '## Main signal\nThe score compares your core markers with the selected ranges. A high overall fit can still accompany an individual result worth reviewing.\n\n## Context\n- **Collection timing:** Check whether results come from the same draw.\n- **Additional markers:** These support interpretation without changing the core score.\n\n## Next check\nOpen the marker results below and confirm missing collection details before planning another test.',
        materialFingerprint: getScoreAIMaterialKey(score), updatedAt: Date.now(),
      }]));
      (await import('/js/utils.js')).dismissAnalyticsConsent();
      (await import('/js/views.js')).navigate('biology-scores');
    });
    const main = page.locator('#main-content');
    await expect(main).toContainText('Higher scores mean closer agreement');
    await expect(page.locator('.biology-score-compact')).toHaveCount(18);
    const domains = page.locator('.biology-coherence-visual .biology-coherence-domain-row');
    await expect(domains).toHaveCount(12);
    for (const domain of await domains.all()) await expect(domain).toBeVisible();
    await page.screenshot({ path: `/tmp/biology-audit-${viewport.width}-overview.png` });
    for (const [name, selector] of [
      ['context', '.biology-context-review-details'], ['contributors', '#biology-score-membership'],
      ['overview-method', '.biology-coherence-breakdown'], ['overview-insight', '.biology-coherence-interpretation'],
    ]) {
      const panel = page.locator(selector);
      await panel.locator(':scope > summary').click();
      await panel.screenshot({ path: `/tmp/biology-audit-${viewport.width}-${name}.png` });
      await panel.locator(':scope > summary').click();
    }
    await page.locator('.biology-planning-grid').screenshot({ path: `/tmp/biology-audit-${viewport.width}-planning.png` });
    await page.locator('[data-biology-group=baseline] > h3').evaluate(el => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); });
    await page.screenshot({ path: `/tmp/biology-audit-${viewport.width}-cards.png` });
    const waiting = page.locator('.biology-score-unavailable-group');
    if (await waiting.count()) await waiting.locator(':scope > summary').click();
    const ids = await page.locator('.biology-score-compact').evaluateAll(cards => cards.map(card => card.id));
    for (const id of ids) {
      const card = page.locator(`#${id}`);
      await card.locator(':scope > .biology-score-summary').click();
      await expect(card).toHaveAttribute('open', '');
      await expect(card.locator('.biology-score-marker-section')).toHaveCount(2);
      const method = card.locator('.biology-score-methodology');
      await method.locator(':scope > summary').click();
      await expect(method.locator('.biology-reading-lead')).not.toBeEmpty();
      await expect(method.locator('a')).toHaveAttribute('href', /^https:\/\//);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const overflow = await card.locator('.biology-reading-body').evaluate(el => el.scrollWidth > el.clientWidth + 1);
      expect(overflow).toBe(false);
      await method.locator(':scope > summary').click();
    }
    await page.locator('.biology-score-compact[open] > .biology-score-summary').click();
    await page.locator('[data-biology-group=advanced] > h3').evaluate(el => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); });
    await page.screenshot({ path: `/tmp/biology-audit-${viewport.width}-optional.png` });
    const first = page.locator('#biology-score-metabolicFlexibility');
    await first.locator(':scope > .biology-score-summary').click();
    await first.locator('.biology-score-ai-details').screenshot({ path: `/tmp/biology-audit-${viewport.width}-insight.png` });
    await first.locator('.biology-score-marker-section').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/biology-audit-${viewport.width}-markers.png` });
    await first.locator('.biology-score-marker-link').first().click();
    await expect(page.locator('#detail-modal')).toBeVisible();
  });
}

test('context review failure restores its button and can be retried without moving the score cards', async ({ page }) => {
  await prepareDemoProfile(page);
  await page.evaluate(async () => {
    (await import('/js/biology-score-context-ai.js')).configureBiologyScoreContextAIDeps({
      hasAIProvider: () => true, isAIPaused: () => false,
      callClaudeAPI: async () => { throw new Error('Synthetic gateway unavailable'); },
    });
    (await import('/js/views.js')).navigate('biology-scores');
  });
  await page.locator('.biology-context-review-details > summary').click();
  const button = page.locator('[data-biology-score-action="analyze-context-ai"]');
  const label = await button.textContent();
  await button.click();
  await expect(button).toBeEnabled();
  await expect(button).toHaveText(label);
  await expect(page.locator('.biology-score-compact')).toHaveCount(18);
});


test.describe('Touch Biology Scores', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('touch controls remain reachable without hiding overview domains', async ({ page }) => {
    await prepareDemoProfile(page);
    await page.evaluate(async () => (await import('/js/views.js')).navigate('biology-scores'));
    const targets = page.locator('.biology-coherence-visual .biology-coherence-domain-row, #biology-score-metabolicFlexibility .biology-score-ai-teaser-action');
    for (const target of await targets.all()) {
      await expect(target).toBeVisible();
      expect((await target.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    await page.locator('#biology-score-metabolicFlexibility > .biology-score-summary').tap();
    await expect(page.locator('#biology-score-metabolicFlexibility')).toHaveAttribute('open', '');
  });
});

test('numeric-only overviews keep coverage actionable and optional cards reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await prepareDemoProfile(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    // Remove an entire core panel without changing unrelated markers.
    for (const entry of state.importedData.entries) {
      for (const key of Object.keys(entry.markers || {})) if (key.startsWith('thyroid.')) delete entry.markers[key];
    }
    (await import('/js/data.js')).invalidateActiveDataCache();
    (await import('/js/utils.js')).dismissAnalyticsConsent();
    (await import('/js/views.js')).navigate('biology-scores');
  });
  await page.evaluate(async () => (await import('/js/views.js')).navigate('dashboard'));
  const dashboardOverview = page.locator('.db-bio-coherence-hero');
  await expect(dashboardOverview.locator('.bc-micro-domain')).toHaveCount(11);
  await expect(dashboardOverview.locator('.bc-micro-domain[data-biology-score-id=thyroidCoherence]')).toHaveCount(0);
  await expect(dashboardOverview.locator('.biology-coherence-coverage-link')).toHaveCount(0);
  await dashboardOverview.locator('.db-hero-biology-score').click();
  await expect(page.locator('#biology-score-membership')).toBeVisible();
  const waiting = page.locator('.biology-score-unavailable-group');
  await expect(waiting).not.toHaveAttribute('open', '');
  await expect(waiting.locator('#biology-score-thyroidCoherence > .biology-score-summary')).not.toBeVisible();
  const domains = page.locator('.biology-coherence-domains .biology-coherence-domain-row');
  await expect(domains).toHaveCount(11);
  await expect(page.locator('.biology-coherence-domain-row[data-biology-score-id=thyroidCoherence]')).toHaveCount(0);
  await page.locator('#biology-score-membership > summary').click();
  await expect(page.locator('#biology-score-membership')).toHaveAttribute('open', '');
  await page.locator('#biology-score-membership [data-biology-score-id=thyroidCoherence]').click();
  await expect(waiting).toHaveAttribute('open', '');
  await expect(waiting.locator('#biology-score-thyroidCoherence')).toHaveAttribute('open', '');
  await expect(waiting.locator('#biology-score-thyroidCoherence .biology-score-marker-section').first()).toBeVisible();
  const baseline = page.locator('[data-biology-group=baseline]');
  const original = await baseline.locator('.biology-score-compact').evaluateAll(cards => cards.map(c => c.id));
  const first = baseline.locator('.biology-score-compact').first();
  await first.locator(':scope > .biology-score-summary').click();
  await first.getByRole('button', { name: 'Move page section down' }).click();
  await expect(baseline.locator('.biology-score-compact').nth(1)).toHaveAttribute('id', original[0]);
  await page.evaluate(async () => (await import('/js/views.js')).navigate('biology-scores'));
  await expect(baseline.locator('.biology-score-compact').nth(1)).toHaveAttribute('id', original[0]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#biology-score-membership > summary').click();
  await expect(page.locator('#biology-score-membership')).toHaveAttribute('open', '');
  await page.locator('#biology-score-membership [data-biology-score-id=thyroidCoherence]').click();
  await expect(waiting.locator('#biology-score-thyroidCoherence > .biology-score-summary')).toBeVisible();
  await expect(page.locator('[data-biology-group=advanced] > h3')).toContainText('Optional scores');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: '/tmp/biology-grouped-mobile.png' });
});

test('dashboard biology widgets share the age-style layout without duplicate metadata on desktop and mobile', async ({ page }) => {
  await prepareDemoProfile(page);
  await page.evaluate(async () => {
    (await import('/js/utils.js')).dismissAnalyticsConsent();
    (await import('/js/views.js')).navigate('dashboard');
  });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const id of ['biology-score-biologicalCoherence', 'biology-score-metabolicFlexibility']) {
      const widget = page.locator(`[data-widget-id="${id}"]`).first();
      await expect(widget.locator('.db-hero-biology-score')).toBeVisible();
      await expect(widget.locator('.db-hero-bio-num')).toContainText('/100');
      await expect(widget.locator('.biology-score-meta, .db-bio-coherence-ring, .dashboard-widget-description')).toHaveCount(0);
      expect(await widget.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      const edges = await widget.evaluate(el => ({ card: el.getBoundingClientRect().left, number: el.querySelector('.db-hero-bio-num').getBoundingClientRect().left }));
      expect(edges.number).toBeGreaterThanOrEqual(edges.card + 8);
      for (const domain of await widget.locator('.bc-micro-domain').all()) await expect(domain).toBeVisible();
      await widget.screenshot({ path: `/tmp/${id}-${width}-aligned.png` });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});

test('bounded comparison assessment survives range switching, reload and JSON restore without extra AI calls', async ({ page }) => {
  test.setTimeout(60000);
  await prepareDemoProfile(page);
  const calls = [];
  await page.exposeFunction('recordVariantRequest', ids => calls.push(ids));
  const install = async (hold = false) => page.evaluate(async hold => {
    let count = 0;
    (await import('/js/biology-score-ai.js')).configureBiologyScoreAIDeps({
      automaticEnabled: () => true, hasAIProvider: () => true, isAIPaused: () => false,
      callClaudeAPI: async request => {
        if (`User request:\n${request.messages[0].content}`.length > 100000) throw new Error('invalid prompt');
        const ids = Object.keys(request.jsonSchema.properties);
        await globalThis.recordVariantRequest(ids);
        count++;
        if (hold && count === 1) await new Promise(resolve => { globalThis.finishVariantWarmup = resolve; });
        const answer = { summary: `Saved interpretation from pass ${count}. Check the collection context.`, explanation: '## Main signal\nThese results use the ranges supplied for this view.\n\n## Context\nCollection dates can affect this pattern.\n\n## Next check\nReview the core markers.' };
        return { text: JSON.stringify(ids.includes('summary') ? answer : Object.fromEntries(ids.map(id => [id, answer]))) };
      },
    });
  }, hold);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { setProfileSex, setProfileDob } = await import('/js/profile.js');
    await setProfileSex(state.currentProfile, state.profileSex);
    await setProfileDob(state.currentProfile, state.profileDob);
    state.rangeMode = 'optimal'; state.dateRangeFilter = 'all'; state.importedData.biologyScoreAI = {};
    // Keep context stable: old demo Sun sessions otherwise rehydrate their
    // dose model after reload, which is a genuine evidence change.
    state.importedData.sunSessions = []; state.importedData.deviceSessions = [];
    state.importedData.sunDefaults = { completedAt: Date.now() };
    // A real date-window difference, alongside panels whose evidence is identical.
    for (const entry of state.importedData.entries) delete entry.markers?.['coagulation.homocysteine'];
    state.importedData.entries.push({ date: '2026-01-15', file: null, markers: { 'coagulation.homocysteine': 12 } });
    await (await import('/js/data.js')).saveImportedData();
  });
  await install(true);
  await page.evaluate(async () => (await import('/js/views.js')).navigate('biology-scores'));
  const teaser = page.locator('[data-biology-score-ai-summary=redoxStress]');
  await page.waitForFunction(() => typeof globalThis.finishVariantWarmup === 'function');
  // Both modes belong to the same in-flight assessment.
  await expect(teaser).toHaveAttribute('aria-busy', 'true');
  await expect(teaser).not.toContainText('refresh needed');
  await page.evaluate(async () => {
    (await import('/js/state.js')).state.rangeMode = 'reference';
    (await import('/js/views.js')).navigate('biology-scores');
  });
  await expect(teaser).toHaveAttribute('aria-busy', 'true');
  await page.evaluate(async () => {
    (await import('/js/state.js')).state.rangeMode = 'optimal';
    (await import('/js/views.js')).navigate('biology-scores');
  });
  await expect(teaser).toHaveAttribute('aria-busy', 'true');
  await page.evaluate(async () => {
    globalThis.finishVariantWarmup();
    await (await import('/js/biology-scores.js')).loadBiologyScoreInsights();
  });
  const warmedCalls = calls.length;
  // This multi-window fixture needs two bounded groups. Each score is assessed
  // once; its explanation remains shared across all date/range views.
  expect(warmedCalls).toBe(2);
  expect(new Set(calls.flat()).size).toBe(calls.flat().length);
  const checkViews = async () => page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { getActiveData, filterDatesByRange } = await import('/js/data.js');
    const { computeBiologyScores, loadBiologyScoreInsights } = await import('/js/biology-scores.js');
    const { scoreAIAnswerNeedsRefresh, readScoreAIAnswer } = await import('/js/biology-score-sections.js');
    const results = [];
    for (const rangeMode of ['optimal', 'reference', 'both']) for (const dateRangeFilter of ['all', '1y', '6m', '3m']) {
      state.rangeMode = rangeMode; state.dateRangeFilter = dateRangeFilter;
      (await import('/js/views.js')).navigate('biology-scores');
      await loadBiologyScoreInsights();
      const scores = computeBiologyScores(filterDatesByRange(getActiveData()));
      results.push({ rangeMode, dateRangeFilter, stale: scores.filter(s => (s.historicalSnapshot || s).available.length && scoreAIAnswerNeedsRefresh(s)).map(s => s.id), summary: readScoreAIAnswer(scores.find(s => s.id === 'redoxStress'))?.summary });
    }
    return results;
  });
  const before = await checkViews();
  expect(before.every(view => view.stale.length === 0)).toBe(true);
  expect(new Set(before.map(view => view.summary)).size).toBe(1);
  expect(calls).toHaveLength(warmedCalls);
  const restored = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const exported = await (await import('/js/export.js')).buildClientExportObject(state.currentProfile, false, false);
    state.importedData.biologyScoreAI = {};
    await (await import('/js/data.js')).saveImportedData();
    await (await import('/js/export-import.js')).importDataJSON(new File([JSON.stringify(exported)], 'biology-views.json', { type: 'application/json' }));
    return JSON.stringify(state.importedData.biologyScoreAI) === JSON.stringify(exported.biologyScoreAI);
  });
  expect(restored).toBe(true);
  await page.evaluate(async () => (await import('/js/biology-scores.js')).loadBiologyScoreInsights());
  expect(calls).toHaveLength(warmedCalls);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(async () => !!(await import('/js/state.js')).state.importedData.biologyScoreAI?.redoxStress?.coveredMaterials?.length);
  await install();
  expect(await checkViews()).toEqual(before);
  expect(calls).toHaveLength(warmedCalls);
  await teaser.getByRole('button').click();
  await expect(teaser.getByRole('button')).toBeEnabled();
  await page.evaluate(async () => (await import('/js/biology-scores.js')).loadBiologyScoreInsights());
  expect(calls).toHaveLength(warmedCalls + 1);
  expect(calls.at(-1)).toEqual(['summary', 'explanation']);
});

test('legacy Optimal explanations never trigger a paid upgrade when Reference is selected', async ({ page }) => {
  await prepareDemoProfile(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.rangeMode = 'optimal'; state.dateRangeFilter = 'all';
    state.importedData.sunSessions = []; state.importedData.deviceSessions = [];
    state.importedData.sunDefaults = { completedAt: Date.now() };
    await (await import('/js/biology-scores-runtime.js')).prepareBiologyScoresContext();
    const { computeBiologyScores } = await import('/js/biology-scores.js');
    const { getScoreAIMaterialKey } = await import('/js/biology-score-sections.js');
    const { getActiveData } = await import('/js/data.js');
    state.importedData.biologyScoreAI = Object.fromEntries(computeBiologyScores(getActiveData()).map(score => [score.id, {
      summary: 'Existing Optimal interpretation.', text: 'This saved explanation used optimal ranges.', materialFingerprint: getScoreAIMaterialKey(score), updatedAt: Date.now(),
    }]));
    globalThis.legacyUpgradeCalls = 0;
    (await import('/js/biology-score-ai.js')).configureBiologyScoreAIDeps({
      automaticEnabled: () => true, hasAIProvider: () => true, isAIPaused: () => false,
      callClaudeAPI: async () => { globalThis.legacyUpgradeCalls++; throw new Error('No automatic legacy upgrade permitted'); },
    });
    (await import('/js/utils.js')).dismissAnalyticsConsent();
    (await import('/js/views.js')).navigate('biology-scores');
    await (await import('/js/biology-scores.js')).loadBiologyScoreInsights();
  });
  for (const mode of ['reference', 'both', 'optimal']) {
    await page.locator(`.range-toggle-btn[data-range="${mode}"]`).first().click();
    await page.evaluate(async () => (await import('/js/biology-scores.js')).loadBiologyScoreInsights());
    await expect(page.locator('[data-biology-score-ai-summary=redoxStress]')).toContainText('Existing Optimal interpretation.');
    await expect(page.locator('[data-biology-score-ai-summary][aria-busy=true]')).toHaveCount(0);
  }
  expect(await page.evaluate(() => globalThis.legacyUpgradeCalls)).toBe(0);
});

test('large comparison profiles refresh in bounded groups and reuse saved answers after reload', async ({ page }) => {
  test.setTimeout(60000);
  await prepareDemoProfile(page);
  const requests = [];
  await page.exposeFunction('recordBoundedRequest', request => requests.push(request));
  const install = async () => page.evaluate(async () => {
    (await import('/js/biology-score-ai.js')).configureBiologyScoreAIDeps({
      automaticEnabled: () => true, hasAIProvider: () => true, isAIPaused: () => false,
      callClaudeAPI: async options => {
        const chars = `User request:\n${options.messages[0].content}`.length;
        const ids = Object.keys(options.jsonSchema.properties);
        await globalThis.recordBoundedRequest({ chars, ids });
        if (chars > 100000) throw new Error('invalid prompt');
        const answer = { summary: 'Saved complete comparison. Review collection dates.', explanation: '## Main signal\nThese markers describe a range pattern.\n## Context\nDates and ranges differ.\n## Next check\nReview your core panel.' };
        return { text: JSON.stringify(Object.fromEntries(ids.map(id => [id, answer]))) };
      },
    });
  });
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { setProfileSex, setProfileDob } = await import('/js/profile.js');
    await setProfileSex(state.currentProfile, state.profileSex); await setProfileDob(state.currentProfile, state.profileDob);
    const latest = {};
    for (const entry of state.importedData.entries) Object.assign(latest, entry.markers);
    const entries = ['2025-12-01', '2026-03-01', '2026-07-01'].map(date => ({ date, markers: {}, sampleTime: '08:00', fasting: true }));
    Object.entries(latest).forEach(([key, value], index) => { entries[index % 3].markers[key] = value; });
    state.importedData.entries = entries; state.importedData.biologyScoreAI = {};
    state.importedData.sunSessions = []; state.importedData.deviceSessions = []; state.importedData.sunDefaults = { completedAt: Date.now() };
    state.rangeMode = 'optimal'; state.dateRangeFilter = 'all';
    await (await import('/js/data.js')).saveImportedData();
  });
  await install();
  await page.evaluate(async () => { (await import('/js/views.js')).navigate('biology-scores'); await (await import('/js/biology-scores.js')).loadBiologyScoreInsights(); });
  expect(requests.length).toBeGreaterThan(1); expect(requests.length).toBeLessThan(19);
  expect(requests.every(r => r.chars < 100000)).toBe(true);
  const ids = requests.flatMap(r => r.ids); expect(new Set(ids).size).toBe(ids.length);
  await expect(page.locator('.biology-score-ai-error').filter({ hasText: /invalid prompt|could not/ })).toHaveCount(0);
  const count = requests.length;
  for (const rangeMode of ['reference', 'optimal']) await page.evaluate(async rangeMode => {
    (await import('/js/state.js')).state.rangeMode = rangeMode;
    (await import('/js/views.js')).navigate('biology-scores'); await (await import('/js/biology-scores.js')).loadBiologyScoreInsights();
  }, rangeMode);
  expect(requests).toHaveLength(count);
  await page.reload(); await prepareDemoProfile(page); await install();
  await page.evaluate(async () => { (await import('/js/views.js')).navigate('biology-scores'); await (await import('/js/biology-scores.js')).loadBiologyScoreInsights(); });
  expect(requests).toHaveLength(count);
  await expect(page.locator('[data-biology-score-ai-summary=redoxStress]')).toContainText('Saved complete comparison.');
  await expect(page.locator('[data-biology-score-ai-summary][aria-busy=true]')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/biology-prompt-fix.png' });
});
