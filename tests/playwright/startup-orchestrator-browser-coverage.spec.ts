import type {Page} from '@playwright/test';
import { routeHtml, routeJavaScript } from '../helpers/browser-static-routes.js';
import { createModuleUrl } from '../helpers/browser-module-url.js';
import { expect, test } from './coverage-fixture.js';

const moduleUrl = createModuleUrl('startupOrchestratorCoverage');

async function openStartupOrchestratorPage(page: Page) {
  await routeHtml(page, '**/startup-orchestrator-browser-coverage', '<!doctype html><html><body><main id="fixture"></main></body></html>', 200);
  await routeJavaScript(page, '**/js/startup-foundation.js*', `
      export async function initializeStartupFoundation() {
        window.__startupCalls.push('foundation');
        throw new Error('foundation unavailable');
      }
    `);
  await routeJavaScript(page, '**/js/startup-profile.js*', `
      export async function initializeProfileData() {
        window.__startupCalls.push('profile');
      }
    `);
  await routeJavaScript(page, '**/js/startup-oauth-callbacks.js*', `
      export async function handleStartupOAuthCallbacks() {
        window.__startupCalls.push('oauth');
      }
    `);
  await routeJavaScript(page, '**/js/startup-ui.js*', `
      export function renderStartupUI() {
        window.__startupCalls.push('ui');
      }
    `);
  await routeJavaScript(page, '**/js/startup-maintenance.js*', `
      export function runPostProfileStartupMaintenance() {
        window.__startupCalls.push('maintenance');
      }
    `);
  await routeJavaScript(page, '**/js/app-event-listeners.js*', `
      export function installGlobalEventListeners() {
        window.__startupCalls.push('events');
      }
      export function registerAppRefreshCallback() {
        window.__startupCalls.push('refresh');
      }
    `);
  await routeJavaScript(page, '**/js/utils.js*', `
      export function showNotification(message, type, duration) {
        window.__startupNotifications.push({ message, type, duration });
      }
    `);
  await routeJavaScript(page, '**/js/sync.js*', `
      export function configureSyncLifecycleDeps({ enableSync, disableSync, pauseSync }) {
        window.__startupCalls.push(['sync-lifecycle-deps', typeof enableSync, typeof disableSync, typeof pauseSync]);
      }
    `);
  await routeJavaScript(page, '**/js/sync-configure.js*', `
      export function configureSyncModules({ enableSync }) {
        window.__startupCalls.push(['sync-modules', typeof enableSync]);
      }
    `);
  await routeJavaScript(page, '**/js/sync-lifecycle.js*', `
      export async function enableSync() {}
      export async function disableSync() {}
      export async function pauseSync() {}
    `);
  await page.goto('/startup-orchestrator-browser-coverage', { waitUntil: 'load' });
}

test('startup orchestrator browser coverage reports startup sequence failures', async ({ page }) => {
  await openStartupOrchestratorPage(page);

  const results = await page.evaluate(async ({ startupUrl }) => {
    const waitUntil = async (predicate: () => boolean, label: string) => {
      for (let i = 0; i < 50; i += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const [{ state }, startup] = await Promise.all([
      import('/js/state.js'),
      (import(startupUrl) as Promise<unknown>) as Promise<Pick<typeof import('../../js/startup-orchestrator.js'), "startApp">>,
    ]);
    const outcomes: Record<string, boolean> = {};
    const originalProfile = state.currentProfile;
    const originalConsoleError = console.error;

    try {
      (window as unknown as { __startupCalls: (string | unknown[])[] }).__startupCalls = [];
      (window as unknown as { __startupNotifications: {message: unknown; type: unknown; duration: unknown}[] }).__startupNotifications = [];
      (window as unknown as { __startupErrors: string[] }).__startupErrors = [];
      console.error = (...args) => {
        (window as unknown as { __startupErrors: string[] }).__startupErrors.push(args.map(arg => String(arg?.message || arg)).join(' '));
      };
      state.currentProfile = 'startup-orchestrator-coverage-profile';

      startup.startApp();
      startup.startApp();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await waitUntil(
        () => (window as unknown as { __startupNotifications: {message: unknown; type: unknown; duration: unknown}[] }).__startupNotifications.length === 1,
        'startup failure notification'
      );

      outcomes.startAppInstallsOneSetOfShellHooksWithoutUsageGlobal =
        !(window as unknown as { __startupCalls: (string | unknown[])[] }).__startupCalls.includes('emf')
        && (window as unknown as { __startupCalls: (string | unknown[])[] }).__startupCalls.filter(call => Array.isArray(call) && call[0] === 'sync-lifecycle-deps').length === 1
        && (window as unknown as { __startupCalls: (string | unknown[])[] }).__startupCalls.filter(call => Array.isArray(call) && call[0] === 'sync-modules').length === 1
        && (window as unknown as { __startupCalls: (string | unknown[])[] }).__startupCalls.filter(call => call === 'events').length === 1
        && (window as unknown as { __startupCalls: (string | unknown[])[] }).__startupCalls.filter(call => call === 'refresh').length === 1
        && !('_getActiveProfileId' in window);
      outcomes.startupFailureStopsLaterPhasesAndReportsError =
        (window as unknown as { __startupCalls: (string | unknown[])[] }).__startupCalls.includes('foundation')
        && !(window as unknown as { __startupCalls: (string | unknown[])[] }).__startupCalls.includes('maintenance')
        && !(window as unknown as { __startupCalls: (string | unknown[])[] }).__startupCalls.includes('profile')
        && !(window as unknown as { __startupCalls: (string | unknown[])[] }).__startupCalls.includes('oauth')
        && !(window as unknown as { __startupCalls: (string | unknown[])[] }).__startupCalls.includes('ui')
        && (window as unknown as { __startupErrors: string[] }).__startupErrors.some(line => line.includes('Startup initialization failed'))
        && (window as unknown as { __startupErrors: string[] }).__startupErrors.some(line => line.includes('foundation unavailable'));
      outcomes.startupFailureNotificationIsUserFacing =
        (window as unknown as { __startupNotifications: {message: unknown; type: unknown; duration: unknown}[] }).__startupNotifications[0]!.message === 'Startup failed. Try reloading the app.'
        && (window as unknown as { __startupNotifications: {message: unknown; type: unknown; duration: unknown}[] }).__startupNotifications[0]!.type === 'error'
        && (window as unknown as { __startupNotifications: {message: unknown; type: unknown; duration: unknown}[] }).__startupNotifications[0]!.duration === 6000;
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
