import {nativeTabKey} from '../helpers/native-tab-key.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {expect, test, type Locator, type Page} from '@playwright/test';
import {createDefaultProfileData, migrateProfileData} from '../../js/profile.js';
import type {ProfileData} from '../../types/app-state.js';
import {startKitServer} from './kit-server.js';
import {qualifyArtifactModuleSource} from './kit-native-receipts.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';

const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const feedbackModules = ['js/feedback-classes.js', 'js/feedback-rendering.js',
  'js/components/FeedbackPresentation.svelte.html.js'] as const;
interface Asset {path: string; bytes: number; sha256: string}
interface NativeEvent {type: string; target: string; trusted: boolean; key: string | null; value: string | null}
interface Port {
  events: NativeEvent[]; opened: Array<{url: string; target: string | undefined; features: string | undefined}>;
  copyAttempts: string[];
}
interface ObservedWindow extends Window {feedbackPwa: Port; feedbackPwaCsp(value: string): Promise<void>}
interface ProfileSnapshot {rawCommitted: string; stored: Record<string, unknown>; rawProfiles: string | null; active: string | null}
async function filesIn(directory: string, prefix = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await fs.readdir(path.join(directory, prefix), {withFileTypes: true})) {
    const name = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(directory, name));
    else {assert(entry.isFile(), 'No non-file artifact entry'); files.push(name);}
  }
  return files.sort();
}
/** Require the real bundled sources, not source-module URLs pruned by Kit. */
async function artifactInputs() {
  const directory = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
  const files: Asset[] = [], mappings: Array<{module: string; sourceBytes: number; sourceSHA256: string; chunks: string[]}> = [];
  const names = await filesIn(directory);
  for (const name of names) {
    const raw = await fs.readFile(path.join(directory, name)); files.push({path: '/' + name, bytes: raw.length, sha256: sha(raw)});
  }
  const maps = await Promise.all(names.filter(name => name.startsWith('_app/immutable/') && name.endsWith('.js.map'))
    .map(async name => ({name, map: JSON.parse(await fs.readFile(path.join(directory, name), 'utf8')) as {sources: string[]; sourcesContent: Array<string | null>}})));
  for (const module of [...feedbackModules, 'js/feedback.js']) {
    const current = await fs.readFile(module, 'utf8'), chunks: string[] = [];
    for (const {name, map} of maps) for (let index = 0; index < map.sources.length; index++) {
      if (!map.sources[index]!.endsWith('/' + module)) continue;
      await qualifyArtifactModuleSource(module, map.sourcesContent[index] ?? null, maps.map(entry => entry.map));
      chunks.push('/' + name.slice(0, -4));
    }
    assert(chunks.length > 0, 'Actual artifact omits Feedback module: ' + module);
    mappings.push({module, sourceBytes: Buffer.byteLength(current), sourceSHA256: sha(current), chunks: [...new Set(chunks)]});
  }
  assert.deepEqual(await fs.readFile(path.join(directory, 'css/modal-shared.css')), await fs.readFile('css/modal-shared.css'), 'Fresh canonical modal CSS in static artifact');
  const sw = await fs.readFile(path.join(directory, 'service-worker.js'), 'utf8');
  const version = await fs.readFile(path.join(directory, 'version.js'), 'utf8');
  const shellMatch = sw.match(/const APP_SHELL = (\[[\s\S]*?\]);/), buildId = sw.match(/const BUILD_ID = '([^']+)';/)?.[1];
  assert(shellMatch && buildId, 'Actual static worker shell/build identity');
  assert(version.includes("self.APP_BUILD_ID = '" + buildId + "';"), 'Worker/version build identity');
  const shell = JSON.parse(shellMatch[1]!) as string[];
  const cachePaths = shell.filter(url => /^\/_app\/immutable\/.*\.(js|css)$/.test(url));
  cachePaths.push('/index.html', '/version.js', '/css/modal-shared.css');
  assert.equal(new Set(cachePaths).size, cachePaths.length, 'Unique cached runtime dependencies');
  for (const url of cachePaths) {assert(shell.includes(url)); assert(files.some(file => file.path === url));}
  for (const mapping of mappings) for (const url of mapping.chunks) assert(cachePaths.includes(url), 'Feedback chunk in actual APP_SHELL');
  const servedSw = sw.replace(/const BUILD_ID = '[^']*';/, "const BUILD_ID = 'kit-test-a';")
    .replace('const APP_SHELL = [', "const APP_SHELL = [\n  '/js/bundle-legacy-probe-AAA.js',");
  const servedVersion = version.replace(/self.APP_BUILD_ID = '[^']*';/, "self.APP_BUILD_ID = 'kit-test-a';");
  return {directory, buildId, files, artifactSHA256: sha(JSON.stringify(files)), mappings, cachePaths,
    servedWorkerSHA256: sha(servedSw), servedVersion: {path: '/version.js', bytes: Buffer.byteLength(servedVersion), sha256: sha(servedVersion)}};
}
async function profile(page: Page): Promise<ProfileSnapshot> {
  return page.evaluate(async () => {
    const key = 'labcharts-default-imported';
    if (localStorage.getItem('labcharts-active-profile') !== 'default' || localStorage.getItem('labcharts-encryption-enabled') === 'true'
      || localStorage.getItem(key) !== null) throw new Error('Native default-profile IDB, encryption disabled, no localStorage fallback required');
    const open = indexedDB.open('labcharts-blobs', 1); open.onupgradeneeded = () => open.transaction?.abort();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);});
    try {
      const tx = db.transaction('kv', 'readonly'), request = tx.objectStore('kv').get(key);
      const rawCommitted = await new Promise<string>((resolve, reject) => {
        tx.oncomplete = () => typeof request.result === 'string' ? resolve(request.result) : reject(new Error('Missing native committed Feedback profile'));
        tx.onabort = () => reject(tx.error || new Error('Native IDB read aborted')); tx.onerror = () => reject(tx.error || request.error);
      });
      return {rawCommitted, stored: JSON.parse(rawCommitted) as Record<string, unknown>,
        rawProfiles: localStorage.getItem('labcharts-profiles'), active: localStorage.getItem('labcharts-active-profile')};
    } finally {db.close();}
  });
}
async function cacheReceipt(page: Page, artifact: Awaited<ReturnType<typeof artifactInputs>>) {
  const observed = await page.evaluate(async paths => {
    if (!navigator.serviceWorker.controller) throw new Error('Native controlling worker required');
    const entries = [];
    for (const path of paths) {
      const response = await caches.match(new URL(path, location.origin).href);
      if (!response?.ok) throw new Error('Missing actual cached Feedback dependency: ' + path);
      const bytes = await response.arrayBuffer();
      const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
      entries.push({path, bytes: bytes.byteLength, sha256});
    }
    return {controller: navigator.serviceWorker.controller.scriptURL, keys: await caches.keys(), entries,
      registrations: (await navigator.serviceWorker.getRegistrations()).map(registration => new URL(registration.active!.scriptURL).pathname)};
  }, artifact.cachePaths);
  expect(new URL(observed.controller).pathname).toBe('/service-worker.js'); expect(observed.registrations).toEqual(['/service-worker.js']);
  for (const entry of observed.entries) expect(entry).toEqual(entry.path === '/version.js'
    ? artifact.servedVersion : artifact.files.find(file => file.path === entry.path));
  return observed;
}
async function activate(page: Page, control: Locator) {
  if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) await control.tap(); else await control.click();
}
async function openFeedback(page: Page) {
  const closeChat = page.getByRole('button', {name: 'Close chat', exact: true});
  if (await closeChat.isVisible()) await activate(page, closeChat);
  const header = page.locator('button[data-shell-action="open-feedback"]');
  if (await header.isVisible()) await activate(page, header);
  else {
    await activate(page, page.getByRole('button', {name: 'Tweaks', exact: true}));
    await activate(page, page.getByRole('button', {name: 'Send feedback', exact: true}));
  }
  await expect(page.getByRole('dialog', {name: 'Send Feedback', exact: true})).toBeVisible();
  await expect(page.locator('#feedback-title')).toBeFocused();
  await expect(page.locator('#feedback-modal')).toHaveClass(/gb:feedback-panel:feedback-panel-block/);
}

