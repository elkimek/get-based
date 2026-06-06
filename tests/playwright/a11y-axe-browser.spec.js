import { test } from './coverage-fixture.js';
import { runBrowserScript } from './browser-script-runner.js';

test('axe accessibility browser scan', async ({ page }, testInfo) => {
  testInfo.setTimeout(120_000);
  const rebaseline = process.env.A11Y_REBASELINE === '1' || process.env.A11Y_REBASELINE === 'true';
  if (rebaseline) {
    await page.addInitScript(() => {
      window.A11Y_REBASELINE = true;
    });
  }

  await runBrowserScript(page, 'tests/test-a11y-axe.js', {
    viewport: { width: 800, height: 600 },
    readyTimeout: 20_000,
    settleMs: 250,
  });
});
