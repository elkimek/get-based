import { test } from '@playwright/test';
import { runLegacyBrowserScript } from './legacy-browser-runner.js';

test('AI verdict engine legacy browser contract', { timeout: 120_000 }, async ({ page }) => {
  await runLegacyBrowserScript(page, 'tests/test-ai-verdict-engine.js', {
    settleMs: 500,
  });
});
