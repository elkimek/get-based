/** Matched local synthetic measurements. Reports observations, never timing gates. */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {chromium, devices} from '@playwright/test';
import type {Browser, BrowserContext, Page, Request} from '@playwright/test';
import {headlessBrowserEnvironment} from './headless-browser-environment.js';
import {BENCHMARK_NOW, LABORATORY_SEED_FIELDS, parseBenchmarkOptions, makeBenchmarkCase, seedBenchmarkProfile, assertBenchmarkParity, benchmarkMedian} from './benchmark-static-fixtures.mjs';
import type {BenchmarkOptions, BenchmarkCaseName, SemanticSample} from './benchmark-static-fixtures.mjs';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const runFile = promisify(execFile);
const contentTypes: Record<string, string> = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.html': 'text/html', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm'};
export interface ArtifactServer {origin: string; close(): Promise<void>}
export interface Artifact {variant: 'baseline' | 'candidate'; directory: string; buildId: string; server: ArtifactServer}
interface ProbeEvent {target: 'menu' | 'body'; at: number}
interface BodyProbe {events: ProbeEvent[]; domAt: number | null; firstFrameAt: number | null; twoFramesAt: number | null}
interface ProbeWindow extends Window {benchmarkBodyProbe: BodyProbe; benchmarkCSP: {blockedURI: string; effectiveDirective: string; disposition: string}[]}
export interface RequestObservation {url: string; method: string; resourceType: string; completion: 'pending' | 'finished' | 'failed'; status?: number; error?: string}

export interface BenchmarkCleanup {label: string; close(): Promise<unknown>}
/** Keep the original failure; every acquired resource still gets its close attempt. */
export async function withBenchmarkCleanup<T>(work: () => Promise<T>, resources: () => readonly BenchmarkCleanup[]): Promise<T> {
  let failed = false, primary: unknown;
  try {return await work();}
  catch (error) {failed = true; primary = error; throw error;}
  finally {
    const failures: Error[] = [];
    for (const resource of resources()) {
      try {await resource.close();}
      catch (error) {failures.push(new Error(`Benchmark cleanup failed: ${resource.label}`, {cause: error}));}
    }
    if (failures.length) throw new AggregateError(failed ? [primary, ...failures] : failures,
      failed ? 'Benchmark failed and cleanup also failed' : 'Benchmark cleanup failed', {cause: failed ? primary : failures[0]});
  }
}
export function benchmarkContextCleanup(browser: Pick<Browser, 'isConnected'>,
  context: Pick<BrowserContext, 'unrouteAll' | 'close'>): BenchmarkCleanup[] {
  return [{label: 'context routes', close: async () => {if (browser.isConnected()) await context.unrouteAll({behavior: 'wait'});}},
    {label: 'context', close: () => context.close()}];
}
/** Error and AggregateError fields are non-enumerable; retain them in JSON receipts. */
export function benchmarkErrorDetails(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value !== 'object') return typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function' ? String(value) : value;
  if (ancestors.has(value)) return '[Circular error detail]';
  ancestors.add(value);
  try {
    if (value instanceof Error) return {name: value.name, message: value.message, stack: value.stack,
      cause: benchmarkErrorDetails(value.cause, ancestors),
      ...(value instanceof AggregateError ? {errors: value.errors.map(error => benchmarkErrorDetails(error, ancestors))} : {})};
    if (Array.isArray(value)) return value.map(item => benchmarkErrorDetails(item, ancestors));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, benchmarkErrorDetails(item, ancestors)]));
  } finally {ancestors.delete(value);}
}
export async function readBenchmarkArtifact(requested: string) {
  const directory = await fs.realpath(requested);
  assert((await fs.stat(directory)).isDirectory(), 'Static artifact must be a directory');
  for (const file of ['build-metrics.json', 'index.html', 'version.js']) {
    assert((await fs.lstat(path.join(directory, file))).isFile(), `Static artifact requires a regular ${file}`);
  }
  const metrics: unknown = JSON.parse(await fs.readFile(path.join(directory, 'build-metrics.json'), 'utf8'));
  assert(metrics && typeof metrics === 'object' && 'buildId' in metrics && typeof metrics.buildId === 'string' && /^[a-f0-9]{64}$/.test(metrics.buildId), 'Invalid static build identity');
  const index = await fs.readFile(path.join(directory, 'index.html'), 'utf8'); assert(index.trim(), 'Static artifact index.html is empty');
  const version = await fs.readFile(path.join(directory, 'version.js'), 'utf8');
  assert(version.includes(`self.APP_BUILD_ID = '${metrics.buildId}';`), 'Static artifact version/build identity differs');
  return {directory, buildId: metrics.buildId};
}

