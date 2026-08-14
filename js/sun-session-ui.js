// @ts-check
// sun-session-ui.js — UI rendering/editing for saved sun sessions.

import { state } from './state.js';
import { bindDetachedModalSyncRefresh, escapeHTML, escapeAttr, formatDate, showNotification, showPromptDialog, showConfirmDialog } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import { BODY_REGIONS } from './sun-body-silhouette.js';
import { installSunSessionActionDelegates, sunSessionActionAttrs } from './sun-session-actions.js';
import { bindPastSessionDurationHint, bindPastSessionRegionPicker, renderPastSessionLogModal } from './sun-session-log-modal.js';

/**
 * @typedef {object} SunSessionUIDeps
 * @property {() => any[]} getSessions
 * @property {(id: any) => Promise<boolean> | boolean} deleteSession
 * @property {(id: any, patch: any) => Promise<any>} updateSession
 * @property {(opts: any) => Promise<any>} logCompletedSession
 * @property {(id: any, coords?: any) => Promise<any>} hydrateSession
 * @property {() => any} getSunCoords
 * @property {() => void} refreshSurfaces
 * @property {(sess: any) => string} summarizeBodyExposure
 * @property {(ms: number) => string} formatElapsed
 * @property {Array<{ key: string, label: string }>} exposurePresets
 * @property {Array<{ key: string, label: string, pickerLabel?: string }>} eyeModes
 * @property {Array<{ key: string, label: string }>} lensTints
 * @property {Array<{ key: string, label: string }>} postureOptions
 * @property {Array<{ key: string, label: string }>} surfaceOptions
 * @property {Record<string, any>} channelDisplay
 * @property {(value: any, key: any) => number} channelTier
 * @property {(tier: any) => string} tierLabel
 * @property {(...args: any[]) => string} formatChannelUnit
 * @property {number} tooShortForChannelVerdictMin
 * @property {() => Promise<any> | any} quickLogSunSession
 * @property {(id: any) => Promise<any> | any} pauseSunSession
 * @property {(id: any) => Promise<any> | any} resumeSunSession
 * @property {(id: any) => Promise<any> | any} flipSidesMidSession
 * @property {(id: any) => Promise<any> | any} changeCoverageMidSession
 * @property {(id: any) => Promise<any> | any} applySunscreenMidSession
 * @property {() => Promise<any> | any} setOzoneOverrideMidSession
 * @property {(id: any) => Promise<any> | any} forgotStopPrompt
 * @property {(channel: string) => void} openChannelOnLightPage
 * @property {(sess: any) => string} renderSessionAIDetail
 * @property {(route: string, data?: any) => void} navigate
 * @property {() => void} openLightSetup
 * Runtime math hooks are also configured here; defaults are no-ops.
 */

/** @type {SunSessionUIDeps & Record<string, any>} */
const uiDeps = {
  getSessions: () => [],
  deleteSession: async () => false,
  updateSession: async () => null,
  logCompletedSession: async () => null,
  hydrateSession: async () => null,
  getSunCoords: () => null,
  refreshSurfaces: () => {},
  summarizeBodyExposure: () => 'Body unset',
  formatElapsed: () => '0:00',
  exposurePresets: [],
  eyeModes: [],
  lensTints: [],
  postureOptions: [],
  surfaceOptions: [],
  channelDisplay: {},
  channelTier: () => 0,
  tierLabel: () => 'none',
  formatChannelUnit: () => '',
  tooShortForChannelVerdictMin: 2,
  quickLogSunSession: () => {},
  pauseSunSession: () => {},
  resumeSunSession: () => {},
  flipSidesMidSession: () => {},
  changeCoverageMidSession: () => {},
  applySunscreenMidSession: () => {},
  setOzoneOverrideMidSession: () => {},
  forgotStopPrompt: () => {},
  openChannelOnLightPage: () => {},
  renderSessionAIDetail: () => '',
  navigate: () => {},
  openLightSetup: () => {},
  solarZenithAngle: null, reconstructSpectrum: null,
  geneticVitaminDMultiplier: () => ({ mult: 1.0, contributors: [] }),
  vitaminDIU: null, vitaminDIUPerSession: null,
  pbmJoulesPerCm2: null, circadianMelanopicLux: null,
};

const sunSessionDelegateActions = {
  openSunSessionDetail,
  deleteSunSession,
  editSunSessionDuration,
  retrySunSessionCalculation,
  quickLogSunSession: () => uiDeps.quickLogSunSession(),
  pauseSunSession: id => uiDeps.pauseSunSession(id),
  resumeSunSession: id => uiDeps.resumeSunSession(id),
  flipSidesMidSession: id => uiDeps.flipSidesMidSession(id),
  changeCoverageMidSession: id => uiDeps.changeCoverageMidSession(id),
  applySunscreenMidSession: id => uiDeps.applySunscreenMidSession(id),
  setOzoneOverrideMidSession: () => uiDeps.setOzoneOverrideMidSession(),
  forgotStopPrompt: id => uiDeps.forgotStopPrompt(id),
  openChannelOnLightPage: channel => uiDeps.openChannelOnLightPage(channel),
};

if (typeof document !== 'undefined') {
  installSunSessionActionDelegates(sunSessionDelegateActions);
}

/** @param {(Partial<SunSessionUIDeps> & Record<string, any>)} [deps] */
export function configureSunSessionUI(deps = {}) {
  Object.assign(uiDeps, deps);
}

function refreshLightView() {
  if (state.currentView === 'light') uiDeps.navigate('light');
}

// ─── UI: Sessions list (used by the dedicated Light & Sun page) ────────

function resolvedSessionDurationMin(sess) {
  const stored = sess?.durationMin == null ? Number.NaN : Number(sess.durationMin);
  if (Number.isFinite(stored) && stored >= 0) return stored;
  const start = Number(sess?.startedAt);
  const end = Number(sess?.endedAt);
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    return (end - start) / 60000;
  }
  return null;
}

