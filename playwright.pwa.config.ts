import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config.js';

const { launchOptions, ...sharedUse } = baseConfig.use!;
const webkitExecutable = process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE;
export default defineConfig({
  ...baseConfig,
  testDir: './tests/pwa',
  testIgnore: '**/sveltekit*.spec.{js,ts}',
  outputDir: process.env.PLAYWRIGHT_PWA_OUTPUT_DIR || '/tmp/getbased-pwa-results',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: { ...sharedUse, serviceWorkers: 'allow' },
  projects: [
    // Full Chromium uses Chrome's browser code path while remaining headless.
    { name: 'pwa-chromium', use: { ...devices['Desktop Chrome'], channel: 'chromium', launchOptions: launchOptions! } },
    { name: 'pwa-firefox', use: { ...devices['Desktop Firefox'], launchOptions: { env: launchOptions!.env! } } },
    { name: 'pwa-webkit', use: { ...devices['Desktop Safari'], launchOptions: { env: launchOptions!.env!, ...(webkitExecutable ? { executablePath: webkitExecutable } : {}) } } },
    { name: 'pwa-mobile-webkit', use: { ...devices['iPhone 13'], launchOptions: { env: launchOptions!.env!, ...(webkitExecutable ? { executablePath: webkitExecutable } : {}) } } },
  ],
});
