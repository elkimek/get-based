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
import { escapeHTML, escapeAttr, formatDate, showNotification, showConfirmDialog } from './utils.js';
import { saveImportedData } from './data.js';

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
export async function quickLogSunSession() {
  const active = getActiveSession();
  if (active) {
    showConfirmDialog('Session in progress. Save it now?', async () => {
      await stopSession(active.id);
      await maybeHydrateActiveLocation(active.id);
      const sess = getSessions().find(s => s.id === active.id);
      showNotification(`Session saved — ${Math.round(sess?.durationMin || 0)} min`);
    });
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
  showNotification('Sun session started — tap again to stop');
  return id;
}

async function maybeHydrateActiveLocation(id) {
  // Try to grab the user's coarse location once per session start.
  if (!('geolocation' in navigator)) return;
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 60_000 * 30, enableHighAccuracy: false });
    });
    const sess = getSessions().find(s => s.id === id);
    if (!sess) return;
    sess.location = {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      altitudeM: pos.coords.altitude || 0,
    };
    await saveImportedData();
    await hydrateSession(id);
  } catch (e) {
    // User denied geolocation — session is still valid, just lacks dose data.
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
  let html = `<div class="sun-sessions-list">`;
  for (const sess of sessions) {
    const start = formatDate(new Date(sess.startedAt).toISOString().slice(0, 10));
    const dur = sess.durationMin ? `${Math.round(sess.durationMin)} min` : 'in progress';
    const med = sess.safety?.medFraction;
    const medStr = med != null
      ? `<span class="sun-session-med ${med > 1 ? 'over' : ''}">${(med * 100).toFixed(0)}% MED</span>`
      : '';
    const channelChips = renderChannelChips(sess.doses);
    html += `<div class="sun-session" data-id="${escapeAttr(sess.id)}">
      <div class="sun-session-head">
        <span class="sun-session-date">${start}</span>
        <span class="sun-session-duration">${dur}</span>
        ${medStr}
        <button class="sun-session-delete" onclick="window.deleteSunSession('${escapeAttr(sess.id)}')" title="Delete session" aria-label="Delete session">×</button>
      </div>
      <div class="sun-session-meta">
        Body: ${escapeHTML(sess.bodyExposure?.preset || 'unset')} · Eyes: ${escapeHTML(sess.eyeExposure?.mode || 'unset')}
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
  let html = `<div class="sun-channel-chips">`;
  for (const key of order) {
    const v = doses[key] || 0;
    const intensity = Math.min(1, v / 100); // arbitrary normalization for chip color
    html += `<span class="sun-chip" data-channel="${key}" style="opacity:${0.3 + intensity * 0.7}" title="${key}: ${v.toFixed(2)}">${key.replace('_', ' ')}</span>`;
  }
  html += `</div>`;
  return html;
}

// Delete from window for inline onclick
async function deleteSunSession(id) {
  showConfirmDialog('Delete this sun session?', async () => {
    await deleteSession(id);
    if (window.navigate && state.currentView === 'light') window.navigate('light');
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
    BODY_REGIONS,
    EXPOSURE_PRESETS,
    EYE_MODES,
    LENS_TINTS,
  });
}
