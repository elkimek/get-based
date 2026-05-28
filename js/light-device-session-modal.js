// light-device-session-modal.js — Log/start light therapy device sessions.

import { state } from './state.js';
import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import { BODY_REGIONS } from './sun.js';

function _wireDeviceSessionModal(overlay) {
  if (typeof window === 'undefined') { document.body.appendChild(overlay); return; }
  if (window._wireBackdropClose) try { window._wireBackdropClose(overlay); } catch (_) {}
  document.body.appendChild(overlay);
  if (window.trapModalFocus) try { window.trapModalFocus(overlay); } catch (_) {}
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
  const distInput = overlay.querySelector('#dev-session-distance');
  const distVal = parseFloat(distInput?.value);
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
  const {
    hydrateDevicesFromPresets,
    getDevices,
    logDeviceSession,
    getActiveDeviceSession,
    startDeviceSession,
    ensureActiveDeviceTicker,
  } = deps;

  // Lazy hydrate covers page-opened-mid-init / cold preset cache cases so
  // the dialog renders with the latest mode/coupling schema.
  await hydrateDevicesFromPresets?.().catch(() => {});
  const device = getDevices?.()?.find(d => d.id === deviceId);
  if (!device) return;

  // Prefill from the user's last logged session on this device. First-time
  // logs fall through to vendor reference distance + sensible defaults.
  const last = device.lastSession || {};
  const defaultDuration = Number.isFinite(last.durationMin) && last.durationMin > 0 ? last.durationMin : 10;
  const defaultDistanceCm = Number.isFinite(last.distanceCm) && last.distanceCm > 0
    ? last.distanceCm
    : (device.recommendedDistanceCm || 15);
  const defaultEyesProtected = last.eyesProtected !== false;
  const defaultRegions = _defaultRegionsForLastSession(last);

  // Mode picker renders only for devices with multiple valid modes.
  const validateMode = window.validateModeCoupling || (() => ({ ok: true }));
  const validModes = Array.isArray(device.modes)
    ? device.modes.filter(m => validateMode(device, m.id).ok)
    : [];
  const showModePicker = validModes.length > 1;
  let defaultMode = null;
  if (showModePicker) {
    const lastModeValid = last.mode && validModes.some(m => m.id === last.mode);
    defaultMode = lastModeValid ? last.mode : (validModes.find(m => m.default) || validModes[0])?.id || null;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-label="Log device session">
    <div class="modal-header">
      <h3>Log session — ${escapeHTML(device.brand)} ${escapeHTML(device.model)}</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
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
        <input type="number" id="dev-session-duration" class="ctx-input" min="1" max="120" value="${defaultDuration}" />
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
          <span class="dev-session-hint">Vendor reference: ${fmt(refCm, 'cm')} cm (${fmt(refCm, 'in')} in).${overrideHint} The dose math uses inverse-square scaling around this point — close ranges magnify errors fast.</span>
        </label>`;
      })()}
      <div class="ctx-label" style="display:block">
        <span>Body area treated</span>
        <div class="sun-silhouette-wrap" id="dev-session-silhouette-slot">${(typeof window !== 'undefined' && window.renderBodySilhouette) ? window.renderBodySilhouette(new Set(defaultRegions)) : ''}</div>
        <div class="sun-silhouette-hint-row" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div class="sun-silhouette-hint" id="dev-session-area-hint">Tap regions the panel reaches.</div>
          <button type="button" class="ctx-btn-option" id="dev-session-clear" style="padding:2px 10px;font-size:11px">Clear</button>
        </div>
      </div>
      <div class="ctx-label" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <span style="flex:1;min-width:0">Eyes protected (goggles or closed)</span>
        <label class="toggle-switch">
          <input type="checkbox" id="dev-session-eyes"${defaultEyesProtected ? ' checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <p class="modal-body-hint" style="margin-top:8px">Save now to log a finished session, or Start to run a live timer (matches the sun-session pattern — handy when you want to walk away and come back).</p>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="import-btn import-btn-secondary" id="dev-session-start">Start timer</button>
        <button class="import-btn import-btn-primary" id="dev-session-save">Save session</button>
      </div>
    </div>
  </div>`;
  _wireDeviceSessionModal(overlay);

  let lastModePointerActivation = 0;
  const setMode = (btn) => {
    const mode = btn.dataset.mode || '';
    const input = overlay.querySelector('#dev-session-mode');
    if (input) input.value = mode;
    for (const b of overlay.querySelectorAll('.dev-mode-btn[data-mode]')) {
      const active = b === btn;
      b.classList.toggle('active', active);
      b.setAttribute('aria-checked', active ? 'true' : 'false');
    }
  };
  for (const btn of overlay.querySelectorAll('.dev-mode-btn[data-mode]')) {
    btn.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') return;
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
  if (silhouetteSlot && typeof window !== 'undefined' && window.bindBodySilhouette) {
    window.bindBodySilhouette(silhouetteSlot, selectedRegions, (set) => {
      updateAreaHint(set);
    });
  }
  updateAreaHint(selectedRegions);

  overlay.querySelector('#dev-session-clear')?.addEventListener('click', () => {
    selectedRegions.clear();
    if (silhouetteSlot && typeof window !== 'undefined' && window.renderBodySilhouette) {
      silhouetteSlot.innerHTML = window.renderBodySilhouette(selectedRegions);
    }
    updateAreaHint(selectedRegions);
  });

  for (const btn of overlay.querySelectorAll('.dev-unit-btn')) {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-unit');
      const input = overlay.querySelector('#dev-session-distance');
      const cur = input.dataset.unit || 'cm';
      if (cur === target) return;
      const v = parseFloat(input.value);
      if (Number.isFinite(v)) {
        const cm = cur === 'in' ? v * 2.54 : v;
        input.value = target === 'in' ? +(cm / 2.54).toFixed(1) : Math.round(cm);
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

  overlay.querySelector('#dev-session-save').addEventListener('click', async () => {
    const durationMin = parseInt(overlay.querySelector('#dev-session-duration').value, 10) || 10;
    const distanceCm = _readDistanceCm(overlay, device.recommendedDistanceCm || 15);
    const bodyAreas = Array.from(selectedRegions);
    if (bodyAreas.length === 0) {
      _showEmptyRegionError(updateAreaHint, selectedRegions, hint);
      return;
    }
    const bodyArea = _broadAreaForRegions(bodyAreas);
    const eyesProtected = overlay.querySelector('#dev-session-eyes').checked;
    const mode = showModePicker ? overlay.querySelector('#dev-session-mode')?.value || null : null;
    await logDeviceSession({ deviceId, durationMin, distanceCm, bodyArea, bodyAreas, eyesProtected, mode });
    overlay.remove();
    showNotification(`${durationMin} min ${escapeHTML(device.brand)} session saved.`);
    if (window.navigate) window.navigate('light');
  });

  overlay.querySelector('#dev-session-start').addEventListener('click', async () => {
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
    const bodyArea = _broadAreaForRegions(bodyAreas);
    const eyesProtected = overlay.querySelector('#dev-session-eyes').checked;
    const mode = showModePicker ? overlay.querySelector('#dev-session-mode')?.value || null : null;
    await startDeviceSession({ deviceId, distanceCm, bodyAreas, bodyArea, eyesProtected, mode });
    overlay.remove();
    showNotification(`Live ${escapeHTML(device.brand)} session started — tap Stop & save when finished.`);
    ensureActiveDeviceTicker();
    if (window.navigate) window.navigate('light');
  });
}

export {
  _defaultRegionsForLastSession as _testDefaultRegionsForLastSession,
  _broadAreaForRegions as _testBroadAreaForRegions,
};
