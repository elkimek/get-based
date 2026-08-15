// @ts-check
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
import { showNotification, showPromptDialog, showConfirmDialog } from './utils.js';
import { saveImportedData } from './data.js';
import {
  wireBackdropClose as _wireBackdropClose,
  trapModalFocus,
  openAppendedModalOverlay,
  removeModalOverlay,
} from './modal-lifecycle.js';
import {
  BODY_REGIONS,
  renderBodySilhouette,
  bindBodySilhouette,
  resetBodySilhouetteState,
} from './sun-body-silhouette.js';
import {
  configureSunActiveSession,
  quickLogSunSession,
  openStartSunSessionDialog,
  _formatElapsed,
  liveDosesFor as _liveDosesFor,
  commitSunLiveSlice as _commitCurrentSlice,
  setSunLiveState as _setLiveState,
  clearSunLiveState as _clearLiveState,
  resumeActiveTickerIfNeeded as _resumeActiveTickerIfNeeded,
  hydrateSunSessionFromProfileCoords as _hydrateFromProfileCoords,
  resetSunActiveSessionState,
} from './sun-active-session.js';
import {
  photosensitiveMedScale,
  _normalizePSMTier,
  EXPOSURE_PRESETS,
  POSTURE_OPTIONS,
  SURFACE_OPTIONS,
} from './sun-session-model.js';
import {
  fetchAtmosphere,
  interpolateAtmosphere,
  solarZenithAngle,
} from './sun-uvdata.js';
import {
  circadianMelanopicLux,
  computeChannelDoses,
  erythemalSED,
  fractionOfMED,
  geneticVitaminDMultiplier,
  pbmJoulesPerCm2,
  reconstructSpectrum,
  ocularActinicUVdose,
  retinalUVdose,
  vitaminDIU,
  vitaminDIUPerSession,
} from './sun-spectrum.js';
import {
  configureSunSessionsStore,
  getSessions,
  getActiveSession,
  startSession,
  stopSession,
  logCompletedSession,
  deleteSession,
  pauseSession,
  resumeSession,
  markSessionRotated,
  setSessionSunscreen,
  setSessionCoverage,
  updateSession,
  hydrateSession,
  _applyAtmOverrides,
  resetSunSessionsStoreState,
} from './sun-sessions-store.js';
import {
  configureSunSessionUI,
  renderSessionsList,
  renderSunSessionRow,
  openDetailedSessionDialog,
  openSunSessionDetail,
} from './sun-session-ui.js';
import {
  TOO_SHORT_FOR_CHANNEL_VERDICT_MIN,
  formatChannelUnit,
  rollingVitaminDIU,
} from './sun-channel-metrics.js';
import {
  addSunProfileSwitchListener,
  getSunDeviceSessionsRuntime,
  hasSunBrowserRuntime,
  navigateSunRuntime,
  openSunChannelOnLightPageRuntime,
  rebuildSunSidebarRuntime,
  renderLightChannelsLiveRuntime,
  renderLightTodayStripRuntime,
} from './sun-runtime.js';
import { clearCurrentLocation, getSunCoords, requestCurrentLocation, requestPreciseLocation } from './sun-location.js';
import { configureAIVerdictRuntimeDeps } from './ai-verdict-engine-runtime.js';
import { configureProfileContextLightDeps } from './profile-context.js';
import { configureSunDefaultsRuntimeDeps } from './sun-defaults-runtime.js';
import { reopenSunSetup } from './sun-defaults.js';
export { BODY_REGIONS, renderBodySilhouette, bindBodySilhouette };
export { renderSessionsList, renderSunSessionRow, openDetailedSessionDialog, openSunSessionDetail };
export { quickLogSunSession, openStartSunSessionDialog, _wireBackdropClose, trapModalFocus };
export { clearCurrentLocation, getSunCoords, requestCurrentLocation, requestPreciseLocation };
export {
  TOO_SHORT_FOR_CHANNEL_VERDICT_MIN,
  formatChannelUnit,
  rollingVitaminDIU,
  dailyVitaminDIUBreakdown,
  cumulativeVitaminDIUToday,
  vitaminDBudgetStatus,
} from './sun-channel-metrics.js';
export {
  PHOTOSENSITIVE_MED_TIERS,
  photosensitiveMedScale,
  _normalizePSMTier,
  EXPOSURE_PRESETS,
  POSTURE_OPTIONS,
  SURFACE_OPTIONS,
} from './sun-session-model.js';
export {
  SUN_ENGINE_VERSION,
  getSessions,
  getActiveSession,
  startSession,
  stopSession,
  logCompletedSession,
  deleteSession,
  pauseSession,
  resumeSession,
  markSessionRotated,
  setSessionSunscreen,
  setSessionCoverage,
  updateSession,
  hydrateSession,
  rehydrateStaleSessions,
  _applyAtmOverrides,
} from './sun-sessions-store.js';
// NOTE: sun-ai-analysis.js is intentionally NOT imported here — it
// imports from this file (getSessions, formatChannelUnit, etc.), and a
// reciprocal import would create a circular dependency that risks TDZ
// errors at module-init time. main.js imports both modules in a
// deterministic order, while the verdict runtime receives the internal
// surface-refresh callback explicitly below.

