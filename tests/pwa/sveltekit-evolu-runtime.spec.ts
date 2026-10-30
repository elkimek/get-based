import path from 'node:path';
import {devices, expect, test, type BrowserContext, type Page} from '@playwright/test';
import {startKitServer} from './kit-server.js';
import {artifactInputs} from './kit-native-receipts.js';
import type {SyncRuntimeClient} from '../../js/sync-runtime.js';

const runtime = '/vendor/evolu8/v8.24.1-web3.6.5/';
const owners = ['js/state.js', 'js/sync-evolu8-candidate.js', 'js/sync-runtime.js', 'js/sync-subscriptions.js', 'js/sync-state.js'] as const;
const fixtureProfile = 'evolu-offline-restart-fixture';
const fixturePayload = '{"schemaVersion":1,"syntheticRestartMarker":"sqlite-row-2026-10-30"}';
interface ShippingSyncDebug {evolu: SyncRuntimeClient; getRows(): Array<{id: string; profileId: string; dataJson: string; syncedAt: string | null}>}
async function fixtureRows(page: Page) {
  return page.evaluate(profileId => {
    const debug = (window as Window & {_syncDebug?: ShippingSyncDebug})._syncDebug;
    if (!debug) throw new Error('Missing actual shipping Sync debug interface');
    return debug.getRows().filter(row => row.profileId === profileId)
      .map(({id, profileId, dataJson, syncedAt}) => ({id, profileId, dataJson, syncedAt}));
  }, fixtureProfile);
}
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({timeout: 30_000});
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function openIdentity(page: Page) {
  await expect(page.locator('body')).not.toHaveClass(/\bchat-autostart-reserved\b/, {timeout: 30_000});
  const close = page.getByRole('button', {name: 'Close chat', exact: true}); if (await close.isVisible()) await close.click();
  await page.locator('[data-shell-action="open-settings"]').click();
  await page.locator('#settings-nav-data').click();
  await expect(page.locator('#sync-identity-copy')).toBeEnabled({timeout: 30_000});
  await expect(page.locator('#sync-mnemonic-toggle')).toBeEnabled();
  return (await page.locator('#sync-identity-code').innerText()).trim();
}
async function identityState(page: Page) {
  return page.evaluate(async () => {
    const token = localStorage.getItem('labcharts-sync-evolu8-identity-token');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token || ''));
    return {tokenPresent: !!token, tokenDigest: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''),
      generation: localStorage.getItem('labcharts-sync-evolu8-generation'), sentinel: localStorage.getItem('evolu-offline-sentinel')};
  });
}

