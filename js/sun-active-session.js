// @ts-check
// sun-active-session.js — active sun-session UI and live dose ticker.
import { state } from './state.js';
import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import { BODY_REGIONS, renderBodySilhouette, bindBodySilhouette } from './sun-body-silhouette.js';
import { POSTURE_MULTIPLIERS, SURFACE_ALBEDO } from './sun-session-model.js';
import { renderChannelChips } from './sun-session-ui.js';
import { setSunChannelChipsExpanded } from './sun-session-actions.js';
import { activeElapsedMs as _activeElapsedMs, formatElapsed as _formatElapsed, plainStopSummary } from './sun-active-session-format.js';

/**
 * @typedef {object} SunActiveSessionDeps
 * @property {() => any[]} getSessions
 * @property {() => any} getActiveSession
 * @property {(opts?: any) => Promise<any>} startSession
 * @property {(id: any) => Promise<any>} stopSession
 * @property {(id: any, coords?: any) => Promise<any>} hydrateSession
 * @property {() => any} getSunCoords
 * @property {() => Promise<void> | void} saveImportedData
 * @property {(atm: any) => any} applyAtmOverrides
 * @property {() => void} refreshSurfaces
 * @property {(raw: any) => string} normalizePSMTier
 * @property {(tier?: any) => number|null} photosensitiveMedScale
 * @property {() => void} openLightSetup
 * @property {Array<{ key: string, label: string, pickerLabel?: string }>} eyeModes
 * @property {Array<{ key: string, label: string }>} lensTints
 * @property {Array<{ key: string, label: string }>} postureOptions
 * @property {Array<{ key: string, label: string }>} surfaceOptions
 * Runtime math/render hooks are also configured here; defaults are no-ops.
 */

/** @type {SunActiveSessionDeps & Record<string, any>} */
const activeDeps = {
  getSessions: () => [],
  getActiveSession: () => null,
  startSession: async () => null,
  stopSession: async () => null,
  hydrateSession: async () => null,
  getSunCoords: () => null,
  saveImportedData: async () => {},
  applyAtmOverrides: (atm) => atm,
  refreshSurfaces: () => {},
  normalizePSMTier: (raw) => raw || 'none',
  photosensitiveMedScale: () => 1.0,
  openLightSetup: () => {},
  eyeModes: [], lensTints: [], postureOptions: [], surfaceOptions: [],
  fetchAtmosphere: async () => null, reconstructSpectrum: () => null,
  computeChannelDoses: () => ({}), erythemalSED: () => 0,
  ocularActinicUVdose: () => 0,
  fractionOfMED: () => 0, solarZenithAngle: () => 90,
  interpolateAtmosphere: () => null,
  vitaminDIU: channelAu => channelAu * 60,
  vitaminDIUPerSession: null,
  skinTypeToFitzpatrick: (skinType) => (String(skinType || '').match(/^(I{1,3}|IV|VI?)\b/) || [])[1] || null,
  renderLightChannelsLive: () => {}, renderLightTodayStrip: () => '',
};

/** @param {(Partial<SunActiveSessionDeps> & Record<string, any>)} [deps] */
export function configureSunActiveSession(deps = {}) { Object.assign(activeDeps, deps); }

export { POSTURE_MULTIPLIERS, SURFACE_ALBEDO } from './sun-session-model.js';
export { _formatElapsed };

export async function quickLogSunSession() {
  const active = activeDeps.getActiveSession();
  if (active) {
    await activeDeps.stopSession(active.id);
    await hydrateSunSessionFromProfileCoords(active.id);
    const sess = activeDeps.getSessions().find(s => s.id === active.id);
    const dur = Math.round(sess?.durationMin || 0);
    const summary = _plainStopSummary(sess, dur);
    showNotification(summary, summary.includes('stop UV exposure') ? 'error' : 'success', 7000);
    activeDeps.refreshSurfaces();
    return true;
  }
  return openStartSunSessionDialog();
}

async function _fetchCurrentUVI() {
  const coords = activeDeps.getSunCoords();
  if (!coords) return null;
  try {
    const atm = await activeDeps.fetchAtmosphere({
      lat: coords.lat, lon: coords.lon, isoTime: new Date().toISOString(),
    });
    const overridden = activeDeps.applyAtmOverrides(atm);
    return overridden?.uvIndex ?? null;
  } catch (e) { return null; }
}

function _estimateMedMinutes(uvi, fitzpatrick, psmTier) {
  if (!Number.isFinite(uvi) || uvi <= 0) return null;
  const fitzMED = { I: 200, II: 250, III: 300, IV: 450, V: 600, VI: 1000 };
  const baseMED = fitzMED[fitzpatrick] ?? fitzMED.III;
  const med = baseMED * (activeDeps.photosensitiveMedScale(psmTier) || 1.0);
  const irradiance = uvi * 25; // 1 UVI unit = 25 mW/m² CIE-erythemal irradiance.
  const seconds = (med * 1000) / irradiance;
  return Math.round(seconds / 60);
}