// `label` is the row-meta display; `pickerLabel` is what the dropdown
// option shows (where the safety nudge belongs). Earlier the row-meta
// rendered "Eyes uncovered (do not look at sun)" verbatim, which read
// as if the user had been told off — the parenthetical was correct in
// the picker (where it informs the choice) but jarring on a static
// summary line. Row meta now shows just "Eyes uncovered ⚠" so the
// safety state is conveyed by the icon, not a redundant warning string.
export const EYE_MODES = [
  { key: 'direct',         label: 'Eyes uncovered',     pickerLabel: 'Eyes uncovered (never stare at sun)', warn: true },
  { key: 'sunglasses',     label: 'UV-blocking sunglasses', pickerLabel: 'UV-blocking sunglasses' },
  { key: 'clear-glasses',  label: 'Clear UV-blocking lenses', pickerLabel: 'Clear UV-blocking lenses' },
  { key: 'closed-eyes',    label: 'Closed eyes',        pickerLabel: 'Closed eyes' },
  { key: 'glass-window',   label: 'Through window glass', pickerLabel: 'Through window glass' },
  { key: 'indoor',         label: 'Not eye-exposed',    pickerLabel: 'Not eye-exposed' },
];

export const LENS_TINTS = [
  { key: 'clear',         label: 'Clear (no tint)' },
  { key: 'polarized',     label: 'Polarized' },
  { key: 'photochromic',  label: 'Photochromic' },
  { key: 'blue-blocker',  label: 'Blue blocker' },
  { key: 'amber',         label: 'Amber / red' },
];

