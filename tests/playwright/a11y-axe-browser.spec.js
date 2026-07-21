import { createRequire } from 'node:module';
import { test } from './coverage-fixture.js';
import { runBrowserScript } from './browser-script-runner.js';

const require = createRequire(import.meta.url);
const axeScriptPath = require.resolve('axe-core/axe.min.js');

test('axe accessibility browser scan', async ({ page }, testInfo) => {
  testInfo.setTimeout(120_000);
  const rebaseline = process.env.A11Y_REBASELINE === '1' || process.env.A11Y_REBASELINE === 'true';

  await page.addInitScript({ path: axeScriptPath });

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
