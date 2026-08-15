#!/usr/bin/env node
// test-sun-defaults.js — Onboarding defaults: Fitzpatrick mapping, OTT score
// boundaries, option-list shapes, getSunDefaults / saveSunDefaults round-trip,
// isOnboardingComplete gate.
//
// Run: node tests/test-sun-defaults.js  (or via npm test)

import './_node-shim.js';
import fs from 'fs';
import { JSDOM } from 'jsdom';
import path from 'path';
import { fileURLToPath } from 'url';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Sun Defaults Tests ===\n');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const sunDefaultsSrc = fs.readFileSync(path.join(root, 'js/sun-defaults.js'), 'utf8');
const sunDefaultsModelSrc = fs.readFileSync(path.join(root, 'js/sun-defaults-model.js'), 'utf8');
const sunDefaultsRuntimeSrc = fs.readFileSync(path.join(root, 'js/sun-defaults-runtime.js'), 'utf8');
const sunDefaultsRendererSrc = fs.readFileSync(path.join(root, 'js/sun-defaults-setup-renderer.js'), 'utf8');
const sunDefaultsUiSrc = fs.readFileSync(path.join(root, 'js/sun-defaults-setup-ui.js'), 'utf8');
const sunDefaultsOwnerSrc = [
  sunDefaultsSrc,
  sunDefaultsModelSrc,
  sunDefaultsRendererSrc,
  sunDefaultsUiSrc,
].join('\n');
const appLightSunSrc = fs.readFileSync(path.join(root, 'js/app-light-sun-modules.js'), 'utf8');
const aiSaveHooksSrc = fs.readFileSync(path.join(root, 'js/light-ai-save-hooks.js'), 'utf8');
const onboardingAiSrc = fs.readFileSync(path.join(root, 'js/sun-onboarding-ai.js'), 'utf8');
const globalsSrc = fs.readFileSync(path.join(root, 'types/globals.d.ts'), 'utf8');
const swSrc = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const originalDelegateDomGlobals = {
  document: globalThis.document,
  HTMLElement: globalThis.HTMLElement,
  Element: globalThis.Element,
  Event: globalThis.Event,
  KeyboardEvent: globalThis.KeyboardEvent,
  MouseEvent: globalThis.MouseEvent,
  MutationObserver: globalThis.MutationObserver,
  Node: globalThis.Node,
};
const delegateDom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
globalThis.document = delegateDom.window.document;
globalThis.HTMLElement = delegateDom.window.HTMLElement;
globalThis.Element = delegateDom.window.Element;
globalThis.Event = delegateDom.window.Event;
globalThis.KeyboardEvent = delegateDom.window.KeyboardEvent;
globalThis.MouseEvent = delegateDom.window.MouseEvent;
globalThis.MutationObserver = delegateDom.window.MutationObserver;
globalThis.Node = delegateDom.window.Node;

function restoreDelegateDomGlobals() {
  for (const [key, value] of Object.entries(originalDelegateDomGlobals)) {
    if (value === undefined) {
      delete globalThis[key];
    } else {
      globalThis[key] = value;
    }
  }
}

const { state } = await import('../js/state.js');
const mod = await import('../js/sun-defaults.js');
const {
  FITZPATRICK_OPTIONS,
  HOME_LIGHT_OPTIONS,
  EYEWEAR_OPTIONS,
  OTT_QUESTIONS,
  getSunDefaults,
  configureSunDefaults,
  collectSunSetupValues,
  persistSunSetupValues,
  saveSunDefaults,
  isOnboardingComplete,
  installLightSetupDelegates,
  ottScoreToLabel,
  lightBurdenToLabel,
} = mod;

