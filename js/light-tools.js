// light-tools.js — In-browser measurement tools for the Light lens.
//
// All tools run fully on-device. Camera frames are processed in-browser
// and never leave the user's device. Eight tools ship:
//
//   Tool 1: Lux Meter             — AmbientLightSensor (Chrome Android) or
//                                    camera fallback with one-shot calibration.
//   Tool 2: Flicker Detector      — getUserMedia at the highest-available
//                                    frame rate, FFT on intensity to find PWM.
//   Tool 3: CCT Meter             — color temperature with solar-coherence check.
//   Tool 4: Spectrum Classifier   — LED / fluorescent / incandescent / daylight.
//   Tool 5: Glass Transmission    — two-step bare/through-glass camera capture.
//   Tool 6: Sleep Darkness Meter  — long-exposure pillow-level reading.
//   Tool 7: Sunrise/Sunset Logger — solar-geometry session entry.
//   Tool 8: Eye-Level Audit       — 4 fps walkthrough with pause-detection
//                                    that auto-snapshots a reading per room.
//
// Measurements persist via importedData.lightMeasurements[]. Each entry
// stores tool, timestamp, value, confidence, optional location label.

import { state } from './state.js';
import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import { saveImportedData } from './data.js';
import { deleteImportedArrayItem } from './data-merge.js';
import {
  aimingGuideHTML,
  lockCameraForMeasurement,
  loadLuxCalibration,
} from './light-tool-camera.js';
import {
  openLuxMeter as openLuxMeterModal,
  openFlickerDetector as openFlickerDetectorModal,
  openDarknessMeter as openDarknessMeterModal,
  openCCTMeter as openCCTMeterModal,
  openSpectrumClassifier as openSpectrumClassifierModal,
  openGlassTransmission as openGlassTransmissionModal,
} from './light-tool-camera-modals.js';

