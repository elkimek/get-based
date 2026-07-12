// @ts-check
// sun-defaults.js — Light lens basics plus an optional daily-routine check.
// Persists to importedData.sunDefaults.
//
// Location and confirmed skin sensitivity unlock the core guidance. Indoor
// light, eyewear, and routine answers add context without blocking first use.

import { state } from './state.js';
import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import { saveImportedData } from './data.js';
import { SKIN_TYPE } from './constants.js';
import { PHOTOSENSITIVE_MED_TIERS, _normalizePSMTier } from './sun-session-model.js';
import {
  exposeSunDefaultsBindings,
  getSunSetupCoords,
  getSunSetupProfileLocation,
  hasSunDefaultsBrowserRuntime,
  hasSunSetupPreciseLocationRequester,
  invokeSunDefaultsBinding,
  navigateSunDefaultsRoute,
  openSunSetupProfileLocationRuntime,
  requestSunSetupPreciseLocationRuntime,
} from './sun-defaults-runtime.js';

// Map between Fitzpatrick Roman numeral and the SKIN_TYPE label used by the
// Light & Circadian context card so both surfaces stay in sync.
//   sunDefaults.fitzpatrick : 'I' | 'II' | ... | 'VI'      (used by sun-spectrum)
//   lightCircadian.skinType : 'I — very fair' | ...         (used by context card)
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

/** @type {{ maybeAnalyzeOnboardingAfterSave: AnyFunction, renderOnboardingAIBlock: AnyFunction }} */
const sunDefaultsDeps = {
  maybeAnalyzeOnboardingAfterSave: () => {},
  renderOnboardingAIBlock: () => '',
};

export function configureSunDefaults(deps = {}) {
  Object.assign(sunDefaultsDeps, deps);
}

function maybeAnalyzeOnboardingAfterSave() {
  try { sunDefaultsDeps.maybeAnalyzeOnboardingAfterSave(); } catch (_) {}
}

function renderOnboardingAIBlock() {
  try { return sunDefaultsDeps.renderOnboardingAIBlock() || ''; } catch (_) { return ''; }
}

// Map legacy boolean photosensitiveMeds storage to tier key for the
// rendered select. true → 'moderate' (matches the previous fixed ×2.5
// MED reduction), false / null → 'none'. New string-tier storage passes
// through unchanged.
const _psmTierOf = _normalizePSMTier;
const PHOTOSENSITIVE_OPTIONS = PHOTOSENSITIVE_MED_TIERS.map(tier => ({
  key: tier.key,
  label: tier.label,
  sub: tier.key === 'none' ? 'No known sun-sensitivity warning' : tier.examples,
}));

function fitzpatrickToSkinTypeIndex(fp) {
  return Math.max(0, ROMAN.indexOf(fp));
}
function skinTypeToFitzpatrick(skinTypeStr) {
  if (!skinTypeStr) return null;
  const m = skinTypeStr.match(/^(I{1,3}|IV|VI?)\b/);
  return m ? m[1] : null;
}
function getInitialFitzpatrick() {
  const sd = state.importedData?.sunDefaults?.fitzpatrick;
  if (sd) return sd;
  const lc = state.importedData?.lightCircadian?.skinType;
  return skinTypeToFitzpatrick(lc);
}

let lightSetupDelegatesInstalled = false;

function lightSetupActionAttrs(action, data = {}) {
  const attrs = [`data-light-setup-action="${escapeAttr(action)}"`];
  for (const [key, value] of Object.entries(data)) {
    if (value != null && value !== '') attrs.push(`data-light-setup-${key}="${escapeAttr(String(value))}"`);
  }
  return attrs.join(' ');
}

function lightSetupInputAttrs(input) {
  return `data-light-setup-input="${escapeAttr(input)}"`;
}

function parseSetupIndex(value) {
  const idx = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(idx) ? idx : null;
}

function selectSetupSkinIndex(rawIdx) {
  const idx = parseSetupIndex(rawIdx);
  if (idx == null) return;
  const range = /** @type {HTMLInputElement | null} */ (document.getElementById('setup-skin-range'));
  if (range) range.value = String(idx);
  _updateSetupSkinSlider(idx);
}

function handleLightSetupClick(event) {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return;
  const actionEl = /** @type {HTMLElement | null} */ (target.closest('[data-light-setup-action]'));
  if (!actionEl?.dataset) return;

  switch (actionEl.dataset.lightSetupAction || '') {
    case 'reopen':
      event.preventDefault();
      invokeSunDefaultsBinding('reopenSunSetup', reopenSunSetup);
      break;
    case 'reopen-score':
      event.preventDefault();
      invokeSunDefaultsBinding('reopenSunSetup', reopenSunSetup);
      setLightSetupStep('score');
      break;
    case 'dismiss':
      event.preventDefault();
      invokeSunDefaultsBinding('dismissSunSetup', dismissSunSetup);
      break;
    case 'cancel-reopen':
      event.preventDefault();
      invokeSunDefaultsBinding('cancelReopenSunSetup', cancelReopenSunSetup);
      break;
    case 'set-step':
      event.preventDefault();
      setLightSetupStep(actionEl.dataset.lightSetupStep || 'core');
      break;
    case 'save':
      event.preventDefault();
      invokeSunDefaultsBinding('saveSunSetup', saveSunSetup);
      break;
    case 'save-basics':
      event.preventDefault();
      saveSunSetupBasics();
      break;
    case 'select-choice':
      event.preventDefault();
      _selectSetupChoice(actionEl);
      break;
    case 'select-skin':
      event.preventDefault();
      selectSetupSkinIndex(actionEl.dataset.lightSetupSkinIdx);
      break;
    case 'open-profile-location':
      event.preventDefault();
      invokeSunDefaultsBinding('openLightSetupProfileLocation', openLightSetupProfileLocation);
      break;
    case 'request-precise-location':
      event.preventDefault();
      invokeSunDefaultsBinding('requestLightSetupPreciseLocation', requestLightSetupPreciseLocation);
      break;
  }
}

function handleLightSetupInput(event) {
  const target = event.target;
  const inputEl = /** @type {HTMLInputElement} */ (target);
  if (!inputEl?.dataset?.lightSetupInput) return;
  switch (inputEl.dataset.lightSetupInput) {
    case 'ott-score':
      _updateOttRunningScore();
      break;
    case 'skin-range':
      _updateSetupSkinSlider(inputEl.value);
      break;
  }
}

function handleLightSetupKeydown(event) {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return;
  const actionEl = /** @type {HTMLElement | null} */ (target.closest('[data-light-setup-action="select-skin"]'));
  if (!actionEl?.dataset) return;
  const idx = parseSetupIndex(actionEl.dataset.lightSetupSkinIdx);
  if (idx == null) return;
  _skinFaceKeydown(event, idx);
}

