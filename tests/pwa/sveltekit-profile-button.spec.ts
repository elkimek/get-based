import fs from 'node:fs/promises';
import {expect, test, type Locator, type Page} from '@playwright/test';
import {createDefaultProfileData, migrateProfileData} from '../../js/profile.js';
import type {ProfileData} from '../../types/app-state.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';
import {sha, artifactInputs, profile, cacheReceipt, activate} from './kit-native-receipts.js';

const modules = ['js/profile-button-presentation.js', 'js/profile-button-rendering.js',
  'js/components/ProfileButtonPresentation.svelte.html.js', 'js/nav.js', 'js/nav-runtime.js',
  'js/profile.js', 'js/profile-list-store.js', 'js/state.js', 'js/client-list.js',
  'js/client-list-impl.js', 'js/client-list-form.js', 'js/client-list-runtime.js'] as const;
const stylesheets = ['css/app-shell.css', 'css/redesign-shell.css', 'css/client-list.css', 'css/modal-shared.css'] as const;
interface NativeEvent {type: string; target: string; action: string | null; trusted: boolean; key: string | null; pointerType: string | null}
interface ObservedWindow extends Window {profileButtonPwaEvents: NativeEvent[]; profileButtonPwaCsp(value: string): Promise<void>}
async function nativeProfile(page: Page, artifact: Awaited<ReturnType<typeof artifactInputs>>) {
  const committed = await profile(page, artifact.state);
  const preferences = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key =>
    key.startsWith('labcharts-default-') || ['labcharts-theme', 'labcharts-accent', 'labcharts-last-manual-backup',
      'labcharts-backup-nudge-snoozed-until', 'labcharts-encryption-enabled'].includes(key)).sort()
    .map(key => [key, localStorage.getItem(key)])));
  return {committed, preferences};
}
const titleStateReceipts = new WeakMap<Page, unknown[]>();
/** Actual title suspension/restoration belongs to the existing native tooltip owner. */
async function exactProfileTitleState(page: Page, button: Locator) {
  const samples: unknown[] = [];
  const read = () => button.evaluate(button => {
    const tip = document.getElementById('app-tooltip');
    const css = tip ? getComputedStyle(tip) : null;
    return {title: button.getAttribute('title'), describedBy: button.getAttribute('aria-describedby'),
      focused: document.activeElement === button, hovered: button.matches(':hover'),
      buttonAttrs: Object.fromEntries([...button.attributes].map(attr => [attr.name, attr.value])),
      tooltip: tip ? {id: tip.id, role: tip.getAttribute('role'), text: tip.textContent,
        connected: tip.isConnected, attrs: Object.fromEntries([...tip.attributes].map(attr => [attr.name, attr.value])),
        visibleClass: tip.classList.contains('is-visible'), display: css!.display, visibility: css!.visibility, opacity: css!.opacity} : null};
  });
  try {
    await expect.poll(async () => {
      const raw = await read(); samples.push(raw);
      if (raw.describedBy === null) return raw.title === 'Manage clients';
      if (raw.describedBy !== 'app-tooltip') return false;
      return raw.title === null && (raw.focused || raw.hovered)
        && raw.tooltip?.id === 'app-tooltip' && raw.tooltip.role === 'tooltip' && raw.tooltip.text === 'Manage clients'
        && raw.tooltip.connected && raw.tooltip.visibleClass && raw.tooltip.display !== 'none'
        && raw.tooltip.visibility === 'visible' && raw.tooltip.opacity === '1';
    }, {message: 'Exact native title or active app-tooltip ownership; natural RAF/transition only'}).toBe(true);
  } catch (error) {
    await test.info().attach('profile-button-title-state-failure', {body: JSON.stringify(samples, null, 2), contentType: 'application/json'});
    throw error;
  } finally {
    const receipts = titleStateReceipts.get(page) ?? []; receipts.push({samples}); titleStateReceipts.set(page, receipts);
  }
}