function localSessionStamp(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return { date: 'Date unavailable', time: '' };
  const localKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return {
    date: formatDate(localKey),
    time: date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  };
}

function renderCompletedSunSessionRow(sess) {
  const stamp = localSessionStamp(sess.startedAt);
  const durationMin = resolvedSessionDurationMin(sess);
  const dur = durationMin != null ? `${Math.round(durationMin)} min` : 'duration unavailable';
  const vitaminD = sess.doses?.vitamin_d
    ? _sessionChipValue('vitamin_d', sess.doses.vitamin_d, sess)
    : '';
  const status = sess.calculationStatus;
  let statusBadge = '';
  if (status && status !== 'computed') {
    const statusLabels = {
      pending: 'Updating estimates…',
      'needs-location': 'Location needed for estimates',
      'atmosphere-unavailable': 'Conditions unavailable — retry',
      'calculation-error': 'Calculation failed — retry',
    };
    statusBadge = `<span class="light-session-warning${status === 'calculation-error' ? ' light-session-warning-danger' : ''}">${escapeHTML(statusLabels[status] || 'Estimates unavailable')}</span>`;
  } else {
    const med = Number(sess.safety?.medFraction);
    if (Number.isFinite(med) && med >= 1) {
      statusBadge = '<span class="light-session-warning light-session-warning-danger">Base burn threshold reached</span>';
    } else if (Number.isFinite(med) && med >= 0.7) {
      statusBadge = '<span class="light-session-warning">High modeled burn dose</span>';
    } else if (sess.safety?.fitzpatrickAssumed || sess.safety?.medicationThresholdUnknown) {
      statusBadge = '<span class="light-session-warning">Review safety assumptions</span>';
    }
  }
  const ariaLabel = `Open ${stamp.date}${stamp.time ? ` at ${stamp.time}` : ''} outdoor sun session details`;
  return `<div class="sun-session light-session-row light-session-complete light-session-sun" data-id="${escapeAttr(sess.id)}" role="button" tabindex="0" aria-label="${escapeAttr(ariaLabel)}" ${sunSessionActionAttrs('open-detail', { id: sess.id })}>
    <span class="light-session-icon" aria-hidden="true">☀</span>
    <div class="light-session-summary">
      <div class="light-session-title"><span class="light-session-kind">Outdoor</span>Sunlight</div>
      <div class="light-session-meta-line">
        <span class="sun-session-date">${escapeHTML(stamp.date)}</span>
        ${stamp.time ? `<span>${escapeHTML(stamp.time)}</span>` : ''}
        <span class="sun-session-duration">${escapeHTML(dur)}</span>
        ${vitaminD ? `<span class="light-session-outcome">Vitamin D est. ${escapeHTML(vitaminD)}</span>` : ''}
      </div>
    </div>
    ${statusBadge}
    <span class="light-session-chevron" aria-hidden="true">›</span>
  </div>`;
}

