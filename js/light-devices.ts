import type{SessionAIView}from'./light-session-ai-presentation.js';
// light-devices.js — Light therapy device library + device session logging.
//
// Devices users own (Joovv, Sperti, Verilux SAD, dawn simulators, etc.) feed
// the same biological channel accumulators as outdoor sun sessions. Each
// device has a typed spectrum/irradiance profile; logging a session creates
// a deviceSessions[] record with computed per-channel doses.
//
// Channels covered by device type:
//   uvb           → vitamin_d, pomc
//   uva           → pomc, no_cv
//   combined / pbm-targeted → pbm_red, pbm_nir
//   sad           → circadian
//   dawn-sim      → circadian (lower intensity, gradual ramp)
//   full-spectrum → circadian
//
// Schema (already migrated in profile.js):
//   importedData.lightDevices[]   — user's owned devices
//   importedData.deviceSessions[] — session log

import type { LightDeviceRecord, DeviceSessionRecord } from './light-devices-store.js';
import type { LightDeviceSetupDeps } from './light-device-setup-modal.js';

type ChannelReader = Record<string, { label?: unknown; icon?: unknown }>;

import { renderHTML as renderDevicePresentation } from './components/LightDevicePresentation.svelte.html.js';
import { projectDeviceLibrary, projectDevicePicker } from './light-device-library-presentation.js';
import { renderHTML } from './components/LightSessionPresentation.svelte.html.js';
import { detailField, detailChannel, deviceDetailNotices, deviceDetailLightMetric } from './light-session-detail-presentation.js';

import { bindDetachedModalSyncRefresh, showNotification, showConfirmDialog } from './utils.js';
import { state } from './state.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import { CHANNEL_DISPLAY } from './sun.js';
import { BODY_REGIONS, bindBodySilhouette, projectBodySilhouette } from './sun-body-silhouette.js';
import { validateModeCoupling } from './sun-spectrum.js';
import { deviceEmitsUV } from './light-device-session-engine.js';
import { reopenSunSetup } from './sun-defaults.js';
import {
  addCustomDevice,
  addDeviceFromPresetRecord,
  deleteDevice,
  deleteDeviceSession,
  getActiveDeviceSession,
  getDeviceSessions,
  getDevices,
  hydrateDevicesFromPresetRecords,
  logDeviceSession,
  rehydrateStaleDeviceSessions,
  rollingDeviceTotals,
  startDeviceSession,
  stopDeviceSession,
  updateDeviceSession,
} from './light-devices-store.js';
import { configureLightDevicesActions, installLightDevicesActionDelegates } from './light-devices-actions.js';
import {
  configureLightDeviceModalLoader,
  openAddDeviceDialog,
  openCustomDeviceDialog,
  openDeviceSessionDialog,
} from './light-device-modal-loader.js';
import {
  getLightDeviceChannelDisplay,
  getLightDeviceChannelHelpers,
  loadLightDevicesCatalog,
  navigateLightDevicesRoute,
  openLightDeviceChannel,
  promptLightDeviceSessionDuration,
  refreshLightDevicesView,
  getLightDeviceAffiliateViewRuntime,
} from './light-devices-runtime.js';
import {
  deviceBasisLabel as _deviceBasisLabel,
  localDeviceSessionStamp as _localDeviceSessionStamp,
  safeHttpUrl as _safeHttpUrl,
} from './light-device-view-formatters.js';


const lightDevicesDeps: { getDeviceSessionAIDetailView: unknown } = {
  getDeviceSessionAIDetailView: () => null,
};

export function configureLightDevices(deps: unknown = {}) {
  Object.assign(lightDevicesDeps, deps);
}

if (typeof document !== 'undefined') installLightDevicesActionDelegates();

export { installLightDevicesActionDelegates };
export { openAddDeviceDialog, openCustomDeviceDialog, openDeviceSessionDialog };
export {
  addCustomDevice,
  deleteDevice,
  deleteDeviceSession,
  getActiveDeviceSession,
  getDeviceSessions,
  getDevices,
  logDeviceSession,
  rehydrateStaleDeviceSessions,
  rollingDeviceTotals,
  startDeviceSession,
  stopDeviceSession,
  updateDeviceSession,
};

