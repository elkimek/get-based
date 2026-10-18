import type {Page} from '@playwright/test';
import type {AssistantFeatureRequestOptions} from '../../js/ai-feature-routing.js';
import type {AppState} from '../../types/app-state.js';
import {routeHtml} from '../helpers/browser-static-routes.js';
import {expect, test} from './coverage-fixture.js';

interface HeldTransport {
  options: AssistantFeatureRequestOptions;
  promise: Promise<unknown>;
  resolve(value: unknown): void;
}
interface NativeReceipt {
  profile: string; live: AppState['importedData']; original: AppState['importedData'];
  stored: {default: string | null; other: string | null}; usage: Record<string, string | null>;
}
interface NativeFixture {
  requests: HeldTransport[];
  original: AppState['importedData'];
  settle(index: number, text: string): Promise<void>;
  receipt(): Promise<NativeReceipt>;
  closedBody?: HTMLElement;
  retiredOpen?: {generate: HTMLButtonElement; close: HTMLButtonElement; discuss: HTMLButtonElement; onGenerate: () => unknown};
  handoffs?: string[];
}
interface FixtureWindow extends Window {emfLifecycleOwned: NativeFixture}

async function fixturePage(page: Page) {
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const origin = new URL(test.info().project.use.baseURL!).origin;
  await page.route('**/*', route => {
    const url = route.request().url();
    if (new URL(url).origin !== origin) {external.push(url); return route.abort();}
    return route.continue();
  });
  await routeHtml(page, '**/emf-interpretation-lifecycle-owned', `<!doctype html>
<html><head><link rel="icon" href="data:,"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/emf.css"></head>
<body><button id="open-native-emf">Open assessment</button><button id="replacement-focus">Replacement view</button>
<div id="modal-overlay" class="modal-overlay"><div id="detail-modal" class="modal"></div></div><div id="notification-container"></div></body></html>`, 200);
  await page.goto('/emf-interpretation-lifecycle-owned');
  return {errors, external};
}

async function nativeFixture(page: Page) {
  const diagnostics = await fixturePage(page);
  await page.evaluate(async () => {
    const [{state}, profile, crypto, runtime, interpretation, writes] = await Promise.all([
      import('/js/state.js'), import('/js/profile.js'), import('/js/crypto.js'), import('/js/emf-runtime.js'),
      import('/js/emf-interpretation-runtime.js'), import('/js/profile-data-writes.js'),
    ]);
    localStorage.setItem('labcharts-encryption-enabled', 'false');
    localStorage.setItem('labcharts-show-product-recs', 'false');
    localStorage.setItem('labcharts-ai-provider', 'ollama');
    localStorage.setItem('labcharts-ollama', JSON.stringify({url: 'http://127.0.0.1:9', model: 'synthetic-owned-model'}));
    localStorage.setItem('labcharts-ai-paused', 'false');
    localStorage.setItem('labcharts-analytics-disabled', 'true');
    await profile.saveProfiles([['default', 'Synthetic EMF owner'], ['other', 'Protected replacement']].map(([id, name]) => ({
      id: id!, name: name!, sex: null, dob: null, location: {country: '', zip: ''}, tags: [], notes: '', status: '', avatar: null,
      height: null, heightUnit: 'cm', createdAt: 1, lastUpdated: 1, pinned: false,
    })));
    state.currentProfile = 'default';
    state.importedData = profile.migrateProfileData({...profile.createDefaultProfileData(), emfAssessment: {assessments: [{
      id: 'owned-assessment', date: '2026-10-16', label: 'Synthetic bedroom', consultant: '', note: '',
      rooms: [{name: 'Bedroom', location: '', sleeping: true, measurements: {acElectric: {value: 9, unit: 'V/m', meter: ''}}, sources: [], mitigations: [], note: '', photos: []}],
    }]}});
    const original = state.importedData;
    const replacement = profile.migrateProfileData({...profile.createDefaultProfileData(), contextNotes: 'Protected other profile'});
    await crypto.encryptedSetItem('labcharts-default-imported', JSON.stringify(original));
    await crypto.encryptedSetItem('labcharts-other-imported', JSON.stringify(replacement));
    writes.rememberProfileData(original);
    const requests: HeldTransport[] = [];
    interpretation.configureEMFInterpretationRuntimeDeps({
      callClaudeAPI(options: AssistantFeatureRequestOptions) {
        let resolve!: (value: unknown) => void;
        const promise = new Promise<unknown>(done => {resolve = done;});
        requests.push({options, promise, resolve});
        return promise;
      },
    });
    runtime.configureEMFRuntimeDeps({loadModule: async () => {
      const module = await import('/js/emf.js');
      module.configureEMFAIDeps({hasAIProvider: () => true});
      return module;
    }});
    document.getElementById('open-native-emf')!.addEventListener('click', () => {void runtime.openEMFAssessmentEditor();});
    (window as unknown as FixtureWindow).emfLifecycleOwned = {
      requests, original,
      async settle(index, text) {
        const held = requests[index]!;
        held.options.onStream?.('Late streamed ' + text);
        // This transport deliberately ignores AbortSignal so ownership guards
        // must reject the delivered value rather than relying on cancellation.
        held.resolve({text, usage: {inputTokens: 8, outputTokens: 3}});
        await held.promise; await Promise.resolve();
        // Drain the genuine persistence queues after the controller's promise
        // reaction; this also catches an incorrectly scheduled late save.
        await writes.queueProfileDataWrite('default', () => undefined);
        await writes.queueProfileDataWrite('other', () => undefined);
      },
      async receipt() {
        return {profile: state.currentProfile, live: structuredClone(state.importedData), original: structuredClone(original),
          stored: {default: await crypto.encryptedGetItem('labcharts-default-imported'), other: await crypto.encryptedGetItem('labcharts-other-imported')},
          usage: Object.fromEntries(['labcharts-default-usage', 'labcharts-other-usage', 'labcharts-global-usage'].map(key => [key, localStorage.getItem(key)]))};
      },
    };
  });
  await page.getByRole('button', {name: 'Open assessment', exact: true}).click();
  await expect(page.locator('#detail-modal [data-emf-action="toggle-assessment"]')).toBeVisible();
  await page.locator('#detail-modal [data-emf-action="toggle-assessment"]').click();
  await expect(page.locator('#detail-modal [data-emf-action="interpret-assessment"]')).toBeVisible();
  return diagnostics;
}

