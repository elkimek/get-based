import {nativeTabKey} from '../helpers/native-tab-key.js';
import fs from 'node:fs/promises';
import {expect, test, type BrowserContext, type Locator, type Page, type TestInfo} from '@playwright/test';
import {createDefaultProfileData, migrateProfileData} from '../../js/profile.js';
import type {ProfileData} from '../../types/app-state.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';
import {artifactInputs, profile} from './kit-native-receipts.js';
import {startKitServer} from './kit-server.js';
import {proveRenderedGradientContrast} from '../helpers/rendered-gradient-contrast.js';

/** Reach the real control exclusively through browser keyboard navigation. */
async function tabTo(page: Page, control: Locator): Promise<void> {
  await expect(control).toBeVisible();
  await expect(control).toBeEnabled();
  for (let step = 0; step < 240; step++) {
    if (await control.evaluate(node => document.activeElement === node)) {
      await expect(control).toBeFocused();
      await expect(control).toBeInViewport();
      expect(await control.evaluate(node => node.matches(':focus-visible'))).toBe(true);
      return;
    }
    await page.keyboard.press(nativeTabKey(page));
  }
  throw new Error(`Keyboard could not reach ${await control.getAttribute('data-nav-route') || await control.getAttribute('id') || 'expected visible control'}`);
}

async function activate(page: Page, control: Locator) {
  await tabTo(page, control);
  await page.keyboard.press('Enter');
}

async function sidebar(page: Page) {
  const menu = page.getByRole('button', {name: 'Menu', exact: true});
  if (await menu.isVisible() && !await page.locator('#sidebar-nav').evaluate(node => node.classList.contains('mobile-open'))) {
    await activate(page, menu);
    await expect(page.locator('#sidebar-nav')).toHaveClass(/\bmobile-open\b/);
  }
  return page.locator('#sidebar-nav');
}

async function navigate(page: Page, route: string) {
  const nav = await sidebar(page);
  const control = nav.locator(`[data-nav-action="navigate"][data-nav-route="${route}"]`);
  await activate(page, control);
  await expect(control).toHaveClass(/\bactive\b/);
  await expect(nav).not.toHaveClass(/\bmobile-open\b/);
  await expect(page.locator('#main-content')).toBeVisible();
}

/** Sample settled visuals without disabling motion or waiting for infinite pulses. */
async function waitForFiniteVisualAnimations(root: Locator) {
  return root.evaluate(async element => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let completed = 0;
    const finite = () => element.getAnimations({subtree: true}).filter(animation => {
      const end = animation.effect?.getComputedTiming().endTime;
      return typeof end === 'number' && Number.isFinite(end) && !['finished', 'idle'].includes(animation.playState);
    });
    const settle = async () => {
      for (let pass = 0; pass < 20; pass++) {
        if (!element.isConnected) throw new Error('Visual acceptance root was replaced during animation readiness');
        const animations = finite();
        completed += animations.length;
        await Promise.all(animations.map(animation => animation.finished.catch(error => {
          // Genuine cancellation is terminal; the next scan still checks its replacement.
          if (animation.playState !== 'idle') throw error;
        })));
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        if (finite().length === 0) return {completed, ongoingNonFinite: element.getAnimations({subtree: true}).filter(animation => {
          const end = animation.effect?.getComputedTiming().endTime;
          return typeof end === 'number' && !Number.isFinite(end);
        }).length};
      }
      throw new Error('Finite visual animations did not settle in twenty observed paint boundaries');
    };
    try {
      return await Promise.race([settle(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Finite visual animation readiness exceeded five seconds')), 5000);
      })]);
    } finally {if (timer !== undefined) clearTimeout(timer);}
  });
}

interface ViewReceipt {
  name: string;
  accessibility: string;
  focus: {tag: string; id: string; name: string; outline: string; shadow: string};
  geometry: {documentWidth: number; viewportWidth: number};
  violations: Array<{id: string; impact: string | null | undefined; targets: unknown[]}>;
  motion: {completed: number; ongoingNonFinite: number};
}

