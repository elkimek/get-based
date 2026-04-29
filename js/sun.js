// sun.js — Sun Sessions: episodic outdoor light exposure logging.
// Layer between sun-uvdata.js (atmosphere fetch), sun-spectrum.js (dose
// computation), and the dashboard / dedicated Light & Sun page.
//
// Session entry flows:
//   quickLogSunSession()       — 1-tap "going outside now" + "save when done"
//   openSunSessionDialog(opts) — standard log with body/eye/glass/sunscreen
//
// All sessions persist to importedData.sunSessions[]. Schema initialised
// in profile.js migrateProfileData().

import { state } from './state.js';
import { escapeHTML, escapeAttr, formatDate, showNotification } from './utils.js';
import { saveImportedData } from './data.js';
import { getProfileLocation } from './profile.js';
import { COUNTRY_LATITUDES } from './constants.js';

// ─── Anatomical regions (for body silhouette picker) ───────────────────
// 11 regions per the design — each carries optional research notes for AI.
export const BODY_REGIONS = [
  { key: 'face',           label: 'Face',              fraction: 0.04 },
  { key: 'arms',           label: 'Arms',              fraction: 0.10 },
  { key: 'torso-front',    label: 'Torso (front)',     fraction: 0.13 },
  { key: 'torso-back',     label: 'Torso (back)',      fraction: 0.13 },
  { key: 'legs',           label: 'Legs',              fraction: 0.30 },
  { key: 'genitals',       label: 'Genitals',          fraction: 0.01 },
  { key: 'glutes',         label: 'Glutes',            fraction: 0.05 },
  { key: 'breast-chest',   label: 'Breast / chest',    fraction: 0.06 },
  { key: 'thyroid-throat', label: 'Thyroid / throat',  fraction: 0.01 },
  { key: 'abdomen',        label: 'Abdomen',           fraction: 0.07 },
  { key: 'soles-of-feet',  label: 'Soles of feet',     fraction: 0.02 },
];

// Standard quick-presets for the speed log
export const EXPOSURE_PRESETS = [
  { key: 'face_hands', label: 'Face + hands',         fraction: 0.05 },
  { key: 'tshirt',     label: 'T-shirt + shorts',     fraction: 0.30 },
  { key: 'swimwear',   label: 'Swimwear',             fraction: 0.65 },
  { key: 'sunbathing', label: 'Sunbathing',           fraction: 0.90 },
];

export const EYE_MODES = [
  { key: 'direct',         label: 'Direct (no glasses)' },
  { key: 'sunglasses',     label: 'Sunglasses' },
  { key: 'clear-glasses',  label: 'Clear glasses' },
  { key: 'closed-eyes',    label: 'Closed eyes' },
  { key: 'glass-window',   label: 'Through window glass' },
  { key: 'indoor',         label: 'Not eye-exposed' },
];

export const LENS_TINTS = [
  { key: 'clear',         label: 'Clear (no tint)' },
  { key: 'polarized',     label: 'Polarized' },
  { key: 'photochromic',  label: 'Photochromic' },
  { key: 'blue-blocker',  label: 'Blue blocker' },
  { key: 'amber',         label: 'Amber / red' },
];