async function readBenchmarkDeploymentRevision(directory: string): Promise<string> {
  const metrics: unknown = JSON.parse(await fs.readFile(path.join(directory, 'build-metrics.json'), 'utf8'));
  assert(metrics && typeof metrics === 'object' && 'revision' in metrics
    && typeof metrics.revision === 'string' && /^[a-f0-9]{40}$/.test(metrics.revision), 'Deployment fixture requires the actual artifact revision');
  return metrics.revision;
}
/** Empty-profile Settings renders the actual revision, which exact UI parity retains. */
export function assertBenchmarkRevisionParity(cases: readonly BenchmarkCaseName[], baseline: string, candidate: string): void {
  if (cases.includes('empty')) assert.equal(candidate, baseline,
    'Empty-profile Settings parity requires the same recorded revision; use control/combined Body cases or the single-artifact performance check for different revisions');
}

export async function startServer(root: string, artifact: string,
  options: {deploymentMetadata?: boolean} = {}): Promise<ArtifactServer> {
  const deployment = JSON.parse(await fs.readFile(path.join(root, 'vercel.json'), 'utf8')) as {routes: {headers?: Record<string, string>}[]};
  const csp = deployment.routes.map(row => row.headers?.['Content-Security-Policy']).find(Boolean);
  assert(csp, 'Deployment CSP is required');
  const files = new Map<string, {body: Buffer; br: Buffer | null; type: string}>();
  let deploymentMetadata: Buffer | undefined;
  if (options.deploymentMetadata) {
    deploymentMetadata = Buffer.from(JSON.stringify({sha: await readBenchmarkDeploymentRevision(artifact), ref: 'local-performance-fixture'}));
  }
  async function warm(directory: string) {
    for (const entry of await fs.readdir(directory, {withFileTypes: true})) {
      assert(!entry.isSymbolicLink(), 'Artifact symlinks are not benchmark inputs');
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await warm(file);
      else if (entry.isFile() && !entry.name.endsWith('.map')) {
        const extension = path.extname(file), body = await fs.readFile(file);
        const compress = ['.js', '.mjs', '.css', '.json', '.html', '.svg', '.webmanifest'].includes(extension);
        files.set('/' + path.relative(artifact, file).split(path.sep).join('/'), {body,
          br: compress ? zlib.brotliCompressSync(body) : null, type: contentTypes[extension] ?? 'application/octet-stream'});
      }
    }
  }
  await warm(artifact);
  if (deploymentMetadata) files.set('/api/commit', {body: deploymentMetadata,
    br: zlib.brotliCompressSync(deploymentMetadata), type: 'application/json'});
  const server = http.createServer((request, response) => {void (async () => {
    try {
      const name = new URL(request.url ?? '/', 'http://localhost').pathname;
      response.setHeader('Cache-Control', 'no-store'); response.setHeader('Content-Security-Policy', csp);
      response.setHeader('X-Content-Type-Options', 'nosniff');
      if (name === '/__benchmark__/seed') {response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Synthetic benchmark seed</title>'); return;}
      if (name.startsWith('/__benchmark__/')) {
        const relative = name.slice('/__benchmark__/'.length);
        assert(relative.split('/').every(part => part && !part.startsWith('.')), 'Invalid private seed module');
        assert(/\.(?:js|mjs|json|wasm)$/.test(relative), 'Only compiled seed dependencies are served');
        const file = path.resolve(root, relative), real = await fs.realpath(file);
        assert(real.startsWith(root + path.sep), 'Seed module escapes source root');
        response.setHeader('Content-Type', contentTypes[path.extname(file)] ?? 'application/octet-stream');
        response.end(await fs.readFile(real)); return;
      }
      const value = files.get(['/', '/app', '/app/'].includes(name) ? '/index.html' : name);
      if (!value) {response.writeHead(404); response.end('Not found'); return;}
      const compressed = value.br && /\bbr\b/.test(request.headers['accept-encoding'] ?? '');
      const body = compressed ? value.br! : value.body;
      response.setHeader('Content-Type', value.type); response.setHeader('Content-Length', body.length); response.setHeader('Vary', 'Accept-Encoding');
      if (compressed) response.setHeader('Content-Encoding', 'br'); response.end(body);
    } catch {response.writeHead(404); response.end('Not found');}
  })();});
  await new Promise<void>((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
  const address = server.address(); assert(address && typeof address !== 'string');
  return {origin: `http://127.0.0.1:${address.port}`, async close() {
    server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }};
}

export async function outputDirectory(root: string, requested: string) {
  const directory = path.resolve(root, requested), relative = path.relative(root, directory);
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Output must be an ignored directory inside this checkout');
  await runFile('git', ['--no-optional-locks', 'check-ignore', '--no-index', '--', relative + '/benchmark-output.json'],
    {cwd: root, env: {...process.env, GIT_OPTIONAL_LOCKS: '0'}});
  let ancestor = directory;
  while (true) {
    try {const real = await fs.realpath(ancestor); assert(real === root || real.startsWith(root + path.sep), 'Output ancestor escapes checkout'); break;}
    catch (error) {if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; ancestor = path.dirname(ancestor);}
  }
  await fs.mkdir(directory, {recursive: true});
  assert((await fs.realpath(directory)).startsWith(root + path.sep), 'Output symlink escapes checkout');
  return fs.mkdtemp(path.join(directory, 'matched-'));
}
async function seed(context: BrowserContext, origin: string, fixture: ReturnType<typeof makeBenchmarkCase>, isolatedProvider = false) {
  const page = await context.newPage();
  return withBenchmarkCleanup(async () => {
    await page.clock.setFixedTime(new Date(BENCHMARK_NOW)); await page.goto(origin + '/__benchmark__/seed');
    return await page.evaluate(seedBenchmarkProfile, {fixture, now: BENCHMARK_NOW, ...(isolatedProvider ? {provider: 'openrouter' as const} : {})});
  }, () => [{label: 'seed page', close: () => page.close()}]);
}
async function readStoredProfile(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('labcharts-blobs', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);});
    try {
      const tx = db.transaction('kv', 'readonly'), read = tx.objectStore('kv').get('labcharts-default-imported');
      return await new Promise<unknown>((resolve, reject) => {
        tx.oncomplete = () => {try {assertString(read.result); resolve(JSON.parse(read.result) as unknown);} catch (error) {reject(error);}};
        tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    } finally {db.close();}
    function assertString(value: unknown): asserts value is string {if (typeof value !== 'string') throw Error('Missing committed profile');}
  });
}
async function installBodyProbe(page: Page) {
  await page.addInitScript(() => {
    const view = window as unknown as ProbeWindow;
    view.benchmarkBodyProbe = {events: [], domAt: null, firstFrameAt: null, twoFramesAt: null};
    document.addEventListener('click', event => {
      if (!(event.target instanceof Element)) return;
      const menu = event.target.closest('button[aria-label="Menu"]'), body = event.target.closest('.nav-item[data-category="body"]');
      if (!menu && !body) return;
      view.benchmarkBodyProbe.events.push({target: menu ? 'menu' : 'body', at: performance.now()});
      if (!body) return;
      const main = document.getElementById('main-content'); if (!main) throw Error('Missing captured main root');
      const observer = new MutationObserver(() => {
        if (!main.isConnected || document.getElementById('main-content') !== main) {observer.disconnect(); return;}
        if (!main.querySelector('[data-nutrition-dashboard-view="intake"]')) return;
        view.benchmarkBodyProbe.domAt = performance.now(); observer.disconnect();
        requestAnimationFrame(() => {view.benchmarkBodyProbe.firstFrameAt = performance.now();
          requestAnimationFrame(() => {view.benchmarkBodyProbe.twoFramesAt = performance.now();});});
      });
      observer.observe(main, {subtree: true, childList: true});
    }, {capture: true});
  });
}
async function openBody(page: Page) {
  const begin = await page.evaluate(() => performance.now());
  const menu = page.getByRole('button', {name: 'Menu', exact: true});
  if (await menu.isVisible()) await menu.click();
  await page.locator('.nav-item[data-category="body"]').click();
  await page.locator('[data-nutrition-dashboard-view="intake"]').waitFor({state: 'visible'});
  const end = await page.evaluate(() => performance.now());
  await page.waitForFunction(() => (window as unknown as ProbeWindow).benchmarkBodyProbe.twoFramesAt !== null);
  const probe = await page.evaluate(() => (window as unknown as ProbeWindow).benchmarkBodyProbe);
  const click = probe.events.find(event => event.target === 'body'), menuClick = probe.events.find(event => event.target === 'menu');
  assert(click && probe.domAt !== null && probe.firstFrameAt !== null && probe.twoFramesAt !== null, 'Missing actual Body phase ownership');
  return {automatedJourneyMs: end - begin, beforeBodyClickMs: click.at - begin,
    menuToBodyClickMs: menuClick ? click.at - menuClick.at : null, clickToDOMMs: probe.domAt - click.at,
    clickToFirstFrameMs: probe.firstFrameAt - click.at, clickToTwoFramesMs: probe.twoFramesAt - click.at};
}
export const BENCHMARK_CHAT_CLOSE_SELECTOR = '[data-chat-action="close-panel"]';
async function openSettings(page: Page, closeChatFirst = false) {
  const begin = await page.evaluate(() => performance.now());
  // Returning empty profiles can open the onboarding chat over the app header.
  // The opt-in first-use workflow includes dismissing that genuine public UI.
  if (closeChatFirst) {
    const close = page.locator(BENCHMARK_CHAT_CLOSE_SELECTOR);
    if (await close.isVisible()) await close.click();
  }
  let launcher = page.locator('[data-shell-action="open-settings"]:visible').first();
  if (!await launcher.isVisible()) {
    await page.getByRole('button', {name: 'Menu', exact: true}).click();
    launcher = page.locator('[data-shell-action="open-settings"]:visible').first();
  }
  await launcher.click(); await page.locator('#settings-modal-overlay.show #settings-modal').waitFor({state: 'visible'});
  return await page.evaluate(() => performance.now()) - begin;
}
export interface BenchmarkNetworkState {pending: number; started: number; completed: number}
export const BENCHMARK_RESOURCE_IDLE_TIMEOUT_MS = 30000;
export const BENCHMARK_RESOURCE_QUIET_MS = 500;
/** Navigation load-state promises stay resolved after SPA actions; observe fresh activity. */
export async function waitForBenchmarkResourceIdle(read: () => BenchmarkNetworkState): Promise<void> {
  const begin = performance.now();
  let quietSince: number | undefined, previous: BenchmarkNetworkState | undefined;
  while (true) {
    const current = read(), now = performance.now();
    for (const count of [current.pending, current.started, current.completed]) {
      assert(Number.isSafeInteger(count) && count >= 0, 'Invalid resource-idle accounting');
    }
    const idle = current.pending === 0 && current.started === current.completed;
    const changed = previous && (previous.started !== current.started || previous.completed !== current.completed);
    if (!idle) quietSince = undefined;
    else if (quietSince === undefined || changed) quietSince = now;
    if (quietSince !== undefined && now - quietSince >= BENCHMARK_RESOURCE_QUIET_MS) return;
    const remaining = BENCHMARK_RESOURCE_IDLE_TIMEOUT_MS - (now - begin);
    assert(remaining > 0, 'Resource phase did not become freshly idle within 30000ms: ' + JSON.stringify(current));
    previous = {...current};
    await new Promise<void>(resolve => setTimeout(resolve, Math.min(25, remaining)));
  }
}
export interface BenchmarkResourceTiming {url: string; decodedBodyBytes: number}
export interface BenchmarkPhaseSnapshot {
  requests: RequestObservation[];
  transfers: {requestId: string; url: string | null; encodedBytes: number; encodedBodyBytes: number; status: number}[];
  resources: (BenchmarkResourceTiming & {requestId: string})[];
  resourceTimings: BenchmarkResourceTiming[];
  resourceTimingAvailable: boolean;
}
export interface Measurement extends SemanticSample {
  buildId: string; startupMs: number; firstUse: number | Awaited<ReturnType<typeof openBody>>;
  seed: {bytes: number; meals: number; wearableRows: number; labEntries: number};
  startupTextSHA256: string; startupHTMLSHA256: string; requests: number; transferBytes: number;
  resourcePhases?: {startup: BenchmarkPhaseSnapshot; firstUse: BenchmarkPhaseSnapshot};
  errors: string[]; externalRequests: string[]; requestLedger: RequestObservation[]; completedTransfers: {requestId: string; url: string | null; encodedBytes: number}[]; resourceTimingInventory: {url: string; bytes: number}[];
}
export async function measure(browser: Browser, artifact: Artifact, name: BenchmarkCaseName, pair: number,
  fixture: ReturnType<typeof makeBenchmarkCase>, options: Pick<BenchmarkOptions, 'device'> & {capturePhases?: boolean}): Promise<Measurement> {
  const context = await browser.newContext({...(options.device === 'mobile' ? devices['Pixel 5'] : {viewport: {width: 1440, height: 900}}),
    timezoneId: 'UTC', serviceWorkers: 'block'});
  const errors: string[] = [], externalRequests: string[] = [];
  const observed: {request: Request; observation: RequestObservation}[] = [];
  const inflight = new Map<Request, RequestObservation>(), finished: RequestObservation[] = [], failed: RequestObservation[] = [];
  let phase = 'seed', measuredPage: Page | undefined, seedInformation: unknown;
  return withBenchmarkCleanup(async () => {
    try {
      await context.route('**/*', route => {
        if (new URL(route.request().url()).origin !== artifact.server.origin) {externalRequests.push(route.request().url()); return route.abort();}
        return route.continue();
      });
      const seeded = await seed(context, artifact.server.origin, fixture, options.capturePhases), page = await context.newPage();
      measuredPage = page; seedInformation = {bytes: seeded.bytes, meals: seeded.meals, wearableRows: seeded.wearableRows,
        labEntries: seeded.labEntries, fixtureKeys: Object.keys(fixture.profile), committedKeys: Object.keys(seeded.profile)};
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {const observation: RequestObservation = {url: request.url(), method: request.method(), resourceType: request.resourceType(), completion: 'pending'}; if (new URL(observation.url).pathname.startsWith('/__benchmark__/')) errors.push('Measured page requested private seed module: ' + observation.url); observed.push({request, observation}); inflight.set(request, observation);});
      page.on('response', response => {const entry = inflight.get(response.request()); if (entry) entry.status = response.status();});
      page.on('requestfinished', request => {const entry = inflight.get(request); if (entry) {entry.completion = 'finished'; finished.push(entry); if (finished.length > 40) finished.shift();} inflight.delete(request);});
      page.on('requestfailed', request => {const entry = inflight.get(request); if (entry) {entry.completion = 'failed'; failed.push({...entry, error: request.failure()?.errorText ?? 'Unknown request failure'}); if (failed.length > 40) failed.shift();} inflight.delete(request);});
      await page.addInitScript(() => {
        const view = window as unknown as ProbeWindow; view.benchmarkCSP = [];
        document.addEventListener('securitypolicyviolation', event => {if (view.benchmarkCSP.length < 40) view.benchmarkCSP.push({blockedURI: event.blockedURI, effectiveDirective: event.effectiveDirective, disposition: event.disposition});});
      });
      if (options.capturePhases) await page.addInitScript(() => performance.setResourceTimingBufferSize(10000));
      await page.clock.setFixedTime(new Date(BENCHMARK_NOW)); await installBodyProbe(page);
      const cdp = await context.newCDPSession(page);
      const requestURLs = new Map<string, string>(), completedTransfers: Measurement['completedTransfers'] = [];
      const transportResponses = new Map<string, {status: number; encodedBodyBytes: number}>();
      const transportStarts = new Set<string>(), transportFailures: string[] = [];
      const decodedBodies = new Map<string, number>();
      cdp.on('Network.requestWillBeSent', event => {
        requestURLs.set(event.requestId, event.request.url);
        if (options.capturePhases) {
          if (transportStarts.has(event.requestId)) transportFailures.push('Repeated/redirected transport request: ' + event.requestId);
          transportStarts.add(event.requestId);
        }
      });
      if (options.capturePhases) {
        cdp.on('Network.responseReceived', event => {
          const contentLength = Object.entries(event.response.headers).find(([key]) => key.toLowerCase() === 'content-length')?.[1];
          transportResponses.set(event.requestId, {status: event.response.status,
            encodedBodyBytes: contentLength === undefined ? NaN : Number(contentLength)});
        });
        cdp.on('Network.dataReceived', event => {
          if (!Number.isSafeInteger(event.dataLength) || event.dataLength < 0) transportFailures.push('Invalid decoded data length: ' + event.requestId);
          decodedBodies.set(event.requestId, (decodedBodies.get(event.requestId) ?? 0) + event.dataLength);
        });
        cdp.on('Network.loadingFailed', event => transportFailures.push(event.requestId + ': ' + event.errorText));
      }
      cdp.on('Network.loadingFinished', event => completedTransfers.push({requestId: event.requestId,
        url: requestURLs.get(event.requestId) ?? null, encodedBytes: event.encodedDataLength}));
      async function snapshotResources(): Promise<BenchmarkPhaseSnapshot> {
        assert.equal(inflight.size, 0, 'Phase boundary still has pending measured-page requests');
        assert.deepEqual(transportFailures, [], 'Phase transport failures or redirects');
        assert.equal(completedTransfers.length, transportStarts.size, 'Phase transport requests lack completion');
        const resourceTimings = await page.evaluate(() =>
          [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')]
            .map(entry => ({url: entry.name, decodedBodyBytes: (entry as PerformanceResourceTiming).decodedBodySize})));
        const resources = completedTransfers.map(entry => {
          assert(entry.url, 'Decoded response lacks its actual URL');
          const decodedBodyBytes = decodedBodies.get(entry.requestId);
          assert(decodedBodyBytes !== undefined, 'Response lacks passive CDP decoded body accounting: ' + entry.requestId);
          return {requestId: entry.requestId, url: entry.url, decodedBodyBytes};
        });
        return {requests: observed.map(({observation}) => ({...observation})), resources,
          resourceTimings, resourceTimingAvailable: resourceTimings.length > 0,
          transfers: completedTransfers.map(entry => {
            const response = transportResponses.get(entry.requestId);
            assert(response, 'Phase transfer lacks response metadata: ' + entry.requestId);
            return {...entry, ...response};
          })};
      }
      await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', {cacheDisabled: true});
      await cdp.send('Emulation.setCPUThrottlingRate', {rate: 4});
      await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 100, downloadThroughput: 1250000, uploadThroughput: 625000, connectionType: 'cellular4g'});
      phase = 'navigation'; const start = performance.now(); await page.goto(artifact.server.origin + '/app?dev-sw=1', {waitUntil: 'domcontentloaded'});
      phase = 'app-ready'; await page.locator('html[data-app-ready][data-shell-framework="sveltekit"]').waitFor({state: 'attached', timeout: 90000});
      phase = 'biology-cards'; if (name !== 'empty') await page.waitForFunction(() => document.querySelectorAll('.biology-score-compact').length === 18, undefined, {timeout: 90000});
      const startupMs = performance.now() - start;
      assert.equal(await page.evaluate(() => (window as Window & {APP_BUILD_ID?: unknown}).APP_BUILD_ID), artifact.buildId, 'Browser/static artifact build identity differs');
      phase = 'network-idle'; await page.waitForLoadState('networkidle'); phase = 'settle'; await page.waitForTimeout(1500);
      const startup = await page.locator('#main-content').evaluate(element => ({text: element.textContent ?? '', html: element.innerHTML}));
      const networkState = () => {
        assert.deepEqual(externalRequests, [], 'External traffic invalidates the measured phase');
        assert.deepEqual(transportFailures, [], 'Failed transport invalidates the measured phase');
        return {pending: inflight.size, started: transportStarts.size, completed: completedTransfers.length};
      };
      if (options.capturePhases) await waitForBenchmarkResourceIdle(networkState);
      const startupResources = options.capturePhases ? await snapshotResources() : undefined;
      phase = 'first-use'; const firstUse = name === 'empty' ? await openSettings(page, options.capturePhases) : await openBody(page);
      const semantic = await page.locator(name === 'empty' ? '#settings-modal' : '#main-content').evaluate(element => ({text: element.textContent ?? '', html: element.innerHTML}));
      let resourcePhases: Measurement['resourcePhases'];
      if (options.capturePhases) {
        await page.waitForLoadState('networkidle');
        await waitForBenchmarkResourceIdle(networkState);
        const complete = await snapshotResources();
        assert.deepEqual(await page.evaluate(() => (window as unknown as ProbeWindow).benchmarkCSP), [], 'Browser CSP violations');
        assert(startupResources, 'Missing startup phase boundary');
        assert.deepEqual(complete.requests.slice(0, startupResources.requests.length), startupResources.requests, 'Startup requests changed after their phase boundary');
        assert.deepEqual(complete.transfers.slice(0, startupResources.transfers.length), startupResources.transfers, 'Startup transfers changed after their phase boundary');
        assert.deepEqual(complete.resources.slice(0, startupResources.resources.length), startupResources.resources, 'Startup decoded response entries changed after their phase boundary');
        assert.equal(complete.resourceTimingAvailable, startupResources.resourceTimingAvailable, 'ResourceTiming availability changed across phases');
        assert.deepEqual(complete.resourceTimings.slice(0, startupResources.resourceTimings.length), startupResources.resourceTimings, 'Startup resource timing entries changed after their phase boundary');
        resourcePhases = {startup: startupResources, firstUse: {
          requests: complete.requests.slice(startupResources.requests.length),
          transfers: complete.transfers.slice(startupResources.transfers.length),
          resources: complete.resources.slice(startupResources.resources.length),
          resourceTimings: complete.resourceTimings.slice(startupResources.resourceTimings.length),
          resourceTimingAvailable: complete.resourceTimingAvailable,
        }};
      }
      phase = 'durable-and-resource-guards'; const stored = await readStoredProfile(page); assert.deepEqual(stored, seeded.profile, 'Measured app changed the whole durable synthetic profile');
      const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => ({url: entry.name, bytes: (entry as PerformanceResourceTiming).transferSize})));
      phase = 'resource-accounting';
      const measuredRequests = observed.map(({observation}) => ({...observation}));
      const transferSnapshot = completedTransfers.map(entry => ({...entry}));
      if (resourcePhases) {
        assert.deepEqual(measuredRequests, [...resourcePhases.startup.requests, ...resourcePhases.firstUse.requests], 'Requests changed after the final resource boundary');
        assert.deepEqual(transferSnapshot, [...resourcePhases.startup.transfers, ...resourcePhases.firstUse.transfers]
          .map(({requestId, url, encodedBytes}) => ({requestId, url, encodedBytes})), 'Transfers changed after the final resource boundary');
        assert.equal(inflight.size, 0, 'Requests started after the final resource boundary');
      }
      assert(!measuredRequests.some(entry => new URL(entry.url).pathname.startsWith('/__benchmark__/')), 'Measured page loaded seed modules');
      assert(measuredRequests.length > 0, 'Missing actual measured-page request inventory');
      assert.deepEqual(errors, [], 'Browser page errors'); assert.deepEqual(externalRequests, [], 'Unexpected external requests');
      return {caseName: name, variant: artifact.variant, pair, buildId: artifact.buildId, startupMs, firstUse,
        ...(resourcePhases ? {resourcePhases} : {}),
        seed: {bytes: seeded.bytes, meals: seeded.meals, wearableRows: seeded.wearableRows, labEntries: seeded.labEntries},
        seedProfileSHA256: hash(JSON.stringify(seeded.profile)), storedProfileSHA256: hash(JSON.stringify(stored)),
        textSHA256: hash(semantic.text), htmlSHA256: hash(semantic.html), startupTextSHA256: hash(startup.text), startupHTMLSHA256: hash(startup.html),
        requests: measuredRequests.length, transferBytes: transferSnapshot.reduce((sum, entry) => sum + entry.encodedBytes, 0),
        requestLedger: measuredRequests, completedTransfers: transferSnapshot, resourceTimingInventory: resources, errors, externalRequests};
    } catch (error) {
      const browserSnapshot = browser.isConnected() && measuredPage && !measuredPage.isClosed() ? await measuredPage.evaluate(() => ({
        url: location.href, ready: document.documentElement.hasAttribute('data-app-ready'), cards: document.querySelectorAll('.biology-score-compact').length,
        csp: (window as unknown as ProbeWindow).benchmarkCSP, resources: performance.getEntriesByType('resource').map(entry => entry.name),
      })).catch(evaluationError => ({evaluationError: String(evaluationError)})) : null;
      throw new Error(`Benchmark ${name}/${artifact.variant} failed during ${phase}`, {cause: {
        error: String(error), originalError: benchmarkErrorDetails(error), caseName: name, variant: artifact.variant, buildId: artifact.buildId, pair, phase, seedInformation,
        inflight: [...inflight.values()], recentlyFinished: finished, recentlyFailed: failed, errors, externalRequests, browser: browserSnapshot,
      }});
    }
  }, () => benchmarkContextCleanup(browser, context));
}
function summary(rows: Measurement[], cases: BenchmarkCaseName[], pairs: number) {
  return cases.map(caseName => {
    const selected = rows.filter(row => row.caseName === caseName);
    const metrics = (row: Measurement): Record<string, number | null> => ({startupMs: row.startupMs,
      ...(typeof row.firstUse === 'number' ? {settingsJourneyMs: row.firstUse} : row.firstUse)});
    const names = Object.keys(metrics(selected[0]!));
    return {caseName, medians: Object.fromEntries(['baseline', 'candidate'].map(variant => [variant, Object.fromEntries(names.map(name =>
      [name, selected.every(row => metrics(row)[name] === null) ? null : benchmarkMedian(selected.filter(row => row.variant === variant).map(row => {const value = metrics(row)[name]; assert(typeof value === 'number'); return value;}))]))])),
    pairedDeltas: Array.from({length: pairs}, (_, pair) => {
      const before = metrics(selected.find(row => row.pair === pair && row.variant === 'baseline')!), after = metrics(selected.find(row => row.pair === pair && row.variant === 'candidate')!);
      return {pair, ...Object.fromEntries(names.map(name => [name, after[name] === null && before[name] === null ? null : Number(after[name]) - Number(before[name])]))};
    })};
  });
}
async function main() {
  const root = await fs.realpath(process.cwd()), options = parseBenchmarkOptions(process.argv.slice(2));
  const output = await outputDirectory(root, options.output), artifacts: Artifact[] = [];
  let browser: Browser | undefined;
  const rows: Measurement[] = [];
  try {
    const report = await withBenchmarkCleanup(async () => {
      const inputs: (Omit<Artifact, 'server'> & {revision: string})[] = [];
      for (const variant of ['baseline', 'candidate'] as const) {
        const artifact = await readBenchmarkArtifact(path.resolve(root, options[variant]));
        inputs.push({variant, ...artifact, revision: await readBenchmarkDeploymentRevision(artifact.directory)});
      }
      const baseline = inputs.find(input => input.variant === 'baseline'), candidate = inputs.find(input => input.variant === 'candidate');
      assert(baseline && candidate, 'Missing matched artifact pair');
      assertBenchmarkRevisionParity(options.cases, baseline.revision, candidate.revision);
      for (const input of inputs) artifacts.push({...input, server: await startServer(root, input.directory, {deploymentMetadata: true})});
      const demo = JSON.parse(await fs.readFile(path.join(root, 'data/demo-male.json'), 'utf8')) as unknown;
      browser = await chromium.launch({headless: true, channel: 'chromium', env: headlessBrowserEnvironment(path.join(output, 'runtime'))});
      for (const name of options.cases) {
        const fixture = makeBenchmarkCase(name, demo);
        for (let pair = 0; pair < options.pairs; pair++) for (const artifact of pair % 2 ? [...artifacts].reverse() : artifacts) {
          const row = await measure(browser, artifact, name, pair, fixture, {...options, capturePhases: true});
          assert.deepEqual(row.errors, [], 'Page/private-module errors during cleanup'); assert.deepEqual(row.externalRequests, [], 'External requests during cleanup'); rows.push(row);
          await fs.writeFile(path.join(output, 'partial.json'), JSON.stringify({options, rows}, null, 2) + '\n');
          console.log(JSON.stringify({case: name, pair, variant: artifact.variant, startupMs: row.startupMs, firstUse: row.firstUse}));
        }
      }
      assertBenchmarkParity(rows, options.cases, options.pairs);
      assertBenchmarkParity(rows.map(row => ({...row, textSHA256: row.startupTextSHA256, htmlSHA256: row.startupHTMLSHA256})), options.cases, options.pairs);
      const seedFiles = ['data/demo-male.json', 'scripts/benchmark-static.mts', 'scripts/benchmark-static-fixtures.mts', 'js/profile.ts', 'js/profile-data-migrations.ts', 'js/crypto.ts', 'js/nutrition-store.ts', 'js/wearables-store.ts'];
      const seedProvenance = Object.fromEntries(await Promise.all(seedFiles.map(async file => [file, hash(await fs.readFile(path.join(root, file)))])));
      return {conditions: {headless: true, fixedDate: BENCHMARK_NOW, cpuRate: 4, latencyMs: 100,
        downloadBytesPerSecond: 1250000, brotli: true, cache: 'disabled', serviceWorkers: 'blocked', seedExcluded: true, timingGates: false,
        phases: 'Fresh complete startup and incremental first-use resource boundaries. Settings includes genuine visible Close chat when present; whole journeys include locator/drawer waiting, with actual Body click-to-DOM/frames separate.',
        providerFixture: 'Supported OpenRouter selected, AI paused, no keys; no local discovery or live inference',
        deploymentMetadataFixture: {path: '/api/commit', source: 'Each frozen artifact build-metrics.revision', ref: 'local-performance-fixture', responseCounted: true},
        fixturePolicy: {laboratoryFields: LABORATORY_SEED_FIELDS, normalization: 'Public createDefaultProfileData + migrateProfileData before commit; no Light sessions, provider settings or cached demo AI'},
        resourceMethod: 'Complete measured-page requests and passive CDP response transfer/body/decoded data at fresh startup/first-use boundaries, with zero pending work and a new 500ms quiet interval. Raw advisory ResourceTiming is explicitly available or unavailable under the fixed clock.',
        semanticPolicy: 'Exact raw text and whole durable profile. Exact complete markup for empty/control/laboratory cases. Other markup hashes retained without normalization.'},
        options, artifacts: inputs.map(({variant, directory, buildId, revision}) => ({variant, directory, buildId, revision})), seedProvenance, rows, summary: summary(rows, options.cases, options.pairs)};
    }, () => [{label: 'browser', close: async () => {await browser?.close();}},
      ...artifacts.map(artifact => ({label: `${artifact.variant} server`, close: () => artifact.server.close()}))]);
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`Matched local observations: ${output}/results.json`);
  } catch (error) {
    try {
      await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({error: String(error),
        cause: benchmarkErrorDetails(error instanceof Error ? error.cause : null), details: benchmarkErrorDetails(error), options, rows}, null, 2) + '\n');
    } catch (receiptError) {throw new AggregateError([error, receiptError], 'Benchmark failure receipt could not be written', {cause: error});}
    throw error;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
