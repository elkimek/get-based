import {nativeTabKey} from '../helpers/native-tab-key.js';
import fs from 'node:fs/promises';
import {expect, test, type Page} from '@playwright/test';
import {createDefaultProfileData, migrateProfileData} from '../../js/profile.js';
import type {ProfileData} from '../../types/app-state.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';
import {sha, artifactInputs, profile, cacheReceipt, activate} from './kit-native-receipts.js';

const authored = ['js/header-date-range.js', 'js/components/HeaderDateSummary.svelte.html.js',
  'js/components/HeaderRangeButtons.svelte.html.js'] as const;
const modules = [...authored, 'js/data.js', 'js/data-view-controls.js', 'js/data-core.js', 'js/state.js',
  'js/profile.js', 'js/profile-list-store.js', 'js/settings.js', 'js/settings-display-panel.js'] as const;
const sheets = ['css/app-shell.css', 'css/redesign-shell.css', 'css/settings.css', 'css/modal-shared.css'] as const;
const modes = ['optimal', 'reference', 'both'] as const;
type Mode = typeof modes[number];
interface NativeEvent {type: string; target: string; action: string | null; range: string | null;
  trusted: boolean; key: string | null; pointerType: string | null; at: number}
interface ObservedWindow extends Window {headerRangePwaEvents: NativeEvent[]; headerRangePwaCsp(value: string): Promise<void>}
const header = (mode: Mode) => '#header-range-toggle [data-range="' + mode + '"]';
const settingsRange = (mode: Mode) => '#settings-tab-display [data-settings-action="switch-range"][data-range="' + mode + '"]';

