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
const _roomFingerprintSalt = 'v2-brown2022-medi';
export function getRoomFingerprint(r) {
  if (!r) return '';
  const measurements = _getMeasurementsForRoom(r.id);
  const screens = _getScreensForRoom(r.id);
  const parts = [
    _roomFingerprintSalt,
    r.name || '',
    r.primarySource || '',
    r.hoursOccupiedPerDay || 0,
    getRoomEveningHoursAfterSunset(r),
  ];
  const byTool = new Map();
  for (const m of measurements.sort((a, b) => b.capturedAt - a.capturedAt)) {
    if (!byTool.has(m.tool)) byTool.set(m.tool, m);
  }
  for (const [tool, m] of [...byTool.entries()].sort()) {
    parts.push(`${tool}:${typeof m.value === 'number' ? Math.round(m.value * 100) / 100 : m.value}`);
  }
  parts.push(`screens:${screens.map(s => s.type).sort().join(',')}`);
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
          lines.push(`Lux: ${Math.round(m.value)} lux`);
          break;
        case 'flicker': {
          const score = Math.round(m.value || 0);
          const sLabel = ['pristine', 'mild', 'moderate', 'severe'][score] || 'unknown';
          lines.push(`Flicker: ${score}/3 (${sLabel})${m.extra?.stripes ? `, ${m.extra.stripes} PWM stripes` : ''}`);
          break;
        }
        case 'darkness':
          lines.push(`Sleep darkness: mean ${_formatNumber(m.extra?.meanLux ?? m.value, 2)} lux, peak ${_formatNumber(m.extra?.peakLux, 2)} lux${m.extra?.label ? ' (' + m.extra.label + ')' : ''}`);
          break;
        case 'cct':
          lines.push(`CCT: ${Math.round(m.value)} K${m.extra?.melanopic != null ? `, melanopic ratio ${_formatNumber(m.extra.melanopic, 2)}` : ''}${m.extra?.pwmActive ? ', PWM detected' : ''}`);
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
      const t = _SCREEN_TYPE_LABELS[s.type] || s.type;
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
    for (const [t, n] of Object.entries(typeCounts)) {
      lines.push(`  - ${n}× ${t}`);
    }
  }

  const sleepRest = state.importedData?.sleepRest;
  const goals = state.importedData?.healthGoals?.goals || '';
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
  '  green = circadian-aligned (daytime rooms get bright + cool-toned light, evening rooms stay dim + warm-toned, sleep rooms are dark + flicker-free)',
  '  yellow = mostly OK with one or two specific issues (one too-cool fixture in evening, modest flicker, sleep room not dark enough)',
  '  red = circadian-hostile (bright cool light in evening, severe flicker, bright sleep room, phone-in-bed unmitigated)',
  '  gray = not enough data to judge (room has only a name)',
  '',
  'Biology priors:',
  '  • Sleep rooms: per Brown TM 2022 (PLOS Biol 20:e3001571) the modern melanopic-EDI consensus is <1 melanopic lux during sleep, <10 in the hour before bed. Even ~40 photopic lux from a bedside lamp or TV measurably impairs sleep architecture (Cho 2013, Sleep Med 14:1422). Cool-toned (>4000K) light within 2 hours of bedtime delays sleep onset; phone in bed is the largest junk-light vector for most users.',
  '  • Daytime rooms: per Brown 2022, target ≥250 melanopic-EDI lux at the eye during the day. With typical mixed-spectrum indoor lighting that\'s roughly ≥500 photopic lux; bright daylit / north-window setups hit it more easily. Below ~50 photopic lux for hours at a stretch is flat-out under-lit regardless of source.',
  '  • Evening living spaces: warm (≤2700K) + dim (≤200 lux) is melatonin-friendly; bright cool overhead lights with TV blue light is not.',
  '  • Flicker score 2+ correlates with eyestrain + headaches in sensitive populations regardless of brightness.',
  '  • A high evening-hours-after-sunset count amplifies the cost of a hostile spectrum in that room — flag harder when the user spends multiple evening hours there.',
  '',
  ...LIGHTING_HARDWARE_CAVEATS,
  '',
  'tip: one sentence, max 16 words. Pick the SINGLE most-leveraged fix, with concrete action language.',
  'detail: 2–3 sentences. List up to 2 specific issues + the corresponding biology, then the highest-priority fix. If the room\'s flicker score is 1+, the recommendation MUST NOT introduce a dimmer; cite the hardware caveats above.',
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
      <button class="sun-session-ai-refresh light-env-room-ai-refresh" onclick="window.refreshRoomAIAnalysis('${escapeAttr(r.id)}')" title="Re-run analysis" aria-label="Re-run AI analysis">↻</button>`);
  }
  if (status === 'error') {
    const msg = a?.errorMessage ? `Analysis failed — ${a.errorMessage}` : 'Analysis failed.';
    return renderInline('error', `
      <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
      <span class="light-env-room-ai-label">AI read</span>
      <span class="light-env-room-ai-tip">${escapeHTML(msg)}</span>
      <button class="sun-session-ai-refresh light-env-room-ai-refresh" onclick="window.refreshRoomAIAnalysis('${escapeAttr(r.id)}')">Try again</button>`);
  }
  return renderInline('idle', `
    <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
    <span class="light-env-room-ai-label">AI read</span>
    <span class="light-env-room-ai-tip">Circadian-friendliness check for this room.</span>
    <button class="sun-session-ai-refresh light-env-room-ai-refresh" onclick="window.refreshRoomAIAnalysis('${escapeAttr(r.id)}')">Analyze</button>`);
}

Object.assign(window, {
  refreshRoomAIAnalysis,
  analyzeRoomAI,
  renderRoomAIBlock,
});
