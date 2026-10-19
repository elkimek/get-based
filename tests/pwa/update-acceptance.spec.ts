// Real service workers and authored current update UI, with a small synthetic
// app shell. This is backwards-compatibility/protocol coverage, not full-app
// acceptance. Legacy fixtures are exact f0d4eb8f bytes, never a reconstructed UI.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {fileURLToPath} from 'node:url';
import type {AddressInfo, Socket} from 'node:net';
import type {Page} from '@playwright/test';
import {expect, test, startPageCoverage, stopPageCoverage} from '../playwright/coverage-fixture.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BUILD_A = '1'.repeat(64), BUILD_B = '2'.repeat(64);
const CACHE_A = `labcharts-vbuild-${BUILD_A}`, CACHE_B = `labcharts-vbuild-${BUILD_B}`;
const LEGACY_CACHE = 'labcharts-v1.23.0';
const SENTINEL = 'synthetic-update-regression-data';
const MODULE_PATHS = [
  '/js/service-worker-update.js', '/js/version-update-rendering.js',
  '/js/components/VersionUpdateBody.svelte.html.js', '/js/components/VersionUpdateCopy.svelte.html.js',
];
const LEGACY_HASHES = {
  'service-worker-runtime': 'af3b63990ff3501337e06b52c286995177a02dc636af04d95a8b6cbea99d0215',
  'service-worker-update': '09da0d5e51c52f6b55503e7f8753094b800bbcf7c6cfc2b237141ed6d6f84f56',
};
let runtime = '', legacyRuntime = '', legacyUpdater = '';
const modules = new Map<string, string>();
test.use({serviceWorkers: 'allow', seedLegalAcceptance: false});
test.beforeAll(async () => {
  runtime = await fs.readFile(path.join(ROOT, 'service-worker-runtime.js'), 'utf8');
  for (const url of MODULE_PATHS) modules.set(url, await fs.readFile(path.join(ROOT, url.slice(1)), 'utf8'));
  for (const [name, expected] of Object.entries(LEGACY_HASHES)) {
    const source = await fs.readFile(path.join(ROOT, `tests/fixtures/pwa-legacy/${name}.ts.txt`), 'utf8');
    expect(createHash('sha256').update(source).digest('hex')).toBe(expected);
    const erased = stripTypeScriptTypes(source, {mode: 'strip'});
    if (name === 'service-worker-runtime') legacyRuntime = erased;
    else legacyUpdater = erased;
  }
});

