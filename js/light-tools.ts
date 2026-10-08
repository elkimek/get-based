// light-tools.js — In-browser measurement tools for the Light lens.
// All tools run fully on-device. Camera frames are processed in-browser
// and never leave the user's device. Camera tools cover lux, flicker, CCT,
// spectrum, glass transmission, and sleep darkness; the remaining tools log
// sunrise/sunset sessions and run a room-by-room eye-level walkthrough.
// Measurements persist in importedData.lightMeasurements[] with tool, timestamp, value, confidence, and location.

import { state } from './state.js';
import { renderHTML as renderLightToolHTML } from './components/LightToolPresentation.svelte.html.js';
import { projectLightTools, projectGoldenHourLog, projectAuditPauseRows } from './light-tools-presentation.js';
import { queryRequired, showNotification } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import { saveImportedData } from './data.js';
import { deleteImportedArrayItem } from './data-merge.js';
import { getAimingGuideView, getRequired2DContext, lockCameraForMeasurement } from './light-tool-camera.js';
import { createUniqueId } from './unique-id.js';
import { classifyDayWindow, normalizeGoldenHourMinutes } from './light-tools-solar-time.js';
export { normalizeGoldenHourMinutes } from './light-tools-solar-time.js';
import type { LightRoom } from './light-env-model.js';
import type { AILightMeasurement } from './light-tools-ai-analysis.js';
import type { SunSetupCoords } from './sun-defaults-model.js';
import type { SunSessionRecord } from './sun-sessions-store.js';

export interface StoredLightMeasurement {
  id?: unknown; tool?: unknown; value?: unknown; capturedAt?: unknown; takenAt?: unknown;
  roomId?: unknown; confidence?: unknown; label?: unknown; notes?: unknown; extra?: unknown;
}
export interface SavedLightMeasurement extends StoredLightMeasurement { id: string; tool: string; capturedAt: number }
export type LightToolsCoords = Omit<SunSetupCoords, 'altitudeM'> & { altitudeM?: unknown };
export interface LightToolsDeps {
  maybeAnalyzeMeasurementAfterSave: (entry: AILightMeasurement) => unknown;
  suggestRoomSourceFromSpectrum: (roomId: unknown, value: unknown, metadata?: {}) => unknown;
  refreshLightEnvironmentAssessment: () => unknown;
  navigate: (view: string, options?: { scrollAnchor: string }) => unknown;
  getSunCoords: () => LightToolsCoords | null | undefined;
  solarZenithAngle: Parameters<typeof classifyDayWindow>[2];
  logCompletedSession: ((payload: Omit<Partial<SunSessionRecord>, 'location'> & { location?: NonNullable<SunSessionRecord['location']> & { source?: string } }) => Promise<string | null | undefined>) | null;
  getSessions: () => unknown;
  hydrateSession: (id: string, coords: SunSetupCoords) => unknown;
  getRooms: () => unknown;
  addRoom: (name: string) => Promise<string | null>;
}

type RawLightToolsSessionLogger = (payload: Omit<Parameters<NonNullable<LightToolsDeps['logCompletedSession']>>[0], 'location'> & { location: LightToolsCoords }) => ReturnType<NonNullable<LightToolsDeps['logCompletedSession']>>;
type LightToolCameraModals = typeof import('./light-tool-camera-modals.js');
let lightToolCameraModalsPromise: Promise<LightToolCameraModals> | null = null;
let lightToolCameraModals: LightToolCameraModals | null = null;
let useLightToolCameraModalsRetryUrl = false;

const LIGHT_TOOLS_ACTION_ATTR = 'data-light-tools-action';
const LIGHT_TOOL_ID_ATTR = 'data-light-tool-id';
const LIGHT_TOOLS_ACTION_DELEGATE_KEY = Symbol.for('getbased.lightToolsActionDelegatesInstalled');
const lightToolsActionDelegateRoots = new WeakSet<object>();

const lightToolsDeps: LightToolsDeps = {
  maybeAnalyzeMeasurementAfterSave: () => {},
  suggestRoomSourceFromSpectrum: async () => {},
  refreshLightEnvironmentAssessment: () => {},
  navigate: () => {},
  getSunCoords: () => null,
  solarZenithAngle: null,
  logCompletedSession: null,
  getSessions: () => [],
  hydrateSession: async () => {},
  getRooms: () => [],
  addRoom: async () => null,
};