export {
  aimingGuideHTML,
  lockCameraForMeasurement,
  cameraLockStatusLine,
  computeRowBanding,
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
  const id = `lm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
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
  if (typeof window !== 'undefined' && window.maybeAnalyzeMeasurementAfterSave) {
    try { window.maybeAnalyzeMeasurementAfterSave(entry); } catch (_) {}
  }
  // Spectrum tool result auto-fills the room's primarySource when the
  // user hasn't picked one yet — saves a redundant question, since
  // the classifier knows warm vs cool vs fluorescent. Only fires when
  // a roomId is bound; only updates when source is unset/unknown.
  if (tool === 'spectrum' && opts.roomId && typeof window !== 'undefined' && typeof window.suggestRoomSourceFromSpectrum === 'function') {
    try { await window.suggestRoomSourceFromSpectrum(opts.roomId, value); } catch (e) {}
  }
  if (typeof window !== 'undefined' && typeof window.refreshLightEnvironmentAssessment === 'function') {
    try { window.refreshLightEnvironmentAssessment(); } catch (e) {}
  }
  // Re-render the Light & Sun page if the user is on it so per-room
  // detail panels pick up the new reading + recompute severity dots.
  // Skip when any modal is still open — the tool may not have torn down
  // its camera/RAF loop yet, and a navigate would yank DOM out from under
  // it (orphan video element, detached interval handlers). The next user
  // navigation picks up the new measurement on its own.
  // Pass scrollAnchor so the rebuild keeps the room the user was looking
  // at pinned to the viewport — without it, navigate's auto-pick can
  // grab a session card visible above the room and the page jumps up.
  if (typeof window !== 'undefined' && window.navigate && state.currentView === 'light') {
    setTimeout(() => {
      if (document.querySelector('.modal-overlay.show')) return;
      const anchor = opts.roomId
        ? `[data-id="${CSS.escape(opts.roomId)}"]`
        : null;
      window.navigate('light', anchor ? { scrollAnchor: anchor } : undefined);
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

export async function openLuxMeter(opts = {}) {
  return openLuxMeterModal(opts, { saveMeasurement });
}

export async function openFlickerDetector(opts = {}) {
  return openFlickerDetectorModal(opts, { saveMeasurement });
}

export async function openDarknessMeter(opts = {}) {
  return openDarknessMeterModal(opts, { saveMeasurement });
}

export async function openCCTMeter(opts = {}) {
  return openCCTMeterModal(opts, { saveMeasurement });
}

export async function openSpectrumClassifier(opts = {}) {
  return openSpectrumClassifierModal(opts, { saveMeasurement });
}

export async function openGlassTransmission(opts = {}) {
  return openGlassTransmissionModal(opts, { saveMeasurement });
}

// ─── Tool 7: Sunrise / Sunset Logger ──────────────────────────────────

// Compute today's sunrise / sunset (sun at 90.83° zenith — the standard
// definition accounting for atmospheric refraction at the horizon) for
// the user's coords. Walks the day in 5-minute steps from the previous
// midnight; returns null when the sun never rises or never sets at the
// given latitude on the given date (high-latitude polar day/night).
function _computeSunriseSunset(coords, date) {
  if (!coords || !window.solarZenithAngle) return { sunrise: null, sunset: null };
  const baseDate = date ? new Date(date) : new Date();
  const day = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  const STEP_MIN = 5;
  let sunrise = null, sunset = null;
  let prevAbove = null;
  for (let m = 0; m < 24 * 60; m += STEP_MIN) {
    const t = new Date(day.getTime() + m * 60_000);
    const zenith = window.solarZenithAngle(t, coords.lat, coords.lon);
    const above = zenith < 90.83; // sun above horizon (refraction-corrected)
    if (prevAbove != null && above !== prevAbove) {
      if (above && !sunrise) sunrise = t;
      else if (!above && !sunset) sunset = t;
    }
    prevAbove = above;
  }
  return { sunrise, sunset };
}

// Window classification from now-vs-sunrise/sunset. Returns:
//   { kind: 'sunrise'|'sunset'|'midday'|'night'|'pre-sunrise',
//     label: <human-readable>, sunrise: Date|null, sunset: Date|null }
// "Golden hour" definitions: sunrise window = 30 min before to 90 min
// after sunrise; sunset window = 90 min before to 30 min after sunset.
function _classifyDayWindow(coords, now) {
  const t = now || new Date();
  const { sunrise, sunset } = _computeSunriseSunset(coords, t);
  if (!sunrise || !sunset) {
    // Polar day/night or no coords — fall back to hour heuristic.
    const hr = t.getHours();
    let label = 'Outside golden hour';
    if (hr >= 5 && hr < 9) label = 'Sunrise window';
    else if (hr >= 16 && hr < 21) label = 'Sunset window';
    return { kind: 'unknown', label, sunrise: null, sunset: null };
  }
  const ms = t.getTime();
  const srMs = sunrise.getTime(), ssMs = sunset.getTime();
  // Sunrise window: 30 min before sunrise → 90 min after sunrise
  if (ms >= srMs - 30 * 60_000 && ms <= srMs + 90 * 60_000) {
    return { kind: 'sunrise', label: 'Sunrise window', sunrise, sunset };
  }
  // Sunset window: 90 min before sunset → 30 min after sunset
  if (ms >= ssMs - 90 * 60_000 && ms <= ssMs + 30 * 60_000) {
    return { kind: 'sunset', label: 'Sunset window', sunrise, sunset };
  }
  // Midday vs night
  if (ms > srMs && ms < ssMs) return { kind: 'midday', label: 'Midday — past sunrise, before sunset', sunrise, sunset };
  return { kind: 'night', label: 'Night — sun is below horizon', sunrise, sunset };
}

function _fmtClock(d) {
  if (!d) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function normalizeGoldenHourMinutes(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 15;
  return Math.min(120, Math.max(1, parsed));
}

export function openSunriseLogger() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-tool-overlay';
  const coords = (window.getSunCoords && window.getSunCoords()) || null;
  const cls = _classifyDayWindow(coords, new Date());
  const subtitleHtml = cls.kind === 'unknown'
    ? `<span style="color:var(--orange);font-size:11px">No location coords — set country in profile for accurate sunrise/sunset windows.</span>`
    : (cls.sunrise && cls.sunset)
      ? `<span style="color:var(--text-muted);font-size:11px">today: sunrise ${_fmtClock(cls.sunrise)} · sunset ${_fmtClock(cls.sunset)}</span>`
      : '';
  // CTA copy adapts to the actual window we're in. Outside golden hour
  // we can still log a session but flag it so the user knows.
  const inGolden = cls.kind === 'sunrise' || cls.kind === 'sunset';
  const headerHint = inGolden
    ? `Quick log for golden-hour outdoor light. Eye exposure is automatic — circadian channel maxed for the duration.`
    : `It's <strong>${escapeHTML(cls.label.toLowerCase())}</strong> right now — golden-hour benefits don't apply, but you can still log this as a regular outdoor session.`;
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Golden hour log">
    <div class="modal-header">
      <h3>Golden hour log <span style="font-weight:400;color:var(--text-muted);font-size:13px">— ${escapeHTML(cls.label)}</span></h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <p class="modal-body-hint">${headerHint}</p>
      ${subtitleHtml ? `<p style="margin:0 0 12px 0">${subtitleHtml}</p>` : ''}
      <label class="ctx-label">Duration outside (minutes)
        <input type="number" id="sunrise-duration" class="ctx-input" min="1" max="120" value="15" />
      </label>
      <div class="modal-actions" style="margin-top:14px">
        <button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="import-btn import-btn-primary" id="sunrise-save">Log session</button>
      </div>
    </div>
  </div>`;
  if (window._wireBackdropClose) try { window._wireBackdropClose(overlay); } catch (e) {}
  document.body.appendChild(overlay);
  if (window.trapModalFocus) try { window.trapModalFocus(overlay); } catch (e) {}

  overlay.querySelector('#sunrise-save').addEventListener('click', async () => {
    const minutes = normalizeGoldenHourMinutes(overlay.querySelector('#sunrise-duration').value);
    if (window.logCompletedSession) {
      const start = Date.now() - minutes * 60 * 1000;
      await window.logCompletedSession({
        startedAt: start,
        endedAt: Date.now(),
        bodyExposure: { preset: 'face_hands', fraction: 0.05, regions: [], glassBetween: false },
        eyeExposure: { mode: 'direct', lensTint: 'clear', durationSec: minutes * 60 },
        notes: cls.label,
      });
      const id = window.getSessions().slice(-1)[0]?.id;
      if (id && window.hydrateSession) await window.hydrateSession(id);
    }
    showNotification(`${cls.label} logged: ${minutes} min`);
    overlay.remove();
    if (window.navigate && state.currentView === 'light') window.navigate('light');
  });
}