async function inspect(page: Page, root: Locator, name: string, info: TestInfo): Promise<ViewReceipt> {
  await expect(root).toBeVisible();
  const control = root.locator(':is(button:enabled, summary, input:enabled, select:enabled, textarea:enabled, a[href]):visible:not([inert], [inert] *)').first();
  await tabTo(page, control);
  const motion = await waitForFiniteVisualAnimations(root);
  const focus = await control.evaluate(node => {
    const style = getComputedStyle(node);
    return {tag: node.tagName, id: node.id, name: node.getAttribute('aria-label') || node.textContent?.trim() || '', outline: style.outline, shadow: style.boxShadow,
      visibleRing: (parseFloat(style.outlineWidth) >= 2 && style.outlineStyle !== 'none' && style.outlineColor !== 'rgba(0, 0, 0, 0)') || style.boxShadow !== 'none'};
  });
  expect(focus.visibleRing, `${name}: keyboard focus has a painted outline or shadow`).toBe(true);
  const geometry = await page.evaluate(() => ({documentWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth}));
  expect(geometry.documentWidth, `${name}: no document horizontal overflow`).toBeLessThanOrEqual(geometry.viewportWidth);
  const violations = await root.evaluate(async element => {
    const result = await (window as unknown as {axe: typeof import('axe-core')}).axe.run(element, {
      runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa']},
    });
    return result.violations.map(item => ({id: item.id, impact: item.impact, targets: item.nodes.map(node => node.target),
      nodes: item.nodes.map(({html, target, failureSummary, any, all, none}) => ({html, target, failureSummary, any, all, none})),
    }));
  });
  await info.attach(name + '-axe', {body: JSON.stringify(violations, null, 2), contentType: 'application/json'});
  // Keep every violation failing the case while collecting the remaining routes.
  expect.soft(violations, `${name}: scoped WCAG axe violations`).toEqual([]);
  const accessibility = await root.ariaSnapshot();
  expect(accessibility.length).toBeGreaterThan(0);
  await page.screenshot({path: info.outputPath(name + '.png'), fullPage: true});
  return {name, accessibility, focus, geometry, violations, motion};
}

async function installMainRouteProfile(context: BrowserContext) {
  const demo = JSON.parse(await fs.readFile('data/demo-male.json', 'utf8')) as Pick<ProfileData, 'entries' | 'refOverrides' | 'customMarkers'>;
  const seed = migrateProfileData(structuredClone({...createDefaultProfileData(),
    entries: demo.entries, refOverrides: demo.refOverrides, customMarkers: demo.customMarkers, profile: {firstName: 'Alex', age: 38},
    contextNotes: 'Preserve route acceptance context <literal>.', markerNotes: {'thyroid.tsh': 'Preserve marker note'},
    sunDefaults: {fitzpatrick: 'II', completedAt: 1},
    // Visited features otherwise materialize these optional collections on first read.
    lightEnvironment: {rooms: [], screens: []}, lightDailyVerdicts: {}, importBenchmarks: [],
  }));
  const rawSeed = JSON.stringify(seed);
  await context.addInitScript(rawImported => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('main-route-acceptance-seeded')) return;
    localStorage.setItem('main-route-acceptance-seeded', '1');
    localStorage.setItem('labcharts-theme', 'dark');
    localStorage.setItem('labcharts-analytics-disabled', 'true');
    localStorage.setItem('labcharts-show-product-recs', 'false');
    localStorage.setItem('labcharts-profiles', JSON.stringify([{id: 'default', name: 'Alex', sex: 'male', dob: '1987-11-22', createdAt: 1}]));
    localStorage.setItem('labcharts-active-profile', 'default');
    localStorage.setItem('labcharts-default-onboarded', 'profile-set');
    localStorage.setItem('labcharts-default-lastViewV1', 'dashboard');
    localStorage.setItem('labcharts-last-manual-backup', '2026-10-16T00:00:00Z');
    localStorage.setItem('labcharts-default-imported', rawImported);
  }, rawSeed);
  return {seed, rawSeed};
}

