// @ts-check
// light-env-ai-analysis.js — per-room AI verdict for the Light
// Environment module. Synthesizes a room's measurements + occupancy +
// primary source + screens into one circadian-friendliness verdict.
//
// Thin wrapper around ai-verdict-engine. Stored on the room itself at
// `r.aiAnalysis` (lightEnvironment.rooms is on the per-row CRDT).

import { state } from './state.js';
import { escapeHTML, escapeAttr } from './utils.js';
import { hasAIProvider } from './api.js';
import { createAIVerdict, hashString, dotPrefix } from './ai-verdict-engine.js';
import { LIGHTING_HARDWARE_CAVEATS } from './lighting-hardware-caveats.js';
import { getRoomEveningHoursAfterSunset } from './light-env-evening.js';
import { isQuantitativeDarknessMeasurement, isQuantitativeLuxMeasurement } from './light-env-model.js';
import { formatHealthGoalsText } from './health-goals-utils.js';
import { aiActionAttrs, registerAIActionHandler } from './ai-action-delegates.js';

function _getRooms() { return state.importedData?.lightEnvironment?.rooms || []; }
function _getMeasurementsForRoom(roomId) {
  return (state.importedData?.lightMeasurements || []).filter(m => m.roomId === roomId);
}
function _getScreensForRoom(roomId) {
  return (state.importedData?.lightEnvironment?.screens || []).filter(s => s.roomId === roomId);
}

// Bumped 2026-05-08: prompt biology priors tightened to Brown 2022
// melanopic-EDI thresholds. Existing cached verdicts may carry the
// older 100-lux daytime / >1-photopic-lux night anchors — invalidate.
const _roomFingerprintSalt = 'v3-measurement-quality';
export function getRoomFingerprint(r) {
  if (!r) return '';
  const measurements = _getMeasurementsForRoom(r.id);
  const screens = _getScreensForRoom(r.id);
  const parts = [
    _roomFingerprintSalt,
    r.name || '',
    r.primarySource || '',
    r.daylightLevel || '',
    r.hoursOccupiedPerDay || 0,
    getRoomEveningHoursAfterSunset(r),
  ];
  const byTool = new Map();
  for (const m of measurements.sort((a, b) => b.capturedAt - a.capturedAt)) {
    if (!byTool.has(m.tool)) byTool.set(m.tool, m);
  }
  for (const [tool, m] of [...byTool.entries()].sort()) {
    parts.push(`${tool}:${typeof m.value === 'number' ? Math.round(m.value * 100) / 100 : m.value}:${m.extra?.method || m.extra?.source || ''}`);
  }
  parts.push(`screens:${screens.map(s => `${s.device}:${s.eveningUseAfterSunset ?? ''}:${s.blueBlockerEnabled ? 1 : 0}`).sort().join(',')}`);
  return hashString(parts.join('|'));
}

function _formatNumber(n, digits = 1) {
  if (n == null || !Number.isFinite(n)) return '—';
  return Number(n).toFixed(digits).replace(/\.0$/, '');
}

// Cap user-supplied free-text fields fed into prompt context to prevent
// prompt injection / token bloat from a 10kB pasted name. Strip newlines
// + collapse whitespace so a name like "Bedroom\n[SYSTEM: ...]" becomes
// inline text the model parses as a label, not as a directive.
function _safeText(s, max = 80) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

const _SCREEN_TYPE_LABELS = {
  phone: 'phone', tablet: 'tablet', laptop: 'laptop',
  monitor: 'monitor', tv: 'TV', ereader: 'e-reader',
};

const _SOURCE_LABELS = {
  unknown: 'unknown', incandescent: 'incandescent / halogen',
  'led-warm': 'warm LED', 'led-cool': 'cool LED',
  'led-tunable': 'tunable LED', fluorescent: 'fluorescent',
  cfl: 'CFL', 'full-spectrum': 'full-spectrum',
  daylight: 'mostly daylight (windows)',
};

