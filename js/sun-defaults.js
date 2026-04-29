// sun-defaults.js — Light lens onboarding: 4 setup questions + Ott
// malillumination 10-question pre-test. Persists to importedData.sunDefaults.
//
// These are the user's baseline — Fitzpatrick skin type for MED scaling,
// indoor light environment for the deficit-axis derivation, eyewear pattern
// for eye-channel gating, and a malillumination score that frames their
// starting point for the AI.

import { state } from './state.js';
import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import { saveImportedData } from './data.js';
import { SKIN_TYPE } from './constants.js';

// Map between Fitzpatrick Roman numeral and the SKIN_TYPE label used by the
// Light & Circadian context card so both surfaces stay in sync.
//   sunDefaults.fitzpatrick : 'I' | 'II' | ... | 'VI'      (used by sun-spectrum)
//   lightCircadian.skinType : 'I — very fair' | ...         (used by context card)
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

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

export const HOME_LIGHT_OPTIONS = [
  { key: 'led-cool',     label: 'Mostly LED — cool/daylight (4000K+)' },
  { key: 'led-warm',     label: 'Mostly LED — warm white (2700–3000K)' },
  { key: 'led-tunable',  label: 'LED — tunable / colour-changing' },
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

// ─── Ott malillumination pre-test ─────────────────────────────────────
// 10 yes/no questions. Each "yes" adds 1 to the score (0–10 scale).
// Higher = more malilluminated. Frames the user's baseline for the AI.

export const OTT_QUESTIONS = [
  { key: 'desk_job',       text: 'Do you work indoors at a desk most weekdays?' },
  { key: 'urban',          text: 'Do you live in a city / suburb (not rural / not high-altitude)?' },
  { key: 'commute_car',    text: 'Do you commute mostly by car or other glass-enclosed transport?' },
  { key: 'sunglasses_freq', text: 'Do you wear sunglasses outdoors more often than not?' },
  { key: 'sunscreen_freq', text: 'Do you apply sunscreen on most sun-exposed days?' },
  { key: 'glass_only',     text: 'Do you spend most "outdoor" time behind windows (sunroom, office glass)?' },
  { key: 'led_only_home',  text: 'Are most lights in your home LED or fluorescent (not incandescent / candle)?' },
  { key: 'screens_evening', text: 'Do you use bright screens (phone, TV) in the 2 hours before bed?' },
  { key: 'curtains_open_dawn', text: 'Are your bedroom curtains usually CLOSED when you wake up?' },
  { key: 'no_morning_outdoor', text: 'Do you typically NOT get any outdoor light in the first 2 hours after waking?' },
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

// ─── UI: setup card (4 questions + Ott pre-test) ──────────────────────

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

// Compact summary of saved answers, with an Edit button. Renders in place
// of the editor once the user has completed onboarding.
function renderSavedSummary() {
  const d = getSunDefaults() || {};
  const lcSkin = state.importedData?.lightCircadian?.skinType;
  const fp = d.fitzpatrick || skinTypeToFitzpatrick(lcSkin);
  const fpLabel = fp ? SKIN_TYPE[fitzpatrickToSkinTypeIndex(fp)] : '—';
  const homeMeta = HOME_LIGHT_OPTIONS.find(o => o.key === d.homeLight);
  const eyewearMeta = EYEWEAR_OPTIONS.find(o => o.key === d.eyewear);
  const ott = (typeof d.ottScore === 'number') ? `${d.ottScore}/10` : (d.skipped ? 'skipped' : '—');

  return `<div class="light-setup-summary">
    <div class="light-setup-summary-head">
      <strong>Light setup saved</strong>
      <button class="import-btn import-btn-secondary light-setup-summary-edit" onclick="window.reopenSunSetup && window.reopenSunSetup()">Edit setup</button>
    </div>
    <div class="light-setup-summary-grid">
      <div class="light-setup-summary-row"><span class="light-setup-summary-label">Skin type</span><span>${escapeHTML(fpLabel)}</span></div>
      <div class="light-setup-summary-row"><span class="light-setup-summary-label">Home lighting</span><span>${escapeHTML(homeMeta?.label || (d.homeLight ? d.homeLight : '—'))}</span></div>
      <div class="light-setup-summary-row"><span class="light-setup-summary-label">Eyewear outside</span><span>${escapeHTML(eyewearMeta?.label || (d.eyewear ? d.eyewear : '—'))}</span></div>
      <div class="light-setup-summary-row"><span class="light-setup-summary-label">Ott baseline</span><span>${escapeHTML(ott)}</span></div>
    </div>
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

  let html = `<div class="light-setup-card">
    <div class="light-setup-title">Set up the Light lens
      <a href="#" class="light-setup-skip" onclick="event.preventDefault();window.dismissSunSetup && window.dismissSunSetup()">skip for now</a>
    </div>
    <p class="light-setup-body">Four questions plus an optional 10-question baseline. Answers stay on this device and feed your AI's reasoning.</p>

    <div class="light-setup-step">
      <label class="ctx-label">Skin type</label>
      <div class="ctx-skin-slider-wrap">
        <div class="ctx-skin-emojis">${['🧑🏻','🧑🏼','🧑🏽','🧑🏾','🧑🏿','🧑🏿'].map((e, i) => `<span class="ctx-skin-face${(getInitialFitzpatrick() === ROMAN[i]) ? ' active' : ''}" data-idx="${i}" onclick="document.getElementById('setup-skin-range').value=${i};window._updateSetupSkinSlider && window._updateSetupSkinSlider(${i})">${e}</span>`).join('')}</div>
        <input type="range" min="0" max="5" value="${(getInitialFitzpatrick() ? fitzpatrickToSkinTypeIndex(getInitialFitzpatrick()) : 2)}" class="ctx-skin-range" id="setup-skin-range" oninput="window._updateSetupSkinSlider && window._updateSetupSkinSlider(this.value)" data-set="${getInitialFitzpatrick() ? '1' : '0'}">
        <div class="ctx-skin-label" id="setup-skin-label">${getInitialFitzpatrick() ? escapeHTML(SKIN_TYPE[fitzpatrickToSkinTypeIndex(getInitialFitzpatrick())]) : 'Tap a face or drag the slider'}</div>
      </div>
    </div>

    <div class="light-setup-step">
      <label class="ctx-label">Home lighting
        <select id="setup-homelight" class="ctx-select">
          <option value="">Pick one</option>
          ${HOME_LIGHT_OPTIONS.map(o => `<option value="${escapeAttr(o.key)}"${d.homeLight === o.key ? ' selected' : ''}>${escapeHTML(o.label)}</option>`).join('')}
        </select>
      </label>
    </div>

    <div class="light-setup-step">
      <label class="ctx-label">Eyewear outside
        <select id="setup-eyewear" class="ctx-select">
          <option value="">Pick one</option>
          ${EYEWEAR_OPTIONS.map(o => `<option value="${escapeAttr(o.key)}"${d.eyewear === o.key ? ' selected' : ''}>${escapeHTML(o.label)}</option>`).join('')}
        </select>
      </label>
    </div>

    <div class="light-setup-step">
      <label class="ctx-label">Location precision
        <span class="setup-hint-inline">${getSunCoordsLine()}</span>
      </label>
      <button class="import-btn import-btn-secondary" onclick="window.requestPreciseLocation && window.requestPreciseLocation().then(()=>window.navigate('light'))">Use precise location (one-time)</button>
    </div>

    <details class="light-setup-ott">
      <summary>Optional: 10-question baseline check (Ott malillumination)</summary>
      <p class="light-setup-body" style="margin:8px 0">Coined by John Ott in 1973 — it asks how indoor / glass-mediated / artificial-light-dominated your modern life is. Used as a starting reference, not a diagnosis.</p>
      <div class="light-setup-ott-questions">
        ${OTT_QUESTIONS.map(q => `<label class="light-setup-ott-q"><input type="checkbox" data-ott="${escapeAttr(q.key)}"${(d.ott && d.ott[q.key]) ? ' checked' : ''}> ${escapeHTML(q.text)}</label>`).join('')}
      </div>
    </details>

    <div class="modal-actions" style="margin-top:14px">
      <button class="import-btn import-btn-primary" onclick="window.saveSunSetup()">${isOnboardingComplete() ? 'Save changes' : 'Save and start tracking'}</button>
      ${isOnboardingComplete() ? '<button class="import-btn import-btn-secondary" onclick="window.cancelReopenSunSetup && window.cancelReopenSunSetup()">Cancel</button>' : ''}
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
    showNotification('Pick a skin type to continue.');
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
  await saveSunDefaults({
    fitzpatrick,
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
  showNotification(`Setup saved · Ott score ${ottScore}/10`);
  if (window.navigate) window.navigate('light');
}

// Live update of the setup-card emoji slider (mirrors updateSkinSlider in
// context-cards.js but bound to setup-* DOM ids so the two widgets don't
// collide if both are visible at once). Marks data-set so save knows the
// user has actively confirmed a value (vs the visual default of position 2).
function _updateSetupSkinSlider(val) {
  const idx = parseInt(val, 10);
  document.querySelectorAll('.light-setup-card .ctx-skin-face').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
  });
  const label = document.getElementById('setup-skin-label');
  if (label) label.textContent = idx >= 0 && idx < SKIN_TYPE.length ? SKIN_TYPE[idx] : 'Tap a face or drag the slider';
  const range = document.getElementById('setup-skin-range');
  if (range) range.dataset.set = '1';
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
    _updateSetupSkinSlider,
    _skinTypeToFitzpatrick: skinTypeToFitzpatrick,
  });
}