async function visibleButton(page: Page) {
  const closeChat = page.getByRole('button', {name: 'Close chat', exact: true});
  if (await closeChat.isVisible()) await activate(page, closeChat);
  const button = page.locator('#profile-selector > button.profile-compact-btn');
  await expect(button).toBeVisible(); await expect(button).toHaveAttribute('data-nav-action', 'open-client-list');
  await exactProfileTitleState(page, button); await expect(button).not.toHaveAttribute('type');
  await expect(button.locator('.profile-compact-name')).toHaveText('Synthetic compact profile');
  await expect(button.locator('.profile-compact-dot')).toHaveText('S');
  await expect(button).toHaveClass(/gb:profile-button-app-button:profile-button-app-button-block/);
  expect(await button.evaluate(button => button instanceof HTMLButtonElement && button.type === 'submit' && button.form === null)).toBe(true);
  return button;
}
async function clientListCycle(page: Page, escape: boolean) {
  const button = await visibleButton(page); await activate(page, button);
  const overlay = page.locator('#client-list-overlay'); await expect(overlay).toHaveClass(/\bshow\b/);
  await expect(page.locator('#cl-search')).toBeFocused();
  await expect(page.locator('#cl-search')).toHaveAttribute('placeholder', 'Search clients...');
  await expect(page.locator('#client-list-modal')).toContainText('Synthetic compact profile');
  if (escape) await page.keyboard.press('Escape');
  else await activate(page, page.locator('#client-list-modal [data-cl-action="close"]').first());
  await expect(overlay).not.toHaveClass(/\bshow\b/); await expect(button).toBeFocused();
}

