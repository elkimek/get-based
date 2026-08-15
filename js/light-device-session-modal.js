// @ts-check
// light-device-session-modal.js — Log/start light therapy device sessions.

import { state } from './state.js';
import { escapeHTML, escapeAttr, showNotification, showConfirmDialog } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import { BODY_REGIONS, bindBodySilhouette, renderBodySilhouette } from './sun-body-silhouette.js';
import { validateModeCoupling } from './sun-spectrum.js';
import { deviceEmitsUV } from './light-device-session-engine.js';

/**
 * @param {Record<string, any>} [deps]
 * @returns {Record<string, any>}
 */
function _resolveSessionDialogDeps(deps = {}) {
  return {
    ...deps,
    validateModeCoupling: deps.validateModeCoupling || validateModeCoupling,
    renderBodySilhouette: deps.renderBodySilhouette || renderBodySilhouette,
    bindBodySilhouette: deps.bindBodySilhouette || bindBodySilhouette,
    navigate: deps.navigate || null,
    openLightSetup: deps.openLightSetup || null,
  };
}

/**
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {HTMLInputElement|null}
 */
function _input(root, selector) {
  return /** @type {HTMLInputElement|null} */ (root.querySelector(selector));
}

/**
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {HTMLButtonElement|null}
 */
function _button(root, selector) {
  return /** @type {HTMLButtonElement|null} */ (root.querySelector(selector));
}

function _wireDeviceSessionModal(overlay, closeFn) {
  if (typeof window === 'undefined') { document.body.appendChild(overlay); return; }
  openAppendedModalOverlay(overlay, closeFn);
}

function _defaultRegionsForLastSession(last) {
  // bodyAreas[] is the precise per-region field. For legacy sessions that
  // only have a broad bodyArea string, expand it to matching region keys
  // so the silhouette pre-selects sensibly.
  const broadToRegions = {
    face: ['face'],
    torso: ['breast-chest', 'torso-front', 'abdomen'],
    arms: ['arms-front', 'arms-back'],
    legs: ['legs-front', 'legs-back'],
    // Legacy keys preserved for backcompat reads (last.bodyArea may still
    // be 'whole-body' or 'targeted' from pre-toggle sessions).
    'whole-body': (BODY_REGIONS || []).map(r => r.key),
    targeted: ['breast-chest'],
  };
  if (Array.isArray(last.bodyAreas) && last.bodyAreas.length > 0) return last.bodyAreas.slice();
  if (last.bodyArea && broadToRegions[last.bodyArea]) return broadToRegions[last.bodyArea].slice();
  return ['breast-chest'];
}

function _broadAreaForRegions(bodyAreas) {
  // Denormalized broad-zone hint kept for legacy listing rows that have
  // not been migrated to bodyAreas yet. Pick the simplest match for the
  // chosen region set.
  if (bodyAreas.length >= (BODY_REGIONS || []).length - 2) return 'whole-body';
  if (bodyAreas.every(r => r.startsWith('legs') || r.startsWith('feet'))) return 'legs';
  if (bodyAreas.every(r => r.startsWith('arms'))) return 'arms';
  if (bodyAreas.every(r => /face|thyroid/.test(r))) return 'face';
  if (bodyAreas.every(r => /chest|torso|abdomen|breast/.test(r))) return 'torso';
  return 'targeted';
}

function _readDistanceCm(overlay, fallbackCm) {
  const distInput = _input(overlay, '#dev-session-distance');
  const distVal = parseFloat(distInput?.value || '');
  const distUnit = distInput?.dataset.unit || 'cm';
  return Number.isFinite(distVal)
    ? (distUnit === 'in' ? distVal * 2.54 : distVal)
    : fallbackCm;
}

function _showEmptyRegionError(updateAreaHint, selectedRegions, hintEl) {
  updateAreaHint(selectedRegions);
  hintEl?.classList.add('sun-silhouette-hint-error');
  setTimeout(() => hintEl?.classList.remove('sun-silhouette-hint-error'), 2500);
}

