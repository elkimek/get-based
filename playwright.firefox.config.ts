import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config.js';

const { launchOptions: _chromiumLaunchOptions, ...sharedUse } = baseConfig.use || {};

export default defineConfig({
  ...baseConfig,
  testDir: './tests/firefox',
  outputDir: process.env.PLAYWRIGHT_FIREFOX_OUTPUT_DIR || '/tmp/getbased-firefox-results',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: sharedUse,
  projects: [
    {
      name: 'firefox-smoke',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
});
