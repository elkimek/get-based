// @ts-check
// sun-session-start-ui.js — preflight and body-exposure UI for starting a sun session.

import { state } from './state.js';
import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import { BODY_REGIONS, renderBodySilhouette, bindBodySilhouette } from './sun-body-silhouette.js';

const SAFETY_ATMOSPHERE_MAX_AGE_MS = 15 * 60 * 1000;

/** @type {Record<string, any>} */
const startDeps = {
  getSessions: () => [],
  startSession: async () => null,
  getSunCoords: () => null,
  getCachedConditionsAtmosphere: () => null,
  uviFetchTimeoutMs: 5000,
  applyAtmOverrides: (atm) => atm,
  refreshSurfaces: () => {},
  normalizePSMTier: (raw) => raw || 'none',
  photosensitiveMedScale: () => 1,
  eyeModes: [],
  lensTints: [],
  postureOptions: [],
  surfaceOptions: [],
  fetchAtmosphere: async () => null,
  computeUVConfidence: () => 0.5,
  solarZenithAngle: () => 90,
  ensureActiveTicker: () => {},
};

export function configureSunSessionStartUI(deps = {}) {
  Object.assign(startDeps, deps);
}

async function _fetchCurrentUVI() {
  try {
    // Conditions Now caches the already-overridden atmosphere object that it
    // renders, so use it verbatim rather than applying manual overrides twice.
    const cached = startDeps.getCachedConditionsAtmosphere();
    if (Number.isFinite(cached?.uvIndex)) return cached;
  } catch (_) {
    // A stale or malformed Conditions Now cache must not block a fresh lookup.
  }
  const coords = startDeps.getSunCoords();
  if (!coords) return null;
  let timeoutId = null;
  try {
    const fetchPromise = Promise.resolve()
      .then(() => startDeps.fetchAtmosphere({
        lat: coords.lat, lon: coords.lon, isoTime: new Date().toISOString(),
      }))
      .then(atm => {
        const ageMs = Number.isFinite(atm?.fetchedAt) ? Date.now() - atm.fetchedAt : 0;
        if (atm?._stale && ageMs > SAFETY_ATMOSPHERE_MAX_AGE_MS) return null;
        return startDeps.applyAtmOverrides(atm);
      })
      .then(atm => Number.isFinite(atm?.uvIndex) ? atm : null)
      .catch(() => null);
    const timeoutMs = Number.isFinite(startDeps.uviFetchTimeoutMs)
      ? Math.max(0, startDeps.uviFetchTimeoutMs)
      : 5000;
    const timeoutPromise = new Promise(resolve => {
      timeoutId = setTimeout(() => resolve(null), timeoutMs);
    });
    return await Promise.race([fetchPromise, timeoutPromise]);
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}

function _estimateMedMinutes(uvi, fitzpatrick, psmTier) {
  if (!Number.isFinite(uvi) || uvi <= 0) return null;
  const fitzMED = { I: 200, II: 250, III: 300, IV: 450, V: 600, VI: 1000 };
  const baseMED = fitzMED[fitzpatrick] ?? fitzMED.III;
  const med = baseMED * (startDeps.photosensitiveMedScale(psmTier) || 1.0);
  const irradiance = uvi * 25; // 1 UVI unit = 25 mW/m² CIE-erythemal irradiance.
  const seconds = (med * 1000) / irradiance;
  return Math.round(seconds / 60);
}

function _renderUVIPreflightBanner(uvi, fitzpatrick, psmTier, allowsExactTiming = false) {
  if (!Number.isFinite(uvi)) return '';
  const psmHigh = psmTier === 'moderate' || psmTier === 'severe';
  const fairSkin = fitzpatrick === 'I' || fitzpatrick === 'II';
  if (uvi < 8 && !psmHigh && !fairSkin) return '';
  if (uvi < 5 && !psmHigh) return '';
  // The Fitzpatrick-only estimate is quantitative. Medication response is too
  // compound- and person-specific for the generic risk tier to produce a
  // defensible personalized minute count.
  const medMin = _estimateMedMinutes(uvi, fitzpatrick, 'none');
  let cls = 'sun-uvi-warn';
  let icon = '☀';
  let title = '';
  if (uvi >= 11) { cls = 'sun-uvi-extreme'; icon = '⚠'; title = `Extreme UV (UVI ${uvi.toFixed(1)})`; }
  else if (uvi >= 8) { cls = 'sun-uvi-veryhigh'; title = `Very high UV (UVI ${uvi.toFixed(1)})`; }
  else { title = `UV ${uvi.toFixed(1)} — burn risk elevated ${psmHigh ? 'by photosensitizer' : 'for fair skin'}`; }
  const medLine = medMin && allowsExactTiming
    ? `Modeled burn threshold: about ${medMin} minutes uncovered. This is not a safe-time allowance.`
    : 'Exact burn timing is withheld because the inputs or biological response are uncertain.';
  const medicationLine = psmTier !== 'none'
    ? ` Your medication/sensitivity flag may shorten this unpredictably; the generic tier is a conservative warning, not a personalized multiplier.`
    : '';
  return `<div class="${cls}"><strong>${icon} ${escapeHTML(title)}</strong> ${escapeHTML(medLine + medicationLine)} Sunscreen + cover up + a shorter session strongly suggested.</div>`;
}

function _renderUVIReadyBanner(uvi) {
  return `<div class="sun-uvi-ready"><strong>Current UVI ${uvi.toFixed(1)} is ready</strong><br><span>Skin dose and vitamin D estimates will be anchored to current conditions.</span></div>`;
}

function _buildStartSessionToast({ regionCount, uvi, psmTier, eyeMode }) {
  const parts = [`Outdoor session started · ${regionCount} region${regionCount === 1 ? '' : 's'} exposed`];
  const notes = [];
  if (Number.isFinite(uvi) && uvi >= 11) notes.push(`extreme UV ${uvi.toFixed(1)}`);
  else if (Number.isFinite(uvi) && uvi >= 8) notes.push(`high UV ${uvi.toFixed(1)}`);
  const tier = startDeps.normalizePSMTier(psmTier);
  if (tier !== 'none') notes.push('follow your sun-sensitivity precautions');
  if (eyeMode === 'direct') notes.push('never look at the sun');
  if (Number.isFinite(uvi) && uvi >= 8) notes.push('use shade and sun protection');
  if (notes.length) parts.push(notes.join(' · '));
  return parts.join(' · ');
}

export async function openStartSunSessionDialog() {
  const last = startDeps.getSessions().filter(s => s.endedAt).slice(-1)[0];
  const lastRegions = new Set(last?.bodyExposure?.regions || []);
  const defaultEye = last?.eyeExposure?.mode || 'indoor';
  const defaultLens = last?.eyeExposure?.lensTint || 'clear';
  const defaultGlass = !!last?.bodyExposure?.glassBetween;
  const defaultPosture = last?.posture || 'standing';
  const defaultSurface = last?.surfaceAlbedo || 'grass';
  const fitz = state.importedData?.sunDefaults?.fitzpatrick || 'III';
  const psm = state.importedData?.sunDefaults?.photosensitiveMeds || 'none';
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
      <div id="sun-start-uvi-banner" class="sun-start-uvi-banner" role="status"><div class="sun-uvi-warn"><strong>Checking current UV…</strong><br><span>Live UVI will anchor the skin-dose calculation when available.</span></div></div>
      <p class="modal-body-hint">Tap each body region that's uncovered right now. The session begins as soon as you hit Start.</p>
      <div class="sun-silhouette-wrap" id="sun-start-silhouette-slot">${renderBodySilhouette(lastRegions)}</div>
      <div class="sun-silhouette-hint-row" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div class="sun-silhouette-hint" id="sun-start-hint">Tap any body region to toggle whether it's uncovered.</div>
        <button type="button" class="ctx-btn-option" id="sun-start-clear" style="padding:2px 10px;font-size:11px">Clear</button>
      </div>

      <details class="sun-start-details">
        <summary>Safety and exposure details</summary>
        <div class="sun-detailed-row" style="margin-top:10px">
          <label class="ctx-label">Posture
            <select id="start-posture" class="ctx-select">
              ${startDeps.postureOptions.map(o => `<option value="${escapeAttr(o.key)}"${o.key === defaultPosture ? ' selected' : ''}>${escapeHTML(o.label)}</option>`).join('')}
            </select>
          </label>
          <label class="ctx-label">Surface
            <select id="start-surface" class="ctx-select">
              ${startDeps.surfaceOptions.map(o => `<option value="${escapeAttr(o.key)}"${o.key === defaultSurface ? ' selected' : ''}>${escapeHTML(o.label)}</option>`).join('')}
            </select>
          </label>
        </div>
        <p class="sun-detailed-glass-hint">Lying flat catches more sun than standing (~40%). Reflective surfaces (sand, water, snow) bounce UV onto your skin from below.</p>
        <div class="sun-detailed-row" style="margin-top:10px">
          <label class="ctx-label">Eyes
            <select id="start-eye-mode" class="ctx-select">
              ${startDeps.eyeModes.map(e => `<option value="${escapeAttr(e.key)}"${e.key === defaultEye ? ' selected' : ''}>${escapeHTML(e.pickerLabel || e.label)}</option>`).join('')}
            </select>
          </label>
          <label class="ctx-label">Lens tint
            <select id="start-lens-tint" class="ctx-select">
              ${startDeps.lensTints.map(l => `<option value="${escapeAttr(l.key)}"${l.key === defaultLens ? ' selected' : ''}>${escapeHTML(l.label)}</option>`).join('')}
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
        <p class="sun-detailed-glass-hint">Standard window glass sharply reduces UVB, so vitamin-D potential is near zero indoors even when the room feels bright. The model does not treat glass as protection from heat or every UVA effect. To check your own window, use Light tools → Window check.</p>
        <div class="ctx-label sun-detailed-glass" style="margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:12px">
          <span style="flex:1;min-width:0">Plan to flip front ↔ back during the session</span>
          <label class="toggle-switch">
            <input type="checkbox" id="start-rotated" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <p class="sun-detailed-glass-hint">Tracks which side was exposed for your records. It does not multiply the vitamin D estimate; exposed body area and measured UV drive the calculation.</p>
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
    const confirm = /** @type {HTMLButtonElement|null} */ (overlay.querySelector('#start-confirm'));
    if (confirm) confirm.disabled = selected.size === 0;
  };
  overlay.querySelector('#sun-start-clear')?.addEventListener('click', () => {
    selected.clear();
    slot.innerHTML = renderBodySilhouette(selected);
    updateHint();
  });
  bindBodySilhouette(slot, selected, updateHint);
  updateHint();

  uviPromise.then((atm) => {
    const uvi = atm?.uvIndex;
    if (!Number.isFinite(uvi)) throw new Error('UVI unavailable');
    latestPreflightUvi = uvi;
    const banner = overlay.querySelector('#sun-start-uvi-banner');
    if (!(banner instanceof HTMLElement)) return;
    const coords = startDeps.getSunCoords();
    const zenithDeg = coords ? startDeps.solarZenithAngle(new Date(), coords.lat, coords.lon) : null;
    const score = Number(startDeps.computeUVConfidence({
      source: atm.source,
      snapshotAgeSec: atm?._camsMeta?.ageSec ?? null,
      cloudCover: atm.cloudCover ?? null,
      zenithDeg,
      uvIndex: uvi,
      isStale: !!atm._stale,
      manualOverridden: !!atm._uvOverridden,
    }));
    const allowsExactTiming = Number.isFinite(score) && score >= 0.65 && !atm._stale && startDeps.normalizePSMTier(psm) === 'none';
    banner.innerHTML = _renderUVIPreflightBanner(uvi, fitz, psm, allowsExactTiming) || _renderUVIReadyBanner(uvi);
  }).catch(() => {
    const banner = overlay.querySelector('#sun-start-uvi-banner');
    if (banner instanceof HTMLElement) {
      banner.innerHTML = '<div class="sun-uvi-warn"><strong>Live UVI unavailable</strong><br><span>The session can still be logged, but UV dose and vitamin D estimates have lower confidence until atmosphere data is available.</span></div>';
    }
  });

  overlay.querySelector('#start-confirm').addEventListener('click', async () => {
    const confirmButton = /** @type {HTMLButtonElement|null} */ (overlay.querySelector('#start-confirm'));
    if (!confirmButton || confirmButton.disabled) return;
    const eyeMode = /** @type {HTMLSelectElement | null} */ (overlay.querySelector('#start-eye-mode'))?.value || 'indoor';
    const lensTint = /** @type {HTMLSelectElement | null} */ (overlay.querySelector('#start-lens-tint'))?.value || 'clear';
    const glassBetween = !!/** @type {HTMLInputElement | null} */ (overlay.querySelector('#start-glass'))?.checked;
    const posture = /** @type {HTMLSelectElement | null} */ (overlay.querySelector('#start-posture'))?.value || 'standing';
    const surfaceAlbedo = /** @type {HTMLSelectElement | null} */ (overlay.querySelector('#start-surface'))?.value || 'grass';
    const rotatedSides = !!/** @type {HTMLInputElement | null} */ (overlay.querySelector('#start-rotated'))?.checked;
    const regions = Array.from(selected);
    if (regions.length === 0) {
      hint.textContent = 'Tap at least one region before starting — what part of you is uncovered?';
      hint.classList.add('sun-silhouette-hint-error');
      setTimeout(() => hint.classList.remove('sun-silhouette-hint-error'), 2500);
      return;
    }
    confirmButton.disabled = true;
    try {
      const coords = startDeps.getSunCoords();
      const id = await startDeps.startSession({ regions, eyeMode, lensTint, glassBetween, posture, surfaceAlbedo, rotatedSides, location: coords });
      closeDialog();
      showNotification(_buildStartSessionToast({
        regionCount: regions.length,
        uvi: latestPreflightUvi,
        psmTier: state.importedData?.sunDefaults?.photosensitiveMeds,
        eyeMode,
      }), 'success', 4500);
      startDeps.refreshSurfaces();
      startDeps.ensureActiveTicker();
      return id;
    } catch (error) {
      showNotification(error?.message || 'Could not start the sun session.', 'error', 4500);
      confirmButton.disabled = false;
    }
  });
}
