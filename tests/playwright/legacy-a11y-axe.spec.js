import { test } from '@playwright/test';
import { runLegacyBrowserScript } from './legacy-browser-runner.js';

test('axe accessibility legacy browser scan', { timeout: 120_000 }, async ({ page }) => {
  const rebaseline = process.env.A11Y_REBASELINE === '1' || process.env.A11Y_REBASELINE === 'true';
  if (rebaseline) {
    await page.addInitScript(() => {
      window.A11Y_REBASELINE = true;
    });
  }

  await runLegacyBrowserScript(page, 'tests/test-a11y-axe.js', {
    viewport: { width: 800, height: 600 },
    readyTimeout: 20_000,
    settleMs: 250,
  });
});