// ─── Channel display metadata ─────────────────────────────────────────
// Daily targets are deliberately rough — they represent "a meaningful
// healthy dose for one day" derived from typical noon-zenith integrals.
// We use them only to map raw doses → qualitative tiers for display.
// AI context still ships raw numbers; users never see them.
export const CHANNEL_DISPLAY = {
  vitamin_d:  { icon: '☀',  label: 'Vitamin D',          dailyTarget:    300, what: 'UVB on bare skin makes vitamin D. Stops increasing around the point your skin starts to redden — longer is not better.' },
  pomc:       { icon: '⚡',  label: 'Mood & hormones',    dailyTarget:    800, what: 'Sun on skin triggers a hormone cascade — α-MSH (the tan signal), β-endorphin (mood), ACTH (stress response). Part of why sun feels good.' },
  no_cv:      { icon: '❤',  label: 'Cardiovascular',     dailyTarget:    100, what: 'UVA from skin releases nitric oxide — supports blood-vessel function, lowers blood pressure, improves circulation, dampens inflammation.' },
  violet_eye: { icon: '👁',  label: 'Outdoor eye light',  dailyTarget:   6000, what: 'Outdoor 360–400 nm hits sensors in eye and skin. Linked to eye health and dopamine release — the difference between "outside" and "window light" even when both feel bright.' },
  circadian:  { icon: '🌅', label: 'Body clock',         dailyTarget:  20000, what: 'Bright light at the eye sets your circadian rhythm — earlier bedtime, faster wake-up, deeper sleep. Strongest effect in the first 2 hours after sunrise.' },
  nir_solar:  { icon: '🔥', label: 'Cellular repair',    dailyTarget: 100000, what: 'Solar 600–1400 nm penetrates deep into tissue and reaches mitochondria. Supports recovery, raises local melatonin in cells, reduces inflammation. The half of sunlight that windows block.' },
  pbm_red:    { icon: '🔴', label: 'Red light therapy',  dailyTarget:   8000, what: 'Narrowband red light (660 nm) from a therapy panel. Same target as solar red but more concentrated and indoor.' },
  pbm_nir:    { icon: '🟣', label: 'Near-IR therapy',    dailyTarget:  10000, what: 'Narrowband near-infrared (810/850 nm) from a therapy panel. Reaches deeper tissue than visible red.' },
};

// Map a raw dose value → qualitative tier 0-4 with plain-English labels.
// 0 = none, 1 = low, 2 = moderate, 3 = good, 4 = strong.
// (Saturation flagged separately in AI context — most users don't need it.)
export function channelTier(value, channelKey) {
  const target = CHANNEL_DISPLAY[channelKey]?.dailyTarget ?? 1000;
  if (!Number.isFinite(value) || value <= 0) return 0;
  const ratio = value / target;
  if (ratio < 0.20) return 1;   // low
  if (ratio < 0.55) return 2;   // moderate
  if (ratio < 1.00) return 3;   // good
  return 4;                     // strong
}

const TIER_LABELS = ['none', 'low', 'moderate', 'good', 'strong'];
const TIER_DOTS = ['○○○○', '●○○○', '●●○○', '●●●○', '●●●●'];

export function tierLabel(tier) { return TIER_LABELS[tier] || 'none'; }
export function tierDots(tier) { return TIER_DOTS[tier] || TIER_DOTS[0]; }

// ─── Public API ────────────────────────────────────────────────────────

export function getSessions() {
  if (!state.importedData) return [];
  if (!Array.isArray(state.importedData.sunSessions)) state.importedData.sunSessions = [];
  return state.importedData.sunSessions;
}

export function getActiveSession() {
  return getSessions().find(s => !s.endedAt) || null;
}

// Start a session — minimal entry with sensible defaults. Returns id.
export async function startSession({ exposurePreset = 'face_hands', eyeMode = 'direct', lensTint = 'clear', glassBetween = false, location } = {}) {
  const preset = EXPOSURE_PRESETS.find(p => p.key === exposurePreset) || EXPOSURE_PRESETS[0];
  const id = `sun_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const session = {
    id,
    startedAt: Date.now(),
    endedAt: null,
    location: location || null,
    bodyExposure: { preset: preset.key, fraction: preset.fraction, regions: [], sunscreenSPF: null, glassBetween },
    eyeExposure: { mode: eyeMode, lensTint, durationSec: null }, // durationSec assigned at stop
    atmosphere: null, // populated at stop or fetched async
    doses: null,
    safety: null,
  };
  getSessions().push(session);
  await saveImportedData();
  return id;
}

// Stop an in-progress session and (optionally) compute doses.
export async function stopSession(id) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess) return null;
  sess.endedAt = Date.now();
  const durationMin = Math.max(0, (sess.endedAt - sess.startedAt) / 60000);
  sess.durationMin = durationMin;
  if (sess.eyeExposure && sess.eyeExposure.durationSec == null) {
    sess.eyeExposure.durationSec = Math.round(durationMin * 60);
  }
  await saveImportedData();
  return sess;
}

// Log a completed session in one shot (after-the-fact entry).
export async function logCompletedSession(payload) {
  const id = `sun_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const session = Object.assign({
    id,
    startedAt: payload.startedAt || Date.now(),
    endedAt: payload.endedAt || Date.now(),
    location: payload.location || null,
    bodyExposure: payload.bodyExposure || { preset: 'face_hands', fraction: 0.05, regions: [], sunscreenSPF: null, glassBetween: false },
    eyeExposure: payload.eyeExposure || { mode: 'indoor', lensTint: 'clear', durationSec: 0 },
    atmosphere: payload.atmosphere || null,
    doses: payload.doses || null,
    safety: payload.safety || null,
    notes: payload.notes || '',
  }, payload);
  if (!session.durationMin) session.durationMin = Math.max(0, (session.endedAt - session.startedAt) / 60000);
  getSessions().push(session);
  await saveImportedData();
  return id;
}