async function openInterpretation(page: Page) {
  const interpret = page.locator('#detail-modal [data-emf-action="interpret-assessment"]');
  await interpret.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#emf-interp-overlay')).toBeVisible();
  await page.locator('#emf-interp-generate').click();
  return interpret;
}
async function receipt(page: Page) {return page.evaluate(() => (window as unknown as FixtureWindow).emfLifecycleOwned.receipt());}
async function settle(page: Page, index: number, text: string) {
  await page.evaluate(({index, text}) => (window as unknown as FixtureWindow).emfLifecycleOwned.settle(index, text), {index, text});
}

// Actual public modules, native editor/interpretation delegates, modal focus and
// IndexedDB-backed encrypted storage are used. Only the provider transport is injected.
test('cold close does not request EMF, and a retired pending editor open cannot publish into a replacement view', async ({page}) => {
  const diagnostics = await fixturePage(page), requested: string[] = [];
  page.on('request', request => {requested.push(new URL(request.url()).pathname);});
  const beforeRelease = await page.evaluate(async () => {
    const runtime = await import('/js/emf-runtime.js');
    const interpretation = await import('/js/emf-interpretation-runtime.js');
    const sameTurn = interpretation.closeEMFInterpretation();
    await runtime.closeEMFInterpretation();
    return {voidReturn: sameTurn === undefined, overlays: document.querySelectorAll('#emf-interp-overlay').length};
  });
  expect(beforeRelease).toEqual({voidReturn: true, overlays: 0});
  expect(requested.filter(path => /^\/js\/(emf|emf-editor|emf-interpretation|emf-interpretation-presentation)\.js$/.test(path))).toEqual([]);
  const retired = await page.evaluate(async () => {
    const runtime = await import('/js/emf-runtime.js');
    let release!: () => void, current = true, loads = 0;
    const gate = new Promise<void>(done => {release = done;});
    runtime.configureEMFRuntimeDeps({loadModule: async () => {loads++; await gate; return import('/js/emf.js');}});
    const pending = runtime.openEMFAssessmentEditor({isCurrent: () => current});
    current = false;
    await runtime.closeEMFInterpretation();
    release(); const result = await pending;
    const retiredHTML = document.getElementById('detail-modal')!.innerHTML;
    await runtime.openEMFAssessmentEditor({isCurrent: () => true});
    return {result, retiredHTML, loads, reopened: !!document.querySelector('#detail-modal .emf-editor-actions')};
  });
  expect(retired).toEqual({result: false, retiredHTML: '', loads: 1, reopened: true});
  expect(diagnostics.errors).toEqual([]); expect(diagnostics.external).toEqual([]);
});