export function renderSunSessionRow(sess) {
  const isActive = !sess.endedAt;
  if (!isActive) return renderCompletedSunSessionRow(sess);
  const eyeLabels = Object.fromEntries(uiDeps.eyeModes.map(e => [e.key, e.label]));
  const start = localSessionStamp(sess.startedAt).date;
  const now = Date.now();
  const currentPauseMs = sess.paused && Number.isFinite(sess.pausedAt) ? Math.max(0, now - sess.pausedAt) : 0;
  const activeElapsedMs = Math.max(0, now - sess.startedAt - (sess.accumulatedPausedMs || 0) - currentPauseMs);
  const completedDurationMin = resolvedSessionDurationMin(sess);
  const dur = isActive
    ? uiDeps.formatElapsed(activeElapsedMs)
    : (completedDurationMin != null ? `${Math.round(completedDurationMin)} min` : 'duration unavailable');
  const med = sess.safety?.medFraction;
  let medStr = '';
  if (med != null) {
    const pct = Math.round(med * 100);
    let label = 'low modeled dose', cls = '';
    if (med >= 1) { label = 'over threshold'; cls = 'over'; }
    else if (med >= 0.7) { label = 'high'; cls = 'warn'; }
    else if (med >= 0.3) { label = 'moderate'; cls = ''; }
    const medicationCaution = sess.safety?.medicationThresholdUnknown ? ' Medication effects are not included.' : '';
    const skinAssumption = sess.safety?.fitzpatrickAssumed ? ' Conservative Type I is assumed because skin type was unset.' : '';
    medStr = `<span class="sun-session-med ${cls}" title="Base skin-type burn dose: ${pct}% of Fitzpatrick ${escapeAttr(sess.safety.fitzpatrick || 'I')} MED.${escapeAttr(skinAssumption + medicationCaution)}">Base burn dose: ${escapeHTML(label)}${(skinAssumption || medicationCaution) ? ' ⚠' : ''}</span>`;
  }
  const channelChips = renderChannelChips(sess.doses, sess);
  const liveReadouts = isActive
    ? `<div class="sun-session-live-readouts" aria-label="Live session estimates">
        <span class="sun-session-vitd sun-session-vitd-idle"><strong>☀ Vitamin D estimate</strong><span>Calculating…</span></span>
        ${medStr}
      </div>`
    : '';
  // Active-session controls own their delegated actions so tapping them
  // does not fall through to the row-level open-detail action.
  let activeControls = '';
  if (isActive) {
    const isPaused = !!sess.paused;
    const pauseAction = isPaused ? 'resume-session' : 'pause-session';
    const isRotated = !!sess.bodyExposure?.rotatedSides;
    const flipBtn = isRotated
      ? `<button type="button" class="sun-session-ctl" disabled title="Side-change timing recorded; it does not multiply the dose." aria-label="Side change recorded"><span aria-hidden="true">🔄</span> <span class="sun-session-ctl-label">Changed ✓</span></button>`
      : `<button type="button" class="sun-session-ctl" ${sunSessionActionAttrs('flip-sides', { id: sess.id })} title="Record the time you turn over. This closes the current exposure slice without multiplying dose; use Coverage if different skin becomes exposed." aria-label="Record side change"><span aria-hidden="true">🔄</span> <span class="sun-session-ctl-label">Side change</span></button>`;
    activeControls = `<div class="sun-session-active-controls" ${sunSessionActionAttrs('ignore')}>
      <div class="sun-session-ctl-primary">
        <button type="button" class="sun-session-ctl sun-session-ctl-stop" ${sunSessionActionAttrs('quick-log-sun')} title="Stop and save the current session"><span aria-hidden="true">⏹</span> <span class="sun-session-ctl-label">Stop &amp; save</span></button>
        <button type="button" class="sun-session-ctl" ${sunSessionActionAttrs(pauseAction, { id: sess.id })} title="${isPaused ? 'Resume dose accrual' : 'Pause dose accrual (shade break, indoors)'}" aria-label="${isPaused ? 'Resume' : 'Pause'} session"><span aria-hidden="true">${isPaused ? '▶' : '⏸'}</span> <span class="sun-session-ctl-label">${isPaused ? 'Resume' : 'Pause'}</span></button>
      </div>
      <div class="sun-session-ctl-secondary">
        ${flipBtn}
        <button type="button" class="sun-session-ctl" ${sunSessionActionAttrs('change-coverage', { id: sess.id })} title="Dressed or undressed — opens the body-region picker, commits the dose accrued so far, applies the new coverage from this moment forward" aria-label="Change coverage"><span aria-hidden="true">👕</span> <span class="sun-session-ctl-label">Coverage</span></button>
        <button type="button" class="sun-session-ctl" ${sunSessionActionAttrs('apply-sunscreen', { id: sess.id })} title="Record sunscreen reapplication and start a new channel-dose slice. The burn gauge does not credit entered SPF as guaranteed extra safe time." aria-label="Reapply sunscreen"><span aria-hidden="true">🧴</span> <span class="sun-session-ctl-label">Sunscreen</span></button>
        <button type="button" class="sun-session-ctl" ${sunSessionActionAttrs('override-ozone')} title="Calibrate ozone column from a meter / weather station" aria-label="Override ozone"><span aria-hidden="true">🛰</span> <span class="sun-session-ctl-label">Ozone</span></button>
      </div>
    </div>`;
  }
  const pausedBadge = isActive && sess.paused ? `<span class="sun-session-paused" title="Dose and active-duration accrual are paused.">⏸ paused</span>` : '';
  const calculationBadge = !isActive && sess.calculationStatus && sess.calculationStatus !== 'computed'
    ? `<span class="sun-session-paused" title="This session has no computed dose yet.">⚠ ${escapeHTML(sess.calculationStatus === 'needs-location' ? 'location needed' : 'calculation pending')}</span>`
    : '';
  const forgotBanner = isActive && (Date.now() - sess.startedAt > 12 * 3600 * 1000)
    ? `<div class="sun-session-forgot" ${sunSessionActionAttrs('forgot-stop', { id: sess.id })} role="button" tabindex="0">⚠ This session has been running for ${Math.round((Date.now() - sess.startedAt) / 3600000)}h. Tap to end it.</div>`
    : '';
  // Click anywhere on the card (except nested delegated controls) to open
  // the detail modal. Specific controls declare their own data action.
  return `<div class="sun-session light-session-row light-session-sun" data-id="${escapeAttr(sess.id)}" role="button" tabindex="0" aria-label="Open ${start} session details" ${sunSessionActionAttrs('open-detail', { id: sess.id })}>
    <div class="sun-session-head">
      <span class="light-session-icon" aria-hidden="true">☀</span>
      <span class="sun-session-date">${start}</span>
      <span class="sun-session-duration"${isActive ? ' aria-live="off"' : ''}>${dur}</span>
      ${pausedBadge}
      ${calculationBadge}
      ${isActive ? '' : medStr}
      ${isActive ? '' : `<button type="button" class="sun-session-delete" ${sunSessionActionAttrs('delete-session', { id: sess.id })} title="Delete session" aria-label="Delete session">×</button>`}
    </div>
    <div class="sun-session-meta">
      ${escapeHTML(uiDeps.summarizeBodyExposure(sess))} · ${sess.eyeExposure?.mode === 'direct' ? `<span class="sun-eye-warn" title="Never look directly at the sun">⚠</span> ` : ''}${escapeHTML(eyeLabels[sess.eyeExposure?.mode] || 'Eyes unset')}${sess.bodyExposure?.glassBetween ? ' · through glass' : ''}${sess.bodyExposure?.sunscreenSPF ? ` · SPF ${sess.bodyExposure.sunscreenSPF}` : ''}
    </div>
    ${liveReadouts}
    ${forgotBanner}
    ${activeControls}
    ${channelChips}
  </div>`;
}

export function renderSessionsList() {
  const sessions = [...uiDeps.getSessions()].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  if (sessions.length === 0) {
    return `<div class="sun-empty">
      <p>No sun sessions logged yet.</p>
      <button type="button" class="import-btn import-btn-primary" ${sunSessionActionAttrs('quick-log-sun')}>Log your first session</button>
    </div>`;
  }
  let html = `<div class="sun-sessions-list">`;
  for (const sess of sessions) html += renderSunSessionRow(sess);
  html += `</div>`;
  return html;
}