// ─── Tool 8: Eye-Level Audit (10-min walkthrough) ─────────────────────

let _auditState = { running: false, stream: null, samples: [] };

export async function openEyeLevelAudit() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Home audit">
    <div class="modal-header">
      <h3>Home audit <span style="font-weight:400;color:var(--text-muted);font-size:13px">— 10 min walkthrough</span></h3>
      <button class="modal-close" onclick="window._closeAudit()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${aimingGuideHTML('audit')}
      <p class="modal-body-hint">Pause briefly in each room (~5–10 seconds). Press Done when finished — we'll surface a per-room mini-report.</p>
      <div class="audit-status" id="audit-status" aria-live="polite" aria-atomic="true">Press Start when ready.</div>
      <ol class="audit-room-list" id="audit-room-list" style="margin-top:12px;list-style:decimal inside;color:var(--text-secondary)"></ol>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="window._closeAudit()">Cancel</button>
        <button class="import-btn import-btn-primary" id="audit-toggle">Start audit</button>
      </div>
    </div>
  </div>`;
  if (window._wireBackdropClose) try { window._wireBackdropClose(overlay, () => window._closeAudit()); } catch (e) {}
  document.body.appendChild(overlay);
  if (window.trapModalFocus) try { window.trapModalFocus(overlay); } catch (e) {}

  const statusEl = overlay.querySelector('#audit-status');
  const listEl = overlay.querySelector('#audit-room-list');
  const toggleBtn = overlay.querySelector('#audit-toggle');
  let pauseDetections = [];

  // Common room labels for one-tap selection. The free-text input is
  // always available; this just removes the typing burden mid-walkthrough.
  const COMMON_ROOMS = ['Bedroom', 'Living room', 'Kitchen', 'Bathroom', 'Office', 'Hallway', 'Kids room'];

  // Render each detected pause with a label input + datalist of common
  // names. Default placeholder shows "Room N" so an unlabeled save still
  // works, but the input is always live for the user to type into.
  function renderAuditList() {
    listEl.innerHTML = pauseDetections.map((p, i) => `
      <li style="margin-bottom:8px;list-style:none;display:flex;gap:8px;align-items:center">
        <span style="font-size:12px;color:var(--text-muted);min-width:48px">${Math.round(p.lux)} lux</span>
        <input type="text" class="audit-room-label-input" aria-label="Label for room ${i + 1} (${Math.round(p.lux)} lux)" data-idx="${i}" placeholder="Room ${i + 1} (tap to label)" value="${escapeAttr(p.label || '')}" list="audit-rooms-${i}" style="flex:1;padding:4px 8px;font-size:12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-card);color:var(--text-primary)">
        <datalist id="audit-rooms-${i}">${COMMON_ROOMS.map(r => `<option value="${escapeAttr(r)}">`).join('')}</datalist>
      </li>
    `).join('');
    // Wire up the inputs every render — DOM was just rebuilt.
    listEl.querySelectorAll('.audit-room-label-input').forEach((input) => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        if (!isNaN(idx) && pauseDetections[idx]) {
          pauseDetections[idx].label = e.target.value.trim();
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
        _auditState.stream = stream;
        const video = document.createElement('video');
        video.srcObject = stream; video.muted = true; video.playsInline = true;
        await video.play();
        // Lock exposure across the whole walkthrough — without this, AE
        // re-exposes when you walk into a brighter / dimmer room, making
        // the per-room luma values incomparable. We want the absolute
        // brightness signal, not the camera-corrected one.
        const lock = await lockCameraForMeasurement(stream);
        if (lock.exposure !== 'manual') {
          statusEl.innerHTML = `Recording… <span style="color:var(--orange);font-size:11px">⚠ camera auto-exposure on — per-room values will be relative, not absolute lux.</span>`;
        }
        const canvas = document.createElement('canvas');
        canvas.width = 32; canvas.height = 24;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
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
              const lux = Math.max(0, luma * 40 * loadLuxCalibration());
              pauseDetections.push({ at: t, luma, lux, label: '' });
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
        statusEl.innerHTML = 'Camera access denied — audit unavailable. <br><span style="font-size:11px;color:var(--text-muted)">The walkthrough captures 4 frames per second to detect when you\'ve paused in a new room. Open your browser\'s site settings to allow camera access, or log rooms manually from the Light Environment section.</span>';
        _auditState.running = false;
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
            label: (p.label || '').trim() || `Room ${i + 1}`,
          })) },
        });
        // Try to bind each pause to an existing room by name; create
        // one if no match. Both `getRooms` and `addRoom` are exposed
        // on window via light-env.js's bottom-of-file Object.assign.
        let bound = 0;
        const existingRooms = (typeof window.getRooms === 'function')
          ? (window.getRooms() || []) : [];
        const byLabel = new Map();
        for (const r of existingRooms) {
          if (r && typeof r.name === 'string') byLabel.set(r.name.toLowerCase().trim(), r.id);
        }
        for (let i = 0; i < pauseDetections.length; i++) {
          const p = pauseDetections[i];
          const label = (p.label || '').trim();
          if (!label) continue; // unlabeled pauses stay in the bulk record only
          let roomId = byLabel.get(label.toLowerCase());
          if (!roomId && typeof window.addRoom === 'function') {
            try {
              roomId = await window.addRoom(label);
              if (roomId) byLabel.set(label.toLowerCase(), roomId);
            } catch (e) {}
          }
          if (roomId && typeof p.lux === 'number') {
            await saveMeasurement('lux', p.lux, {
              roomId,
              confidence: 0.5,
              extra: { source: 'eye-level-audit', auditPauseIndex: i + 1 },
            });
            bound++;
          }
        }
        const labeled = pauseDetections.filter(p => (p.label || '').trim()).length;
        const labelNote = labeled > 0
          ? ` (${labeled}/${pauseDetections.length} labeled, ${bound} written to rooms)`
          : '';
        showNotification(`Audit saved · ${pauseDetections.length} room snapshots${labelNote}.`);
      } else {
        showNotification('No room pauses detected — try holding still longer next time.');
      }
      window._closeAudit();
    }
  });

  window._closeAudit = () => {
    _auditState.running = false;
    if (_auditState.stream) { try { _auditState.stream.getTracks().forEach(t => t.stop()); } catch (e) {} _auditState.stream = null; }
    overlay.remove();
  };
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
      handler: 'window.openSpectrumClassifier()',
      icon: '🔬',
      name: 'What is this light?',
      desc: 'Classify LED, fluorescent, daylight, or incandescent and estimate melanopic load.',
      short: 'Bulb type + spectrum',
    },
    lux: {
      handler: 'window.openLuxMeter()',
      icon: '📏',
      name: 'Lux meter',
      desc: 'Measure room brightness with daylight comparison and per-device calibration.',
      short: 'Brightness baseline',
    },
    cct: {
      handler: 'window.openCCTMeter()',
      icon: '🎨',
      name: 'Color temp',
      desc: 'Check warm/cool kelvin, solar-time match, and dimming warning signs.',
      short: 'Warm vs cool',
    },
    flicker: {
      handler: 'window.openFlickerDetector()',
      icon: '⚡',
      name: 'Flicker detector',
      desc: 'Find PWM and rolling-shutter banding up to 25 kHz.',
      short: 'PWM risk',
    },
    darkness: {
      handler: 'window.openDarknessMeter()',
      icon: '🌙',
      name: 'Sleep darkness',
      desc: 'Measure mean and peak lux at the pillow.',
      short: 'Bedroom night check',
    },
    glass: {
      handler: 'window.openGlassTransmission()',
      icon: '🪟',
      name: 'Window check',
      desc: 'Compare two readings with and without glass for a better behind-glass estimate.',
      short: 'Glass transmission',
    },
    audit: {
      handler: 'window.openEyeLevelAudit()',
      icon: '🚶',
      name: 'Home audit',
      desc: 'Walk through rooms and capture a per-room snapshot in about 10 minutes.',
      short: 'Room sweep',
    },
    golden: {
      handler: 'window.openSunriseLogger()',
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
    return `<button class="light-tool-action${opts.primary ? ' light-tool-action-primary' : ''}" onclick="${t.handler}" title="${escapeAttr(t.desc)}">
      <span class="light-tool-action-icon" aria-hidden="true">${t.icon}</span>
      <span class="light-tool-action-copy">
        <span class="light-tool-action-name">${escapeHTML(t.name)}</span>
        <span class="light-tool-action-desc">${escapeHTML(reason)}</span>
      </span>
    </button>`;
  };

  const next = [
    { id: 'lux', reason: 'Set brightness baseline', primary: true },
    { id: 'flicker', reason: 'Rule out PWM risk' },
    { id: 'spectrum', reason: 'Identify the light source' },
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

if (typeof window !== 'undefined') {
  Object.assign(window, {
    openLuxMeter,
    openFlickerDetector,
    openDarknessMeter,
    openCCTMeter,
    openSpectrumClassifier,
    openGlassTransmission,
    openSunriseLogger,
    openEyeLevelAudit,
    getMeasurements,
    getMeasurementsForRoom,
    saveMeasurement,
    deleteMeasurement,
    renderLightTools,
  });
}