// Preset library is loaded lazily — keeps the JSON out of the boot path.
let _PRESETS: unknown = null;
let _PRESET_TYPES: unknown = null;

// Standard modal-mount pattern shared by every modal opener in this file:
// wire backdrop-click close, append, then trap focus.
function _wireModal(overlay: HTMLElement, closeFn: () => void) {
  if (typeof window === 'undefined') { document.body.appendChild(overlay); return; }
  openAppendedModalOverlay(overlay, closeFn);
}

configureLightDeviceModalLoader({
  setup: {
    loadPresets: loadLightDevicePresets as LightDeviceSetupDeps['loadPresets'],
    addDeviceFromPreset,
    addCustomDevice,
    wireModal: _wireModal,
    refreshLightView: () => refreshLightDevicesView(),
  },
  session: {
    hydrateDevicesFromPresets,
    getDevices,
    logDeviceSession,
    getActiveDeviceSession,
    startDeviceSession,
    ensureActiveDeviceTicker,
    validateModeCoupling,
    projectBodySilhouette,
    bindBodySilhouette,
    navigate: navigateLightDevicesRoute,
    openLightSetup: reopenSunSetup,
  },
});

export async function loadLightDevicePresets() {
  if (_PRESETS) return { presets: _PRESETS, types: _PRESET_TYPES };
  try {
    const res = await fetch('data/light-device-presets.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as { presets?: unknown; _types?: unknown };
    _PRESETS = json.presets || [];
    _PRESET_TYPES = json._types || {};
    return { presets: _PRESETS, types: _PRESET_TYPES };
  } catch (e) {
    return { presets: [], types: {} };
  }
}

// ─── Public API ────────────────────────────────────────────────────────

export async function addDeviceFromPreset(presetId: unknown, overrides: unknown = {}): Promise<unknown> {
  const { presets } = await loadLightDevicePresets();
  const preset = (presets as LightDeviceRecord[]).find(p => p.id === presetId);
  return addDeviceFromPresetRecord(preset, overrides as Parameters<typeof addDeviceFromPresetRecord>[1]);
}

// Backfill channelGroups / modes / coupling from the preset library onto
// user devices that pre-date Round 7. Idempotent — devices already
// carrying the field skip. Custom (non-preset) devices skip too. Run
// once at boot so existing localStorage devices light up the mode picker
// without requiring re-add.
export async function hydrateDevicesFromPresets() {
  const { presets } = await loadLightDevicePresets();
  return hydrateDevicesFromPresetRecords(presets as Parameters<typeof hydrateDevicesFromPresetRecords>[0]);
}

// ─── Live device-session timer ─────────────────────────────────────────
//
// Mirrors the sun.js start/stop pattern: startDeviceSession() stages an
// active record with a start timestamp + selected regions; the dashboard
// + /light surfaces show a live elapsed counter; stopDeviceSession()
// finalizes it through logDeviceSession's dose math so the saved record
// is identical in shape to an after-the-fact log.

// User-facing edit-mode entry point. Mirrors editDeviceSessionDuration
// but for the mode field — opens a small picker dialog filtered to
// coupling-valid modes, persists the choice via updateDeviceSession
// (which recomputes doses through effectiveDeviceForMode), re-renders.
// Devices without `modes` (or with only one valid mode after coupling
// filtering) skip the dialog and surface a notice instead.
export async function editDeviceSessionMode(id: string) {
  const sess = getDeviceSessions().find(s => s.id === id);
  if (!sess) {
    showNotification('Session not found', 'error');
    return;
  }
  const device = getDevices().find(d => d.id === sess.deviceId) || sess.deviceSnapshot || null;
  if (!device || !Array.isArray(device.modes) || device.modes.length === 0) {
    showNotification('This device has no selectable modes.', 'info');
    return;
  }
  const validModes = device.modes.filter(m => validateModeCoupling(device, m.id).ok);
  if (validModes.length < 2) {
    showNotification('Only one mode is available for this device.', 'info');
    return;
  }
  const currentMode = sess.mode || (device.modes.find(m => m.default) || device.modes[0])?.id;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const closeDialog = () => removeModalOverlay(overlay);
  overlay.innerHTML = renderHTML({ kind: 'mode-editor', name: `${device.brand ?? ''} ${device.model ?? ''}`,
    modes: validModes.map(mode => ({ key: String(mode.id ?? ''), label: String(mode.label || mode.id), selected: mode.id === currentMode })),
  });
  _wireModal(overlay, closeDialog);
  overlay.querySelectorAll('[data-device-mode-close]').forEach(btn => {
    btn.addEventListener('click', closeDialog);
  });
  overlay.querySelector('#dev-edit-mode-save')?.addEventListener('click', async () => {
    const next = _select(overlay, '#dev-edit-mode')?.value || '';
    closeDialog();
    if (next === sess.mode) return;
    const updated = await updateDeviceSession(id, { mode: next });
    if (!updated) {
      showNotification('The mode could not be updated.', 'error');
      return;
    }
    showNotification('Mode updated. Doses recomputed.', 'success');
    refreshLightDevicesView();
  });
}

// User-facing edit-duration entry point — same shape as
// editSunSessionDuration. Prompts for new minutes, validates, calls
// updateDeviceSession (which recomputes doses + endedAt), re-renders.
export async function editDeviceSessionDuration(id: string) {
  const sess = getDeviceSessions().find(s => s.id === id);
  if (!sess) {
    showNotification('Session not found', 'error');
    return;
  }
  const current = Math.max(0, Math.round((sess.durationMin || 0) * 10) / 10);
  const raw = await promptLightDeviceSessionDuration(current);
  if (raw === null || raw === undefined) return;
  const parsed = parseFloat(raw as string);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 600) {
    showNotification('Enter a duration between 0 and 600 minutes.', 'error');
    return;
  }
  const next = Math.round(parsed * 10) / 10;
  if (next === current) return;
  const updated = await updateDeviceSession(id, { durationMin: next });
  if (!updated) {
    showNotification('The duration could not be updated.', 'error');
    return;
  }
  showNotification(`Session duration set to ${next} min. Doses recomputed.`, 'success');
  refreshLightDevicesView();
}