// ─── Channel display metadata ─────────────────────────────────────────
// `dailyTarget` is retained as a legacy internal normalization anchor for
// old correlations and stored analyses. It is not a biological requirement
// and must not be shown as a progress goal. Channel UI is source-aware and
// reports whether a modeled signal was logged, not a percent completed.
export const CHANNEL_DISPLAY = {
  vitamin_d:  { icon: '☀',  label: 'Vitamin D',          dailyTarget:    300, what: 'UVB on uncovered skin starts vitamin D production. The estimate is rough, and more sun is not always better.' },
  // POMC uses the McKinlay-Diffey erythemal action spectrum as a coarse
  // UV-response proxy. The legacy anchor is not a recommended exposure.
  pomc:       { icon: '⚡',  label: 'Skin & mood',        dailyTarget:     80, what: 'Sunlight on skin can start signals involved in pigment, stress response, and how sunlight feels.' },
  // NO/cardiovascular uses a coarse UVA action spectrum informed by
  // Liu/Oplander. It does not define a blood-pressure treatment dose.
  no_cv:      { icon: '❤',  label: 'Blood vessels',      dailyTarget:   5000, what: 'UVA can release nitric oxide stored in skin, which may temporarily relax blood vessels.' },
  // Violet-eye is exploratory. Human evidence is stronger for time outdoors
  // than for any wavelength-specific eye dose, so this remains a log signal.
  violet_eye: { icon: '👁',  label: 'Outdoor eye light',  dailyTarget:   8000, what: 'Outdoor light includes violet wavelengths that are reduced by many windows. Their human effects are still being studied.' },
  // Circadian/melanopic proxy at eye. The UI converts modeled channel dose
  // using the D65 melanopic radiant-efficacy denominator; without a measured
  // SPD it is an estimate, not CIE-compliant M-EDI metrology.
  circadian:  { icon: '🌅', label: 'Body clock',         dailyTarget:  20000, what: 'Outdoor light reaching your eyes helps your body know when it is day. Timing matters more than a score.' },
  // NIR-solar is a broadband modeled input. Published red/NIR work motivates
  // the channel, but the legacy anchor is not a biological requirement.
  nir_solar:  { icon: '⚡', label: 'Cell energy & repair', dailyTarget:  30000, what: 'May support cell energy and repair signals. This is modeled from red and near-infrared light, and the research is still developing.' },
  pbm_red:    { icon: '🔴', label: 'Red light device',   dailyTarget:   8000, what: 'A device delivers a targeted red-light signal. It is tracked separately from sunlight.' },
  pbm_nir:    { icon: '🟣', label: 'Near-IR device',     dailyTarget:  10000, what: 'A device delivers a targeted near-infrared signal. It is tracked separately from sunlight.' },
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

// Tier classifier for 7-day rollups. The dashboard "what your light does"
// pills, the AI 7-day rollup, and the per-channel drill-down all surface a
// 7-day exposure total — same data, but they were all calling channelTier()
// with a daily target, so the same number scored "moderate" against daily
// and "low" against weekly. Use this where the value is a multi-day rollup;
// use channelTier where the value is a single day or a single session.
export function weeklyChannelTier(value, channelKey) {
  const target = (CHANNEL_DISPLAY[channelKey]?.dailyTarget ?? 1000) * 7;
  if (!Number.isFinite(value) || value <= 0) return 0;
  const ratio = value / target;
  if (ratio < 0.20) return 1;
  if (ratio < 0.55) return 2;
  if (ratio < 1.00) return 3;
  return 4;
}

const TIER_LABELS = ['none', 'low', 'moderate', 'good', 'strong'];
const TIER_DOTS = ['○○○○', '●○○○', '●●○○', '●●●○', '●●●●'];

export function tierLabel(tier) { return TIER_LABELS[tier] || 'none'; }

// Channel unit formatting and vitamin-D rollups live in
// sun-channel-metrics.js so this facade stays focused on session
// orchestration and legacy public exports.
export function tierDots(tier) { return TIER_DOTS[tier] || TIER_DOTS[0]; }

// ─── Session lifecycle facade helpers ─────────────────────────────────

// User-facing wrappers — called from inline onclick handlers in
// renderSunSessionRow's active controls. Both call the surface refresh
// to update the dashboard strip + Light page state immediately.
export async function pauseSunSession(id) {
  await pauseSession(id);
  showNotification('Session paused — dose accrual frozen until you resume.', 'success', 3500);
  _refreshSurfaces();
}
export async function resumeSunSession(id) {
  await resumeSession(id);
  showNotification('Session resumed — fresh atmosphere snapshot on the next tick.', 'success', 3500);
  _refreshSurfaces();
}

// Mid-session side-change hook. It commits the prior timed slice and records
// a history boundary. Rotation never multiplies a dose; if the exposed body
// regions also change, the separate Coverage control records that change.
export async function flipSidesMidSession(id) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess || sess.endedAt) return;
  if (sess.bodyExposure?.rotatedSides) {
    showNotification('Side change already recorded. Use Coverage if different skin is exposed now.', 'info', 3500);
    return;
  }
  const updated = await markSessionRotated(id);
  if (!updated) return;
  showNotification('Side change recorded at this time. Dose was not multiplied; update Coverage if different skin is exposed.', 'success', 5000);
  _refreshSurfaces();
}

