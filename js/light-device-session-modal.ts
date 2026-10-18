import type { DeviceSessionRecord } from './light-devices-store.js';

export interface DeviceSessionDialogDeps {
  hydrateDevicesFromPresets?: (() => Promise<unknown>) | null;
  getDevices?: typeof import('./light-devices-store.js').getDevices;
  logDeviceSession?: typeof import('./light-devices-store.js').logDeviceSession;
  getActiveDeviceSession?: typeof import('./light-devices-store.js').getActiveDeviceSession;
  startDeviceSession?: typeof import('./light-devices-store.js').startDeviceSession;
  ensureActiveDeviceTicker?: () => unknown;
  validateModeCoupling?: typeof validateModeCoupling | null;
  projectBodySilhouette?: ((selected: Set<string>) => BodyPickerView | null) | null;
  bindBodySilhouette?: typeof bindBodySilhouette | null;
  navigate?: ((route: string) => unknown) | null; openLightSetup?: (() => unknown) | null;
}

// light-device-session-modal.js — Log/start light therapy device sessions.

import { renderHTML } from './components/LightSessionPresentation.svelte.html.js';
import { renderHTML as renderBodyPickerHTML } from './components/SunBodyPicker.svelte.html.js';
import type {BodyPickerView} from './sun-body-picker-presentation.js';
import { projectDeviceSessionForm } from './light-session-presentation.js';

import { state } from './state.js';
import { escapeHTML, showNotification, showConfirmDialog } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import { BODY_REGIONS, bindBodySilhouette, projectBodySilhouette } from './sun-body-silhouette.js';
import { validateModeCoupling } from './sun-spectrum.js';
import { deviceEmitsUV } from './light-device-session-engine.js';

function _resolveSessionDialogDeps(deps: DeviceSessionDialogDeps = {}) {
  return {
    ...deps,
    validateModeCoupling: deps.validateModeCoupling || validateModeCoupling,
    projectBodySilhouette: deps.projectBodySilhouette || projectBodySilhouette,
    bindBodySilhouette: deps.bindBodySilhouette || bindBodySilhouette,
    navigate: deps.navigate || null,
    openLightSetup: deps.openLightSetup || null,
  };
}

function _input(root: ParentNode, selector: string) {
  return (root.querySelector(selector) as HTMLInputElement | null);
}

function _button(root: ParentNode, selector: string) {
  return (root.querySelector(selector) as HTMLButtonElement | null);
}

function _wireDeviceSessionModal(overlay: HTMLElement, closeFn: () => void) {
  if (typeof window === 'undefined') { document.body.appendChild(overlay); return; }
  openAppendedModalOverlay(overlay, closeFn);
}