export async function deleteSession(id) {
  const sessions = getSessions();
  const idx = sessions.findIndex(s => s.id === id);
  if (idx < 0) return false;
  sessions.splice(idx, 1);
  await saveImportedData();
  return true;
}

// Hydrate a session record with computed atmosphere + channel doses.
// Idempotent — reruns after edits.
export async function hydrateSession(id, { lat, lon } = {}) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess || !sess.endedAt) return null;
  // Lazy-load engine modules — they are loaded by main.js at boot, so
  // window.* references will resolve. Kept dynamic to avoid hard import
  // in modules that may run before main.js wires window.
  const fetchAtmosphere = window.fetchAtmosphere;
  const reconstructSpectrum = window.reconstructSpectrum;
  const computeChannelDoses = window.computeChannelDoses;
  const erythemalSED = window.erythemalSED;
  const fractionOfMED = window.fractionOfMED;
  const retinalUVdose = window.retinalUVdose;
  const solarZenithAngle = window.solarZenithAngle;
  if (!fetchAtmosphere || !reconstructSpectrum) return null;
  const useLat = lat ?? sess.location?.lat;
  const useLon = lon ?? sess.location?.lon;
  if (useLat == null || useLon == null) return null;
  const midpoint = new Date((sess.startedAt + sess.endedAt) / 2).toISOString();
  const altitudeM = sess.location?.altitudeM ?? 0;
  try {
    const atm = await fetchAtmosphere({ lat: useLat, lon: useLon, isoTime: midpoint });
    sess.atmosphere = atm;
    const zenith = solarZenithAngle(new Date(midpoint), useLat, useLon);
    const spectrum = reconstructSpectrum({
      zenithDeg: zenith,
      ozoneDU: atm.ozoneDU ?? 300,
      altitudeM,
      cloudCover: (atm.cloudCover ?? 0) / 100,
    });
    sess.doses = computeChannelDoses({
      spectrum,
      durationMin: sess.durationMin,
      bodyExposureFraction: sess.bodyExposure?.fraction ?? 0,
      eyeExposure: sess.eyeExposure,
    });
    const sed = erythemalSED({
      spectrum,
      durationMin: sess.durationMin,
      bodyExposureFraction: sess.bodyExposure?.fraction ?? 0,
    });
    const fitzpatrick = state.profile?.fitzpatrick || state.importedData?.sunDefaults?.fitzpatrick || 'III';
    sess.safety = {
      sed,
      medFraction: fractionOfMED({ sed, fitzpatrick }),
      retinalUV: retinalUVdose({ spectrum, eyeExposure: sess.eyeExposure }),
      fitzpatrick,
    };
    await saveImportedData();
    return sess;
  } catch (e) {
    if (window.console && console.warn) console.warn('hydrateSession failed', e);
    return null;
  }
}

// ─── Lifelight aggregates ──────────────────────────────────────────────

