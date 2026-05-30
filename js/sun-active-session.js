// sun-active-session.js — active sun-session UI, live dose ticker, and
// modal helpers. Core persisted session storage and hydration stay in
// sun.js; this module receives those operations through configuration to
// avoid importing sun.js back into the active UI layer.

import { state } from './state.js';
import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import { BODY_REGIONS, renderBodySilhouette, bindBodySilhouette } from './sun-body-silhouette.js';
import { renderChannelChips } from './sun-session-ui.js';

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
  eyeModes: [],
  lensTints: [],
  postureOptions: [],
  surfaceOptions: [],
};

export function configureSunActiveSession(deps = {}) {
  Object.assign(activeDeps, deps);
}

// Posture orientation multipliers on bodyExposureFraction. Lying-supine
// makes the front of the body nearly horizontal at noon; lying-prone same
// for back. These are rough but match the hydrated-session dose path.
export const POSTURE_MULTIPLIERS = {
  standing: 1.0,
  sitting: 0.85,
  'lying-supine': 1.4,
  'lying-prone': 1.4,
};

// Surface albedo (UV reflectance). 0.25 = sand/water; 0.80 = fresh snow.
export const SURFACE_ALBEDO = {
  grass: 0.03,
  concrete: 0.10,
  sand: 0.25,
  water: 0.25,
  snow: 0.80,
};

// Single-tap "I'm outside now" — starts a session with last-used defaults.
// On stop: skips confirm dialog because the user explicitly tapped stop.
export async function quickLogSunSession() {
  const active = activeDeps.getActiveSession();
  if (active) {
    await activeDeps.stopSession(active.id);
    await hydrateSunSessionFromProfileCoords(active.id);
    const sess = activeDeps.getSessions().find(s => s.id === active.id);
    const dur = Math.round(sess?.durationMin || 0);
    const summary = _plainStopSummary(sess, dur);
    showNotification(summary, summary.includes('over your burn threshold') ? 'error' : 'success', 7000);
    activeDeps.refreshSurfaces();
    return;
  }
  return openStartSunSessionDialog();
}