test('public interpretation close immediately aborts, restores focus and rejects delivered late output without changing either stored profile', async ({page}) => {
  const diagnostics = await nativeFixture(page), interpret = await openInterpretation(page), baseline = await receipt(page);
  const immediate = await page.evaluate(() => {
    const fixture = (window as unknown as FixtureWindow).emfLifecycleOwned, held = fixture.requests[0]!;
    fixture.closedBody = document.getElementById('emf-interp-body')!;
    const close = document.querySelector<HTMLButtonElement>('#emf-interp-overlay [data-emf-interp-action="close"]')!;
    close.focus(); close.click();
    return {aborted: held.options.signal!.aborted, overlay: !!document.getElementById('emf-interp-overlay'), focus: document.activeElement?.getAttribute('data-emf-action'), retiredBody: fixture.closedBody.innerHTML};
  });
  expect(immediate).toEqual({aborted: true, overlay: false, focus: 'interpret-assessment', retiredBody: expect.any(String)});
  await expect(interpret).toBeFocused();
  await settle(page, 0, 'Forbidden closed result');
  expect(await receipt(page)).toEqual(baseline);
  expect(await page.evaluate(() => (window as unknown as FixtureWindow).emfLifecycleOwned.closedBody!.innerHTML)).toBe(immediate.retiredBody);
  await expect(page.locator('#emf-interp-overlay')).toHaveCount(0); await expect(interpret).toBeFocused();
  expect(diagnostics.errors).toEqual([]); expect(diagnostics.external).toEqual([]);
});

test('late completion cannot disturb a regenerated current request, whose actual accepted result persists through IndexedDB', async ({page}) => {
  const diagnostics = await nativeFixture(page); await openInterpretation(page);
  await page.locator('#emf-interp-overlay [data-emf-interp-action="close"]').first().click();
  await openInterpretation(page); const beforeLate = await receipt(page), bodyBefore = await page.locator('#emf-interp-body').innerHTML();
  await settle(page, 0, 'Forbidden older result');
  expect(await receipt(page)).toEqual(beforeLate); expect(await page.locator('#emf-interp-body').innerHTML()).toBe(bodyBefore);
  expect(await page.evaluate(() => (window as unknown as FixtureWindow).emfLifecycleOwned.requests.map(row => row.options.signal!.aborted))).toEqual([true, false]);
  await settle(page, 1, '## Accepted current result');
  await expect(page.locator('#emf-interp-body')).toContainText('Accepted current result');
  await expect(page.locator('#emf-interp-generate')).toHaveText('Re-interpret');
  const accepted = await page.evaluate(async () => {
    const fixture = (window as unknown as FixtureWindow).emfLifecycleOwned;
    const [{state}, crypto] = await Promise.all([import('/js/state.js'), import('/js/crypto.js')]);
    const stored = JSON.parse((await crypto.encryptedGetItem('labcharts-default-imported'))!);
    return {live: state.importedData, stored, baseline: fixture.original, other: await crypto.encryptedGetItem('labcharts-other-imported'),
      usage: JSON.parse(localStorage.getItem('labcharts-default-usage')!), global: JSON.parse(localStorage.getItem('labcharts-global-usage')!),
      requests: fixture.requests.length};
  });
  expect(accepted.stored).toEqual(accepted.live); expect(accepted.stored).toEqual(accepted.baseline);
  expect(accepted.stored.emfAssessment.assessments[0].interpretation).toEqual(expect.objectContaining({text: '## Accepted current result', inputTokens: 8, outputTokens: 3}));
  expect(accepted.usage).toEqual(expect.objectContaining({totalInputTokens: 8, totalOutputTokens: 3, requestCount: 1})); expect(accepted.global).toEqual(accepted.usage);
  expect(accepted.other).toBe(beforeLate.stored.other); expect(accepted.requests).toBe(2);
  expect(diagnostics.errors).toEqual([]); expect(diagnostics.external).toEqual([]);
});

for (const replacement of ['profile', 'data'] as const) {
  test(`real held interpretation cannot publish or persist after ${replacement} ownership replacement`, async ({page}) => {
    const diagnostics = await nativeFixture(page); await openInterpretation(page);
    await page.evaluate(async replacement => {
      const [{state}, profile, crypto] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/crypto.js')]);
      if (replacement === 'profile') {state.currentProfile = 'other'; state.importedData = JSON.parse((await crypto.encryptedGetItem('labcharts-other-imported'))!);}
      else state.importedData = profile.migrateProfileData({...profile.createDefaultProfileData(), contextNotes: 'Protected replacement data for the same profile'});
      document.getElementById('replacement-focus')!.focus();
    }, replacement);
    const before = await receipt(page), body = await page.locator('#emf-interp-body').innerHTML();
    await settle(page, 0, 'Forbidden retired ' + replacement);
    expect(await receipt(page)).toEqual(before); expect(await page.locator('#emf-interp-body').innerHTML()).toBe(body);
    await expect(page.locator('#replacement-focus')).toBeFocused();
    expect(diagnostics.errors).toEqual([]); expect(diagnostics.external).toEqual([]);
  });
}


