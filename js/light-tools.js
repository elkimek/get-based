// @ts-check
// light-tools.js — In-browser measurement tools for the Light lens.
// All tools run fully on-device. Camera frames are processed in-browser
// and never leave the user's device. Camera tools cover lux, flicker, CCT,
// spectrum, glass transmission, and sleep darkness; the remaining tools log
// sunrise/sunset sessions and run a room-by-room eye-level walkthrough.
// Measurements persist in importedData.lightMeasurements[] with tool, timestamp, value, confidence, and location.

import { state } from './state.js';
import { escapeHTML, escapeAttr, queryRequired, showNotification } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import { saveImportedData } from './data.js';
import { deleteImportedArrayItem } from './data-merge.js';
import { aimingGuideHTML, getRequired2DContext, lockCameraForMeasurement } from './light-tool-camera.js';
import { createUniqueId } from './unique-id.js';
import { classifyDayWindow, formatSunClock, normalizeGoldenHourMinutes } from './light-tools-solar-time.js';
export { normalizeGoldenHourMinutes } from './light-tools-solar-time.js';
/** @typedef {typeof import('./light-tool-camera-modals.js')} LightToolCameraModals */
/** @type {Promise<LightToolCameraModals> | null} */ let lightToolCameraModalsPromise = null;
/** @type {LightToolCameraModals | null} */ let lightToolCameraModals = null;
let useLightToolCameraModalsRetryUrl = false;

const LIGHT_TOOLS_ACTION_ATTR = 'data-light-tools-action';
const LIGHT_TOOL_ID_ATTR = 'data-light-tool-id';
const LIGHT_TOOLS_ACTION_DELEGATE_KEY = Symbol.for('getbased.lightToolsActionDelegatesInstalled');
const lightToolsActionDelegateRoots = new WeakSet();

