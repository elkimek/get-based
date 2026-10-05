import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { headlessBrowserEnvironment } from './scripts/headless-browser-environment.js';
const environment = headlessBrowserEnvironment(path.resolve('.local-notes/headless-runtime'));
const webkit = process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE;
export default defineConfig({
  testDir: './tests/pwa', testMatch: 'sveltekit.spec.ts', workers: 1, fullyParallel: false,
  timeout: 90_000, expect: { timeout: 10_000 }, reporter: [['list']],
  outputDir: process.env.PLAYWRIGHT_KIT_OUTPUT_DIR || '/tmp/getbased-sveltekit-results',
  use: { headless: true, serviceWorkers: 'allow', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'kit-chromium', use: { ...devices['Desktop Chrome'], channel: 'chromium', launchOptions: { env: environment, args: ['--no-sandbox', '--disable-setuid-sandbox'] } } },
    { name: 'kit-firefox', use: { ...devices['Desktop Firefox'], launchOptions: { env: environment } } },
    { name: 'kit-webkit', use: { ...devices['Desktop Safari'], launchOptions: { env: environment, ...(webkit ? { executablePath: webkit } : {}) } } },
    { name: 'kit-mobile-webkit', use: { ...devices['iPhone 13'], launchOptions: { env: environment, ...(webkit ? { executablePath: webkit } : {}) } } },
  ],
});
