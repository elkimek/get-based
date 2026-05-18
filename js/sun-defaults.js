// sun-defaults.js — Light lens onboarding: 3 setup questions + a 10-item
// indoor-light burden audit grounded in current photobiology. Persists to
// importedData.sunDefaults.
//
// These are the user's baseline — Fitzpatrick skin type for MED scaling,
// indoor light environment for the deficit-axis derivation, eyewear pattern
// for eye-channel gating, and a burden score (0–10) that frames their
// starting circadian/UV alignment for the AI.

import { state } from './state.js';
import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import { saveImportedData } from './data.js';
import { SKIN_TYPE } from './constants.js';

// Map between Fitzpatrick Roman numeral and the SKIN_TYPE label used by the
// Light & Circadian context card so both surfaces stay in sync.
//   sunDefaults.fitzpatrick : 'I' | 'II' | ... | 'VI'      (used by sun-spectrum)
//   lightCircadian.skinType : 'I — very fair' | ...         (used by context card)
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

// Map legacy boolean photosensitiveMeds storage to tier key for the
// rendered select. true → 'moderate' (matches the previous fixed ×2.5
// MED reduction), false / null → 'none'. New string-tier storage passes
// through unchanged.
function _psmTierOf(raw) {
  if (raw === true) return 'moderate';
  if (raw === false || raw == null) return 'none';
  return String(raw);
}

const PHOTOSENSITIVE_OPTIONS = [
  { key: 'none', label: 'None', sub: 'No known photosensitizers' },
  { key: 'mild', label: 'Mild', sub: 'Antihistamines or light NSAID use' },
  { key: 'moderate', label: 'Moderate', sub: "NSAIDs, thiazides, sulfa, St. John's Wort, topical retinol" },
  { key: 'severe', label: 'Severe', sub: 'Tetracyclines, oral retinoids, amiodarone, citrus oils on skin' },
];

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