// Rolling N-day per-channel totals — used by the dashboard strip and AI context.
export function rollingChannelTotals(days = 7) {
  const now = Date.now();
  const cutoff = now - days * 86400 * 1000;
  const totals = {};
  for (const sess of getSessions()) {
    if (!sess.doses) continue;
    if (sess.endedAt && sess.endedAt < cutoff) continue;
    for (const [k, v] of Object.entries(sess.doses)) {
      totals[k] = (totals[k] || 0) + (Number.isFinite(v) ? v : 0);
    }
  }
  return totals;
}

// Cumulative MED today (for the safety gauge and pre-session warnings)
export function cumulativeMEDToday() {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  let total = 0;
  for (const sess of getSessions()) {
    if (!sess.safety || !sess.endedAt) continue;
    if (sess.endedAt < dayStart) continue;
    total += sess.safety.medFraction || 0;
  }
  return total;
}

// ─── UI: Quick log ─────────────────────────────────────────────────────

// Single-tap "I'm outside now" — starts a session with last-used defaults.
// On stop: skips confirm dialog (user explicitly tapped stop). Notification
// includes duration + the channel that benefited most for instant feedback.
export async function quickLogSunSession() {
  const active = getActiveSession();
  if (active) {
    await stopSession(active.id);
    await _hydrateFromProfileCoords(active.id);
    const sess = getSessions().find(s => s.id === active.id);
    const dur = Math.round(sess?.durationMin || 0);
    const top = _topChannel(sess);
    showNotification(top
      ? `Session saved — ${dur} min · best contribution: ${top.label} (${top.tier})`
      : `Session saved — ${dur} min`);
    _refreshSurfaces();
    return;
  }
  const last = getSessions().filter(s => s.endedAt).slice(-1)[0];
  const defaults = last ? {
    exposurePreset: last.bodyExposure?.preset || 'face_hands',
    eyeMode: last.eyeExposure?.mode || 'direct',
    lensTint: last.eyeExposure?.lensTint || 'clear',
    glassBetween: last.bodyExposure?.glassBetween || false,
  } : {};
  const id = await startSession(defaults);
  showNotification('Outdoor session started · tap the dashboard tile to stop');
  _refreshSurfaces();
  return id;
}

// Identify the strongest channel a session contributed to (for notification copy)
function _topChannel(sess) {
  if (!sess?.doses) return null;
  let bestKey = null, bestVal = 0;
  for (const [k, v] of Object.entries(sess.doses)) {
    if (Number.isFinite(v) && v > bestVal) { bestVal = v; bestKey = k; }
  }
  if (!bestKey) return null;
  const meta = CHANNEL_DISPLAY[bestKey];
  const t = channelTier(bestVal, bestKey);
  if (t === 0) return null;
  return { label: meta?.label || bestKey, tier: tierLabel(t) };
}

// Re-render dashboard sidebar + current view after a session change so the
// Light Today strip + sidebar entry appear / update without a manual reload.
function _refreshSurfaces() {
  if (window.buildSidebar) try { window.buildSidebar(); } catch (e) {}
  const view = state.currentView || 'dashboard';
  if (window.navigate) try { window.navigate(view); } catch (e) {}
}

// Resolve session coordinates from the user's profile, country fallback, or a
// previously cached precise location upgrade. Browser geolocation is no longer
// asked at session-stop time — that ask lives in Settings → Light & Sun as an
// explicit "Use precise location" upgrade.
async function _hydrateFromProfileCoords(id) {
  const coords = getSunCoords();
  if (!coords) return;
  const sess = getSessions().find(s => s.id === id);
  if (!sess) return;
  sess.location = { lat: coords.lat, lon: coords.lon, altitudeM: 0, source: coords.source };
  await saveImportedData();
  await hydrateSession(id);
}

// Country band → centroid lat (0=tropical, 4=subarctic). Longitude defaults
// to the user's UTC offset converted to degrees (15° per hour) so sun-zenith
// estimates roughly track the user's local solar time. This is coarse — but
// it works without a geolocation prompt and matches the existing privacy
// posture (we already store country, never lat/lon, in the profile).
const BAND_CENTROID_LAT = [15, 32, 45, 55, 65];

