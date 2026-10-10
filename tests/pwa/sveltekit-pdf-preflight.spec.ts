import path from 'node:path';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {expect, test, type Page} from '@playwright/test';
import {createDefaultProfileData, migrateProfileData} from '../../js/profile.js';
import type {ProfileData} from '../../types/app-state.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';

const fixtureDirectory = path.resolve('tests/fixtures/pdf-preflight');
const originalAuthoritySha = '1c653128ae1680552c8ad53f7a189cf77a21b73013db5a3e815ccf43ea41baf1';
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

interface Asset {
  path: string;
  bytes: number;
  sha256: string;
}
interface OriginalPdf {
  name: string;
  bytes: number;
  mimeType: string;
  fileSha256: string;
  extractedText: string;
  extractedTextSha256: string;
  importHash: string;
  extractedTextLength: number;
}
interface ParserAuthority {
  schemaVersion: 1;
  originalParserAuthoritySHA256: string;
  records: OriginalPdf[];
  vendorFiles: Asset[];
}
interface Artifact {
  artifactDirectory: string;
  files: Asset[];
  requiredPdfCachePaths: string[];
  servedFixture: {workerSha256: string; versionSha256: string};
}
function artifactDirectory() {
  return process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
}
interface FileReceipt {
  type: string;
  target: string;
  trusted: boolean;
  length: number;
  nativeFileList: boolean;
  nativeFile: boolean;
  name: string | null;
  bytes: number | null;
  mimeType: string | null;
  sha256: string | null;
  at: number;
}
interface ActionReceipt {
  type: string;
  target: string;
  text: string | null;
  trusted: boolean;
  at: number;
}
interface ObservedWindow extends Window {
  pdfPwaFiles: FileReceipt[];
  pdfPwaActions: ActionReceipt[];
  pdfPwaPendingFiles: Promise<void>[];
  reportPdfPwaCsp(value: string): Promise<void>;
  reportPdfPwaObserverError(value: string): Promise<void>;
}
interface Snapshot {
  stored: Record<string, unknown>;
  rawCommitted: string;
  provider: string | null;
  config: string | null;
}
interface Benchmark extends Record<string, unknown> {
  id: string;
  benchmarkAt: number;
  updatedAt: number;
  finishedAt: number;
  totalMs: number;
}