async function protocolServer({legacy = false, dropFirstRequest = false}: {legacy?: boolean; dropFirstRequest?: boolean} = {}) {
  const state = {stage: 'a' as 'a' | 'b', offline: false, activationStartedBuild: ''};
  const sockets = new Set<Socket>();
  const app = () => {
    const old = legacy && state.stage === 'a';
    const identity = old ? 'legacy' : state.stage === 'a' ? BUILD_A : BUILD_B;
    return `<!doctype html><html lang="en" data-app-ready><head><meta charset="utf-8"><title>Update protocol regression</title></head><body><p id="identity">${identity}</p><script src="${old ? '/legacy-version.js' : '/version.js'}"></script><script type="module" src="${old ? '/legacy-updater.js' : '/js/service-worker-update.js'}"></script></body></html>`;
  };
  const server = http.createServer((request, response) => {
    if (state.offline) {request.socket.destroy();return;}
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-type', 'text/javascript; charset=utf-8');
    if (url.pathname === '/api/test-activation') {state.activationStartedBuild = url.searchParams.get('build') || '';response.end('observed');return;}
    if (url.pathname === '/service-worker.js') {
      const old = legacy && state.stage === 'a';
      const id = old ? '' : state.stage === 'a' ? BUILD_A : BUILD_B;
      const cache = old ? LEGACY_CACHE : `labcharts-vbuild-${id}`;
      // Fault injection is confined to this synthetic worker's delivery layer:
      // drop one user activation request without changing the actual runtime,
      // production guard, cache ownership protocol or subsequent retry.
      const barrier = dropFirstRequest && state.stage === 'b' ? `const listen=self.addEventListener.bind(self);let dropped=false;self.addEventListener=(type,listener,options)=>listen(type,type==='message'?function(event){if(!dropped&&event.data?.type==='SKIP_WAITING'){dropped=true;event.source?.postMessage({type:'TEST_UPDATE_REQUEST_DROPPED'});return;}listener.call(self,event);}:listener,options);` : '';
      // Passive activation observation works in Chromium, Firefox and WebKit;
      // it never claims clients, skips waiting or substitutes runtime behavior.
      const activationObserver = `self.addEventListener('activate',event=>event.waitUntil(fetch('/api/test-activation?build='+${JSON.stringify(id)}).then(()=>undefined)));`;
      response.end(`${barrier}${activationObserver}importScripts('${old ? '/legacy-runtime.js' : '/service-worker-runtime.js'}');self.GetBasedServiceWorkerRuntime.install({scope:self,buildId:${JSON.stringify(id)},appShell:${JSON.stringify(['/app', '/index.html', '/version.js', ...MODULE_PATHS, ...(old ? ['/legacy-version.js', '/legacy-updater.js'] : [])])},isProduction:true,resolveCacheName:async()=>${JSON.stringify(cache)},shouldUseNetworkOnly:()=>false});`);
      return;
    }
    if (url.pathname === '/service-worker-runtime.js') {response.end(runtime);return;}
    if (url.pathname === '/legacy-runtime.js') {response.end(legacyRuntime);return;}
    if (url.pathname === '/legacy-updater.js') {response.end(legacyUpdater);return;}
    if (url.pathname === '/legacy-version.js') {response.end("self.APP_VERSION='1.23.0';");return;}
    if (url.pathname === '/version.js') {
      response.end(legacy && state.stage === 'a' ? "self.APP_VERSION='1.23.0';"
        : `self.APP_VERSION='1.24.0';self.APP_BUILD_ID='${state.stage === 'a' ? BUILD_A : BUILD_B}';`);
      return;
    }
    const module = modules.get(url.pathname);
    if (module !== undefined) {response.end(module);return;}
    if (url.pathname === '/app' || url.pathname === '/index.html') {response.setHeader('content-type', 'text/html; charset=utf-8');response.end(app());return;}
    response.writeHead(404);response.end('Not found');
  });
  server.on('connection', socket => {sockets.add(socket);socket.on('close', () => sockets.delete(socket));});
  await new Promise<void>((resolve, reject) => {server.once('error', reject);server.listen(0, '127.0.0.1', resolve);});
  return {state, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: async () => {const closing = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));for (const socket of sockets) socket.destroy();await closing;},
  };
}

async function observeMessages(page: Page) {
  await page.addInitScript(() => {
    const win = window as typeof window & {updateMessages: string[]};win.updateMessages = [];
    navigator.serviceWorker.addEventListener('message', event => {
      const type = (event.data as {type?: unknown} | null)?.type;
      if (typeof type === 'string') win.updateMessages.push(type);
    });
  });
}
async function installed(page: Page, origin: string, identity = BUILD_A) {
  await observeMessages(page);
  await page.goto(`${origin}/app?dev-sw=1`, {waitUntil: 'load'});
  await expect(page.locator('#identity')).toHaveText(identity);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {timeout: 15_000}).toBe(true);
  await page.evaluate(value => localStorage.setItem('update-sentinel', value), SENTINEL);
}
async function stageUpdate(page: Page, server: Awaited<ReturnType<typeof protocolServer>>) {
  server.state.stage = 'b';
  await page.evaluate(async () => {(await navigator.serviceWorker.getRegistration()) && await (await navigator.serviceWorker.getRegistration())!.update();});
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state), {timeout: 15_000}).toBe('installed');
  await expect(page.locator('#version-update-banner')).toBeVisible();
}
async function preserved(page: Page, identity = BUILD_A) {
  await expect(page.locator('#identity')).toHaveText(identity);
  expect(await page.evaluate(() => localStorage.getItem('update-sentinel'))).toBe(SENTINEL);
}

test('modern update reloads only the accepting tab and preserves both tabs and local data', async ({page, context}) => {
  const server = await protocolServer();const other = await context.newPage();
  try {
    await installed(page, server.origin);await installed(other, server.origin);
    const otherUrl = other.url();let otherNavigations = 0;other.on('framenavigated', frame => {if (frame === other.mainFrame()) otherNavigations += 1;});
    await stageUpdate(page, server);
    await page.locator('[data-version-update-action="apply"]').click();
    await expect(page.locator('#identity')).toHaveText(BUILD_B, {timeout: 15_000});await preserved(page, BUILD_B);
    await expect(other.locator('#version-update-banner')).toContainText('New version installed');
    await preserved(other);expect(other.url()).toBe(otherUrl);expect(otherNavigations).toBe(0);
    await other.locator('[data-version-update-action="apply"]').click();
    await expect(other.locator('#identity')).toHaveText(BUILD_B, {timeout: 15_000});await preserved(other, BUILD_B);
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting)).toBeNull();
  } finally {await other.close();await server.close();}
});