// ─── UI: per-session detail modal ──────────────────────────────────────
export function openSunSessionDetail(id) {
  const sess = uiDeps.getSessions().find(s => s.id === id);
  if (!sess) return;
  const start = new Date(sess.startedAt);
  const end = sess.endedAt ? new Date(sess.endedAt) : null;
  const fmtTime = (d) => d ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—';
  // Modal title date: full month + day + year — avoids the "Sun session
  // — Sun, May 3" stutter and gives a clear timestamp at a glance.
  const fmtTitleDate = (d) => d ? d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—';
  const durationMin = resolvedSessionDurationMin(sess);
  const dur = durationMin != null
    ? `${Math.round(durationMin)} min`
    : (end ? 'duration unavailable' : 'in progress');
  // Combined "When" string — a single cell beats three near-redundant ones
  // (Started / Ended / Duration). Renders "10:07–10:32 · 25 min" or
  // "10:07 · started 5 min ago" for in-progress sessions.
  const whenStr = end
    ? `${fmtTime(start)}–${fmtTime(end)} · ${dur}`
    : `${fmtTime(start)} · ${dur}`;

  const presetLabels = Object.fromEntries(uiDeps.exposurePresets.map(p => [p.key, p.label]));
  const eyeLabels = Object.fromEntries(uiDeps.eyeModes.map(e => [e.key, e.label]));
  const lensLabels = Object.fromEntries(uiDeps.lensTints.map(l => [l.key, l.label]));

  // Body exposure summary
  const regions = sess.bodyExposure?.regions || [];
  const regionLabels = regions.length
    ? regions.map(k => BODY_REGIONS.find(r => r.key === k)?.label || k).join(', ')
    : (sess.bodyExposure?.preset === 'covered' ? 'No skin exposed' : (presetLabels[sess.bodyExposure?.preset] || 'Body unset'));
  const fractionPct = Math.round((sess.bodyExposure?.fraction || 0) * 100);

  // Burn-risk
  const med = sess.safety?.medFraction;
  let medStr = '—';
  if (med != null) {
    const pct = Math.round(med * 100);
    let label = 'low modeled dose';
    if (med >= 1) label = 'over threshold';
    else if (med >= 0.7) label = 'high';
    else if (med >= 0.3) label = 'moderate';
    // Non-breaking space between number and label keeps them on one line.
    medStr = `${pct}% · ${label}`;
  }

  let sessZenith = null;
  try {
    if (sess.startedAt && sess.endedAt && sess.location && uiDeps.solarZenithAngle) {
      const midDate = new Date((sess.startedAt + sess.endedAt) / 2);
      sessZenith = uiDeps.solarZenithAngle(midDate, sess.location.lat, sess.location.lon);
    }
  } catch (e) {}
  const channelOrder = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye'];
  const channelRows = sess.doses ? channelOrder.map(k => {
    const meta = uiDeps.channelDisplay[k] || {};
    const v = sess.doses[k] || 0;
    const unitText = uiDeps.formatChannelUnit(k, v, durationMin || 0, sess.safety?.fitzpatrick || 'I', sess.atmosphere?.uvIndex, sessZenith, !!sess.bodyExposure?.rotatedSides, sess.bodyExposure?.fraction || null);
    const hasSignal = Number.isFinite(v) && v > 0;
    const valueText = unitText || (hasSignal ? 'Signal logged' : 'Not modeled');
    const sourceText = hasSignal ? 'Sunlight' : 'No signal';
    const ariaLabel = `${meta.label || k} — ${valueText}, ${sourceText}. Open channel details.`;
    return `<div class="sun-detail-channel-row sun-detail-channel-row-clickable sun-chip-tier-${hasSignal ? 2 : 0}" data-channel="${escapeAttr(k)}" ${sunSessionActionAttrs('open-channel', { channel: k })} role="button" tabindex="0" aria-label="${escapeAttr(ariaLabel)}">
      <span class="sun-detail-channel-icon" aria-hidden="true">${meta.icon || '·'}</span>
      <span class="sun-detail-channel-label">${escapeHTML(meta.label || k)}</span>
      <span class="sun-detail-channel-value">${escapeHTML(valueText)}</span>
      <span class="sun-detail-channel-tier">${sourceText}</span>
      <span class="sun-detail-channel-chevron" aria-hidden="true">›</span>
    </div>`;
  }).join('') : '<p class="sun-detail-empty">No channel doses computed for this session yet.</p>';

  // Location summary (declared above the atmosphere block so derived metrics
  // can read sess.location for zenith + altitude).
  const loc = sess.location;

  // Atmosphere snapshot + derived geometry. Surfaces zenith, altitude, and
  // a UVA/UVB split so biohackers can audit the math behind the channels.
  const atm = sess.atmosphere;
  let atmHtml = '';
  if (atm) {
    const uvi = atm.uvIndex != null ? Math.round(atm.uvIndex * 10) / 10 : '—';
    // Open-Meteo free tier doesn't expose stratospheric ozone DU; engine
    // substitutes 300 DU internally. Show a clear "—" + "(default 300)"
    // suffix instead of the awkward "— DU".
    const ozoneStr = atm.ozoneDU != null ? `${Math.round(atm.ozoneDU)} DU` : '— (default 300)';
    const cloud = atm.cloudCover != null ? `${Math.round(atm.cloudCover)}%` : '—';
    const aqPm25 = atm.airQuality?.pm25 != null ? Math.round(atm.airQuality.pm25) : '—';
    let zenithStr = '—';
    try {
      if (sess.startedAt && sess.endedAt && loc && uiDeps.solarZenithAngle) {
        const mid = new Date((sess.startedAt + sess.endedAt) / 2);
        const z = uiDeps.solarZenithAngle(mid, loc.lat, loc.lon);
        zenithStr = `${z.toFixed(1)}°`;
      }
    } catch (e) {}
    const altStr = (loc?.altitudeM ?? 0) > 0 ? `${Math.round(loc.altitudeM)} m` : 'sea level';
    let uvSplitStr = '';
    try {
      if (loc && uiDeps.reconstructSpectrum && uiDeps.solarZenithAngle && atm.uvIndex != null) {
        const mid = new Date((sess.startedAt + sess.endedAt) / 2);
        const z = uiDeps.solarZenithAngle(mid, loc.lat, loc.lon);
        if (z < 90) {
          const spec = uiDeps.reconstructSpectrum({
            zenithDeg: z,
            ozoneDU: atm.ozoneDU ?? 300,
            altitudeM: loc.altitudeM ?? 0,
            cloudCover: (atm.cloudCover ?? 0) / 100,
            aod: atm?.airQuality?.aod ?? null,
            targetUVI: atm.uvIndex ?? null,
          });
          const dl = 5;
          let uvb = 0, uva = 0;
          for (let i = 0; i < spec.irradiance.length; i++) {
            const nm = spec.wavelengths[i];
            if (nm > 400) break;
            const e = spec.irradiance[i];
            if (nm < 320) uvb += e * dl;
            else uva += e * dl;
          }
          const total = uvb + uva;
          if (total > 0.001) {
            const uvbPct = (uvb / total * 100).toFixed(1);
            const uvaPct = (uva / total * 100).toFixed(1);
            uvSplitStr = `UVB ${uvbPct}% (${uvb.toFixed(1)} W/m²) · UVA ${uvaPct}% (${uva.toFixed(1)} W/m²)`;
          }
        }
      }
    } catch (e) {}
    // Source label: pretty-print the raw provider key.
    const sourceLabels = { open_meteo: 'Open-Meteo', open_meteo_cams: 'Open-Meteo + CAMS context', cams: 'CAMS', cams_satellite: 'CAMS + satellite clouds', noaa_nws: 'NOAA NWS', selfhost: 'Self-hosted', manual: 'Manual entry' };
    const sourceStr = sourceLabels[atm.source] || atm.source || 'unknown';
    atmHtml = `<div class="sun-detail-atm">
      <div title="WHO UV index at session midpoint"><span>UVI</span><strong>${uvi}</strong></div>
      <div title="Total stratospheric ozone column (Dobson Units). Lower DU → more UVB through. Engine defaults to 300 DU when source doesn't expose it."><span>Ozone</span><strong>${ozoneStr}</strong></div>
      <div title="Cloud-cover modifier on direct beam. Diffuse scatter still passes through."><span>Cloud</span><strong>${cloud}</strong></div>
      <div title="PM2.5 — fine particulate. Affects aerosol optical depth (AOD) and UV scattering."><span>PM2.5</span><strong>${aqPm25}</strong></div>
      <div title="Solar zenith angle at session midpoint — angle between sun and vertical. 0° = directly overhead, 90° = horizon."><span>Zenith</span><strong>${zenithStr}</strong></div>
      <div title="Altitude above sea level — UV climbs ~10% per 1000 m."><span>Altitude</span><strong>${altStr}</strong></div>
      ${uvSplitStr ? `<div class="sun-detail-atm-uvsplit" title="UVB-to-UVA ratio at ground level, computed from the reconstructed Bird-Riordan spectrum. Driven by zenith, ozone, cloud cover, and aerosols."><span>UV split</span><strong>${uvSplitStr}</strong></div>` : ''}
      <div class="sun-detail-atm-source"><span>Source</span><strong>${escapeHTML(sourceStr)}</strong></div>
    </div>`;
  }

  // Location summary string (uses `loc` declared above).
  const locStr = loc
    ? `${loc.lat.toFixed(2)}°, ${loc.lon.toFixed(2)}° · ${loc.source || 'unknown'}`
    : 'Location not recorded';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  // Body summary — combine fraction + regions onto one line so the section
  // doesn't flag the percent as a label decoration. Also consolidate Eyes
  // + Modifiers into the same section when both fit cleanly.
  const eyeMode = eyeLabels[sess.eyeExposure?.mode] || 'Eyes unset';
  const lensTintStr = sess.eyeExposure?.lensTint && sess.eyeExposure.lensTint !== 'clear'
    ? ` · ${lensLabels[sess.eyeExposure.lensTint] || ''}` : '';
  const modifierBits = [];
  if (sess.bodyExposure?.glassBetween) modifierBits.push('Behind glass');
  if (sess.bodyExposure?.sunscreenSPF) modifierBits.push(`SPF ${sess.bodyExposure.sunscreenSPF}`);
  if (sess.posture && sess.posture !== 'standing') {
    const postureLabel = (uiDeps.postureOptions.find(p => p.key === sess.posture) || {}).label;
    if (postureLabel) modifierBits.push(postureLabel);
  }
  if (sess.surfaceAlbedo && sess.surfaceAlbedo !== 'grass') {
    const surfLabel = (uiDeps.surfaceOptions.find(s => s.key === sess.surfaceAlbedo) || {}).label;
    if (surfLabel) modifierBits.push(surfLabel.split(' (')[0]); // drop the "(~25%)" suffix
  }
  const aiDetailHtml = uiDeps.renderSessionAIDetail(sess);
  const calculationMessages = {
    pending: 'Estimates are being recalculated. Previous derived values are hidden until the new calculation finishes.',
    'needs-location': 'A location is needed to reconstruct conditions and calculate this session.',
    'atmosphere-unavailable': 'Conditions could not be loaded for this session. No dose or burn estimate is being shown.',
    'calculation-error': 'The session could not be calculated. No stale estimate is being shown.',
  };
  const calculationMessage = calculationMessages[sess.calculationStatus] || '';
  const canRetryCalculation = ['needs-location', 'atmosphere-unavailable', 'calculation-error'].includes(sess.calculationStatus);
  const calculationStateHtml = calculationMessage ? `<div class="sun-calculation-state${sess.calculationStatus === 'calculation-error' ? ' is-error' : ''}" role="status">
    <span>${escapeHTML(calculationMessage)}</span>
    ${canRetryCalculation ? `<button type="button" class="import-btn import-btn-secondary" ${sunSessionActionAttrs('retry-calculation', { id: sess.id })}>Retry calculation</button>` : ''}
  </div>` : '';

  overlay.innerHTML = `<div class="modal sun-detail-modal" data-session-kind="sun" role="dialog" aria-label="Sun session details">
    <div class="modal-header">
      <h3>Sun session · ${escapeHTML(fmtTitleDate(start))}</h3>
      <button type="button" class="modal-close" ${sunSessionActionAttrs('close-modal')} aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <div class="sun-detail-grid">
        <div title="Session start–end and duration"><span>When</span><strong>${escapeHTML(whenStr)}</strong></div>
        <div title="Cumulative erythemal dose compared with a rough Fitzpatrick base MED. This is not a personal threshold; stop before redness and treat medication warnings separately."><span>Burn dose</span><strong>${escapeHTML(medStr)}</strong></div>
        ${sess.doses?.vitamin_d ? (() => {
          const geneInfo = uiDeps.geneticVitaminDMultiplier(state.importedData?.genetics);
          const geneNote = geneInfo.contributors.length > 0
            ? ` Separate serum-genetics context (not applied to this skin estimate): ${geneInfo.contributors.map(c => `${c.gene} ${c.genotype}`).join(', ')}.`
            : '';
          return `<div title="Modeled vitamin D IU-equivalent from action-weighted incident UVB, exposed area, and a rough Fitzpatrick ${sess.safety?.fitzpatrick || 'I'} central modifier. It is not measured skin absorption or a predicted blood response. Rotation is preserved in session history but does not double dose.${geneNote} Expect broad multi-fold uncertainty."><span>Vitamin D estimate</span><strong>${escapeHTML(uiDeps.formatChannelUnit('vitamin_d', sess.doses.vitamin_d, durationMin || 0, sess.safety?.fitzpatrick || 'I', sess.atmosphere?.uvIndex, sessZenith, !!sess.bodyExposure?.rotatedSides, sess.bodyExposure?.fraction || null))}</strong></div>`;
        })() : ''}
      </div>

      ${calculationStateHtml}

      <div class="sun-detail-section">
        <div class="sun-detail-section-label">Exposure setup</div>
        <div class="sun-detail-setup-grid">
          <div><span>Skin · ${fractionPct}%</span><strong>${escapeHTML(regionLabels)}</strong></div>
          <div><span>Eyes</span><strong>${escapeHTML(eyeMode + lensTintStr)}</strong></div>
          ${modifierBits.length ? `<div><span>Modifiers</span><strong>${escapeHTML(modifierBits.join(' · '))}</strong></div>` : ''}
        </div>
      </div>

      ${aiDetailHtml ? `<div class="sun-detail-section">
        <div class="sun-detail-section-label">Session interpretation</div>
        ${aiDetailHtml}
      </div>` : ''}

      <details class="sun-detail-disclosure">
        <summary>Modeled light signals</summary>
        <p>Estimated stimulation from this session. These signals are not daily targets or proof of an endocrine outcome.</p>
        <div class="sun-detail-channels">${channelRows}</div>
      </details>

      <details class="sun-detail-disclosure">
        <summary>Conditions and model inputs</summary>
        <p>Technical inputs retained so the estimate can be audited without crowding the session summary.</p>
        ${atmHtml || '<p class="sun-detail-empty">Conditions were not available for this session.</p>'}
        <div class="sun-detail-input-location">
          <span>Approx. model location</span>
          <strong>${escapeHTML(locStr)}</strong>
        </div>
      </details>

      ${sess.notes ? `
        <div class="sun-detail-section">
          <div class="sun-detail-section-label">Notes</div>
          <div class="sun-detail-section-value">${escapeHTML(sess.notes)}</div>
        </div>
      ` : ''}

      <div class="modal-actions" style="margin-top:18px">
        ${sess.endedAt ? `<button type="button" class="import-btn import-btn-secondary" ${sunSessionActionAttrs('edit-duration', { id: sess.id })} title="Override the session duration. Use when a re-end on a second device set it wrong, or you forgot to stop on time.">Edit duration</button>` : ''}
        <button type="button" class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red)" ${sunSessionActionAttrs('delete-session', { id: sess.id, closeModal: true })}>Delete session</button>
      </div>
    </div>
  </div>`;
  const closeDialog = () => removeModalOverlay(overlay);
  openAppendedModalOverlay(overlay, closeDialog);
  bindDetachedModalSyncRefresh({
    overlay,
    id,
    opener: openSunSessionDetail,
    exists: sessionId => uiDeps.getSessions().some(s => s.id === sessionId),
  });
}