async function _fetchCurrentUVI() {
  if (!window.fetchAtmosphere) return null;
  const coords = activeDeps.getSunCoords();
  if (!coords) return null;
  try {
    const atm = await window.fetchAtmosphere({
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

function _renderUVIPreflightBanner(uvi, fitzpatrick, psmTier) {
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
  const medLine = medMin ? `Estimated MED for Fitzpatrick ${fitzpatrick}${psmHigh ? ` + ${psmTier} photosensitizer` : ''}: ~${medMin} min uncovered.` : '';
  return `<div class="${cls}"><strong>${icon} ${escapeHTML(title)}</strong> ${escapeHTML(medLine)} Sunscreen + cover up + a shorter session strongly suggested.</div>`;
}

function _buildStartSessionToast({ regionCount, uvi, psmTier, eyeMode }) {
  const parts = [`Outdoor session started · ${regionCount} region${regionCount === 1 ? '' : 's'} exposed`];
  const notes = [];
  if (Number.isFinite(uvi) && uvi >= 11) notes.push(`extreme UV ${uvi.toFixed(1)}`);
  else if (Number.isFinite(uvi) && uvi >= 8) notes.push(`high UV ${uvi.toFixed(1)}`);
  const tier = activeDeps.normalizePSMTier(psmTier);
  if (tier !== 'none') notes.push(`${tier} photosensitizer`);
  if (eyeMode === 'direct') notes.push('eyes uncovered');
  if (notes.length) parts.push(`${notes.join(' + ')} · keep it short`);
  return parts.join(' · ');
}

export async function openStartSunSessionDialog() {
  const last = activeDeps.getSessions().filter(s => s.endedAt).slice(-1)[0];
  const lastRegions = new Set(last?.bodyExposure?.regions || []);
  const defaultEye = last?.eyeExposure?.mode || 'direct';
  const defaultLens = last?.eyeExposure?.lensTint || 'clear';
  const defaultGlass = !!last?.bodyExposure?.glassBetween;
  const defaultPosture = last?.posture || 'standing';
  const defaultSurface = last?.surfaceAlbedo || 'grass';
  const fitz = state.importedData?.sunDefaults?.fitzpatrick || 'III';
  const psm = state.importedData?.sunDefaults?.photosensitiveMeds || 'none';
  const uviPromise = _fetchCurrentUVI();
  let latestPreflightUvi = null;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `<div class="modal sun-start-modal" role="dialog" aria-label="Start sun session">
    <div class="modal-header">
      <h3>Start a sun session</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
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
        <p class="sun-detailed-glass-hint">Standard window glass blocks ~99% of UVB. Vitamin D synthesis stops; circadian and warmth signals still get through. We zero the burn dose accordingly. (Want to measure YOUR glass's transmission? Light tools → Window check.)</p>
        <div class="ctx-label sun-detailed-glass" style="margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:12px">
          <span style="flex:1;min-width:0">Plan to flip front ↔ back during the session</span>
          <label class="toggle-switch">
            <input type="checkbox" id="start-rotated" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <p class="sun-detailed-glass-hint">Toggle on if you'll alternate sides — doubles the vitamin D estimate to reflect that fresh skin keeps synthesizing after the first side approaches saturation. You can also tap 🔄 Flip mid-session.</p>
      </details>

      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="import-btn import-btn-primary" id="start-confirm">☀ Start session</button>
      </div>
    </div>
  </div>`;
  _wireBackdropClose(overlay);
  document.body.appendChild(overlay);
  trapModalFocus(overlay);

  const selected = new Set(lastRegions);
  const slot = overlay.querySelector('#sun-start-silhouette-slot');
  const hint = overlay.querySelector('#sun-start-hint');
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
    if (!banner) return;
    const html = _renderUVIPreflightBanner(uvi, fitz, psm);
    if (html) {
      banner.innerHTML = html;
      banner.hidden = false;
    }
  }).catch(() => {});

  overlay.querySelector('#start-confirm').addEventListener('click', async () => {
    const eyeMode = overlay.querySelector('#start-eye-mode').value || 'direct';
    const lensTint = overlay.querySelector('#start-lens-tint').value || 'clear';
    const glassBetween = overlay.querySelector('#start-glass').checked;
    const posture = overlay.querySelector('#start-posture').value || 'standing';
    const surfaceAlbedo = overlay.querySelector('#start-surface').value || 'grass';
    const rotatedSides = !!overlay.querySelector('#start-rotated')?.checked;
    const regions = Array.from(selected);
    if (regions.length === 0) {
      hint.textContent = 'Tap at least one region before starting — what part of you is uncovered?';
      hint.classList.add('sun-silhouette-hint-error');
      setTimeout(() => hint.classList.remove('sun-silhouette-hint-error'), 2500);
      return;
    }
    const coords = activeDeps.getSunCoords();
    const id = await activeDeps.startSession({ regions, eyeMode, lensTint, glassBetween, posture, surfaceAlbedo, rotatedSides, location: coords });
    overlay.remove();
    showNotification(_buildStartSessionToast({
      regionCount: regions.length,
      uvi: latestPreflightUvi,
      psmTier: state.importedData?.sunDefaults?.photosensitiveMeds,
      eyeMode,
    }), 'success', 4500);
    activeDeps.refreshSurfaces();
    ensureActiveTicker();
    return id;
  });
}

export function _wireBackdropClose(overlay, closeFn) {
  const close = typeof closeFn === 'function' ? closeFn : () => overlay.remove();
  let mouseDownInside = false;
  overlay.addEventListener('mousedown', (e) => {
    mouseDownInside = !!e.target.closest('.modal');
  });
  overlay.addEventListener('click', (e) => {
    if (mouseDownInside) { mouseDownInside = false; return; }
    if (e.target === overlay) close();
  });
}

const _modalScrollState = (() => {
  const fallback = { locks: new Set(), priorOverflow: '' };
  if (typeof window === 'undefined') return fallback;
  if (window.__labModalScrollState && window.__labModalScrollState.locks instanceof Set) {
    return window.__labModalScrollState;
  }
  try {
    Object.defineProperty(window, '__labModalScrollState', {
      value: fallback,
      configurable: true,
    });
  } catch (_) {
    window.__labModalScrollState = fallback;
  }
  return fallback;
})();
const _modalScrollLocks = _modalScrollState.locks;
function _pruneDetachedModalScrollLocks() {
  for (const lock of Array.from(_modalScrollLocks)) {
    if (!document.body.contains(lock)) _modalScrollLocks.delete(lock);
  }
}
export function trapModalFocus(overlay) {
  _pruneDetachedModalScrollLocks();
  const previouslyFocused = document.activeElement;
  if (_modalScrollLocks.size === 0) {
    _modalScrollState.priorOverflow = document.body.style.overflow;
  }
  _modalScrollLocks.add(overlay);
  document.body.style.overflow = 'hidden';
  let teardown = false;
  setTimeout(() => {
    const focusables = overlay.querySelectorAll(
      'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length > 0) try { focusables[0].focus(); } catch (e) {}
  }, 30);
  const onKeydown = (e) => {
    if (e.key === 'Escape' && document.body.contains(overlay)) {
      e.preventDefault();
      try { overlay.remove(); } catch (_) {}
    }
  };
  document.addEventListener('keydown', onKeydown);
  const restore = () => {
    if (teardown) return;
    teardown = true;
    document.removeEventListener('keydown', onKeydown);
    _modalScrollLocks.delete(overlay);
    _pruneDetachedModalScrollLocks();
    if (_modalScrollLocks.size === 0) {
      document.body.style.overflow = _modalScrollState.priorOverflow;
    } else {
      document.body.style.overflow = 'hidden';
    }
    if (previouslyFocused && typeof previouslyFocused.focus === 'function'
        && document.contains(previouslyFocused)) {
      try { previouslyFocused.focus(); } catch (e) {}
    }
  };
  const obs = new MutationObserver(() => {
    if (!document.body.contains(overlay)) {
      obs.disconnect();
      restore();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

function _plainStopSummary(sess, dur) {
  if (!sess) return `Session saved — ${dur} min`;
  const parts = [`Saved · ${dur} min outside`];
  const fitz = sess.safety?.fitzpatrick || 'III';
  const uvi = sess.atmosphere?.uvIndex;
  const vitDAu = sess.doses?.vitamin_d || 0;
  if (vitDAu > 0 && window.vitaminDIU) {
    const bf = sess.bodyExposure?.fraction;
    const iu = (Number.isFinite(bf) && bf > 0 && typeof window.vitaminDIUPerSession === 'function')
      ? window.vitaminDIUPerSession(vitDAu, fitz, uvi, !!sess.bodyExposure?.rotatedSides, state.importedData?.genetics || null, bf)
      : window.vitaminDIU(vitDAu, fitz, uvi, !!sess.bodyExposure?.rotatedSides, state.importedData?.genetics || null);
    if (iu >= 100) {
      const lo = Math.round(iu * 0.6 / 50) * 50;
      const hi = Math.round(iu * 1.5 / 50) * 50;
      parts.push(`~${lo}–${hi} IU vitamin D`);
    }
  } else if (sess.bodyExposure?.glassBetween) {
    parts.push('no vitamin D — glass blocks UVB');
  } else if (uvi != null && uvi < 2) {
    parts.push(`no vitamin D — UVI too low (${uvi.toFixed(1)})`);
  }
  const med = sess.safety?.medFraction || 0;
  if (med >= 1.0) {
    parts.push('over your burn threshold — no more sun today');
  } else if (med >= 0.7) {
    parts.push(`burn dose ${Math.round(med * 100)}% — close to limit, ease up`);
  } else if (med >= 0.3) {
    parts.push(`burn dose ${Math.round(med * 100)}% — well within safe range`);
  }
  return parts.join(' · ');
}

let _activeTicker = null;
const _liveState = new Map();

function _getLiveState(id) { return _liveState.get(id) || null; }
export function setSunLiveState(id, patch) {
  const cur = _liveState.get(id) || {};
  _liveState.set(id, Object.assign(cur, patch));
}
export function clearSunLiveState(id) { _liveState.delete(id); }

export function _formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

async function _snapshotActiveRate(sess) {
  const cur = _getLiveState(sess.id);
  if (cur && cur.ratePerMin) return cur;
  if (cur && cur.pending) return null;
  setSunLiveState(sess.id, { pending: true });
  try {
    const reconstructSpectrum = window.reconstructSpectrum;
    const computeChannelDoses = window.computeChannelDoses;
    const erythemalSED = window.erythemalSED;
    const fractionOfMED = window.fractionOfMED;
    const solarZenithAngle = window.solarZenithAngle;
    const fetchAtmosphere = window.fetchAtmosphere;
    if (!reconstructSpectrum || !computeChannelDoses || !solarZenithAngle || !fetchAtmosphere) return null;
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
    });
    const liveBodyModifiers = {
      glassBetween: !!sess.bodyExposure?.glassBetween,
      sunscreenSPF: sess.bodyExposure?.sunscreenSPF || 0,
    };
    const ratePerMin = computeChannelDoses({
      spectrum,
      durationMin: 1,
      bodyExposureFraction: sess.bodyExposure?.fraction ?? 0,
      eyeExposure: sess.eyeExposure,
      bodyModifiers: liveBodyModifiers,
    });
    const sedPerMin = erythemalSED({
      spectrum,
      durationMin: 1,
      bodyExposureFraction: sess.bodyExposure?.fraction ?? 0,
      bodyModifiers: liveBodyModifiers,
    });
    const lcSkin = state.importedData?.lightCircadian?.skinType;
    const lcRoman = lcSkin && (window._skinTypeToFitzpatrick ? window._skinTypeToFitzpatrick(lcSkin) : (lcSkin.match(/^(I{1,3}|IV|VI?)\b/) || [])[1]);
    const fitzpatrick = state.importedData?.sunDefaults?.fitzpatrick || lcRoman || 'III';
    const psmTier = activeDeps.normalizePSMTier(state.importedData?.sunDefaults?.photosensitiveMeds);
    const medScale = activeDeps.photosensitiveMedScale(psmTier);
    const existing = _getLiveState(sess.id) || {};
    const isReSnapshot = !!existing.committedDoses;
    const sliceStart = isReSnapshot ? Date.now() : sess.startedAt;
    setSunLiveState(sess.id, {
      ratePerMin, sedPerMin, fitzpatrick, medScale, psmTier, atm, zenith,
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
    if (window.console && console.warn) console.warn('snapshotActiveRate failed', e);
    setSunLiveState(sess.id, { pending: false });
    return null;
  }
}

function _rateAtInstant(sess, instantMs) {
  const live = _getLiveState(sess?.id);
  if (!live || !live.atm) return null;
  const reconstructSpectrum = window.reconstructSpectrum;
  const computeChannelDoses = window.computeChannelDoses;
  const erythemalSED = window.erythemalSED;
  const solarZenithAngle = window.solarZenithAngle;
  const interpolateAtmosphere = window.interpolateAtmosphere;
  if (!reconstructSpectrum || !computeChannelDoses || !erythemalSED || !solarZenithAngle) return null;

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
  const effFraction = baseFraction * postureMult * albedoMult;

  const zenith = solarZenithAngle(when, coords.lat, coords.lon);
  const spectrum = reconstructSpectrum({
    zenithDeg: zenith,
    ozoneDU: atmAtT.ozoneDU ?? 300,
    altitudeM: coords.altitudeM ?? 0,
    cloudCover: (atmAtT.cloudCover ?? 0) / 100,
    aod: atmAtT?.airQuality?.aod ?? null,
  });
  const bodyModifiers = {
    glassBetween: !!sess.bodyExposure?.glassBetween,
    sunscreenSPF: sess.bodyExposure?.sunscreenSPF || 0,
  };
  const rate = computeChannelDoses({
    spectrum,
    durationMin: 1,
    bodyExposureFraction: effFraction,
    eyeExposure: sess.eyeExposure,
    bodyModifiers,
  });
  const sedPerMin = erythemalSED({
    spectrum,
    durationMin: 1,
    bodyExposureFraction: effFraction,
    bodyModifiers,
  });
  let retinalUVPerMin = 0;
  if (sess.eyeExposure?.mode === 'direct') {
    const elev = 90 - zenith;
    let gate = 1.0;
    if (elev <= 5) gate = 0;
    else if (elev < 10) gate = (elev - 5) / 5;
    retinalUVPerMin = _retinalUVPerMin(spectrum) * gate;
  }
  return { rate, sedPerMin, retinalUVPerMin };
}

function _retinalUVPerMin(spectrum) {
  if (!spectrum) return 0;
  const dlambda = 5;
  let uv = 0;
  for (let i = 0; i < spectrum.irradiance.length; i++) {
    const nm = spectrum.wavelengths[i];
    if (nm > 400) break;
    uv += spectrum.irradiance[i] * dlambda;
  }
  return uv * 60;
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
  if (!live || !live.ratePerMin || !live.snapshotAt) return;
  const sliceStart = live.snapshotAt;
  const sliceEnd = Date.now();
  if (sliceEnd <= sliceStart) return;
  const { doses, sed, retinalUV } = _integrateSlice(sess, sliceStart, sliceEnd);
  const committedDoses = { ...(live.committedDoses || {}) };
  for (const [k, v] of Object.entries(doses)) {
    committedDoses[k] = (committedDoses[k] || 0) + v;
  }
  const committedSED = (live.committedSED || 0) + sed;
  const committedRetinalUV = (live.committedRetinalUV || 0) + retinalUV;
  setSunLiveState(sess.id, { committedDoses, committedSED, committedRetinalUV });
}

export function liveDosesFor(sess) {
  const live = _getLiveState(sess?.id);
  if (!live) return null;
  if (sess?.paused) {
    const committed = live.committedDoses || {};
    const sed = live.committedSED || 0;
    const retinalUV = live.committedRetinalUV || 0;
    const medFraction = live.fractionOfMEDFn ? live.fractionOfMEDFn({ sed, fitzpatrick: live.fitzpatrick, medScale: live.medScale ?? 1.0 }) : 0;
    return { doses: { ...committed }, sed, retinalUV, medFraction, fitzpatrick: live.fitzpatrick, psmTier: live.psmTier, atm: live.atm, paused: true };
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
  return { doses, sed, retinalUV, medFraction, fitzpatrick: live.fitzpatrick, psmTier: live.psmTier, atm: live.atm };
}

function _renderActiveCardBody(sess) {
  const elapsed = _formatElapsed(Date.now() - sess.startedAt);
  const live = liveDosesFor(sess);
  let medStr = '';
  if (live && Number.isFinite(live.medFraction)) {
    const pct = Math.round(live.medFraction * 100);
    let label = 'safe', cls = '';
    if (live.medFraction >= 1) { label = 'over threshold'; cls = 'over'; }
    else if (live.medFraction >= 0.7) { label = 'high'; cls = 'warn'; }
    else if (live.medFraction >= 0.3) { label = 'moderate'; cls = ''; }
    medStr = `<span class="sun-session-med ${cls}" title="Burn dose so far — ${pct}% of your burn threshold (Fitzpatrick ${escapeAttr(live.fitzpatrick)})">${pct}% burn dose · ${escapeHTML(label)}</span>`;
  }
  const channelChips = live?.doses ? renderChannelChips(live.doses, sess) : '';
  let vitaminDStr = '';
  if (live?.doses?.vitamin_d > 0) {
    const elapsedMin = Math.max(0, (Date.now() - sess.startedAt) / 60000);
    const fitz = live.fitzpatrick || sess.safety?.fitzpatrick || 'III';
    const uvi = live.atm?.uvIndex ?? sess.atmosphere?.uvIndex ?? null;
    const rotated = !!sess.bodyExposure?.rotatedSides;
    const bf = sess.bodyExposure?.fraction;
    const iu = (Number.isFinite(bf) && bf > 0 && typeof window.vitaminDIUPerSession === 'function')
      ? window.vitaminDIUPerSession(live.doses.vitamin_d, fitz, uvi, rotated, state.importedData?.genetics || null, bf)
      : (window.vitaminDIU ? window.vitaminDIU(live.doses.vitamin_d, fitz, uvi, rotated, state.importedData?.genetics || null) : live.doses.vitamin_d * 60 * (rotated ? 2 : 1));
    const ratePerMin = elapsedMin > 0 ? iu / elapsedMin : 0;
    if (iu >= 50) {
      const iuLabel = iu >= 10000 ? '~' + (iu / 1000).toFixed(1).replace(/\.0$/, '') + 'k IU'
        : iu >= 1000 ? '~' + Math.round(iu / 100) * 100 + ' IU'
        : '~' + Math.round(iu / 10) * 10 + ' IU';
      const rateLabel = ratePerMin >= 100 ? `${Math.round(ratePerMin / 10) * 10} IU/min` : `${Math.round(ratePerMin)} IU/min`;
      vitaminDStr = `<span class="sun-session-vitd" title="Approximate vitamin D₃ synthesis so far (central estimate; ±50% band — see session detail). Saturates around 20k IU per Holick photoisomerization plateau.">☀ ~${iuLabel} vit D · ${rateLabel}</span>`;
    }
  }
  let heatStr = '';
  const tempC = live?.atm?.temperatureC ?? null;
  const elapsedMin = (Date.now() - sess.startedAt) / 60000;
  if (Number.isFinite(tempC) && tempC > 30 && elapsedMin > 30) {
    heatStr = `<span class="sun-session-heat" title="Ambient ${tempC.toFixed(0)}°C — heat-stress risk rises with duration. Drink water, take a 10-min shade break.">🌡 ${Math.round(tempC)}°C · take a break</span>`;
  }
  let retinalStr = '';
  if (sess.eyeExposure?.mode === 'direct' && Number.isFinite(live?.retinalUV) && live.retinalUV > 3) {
    const ruv = live.retinalUV;
    const ruvDisplay = ruv >= 10 ? Math.round(ruv) : ruv.toFixed(1);
    const cls = ruv >= 15 ? ' warn' : '';
    const label = ruv >= 30 ? 'at ICNIRP daily limit' : ruv >= 15 ? 'half the daily limit' : 'building';
    retinalStr = `<span class="sun-session-retinal${cls}" title="Actinic-weighted UV at the eye (≈ICNIRP S(λ)). Daily limit 30 J/m²; photokeratitis appears above ~50 J/m². At ${ruvDisplay} J/m² you're ${label}.">👁 ${ruvDisplay} J/m² eye UV</span>`;
  }
  return { elapsed, medStr, vitaminDStr, channelChips, heatStr, retinalStr };
}

let _lastChannelRefreshAt = 0;
const RETINAL_ALERT_GRACE_MS = 10 * 60 * 1000;
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
        showNotification(_jargonPrefix('med') + 'Burn threshold reached. Move to shade or cover up. Hydrate, no more direct sun today — damage from here is cumulative.', 'error', 10000);
      } else if (med >= 0.7 && !cur.alerted70) {
        setSunLiveState(sess.id, { alerted70: true });
        showNotification(_jargonPrefix('med') + '70% of your burn dose. Best move: head into shade for ~10 min, then decide. If you stay, watch for skin warmth or pinkness.', 'warning', 8000);
      }
    }

    if (liveDoses && Number.isFinite(liveDoses.retinalUV) && sess.eyeExposure?.mode === 'direct') {
      const ruv = liveDoses.retinalUV;
      const cur = _getLiveState(sess.id) || {};
      const elapsedMs = Date.now() - sess.startedAt;
      if (elapsedMs < RETINAL_ALERT_GRACE_MS) {
        setSunLiveState(sess.id, {
          alertedRetinal500: cur.alertedRetinal500 || ruv >= 15,
          alertedRetinalOver: cur.alertedRetinalOver || ruv >= 30,
        });
      } else if (ruv >= 30 && !cur.alertedRetinalOver) {
        setSunLiveState(sess.id, { alertedRetinalOver: true, alertedRetinal500: true });
        showNotification('Eye UV is high. Put on UV-blocking sunglasses or take a shade break.', 'warning', 8000);
      } else if (ruv >= 15 && !cur.alertedRetinal500) {
        setSunLiveState(sess.id, { alertedRetinal500: true });
        showNotification('Eye UV is building. Sunglasses or look-down breaks are a good idea.', 'warning', 6500);
      }
    }

    const tempC = liveDoses?.atm?.temperatureC ?? null;
    const elapsedMinNow = (Date.now() - sess.startedAt) / 60000;
    if (Number.isFinite(tempC) && tempC > 30 && elapsedMinNow > 30) {
      const cur = _getLiveState(sess.id) || {};
      if (!cur.alertedHeat) {
        setSunLiveState(sess.id, { alertedHeat: true });
        showNotification(`${tempC.toFixed(0)}°C ambient — drink water, take a 10-min shade break. Heat exhaustion ramps faster than UV burn at this temperature.`, 'warning', 8000);
      }
    }

    if (document.hidden) continue;
    if (state.currentView !== 'light'
        && state.currentView !== 'dashboard'
        && !document.querySelector('.modal-overlay [data-id], .modal-overlay [data-live-elapsed-for]')) {
      continue;
    }

    const elapsedFmt = _formatElapsed(Date.now() - sess.startedAt);
    document.querySelectorAll(`[data-live-elapsed-for="${CSS.escape(sess.id)}"]`).forEach(el => {
      el.textContent = elapsedFmt;
    });

    const cards = document.querySelectorAll(`[data-id="${CSS.escape(sess.id)}"]`);
    if (!cards.length) continue;
    const body = _renderActiveCardBody(sess);
    const patchChip = (el, html) => {
      if (!html) { el.remove(); return; }
      const tmpl = document.createElement('template');
      tmpl.innerHTML = html.trim();
      const fresh = tmpl.content.firstElementChild;
      if (!fresh) return;
      if (el.className !== fresh.className) el.className = fresh.className;
      const newTitle = fresh.getAttribute('title') || '';
      if (el.getAttribute('title') !== newTitle) el.setAttribute('title', newTitle);
      const newText = fresh.textContent;
      if (el.textContent !== newText) el.textContent = newText;
    };
    cards.forEach(card => {
      const durEl = card.querySelector('.sun-session-duration');
      if (durEl) durEl.textContent = body.elapsed;
      const medEl = card.querySelector('.sun-session-med');
      if (medEl) patchChip(medEl, body.medStr);
      else if (body.medStr) {
        const head = card.querySelector('.sun-session-head .sun-session-duration');
        if (head) head.insertAdjacentHTML('afterend', body.medStr);
      }
      const vitdEl = card.querySelector('.sun-session-vitd');
      if (vitdEl) patchChip(vitdEl, body.vitaminDStr);
      else if (body.vitaminDStr) {
        const after = card.querySelector('.sun-session-med') || card.querySelector('.sun-session-duration');
        if (after) after.insertAdjacentHTML('afterend', body.vitaminDStr);
      }
      const heatEl = card.querySelector('.sun-session-heat');
      if (heatEl) patchChip(heatEl, body.heatStr);
      else if (body.heatStr) {
        const after = card.querySelector('.sun-session-vitd') || card.querySelector('.sun-session-med') || card.querySelector('.sun-session-duration');
        if (after) after.insertAdjacentHTML('afterend', body.heatStr);
      }
      const retinalEl = card.querySelector('.sun-session-retinal');
      if (retinalEl) patchChip(retinalEl, body.retinalStr);
      else if (body.retinalStr) {
        const after = card.querySelector('.sun-session-heat') || card.querySelector('.sun-session-vitd') || card.querySelector('.sun-session-med') || card.querySelector('.sun-session-duration');
        if (after) after.insertAdjacentHTML('afterend', body.retinalStr);
      }
      const oldChips = card.querySelector('.sun-channel-chips');
      if (oldChips) oldChips.outerHTML = body.channelChips || '';
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
  if (state.currentView === 'light' && window.renderLightChannelsLive) {
    try { window.renderLightChannelsLive(); } catch (e) {}
  }
  if (state.currentView === 'dashboard' && window.renderLightTodayStrip) {
    const strip = document.querySelector('.light-today-strip');
    if (strip) {
      const html = window.renderLightTodayStrip();
      if (html) {
        const wrap = document.createElement('div');
        wrap.innerHTML = html;
        const fresh = wrap.firstElementChild;
        if (fresh) {
          for (const attr of fresh.getAttributeNames()) {
            const newVal = fresh.getAttribute(attr);
            if (strip.getAttribute(attr) !== newVal) strip.setAttribute(attr, newVal);
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

const _JARGON_DEFINITIONS = {
  med: 'MED = the smallest UV dose that turns your skin slightly pink (Fitzpatrick-tuned). ',
};
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
