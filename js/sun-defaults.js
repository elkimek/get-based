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

export function renderSetupCard() {
  if (isOnboardingComplete()) return '';
  const d = getSunDefaults() || {};

  let html = `<div class="light-setup-card">
    <div class="light-setup-title">Set up the Light lens
      <a href="#" class="light-setup-skip" onclick="event.preventDefault();window.dismissSunSetup && window.dismissSunSetup()">skip for now</a>
    </div>
    <p class="light-setup-body">Four questions plus an optional 10-question baseline. Answers stay on this device and feed your AI's reasoning.</p>

    <div class="light-setup-step">
      <label class="ctx-label">Skin type
        <select id="setup-fitzpatrick" class="ctx-select">
          <option value="">Pick one</option>
          ${FITZPATRICK_OPTIONS.map(o => `<option value="${escapeAttr(o.key)}"${d.fitzpatrick === o.key ? ' selected' : ''}>${escapeHTML(o.label)}</option>`).join('')}
        </select>
      </label>
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
      <button class="import-btn import-btn-primary" onclick="window.saveSunSetup()">Save and start tracking</button>
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
  const fitzpatrick = root.querySelector('#setup-fitzpatrick')?.value || null;
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
  showNotification(`Setup saved · Ott score ${ottScore}/10`);
  if (window.navigate) window.navigate('light');
}

// Skip-for-now — marks the setup as completed without filled answers.
// Card disappears; a session log will start with default Fitzpatrick III.
async function dismissSunSetup() {
  await saveSunDefaults({ fitzpatrick: 'III', skipped: true, completedAt: Date.now() });
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
  });
}