function _renderUVIPreflightBanner(uvi, fitzpatrick, psmTier, fitzpatrickAssumed = false) {
  if (!Number.isFinite(uvi)) return '';
  const psmHigh = psmTier === 'moderate' || psmTier === 'severe';
  const fairSkin = fitzpatrick === 'I' || fitzpatrick === 'II';
  if (uvi < 8 && !psmHigh && !fairSkin) return '';
  if (uvi < 5 && !psmHigh) return '';
  const medMin = _estimateMedMinutes(uvi, fitzpatrick, psmTier);
  let cls = 'sun-uvi-warn';
  let icon = '☀';
  let title = '';
  if (uvi >= 11) { cls = 'sun-uvi-extreme'; icon = '⚠'; title = `Extreme UV (UVI ${uvi.toFixed(1)})`; }
  else if (uvi >= 8) { cls = 'sun-uvi-veryhigh'; title = `Very high UV (UVI ${uvi.toFixed(1)})`; }
  else { title = `UV ${uvi.toFixed(1)} — burn risk elevated ${psmHigh ? 'by photosensitizer' : 'for fair skin'}`; }
  const medLine = medMin
    ? `${fitzpatrickAssumed ? 'Conservative Type I assumption because skin type is unset' : `Fitzpatrick ${fitzpatrick} base-MED model`}: ~${medMin} min to the modeled base MED under current UVI—not a safe exposure time.`
    : '';
  const medicationLine = psmTier !== 'none'
    ? ' Medication effects are not included because a drug-specific burn threshold cannot be inferred; follow the label or clinician.'
    : '';
  return `<div class="${cls}"><strong>${icon} ${escapeHTML(title)}</strong> ${escapeHTML(medLine + medicationLine)} Use shade, clothing, and suitable sun protection; shorten or skip the session when warnings apply.</div>`;
}

function _buildStartSessionToast({ regionCount, uvi, psmTier, eyeMode }) {
  const parts = [`Outdoor session started · ${regionCount} region${regionCount === 1 ? '' : 's'} exposed`];
  const notes = [];
  if (Number.isFinite(uvi) && uvi >= 11) notes.push(`extreme UV ${uvi.toFixed(1)}`);
  else if (Number.isFinite(uvi) && uvi >= 8) notes.push(`high UV ${uvi.toFixed(1)}`);
  const tier = activeDeps.normalizePSMTier(psmTier);
  if (tier === 'unknown') notes.push('sunlight warnings not reviewed');
  else if (tier !== 'none') notes.push(`${tier} photosensitivity caution`);
  if (eyeMode === 'direct') notes.push('eyes uncovered');
  if (notes.length) parts.push(`${notes.join(' + ')} · keep it short`);
  return parts.join(' · ');
}

