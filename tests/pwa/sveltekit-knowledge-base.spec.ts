import path from 'node:path';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {expect, test as base, type Page, type BrowserContextOptions} from '@playwright/test';
import {createDefaultProfileData} from '../../js/profile.js';
import {chunkText} from '../../js/lens-local-utils.js';
import {MODELS} from '../../js/lens-local-embedder-config.js';
import type {LibraryRegistry, CorpusManifest} from '../../js/lens-local-store.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readComparisonAcceptanceProfile} from '../helpers/nutrition-comparison-fixture.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';
import {withNativeCocoaOpfsContext} from '../helpers/cocoa-opfs-context.js';

const test = base.extend({
  context: async ({context, playwright, browserName, launchOptions, headless, contextOptions,
    viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, serviceWorkers}, use, info) => {
    const scope = process.env['GETBASED_KIT_CASE_SCOPE'];
    if (scope === 'webkit-opfs' && (process.platform !== 'darwin' || browserName !== 'webkit')) throw new Error('Native Cocoa OPFS scope requires macOS WebKit');
    if (process.platform !== 'darwin' || browserName !== 'webkit') {await use(context); return;}
    expect(headless, 'Native Cocoa PWA acceptance stays headless').toBe(true);
    // Keep the same public resolved device fixtures; the runner also applies all
    // remaining configured context options to manually launched contexts.
    const device: BrowserContextOptions = {
      ...(viewport === undefined ? {} : {viewport}),
      ...(userAgent === undefined ? {} : {userAgent}),
      ...(deviceScaleFactor === undefined ? {} : {deviceScaleFactor}),
      ...(isMobile === undefined ? {} : {isMobile}),
      ...(hasTouch === undefined ? {} : {hasTouch}),
      ...(serviceWorkers === undefined ? {} : {serviceWorkers}),
    };
    const resolved = {...contextOptions, ...device};
    await withNativeCocoaOpfsContext({browserType: playwright.webkit, privateContext: context,
      launchOptions: {...launchOptions, headless}, contextOptions: resolved, info}, use);
  },
});


// Only model embedding uses the maintained ?mock=1 hook. Worker transport, client
// queue, Markdown parser, OPFS transactions and SW remain actual production code.
const MODEL_KEYS = ['all-minilm', 'bge-small-en', 'multilingual-e5-small', 'bge-base-en'];
const SOURCE = 'native <img src=x onerror=alert(1)> & "literal".md';
const TEXT = 'This native Markdown document describes a bounded offline knowledge library. The complete source remains on this device, and its one short excerpt survives a service worker cold launch. Literal names must remain text when the document list is rendered.';
const CREATED_NAME = 'Native PWA <literal> library';
const SAVED_NAME = 'Renamed PWA <literal> library';
const privacy = 'Files, embeddings, and searches stay on this device. When chat uses the Knowledge Base, matching excerpts are included in the request to your configured AI provider. Query rewriting also sends the question when enabled.';
interface Trace {
  worker: string; direction: 'request' | 'reply'; at: number;
  trusted: boolean | null; message: Record<string, unknown>;
}
interface WorkerCreation {id: string; original: string; actual: string; type: string | null; purpose: 'application' | 'cache-prime'}
interface FileEvent {type: string; trusted: boolean; nativeFileList: boolean; files: string[]; cleared?: boolean}
interface Receipt {document: string; workers: WorkerCreation[]; trace: Trace[]; errors: string[]; files: FileEvent[]; priming: boolean}
type ObservedWindow = Window & typeof globalThis & {knowledgeBaseReceipt: Receipt};
interface OpfsFile {path: string; size: number; sha256: string; bytes: number[]}
interface OpfsSnapshot {directories: string[]; files: OpfsFile[]}
interface RequestReceipt {phase: string; event: string; url: string; status?: number; sw?: boolean; failure?: string | null}