// Per-channel chip value — small inline real-unit number rendered on
// the chip. Channel-aware so units match what the user expects:
//   vitamin_d → IU
//   nir_solar → J/cm²
//   circadian → estimated melanopic-equivalent illuminance for modeled SPDs
//   no_cv / pomc / violet_eye → no invented percentage; label only
// Returns '' when a compact chip should use its plain signal label.
function _sessionChipValue(channelKey, channelAu, sess) {
  if (!Number.isFinite(channelAu) || channelAu <= 0) return '';
  const fitz = sess?.safety?.fitzpatrick || 'I';
  const uvi = sess?.atmosphere?.uvIndex ?? null;
  const dur = resolvedSessionDurationMin(sess) || 0;
  // Mirror formatChannelUnit's too-short gate: short sessions get the
  // icon + label only, no spurious value. Keeps the chip readable
  // without misleading numbers.
  if (dur > 0 && dur < uiDeps.tooShortForChannelVerdictMin) return '';
  if (channelKey === 'vitamin_d' && typeof uiDeps.vitaminDIU === 'function') {
    // Session chip uses per-session cap when bodyFraction is set
    // (Audit P1 #8). Falls back to daily-cap helper for legacy chip
    // contexts where bodyFraction wasn't recorded.
    const bf = sess?.bodyExposure?.fraction;
    const iu = (Number.isFinite(bf) && bf > 0 && typeof uiDeps.vitaminDIUPerSession === 'function')
      ? uiDeps.vitaminDIUPerSession(channelAu, fitz, uvi, !!sess?.bodyExposure?.rotatedSides, state.importedData?.genetics || null, bf)
      : uiDeps.vitaminDIU(channelAu, fitz, uvi, !!sess?.bodyExposure?.rotatedSides, state.importedData?.genetics || null);
    if (iu < 30) return '';
    if (iu >= 1000) return `~${(iu / 1000).toFixed(1).replace(/\.0$/, '')}k IU-eq`;
    return `~${Math.round(iu / 10) * 10} IU-eq`;
  }
  if (channelKey === 'nir_solar' && typeof uiDeps.pbmJoulesPerCm2 === 'function') {
    const j = uiDeps.pbmJoulesPerCm2(channelAu);
    if (j < 0.1) return '';
    if (j >= 10) return `${Math.round(j)} J/cm²`;
    return `${j.toFixed(1)} J/cm²`;
  }
  if (channelKey === 'circadian' && dur > 0 && typeof uiDeps.circadianMelanopicLux === 'function') {
    const lux = uiDeps.circadianMelanopicLux(channelAu, dur);
    if (lux < 100) return '';
    // Round aggressively at this magnitude; this is an SPD-model estimate.
    if (lux >= 10000) return `~${Math.round(lux / 1000)}k est. mel lx`;
    if (lux >= 1000) return `~${(lux / 1000).toFixed(1)}k est. mel lx`;
    return `~${Math.round(lux / 10) * 10} est. mel lx`;
  }
  return '';
}