test('a missing activation response leaves a visible bounded Retry and the real retry succeeds', async ({page}) => {
  const server = await protocolServer({dropFirstRequest: true});
  try {
    await installed(page, server.origin);await stageUpdate(page, server);
    await page.clock.install();
    await page.locator('[data-version-update-action="apply"]').click();
    await expect(page.locator('#version-update-banner')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('[data-version-update-action="apply"]')).toBeDisabled();
    await expect.poll(() => page.evaluate(() => (window as typeof window & {updateMessages: string[]}).updateMessages.includes('TEST_UPDATE_REQUEST_DROPPED'))).toBe(true);
    // Advance only the document clock. The production 30s timer and real
    // service worker/census code are unchanged; worker timers remain real.
    await page.clock.fastForward(30_001);
    await expect(page.locator('#version-update-banner')).toContainText('taking longer than expected');
    await expect(page.getByRole('button', {name: 'Retry update'})).toBeEnabled();await preserved(page);
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state)).toBe('installed');
    expect(await page.evaluate(() => caches.keys())).toEqual(expect.arrayContaining([CACHE_A, CACHE_B]));
    await page.getByRole('button', {name: 'Retry update'}).click();
    await expect(page.locator('#identity')).toHaveText(BUILD_B, {timeout: 15_000});await preserved(page, BUILD_B);
  } finally {await server.close();}
});

test('an offline update attempt preserves the installed production build and reconnecting can update', async ({page}) => {
  const server = await protocolServer();
  try {
    await installed(page, server.origin);server.state.stage = 'b';server.state.offline = true;
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update().then(() => true, () => false))).toBe(false);
    await preserved(page);
    expect(await page.evaluate(async () => ({active: (await navigator.serviceWorker.getRegistration())?.active?.state, keys: await caches.keys()})))
      .toEqual({active: 'activated', keys: expect.arrayContaining([CACHE_A])});
    server.state.offline = false;await stageUpdate(page, server);
    await page.locator('[data-version-update-action="apply"]').click();
    await expect(page.locator('#identity')).toHaveText(BUILD_B, {timeout: 15_000});await preserved(page, BUILD_B);
  } finally {await server.close();}
});

test('the frozen legacy UI cannot receive a retroactive fix and close-reopen safely activates its update', async ({page, context}, testInfo) => {
  const server = await protocolServer({legacy: true});
  try {
    await installed(page, server.origin, 'legacy');await stageUpdate(page, server);
    const before = page.url();let navigations = 0;page.on('framenavigated', frame => {if (frame === page.mainFrame()) navigations += 1;});
    await page.locator('[data-version-update-action="apply"]').click();
    await expect.poll(() => page.evaluate(() => (window as typeof window & {updateMessages: string[]}).updateMessages.includes('UPDATE_ACTIVATION_DEFERRED')), {timeout: 10_000}).toBe(true);
    await expect(page.locator('#version-update-banner')).toHaveCount(0);await preserved(page, 'legacy');
    expect(page.url()).toBe(before);expect(navigations).toBe(0);
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state)).toBe('installed');
    expect(await page.evaluate(() => caches.keys())).toEqual(expect.arrayContaining([LEGACY_CACHE, CACHE_B]));
    await stopPageCoverage(page, testInfo, 'legacy-before-close');await page.close();
    await expect.poll(() => server.state.activationStartedBuild, {timeout: 15_000}).toBe(BUILD_B);
    const reopened = await context.newPage();await startPageCoverage(reopened);
    try {
      await reopened.goto(`${server.origin}/app?dev-sw=1`);await preserved(reopened, BUILD_B);
      expect(await reopened.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting)).toBeNull();
      expect(await reopened.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state)).toBe('activated');
    } finally {await stopPageCoverage(reopened, testInfo, 'legacy-reopened');await reopened.close();}
  } finally {await server.close();}
});