export function installLightSetupDelegates(root = typeof document !== 'undefined' ? document : null) {
  if (!root || lightSetupDelegatesInstalled) return;
  lightSetupDelegatesInstalled = true;
  root.addEventListener('click', handleLightSetupClick);
  root.addEventListener('input', handleLightSetupInput);
  root.addEventListener('keydown', handleLightSetupKeydown);
}

// ─── Fitzpatrick skin types ───────────────────────────────────────────

export const FITZPATRICK_OPTIONS = [
  { key: 'I',   label: 'I — always burns, never tans (very fair, red/blond hair, freckles)' },
  { key: 'II',  label: 'II — usually burns, tans minimally (fair, light eyes)' },
  { key: 'III', label: 'III — sometimes burns, tans gradually (medium)' },
  { key: 'IV',  label: 'IV — rarely burns, tans easily (olive/Mediterranean)' },
  { key: 'V',   label: 'V — very rarely burns, tans deeply (brown)' },
  { key: 'VI',  label: 'VI — never burns (deeply pigmented)' },
];

// Short burn/tan descriptors used as the sub-line under the active label.
// Pulled from the Fitzpatrick options above with the parenthetical body
// trimmed off — keeps the descriptor punchy.
const FITZPATRICK_DESCRIPTOR = [
  'always burns, never tans',
  'usually burns, tans minimally',
  'sometimes burns, tans gradually',
  'rarely burns, tans easily',
  'very rarely burns, tans deeply',
  'never burns, deeply pigmented',
];

export const HOME_LIGHT_OPTIONS = [
  { key: 'led-cool',     label: 'Mostly LED — cool/daylight (4000K+)' },
  { key: 'led-warm',     label: 'Mostly LED — warm white (2700–3000K)' },
  { key: 'led-tunable',  label: 'LED — tunable / color-changing' },
  { key: 'fluorescent',  label: 'Fluorescent / CFL' },
  { key: 'incandescent', label: 'Incandescent (filament)' },
  { key: 'mixed',        label: 'Mixed / multiple types' },
  { key: 'candle',       label: 'Mostly candle / firelight in evening' },
  { key: 'unknown',      label: "I don't know" },
];

export const EYEWEAR_OPTIONS = [
  { key: 'none',          label: 'None (or rarely)' },
  { key: 'sunglasses',    label: 'Sunglasses outdoors' },
  { key: 'clear-glasses', label: 'Clear prescription glasses' },
  { key: 'both',          label: 'Both — sunglasses outside, prescription inside' },
  { key: 'contacts-uv',   label: 'Contacts with UV block' },
];

// ─── Daily-light routine check ────────────────────────────────────────
// Ten plain-language prompts identify practical patterns the user can change.
// The result describes the mapped routine; it is not a health score.
export const OTT_QUESTIONS = [
  { key: 'morning-light-deficit',    text: 'Do you usually miss outdoor daylight during the first hour after waking?',
    why: 'Outdoor light is usually much brighter than indoor light and gives your day a clear starting signal.' },
  { key: 'glass-mediated-daytime',   text: 'Do you spend most of your daytime hours behind window glass (office, home, car)?',
    why: 'A bright-looking window is still usually much dimmer than stepping outside.' },
  { key: 'dim-workspace',            text: 'Does your main daytime space feel dim, even with the lights on?',
    why: 'A brighter day and dimmer evening create a clearer day–night contrast.' },
  { key: 'cool-led-evening',         text: 'Are most of your indoor lights after sunset cool / daylight-white (4000K+)?',
    why: 'Cool, bright light can feel alerting late in the day; dimming often matters as much as color.' },
  { key: 'evening-screens',          text: 'Do you regularly use bright screens (phone, laptop, TV) in the 2 hours before bed?',
    why: 'Brightness, duration, and how close the screen is to bedtime can all make winding down harder.' },
  { key: 'bright-after-sunset',      text: 'Do you keep overhead room lights on at full brightness after sunset?',
    why: 'Lower, dimmer lighting makes the change from daytime to evening easier to see and feel.' },
  { key: 'sleep-not-dark',           text: 'Is your bedroom not fully dark while you sleep (LED indicators, streetlight, partner\'s screen)?',
    why: 'A darker room removes a common source of sleep disruption; comfort and preference still vary.' },
  { key: 'late-bedtime-light',       text: 'Is your bedroom or bathroom brightly lit during the last hour before bed?',
    why: 'Dimming the last part of the evening is a simple way to make the routine feel calmer.' },
  { key: 'low-daylight-room',        text: 'Does your main daytime room have little useful daylight?',
    why: 'Low daytime brightness makes the contrast between day and evening less clear.' },
  { key: 'low-outdoor-time',         text: 'Is your total outdoor time under 30 minutes on a typical day?',
    why: 'A short, repeatable outdoor break often adds more daylight than trying to brighten an entire room.' },
];

// ─── Public API ────────────────────────────────────────────────────────

export function getSunDefaults() {
  if (!state.importedData) return null;
  if (!state.importedData.sunDefaults) state.importedData.sunDefaults = {};
  return state.importedData.sunDefaults;
}

export async function saveSunDefaults(patch) {
  const d = getSunDefaults();
  Object.assign(d, patch);
  await saveImportedData();
}

export function isOnboardingComplete() {
  const d = state.importedData?.sunDefaults;
  return d && d.fitzpatrick && d.completedAt;
}

// ─── UI: setup card (3 questions + indoor-light burden audit) ────────

// Session-level flag kept for compatibility with older callers that expected
// edit mode to be stateful. The editor now lives in a focused overlay; the
// widget always renders either a compact prompt or the saved summary.
let _setupForceOpen = false;
const LIGHT_SETUP_OVERLAY_ID = 'light-setup-focus-overlay';

function reopenSunSetup() {
  _setupForceOpen = true;
  openSunSetupOverlay();
}

export function openLightSetup() {
  reopenSunSetup();
}

function cancelReopenSunSetup() {
  closeSunSetupOverlay();
  _setupForceOpen = false;
}

// Map the count of saved routine patterns to a qualitative label and color.
//
// Function name kept for backward-compat — call sites can still use
// ottScoreToLabel() during the transition; alias `lightBurdenToLabel`
// is the modern name and they share an implementation.
export function ottScoreToLabel(score) {
  if (typeof score !== 'number') return { label: '—', tier: 0 };
  if (score <= 1) return { label: 'few patterns to review', tier: 0 };
  if (score <= 3) return { label: 'a few patterns to review', tier: 1 };
  if (score <= 5) return { label: 'several patterns to review', tier: 2 };
  if (score <= 7) return { label: 'many patterns to review', tier: 3 };
  return { label: 'most patterns to review', tier: 4 };
}
export const lightBurdenToLabel = ottScoreToLabel;