// Mid-session "I just reapplied sunscreen" hook. Commits the slice
// computed under the OLD SPF, prompts for the new value, then updates
// the session record. The next tick snapshots a fresh rate with the
// new SPF baked in via _rateAtInstant's bodyModifiers path.
export async function applySunscreenMidSession(id) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess || sess.endedAt) return;
  const cur = sess.bodyExposure?.sunscreenSPF || 0;
  const raw = await showPromptDialog(
    `Reapply sunscreen — what SPF? (Currently SPF ${cur || 'none'})`,
    { defaultValue: cur ? String(cur) : '30', okLabel: 'Apply', placeholder: 'SPF (15-100)' }
  );
  if (raw == null) return;
  const spf = parseInt(raw, 10);
  if (!Number.isFinite(spf) || spf < 0 || spf > 100) {
    showNotification('SPF must be 0-100.', 'error', 3000);
    return;
  }
  const updated = await setSessionSunscreen(id, spf);
  if (!updated) return;
  showNotification(`SPF updated to ${spf || 'none'} — next dose-rate sample uses the new value.`, 'success', 3500);
  _refreshSurfaces();
}

// Mid-session "I just dressed / undressed" hook. Commits the slice
// computed under the OLD body regions (so the dose accrued so far at
// the previous coverage is preserved), opens a body-region picker
// pre-checked to what's currently selected, then on confirm updates
// the session record. The next tick re-snapshots the rate using the
// new bodyExposure.fraction. Mirrors applySunscreenMidSession's
// commit-then-mutate pattern.
//
// Use case: started shirtless, decided to put a t-shirt back on after
// 20 min — without this, the saved IU pretends the user kept the
// original coverage for the whole session. Same for device sessions
// where you start aimed at the torso and end aimed at the legs.
export async function changeCoverageMidSession(id) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess || sess.endedAt) return;

  const currentRegions = new Set(sess.bodyExposure?.regions || []);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal sun-start-modal" role="dialog" aria-label="Change coverage">
    <div class="modal-header">
      <h3>Update coverage mid-session</h3>
      <button type="button" class="modal-close" data-sun-coverage-close aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <p class="modal-body-hint">Tap each body region that's uncovered <strong>now</strong>. The dose accrued under the previous coverage stays — the change applies from this moment forward.</p>
      <div class="sun-silhouette-wrap" id="sun-coverage-silhouette-slot">${renderBodySilhouette(currentRegions)}</div>
      <div class="sun-silhouette-hint" id="sun-coverage-hint"></div>
      <div class="modal-actions" style="margin-top:18px">
        <button type="button" class="import-btn import-btn-secondary" data-sun-coverage-close>Cancel</button>
        <button class="import-btn import-btn-primary" id="coverage-confirm">Apply coverage</button>
      </div>
    </div>
  </div>`;
  const closeDialog = () => removeModalOverlay(overlay);
  overlay.querySelectorAll('[data-sun-coverage-close]').forEach(btn => {
    btn.addEventListener('click', closeDialog);
  });
  openAppendedModalOverlay(overlay, closeDialog);

  const selected = new Set(currentRegions);
  const slot = overlay.querySelector('#sun-coverage-silhouette-slot');
  const hint = overlay.querySelector('#sun-coverage-hint');
  const confirmButton = overlay.querySelector('#coverage-confirm');
  if (!hint || !confirmButton) {
    closeDialog();
    return;
  }
  const updateHint = () => {
    const fraction = Array.from(selected).reduce((sum, key) => {
      const r = BODY_REGIONS.find(b => b.key === key);
      return sum + (r?.fraction || 0);
    }, 0);
    if (selected.size === 0) {
      hint.textContent = 'No regions exposed — fully clothed for the rest of the session.';
    } else {
      const labels = Array.from(selected).map(k => BODY_REGIONS.find(b => b.key === k)?.label || k).join(', ');
      // Body-fraction sums to 0.95 across all 16 regions (scalp + anatomical
      // seams aren't individually selectable). "Full body" reads cleaner
      // than "95% of skin" once the user is at-or-near the picker ceiling.
      const pctLabel = fraction >= 0.94 ? 'full body' : `${(fraction * 100).toFixed(0)}% of skin`;
      hint.textContent = `${selected.size} region${selected.size === 1 ? '' : 's'} exposed (${pctLabel}) — ${labels}`;
    }
  };
  bindBodySilhouette(slot, selected, updateHint);
  updateHint();

  confirmButton.addEventListener('click', async () => {
    const regions = Array.from(selected);
    const updated = await setSessionCoverage(id, regions);
    const fraction = updated?.bodyExposure?.fraction || 0;
    closeDialog();
    if (!updated) return;
    showNotification(
      updated.bodyExposure?.regions?.length === 0
        ? 'Coverage updated: fully clothed — dose accrual paused until you uncover skin again.'
        : `Coverage updated: ${(fraction * 100).toFixed(0)}% body — next tick re-samples at the new fraction.`,
      'success', 3500
    );
    _refreshSurfaces();
  });
}

// Quick ozone-DU override surfaced from the active card — saves to
// sunDefaults.overrides.ozoneDU which _applyAtmOverrides reads on every
// _rateAtInstant. Clears live ratePerMin so the new override applies on
// the next tick.
export async function setOzoneOverrideMidSession() {
  const cur = state.importedData?.sunDefaults?.overrides?.ozoneDU;
  const raw = await showPromptDialog(
    `Stratospheric ozone column (Dobson Units). Typical 220-450 DU. Leave empty to clear and use the source value.`,
    { defaultValue: cur ? String(cur) : '', okLabel: 'Apply', placeholder: 'e.g. 320', allowEmpty: true }
  );
  if (raw == null) return;
  const trimmed = String(raw).trim();
  if (!state.importedData.sunDefaults) state.importedData.sunDefaults = {};
  if (!state.importedData.sunDefaults.overrides) state.importedData.sunDefaults.overrides = {};
  if (trimmed === '') {
    state.importedData.sunDefaults.overrides.ozoneDU = null;
    showNotification('Ozone override cleared — using source value.', 'success', 3000);
  } else {
    const du = parseFloat(trimmed);
    if (!Number.isFinite(du) || du < 100 || du > 600) {
      showNotification('Ozone DU must be 100-600.', 'error', 3000);
      return;
    }
    state.importedData.sunDefaults.overrides.ozoneDU = du;
    showNotification(`Ozone override set: ${du} DU. Active session re-snapshots on next tick.`, 'success', 3500);
  }
  // Force re-snapshot for any active session.
  for (const s of getSessions().filter(x => !x.endedAt)) {
    _commitCurrentSlice(s);
    _setLiveState(s.id, { ratePerMin: null });
  }
  await saveImportedData();
  _refreshSurfaces();
}

// Forgot-to-stop banner action — closes a session that's been running
// > 12h. Sets endedAt to now (or the previous sunset, whichever is
// earlier and still after startedAt) so the dose math is bounded.
export async function _forgotStopPrompt(id) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess || sess.endedAt) return;
  const hours = ((Date.now() - sess.startedAt) / 3600000).toFixed(1);
  if (await showConfirmDialog(
    `End this session that's been running ${hours} hours? Best-guess end time: now. The recorded duration will still reflect this — please trim it from the session detail if you ended earlier.`
  )) {
    await stopSession(sess.id);
    await _hydrateFromProfileCoords(sess.id);
    _refreshSurfaces();
    showNotification('Session ended. Open the session detail to adjust the duration if needed.', 'success', 4500);
  }
}