// ─── UI: per-device-session detail modal ──────────────────────────────
//
// Mirrors openSunSessionDetail in shape so the unified sessions list
// behaves consistently — clicking any row opens its details. Device
// sessions don't carry atmosphere or location, so we surface device
// info instead (peak wavelengths, irradiance, recommended distance).
const _DEVICE_AREA_LABELS = {
  'targeted': 'Targeted (single area)',
  'face': 'Face',
  'torso': 'Torso',
  'arms': 'Arms',
  'legs': 'Legs',
  'whole-body': 'Whole body',
};

function _select(root: ParentNode, selector: string) {
  return (root.querySelector(selector) as HTMLSelectElement | null);
}

export function openDeviceSessionDetail(id?: string) {
  const sessions = getDeviceSessions();
  const sess = sessions.find(s => s.id === id);
  if (!sess) return;
  const liveDevice = getDevices().find(d => d.id === sess.deviceId) || null;
  const device = liveDevice || sess.deviceSnapshot || null;
  const { formatChannelUnit } = getLightDeviceChannelHelpers() as unknown as { formatChannelUnit: (...args: Parameters<typeof import('./sun.js').formatChannelUnit>) => unknown };
  const channelDisplay = getLightDeviceChannelDisplay(CHANNEL_DISPLAY) as ChannelReader;
  const channelOrder = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye', 'pbm_red', 'pbm_nir'];

  const stamp = _localDeviceSessionStamp(sess.startedAt);
  const dur = sess.durationMin ? `${Math.round(sess.durationMin * 10) / 10} min` : '—';
  const devName = device ? `${device.brand} ${device.model}` : 'Device details unavailable';
  const typeLabel = device?.type || '—';
  const peakStr = device?.peakWavelengths?.length
    ? device.peakWavelengths.map(w => `${w} nm`).join(', ') : '—';
  const irradianceStr = device?.mwPerCm2At15cm
    ? `${device.mwPerCm2At15cm} mW/cm² @ ${device?.recommendedDistanceCm || 15} cm`
    : (device?.lux ? `${device.lux.toLocaleString()} photopic lux`
      : (device?.melanopicEdiLux ? `${device.melanopicEdiLux.toLocaleString()} lx melanopic EDI` : '—'));
  const distanceStr = sess.distanceCm ? `${sess.distanceCm} cm` : '—';
  // Prefer the precise bodyAreas[] list when present (sessions from
  // 2026-05-08+); fall back to the legacy broad-zone string for older
  // sessions that pre-date the per-region picker.
  let areaLabel;
  if (Array.isArray(sess.bodyAreas) && sess.bodyAreas.length > 0) {
    const labelByKey = Object.fromEntries((BODY_REGIONS || []).map(r => [r.key, r.label]));
    const fracByKey = Object.fromEntries((BODY_REGIONS || []).map(r => [r.key, r.fraction]));
    const totalFrac = sess.bodyAreas.reduce((s, k) => s + (fracByKey[k] || 0), 0);
    const labels = sess.bodyAreas.map(k => labelByKey[k] || k).join(', ');
    areaLabel = `${labels} (~${Math.round(totalFrac * 100)}% of skin)`;
  } else {
    areaLabel = (_DEVICE_AREA_LABELS as Record<string, unknown>)[sess.bodyArea as string] || sess.bodyArea || '—';
  }
  const emitsUV = sess.safety?.hasUV ?? deviceEmitsUV(device, sess.mode);
  const isAmbientEyeDevice = ['sad', 'dawn-sim', 'full-spectrum'].includes((device?.type as string)) && !emitsUV;
  const eyesLabel = emitsUV
    ? (sess.eyesProtected ? 'UV-rated eye protection logged' : '⚠ UV emitted without rated eye protection')
    : isAmbientEyeDevice
      ? (sess.eyesProtected ? 'Eyes shielded' : 'Eyes open to ambient light')
      : (sess.eyesProtected ? 'Eye shielding logged' : 'No eye shielding logged; no eye benefit credited');
  // Mode label resolution — surface the human-readable label whenever
  // the device declares modes. Legacy sessions (no `mode` field) and
  // devices without a `modes` array both fall through to null.
  let modeLabel: unknown = null;
  let canEditMode = false;
  if (device && Array.isArray(device.modes) && device.modes.length > 0) {
    const resolved = device.modes.find(m => m.id === sess.mode)
      || device.modes.find(m => m.default)
      || device.modes[0];
    modeLabel = resolved ? (resolved.label || resolved.id) : null;
    canEditMode = device.modes.filter(m => validateModeCoupling(device, m.id).ok).length > 1;
  }

  // Body-fraction for the per-session vit-D cap (Audit P1 #8). Computed
  // once outside the channel loop — bodyAreas is the schema, BODY_REGIONS
  // carries the per-region area weights. Falls back to null (legacy
  // daily-cap behavior) when bodyAreas is unset.
  let _sessBodyFrac: number | null = null;
  if (Array.isArray(sess.bodyAreas) && sess.bodyAreas.length > 0) {
    const _fracByKey = Object.fromEntries((BODY_REGIONS || []).map(r => [r.key, r.fraction]));
    _sessBodyFrac = sess.bodyAreas.reduce((s, k) => s + (_fracByKey[k] || 0), 0) || null;
  }
  const channelRows = sess.doses ? channelOrder
    .filter(k => sess.doses![k] != null)
    .map(k => {
      const meta = channelDisplay[k] || {};
      const v = sess.doses![k] || 0;
      const sessionFitz = sess.fitzpatrick || state.importedData?.sunDefaults?.fitzpatrick || 'III';
      const unitText = formatChannelUnit(k, v, sess.durationMin || 0, sessionFitz, null, null, false, _sessBodyFrac);
      return detailChannel(k, meta, v, unitText, 'device');
    }) : [];
  const ai = typeof lightDevicesDeps.getDeviceSessionAIDetailView === 'function'
    ? (lightDevicesDeps.getDeviceSessionAIDetailView as (session: DeviceSessionRecord) => Readonly<SessionAIView>|null)(sess)
    : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const closeDialog = () => removeModalOverlay(overlay);
  overlay.innerHTML = renderHTML({ kind: 'detail', ai: ai || null, view: {
    kind: 'device', id: sess.id, title: `Device session — ${stamp.date}`,
    summary: [detailField('When', stamp.time || '—', 'Local session start time'),
      detailField('Duration', dur, 'Total session duration. Edit via the action row below if the timer ran past the actual session.'),
      detailField('Source', devName, 'Recorded source')],
    setup: [detailField('Device', devName + (typeLabel !== '—' ? ` · ${typeLabel}` : '')),
      ...(modeLabel ? [detailField('Mode', modeLabel)] : []), detailField('Distance', distanceStr),
      detailField('Body area', areaLabel), detailField('Eyes', eyesLabel)],
    notices: deviceDetailNotices(sess), calculation: null, channels: channelRows,
    channelsEmpty: 'No modeled light signals are available for this session.',
    signalsDescription: 'Estimated stimulation from the recorded device setup. These are not universal dose targets.',
    lightMetric: deviceDetailLightMetric(sess), inputTitle: 'Device and model inputs',
    inputDescription: liveDevice ? 'Technical source values used to calculate the session.' : 'Saved device details retained with this historical session.',
    inputs: device ? [detailField('Peaks', peakStr, 'Peak emission wavelengths declared by the device'),
      detailField('Reference output', irradianceStr, 'Stored output at the device reference distance'),
      detailField('Output basis', _deviceBasisLabel(device.irradianceBasis)), detailField('Recorded distance', distanceStr),
      ...(modeLabel ? [detailField('Mode', modeLabel)] : [])] : [],
    inputsEmpty: 'The device specification is unavailable.', location: null,
    sourceUrl: device ? _safeHttpUrl(device.specSourceUrl) || '' : '', notes: sess.notes || '',
    canEditDuration: true, canEditMode,
  } });
  _wireModal(overlay, closeDialog);
  overlay.addEventListener('click', (event) => {
    const target = /** @type {Element|null} */ (event.target instanceof Element ? event.target : null);
    if (!target) return;
    if (target.closest('[data-device-session-detail-close]')) {
      closeDialog();
      return;
    }
    const channelRow = target.closest('.sun-detail-channel-row-clickable[data-channel]');
    if (channelRow && overlay.contains(channelRow)) {
      const channel = channelRow.getAttribute('data-channel') || '';
      closeDialog();
      openLightDeviceChannel(channel);
      return;
    }
    if (target.closest('#device-detail-edit-duration')) {
      closeDialog();
      editDeviceSessionDuration(sess.id);
      return;
    }
    if (target.closest('#device-detail-edit-mode')) {
      closeDialog();
      editDeviceSessionMode(sess.id);
      return;
    }
    if (target.closest('#device-detail-delete')) {
      closeDialog();
      deleteDeviceSessionWithConfirm(sess.id);
    }
  });
  overlay.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = /** @type {Element|null} */ (event.target instanceof Element ? event.target : null);
    const channelRow = target?.closest?.('.sun-detail-channel-row-clickable[data-channel]');
    if (!channelRow || !overlay.contains(channelRow) || channelRow.matches('button')) return;
    event.preventDefault();
    const channel = channelRow.getAttribute('data-channel') || '';
    closeDialog();
    openLightDeviceChannel(channel);
  });
  (bindDetachedModalSyncRefresh as (options: Omit<NonNullable<Parameters<typeof bindDetachedModalSyncRefresh>[0]>, 'id'> & { id?: string | undefined }) => ReturnType<typeof bindDetachedModalSyncRefresh>)({
    overlay,
    id,
    opener: openDeviceSessionDetail,
    exists: sessionId => getDeviceSessions().some(s => s.id === sessionId),
  });
}

