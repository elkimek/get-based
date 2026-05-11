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
import { recordTombstone } from './data-merge.js';

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
    _collapseToLatestPerRoomTool(state.importedData.lightMeasurements);
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
    if (m && m.id) recordTombstone(state.importedData, 'lightMeasurements', m.id);
    list.splice(i, 1);
    dropped++;
  }
  return dropped;
}

// Per-tool "where to aim the camera" guide. Spelt out because the
// difference between "what hits you" tools (lux, sleep darkness, eye-
// level audit) and "what the source emits" tools (flicker, CCT,
// spectrum, glass transmission) is the difference between a useful
// reading and a misleading one — and there's no way to recover from a
// fixed user-facing webcam (skin tones bias spectrum classifier toward
// "warm LED" regardless of actual ceiling source; PWM stripes attenuate
// when reflected; "bedroom" measurements done from a desk webcam are
// actually office measurements with a bedroom label).
const _AIMING_GUIDES = {
  lux: {
    mode: 'FROM your position',
    body: 'Hold the camera at <b>eye height</b>, facing the room as you\'d normally sit, work, or read. The reading captures light reaching your eye, not the bulb\'s raw output.',
    webcam: 'A laptop / monitor webcam pointed at you is acceptable for this — it sees roughly the same light field hitting your face.',
  },
  flicker: {
    mode: 'AT the source',
    body: 'Point the camera <b>directly at the bulb / fixture</b> from ~30–50 cm, so the source fills a noticeable chunk of the frame. PWM stripes are subtle when reflected off walls or skin.',
    webcam: '⚠ A user-facing webcam under-reads flicker — modulation amplitude attenuates when bouncing off your face. Use a phone for a real read.',
  },
  cct: {
    mode: 'AT the source',
    body: 'Point the camera <b>directly at the fixture or a white wall lit by it</b> from ~30–50 cm. White paper or a grey card under the source also works.',
    webcam: '⚠ A user-facing webcam reads warm — skin tones in the frame skew the integration. Cool sources can under-read by 1000–2000 K.',
  },
  spectrum: {
    mode: 'AT the source',
    body: 'Point the camera <b>directly at the bulb or LED panel</b> so it dominates the frame. The classifier reads the RGB profile of whatever it sees.',
    webcam: '⚠ A user-facing webcam will almost always classify "warm LED" because skin + clothing fills the frame, regardless of the actual ceiling source. Use a phone.',
  },
  darkness: {
    mode: 'FROM your sleeping position',
    body: 'Place the phone <b>face-up on your pillow or bedside table</b> at night, lens facing the ceiling. Capture the actual light hitting your closed eyelids during sleep, with the room lit as you\'ll sleep (door cracked, hallway light on, alarm clock visible — whatever\'s normal).',
    webcam: '⚠ A monitor webcam in a different room can\'t measure your bedroom darkness. This one needs to be physically on the bed.',
  },
  'glass-transmission': {
    mode: 'TWO-STEP — same direction both times',
    body: 'Step 1: hold the camera <b>against the closed window</b> (looking out at the sky / scene). Step 2: same direction, but with the window open or stepping outside, so only the glass changes between readings.',
    webcam: 'Webcam can\'t do this — it can\'t physically move outside.',
  },
  audit: {
    mode: 'FROM your position, at eye height',
    body: 'Hold the phone <b>at eye height, facing forward</b> while you walk through each room. The pause-detection captures the lighting where you actually look — not the floor or ceiling.',
    webcam: 'Walking with a phone is the whole point — a fixed webcam misses the inter-room comparison this tool exists to provide.',
  },
};

// Returns a small expandable info card for the tool modal. Persists per-
// tool dismissal in localStorage so users who've internalized the
// guidance don't have to dismiss it on every open.
export function aimingGuideHTML(toolKey) {
  const g = _AIMING_GUIDES[toolKey];
  if (!g) return '';
  const dismissed = (typeof localStorage !== 'undefined' && localStorage.getItem(`labcharts-aim-guide-${toolKey}`) === 'dismissed');
  // Hide entirely once dismissed — re-enable via a small "?" affordance
  // up by the modal title (added below per tool).
  if (dismissed) return '';
  return `<div class="tool-aiming-guide" data-tool="${escapeHTML(toolKey)}">
    <div class="tool-aiming-guide-head">
      <span class="tool-aiming-guide-icon">📐</span>
      <span class="tool-aiming-guide-mode">${escapeHTML(g.mode)}</span>
      <button type="button" class="tool-aiming-guide-dismiss" onclick="window._dismissAimingGuide && window._dismissAimingGuide('${escapeHTML(toolKey)}')" aria-label="Dismiss aiming guide">×</button>
    </div>
    <div class="tool-aiming-guide-body">${g.body}</div>
    ${g.webcam ? `<div class="tool-aiming-guide-webcam">${g.webcam}</div>` : ''}
  </div>`;
}

if (typeof window !== 'undefined') {
  window._dismissAimingGuide = (toolKey) => {
    try { localStorage.setItem(`labcharts-aim-guide-${toolKey}`, 'dismissed'); } catch (_) {}
    // Hide the currently-rendered guide without re-rendering the whole modal.
    const el = document.querySelector(`.tool-aiming-guide[data-tool="${toolKey}"]`);
    if (el) el.style.display = 'none';
  };
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
    if (m.id) recordTombstone(state.importedData, 'lightMeasurements', m.id);
    list.splice(i, 1);
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
  recordTombstone(state.importedData, 'lightMeasurements', id);
  list.splice(idx, 1);
  await saveImportedData();
  return true;
}