test('static Feedback first offline construction, recoverable draft and two zero-page cold launches preserve complete native profiles', async ({page, context}, info) => {
  test.setTimeout(150000);
  const artifact = await artifactInputs();
  await installDiscussionFixture(context, {paused: true}); await installOfflineStartupDiagnostics(context);
  const demo = JSON.parse(await fs.readFile('data/demo-male.json', 'utf8')) as Pick<ProfileData, 'entries' | 'refOverrides'>;
  const sentinel = 'PRIVATE_FEEDBACK_PWA_PROFILE';
  const seeded = migrateProfileData({...createDefaultProfileData(), entries: demo.entries, refOverrides: demo.refOverrides,
    profile: {firstName: 'Synthetic', age: 38}, notes: [{date: '2026-09-01', text: 'Retained unrelated <note>'}],
    contextNotes: sentinel, markerNotes: {'thyroid.tsh': 'Retained marker'}, importBenchmarks: [], wearableConnections: {}});
  await context.addInitScript(({seeded}) => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('feedback-pwa-seeded')) return;
    localStorage.setItem('feedback-pwa-seeded', '1');
    localStorage.setItem('labcharts-profiles', JSON.stringify([{id: 'default', name: 'Synthetic Feedback', sex: 'male', dob: '1987-11-22', createdAt: 1}]));
    localStorage.setItem('labcharts-active-profile', 'default'); localStorage.setItem('labcharts-analytics-disabled', 'true');
    localStorage.setItem('labcharts-show-product-recs', 'false'); localStorage.setItem('labcharts-default-imported', JSON.stringify(seeded));
  }, {seeded});
  const errors: string[] = [], csp: string[] = [], external: string[] = [];
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message));
  observe(page); context.on('page', observe);
  await context.exposeBinding('feedbackPwaCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => {
    const observed = window as unknown as ObservedWindow;
    observed.feedbackPwa = {events: [], opened: [], copyAttempts: []};
    // Explicit synthetic external-action ports: neither real GitHub nor the OS clipboard is touched.
    window.open = (url, target, features) => {observed.feedbackPwa.opened.push({url: String(url), target, features}); return null;};
    Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async (text: string) => {
      observed.feedbackPwa.copyAttempts.push(text); throw new DOMException('Synthetic native-port denial', 'NotAllowedError');
    }}});
    for (const type of ['keydown', 'input', 'change', 'click']) document.addEventListener(type, event => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('#feedback-modal-overlay')) return;
      observed.feedbackPwa.events.push({type, target: target.id || target.getAttribute('data-feedback-action') || target.tagName,
        trusted: event.isTrusted, key: event instanceof KeyboardEvent ? event.key : null,
        value: target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target.value : null});
    }, true);
    document.addEventListener('securitypolicyviolation', event => {void observed.feedbackPwaCsp(event.violatedDirective);});
  });
  const server = await startKitServer(artifact.directory); let closed = false;
  const phases: unknown[] = [], clientBoundaries: Array<{phase: string; beforeNewPage: number | null; afterClose: number}> = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== server.origin) {external.push(url.href); await route.abort();}
    else await route.continue();
  });
  try {
    await ready(page, server.origin); await ready(page, server.origin);
    await expect(page.locator('#feedback-form-template')).toHaveCount(0); await expect(page.locator('#feedback-title')).toHaveCount(0);
    const before = await profile(page); expect(before.stored.contextNotes).toBe(sentinel);
    const onlineCache = await cacheReceipt(page, artifact);
    const servedWorker = await page.evaluate(async () => {
      const response = await fetch('/service-worker.js'); if (!response.ok) throw new Error('Actual served worker missing');
      const bytes = await response.arrayBuffer();
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    });
    expect(servedWorker).toBe(artifact.servedWorkerSHA256);
    await server.close(); closed = true; await expect(fetch(server.origin + '/index.html')).rejects.toThrow();
    for (let phase = 0; phase < 3; phase++) {
      const beforeNewPage = phase > 0 ? context.pages().length : null;
      if (phase > 0) {expect(beforeNewPage).toBe(0); page = await context.newPage(); expect(context.pages()).toHaveLength(1); await ready(page, server.origin);}
      expect(await profile(page)).toEqual(before); await expect(page.locator('#feedback-title')).toHaveCount(0);
      await openFeedback(page);
      const title = page.locator('#feedback-title'), description = page.locator('#feedback-desc'), draft = page.locator('#feedback-draft');
      await expect(title).toHaveValue(''); await expect(description).toHaveValue(''); await expect(draft).toHaveValue('');
      await expect(page.locator('#feedback-type')).toHaveValue('bug'); await expect(page.locator('#feedback-result')).toBeHidden();
      expect(await description.evaluate(element => ({value: (element as HTMLTextAreaElement).defaultValue, required: (element as HTMLTextAreaElement).required})))
        .toEqual({value: '', required: true});
      await page.keyboard.press(nativeTabKey(page, true)); await expect(page.locator('#feedback-type')).toBeFocused();
      await page.keyboard.press(nativeTabKey(page)); await expect(title).toBeFocused(); await title.pressSequentially('Offline <literal> & report');
      await page.keyboard.press(nativeTabKey(page)); await expect(description).toBeFocused(); await description.pressSequentially('Meaningful offline summary');
      await activate(page, page.getByRole('button', {name: 'Open GitHub draft', exact: true}));
      const opened = await page.evaluate(() => (window as unknown as ObservedWindow).feedbackPwa.opened);
      expect(opened).toHaveLength(1); expect(opened[0]!.target).toBe('_blank'); expect(opened[0]!.features).toBe('noopener,noreferrer');
      const issue = new URL(opened[0]!.url); expect(issue.origin + issue.pathname).toBe('https://github.com/elkimek/get-based/issues/new');
      expect(issue.searchParams.get('title')).toBe('[Bug] Offline <literal> & report'); expect(issue.searchParams.get('labels')).toBe('bug');
      expect(issue.searchParams.get('body')).toContain('Meaningful offline summary'); expect(issue.searchParams.get('body')).not.toContain(sentinel);
      const literal = '</textarea><img src=x onerror=alert(1)> 🧪'.repeat(160);
      expect(literal.length).toBeLessThanOrEqual(10000);
      await description.fill(literal); await activate(page, page.getByRole('button', {name: 'Open GitHub draft', exact: true}));
      await expect(page.locator('#feedback-result')).toContainText('too long for a prefilled link');
      await expect(page.locator('#feedback-result img')).toHaveCount(0); await expect(page.locator('#feedback-result details')).toHaveAttribute('open', '');
      expect(new URL((await page.locator('#feedback-result a').getAttribute('href'))!).searchParams.has('body')).toBe(false);
      expect(await page.evaluate(() => (window as unknown as ObservedWindow).feedbackPwa.opened)).toEqual(opened);
      const complete = await draft.inputValue(); expect(complete).toContain(literal); expect(complete).not.toContain(sentinel);
      const form = await page.locator('.feedback-form').elementHandle(); expect(form).not.toBeNull();
      try {
        await activate(page, page.getByRole('button', {name: 'Copy report', exact: true})); await expect(draft).toBeFocused();
        const selected = await draft.evaluate(element => {const node = element as HTMLTextAreaElement;
          return {start: node.selectionStart, end: node.selectionEnd, value: node.value, readonly: node.readOnly};});
        expect(selected).toEqual({start: 0, end: complete.length, value: complete, readonly: true});
        expect(await page.evaluate(() => (window as unknown as ObservedWindow).feedbackPwa.copyAttempts)).toEqual([complete]);
        const toast = page.locator('#notification-container .notification-toast.info').filter({hasText: 'Copy the selected report, then paste it into GitHub.'});
        await expect(toast).toHaveCount(1); await expect(toast).toHaveCount(0, {timeout: 10000});
        await page.keyboard.press('Escape'); await expect(page.locator('#feedback-modal-overlay')).not.toHaveClass(/\bshow\b/);
        await expect(draft).not.toBeFocused(); expect(await profile(page)).toEqual(before); await openFeedback(page);
        expect(await page.locator('.feedback-form').evaluate((element, previous) => element === previous, form)).toBe(true);
        await expect(title).toHaveValue('Offline <literal> & report'); await expect(description).toHaveValue(literal); await expect(draft).toHaveValue(complete);
        const cache = await cacheReceipt(page, artifact), snapshot = await profile(page);
        expect(cache.keys).toEqual(onlineCache.keys);
        expect(snapshot).toEqual(before);
        const ledger = await page.evaluate(() => (window as unknown as ObservedWindow).feedbackPwa);
        expect(ledger.events.some(event => event.type === 'keydown' && event.trusted && event.key === 'Tab')).toBe(true);
        expect(ledger.events.some(event => event.type === 'keydown' && event.trusted && event.key === 'Escape')).toBe(true);
        for (const id of ['feedback-title', 'feedback-desc']) expect(ledger.events.some(event => event.type === 'input' && event.trusted && event.target === id)).toBe(true);
        expect(ledger.events.some(event => event.type === 'click' && event.trusted && event.target === 'copy')).toBe(true);
        phases.push({phase: phase === 0 ? 'first-offline' : 'cold-' + phase, snapshot, cache, ledger, selected,
          defaultsEmptyBeforeInput: true, draftRetainedSameNativeForm: true});
        await activate(page, page.locator('.feedback-actions [data-feedback-action="close"]'));
        await expect(page.locator('#feedback-modal-overlay')).not.toHaveClass(/\bshow\b/); expect(await profile(page)).toEqual(before);
      } finally {await form?.dispose();}
      for (const client of context.pages()) await client.close(); expect(context.pages()).toHaveLength(0);
      clientBoundaries.push({phase: String(phase), beforeNewPage, afterClose: context.pages().length});
    }
    expect(phases).toHaveLength(3); expect(clientBoundaries).toHaveLength(3);
    expect(clientBoundaries.slice(1).map(boundary => boundary.beforeNewPage)).toEqual([0, 0]);
    expect(await artifactInputs()).toEqual(artifact);
    expect(errors).toEqual([]); expect(csp).toEqual([]); expect(external).toEqual([]);
    await info.attach('feedback-stopped-origin-acceptance', {body: JSON.stringify({artifact, before, onlineCache, servedWorker,
      stoppedOrigin: true, coldLaunches: 2, clientBoundaries, phases, errors, csp, external,
      boundary: 'Actual compiled static Kit/SW/cache/native IDB; encryption disabled synthetic returning-user profile. Existing kit-test-a worker/version and legacyProbe fixture seam retained. Native public header/Tweaks, keyboard/touch/mouse; synthetic window.open/clipboard denial prevents GitHub/OS clipboard actions. No OS installation, provider, actual Safari certification or SW termination claim.'}, null, 2), contentType: 'application/json'});
  } finally {if (!closed) await server.close();}
});