export function getSunCoords() {
  // 1. Profile-cached precise coords (set via "Use precise location" upgrade)
  const profileLoc = state.importedData?.sunDefaults?.coords;
  if (profileLoc && Number.isFinite(profileLoc.lat) && Number.isFinite(profileLoc.lon)) {
    return { lat: profileLoc.lat, lon: profileLoc.lon, source: 'profile-precise' };
  }
  // 2. Profile country → band centroid lat (Greenwich-shifted lon from tz)
  const country = (getProfileLocation()?.country || '').toLowerCase().trim();
  if (country && COUNTRY_LATITUDES[country] !== undefined) {
    const bandIdx = COUNTRY_LATITUDES[country];
    const lat = BAND_CENTROID_LAT[bandIdx] ?? 45;
    // Browser timezone offset (minutes west of UTC) → degrees east of Greenwich
    const lon = -((new Date().getTimezoneOffset() / 60) * 15);
    return { lat, lon, source: 'country-band' };
  }
  // 3. Nothing available → can't hydrate without a location
  return null;
}

// Explicit one-time geolocation upgrade. Surfaces in Settings → Light & Sun
// or via a "use precise location" button on the Light & Sun page.
export async function requestPreciseLocation() {
  if (!('geolocation' in navigator)) {
    showNotification('Browser geolocation not available — country-level estimate will be used.');
    return null;
  }
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 60_000 * 30, enableHighAccuracy: true });
    });
    if (!state.importedData.sunDefaults) state.importedData.sunDefaults = {};
    state.importedData.sunDefaults.coords = {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      altitudeM: pos.coords.altitude || 0,
      capturedAt: Date.now(),
    };
    await saveImportedData();
    showNotification('Precise location saved — sun calculations will be more accurate.');
    return state.importedData.sunDefaults.coords;
  } catch (e) {
    showNotification('Location not shared — your country still gives a reasonable estimate.');
    return null;
  }
}

// ─── UI: Sessions list (used by the dedicated Light & Sun page) ────────

export function renderSessionsList() {
  const sessions = [...getSessions()].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  if (sessions.length === 0) {
    return `<div class="sun-empty">
      <p>No sun sessions logged yet.</p>
      <button class="import-btn import-btn-primary" onclick="window.quickLogSunSession()">Log your first session</button>
    </div>`;
  }
  const presetLabels = Object.fromEntries(EXPOSURE_PRESETS.map(p => [p.key, p.label]));
  const eyeLabels = Object.fromEntries(EYE_MODES.map(e => [e.key, e.label]));
  let html = `<div class="sun-sessions-list">`;
  for (const sess of sessions) {
    const start = formatDate(new Date(sess.startedAt).toISOString().slice(0, 10));
    const dur = sess.durationMin ? `${Math.round(sess.durationMin)} min` : 'in progress';
    const med = sess.safety?.medFraction;
    let medStr = '';
    if (med != null) {
      const pct = Math.round(med * 100);
      let label = 'safe', cls = '';
      if (med >= 1) { label = 'over threshold'; cls = 'over'; }
      else if (med >= 0.7) { label = 'high'; cls = 'warn'; }
      else if (med >= 0.3) { label = 'moderate'; cls = ''; }
      medStr = `<span class="sun-session-med ${cls}" title="Skin sunburn dose: ${pct}% of your personal threshold (Fitzpatrick ${sess.safety.fitzpatrick || 'III'})">Burn risk: ${label}</span>`;
    }
    const channelChips = renderChannelChips(sess.doses);
    html += `<div class="sun-session" data-id="${escapeAttr(sess.id)}">
      <div class="sun-session-head">
        <span class="sun-session-date">${start}</span>
        <span class="sun-session-duration">${dur}</span>
        ${medStr}
        <button class="sun-session-delete" onclick="window.deleteSunSession('${escapeAttr(sess.id)}')" title="Delete session" aria-label="Delete session">×</button>
      </div>
      <div class="sun-session-meta">
        ${escapeHTML(presetLabels[sess.bodyExposure?.preset] || 'Body unset')} · ${escapeHTML(eyeLabels[sess.eyeExposure?.mode] || 'Eyes unset')}${sess.bodyExposure?.glassBetween ? ' · through glass' : ''}${sess.bodyExposure?.sunscreenSPF ? ` · SPF ${sess.bodyExposure.sunscreenSPF}` : ''}
      </div>
      ${channelChips}
    </div>`;
  }
  html += `</div>`;
  return html;
}