// ─── Active device-session card + 1Hz ticker ─────────────────────────
//
// When a live PBM session is running, render a stopwatch-style card
// near the top of the /light page. The elapsed-time element carries a
// `data-live-elapsed-for="<sessionId>"` attribute that the ticker
// below patches every second — same pattern sun.js uses, so the two
// surfaces feel consistent.

function _formatElapsedMs(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function getActiveDeviceSessionCardView() {
  const sess = getActiveDeviceSession();
  if (!sess) return null;
  const device = getDevices().find(d => d.id === sess.deviceId) || sess.deviceSnapshot || null;
  const devName = device ? `${device.brand} ${device.model}` : 'Device details unavailable';
  const labelByKey = Object.fromEntries((BODY_REGIONS || []).map(r => [r.key, r.label]));
  const fracByKey = Object.fromEntries((BODY_REGIONS || []).map(r => [r.key, r.fraction]));
  let areaLine;
  if (Array.isArray(sess.bodyAreas) && sess.bodyAreas.length > 0) {
    const totalFrac = sess.bodyAreas.reduce((s, k) => s + (fracByKey[k] || 0), 0);
    const labels = sess.bodyAreas.map(k => labelByKey[k] || k).slice(0, 3).join(', ');
    const more = sess.bodyAreas.length > 3 ? ` +${sess.bodyAreas.length - 3} more` : '';
    areaLine = `${labels}${more} · ~${Math.round(totalFrac * 100)}% skin`;
  } else {
    areaLine = (_DEVICE_AREA_LABELS as Record<string, unknown>)[sess.bodyArea as string] || sess.bodyArea || '';
  }
  const distLine = sess.distanceCm ? `${sess.distanceCm} cm` : '';
  const emitsUV = deviceEmitsUV(device, sess.mode);
  const isAmbientEyeDevice = ['sad', 'dawn-sim', 'full-spectrum'].includes((device?.type as string)) && !emitsUV;
  const eyesLine = emitsUV
    ? (sess.eyesProtected ? 'UV goggles confirmed · follow the device timer' : 'UV eye protection missing')
    : isAmbientEyeDevice
      ? (sess.eyesProtected ? 'eyes shielded' : 'eyes open to ambient light')
      : (sess.eyesProtected ? 'eye shielding logged' : 'eyes outside the beam');
  const elapsedText = _formatElapsedMs(Date.now() - sess.startedAt);
  const view:import('./light-active-session-presentation.js').ActiveSessionView={
    kind: 'device', id: sess.id, date: `Active · ${devName}`, elapsed: elapsedText, ariaLabel: 'Active device session',
    body: `${distLine}${distLine && areaLine ? ' · ' : ''}${areaLine}${areaLine ? ' · ' : ''}${eyesLine}`,
    eyes: '', directEye: false, suffix: '', paused: false, rotated: false, forgotHours: null, readouts: [], chips: null,
  };
  const attribute=(value:unknown)=>value==null?undefined:String(value);
  const deviceIds={root:attribute(view.id),elapsed:attribute(view.id),stop:attribute(view.id)};
  return {kind:'active' as const,view:{...view,deviceIds}};
}
export function renderActiveDeviceSessionCard(){const props=getActiveDeviceSessionCardView();return props?renderHTML(props):'';}

let _devActiveTicker: ReturnType<typeof setInterval> | null = null;
function _tickActiveDeviceSession() {
  const sess = getActiveDeviceSession();
  if (!sess) {
    if (_devActiveTicker) { clearInterval(_devActiveTicker); _devActiveTicker = null; }
    return;
  }
  if (typeof document === 'undefined') return;
  const elapsedText = _formatElapsedMs(Date.now() - sess.startedAt);
  document.querySelectorAll(`[data-live-elapsed-for="${CSS.escape(sess.id)}"]`).forEach(el => {
    if (el.textContent !== elapsedText) el.textContent = elapsedText;
  });
}

export function ensureActiveDeviceTicker() {
  if (_devActiveTicker) return;
  if (!getActiveDeviceSession()) return;
  _tickActiveDeviceSession();
  _devActiveTicker = setInterval(_tickActiveDeviceSession, 1000);
}

// ─── UI: device list rendered into the Light & Sun page ───────────────

export async function renderDevicesSection() {
  const devices = getDevices();
  const allSessions = getDeviceSessions();

  // Load the recommendations catalog + preset type metadata up-front
  // so each card can render with the human-friendly type label, the
  // type icon, and the "Source on {Vendor}" affiliate link inline.
  // Both fall back gracefully on missing data.
  let catalog: unknown = null;
  try {
    catalog = await loadLightDevicesCatalog();
  } catch { /* offline / 404 — page still renders without affiliate row */ }
  let typesMeta: ChannelReader = {};
  try {
    const presetData = await loadLightDevicePresets();
    typesMeta = (presetData.types || {}) as ChannelReader;
  } catch { /* presets file unreachable; fallback uses raw type strings */ }

  return renderDevicePresentation({ kind: 'library', cards: projectDeviceLibrary({
    devices, sessions: allSessions, types: typesMeta, channels: CHANNEL_DISPLAY,
    affiliateFor: slug => getLightDeviceAffiliateViewRuntime(catalog, slug), now: Date.now(),
  }) });
}

// ─── Quick-log entry point ────────────────────────────────────────────
// Single entry used by the Light page CTA row, dashboard strip, and
// drill-down panel suggestions. Behaviour by device count:
//   0 devices → opens the Add-device dialog
//   1 device  → opens that device's session dialog directly
//   2+        → opens a small picker, then the chosen device's dialog
export function quickLogDeviceSession() {
  const devices = getDevices();
  if (devices.length === 0) { openAddDeviceDialog(); return; }
  if (devices.length === 1) { openDeviceSessionDialog(devices[0]!.id); return; }
  _openDevicePicker(devices);
}

function _openDevicePicker(devices: LightDeviceRecord[]) {
  // Most-recently-added first so the user's primary panel is at the top.
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const closeDialog = () => removeModalOverlay(overlay);
  overlay.innerHTML = renderDevicePresentation({ kind: 'picker', rows: projectDevicePicker(devices) });
  _wireModal(overlay, closeDialog);
  overlay.querySelectorAll('[data-device-picker-close]').forEach(btn => {
    btn.addEventListener('click', closeDialog);
  });
  for (const btn of overlay.querySelectorAll('.light-device-picker-row')) {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-device-id');
      closeDialog();
      openDeviceSessionDialog(id);
    });
  }
}