test('retained generation and handoff reject retired owners while the actual visible modal remains dismissible', async ({page}) => {
  for (const retirement of ['profile', 'data', 'body', 'closed', 'reopened'] as const) {
    const diagnostics = await nativeFixture(page);
    await page.evaluate(async () => {
      const [{state}, crypto, writes] = await Promise.all([import('/js/state.js'), import('/js/crypto.js'), import('/js/profile-data-writes.js')]);
      const emf = state.importedData.emfAssessment;
      if (!emf || !Array.isArray(emf.assessments) || emf.assessments[0]?.id !== 'owned-assessment') {
        throw new Error('Missing synthetic EMF assessment fixture before cached interpretation setup');
      }
      emf.assessments[0].interpretation = {text: 'Cached original owner'};
      await crypto.encryptedSetItem('labcharts-default-imported', JSON.stringify(state.importedData));
      writes.rememberProfileData(state.importedData);
    });
    await page.locator('#detail-modal [data-emf-action="interpret-assessment"]').click();
    await expect(page.locator('#emf-interp-overlay [data-emf-interp-action="discuss"]')).toBeVisible();
    await page.evaluate(async retirement => {
      const fixture = (window as unknown as FixtureWindow).emfLifecycleOwned;
      const overlay = document.getElementById('emf-interp-overlay') as import('../../types/emf-interpretation.js').InterpretationOverlay;
      fixture.retiredOpen = {generate: overlay.querySelector<HTMLButtonElement>('[data-emf-interp-action="generate"]')!, close: overlay.querySelector<HTMLButtonElement>('[data-emf-interp-action="close"]')!,
        discuss: overlay.querySelector<HTMLButtonElement>('[data-emf-interp-action="discuss"]')!, onGenerate: overlay._onGenerate as () => unknown};
      fixture.handoffs = [];
      const bridge = await import('/js/emf-interpretation-runtime.js');
      bridge.configureEMFInterpretationRuntimeDeps({closeModal: () => fixture.handoffs!.push('parent'), openChatPanel: () => fixture.handoffs!.push('chat')});
      const {state} = await import('/js/state.js');
      if (retirement === 'profile') state.currentProfile = 'other';
      if (retirement === 'data') state.importedData = structuredClone(state.importedData);
      if (retirement === 'body') document.getElementById('emf-interp-body')!.replaceWith(document.getElementById('emf-interp-body')!.cloneNode(true));
      if (retirement === 'closed' || retirement === 'reopened') fixture.retiredOpen.close.click();
      if (retirement === 'reopened') document.querySelector<HTMLButtonElement>('#detail-modal [data-emf-action="interpret-assessment"]')!.click();
      await Promise.resolve();
    }, retirement);
    const before = await receipt(page), beforeHTML = await page.locator('body').innerHTML();
    const stale = await page.evaluate(() => {
      const fixture = (window as unknown as FixtureWindow).emfLifecycleOwned, retained = fixture.retiredOpen!;
      const originalText = retained.generate.textContent;
      retained.generate.click(); retained.onGenerate(); retained.discuss.click();
      return {requests: fixture.requests.length, handoffs: fixture.handoffs, disabled: retained.generate.disabled, text: retained.generate.textContent, originalText};
    });
    expect(stale).toEqual({requests: 0, handoffs: [], disabled: false, text: stale.originalText, originalText: stale.originalText});
    expect(await receipt(page)).toEqual(before); expect(await page.locator('body').innerHTML()).toBe(beforeHTML);
    if (retirement === 'data') {
      // Exercise the actual global Escape owner: it discovers and clicks the
      // current modal's close control rather than bypassing its delegate.
      await page.evaluate(async () => {(await import('/js/app-event-listeners.js')).installGlobalEventListeners();});
      await page.keyboard.press('Escape');
    } else await page.evaluate(() => {(window as unknown as FixtureWindow).emfLifecycleOwned.retiredOpen!.close.click();});
    if (retirement === 'profile' || retirement === 'data' || retirement === 'body') {
      await expect(page.locator('#emf-interp-overlay')).toHaveCount(0);
      await expect(page.locator('#modal-overlay')).toBeVisible();
    } else expect(await page.locator('body').innerHTML()).toBe(beforeHTML);
    expect(await receipt(page)).toEqual(before);
    expect(await page.evaluate(() => ({requests: (window as unknown as FixtureWindow).emfLifecycleOwned.requests.length,
      handoffs: (window as unknown as FixtureWindow).emfLifecycleOwned.handoffs}))).toEqual({requests: 0, handoffs: []});
    expect(diagnostics.errors).toEqual([]); expect(diagnostics.external).toEqual([]);
  }
});
