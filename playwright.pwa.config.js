import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config.js';

const { launchOptions, ...sharedUse } = baseConfig.use;
const webkitExecutable = process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE;
export default defineConfig({
  ...baseConfig,
  testDir: './tests/pwa',
  outputDir: process.env.PLAYWRIGHT_PWA_OUTPUT_DIR || '/tmp/getbased-pwa-results',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: { ...sharedUse, serviceWorkers: 'allow' },
  projects: [
    { name: 'pwa-chromium', use: { ...devices['Desktop Chrome'], launchOptions } },
    { name: 'pwa-firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'pwa-webkit', use: { ...devices['Desktop Safari'], launchOptions: webkitExecutable ? { executablePath: webkitExecutable } : {} } },
    { name: 'pwa-mobile-webkit', use: { ...devices['iPhone 13'], launchOptions: webkitExecutable ? { executablePath: webkitExecutable } : {} } },
  ],
});
