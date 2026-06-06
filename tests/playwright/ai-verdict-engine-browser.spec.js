import { test } from './coverage-fixture.js';
import { runBrowserScript } from './browser-script-runner.js';

test('AI verdict engine browser contract', { timeout: 120_000 }, async ({ page }) => {
  await runBrowserScript(page, 'tests/test-ai-verdict-engine.js', {
    settleMs: 500,
  });
});
