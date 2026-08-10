import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?startupOrchestratorCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openStartupOrchestratorPage(page) {
  await page.route('**/startup-orchestrator-browser-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.route('**/js/startup-foundation.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export async function initializeStartupFoundation() {
        window.__startupCalls.push('foundation');
        throw new Error('foundation unavailable');
      }
    `,
  }));
  await page.route('**/js/startup-profile.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export async function initializeProfileData() {
        window.__startupCalls.push('profile');
      }
    `,
  }));
  await page.route('**/js/startup-oauth-callbacks.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export async function handleStartupOAuthCallbacks() {
        window.__startupCalls.push('oauth');
      }
    `,
  }));
  await page.route('**/js/startup-ui.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export function renderStartupUI() {
        window.__startupCalls.push('ui');
      }
    `,
  }));
  await page.route('**/js/startup-maintenance.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export function runPostProfileStartupMaintenance() {
        window.__startupCalls.push('maintenance');
      }
    `,
  }));
  await page.route('**/js/app-event-listeners.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export function installGlobalEventListeners() {
        window.__startupCalls.push('events');
      }
      export function registerAppRefreshCallback() {
        window.__startupCalls.push('refresh');
      }
    `,
  }));
  await page.route('**/js/utils.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export function showNotification(message, type, duration) {
        window.__startupNotifications.push({ message, type, duration });
      }
    `,
  }));
  await page.route('**/js/sync.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export function configureSyncLifecycleDeps({ enableSync, disableSync, pauseSync }) {
        window.__startupCalls.push(['sync-lifecycle-deps', typeof enableSync, typeof disableSync, typeof pauseSync]);
      }
    `,
  }));
  await page.route('**/js/sync-configure.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export function configureSyncModules({ enableSync }) {
        window.__startupCalls.push(['sync-modules', typeof enableSync]);
      }
    `,
  }));
  await page.route('**/js/sync-lifecycle.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export async function enableSync() {}
      export async function disableSync() {}
      export async function pauseSync() {}
    `,
  }));
  await page.goto('/startup-orchestrator-browser-coverage', { waitUntil: 'load' });
}

test('startup orchestrator browser coverage reports startup sequence failures', async ({ page }) => {
  await openStartupOrchestratorPage(page);

  const results = await page.evaluate(async ({ startupUrl }) => {
    const waitUntil = async (predicate, label) => {
      for (let i = 0; i < 50; i += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const [{ state }, startup] = await Promise.all([
      import('/js/state.js'),
      import(startupUrl),
    ]);
    const outcomes = {};
    const originalProfile = state.currentProfile;
    const originalConsoleError = console.error;

    try {
      window.__startupCalls = [];
      window.__startupNotifications = [];
      window.__startupErrors = [];
      console.error = (...args) => {
        window.__startupErrors.push(args.map(arg => String(arg?.message || arg)).join(' '));
      };
      state.currentProfile = 'startup-orchestrator-coverage-profile';

      startup.startApp();
      startup.startApp();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await waitUntil(
        () => window.__startupNotifications.length === 1,
        'startup failure notification'
      );

      outcomes.startAppInstallsOneSetOfShellHooksWithoutUsageGlobal =
        !window.__startupCalls.includes('emf')
        && window.__startupCalls.filter(call => Array.isArray(call) && call[0] === 'sync-lifecycle-deps').length === 1
        && window.__startupCalls.filter(call => Array.isArray(call) && call[0] === 'sync-modules').length === 1
        && window.__startupCalls.filter(call => call === 'events').length === 1
        && window.__startupCalls.filter(call => call === 'refresh').length === 1
        && !('_getActiveProfileId' in window);
      outcomes.startupFailureStopsLaterPhasesAndReportsError =
        window.__startupCalls.includes('foundation')
        && !window.__startupCalls.includes('maintenance')
        && !window.__startupCalls.includes('profile')
        && !window.__startupCalls.includes('oauth')
        && !window.__startupCalls.includes('ui')
        && window.__startupErrors.some(line => line.includes('Startup initialization failed'))
        && window.__startupErrors.some(line => line.includes('foundation unavailable'));
      outcomes.startupFailureNotificationIsUserFacing =
        window.__startupNotifications[0].message === 'Startup failed. Try reloading the app.'
        && window.__startupNotifications[0].type === 'error'
        && window.__startupNotifications[0].duration === 6000;
    } finally {
      state.currentProfile = originalProfile;
      console.error = originalConsoleError;
    }

    return outcomes;
  }, {
    startupUrl: moduleUrl('/js/startup-orchestrator.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
