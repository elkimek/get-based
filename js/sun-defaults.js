// sun-defaults.js — Light lens onboarding: 4 setup questions + a 10-item
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

// ─── UI: setup card (4 questions + indoor-light burden audit) ────────

// Session-level flag — when set, the editor renders even if onboarding
// was already completed. Cleared after a save / dismiss / cancel so the
// summary card returns to view.
let _setupForceOpen = false;

function reopenSunSetup() {
  _setupForceOpen = true;
  if (window.navigate) window.navigate('light');
}

function cancelReopenSunSetup() {
  _setupForceOpen = false;
  if (window.navigate) window.navigate('light');
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
  // Three render modes:
  //   - editor (onboarding incomplete OR user reopened via "Edit setup")
  //   - summary (onboarding complete and not reopened)
  if (isOnboardingComplete() && !_setupForceOpen) {
    return renderSavedSummary();
  }
  const d = getSunDefaults() || {};

  // Count how many of the 4 core questions are filled — drives the "3 of 4
  // done" progress hint (#9). Skin type counts only when actively tapped.
  const skinFilled = !!getInitialFitzpatrick();
  const homeFilled = !!d.homeLight;
  const eyewearFilled = !!d.eyewear;
  const locFilled = !!(d.coords?.lat && d.coords?.lon) || !!(window.getSunCoords && window.getSunCoords()?.source === 'country-band');
  const filledCount = [skinFilled, homeFilled, eyewearFilled, locFilled].filter(Boolean).length;

  let html = `<div class="light-setup-card">
    <div class="light-setup-title">Light setup
      <span class="light-setup-progress" aria-label="${filledCount} of 4 questions done">${filledCount}/4 done</span>
    </div>
    <p class="light-setup-lead"><strong>30 seconds.</strong> Once you've answered, the AI knows your burn threshold, your indoor light environment, and your circadian baseline — and can interpret your sun sessions and labs through that lens. Answers stay on this device.</p>

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
      <label for="setup-photosensitive" class="ctx-label"><strong>Photosensitizing meds / supplements</strong></label>
      <select id="setup-photosensitive" class="ctx-select">
        <option value="none"${_psmTierOf(d.photosensitiveMeds) === 'none' ? ' selected' : ''}>None — no photosensitizers</option>
        <option value="mild"${_psmTierOf(d.photosensitiveMeds) === 'mild' ? ' selected' : ''}>Mild — antihistamines, light NSAIDs (×0.7 burn threshold)</option>
        <option value="moderate"${_psmTierOf(d.photosensitiveMeds) === 'moderate' ? ' selected' : ''}>Moderate — NSAIDs, thiazides, sulfa, St. John's Wort, topical retinol (×0.4)</option>
        <option value="severe"${_psmTierOf(d.photosensitiveMeds) === 'severe' ? ' selected' : ''}>Severe — tetracyclines, oral retinoids, amiodarone, citrus oils on skin (×0.25)</option>
      </select>
      <p class="light-setup-photo-why">Lowers your sunburn threshold so burn alerts trigger sooner. <a href="https://www.aad.org/public/everyday-care/sun-protection/sunburn/photosensitive-medications" target="_blank" rel="noopener">AAD list →</a></p>
    </div>

    <div class="light-setup-step">
      <label class="ctx-label">Home lighting</label>
      <p class="light-setup-step-why">Shapes your indoor melanopic dose — what the AI sees for the half of your day spent inside.</p>
      <select id="setup-homelight" class="ctx-select" onchange="window._refreshSetupProgress && window._refreshSetupProgress()">
        <option value="">Choose what's mostly true at home</option>
        ${HOME_LIGHT_OPTIONS.map(o => `<option value="${escapeAttr(o.key)}"${d.homeLight === o.key ? ' selected' : ''}>${escapeHTML(o.label)}</option>`).join('')}
      </select>
    </div>

    <div class="light-setup-step">
      <label class="ctx-label">Eyewear outside</label>
      <p class="light-setup-step-why">Eye exposure to UV / 360–400 nm violet drives circadian + α-MSH / dopamine signals.</p>
      <select id="setup-eyewear" class="ctx-select" onchange="window._refreshSetupProgress && window._refreshSetupProgress()">
        <option value="">Choose what you wear most often outside</option>
        ${EYEWEAR_OPTIONS.map(o => `<option value="${escapeAttr(o.key)}"${d.eyewear === o.key ? ' selected' : ''}>${escapeHTML(o.label)}</option>`).join('')}
      </select>
    </div>

    <div class="light-setup-step">
      <label class="ctx-label">Location</label>
      <p class="light-setup-step-why">Drives sun-angle and UV-index math. Country-level is fine; precise lat/lon sharpens it.</p>
      <div class="light-setup-loc-row">
        <span class="setup-hint-inline">${getSunCoordsLine()}</span>
        <button class="import-btn import-btn-secondary" onclick="window.requestPreciseLocation && window.requestPreciseLocation().then(()=>window.navigate('light'))">Pinpoint location for sharper UV math</button>
      </div>
    </div>

    <details class="light-setup-ott"${(d.ott && Object.values(d.ott).some(v => v)) ? ' open' : ''}>
      <summary>Tune your light score (optional, ~1 min) <span class="light-setup-ott-summary-score" id="ott-summary-score">${(typeof d.ottScore === 'number') ? `· ${10 - d.ottScore}/10 aligned · ${ottScoreToLabel(d.ottScore).label}` : ''}</span></summary>
      <p class="light-setup-body" style="margin:8px 0">10 yes/no questions, each grounded in current photobiology. <strong>"Yes" always = a gap</strong> — morning light skipped, glass-mediated days, dark sleep missed, etc. Higher alignment score = better-aligned circadian + UV environment.</p>
      <div class="light-setup-ott-questions">
        ${OTT_QUESTIONS.map(q => `<label class="light-setup-ott-q"><input type="checkbox" data-ott="${escapeAttr(q.key)}"${(d.ott && d.ott[q.key]) ? ' checked' : ''} oninput="window._updateOttRunningScore && window._updateOttRunningScore()"><span class="light-setup-ott-q-body"><span class="light-setup-ott-q-text">${escapeHTML(q.text)}</span>${q.why ? `<span class="light-setup-ott-q-why">${escapeHTML(q.why)}</span>` : ''}</span></label>`).join('')}
      </div>
      <div class="light-setup-ott-running" id="ott-running-score">
        <span class="light-setup-ott-running-pos">Alignment: <strong id="ott-running-aligned">${10 - (d.ott ? Object.values(d.ott).filter(v => v).length : 0)}/10</strong></span>
        <span class="light-setup-ott-running-sep">·</span>
        <span class="light-setup-ott-running-neg">Burden: <strong id="ott-running-value">${(d.ott ? Object.values(d.ott).filter(v => v).length : 0)}/10</strong></span>
        <span class="light-ott-badge light-ott-tier-${ottScoreToLabel(d.ott ? Object.values(d.ott).filter(v => v).length : 0).tier}" id="ott-running-label">${ottScoreToLabel(d.ott ? Object.values(d.ott).filter(v => v).length : 0).label}</span>
      </div>
    </details>

    <div class="light-setup-actions">
      ${isOnboardingComplete()
        ? `<button class="import-btn import-btn-secondary" onclick="window.cancelReopenSunSetup && window.cancelReopenSunSetup()">Cancel</button>
           <button class="import-btn import-btn-primary" onclick="window.saveSunSetup()">Save changes</button>`
        : `<button class="import-btn import-btn-tertiary light-setup-skip-btn" onclick="window.dismissSunSetup && window.dismissSunSetup()">I'll do this later</button>
           <button class="import-btn import-btn-primary" onclick="window.saveSunSetup()">Save setup · ${filledCount}/4 done</button>`}
    </div>
  </div>`;
  return html;
}