test('static compact profile and native Client List preserve whole profiles on first offline use and two zero-page cold launches', async ({page, context}, info) => {
  test.setTimeout(150000);
  const artifact = await artifactInputs(modules, stylesheets);
  const swDeclarations = await fs.readFile('service-worker-assets.js', 'utf8');
  for (const module of modules.slice(0, 3)) expect(swDeclarations).toContain("'/" + module + "'");
  await installDiscussionFixture(context, {provider: 'openrouter', paused: true}); await installOfflineStartupDiagnostics(context);
  const demo = JSON.parse(await fs.readFile('data/demo-male.json', 'utf8')) as Pick<ProfileData, 'entries' | 'refOverrides'>;
  const sentinel = 'PRIVATE_COMPACT_PROFILE_PWA';
  const seeded = migrateProfileData({...createDefaultProfileData(), entries: demo.entries, refOverrides: demo.refOverrides,
    notes: [{date: '2026-09-01', text: 'Retained unrelated <note>'}], contextNotes: sentinel, importBenchmarks: [], wearableConnections: {}});
  const registry = [{id: 'default', name: 'Synthetic compact profile', sex: 'male', dob: '1987-11-22', createdAt: 1,
    location: {country: '', zip: ''}, tags: [], notes: '', status: 'active', lastUpdated: 1, pinned: false, height: null, heightUnit: 'cm'}];
  await context.addInitScript(({seeded, registry}) => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('profile-button-pwa-seeded')) return;
    localStorage.setItem('profile-button-pwa-seeded', '1'); localStorage.setItem('labcharts-theme', 'dark');
    localStorage.setItem('labcharts-profiles', JSON.stringify(registry)); localStorage.setItem('labcharts-active-profile', 'default');
    localStorage.setItem('labcharts-analytics-disabled', 'true'); localStorage.setItem('labcharts-show-product-recs', 'false');
    localStorage.setItem('labcharts-default-imported', JSON.stringify(seeded));
    // Disclosed returning-user fixture: normal unforced wall time; suppress no timers or modal styles.
    localStorage.setItem('labcharts-last-manual-backup', new Date().toISOString());
  }, {seeded, registry});
  const errors: string[] = [], csp: string[] = [], external: string[] = [], traffic: Array<{method: string; url: string}> = [];
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message)); observe(page); context.on('page', observe);
  context.on('request', request => traffic.push({method: request.method(), url: request.url()}));
  await context.exposeBinding('profileButtonPwaCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => {
    const observed = window as unknown as ObservedWindow; observed.profileButtonPwaEvents = [];
    for (const type of ['pointerdown', 'click', 'keydown', 'focusin', 'focusout']) document.addEventListener(type, event => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('#profile-selector,#client-list-modal')) return;
      const action = target.closest('[data-nav-action],[data-cl-action]');
      observed.profileButtonPwaEvents.push({type, target: target.id || target.tagName,
        action: action?.getAttribute('data-nav-action') || action?.getAttribute('data-cl-action') || null,
        trusted: event.isTrusted, key: event instanceof KeyboardEvent ? event.key : null,
        pointerType: event instanceof PointerEvent ? event.pointerType : null});
    }, true);
    document.addEventListener('securitypolicyviolation', event => {void observed.profileButtonPwaCsp(event.violatedDirective);});
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
    await visibleButton(page); const before = await nativeProfile(page, artifact);
    expect(before.committed.live.contextNotes).toBe(sentinel); expect(before.committed.stored.contextNotes).toBe(sentinel);
    expect(before.committed.live.notes).toEqual(seeded.notes); expect(before.committed.stored.notes).toEqual(seeded.notes);
    expect(before.committed.rawProfiles).toBe(JSON.stringify(registry)); expect(before.committed.profiles).toEqual(registry);
    // Warm the actual lazy Client List once online; no injected controller, DOM or profile getter.
    await clientListCycle(page, false); expect(await nativeProfile(page, artifact)).toEqual(before);
    const onlineEvents = await page.evaluate(() => (window as unknown as ObservedWindow).profileButtonPwaEvents);
    expect(onlineEvents.some(event => event.type === 'click' && event.trusted && event.action === 'open-client-list')).toBe(true);
    const onlineTitleStates = structuredClone(titleStateReceipts.get(page) ?? []);
    const onlineCache = await cacheReceipt(page, artifact);
    const servedWorker = await fetch(server.origin + '/service-worker.js').then(response => response.arrayBuffer());
    expect(sha(new Uint8Array(servedWorker))).toBe(artifact.servedWorkerSHA256);
    await server.close(); closed = true; await expect(fetch(server.origin + '/index.html')).rejects.toThrow();
    for (let phase = 0; phase < 3; phase++) {
      const beforeNewPage = phase > 0 ? context.pages().length : null;
      if (phase > 0) {expect(beforeNewPage).toBe(0); page = await context.newPage(); expect(context.pages()).toHaveLength(1); await ready(page, server.origin);}
      expect(await nativeProfile(page, artifact)).toEqual(before);
      const start = await page.evaluate(() => (window as unknown as ObservedWindow).profileButtonPwaEvents.length);
      await clientListCycle(page, false); expect(await nativeProfile(page, artifact)).toEqual(before);
      await clientListCycle(page, true); expect(await nativeProfile(page, artifact)).toEqual(before);
      const snapshot = await nativeProfile(page, artifact), cache = await cacheReceipt(page, artifact);
      const events = await page.evaluate(start => (window as unknown as ObservedWindow).profileButtonPwaEvents.slice(start), start);
      const raw = {phase: phase === 0 ? 'first-offline' : 'cold-' + phase, snapshot, cache, events,
        titleStates: structuredClone(titleStateReceipts.get(page) ?? [])};
      await info.attach('profile-button-phase-' + phase, {body: JSON.stringify(raw, null, 2), contentType: 'application/json'});
      expect(events.filter(event => event.type === 'click' && event.trusted && event.action === 'open-client-list')).toHaveLength(2);
      expect(events.filter(event => event.type === 'click' && event.trusted && event.action === 'close')).toHaveLength(1);
      expect(events.filter(event => event.type === 'keydown' && event.trusted && event.key === 'Escape')).toHaveLength(1);
      const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
      expect(events.some(event => event.type === 'pointerdown' && event.trusted && event.pointerType === (coarse ? 'touch' : 'mouse'))).toBe(true);
      expect(snapshot).toEqual(before); expect(cache.keys).toEqual(onlineCache.keys); phases.push(raw);
      for (const client of context.pages()) await client.close(); expect(context.pages()).toHaveLength(0);
      boundaries.push({phase, beforeNewPage, afterClose: context.pages().length});
    }
    expect(phases).toHaveLength(3); expect(boundaries.slice(1).map(value => value.beforeNewPage)).toEqual([0, 0]);
    expect(await artifactInputs(modules, stylesheets)).toEqual(artifact);
    expect(await fs.readFile('service-worker-assets.js', 'utf8')).toBe(swDeclarations);
    expect(errors).toEqual([]); expect(csp).toEqual([]); expect(external).toEqual([]);
    await info.attach('profile-button-stopped-origin-acceptance', {body: JSON.stringify({artifact, before, onlineCache, onlineEvents, onlineTitleStates,
      swDeclarationsSHA256: sha(swDeclarations), servedWorkerSHA256: sha(new Uint8Array(servedWorker)), stoppedListener: true,
      coldLaunches: 2, boundaries, phases, traffic, errors, csp, external,
      boundary: 'Actual static Kit/SW/cache and public compact profile native Client List click/tap/close/Escape/focus. Online lazy consumer warm, first offline use plus two zero-page cold clients; whole real bundled live imported profile, native readonly IDB commit/raw registry and profile preferences unchanged. Synthetic returning-user unencrypted default profile/recent manual backup and paused credential-free OpenRouter; no provider/window override. Existing kit-test-a/version/legacyProbe server seam. No OS install, hardware Safari/iPhone, SW termination, full-app or pending Tweaks parity claim.'}, null, 2), contentType: 'application/json'});
  } finally {if (!closed) await server.close();}
});