async function verifyFile(base: string, record: Asset) {
  const file = path.resolve(base, record.path);
  expect(file.startsWith(path.resolve(base) + path.sep), 'Contained relative authority path').toBe(true);
  const bytes = await fs.readFile(file);
  expect(bytes.length, record.path).toBe(record.bytes);
  expect(sha(bytes), record.path).toBe(record.sha256);
}
async function diskFiles(directory: string, prefix = ''): Promise<string[]> {
  const entries = await fs.readdir(path.join(directory, prefix), {withFileTypes: true});
  const records: string[] = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) records.push(...await diskFiles(directory, relative));
    else {expect(entry.isFile(), 'No non-file artifact entries').toBe(true); records.push(relative);}
  }
  return records.sort();
}
/** Immutable fixture expectations come from the original parser capture, never current output. */
async function readInputsAndArtifact() {
  const parserBytes = await fs.readFile(path.join(fixtureDirectory, 'parser-text-authority.json'));
  const original = JSON.parse(parserBytes.toString()) as ParserAuthority;
  expect(original.schemaVersion).toBe(1);
  expect(original.originalParserAuthoritySHA256).toBe(originalAuthoritySha);
  expect(original.records.map(file => file.name)).toEqual(['duplicate.pdf', 'model-mismatch.pdf', 'image-only.pdf']);
  expect(original.records.map(file => file.extractedTextLength)).toEqual([302, 308, 0]);
  expect(original.records.map(file => file.importHash)).toEqual(['1ka10vz', '1nsvdvw', '45h']);
  for (const file of original.records) {
    await verifyFile(fixtureDirectory, {path: file.name, bytes: file.bytes, sha256: file.fileSha256});
    expect(sha(file.extractedText)).toBe(file.extractedTextSha256);
    expect(file.extractedText.length).toBe(file.extractedTextLength);
  }
  const directory = artifactDirectory();
  const files: Asset[] = [];
  for (const relative of await diskFiles(directory)) {
    const bytes = await fs.readFile(path.join(directory, relative));
    files.push({path: relative, bytes: bytes.length, sha256: sha(bytes)});
  }
  for (const vendor of original.vendorFiles) await verifyFile(directory, vendor);
  expect(original.vendorFiles.map(file => file.path)).toEqual(['vendor/pdf.min.mjs', 'vendor/pdf.worker.min.mjs']);
  const sw = await fs.readFile(path.join(directory, 'service-worker.js'), 'utf8');
  const version = await fs.readFile(path.join(directory, 'version.js'), 'utf8');
  expect(sw).toMatch(/const BUILD_ID = '[^']+';/);
  const shellMatch = sw.match(/const APP_SHELL = (\[[\s\S]*?\]);/);
  expect(shellMatch, 'Actual compiled APP_SHELL required').not.toBeNull();
  const shell = JSON.parse(shellMatch![1]!) as string[];
  expect(shell.every(url => typeof url === 'string' && url.startsWith('/'))).toBe(true);
  // Assembly bundles the public PDF controllers into immutable app chunks. Check
  // all cached immutable JS/CSS rather than importing pruned source-module URLs.
  const requiredPdfCachePaths = shell.filter(url => /^\/_app\/immutable\/.*\.(?:js|css)$/.test(url));
  expect(requiredPdfCachePaths.length).toBeGreaterThan(0);
  for (const vendor of original.vendorFiles) {
    expect(shell).toContain('/' + vendor.path);
    requiredPdfCachePaths.push('/' + vendor.path);
  }
  expect(new Set(requiredPdfCachePaths).size).toBe(requiredPdfCachePaths.length);
  for (const url of requiredPdfCachePaths) expect(files.some(file => '/' + file.path === url)).toBe(true);
  const servedSw = sw.replace(/const BUILD_ID = '[^']*';/, "const BUILD_ID = 'kit-test-a';")
    .replace('const APP_SHELL = [', "const APP_SHELL = [\n  '/js/bundle-legacy-probe-AAA.js',");
  const servedVersion = version.replace(/self.APP_BUILD_ID = '[^']*';/, "self.APP_BUILD_ID = 'kit-test-a';");
  const current: Artifact = {artifactDirectory: directory, files, requiredPdfCachePaths,
    servedFixture: {workerSha256: sha(servedSw), versionSha256: sha(servedVersion)}};
  return {current, original: original.records, parserAuthoritySHA256: sha(parserBytes), artifactSHA256: sha(JSON.stringify(files))};
}