// ─── Indoor-light burden audit ────────────────────────────────────────
// 10 yes/no questions grounded in current photobiology and circadian
// research. Each "yes" represents a known light-environment gap and adds
// 1 to the burden score (0–10 scale, higher = more indoor / disrupted).
//
// References for each question are inline so the rationale is auditable:
//   1. Morning light: Brown et al. 2022 (CIE recommendations); Münch et al.
//      JCEM 2017 — within ~1hr of waking, >100 lux outdoor entrains the SCN.
//   2. Glass-mediated day: Hattar 2002 (ipRGC) + window glass blocks UVB
//      almost entirely → no vit-D synthesis, no skin α-MSH, no NO release.
//   3. Workspace lux: WELL Building / IES TM-30 — daytime workspace >300
//      melanopic-EDI (≈500 lux at eye) for proper circadian drive.
//   4. Cool LED at night: Spitschan & Cajochen — high-CCT light suppresses
//      melatonin even at modest intensities.
//   5. Evening screens: Chang et al. AJCN 2015 — backlit screen reading
//      delays melatonin onset by ~90min.
//   6. Bright overhead lights post-sunset: Cajochen — peri-sleep ambient
//      light shifts circadian phase.
//   7. ANY light during sleep: Cain et al. JCSM 2020 — even <5 lux at the
//      pillow degrades insulin sensitivity overnight.
//   8. Sunscreen blocking UVB: Holick — chemical sunscreens >SPF8 block
//      the wavelengths required for vit-D synthesis on bare skin.
//   9. Sunglasses outdoors: Lambert / Hattar — eye-mediated α-MSH and the
//      pupillary-light reflex modulate skin/mood/hormone responses.
//  10. Total outdoor time: Stein et al. — <30min/day outdoor correlates
//      with myopia, low vit D, blunted circadian amplitude.
// Each question carries a `why` sub-label rendered below the checkbox so the
// user learns the photobiology rather than just self-reporting. Kept short
// (one clause) — a teaching surface, not a citation block. Detailed
// citations stay in the comment above for auditability.
export const OTT_QUESTIONS = [
  { key: 'morning-light-deficit',    text: 'Do you get less than 5 minutes of outdoor daylight within an hour of waking?',
    why: 'Morning daylight at the eye sets your central body clock — without it, sleep timing drifts.' },
  { key: 'glass-mediated-daytime',   text: 'Do you spend most of your daytime hours behind window glass (office, home, car)?',
    why: 'Window glass blocks UVB almost entirely — no vitamin D, no nitric-oxide release through the skin.' },
  { key: 'dim-workspace',            text: 'Is your daytime workspace below office-bright (under ~500 lux at eye-level)?',
    why: 'Dim daytime light fails to reinforce the wake signal — the contrast with night collapses.' },
  { key: 'cool-led-evening',         text: 'Are most of your indoor lights after sunset cool / daylight-white (4000K+)?',
    why: 'Cool / blue-rich light after sunset suppresses melatonin even at modest indoor intensities.' },
  { key: 'evening-screens',          text: 'Do you regularly use bright screens (phone, laptop, TV) in the 2 hours before bed?',
    why: 'Backlit screen reading before bed delays melatonin onset by ~90 minutes (Chang et al. AJCN 2015).' },
  { key: 'bright-after-sunset',      text: 'Do you keep overhead room lights on at full brightness after sunset?',
    why: 'Overhead light after sunset shifts your circadian phase and shortens deep sleep.' },
  { key: 'sleep-not-dark',           text: 'Is your bedroom not fully dark while you sleep (LED indicators, streetlight, partner\'s screen)?',
    why: 'Even <5 lux at the pillow degrades overnight insulin sensitivity (Cain et al. JCSM 2020).' },
  { key: 'sunscreen-blocks-uvb',     text: 'Do you apply sunscreen on most sun-exposed days, including brief outdoor time?',
    why: 'Chemical sunscreen above ~SPF 8 blocks the UVB wavelengths required for vitamin D synthesis.' },
  { key: 'sunglasses-outside',       text: 'Do you wear sunglasses outdoors more often than not?',
    why: 'Sunglasses block the eye-mediated α-MSH cascade — your skin and mood lose a key signal.' },
  { key: 'low-outdoor-time',         text: 'Is your total outdoor time under 30 minutes on a typical day?',
    why: 'Under 30 min/day outdoors correlates with low vitamin D, myopia, and a blunted circadian amplitude.' },
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

function cancelReopenSunSetup() {
  closeSunSetupOverlay();
  _setupForceOpen = false;
}

// Map an indoor-light burden score (0-10, higher = more indoor) to a
// qualitative label + tier index for color coding. 0 = well-aligned light
// environment, 10 = severe burden across all 10 audit signals.
//
// Function name kept for backward-compat — call sites can still use
// ottScoreToLabel() during the transition; alias `lightBurdenToLabel`
// is the modern name and they share an implementation.
export function ottScoreToLabel(score) {
  if (typeof score !== 'number') return { label: '—', tier: 0 };
  if (score <= 1) return { label: 'well-aligned light environment', tier: 0 };
  if (score <= 3) return { label: 'mostly aligned, minor gaps', tier: 1 };
  if (score <= 5) return { label: 'moderate light burden', tier: 2 };
  if (score <= 7) return { label: 'significant light burden', tier: 3 };
  return { label: 'severe indoor-light burden', tier: 4 };
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

  // Lifestyle chip — keep using the existing tier-colored badge logic
  let ottChip;
  if (typeof d.ottScore === 'number') {
    const { label, tier } = ottScoreToLabel(d.ottScore);
    ottChip = `<div class="light-setup-chip light-setup-chip-ott light-setup-chip-tier-${tier}" title="Indoor-light burden score (0–10): counts modern light-environment gaps — morning light deficit, glass-mediated days, dim workspace, cool LED at night, evening screens, bright after sunset, sleep darkness, sunscreen UVB block, sunglasses outdoors, total outdoor time.">
      <div class="light-setup-chip-icon">☀</div>
      <div class="light-setup-chip-body">
        <div class="light-setup-chip-label">Light burden</div>
        <div class="light-setup-chip-value">${escapeHTML(label)}</div>
        <div class="light-setup-chip-sub">${d.ottScore}/10 burden score</div>
      </div>
    </div>`;
  } else if (d.skipped) {
    ottChip = `<div class="light-setup-chip light-setup-chip-skipped">
      <div class="light-setup-chip-icon">⏭</div>
      <div class="light-setup-chip-body">
        <div class="light-setup-chip-label">Light burden</div>
        <div class="light-setup-chip-value">Skipped</div>
        <div class="light-setup-chip-sub">tap Edit to fill in</div>
      </div>
    </div>`;
  } else {
    ottChip = `<div class="light-setup-chip light-setup-chip-unset">
      <div class="light-setup-chip-icon">·</div>
      <div class="light-setup-chip-body">
        <div class="light-setup-chip-label">Light burden</div>
        <div class="light-setup-chip-value">—</div>
      </div>
    </div>`;
  }

  const psmTier = _psmTierOf(d.photosensitiveMeds);
  const psmCopy = {
    mild:     { mult: '~1.4×', label: 'mild' },
    moderate: { mult: '~2.5×', label: 'moderate' },
    severe:   { mult: '~4×',   label: 'severe' },
  }[psmTier];
  const photoBanner = psmCopy
    ? `<div class="light-setup-photo-banner" title="${escapeAttr(`Burn threshold reduced ${psmCopy.mult} for ${psmCopy.label} photosensitizers. Edit to change tier or clear when no longer applicable.`)}">⚠ ${psmCopy.label.charAt(0).toUpperCase() + psmCopy.label.slice(1)} photosensitizer active — burn alerts trigger ${psmCopy.mult} sooner.</div>`
    : '';
  return `<div class="light-setup-summary">
    <div class="light-setup-summary-head">
      <span class="light-setup-summary-headline">
        <span class="light-setup-summary-tick">✓</span>
        Your light setup
      </span>
      <button class="import-btn import-btn-secondary light-setup-summary-edit" onclick="window.reopenSunSetup && window.reopenSunSetup()">Edit</button>
    </div>
    ${photoBanner}
    <div class="light-setup-chips-grid">
      <div class="light-setup-chip light-setup-chip-skin" title="${escapeAttr('Fitzpatrick ' + fpLabel + ' — drives MED math + UV tolerance.')}">
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
    ${typeof window !== 'undefined' && window.renderOnboardingAIBlock ? window.renderOnboardingAIBlock() : ''}
  </div>`;
}

export function renderSetupCard() {
  return isOnboardingComplete() ? renderSavedSummary() : renderSetupPrompt();
}

function renderSetupPrompt() {
  return `<div class="light-setup-prompt light-widget-prompt">
    <div class="light-widget-prompt-copy">
      <strong>Set up your light assumptions</strong>
      <p>Skin type, home lighting, and eyewear drive burn math and channel estimates.</p>
    </div>
    <div class="light-setup-prompt-actions">
      <button type="button" class="dashboard-action-btn" onclick="window.dismissSunSetup && window.dismissSunSetup()">Later</button>
      <button type="button" class="dashboard-action-btn dashboard-action-btn-primary light-widget-prompt-cta" onclick="window.reopenSunSetup && window.reopenSunSetup()">Set up</button>
    </div>
  </div>`;
}

function getSetupFilledCount() {
  const d = getSunDefaults() || {};
  // Count how many of the 3 core questions are filled. Skin type counts only
  // when actively tapped.
  const skinFilled = !!getInitialFitzpatrick();
  const homeFilled = !!d.homeLight;
  const eyewearFilled = !!d.eyewear;
  return [skinFilled, homeFilled, eyewearFilled].filter(Boolean).length;
}

function renderSetupActions(filledCount = getSetupFilledCount()) {
  return `<div class="light-setup-actions" data-setup-actions="core">
    ${isOnboardingComplete()
      ? `<button class="import-btn import-btn-secondary" onclick="window.cancelReopenSunSetup && window.cancelReopenSunSetup()">Cancel</button>
         <button class="import-btn import-btn-primary light-setup-next-btn" onclick="window.setLightSetupStep && window.setLightSetupStep('score')">Next: Light score</button>`
      : `<button class="import-btn import-btn-tertiary light-setup-skip-btn" onclick="window.dismissSunSetup && window.dismissSunSetup()">I'll do this later</button>
         <button class="import-btn import-btn-primary light-setup-next-btn" onclick="window.setLightSetupStep && window.setLightSetupStep('score')">Next: Light score</button>`}
  </div>
  <div class="light-setup-actions" data-setup-actions="score">
    <button class="import-btn import-btn-secondary" onclick="window.setLightSetupStep && window.setLightSetupStep('core')">Back</button>
    ${isOnboardingComplete()
      ? `<button class="import-btn import-btn-primary light-setup-save-btn" onclick="window.saveSunSetup()">Save changes</button>`
      : `<button class="import-btn import-btn-primary light-setup-save-btn" onclick="window.saveSunSetup()">Save setup</button>`}
  </div>`;
}

function renderSetupChoiceGroup(id, options, selected, className = '') {
  return `<input type="hidden" id="${escapeAttr(id)}" value="${escapeAttr(selected || '')}">
    <div class="light-setup-choice-grid ${className}" role="group">
      ${options.map(o => {
        const active = selected === o.key;
        return `<button type="button" class="light-setup-choice${active ? ' active' : ''}" data-choice-group="${escapeAttr(id)}" data-value="${escapeAttr(o.key)}" aria-pressed="${active ? 'true' : 'false'}" onclick="window._selectSetupChoice && window._selectSetupChoice(this)">
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
    <input class="light-setup-ott-input" type="checkbox" data-ott="${escapeAttr(q.key)}"${checked ? ' checked' : ''} oninput="window._updateOttRunningScore && window._updateOttRunningScore()">
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
  const filledCount = getSetupFilledCount();
  const ottBurden = d.ott ? Object.values(d.ott).filter(v => v).length : 0;

  let html = `<div class="light-setup-card light-setup-card-editor">
    <div class="light-setup-step-tabs" role="tablist" aria-label="Light setup steps">
      <button type="button" class="light-setup-step-tab active" data-setup-tab="core" role="tab" aria-selected="true" onclick="window.setLightSetupStep && window.setLightSetupStep('core')">
        <span class="light-setup-step-tab-index">1</span>
        <span>Core assumptions</span>
      </button>
      <button type="button" class="light-setup-step-tab" data-setup-tab="score" role="tab" aria-selected="false" onclick="window.setLightSetupStep && window.setLightSetupStep('score')">
        <span class="light-setup-step-tab-index">2</span>
        <span>Light score check</span>
      </button>
    </div>

    <section class="light-setup-pane" data-setup-pane="core">
    <div class="light-setup-title" tabindex="-1">Core assumptions
      <span class="light-setup-progress" aria-label="${filledCount} of 3 questions done">${filledCount}/3 done</span>
    </div>
    <p class="light-setup-lead"><strong>Step 1 of 2.</strong> Calibrate the assumptions that drive burn threshold, indoor-light context, and eye-channel estimates. The next step asks the 10 light-score questions.</p>
    ${renderSetupLocationStatus()}

    <div class="light-setup-fields-grid">
    <div class="light-setup-step">
      <label class="ctx-label" id="setup-skin-label-id">Skin type</label>
      <p class="light-setup-step-why">Sets your burn threshold (MED) and how much UV you can take before getting red.</p>
      <div class="ctx-skin-slider-wrap">
        <div class="ctx-skin-emojis" role="radiogroup" aria-labelledby="setup-skin-label-id">${['🧑🏻','🧑🏼','🧑🏽','🧑🏾','🧑🏿','🧑🏿'].map((e, i) => {
          const isActive = getInitialFitzpatrick() === ROMAN[i];
          // tabindex: only the checked radio is in the tab order (roving
          // tabindex pattern); arrow keys move between siblings inside the
          // group. Default to index 2 (median III) when nothing is set.
          const fallbackIdx = getInitialFitzpatrick() ? null : 2;
          const inTabOrder = isActive || (fallbackIdx === i);
          return `<span class="ctx-skin-face${isActive ? ' active' : ''}" data-idx="${i}" data-roman="${ROMAN[i]}" role="radio" tabindex="${inTabOrder ? '0' : '-1'}" aria-checked="${isActive ? 'true' : 'false'}" aria-label="Fitzpatrick ${escapeAttr(SKIN_TYPE[i])}" onclick="document.getElementById('setup-skin-range').value=${i};window._updateSetupSkinSlider && window._updateSetupSkinSlider(${i})" onkeydown="window._skinFaceKeydown && window._skinFaceKeydown(event, ${i})">${e}</span>`;
        }).join('')}</div>
        <input type="range" min="0" max="5" value="${(getInitialFitzpatrick() ? fitzpatrickToSkinTypeIndex(getInitialFitzpatrick()) : 2)}" class="ctx-skin-range" id="setup-skin-range" oninput="window._updateSetupSkinSlider && window._updateSetupSkinSlider(this.value)" data-set="${getInitialFitzpatrick() ? '1' : '0'}" aria-valuetext="${getInitialFitzpatrick() ? escapeAttr(SKIN_TYPE[fitzpatrickToSkinTypeIndex(getInitialFitzpatrick())]) : 'not set — tap a face'}">
        <div class="ctx-skin-label" id="setup-skin-label">${getInitialFitzpatrick() ? `${escapeHTML(SKIN_TYPE[fitzpatrickToSkinTypeIndex(getInitialFitzpatrick())])}<span class="ctx-skin-label-detail" id="setup-skin-label-detail">${escapeHTML(FITZPATRICK_DESCRIPTOR[fitzpatrickToSkinTypeIndex(getInitialFitzpatrick())])}</span>` : 'Tap a face or drag the slider'}</div>
      </div>
    </div>

    <div class="light-setup-step light-setup-photo-row">
      <div class="ctx-label"><strong>Photosensitizing meds / supplements</strong></div>
      ${renderSetupChoiceGroup('setup-photosensitive', PHOTOSENSITIVE_OPTIONS, _psmTierOf(d.photosensitiveMeds), 'light-setup-choice-grid-compact')}
      <p class="light-setup-photo-why">Lowers your sunburn threshold so burn alerts trigger sooner. <a href="https://www.aad.org/public/everyday-care/sun-protection/sunburn/photosensitive-medications" target="_blank" rel="noopener">AAD list →</a></p>
    </div>

    <div class="light-setup-step">
      <div class="ctx-label">Home lighting</div>
      <p class="light-setup-step-why">Shapes your indoor melanopic dose — what the AI sees for the half of your day spent inside.</p>
      ${renderSetupChoiceGroup('setup-homelight', HOME_LIGHT_OPTIONS, d.homeLight, 'light-setup-choice-grid-compact')}
    </div>

    <div class="light-setup-step">
      <div class="ctx-label">Eyewear outside</div>
      <p class="light-setup-step-why">Eye exposure to UV / 360–400 nm violet drives circadian + α-MSH / dopamine signals.</p>
      ${renderSetupChoiceGroup('setup-eyewear', EYEWEAR_OPTIONS, d.eyewear)}
    </div>

    </div>
    </section>

    <section class="light-setup-pane" data-setup-pane="score">
    <section class="light-setup-ott">
      <div class="light-setup-ott-head">
        <div>
          <div class="light-setup-ott-kicker">Light score check</div>
          <h4 tabindex="-1">Flag the light-environment gaps that are true for you</h4>
        </div>
      </div>
      <p class="light-setup-body light-setup-ott-lead"><strong>Step 2 of 2.</strong> Tapped cards count as gaps. Leave a card unselected when the statement is not true for you.</p>
      ${renderOttScoreMeter(d.ott ? ottBurden : ((typeof d.ottScore === 'number') ? d.ottScore : 0))}
      <div class="light-setup-ott-questions">
        ${OTT_QUESTIONS.map((q, i) => renderOttQuestion(q, i, !!(d.ott && d.ott[q.key]))).join('')}
      </div>
    </section>
    </section>

    ${includeActions ? renderSetupActions(filledCount) : ''}
  </div>`;
  return html;
}

function openSunSetupOverlay() {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById(LIGHT_SETUP_OVERLAY_ID);
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = LIGHT_SETUP_OVERLAY_ID;
  overlay.className = 'modal-overlay show light-setup-focus-overlay';
  overlay.innerHTML = `<div class="modal light-setup-focus-modal" data-setup-step="core" role="dialog" aria-modal="true" aria-labelledby="light-setup-focus-title">
    <header class="light-setup-focus-head">
      <div>
        <div class="gb-modal-kicker">Light lens setup</div>
        <h3 id="light-setup-focus-title">Light setup</h3>
        <p>Calibrate burn math, indoor-light context, and circadian assumptions for this profile.</p>
      </div>
      <button type="button" class="modal-close" aria-label="Close light setup" onclick="window.cancelReopenSunSetup && window.cancelReopenSunSetup()">&times;</button>
    </header>
    <div class="light-setup-focus-body" tabindex="-1">
      ${renderSetupEditor({ includeActions: false })}
    </div>
    ${renderSetupActions()}
  </div>`;

  if (window._wireBackdropClose) {
    try { window._wireBackdropClose(overlay, closeSunSetupOverlay); } catch (_) {}
  } else {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSunSetupOverlay();
    });
  }

  document.body.appendChild(overlay);

  const obs = new MutationObserver(() => {
    if (!document.body.contains(overlay)) {
      obs.disconnect();
      _setupForceOpen = false;
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  if (window.trapModalFocus) {
    try { window.trapModalFocus(overlay); } catch (_) {}
  }
  setLightSetupStep('core', { focus: false });
  const focusBody = () => overlay.querySelector('.light-setup-focus-body')?.focus?.({ preventScroll: true });
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
  if (overlay) overlay.remove();
  _setupForceOpen = false;
}

function setLightSetupStep(step, opts = {}) {
  if (typeof document === 'undefined') return;
  const nextStep = step === 'score' ? 'score' : 'core';
  const modal = document.querySelector('.light-setup-focus-modal');
  if (!modal) return;
  modal.dataset.setupStep = nextStep;
  modal.querySelectorAll('[data-setup-tab]').forEach(tab => {
    const active = tab.dataset.setupTab === nextStep;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  modal.querySelectorAll('[data-setup-pane]').forEach(pane => {
    const active = pane.dataset.setupPane === nextStep;
    pane.toggleAttribute('hidden', !active);
  });
  const body = modal.querySelector('.light-setup-focus-body');
  if (body) body.scrollTop = 0;
  if (opts.focus !== false) {
    const target = modal.querySelector(`[data-setup-pane="${nextStep}"] .light-setup-title, [data-setup-pane="${nextStep}"] h4`);
    setTimeout(() => target?.focus?.({ preventScroll: true }), 0);
  }
}

function formatSetupLatitude(lat) {
  const n = Number(lat);
  if (!Number.isFinite(n)) return '';
  const digits = Math.abs(n) >= 10 ? 1 : 2;
  return `${Math.abs(n).toFixed(digits)}°${n < 0 ? 'S' : 'N'}`;
}

function getSetupLocationStatus() {
  const c = (typeof window !== 'undefined' && window.getSunCoords)
    ? window.getSunCoords()
    : null;
  const loc = (typeof window !== 'undefined' && window.getProfileLocation)
    ? window.getProfileLocation()
    : {};
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
    badge: 'optional',
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
      <button type="button" class="import-btn import-btn-secondary" onclick="window.openLightSetupProfileLocation && window.openLightSetupProfileLocation()">Edit profile</button>
      <button type="button" class="import-btn import-btn-secondary" onclick="window.requestLightSetupPreciseLocation && window.requestLightSetupPreciseLocation()">${escapeHTML(status.preciseLabel)}</button>
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
  setTimeout(() => {
    if (window.openProfileLocationEditor) {
      window.openProfileLocationEditor();
    } else if (window.openClientList) {
      window.openClientList();
    }
  }, 0);
}

async function requestLightSetupPreciseLocation() {
  if (!window.requestPreciseLocation) {
    showNotification('Precise location is unavailable here.');
    return null;
  }
  const coords = await window.requestPreciseLocation();
  refreshSetupLocationStatus();
  return coords;
}

// Save handler — wired to button via window
async function saveSunSetup() {
  const root = document.querySelector('.light-setup-card');
  if (!root) return;
  // Skin type comes from the emoji-slider range. The slider defaults to
  // position 2 (median III) but data-set="0" means the user hasn't
  // actively confirmed; they must tap a face or drag.
  const sliderEl = root.querySelector('#setup-skin-range');
  const isSet = sliderEl?.dataset?.set === '1';
  const skinIdx = isSet ? parseInt(sliderEl?.value, 10) : -1;
  const fitzpatrick = (skinIdx >= 0 && skinIdx < 6) ? ROMAN[skinIdx] : null;
  const homeLight = root.querySelector('#setup-homelight')?.value || null;
  const eyewear = root.querySelector('#setup-eyewear')?.value || null;
  if (!fitzpatrick) {
    setLightSetupStep('core');
    showNotification('Tap a face to confirm your skin type.');
    return;
  }
  const ott = {};
  let ottScore = 0;
  for (const q of OTT_QUESTIONS) {
    const cb = root.querySelector(`input[data-ott="${q.key}"]`);
    if (cb) {
      ott[q.key] = !!cb.checked;
      if (cb.checked) ottScore++;
    }
  }
  // photosensitiveMeds started as a boolean checkbox, then briefly used a
  // native select. The current setup uses a hidden input driven by inline
  // choice buttons so the option list stays inside the focused modal.
  const psmEl = root.querySelector('#setup-photosensitive');
  const photosensitiveMeds = (psmEl?.tagName === 'SELECT' || psmEl?.type === 'hidden')
    ? (psmEl.value || 'none')
    : (psmEl?.checked ? 'moderate' : 'none');
  await saveSunDefaults({
    fitzpatrick,
    photosensitiveMeds,
    homeLight,
    eyewear,
    ott,
    ottScore,
    completedAt: Date.now(),
  });
  // Mirror to lightCircadian.skinType so the context card reflects this answer
  // (and vice-versa — getInitialFitzpatrick reads from lightCircadian as a fallback).
  if (!state.importedData.lightCircadian) {
    state.importedData.lightCircadian = { amLight: null, daytime: null, uvExposure: null, skinType: null, evening: [], screenTime: null, techEnv: [], cold: null, grounding: null, mealTiming: [], note: '' };
  }
  state.importedData.lightCircadian.skinType = SKIN_TYPE[skinIdx];
  await saveImportedData();
  closeSunSetupOverlay();
  showNotification(`Setup saved · light burden ${ottScore}/10`);
  if (typeof window !== 'undefined' && window.maybeAnalyzeOnboardingAfterSave) {
    try { window.maybeAnalyzeOnboardingAfterSave(); } catch (_) {}
  }
  if (window.navigate) window.navigate('light');
}

// Recompute the running Ott score whenever a checkbox toggles, and update
// the friendly "Running score: 4/10 · indoor-leaning" indicator beneath
// the question list so users see the score interpretation in real time.
function _updateOttRunningScore() {
  const root = document.querySelector('.light-setup-card');
  if (!root) return;
  const cbs = root.querySelectorAll('input[data-ott]');
  let score = 0;
  cbs.forEach(cb => {
    cb.closest('.light-setup-ott-card')?.classList.toggle('is-flagged', cb.checked);
    if (cb.checked) score++;
  });
  const aligned = 10 - score;
  const valueEl = root.querySelector('#ott-running-value');
  const alignedEl = root.querySelector('#ott-running-aligned');
  const labelEl = root.querySelector('#ott-running-label');
  const summary = root.querySelector('#ott-summary-score');
  const meter = root.querySelector('#ott-running-score');
  const fill = root.querySelector('#ott-score-fill');
  const meta = ottScoreToLabel(score);
  if (valueEl) valueEl.textContent = `${score}/10`;
  if (alignedEl) alignedEl.textContent = `${aligned}/10`;
  if (meter) meter.dataset.tier = String(meta.tier);
  if (fill) fill.style.width = `${aligned * 10}%`;
  if (labelEl) {
    // Tier-change animation — flash the badge briefly when its tier color
    // shifts so the score change feels alive instead of silently swapping.
    const prevTier = labelEl.dataset.tier;
    const newTier = String(meta.tier);
    labelEl.textContent = meta.label;
    labelEl.className = `light-ott-badge light-ott-tier-${meta.tier}`;
    labelEl.dataset.tier = newTier;
    if (prevTier !== undefined && prevTier !== newTier) {
      labelEl.classList.add('tier-changed');
      setTimeout(() => labelEl.classList.remove('tier-changed'), 600);
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

// Recompute the "X/3 done" progress hint from the live DOM state. Called
// from each input's onchange/oninput so the counter advances on click,
// not on Save — pre-fix the user clicked a skin face and got no
// feedback that they'd just made progress.
function _refreshSetupProgress() {
  const card = document.querySelector('.light-setup-card');
  if (!card) return;
  const skinFilled = card.querySelector('#setup-skin-range')?.dataset.set === '1';
  const homeFilled = !!card.querySelector('#setup-homelight')?.value;
  const eyewearFilled = !!card.querySelector('#setup-eyewear')?.value;
  const filled = [skinFilled, homeFilled, eyewearFilled].filter(Boolean).length;
  const progress = card.querySelector('.light-setup-progress');
  if (progress) {
    progress.textContent = `${filled}/3 done`;
    progress.setAttribute('aria-label', `${filled} of 3 questions done`);
  }
  const saveBtn = card.closest('.light-setup-focus-modal')?.querySelector('.light-setup-save-btn')
    || card.querySelector('.light-setup-save-btn');
  if (saveBtn && !isOnboardingComplete()) {
    saveBtn.textContent = 'Save setup';
  }
}

// Skip-for-now — marks the setup as completed without filled answers.
// Card disappears; a session log will start with default Fitzpatrick III.
async function dismissSunSetup() {
  await saveSunDefaults({ fitzpatrick: 'III', skipped: true, completedAt: Date.now() });
  closeSunSetupOverlay();
  if (window.navigate) window.navigate('light');
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    getSunDefaults,
    saveSunDefaults,
    isLightOnboardingComplete: isOnboardingComplete,
    renderSunSetupCard: renderSetupCard,
    saveSunSetup,
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
      const range = document.getElementById('setup-skin-range');
      if (range) range.value = idx;
      _updateSetupSkinSlider(idx);
      return;
  }
  if (next == null) return;
  e.preventDefault();
  const target = document.querySelector(`.ctx-skin-face[data-idx="${next}"]`);
  if (target) target.focus();
}