export async function openDeviceSessionDialog(deviceId, deps = {}) {
  const resolvedDeps = _resolveSessionDialogDeps(deps);
  const {
    hydrateDevicesFromPresets,
    getDevices,
    logDeviceSession,
    getActiveDeviceSession,
    startDeviceSession,
    ensureActiveDeviceTicker,
    validateModeCoupling,
    renderBodySilhouette,
    bindBodySilhouette,
    navigate,
    openLightSetup,
  } = resolvedDeps;

  const configuredFitz = state.importedData?.sunDefaults?.fitzpatrick || null;
  if (!/^(I|II|III|IV|V|VI)$/.test(String(configuredFitz || ''))) {
    showNotification(
      'Confirm your Fitzpatrick skin type in Light setup before starting or logging a light-device session.',
      'info',
      7000,
    );
    openLightSetup?.();
    return false;
  }

  // Lazy hydrate covers page-opened-mid-init / cold preset cache cases so
  // the dialog renders with the latest mode/coupling schema.
  await hydrateDevicesFromPresets?.().catch(() => {});
  const device = getDevices?.()?.find(d => d.id === deviceId);
  if (!device) return false;

  // Prefill from the user's last logged session on this device. First-time
  // logs fall through to vendor reference distance + sensible defaults.
  const last = device.lastSession || {};
  const defaultDistanceCm = Number.isFinite(last.distanceCm) && last.distanceCm > 0
    ? last.distanceCm
    : (device.recommendedDistanceCm || 15);
  const defaultRegions = _defaultRegionsForLastSession(last);

  // Mode picker renders only for devices with multiple valid modes.
  const validModes = Array.isArray(device.modes)
    ? device.modes.filter(m => validateModeCoupling(device, m.id).ok)
    : [];
  const showModePicker = validModes.length > 1;
  let defaultMode = null;
  if (showModePicker) {
    const lastModeValid = last.mode && validModes.some(m => m.id === last.mode);
    defaultMode = lastModeValid ? last.mode : (validModes.find(m => m.default) || validModes[0])?.id || null;
  }
  const initialMode = showModePicker ? defaultMode : (last.mode || null);
  const isUVDevice = deviceEmitsUV(device, initialMode);
  // Never prefill a first UV session with the generic ten-minute PBM default.
  // Thirty seconds is only a neutral input starting point, not guidance.
  const defaultDuration = Number.isFinite(last.durationMin) && last.durationMin > 0
    ? last.durationMin
    : (isUVDevice ? 0.5 : 10);
  const isEyeLightDevice = ['sad', 'dawn-sim', 'full-spectrum'].includes(device.type) && !isUVDevice;
  const defaultEyeControlChecked = isEyeLightDevice
    ? last.eyesProtected !== true
    : last.eyesProtected !== false;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const closeDialog = () => removeModalOverlay(overlay);
  overlay.innerHTML = `<div class="modal" role="dialog" aria-label="Log device session">
    <div class="modal-header">
      <h3>Log session — ${escapeHTML(device.brand)} ${escapeHTML(device.model)}</h3>
      <button class="modal-close" data-device-session-close aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${showModePicker ? `
        <div class="ctx-label dev-mode-field">
          <span>Mode</span>
          <input type="hidden" id="dev-session-mode" value="${escapeAttr(defaultMode || '')}" />
          <div class="dev-mode-picker" role="radiogroup" aria-label="Device mode">
            ${validModes.map(m => `<button type="button" class="dev-mode-btn${m.id === defaultMode ? ' active' : ''}" data-mode="${escapeAttr(m.id)}" role="radio" aria-checked="${m.id === defaultMode ? 'true' : 'false'}" title="Which LED groups were firing for this session — picked from the device's vendor-defined modes. Affects channel-dose math.">${escapeHTML(m.label || m.id)}</button>`).join('')}
          </div>
        </div>
      ` : ''}
      <label class="ctx-label">Duration (minutes)
        <input type="number" id="dev-session-duration" class="ctx-input" min="0.1" max="600" step="0.1" value="${defaultDuration}" />
        <span class="dev-session-hint">Record the time actually used. This is not a suggested exposure time; follow the device timer and instructions.</span>
      </label>
      ${(() => {
        const useUS = state.unitSystem === 'US';
        const startUnit = useUS ? 'in' : 'cm';
        const refCm = device.recommendedDistanceCm || 15;
        const fmt = (cm, u) => u === 'in' ? +(cm / 2.54).toFixed(1) : cm;
        const hasOverride = Number.isFinite(last.distanceCm) && Math.abs(last.distanceCm - refCm) > 0.5;
        const overrideHint = hasOverride
          ? ` You usually log at ${fmt(defaultDistanceCm, 'cm')} cm — prefilled below.`
          : '';
        return `<label class="ctx-label">Distance from device
          <div class="dev-distance-row">
            <input type="number" id="dev-session-distance" class="ctx-input" min="2" max="200" step="0.5" value="${fmt(defaultDistanceCm, startUnit)}" data-unit="${startUnit}" data-base-cm="${refCm}" />
            <div class="dev-unit-toggle" role="tablist" aria-label="Distance unit">
              <button type="button" class="dev-unit-btn${startUnit === 'cm' ? ' active' : ''}" data-unit="cm" role="tab" aria-selected="${startUnit === 'cm'}">cm</button>
              <button type="button" class="dev-unit-btn${startUnit === 'in' ? ' active' : ''}" data-unit="in" role="tab" aria-selected="${startUnit === 'in'}">in</button>
            </div>
          </div>
          <span class="dev-session-hint">Vendor reference: ${fmt(refCm, 'cm')} cm (${fmt(refCm, 'in')} in).${overrideHint} ${Array.isArray(device.irradianceByDistanceCm) && device.irradianceByDistanceCm.length >= 2 ? 'Dose uses the device\'s measured distance table.' : device.distanceModel === 'point-source' ? 'Dose uses point-source inverse-square scaling declared for this device.' : 'No unverified distance correction is applied; use the vendor reference distance or enter measured irradiance data.'}</span>
        </label>`;
      })()}
      <div class="ctx-label" style="display:block">
        <span>Body area treated</span>
        <div class="sun-silhouette-wrap" id="dev-session-silhouette-slot">${renderBodySilhouette ? renderBodySilhouette(new Set(defaultRegions)) : ''}</div>
        <div class="sun-silhouette-hint-row" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div class="sun-silhouette-hint" id="dev-session-area-hint">Tap regions the panel reaches.</div>
          <button type="button" class="ctx-btn-option" id="dev-session-clear" style="padding:2px 10px;font-size:11px">Clear</button>
        </div>
      </div>
      <div class="ctx-label" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <span style="flex:1;min-width:0" id="dev-session-eye-label">${isUVDevice ? 'UV-rated goggles worn (closed eyelids are not protection)' : isEyeLightDevice ? 'Eyes open to receive ambient light (never stare at lamp)' : 'Device-appropriate eye protection worn'}</span>
        <label class="toggle-switch">
          <input type="checkbox" id="dev-session-eyes"${defaultEyeControlChecked ? ' checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <p class="modal-body-hint" style="margin-top:8px">Save now to log a finished session, or Start to run a live timer (matches the sun-session pattern — handy when you want to walk away and come back).</p>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" data-device-session-close>Cancel</button>
        <button class="import-btn import-btn-secondary" id="dev-session-start">Start timer</button>
        <button class="import-btn import-btn-primary" id="dev-session-save">Save session</button>
      </div>
    </div>
  </div>`;
  _wireDeviceSessionModal(overlay, closeDialog);
  overlay.querySelectorAll('[data-device-session-close]').forEach(btn => {
    btn.addEventListener('click', closeDialog);
  });

  const ambientEyeTypes = ['sad', 'dawn-sim', 'full-spectrum'];
  const durationInput = _input(overlay, '#dev-session-duration');
  let durationEdited = false;
  durationInput?.addEventListener('input', () => { durationEdited = true; });
  let eyeControlKind = isUVDevice ? 'uv' : isEyeLightDevice ? 'ambient' : 'protection';
  const syncEyeControlForMode = (mode, { initial = false } = {}) => {
    const emitsUV = deviceEmitsUV(device, mode);
    const kind = emitsUV ? 'uv' : ambientEyeTypes.includes(device.type) ? 'ambient' : 'protection';
    const eyeInput = _input(overlay, '#dev-session-eyes');
    const eyeLabel = overlay.querySelector('#dev-session-eye-label');
    // A checkbox from a non-UV mode cannot be treated as confirmation that
    // UV-rated goggles are worn. Require a fresh, explicit confirmation.
    if (!initial && kind === 'uv' && eyeControlKind !== 'uv') {
      if (eyeInput) eyeInput.checked = false;
      if (!durationEdited && durationInput) durationInput.value = '0.5';
    }
    if (eyeLabel) {
      eyeLabel.textContent = kind === 'uv'
        ? 'UV-rated goggles worn (closed eyelids are not protection)'
        : kind === 'ambient'
          ? 'Eyes open to receive ambient light (never stare at lamp)'
          : 'Device-appropriate eye protection worn';
    }
    eyeControlKind = kind;
  };
  syncEyeControlForMode(initialMode, { initial: true });

  let lastModePointerActivation = 0;
  /**
   * @param {HTMLElement} btn
   */
  const setMode = (btn) => {
    const mode = btn.dataset.mode || '';
    const input = _input(overlay, '#dev-session-mode');
    if (input) input.value = mode;
    for (const b of overlay.querySelectorAll('.dev-mode-btn[data-mode]')) {
      const active = b === btn;
      b.classList.toggle('active', active);
      b.setAttribute('aria-checked', active ? 'true' : 'false');
    }
    syncEyeControlForMode(mode);
  };
  for (const rawBtn of overlay.querySelectorAll('.dev-mode-btn[data-mode]')) {
    const btn = /** @type {HTMLElement} */ (rawBtn);
    btn.addEventListener('pointerup', (e) => {
      if ((/** @type {PointerEvent} */ (e)).pointerType === 'mouse') return;
      setMode(btn);
      lastModePointerActivation = Date.now();
      e.preventDefault();
    }, { passive: false });
    btn.addEventListener('touchend', (e) => {
      if (Date.now() - lastModePointerActivation < 80) return;
      setMode(btn);
      lastModePointerActivation = Date.now();
      e.preventDefault();
    }, { passive: false });
    btn.addEventListener('click', (e) => {
      if (Date.now() - lastModePointerActivation < 700) {
        e.preventDefault();
        return;
      }
      setMode(btn);
    });
  }

  const selectedRegions = new Set(defaultRegions);
  const fracByKey = Object.fromEntries((BODY_REGIONS || []).map(r => [r.key, r.fraction]));
  const labelByKey = Object.fromEntries((BODY_REGIONS || []).map(r => [r.key, r.label]));
  const silhouetteSlot = overlay.querySelector('#dev-session-silhouette-slot');
  const hint = overlay.querySelector('#dev-session-area-hint');
  const updateAreaHint = (set) => {
    if (!hint) return;
    if (set.size === 0) {
      hint.textContent = 'Pick at least one region — what does the panel reach?';
      return;
    }
    const frac = Array.from(set).reduce((s, k) => s + (fracByKey[k] || 0), 0);
    const labels = Array.from(set).map(k => labelByKey[k] || k).slice(0, 4).join(', ');
    const more = set.size > 4 ? ` +${set.size - 4} more` : '';
    hint.textContent = `${set.size} region${set.size === 1 ? '' : 's'} (~${Math.round(frac * 100)}% of skin) — ${labels}${more}`;
  };
  if (silhouetteSlot && bindBodySilhouette) {
    bindBodySilhouette(silhouetteSlot, selectedRegions, (set) => {
      updateAreaHint(set);
    });
  }
  updateAreaHint(selectedRegions);

  overlay.querySelector('#dev-session-clear')?.addEventListener('click', () => {
    selectedRegions.clear();
    if (silhouetteSlot && renderBodySilhouette) {
      silhouetteSlot.innerHTML = renderBodySilhouette(selectedRegions);
    }
    updateAreaHint(selectedRegions);
  });

  for (const btn of overlay.querySelectorAll('.dev-unit-btn')) {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-unit');
      const input = _input(overlay, '#dev-session-distance');
      if (!input || !target) return;
      const cur = input.dataset.unit || 'cm';
      if (cur === target) return;
      const v = parseFloat(input.value);
      if (Number.isFinite(v)) {
        const cm = cur === 'in' ? v * 2.54 : v;
        input.value = String(target === 'in' ? +(cm / 2.54).toFixed(1) : Math.round(cm));
      }
      input.dataset.unit = target;
      input.step = target === 'in' ? '0.5' : '1';
      for (const b of overlay.querySelectorAll('.dev-unit-btn')) {
        const active = b.getAttribute('data-unit') === target;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      }
    });
  }

  _button(overlay, '#dev-session-save')?.addEventListener('click', async () => {
    const durationMin = parseFloat(_input(overlay, '#dev-session-duration')?.value || '');
    if (!Number.isFinite(durationMin) || durationMin <= 0 || durationMin > 600) {
      showNotification('Enter the actual duration between 0.1 and 600 minutes.', 'error');
      return;
    }
    const distanceCm = _readDistanceCm(overlay, device.recommendedDistanceCm || 15);
    const bodyAreas = Array.from(selectedRegions);
    if (bodyAreas.length === 0) {
      _showEmptyRegionError(updateAreaHint, selectedRegions, hint);
      return;
    }
    const mode = showModePicker ? _input(overlay, '#dev-session-mode')?.value || null : null;
    const bodyArea = _broadAreaForRegions(bodyAreas);
    const emitsUV = deviceEmitsUV(device, mode);
    const eyeChecked = !!_input(overlay, '#dev-session-eyes')?.checked;
    const eyeLightForMode = ambientEyeTypes.includes(device.type) && !emitsUV;
    const eyesProtected = eyeLightForMode ? !eyeChecked : eyeChecked;
    if (emitsUV && !eyesProtected) {
      const saveUnsafe = await showConfirmDialog('This records UV exposure without UV-rated goggles. Save it as an unsafe past exposure?');
      if (!saveUnsafe) return;
    }
    const saved = await logDeviceSession({ deviceId, durationMin, distanceCm, bodyArea, bodyAreas, eyesProtected, mode });
    if (!saved) {
      showNotification('The session could not be saved. Check the duration and distance.', 'error');
      return;
    }
    closeDialog();
    showNotification(`${durationMin} min ${escapeHTML(device.brand)} session saved.`);
    navigate?.('light');
  });

  _button(overlay, '#dev-session-start')?.addEventListener('click', async () => {
    if (getActiveDeviceSession()) {
      showNotification('Another device session is already running. Stop it first.', 'error');
      return;
    }
    const distanceCm = _readDistanceCm(overlay, device.recommendedDistanceCm || 15);
    const bodyAreas = Array.from(selectedRegions);
    if (bodyAreas.length === 0) {
      _showEmptyRegionError(updateAreaHint, selectedRegions, hint);
      return;
    }
    const mode = showModePicker ? _input(overlay, '#dev-session-mode')?.value || null : null;
    const bodyArea = _broadAreaForRegions(bodyAreas);
    const emitsUV = deviceEmitsUV(device, mode);
    const eyeChecked = !!_input(overlay, '#dev-session-eyes')?.checked;
    const eyeLightForMode = ambientEyeTypes.includes(device.type) && !emitsUV;
    const eyesProtected = eyeLightForMode ? !eyeChecked : eyeChecked;
    if (emitsUV && !eyesProtected) {
      showNotification('UV sessions require UV-rated goggles. Closed eyelids are not sufficient protection.', 'error', 8000);
      return;
    }
    const startedId = await startDeviceSession({ deviceId, distanceCm, bodyAreas, bodyArea, eyesProtected, mode });
    if (!startedId) {
      showNotification('The timer could not start. Check that no other session is active.', 'error');
      return;
    }
    closeDialog();
    showNotification(`Live ${escapeHTML(device.brand)} session started — tap Stop & save when finished.`);
    ensureActiveDeviceTicker();
    navigate?.('light');
  });
  return true;
}

export {
  _defaultRegionsForLastSession as _testDefaultRegionsForLastSession,
  _broadAreaForRegions as _testBroadAreaForRegions,
};
