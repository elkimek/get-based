import { test } from './coverage-fixture.js';
import { runBrowserScript } from './browser-script-runner.js';

(test as (title: string, details: Parameters<typeof test>[1] & {timeout: number}, body: Parameters<typeof test>[2]) => ReturnType<typeof test>)('AI verdict engine browser contract', { timeout: 120_000 }, async ({ page }) => {
  await runBrowserScript(page, 'tests/test-ai-verdict-engine.js', {
    settleMs: 500,
  });
});