function getSunCoordsLine() {
  const c = window.getSunCoords && window.getSunCoords();
  if (!c) return 'no location yet — set your country in profile, or share precise location';
  if (c.source === 'profile-precise') return 'precise location saved (highest accuracy)';
  if (c.source === 'country-band') return `country-level estimate (~${c.lat}° latitude)`;
  return 'unknown';
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
  // photosensitiveMeds was a boolean checkbox; now a tier-based select.
  // Read .value (string) and fall back to legacy boolean parsing for any
  // mid-rollout state that still has a checkbox node (cached templates).
  const psmEl = root.querySelector('#setup-photosensitive');
  const photosensitiveMeds = psmEl?.tagName === 'SELECT'
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
  _setupForceOpen = false;
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
  cbs.forEach(cb => { if (cb.checked) score++; });
  const aligned = 10 - score;
  const valueEl = root.querySelector('#ott-running-value');
  const alignedEl = root.querySelector('#ott-running-aligned');
  const labelEl = root.querySelector('#ott-running-label');
  const summary = root.querySelector('#ott-summary-score');
  const meta = ottScoreToLabel(score);
  if (valueEl) valueEl.textContent = `${score}/10`;
  if (alignedEl) alignedEl.textContent = `${aligned}/10`;
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
  if (summary) summary.textContent = `· ${aligned}/10 aligned · ${meta.label}`;
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

// Recompute the "X/4 done" progress hint from the live DOM state. Called
// from each input's onchange/oninput so the counter advances on click,
// not on Save — pre-fix the user clicked a skin face and got no
// feedback that they'd just made progress.
function _refreshSetupProgress() {
  const card = document.querySelector('.light-setup-card');
  if (!card) return;
  const skinFilled = card.querySelector('#setup-skin-range')?.dataset.set === '1';
  const homeFilled = !!card.querySelector('#setup-homelight')?.value;
  const eyewearFilled = !!card.querySelector('#setup-eyewear')?.value;
  // Location: best-effort read; getSunCoords may return a country-band fallback
  // that counts toward "filled" the same way the initial render does.
  let locFilled = false;
  try {
    const d = getSunDefaults() || {};
    locFilled = !!(d.coords?.lat && d.coords?.lon)
      || !!(window.getSunCoords && window.getSunCoords()?.source === 'country-band');
  } catch (_) {}
  const filled = [skinFilled, homeFilled, eyewearFilled, locFilled].filter(Boolean).length;
  const progress = card.querySelector('.light-setup-progress');
  if (progress) {
    progress.textContent = `${filled}/4 done`;
    progress.setAttribute('aria-label', `${filled} of 4 questions done`);
  }
}

// Skip-for-now — marks the setup as completed without filled answers.
// Card disappears; a session log will start with default Fitzpatrick III.
async function dismissSunSetup() {
  await saveSunDefaults({ fitzpatrick: 'III', skipped: true, completedAt: Date.now() });
  _setupForceOpen = false;
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
    ottScoreToLabel,
    _sunHomeLightOptions: HOME_LIGHT_OPTIONS,
    _sunEyewearOptions: EYEWEAR_OPTIONS,
    _updateSetupSkinSlider,
    _refreshSetupProgress,
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