function renderChannelChips(doses) {
  if (!doses) return '';
  const order = ['vitamin_d', 'pomc', 'no_cv', 'violet_eye', 'circadian', 'nir_solar'];
  // Top-3 contributing channels for at-a-glance reading. Full grid lives on
  // the Light & Sun page; per-row noise is what the v1.7.0a UX review flagged.
  const ranked = order
    .map(key => ({ key, v: doses[key] || 0, tier: channelTier(doses[key] || 0, key) }))
    .sort((a, b) => b.tier - a.tier || b.v - a.v);
  const showAll = ranked.filter(r => r.tier > 0).length > 3;
  const visible = showAll ? ranked.slice(0, 3) : ranked;
  let html = `<div class="sun-channel-chips">`;
  for (const r of visible) {
    const meta = CHANNEL_DISPLAY[r.key];
    const label = meta?.label || r.key.replace('_', ' ');
    const tip = `${meta?.what || ''} (level: ${tierLabel(r.tier)})`;
    html += `<span class="sun-chip sun-chip-tier-${r.tier}" data-channel="${r.key}" title="${escapeAttr(tip)}">
      <span class="sun-chip-icon">${meta?.icon || '·'}</span>
      <span class="sun-chip-label">${escapeHTML(label)}</span>
      <span class="sun-chip-dots">${tierDots(r.tier)}</span>
    </span>`;
  }
  if (showAll) {
    html += `<button class="sun-chip-more" onclick="this.parentElement.classList.toggle('sun-chips-expanded')">+ ${ranked.length - 3} more</button>`;
    for (const r of ranked.slice(3)) {
      const meta = CHANNEL_DISPLAY[r.key];
      const label = meta?.label || r.key.replace('_', ' ');
      const tip = `${meta?.what || ''} (level: ${tierLabel(r.tier)})`;
      html += `<span class="sun-chip sun-chip-tier-${r.tier} sun-chip-extra" data-channel="${r.key}" title="${escapeAttr(tip)}">
        <span class="sun-chip-icon">${meta?.icon || '·'}</span>
        <span class="sun-chip-label">${escapeHTML(label)}</span>
        <span class="sun-chip-dots">${tierDots(r.tier)}</span>
      </span>`;
    }
  }
  html += `</div>`;
  return html;
}

// ─── UI: detailed session log (anatomical regions + sunscreen + glass) ─

