import fs from 'node:fs/promises';
import {expect, test, type Page} from '@playwright/test';
import {createDefaultProfileData, migrateProfileData} from '../../js/profile.js';
import type {ProfileData} from '../../types/app-state.js';
import {CURRENT_RELEASE} from '../../js/changelog-current.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';
import {sha, artifactInputs as nativeArtifactInputs, profile, cacheReceipt, activate} from './kit-native-receipts.js';

const changelogModules = ['js/changelog-classes.js', 'js/changelog-presentation.js', 'js/changelog-rendering.js',
  'js/components/ChangelogPresentation.svelte.html.js'] as const;
interface NativeEvent {type: string; target: string; trusted: boolean; key: string | null; pointerType: string | null}
interface ObservedWindow extends Window {changelogPwaEvents: NativeEvent[]; changelogPwaCsp(value: string): Promise<void>}
const artifactInputs = () => nativeArtifactInputs([...changelogModules, 'js/changelog.js', 'js/changelog-impl.js',
  'js/changelog-current.js', 'js/changelog-state.js', 'js/state.js'], ['css/modal-shared.css', 'css/settings.css']);

async function settings(page: Page) {
  const closeChat = page.getByRole('button', {name: 'Close chat', exact: true});
  if (await closeChat.isVisible()) await activate(page, closeChat);
  const entry = page.locator('button[data-shell-action="open-settings"]');
  await expect(entry).toBeVisible(); await activate(page, entry);
  await expect(page.locator('#settings-modal-overlay')).toHaveClass(/\bshow\b/);
  await activate(page, page.locator('#settings-nav-display'));
  await expect(page.locator('#settings-tab-display')).toBeVisible();
  await expect(page.locator('#settings-tab-display [data-settings-action="open-changelog"]')).toBeVisible();
}