export async function openStartSunSessionDialog() {
  const configuredFitz = state.importedData?.sunDefaults?.fitzpatrick || null;
  if (!/^(I|II|III|IV|V|VI)$/.test(String(configuredFitz || ''))) {
    showNotification(
      'Confirm your Fitzpatrick skin type in Light setup before starting a session. It anchors the UV and skin-response estimates.',
      'info',
      7000,
    );
    activeDeps.openLightSetup();
    return false;
  }
  const startCoords = activeDeps.getSunCoords();
  if (!startCoords || startCoords.source === 'country-band') {
    showNotification(
      startCoords?.source === 'country-band'
        ? 'A country-level location is too broad for live UV safety guidance. Add a home postal area or use your privacy-rounded current location today before starting.'
        : 'A location is needed for live UV safety guidance. Add a home location or use your privacy-rounded current location today before starting.',
      'info',
      8000,
    );
    activeDeps.openLightSetup();
    return false;
  }
  const last = activeDeps.getSessions().filter(s => s.endedAt).slice(-1)[0];
  const lastRegions = new Set(last?.bodyExposure?.regions || []);
  const defaultEye = last?.eyeExposure?.mode || 'direct';
  const defaultLens = last?.eyeExposure?.lensTint || 'clear';
  const defaultGlass = !!last?.bodyExposure?.glassBetween;
  const defaultPosture = last?.posture || 'standing';
  const defaultSurface = last?.surfaceAlbedo || 'grass';
  const fitz = configuredFitz;
  const psm = state.importedData?.sunDefaults?.photosensitiveMeds ?? 'unknown';
  const uviPromise = _fetchCurrentUVI();
  let latestPreflightUvi = null;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal sun-start-modal" role="dialog" aria-label="Start sun session">
    <div class="modal-header">
      <h3>Start a sun session</h3>
      <button type="button" class="modal-close" data-sun-start-close aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <div id="sun-start-uvi-banner" class="sun-start-uvi-banner" hidden></div>
      <p class="modal-body-hint">Tap each body region that's uncovered right now. The session begins as soon as you hit Start.</p>
      <div class="sun-silhouette-wrap" id="sun-start-silhouette-slot">${renderBodySilhouette(lastRegions)}</div>
      <div class="sun-silhouette-hint-row" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div class="sun-silhouette-hint" id="sun-start-hint">Tap any body region to toggle whether it's uncovered.</div>
        <button type="button" class="ctx-btn-option" id="sun-start-clear" style="padding:2px 10px;font-size:11px">Clear</button>
      </div>

      <details class="sun-start-details">
        <summary>Posture, surface, eyewear, sunscreen, glass — change defaults</summary>
        <div class="sun-detailed-row" style="margin-top:10px">
          <label class="ctx-label">Posture
            <select id="start-posture" class="ctx-select">
              ${activeDeps.postureOptions.map(o => `<option value="${escapeAttr(o.key)}"${o.key === defaultPosture ? ' selected' : ''}>${escapeHTML(o.label)}</option>`).join('')}
            </select>
          </label>
          <label class="ctx-label">Surface
            <select id="start-surface" class="ctx-select">
              ${activeDeps.surfaceOptions.map(o => `<option value="${escapeAttr(o.key)}"${o.key === defaultSurface ? ' selected' : ''}>${escapeHTML(o.label)}</option>`).join('')}
            </select>
          </label>
        </div>
        <p class="sun-detailed-glass-hint">Choose a protected-eye option only when the lenses are labeled UV-blocking. Dark tint alone does not prove UV protection.</p>
        <p class="sun-detailed-glass-hint">Lying flat catches more sun than standing (~40%). Reflective surfaces (sand, water, snow) bounce UV onto your skin from below.</p>
        <div class="sun-detailed-row" style="margin-top:10px">
          <label class="ctx-label">Eyes
            <select id="start-eye-mode" class="ctx-select">
              ${activeDeps.eyeModes.map(e => `<option value="${escapeAttr(e.key)}"${e.key === defaultEye ? ' selected' : ''}>${escapeHTML(e.pickerLabel || e.label)}</option>`).join('')}
            </select>
          </label>
          <label class="ctx-label">Lens tint
            <select id="start-lens-tint" class="ctx-select">
              ${activeDeps.lensTints.map(l => `<option value="${escapeAttr(l.key)}"${l.key === defaultLens ? ' selected' : ''}>${escapeHTML(l.label)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="ctx-label sun-detailed-glass" style="margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:12px">
          <span style="flex:1;min-width:0">Behind glass (window / car / sunroom)</span>
          <label class="toggle-switch">
            <input type="checkbox" id="start-glass"${defaultGlass ? ' checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <p class="sun-detailed-glass-hint">Ordinary window glass usually blocks most vitamin-D-effective UVB but can pass some UVA, visible light, and near-infrared. Glass types vary, so the model uses a generic wavelength-by-wavelength estimate and never treats glass as guaranteed UV protection. Light tools → Window check compares camera-visible light only; it cannot measure your glass's UV protection.</p>
        <p class="sun-detailed-glass-hint">If you turn over later, use <strong>Side change</strong> at that moment. It records the timing boundary without multiplying the dose; use <strong>Coverage</strong> too if different skin becomes exposed.</p>
      </details>

      <div class="modal-actions" style="margin-top:18px">
        <button type="button" class="import-btn import-btn-secondary" data-sun-start-close>Cancel</button>
        <button class="import-btn import-btn-primary" id="start-confirm">☀ Start session</button>
      </div>
    </div>
  </div>`;
  const closeDialog = () => removeModalOverlay(overlay);
  overlay.querySelectorAll('[data-sun-start-close]').forEach(btn => {
    btn.addEventListener('click', closeDialog);
  });
  openAppendedModalOverlay(overlay, closeDialog);

  const selected = new Set(lastRegions);
  const slot = overlay.querySelector('#sun-start-silhouette-slot');
  const hint = overlay.querySelector('#sun-start-hint');
  const confirm = overlay.querySelector('#start-confirm');
  if (!(slot instanceof HTMLElement) || !(hint instanceof HTMLElement) || !(confirm instanceof HTMLElement)) { closeDialog(); return false; }
  const updateHint = () => {
    const fraction = Array.from(selected).reduce((sum, key) => {
      const r = BODY_REGIONS.find(b => b.key === key);
      return sum + (r?.fraction || 0);
    }, 0);
    if (selected.size === 0) {
      hint.textContent = 'Tap any body region to toggle whether it\'s uncovered.';
    } else {
      const labels = Array.from(selected).map(k => BODY_REGIONS.find(b => b.key === k)?.label || k).join(', ');
      const pctLabel = fraction >= 0.94 ? 'full body' : `${(fraction * 100).toFixed(0)}% of skin`;
      hint.textContent = `${selected.size} region${selected.size === 1 ? '' : 's'} exposed (${pctLabel}) — ${labels}`;
    }
  };
  overlay.querySelector('#sun-start-clear')?.addEventListener('click', () => {
    selected.clear();
    slot.innerHTML = renderBodySilhouette(selected);
    updateHint();
  });
  bindBodySilhouette(slot, selected, updateHint);
  updateHint();

  uviPromise.then((uvi) => {
    if (!Number.isFinite(uvi)) return;
    latestPreflightUvi = uvi;
    const banner = overlay.querySelector('#sun-start-uvi-banner');
    if (!(banner instanceof HTMLElement)) return;
    const html = _renderUVIPreflightBanner(uvi, fitz, psm, !configuredFitz);
    if (html) {
      banner.innerHTML = html;
      banner.hidden = false;
    }
  }).catch(() => {});

  confirm.addEventListener('click', async () => {
    const eyeMode = /** @type {HTMLSelectElement | null} */ (overlay.querySelector('#start-eye-mode'))?.value || 'direct';
    const lensTint = /** @type {HTMLSelectElement | null} */ (overlay.querySelector('#start-lens-tint'))?.value || 'clear';
    const glassBetween = !!/** @type {HTMLInputElement | null} */ (overlay.querySelector('#start-glass'))?.checked;
    const posture = /** @type {HTMLSelectElement | null} */ (overlay.querySelector('#start-posture'))?.value || 'standing';
    const surfaceAlbedo = /** @type {HTMLSelectElement | null} */ (overlay.querySelector('#start-surface'))?.value || 'grass';
    const modeledEyeMode = glassBetween && eyeMode === 'direct' ? 'glass-window' : eyeMode;
    const regions = Array.from(selected);
    if (regions.length === 0) {
      hint.textContent = 'Tap at least one region before starting — what part of you is uncovered?';
      hint.classList.add('sun-silhouette-hint-error');
      setTimeout(() => hint.classList.remove('sun-silhouette-hint-error'), 2500);
      return;
    }
    const id = await activeDeps.startSession({ regions, eyeMode: modeledEyeMode, lensTint, glassBetween, posture, surfaceAlbedo, rotatedSides: false, location: startCoords });
    closeDialog();
    showNotification(_buildStartSessionToast({
      regionCount: regions.length,
      uvi: latestPreflightUvi,
      psmTier: state.importedData?.sunDefaults?.photosensitiveMeds,
      eyeMode: modeledEyeMode,
    }), 'success', 4500);
    activeDeps.refreshSurfaces();
    ensureActiveTicker();
    return id;
  });
  return true;
}

function _plainStopSummary(session, durationMin) {
  return plainStopSummary(session, durationMin, {
    vitaminDIU: activeDeps.vitaminDIU,
    vitaminDIUPerSession: activeDeps.vitaminDIUPerSession,
    genetics: state.importedData?.genetics,
  });
}

let _activeTicker = null;
const _liveState = new Map();

function _getLiveState(id) { return _liveState.get(id) || null; }
export function setSunLiveState(id, patch) {
  const cur = _liveState.get(id) || {};
  _liveState.set(id, Object.assign(cur, patch));
}
export function clearSunLiveState(id) { _liveState.delete(id); }

async function _snapshotActiveRate(sess) {
  const cur = _getLiveState(sess.id);
  if (cur && cur.ratePerMin) return cur;
  if (cur && cur.pending) return null;
  setSunLiveState(sess.id, { pending: true });
  try {
    const {
      reconstructSpectrum,
      computeChannelDoses,
      erythemalSED,
      fractionOfMED,
      solarZenithAngle,
      fetchAtmosphere,
    } = activeDeps;
    const coords = sess.location || activeDeps.getSunCoords();
    if (!coords) return null;
    const now = new Date();
    let atm = await fetchAtmosphere({ lat: coords.lat, lon: coords.lon, isoTime: now.toISOString() });
    atm = activeDeps.applyAtmOverrides(atm);
    const priorAtm = _getLiveState(sess.id)?.atm;
    if (priorAtm && Number.isFinite(priorAtm.uvIndex) && Number.isFinite(atm?.uvIndex)) {
      const primarySrc = (s) => String(s || '').split('+')[0];
      const sourcesDiffer = primarySrc(priorAtm.source) !== primarySrc(atm.source);
      const priorConf = priorAtm.confidence ?? 0.6;
      const newConf = atm.confidence ?? 0.6;
      const downgraded = newConf < priorConf - 0.15;
      const uviDelta = Math.abs(atm.uvIndex - priorAtm.uvIndex);
      const largeJump = priorAtm.uvIndex > 0 && uviDelta > priorAtm.uvIndex * 0.25;
      if (sourcesDiffer && downgraded && largeJump) {
        atm = { ...priorAtm, _sourceFlipBlocked: { from: priorAtm.source, to: atm.source, attemptedUvi: atm.uvIndex, at: Date.now() } };
      }
    }
    const zenith = solarZenithAngle(now, coords.lat, coords.lon);
    const spectrum = reconstructSpectrum({
      zenithDeg: zenith,
      ozoneDU: atm.ozoneDU ?? 300,
      altitudeM: coords.altitudeM ?? 0,
      cloudCover: (atm.cloudCover ?? 0) / 100,
      aod: atm?.airQuality?.aod ?? null,
      targetUVI: atm.uvIndex ?? null,
    });
    const liveBodyModifiers = {
      glassBetween: !!sess.bodyExposure?.glassBetween,
      sunscreenSPF: sess.bodyExposure?.sunscreenSPF || 0,
    };
    const modeledEyeExposure = liveBodyModifiers.glassBetween && sess.eyeExposure?.mode === 'direct'
      ? { ...sess.eyeExposure, mode: 'glass-window' }
      : sess.eyeExposure;
    const ratePerMin = computeChannelDoses({
      spectrum,
      durationMin: 1,
      bodyExposureFraction: sess.bodyExposure?.fraction ?? 0,
      skinIrradianceMultiplier: Math.max(0, Math.min(2,
        (POSTURE_MULTIPLIERS[sess.posture] ?? 1.0)
        * (1 + (SURFACE_ALBEDO[sess.surfaceAlbedo] ?? 0) * 0.5))),
      eyeExposure: modeledEyeExposure,
      bodyModifiers: liveBodyModifiers,
    });
    const sedPerMin = erythemalSED({
      spectrum,
      durationMin: 1,
      bodyExposureFraction: sess.bodyExposure?.fraction ?? 0,
      skinIrradianceMultiplier: Math.max(0, Math.min(2,
        (POSTURE_MULTIPLIERS[sess.posture] ?? 1.0)
        * (1 + (SURFACE_ALBEDO[sess.surfaceAlbedo] ?? 0) * 0.5))),
      bodyModifiers: liveBodyModifiers,
    });
    const lcSkin = state.importedData?.lightCircadian?.skinType;
    const lcRoman = lcSkin && activeDeps.skinTypeToFitzpatrick(lcSkin);
    const configuredFitzpatrick = state.importedData?.sunDefaults?.fitzpatrick || lcRoman || null;
    const fitzpatrick = configuredFitzpatrick || 'I';
    const psmTier = activeDeps.normalizePSMTier(state.importedData?.sunDefaults?.photosensitiveMeds);
    const medScale = activeDeps.photosensitiveMedScale(psmTier);
    const existing = _getLiveState(sess.id) || {};
    const isReSnapshot = !!existing.committedDoses;
    const sliceStart = isReSnapshot ? Date.now() : sess.startedAt;
    setSunLiveState(sess.id, {
      ratePerMin, sedPerMin, fitzpatrick, fitzpatrickAssumed: !configuredFitzpatrick, medScale, psmTier, atm, zenith,
      baselineZenith: existing.baselineZenith ?? zenith,
      snapshotAt: sliceStart,
      committedDoses: existing.committedDoses || {},
      committedSED: existing.committedSED || 0,
      committedRetinalUV: existing.committedRetinalUV || 0,
      fractionOfMEDFn: fractionOfMED,
      pending: false,
    });
    return _getLiveState(sess.id);
  } catch (e) {
    globalThis.console?.warn?.('snapshotActiveRate failed', e);
    setSunLiveState(sess.id, { pending: false });
    return null;
  }
}

function _rateAtInstant(sess, instantMs) {
  const live = _getLiveState(sess?.id);
  if (!live || !live.atm) return null;
  const {
    reconstructSpectrum,
    computeChannelDoses,
    erythemalSED,
    solarZenithAngle,
    interpolateAtmosphere,
  } = activeDeps;

  const coords = sess.location;
  if (!coords) return null;
  const when = new Date(instantMs);
  const isoTime = when.toISOString();
  let atmAtT = live.atm;
  if (interpolateAtmosphere) {
    const interp = interpolateAtmosphere(live.atm, isoTime);
    if (interp) {
      atmAtT = {
        ...live.atm,
        uvIndex: interp.uvIndex ?? live.atm.uvIndex,
        cloudCover: interp.cloudCover ?? live.atm.cloudCover,
        temperatureC: interp.temperatureC ?? live.atm.temperatureC,
      };
    }
  }
  atmAtT = activeDeps.applyAtmOverrides(atmAtT);

  const baseFraction = sess.bodyExposure?.fraction ?? 0;
  const postureMult = POSTURE_MULTIPLIERS[sess.posture] ?? 1.0;
  const albedoMult = 1 + (SURFACE_ALBEDO[sess.surfaceAlbedo] ?? 0) * 0.5;
  const skinIrradianceMultiplier = Math.max(0, Math.min(2, postureMult * albedoMult));

  const zenith = solarZenithAngle(when, coords.lat, coords.lon);
  const spectrum = reconstructSpectrum({
    zenithDeg: zenith,
    ozoneDU: atmAtT.ozoneDU ?? 300,
    altitudeM: coords.altitudeM ?? 0,
    cloudCover: (atmAtT.cloudCover ?? 0) / 100,
    aod: atmAtT?.airQuality?.aod ?? null,
    targetUVI: atmAtT.uvIndex ?? null,
  });
  const bodyModifiers = {
    glassBetween: !!sess.bodyExposure?.glassBetween,
    sunscreenSPF: sess.bodyExposure?.sunscreenSPF || 0,
  };
  const modeledEyeExposure = bodyModifiers.glassBetween && sess.eyeExposure?.mode === 'direct'
    ? { ...sess.eyeExposure, mode: 'glass-window' }
    : sess.eyeExposure;
  const rate = computeChannelDoses({
    spectrum,
    durationMin: 1,
    bodyExposureFraction: baseFraction,
    skinIrradianceMultiplier,
    eyeExposure: modeledEyeExposure,
    bodyModifiers,
  });
  const sedPerMin = erythemalSED({
    spectrum,
    durationMin: 1,
    bodyExposureFraction: baseFraction,
    skinIrradianceMultiplier,
    bodyModifiers,
  });
  const retinalUVPerMin = activeDeps.ocularActinicUVdose({
    spectrum,
    eyeExposure: { ...(modeledEyeExposure || {}), durationSec: 60 },
    zenithDeg: zenith,
    glassBetween: bodyModifiers.glassBetween,
  });
  return { rate, sedPerMin, retinalUVPerMin };
}

function _integrateSlice(sess, startMs, endMs) {
  const durationMin = Math.max(0, (endMs - startMs) / 60000);
  if (durationMin <= 0) return { doses: {}, sed: 0, retinalUV: 0 };
  const midMs = (startMs + endMs) / 2;
  const r0 = _rateAtInstant(sess, startMs);
  const r1 = _rateAtInstant(sess, midMs);
  const r2 = _rateAtInstant(sess, endMs);
  if (!r0 || !r1 || !r2) return { doses: {}, sed: 0, retinalUV: 0 };
  const doses = {};
  for (const k of Object.keys(r1.rate)) {
    const a = r0.rate[k] ?? 0;
    const m = r1.rate[k] ?? 0;
    const b = r2.rate[k] ?? 0;
    doses[k] = durationMin * (a + 4 * m + b) / 6;
  }
  const sed = durationMin * (r0.sedPerMin + 4 * r1.sedPerMin + r2.sedPerMin) / 6;
  const retinalUV = durationMin * (r0.retinalUVPerMin + 4 * r1.retinalUVPerMin + r2.retinalUVPerMin) / 6;
  return { doses, sed, retinalUV };
}

export function commitSunLiveSlice(sess) {
  const live = _getLiveState(sess?.id);
  if (!live || !live.ratePerMin || !live.snapshotAt) return null;
  const sliceStart = live.snapshotAt;
  const sliceEnd = Date.now();
  if (sliceEnd <= sliceStart) return null;
  const { doses, sed, retinalUV } = _integrateSlice(sess, sliceStart, sliceEnd);
  const committedDoses = { ...(live.committedDoses || {}) };
  for (const [k, v] of Object.entries(doses)) {
    committedDoses[k] = (committedDoses[k] || 0) + v;
  }
  const committedSED = (live.committedSED || 0) + sed;
  const committedRetinalUV = (live.committedRetinalUV || 0) + retinalUV;
  const segment = {
    startedAt: sliceStart,
    endedAt: sliceEnd,
    durationMin: (sliceEnd - sliceStart) / 60000,
    doses: { ...doses },
    sed,
    ocularActinicUV: retinalUV,
    bodyExposure: { ...(sess.bodyExposure || {}), regions: [...(sess.bodyExposure?.regions || [])] },
    eyeExposure: { ...(sess.eyeExposure || {}) },
    posture: sess.posture || 'standing',
    surfaceAlbedo: sess.surfaceAlbedo || 'grass',
    atmosphere: live.atm ? { ...live.atm } : null,
    zenith: live.zenith ?? null,
  };
  if (!Array.isArray(sess.exposureSegments)) sess.exposureSegments = [];
  sess.exposureSegments.push(segment);
  setSunLiveState(sess.id, { committedDoses, committedSED, committedRetinalUV, snapshotAt: sliceEnd });
  return segment;
}

export function liveDosesFor(sess) {
  const live = _getLiveState(sess?.id);
  if (!live) return null;
  if (sess?.paused) {
    const committed = live.committedDoses || {};
    const sed = live.committedSED || 0;
    const retinalUV = live.committedRetinalUV || 0;
    const medFraction = live.fractionOfMEDFn ? live.fractionOfMEDFn({ sed, fitzpatrick: live.fitzpatrick, medScale: live.medScale ?? 1.0 }) : 0;
    return { doses: { ...committed }, sed, retinalUV, medFraction, fitzpatrick: live.fitzpatrick, fitzpatrickAssumed: live.fitzpatrickAssumed, psmTier: live.psmTier, atm: live.atm, paused: true };
  }
  if (!live.ratePerMin) return null;
  const sliceStart = live.snapshotAt || sess.startedAt;
  const now = Date.now();
  const { doses: sliceDoses, sed: sliceSed, retinalUV: sliceRetinalUV } = _integrateSlice(sess, sliceStart, now);
  const committed = live.committedDoses || {};
  const doses = { ...committed };
  for (const [k, v] of Object.entries(sliceDoses)) {
    doses[k] = (doses[k] || 0) + v;
  }
  const sed = (live.committedSED || 0) + sliceSed;
  const retinalUV = (live.committedRetinalUV || 0) + sliceRetinalUV;
  const medFraction = live.fractionOfMEDFn ? live.fractionOfMEDFn({ sed, fitzpatrick: live.fitzpatrick, medScale: live.medScale ?? 1.0 }) : 0;
  return { doses, sed, retinalUV, medFraction, fitzpatrick: live.fitzpatrick, fitzpatrickAssumed: live.fitzpatrickAssumed, psmTier: live.psmTier, atm: live.atm };
}

function _renderActiveCardBody(sess) {
  const elapsed = _formatElapsed(_activeElapsedMs(sess));
  const live = liveDosesFor(sess);
  let medStr = '';
  if (live && Number.isFinite(live.medFraction)) {
    const pct = Math.round(live.medFraction * 100);
    let label = 'low modeled dose', cls = '';
    if (live.medFraction >= 1) { label = 'over threshold'; cls = 'over'; }
    else if (live.medFraction >= 0.7) { label = 'high'; cls = 'warn'; }
    else if (live.medFraction >= 0.3) { label = 'moderate'; cls = ''; }
    const medCaution = live.psmTier && live.psmTier !== 'none'
      ? ' Medication photosensitivity is not numerically included; your actual threshold may be lower.'
      : '';
    const skinAssumption = live.fitzpatrickAssumed ? ' Conservative Type I is assumed because skin type is unset.' : '';
    medStr = `<span class="sun-session-med ${cls}" title="Base skin-type burn dose so far — ${pct}% of Fitzpatrick ${escapeAttr(live.fitzpatrick)} MED.${escapeAttr(skinAssumption + medCaution)}">${pct}% base burn dose · ${escapeHTML(label)}${(skinAssumption || medCaution) ? ' ⚠' : ''}</span>`;
  }
  const channelChips = live?.doses ? renderChannelChips(live.doses, sess) : '';
  let vitaminDStr = '';
  if (live && live.doses?.vitamin_d > 0) {
    const elapsedMin = _activeElapsedMs(sess) / 60000;
    const fitz = live.fitzpatrick || sess.safety?.fitzpatrick || 'I';
    const uvi = live.atm?.uvIndex ?? sess.atmosphere?.uvIndex ?? null;
    const rotated = !!sess.bodyExposure?.rotatedSides;
    const bf = sess.bodyExposure?.fraction;
    const iu = (Number.isFinite(bf) && bf > 0 && typeof activeDeps.vitaminDIUPerSession === 'function')
      ? activeDeps.vitaminDIUPerSession(live.doses.vitamin_d, fitz, uvi, rotated, state.importedData?.genetics || null, bf)
      : activeDeps.vitaminDIU(live.doses.vitamin_d, fitz, uvi, rotated, state.importedData?.genetics || null);
    if (Number.isFinite(iu) && iu > 0) {
      const ratePerMin = elapsedMin > 0 ? iu / elapsedMin : 0;
      const iuLabel = iu >= 10000 ? `~${(iu / 1000).toFixed(1).replace(/\.0$/, '')}k IU-eq`
        : iu >= 1000 ? `~${Math.round(iu / 100) * 100} IU-eq`
        : iu >= 100 ? `~${Math.round(iu / 10) * 10} IU-eq`
        : iu >= 10 ? `~${Math.round(iu)} IU-eq`
        : '&lt;10 IU-eq';
      const rateLabel = ratePerMin >= 100 ? `~${Math.round(ratePerMin / 10) * 10} IU-eq/min avg`
        : ratePerMin >= 1 ? `~${Math.round(ratePerMin)} IU-eq/min avg`
        : ratePerMin > 0 ? '&lt;1 IU-eq/min avg'
        : 'rate pending';
      vitaminDStr = `<span class="sun-session-vitd" title="Modeled vitamin D IU-equivalent from incident action-weighted UVB. The per-minute value is the active-session average, not an instantaneous synthesis rate. This is not measured absorption or a blood-response prediction; individual uncertainty is multi-fold."><strong>☀ Vitamin D estimate</strong><span>${iuLabel}</span><span>${rateLabel}</span></span>`;
    } else {
      vitaminDStr = `<span class="sun-session-vitd sun-session-vitd-idle" title="The live UVB dose is available, but its IU-equivalent conversion did not produce a finite value. No numeric estimate is shown."><strong>☀ Vitamin D estimate</strong><span>Estimate unavailable</span></span>`;
    }
  } else if (live) {
    vitaminDStr = `<span class="sun-session-vitd sun-session-vitd-idle" title="No vitamin-D-effective UVB dose is being modeled yet. This can occur near the edge of the solar UVB window or when skin is behind glass or covered."><strong>☀ Vitamin D estimate</strong><span>No modeled UVB dose yet</span></span>`;
  } else {
    vitaminDStr = `<span class="sun-session-vitd sun-session-vitd-idle"><strong>☀ Vitamin D estimate</strong><span>Calculating…</span></span>`;
  }
  let heatStr = '';
  const tempC = live?.atm?.temperatureC ?? null;
  const elapsedMin = _activeElapsedMs(sess) / 60000;
  if (Number.isFinite(tempC) && tempC > 30 && elapsedMin > 30) {
    heatStr = `<span class="sun-session-heat" title="Ambient ${tempC.toFixed(0)}°C — heat risk is separate from UV dose. Move to a cool or shaded place, hydrate, and stop if you feel unwell.">🌡 ${Math.round(tempC)}°C · cool down</span>`;
  }
  let retinalStr = '';
  if (live && Number.isFinite(live.retinalUV) && live.retinalUV > 3) {
    const ruv = live.retinalUV;
    const ruvDisplay = ruv >= 10 ? Math.round(ruv) : ruv.toFixed(1);
    const cls = ruv >= 15 ? ' warn' : '';
    const label = ruv >= 30 ? 'at the ICNIRP 8-hour reference' : ruv >= 15 ? 'half the ICNIRP 8-hour reference' : 'building';
    retinalStr = `<span class="sun-session-retinal${cls}" title="ICNIRP actinic-UV-weighted incident dose at the anterior eye. This is not retinal dose and does not track the separate unweighted UVA limit or the visible/thermal hazard of looking at the sun. Never stare at the sun. At ${ruvDisplay} J/m² this is ${label}.">👁 ${ruvDisplay} J/m² ocular actinic UV</span>`;
  }
  const liveReadouts = [vitaminDStr, medStr, retinalStr, heatStr].filter(Boolean).join('');
  return { elapsed, liveReadouts, channelChips };
}

let _lastChannelRefreshAt = 0;
function _tickActiveCards() {
  const sessions = activeDeps.getSessions().filter(s => !s.endedAt);
  if (sessions.length === 0) {
    if (_activeTicker) { clearInterval(_activeTicker); _activeTicker = null; }
    return;
  }
  for (const sess of sessions) {
    const live = _getLiveState(sess.id);
    if (!sess.paused && (!live || !live.ratePerMin) && (!live || !live.pending)) _snapshotActiveRate(sess);
    if (live && live.ratePerMin && !live.pending && !sess.paused) {
      const last = live.snapshotAt || 0;
      if (Date.now() - last > 5 * 60 * 1000) {
        commitSunLiveSlice(sess);
        setSunLiveState(sess.id, { ratePerMin: null });
      }
    }

    const liveDoses = liveDosesFor(sess);
    if (liveDoses && Number.isFinite(liveDoses.medFraction)) {
      const med = liveDoses.medFraction;
      const cur = _getLiveState(sess.id) || {};
      if (med >= 1.0 && !cur.alertedOver) {
        setSunLiveState(sess.id, { alertedOver: true });
        showNotification(_jargonPrefix('med') + 'The base skin-type MED reference is reached. Stop UV exposure and move to shade or cover up; this model is not a personal threshold.', 'error', 10000);
      } else if (med >= 0.7 && !cur.alerted70) {
        setSunLiveState(sess.id, { alerted70: true });
        showNotification(_jargonPrefix('med') + '70% of the base skin-type MED reference. Move to shade or cover up, and stop before warmth, tenderness, or pinkness.', 'warning', 8000);
      }
    }

    if (liveDoses && Number.isFinite(liveDoses.retinalUV)) {
      const ruv = liveDoses.retinalUV;
      const cur = _getLiveState(sess.id) || {};
      if (ruv >= 30 && !cur.alertedRetinalOver) {
        setSunLiveState(sess.id, { alertedRetinalOver: true, alertedRetinal500: true });
        showNotification('Ocular actinic UV reached the ICNIRP 8-hour reference. Use UV-blocking sunglasses or move to shade. Never look at the sun.', 'warning', 8000);
      } else if (ruv >= 15 && !cur.alertedRetinal500) {
        setSunLiveState(sess.id, { alertedRetinal500: true });
        showNotification('Ocular actinic UV is building. Use UV-blocking sunglasses or take a shade break; never look at the sun.', 'warning', 6500);
      }
    }

    const tempC = liveDoses?.atm?.temperatureC ?? null;
    const elapsedMinNow = _activeElapsedMs(sess) / 60000;
    if (Number.isFinite(tempC) && tempC > 30 && elapsedMinNow > 30) {
      const cur = _getLiveState(sess.id) || {};
      if (!cur.alertedHeat) {
        setSunLiveState(sess.id, { alertedHeat: true });
        showNotification(`${tempC.toFixed(0)}°C ambient — heat risk is separate from UV dose. Move to a cool or shaded place, hydrate, and stop if you feel unwell.`, 'warning', 8000);
      }
    }

    if (document.hidden) continue;
    if (state.currentView !== 'light'
        && state.currentView !== 'dashboard'
        && !document.querySelector('.modal-overlay [data-id], .modal-overlay [data-live-elapsed-for]')) {
      continue;
    }

    const elapsedFmt = _formatElapsed(_activeElapsedMs(sess));
    document.querySelectorAll(`[data-live-elapsed-for="${CSS.escape(sess.id)}"]`).forEach(el => {
      el.textContent = elapsedFmt;
    });

    const cards = document.querySelectorAll(`[data-id="${CSS.escape(sess.id)}"]`);
    if (!cards.length) continue;
    const body = _renderActiveCardBody(sess);
    cards.forEach(card => {
      const durEl = card.querySelector('.sun-session-duration');
      if (durEl) durEl.textContent = body.elapsed;
      const legacyHeadReadouts = card.querySelectorAll('.sun-session-head > .sun-session-med, .sun-session-head > .sun-session-vitd, .sun-session-head > .sun-session-heat, .sun-session-head > .sun-session-retinal');
      legacyHeadReadouts.forEach(el => el.remove());
      let liveReadoutsEl = card.querySelector('.sun-session-live-readouts');
      if (!liveReadoutsEl) {
        const readoutAnchor = card.querySelector('.sun-session-meta') || card.querySelector('.sun-session-head');
        if (readoutAnchor) {
          readoutAnchor.insertAdjacentHTML('afterend', '<div class="sun-session-live-readouts" aria-label="Live session estimates"></div>');
          liveReadoutsEl = card.querySelector('.sun-session-live-readouts');
        }
      }
      if (liveReadoutsEl && liveReadoutsEl.innerHTML !== body.liveReadouts) {
        liveReadoutsEl.innerHTML = body.liveReadouts;
      }
      const oldChips = card.querySelector('.sun-channel-chips');
      if (oldChips) {
        const wasExpanded = oldChips.classList.contains('sun-chips-expanded');
        oldChips.outerHTML = body.channelChips || '';
        const freshChips = card.querySelector('.sun-channel-chips');
        if (freshChips) setSunChannelChipsExpanded(freshChips, wasExpanded);
      }
      else if (body.channelChips) card.insertAdjacentHTML('beforeend', body.channelChips);
    });
  }
  const now = Date.now();
  if (now - _lastChannelRefreshAt >= 5000) {
    _lastChannelRefreshAt = now;
    _refreshLiveChannelSurfaces();
  }
}

function _refreshLiveChannelSurfaces() {
  if (state.currentView === 'light') {
    try { activeDeps.renderLightChannelsLive(); } catch (e) {}
  }
  if (state.currentView === 'dashboard') {
    const strip = document.querySelector('.light-today-strip');
    if (strip) {
      const html = activeDeps.renderLightTodayStrip();
      if (html) {
        const wrap = document.createElement('div');
        wrap.innerHTML = html;
        const fresh = wrap.firstElementChild;
        if (fresh) {
          for (const attr of fresh.getAttributeNames()) {
            const newVal = fresh.getAttribute(attr);
            if (newVal !== null && strip.getAttribute(attr) !== newVal) strip.setAttribute(attr, newVal);
          }
          const freshInner = fresh.innerHTML;
          if (strip.innerHTML !== freshInner) strip.innerHTML = freshInner;
        }
      }
    }
  }
}

export function ensureActiveTicker() {
  if (_activeTicker) return;
  _tickActiveCards();
  _activeTicker = setInterval(_tickActiveCards, 1000);
}

export function resumeActiveTickerIfNeeded() {
  if (activeDeps.getActiveSession()) ensureActiveTicker();
}

export async function hydrateSunSessionFromProfileCoords(id) {
  const coords = activeDeps.getSunCoords();
  if (!coords) return;
  const sess = activeDeps.getSessions().find(s => s.id === id);
  if (!sess) return;
  sess.location = { lat: coords.lat, lon: coords.lon, altitudeM: 0, source: coords.source };
  await activeDeps.saveImportedData();
  await activeDeps.hydrateSession(id);
}

const _JARGON_DEFINITIONS = { med: 'MED = the smallest UV dose that turns your skin slightly pink (Fitzpatrick-tuned). ' };
function _jargonPrefix(key) {
  if (typeof localStorage === 'undefined') return '';
  const def = _JARGON_DEFINITIONS[key];
  if (!def) return '';
  const flag = `gb_jargon_seen_${key}`;
  try {
    if (localStorage.getItem(flag)) return '';
    localStorage.setItem(flag, '1');
  } catch (e) { return ''; }
  return def;
}

export function resetSunActiveSessionState() {
  if (_activeTicker) { clearInterval(_activeTicker); _activeTicker = null; }
  _liveState.clear();
  _lastChannelRefreshAt = 0;
}