export function renderChannelChips(doses, sess = null) {
  if (!doses) return '';
  const order = ['vitamin_d', 'pomc', 'no_cv', 'violet_eye', 'circadian', 'nir_solar'];
  // Top-3 contributing channels for at-a-glance reading. Full grid lives on
  // the Light & Sun page; per-row noise is what the v1.7.0a UX review flagged.
  const logged = order
    .map(key => ({ key, v: doses[key] || 0 }))
    .filter(row => Number.isFinite(row.v) && row.v > 0);
  const showAll = logged.length > 3;
  const visible = showAll ? logged.slice(0, 3) : logged;
  const chipFor = (r, extraClass = '') => {
    const meta = uiDeps.channelDisplay[r.key];
    const label = meta?.label || r.key.replace('_', ' ');
    const valueStr = _sessionChipValue(r.key, r.v, sess);
    const tip = valueStr
      ? `${meta?.what || ''} — this session: ${valueStr}. Open channel details.`
      : `${meta?.what || ''} — sunlight signal logged. Open channel details.`;
    const ariaLabel = `${label}${valueStr ? `, this session ${valueStr}` : ', sunlight signal logged'}. Open channel details.`;
    return `<button type="button" class="sun-chip sun-chip-tier-2${extraClass}" data-channel="${r.key}" ${sunSessionActionAttrs('open-channel', { channel: r.key })} title="${escapeAttr(tip)}" aria-label="${escapeAttr(ariaLabel)}">
      <span class="sun-chip-icon">${meta?.icon || '·'}</span>
      <span class="sun-chip-label">${escapeHTML(label)}</span>
      ${valueStr ? `<span class="sun-chip-value">${escapeHTML(valueStr)}</span>` : ''}
    </button>`;
  };
  let html = `<div class="sun-channel-chips">`;
  for (const r of visible) html += chipFor(r);
  if (showAll) {
    const hiddenCount = logged.length - 3;
    const channelWord = hiddenCount === 1 ? 'channel' : 'channels';
    html += `<button type="button" class="sun-chip-more" ${sunSessionActionAttrs('toggle-chips', { hiddenCount })} aria-expanded="false" aria-label="Show ${hiddenCount} additional light ${channelWord}">
      <span class="sun-chip-more-collapsed">+ ${hiddenCount} more ${channelWord}</span>
      <span class="sun-chip-more-expanded">Show fewer</span>
    </button>`;
    for (const r of logged.slice(3)) html += chipFor(r, ' sun-chip-extra');
  }
  html += `</div>`;
  return html;
}