// ─── Camera AE/AWB lock helper ────────────────────────────────────────
//
// `getUserMedia` defaults to auto-exposure + auto-white-balance + auto-
// focus, which silently neutralizes the signal we're trying to read:
// - Lux: AE compensates for actual brightness → ~constant luma whatever
//   the room.
// - CCT / Spectrum: AWB color-corrects so blue-rich light reads neutral.
// - Flicker: AE smooths brightness fluctuations frame-to-frame.
// - Glass transmission: AE drifts between the two samples → ratio wrong.
//
// Modern browsers expose manual mode via `getCapabilities()` /
// `applyConstraints()`. Older Safari / iOS Chrome may not — we read the
// capability, attempt the lock, and report what actually stuck so the
// caller can show a fallback note. Sleep-darkness uses the longExposure
// option (long shutter + fixed ISO) so dim pixels register at a known
// gain instead of being amplified by auto-gain.
//
// Returns: { exposure: 'manual' | 'auto', whiteBalance: 'manual' | 'auto',
//            focus: 'manual' | 'auto', frameRate: <fps actually delivered> }
export async function lockCameraForMeasurement(stream, opts = {}) {
  const result = { exposure: 'auto', whiteBalance: 'auto', focus: 'auto', frameRate: null, iso: null, exposureTime: null };
  if (!stream || !stream.getVideoTracks) return result;
  const track = stream.getVideoTracks()[0];
  if (!track) return result;
  const settings = track.getSettings ? track.getSettings() : {};
  result.frameRate = settings.frameRate || null;
  // Some Chromium builds throw when getCapabilities is missing or the
  // track isn't fully started yet — treat as "auto fallback" rather than
  // hard-failing the whole tool.
  let caps = {};
  try { caps = (track.getCapabilities && track.getCapabilities()) || {}; } catch (e) { caps = {}; }
  const advanced = [];
  if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('manual')) {
    advanced.push({ exposureMode: 'manual' });
    if (Number.isFinite(caps.exposureCompensation?.min)) advanced.push({ exposureCompensation: 0 });
    // Pin shutter to a usable value for flicker detection — short enough
    // that PWM banding at 100 Hz+ shows up as visible stripes (not blurred
    // by a long shutter), but long enough that ambient indoor light gives
    // signal. 1/120s = 8.33ms is a reasonable middle ground if the camera
    // exposes `exposureTime` (units: 100 µs in the WICG spec).
    if (opts.shortExposure && Number.isFinite(caps.exposureTime?.min)) {
      const target = Math.max(caps.exposureTime.min, Math.min(caps.exposureTime.max, 83)); // ~8.3ms
      advanced.push({ exposureTime: target });
      result.exposureTime = target;
    }
    // Long-exposure path for the sleep-darkness meter: pin shutter to a
    // long fixed value so dim pixels actually register, AND pin ISO/gain
    // when the camera exposes it — without fixed ISO, auto-gain ramps up
    // in darkness and produces a "bright-looking" noisy image, defeating
    // the measurement. Target ~1/30s shutter (333 in 100µs units) which
    // is the longest most phone cameras allow at 30 fps.
    if (opts.longExposure && Number.isFinite(caps.exposureTime?.min)) {
      const target = Math.max(caps.exposureTime.min, Math.min(caps.exposureTime.max, 333));
      advanced.push({ exposureTime: target });
      result.exposureTime = target;
    }
    result.exposure = 'manual';
  }
  // Lock ISO/gain to a known value so absolute pixel brightness is
  // calibrated — only some Android Chromium builds expose this. Without
  // it, we can't translate raw luma to lux at all.
  if (opts.longExposure && Number.isFinite(caps.iso?.min)) {
    const target = Math.max(caps.iso.min, Math.min(caps.iso.max, 400));
    advanced.push({ iso: target });
    result.iso = target;
  } else if (opts.shortExposure && Number.isFinite(caps.iso?.min)) {
    const target = Math.max(caps.iso.min, Math.min(caps.iso.max, 100));
    advanced.push({ iso: target });
    result.iso = target;
  }
  if (Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('manual')) {
    advanced.push({ whiteBalanceMode: 'manual' });
    // 5500 K (D55) is the closest to "no color cast" for measurements
    // taken against neutral surfaces. CCT/spectrum tools want consistent
    // raw R/G/B regardless of source illumination.
    if (Number.isFinite(caps.colorTemperature?.min)) {
      const target = Math.max(caps.colorTemperature.min, Math.min(caps.colorTemperature.max, 5500));
      advanced.push({ colorTemperature: target });
    }
    result.whiteBalance = 'manual';
  }
  if (Array.isArray(caps.focusMode) && caps.focusMode.includes('manual')) {
    advanced.push({ focusMode: 'manual' });
    result.focus = 'manual';
  }
  if (advanced.length === 0) return result;
  try {
    await track.applyConstraints({ advanced });
  } catch (e) {
    // Constraint rejected — typically iOS Safari. Report the auto fallback
    // honestly; caller decides whether to warn the user.
    return { exposure: 'auto', whiteBalance: 'auto', focus: 'auto', frameRate: result.frameRate };
  }
  // Re-read settings to confirm the lock actually applied — some platforms
  // accept the constraint without honoring it.
  try {
    const after = track.getSettings ? track.getSettings() : {};
    if (after.exposureMode && after.exposureMode !== 'manual') result.exposure = 'auto';
    if (after.whiteBalanceMode && after.whiteBalanceMode !== 'manual') result.whiteBalance = 'auto';
    if (after.focusMode && after.focusMode !== 'manual') result.focus = 'auto';
    if (after.frameRate) result.frameRate = after.frameRate;
  } catch (e) {}
  return result;
}

// Short status line for the tool UI — tells the user when the camera is
// running in degraded auto-mode so a low-confidence reading is expected.
export function cameraLockStatusLine(lock) {
  if (!lock) return '';
  const allManual = lock.exposure === 'manual' && lock.whiteBalance === 'manual';
  if (allManual) {
    const fps = lock.frameRate ? ` · ${Math.round(lock.frameRate)} fps` : '';
    return `<span style="color:var(--green);font-size:11px">✓ camera locked${fps}</span>`;
  }
  const auto = [];
  if (lock.exposure !== 'manual') auto.push('exposure');
  if (lock.whiteBalance !== 'manual') auto.push('white-balance');
  return `<span style="color:var(--orange);font-size:11px">⚠ camera ${auto.join(' + ')} on auto — reading may drift</span>`;
}

// ─── Shared row-banding analyzer ───────────────────────────────────────
//
// The intra-frame rolling-shutter banding signal: a CMOS sensor reads out
// rows top-to-bottom over ~15-33 ms. A PWM light source modulates during
// that readout, painting horizontal stripes. Detecting variance ROW-WISE
// (per-row mean luma, then stddev across rows) reveals PWM at 100 Hz –
// 25 kHz that frame-rate sampling literally cannot see.
//
// Returns:
//   frameMean   — mean luma across the whole frame (0–255 scale)
//   frameMax    — max single-pixel luma (catches bright spikes)
//   bandingRatio — stddev of row means / frame mean (PWM banding strength)
//   stripes     — zero-crossings of detrended row signal across the frame
//                 (rough N stripes / 25ms readout = N × 40 Hz PWM frequency)
//   rowMeans    — Float32Array of per-row mean luma (debugging / future use)
//
// Used by flicker, spectrum, CCT, and (peripherally) sleep-darkness tools.
// W and H must match the canvas the data was read from.
export function computeRowBanding(data, W, H) {
  const rowMeans = new Float32Array(H);
  let frameSum = 0;
  let frameMax = 0;
  for (let y = 0; y < H; y++) {
    let rowSum = 0;
    const base = y * W * 4;
    for (let x = 0; x < W; x++) {
      const i = base + x * 4;
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      rowSum += luma;
      if (luma > frameMax) frameMax = luma;
    }
    const m = rowSum / W;
    rowMeans[y] = m;
    frameSum += m;
  }
  const frameMean = frameSum / H;
  let varSum = 0;
  for (let y = 0; y < H; y++) {
    const d = rowMeans[y] - frameMean;
    varSum += d * d;
  }
  const rowStddev = Math.sqrt(varSum / H);
  const bandingRatio = frameMean > 1 ? rowStddev / frameMean : 0;
  let crossings = 0;
  for (let y = 1; y < H; y++) {
    if ((rowMeans[y] >= frameMean) !== (rowMeans[y - 1] >= frameMean)) crossings++;
  }
  const stripes = Math.floor(crossings / 2);
  return { frameMean, frameMax, bandingRatio, stripes, rowMeans };
}

// ─── Tool 1: Lux Meter ─────────────────────────────────────────────────

const LUX_ZONES = [
  { max: 10,     label: 'Darkness',          color: 'var(--text-muted)' },
  { max: 100,    label: 'Low indoor',        color: 'var(--text-secondary)' },
  { max: 500,    label: 'Office',            color: 'var(--text-primary)' },
  { max: 1000,   label: 'Bright indoor',     color: 'var(--accent)' },
  { max: 10000,  label: 'Overcast outdoor',  color: 'var(--green)' },
  { max: 100000, label: 'Outdoor daylight',  color: 'var(--orange)' },
  { max: Infinity, label: 'Direct sun',       color: 'var(--orange)' },
];

function luxZone(lux) {
  for (const z of LUX_ZONES) if (lux <= z.max) return z;
  return LUX_ZONES[LUX_ZONES.length - 1];
}

let _luxState = { running: false, sensor: null, stream: null, video: null, calibration: 1.0 };

function loadLuxCalibration() {
  try { return parseFloat(localStorage.getItem('labcharts-lux-calibration')) || 1.0; }
  catch (e) { return 1.0; }
}

function saveLuxCalibration(factor) {
  try { localStorage.setItem('labcharts-lux-calibration', String(factor)); }
  catch (e) {}
}

