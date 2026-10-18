import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config.js';

const { launchOptions: chromiumLaunchOptions, ...sharedUse } = baseConfig.use || {};
const firefoxEnvironment = chromiumLaunchOptions?.env;
if (!firefoxEnvironment) throw new Error('Firefox smoke tests require the isolated headless launch environment');

export default defineConfig({
  ...baseConfig,
  testDir: './tests/firefox',
  outputDir: process.env.PLAYWRIGHT_FIREFOX_OUTPUT_DIR || '/tmp/getbased-firefox-results',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {...sharedUse, launchOptions: {env: firefoxEnvironment}},
  projects: [
    {
      name: 'firefox-smoke',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
});