async function nativeState(page: Page, artifact: Awaited<ReturnType<typeof artifactInputs>>) {
  const committed = await profile(page, artifact.state);
  const controls = await page.evaluate(async binding => {
    const namespace = await import(binding.chunk) as Record<string, unknown>, state = namespace[binding.exportName];
    if (!state || typeof state !== 'object' || !('rangeMode' in state) || !['optimal', 'reference', 'both'].includes(String(state.rangeMode)))
      throw new Error('Actual bundled range state missing');
    const preferences = Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('labcharts-default-')
      || ['labcharts-theme', 'labcharts-accent', 'labcharts-last-manual-backup', 'labcharts-backup-nudge-snoozed-until',
        'labcharts-encryption-enabled', 'labcharts-rangeMode', 'labcharts-ai-provider', 'labcharts-ai-paused', 'labcharts-legal-acceptance',
        'labcharts-ai-transparency-acknowledgement'].includes(key) || key.startsWith('labcharts-ai-') || key.startsWith('labcharts-openrouter-')
      || key.startsWith('labcharts-ai-ctx-')).sort().map(key => [key, localStorage.getItem(key)]));
    return {rangeMode: state.rangeMode, preferences};
  }, artifact.state);
  return {committed, ...controls};
}
async function closeChat(page: Page) {
  const close = page.getByRole('button', {name: 'Close chat', exact: true});
  if (await close.isVisible()) await activate(page, close);
}
async function openSettings(page: Page) {
  await closeChat(page);
  const entry = page.locator('button[data-shell-action="open-settings"]');
  await expect(entry).toBeVisible(); await activate(page, entry);
  await expect(page.locator('#settings-modal-overlay')).toHaveClass(/\bshow\b/);
  await activate(page, page.locator('#settings-nav-display'));
  await expect(page.locator('#settings-tab-display')).toBeVisible();
  await expect(page.locator(settingsRange('reference'))).toBeVisible();
}
async function closeSettings(page: Page) {
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  if (coarse) await activate(page, page.locator('#settings-modal [data-settings-action="close"]').first());
  else await page.keyboard.press('Escape');
  await expect(page.locator('#settings-modal-overlay')).not.toHaveClass(/\bshow\b/);
}
async function exactControls(page: Page, mode: Mode, settingsOpen: boolean) {
  const narrow = await page.evaluate(() => innerWidth <= 768);
  await expect(page.locator('#header-dates')).toHaveText('Dates: Apr 2024 – Jul 2026');
  await expect(page.locator('#header-dates .label')).toHaveText('Dates:');
  await expect(page.locator('#header-range-toggle .range-toggle-btn')).toHaveCount(3);
  if (narrow) {await expect(page.locator('#header-dates')).toBeHidden(); await expect(page.locator('#header-range-toggle')).toBeHidden();}
  else {await expect(page.locator('#header-dates')).toBeVisible(); await expect(page.locator('#header-range-toggle')).toBeVisible();}
  for (const candidate of modes) {
    const button = page.locator(header(candidate));
    await expect(button).toHaveText(candidate.charAt(0).toUpperCase() + candidate.slice(1));
    await expect(button).toHaveAttribute('type', 'button'); await expect(button).toHaveAttribute('data-lab-data-action', 'switch-range-mode');
    await expect(button).toHaveAttribute('data-lab-data-range', candidate);
    await expect(button).toHaveAttribute('aria-pressed', String(candidate === mode));
    expect(await button.evaluate(el => el.classList.contains('active'))).toBe(candidate === mode);
    expect(await button.evaluate(el => el instanceof HTMLButtonElement && el.type === 'button' && !el.disabled && el.form === null)).toBe(true);
    if (settingsOpen) {
      const control = page.locator(settingsRange(candidate));
      await expect(control).toBeVisible(); await expect(control).toHaveAttribute('aria-pressed', String(candidate === mode));
      expect(await control.evaluate(el => el.classList.contains('active'))).toBe(candidate === mode);
    }
  }
}
async function keyboardRange(page: Page, mode: Mode) {
  const samples = [];
  for (let attempt = 0; attempt < 100; attempt++) {
    await page.keyboard.press(nativeTabKey(page, mode === 'reference'));
    const raw = await page.evaluate(selector => ({at: performance.now(), matched: !!document.activeElement?.matches(selector),
      active: document.activeElement ? {tag: document.activeElement.tagName, id: document.activeElement.id,
        range: document.activeElement.getAttribute('data-range')} : null}), header(mode));
    samples.push(raw);
    if (raw.matched) {await expect(page.locator(header(mode))).toBeFocused(); await page.keyboard.press('Space'); return samples;}
  }
  throw new Error('Native keyboard could not reach visible header range ' + mode);
}
async function controlReceipt(page: Page) {
  return page.evaluate(() => {
    const selectors = ['#header-dates', '#header-range-toggle', '#header-range-toggle [data-range="optimal"]',
      '#header-range-toggle [data-range="reference"]', '#header-range-toggle [data-range="both"]'];
    return {at: performance.now(), width: innerWidth, coarse: matchMedia('(pointer: coarse)').matches,
      nodes: selectors.map(selector => {
        const el = document.querySelector(selector); if (!el) throw new Error('Actual header receiver missing: ' + selector);
        const box = el.getBoundingClientRect(); return {selector, html: el.outerHTML, attrs: Object.fromEntries([...el.attributes].map(a => [a.name, a.value])),
          text: el.textContent, display: getComputedStyle(el).display, active: document.activeElement === el,
          focusVisible: el.matches(':focus-visible'), hover: el.matches(':hover'), bounds: {x: box.x, y: box.y, width: box.width, height: box.height}};
      }), active: document.activeElement ? {tag: document.activeElement.tagName, id: document.activeElement.id,
        range: document.activeElement.getAttribute('data-range')} : null};
  });
}