// ─── UI: detailed session log (anatomical regions + sunscreen + glass) ─

export function openDetailedSessionDialog() {
  const configuredFitz = state.importedData?.sunDefaults?.fitzpatrick || null;
  if (!/^(I|II|III|IV|V|VI)$/.test(String(configuredFitz || ''))) {
    showNotification(
      'Confirm your Fitzpatrick skin type in Light setup before logging a sun session.',
      'info',
      7000,
    );
    uiDeps.openLightSetup();
    return false;
  }
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const lastUsed = uiDeps.getSessions().filter(s => s.endedAt).slice(-1)[0];
  const eyeMode = lastUsed?.eyeExposure?.mode || 'direct';
  const lensTint = lastUsed?.eyeExposure?.lensTint || 'clear';
  const lastRegions = new Set(lastUsed?.bodyExposure?.regions || []);

  // Default the "Ended at" picker to now so quick "log the session that just
  // ended" stays one-click. Users backfilling earlier sessions can pick any
  // moment up to the present. <input type="datetime-local"> needs a local-tz
  // string; build it manually so we don't rely on the browser's locale guess.
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fmtLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const localNow = fmtLocal(now);
  // Started-at defaults to now − 15 min so the most-common quick-log
  // ("I just had a 15-min session") works with zero edits. Users
  // logging older sessions adjust both timestamps.
  const localStartDefault = fmtLocal(new Date(now.getTime() - 15 * 60 * 1000));

  // Region picker as a checkable chip grid — clearer than a tap-target SVG
  // silhouette per the v1.7.0a UX review. Each chip shows the region label
  // and toggles on click. Free-form, accessible, mobile-friendly.

  overlay.innerHTML = renderPastSessionLogModal({
    lastUsed,
    lastRegions,
    eyeMode,
    lensTint,
    localStartDefault,
    localNow,
    eyeModes: uiDeps.eyeModes,
    lensTints: uiDeps.lensTints,
    postureOptions: uiDeps.postureOptions,
    surfaceOptions: uiDeps.surfaceOptions,
  });
  const closeDialog = () => removeModalOverlay(overlay);
  openAppendedModalOverlay(overlay, closeDialog);

  const selected = bindPastSessionRegionPicker(overlay, lastRegions);
  bindPastSessionDurationHint(overlay);

  const saveButton = overlay.querySelector('#det-save');
  if (!saveButton) return closeDialog();
  saveButton.addEventListener('click', async () => {
    const eyeModeVal = /** @type {HTMLSelectElement | null} */ (overlay.querySelector('#det-eye-mode'))?.value || 'direct';
    const lensTintVal = /** @type {HTMLSelectElement | null} */ (overlay.querySelector('#det-lens-tint'))?.value || 'clear';
    const spf = parseInt(/** @type {HTMLInputElement | null} */ (overlay.querySelector('#det-spf'))?.value || '', 10) || null;
    const glass = !!/** @type {HTMLInputElement | null} */ (overlay.querySelector('#det-glass'))?.checked;
    const modeledEyeMode = glass && eyeModeVal === 'direct' ? 'glass-window' : eyeModeVal;
    const notes = /** @type {HTMLTextAreaElement | null} */ (overlay.querySelector('#det-notes'))?.value || '';

    // Resolve the two timestamps. Both fields default to a sensible
    // 15-min window ending now, so the empty-field fallback never fires
    // in practice — but we guard anyway in case a user clears one.
    const startedAtRaw = /** @type {HTMLInputElement | null} */ (overlay.querySelector('#det-started-at'))?.value || '';
    const endedAtRaw = /** @type {HTMLInputElement | null} */ (overlay.querySelector('#det-ended-at'))?.value || '';
    const endedMsRaw = endedAtRaw ? new Date(endedAtRaw).getTime() : Date.now();
    const startedMsRaw = startedAtRaw
      ? new Date(startedAtRaw).getTime()
      : (endedMsRaw - 15 * 60 * 1000);
    if (!Number.isFinite(startedMsRaw) || !Number.isFinite(endedMsRaw)) {
      showNotification('Invalid Started at / Ended at — check the times', 'error');
      return;
    }
    if (startedMsRaw >= endedMsRaw) {
      showNotification('Ended at must be after Started at', 'error');
      return;
    }
    const endedAt = Math.min(endedMsRaw, Date.now());
    const start = Math.min(startedMsRaw, endedAt - 60 * 1000);
    const durationMin = Math.max(1, (endedAt - start) / 60000);

    // Compute exposure fraction from selected regions
    const regions = Array.from(selected);
    const fraction = regions.reduce((sum, key) => {
      const r = BODY_REGIONS.find(b => b.key === key);
      return sum + (r?.fraction || 0);
    }, 0);
    const posture = /** @type {HTMLSelectElement | null} */ (overlay.querySelector('#det-posture'))?.value || 'standing';
    const surfaceAlbedo = /** @type {HTMLSelectElement | null} */ (overlay.querySelector('#det-surface'))?.value || 'grass';
    // Resolve coordinates so hydrateSession has somewhere to fetch
    // atmosphere from. Without this the past-session save records the
    // session but `useLat == null` short-circuits hydration → channels
    // and safety stay null forever and the detail modal opens to a
    // mostly-empty card. quickLogSunSession resolves coords before
    // calling startSession; the after-the-fact path needs the same step.
    const location = uiDeps.getSunCoords();
    const sessId = await uiDeps.logCompletedSession({
      startedAt: start,
      endedAt,
      location,
      bodyExposure: { preset: regions.length === 0 ? 'covered' : 'detailed', fraction: regions.length === 0 ? 0 : fraction, regions, sunscreenSPF: spf, glassBetween: glass },
      eyeExposure: { mode: modeledEyeMode, lensTint: lensTintVal, durationSec: durationMin * 60 },
      posture, surfaceAlbedo,
      notes,
    });
    if (sessId) await uiDeps.hydrateSession(sessId);
    closeDialog();
    showNotification(`Detailed session saved: ${Math.round(durationMin)} min, ${regions.length} regions.`);
    refreshLightView();
  });
}

