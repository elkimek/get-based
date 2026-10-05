import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config.js';

const { launchOptions, ...sharedUse } = baseConfig.use!;
const webkitExecutable = process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE;
export default defineConfig({
  ...baseConfig,
  testMatch: 'settings-display-pilot.spec.ts',
  outputDir: process.env.PLAYWRIGHT_PILOT_OUTPUT_DIR || '/tmp/getbased-display-pilot-results',
  workers: 1,
  use: sharedUse,
  projects: [
    { name: 'display-chromium', use: { ...devices['Desktop Chrome'], launchOptions: launchOptions! } },
    { name: 'display-firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'display-webkit', use: { ...devices['Desktop Safari'], launchOptions: webkitExecutable ? { executablePath: webkitExecutable } : {} } },
    { name: 'display-mobile-webkit', use: { ...devices['iPhone 13'], launchOptions: webkitExecutable ? { executablePath: webkitExecutable } : {} } },
  ],
});