export function configureLightTools(deps: Partial<LightToolsDeps> = {}) {
  Object.assign(lightToolsDeps, deps);
}

function maybeAnalyzeMeasurementAfterSave(entry: SavedLightMeasurement) {
  try { (lightToolsDeps.maybeAnalyzeMeasurementAfterSave as (entry: SavedLightMeasurement) => unknown)(entry); } catch (_) {}
}

function refreshLightEnvironmentAssessment() {
  try { lightToolsDeps.refreshLightEnvironmentAssessment(); } catch (_) {}
}

function navigateLight(options?: { scrollAnchor: string }) {
  try { lightToolsDeps.navigate('light', options); } catch (_) {}
}

function getSunCoords() {
  try { return lightToolsDeps.getSunCoords() || null; } catch (_) { return null; }
}

function getSunSessions() {
  try { const sessions = lightToolsDeps.getSessions(); return Array.isArray(sessions) ? sessions as Array<Pick<SunSessionRecord, 'id'>> : []; } catch (_) { return []; }
}

function getLightRooms() {
  try { const rooms = lightToolsDeps.getRooms(); return Array.isArray(rooms) ? rooms as Array<LightRoom | null | undefined> : []; } catch (_) { return []; }
}

function closestLightToolsAction(target: (EventTarget & { closest?: (selector: string) => Element | null }) | null) {
  if (!target || !target.closest) return null;
  return target.closest(`[${LIGHT_TOOLS_ACTION_ATTR}]`);
}

function openLightToolById(toolId: string) {
  const openers: Record<string, (() => unknown) | undefined> = {
    spectrum: openSpectrumClassifier,
    lux: openLuxMeter,
    cct: openCCTMeter,
    flicker: openFlickerDetector,
    darkness: openDarknessMeter,
    glass: openGlassTransmission,
    audit: openEyeLevelAudit,
    golden: openSunriseLogger,
  };
  const opener = openers[toolId];
  if (opener) opener();
}

function handleLightToolsActionClick(event: Event) {
  const actionEl = closestLightToolsAction(event.target as EventTarget & { closest?: (selector: string) => Element | null });
  if (!actionEl || !(event.currentTarget as Node | null)?.contains?.(actionEl)) return;
  const action = actionEl.getAttribute(LIGHT_TOOLS_ACTION_ATTR);
  if (action === 'close-audit') {
    closeEyeLevelAudit();
    event.stopPropagation();
    return;
  }
  if (action === 'open-tool') {
    const toolId = actionEl.getAttribute(LIGHT_TOOL_ID_ATTR) || '';
    openLightToolById(toolId);
    event.stopPropagation();
  }
}

export function installLightToolsActionDelegates(root: (Document | Element) & { [LIGHT_TOOLS_ACTION_DELEGATE_KEY]?: unknown } | null = typeof document !== 'undefined' ? document : null) {
  if (!root || lightToolsActionDelegateRoots.has(root) || root[LIGHT_TOOLS_ACTION_DELEGATE_KEY]) return;
  lightToolsActionDelegateRoots.add(root);
  Object.defineProperty(root, LIGHT_TOOLS_ACTION_DELEGATE_KEY, { value: true, configurable: true });
  root.addEventListener('click', handleLightToolsActionClick);
}

if (typeof document !== 'undefined') installLightToolsActionDelegates();

export {
  aimingGuideHTML,
  lockCameraForMeasurement,
  cameraLockStatusLine,
  computeRowBanding,
  clearLuxCalibration,
  dismissAimingGuide,
  isLuxCalibrationConfirmed,
  loadLuxCalibration,
  saveLuxCalibration,
} from './light-tool-camera.js';