// User-facing delete entry point shared by delegated UI actions.
export async function deleteSunSession(id) {
  if (await showConfirmDialog('Delete this sun session?')) {
    await uiDeps.deleteSession(id);
    uiDeps.refreshSurfaces();
  }
}

export async function retrySunSessionCalculation(id) {
  const sess = uiDeps.getSessions().find(s => s.id === id);
  if (!sess) return;
  const fallback = uiDeps.getSunCoords?.();
  const coords = sess.location?.lat != null && sess.location?.lon != null
    ? { lat: sess.location.lat, lon: sess.location.lon }
    : fallback;
  if (!coords || coords.lat == null || coords.lon == null) {
    showNotification('Add a ZIP code or allow phone location before retrying this calculation.', 'error', 7000);
    return;
  }
  const hydrated = await uiDeps.hydrateSession(id, coords);
  uiDeps.refreshSurfaces();
  if (hydrated?.calculationStatus === 'computed') {
    showNotification('Session estimates recalculated.', 'success');
  } else {
    showNotification('Session estimates are still unavailable. Try again when conditions data is reachable.', 'error', 7000);
  }
}

// ─── Session actions ───────────────────────────────────────────────────

// User-facing edit-duration entry point — prompts for a new minutes
// value, validates the range, calls updateSession (which bumps
// updatedAt + re-hydrates doses on duration change), then re-renders.
export async function editSunSessionDuration(id) {
  const sess = uiDeps.getSessions().find(s => s.id === id);
  if (!sess) {
    showNotification('Session not found', 'error');
    return;
  }
  const current = Math.max(0, Math.round(sess.durationMin || 0));
  const raw = await showPromptDialog('New duration (in minutes)', {
    defaultValue: String(current),
    okLabel: 'Save',
    placeholder: 'e.g. 26',
  });
  if (raw === null) return; // user cancelled
  const parsed = parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 600) {
    showNotification('Enter a duration between 0 and 600 minutes.', 'error');
    return;
  }
  const next = Math.round(parsed);
  if (next === current) return; // nothing to do
  const updated = await uiDeps.updateSession(id, { durationMin: next });
  if (updated?.calculationStatus === 'computed') {
    showNotification(`Session duration set to ${next} min and estimates recalculated.`, 'success');
  } else if (updated?.calculationStatus === 'needs-location') {
    showNotification(`Session duration set to ${next} min. Add a ZIP code or allow phone location to recalculate estimates.`, 'info', 7000);
  } else {
    showNotification(`Session duration set to ${next} min, but estimates are unavailable. Open the session to retry.`, 'error', 7000);
  }
  refreshLightView();
}