export function openDetailedSessionDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  const lastUsed = getSessions().filter(s => s.endedAt).slice(-1)[0];
  const eyeMode = lastUsed?.eyeExposure?.mode || 'direct';
  const lensTint = lastUsed?.eyeExposure?.lensTint || 'clear';

  // Region picker as a checkable chip grid — clearer than a tap-target SVG
  // silhouette per the v1.7.0a UX review. Each chip shows the region label
  // and toggles on click. Free-form, accessible, mobile-friendly.

  overlay.innerHTML = `<div class="modal sun-detailed-modal" role="dialog" aria-label="Past session log">
    <div class="modal-header">
      <h3>Log a past session</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <p class="modal-body-hint">For sessions that already happened. Tap each body region that was uncovered. Defaults match your last session.</p>

      <label class="ctx-label">Body regions exposed</label>
      <div class="sun-region-chips" id="sun-region-chips">
        ${BODY_REGIONS.map(r => `<button type="button" class="sun-region-chip" data-region="${escapeAttr(r.key)}">${escapeHTML(r.label)}</button>`).join('')}
      </div>

      <div class="sun-detailed-row">
        <label class="ctx-label">Duration (min)
          <input type="number" id="det-duration" class="ctx-input" min="1" max="240" value="15" />
        </label>
        <label class="ctx-label">Sunscreen SPF
          <input type="number" id="det-spf" class="ctx-input" min="0" max="100" placeholder="none" />
        </label>
      </div>

      <div class="sun-detailed-row">
        <label class="ctx-label">Eyes
          <select id="det-eye-mode" class="ctx-select">
            ${EYE_MODES.map(e => `<option value="${escapeAttr(e.key)}"${e.key === eyeMode ? ' selected' : ''}>${escapeHTML(e.label)}</option>`).join('')}
          </select>
        </label>
        <label class="ctx-label">Lens tint
          <select id="det-lens-tint" class="ctx-select">
            ${LENS_TINTS.map(l => `<option value="${escapeAttr(l.key)}"${l.key === lensTint ? ' selected' : ''}>${escapeHTML(l.label)}</option>`).join('')}
          </select>
        </label>
      </div>

      <label class="ctx-label sun-detailed-glass">
        <input type="checkbox" id="det-glass" />
        Glass between me and the sun (window, windshield, sunroom)
      </label>

      <label class="ctx-label">Notes
        <textarea id="det-notes" class="ctx-input" rows="2" placeholder="Optional"></textarea>
      </label>

      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="import-btn import-btn-primary" id="det-save">Save session</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  const selected = new Set();
  const chipsRoot = overlay.querySelector('#sun-region-chips');
  chipsRoot.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-region]');
    if (!btn) return;
    const k = btn.dataset.region;
    if (selected.has(k)) { selected.delete(k); btn.classList.remove('selected'); }
    else { selected.add(k); btn.classList.add('selected'); }
  });

  overlay.querySelector('#det-save').addEventListener('click', async () => {
    const durationMin = parseInt(overlay.querySelector('#det-duration').value, 10) || 15;
    const eyeModeVal = overlay.querySelector('#det-eye-mode').value || 'direct';
    const lensTintVal = overlay.querySelector('#det-lens-tint').value || 'clear';
    const spf = parseInt(overlay.querySelector('#det-spf').value, 10) || null;
    const glass = overlay.querySelector('#det-glass').checked;
    const notes = overlay.querySelector('#det-notes').value || '';

    // Compute exposure fraction from selected regions
    const regions = Array.from(selected);
    const fraction = regions.reduce((sum, key) => {
      const r = BODY_REGIONS.find(b => b.key === key);
      return sum + (r?.fraction || 0);
    }, 0);

    const start = Date.now() - durationMin * 60 * 1000;
    const sessId = await logCompletedSession({
      startedAt: start,
      endedAt: Date.now(),
      bodyExposure: { preset: regions.length === 0 ? 'face_hands' : 'detailed', fraction: Math.max(0.05, fraction), regions, sunscreenSPF: spf, glassBetween: glass },
      eyeExposure: { mode: eyeModeVal, lensTint: lensTintVal, durationSec: durationMin * 60 },
      notes,
    });
    if (sessId && window.hydrateSession) await window.hydrateSession(sessId);
    overlay.remove();
    showNotification(`Detailed session saved: ${durationMin} min, ${regions.length} regions.`);
    if (window.navigate && state.currentView === 'light') window.navigate('light');
  });
}

// Delete from window for inline onclick
async function deleteSunSession(id) {
  showConfirmDialog('Delete this sun session?', async () => {
    await deleteSession(id);
    _refreshSurfaces();
  });
}

// ─── Window export ─────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  Object.assign(window, {
    quickLogSunSession,
    startSession,
    stopSession,
    logCompletedSession,
    deleteSunSession,
    hydrateSession,
    getSessions,
    getActiveSession,
    rollingChannelTotals,
    cumulativeMEDToday,
    renderSessionsList,
    getSunCoords,
    requestPreciseLocation,
    openDetailedSessionDialog,
    BODY_REGIONS,
    EXPOSURE_PRESETS,
    EYE_MODES,
    LENS_TINTS,
    CHANNEL_DISPLAY,
    channelTier,
    tierLabel,
    tierDots,
  });
}