// ─── Lifelight aggregates ──────────────────────────────────────────────

// Rolling N-day per-channel totals — used by the dashboard strip and AI context.
export function rollingChannelTotals(days = 7) {
  const now = Date.now();
  const cutoff = now - days * 86400 * 1000;
  const totals = {};
  for (const sess of getSessions()) {
    // Include in-progress sessions via live partial doses, but only when
    // the session's startedAt is within the rolling period. A session
    // forgotten-running for 25 hours should not perpetually inflate
    // the 7d total.
    if (!sess.endedAt) {
      if ((sess.startedAt || 0) < cutoff) continue;
      const live = _liveDosesFor(sess);
      if (live?.doses) {
        for (const [k, v] of Object.entries(live.doses)) {
          totals[k] = (totals[k] || 0) + (Number.isFinite(v) ? v : 0);
        }
      }
      continue;
    }
    if (!sess.doses) continue;
    if (sess.endedAt < cutoff) continue;
    for (const [k, v] of Object.entries(sess.doses)) {
      totals[k] = (totals[k] || 0) + (Number.isFinite(v) ? v : 0);
    }
  }
  return totals;
}

// Per-day channel breakdown for the rolling-N chart. Returns an array of
// length `days` (oldest → newest), each element { date: 'YYYY-MM-DD',
// sun: <au>, device: <au> } for the requested channelKey. Today is the
// last bucket. Used by the weekly bar chart in the channel drill-down.
export function dailyChannelBreakdown(channelKey, days = 7) {
  const buckets = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    buckets.push({ date: d, key: d.toISOString().slice(0, 10), sun: 0, device: 0 });
  }
  const startOf = (ts) => {
    const d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const idxFor = (ts) => {
    const day = startOf(ts);
    return buckets.findIndex(b => b.date.getTime() === day);
  };
  for (const sess of getSessions()) {
    const ts = sess.endedAt || sess.startedAt;
    if (!ts) continue;
    const i = idxFor(ts);
    if (i < 0) continue;
    if (!sess.endedAt) {
      // In-progress session — pull live partial dose so the chart reflects
      // an active session in progress (matches rollingChannelTotals).
      const live = _liveDosesFor(sess);
      const v = live?.doses?.[channelKey];
      if (Number.isFinite(v)) buckets[i].sun += v;
      continue;
    }
    if (!sess.doses) continue;
    const v = sess.doses[channelKey];
    if (Number.isFinite(v)) buckets[i].sun += v;
  }
  const devSessions = getSunDeviceSessionsRuntime();
  for (const ds of devSessions || []) {
    const ts = ds.endedAt || ds.startedAt;
    if (!ts || !ds.doses) continue;
    const i = idxFor(ts);
    if (i < 0) continue;
    const v = ds.doses[channelKey];
    if (Number.isFinite(v)) buckets[i].device += v;
  }
  return buckets;
}