test('Dark main routes retain keyboard access, scoped accessibility and unchanged profiles after a stopped-origin launch', async ({page, context}, info) => {
  test.skip(!['kit-chromium', 'kit-mobile-webkit'].includes(info.project.name), 'This finite supplement selects desktop Chromium and emulated mobile WebKit only.');
  test.setTimeout(240000);
  const artifact = await artifactInputs(['js/state.js', 'js/nav.js', 'js/profile.js'], ['styles.css', 'css/app-shell.css']);
  await installDiscussionFixture(context, {provider: 'openrouter', paused: true});
  await installOfflineStartupDiagnostics(context);
  const {seed, rawSeed} = await installMainRouteProfile(context);
  const errors: string[] = [], csp: string[] = [], external: string[] = [], receipts: ViewReceipt[] = [];
  const observe = (target: Page) => {
    target.on('pageerror', error => errors.push(error.message));
    target.on('websocket', socket => external.push(socket.url()));
  };
  observe(page); context.on('page', observe);
  await context.exposeBinding('mainRouteAcceptanceCsp', (_, directive: string) => csp.push(directive));
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    document.addEventListener('securitypolicyviolation', event => void (window as unknown as {mainRouteAcceptanceCsp(value: string): Promise<void>}).mainRouteAcceptanceCsp(event.violatedDirective));
  });
  const server = await startKitServer(artifact.directory);
  let stopped = false;
  context.on('request', request => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== server.origin) external.push(url.href);
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['http:', 'https:'].includes(url.protocol) && url.origin !== server.origin ? route.abort() : route.continue();
  });
  try {
    await page.clock.setFixedTime(new Date('2026-10-16T12:00:00Z'));
    await ready(page, server.origin);
    expect(await page.evaluate(() => document.documentElement.dataset.theme || 'dark')).toBe('dark');
    const before = await profile(page, artifact.state);
    expect(before.live).toEqual(before.stored);
    expect(before.live).toEqual(seed);
    expect(before.rawCommitted).toBe(rawSeed);
    expect(before.live.entries).toEqual(seed.entries);
    expect(before.live.customMarkers).toEqual(seed.customMarkers);
    const unchanged = async (target: Page) => expect(await profile(target, artifact.state)).toEqual(before);
    await server.close(); stopped = true;
    await expect(fetch(server.origin + '/index.html')).rejects.toThrow();
    const main = page.locator('#main-content');
    await expect(main.locator('[data-widget-id]').first()).toBeVisible();
    receipts.push(await inspect(page, main, 'dashboard', info)); await unchanged(page);
    for (const [route, title] of [['labs', 'Labs'], ['genome', 'Genome'], ['body', 'Body'], ['insight', 'Insight'], ['recommendations', 'Tips']] as const) {
      await navigate(page, route);
      await expect(main.locator('.lens-page-header h2')).toHaveText(title);
      receipts.push(await inspect(page, main, route, info)); await unchanged(page);
    }
    await navigate(page, 'biochemistry');
    await expect(main.getByRole('heading', {name: /Biochemistry/i}).first()).toBeVisible();
    await expect(main.locator('canvas').first()).toBeVisible();
    receipts.push(await inspect(page, main, 'marker-category', info)); await unchanged(page);
    await navigate(page, 'biology-scores');
    await expect(main.locator('#biology-score-biologicalCoherence[data-biology-overview-view]')).toBeVisible();
    receipts.push(await inspect(page, main, 'biology', info)); await unchanged(page);
    await navigate(page, 'light');
    await expect(main.locator('.light-page[data-light-page-presentation]')).toBeVisible();
    receipts.push(await inspect(page, main, 'light', info)); await unchanged(page);

    const nav = await sidebar(page), opener = nav.locator('[data-nav-action="open-context"]');
    await activate(page, opener);
    const hub = page.locator('[data-context-hub-view]');
    await expect(hub).toHaveAttribute('data-context-save-state', 'idle');
    await expect(hub).toHaveAttribute('role', 'dialog');
    await expect.poll(() => hub.evaluate(node => node.contains(document.activeElement))).toBe(true);
    receipts.push(await inspect(page, hub, 'context', info)); await unchanged(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#context-hub-overlay')).not.toHaveClass(/\bshow\b/);
    await expect.poll(() => page.evaluate(() => document.activeElement?.isConnected && document.activeElement !== document.body)).toBe(true);
    await unchanged(page);

    await navigate(page, 'dashboard');
    const chat = page.locator('#chat-fab');
    await activate(page, chat);
    const panel = page.locator('#chat-panel');
    await expect(panel).toHaveClass(/\bopen\b/);
    await expect(panel.getByText('Alex, AI features are currently paused. Turn them back on to chat, get insights, and import PDFs with AI.', {exact: true})).toBeVisible();
    await expect(panel.getByRole('button', {name: 'Enable AI', exact: true})).toBeVisible();
    await expect(page.locator('#chat-input')).toBeDisabled();
    await expect(page.locator('#chat-input')).toBeHidden();
    receipts.push(await inspect(page, panel, 'chat', info)); await unchanged(page);
    await activate(page, page.getByRole('button', {name: 'Close chat', exact: true}));
    await expect(panel).not.toHaveClass(/\bopen\b/);
    await expect(chat).toBeFocused(); await unchanged(page);
    await navigate(page, 'labs');
    await expect(main.locator('.lens-page-header h2')).toHaveText('Labs');
    await unchanged(page);
    for (const target of context.pages()) await target.close();
    expect(context.pages()).toHaveLength(0);
    const cold = await context.newPage();
    await ready(cold, server.origin);
    await expect(cold.locator('.lens-page-header h2')).toHaveText('Labs');
    expect(await cold.evaluate(() => localStorage.getItem('labcharts-default-lastViewV1'))).toBe('labs');
    await unchanged(cold);
    expect(errors).toEqual([]); expect(csp).toEqual([]); expect(external).toEqual([]);
    await info.attach('main-route-acceptance', {body: JSON.stringify({buildId: artifact.buildId, artifactSHA256: artifact.artifactSHA256,
      project: info.project.name, receipts, before, errors, csp, external, stoppedOrigin: true, zeroClientColdLaunches: 1,
      limits: 'Actual optimized artifact with controlled kit-test-a worker/version seam. Synthetic profile and paused credential-free AI; axe is test instrumentation. Screenshots are review evidence, not a frozen visual oracle. Scoped automation does not establish whole-app WCAG, OS speech, physical iOS/Android installation, or printer output. Mobile WebKit uses iPhone13 emulation on the recorded runner platform. No claim about the separately retained intermittent1px WebKit issue.'}, null, 2), contentType: 'application/json'});
  } finally {
    await info.attach('main-route-terminal-observers', {body: JSON.stringify({errors, csp, external, receipts}, null, 2), contentType: 'application/json'});
    for (const target of context.pages()) await target.close();
    if (!stopped) await server.close();
  }
});


