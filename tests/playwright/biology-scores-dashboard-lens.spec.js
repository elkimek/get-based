import { expect, test } from './coverage-fixture.js';

async function bypassOverlays(page) {
  await page.evaluate(() => {
    const ids = ['tour-overlay', 'tour-tooltip', 'analytics-consent-banner'];
    ids.forEach(id => document.getElementById(id)?.remove());
  });
}

test('dashboard renders Biological Coherence hero and domain rows', async ({ page }) => {
  await page.goto('/app#dashboard?demo=alex', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.navigate === 'function');
  await bypassOverlays(page);

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

test('Biology Scores lens renders coherence hero with score cards and dashboard toggle', async ({ page }) => {
  await page.goto('/app#biology-scores?demo=alex', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.navigate === 'function');
  await bypassOverlays(page);

  const hero = page.locator('[class*="biology-coherence-hero"]').first();
  await expect(hero).toBeVisible();

  // Dashboard toggle should be present in the lens hero
  await expect(hero.locator('[data-lens-page-action]')).toBeVisible();

  // Score detail cards should be present
  const scoreCards = page.locator('[class*="biology-score-card"]').first();
  await expect(scoreCards).toBeVisible();

  // Each card should have a section with the score rail and a disclosure
  const firstCard = page.locator('[class*="biology-score-card"]').first();
  await expect(firstCard.locator('[class*="biology-score-rail"]')).toBeVisible();
  await expect(firstCard.locator('details')).toBeVisible();
});