test('static Changelog first offline full history, seen state and two zero-page cold launches preserve whole native profiles', async ({page, context}, info) => {
  test.setTimeout(150000);
  const artifact = await artifactInputs();
  await installDiscussionFixture(context, {provider: 'openrouter', paused: true}); await installOfflineStartupDiagnostics(context);
  const demo = JSON.parse(await fs.readFile('data/demo-male.json', 'utf8')) as Pick<ProfileData, 'entries' | 'refOverrides'>;
  const sentinel = 'PRIVATE_CHANGELOG_PWA_PROFILE';
  const seeded = migrateProfileData({...createDefaultProfileData(), entries: demo.entries, refOverrides: demo.refOverrides,
    notes: [{date: '2026-09-01', text: 'Retained unrelated <note>'}], contextNotes: sentinel, importBenchmarks: [], wearableConnections: {}});
  const registry = [{id: 'default', name: 'Synthetic Changelog', sex: 'male', dob: '1987-11-22', createdAt: 1,
    location: {country: '', zip: ''}, tags: [], notes: '', status: 'active', lastUpdated: 1, pinned: false, height: null, heightUnit: 'cm'}];
  const unseenMarker = artifact.appVersion + '.pwa-seen-probe';
  await context.addInitScript(({seeded, registry, unseenMarker}) => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('changelog-pwa-seeded')) return;
    localStorage.setItem('changelog-pwa-seeded', '1'); localStorage.setItem('labcharts-theme', 'dark');
    localStorage.setItem('labcharts-profiles', JSON.stringify(registry)); localStorage.setItem('labcharts-active-profile', 'default');
    localStorage.setItem('labcharts-analytics-disabled', 'true'); localStorage.setItem('labcharts-show-product-recs', 'false');
    localStorage.setItem('labcharts-default-imported', JSON.stringify(seeded)); localStorage.setItem('labcharts-changelog-seen', unseenMarker);
  }, {seeded, registry, unseenMarker});
  const errors: string[] = [], csp: string[] = [], external: string[] = [], traffic: Array<{method: string; url: string}> = [];
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message)); observe(page); context.on('page', observe);
  context.on('request', request => traffic.push({method: request.method(), url: request.url()}));
  await context.exposeBinding('changelogPwaCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => {
    const observed = window as unknown as ObservedWindow; observed.changelogPwaEvents = [];
    for (const type of ['pointerdown', 'click', 'keydown', 'focusin', 'focusout']) document.addEventListener(type, event => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('#changelog-modal-overlay,#settings-modal,[data-shell-action="open-settings"]')) return;
      observed.changelogPwaEvents.push({type, target: target.id || target.getAttribute('data-changelog-action') || target.getAttribute('data-settings-action') || target.getAttribute('data-shell-action') || target.tagName,
        trusted: event.isTrusted, key: event instanceof KeyboardEvent ? event.key : null, pointerType: event instanceof PointerEvent ? event.pointerType : null});
    }, true);
    document.addEventListener('securitypolicyviolation', event => {void observed.changelogPwaCsp(event.violatedDirective);});
  });
  const server = await startKitServer(artifact.directory); let closed = false;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== server.origin) {external.push(url.href); await route.abort();}
    else await route.continue();
  });
  const phases: unknown[] = [], boundaries: Array<{phase: number; beforeNewPage: number | null; afterClose: number}> = [];
  try {
    await ready(page, server.origin); await ready(page, server.origin);
    // Warm the public Settings consumer before defining the protected profile boundary; Changelog remains cold.
    await settings(page); await activate(page, page.locator('#settings-modal [data-settings-action="close"]').first());
    await expect(page.locator('#settings-modal-overlay')).not.toHaveClass(/\bshow\b/);
    await expect(page.locator('#changelog-modal .changelog-entry')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('labcharts-changelog-seen'))).toBe(unseenMarker);
    const before = await profile(page, artifact.state); expect(before.live.contextNotes).toBe(sentinel); expect(before.stored.contextNotes).toBe(sentinel);
    expect(before.live.notes).toEqual(seeded.notes); expect(before.stored.notes).toEqual(seeded.notes);
    const onlineCache = await cacheReceipt(page, artifact);
    const servedWorker = await fetch(server.origin + '/service-worker.js').then(response => response.arrayBuffer());
    expect(sha(new Uint8Array(servedWorker))).toBe(artifact.servedWorkerSHA256);
    await server.close(); closed = true; await expect(fetch(server.origin + '/index.html')).rejects.toThrow();
    for (let phase = 0; phase < 3; phase++) {
      const beforeNewPage = phase > 0 ? context.pages().length : null;
      if (phase > 0) {expect(beforeNewPage).toBe(0); page = await context.newPage(); expect(context.pages()).toHaveLength(1); await ready(page, server.origin);}
      expect(await profile(page, artifact.state)).toEqual(before);
      await expect(page.locator('#changelog-modal .changelog-entry')).toHaveCount(0);
      const seenBefore = await page.evaluate(() => localStorage.getItem('labcharts-changelog-seen'));
      expect(seenBefore).toBe(phase === 0 ? unseenMarker : artifact.appVersion);
      await settings(page);
      await activate(page, page.locator('#settings-tab-display [data-settings-action="open-changelog"]'));
      await expect(page.locator('#settings-modal-overlay')).not.toHaveClass(/\bshow\b/);
      await expect(page.locator('#changelog-modal-overlay')).toHaveClass(/\bshow\b/);
      const panel = page.locator('#changelog-modal'), close = panel.locator('[data-changelog-action="close"]');
      await expect(close).toBeFocused(); await expect(panel.locator('.gb-modal-title')).toHaveText("What's New");
      const count = await panel.locator('.changelog-entry').count(); expect(count).toBeGreaterThan(3);
      await expect(panel.locator('.changelog-version').first()).toHaveText('v' + CURRENT_RELEASE.version + ' — ' + CURRENT_RELEASE.title);
      await expect(panel.locator('.changelog-date').first()).toHaveText(CURRENT_RELEASE.date);
      await expect(panel.locator('.changelog-version').last()).not.toHaveText('');
      await expect(panel).toHaveClass(/gb:changelog-panel:changelog-panel-block/);
      await expect(close).toHaveAttribute('type', 'button');
      await activate(page, close); await expect(page.locator('#changelog-modal-overlay')).not.toHaveClass(/\bshow\b/);
      await expect(close).not.toBeFocused();
      const seenAfter = await page.evaluate(() => localStorage.getItem('labcharts-changelog-seen'));
      expect(seenAfter).toBe(artifact.appVersion);
      const snapshot = await profile(page, artifact.state), cache = await cacheReceipt(page, artifact);
      const events = await page.evaluate(() => (window as unknown as ObservedWindow).changelogPwaEvents);
      const raw = {phase: phase === 0 ? 'first-offline' : 'cold-' + phase, seenBefore, seenAfter, entryCount: count, snapshot, cache, events};
      await info.attach('changelog-phase-' + phase, {body: JSON.stringify(raw, null, 2), contentType: 'application/json'});
      expect(snapshot).toEqual(before); expect(cache.keys).toEqual(onlineCache.keys);
      expect(events.some(event => event.type === 'click' && event.trusted && event.target === 'open-changelog')).toBe(true);
      expect(events.some(event => event.type === 'click' && event.trusted && event.target === 'close')).toBe(true);
      const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
      expect(events.some(event => event.type === 'pointerdown' && event.trusted && event.pointerType === (coarse ? 'touch' : 'mouse'))).toBe(true);
      phases.push(raw);
      for (const client of context.pages()) await client.close(); expect(context.pages()).toHaveLength(0);
      boundaries.push({phase, beforeNewPage, afterClose: context.pages().length});
    }
    expect(phases).toHaveLength(3); expect(boundaries.slice(1).map(value => value.beforeNewPage)).toEqual([0, 0]);
    expect(await artifactInputs()).toEqual(artifact); expect(errors).toEqual([]); expect(csp).toEqual([]); expect(external).toEqual([]);
    await info.attach('changelog-stopped-origin-acceptance', {body: JSON.stringify({artifact, before, onlineCache,
      servedWorkerSHA256: sha(new Uint8Array(servedWorker)), stoppedListener: true, coldLaunches: 2, boundaries, phases, traffic, errors, csp, external,
      boundary: 'Actual built static Kit/SW/cache with native Settings Display Resources handoff; first offline Changelog construction and two zero-page cold clients. Whole real bundled live imported profile plus native IDB commit and full registry preserved. Synthetic unencrypted returning-user profile and paused credential-free OpenRouter; no external provider. Existing kit-test-a/version/legacyProbe fixture seam. No OS install, physical Safari/iPhone, SW termination, whole app or migration acceptance claim.'}, null, 2), contentType: 'application/json'});
  } finally {if (!closed) await server.close();}
});