async function profile(page: Page): Promise<Snapshot> {
  return page.evaluate(async () => {
    const key = 'labcharts-default-imported';
    if (localStorage.getItem('labcharts-active-profile') !== 'default'
      || localStorage.getItem('labcharts-encryption-enabled') === 'true' || localStorage.getItem(key) !== null)
      throw new Error('Expected native committed profile, encryption disabled, no localStorage fallback');
    const open = indexedDB.open('labcharts-blobs', 1);
    open.onupgradeneeded = () => open.transaction?.abort();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);});
    try {
      const tx = db.transaction('kv', 'readonly'), request = tx.objectStore('kv').get(key);
      const rawCommitted = await new Promise<string>((resolve, reject) => {
        tx.oncomplete = () => typeof request.result === 'string' ? resolve(request.result) : reject(new Error('Missing native committed PDF profile'));
        tx.onabort = () => reject(tx.error || new Error('Native profile read aborted'));
        tx.onerror = () => reject(tx.error || request.error);
      });
      return {stored: JSON.parse(rawCommitted) as Record<string, unknown>, rawCommitted,
        provider: localStorage.getItem('labcharts-ai-provider'), config: localStorage.getItem('labcharts-ollama')};
    } finally {db.close();}
  });
}
/** Read the native device vault without creating keys, changing credentials or contacting the configured server. */
async function decodedProviderConfig(page: Page, raw: string | null): Promise<Record<string, unknown>> {
  expect(raw).toMatch(/^d1:[^:]+:[^:]+$/);
  const decoded = await page.evaluate(async envelope => {
    const storageKey = 'labcharts-ollama';
    if (localStorage.getItem(storageKey) !== envelope) throw new Error('Provider configuration changed before read');
    const open = indexedDB.open('labcharts-wearables-credential-vault', 1);
    open.onupgradeneeded = () => open.transaction?.abort();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);});
    let key: CryptoKey;
    try {
      const tx = db.transaction('meta', 'readonly'), request = tx.objectStore('meta').get('credential-vault-key:v1');
      key = await new Promise<CryptoKey>((resolve, reject) => {
        tx.oncomplete = () => request.result?.v ? resolve(request.result.v as CryptoKey) : reject(new Error('Missing native device key'));
        tx.onabort = () => reject(tx.error || new Error('Native device key read aborted'));
        tx.onerror = () => reject(tx.error || request.error);
      });
    } finally {db.close();}
    if (key.type !== 'secret' || key.extractable || key.algorithm.name !== 'AES-GCM' || !key.usages.includes('decrypt'))
      throw new Error('Unexpected native device key');
    const parts = envelope!.split(':');
    const bytes = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));
    const iv = bytes(parts[1]!);
    if (iv.byteLength !== 12) throw new Error('Unexpected native credential IV');
    const plaintext = await crypto.subtle.decrypt({name: 'AES-GCM', iv}, key, bytes(parts[2]!));
    const authenticated = JSON.parse(new TextDecoder().decode(plaintext)) as {storageKey?: unknown; plaintext?: unknown};
    if (authenticated.storageKey !== storageKey || typeof authenticated.plaintext !== 'string')
      throw new Error('Native credential storage binding failed');
    if (localStorage.getItem(storageKey) !== envelope) throw new Error('Provider configuration changed during read');
    return JSON.parse(authenticated.plaintext) as Record<string, unknown>;
  }, raw);
  return decoded;
}
function withoutBenchmarks(snapshot: Snapshot) {
  const {importBenchmarks, ...rest} = snapshot.stored;
  expect(Array.isArray(importBenchmarks)).toBe(true);
  return rest;
}
async function cacheReceipt(page: Page, authority: Artifact) {
  const observed = await page.evaluate(async urls => {
    if (!navigator.serviceWorker.controller) throw new Error('No native controlling service worker');
    const entries = [];
    for (const url of urls) {
      const response = await caches.match(new URL(url, location.origin).href);
      if (!response || !response.ok) throw new Error('Missing native cached PDF dependency: ' + url);
      const bytes = await response.arrayBuffer();
      const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
      entries.push({path: url, bytes: bytes.byteLength, sha256});
    }
    return {controller: navigator.serviceWorker.controller.scriptURL, keys: await caches.keys(), entries};
  }, authority.requiredPdfCachePaths);
  for (const entry of observed.entries) {
    const file = authority.files.find(file => '/' + file.path === entry.path)!;
    expect(entry.bytes).toBe(file.bytes); expect(entry.sha256).toBe(file.sha256);
  }
  return observed;
}