export async function openLuxMeter(opts = {}) {
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Lux meter">
    <div class="modal-header">
      <h3>Lux Meter</h3>
      <button class="modal-close" onclick="window._closeLuxMeter()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${aimingGuideHTML('lux')}
      <p class="modal-body-hint" id="lux-source-line">Initializing…</p>
      <div class="lux-dial">
        <div class="lux-dial-value" id="lux-value">—</div>
        <div class="lux-dial-unit">lux</div>
        <div class="lux-dial-zone" id="lux-zone">—</div>
      </div>
      <div class="lux-zones">
        ${LUX_ZONES.slice(0, 6).map(z => `<div class="lux-zone-marker">≤ ${z.max} <span>${z.label}</span></div>`).join('')}
      </div>
      <details id="lux-calibration-panel" style="margin-top:14px;border:1px solid var(--border);border-radius:var(--radius-sm);padding:0">
        <summary style="padding:8px 12px;cursor:pointer;font-size:12px;color:var(--text-secondary);user-select:none">⚙ Calibrate against a known reference</summary>
        <div style="padding:0 12px 12px 12px;font-size:12px;color:var(--text-muted)">
          <p style="margin:4px 0 8px 0">Aim the camera at a light source whose lux you know — from a real meter, a second phone with an ambient-light sensor, or an indoor reading you trust. Enter the reference value below; we'll compute the factor that maps the camera's raw luma to that lux value and save it for future readings.</p>
          <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
            <label for="lux-cal-reference" style="font-size:12px;color:var(--text-muted)">Known reading (lux)</label>
            <input type="number" id="lux-cal-reference" class="ctx-input" min="0" step="any" placeholder="e.g. 400" style="flex:1;max-width:140px">
            <button class="import-btn import-btn-secondary" id="lux-cal-apply" style="font-size:12px;padding:6px 10px">Apply</button>
          </div>
          <div style="margin-top:8px;display:flex;gap:8px;align-items:center;font-size:11px">
            <span>Current factor:</span>
            <strong id="lux-cal-current" style="font-family:monospace">—</strong>
            <button class="import-btn import-btn-secondary" id="lux-cal-reset" style="font-size:11px;padding:4px 8px;margin-left:auto">Reset to 1.00×</button>
          </div>
        </div>
      </details>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="window._closeLuxMeter()">Done</button>
        <button class="import-btn import-btn-primary" id="lux-save">Save reading</button>
      </div>
    </div>
  </div>`;
  if (window._wireBackdropClose) try { window._wireBackdropClose(overlay, () => window._closeLuxMeter()); } catch (e) {}
  document.body.appendChild(overlay);
  if (window.trapModalFocus) try { window.trapModalFocus(overlay); } catch (e) {}

  let currentLux = null;
  // Snapshot of the LATEST raw camera luma (before calibration multiply).
  // The calibration UI needs this to compute a factor against a reference;
  // can't divide by currentLux because that already includes the active
  // factor.
  let currentRawLuma = null;
  const valueEl = overlay.querySelector('#lux-value');
  const zoneEl = overlay.querySelector('#lux-zone');
  const sourceLine = overlay.querySelector('#lux-source-line');
  const calCurrentEl = overlay.querySelector('#lux-cal-current');
  _luxState.running = true;
  _luxState.calibration = loadLuxCalibration();
  if (calCurrentEl) calCurrentEl.textContent = `${_luxState.calibration.toFixed(2)}×`;

  // Try AmbientLightSensor first (modern Chrome on Android with permission).
  // When ALS is available the calibration panel hides — there's nothing to
  // calibrate, the sensor reading is authoritative.
  let usingALS = false;
  let usingManualEntry = false;
  const calibrationPanel = overlay.querySelector('#lux-calibration-panel');
  if ('AmbientLightSensor' in window) {
    try {
      const sensor = new window.AmbientLightSensor({ frequency: 4 });
      sensor.addEventListener('reading', () => {
        currentLux = sensor.illuminance;
        renderLux(currentLux);
      });
      // The Generic Sensor spec throws SecurityError ASYNCHRONOUSLY via
      // sensor.onerror when permission is denied (Chromium-Android with
      // ALS permission off, browsers in Permissions-Policy=(),
      // privacy-mode iframes). Without this listener the sensor object
      // exists, start() succeeds, but `reading` events never fire and
      // the user sees a spinning "—" forever. Catch the async error
      // and fall back to the camera path same as a synchronous throw.
      sensor.addEventListener('error', () => {
        try { sensor.stop(); } catch (e) {}
        _luxState.sensor = null;
        sourceLine.innerHTML = '<b>Ambient light sensor blocked</b> by browser permissions. Close this dialog and reopen — the Lux Meter will retry with the camera fallback.';
      });
      sensor.start();
      _luxState.sensor = sensor;
      usingALS = true;
      sourceLine.textContent = 'Reading from your phone\'s ambient light sensor.';
      // ALS is the authoritative source — no calibration needed.
      if (calibrationPanel) calibrationPanel.style.display = 'none';
    } catch (e) {
      // Synchronous construction error — fall through to camera path
    }
  }

  // Fallback: camera-based estimate
  if (!usingALS) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 320, height: 240 } });
      _luxState.stream = stream;
      const lock = await lockCameraForMeasurement(stream);
      sourceLine.innerHTML = `Camera estimate (calibration ${_luxState.calibration.toFixed(2)}×, ±30%). ${cameraLockStatusLine(lock)}`;
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      _luxState.video = video;
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 48;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const tick = () => {
        if (!_luxState.running) return;
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let sum = 0;
          for (let i = 0; i < data.length; i += 4) {
            // Luma approx — Rec.709 weights
            sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          }
          const meanLuma = sum / (data.length / 4);
          currentRawLuma = meanLuma;
          // Crude mapping: 0–255 luma → 0–10000 lux at default calibration.
          // Per-device calibration via the "Calibrate" panel below.
          currentLux = Math.max(0, meanLuma * 40 * _luxState.calibration);
          renderLux(currentLux);
        } catch (e) {
          /* video not ready yet */
        }
        if (_luxState.running) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (e) {
      usingManualEntry = true;
      sourceLine.innerHTML = '<b>Camera access denied.</b> Enter a lux value manually below — read it from a real meter, a second phone with an ambient-light sensor, or pick the closest zone from the scale.';
      // Camera path is unavailable — replace the live dial with a numeric
      // input so the user can still save a reading. Calibration panel is
      // irrelevant without a camera feed, hide it.
      const dial = overlay.querySelector('.lux-dial');
      if (dial) {
        dial.innerHTML = `
          <div style="display:flex;align-items:baseline;justify-content:center;gap:8px;padding:8px 0">
            <input type="number" id="lux-manual-input" class="ctx-input" min="0" max="200000" step="1" placeholder="e.g. 400" inputmode="numeric" style="width:140px;font-size:20px;text-align:center;padding:8px 10px" />
            <span style="color:var(--text-muted);font-size:14px">lux</span>
          </div>
          <div class="lux-dial-zone" id="lux-zone" style="text-align:center;font-size:12px;color:var(--text-muted);margin-top:4px">—</div>`;
        const manualInput = overlay.querySelector('#lux-manual-input');
        const newZoneEl = overlay.querySelector('#lux-zone');
        if (manualInput) {
          manualInput.addEventListener('input', () => {
            const v = parseFloat(manualInput.value);
            if (Number.isFinite(v) && v >= 0) {
              currentLux = v;
              const z = luxZone(v);
              if (newZoneEl) {
                newZoneEl.textContent = z.label;
                newZoneEl.style.color = z.color;
              }
            } else {
              currentLux = null;
              if (newZoneEl) { newZoneEl.textContent = '—'; newZoneEl.style.color = ''; }
            }
          });
        }
      }
      if (calibrationPanel) calibrationPanel.style.display = 'none';
    }
  }

  function renderLux(v) {
    if (v == null) { valueEl.textContent = '—'; zoneEl.textContent = '—'; return; }
    valueEl.textContent = v < 100 ? v.toFixed(0) : Math.round(v).toLocaleString();
    const z = luxZone(v);
    zoneEl.textContent = z.label;
    zoneEl.style.color = z.color;
  }

  // Calibration panel handlers (camera path only — ALS panel was hidden above).
  const calApplyBtn = overlay.querySelector('#lux-cal-apply');
  const calResetBtn = overlay.querySelector('#lux-cal-reset');
  const calRefInput = overlay.querySelector('#lux-cal-reference');
  if (calApplyBtn) {
    calApplyBtn.addEventListener('click', () => {
      if (currentRawLuma == null || currentRawLuma < 0.5) {
        showNotification('Camera not reading yet — wait a moment, then try again.', 'error');
        return;
      }
      const refLux = parseFloat(calRefInput?.value);
      if (!Number.isFinite(refLux) || refLux <= 0) {
        showNotification('Enter a positive lux value from your reference.', 'error');
        return;
      }
      // factor: target lux = rawLuma × 40 × factor → factor = ref / (rawLuma × 40)
      const newFactor = refLux / Math.max(currentRawLuma * 40, 0.001);
      // Sanity-clamp to a 0.1× – 10× range so a typo doesn't permanently
      // break readings; that's already 100× of dynamic range covering
      // basically any reasonable phone-camera offset from the default.
      const clamped = Math.min(10, Math.max(0.1, newFactor));
      _luxState.calibration = clamped;
      saveLuxCalibration(clamped);
      if (calCurrentEl) calCurrentEl.textContent = `${clamped.toFixed(2)}×`;
      sourceLine.innerHTML = `Camera estimate (calibration ${clamped.toFixed(2)}×, ±30%). Calibrated against ${refLux} lux reference.`;
      showNotification(`Lux meter calibrated · factor ${clamped.toFixed(2)}×`);
    });
  }
  if (calResetBtn) {
    calResetBtn.addEventListener('click', () => {
      _luxState.calibration = 1.0;
      saveLuxCalibration(1.0);
      if (calCurrentEl) calCurrentEl.textContent = `1.00×`;
      sourceLine.innerHTML = `Camera estimate (calibration 1.00×, ±30%). Reset to default.`;
      showNotification('Lux calibration reset to 1.00×');
    });
  }

  overlay.querySelector('#lux-save').addEventListener('click', async () => {
    if (currentLux == null) {
      if (usingManualEntry) showNotification('Enter a lux value first.', 'error');
      return;
    }
    const source = usingALS ? 'AmbientLightSensor' : usingManualEntry ? 'manual-entry' : 'camera-estimate';
    const confidence = usingALS ? 0.85 : usingManualEntry ? 0.9 : 0.55;
    await saveMeasurement('lux', currentLux, {
      confidence,
      extra: { source, calibrationFactor: _luxState.calibration },
      roomId,
    });
    showNotification(`Lux reading saved: ${Math.round(currentLux)}`);
    window._closeLuxMeter();
  });

  window._closeLuxMeter = () => {
    _luxState.running = false;
    if (_luxState.sensor) { try { _luxState.sensor.stop(); } catch (e) {} _luxState.sensor = null; }
    if (_luxState.stream) { try { _luxState.stream.getTracks().forEach(t => t.stop()); } catch (e) {} _luxState.stream = null; }
    _luxState.video = null;
    overlay.remove();
  };
}

// ─── Tool 2: Flicker Detector ──────────────────────────────────────────

let _flickerState = { running: false, stream: null };

export async function openFlickerDetector(opts = {}) {
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Flicker detector">
    <div class="modal-header">
      <h3>Flicker Detector</h3>
      <button class="modal-close" onclick="window._closeFlicker()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${aimingGuideHTML('flicker')}
      <p class="modal-body-hint">Banding stripes indicate PWM flicker.</p>
      <video id="flicker-video" autoplay playsinline muted style="width:100%;border-radius:var(--radius-sm);background:#000;max-height:240px"></video>
      <div class="flicker-result" id="flicker-result">Hold camera on a light for 5 seconds…</div>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="window._closeFlicker()">Done</button>
        <button class="import-btn import-btn-primary" id="flicker-save">Save reading</button>
      </div>
    </div>
  </div>`;
  if (window._wireBackdropClose) try { window._wireBackdropClose(overlay, () => window._closeFlicker()); } catch (e) {}
  document.body.appendChild(overlay);
  if (window.trapModalFocus) try { window.trapModalFocus(overlay); } catch (e) {}

  let lastResult = null;
  const resultEl = overlay.querySelector('#flicker-result');
  const video = overlay.querySelector('#flicker-video');
  _flickerState.running = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', frameRate: { ideal: 240, min: 60 }, width: 320, height: 240 },
    });
    _flickerState.stream = stream;
    video.srcObject = stream;
    await video.play();
    // Lock exposure short + manual so PWM banding is visible — auto mode
    // smooths the brightness fluctuations that ARE the signal we're after.
    const lock = await lockCameraForMeasurement(stream, { shortExposure: true });
    const lockNote = cameraLockStatusLine(lock);
    if (lockNote) resultEl.innerHTML = `Hold camera on a light for 5 seconds…<br>${lockNote}`;
    if (lock.frameRate && lock.frameRate < 60) {
      // Below 60 fps the Nyquist limit puts a 30 Hz ceiling on detectable
      // PWM. Phone cameras often clamp to 30 fps regardless of `ideal: 240`.
      // Tell the user up-front rather than reporting "Flicker-free" for a
      // 200 Hz PWM lamp the camera literally can't see.
      resultEl.innerHTML += `<br><small style="color:var(--orange)">⚠ camera running at ${Math.round(lock.frameRate)} fps — PWM above ${Math.round(lock.frameRate / 2)} Hz won't show up. Try a different camera if available.</small>`;
    }
    // Two-channel detection:
    //   1. Frame-luma variance (detects PWM up to fps/2 Hz only — useless
    //      above ~30 Hz on a 60 fps camera). Kept for slow flicker /
    //      mains-frequency 50/60 Hz visibility.
    //   2. Intra-frame ROW banding from rolling shutter via the shared
    //      computeRowBanding() helper — detects PWM at 100 Hz – 25 kHz
    //      that frame-rate sampling literally cannot see.
    //
    // Use 64x48 capture so we have enough rows to see banding cleanly.
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 48;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const frameSamples = [];
    const bandingSamples = [];
    const startTime = performance.now();
    const tick = () => {
      if (!_flickerState.running) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const { frameMean, bandingRatio, stripes } = computeRowBanding(data, canvas.width, canvas.height);
      // Frame-luma channel (legacy): sum across rows ≈ frameMean × H.
      const frameLumaSum = frameMean * canvas.height;
      frameSamples.push({ t: performance.now() - startTime, v: frameLumaSum });
      bandingSamples.push({ t: performance.now() - startTime, banding: bandingRatio, stripes });
      if (frameSamples.length > 240) frameSamples.shift();
      if (bandingSamples.length > 240) bandingSamples.shift();
      if (frameSamples.length >= 60) renderFlicker(frameSamples, bandingSamples, lock);
      if (_flickerState.running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch (e) {
    resultEl.innerHTML = 'Camera access denied — flicker detector unavailable. <br><span style="font-size:11px;color:var(--text-muted)">This tool needs the camera at 240 fps to detect PWM banding. To re-enable, open your browser\'s site settings and allow camera access.</span>';
  }

  function renderFlicker(frameSamples, bandingSamples, lock) {
    const recent = frameSamples.slice(-120);
    if (recent.length < 30) return;

    // Channel 1: frame-luma variance over last second (slow flicker, mains 50/60 Hz).
    const vals = recent.map(s => s.v);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const frameRatio = mean ? (max - min) / mean : 0;

    // Channel 2: intra-frame row banding — the strong signal for fast PWM.
    // Take the maximum banding ratio across recent frames (banding flickers
    // in/out as PWM phase aligns with readout). Single-frame max is more
    // robust than mean: a strong stripe pattern in any one frame is real.
    const recentBanding = bandingSamples.slice(-60);
    const peakBanding = recentBanding.reduce((m, s) => Math.max(m, s.banding), 0);
    const peakStripes = recentBanding.reduce((m, s) => Math.max(m, s.stripes), 0);

    // Combined score — banding dominates because it sees the PWM range
    // that frame-luma can't (>30 Hz on a 60 fps camera).
    let score, label;
    const aeActive = !lock || lock.exposure !== 'manual';
    if (peakBanding > 0.18) { score = 3; label = 'Heavy flicker — consider replacing this light'; }
    else if (peakBanding > 0.10) { score = 2; label = 'Visible flicker — eye-strain risk'; }
    else if (peakBanding > 0.04 || frameRatio > 0.12) { score = 1; label = 'Mild flicker, likely OK for most'; }
    else if (aeActive) { score = 0; label = 'Below detection threshold (camera in auto mode)'; }
    else { score = 0; label = 'Flicker-free (no rolling-shutter banding detected)'; }

    // Frequency estimate from stripe count + assumed 25ms readout
    let freq = '';
    if (peakStripes >= 2) {
      const estHz = peakStripes * 40; // N / 0.025s
      freq = ` · ~${estHz} Hz (rolling-shutter banding)`;
    }

    lastResult = {
      score, label,
      bandingRatio: peakBanding,
      stripes: peakStripes,
      frameRatio,
    };
    resultEl.innerHTML = `<strong class="flicker-score-${score}">${escapeHTML(label)}</strong>${escapeHTML(freq)}<br><small style="color:var(--text-muted)">banding ${peakBanding.toFixed(3)} · frame-luma ${frameRatio.toFixed(3)}${peakStripes >= 2 ? ` · ${peakStripes} stripes/frame` : ''}</small>`;
  }

  overlay.querySelector('#flicker-save').addEventListener('click', async () => {
    if (!lastResult) return;
    await saveMeasurement('flicker', lastResult.score, {
      confidence: 0.7,
      extra: lastResult,
      roomId,
    });
    showNotification(`Flicker score saved: ${lastResult.label}`);
    window._closeFlicker();
  });

  window._closeFlicker = () => {
    _flickerState.running = false;
    if (_flickerState.stream) { try { _flickerState.stream.getTracks().forEach(t => t.stop()); } catch (e) {} _flickerState.stream = null; }
    overlay.remove();
  };
}

// ─── Tool 6: Sleep Darkness Meter ─────────────────────────────────────

let _darkState = { running: false, stream: null };

export async function openDarknessMeter(opts = {}) {
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Sleep darkness meter">
    <div class="modal-header">
      <h3>Sleep Darkness Meter</h3>
      <button class="modal-close" onclick="window._closeDark()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${aimingGuideHTML('darkness')}
      <p class="modal-body-hint">Lights as you'll actually sleep — door cracked, hallway light on, etc.</p>
      <div class="dark-status" id="dark-status">Press Start when ready.</div>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="window._closeDark()">Cancel</button>
        <button class="import-btn import-btn-primary" id="dark-start">Start 30-second read</button>
      </div>
    </div>
  </div>`;
  if (window._wireBackdropClose) try { window._wireBackdropClose(overlay, () => window._closeDark()); } catch (e) {}
  document.body.appendChild(overlay);
  if (window.trapModalFocus) try { window.trapModalFocus(overlay); } catch (e) {}

  let result = null;
  const statusEl = overlay.querySelector('#dark-status');
  const startBtn = overlay.querySelector('#dark-start');

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    statusEl.textContent = 'Reading… leave the phone face-up and don\'t cover the camera.';
    _darkState.running = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 160, height: 120 },
      });
      _darkState.stream = stream;
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      // Lock long shutter + fixed ISO so dim pixels register at a known
      // gain. Without ISO lock, auto-gain compensates darkness and the
      // raw pixel values can't be translated to lux. Surfaces the
      // calibration state honestly when lock partially fails.
      const lock = await lockCameraForMeasurement(stream, { longExposure: true });
      const canvas = document.createElement('canvas');
      canvas.width = 32; canvas.height = 24;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const lumas = [];      // mean per sample
      const peaks = [];      // single-pixel max per sample
      const t0 = performance.now();
      let cancelled = false;
      while (performance.now() - t0 < 30000 && _darkState.running) {
        // The camera stream may have been stopped by _closeDark() while
        // we were sleeping in setTimeout. drawImage on a closed stream
        // throws InvalidStateError; catch it explicitly so the loop
        // exits cleanly instead of silently failing inside an unhandled
        // rejection (which would leave the dialog stuck at "—" forever).
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        } catch (e) {
          cancelled = true;
          break;
        }
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0, max = 0;
        for (let i = 0; i < data.length; i += 4) {
          const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          sum += luma;
          if (luma > max) max = luma;
        }
        lumas.push(sum / (data.length / 4));
        peaks.push(max);
        await new Promise(r => setTimeout(r, 200));
      }
      // User cancelled — bail out before computing summary stats so
      // the close button feels responsive and the result variable
      // stays null (the save handler gates on result presence).
      if (cancelled || !_darkState.running) {
        return;
      }
      const meanLuma = lumas.reduce((a, b) => a + b, 0) / Math.max(1, lumas.length);
      // 95th-percentile peak across the 30s window — rejects single-frame
      // noise spikes while still surfacing real bright events (a phone
      // notification, a passing car, an LED standby light briefly visible).
      const sortedPeaks = peaks.slice().sort((a, b) => a - b);
      const peakLuma = sortedPeaks[Math.floor(sortedPeaks.length * 0.95)] || 0;
      // Camera noise floor at near-darkness sits around 2 luma units; the
      // 0.5 lux/luma scale factor is empirical from a Pixel 6 reference
      // measurement (D55 light, locked exposure). Apply the user's
      // device-calibration multiplier so per-device sensor variance is
      // accounted for. Subtract noise floor for the mean-lux estimate so
      // true darkness reads as ≈ 0, not the noise-floor ≈ 1 lux.
      const calFactor = loadLuxCalibration();
      const NOISE_FLOOR_LUMA = 2;
      const meanLux = Math.max(0, (meanLuma - NOISE_FLOOR_LUMA) * 0.5 * calFactor);
      const peakLux = Math.max(0, (peakLuma - NOISE_FLOOR_LUMA) * 0.5 * calFactor);
      // Thresholds anchored to circadian literature:
      //   Brainard 2001:        ≥ 1.5–2 lux at the cornea suppresses
      //                         melatonin in ~30% of sensitive individuals
      //   Phillips 2019:        5–10 lux for 5h shifts circadian phase
      //                         by ~30 min in a population study
      //   Phipps-Nelson 2003:   100 lux for 6.5h is full suppression
      // We grade chronic (mean) and acute (peak) on different scales —
      // acute light spikes are circadian disruptions even when the mean
      // looks fine.
      let label, cls;
      if (meanLux < 0.3 && peakLux < 1) {
        label = 'Excellent — true darkness'; cls = 'ok';
      } else if (meanLux < 1 && peakLux < 5) {
        label = 'Good — minor leak, melatonin mostly preserved'; cls = 'ok';
      } else if (meanLux < 5 && peakLux < 20) {
        label = 'Moderate leak — 20–30% melatonin attenuation likely'; cls = 'warn';
      } else if (peakLux >= 20 && meanLux < 5) {
        label = 'Bright spikes detected — investigate notifications / passing lights'; cls = 'warn';
      } else {
        label = 'Significant — circadian phase shift likely'; cls = 'over';
      }
      result = { meanLux, peakLux, lockMode: lock.exposure, isoLocked: lock.iso != null, calFactor, label, cls };
      // Honesty caveat when ISO couldn't be pinned — pixel values are
      // uncalibrated absolute, only the relative comparison is meaningful.
      const calNote = lock.iso != null
        ? `<small style="color:var(--text-muted)">Locked ISO ${lock.iso}, exposure ${lock.exposure}.</small>`
        : `<small style="color:var(--orange)">⚠ ISO not lockable on this camera — readings are qualitative (good/moderate/bright), not absolute lux. ${cameraLockStatusLine(lock)}</small>`;
      statusEl.innerHTML = `<strong class="dark-status-${cls}">${escapeHTML(label)}</strong>` +
        `<br><small style="color:var(--text-muted)">~${meanLux.toFixed(2)} lux average · ~${peakLux.toFixed(2)} lux peak (95th-pctile)</small>` +
        `<br>${calNote}`;
      startBtn.textContent = 'Save reading';
      startBtn.disabled = false;
      startBtn.onclick = async () => {
        // Save the mean as the headline value (the chronic-exposure number);
        // peak goes into `extra` so detail-modal / AI can surface spike events.
        await saveMeasurement('darkness', meanLux, {
          confidence: lock.iso != null ? 0.7 : 0.45,
          extra: result,
          roomId,
        });
        showNotification('Sleep darkness reading saved.');
        window._closeDark();
      };
    } catch (e) {
      statusEl.innerHTML = 'Camera access denied — darkness meter unavailable. <br><span style="font-size:11px;color:var(--text-muted)">Open your browser\'s site settings to allow camera access. This tool runs a long-exposure capture to detect ambient light below 1 lux — there\'s no useful manual-entry fallback.</span>';
      startBtn.disabled = false;
    }
  });

  window._closeDark = () => {
    _darkState.running = false;
    if (_darkState.stream) { try { _darkState.stream.getTracks().forEach(t => t.stop()); } catch (e) {} _darkState.stream = null; }
    overlay.remove();
  };
}

// ─── Tool 3: CCT Meter ────────────────────────────────────────────────

let _cctState = { running: false, stream: null };

export async function openCCTMeter(opts = {}) {
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Color temperature meter">
    <div class="modal-header">
      <h3>Color Temperature</h3>
      <button class="modal-close" onclick="window._closeCCT()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${aimingGuideHTML('cct')}
      <p class="modal-body-hint">Reading updates live.</p>
      <video id="cct-video" autoplay playsinline muted style="width:100%;border-radius:var(--radius-sm);background:#000;max-height:200px"></video>
      <div class="cct-result">
        <div class="cct-value" id="cct-value">— K</div>
        <div class="cct-tone" id="cct-tone">—</div>
        <div class="cct-coherence" id="cct-coherence"></div>
      </div>
      <div class="modal-actions" style="margin-top:14px">
        <button class="import-btn import-btn-secondary" onclick="window._closeCCT()">Done</button>
        <button class="import-btn import-btn-primary" id="cct-save">Save reading</button>
      </div>
    </div>
  </div>`;
  if (window._wireBackdropClose) try { window._wireBackdropClose(overlay, () => window._closeCCT()); } catch (e) {}
  document.body.appendChild(overlay);
  if (window.trapModalFocus) try { window.trapModalFocus(overlay); } catch (e) {}

  let currentCCT = null;
  let currentMelanopic = null;
  let currentPWMActive = false;
  const valueEl = overlay.querySelector('#cct-value');
  const toneEl = overlay.querySelector('#cct-tone');
  const cohEl = overlay.querySelector('#cct-coherence');
  const video = overlay.querySelector('#cct-video');
  _cctState.running = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: 320, height: 240 },
    });
    _cctState.stream = stream;
    video.srcObject = stream;
    await video.play();
    // Manual WB + exposure are the entire game here — auto-WB neutralizes
    // the color cast we're trying to measure. Without the lock, R/B ratio
    // is the camera's residual error, not the source CCT.
    const lock = await lockCameraForMeasurement(stream);
    if (lock.whiteBalance !== 'manual') {
      cohEl.innerHTML = `<span style="color:var(--orange);font-size:11px">⚠ camera auto-white-balance is on — CCT reading is the camera's error, not the source. Try a different browser / phone, or use a meter for accurate readings.</span>`;
    }
    // 64x48 capture so we can also run row-banding detection — flags
    // PWM-dimmed lights whose CCT shifts during the PWM cycle.
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 48;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const bandingPeaks = [];
    const tick = () => {
      if (!_cctState.running) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
      const px = data.length / 4;
      r /= px; g /= px; b /= px;
      // Crude CCT estimate from R/B ratio (McCamy approximation, very rough)
      const sum = r + g + b || 1;
      const rN = r / sum, bN = b / sum;
      // Higher b/r ratio → cooler. Map to 1800–7000K.
      const ratio = bN / Math.max(rN, 0.01);
      const cct = Math.round(1800 + Math.min(5200, ratio * 4500));
      // Melanopic ratio (B / R+G+B) — circadian impact independent of CCT.
      // Two LEDs at the same CCT can have very different blue spikes.
      const melanopic = bN;
      const { bandingRatio, stripes } = computeRowBanding(data, canvas.width, canvas.height);
      bandingPeaks.push(bandingRatio);
      if (bandingPeaks.length > 60) bandingPeaks.shift();
      const peakBanding = bandingPeaks.reduce((m, x) => Math.max(m, x), 0);
      currentCCT = cct;
      currentMelanopic = melanopic;
      currentPWMActive = peakBanding > 0.10 && stripes >= 2;
      valueEl.textContent = `${cct} K`;
      toneEl.textContent = cctTone(cct);
      // Only render the solar-coherence hint when WB lock succeeded —
      // otherwise the CCT value itself is unreliable, so the hint built
      // on top of it would mislead. Same for melanopic / PWM annotations.
      if (lock.whiteBalance === 'manual') {
        const melanopicNote = melanopic > 0.32
          ? `<span style="color:var(--orange);font-size:11px">⚠ high melanopic load (${(melanopic * 100).toFixed(0)}%) — daytime use only</span>`
          : melanopic < 0.25
          ? `<span style="color:var(--green);font-size:11px">✓ sleep-safe melanopic load (${(melanopic * 100).toFixed(0)}%)</span>`
          : `<span style="color:var(--text-muted);font-size:11px">mixed melanopic load (${(melanopic * 100).toFixed(0)}%)</span>`;
        const pwmNote = peakBanding > 0.10 && stripes >= 2
          ? `<br><span style="color:var(--orange);font-size:11px">⚠ PWM dimming detected — open Flicker Detector for severity</span>`
          : '';
        cohEl.innerHTML = solarCoherence(cct) + `<br>${melanopicNote}${pwmNote}`;
      }
      if (_cctState.running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch (e) {
    valueEl.textContent = 'Camera denied';
  }

  overlay.querySelector('#cct-save').addEventListener('click', async () => {
    if (currentCCT == null) return;
    await saveMeasurement('cct', currentCCT, {
      confidence: 0.5,
      extra: { melanopic: currentMelanopic, pwmActive: currentPWMActive },
      roomId,
    });
    showNotification(`Color temp saved: ${currentCCT} K`);
    window._closeCCT();
  });

  window._closeCCT = () => {
    _cctState.running = false;
    if (_cctState.stream) { try { _cctState.stream.getTracks().forEach(t => t.stop()); } catch (e) {} _cctState.stream = null; }
    overlay.remove();
  };
}

function cctTone(k) {
  if (k < 2200) return 'Candle';
  if (k < 3000) return 'Warm white (incandescent / warm LED)';
  if (k < 4000) return 'Soft white';
  if (k < 5000) return 'Cool white / fluorescent';
  if (k < 6000) return 'Daylight';
  return 'Overcast / blue-shifted';
}

function solarCoherence(k) {
  // Compare to solar CCT for current local hour (rough)
  const hr = new Date().getHours();
  let solarK;
  if (hr < 6 || hr >= 20) solarK = 2000;
  else if (hr < 8 || hr >= 18) solarK = 3500;
  else if (hr < 10 || hr >= 16) solarK = 5000;
  else solarK = 5500;
  const diff = Math.abs(k - solarK);
  if (diff < 800) return `<span style="color:var(--green)">✓ matches solar time (~${solarK} K)</span>`;
  if (diff < 1500) return `<span style="color:var(--text-secondary)">slight mismatch (solar now ~${solarK} K)</span>`;
  return `<span style="color:var(--orange)">⚠ mismatch — solar is ~${solarK} K right now</span>`;
}

// ─── Tool 4: Spectrum Classifier (simplified) ────────────────────────

let _specState = { running: false, stream: null };

export async function openSpectrumClassifier(opts = {}) {
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Spectrum classifier">
    <div class="modal-header">
      <h3>What kind of light is this?</h3>
      <button class="modal-close" onclick="window._closeSpec()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${aimingGuideHTML('spectrum')}
      <p class="modal-body-hint">We classify by RGB pattern and flicker.</p>
      <video id="spec-video" autoplay playsinline muted style="width:100%;border-radius:var(--radius-sm);background:#000;max-height:200px"></video>
      <div class="spec-result" id="spec-result">Reading…</div>
      <div class="modal-actions" style="margin-top:14px">
        <button class="import-btn import-btn-secondary" onclick="window._closeSpec()">Done</button>
        <button class="import-btn import-btn-primary" id="spec-save">Save reading</button>
      </div>
    </div>
  </div>`;
  if (window._wireBackdropClose) try { window._wireBackdropClose(overlay, () => window._closeSpec()); } catch (e) {}
  document.body.appendChild(overlay);
  if (window.trapModalFocus) try { window.trapModalFocus(overlay); } catch (e) {}

  let result = null;
  const resultEl = overlay.querySelector('#spec-result');
  const video = overlay.querySelector('#spec-video');
  _specState.running = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', frameRate: { ideal: 240, min: 60 }, width: 320, height: 240 },
    });
    _specState.stream = stream;
    video.srcObject = stream;
    await video.play();
    // Manual exposure + WB so the classifier reads the actual emitter,
    // not the camera's auto-corrected output. Auto-mode would map every
    // light source toward neutral grey, defeating classification.
    const lock = await lockCameraForMeasurement(stream, { shortExposure: true });
    if (lock.whiteBalance !== 'manual' || lock.exposure !== 'manual') {
      resultEl.innerHTML = `<span style="color:var(--orange);font-size:12px">⚠ camera auto-mode partially active — classification reliability is reduced. ${cameraLockStatusLine(lock)}</span>`;
    }
    // 64x48 capture so the row-banding analyzer has enough rows to see
    // PWM stripes — the spectrum classifier shares the rolling-shutter
    // signal with the flicker tool instead of using its own crude
    // frame-luma variance (which can't see anything above fps/2).
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 48;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const bandingPeaks = [];   // recent banding ratios — peak across last second wins
    const tick = () => {
      if (!_specState.running) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]; g += data[i + 1]; b += data[i + 2];
      }
      const px = data.length / 4;
      r /= px; g /= px; b /= px;
      const { bandingRatio, stripes } = computeRowBanding(data, canvas.width, canvas.height);
      bandingPeaks.push(bandingRatio);
      if (bandingPeaks.length > 60) bandingPeaks.shift();
      const peakBanding = bandingPeaks.reduce((m, x) => Math.max(m, x), 0);
      result = classifyLight({ r, g, b, peakBanding, stripes });
      // Discount confidence by 30% when WB couldn't be locked — under
      // auto-WB the R/G/B ratios reflect camera correction, not source.
      if (lock.whiteBalance !== 'manual') result = { ...result, confidence: result.confidence * 0.7, reason: result.reason + ' (camera auto-WB → low confidence)' };
      const circadianBadge = result.circadian === 'sleep-safe' ? `<span style="color:var(--green);font-size:11px">✓ sleep-safe spectrum</span>`
        : result.circadian === 'day-only' ? `<span style="color:var(--orange);font-size:11px">⚠ day-only — high melanopic load</span>`
        : `<span style="color:var(--text-muted);font-size:11px">mixed melanopic load</span>`;
      resultEl.innerHTML = `<strong>${escapeHTML(result.label)}</strong> <span style="color:var(--text-muted)">· ${(result.confidence * 100).toFixed(0)}% confidence</span><br><small style="color:var(--text-secondary)">${escapeHTML(result.reason)}</small><br>${circadianBadge} <span style="color:var(--text-muted);font-size:11px">· melanopic ratio ${(result.melanopic * 100).toFixed(0)}%</span>`;
      if (_specState.running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch (e) {
    // Replace the dead video preview with a permission-request CTA so the
    // user can either retry the prompt or open browser site-settings.
    // Without the camera there's no signal to classify — manual pick from
    // the four spectrum types is the only fallback.
    if (video) video.style.display = 'none';
    resultEl.innerHTML = `
      <div style="padding:14px 12px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius-sm);">
        <div style="font-weight:600;color:var(--text-primary);margin-bottom:6px">Camera access denied</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">This tool reads the bulb's RGB profile to classify the source. To re-enable, open your browser's site settings and allow camera access for this page, then reopen the tool.</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Or pick the closest match manually:</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          <button class="ctx-btn-option" data-spec-manual="Warm LED (2700–3000K)">Warm LED</button>
          <button class="ctx-btn-option" data-spec-manual="Cool LED (4000K+)">Cool LED</button>
          <button class="ctx-btn-option" data-spec-manual="Fluorescent">Fluorescent</button>
          <button class="ctx-btn-option" data-spec-manual="Incandescent / halogen">Incandescent</button>
          <button class="ctx-btn-option" data-spec-manual="Daylight">Daylight</button>
        </div>
      </div>`;
    overlay.querySelectorAll('[data-spec-manual]').forEach(btn => {
      btn.addEventListener('click', () => {
        const label = btn.getAttribute('data-spec-manual');
        result = { label, confidence: 0.7, reason: 'manual selection (camera denied)', melanopic: null, circadian: 'unknown' };
        overlay.querySelectorAll('[data-spec-manual]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }

  overlay.querySelector('#spec-save').addEventListener('click', async () => {
    if (!result) {
      showNotification('Pick a light type first (or grant camera access).', 'error');
      return;
    }
    await saveMeasurement('spectrum', result.label, { confidence: result.confidence, extra: result, roomId });
    showNotification(`Light type saved: ${result.label}`);
    window._closeSpec();
  });

  window._closeSpec = () => {
    _specState.running = false;
    if (_specState.stream) { try { _specState.stream.getTracks().forEach(t => t.stop()); } catch (e) {} _specState.stream = null; }
    overlay.remove();
  };
}

// Spectrum classifier — RGB ratio + rolling-shutter PWM banding +
// melanopic indicator. The melanopic ratio is a coarse approximation
// of the SPD's stimulation of the ipRGCs (intrinsically photosensitive
// retinal ganglion cells) that drive circadian phase. Phone-camera blue
// channels peak around 450-470 nm, close to the melanopsin peak at 480
// nm — close enough for a relative comparison across light sources.
// Returns label + confidence + reason + melanopic (0–1) + circadian
// classification (sleep-safe / mixed / day-only).
function classifyLight({ r, g, b, peakBanding, stripes }) {
  const sum = r + g + b || 1;
  const rN = r / sum, gN = g / sum, bN = b / sum;
  // Melanopic ratio: B / (R+G+B). Sleep-safe sources keep this below ~25%
  // (incandescent ~12%, warm LED ~22%, candle ~6%). Day-only sources sit
  // above ~32% (cool LED 36%, daylight ~33%, fluorescent often 30%+).
  const melanopic = bN;
  const circadian = melanopic < 0.25 ? 'sleep-safe' : melanopic > 0.32 ? 'day-only' : 'mixed';
  // Heavy banding (>0.10 ratio, ≥2 stripes) means PWM is active. Used
  // to disambiguate fluorescent (typically 100 Hz mains-doubled) from
  // similar-RGB cool LEDs.
  const heavyPWM = peakBanding > 0.10 && stripes >= 2;

  if (heavyPWM && gN > 0.36) {
    return { label: 'Fluorescent / CFL', confidence: 0.75, reason: 'PWM banding + green spike — fluorescent signature.', melanopic, circadian };
  }
  if (rN > 0.40 && bN < 0.20) {
    return { label: 'Incandescent / halogen', confidence: 0.8, reason: 'Red-rich, low blue — filament-style emitter, sleep-safe.', melanopic, circadian };
  }
  if (bN > 0.36 && !heavyPWM) {
    return { label: 'Cool LED (4000K+)', confidence: 0.75, reason: 'Blue-rich, near-flicker-free — daytime / focus light.', melanopic, circadian };
  }
  if (bN > 0.36 && heavyPWM) {
    return { label: 'Cool LED with PWM dimming', confidence: 0.75, reason: 'Blue-rich + visible PWM stripes — eye-strain risk on dim setting.', melanopic, circadian };
  }
  if (rN > 0.32 && bN < 0.30 && !heavyPWM) {
    return { label: 'Warm LED (2700–3000K)', confidence: 0.75, reason: 'Slight red lift, near-flicker-free — evening-friendly.', melanopic, circadian };
  }
  if (rN > 0.32 && bN < 0.30 && heavyPWM) {
    return { label: 'Warm LED with PWM dimming', confidence: 0.7, reason: 'Warm + PWM stripes — replace with flicker-free for evening rooms.', melanopic, circadian };
  }
  if (Math.abs(rN - 0.33) < 0.05 && Math.abs(bN - 0.33) < 0.05) {
    return { label: 'Daylight or full-spectrum', confidence: 0.65, reason: 'Balanced RGB — natural or full-spectrum source.', melanopic, circadian };
  }
  return { label: 'Mixed / unclassified', confidence: 0.4, reason: 'Pattern doesn\'t match a known signature.', melanopic, circadian };
}

// ─── Tool 5: Glass Transmission Test ──────────────────────────────────

let _glassReadings = { inside: null, outside: null };

export async function openGlassTransmission(opts = {}) {
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Glass transmission test">
    <div class="modal-header">
      <h3>Window / Glass Transmission</h3>
      <button class="modal-close" onclick="window._closeGlass()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${aimingGuideHTML('glass-transmission')}
      <p class="modal-body-hint" style="color:var(--orange);background:rgba(255,160,80,0.08);border-left:3px solid var(--orange);padding:8px 10px;border-radius:4px;font-size:11px;margin-bottom:8px">⚠ Aim at the same patch of sky / light source for both readings. North-window through the glass vs. east-window without it measures scene difference, not glass transmission.</p>
      <div class="glass-step" id="glass-step-inside">
        <span>Step 1: <strong>through the glass</strong></span>
        <button class="import-btn import-btn-secondary" id="glass-measure-inside">Measure inside</button>
        <span class="glass-reading" id="glass-reading-inside">—</span>
      </div>
      <div class="glass-step" id="glass-step-outside">
        <span>Step 2: <strong>direct (no glass)</strong></span>
        <button class="import-btn import-btn-secondary" id="glass-measure-outside">Measure outside</button>
        <span class="glass-reading" id="glass-reading-outside">—</span>
      </div>
      <div class="glass-result" id="glass-result"></div>
      <div class="modal-actions" style="margin-top:14px">
        <button class="import-btn import-btn-secondary" onclick="window._closeGlass()">Done</button>
        <button class="import-btn import-btn-primary" id="glass-save" disabled>Save reading</button>
      </div>
    </div>
  </div>`;
  if (window._wireBackdropClose) try { window._wireBackdropClose(overlay, () => window._closeGlass()); } catch (e) {}
  document.body.appendChild(overlay);
  if (window.trapModalFocus) try { window.trapModalFocus(overlay); } catch (e) {}

  _glassReadings = { inside: null, outside: null };

  let _lastGlassLock = null;
  const measure = async (which) => {
    // Reuse the lux-camera path inline. Simpler than spinning up the modal.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 160, height: 120 } });
      const video = document.createElement('video');
      video.srcObject = stream; video.muted = true; video.playsInline = true;
      await video.play();
      // Critical: the through-glass and direct samples MUST use the same
      // exposure/WB or the ratio compares apples to oranges. Auto-mode
      // re-exposes for each scene → ratio reflects camera-AE, not glass.
      const lock = await lockCameraForMeasurement(stream);
      _lastGlassLock = lock;
      const canvas = document.createElement('canvas');
      canvas.width = 32; canvas.height = 24;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      // Sample over 1s
      const samples = [];
      for (let i = 0; i < 8; i++) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0;
        for (let j = 0; j < data.length; j += 4) sum += 0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2];
        samples.push(sum / (data.length / 4));
        await new Promise(r => setTimeout(r, 125));
      }
      stream.getTracks().forEach(t => t.stop());
      const meanLuma = samples.reduce((a, b) => a + b, 0) / samples.length;
      const luxEst = Math.max(0, meanLuma * 40 * loadLuxCalibration());
      _glassReadings[which] = luxEst;
      overlay.querySelector(`#glass-reading-${which}`).textContent = `${Math.round(luxEst)} lux`;
      computeGlass();
    } catch (e) {
      overlay.querySelector(`#glass-reading-${which}`).textContent = 'denied';
    }
  };
  overlay.querySelector('#glass-measure-inside').addEventListener('click', () => measure('inside'));
  overlay.querySelector('#glass-measure-outside').addEventListener('click', () => measure('outside'));

  function computeGlass() {
    if (_glassReadings.inside == null || _glassReadings.outside == null) return;
    const transmission = Math.min(1, _glassReadings.inside / Math.max(_glassReadings.outside, 1));
    const blocked = (1 - transmission) * 100;
    const lockNote = _lastGlassLock && _lastGlassLock.exposure !== 'manual'
      ? `<br><small style="color:var(--orange)">⚠ camera auto-exposure was active — re-exposes between samples, the ratio above is approximate. Re-take readings if you need precision.</small>`
      : '';
    overlay.querySelector('#glass-result').innerHTML =
      `<strong>Glass transmits ${(transmission * 100).toFixed(0)}% of visible light</strong>` +
      `<br><small>Blocks ~${blocked.toFixed(0)}% of broadband visible. <strong>UV transmission cannot be inferred from this measurement</strong> — Low-E and UV-blocking coatings have very different UV/visible ratios. A handheld UV meter is required to verify UV-A or UV-B blocking.</small>${lockNote}`;
    overlay.querySelector('#glass-save').disabled = false;
    overlay.querySelector('#glass-save').onclick = async () => {
      await saveMeasurement('glass-transmission', transmission, {
        confidence: _lastGlassLock && _lastGlassLock.exposure === 'manual' ? 0.7 : 0.5,
        extra: { inside: _glassReadings.inside, outside: _glassReadings.outside, lockMode: _lastGlassLock?.exposure || 'auto' },
        roomId,
      });
      showNotification(`Glass transmission saved: ${(transmission * 100).toFixed(0)}%`);
      window._closeGlass();
    };
  }

  window._closeGlass = () => overlay.remove();
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
    const minutes = parseInt(overlay.querySelector('#sunrise-duration').value, 10) || 15;
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
            if (!pauseStart) pauseStart = t;
            else if (t - pauseStart > 5000) {
              // Mark a pause snapshot
              const lux = Math.max(0, luma * 40 * loadLuxCalibration());
              pauseDetections.push({ at: t, luma, lux, label: '' });
              renderAuditList();
              pauseStart = null; // reset until movement
            }
          } else {
            pauseStart = null;
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
  // Compute lightweight stats for the "since-you-started" footer line.
  // No new state — just walks the existing measurements array which
  // saveMeasurement appends to. Stays cheap even at hundreds of rows
  // because we early-out at the totals (no per-tool aggregation here;
  // the Light Environment page surfaces per-tool results elsewhere).
  const all = getMeasurements();
  const total = all.length;
  const cutoff7d = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent7 = all.filter(m => (m.capturedAt || 0) >= cutoff7d).length;

  // Tool groups — quick reach, full measurement, walkthrough/log.
  // The Spectrum card still gets primary-action visual treatment via
  // .light-tool-card-primary (subtle accent border) since it's the
  // single highest-value first measurement for users without bulb
  // specs. The "start here" badge was dropped because the other tools
  // had no inverse hierarchy ("come here second / third"), so the
  // implied sequencing was misleading.
  const card = (handler, icon, name, desc, opts = {}) => `
    <button class="light-tool-card${opts.primary ? ' light-tool-card-primary' : ''}" onclick="${handler}">
      <div class="light-tool-icon">${icon}</div>
      <div class="light-tool-name">${name}${opts.primary ? '<span class="light-tool-pill-hint" title="Recommended starting point">Start here</span>' : ''}</div>
      <div class="light-tool-desc">${desc}</div>
    </button>`;

  return `<div class="light-tools-section">
    <h3 class="light-section-title">Light tools</h3>
    <p class="light-section-hint">Measurements run on your device. Camera frames never leave your phone.</p>

    <div class="light-tools-group">
      <div class="light-tools-group-head">Quick checks · 10–30 s</div>
      <div class="light-tools-grid">
        ${card("window.openSpectrumClassifier()", '🔬', 'What is this light?', 'LED, fluorescent, daylight, or incandescent? Auto-detects warm vs cool + melanopic load.', { primary: true })}
        ${card("window.openLuxMeter()", '📏', 'Lux Meter', 'How bright is this room? Daylight comparison + per-device calibration.')}
        ${card("window.openCCTMeter()", '🎨', 'Color Temp', 'Warm or cool kelvin? Matches solar time? Flags PWM dimming.')}
      </div>
    </div>

    <div class="light-tools-group">
      <div class="light-tools-group-head">Full measurements · 30 s – 2 min</div>
      <div class="light-tools-grid">
        ${card("window.openFlickerDetector()", '⚡', 'Flicker Detector', 'Is this light flickering? Sees PWM up to 25 kHz via rolling-shutter banding.')}
        ${card("window.openDarknessMeter()", '🌙', 'Sleep Darkness', 'Is your bedroom dark enough for melatonin? Measures mean + peak lux at the pillow.')}
        ${card("window.openGlassTransmission()", '🪟', 'Window check', 'Measure your glass transmission with two readings (with + without), side-by-side. The in-session "behind glass" toggle uses a generic curve — measure here for accuracy.')}
      </div>
    </div>

    <div class="light-tools-group">
      <div class="light-tools-group-head">Walkthroughs &amp; logs</div>
      <div class="light-tools-grid">
        ${card("window.openEyeLevelAudit()", '🚶', 'Home audit', 'Walk through, pause in each room for ~5 s. Get a per-room snapshot in 10 minutes.')}
        ${card("window.openSunriseLogger()", '🌅', 'Golden hour log', 'Quick after-the-fact log for sunrise / sunset sessions.')}
      </div>
    </div>

    ${total > 0 ? `<p class="light-tools-stats">${total} measurement${total === 1 ? '' : 's'} taken${recent7 > 0 ? ` · ${recent7} in the last 7 days` : ''}.</p>` : `<p class="light-tools-stats light-tools-stats-empty">No measurements yet. Start with <strong>What is this light?</strong> on the bulb closest to where you spend your evenings.</p>`}
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