export async function deleteDeviceSessionWithConfirm(id: string) {
  if (!await showConfirmDialog("Delete this device session? This can't be undone.")) return;
  await deleteDeviceSession(id);
  refreshLightDevicesView();
}

// ─── UI wrappers ───────────────────────────────────────────────────────

export async function deleteLightDeviceAndRefresh(id: string) {
  const device = getDevices().find(candidate => candidate.id === id);
  if (!device) return;
  const active = getActiveDeviceSession();
  if (active?.deviceId === id) {
    showNotification('Stop and save the active session before removing this device.', 'error');
    return;
  }
  const sessionCount = getDeviceSessions().filter(session => session.deviceId === id).length;
  const historyNote = sessionCount
    ? ` ${sessionCount} saved session${sessionCount === 1 ? '' : 's'} will keep a copy of these device details.`
    : '';
  if (!await showConfirmDialog(`Remove ${device.brand} ${device.model}?${historyNote}`)) return;
  const deleted = await deleteDevice(id);
  if (!deleted) {
    showNotification('The device could not be removed.', 'error');
    return;
  }
  showNotification(sessionCount ? 'Device removed. Saved session history was retained.' : 'Device removed.');
  refreshLightDevicesView();
}

export async function stopDeviceSessionAndNotify(id: string) {
  const sess = await stopDeviceSession(id);
  if (sess) {
    const device = getDevices().find(d => d.id === sess.deviceId);
    const dur = Math.round(sess.durationMin || 0);
    showNotification(`Saved · ${dur} min ${device ? device.brand + ' ' + device.model : 'device'} session.`);
  }
  refreshLightDevicesView();
}

configureLightDevicesActions({
  stopDeviceSessionAndNotify,
  openAddDeviceDialog,
  deleteLightDevice: deleteLightDeviceAndRefresh,
  openDeviceSessionDialog,
});
