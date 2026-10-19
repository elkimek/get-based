import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { headlessBrowserEnvironment } from './scripts/headless-browser-environment.js';
const environment = headlessBrowserEnvironment(path.resolve('.local-notes/headless-runtime'));
const webkit = process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE;
export function kitCaseSelection(scope = 'all', project?: string, platform = process.platform): {testMatch: string; testIgnore?: string} {
  if (!['all', 'webkit-standard', 'webkit-opfs'].includes(scope)) throw new Error('Unknown planned Kit case scope');
  if (scope === 'all') return {testMatch: 'sveltekit*.spec.ts'};
  if (!['kit-webkit', 'kit-mobile-webkit'].includes(project || '')) throw new Error('Native OPFS placement requires a WebKit project');
  if (platform !== 'darwin') throw new Error('Kit case scope differs from its native platform');
  return scope === 'webkit-opfs' ? {testMatch: 'sveltekit-knowledge-base.spec.ts'}
    : {testMatch: 'sveltekit*.spec.ts', testIgnore: '**/sveltekit-knowledge-base.spec.ts'};
}
export default defineConfig({
  testDir: './tests/pwa', ...kitCaseSelection(process.env['GETBASED_KIT_CASE_SCOPE'], process.env['GETBASED_KIT_PROJECT']), workers: 1, fullyParallel: false,
  timeout: 90_000, expect: { timeout: 10_000 }, reporter: [['list'], ['./scripts/kit-acceptance-reporter.mjs']],
  outputDir: process.env.PLAYWRIGHT_KIT_OUTPUT_DIR || '/tmp/getbased-sveltekit-results',
  use: { headless: true, serviceWorkers: 'allow', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'kit-chromium', use: { ...devices['Desktop Chrome'], channel: 'chromium', launchOptions: { env: environment, args: ['--no-sandbox', '--disable-setuid-sandbox'] } } },
    { name: 'kit-firefox', use: { ...devices['Desktop Firefox'], launchOptions: { env: environment } } },
    { name: 'kit-webkit', use: { ...devices['Desktop Safari'], launchOptions: { env: environment, ...(webkit ? { executablePath: webkit } : {}) } } },
    { name: 'kit-mobile-webkit', use: { ...devices['iPhone 13'], launchOptions: { env: environment, ...(webkit ? { executablePath: webkit } : {}) } } },
  ],
});