function installNativeObservation() {
  if (!['http:', 'https:'].includes(location.protocol)) return;
  const state: Receipt = {document: crypto.randomUUID(), workers: [], trace: [], errors: [], files: [], priming: false};
  (window as ObservedWindow).knowledgeBaseReceipt = state;
  const NativeWorker = window.Worker;
  class EmbedderHookWorker extends NativeWorker {
    constructor(input: string | URL, options?: WorkerOptions) {
      const original = new URL(String(input), location.href);
      const selected = original.origin === location.origin && original.pathname === '/js/lens-local-worker.js';
      const actual = new URL(original);
      if (selected) actual.searchParams.set('mock', '1');
      super(selected ? actual.href : input, options);
      if (!selected) return;
      const id = state.document + ':' + state.workers.length;
      state.workers.push({id, original: original.href, actual: actual.href, type: options?.type || null, purpose: state.priming ? 'cache-prime' : 'application'});
      const nativePost = NativeWorker.prototype.postMessage;
      this.postMessage = ((message: unknown, transfer?: Transferable[] | StructuredSerializeOptions) => {
        state.trace.push({worker: id, direction: 'request', at: performance.now(), trusted: null, message: structuredClone(message) as Record<string, unknown>});
        Reflect.apply(nativePost, this, transfer === undefined ? [message] : [message, transfer]);
      }) as Worker['postMessage'];
      this.addEventListener('message', event => state.trace.push({
        worker: id, direction: 'reply', at: performance.now(), trusted: event.isTrusted,
        message: structuredClone(event.data) as Record<string, unknown>,
      }));
      this.addEventListener('error', event => state.errors.push(event.message || 'Native Worker error'));
    }
  }
  window.Worker = EmbedderHookWorker;
  for (const type of ['input', 'change']) document.addEventListener(type, event => {
    if (!(event.target instanceof HTMLInputElement) || event.target.id !== 'lens-local-filepick') return;
    const input = event.target;
    const observed: FileEvent = {type, trusted: event.isTrusted, nativeFileList: input.files instanceof FileList, files: Array.from(input.files || [], file => file.name)};
    state.files.push(observed);
    if (type === 'change') requestAnimationFrame(() => { observed.cleared = input.value === '' && input.files instanceof FileList && input.files.length === 0; });
  }, true);
}
async function snapshotOpfs(): Promise<OpfsSnapshot> {
  type EnumerableDirectory = FileSystemDirectoryHandle & {entries(): AsyncIterableIterator<[string, FileSystemHandle]>};
  const root = await navigator.storage.getDirectory();
  const snapshot: OpfsSnapshot = {directories: [], files: []};
  async function visit(directory: FileSystemDirectoryHandle, prefix: string) {
    for await (const [name, handle] of (directory as EnumerableDirectory).entries()) {
      const filePath = prefix + name;
      if (handle.kind === 'directory') {
        snapshot.directories.push(filePath);
        await visit(handle as FileSystemDirectoryHandle, filePath + '/');
      } else {
        const file = await (handle as FileSystemFileHandle).getFile(), buffer = await file.arrayBuffer();
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
        snapshot.files.push({path: filePath, size: file.size, sha256: Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join(''), bytes: Array.from(new Uint8Array(buffer))});
      }
    }
  }
  await visit(root, '');
  snapshot.directories.sort(); snapshot.files.sort((a, b) => a.path.localeCompare(b.path));
  return snapshot;
}
function jsonFile<T>(snapshot: OpfsSnapshot, filePath: string): T {
  const file = snapshot.files.find(item => item.path === filePath);
  expect(file, 'Actual OPFS file ' + filePath).toBeDefined();
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(file!.bytes))) as T;
}
function checksum(bytes: number[]) {
  let fnv = 2166136261, djb = 5381;
  for (const byte of bytes) {fnv = Math.imul(fnv ^ byte, 16777619); djb = Math.imul(djb, 33) ^ byte;}
  return bytes.length + ':' + (fnv >>> 0).toString(36) + ':' + (djb >>> 0).toString(36);
}
function assertSavedCorpus(snapshot: OpfsSnapshot, id: string) {
  const registry = jsonFile<LibraryRegistry>(snapshot, 'lens-local/_libraries.json');
  expect(registry.activeId).toBe(id);
  expect(registry.libraries).toHaveLength(2);
  expect(registry.libraries.find(library => library.id === id)).toMatchObject({name: SAVED_NAME, model: 'all-minilm'});
  expect(jsonFile<LibraryRegistry>(snapshot, 'lens-local/_libraries.backup.json')).toEqual(registry);
  const manifests = snapshot.files.filter(file => file.path.startsWith('lens-local/' + id + '/manifest.') && file.path.endsWith('.json'))
    .map(file => ({file, manifest: jsonFile<CorpusManifest>(snapshot, file.path)}))
    .sort((a, b) => (b.manifest.storage?.revision || 0) - (a.manifest.storage?.revision || 0));
  expect(manifests.length).toBeGreaterThan(0);
  const {file, manifest} = manifests[0]!;
  expect(manifest).toMatchObject({dim: 384, numChunks: 1, modelId: 'Xenova/all-MiniLM-L6-v2', docs: [{source: SOURCE, chunks: 1}], storage: {schemaVersion: 1}});
  const vectors = snapshot.files.find(item => item.path === file.path.replace('manifest.', 'vectors.').replace('.json', '.bin'))!;
  const chunks = snapshot.files.find(item => item.path === file.path.replace('manifest.', 'chunks.'))!;
  expect(vectors).toBeDefined(); expect(chunks).toBeDefined();
  expect(vectors.bytes).toHaveLength(384 * 4);
  expect(manifest.storage!.vectorsChecksum).toBe(checksum(vectors.bytes));
  expect(manifest.storage!.chunksChecksum).toBe(checksum(chunks.bytes));
  expect(jsonFile<Array<{source: string; text: string}>>(snapshot, chunks.path)).toEqual([{source: SOURCE, text: TEXT.trim()}]);
  const vector = new Float32Array(Uint8Array.from(vectors.bytes).buffer);
  expect(Array.from(vector).every(Number.isFinite)).toBe(true);
  expect(Math.sqrt(Array.from(vector).reduce((sum, value) => sum + value * value, 0))).toBeCloseTo(1, 4);
}
async function receipt(page: Page) {return page.evaluate(() => (window as ObservedWindow).knowledgeBaseReceipt);}
function assertNativeQueue(observed: Receipt) {
  expect(observed.errors).toEqual([]);
  const replies: Record<string, string> = {init: 'ready', stats: 'stats_result', list_libraries: 'libraries_list', create_library: 'library_created', activate_library: 'ready', rename_library: 'library_renamed', ingest: 'ingest_done', query: 'query_result'};
  for (const worker of observed.workers) {
    expect(worker.type).toBe('module');
    const original = new URL(worker.original);
    expect(original.pathname).toBe('/js/lens-local-worker.js');
    expect(original.search).toBe(worker.purpose === 'application' ? '' : '?mock=1');
    const url = new URL(worker.actual);
    expect(url.pathname).toBe('/js/lens-local-worker.js');
    expect(Array.from(url.searchParams.entries())).toEqual([['mock', '1']]);
    let pending: string | null = null, saving = false, committed = false;
    const events = observed.trace.filter(item => item.worker === worker.id);
    expect(events.length).toBeGreaterThan(1);
    for (const event of events) {
      const type = String(event.message.type);
      if (event.direction === 'request') {
        if (type === 'commit_ingest') {
          expect(pending).toBe('ingest'); expect(saving).toBe(true); expect(committed).toBe(false); committed = true;
        } else {
          expect(pending, 'Strict actual client FIFO before ' + type).toBeNull();
          expect(replies[type], 'Known real request type').toBeDefined();
          pending = type; saving = false; committed = false;
        }
      } else {
        expect(event.trusted).toBe(true);
        if (type === 'progress') {
          expect(pending).toBe('ingest');
          if (event.message.stage === 'saving') saving = true;
        } else {
          expect(pending).not.toBeNull();
          expect(type).toBe(replies[pending!]);
          if (pending === 'ingest') {
            expect(saving).toBe(true); expect(committed).toBe(true);
            expect(event.message.stats).toMatchObject({files_seen: 1, chunks_planned: 1, chunks_indexed: 1, cancelled: false});
          }
          pending = null;
        }
      }
    }
    expect(pending).toBeNull();
  }
}
async function openKnowledgeBase(page: Page) {
  if (await page.locator('#kb-modal-overlay.show').isVisible()) return;
  const menu = page.getByRole('button', {name: 'Menu', exact: true});
  if (await menu.isVisible()) await menu.click();
  await page.locator('[data-nav-action="open-knowledge-base"]').click();
  await expect(page.locator('#kb-modal-overlay.show')).toBeVisible();
  await expect(page.locator('#lens-library-select option[value="default"]')).toBeAttached();
  await expect(page.locator('#lens-local-stats')).not.toContainText('Loading');
}
async function closeKnowledgeBase(page: Page) {
  await page.locator('#kb-modal [data-lens-action="close-kb"]').click();
  await expect(page.locator('#kb-modal-overlay.show')).toHaveCount(0);
}
async function controls(page: Page, populated: boolean, id = 'default') {
  await expect(page.locator('#kb-modal')).toBeVisible();
  await expect(page.getByRole('radio', {name: 'On this device', exact: true})).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#lens-enabled-toggle')).toBeChecked();
  await expect(page.locator('#lens-topk-input')).toHaveValue('5');
  await expect(page.locator('#lens-multi-query-checkbox')).not.toBeChecked();
  await expect(page.locator('.kb-privacy-note > span:last-child')).toHaveText(privacy);
  await expect(page.locator('#lens-library-select')).toHaveValue(id);
  await expect(page.locator('#lens-local-filepick')).toHaveAttribute('accept', '.txt,.md,.markdown,.rst,.json,.csv,.log,.pdf,.docx,.zip');
  await expect(page.locator('#lens-local-filepick')).toHaveAttribute('multiple', '');
  if (populated) {
    await expect(page.locator('#lens-local-stats')).toHaveText('1 excerpt from 1 document · MiniLM on CPU');
    await expect(page.locator('.kb-document-name')).toHaveText(SOURCE);
    await expect(page.locator('.kb-document-name')).toHaveAttribute('title', SOURCE);
    await expect(page.locator('.kb-document-name img')).toHaveCount(0);
    await expect(page.locator('.kb-document-count')).toHaveText('1');
    await expect(page.locator('.kb-doc-delete')).toHaveAttribute('data-lens-source', SOURCE);
    await expect(page.locator('.kb-doc-delete')).toHaveAttribute('aria-label', 'Delete ' + SOURCE);
  } else await expect(page.locator('#lens-local-stats')).toHaveText('No documents indexed yet. Add a file to start this library.');
  return page.evaluate(() => {
    const modal = document.getElementById('kb-modal')!;
    return {publicPath: location.pathname + location.search, viewportWidth: innerWidth, rootWidth: document.documentElement.clientWidth, rootScrollWidth: document.documentElement.scrollWidth, modalWidth: modal.clientWidth, modalScrollWidth: modal.scrollWidth,
      controls: Array.from(modal.querySelectorAll('input,select,button'), node => ({tag: node.tagName, id: node.id, type: node.getAttribute('type'), action: node.getAttribute('data-lens-action'), disabled: (node as HTMLInputElement).disabled}))};
  });
}
async function createDialog(page: Page) {
  await page.locator('[data-lens-action="new-library"]').click();
  const overlay = page.locator('#lens-library-create-overlay.show');
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('input[name="lens-create-model"]')).toHaveCount(4);
  expect(await overlay.locator('input[name="lens-create-model"]').evaluateAll(nodes => nodes.map(node => (node as HTMLInputElement).value).sort())).toEqual([...MODEL_KEYS].sort());
  await expect(overlay.locator('input[name="lens-create-model"][value="all-minilm"]')).toBeChecked();
  await expect(overlay.locator('.kb-model-card:has(input[value="all-minilm"])')).toContainText('Fast');
  await expect(overlay).toContainText('We could not measure this browser yet, so Fast is selected for compatibility.');
  return overlay;
}
async function workerQueryCache(page: Page) {
  return page.evaluate(async () => {
    const url = new URL('/js/lens-local-worker.js?mock=1', location.origin).href;
    const result: Array<{cache: string; url: string; status: number; size: number; sha256: string}> = [];
    for (const name of await caches.keys()) {
      const response = await (await caches.open(name)).match(url);
      if (!response) continue;
      const bytes = await response.arrayBuffer(), digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      result.push({cache: name, url, status: response.status, size: bytes.byteLength, sha256: Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')});
    }
    return result.sort((a, b) => a.cache.localeCompare(b.cache));
  });
}

test('native Knowledge Base create, Markdown ingest and rename persist through two stopped-origin SW cold launches', async ({page, context}) => {
  test.setTimeout(150000);
  expect(Object.keys(MODELS).sort(), 'Independent maintained domain catalog identity').toEqual([...MODEL_KEYS].sort());
  expect(TEXT.length).toBeGreaterThan(100); expect(TEXT.length).toBeLessThan(512);
  expect(chunkText(TEXT)).toEqual([TEXT.trim()]);
  await installDiscussionFixture(context, {paused: true});
  await installOfflineStartupDiagnostics(context);
  await context.addInitScript(({defaults, demo}) => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    if (localStorage.getItem('knowledge-base-native-pwa-seeded')) return;
    localStorage.setItem('knowledge-base-native-pwa-seeded', '1');
    localStorage.setItem('labcharts-profiles', JSON.stringify([{id: 'default', name: 'Alex', sex: 'male', dob: '1987-11-22', createdAt: 1}]));
    localStorage.setItem('labcharts-active-profile', 'default');
    localStorage.setItem('labcharts-show-product-recs', 'false');
    localStorage.setItem('labcharts-default-imported', JSON.stringify({...defaults, entries: demo.entries, refOverrides: demo.refOverrides, profile: {firstName: 'Alex', age: 38}, markerNotes: {'thyroid.tsh': 'Preserve unrelated native KB note'}, contextNotes: 'Preserve unrelated native KB context', sunDefaults: {fitzpatrick: 'II', completedAt: 1}}));
    localStorage.setItem('labcharts-lens-config', JSON.stringify({backend: 'in-browser', enabled: true, topK: 5, multiQuery: false, name: '', url: '', testProbe: ''}));
  }, {defaults: createDefaultProfileData(), demo: JSON.parse(await fs.readFile('data/demo-male.json', 'utf8')) as Record<string, unknown>});
  await context.addInitScript(installNativeObservation);
  const errors: string[] = [], csp: string[] = [], requests: RequestReceipt[] = [];
  let phase = 'initial-online';
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message));
  observe(page); context.on('page', observe);
  await context.exposeBinding('knowledgeBaseCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    void (window as unknown as {knowledgeBaseCsp(value: string): Promise<void>}).knowledgeBaseCsp(event.violatedDirective);
  }));
  context.on('request', request => requests.push({phase, event: 'request', url: request.url()}));
  context.on('response', response => requests.push({phase, event: 'response', url: response.url(), status: response.status(), sw: response.fromServiceWorker()}));
  context.on('requestfailed', request => requests.push({phase, event: 'failed', url: request.url(), failure: request.failure()?.errorText || null}));
  const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
  const workerArtifact = await fs.readFile(path.join(artifact, 'js/lens-local-worker.js'));
  const workerArtifactHash = createHash('sha256').update(workerArtifact).digest('hex');
  const server = await startKitServer(artifact);
  let closed = false, complete = false, stoppedOrigin = false;
  const filePath = test.info().outputPath(SOURCE);
  let profileBefore: unknown;
  let queryCache: Awaited<ReturnType<typeof workerQueryCache>> = [];
  const loading: Array<{phase: string; readyMs: number}> = [], snapshots: Array<{phase: string; opfs: OpfsSnapshot}> = [], native: Array<{phase: string; receipt: Receipt}> = [], geometry: Array<{phase: string; receipt: Awaited<ReturnType<typeof controls>>}> = [];
  try {
    loading.push({phase, readyMs: await ready(page, server.origin)});
    profileBefore = await page.evaluate(readComparisonAcceptanceProfile);
    await openKnowledgeBase(page);
    geometry.push({phase, receipt: await controls(page, false)});
    const beforeCancel = await page.evaluate(snapshotOpfs);
    snapshots.push({phase: 'before-create-cancel', opfs: beforeCancel});
    expect(jsonFile<LibraryRegistry>(beforeCancel, 'lens-local/_libraries.json').libraries).toHaveLength(1);
    const cancelled = await createDialog(page);
    await cancelled.locator('#lens-create-name').fill('Discarded creation');
    await cancelled.locator('#lens-create-cancel').click();
    await expect(page.locator('#lens-library-create-overlay.show')).toHaveCount(0);
    expect(await page.evaluate(snapshotOpfs)).toEqual(beforeCancel);
    expect((await receipt(page)).trace.filter(event => event.direction === 'request' && event.message.type === 'create_library')).toEqual([]);
    expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(profileBefore);

    const create = await createDialog(page);
    await create.locator('#lens-create-name').fill(CREATED_NAME);
    await create.locator('#lens-create-ok').click();
    await expect(page.locator('#lens-library-create-overlay.show')).toHaveCount(0);
    await expect(page.locator('#lens-library-select option:checked')).toContainText(CREATED_NAME);
    const activeId = await page.locator('#lens-library-select').inputValue();
    expect(activeId).not.toBe('default');
    await expect(page.locator('[data-lens-action="new-library"]')).toBeEnabled();
    const createdSnapshot = await page.evaluate(snapshotOpfs);
    expect(jsonFile<LibraryRegistry>(createdSnapshot, 'lens-local/_libraries.json')).toMatchObject({activeId, libraries: expect.arrayContaining([{id: activeId, name: CREATED_NAME, model: 'all-minilm', createdAt: expect.any(Number)}])});
    snapshots.push({phase: 'created-empty', opfs: createdSnapshot});
    expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(profileBefore);

    await fs.writeFile(filePath, TEXT, 'utf8');
    await page.locator('#lens-local-filepick').setInputFiles(filePath);
    await expect(page.locator('#lens-local-progress-text')).toHaveText(/^Indexed 1 excerpts from 1 file in [\d.]+s\.$/);
    await expect(page.locator('#lens-local-stats')).toHaveText('1 excerpt from 1 document · MiniLM on CPU');
    await expect.poll(async () => (await receipt(page)).files.filter(event => event.type === 'change').every(event => event.cleared === true)).toBe(true);
    const fileEvents = (await receipt(page)).files;
    expect(fileEvents.map(event => event.type)).toEqual(['input', 'change']);
    for (const event of fileEvents) {expect(event.trusted).toBe(true); expect(event.nativeFileList).toBe(true); expect(event.files).toEqual([SOURCE]);}
    expect(await page.locator('#lens-local-filepick').evaluate(node => ({native: (node as HTMLInputElement).files instanceof FileList, count: (node as HTMLInputElement).files!.length, value: (node as HTMLInputElement).value}))).toEqual({native: true, count: 0, value: ''});
    await expect(page.locator('#lens-ingest-pill-cancel')).toHaveText('Done');
    await expect(page.locator('#lens-ingest-pill-cancel')).toBeDisabled();
    const ingested = await page.evaluate(snapshotOpfs);
    snapshots.push({phase: 'ingested', opfs: ingested});
    expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(profileBefore);
    await expect(page.locator('#lens-ingest-pill')).toHaveCount(0, {timeout: 15000});
    await expect(page.locator('#lens-local-progress-wrap')).toBeHidden();
    await closeKnowledgeBase(page); await openKnowledgeBase(page);
    geometry.push({phase: 'reopened-online', receipt: await controls(page, true, activeId)});

    await page.locator('[data-lens-action="rename-library"]').click();
    await expect(page.locator('#prompt-dialog-overlay.show')).toBeVisible();
    await expect(page.locator('#prompt-dialog-input')).toHaveValue(CREATED_NAME);
    await page.locator('#prompt-dialog-input').fill('Discarded rename');
    await page.keyboard.press('Escape');
    await expect(page.locator('#prompt-dialog-overlay.show')).toHaveCount(0);
    await expect(page.locator('#kb-modal-overlay.show')).toBeVisible();
    expect(await page.evaluate(snapshotOpfs)).toEqual(ingested);
    expect((await receipt(page)).trace.filter(event => event.direction === 'request' && event.message.type === 'rename_library')).toEqual([]);
    expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(profileBefore);
    await openKnowledgeBase(page);
    await page.locator('[data-lens-action="rename-library"]').click();
    await page.locator('#prompt-dialog-input').fill(SAVED_NAME);
    await page.locator('#prompt-ok').click();
    await expect(page.locator('#prompt-dialog-overlay.show')).toHaveCount(0);
    await expect(page.locator('#lens-library-select option:checked')).toContainText(SAVED_NAME);
    const saved = await page.evaluate(snapshotOpfs);
    assertSavedCorpus(saved, activeId);
    const corpusFiles = (snapshot: OpfsSnapshot) => snapshot.files.filter(file => !['lens-local/_libraries.json', 'lens-local/_libraries.backup.json'].includes(file.path));
    expect(corpusFiles(saved)).toEqual(corpusFiles(ingested));
    expect(saved.directories).toEqual(ingested.directories);
    snapshots.push({phase: 'renamed-final', opfs: saved});
    expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(profileBefore);

    // This is another genuine native Worker, solely to fetch the exact query URL
    // under established SW control. Its actual init reply must see the saved OPFS.
    const primed = await page.evaluate(async () => {
      const state = (window as ObservedWindow).knowledgeBaseReceipt;
      state.priming = true;
      const worker = new Worker(new URL('/js/lens-local-worker.js?mock=1', location.origin), {type: 'module'});
      state.priming = false;
      try {
        return await new Promise<Record<string, unknown>>((resolve, reject) => {
          worker.addEventListener('message', event => {
            if (event.data.type === 'ready') resolve(event.data as Record<string, unknown>);
            if (event.data.type === 'error') reject(new Error(String(event.data.message)));
          });
          worker.addEventListener('error', event => reject(new Error(event.message)));
          worker.postMessage({type: 'init'});
        });
      } finally {worker.terminate();}
    });
    expect(primed).toMatchObject({type: 'ready', activeId, activeName: SAVED_NAME, activeModel: 'all-minilm', numChunks: 1, numDocs: 1, embedder: null});
    expect(Object.keys(primed.models as Record<string, unknown>).sort()).toEqual([...MODEL_KEYS].sort());
    await expect.poll(async () => (await workerQueryCache(page)).length).toBeGreaterThan(0);
    queryCache = await workerQueryCache(page);
    for (const cached of queryCache) {expect(cached.status).toBe(200); expect(cached.size).toBe(workerArtifact.byteLength); expect(cached.sha256).toBe(workerArtifactHash);}
    expect(await page.evaluate(snapshotOpfs)).toEqual(saved);
    await closeKnowledgeBase(page);
    const onlineReceipt = await receipt(page);
    assertNativeQueue(onlineReceipt);
    expect(onlineReceipt.workers.filter(worker => worker.purpose === 'application')).toHaveLength(1);
    expect(onlineReceipt.workers.filter(worker => worker.purpose === 'cache-prime')).toHaveLength(1);
    const ingestRequest = onlineReceipt.trace.find(event => event.direction === 'request' && event.message.type === 'ingest');
    expect(ingestRequest?.message.files).toEqual([{name: SOURCE, text: TEXT}]);
    expect(onlineReceipt.trace.filter(event => event.direction === 'request' && event.message.type === 'create_library')).toHaveLength(1);
    expect(onlineReceipt.trace.find(event => event.direction === 'request' && event.message.type === 'create_library')?.message).toEqual({type: 'create_library', name: CREATED_NAME, model: 'all-minilm'});
    expect(onlineReceipt.trace.filter(event => event.direction === 'request' && event.message.type === 'rename_library')).toHaveLength(1);
    expect(onlineReceipt.trace.find(event => event.direction === 'request' && event.message.type === 'rename_library')?.message).toEqual({type: 'rename_library', libraryId: activeId, name: SAVED_NAME});
    native.push({phase, receipt: onlineReceipt});

    await server.close(); closed = true;
    try {await fetch(server.origin + '/app', {signal: AbortSignal.timeout(5000)});} catch {stoppedOrigin = true;}
    expect(stoppedOrigin, 'Physical HTTP server is closed').toBe(true);
    for (const client of context.pages()) await client.close();
    expect(context.pages()).toHaveLength(0);
    for (let launch = 1; launch <= 2; launch++) {
      phase = 'stopped-origin-cold-' + launch;
      const cold = await context.newPage();
      loading.push({phase, readyMs: await ready(cold, server.origin)});
      await openKnowledgeBase(cold);
      await expect(cold.locator('#lens-library-select option:checked')).toContainText(SAVED_NAME);
      geometry.push({phase, receipt: await controls(cold, true, activeId)});
      const coldSnapshot = await cold.evaluate(snapshotOpfs);
      assertSavedCorpus(coldSnapshot, activeId); expect(coldSnapshot).toEqual(saved);
      snapshots.push({phase, opfs: coldSnapshot});
      expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(profileBefore);
      expect(await workerQueryCache(cold)).toEqual(queryCache);
      await closeKnowledgeBase(cold);
      const coldReceipt = await receipt(cold);
      assertNativeQueue(coldReceipt);
      expect(coldReceipt.workers).toHaveLength(1);
      expect(coldReceipt.workers[0]!.purpose).toBe('application');
      const boot = coldReceipt.trace.find(event => event.direction === 'reply' && event.message.type === 'ready');
      expect(boot?.message).toMatchObject({activeId, activeName: SAVED_NAME, activeModel: 'all-minilm', numChunks: 1, numDocs: 1, embedder: null});
      native.push({phase, receipt: coldReceipt});
      for (const client of context.pages()) await client.close();
      expect(context.pages()).toHaveLength(0);
    }
    expect(new Set(native.map(item => item.receipt.document)).size).toBe(3);
    for (const item of geometry) {
      expect(item.receipt.publicPath).toBe('/app?dev-sw=1');
      expect(item.receipt.rootScrollWidth, item.phase + ' document overflow').toBeLessThanOrEqual(item.receipt.rootWidth + 1);
      expect(item.receipt.modalScrollWidth, item.phase + ' modal overflow').toBeLessThanOrEqual(item.receipt.modalWidth + 1);
    }
    const external = requests.filter(item => /^https?:/.test(item.url) && new URL(item.url).origin !== server.origin);
    expect(external, 'No external downloads or inference requests').toEqual([]);
    expect(requests.filter(item => item.event === 'response' && /\.(?:onnx|safetensors)$|\/(?:pytorch_model|model|weights)\.bin$/i.test(new URL(item.url).pathname))).toEqual([]);
    expect(errors).toEqual([]); expect(csp).toEqual([]);
    complete = true;
  } finally {
    // Retain the genuine hostile file through asynchronous native reads, then
    // remove it before artifact upload rejects its NTFS-invalid characters.
    await fs.rm(filePath, {force: true});
    const remainingClients = await Promise.all(context.pages().map(async client => {
      try { return await client.evaluate(() => ({url: location.href, native: (window as ObservedWindow).knowledgeBaseReceipt, storage: {secure: isSecureContext, storage: typeof navigator.storage, getDirectory: typeof navigator.storage?.getDirectory}, stats: document.getElementById('lens-local-stats')?.textContent})); }
      catch (error) { return {observationError: String(error)}; }
    }));
    await fs.writeFile(test.info().outputPath('knowledge-base-native-pwa.json'), JSON.stringify({
      boundary: {embedder: 'Existing mock=1 only; no benchmark, real model download or inference', native: 'Actual Worker/client FIFO/Markdown File parser/OPFS/SW', offline: 'Actual artifact HTTP server closed; all page clients closed before each launch', install: 'Browser SW/OPFS acceptance; no physical OS installation claim', fixture: 'Synthetic unrelated profile/legal acceptance, paused AI; existing kit-server build identity and legacy probe response seam'},
      status: complete ? 'passed' : 'incomplete-or-failed', project: test.info().project.name, stoppedOrigin, workerArtifactHash, loading, queryCache, native, geometry, snapshots, profileBefore, requests, errors, csp, remainingClients,
    }, null, 2));
    if (!closed) await server.close();
  }
});