// Vitamin-D channel rollups live in sun-channel-metrics.js.

// Cumulative MED today (for the safety gauge and pre-session warnings).
// Includes the in-progress session's live partial burn-dose so the gauge
// fills as you sit in the sun.
export function cumulativeMEDToday() {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  let total = 0;
  for (const sess of getSessions()) {
    if (!sess.endedAt) {
      const live = _liveDosesFor(sess);
      if (live && Number.isFinite(live.medFraction)) total += live.medFraction;
      continue;
    }
    if (!sess.safety) continue;
    if (sess.endedAt < dayStart) continue;
    total += sess.safety.medFraction || 0;
  }
  return total;
}

// Cumulative MED for the prior day. Skin doesn't fully reset overnight —
// a yesterday-MED of 0.9 plus today-MED of 0.5 = ~1.4 cumulative,
// well into burn territory. Surfaced as a "carry-over" warning chip when
// yesterday + today exceeds 100%.
export function cumulativeMEDYesterday() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yStart = todayStart - 86400000;
  let total = 0;
  for (const sess of getSessions()) {
    // In-progress session that started yesterday and is still running today
    // contributes its dose proportionally (yesterday's portion to yesterday).
    if (!sess.endedAt) {
      const startedAt = sess.startedAt || 0;
      if (startedAt < yStart || startedAt >= todayStart) continue;
      const live = _liveDosesFor(sess);
      if (!live || !Number.isFinite(live.medFraction)) continue;
      const totalElapsedMs = Date.now() - startedAt;
      const yesterdayMs = Math.max(0, todayStart - startedAt);
      const yesterdayShare = totalElapsedMs > 0 ? yesterdayMs / totalElapsedMs : 0;
      total += live.medFraction * yesterdayShare;
      continue;
    }
    if (!sess.safety) continue;
    if (sess.endedAt < yStart || sess.endedAt >= todayStart) continue;
    total += sess.safety.medFraction || 0;
  }
  return total;
}

