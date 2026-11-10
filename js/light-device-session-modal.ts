import type { DeviceSessionRecord } from './light-devices-store.js';

export interface DeviceSessionDialogDeps {
  hydrateDevicesFromPresets?: (() => Promise<unknown>) | null;
  getDevices?: typeof import('./light-devices-store.js').getDevices;
  logDeviceSession?: typeof import('./light-devices-store.js').logDeviceSession;
  logDeviceSessionRange?: typeof import('./light-devices-store.js').logDeviceSessionRange;
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
import { deviceEmitsUV, deviceProgramMinutes } from './light-device-session-engine.js';

const FOUR_PLACEMENT_REGIONS = [
  ['breast-chest', 'torso-front', 'abdomen', 'arms-front'],
  ['legs-front'],
  ['torso-back', 'arms-back'],
  ['glutes', 'legs-back'],
];

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

export async function openDeviceSessionDialog(deviceId: string, deps: DeviceSessionDialogDeps = {}, options: { isCurrent?: () => boolean; hydrate?: boolean } = {}) {
  if (options.isCurrent?.() === false) return false;
  const resolvedDeps = _resolveSessionDialogDeps(deps);
  const {
    hydrateDevicesFromPresets,
    getDevices,
    logDeviceSession,
    logDeviceSessionRange,
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
  if (options.hydrate !== false) await hydrateDevicesFromPresets?.().catch(() => {});
  if (options.isCurrent?.() === false) return false;
  const device = getDevices?.()?.find(d => d.id === deviceId);
  if (!device) return false;
  const profileId = state.currentProfile;
  const profileData = state.importedData;

  // Prefill from the user's last logged session on this device. First-time
  // logs fall through to vendor reference distance + sensible defaults.
  const last = device.lastSession || {};
  const defaultDistanceCm = Number.isFinite(last.distanceCm) && last.distanceCm! > 0
    ? last.distanceCm!
    : (device.recommendedDistanceCm || 15);
  const lastPlacements = last.bodyPlacements?.length === 4 ? last.bodyPlacements : null;
  const defaultRegions = lastPlacements?.[0] || _defaultRegionsForLastSession(last);

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
    ? last.durationMin! / (lastPlacements?.length ?? 1)
    : (isUVDevice ? 0.5 : 10);
  const isEyeLightDevice = ['sad', 'dawn-sim', 'full-spectrum'].includes(device.type as string) && !isUVDevice;
  const defaultEyeControlChecked = isEyeLightDevice
    ? last.eyesProtected !== true
    : deviceProgramMinutes(device, initialMode) === null && last.eyesProtected !== false;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const closeDialog = () => removeModalOverlay(overlay);
  overlay.innerHTML = renderHTML({ kind: 'device',
    view: projectDeviceSessionForm({ device, validModes, defaultMode, defaultDuration, defaultDistanceCm, useUS: state.unitSystem === 'US', isUVDevice, isEyeLightDevice, defaultEyeControlChecked }),
    silhouetteView: projectBodySilhouette ? projectBodySilhouette(new Set(defaultRegions)) : null,
  });
  _wireDeviceSessionModal(overlay, closeDialog);
  const canSave = () => overlay.isConnected && state.currentProfile === profileId && state.importedData === profileData;
  overlay.querySelectorAll('[data-device-session-close]').forEach(btn => {
    btn.addEventListener('click', closeDialog);
  });

  const ambientEyeTypes = ['sad', 'dawn-sim', 'full-spectrum'];
  const durationInput = _input(overlay, '#dev-session-duration');
  const fourPlacements = _input(overlay, '#dev-session-four-placements')!;
  const placementPicker = overlay.querySelector<HTMLSelectElement>('#dev-session-placement')!;
  const rangeInput = _input(overlay, '#dev-session-range')!;
  const timerButton = _button(overlay, '#dev-session-start');
  const saveButton = _button(overlay, '#dev-session-save');
  const readMode = () => showModePicker ? _input(overlay, '#dev-session-mode')?.value || null : initialMode;
  const syncLogControls = () => {
    const program = deviceProgramMinutes(device, readMode());
    if (timerButton) timerButton.hidden = fourPlacements.checked || rangeInput.checked || program !== null;
    if (saveButton) saveButton.textContent = rangeInput.checked ? 'Save date range' : 'Save session';
    overlay.querySelector('#dev-session-duration-label')!.textContent = fourPlacements.checked ? 'Minutes per placement' : 'Duration (minutes)';
    overlay.querySelector('#dev-session-timing')!.textContent = program !== null
      ? 'Vitamin D cycle: 1 min red/NIR, 3 min all bands, 1 min red/NIR. Record the time actually used in one cycle.'
      : 'Record the time actually used. Follow the device timer and instructions.';
    if (durationInput) durationInput.max = String(program ?? (fourPlacements.checked ? 150 : 600));
  };
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
    const program = deviceProgramMinutes(device, mode);
    if (program !== null && durationInput) durationInput.value = String(program);
    syncLogControls();
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
  let singlePlacement = lastPlacements ? ['breast-chest'] : defaultRegions.slice();
  const placements = (lastPlacements || FOUR_PLACEMENT_REGIONS).map(areas => areas.slice());
  let placementIndex = 0;
  fourPlacements.checked = !!lastPlacements;
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

  const refreshRegions = () => {
    if (silhouetteSlot && projectBodySilhouette) {
      const silhouetteView = projectBodySilhouette(selectedRegions);
      silhouetteSlot.innerHTML = silhouetteView ? renderBodyPickerHTML({ view: silhouetteView }) : '';
    }
    updateAreaHint(selectedRegions);
  };
  const showRegions = (regions: string[]) => {
    selectedRegions.clear();
    for (const region of regions) selectedRegions.add(region);
    refreshRegions();
  };
  const placementFields = overlay.querySelector<HTMLElement>('#dev-session-placements')!;
  placementFields.hidden = !fourPlacements.checked;
  fourPlacements.addEventListener('change', () => {
    placementFields.hidden = !fourPlacements.checked;
    if (fourPlacements.checked) {
      singlePlacement = [...selectedRegions];
      showRegions(placements[placementIndex]!);
    } else {
      placements[placementIndex] = [...selectedRegions];
      showRegions(singlePlacement);
    }
    syncLogControls();
  });
  placementPicker.addEventListener('change', () => {
    placements[placementIndex] = [...selectedRegions];
    placementIndex = Number(placementPicker.value);
    showRegions(placements[placementIndex]!);
  });
  overlay.querySelector('#dev-session-clear')?.addEventListener('click', () => showRegions([]));
  rangeInput.addEventListener('change', () => {
    overlay.querySelector<HTMLElement>('#dev-session-range-fields')!.hidden = !rangeInput.checked;
    syncLogControls();
  });
  syncLogControls();

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

  let submitting = false;
  saveButton?.addEventListener('click', async () => {
    if (submitting || !canSave()) return;
    const minutes = Number(durationInput?.value);
    const max = Number(durationInput?.max);
    if (!Number.isFinite(minutes) || minutes < 0.1 || minutes > max) {
      showNotification(`Enter the actual duration between 0.1 and ${max} minutes.`, 'error');
      return;
    }
    const distanceCm = _readDistanceCm(overlay, device.recommendedDistanceCm || 15);
    const grouped = fourPlacements.checked;
    if (grouped) {
      placements[placementIndex] = [...selectedRegions];
      if (placements.some(areas => !areas.length)) {
        showNotification('Pick the treated regions in all four placements.', 'error');
        return;
      }
    }
    const bodyAreas = grouped ? [...new Set(placements.flat())] : [...selectedRegions];
    if (bodyAreas.length === 0) {
      _showEmptyRegionError(updateAreaHint, selectedRegions, hint);
      return;
    }
    const mode = readMode();
    const bodyArea = _broadAreaForRegions(bodyAreas);
    const emitsUV = deviceEmitsUV(device, mode);
    const eyeChecked = !!_input(overlay, '#dev-session-eyes')?.checked;
    const eyeLightForMode = ambientEyeTypes.includes(device.type as string) && !emitsUV;
    const eyesProtected = eyeLightForMode ? !eyeChecked : eyeChecked;
    const durationMin = grouped ? minutes * placements.length : minutes;
    const input = { deviceId, durationMin, distanceCm, bodyArea, bodyAreas, eyesProtected, mode,
      ...(grouped ? { bodyPlacements: placements.map(areas => areas.slice()) } : {}) };
    const range = rangeInput.checked ? {
      startDate: _input(overlay, '#dev-session-from')!.value,
      endDate: _input(overlay, '#dev-session-to')!.value,
      startTime: _input(overlay, '#dev-session-time')!.value,
    } : null;
    submitting = true;
    saveButton.disabled = true;
    try {
      if (emitsUV && !eyesProtected && !await showConfirmDialog('This records UV exposure without UV-rated goggles. Save it as an unsafe past exposure?')) return;
      if (!canSave()) return;
      if (range) {
        const result = await logDeviceSessionRange?.(input, range, canSave);
        if (!result) {
          showNotification('Could not save the date range. Check the distance, dates and local start time. Enter up to 366 completed days with each session ending on its start date.', 'error');
          return;
        }
        showNotification(`${result.saved} sessions saved.${result.skipped ? ` ${result.skipped} days already logged.` : ''}`);
      } else {
        const saved = await logDeviceSession?.(input);
        if (!saved) {
          showNotification('The session could not be saved. Check the duration and distance.', 'error');
          return;
        }
        showNotification(`${durationMin} min ${escapeHTML(device.brand)} session saved.`);
      }
      closeDialog();
      navigate?.('light');
    } finally {
      submitting = false;
      saveButton.disabled = false;
    }
  });

  timerButton?.addEventListener('click', async () => {
    if (timerButton.hidden || submitting || !canSave()) return;
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