function _defaultRegionsForLastSession(last: Pick<Partial<DeviceSessionRecord>, 'bodyAreas' | 'bodyArea'>) {
  // bodyAreas[] is the precise per-region field. For legacy sessions that
  // only have a broad bodyArea string, expand it to matching region keys
  // so the silhouette pre-selects sensibly.
  const broadToRegions: Record<string, string[]> = {
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
  if (last.bodyArea && broadToRegions[last.bodyArea]) return broadToRegions[last.bodyArea]!.slice();
  return ['breast-chest'];
}

function _broadAreaForRegions(bodyAreas: string[]) {
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

function _readDistanceCm(overlay: HTMLElement, fallbackCm: number) {
  const distInput = _input(overlay, '#dev-session-distance');
  const distVal = parseFloat(distInput?.value || '');
  const distUnit = distInput?.dataset.unit || 'cm';
  return Number.isFinite(distVal)
    ? (distUnit === 'in' ? distVal * 2.54 : distVal)
    : fallbackCm;
}

function _showEmptyRegionError(updateAreaHint: (selected: Set<string>) => void, selectedRegions: Set<string>, hintEl: Element | null) {
  updateAreaHint(selectedRegions);
  hintEl?.classList.add('sun-silhouette-hint-error');
  setTimeout(() => hintEl?.classList.remove('sun-silhouette-hint-error'), 2500);
}

export async function openDeviceSessionDialog(deviceId: string, deps: DeviceSessionDialogDeps = {}) {
  const resolvedDeps = _resolveSessionDialogDeps(deps);
  const {
    hydrateDevicesFromPresets,
    getDevices,
    logDeviceSession,
    getActiveDeviceSession,
    startDeviceSession,
    ensureActiveDeviceTicker,
    validateModeCoupling,
    projectBodySilhouette,
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
  const defaultDistanceCm = Number.isFinite(last.distanceCm) && last.distanceCm! > 0
    ? last.distanceCm!
    : (device.recommendedDistanceCm || 15);
  const defaultRegions = _defaultRegionsForLastSession(last);

  // Mode picker renders only for devices with multiple valid modes.
  const validModes = Array.isArray(device.modes)
    ? device.modes.filter(m => validateModeCoupling(device, m.id).ok)
    : [];
  const showModePicker = validModes.length > 1;
  let defaultMode: string | null = null;
  if (showModePicker) {
    const lastModeValid = last.mode && validModes.some(m => m.id === last.mode);
    defaultMode = lastModeValid ? last.mode! : (validModes.find(m => m.default) || validModes[0])?.id || null;
  }
  const initialMode = showModePicker ? defaultMode : (last.mode || null);
  const isUVDevice = deviceEmitsUV(device, initialMode);
  // Never prefill a first UV session with the generic ten-minute PBM default.
  // Thirty seconds is only a neutral input starting point, not guidance.
  const defaultDuration = Number.isFinite(last.durationMin) && last.durationMin! > 0
    ? last.durationMin!
    : (isUVDevice ? 0.5 : 10);
  const isEyeLightDevice = ['sad', 'dawn-sim', 'full-spectrum'].includes(device.type as string) && !isUVDevice;
  const defaultEyeControlChecked = isEyeLightDevice
    ? last.eyesProtected !== true
    : last.eyesProtected !== false;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const closeDialog = () => removeModalOverlay(overlay);
  overlay.innerHTML = renderHTML({ kind: 'device',
    view: projectDeviceSessionForm({ device, validModes, defaultMode, defaultDuration, defaultDistanceCm, useUS: state.unitSystem === 'US', isUVDevice, isEyeLightDevice, defaultEyeControlChecked }),
    silhouetteView: projectBodySilhouette ? projectBodySilhouette(new Set(defaultRegions)) : null,
  });
  _wireDeviceSessionModal(overlay, closeDialog);
  overlay.querySelectorAll('[data-device-session-close]').forEach(btn => {
    btn.addEventListener('click', closeDialog);
  });

  const ambientEyeTypes = ['sad', 'dawn-sim', 'full-spectrum'];
  const durationInput = _input(overlay, '#dev-session-duration');
  let durationEdited = false;
  durationInput?.addEventListener('input', () => { durationEdited = true; });
  let eyeControlKind = isUVDevice ? 'uv' : isEyeLightDevice ? 'ambient' : 'protection';
  const syncEyeControlForMode = (mode: string | null | undefined, { initial = false } = {}) => {
    const emitsUV = deviceEmitsUV(device, mode);
    const kind = emitsUV ? 'uv' : ambientEyeTypes.includes(device.type as string) ? 'ambient' : 'protection';
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
  const setMode = (btn: HTMLElement) => {
    const mode = btn.dataset.mode || '';
    const input = _input(overlay, '#dev-session-mode');
    if (input) input.value = mode;
    for (const b of overlay.querySelectorAll('.dev-mode-btn[data-mode]')) {
      const active = b === btn;
      b.classList.toggle('active', active);
      b.setAttribute('aria-checked', active ? 'true' : 'false');
      (b as HTMLElement).tabIndex = active ? 0 : -1;
    }
    syncEyeControlForMode(mode);
  };
  for (const rawBtn of overlay.querySelectorAll('.dev-mode-btn[data-mode]')) {
    const btn = (rawBtn as HTMLElement);
    btn.addEventListener('keydown', event => {
      const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
      if (!keys.includes(event.key)) return;
      const buttons = Array.from(overlay.querySelectorAll<HTMLElement>('.dev-mode-btn[data-mode]'));
      const index = buttons.indexOf(btn);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
      const target = buttons[next];
      if (!target) return;
      event.preventDefault();
      setMode(target);
      target.focus();
    });
    btn.addEventListener('pointerup', (e) => {
      if (((e as PointerEvent)).pointerType === 'mouse') return;
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
  const updateAreaHint = (set: Set<string>) => {
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
    if (silhouetteSlot && projectBodySilhouette) {
      const silhouetteView = projectBodySilhouette(selectedRegions);
      silhouetteSlot.innerHTML = silhouetteView ? renderBodyPickerHTML({ view: silhouetteView }) : '';
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
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
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
    const eyeLightForMode = ambientEyeTypes.includes(device.type as string) && !emitsUV;
    const eyesProtected = eyeLightForMode ? !eyeChecked : eyeChecked;
    if (emitsUV && !eyesProtected) {
      const saveUnsafe = await showConfirmDialog('This records UV exposure without UV-rated goggles. Save it as an unsafe past exposure?');
      if (!saveUnsafe) return;
    }
    const saved = await logDeviceSession!({ deviceId, durationMin, distanceCm, bodyArea, bodyAreas, eyesProtected, mode });
    if (!saved) {
      showNotification('The session could not be saved. Check the duration and distance.', 'error');
      return;
    }
    closeDialog();
    showNotification(`${durationMin} min ${escapeHTML(device.brand)} session saved.`);
    navigate?.('light');
  });

  _button(overlay, '#dev-session-start')?.addEventListener('click', async () => {
    if (getActiveDeviceSession!()) {
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
    const eyeLightForMode = ambientEyeTypes.includes(device.type as string) && !emitsUV;
    const eyesProtected = eyeLightForMode ? !eyeChecked : eyeChecked;
    if (emitsUV && !eyesProtected) {
      showNotification('UV sessions require UV-rated goggles. Closed eyelids are not sufficient protection.', 'error', 8000);
      return;
    }
    const startedId = await startDeviceSession!({ deviceId, distanceCm, bodyAreas, bodyArea, eyesProtected, mode });
    if (!startedId) {
      showNotification('The timer could not start. Check that no other session is active.', 'error');
      return;
    }
    closeDialog();
    showNotification(`Live ${escapeHTML(device.brand)} session started — tap Stop & save when finished.`);
    ensureActiveDeviceTicker!();
    navigate?.('light');
  });
  return true;
}

export {
  _defaultRegionsForLastSession as _testDefaultRegionsForLastSession,
  _broadAreaForRegions as _testBroadAreaForRegions,
};