// ─── Storage ───────────────────────────────────────────────────────────
//
// Storage model: at most ONE measurement per (roomId, tool) combination.
// New readings replace the prior one for the same room+tool via
// _supersedePriorMeasurement (called by saveMeasurement), with the old
// entry's id written to `_deleted` so paired devices apply the same
// replacement on pull. Audit snapshots deep-copy the live array at save
// time, so historical compares survive in audit storage — the live
// array is only ever a sparse "current state" view.
//
// Why not keep history here too? Every consumer that wants history
// already reads it from the audit snapshots (they're the explicit
// "save point"). The AI context only needs current state. UI portable-
// readings list only needs current latest. Keeping per-(room,tool) rows
// from months ago bloats localStorage, the sync payload, and AI context
// tokens with no downstream consumer.

// One-time-per-session migration: collapse any pre-redesign history into
// the latest entry per (roomId, tool). Runs lazily on first read.
const _collapsedThisSession = new WeakSet<object>();

export function getMeasurements(): StoredLightMeasurement[] {
  if (!state.importedData) return [];
  if (!Array.isArray(state.importedData.lightMeasurements)) state.importedData.lightMeasurements = [];
  if (!_collapsedThisSession.has(state.importedData.lightMeasurements)) {
    _collapsedThisSession.add(state.importedData.lightMeasurements);
    const dropped = _collapseToLatestPerRoomTool(state.importedData.lightMeasurements);
    if (dropped > 0) {
      void saveImportedData();
    }
  }
  return state.importedData.lightMeasurements as StoredLightMeasurement[];
}

// Latest-per-(roomId, tool) wins. On pre-redesign data, this is the
// migration step that runs once and tombstones every superseded entry
// so the cleanup propagates across paired devices. New writes go
// through _supersedePriorMeasurement which handles replacement +
// tombstoning at write time, so this only needs to run once.
function _collapseToLatestPerRoomTool(list: Array<StoredLightMeasurement | null | undefined>) {
  if (!Array.isArray(list) || list.length === 0) return 0;
  // Group by (roomId, tool), pick the most-recent entry per group.
  // Audit-tool rows are exempt — each walkthrough is its own record
  // (per-pause labels + lux readings in `extra.rooms`), so collapsing
  // would destroy the per-walkthrough history. Audit rows pass through
  // untouched.
  const latest = new Map<string, StoredLightMeasurement>();
  const auditRows: StoredLightMeasurement[] = [];
  for (const m of list) {
    if (!m || !m.tool) continue;
    if (m.tool === 'audit') { auditRows.push(m); continue; }
    const key = `${m.roomId || ''}::${m.tool}`;
    const ts = m.capturedAt || m.takenAt || 0;
    const cur = latest.get(key);
    if (!cur || (ts as number) > ((cur.capturedAt || cur.takenAt || 0) as number)) latest.set(key, m);
  }
  if (latest.size + auditRows.length === list.length) return 0; // already collapsed
  const keep = new Set(auditRows);
  for (const m of latest.values()) keep.add(m);
  let dropped = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (keep.has(m as StoredLightMeasurement)) continue;
    deleteImportedArrayItem(state.importedData, 'lightMeasurements', i);
    dropped++;
  }
  return dropped;
}

// Find and remove any prior entry for the same (roomId, tool), recording
// a tombstone so paired devices apply the same replacement on pull.
// Returns the count of superseded entries (≤1 in normal use, >1 only
// when migrating from pre-redesign data with multiple historical rows).
function _supersedePriorMeasurement(list: Array<StoredLightMeasurement | null | undefined>, roomId: unknown, tool: unknown) {
  if (!Array.isArray(list)) return 0;
  let removed = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (!m || m.tool !== tool) continue;
    const sameRoom = (m.roomId || null) === (roomId || null);
    if (!sameRoom) continue;
    deleteImportedArrayItem(state.importedData, 'lightMeasurements', i);
    removed++;
  }
  return removed;
}