test('the shipping Evolu database row, worker graph and encrypted identity survive a real browser restart with the origin offline', async ({playwright, browserName}, info) => {
  test.setTimeout(150_000);
  const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
  const proof = await artifactInputs(owners, []); expect(proof.directory).toBe(artifact);
  const server = await startKitServer(artifact);
  // Keep the unavailable relay on its own origin, as in deployment. Routing
  // its probes through the app's SW makes WebKit report expected network
  // failures as page errors even when the application's fetch is caught.
  const relay = await startKitServer(artifact, [async (_request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.writeHead(503); response.end('Synthetic relay unavailable'); return true;
  }]);
  const profile = info.outputPath('evolu-profile');
  const device = devices[browserName === 'chromium' ? 'Desktop Chrome' : browserName === 'firefox' ? 'Desktop Firefox'
    : info.project.name.includes('mobile') ? 'iPhone 13' : 'Desktop Safari']!;
  const launch = () => playwright[browserName].launchPersistentContext(profile, {
    ...device, ...info.project.use.launchOptions, headless: true, serviceWorkers: 'allow',
    ...(browserName === 'chromium' ? {channel: 'chromium'} : {}),
  });
  let context: BrowserContext | null = null; const errors: string[] = [];
  const observe = (active: BrowserContext) => active.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  try {
    context = await launch(); observe(context);
    await context.addInitScript(({relay, self}) => {
      if (!['http:', 'https:'].includes(location.protocol)) return;
      localStorage.setItem('labcharts-sync-enabled', 'true'); localStorage.setItem('labcharts-sync-relay', relay);
      // Opt in to the existing product debug interface. The test never installs
      // a getter or imports a second SDK/runtime into the shipping application.
      localStorage.setItem('labcharts-debug', 'true');
      localStorage.setItem('labcharts-self-url', self);
      localStorage.setItem('labcharts-ai-paused', 'true'); localStorage.setItem('labcharts-analytics-disabled', 'true');
      localStorage.setItem('labcharts-analytics-consent-seen', '1'); localStorage.setItem('evolu-offline-sentinel', 'preserved');
      for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
      localStorage.setItem('labcharts-default-onboarded', 'profile-set'); localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
      localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22',
        policyScope: 'self-hosted-notice', acceptedAt: '2026-10-30T00:00:00.000Z', appVersion: 'evolu-test', location: 'local-test'}));
    }, {relay: relay.origin.replace(/^http/, 'ws'), self: relay.origin});
    const page = context.pages()[0] || await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page);
    const identity = await openIdentity(page); const before = await identityState(page);
    expect(identity).not.toMatch(/Resolving|Unavailable/); expect(before.tokenPresent).toBe(true);
    await page.evaluate(async ({profileId, dataJson}) => {
      const debug = (window as Window & {_syncDebug?: ShippingSyncDebug})._syncDebug;
      if (!debug) throw new Error('Missing actual shipping Sync debug interface');
      await new Promise<void>(resolve => debug.evolu.insert('profileData', {profileId, dataJson, syncedAt: '100'}, {onComplete: resolve}));
    }, {profileId: fixtureProfile, dataJson: fixturePayload});
    await expect.poll(() => fixtureRows(page)).toEqual([expect.objectContaining({profileId: fixtureProfile, dataJson: fixturePayload, syncedAt: '100'})]);
    const databaseBefore = await fixtureRows(page);
    const cached = await page.evaluate(async runtime => {
      const name = (await caches.keys()).find(key => key.startsWith('labcharts-vbuild-'));
      if (!name) throw new Error('No installed app cache');
      const cache = await caches.open(name); const response = await cache.match(runtime + 'sqlite3.wasm');
      return {paths: (await cache.keys()).map(request => new URL(request.url).pathname), wasmType: response?.headers.get('Content-Type')};
    }, runtime);
    for (const file of ['evolu-bundle.js', 'Db.worker.js', 'Shared.worker.js', 'sqlite3.wasm']) expect(cached.paths).toContain(runtime + file);
    expect(cached.wasmType).toBe('application/wasm');
    for (const file of ['evolu-bundle.js', 'Db.worker.js', 'Shared.worker.js']) expect(cached.paths).not.toContain('/vendor/evolu8/' + file);
    // With no retained cache for the previous graph, its verified network
    // fallback must still work against the real published production files.
    for (const file of ['evolu-bundle.js', 'Db.worker.js', 'Shared.worker.js']) {
      const url = '/vendor/evolu8/' + file;
      const previous = await page.evaluate(async url => {
        const response = await fetch(url); const bytes = await response.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return {status: response.status, bytes: bytes.byteLength, sha256: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')};
      }, url);
      const expected = proof.files.find(asset => asset.path === url);
      expect(expected).toBeDefined(); expect(previous).toEqual({status: 200, bytes: expected!.bytes, sha256: expected!.sha256});
    }
    await context.close(); context = null; server.state.offline = true;
    // A new browser process reads the actual persisted OPFS, IndexedDB and SW
    // cache. No init script re-seeds identity or configuration on this launch.
    context = await launch(); observe(context);
    const cold = context.pages()[0] || await context.newPage(); cold.on('pageerror', error => errors.push(error.message));
    await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold);
    expect(await openIdentity(cold)).toBe(identity); const after = await identityState(cold);
    await expect.poll(() => fixtureRows(cold)).toEqual(databaseBefore);
    const databaseAfter = await fixtureRows(cold);
    expect(after).toEqual(before); expect(errors).toEqual([]);
    expect(await artifactInputs(owners, [])).toEqual(proof);
    await info.attach('evolu-offline-restart', {body: JSON.stringify({artifact: proof, identityCode: identity, before, after, databaseBefore, databaseAfter, cached,
      boundary: 'Actual shipping bundles, WASM, OPFS, identity vault, cache and browser-process restart. Fresh synthetic identity, unavailable loopback relay, paused AI, no provider credentials or user health records.'}), contentType: 'application/json'});
  } finally {await context?.close(); await server.close(); await relay.close();}
});