// Compact summary of saved answers, with an Edit button. Renders in place
// of the editor once the user has completed onboarding.
//
// Visual model: 4 chip-cards in a responsive grid, each with an icon + a
// short value + an accent-colored bar tied to the answer's character.
// Replaces the old label-value flat row which read like a form receipt.
function renderSavedSummary() {
  const d = getSunDefaults() || {};
  const lcSkin = state.importedData?.lightCircadian?.skinType;
  const fp = d.fitzpatrick || skinTypeToFitzpatrick(lcSkin);
  const fpIdx = fp ? fitzpatrickToSkinTypeIndex(fp) : -1;
  const fpLabel = fpIdx >= 0 ? SKIN_TYPE[fpIdx] : '—';
  const homeMeta = HOME_LIGHT_OPTIONS.find(o => o.key === d.homeLight);
  const eyewearMeta = EYEWEAR_OPTIONS.find(o => o.key === d.eyewear);

  // Per-field accent color — picked from the answer so the strip reads
  // visually different at a glance for different users.
  const skinEmoji = ['🧑🏻','🧑🏼','🧑🏽','🧑🏾','🧑🏿','🧑🏿'][fpIdx] || '🧑';
  const homeIconMap = {
    'led-cool': '💡', 'led-warm': '💡', 'led-tunable': '💡',
    'fluorescent': '🌫️', 'incandescent': '🔥', 'halogen': '🔥',
    'candle': '🕯️', 'mixed': '✨', 'natural-only': '☀️', 'unknown': '❔',
  };
  const homeAccentMap = {
    'led-cool': 'cool', 'led-warm': 'warm', 'led-tunable': 'cool',
    'fluorescent': 'cool', 'incandescent': 'warm', 'halogen': 'warm',
    'candle': 'warm', 'natural-only': 'sun', 'mixed': 'neutral', 'unknown': 'neutral',
  };
  const homeIcon = homeIconMap[d.homeLight] || '💡';
  const homeAccent = homeAccentMap[d.homeLight] || 'neutral';
  const homeShort = (homeMeta?.label || d.homeLight || 'Not set').replace(/\s*\(.*\)/, ''); // strip parenthetical

  const eyewearIconMap = {
    'none': '👁', 'sunglasses': '🕶', 'clear-prescription': '👓',
    'both': '🕶', 'contacts-uv': '👀',
  };
  const eyewearIcon = eyewearIconMap[d.eyewear] || '👁';
  const eyewearShort = (eyewearMeta?.label || d.eyewear || 'Not set').split('—')[0].split(/[(,]/)[0].trim();

  // Routine chip — keep using the existing tier-colored badge logic.
  let ottChip;
  if (typeof d.ottScore === 'number') {
    const { label, tier } = ottScoreToLabel(d.ottScore);
    ottChip = `<div class="light-setup-chip light-setup-chip-ott light-setup-chip-tier-${tier}" title="Optional daily-routine check. A higher number means more saved patterns are worth reviewing; it is not a health score.">
      <div class="light-setup-chip-icon">☀</div>
      <div class="light-setup-chip-body">
        <div class="light-setup-chip-label">Daily routine</div>
        <div class="light-setup-chip-value">${escapeHTML(label)}</div>
        <div class="light-setup-chip-sub">${d.ottScore}/10 patterns to review</div>
      </div>
    </div>`;
  } else if (d.skipped) {
    ottChip = `<div class="light-setup-chip light-setup-chip-skipped">
      <div class="light-setup-chip-icon">⏭</div>
      <div class="light-setup-chip-body">
        <div class="light-setup-chip-label">Daily routine</div>
        <div class="light-setup-chip-value">Skipped</div>
        <div class="light-setup-chip-sub">tap Edit to fill in</div>
      </div>
    </div>`;
  } else {
    ottChip = `<div class="light-setup-chip light-setup-chip-unset">
      <div class="light-setup-chip-icon">·</div>
      <div class="light-setup-chip-body">
        <div class="light-setup-chip-label">Daily routine</div>
        <div class="light-setup-chip-value">—</div>
      </div>
    </div>`;
  }

  const psmTier = _psmTierOf(d.photosensitiveMeds);
  const psmCopy = PHOTOSENSITIVE_MED_TIERS.find(tier => tier.key === psmTier && tier.key !== 'none');
  const photoBanner = psmCopy
    ? `<div class="light-setup-photo-banner" title="This qualitative flag does not multiply your burn threshold. Follow the product label or advice from your prescriber or pharmacist.">⚠ ${escapeHTML(psmCopy.label)} sun-sensitivity warning saved — exact timing and exposure-seeking prompts are withheld.</div>`
    : '';
  return `<div class="light-setup-summary">
    <div class="light-setup-summary-head">
      <span class="light-setup-summary-headline">
        <span class="light-setup-summary-tick">✓</span>
        Your light setup
      </span>
      <button class="import-btn import-btn-secondary light-setup-summary-edit" ${lightSetupActionAttrs('reopen')}>Edit</button>
    </div>
    ${photoBanner}
    <div class="light-setup-chips-grid">
      <div class="light-setup-chip light-setup-chip-skin" title="${escapeAttr('Fitzpatrick ' + fpLabel + ' — used to make modeled UV warnings more relevant.')}">
        <div class="light-setup-chip-icon">${skinEmoji}</div>
        <div class="light-setup-chip-body">
          <div class="light-setup-chip-label">Skin type</div>
          <div class="light-setup-chip-value">${escapeHTML(fpLabel)}</div>
        </div>
      </div>
      <div class="light-setup-chip light-setup-chip-home light-setup-chip-home-${homeAccent}" title="${escapeAttr(homeMeta?.label || d.homeLight || 'Not set')}">
        <div class="light-setup-chip-icon">${homeIcon}</div>
        <div class="light-setup-chip-body">
          <div class="light-setup-chip-label">Home lighting</div>
          <div class="light-setup-chip-value">${escapeHTML(homeShort)}</div>
        </div>
      </div>
      <div class="light-setup-chip light-setup-chip-eyewear" title="${escapeAttr(eyewearMeta?.label || d.eyewear || 'Not set')}">
        <div class="light-setup-chip-icon">${eyewearIcon}</div>
        <div class="light-setup-chip-body">
          <div class="light-setup-chip-label">Eyewear outside</div>
          <div class="light-setup-chip-value">${escapeHTML(eyewearShort)}</div>
        </div>
      </div>
      ${ottChip}
    </div>
    ${renderOnboardingAIBlock()}
  </div>`;
}

export function renderSetupCard() {
  if (isOnboardingComplete()) return renderSavedSummary();
  if (getSunDefaults()?.fitzpatrick) return renderBasicsSummary();
  return renderSetupPrompt();
}

function renderSetupPrompt() {
  const deferred = !!getSunDefaults()?.setupDismissedAt;
  return `<div class="light-setup-prompt light-widget-prompt">
    <div class="light-widget-prompt-copy">
      <strong>${deferred ? 'Continue setup when you’re ready' : 'Get useful guidance in two quick steps'}</strong>
      <p>${deferred ? 'Confirm skin sensitivity to make UV warnings more relevant. Optional routine details can still wait.' : 'Add location and skin sensitivity first. The app can then explain current UV and give one practical next action.'}</p>
      <div class="light-setup-value-preview" aria-label="What setup unlocks">
        <span><b>1</b> See current conditions</span>
        <span><b>2</b> Get one practical next step</span>
        <span><b>3</b> Compare your weekly pattern</span>
      </div>
    </div>
    <div class="light-setup-prompt-actions">
      ${deferred ? '' : `<button type="button" class="dashboard-action-btn" ${lightSetupActionAttrs('dismiss')}>Later</button>`}
      <button type="button" class="dashboard-action-btn dashboard-action-btn-primary light-widget-prompt-cta" ${lightSetupActionAttrs('reopen')}>${deferred ? 'Continue setup' : 'Set up'}</button>
    </div>
  </div>`;
}

function renderBasicsSummary() {
  const d = getSunDefaults() || {};
  const coords = getSunSetupCoords();
  if (!coords) {
    return `<div class="light-setup-basics-ready light-setup-basics-incomplete">
      <div class="light-setup-basics-copy">
        <span class="light-setup-basics-status">One basic left</span>
        <strong>Add your location</strong>
        <p>Skin type ${escapeHTML(d.fitzpatrick || '—')} is saved. Add a profile location or allow precise location to unlock current conditions.</p>
      </div>
      <div class="light-setup-basics-actions">
        <button type="button" class="dashboard-action-btn dashboard-action-btn-primary" ${lightSetupActionAttrs('reopen')}>Add location</button>
      </div>
    </div>`;
  }
  return `<div class="light-setup-basics-ready">
    <div class="light-setup-basics-copy">
      <span class="light-setup-basics-status">Basics ready</span>
      <strong>Current guidance is unlocked</strong>
      <p>Skin type ${escapeHTML(d.fitzpatrick || '—')} and location are saved. Home lighting, eyewear, and the daily-routine check are optional refinements.</p>
    </div>
    <div class="light-setup-basics-actions">
      <button type="button" class="dashboard-action-btn" ${lightSetupActionAttrs('reopen')}>Edit basics</button>
      <button type="button" class="dashboard-action-btn dashboard-action-btn-primary" ${lightSetupActionAttrs('reopen-score')}>Add optional details</button>
    </div>
  </div>`;
}

function renderSetupActions() {
  const basicsSaved = !!(getSunDefaults()?.fitzpatrick && getSunDefaults()?.basicsCompletedAt);
  const hasSavedSetup = isOnboardingComplete() || basicsSaved;
  return `<div class="light-setup-actions" data-setup-actions="core">
    ${hasSavedSetup
      ? `<button class="import-btn import-btn-secondary" ${lightSetupActionAttrs('cancel-reopen')}>Cancel</button>
         <button class="import-btn import-btn-secondary light-setup-next-btn" ${lightSetupActionAttrs('set-step', { step: 'score' })}>Daily routine</button>
         <button class="import-btn import-btn-primary light-setup-basics-btn" ${lightSetupActionAttrs('save-basics')}>Save changes</button>`
      : `<button class="import-btn import-btn-tertiary light-setup-skip-btn" ${lightSetupActionAttrs('dismiss')}>I'll do this later</button>
         <button class="import-btn import-btn-secondary light-setup-next-btn" ${lightSetupActionAttrs('set-step', { step: 'score' })}>Add routine details</button>
         <button class="import-btn import-btn-primary light-setup-basics-btn" ${lightSetupActionAttrs('save-basics')}>Save basics &amp; start</button>`}
  </div>
  <div class="light-setup-actions" data-setup-actions="score">
    <button class="import-btn import-btn-secondary" ${lightSetupActionAttrs('set-step', { step: 'core' })}>Back</button>
    ${isOnboardingComplete()
      ? `<button class="import-btn import-btn-primary light-setup-save-btn" ${lightSetupActionAttrs('save')}>Save changes</button>`
      : `<button class="import-btn import-btn-primary light-setup-save-btn" ${lightSetupActionAttrs('save')}>Save setup</button>`}
  </div>`;
}

function renderSetupChoiceGroup(id, options, selected, className = '') {
  return `<input type="hidden" id="${escapeAttr(id)}" value="${escapeAttr(selected || '')}">
    <div class="light-setup-choice-grid ${className}" role="group">
      ${options.map(o => {
        const active = selected === o.key;
        return `<button type="button" class="light-setup-choice${active ? ' active' : ''}" data-choice-group="${escapeAttr(id)}" data-value="${escapeAttr(o.key)}" aria-pressed="${active ? 'true' : 'false'}" ${lightSetupActionAttrs('select-choice')}>
          <span class="light-setup-choice-label">${escapeHTML(o.label)}</span>
          ${o.sub ? `<span class="light-setup-choice-sub">${escapeHTML(o.sub)}</span>` : ''}
        </button>`;
      }).join('')}
    </div>`;
}

function renderOttScoreMeter(score) {
  const burden = Math.max(0, Math.min(10, Number(score) || 0));
  const aligned = 10 - burden;
  const meta = ottScoreToLabel(burden);
  return `<div class="light-setup-ott-running light-setup-score-meter" id="ott-running-score" data-tier="${escapeAttr(String(meta.tier))}">
    <div class="light-setup-score-main">
      <span>Alignment</span>
      <strong id="ott-running-aligned">${aligned}/10</strong>
    </div>
    <div class="light-setup-score-bar" aria-hidden="true">
      <span id="ott-score-fill" style="width:${aligned * 10}%"></span>
    </div>
    <div class="light-setup-score-meta">
      <span class="light-setup-score-gap-count">Gaps flagged: <strong id="ott-running-value">${burden}/10</strong></span>
      <span class="light-ott-badge light-ott-tier-${meta.tier}" id="ott-running-label" data-tier="${escapeAttr(String(meta.tier))}">${escapeHTML(meta.label)}</span>
      <span class="light-setup-ott-summary-score" id="ott-summary-score">${aligned}/10 aligned</span>
    </div>
  </div>`;
}

function renderOttQuestion(q, index, checked) {
  return `<label class="light-setup-ott-q light-setup-ott-card${checked ? ' is-flagged' : ''}">
    <input class="light-setup-ott-input" type="checkbox" data-ott="${escapeAttr(q.key)}"${checked ? ' checked' : ''} ${lightSetupInputAttrs('ott-score')}>
    <span class="light-setup-ott-card-mark" aria-hidden="true"><span>${index + 1}</span></span>
    <span class="light-setup-ott-q-body">
      <span class="light-setup-ott-q-top">
        <span class="light-setup-ott-q-text">${escapeHTML(q.text)}</span>
        <span class="light-setup-ott-q-state light-setup-ott-q-state-clear">Aligned</span>
        <span class="light-setup-ott-q-state light-setup-ott-q-state-flagged">Gap flagged</span>
      </span>
      ${q.why ? `<span class="light-setup-ott-q-why">${escapeHTML(q.why)}</span>` : ''}
    </span>
  </label>`;
}

function renderSetupEditor({ includeActions = true } = {}) {
  const d = getSunDefaults() || {};
  const skinReady = !!getInitialFitzpatrick();
  const ottBurden = d.ott ? Object.values(d.ott).filter(v => v).length : 0;

  let html = `<div class="light-setup-card light-setup-card-editor">
    <div class="light-setup-step-tabs" role="tablist" aria-label="Light setup steps">
      <button type="button" class="light-setup-step-tab active" data-setup-tab="core" role="tab" aria-selected="true" ${lightSetupActionAttrs('set-step', { step: 'core' })}>
        <span class="light-setup-step-tab-index">1</span>
        <span>Get started</span>
      </button>
      <button type="button" class="light-setup-step-tab" data-setup-tab="score" role="tab" aria-selected="false" ${lightSetupActionAttrs('set-step', { step: 'score' })}>
        <span class="light-setup-step-tab-index">2</span>
        <span>Daily routine <small>optional</small></span>
      </button>
    </div>

    <section class="light-setup-pane" data-setup-pane="core">
    <div class="light-setup-title" tabindex="-1">Unlock current guidance
      <span class="light-setup-progress" aria-label="${skinReady ? 'Skin sensitivity confirmed' : 'Skin sensitivity still needed'}">${skinReady ? 'Skin confirmed' : 'Skin needed'}</span>
    </div>
    <p class="light-setup-lead"><strong>Start here.</strong> Location and skin sensitivity are enough for current conditions and cautious UV guidance. Everything else can be added later.</p>
    ${renderSetupLocationStatus()}

    <div class="light-setup-fields-grid">
    <div class="light-setup-step">
      <label class="ctx-label" id="setup-skin-label-id">Skin type</label>
      <p class="light-setup-step-why">Helps estimate UV sensitivity. The result is a cautious model, not a promise of safe time in the sun.</p>
      <div class="ctx-skin-slider-wrap">
        <div class="ctx-skin-emojis" role="radiogroup" aria-labelledby="setup-skin-label-id">${['🧑🏻','🧑🏼','🧑🏽','🧑🏾','🧑🏿','🧑🏿'].map((e, i) => {
          const isActive = getInitialFitzpatrick() === ROMAN[i];
          // tabindex: only the checked radio is in the tab order (roving
          // tabindex pattern); arrow keys move between siblings inside the
          // group. Default to index 2 (median III) when nothing is set.
          const fallbackIdx = getInitialFitzpatrick() ? null : 2;
          const inTabOrder = isActive || (fallbackIdx === i);
          return `<span class="ctx-skin-face${isActive ? ' active' : ''}" data-idx="${i}" data-roman="${ROMAN[i]}" role="radio" tabindex="${inTabOrder ? '0' : '-1'}" aria-checked="${isActive ? 'true' : 'false'}" aria-label="Fitzpatrick ${escapeAttr(SKIN_TYPE[i])}" ${lightSetupActionAttrs('select-skin', { 'skin-idx': i })}>${e}</span>`;
        }).join('')}</div>
        <input type="range" min="0" max="5" value="${(getInitialFitzpatrick() ? fitzpatrickToSkinTypeIndex(getInitialFitzpatrick()) : 2)}" class="ctx-skin-range" id="setup-skin-range" ${lightSetupInputAttrs('skin-range')} data-set="${getInitialFitzpatrick() ? '1' : '0'}" aria-valuetext="${getInitialFitzpatrick() ? escapeAttr(SKIN_TYPE[fitzpatrickToSkinTypeIndex(getInitialFitzpatrick())]) : 'not set — tap a face'}">
        <div class="ctx-skin-label" id="setup-skin-label">${getInitialFitzpatrick() ? `${escapeHTML(SKIN_TYPE[fitzpatrickToSkinTypeIndex(getInitialFitzpatrick())])}<span class="ctx-skin-label-detail" id="setup-skin-label-detail">${escapeHTML(FITZPATRICK_DESCRIPTOR[fitzpatrickToSkinTypeIndex(getInitialFitzpatrick())])}</span>` : 'Tap a face or drag the slider'}</div>
      </div>
    </div>

    <details class="light-setup-optional-details">
      <summary>Optional refinements: medicine warnings, home light, and eyewear</summary>
    <div class="light-setup-step light-setup-photo-row">
      <div class="ctx-label"><strong>Medicine or product sun warning</strong></div>
      <p class="light-setup-step-why">Choose the wording that matches the label or advice you received. Do not guess from a drug category.</p>
      ${renderSetupChoiceGroup('setup-photosensitive', PHOTOSENSITIVE_OPTIONS, _psmTierOf(d.photosensitiveMeds), 'light-setup-choice-grid-compact')}
      <p class="light-setup-photo-why">This flag does not calculate or multiply your burn threshold. It pauses exposure-seeking guidance and removes exact timing. Follow the product label or your clinician’s advice. <a href="https://www.aad.org/public/everyday-care/sun-protection/sunburn/photosensitive-medications" target="_blank" rel="noopener">Learn about sun-sensitive medicines →</a></p>
    </div>

    <div class="light-setup-step">
      <div class="ctx-label">Home lighting</div>
      <p class="light-setup-step-why">Adds context about how bright and cool or warm your usual indoor light may be.</p>
      ${renderSetupChoiceGroup('setup-homelight', HOME_LIGHT_OPTIONS, d.homeLight, 'light-setup-choice-grid-compact')}
    </div>

    <div class="light-setup-step">
      <div class="ctx-label">Eyewear outside</div>
      <p class="light-setup-step-why">Helps estimate how much outdoor brightness reaches your eyes. Never look at the sun; use UV-protective eyewear when needed.</p>
      ${renderSetupChoiceGroup('setup-eyewear', EYEWEAR_OPTIONS, d.eyewear)}
    </div>
    </details>

    </div>
    </section>

    <section class="light-setup-pane" data-setup-pane="score">
    <section class="light-setup-ott">
      <div class="light-setup-ott-head">
        <div>
          <div class="light-setup-ott-kicker">Daily light routine</div>
          <h4 tabindex="-1">Which of these patterns sound like your usual day?</h4>
        </div>
      </div>
      <p class="light-setup-body light-setup-ott-lead"><strong>Optional refinement.</strong> Select what is usually true. This improves indoor and evening suggestions—not a health grade.</p>
      ${renderOttScoreMeter(d.ott ? ottBurden : ((typeof d.ottScore === 'number') ? d.ottScore : 0))}
      <div class="light-setup-ott-questions">
        ${OTT_QUESTIONS.map((q, i) => renderOttQuestion(q, i, !!(d.ott && d.ott[q.key]))).join('')}
      </div>
    </section>
    </section>

    ${includeActions ? renderSetupActions() : ''}
  </div>`;
  return html;
}

function openSunSetupOverlay() {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById(LIGHT_SETUP_OVERLAY_ID);
  if (existing) removeModalOverlay(existing);

  const overlay = document.createElement('div');
  overlay.id = LIGHT_SETUP_OVERLAY_ID;
  overlay.className = 'modal-overlay light-setup-focus-overlay';
  overlay.innerHTML = `<div class="modal light-setup-focus-modal" data-setup-step="core" role="dialog" aria-modal="true" aria-labelledby="light-setup-focus-title">
    <header class="light-setup-focus-head">
      <div>
        <div class="gb-modal-kicker">Light lens setup</div>
        <h3 id="light-setup-focus-title">Light setup</h3>
        <p>Add the two basics for local guidance. Routine and indoor-light details are optional.</p>
      </div>
      <button type="button" class="modal-close" aria-label="Close light setup" data-light-setup-close>&times;</button>
    </header>
    <div class="light-setup-focus-body" tabindex="-1">
      ${renderSetupEditor({ includeActions: false })}
    </div>
    ${renderSetupActions()}
  </div>`;

  overlay.querySelector('[data-light-setup-close]')?.addEventListener('click', closeSunSetupOverlay);
  openAppendedModalOverlay(overlay, closeSunSetupOverlay);

  const obs = new MutationObserver(() => {
    if (!document.body.contains(overlay)) {
      obs.disconnect();
      _setupForceOpen = false;
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  setLightSetupStep('core', { focus: false });
  const focusBody = () => {
    const body = /** @type {HTMLElement | null} */ (overlay.querySelector('.light-setup-focus-body'));
    body?.focus({ preventScroll: true });
  };
  setTimeout(() => {
    _refreshSetupProgress();
    focusBody();
  }, 40);
  setTimeout(focusBody, 120);
}

function closeSunSetupOverlay() {
  const overlay = typeof document !== 'undefined'
    ? document.getElementById(LIGHT_SETUP_OVERLAY_ID)
    : null;
  if (overlay) removeModalOverlay(overlay);
  _setupForceOpen = false;
}

function setLightSetupStep(step, opts = {}) {
  if (typeof document === 'undefined') return;
  const nextStep = step === 'score' ? 'score' : 'core';
  const modal = /** @type {HTMLElement | null} */ (document.querySelector('.light-setup-focus-modal'));
  if (!modal) return;
  modal.dataset.setupStep = nextStep;
  modal.querySelectorAll('[data-setup-tab]').forEach(tab => {
    const setupTab = /** @type {HTMLElement} */ (tab);
    const active = setupTab.dataset.setupTab === nextStep;
    setupTab.classList.toggle('active', active);
    setupTab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  modal.querySelectorAll('[data-setup-pane]').forEach(pane => {
    const setupPane = /** @type {HTMLElement} */ (pane);
    const active = setupPane.dataset.setupPane === nextStep;
    setupPane.toggleAttribute('hidden', !active);
  });
  const body = modal.querySelector('.light-setup-focus-body');
  if (body) body.scrollTop = 0;
  if (opts.focus !== false) {
    const target = /** @type {HTMLElement | null} */ (modal.querySelector(`[data-setup-pane="${nextStep}"] .light-setup-title, [data-setup-pane="${nextStep}"] h4`));
    setTimeout(() => target?.focus({ preventScroll: true }), 0);
  }
}

function formatSetupLatitude(lat) {
  const n = Number(lat);
  if (!Number.isFinite(n)) return '';
  const digits = Math.abs(n) >= 10 ? 1 : 2;
  return `${Math.abs(n).toFixed(digits)}°${n < 0 ? 'S' : 'N'}`;
}

function getSetupLocationStatus() {
  const c = getSunSetupCoords();
  const loc = getSunSetupProfileLocation();
  const country = (loc?.country || '').trim();
  const lat = c ? formatSetupLatitude(c.lat) : '';

  if (c?.source === 'profile-precise') {
    return {
      tone: 'precise',
      value: 'Precise location saved',
      badge: 'highest accuracy',
      detail: 'Drives sun-angle and UV-index math with saved lat/lon.',
      preciseLabel: 'Refresh precise location',
    };
  }
  if (c?.source === 'country-band') {
    return {
      tone: 'estimate',
      value: `Profile estimate${lat ? ` · ~${lat}` : ''}`,
      badge: 'profile',
      detail: `${country ? `${country} profile location. ` : ''}Country-level is enough for setup; precise location sharpens live sun timing.`,
      preciseLabel: 'Use precise location',
    };
  }
  return {
    tone: 'missing',
    value: 'No profile location set',
    badge: 'needed',
    detail: 'Set country in Profile for daylight and UV estimates, or share precise location once.',
    preciseLabel: 'Use precise location',
  };
}

function renderSetupLocationStatus() {
  const status = getSetupLocationStatus();
  return `<div class="light-setup-location-status light-setup-location-${escapeAttr(status.tone)}" aria-label="Location status">
    <div class="light-setup-location-copy">
      <div class="light-setup-location-label">Location</div>
      <div class="light-setup-location-value-row">
        <strong>${escapeHTML(status.value)}</strong>
        <span class="light-setup-location-badge">${escapeHTML(status.badge)}</span>
      </div>
      <p>${escapeHTML(status.detail)}</p>
    </div>
    <div class="light-setup-location-actions">
      <button type="button" class="import-btn import-btn-secondary" ${lightSetupActionAttrs('open-profile-location')}>Edit profile</button>
      <button type="button" class="import-btn import-btn-secondary" ${lightSetupActionAttrs('request-precise-location')}>${escapeHTML(status.preciseLabel)}</button>
    </div>
  </div>`;
}

function refreshSetupLocationStatus() {
  if (typeof document === 'undefined') return;
  const row = document.querySelector('.light-setup-location-status');
  if (row) row.outerHTML = renderSetupLocationStatus();
}

function openLightSetupProfileLocation() {
  cancelReopenSunSetup();
  setTimeout(openSunSetupProfileLocationRuntime, 0);
}

async function requestLightSetupPreciseLocation() {
  if (!hasSunSetupPreciseLocationRequester()) {
    showNotification('Precise location is unavailable here.');
    return null;
  }
  const coords = await requestSunSetupPreciseLocationRuntime();
  refreshSetupLocationStatus();
  return coords;
}

function readSetupFieldValue(root, id) {
  const el = root?.querySelector?.(`#${id}`);
  if (!el || !('value' in el)) return null;
  const value = String(el.value || '');
  return value || null;
}

function readSetupPhotosensitiveValue(root) {
  const el = root?.querySelector?.('#setup-photosensitive');
  if (!el) return 'none';
  const type = 'type' in el ? String(el.type || '') : '';
  if (type === 'checkbox') return el.checked ? 'moderate' : 'none';
  return readSetupFieldValue(root, 'setup-photosensitive') || 'none';
}

function buildDefaultLightCircadianContext() {
  return {
    amLight: null,
    daytime: null,
    uvExposure: null,
    skinType: null,
    evening: [],
    screenTime: null,
    techEnv: [],
    cold: null,
    grounding: null,
    mealTiming: [],
    note: '',
  };
}

export function collectSunSetupValues(root) {
  if (!root) return { ok: false, reason: 'missing-root' };
  // Skin type comes from the emoji-slider range. The slider defaults to
  // position 2 (median III) but data-set="0" means the user hasn't
  // actively confirmed; they must tap a face or drag.
  const sliderEl = /** @type {HTMLInputElement | null} */ (root.querySelector('#setup-skin-range'));
  const isSet = sliderEl?.dataset?.set === '1';
  const skinIdx = isSet ? parseInt(sliderEl?.value || '', 10) : -1;
  const fitzpatrick = (skinIdx >= 0 && skinIdx < 6) ? ROMAN[skinIdx] : null;
  if (!fitzpatrick) {
    return { ok: false, reason: 'skin-type-required' };
  }
  const ott = {};
  let ottScore = 0;
  for (const q of OTT_QUESTIONS) {
    const cb = /** @type {HTMLInputElement | null} */ (root.querySelector(`input[data-ott="${q.key}"]`));
    if (cb) {
      ott[q.key] = !!cb.checked;
      if (cb.checked) ottScore++;
    }
  }
  return {
    ok: true,
    values: {
      skinIdx,
      fitzpatrick,
      photosensitiveMeds: readSetupPhotosensitiveValue(root),
      homeLight: readSetupFieldValue(root, 'setup-homelight'),
      eyewear: readSetupFieldValue(root, 'setup-eyewear'),
      ott,
      ottScore,
    },
  };
}

export async function persistSunSetupValues(values, now = Date.now()) {
  if (!values || !state.importedData) return null;
  const d = getSunDefaults();
  if (!d) return null;
  Object.assign(d, {
    fitzpatrick: values.fitzpatrick,
    photosensitiveMeds: values.photosensitiveMeds,
    homeLight: values.homeLight,
    eyewear: values.eyewear,
    ott: values.ott || {},
    ottScore: Number(values.ottScore) || 0,
    completedAt: now,
  });
  if (!state.importedData.lightCircadian) {
    state.importedData.lightCircadian = buildDefaultLightCircadianContext();
  }
  state.importedData.lightCircadian.skinType = SKIN_TYPE[values.skinIdx];
  await saveImportedData();
  return d;
}

export function collectSunSetupBasics(root) {
  if (!root) return { ok: false, reason: 'missing-root' };
  const skinRange = /** @type {HTMLInputElement | null} */ (root.querySelector('#setup-skin-range'));
  const skinIdx = skinRange?.dataset?.set === '1' ? Number.parseInt(skinRange.value, 10) : -1;
  const fitzpatrick = skinIdx >= 0 && skinIdx < ROMAN.length ? ROMAN[skinIdx] : null;
  if (!fitzpatrick) return { ok: false, reason: 'skin-type-required' };
  return {
    ok: true,
    values: {
      skinIdx,
      fitzpatrick,
      photosensitiveMeds: readSetupPhotosensitiveValue(root),
      homeLight: readSetupFieldValue(root, 'setup-homelight'),
      eyewear: readSetupFieldValue(root, 'setup-eyewear'),
    },
  };
}

export async function persistSunSetupBasics(values, now = Date.now()) {
  if (!values || !state.importedData) return null;
  const d = getSunDefaults();
  if (!d) return null;
  Object.assign(d, {
    fitzpatrick: values.fitzpatrick,
    photosensitiveMeds: values.photosensitiveMeds || 'none',
    basicsCompletedAt: now,
  });
  if (values.homeLight) d.homeLight = values.homeLight;
  if (values.eyewear) d.eyewear = values.eyewear;
  if (!state.importedData.lightCircadian) {
    state.importedData.lightCircadian = buildDefaultLightCircadianContext();
  }
  state.importedData.lightCircadian.skinType = SKIN_TYPE[values.skinIdx];
  await saveImportedData();
  return d;
}

async function saveSunSetupBasics() {
  const root = document.querySelector('.light-setup-card');
  const collected = collectSunSetupBasics(root);
  if (!collected.ok) {
    showNotification('Tap a face to confirm your skin type.');
    return false;
  }
  if (!getSunSetupCoords()) {
    showNotification('Add a profile location or allow precise location first.');
    return false;
  }
  await persistSunSetupBasics(collected.values);
  closeSunSetupOverlay();
  showNotification('Basics saved · current guidance is ready');
  navigateSunDefaultsRoute('light');
  return true;
}

async function saveSunSetup() {
  const root = document.querySelector('.light-setup-card');
  const collected = collectSunSetupValues(root);
  if (!collected.ok) {
    if (collected.reason === 'skin-type-required') {
      setLightSetupStep('core');
      showNotification('Tap a face to confirm your skin type.');
    }
    return false;
  }
  await persistSunSetupValues(collected.values);
  closeSunSetupOverlay();
  showNotification(`Setup saved · ${collected.values.ottScore}/10 routine patterns to review`);
  maybeAnalyzeOnboardingAfterSave();
  navigateSunDefaultsRoute('light');
  return true;
}

// Recompute the optional routine summary whenever a checkbox toggles.
function _updateOttRunningScore() {
  const root = document.querySelector('.light-setup-card');
  if (!root) return;
  const cbs = root.querySelectorAll('input[data-ott]');
  let score = 0;
  cbs.forEach(cb => {
    const input = /** @type {HTMLInputElement} */ (cb);
    input.closest('.light-setup-ott-card')?.classList.toggle('is-flagged', input.checked);
    if (input.checked) score++;
  });
  const aligned = 10 - score;
  const valueEl = root.querySelector('#ott-running-value');
  const alignedEl = root.querySelector('#ott-running-aligned');
  const labelEl = root.querySelector('#ott-running-label');
  const summary = root.querySelector('#ott-summary-score');
  const meter = /** @type {HTMLElement | null} */ (root.querySelector('#ott-running-score'));
  const fill = /** @type {HTMLElement | null} */ (root.querySelector('#ott-score-fill'));
  const label = /** @type {HTMLElement | null} */ (labelEl);
  const meta = ottScoreToLabel(score);
  if (valueEl) valueEl.textContent = `${score}/10`;
  if (alignedEl) alignedEl.textContent = `${aligned}/10`;
  if (meter) meter.dataset.tier = String(meta.tier);
  if (fill) fill.style.width = `${aligned * 10}%`;
  if (label) {
    // Tier-change animation — flash the badge briefly when its tier color
    // shifts so the score change feels alive instead of silently swapping.
    const prevTier = label.dataset.tier;
    const newTier = String(meta.tier);
    label.textContent = meta.label;
    label.className = `light-ott-badge light-ott-tier-${meta.tier}`;
    label.dataset.tier = newTier;
    if (prevTier !== undefined && prevTier !== newTier) {
      label.classList.add('tier-changed');
      setTimeout(() => label.classList.remove('tier-changed'), 600);
    }
  }
  if (summary) summary.textContent = `${aligned}/10 aligned`;
}

// Live update of the setup-card emoji slider (mirrors updateSkinSlider in
// context-cards.js but bound to setup-* DOM ids so the two widgets don't
// collide if both are visible at once). Marks data-set so save knows the
// user has actively confirmed a value (vs the visual default of position 2).
function _updateSetupSkinSlider(val) {
  const idx = parseInt(val, 10);
  document.querySelectorAll('.light-setup-card .ctx-skin-face').forEach((el, i) => {
    const isActive = i === idx;
    el.classList.toggle('active', isActive);
    el.setAttribute('aria-checked', isActive ? 'true' : 'false');
  });
  const label = document.getElementById('setup-skin-label');
  const valid = idx >= 0 && idx < SKIN_TYPE.length;
  const skinLabel = valid ? SKIN_TYPE[idx] : 'Tap a face or drag the slider';
  const descriptor = valid ? FITZPATRICK_DESCRIPTOR[idx] : '';
  if (label) {
    if (valid) {
      label.innerHTML = `${escapeHTML(skinLabel)}<span class="ctx-skin-label-detail" id="setup-skin-label-detail">${escapeHTML(descriptor)}</span>`;
    } else {
      label.textContent = skinLabel;
    }
  }
  const range = document.getElementById('setup-skin-range');
  if (range) {
    range.dataset.set = '1';
    range.setAttribute('aria-valuetext', valid ? `${skinLabel} — ${descriptor}` : 'not set');
  }
  _refreshSetupProgress();
}

function _selectSetupChoice(button) {
  const group = button?.dataset?.choiceGroup;
  if (!group) return;
  const card = button.closest('.light-setup-card');
  const input = card?.querySelector(`#${group}`);
  if (!input) return;
  input.value = button.dataset.value || '';
  card.querySelectorAll(`[data-choice-group="${group}"]`).forEach(el => {
    const active = el === button;
    el.classList.toggle('active', active);
    el.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  _refreshSetupProgress();
}

// Keep the required-readiness hint in sync as skin sensitivity changes.
function _refreshSetupProgress() {
  const card = document.querySelector('.light-setup-card');
  if (!card) return;
  const skinRange = /** @type {HTMLInputElement | null} */ (card.querySelector('#setup-skin-range'));
  const skinFilled = skinRange?.dataset.set === '1';
  const progress = card.querySelector('.light-setup-progress');
  if (progress) {
    progress.textContent = skinFilled ? 'Skin confirmed' : 'Skin needed';
    progress.setAttribute('aria-label', skinFilled ? 'Skin sensitivity confirmed' : 'Skin sensitivity still needed');
  }
  const saveBtn = card.closest('.light-setup-focus-modal')?.querySelector('.light-setup-save-btn')
    || card.querySelector('.light-setup-save-btn');
  if (saveBtn && !isOnboardingComplete()) {
    saveBtn.textContent = 'Save setup';
  }
}

// Defer setup without inventing a skin type or marking guidance calibrated.
async function dismissSunSetup() {
  await saveSunDefaults({ setupDismissedAt: Date.now() });
  closeSunSetupOverlay();
  navigateSunDefaultsRoute('light');
}

if (hasSunDefaultsBrowserRuntime()) {
  installLightSetupDelegates();
  exposeSunDefaultsBindings({
    getSunDefaults,
    saveSunDefaults,
    isLightOnboardingComplete: isOnboardingComplete,
    renderSunSetupCard: renderSetupCard,
    openLightSetup,
    saveSunSetup,
    saveSunSetupBasics,
    dismissSunSetup,
    reopenSunSetup,
    cancelReopenSunSetup,
    openSunSetupOverlay,
    openLightSetupProfileLocation,
    requestLightSetupPreciseLocation,
    setLightSetupStep,
    ottScoreToLabel,
    _sunHomeLightOptions: HOME_LIGHT_OPTIONS,
    _sunEyewearOptions: EYEWEAR_OPTIONS,
    _updateSetupSkinSlider,
    _refreshSetupProgress,
    _selectSetupChoice,
    _updateOttRunningScore,
    _skinTypeToFitzpatrick: skinTypeToFitzpatrick,
    _skinFaceKeydown,
  });
}

// Arrow-key navigation across the skin-type radiogroup. Implements the
// roving tabindex pattern: Left/Right (and Up/Down) cycle the focused
// face; Enter/Space activate the current face. Keeps the radiogroup
// reachable for keyboard + screen-reader users.
/**
 * @param {KeyboardEvent} e
 * @param {number} idx
 */
function _skinFaceKeydown(e, idx) {
  const max = 5;
  let next = null;
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':  next = (idx + 1) % (max + 1); break;
    case 'ArrowLeft':
    case 'ArrowUp':    next = (idx - 1 + (max + 1)) % (max + 1); break;
    case 'Home':       next = 0; break;
    case 'End':        next = max; break;
    case 'Enter':
    case ' ':          // Space
      e.preventDefault();
      const range = /** @type {HTMLInputElement | null} */ (document.getElementById('setup-skin-range'));
      if (range) range.value = String(idx);
      _updateSetupSkinSlider(idx);
      return;
  }
  if (next == null) return;
  e.preventDefault();
  const target = /** @type {HTMLElement | null} */ (document.querySelector(`.ctx-skin-face[data-idx="${next}"]`));
  if (target) target.focus();
}
