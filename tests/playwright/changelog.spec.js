import { expect, test } from './coverage-fixture.js';

const SHOW_CLASS_TOKEN = /(^|\s)show(\s|$)/;

test('changelog modal opens, closes, and marks the current version as seen', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const overlay = page.locator('#changelog-modal-overlay');
  const modal = page.locator('#changelog-modal');
  await expect(overlay).toHaveCount(1);
  await expect(modal).toHaveCount(1);

  await page.evaluate(async () => {
    const { openChangelog } = await import('/js/changelog.js');
    await openChangelog(true);
  });

  await expect(overlay).toHaveClass(SHOW_CLASS_TOKEN);
  await expect(modal.locator('.modal-close')).toHaveCount(1);
  await expect(modal).toContainText("What's New");
  await expect(modal).toContainText('Meals & Nutrition arrives');
  await expect(modal).toContainText('Log, review, and reuse meals.');
  await expect(modal).toContainText('Keep control of meal photos.');
  await expect(modal).toContainText('Unsloth Studio is now a first-class Local AI provider.');
  await expect(modal).toContainText('Safer sync and complete Agent Access');
  await expect(modal).toContainText('Your genome and other profile data are better protected.');

  await page.evaluate(async () => {
    const { closeChangelog } = await import('/js/changelog.js');
    closeChangelog();
  });

  await expect(overlay).not.toHaveClass(SHOW_CLASS_TOKEN);
  expect(await page.evaluate(() => localStorage.getItem('labcharts-changelog-seen') !== null)).toBe(true);
});

test('changelog forceShow entries auto-open until the latest version is seen', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const result = await page.evaluate(async () => {
    const { closeChangelog, maybeShowChangelog } = await import('/js/changelog.js');

    const overlay = document.getElementById('changelog-modal-overlay');
    if (!overlay) throw new Error('changelog overlay unavailable');

    localStorage.setItem('labcharts-changelog-seen', '1.13.0');
    overlay.classList.remove('show');
    await maybeShowChangelog();
    const opensWhenForceShowIsNewer = overlay.classList.contains('show') === true;

    closeChangelog();
    await maybeShowChangelog();
    const staysClosedAfterLatestSeen = overlay.classList.contains('show') === false;

    localStorage.setItem('labcharts-changelog-seen', window.APP_VERSION);
    overlay.classList.remove('show');
    await maybeShowChangelog();
    const staysClosedWhenNoForceShowIsNewer = overlay.classList.contains('show') === false;

    return {
      opensWhenForceShowIsNewer,
      staysClosedAfterLatestSeen,
      staysClosedWhenNoForceShowIsNewer,
    };
  });

  expect(result).toEqual({
    opensWhenForceShowIsNewer: true,
    staysClosedAfterLatestSeen: true,
    staysClosedWhenNoForceShowIsNewer: true,
  });
});

test('changelog renders whitelisted inline tags and safe links', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(async () => {
    const { openChangelog } = await import('/js/changelog.js');
    await openChangelog(true);
  });

  const itemsHTML = await page.locator('#changelog-modal').evaluate((modal) => modal.innerHTML);
  expect(itemsHTML).toContain('<b>');
  expect(itemsHTML).not.toContain('&lt;b&gt;');
  expect(itemsHTML).not.toContain('&lt;code&gt;');
  expect(itemsHTML).toMatch(/<a href="https:\/\/(?:[a-z-]+\.)?getbased\.health[^"]*" target="_blank" rel="noopener noreferrer">[^<]+<\/a>/);
});