/** @type {{ maybeAnalyzeMeasurementAfterSave: AnyFunction, suggestRoomSourceFromSpectrum: AnyFunction, refreshLightEnvironmentAssessment: AnyFunction, navigate: AnyFunction, getSunCoords: AnyFunction, solarZenithAngle: AnyFunction | null, logCompletedSession: AnyFunction | null, getSessions: AnyFunction, hydrateSession: AnyFunction, getRooms: AnyFunction, addRoom: AnyFunction }} */
const lightToolsDeps = {
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

export function configureLightTools(deps = {}) {
  Object.assign(lightToolsDeps, deps);
}

function maybeAnalyzeMeasurementAfterSave(entry) {
  try { lightToolsDeps.maybeAnalyzeMeasurementAfterSave(entry); } catch (_) {}
}

function refreshLightEnvironmentAssessment() {
  try { lightToolsDeps.refreshLightEnvironmentAssessment(); } catch (_) {}
}

function navigateLight(options) {
  try { lightToolsDeps.navigate('light', options); } catch (_) {}
}

function getSunCoords() {
  try { return lightToolsDeps.getSunCoords() || null; } catch (_) { return null; }
}

function getSunSessions() {
  try { const sessions = lightToolsDeps.getSessions(); return Array.isArray(sessions) ? sessions : []; } catch (_) { return []; }
}

function getLightRooms() {
  try { const rooms = lightToolsDeps.getRooms(); return Array.isArray(rooms) ? rooms : []; } catch (_) { return []; }
}

function closestLightToolsAction(target) {
  if (!target || !target.closest) return null;
  return target.closest(`[${LIGHT_TOOLS_ACTION_ATTR}]`);
}

function openLightToolById(toolId) {
  const openers = {
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

function handleLightToolsActionClick(event) {
  const actionEl = closestLightToolsAction(event.target);
  if (!actionEl || !event.currentTarget?.contains?.(actionEl)) return;
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

export function installLightToolsActionDelegates(root = typeof document !== 'undefined' ? document : null) {
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
const _collapsedThisSession = new WeakSet();

export function getMeasurements() {
  if (!state.importedData) return [];
  if (!Array.isArray(state.importedData.lightMeasurements)) state.importedData.lightMeasurements = [];
  if (!_collapsedThisSession.has(state.importedData.lightMeasurements)) {
    _collapsedThisSession.add(state.importedData.lightMeasurements);
    const dropped = _collapseToLatestPerRoomTool(state.importedData.lightMeasurements);
    if (dropped > 0) {
      void saveImportedData();
    }
  }
  return state.importedData.lightMeasurements;
}

// Latest-per-(roomId, tool) wins. On pre-redesign data, this is the
// migration step that runs once and tombstones every superseded entry
// so the cleanup propagates across paired devices. New writes go
// through _supersedePriorMeasurement which handles replacement +
// tombstoning at write time, so this only needs to run once.
function _collapseToLatestPerRoomTool(list) {
  if (!Array.isArray(list) || list.length === 0) return 0;
  // Group by (roomId, tool), pick the most-recent entry per group.
  // Audit-tool rows are exempt — each walkthrough is its own record
  // (per-pause labels + lux readings in `extra.rooms`), so collapsing
  // would destroy the per-walkthrough history. Audit rows pass through
  // untouched.
  const latest = new Map();
  const auditRows = [];
  for (const m of list) {
    if (!m || !m.tool) continue;
    if (m.tool === 'audit') { auditRows.push(m); continue; }
    const key = `${m.roomId || ''}::${m.tool}`;
    const ts = m.capturedAt || m.takenAt || 0;
    const cur = latest.get(key);
    if (!cur || ts > (cur.capturedAt || cur.takenAt || 0)) latest.set(key, m);
  }
  if (latest.size + auditRows.length === list.length) return 0; // already collapsed
  const keep = new Set(auditRows);
  for (const m of latest.values()) keep.add(m);
  let dropped = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (keep.has(m)) continue;
    deleteImportedArrayItem(state.importedData, 'lightMeasurements', i);
    dropped++;
  }
  return dropped;
}

// Find and remove any prior entry for the same (roomId, tool), recording
// a tombstone so paired devices apply the same replacement on pull.
// Returns the count of superseded entries (≤1 in normal use, >1 only
// when migrating from pre-redesign data with multiple historical rows).
function _supersedePriorMeasurement(list, roomId, tool) {
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

export async function saveMeasurement(tool, value, opts = {}) {
  const id = createUniqueId('lm_');
  const entry = {
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
    try { await lightToolsDeps.suggestRoomSourceFromSpectrum(opts.roomId, value, entry.extra); } catch (e) {}
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
        ? `[data-id="${CSS.escape(opts.roomId)}"]`
        : null;
      navigateLight(anchor ? { scrollAnchor: anchor } : undefined);
    }, 50);
  }
  return entry;
}

// Filter the global measurement list down to a single room. Used by the
// room detail panel + room severity derivation.
export function getMeasurementsForRoom(roomId) {
  if (!roomId) return [];
  return getMeasurements().filter(m => m.roomId === roomId);
}

export async function deleteMeasurement(id) {
  const list = getMeasurements();
  const idx = list.findIndex(m => m.id === id);
  if (idx < 0) return false;
  deleteImportedArrayItem(state.importedData, 'lightMeasurements', idx);
  await saveImportedData();
  return true;
}

// ─── Camera-backed tool modal facade ──────────────────────────────────
export function isLightToolCameraModalsLoaded() { return lightToolCameraModals !== null; }
/** @returns {Promise<LightToolCameraModals>} */
function loadLightToolCameraModalsRetryModule() {
  // @ts-expect-error TypeScript resolves only the query-free source path.
  return import('./light-tool-camera-modals.js?lazy-retry=1');
}
/** @returns {Promise<LightToolCameraModals>} */
export function loadLightToolCameraModals() {
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
/** @param {keyof LightToolCameraModals} name @param {any[]} args @param {boolean} [shouldLoad] */
function runLightToolCameraAction(name, args, shouldLoad = true) {
  const run = (/** @type {LightToolCameraModals} */ module) => {
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
/** @param {keyof LightToolCameraModals} name */
const openCameraTool = name => async (opts = {}) => runLightToolCameraAction(name, [opts, { saveMeasurement }]);
/** @param {keyof LightToolCameraModals} name */
const closeCameraToolIfLoaded = name => () => runLightToolCameraAction(name, [], false);
export const openLuxMeter = openCameraTool('openLuxMeter'), openFlickerDetector = openCameraTool('openFlickerDetector'), openDarknessMeter = openCameraTool('openDarknessMeter'), openCCTMeter = openCameraTool('openCCTMeter'), openSpectrumClassifier = openCameraTool('openSpectrumClassifier'), openGlassTransmission = openCameraTool('openGlassTransmission');
// Escape/teardown cleanup must not fetch an implementation that was never used.
export const closeLuxMeter = closeCameraToolIfLoaded('closeLuxMeter'), closeFlickerDetector = closeCameraToolIfLoaded('closeFlickerDetector'), closeDarknessMeter = closeCameraToolIfLoaded('closeDarknessMeter'), closeCCTMeter = closeCameraToolIfLoaded('closeCCTMeter'), closeSpectrumClassifier = closeCameraToolIfLoaded('closeSpectrumClassifier'), closeGlassTransmission = closeCameraToolIfLoaded('closeGlassTransmission');

// ─── Tool 7: Sunrise / Sunset Logger ──────────────────────────────────

export function openSunriseLogger() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay light-tool-overlay';
  const coords = getSunCoords();
  const cls = classifyDayWindow(coords, new Date(), lightToolsDeps.solarZenithAngle);
  const subtitleHtml = cls.kind === 'unknown'
    ? `<span style="color:var(--orange);font-size:11px">No location coords — set country in profile for accurate sunrise/sunset windows.</span>`
    : (cls.sunrise && cls.sunset)
      ? `<span style="color:var(--text-muted);font-size:11px">today: sunrise ${formatSunClock(cls.sunrise)} · sunset ${formatSunClock(cls.sunset)}</span>`
      : '';
  // CTA copy adapts to the actual window we're in. Outside golden hour
  // we can still log a session but flag it so the user knows.
  const inGolden = cls.kind === 'sunrise' || cls.kind === 'sunset';
  const headerHint = inGolden
    ? `Quick log for ambient golden-hour outdoor light. The modeled eye channel uses the logged duration; never look directly at the sun.`
    : `It's <strong>${escapeHTML(cls.label.toLowerCase())}</strong> right now. You can still log this as a regular outdoor-light session; the engine will use the actual solar angle.`;
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Golden hour log">
    <div class="modal-header">
      <h3>Golden hour log <span style="font-weight:400;color:var(--text-muted);font-size:13px">— ${escapeHTML(cls.label)}</span></h3>
      <button class="modal-close" id="sunrise-close" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <p class="modal-body-hint">${headerHint}</p>
      ${subtitleHtml ? `<p style="margin:0 0 12px 0">${subtitleHtml}</p>` : ''}
      <label class="ctx-label">Duration outside (minutes)
        <input type="number" id="sunrise-duration" class="ctx-input" min="1" max="120" value="15" />
      </label>
      <div class="modal-actions" style="margin-top:14px">
        <button class="import-btn import-btn-secondary" id="sunrise-cancel">Cancel</button>
        <button class="import-btn import-btn-primary" id="sunrise-save">Log session</button>
      </div>
    </div>
  </div>`;
  const closeSunriseLogger = () => removeModalOverlay(overlay);
  openAppendedModalOverlay(overlay, closeSunriseLogger);
  queryRequired(overlay, '#sunrise-close').addEventListener('click', closeSunriseLogger);
  queryRequired(overlay, '#sunrise-cancel').addEventListener('click', closeSunriseLogger);

  queryRequired(overlay, '#sunrise-save').addEventListener('click', async () => {
    if (!coords) {
      showNotification('Set a Light & Sun location before saving so this session can be computed.', 'error', 7000);
      return;
    }
    const durationInput = /** @type {HTMLInputElement} */ (queryRequired(overlay, '#sunrise-duration'));
    const minutes = normalizeGoldenHourMinutes(durationInput.value);
    if (typeof lightToolsDeps.logCompletedSession === 'function') {
      const start = Date.now() - minutes * 60 * 1000;
      const loggedId = await lightToolsDeps.logCompletedSession({
        startedAt: start,
        endedAt: Date.now(),
        location: { lat: coords.lat, lon: coords.lon, altitudeM: coords.altitudeM || 0, source: coords.source || 'profile' },
        bodyExposure: { preset: 'face_hands', fraction: 0.05, regions: [], glassBetween: false },
        eyeExposure: { mode: 'direct', lensTint: 'clear', durationSec: minutes * 60 },
        notes: cls.label,
      });
      const id = loggedId || getSunSessions().slice(-1)[0]?.id;
      if (id) {
        try { await lightToolsDeps.hydrateSession(id, coords); } catch (e) {}
      }
    }
    showNotification(`${cls.label} logged: ${minutes} min`);
    closeSunriseLogger();
    if (state.currentView === 'light') navigateLight();
  });
}

// ─── Tool 8: Eye-Level Audit (10-min walkthrough) ─────────────────────

/** @type {{ running: boolean, stream: MediaStream | null, samples: Array<{ t: number, luma: number }> }} */
let _auditState = { running: false, stream: null, samples: [] };
/** @type {AnyFunction | null} */
let activeEyeLevelAuditCloser = null;

export function closeEyeLevelAudit() {
  if (typeof activeEyeLevelAuditCloser === 'function') activeEyeLevelAuditCloser();
}

export async function openEyeLevelAudit() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Home audit">
    <div class="modal-header">
      <h3>Home audit <span style="font-weight:400;color:var(--text-muted);font-size:13px">— 10 min walkthrough</span></h3>
      <button type="button" class="modal-close" data-light-tools-action="close-audit" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${aimingGuideHTML('audit')}
      <p class="modal-body-hint">Pause briefly in each room (~5–10 seconds). Press Done when finished — we'll surface a per-room mini-report.</p>
      <div class="audit-status" id="audit-status" aria-live="polite" aria-atomic="true">Press Start when ready.</div>
      <ol class="audit-room-list" id="audit-room-list" style="margin-top:12px;list-style:decimal inside;color:var(--text-secondary)"></ol>
      <div class="modal-actions" style="margin-top:18px">
        <button type="button" class="import-btn import-btn-secondary" data-light-tools-action="close-audit">Cancel</button>
        <button type="button" class="import-btn import-btn-primary" id="audit-toggle">Start audit</button>
      </div>
    </div>
  </div>`;
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

  const statusEl = /** @type {HTMLElement} */ (queryRequired(overlay, '#audit-status'));
  const listEl = /** @type {HTMLElement} */ (queryRequired(overlay, '#audit-room-list'));
  const toggleBtn = /** @type {HTMLButtonElement} */ (queryRequired(overlay, '#audit-toggle'));
  /** @type {Array<{ at: number, luma: number, cameraLevel: number, lux: number | null, levelLabel: string, label: string }>} */ let pauseDetections = [];

  // Common room labels for one-tap selection. The free-text input is
  // always available; this just removes the typing burden mid-walkthrough.
  const COMMON_ROOMS = ['Bedroom', 'Living room', 'Kitchen', 'Bathroom', 'Office', 'Hallway', 'Kids room'];

  // Render each detected pause with a label input + datalist of common
  // names. Default placeholder shows "Room N" so an unlabeled save still
  // works, but the input is always live for the user to type into.
  function renderAuditList() {
    listEl.innerHTML = pauseDetections.map((p, i) => `
      <li style="margin-bottom:8px;list-style:none;display:flex;gap:8px;align-items:center">
        <span style="font-size:12px;color:var(--text-muted);min-width:92px">${p.lux != null ? `~${Math.round(p.lux)} lux` : escapeHTML(p.levelLabel)}</span>
        <input type="text" class="audit-room-label-input" aria-label="Label for room ${i + 1} (${p.lux != null ? `about ${Math.round(p.lux)} lux` : escapeAttr(p.levelLabel)})" data-idx="${i}" placeholder="Room ${i + 1} (tap to label)" value="${escapeAttr(p.label || '')}" list="audit-rooms-${i}" style="flex:1;padding:4px 8px;font-size:12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-card);color:var(--text-primary)">
        <datalist id="audit-rooms-${i}">${COMMON_ROOMS.map(r => `<option value="${escapeAttr(r)}">`).join('')}</datalist>
      </li>
    `).join('');
    // Wire up the inputs every render — DOM was just rebuilt.
    listEl.querySelectorAll('.audit-room-label-input').forEach((input) => {
      const labelInput = /** @type {HTMLInputElement} */ (input);
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
        if (lock.exposure !== 'manual') {
          statusEl.innerHTML = `Recording… <span style="color:var(--orange);font-size:11px">⚠ camera auto-exposure is on — room levels are rough comparisons only.</span>`;
        } else {
          statusEl.innerHTML = `Recording… <span style="color:var(--text-muted);font-size:11px">Exposure is held so rooms can be compared. The walkthrough saves relative brightness—not lux.</span>`;
        }
        const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 24;
        const ctx = getRequired2DContext(canvas);
        let lastSampleLuma = null;
        let pauseStart = null;
        let waitingForMovement = false;
        const tick = async () => {
          if (!_auditState.running) return;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let sum = 0;
          for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
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
        statusEl.innerHTML = e instanceof Error && e.message.includes('2D canvas context') ? 'Camera processing is unavailable in this browser.' : 'Camera access denied — audit unavailable. <br><span style="font-size:11px;color:var(--text-muted)">The walkthrough captures 4 frames per second to detect when you\'ve paused in a new room. Open your browser\'s site settings to allow camera access, or log rooms manually from the Light Environment section.</span>';
        _auditState.running = false; if (_auditState.stream) { try { _auditState.stream.getTracks().forEach(t => t.stop()); } catch (stopError) {} _auditState.stream = null; }
      }
    } else {
      // Stop
      _auditState.running = false;
      if (_auditState.stream) { try { _auditState.stream.getTracks().forEach(t => t.stop()); } catch (e) {} _auditState.stream = null; }
      // Save detections as one bulk audit measurement (preserves the
      // walkthrough as a single record with labels) AND emit per-pause
      // tool='lux' measurements bound to rooms so the room cards
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
        const byLabel = new Map();
        for (const r of existingRooms) {
          if (r && typeof r.name === 'string') byLabel.set(r.name.toLowerCase().trim(), r.id);
        }
        for (let i = 0; i < pauseDetections.length; i++) {
          const p = pauseDetections[i];
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
  const all = getMeasurements();
  const total = all.length;
  const cutoff7d = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent7 = all.filter(m => (m.capturedAt || 0) >= cutoff7d).length;
  const env = state.importedData?.lightEnvironment || {};
  const rooms = Array.isArray(env.rooms) ? env.rooms : [];
  const roomCount = rooms.length;

  const tools = {
    spectrum: {
      icon: '🔬',
      name: 'What is this light?',
      desc: 'Screen the camera RGB pattern as warm, cool, or mixed without calling it a spectrum.',
      short: 'Warm / cool pattern',
    },
    lux: {
      icon: '📏',
      name: 'Lux meter',
      desc: 'Measure photopic lux from a built-in sensor, meter entry, or a device-calibrated camera.',
      short: 'Brightness baseline',
    },
    cct: {
      icon: '🎨',
      name: 'Color temp',
      desc: 'Get an approximate warm/cool camera estimate and screen for visible banding.',
      short: 'Warm vs cool',
    },
    flicker: {
      icon: '⚡',
      name: 'Flicker detector',
      desc: 'Screen for rolling-shutter banding; absence does not prove flicker-free output.',
      short: 'Banding screen',
    },
    darkness: {
      icon: '🌙',
      name: 'Sleep darkness',
      desc: 'Run a qualitative low-light camera check or enter a meter reading at the pillow.',
      short: 'Bedroom night check',
    },
    glass: {
      icon: '🪟',
      name: 'Window check',
      desc: 'Compare two readings with and without glass for a better behind-glass estimate.',
      short: 'Glass transmission',
    },
    audit: {
      icon: '🚶',
      name: 'Home audit',
      desc: 'Walk through rooms for relative brightness with one held camera exposure.',
      short: 'Room sweep',
    },
    golden: {
      icon: '🌅',
      name: 'Golden hour log',
      desc: 'After-the-fact log for sunrise or sunset sessions.',
      short: 'Solar timing',
    },
  };

  const action = (id, opts = {}) => {
    const t = tools[id];
    if (!t) return '';
    const reason = opts.reason || t.short;
    return `<button type="button" class="light-tool-action${opts.primary ? ' light-tool-action-primary' : ''}" data-light-tools-action="open-tool" data-light-tool-id="${escapeAttr(id)}" title="${escapeAttr(t.desc)}">
      <span class="light-tool-action-icon" aria-hidden="true">${t.icon}</span>
      <span class="light-tool-action-copy">
        <span class="light-tool-action-name">${escapeHTML(t.name)}</span>
        <span class="light-tool-action-desc">${escapeHTML(reason)}</span>
      </span>
    </button>`;
  };

  const next = [
    { id: 'lux', reason: 'Set brightness baseline', primary: true },
    { id: 'flicker', reason: 'Screen for visible banding' },
    { id: 'spectrum', reason: 'Check warm / cool pattern' },
  ];

  const statusChips = total > 0
    ? [
      `${total} measurement${total === 1 ? '' : 's'}`,
      recent7 > 0 ? `${recent7} in the last 7 days` : 'No readings this week',
      roomCount > 0 ? `${roomCount} room${roomCount === 1 ? '' : 's'} mapped` : 'No rooms mapped',
    ]
    : [
      'No measurements yet',
      'Camera frames stay local',
      roomCount > 0 ? `${roomCount} room${roomCount === 1 ? '' : 's'} ready` : 'Map rooms to attach readings',
    ];

  const group = (title, time, ids) => `<details class="light-tools-group">
    <summary class="light-tools-group-head">
      <span>${escapeHTML(title)}</span>
      <span class="light-tools-group-time">${escapeHTML(time)}</span>
    </summary>
    <div class="light-tools-grid">
      ${ids.map(id => action(id)).join('')}
    </div>
  </details>`;

  return `<div class="light-tools-section">
    <h3 class="light-section-title">Light tools</h3>
    <p class="light-section-hint">On-device checks for room light, screens, windows, and solar logs.</p>

    <div class="light-tools-status" aria-label="Measurement status">
      ${statusChips.map(s => `<span>${escapeHTML(s)}</span>`).join('')}
    </div>

    <div class="light-tools-recommended">
      <div class="light-tools-recommended-head">
        <span>Recommended next</span>
        <span>Camera stays on device</span>
      </div>
      <div class="light-tools-action-grid">
        ${next.map((rec, i) => action(rec.id, { reason: rec.reason, primary: rec.primary || i === 0 })).join('')}
      </div>
    </div>

    <div class="light-tools-drawer">
      ${group('Specialized checks', '30 s-2 min', ['cct', 'darkness', 'glass'])}
      ${group('Walkthroughs & logs', '2-10 min', ['audit', 'golden'])}
    </div>
  </div>`;
}
