import { expect, test } from './coverage-fixture.js';

async function pageClick(page, selectorOrFn) {
  await page.evaluate((arg) => {
    const overlayIds = ['tour-overlay', 'tour-tooltip', 'analytics-consent-banner'];
    overlayIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    let el;
    if (typeof arg === 'string') {
      el = document.querySelector(arg);
    } else if (arg.selector) {
      el = document.querySelector(arg.selector);
    } else if (arg.text) {
      el = Array.from(document.querySelectorAll(arg.tag || '*')).find(node => node.textContent?.includes(arg.text));
    }
    if (!el) throw new Error(`Click target not found: ${JSON.stringify(arg)}`);
    el.click();
  }, selectorOrFn);
}

async function loadDemoProfile(page) {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.navigate === 'function' && typeof window.getActiveProfileId === 'function');
  const profileId = await page.evaluate(() => window.getActiveProfileId?.() || localStorage.getItem('labcharts-active-profile') || 'default');
  await page.evaluate(({ profileId }) => {
    localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');
    localStorage.setItem(`labcharts-${profileId}-dashboardWidgetsV12`, JSON.stringify({
      visible: ['biology-score-biologicalCoherence', 'biology-score-metabolicFlexibility'],
      hidden: [],
    }));
  }, { profileId });

  await pageClick(page, { text: 'Alex, 38', tag: 'button' });
  await page.waitForFunction(() => document.querySelector('[data-widget-id="biology-score-biologicalCoherence"]'));
}

test('dashboard renders Biological Coherence hero and domain rows', async ({ page }) => {
  await loadDemoProfile(page);

  const hero = page.locator('[data-widget-id="biology-score-biologicalCoherence"]').first();
  await expect(hero).toBeVisible();
  await expect(hero.locator('.db-bio-coherence-hero')).toBeVisible();
  await expect(hero.locator('.db-bio-coherence-ring')).toBeVisible();
  await expect(hero.locator('.db-bio-coherence-number')).toContainText('/100');

  const domainRows = hero.locator('.bc-micro-domain');
  await expect(domainRows).toHaveCount(8);

  const firstRow = domainRows.first();
  await expect(firstRow).toHaveAttribute('data-biology-score-action', 'jump-to-domain');
  await expect(firstRow).toHaveAttribute('data-biology-score-id', /.+/);
});

test('dashboard coherence domain row navigates to Biology Scores lens and scrolls to score', async ({ page }) => {
  await loadDemoProfile(page);

  const hero = page.locator('[data-widget-id="biology-score-biologicalCoherence"]').first();
  const domainRow = hero.locator('.bc-micro-domain[data-biology-score-id]').first();
  const targetScoreId = await domainRow.getAttribute('data-biology-score-id');

  await pageClick(page, '.bc-micro-domain[data-biology-score-id]');
  await page.waitForFunction(() => document.body.classList.contains('biology-scores-page'));

  const targetCard = page.locator(`#biology-score-${targetScoreId}`).first();
  await expect(targetCard).toBeVisible();
});

test('dashboard individual biology score widget is clickable and navigates to its score', async ({ page }) => {
  await loadDemoProfile(page);

  const widget = page.locator('[data-widget-id="biology-score-metabolicFlexibility"]').first();
  await expect(widget).toBeVisible();
  await expect(widget.locator('.db-hero-bio-bar-track')).toBeVisible();
  await expect(widget.locator('.db-hero-bio-bar-pin')).toBeVisible();

  await pageClick(page, '[data-widget-id="biology-score-metabolicFlexibility"] [data-biology-score-action="jump-to-domain"]');
  await page.waitForFunction(() => document.body.classList.contains('biology-scores-page'));
  await expect(page.locator('#biology-score-metabolicFlexibility').first()).toBeVisible();
});

test('Biology Scores lens renders coherence hero with dashboard toggle and score cards', async ({ page }) => {
  await loadDemoProfile(page);
  await page.evaluate(() => {
    window.navigate?.('biology-scores');
  });
  await page.waitForFunction(() => document.body.classList.contains('biology-scores-page'));

  const hero = page.locator('.biology-coherence-hero').first();
  await expect(hero).toBeVisible();
  await expect(hero.locator('[data-lens-page-action]')).toBeVisible();

  const scoreCards = page.locator('.biology-score-detail-stack .biology-score-card');
  await expect(scoreCards.first()).toBeVisible();
});