export function buildRoomContext(r) {
  if (!r) return '';
  const measurements = _getMeasurementsForRoom(r.id);
  const screens = _getScreensForRoom(r.id);
  const lines = [];

  lines.push(`### Room`);
  lines.push(`Name: ${_safeText(r.name) || '(unnamed)'}`);
  if (r.primarySource) lines.push(`Primary light source: ${_SOURCE_LABELS[r.primarySource] || r.primarySource}`);
  if (r.daylightLevel && r.daylightLevel !== 'unknown') lines.push(`Daylight reaching room during usual use: ${r.daylightLevel}`);
  if (r.hoursOccupiedPerDay != null) lines.push(`Hours occupied per day: ${r.hoursOccupiedPerDay}`);
  const eveningHrs = getRoomEveningHoursAfterSunset(r);
  lines.push(eveningHrs > 0
    ? `Evening use after sunset: ${eveningHrs} hr/day`
    : 'Evening use after sunset: not used after dark');

  if (measurements.length) {
    const byTool = new Map();
    for (const m of measurements.sort((a, b) => b.capturedAt - a.capturedAt)) {
      if (!byTool.has(m.tool)) byTool.set(m.tool, m);
    }
    lines.push('');
    lines.push('### Latest measurements');
    for (const [tool, m] of byTool) {
      switch (tool) {
        case 'lux':
          lines.push(`Lux: ${Math.round(m.value)} photopic lux (${m.extra?.source || 'legacy/unknown source'}; ${isQuantitativeLuxMeasurement(m) ? 'usable spot-check' : 'unverified camera estimate — do not threshold'})`);
          break;
        case 'flicker': {
          const score = Math.round(m.value || 0);
          const sLabel = ['pristine', 'mild', 'moderate', 'severe'][score] || 'unknown';
          lines.push(`Camera banding: ${score}/3 (${sLabel})${m.extra?.stripes ? `, ${m.extra.stripes} rolling-shutter stripe groups` : ''}`);
          break;
        }
        case 'darkness':
          if (isQuantitativeDarknessMeasurement(m)) {
            lines.push(`Sleep-time meter entry: ${_formatNumber(m.value, 2)} photopic lux (not melanopic EDI)`);
          } else {
            lines.push(`Sleep-light camera check: ${m.extra?.levelLabel || 'qualitative'} (not lux; do not infer melatonin suppression)`);
          }
          break;
        case 'cct':
          {
            const blueRatio = m.extra?.cameraBlueRatioProxy ?? m.extra?.melanopic;
            lines.push(`Approximate camera CCT: ~${Math.round(m.value / 100) * 100} K${blueRatio != null ? `, camera RGB blue-ratio proxy ${_formatNumber(blueRatio, 2)} (not melanopic EDI)` : ''}${m.extra?.bandingDetected || m.extra?.pwmActive ? ', camera banding also detected' : ''}`);
          }
          break;
        case 'spectrum':
          lines.push(`Spectrum: ${m.value || m.extra?.label}${m.extra?.circadian ? ` (${m.extra.circadian})` : ''}`);
          break;
        case 'glass-transmission':
          lines.push(`Window transmission: ${Math.round((m.value || 0) * 100)}%`);
          break;
      }
    }
  } else {
    lines.push('');
    lines.push('No tool measurements yet for this room.');
  }

  if (screens.length) {
    lines.push('');
    lines.push('### Screens used in this room');
    const typeCounts = {};
    for (const s of screens) {
      const t = _SCREEN_TYPE_LABELS[s.device] || s.device;
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
    for (const [t, n] of Object.entries(typeCounts)) {
      lines.push(`  - ${n}× ${t}`);
    }
  }

  const sleepRest = state.importedData?.sleepRest;
  const goals = formatHealthGoalsText(state.importedData?.healthGoals);
  lines.push('');
  lines.push('### User context');
  if (goals) lines.push(`Health goals: ${String(goals).slice(0, 200)}`);
  if (sleepRest?.qualityScore != null) lines.push(`Sleep quality (self-rated): ${sleepRest.qualityScore}/10`);
  if (sleepRest?.bedtime) lines.push(`Reported bedtime: ${sleepRest.bedtime}`);

  return lines.join('\n');
}

const SYSTEM_PROMPT = [
  'You evaluate a single room from a user\'s Light Environment audit and give a circadian-friendliness verdict.',
  'Return ONLY valid JSON with three keys: {"dot":"green|yellow|red|gray","tip":"string","detail":"string"}.',
  '',
  'dot:',
  '  green = the entered timing and trustworthy measurements flag no clear concern',
  '  yellow = one actionable screening signal is present or important measurement quality is limited',
  '  red = multiple strong entered signals stack (for example long bright evening use plus clear banding)',
  '  gray = not enough data or only uncalibrated camera proxies',
  '',
  'Biology priors:',
  '  • Brown 2022 recommendations are eye-level melanopic EDI: ≥250 lx during daytime, ≤10 lx in the evening, and ≤1 lx during sleep. Ordinary photopic lux and camera RGB are not interchangeable with melanopic EDI.',
  '  • A trustworthy eye-level photopic-lux spot-check can describe general brightness, but source spectrum and exposure duration remain unknown.',
  '  • Camera CCT and RGB results are warm/cool proxies only. CCT cannot establish spectral completeness or melanopic content.',
  '  • A camera banding score detects some rolling-shutter patterns; no banding does not prove flicker-free output and stripe count is not frequency.',
  '  • Screen tint / Night Shift / glasses may reduce short-wavelength exposure but never count as zero; brightness, distance, and duration remain relevant.',
  '  • A high evening-hours-after-sunset count amplifies the cost of a hostile spectrum in that room — flag harder when the user spends multiple evening hours there.',
  '',
  ...LIGHTING_HARDWARE_CAVEATS,
  '',
  'tip: one sentence, max 16 words. Pick the single most useful next measurement or change.',
  'detail: 2–3 sentences. Separate entered facts, calibrated measurements, and camera proxies. Never estimate hormone suppression, phase shift, or melanopic dose from ordinary lux/CCT/RGB. If flicker is flagged, the recommendation MUST NOT introduce a generic dimmer.',
  '',
  'No "you should" — be observational and direct. No emoji.',
].join('\n');

const engine = createAIVerdict({
  getTarget: (id) => _getRooms().find(r => r.id === id),
  getId: (r) => r?.id,
  getAIAnalysis: (r) => r?.aiAnalysis || null,
  setAIAnalysis: (r, v) => { if (v == null) delete r.aiAnalysis; else r.aiAnalysis = v; },
  getFingerprint: getRoomFingerprint,
  buildContext: buildRoomContext,
  systemPrompt: SYSTEM_PROMPT,
  maxTokens: 500,
  getAllTargets: _getRooms,
});

export const analyzeRoomAI = engine.analyze;
export const refreshRoomAIAnalysis = engine.refresh;
registerAIActionHandler('refresh-room', refreshRoomAIAnalysis);

// ─── Render ────────────────────────────────────────────────────────────

// Track auto-fired room IDs per session — same gate the light-today
// hero uses, prevents tight-loop refire on transient errors.
const _autoFiredRoomKeys = new Set();

export function renderRoomAIBlock(r) {
  if (!r) return '';
  if (!hasAIProvider() && !(r.aiAnalysis?.status === 'ok' && r.aiAnalysis?.dot)) return '';
  const status = engine.getStatus(r);
  const a = r.aiAnalysis;
  const currentFingerprint = getRoomFingerprint(r);
  const cachedFingerprint = a?.fingerprint;
  const stale = !!(cachedFingerprint && cachedFingerprint !== currentFingerprint);
  const renderInline = (state, bodyHTML) => `<div class="light-env-room-ai light-env-room-ai-${escapeAttr(state)}">
    ${bodyHTML}
  </div>`;

  // Auto-fire on first render when the room has enough data to analyze
  // (a primarySource set OR at least one measurement) AND we don't have
  // a fresh cached verdict. Empty rooms skip auto-fire so the user doesn't
  // burn API calls on a freshly-added blank room they're still editing.
  const _hasData = !!(r.primarySource || _getMeasurementsForRoom(r.id).length);
  const _autoKey = `${r.id}:${currentFingerprint}`;
  if (_hasData && (status === 'idle' || stale) && !_autoFiredRoomKeys.has(_autoKey)) {
    _autoFiredRoomKeys.add(_autoKey);
    setTimeout(() => engine.analyze(r).catch(() => {}), 0);
  }

  // Shimmer ONLY while a request is genuinely in flight. Stale-ok used
  // to shimmer too, but that hid the ↻ button — leaving the user with
  // no way to retry while the auto-fire was queued/racing. Now stale-ok
  // falls through to the ok branch (with ↻); the auto-fire above
  // updates the verdict underneath when it resolves.
  if (status === 'analyzing') {
    return renderInline('loading', `
      <span class="sun-session-ai-dot sun-session-ai-dot-shimmer" aria-hidden="true"></span>
      <span class="light-env-room-ai-label">AI read</span>
      <span class="light-env-room-ai-tip">Checking this room…</span>`);
  }
  if (status === 'ok') {
    const dot = a.dot;
    return renderInline(dot, `
      <span class="sun-session-ai-dot sun-session-ai-dot-${escapeAttr(dot)}" aria-hidden="true"></span>
      <span class="light-env-room-ai-label">AI read</span>
      <span class="light-env-room-ai-tip"><span class="sun-session-ai-prefix" aria-hidden="true">${dotPrefix(dot)}</span> ${escapeHTML(a.tip || '')}</span>
      <button class="sun-session-ai-refresh light-env-room-ai-refresh" ${aiActionAttrs('refresh-room', r.id)} title="Re-run analysis" aria-label="Re-run AI analysis">↻</button>`);
  }
  if (status === 'error') {
    const msg = a?.errorMessage ? `Analysis failed — ${a.errorMessage}` : 'Analysis failed.';
    return renderInline('error', `
      <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
      <span class="light-env-room-ai-label">AI read</span>
      <span class="light-env-room-ai-tip">${escapeHTML(msg)}</span>
      <button class="sun-session-ai-refresh light-env-room-ai-refresh" ${aiActionAttrs('refresh-room', r.id)}>Try again</button>`);
  }
  return renderInline('idle', `
    <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
    <span class="light-env-room-ai-label">AI read</span>
    <span class="light-env-room-ai-tip">Circadian-friendliness check for this room.</span>
    <button class="sun-session-ai-refresh light-env-room-ai-refresh" ${aiActionAttrs('refresh-room', r.id)}>Analyze</button>`);
}