export async function saveMeasurement(tool: string, value: unknown, opts: Record<string, unknown> = {}) {
  const id = createUniqueId('lm_');
  const entry: SavedLightMeasurement = {
    id,
    tool,
    value,
    capturedAt: Date.now(),
    confidence: opts.confidence ?? 0.7,
    label: opts.label || null,
    notes: opts.notes || '',
    extra: opts.extra || null,
    roomId: opts.roomId || null,
  };
  // Replace the prior (roomId, tool) entry — sparse latest-per-key model.
  // Old entry's id tombstones into _deleted so paired devices drop it
  // on the next pull. New entry has its own id and pushes normally.
  //
  // Skip supersession for `tool === 'audit'` — the eye-level walkthrough
  // saves one bulk record per walkthrough whose `extra.rooms` carries
  // per-pause labels + lux readings. Superseding by (roomId=null, 'audit')
  // would tombstone the previous walkthrough's per-pause history every
  // time the user ran a new walkthrough. The per-pause `tool='lux'` rows
  // bound to specific rooms DO get superseded correctly under the latest-
  // per-(roomId, tool) rule, which is the right behavior.
  if (tool !== 'audit') {
    _supersedePriorMeasurement(getMeasurements(), entry.roomId, entry.tool);
  }
  getMeasurements().push(entry);
  await saveImportedData();
  maybeAnalyzeMeasurementAfterSave(entry);
  // Spectrum tool result auto-fills the room's primarySource when the
  // user hasn't picked one yet — saves a redundant question, since
  // the classifier knows warm vs cool vs fluorescent. Only fires when
  // a roomId is bound; only updates when source is unset/unknown.
  if (tool === 'spectrum' && opts.roomId) {
    try { await (lightToolsDeps.suggestRoomSourceFromSpectrum as (roomId: unknown, value: unknown, metadata: unknown) => unknown)(opts.roomId, value, entry.extra); } catch (e) {}
  }
  refreshLightEnvironmentAssessment();
  // Re-render the Light & Sun page if the user is on it so per-room
  // detail panels pick up the new reading + recompute severity dots.
  // Skip when any modal is still open — the tool may not have torn down
  // its camera/RAF loop yet, and a navigate would yank DOM out from under
  // it (orphan video element, detached interval handlers). The next user
  // navigation picks up the new measurement on its own.
  // Pass scrollAnchor so the rebuild keeps the room the user was looking
  // at pinned to the viewport — without it, navigate's auto-pick can
  // grab a session card visible above the room and the page jumps up.
  if (state.currentView === 'light') {
    setTimeout(() => {
      if (document.querySelector('.modal-overlay.show')) return;
      const anchor = opts.roomId
        ? `[data-id="${CSS.escape(opts.roomId as string)}"]`
        : null;
      navigateLight(anchor ? { scrollAnchor: anchor } : undefined);
    }, 50);
  }
  return entry;
}

// Filter the global measurement list down to a single room. Used by the
// room detail panel + room severity derivation.
export function getMeasurementsForRoom(roomId: unknown) {
  if (!roomId) return [];
  return getMeasurements().filter(m => m.roomId === roomId);
}

export async function deleteMeasurement(id: unknown) {
  const list = getMeasurements();
  const idx = list.findIndex(m => m.id === id);
  if (idx < 0) return false;
  deleteImportedArrayItem(state.importedData, 'lightMeasurements', idx);
  await saveImportedData();
  return true;
}