// Re-render dashboard sidebar + current view after a session change so the
// Light Today strip + sidebar entry appear / update without a manual reload.
//
// Scroll preservation lives in views.js navigate() now (element-anchor
// pattern — captures the focused element's stable parent + restores its
// viewport-top after rebuild). Earlier draft did pixel-based scroll
// preservation here too, but pixel-based broke when content above the
// viewport changed height during rebuild — superseded by the navigate()
// path which handles all callers uniformly.
// Debounce window for _refreshSurfaces — the AI verdict engine fires
// _refresh 3-5 times during a single measurement save (retrying.add,
// inflight.add, inflight.delete, retrying.delete, plus saveMeasurement's
// own setTimeout-navigate). Each rebuild destroys charts and re-renders
// the entire view, and the destroy/recreate cycle shifts content above
// the user's anchor (charts paint async, then are torn down again on
// the next rebuild). That thrashing produced visible scroll jumps even
// with the anchor-restore loop active. Coalescing multiple refresh
// requests into a single rebuild eliminates the thrash.
//
// Trailing edge: we want the FINAL state (after the verdict lands) to
// render, not the in-flight "analyzing" intermediate. The first refresh
// in a burst schedules a navigate ~150ms out; subsequent refreshes
// within that window reset the timer (keeping the latest scrollAnchor).
// The user sees a slightly delayed "Analyzing..." indicator (acceptable
// trade for no jump) and the final result with no thrash.
let _refreshSurfacesTimer = null;
let _refreshSurfacesPendingAnchor = null;
function _refreshSurfaces(scrollAnchor) {
  // Always keep the most recent anchor — if any caller in the burst
  // requested a specific anchor, use it.
  if (scrollAnchor) _refreshSurfacesPendingAnchor = scrollAnchor;
  if (_refreshSurfacesTimer) clearTimeout(_refreshSurfacesTimer);
  _refreshSurfacesTimer = setTimeout(() => {
    _refreshSurfacesTimer = null;
    const anchor = _refreshSurfacesPendingAnchor;
    _refreshSurfacesPendingAnchor = null;
    rebuildSunSidebarRuntime();
    // Boot-time guard: state.currentView is undefined until the first
    // navigate() runs. If a sync pull or AI verdict tick fires during
    // that window, fall back to the DOM's active nav-item rather than
    // defaulting to 'dashboard' (which would yank a user mid-init off
    // whatever page they're on per the URL fragment / launcher target).
    const view = state.currentView
      || /** @type {HTMLElement | null} */ (document.querySelector('.nav-item.active'))?.dataset?.category
      || 'dashboard';
    const navOpts = anchor ? { scrollAnchor: anchor } : undefined;
    navigateSunRuntime(view, navOpts);
    setTimeout(() => _resumeActiveTickerIfNeeded(), 100);
  }, 150);
}

// Compact body-exposure summary for the session-list row. Detailed
// (region-driven) sessions report region count, not the misleading
// "Body unset" fallback that the bare preset-label lookup gives.
function _summarizeBodyExposure(sess) {
  const presetKey = sess?.bodyExposure?.preset;
  if (presetKey === 'covered') return 'No skin exposed (0%)';
  const presetLabel = EXPOSURE_PRESETS.find(p => p.key === presetKey)?.label;
  if (presetLabel) return presetLabel;
  const regionCount = (sess?.bodyExposure?.regions || []).length;
  if (regionCount > 0) {
    const fractionPct = Math.round((sess.bodyExposure?.fraction || 0) * 100);
    return `${regionCount} region${regionCount === 1 ? '' : 's'} (${fractionPct}%)`;
  }
  return 'Body unset';
}

