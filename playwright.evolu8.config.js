import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config.js';

const { launchOptions: chromiumLaunchOptions, ...sharedUse } = baseConfig.use || {};

export default defineConfig({
  ...baseConfig,
  testDir: './tests/evolu8-browser',
  outputDir: process.env.PLAYWRIGHT_EVOLU8_OUTPUT_DIR || '/tmp/getbased-evolu8-browser-results',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    ...sharedUse,
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium-evolu8',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: chromiumLaunchOptions,
      },
    },
    {
      name: 'firefox-evolu8',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit-evolu8',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