test('Biometric empty-metric calls to action retain readable text across six themes and two widths', async ({page, context}, info) => {
  test.skip(!['kit-chromium', 'kit-mobile-webkit'].includes(info.project.name), 'Finite desktop Chromium and emulated mobile WebKit contrast check.');
  test.setTimeout(180000);
  const artifact = await artifactInputs(['js/state.js', 'js/nav.js', 'js/profile.js'], ['styles.css', 'css/dashboard-data.css']);
  await installDiscussionFixture(context, {provider: 'openrouter', paused: true});
  await installOfflineStartupDiagnostics(context);
  const {seed, rawSeed} = await installMainRouteProfile(context);
  const server = await startKitServer(artifact.directory), errors: string[] = [], csp: string[] = [], external: string[] = [], receipts: unknown[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('websocket', socket => external.push(socket.url()));
  await context.exposeBinding('biometricContrastCsp', (_, directive: string) => csp.push(directive));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    void (window as unknown as {biometricContrastCsp(value: string): Promise<void>}).biometricContrastCsp(event.violatedDirective);
  }));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== server.origin) {external.push(url.href); return route.abort();}
    return route.continue();
  });
  try {
    await page.clock.setFixedTime(new Date('2026-10-16T12:00:00Z'));
    await ready(page, server.origin);
    const before = await profile(page, artifact.state);
    expect(before.live).toEqual(seed); expect(before.stored).toEqual(seed); expect(before.rawCommitted).toBe(rawSeed);
    // These are real empty manual-log cards, not isolated text swatches.
    const cards = page.locator('.db-biometric-manual-empty');
    await expect(cards).toHaveCount(3);
    expect(await cards.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-empty-metric')))).toEqual(['weight', 'bp_systolic', 'rhr']);
    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
      await page.setViewportSize({width: 1280, height: 900});
      await page.locator('[data-shell-action="open-settings"]:visible').first().click();
      await page.locator('#settings-nav-display').click();
      await page.locator('#settings-tab-display [data-settings-action="open-tweaks"]').click();
      await page.locator(`[data-tweaks-action="select-theme"][data-theme-id="${theme}"]`).click();
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme || 'dark')).toBe(theme);
      await page.locator('[data-tweaks-action="close"]').click();
      if (await page.locator('#settings-modal-overlay.show').isVisible()) await page.keyboard.press('Escape');
      await expect(page.locator('#settings-modal-overlay')).not.toHaveClass(/\bshow\b/);
      for (const width of [1280, 390]) {
        await page.setViewportSize({width, height: 900});
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        // A desktop-to-mobile resize also animates the closed sidebar out of
        // view. Settle that actual drawer as well as the cards beneath it.
        await expect(page.locator('#sidebar-nav')).not.toHaveClass(/\bmobile-open\b/);
        await expect(page.locator('#sidebar-backdrop')).toBeHidden();
        const [motion, sidebarMotion] = await Promise.all([
          waitForFiniteVisualAnimations(page.locator('#main-content')),
          waitForFiniteVisualAnimations(page.locator('#sidebar-nav')),
        ]);
        const sidebarBounds = await page.locator('#sidebar-nav').boundingBox();
        expect(sidebarBounds).not.toBeNull();
        if (width === 390) {
          expect(sidebarBounds!.width).toBeGreaterThan(0);
          expect(sidebarBounds!.x + sidebarBounds!.width).toBeLessThanOrEqual(0);
        }
        const nodes = [];
        for (const card of await cards.all()) {
          const cta = card.locator('.wearable-empty-cta');
          await expect(cta).toBeVisible(); await expect(cta).toHaveText('+ Log');
          const style = await cta.evaluate(element => {
            const style = getComputedStyle(element), canvas = document.createElement('canvas'), context = canvas.getContext('2d');
            if (!context) throw new Error('Browser color normalization context missing');
            const rgba = (color: string) => {context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data];};
            return {color: rgba(style.color), expected: rgba(style.getPropertyValue('--text-primary')), font: style.fontSize, weight: style.fontWeight, spacing: style.letterSpacing};
          });
          expect(style.color).toEqual(style.expected); expect(style.font).toBe('11px'); expect(style.weight).toBe('600'); expect(style.spacing).toBe('0.22px');
          const result = await card.evaluate(async element => {
            const result = await (window as unknown as {axe: typeof import('axe-core')}).axe.run(element, {runOnly: {type: 'rule', values: ['color-contrast']}});
            const cta = element.querySelector('.wearable-empty-cta');
            if (!cta) throw new Error('Actual empty metric CTA missing');
            const ctaTarget = result.incomplete.flatMap(rule => rule.nodes).find(node => node.html.includes('wearable-empty-cta'))?.target[0];
            return {violations: result.violations, incomplete: result.incomplete, ctaTarget,
              ctaPasses: result.passes.flatMap(rule => rule.nodes.filter(node => node.html.includes('wearable-empty-cta')))};
          });
          expect(result.violations, `${theme}/${width}: actual CTA contrast`).toEqual([]);
          const gradientProofs = await proveRenderedGradientContrast(page, result.incomplete, info, `${theme}-${width}-${await card.getAttribute('data-empty-metric')}`);
          const provenCta = gradientProofs.filter(proof => proof.target === result.ctaTarget);
          expect(result.ctaPasses.length + provenCta.length).toBe(1);
          nodes.push({metric: await card.getAttribute('data-empty-metric'), style, result, gradientProofs});
        }
        expect(await profile(page, artifact.state)).toEqual(before);
        receipts.push({theme, width, nodes, motion, sidebarMotion, sidebarBounds});
      }
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]); expect(external).toEqual([]);
  } finally {
    await info.attach('biometric-readable-cta', {body: JSON.stringify({buildId: artifact.buildId, project: info.project.name, receipts, errors, csp, external,
      scope: 'Actual cards, six authored themes, two viewport widths, semantic foreground equality and axe passes plus strict rendered-gradient pixel proofs; original axe incomplete records are retained. No frozen fixture update, geometry waiver or physical-device claim.'}, null, 2), contentType: 'application/json'});
    await server.close();
  }
});