configureSunSessionsStore({
  commitCurrentSlice: _commitCurrentSlice,
  setLiveState: _setLiveState,
  clearLiveState: _clearLiveState,
  formatElapsed: _formatElapsed,
  fetchAtmosphere,
  reconstructSpectrum,
  computeChannelDoses,
  erythemalSED,
  fractionOfMED,
  retinalUVdose,
  solarZenithAngle,
});

configureSunActiveSession({
  getSessions,
  getActiveSession,
  startSession,
  stopSession,
  hydrateSession,
  getSunCoords,
  saveImportedData: async () => { await saveImportedData(); },
  applyAtmOverrides: _applyAtmOverrides,
  refreshSurfaces: _refreshSurfaces,
  normalizePSMTier: _normalizePSMTier,
  photosensitiveMedScale,
  eyeModes: EYE_MODES,
  lensTints: LENS_TINTS,
  postureOptions: POSTURE_OPTIONS,
  surfaceOptions: SURFACE_OPTIONS,
  fetchAtmosphere,
  reconstructSpectrum,
  computeChannelDoses,
  erythemalSED,
  ocularActinicUVdose,
  fractionOfMED,
  solarZenithAngle,
  interpolateAtmosphere,
  vitaminDIU,
  vitaminDIUPerSession,
  renderLightChannelsLive: renderLightChannelsLiveRuntime,
  renderLightTodayStrip: renderLightTodayStripRuntime,
  openLightSetup: reopenSunSetup,
});

configureSunSessionUI({
  getSessions,
  deleteSession,
  updateSession,
  logCompletedSession,
  hydrateSession,
  getSunCoords,
  refreshSurfaces: _refreshSurfaces,
  summarizeBodyExposure: _summarizeBodyExposure,
  formatElapsed: _formatElapsed,
  exposurePresets: EXPOSURE_PRESETS,
  eyeModes: EYE_MODES,
  lensTints: LENS_TINTS,
  postureOptions: POSTURE_OPTIONS,
  surfaceOptions: SURFACE_OPTIONS,
  channelDisplay: CHANNEL_DISPLAY,
  channelTier,
  tierLabel,
  formatChannelUnit,
  tooShortForChannelVerdictMin: TOO_SHORT_FOR_CHANNEL_VERDICT_MIN,
  quickLogSunSession,
  pauseSunSession,
  resumeSunSession,
  flipSidesMidSession,
  changeCoverageMidSession,
  applySunscreenMidSession,
  setOzoneOverrideMidSession,
  forgotStopPrompt: _forgotStopPrompt,
  openChannelOnLightPage: openSunChannelOnLightPageRuntime,
  solarZenithAngle,
  reconstructSpectrum,
  geneticVitaminDMultiplier,
  vitaminDIU,
  vitaminDIUPerSession,
  pbmJoulesPerCm2,
  circadianMelanopicLux,
  openLightSetup: reopenSunSetup,
});

configureAIVerdictRuntimeDeps({ refreshSunSurfaces: _refreshSurfaces });
configureProfileContextLightDeps({ rollingChannelTotals, rollingVitaminDIU });
configureSunDefaultsRuntimeDeps({ getSunCoords, requestPreciseLocation, clearCurrentLocation });

// Reset all sun.js module-singleton state. Called on profile switch so
// caches/timers from profile A don't bleed into profile B (e.g. region-
// map decoded canvas data is profile-agnostic but the overlay cache key
// is built from the previous profile's selection set; the active-card
// ticker keeps running with the prior profile's session list).
function _resetSunModuleState() {
  resetSunActiveSessionState();
  resetBodySilhouetteState();
  resetSunSessionsStoreState();
}

if (hasSunBrowserRuntime()) {
  addSunProfileSwitchListener(_resetSunModuleState);
}