// ─── Camera-backed tool modal facade ──────────────────────────────────
export function isLightToolCameraModalsLoaded() { return lightToolCameraModals !== null; }
function loadLightToolCameraModalsRetryModule(): Promise<LightToolCameraModals> {
  return import('./light-tool-camera-modals.js?lazy-retry=1' as './light-tool-camera-modals.js');
}
export function loadLightToolCameraModals(): Promise<LightToolCameraModals> {
  if (lightToolCameraModalsPromise) return lightToolCameraModalsPromise;
  // Failed module-map fetches are cached; retry once with a second fixed URL.
  const load = useLightToolCameraModalsRetryUrl
    ? loadLightToolCameraModalsRetryModule()
    : import('./light-tool-camera-modals.js');
  lightToolCameraModalsPromise = load.then(module => (lightToolCameraModals = module)).catch(err => {
    lightToolCameraModalsPromise = null; lightToolCameraModals = null;
    useLightToolCameraModalsRetryUrl = true; throw err;
  });
  return lightToolCameraModalsPromise;
}
function runLightToolCameraAction(name: keyof LightToolCameraModals, args: unknown[], shouldLoad = true): unknown {
  const run = (module: LightToolCameraModals): unknown => {
    const action = module[name];
    if (typeof action !== 'function') throw new Error(`Light tool camera action ${String(name)} is unavailable`);
    return Reflect.apply(action, module, args);
  };
  if (!lightToolCameraModals && !shouldLoad) return undefined;
  try {
    if (lightToolCameraModals) return run(lightToolCameraModals);
    return loadLightToolCameraModals().then(run).catch(err => {
      console.error(`[light-tools] Could not run ${String(name)}:`, err);
      showNotification('Camera tool could not be loaded. Try again.', 'error');
      return false;
    });
  } catch (err) {
    console.error(`[light-tools] Could not ${shouldLoad ? 'run' : 'clean up'} ${String(name)}:`, err);
    if (shouldLoad) showNotification('Camera tool could not be loaded. Try again.', 'error');
    return shouldLoad ? false : undefined;
  }
}
const openCameraTool = (name: keyof LightToolCameraModals) => async (opts: Record<string, unknown> = {}) => runLightToolCameraAction(name, [opts, { saveMeasurement }]);
const closeCameraToolIfLoaded = (name: keyof LightToolCameraModals) => () => runLightToolCameraAction(name, [], false);
export const openLuxMeter = openCameraTool('openLuxMeter'), openFlickerDetector = openCameraTool('openFlickerDetector'), openDarknessMeter = openCameraTool('openDarknessMeter'), openCCTMeter = openCameraTool('openCCTMeter'), openSpectrumClassifier = openCameraTool('openSpectrumClassifier'), openGlassTransmission = openCameraTool('openGlassTransmission');
// Escape/teardown cleanup must not fetch an implementation that was never used.
export const closeLuxMeter = closeCameraToolIfLoaded('closeLuxMeter'), closeFlickerDetector = closeCameraToolIfLoaded('closeFlickerDetector'), closeDarknessMeter = closeCameraToolIfLoaded('closeDarknessMeter'), closeCCTMeter = closeCameraToolIfLoaded('closeCCTMeter'), closeSpectrumClassifier = closeCameraToolIfLoaded('closeSpectrumClassifier'), closeGlassTransmission = closeCameraToolIfLoaded('closeGlassTransmission');

// ─── Tool 7: Sunrise / Sunset Logger ──────────────────────────────────

export function openSunriseLogger() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay light-tool-overlay';
  const coords = getSunCoords();
  const cls = (classifyDayWindow as (coords: Pick<SunSetupCoords, 'lat' | 'lon'> | null, now: Date, solar: LightToolsDeps['solarZenithAngle']) => ReturnType<typeof classifyDayWindow>)(coords, new Date(), lightToolsDeps.solarZenithAngle);
  overlay.innerHTML = renderLightToolHTML({ kind: 'golden', view: projectGoldenHourLog(cls) });
  const closeSunriseLogger = () => removeModalOverlay(overlay);
  openAppendedModalOverlay(overlay, closeSunriseLogger);
  queryRequired(overlay, '#sunrise-close').addEventListener('click', closeSunriseLogger);
  queryRequired(overlay, '#sunrise-cancel').addEventListener('click', closeSunriseLogger);

  queryRequired(overlay, '#sunrise-save').addEventListener('click', async () => {
    if (!coords) {
      showNotification('Set a Light & Sun location before saving so this session can be computed.', 'error', 7000);
      return;
    }
    const durationInput = (queryRequired(overlay, '#sunrise-duration') as HTMLInputElement);
    const minutes = normalizeGoldenHourMinutes(durationInput.value);
    if (typeof lightToolsDeps.logCompletedSession === 'function') {
      const start = Date.now() - minutes * 60 * 1000;
      const loggedId = await (lightToolsDeps.logCompletedSession as RawLightToolsSessionLogger)({
        startedAt: start,
        endedAt: Date.now(),
        location: { lat: coords.lat, lon: coords.lon, altitudeM: coords.altitudeM || 0, source: coords.source || 'profile' },
        bodyExposure: { preset: 'face_hands', fraction: 0.05, regions: [], glassBetween: false },
        eyeExposure: { mode: 'direct', lensTint: 'clear', durationSec: minutes * 60 },
        notes: cls.label,
      });
      const id = loggedId || getSunSessions().slice(-1)[0]?.id;
      if (id) {
        try { await (lightToolsDeps.hydrateSession as (id: string, coords: LightToolsCoords) => ReturnType<LightToolsDeps['hydrateSession']>)(id, coords); } catch (e) {}
      }
    }
    showNotification(`${cls.label} logged: ${minutes} min`);
    closeSunriseLogger();
    if (state.currentView === 'light') navigateLight();
  });
}