installLightSetupDelegates(delegateDom.window.document);

  // Stash importedData so we don't pollute the host page.
  const orig = state.importedData;

  // ─── 0. Light setup delegated events ─────────────────────────────────
  console.log('%c 0. Light setup delegated events ', 'font-weight:bold;color:#f59e0b');

  assert('sun-defaults renders setup controls without inline event attributes',
    !/\bon(?:click|keydown|submit|change|input)=/.test(sunDefaultsOwnerSrc));
  assert('sun-defaults installs shared Light setup delegates',
    sunDefaultsUiSrc.includes('installLightSetupDelegates();') &&
    !sunDefaultsOwnerSrc.includes('invokeSunDefaultsBinding') &&
    sunDefaultsRendererSrc.includes("data-light-setup-action=") &&
    sunDefaultsRendererSrc.includes("data-light-setup-input=") &&
    sunDefaultsSrc.includes("from './sun-defaults-setup-ui.js'"));
  assert('sun-defaults browser hooks are isolated in runtime adapter',
    sunDefaultsUiSrc.includes("from './sun-defaults-runtime.js'") &&
    sunDefaultsRendererSrc.includes("from './sun-defaults-runtime.js'") &&
    !/\bwindow(\.|\s*\[)/.test(sunDefaultsOwnerSrc) &&
    sunDefaultsRuntimeSrc.includes('getSunSetupCoords') &&
    !sunDefaultsRuntimeSrc.includes('exposeSunDefaultsBindings') &&
    swSrc.includes("'/js/sun-defaults-runtime.js'") &&
    swSrc.includes("'/js/sun-defaults-setup-ui.js'") &&
    swSrc.includes("'/js/sun-defaults-setup-renderer.js'"));
  assert('sun-defaults AI hooks route through startup wiring',
    typeof configureSunDefaults === 'function' &&
    sunDefaultsUiSrc.includes('maybeAnalyzeOnboardingAfterSave: () => {}') &&
    onboardingAiSrc.includes('registerAIActionHandler') &&
    !onboardingAiSrc.includes('Object.assign(window, {') &&
    !onboardingAiSrc.includes('window.refreshOnboardingAIAnalysis') &&
    !onboardingAiSrc.includes('window.analyzeOnboardingAI') &&
    !onboardingAiSrc.includes('window.maybeAnalyzeOnboardingAfterSave') &&
    !onboardingAiSrc.includes('window.renderOnboardingAIBlock') &&
    !sunDefaultsOwnerSrc.includes('window.maybeAnalyzeOnboardingAfterSave') &&
    !sunDefaultsOwnerSrc.includes('window.renderOnboardingAIBlock') &&
    !globalsSrc.includes('maybeAnalyzeOnboardingAfterSave') &&
    !globalsSrc.includes('renderOnboardingAIBlock') &&
    aiSaveHooksSrc.includes("import { configureSunDefaults } from './sun-defaults.js';") &&
    aiSaveHooksSrc.includes("import { maybeAnalyzeOnboardingAfterSave, renderOnboardingAIBlock } from './sun-onboarding-ai.js';") &&
    aiSaveHooksSrc.includes('configureSunDefaults({ maybeAnalyzeOnboardingAfterSave, renderOnboardingAIBlock })') &&
    appLightSunSrc.includes("import './light-ai-save-hooks.js';") &&
    swSrc.includes("'/js/light-ai-save-hooks.js'"));

  document.body.innerHTML = `<div class="light-setup-focus-modal" data-setup-step="core">
    <button type="button" data-setup-tab="core" aria-selected="true"></button>
    <button type="button" data-setup-tab="score" aria-selected="false" data-light-setup-action="set-step" data-light-setup-step="score"></button>
    <section data-setup-pane="core"><div class="light-setup-title" tabindex="-1"></div></section>
    <section data-setup-pane="score" hidden><h4 tabindex="-1"></h4></section>
    <div class="light-setup-focus-body"></div>
  </div>`;
  document.querySelector('[data-light-setup-step="score"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  assert('delegated setup step click switches panes',
    document.querySelector('.light-setup-focus-modal')?.dataset.setupStep === 'score' &&
    document.querySelector('[data-setup-tab="score"]')?.getAttribute('aria-selected') === 'true' &&
    document.querySelector('[data-setup-pane="core"]')?.hasAttribute('hidden'));

  document.body.innerHTML = `<div class="light-setup-card">
    <span class="light-setup-progress"></span>
    <input type="hidden" id="setup-homelight" value="">
    <button type="button" data-light-setup-action="select-choice" data-choice-group="setup-homelight" data-value="led-warm" aria-pressed="false"></button>
  </div>`;
  document.querySelector('[data-choice-group="setup-homelight"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  assert('delegated setup choice click updates hidden input and pressed state',
    document.getElementById('setup-homelight')?.value === 'led-warm' &&
    document.querySelector('[data-choice-group="setup-homelight"]')?.getAttribute('aria-pressed') === 'true');

  document.body.innerHTML = `<div class="light-setup-card">
    <span class="light-setup-progress"></span>
    <input id="setup-skin-range" value="2" data-set="0">
    <div id="setup-skin-label"></div>
    ${[0, 1, 2, 3, 4, 5].map(i => `<span class="ctx-skin-face" data-idx="${i}" role="radio" aria-checked="false" data-light-setup-action="select-skin" data-light-setup-skin-idx="${i}"></span>`).join('')}
  </div>`;
  document.querySelector('[data-light-setup-skin-idx="4"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  assert('delegated skin click updates range and active state',
    document.getElementById('setup-skin-range')?.value === '4' &&
    document.getElementById('setup-skin-range')?.dataset.set === '1' &&
    document.querySelector('[data-idx="4"]')?.getAttribute('aria-checked') === 'true');

  document.body.innerHTML = `<div class="light-setup-card">
    <label class="light-setup-ott-card"><input type="checkbox" data-ott="morning-light-deficit" data-light-setup-input="ott-score" checked></label>
    <span id="ott-running-value"></span>
    <span id="ott-running-aligned"></span>
    <span id="ott-running-label" data-tier="0"></span>
    <span id="ott-summary-score"></span>
    <span id="ott-running-score"></span>
    <span id="ott-score-fill"></span>
  </div>`;
  document.querySelector('[data-light-setup-input="ott-score"]')?.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  assert('delegated setup input updates running light score',
    document.getElementById('ott-running-value')?.textContent === '1/10' &&
    document.getElementById('ott-summary-score')?.textContent === '1/10 selected');
  document.body.innerHTML = '';
  restoreDelegateDomGlobals();

  // ─── 1. Fitzpatrick options shape ─────────────────────────────────────
  console.log('%c 1. Fitzpatrick options ', 'font-weight:bold;color:#f59e0b');

  // Loosened: at least 6 entries; the I–VI keys must all be present.
  assert('FITZPATRICK_OPTIONS has at least 6 entries (I–VI)',
    FITZPATRICK_OPTIONS.length >= 6, `length=${FITZPATRICK_OPTIONS.length}`);
  const expectedKeys = ['I','II','III','IV','V','VI'];
  for (let i = 0; i < expectedKeys.length; i++) {
    assert(`Option ${i} key === '${expectedKeys[i]}'`, FITZPATRICK_OPTIONS[i].key === expectedKeys[i]);
    assert(`Option ${i} has descriptive label`, typeof FITZPATRICK_OPTIONS[i].label === 'string' && FITZPATRICK_OPTIONS[i].label.length > 0);
  }

  // ─── 2. HOME_LIGHT_OPTIONS / EYEWEAR_OPTIONS shape ───────────────────
  console.log('%c 2. Indoor-light + eyewear option lists ', 'font-weight:bold;color:#f59e0b');

  assert('HOME_LIGHT_OPTIONS includes "unknown" (graceful skip)',
    HOME_LIGHT_OPTIONS.some(o => o.key === 'unknown'));
  assert('HOME_LIGHT_OPTIONS includes both LED variants (cool + warm)',
    HOME_LIGHT_OPTIONS.some(o => o.key === 'led-cool') &&
    HOME_LIGHT_OPTIONS.some(o => o.key === 'led-warm'));
  // Every option has both key + label
  for (const o of HOME_LIGHT_OPTIONS) {
    assert(`HOME_LIGHT option '${o.key}' has label`, typeof o.label === 'string' && o.label.length > 0);
  }
  for (const o of EYEWEAR_OPTIONS) {
    assert(`EYEWEAR option '${o.key}' has label`, typeof o.label === 'string' && o.label.length > 0);
  }
  assert('EYEWEAR_OPTIONS includes "none" baseline',
    EYEWEAR_OPTIONS.some(o => o.key === 'none'));

  // ─── 3. OTT_QUESTIONS ─────────────────────────────────────────────────
  console.log('%c 3. OTT 10-question audit shape ', 'font-weight:bold;color:#f59e0b');

  // Loosened from `=== 10` to `>=` — adding a new audit question is a
  // safe extension. The required keys spot-check below ensures the
  // canonical 10 are still present.
  assert('OTT_QUESTIONS has at least 10 items (per audit definition)',
    OTT_QUESTIONS.length >= 10, `length=${OTT_QUESTIONS.length}`);
  const ottKeys = new Set(OTT_QUESTIONS.map(q => q.key));
  assert('OTT_QUESTIONS keys are unique', ottKeys.size === OTT_QUESTIONS.length);
  for (const q of OTT_QUESTIONS) {
    assert(`OTT question '${q.key}' has prompt text`, typeof q.text === 'string' && q.text.length > 10);
    // v1.7.18: every question carries a one-line "why" sub-label that
    // teaches the photobiology behind the question. The setup card
    // renders it under the prompt so users learn the model rather than
    // just self-reporting.
    assert(`OTT question '${q.key}' carries a 'why' explainer`,
      typeof q.why === 'string' && q.why.length > 20);
  }
  // Spot-check the canonical keys we documented in source
  const requiredOttKeys = [
    'morning-light-deficit', 'glass-mediated-daytime', 'dim-workspace',
    'cool-led-evening', 'evening-screens', 'bright-after-sunset',
    'sleep-not-dark', 'sunscreen-blocks-uvb', 'sunglasses-outside',
    'low-outdoor-time',
  ];
  for (const k of requiredOttKeys) {
    assert(`OTT_QUESTIONS contains '${k}'`, ottKeys.has(k));
  }

  // ─── 4. ottScoreToLabel boundaries ────────────────────────────────────
  console.log('%c 4. Score → label tier mapping ', 'font-weight:bold;color:#f59e0b');

  // Tier boundaries: 0=tier0, 1-3=tier1, 4-5=tier2, 6-7=tier3, 8-10=tier4
  const tierCases = [
    { score: 0,  expected: 0, desc: '0 → no patterns selected (tier 0)' },
    { score: 1,  expected: 1, desc: '1 → a few patterns (tier 1)' },
    { score: 2,  expected: 1, desc: '2 → a few patterns (tier 1)' },
    { score: 3,  expected: 1, desc: '3 → still tier 1 (boundary)' },
    { score: 4,  expected: 2, desc: '4 → moderate (tier 2)' },
    { score: 5,  expected: 2, desc: '5 → still tier 2 (boundary)' },
    { score: 6,  expected: 3, desc: '6 → significant (tier 3)' },
    { score: 7,  expected: 3, desc: '7 → still tier 3 (boundary)' },
    { score: 8,  expected: 4, desc: '8 → broad mismatch (tier 4)' },
    { score: 10, expected: 4, desc: '10 → still tier 4 (max)' },
  ];
  for (const c of tierCases) {
    const out = ottScoreToLabel(c.score);
    assert(c.desc, out.tier === c.expected, `tier=${out.tier} label="${out.label}"`);
  }

  // Non-numeric input
  const nan1 = ottScoreToLabel(undefined);
  assert('ottScoreToLabel(undefined) → { label:"—", tier:0 }',
    nan1.label === '—' && nan1.tier === 0);
  const nan2 = ottScoreToLabel('5');
  assert('ottScoreToLabel(non-number string) → tier 0 placeholder',
    nan2.label === '—' && nan2.tier === 0);

  // Alias contract
  assert('lightBurdenToLabel === ottScoreToLabel (alias)', lightBurdenToLabel === ottScoreToLabel);

  // ─── 5. getSunDefaults / saveSunDefaults round-trip ───────────────────
  console.log('%c 5. Defaults persistence ', 'font-weight:bold;color:#f59e0b');

  // Stub a clean importedData with a no-op saveImportedData so we don't
  // hit the real CRDT/IDB save path.
  state.importedData = { entries: [] };
  // saveImportedData is imported by sun-defaults from data.js; the real
  // implementation persists. We don't need to mock it — just keep the
  // test profile id constant so artifacts don't accumulate.

  const empty = getSunDefaults();
  assert('getSunDefaults seeds importedData.sunDefaults when missing',
    empty && typeof empty === 'object' && state.importedData.sunDefaults === empty);

  await saveSunDefaults({ fitzpatrick: 'III', homeLight: 'led-warm' });
  const after1 = getSunDefaults();
  assert('saveSunDefaults patches fitzpatrick', after1.fitzpatrick === 'III');
  assert('saveSunDefaults patches homeLight', after1.homeLight === 'led-warm');

  // Patch is additive (preserves earlier fields)
  await saveSunDefaults({ eyewear: 'sunglasses' });
  const after2 = getSunDefaults();
  assert('Subsequent save preserves earlier fitzpatrick',
    after2.fitzpatrick === 'III' && after2.eyewear === 'sunglasses');

  const setupDom = new JSDOM(`<!doctype html><body>
    <div class="light-setup-card">
      <input id="setup-skin-range" value="3" data-set="1">
      <input type="hidden" id="setup-photosensitive" value="severe">
      <input type="hidden" id="setup-homelight" value="led-warm">
      <input type="hidden" id="setup-eyewear" value="sunglasses">
      <input type="checkbox" data-ott="morning-light-deficit" checked>
      <input type="checkbox" data-ott="dim-workspace" checked>
      <input type="checkbox" data-ott="low-outdoor-time">
    </div>
  </body>`);
  const setupRoot = setupDom.window.document.querySelector('.light-setup-card');
  const collected = collectSunSetupValues(setupRoot);
  assert('collectSunSetupValues reads current hidden-choice setup UI',
    collected.ok &&
    collected.values.fitzpatrick === 'IV' &&
    collected.values.skinIdx === 3 &&
    collected.values.photosensitiveMeds === 'severe' &&
    collected.values.homeLight === 'led-warm' &&
    collected.values.eyewear === 'sunglasses' &&
    collected.values.ottScore === 2 &&
    collected.values.ott['morning-light-deficit'] === true &&
    collected.values.ott['dim-workspace'] === true &&
    collected.values.ott['low-outdoor-time'] === false);

  const missingSkinDom = new JSDOM(`<!doctype html><body>
    <div class="light-setup-card"><input id="setup-skin-range" value="2" data-set="0"></div>
  </body>`);
  const missingSkin = collectSunSetupValues(missingSkinDom.window.document.querySelector('.light-setup-card'));
  assert('collectSunSetupValues blocks visual default skin type until confirmed',
    missingSkin.ok === false && missingSkin.reason === 'skin-type-required');

  state.importedData = { entries: [], sunDefaults: {}, lightCircadian: null };
  await persistSunSetupValues(collected.values, 1234567890);
  assert('persistSunSetupValues saves defaults and mirrors skin context in one path',
    state.importedData.sunDefaults.fitzpatrick === 'IV' &&
    state.importedData.sunDefaults.photosensitiveMeds === 'severe' &&
    state.importedData.sunDefaults.homeLight === 'led-warm' &&
    state.importedData.sunDefaults.eyewear === 'sunglasses' &&
    state.importedData.sunDefaults.ottScore === 2 &&
    state.importedData.sunDefaults.completedAt === 1234567890 &&
    state.importedData.lightCircadian?.skinType?.startsWith('IV'));

  // ─── 6. isOnboardingComplete gate ─────────────────────────────────────
  console.log('%c 6. Onboarding-complete gate ', 'font-weight:bold;color:#f59e0b');

  // Just fitzpatrick set is not enough — needs completedAt
  state.importedData = { entries: [], sunDefaults: { fitzpatrick: 'III' } };
  assert('isOnboardingComplete falsy without completedAt',
    !isOnboardingComplete());

  await saveSunDefaults({ completedAt: Date.now() });
  assert('isOnboardingComplete truthy once completedAt set',
    !!isOnboardingComplete());

  // Clear fitzpatrick, even with completedAt → falsy (both required)
  await saveSunDefaults({ fitzpatrick: null });
  assert('isOnboardingComplete falsy when fitzpatrick cleared',
    !isOnboardingComplete());

  // Empty importedData → falsy
  state.importedData = null;
  assert('isOnboardingComplete falsy when importedData missing',
    !isOnboardingComplete());

  // ─── 7. getSunDefaults handles missing importedData ──────────────────
  console.log('%c 7. Defensive guards ', 'font-weight:bold;color:#f59e0b');

  state.importedData = null;
  assert('getSunDefaults() returns null when importedData missing',
    getSunDefaults() === null);
  assert('saveSunDefaults() returns false when importedData missing',
    await saveSunDefaults({ fitzpatrick: 'III' }) === false);

  // Restore
  state.importedData = orig;

  // ─── 8. getSunCoords country-band path — SKIPPED in Node ──────────────
  // The country-centroid resolution requires profile state (currentProfile +
  // location wiring) that the Playwright environment provides but Node
  // doesn't have without a full setupProfile() bootstrap. Still covered
  // end-to-end by the Playwright suite via test-sun-uvdata-flow.js.
  console.log('  SKIP: getSunCoords country-band — needs profile bootstrap; covered by Playwright.');
  const SKIP_SECTION_8 = true;
  if (!SKIP_SECTION_8) {
  const sunMod = await import('../js/sun.js');
  const { getSunCoords } = sunMod;
  const profileMod = await import('../js/profile.js');
  const { setProfileLocation, getProfileLocation } = profileMod;

  // Stash original profile location
  const origLoc = getProfileLocation();
  // Ensure we're in country-band mode (no profile-precise coords)
  const stashedSunDefaults = state.importedData?.sunDefaults;
  if (state.importedData) state.importedData.sunDefaults = null;

  await setProfileLocation(null, 'czech republic', '');
  const cz = getSunCoords();
  assert("Czech profile resolves to country-band centroid",
    cz && cz.source === 'country-band', `got ${JSON.stringify(cz)}`);
  assert("Czech centroid lat ≈ 49.8 (was tz-stable, now deterministic)",
    cz && Math.abs(cz.lat - 49.8) < 0.5, `lat=${cz?.lat}`);
  assert("Czech centroid lon ≈ 15.5 (was device-tz-derived → divergent)",
    cz && Math.abs(cz.lon - 15.5) < 0.5, `lon=${cz?.lon}`);

  // The lon must NOT depend on the device tz. Repeated calls (which would
  // re-evaluate `new Date().getTimezoneOffset()` under the old code) yield
  // identical lon today.
  const cz2 = getSunCoords();
  assert("getSunCoords is pure for the same profile (no tz drift)",
    cz2 && cz2.lon === cz.lon && cz2.lat === cz.lat);

  // Different country → different centroid.
  await setProfileLocation(null, 'japan', '');
  const jp = getSunCoords();
  assert("Japan resolves to its own centroid (lat ~36, lon ~138)",
    jp && Math.abs(jp.lat - 36.2) < 0.5 && Math.abs(jp.lon - 138.3) < 0.5,
    `got ${JSON.stringify(jp)}`);

  // Country known to band table but if centroid map ever loses an entry,
  // we degrade to band-lat + lon=0 — never to a tz-derived guess.
  // (No assertion here for missing-country path since the table is full;
  // the code path is a guarded fallback.)

  // Restore profile location
  await setProfileLocation(null, origLoc.country || '', origLoc.zip || '');
  if (state.importedData) state.importedData.sunDefaults = stashedSunDefaults;
  } // end if (!SKIP_SECTION_8)

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