test('static header dates and native range controls persist exact preference on first offline use and two zero-page cold launches', async ({page, context}, info) => {
  test.setTimeout(150000);
  // Fail closed until the actual reviewed implementation has been built into the supplied Kit artifact.
  const artifact = await artifactInputs(modules, sheets);
  const swDeclarations = await fs.readFile('service-worker-assets.js', 'utf8');
  for (const module of authored) expect(swDeclarations).toContain("'/" + module + "'");
  await installDiscussionFixture(context, {provider: 'openrouter', paused: true}); await installOfflineStartupDiagnostics(context);
  const demo = JSON.parse(await fs.readFile('data/demo-male.json', 'utf8')) as Pick<ProfileData, 'entries' | 'refOverrides'>;
  const sentinel = 'PRIVATE_HEADER_RANGE_PWA_CONTEXT';
  const seeded = migrateProfileData({...createDefaultProfileData(), entries: demo.entries, refOverrides: demo.refOverrides,
    notes: [{date: '2026-09-01', text: 'Retained unrelated <note>'}], contextNotes: sentinel, importBenchmarks: [], wearableConnections: {}});
  const registry = [{id: 'default', name: 'Synthetic header range', sex: 'male', dob: '1987-11-22', createdAt: 1,
    location: {country: '', zip: ''}, tags: [], notes: '', status: 'active', lastUpdated: 1, pinned: false, height: null, heightUnit: 'cm'}];
  await context.addInitScript(({seeded, registry}) => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('header-range-pwa-seeded')) return;
    localStorage.setItem('header-range-pwa-seeded', '1'); localStorage.setItem('labcharts-theme', 'dark');
    localStorage.setItem('labcharts-profiles', JSON.stringify(registry)); localStorage.setItem('labcharts-active-profile', 'default');
    localStorage.setItem('labcharts-analytics-disabled', 'true'); localStorage.setItem('labcharts-show-product-recs', 'false');
    localStorage.setItem('labcharts-default-imported', JSON.stringify(seeded));
    // Existing returning-user fixture, using normal walltime; no timer, backup dialog or style override.
    localStorage.setItem('labcharts-last-manual-backup', new Date().toISOString());
  }, {seeded, registry});
  const errors: string[] = [], csp: string[] = [], external: string[] = [], traffic: Array<{method: string; url: string}> = [];
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message)); observe(page); context.on('page', observe);
  context.on('request', request => traffic.push({method: request.method(), url: request.url()}));
  await context.exposeBinding('headerRangePwaCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => {
    const observed = window as unknown as ObservedWindow; observed.headerRangePwaEvents = [];
    for (const type of ['pointerdown', 'click', 'keydown', 'focusin', 'focusout', 'input', 'change']) document.addEventListener(type, event => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('#header-dates,#header-range-toggle,#settings-modal,[data-shell-action="open-settings"]')) return;
      const action = target.closest('[data-lab-data-action],[data-settings-action],[data-shell-action]');
      observed.headerRangePwaEvents.push({type, target: target.id || target.tagName,
        action: action?.getAttribute('data-lab-data-action') || action?.getAttribute('data-settings-action') || action?.getAttribute('data-shell-action') || null,
        range: action?.getAttribute('data-range') || null, trusted: event.isTrusted,
        key: event instanceof KeyboardEvent ? event.key : null, pointerType: event instanceof PointerEvent ? event.pointerType : null, at: performance.now()});
    }, true);
    document.addEventListener('securitypolicyviolation', event => {void observed.headerRangePwaCsp(event.violatedDirective);});
  });
  const server = await startKitServer(artifact.directory); let closed = false;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== server.origin) {external.push(url.href); await route.abort();}
    else await route.continue();
  });
  const phases: unknown[] = [], boundaries: Array<{phase: number; beforeNewPage: number | null; afterClose: number}> = [];
  try {
    await ready(page, server.origin); await ready(page, server.origin); await closeChat(page);
    // Actual lazy Settings is warmed online; its native initialization is observed before protected baseline.
    await openSettings(page); await page.waitForLoadState('networkidle'); await exactControls(page, 'optimal', true);
    const original = await nativeState(page, artifact);
    expect(Object.keys(original.committed.live)).toHaveLength(43); expect(Object.keys(original.committed.stored)).toHaveLength(43);
    expect(original.committed.live).toEqual(original.committed.stored);
    expect(Object.keys(original.committed.stored).sort()).toEqual(Object.keys(seeded).sort());
    expect(original.committed.live.contextNotes).toBe(sentinel); expect(original.committed.stored.contextNotes).toBe(sentinel);
    expect(original.committed.live.notes).toEqual(seeded.notes); expect(original.committed.stored.notes).toEqual(seeded.notes);
    expect(original.committed.profiles).toEqual(registry); expect(original.committed.rawProfiles).toBe(JSON.stringify(registry));
    expect(original.preferences['labcharts-ai-provider']).toBe('openrouter'); expect(original.preferences['labcharts-ai-paused']).toBe('true');
    const narrow = await page.evaluate(() => innerWidth <= 768);
    if (narrow) {await activate(page, page.locator(settingsRange('reference'))); await exactControls(page, 'reference', true); await closeSettings(page);}
    else {await closeSettings(page); await activate(page, page.locator(header('reference')));}
    await exactControls(page, 'reference', false);
    const before = await nativeState(page, artifact), expected = structuredClone(original);
    expected.rangeMode = 'reference'; expected.preferences['labcharts-default-rangeMode'] = 'reference';
    expect(before).toEqual(expected);
    const onlineEvents = await page.evaluate(() => (window as unknown as ObservedWindow).headerRangePwaEvents);
    expect(onlineEvents.some(event => event.type === 'click' && event.trusted && event.range === 'reference')).toBe(true);
    const onlineControls = await controlReceipt(page), onlineCache = await cacheReceipt(page, artifact);
    const servedWorker = await fetch(server.origin + '/service-worker.js').then(response => response.arrayBuffer());
    expect(sha(new Uint8Array(servedWorker))).toBe(artifact.servedWorkerSHA256);
    await server.close(); closed = true; await expect(fetch(server.origin + '/index.html')).rejects.toThrow();
    for (let phase = 0; phase < 3; phase++) {
      const beforeNewPage = phase > 0 ? context.pages().length : null;
      if (phase > 0) {expect(beforeNewPage).toBe(0); page = await context.newPage(); expect(context.pages()).toHaveLength(1); await ready(page, server.origin);}
      expect(await nativeState(page, artifact)).toEqual(before); await exactControls(page, 'reference', false);
      const start = await page.evaluate(() => (window as unknown as ObservedWindow).headerRangePwaEvents.length);
      const keyboardPaths: unknown[] = [];
      if (narrow) await openSettings(page);
      for (const mode of ['both', 'reference'] as const) {
        if (!narrow && phase === 0) keyboardPaths.push({mode, path: await keyboardRange(page, mode)});
        else await activate(page, page.locator(narrow ? settingsRange(mode) : header(mode)));
        await exactControls(page, mode, narrow);
        const selected = await nativeState(page, artifact), wanted = structuredClone(before);
        wanted.rangeMode = mode; wanted.preferences['labcharts-default-rangeMode'] = mode;
        expect(selected).toEqual(wanted);
      }
      if (narrow) await closeSettings(page);
      const snapshot = await nativeState(page, artifact), controls = await controlReceipt(page), cache = await cacheReceipt(page, artifact);
      const events = await page.evaluate(start => (window as unknown as ObservedWindow).headerRangePwaEvents.slice(start), start);
      const raw = {phase: phase === 0 ? 'first-offline' : 'cold-' + phase, snapshot, controls, cache, events, keyboardPaths};
      await info.attach('header-date-range-phase-' + phase, {body: JSON.stringify(raw, null, 2), contentType: 'application/json'});
      for (const mode of ['both', 'reference']) expect(events.filter(event => event.type === 'click' && event.trusted && event.range === mode)).toHaveLength(1);
      const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
      if (!narrow && phase === 0) expect(events.filter(event => event.type === 'keydown' && event.trusted && event.key === ' ')).toHaveLength(2);
      else expect(events.some(event => event.type === 'pointerdown' && event.trusted && event.pointerType === (coarse ? 'touch' : 'mouse'))).toBe(true);
      expect(snapshot).toEqual(before); expect(cache.keys).toEqual(onlineCache.keys); phases.push(raw);
      for (const client of context.pages()) await client.close(); expect(context.pages()).toHaveLength(0);
      boundaries.push({phase, beforeNewPage, afterClose: context.pages().length});
    }
    expect(phases).toHaveLength(3); expect(boundaries.slice(1).map(value => value.beforeNewPage)).toEqual([0, 0]);
    expect(await artifactInputs(modules, sheets)).toEqual(artifact); expect(await fs.readFile('service-worker-assets.js', 'utf8')).toBe(swDeclarations);
    expect(errors).toEqual([]); expect(csp).toEqual([]); expect(external).toEqual([]);
    await info.attach('header-date-range-stopped-origin-acceptance', {body: JSON.stringify({artifact, original, before, onlineControls, onlineEvents, onlineCache,
      swDeclarationsSHA256: sha(swDeclarations), servedWorkerSHA256: sha(new Uint8Array(servedWorker)), stoppedListener: true,
      coldLaunches: 2, boundaries, phases, traffic, errors, csp, external,
      boundary: 'Actual built static Kit/SW/cache and bundled date/range source, genuine desktop header pointer and native Tab/Space or visible narrow Settings Display taps, full per-profile range preference persistence. Actual lazy Settings warmed online, first offline mutation plus two zero-page cold clients and exact43-key live/stored imported data/full registry/provider/context/preferences invariant except literal rangeMode. Synthetic returning-user unencrypted default profile/recent real-walltime manual backup and paused credential-free OpenRouter; no provider/clock/DOM/style/forced header visibility. Existing kit-test-a/version/legacyProbe server seam. No OS install, physical Safari/iPhone, SW termination, whole-app or migration acceptance.'}, null, 2), contentType: 'application/json'});
  } finally {if (!closed) await server.close();}
});