// ─── Tool 8: Eye-Level Audit (10-min walkthrough) ─────────────────────

let _auditState: { running: boolean; stream: MediaStream | null; samples: Array<{ t: number; luma: number }> } = { running: false, stream: null, samples: [] };
let activeEyeLevelAuditCloser: (() => void) | null = null;

export function closeEyeLevelAudit() {
  if (typeof activeEyeLevelAuditCloser === 'function') activeEyeLevelAuditCloser();
}

export async function openEyeLevelAudit() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay light-tool-overlay';
  overlay.innerHTML = renderLightToolHTML({ kind: 'audit', guide: getAimingGuideView('audit') });
  let closed = false;
  const closeAuditOverlay = () => {
    if (closed) return;
    closed = true;
    _auditState.running = false;
    if (_auditState.stream) { try { _auditState.stream.getTracks().forEach(t => t.stop()); } catch (e) {} _auditState.stream = null; }
    if (activeEyeLevelAuditCloser === closeAuditOverlay) activeEyeLevelAuditCloser = null;
    removeModalOverlay(overlay);
  };
  activeEyeLevelAuditCloser = closeAuditOverlay;
  openAppendedModalOverlay(overlay, closeAuditOverlay);

  const statusEl = (queryRequired(overlay, '#audit-status') as HTMLElement);
  const listEl = (queryRequired(overlay, '#audit-room-list') as HTMLElement);
  const toggleBtn = (queryRequired(overlay, '#audit-toggle') as HTMLButtonElement);
  let pauseDetections: Array<{ at: number; luma: number; cameraLevel: number; lux: number | null; levelLabel: string; label: string }> = [];

  function renderAuditList() {
    listEl.innerHTML = renderLightToolHTML({ kind: 'audit-rows', rows: projectAuditPauseRows(pauseDetections) });
    // Wire up the inputs every render — DOM was just rebuilt.
    listEl.querySelectorAll('.audit-room-label-input').forEach((input) => {
      const labelInput = (input as HTMLInputElement);
      labelInput.addEventListener('change', () => {
        const idx = parseInt(labelInput.dataset.idx || '', 10);
        if (!isNaN(idx) && pauseDetections[idx]) {
          pauseDetections[idx].label = labelInput.value.trim();
        }
      });
    });
  }

  toggleBtn.addEventListener('click', async () => {
    if (!_auditState.running) {
      // Start
      _auditState.running = true;
      _auditState.samples = [];
      pauseDetections = [];
      toggleBtn.textContent = 'Done';
      statusEl.textContent = 'Recording… walk through each room you spend time in. Pause for ~5 seconds in each.';
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 160, height: 120 } });
        if (closed) {
          try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
          return;
        }
        _auditState.stream = stream;
        const video = document.createElement('video');
        video.srcObject = stream; video.muted = true; video.playsInline = true;
        await video.play();
        if (closed) return;
        // Lock exposure across the whole walkthrough — without this, AE
        // re-exposes when you walk into a brighter / dimmer room, making
        // the per-room luma values incomparable. We want the absolute
        // brightness signal, not the camera-corrected one.
        const lock = await lockCameraForMeasurement(stream);
        statusEl.innerHTML = renderLightToolHTML({ kind: 'audit-status', state: lock.exposure === 'manual' ? 'manual' : 'auto' });
        const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 24;
        const ctx = getRequired2DContext(canvas);
        let lastSampleLuma: number | null = null;
        let pauseStart: number | null = null;
        let waitingForMovement = false;
        const tick = async () => {
          if (!_auditState.running) return;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let sum = 0;
          for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
          const luma = sum / (data.length / 4);
          const t = performance.now();
          _auditState.samples.push({ t, luma });
          // Pause detection: low variance over 5s
          if (lastSampleLuma != null && Math.abs(luma - lastSampleLuma) < 5) {
            if (waitingForMovement) {
              lastSampleLuma = luma;
              if (_auditState.running) setTimeout(tick, 250);
              return;
            }
            if (!pauseStart) pauseStart = t;
            else if (t - pauseStart > 5000) {
              // Mark a pause snapshot
              const cameraLevel = Math.min(100, Math.max(0, luma / 255 * 100));
              const lux = null;
              const levelLabel = cameraLevel < 20 ? 'Dimmer' : cameraLevel < 55 ? 'Medium' : 'Brighter';
              pauseDetections.push({ at: t, luma, cameraLevel, lux, levelLabel, label: '' });
              renderAuditList();
              pauseStart = null;
              waitingForMovement = true;
            }
          } else {
            pauseStart = null;
            waitingForMovement = false;
          }
          lastSampleLuma = luma;
          if (_auditState.running) setTimeout(tick, 250);
        };
        tick();
      } catch (e) {
        statusEl.innerHTML = renderLightToolHTML({ kind: 'audit-status', state: e instanceof Error && e.message.includes('2D canvas context') ? 'no-context' : 'denied' });
        toggleBtn.textContent = 'Retry audit';
        _auditState.running = false; if (_auditState.stream) { try { _auditState.stream.getTracks().forEach(t => t.stop()); } catch (stopError) {} _auditState.stream = null; }
      }
    } else {
      // Stop
      _auditState.running = false;
      if (_auditState.stream) { try { _auditState.stream.getTracks().forEach(t => t.stop()); } catch (e) {} _auditState.stream = null; }
      // Save detections as one bulk audit measurement (preserves the
      // walkthrough as a single record with labels) AND emit per-pause
      // relative brightness measurements bound to rooms so the room cards
      // actually pick them up. Earlier the audit-only record was
      // invisible to the per-room rendering path: the measurements
      // got recorded but never reached the room UI.
      if (pauseDetections.length > 0) {
        await saveMeasurement('audit', pauseDetections.length, {
          confidence: 0.5,
          extra: { rooms: pauseDetections.map((p, i) => ({
            index: i + 1,
            lux: p.lux,
            cameraLevel: p.cameraLevel,
            levelLabel: p.levelLabel,
            label: (p.label || '').trim() || `Room ${i + 1}`,
          })), method: 'relative-camera-walkthrough' },
        });
        // Try to bind each pause to an existing room by name; create
        // one if no match. Startup wiring injects getRooms/addRoom from
        // light-env.js so this modal does not reach through browser globals.
        let bound = 0;
        const existingRooms = getLightRooms();
        const byLabel = new Map<string, string | null | undefined>();
        for (const r of existingRooms) {
          if (r && typeof r.name === 'string') byLabel.set(r.name.toLowerCase().trim(), r.id);
        }
        for (let i = 0; i < pauseDetections.length; i++) {
          const p = pauseDetections[i]!;
          const label = (p.label || '').trim();
          if (!label) continue; // unlabeled pauses stay in the bulk record only
          let roomId = byLabel.get(label.toLowerCase());
          if (!roomId) {
            try {
              roomId = await lightToolsDeps.addRoom(label);
              if (roomId) byLabel.set(label.toLowerCase(), roomId);
            } catch (e) {}
          }
          if (roomId) {
            await saveMeasurement('brightness-proxy', p.cameraLevel, {
              roomId,
              confidence: 0.25,
              extra: { method: 'relative-camera-walkthrough', levelLabel: p.levelLabel, auditPauseIndex: i + 1 },
            });
            bound++;
          }
        }
        const labeled = pauseDetections.filter(p => (p.label || '').trim()).length;
        const labelNote = labeled > 0
          ? ` (${labeled}/${pauseDetections.length} labeled, ${bound} attached to rooms as relative brightness)`
          : '';
        showNotification(`Audit saved · ${pauseDetections.length} room snapshots${labelNote}.`);
      } else {
        showNotification('No room pauses detected — try holding still longer next time.');
      }
      closeAuditOverlay();
    }
  });
}

// ─── Tools page render ────────────────────────────────────────────────

export function renderLightTools() {
  return renderLightToolHTML({ kind: 'launcher', view: projectLightTools(getMeasurements(), state.importedData?.lightEnvironment, Date.now()) });
}