// Public original-derived cancellation contracts. All timer values/clocks, parser,
// worker protocol, provider guards and UI controllers remain real and unmodified.
test('fresh static PDF first offline use and two zero-page cold launches preserve native cancellation and complete committed profiles', async ({page, context}, info) => {
  test.setTimeout(180000);
  const authority = await readInputsAndArtifact(); // Require physical fixtures and the actual assembled artifact before serving it.
  await installDiscussionFixture(context, {paused: true});
  await installOfflineStartupDiagnostics(context);
  const demo = JSON.parse(await fs.readFile('data/demo-male.json', 'utf8')) as Pick<ProfileData, 'entries' | 'refOverrides'>;
  let seeded = migrateProfileData({...createDefaultProfileData(), entries: structuredClone(demo.entries), refOverrides: demo.refOverrides,
    profile: {firstName: 'Synthetic', age: 38}, notes: [{date: '2026-09-01', text: 'Retain unrelated PDF PWA note'}],
    contextNotes: 'Retain full PDF PWA profile', markerNotes: {'thyroid.tsh': 'Retain marker note'},
    sunDefaults: {fitzpatrick: 'II', completedAt: 1}});
  expect(seeded.entries.length).toBeGreaterThan(0);
  seeded.entries[0]!.importHash = authority.original[0]!.importHash;
  seeded.entries[0]!.date = '2026-06-01';
  seeded.entries[seeded.entries.length - 1]!.importedWith = {provider: 'ollama', modelId: 'fixture-prior'};
  seeded.importBenchmarks = [];
  seeded = migrateProfileData(seeded); // Native canonicalization after synthetic hash/history seed.
  await context.addInitScript(({seeded}) => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('pdf-pwa-seeded')) return;
    localStorage.setItem('pdf-pwa-seeded', '1');
    localStorage.setItem('labcharts-profiles', JSON.stringify([{id: 'default', name: 'Synthetic PDF profile', sex: 'male', dob: '1987-11-22', createdAt: 1}]));
    localStorage.setItem('labcharts-active-profile', 'default');
    localStorage.setItem('labcharts-analytics-disabled', 'true');
    localStorage.setItem('labcharts-show-product-recs', 'false');
    localStorage.setItem('labcharts-ollama', JSON.stringify({url: 'http://127.0.0.1:11434', model: 'fixture-current', mode: 'ollama'}));
    localStorage.setItem('labcharts-default-imported', JSON.stringify(seeded));
  }, {seeded});
  const errors: string[] = [], csp: string[] = [], external: string[] = [];
  const workers: Array<{page: string; url: string}> = [], consoles: Array<{page: string; type: string; text: string}> = [];
  const requests: Array<{url: string; method: string}> = [], responses: Array<{url: string; status: number; fromServiceWorker: boolean}> = [];
  const observe = (target: Page) => {
    target.on('pageerror', error => errors.push(error.message));
    target.on('worker', worker => workers.push({page: target.url(), url: worker.url()}));
    target.on('console', message => consoles.push({page: target.url(), type: message.type(), text: message.text()}));
  };
  observe(page); context.on('page', observe);
  context.on('request', request => requests.push({url: request.url(), method: request.method()}));
  context.on('response', response => responses.push({url: response.url(), status: response.status(), fromServiceWorker: response.fromServiceWorker()}));
  await context.exposeBinding('reportPdfPwaCsp', (_, value: string) => csp.push(value));
  await context.exposeBinding('reportPdfPwaObserverError', (_, value: string) => errors.push(value));
  await context.addInitScript(() => {
    const observed = window as unknown as ObservedWindow;
    observed.pdfPwaFiles = []; observed.pdfPwaActions = []; observed.pdfPwaPendingFiles = [];
    for (const type of ['input', 'change', 'click', 'keydown']) document.addEventListener(type, event => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target instanceof HTMLInputElement && target.id === 'pdf-input' && ['input', 'change'].includes(type)) {
        const file = target.files?.[0];
        const receipt: FileReceipt = {type, target: target.id, trusted: event.isTrusted, length: target.files?.length ?? -1,
          nativeFileList: target.files instanceof FileList, nativeFile: file instanceof File,
          name: file?.name ?? null, bytes: file?.size ?? null, mimeType: file?.type ?? null, sha256: null, at: performance.now()};
        observed.pdfPwaFiles.push(receipt);
        if (file) observed.pdfPwaPendingFiles.push(file.arrayBuffer().then(async bytes => {
          receipt.sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
        }).catch(error => {void observed.reportPdfPwaObserverError(String(error));}));
      }
      if (target.closest('#confirm-dialog-overlay')) observed.pdfPwaActions.push({type, target: target.id || target.tagName,
        text: target.textContent, trusted: event.isTrusted, at: performance.now()});
    }, true);
    document.addEventListener('securitypolicyviolation', event => {void observed.reportPdfPwaCsp(event.violatedDirective);});
  });
  const server = await startKitServer(authority.current.artifactDirectory); let closed = false;
  const phases: unknown[] = [];
  let baseline: Snapshot | null = null;
  let lastCommitted: Snapshot | null = null;
  let attemptCount = 0;
  const recordFiles = async (target: Page) => target.evaluate(async () => {
    const observed = window as unknown as ObservedWindow;
    await Promise.all(observed.pdfPwaPendingFiles);
    return {files: observed.pdfPwaFiles, actions: observed.pdfPwaActions};
  });
  try {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== server.origin) {external.push(url.href); await route.abort();}
    else await route.continue();
  });
    await ready(page, server.origin); await ready(page, server.origin);
    baseline = await profile(page);
    lastCommitted = baseline;
    expect(baseline.stored.entries).toEqual(seeded.entries);
    expect(baseline.stored.importBenchmarks).toEqual([]);
    expect(baseline.provider).toBe('ollama');
    expect(await decodedProviderConfig(page, baseline.config)).toMatchObject({model: 'fixture-current', url: 'http://127.0.0.1:11434'});
    expect(workers.filter(worker => worker.url.endsWith('/vendor/pdf.worker.min.mjs'))).toEqual([]);
    const onlineCache = await cacheReceipt(page, authority.current);
    const servedWorker = await fetch(server.origin + '/service-worker.js').then(response => response.arrayBuffer());
    const servedVersion = await fetch(server.origin + '/version.js').then(response => response.arrayBuffer());
    expect(sha(new Uint8Array(servedWorker))).toBe(authority.current.servedFixture.workerSha256);
    expect(sha(new Uint8Array(servedVersion))).toBe(authority.current.servedFixture.versionSha256);
    await server.close(); closed = true;
    await expect(fetch(server.origin + '/index.html')).rejects.toThrow();
    phases.push({phase: 'online-baseline-and-actual-listener-closed', baseline, onlineCache});
    for (let launch = 0; launch < 3; launch++) {
      const target = launch === 0 ? page : await context.newPage();
      if (launch > 0) await ready(target, server.origin);
      expect(await profile(target)).toEqual(lastCommitted);
      const cache = await cacheReceipt(target, authority.current);
      const workerStart = workers.length;
      await target.evaluate(() => localStorage.setItem('labcharts-ai-paused', 'false'));
      for (const file of authority.original) {
        const before = await profile(target);
        const filesBefore = (await recordFiles(target)).files.length;
        await target.locator('#pdf-input').setInputFiles(path.join(fixtureDirectory, file.name));
        const overlay = target.locator('#confirm-dialog-overlay');
        const dialog = overlay.locator('.confirm-dialog');
        await expect(overlay).toHaveClass(/\bshow\b/);
        const cancel = dialog.getByRole('button', {name: 'Cancel', exact: true});
        await expect(cancel).toBeFocused();
        const buttons = await dialog.getByRole('button').allTextContents();
        if (file.name === 'duplicate.pdf') {
          expect(buttons.map(text => text.trim())).toEqual(['Cancel', 'Import Anyway']);
          await expect(dialog.locator('.confirm-message strong')).toHaveText('Jun 1, 2026');
        } else if (file.name === 'model-mismatch.pdf') {
          expect(buttons.map(text => text.trim())).toEqual(['Cancel', 'Continue Anyway', 'Switch to fixture-prior']);
          expect(await dialog.locator('.confirm-message strong').allTextContents()).toEqual(['fixture-prior', 'fixture-current']);
        } else {
          expect(buttons.map(text => text.trim())).toEqual(['Cancel', 'Try text anyway', 'Use image mode']);
          await expect(dialog).toContainText('Limited text extracted');
          await expect(dialog).toContainText('This skips PII obfuscation');
        }
        // The real PDF handler renders progress before its preflight/mode-selection await.
        // Prove the migrated siblings and their CSS arrived from the stopped-origin cache.
        const progress = target.locator('#drop-zone');
        const progressBar = progress.locator('.import-progress-bar');
        const progressPct = file.name === 'image-only.pdf' ? '5' : '8';
        await expect(progressBar).toHaveAttribute('role', 'progressbar');
        await expect(progressBar).toHaveAttribute('aria-valuenow', progressPct);
        await expect(progress.locator('.import-progress-bar-fill')).toHaveAttribute('style', 'width:' + progressPct + '%');
        await expect(progress.locator('.progress-step')).toHaveCount(5);
        await expect(progress.locator('.progress-step.active')).toHaveCount(1);
        await expect(progress.locator('.import-progress-filename')).toHaveText(file.name);
        const nativeProgress = await progress.evaluate(node => {
          const spinner = node.querySelector('.progress-spinner')!, bar = node.querySelector('.import-progress-bar')!;
          const css = getComputedStyle(spinner);
          return {html: node.outerHTML, spinner: {width: css.width, height: css.height, topColor: css.borderTopColor,
            rightColor: css.borderRightColor, animationName: css.animationName, animationDuration: css.animationDuration},
            barColor: getComputedStyle(bar).backgroundColor};
        });
        expect(nativeProgress.spinner).toMatchObject({width: '18px', height: '18px', animationName: 'progressSpin', animationDuration: '0.8s'});
        expect(nativeProgress.spinner.topColor).not.toBe(nativeProgress.spinner.rightColor);
        expect(nativeProgress.spinner.rightColor).toBe(nativeProgress.barColor);
        const nativeDialog = {html: await dialog.evaluate(node => node.outerHTML), buttons, focused: await cancel.evaluate(node => node === document.activeElement)};
        await expect(target.locator('.pii-warning-overlay')).toHaveCount(0);
        await cancel.click();
        await expect(overlay).not.toHaveClass(/\bshow\b/);
        await expect(target.locator('#pdf-input')).toHaveValue('');
        attemptCount++;
        await expect.poll(async () => (await profile(target)).stored.importBenchmarks as unknown[]).toHaveLength(attemptCount);
        await expect.poll(async () => ((await profile(target)).stored.importBenchmarks as Benchmark[]).at(-1)?.status).toBe('stopped');
        const after = await profile(target);
        lastCommitted = after;
        expect(withoutBenchmarks(after)).toEqual(withoutBenchmarks(baseline));
        expect(after.provider).toBe(baseline.provider); expect(after.config).toBe(baseline.config);
        const previous = before.stored.importBenchmarks as Benchmark[], records = after.stored.importBenchmarks as Benchmark[];
        expect(records.slice(0, -1)).toEqual(previous); expect(records).toHaveLength(previous.length + 1);
        expect(new Set(records.map(record => record.id)).size).toBe(records.length);
        const record = records.at(-1)!;
        const image = file.name === 'image-only.pdf', stage = image ? 'mode-selection' : 'preflight';
        expect(Object.keys(record).sort()).toEqual(['id', 'benchmarkAt', 'updatedAt', 'status', 'stage', 'fileName', 'fileSize', 'inputHash', 'importMode',
          'inputChars', 'pageCount', 'provider', 'modelId', 'runtime', 'timings', 'usage', 'diagnostics', 'textQuality', 'reason', 'totalMs', 'finishedAt'].sort());
        expect(record).toMatchObject({status: 'stopped', stage, reason: stage, fileName: file.name, fileSize: file.bytes,
          inputHash: '', importMode: 'text', inputChars: file.extractedTextLength, pageCount: image ? 0 : 1,
          textQuality: image ? 'empty' : 'good', provider: 'ollama', modelId: 'fixture-current', runtime: null, timings: {}, usage: {}, diagnostics: {}});
        expect(record.id).toMatch(/^bench_/);
        for (const value of [record.benchmarkAt, record.updatedAt, record.finishedAt, record.totalMs]) expect(Number.isFinite(value)).toBe(true);
        expect(record.benchmarkAt).toBeGreaterThan(0); expect(record.finishedAt).toBeGreaterThanOrEqual(record.benchmarkAt);
        expect(record.updatedAt).toBeGreaterThanOrEqual(record.finishedAt); expect(record.totalMs).toBeGreaterThanOrEqual(0);
        if (previous.length) expect(record.benchmarkAt).toBeGreaterThanOrEqual(previous.at(-1)!.finishedAt);
        const native = await recordFiles(target), newFiles = native.files.slice(filesBefore);
        expect(newFiles.map(event => event.type)).toEqual(['input', 'change']);
        for (const event of newFiles) expect(event).toMatchObject({trusted: true, length: 1, nativeFileList: true, nativeFile: true,
          name: file.name, bytes: file.bytes, mimeType: file.mimeType, sha256: file.fileSha256});
        expect(native.actions.filter(event => event.type === 'click' && event.text?.trim() === 'Cancel').length).toBe(authority.original.indexOf(file) + 1);
        expect(native.actions.filter(event => event.type === 'click').every(event => event.trusted)).toBe(true);
        phases.push({phase: 'offline-' + launch + ':' + file.name, before, after, nativeDialog, nativeProgress, native,
          workers: workers.slice(workerStart), originalInput: file, cache});
      }
      await expect.poll(() => workers.slice(workerStart).filter(worker => { const url = new URL(worker.url, worker.page); return url.origin === server.origin && url.pathname === '/vendor/pdf.worker.min.mjs'; }).length).toBeGreaterThan(0);
      expect(consoles.some(message => message.text.includes('Setting up fake worker.'))).toBe(false);
      await target.evaluate(() => localStorage.setItem('labcharts-ai-paused', 'true'));
      for (const client of context.pages()) await client.close();
      expect(context.pages()).toHaveLength(0);
    }
    expect(attemptCount).toBe(9);
    expect(errors).toEqual([]); expect(csp).toEqual([]); expect(external).toEqual([]);
    expect(requests.filter(request => ['http:', 'https:'].includes(new URL(request.url).protocol) && new URL(request.url).origin !== server.origin)).toEqual([]);
    expect(responses.filter(response => response.status >= 400 && new URL(response.url).pathname !== '/api/commit')).toEqual([]);
    const finalAuthority = await readInputsAndArtifact();
    expect(finalAuthority.current.files).toEqual(authority.current.files);
    expect(finalAuthority.parserAuthoritySHA256).toBe(authority.parserAuthoritySHA256);
  } finally {
    const clients = [];
    for (const target of context.pages()) {
      try {clients.push({url: target.url(), native: await recordFiles(target), profile: await profile(target)});}
      catch (error) {clients.push({url: target.url(), diagnosticFailure: String(error)});}
    }
    try {await info.attach('pdf-preflight-stopped-origin', {body: JSON.stringify({parserAuthoritySHA256: authority.parserAuthoritySHA256, artifactSHA256: authority.artifactSHA256,
      artifactFileCount: authority.current.files.length,
      originalAuthoritySha, actualListenerClosed: closed, offlineLaunches: 3, zeroPageColdLaunches: 2, attemptCount,
      phases, clients, workers, consoles, requests, responses, errors, csp, external,
      boundary: 'Fresh actual compiled static app, real native SW/cache/IDB and dedicated pdf.js worker; physical local PDF FileList via Playwright automation with raw trusted events; native trusted Cancel. Existing kit-test-a worker/version +legacyProbe seam disclosed; encryption disabled. No OS installation, actual Safari certification, real provider/AI/import completion or SW termination claim.'}, null, 2), contentType: 'application/json'});
    } finally {if (!closed) await server.close();}
  }
});
