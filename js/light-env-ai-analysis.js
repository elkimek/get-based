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

function _getRooms() { return state.importedData?.lightEnvironment?.rooms || []; }
function _getMeasurementsForRoom(roomId) {
  return (state.importedData?.lightMeasurements || []).filter(m => m.roomId === roomId);
}
function _getScreensForRoom(roomId) {
  return (state.importedData?.lightEnvironment?.screens || []).filter(s => s.roomId === roomId);
}

export function getRoomFingerprint(r) {
  if (!r) return '';
  const measurements = _getMeasurementsForRoom(r.id);
  const screens = _getScreensForRoom(r.id);
  const parts = [
    r.name || '',
    r.primarySource || '',
    r.hoursOccupiedPerDay || 0,
    r.eveningHoursAfterSunset || (r.eveningUseAfterSunset ? 1 : 0),
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
  lines.push(`Name: ${r.name || '(unnamed)'}`);
  if (r.primarySource) lines.push(`Primary light source: ${_SOURCE_LABELS[r.primarySource] || r.primarySource}`);
  if (r.hoursOccupiedPerDay != null) lines.push(`Hours occupied per day: ${r.hoursOccupiedPerDay}`);
  const eveningHrs = r.eveningHoursAfterSunset != null
    ? Number(r.eveningHoursAfterSunset)
    : (r.eveningUseAfterSunset ? 2 : 0);
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
  '  • Sleep rooms: >1 lux during sleep meaningfully suppresses melatonin (Cho 2013, Burgess 2017). Cool-toned (>4000K) light within 2 hours of bedtime delays sleep onset. Phone in bed is the largest junk-light vector for most users.',
  '  • Daytime rooms: need >100 lux at the eye for SCN entrainment, ideally >1000 lux for alertness. <50 lux daytime is flat-out under-lit.',
  '  • Evening living spaces: warm (≤2700K) + dim (≤200 lux) is melatonin-friendly; bright cool overhead lights with TV blue light is not.',
  '  • Flicker score 2+ correlates with eyestrain + headaches in sensitive populations regardless of brightness.',
  '  • A high evening-hours-after-sunset count amplifies the cost of a hostile spectrum in that room — flag harder when the user spends multiple evening hours there.',
  '',
  'tip: one sentence, max 16 words. Pick the SINGLE most-leveraged fix, with concrete action language.',
  'detail: 2–3 sentences. List up to 2 specific issues + the corresponding biology, then the highest-priority fix.',
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

export const isRoomAnalyzing = engine.isAnalyzing;
export const analyzeRoomAI = engine.analyze;
export const refreshRoomAIAnalysis = engine.refresh;

// ─── Render ────────────────────────────────────────────────────────────

export function renderRoomAIBlock(r) {
  if (!hasAIProvider() || !r) return '';
  const status = engine.getStatus(r);
  const a = r.aiAnalysis;
  const head = `<div class="light-env-room-step-head"><span class="light-env-room-step-num">⚡</span> AI verdict</div>`;
  if (status === 'analyzing') {
    return `<div class="light-env-room-step light-env-room-ai">
      ${head}
      <div class="light-env-room-step-body">
        <div class="sun-detail-ai sun-detail-ai-loading">
          <span class="sun-session-ai-dot sun-session-ai-dot-shimmer" aria-hidden="true"></span>
          <span>Analyzing this room…</span>
        </div>
      </div>
    </div>`;
  }
  if (status === 'ok') {
    const dot = a.dot;
    return `<div class="light-env-room-step light-env-room-ai">
      ${head}
      <div class="light-env-room-step-body">
        <div class="sun-detail-ai sun-detail-ai-${escapeAttr(dot)}">
          <div class="sun-detail-ai-head">
            <span class="sun-session-ai-dot sun-session-ai-dot-${escapeAttr(dot)}" aria-hidden="true"></span>
            <span class="sun-detail-ai-tip"><span class="sun-session-ai-prefix" aria-hidden="true">${dotPrefix(dot)}</span> ${escapeHTML(a.tip || '')}</span>
            <button class="sun-session-ai-refresh" onclick="window.refreshRoomAIAnalysis('${escapeAttr(r.id)}')" title="Re-run analysis" aria-label="Re-run AI analysis">↻</button>
          </div>
          ${a.detail ? `<div class="sun-detail-ai-body">${escapeHTML(a.detail)}</div>` : ''}
        </div>
      </div>
    </div>`;
  }
  if (status === 'error') {
    const msg = a?.errorMessage ? `Analysis failed — ${a.errorMessage}` : 'Analysis failed.';
    return `<div class="light-env-room-step light-env-room-ai">
      ${head}
      <div class="light-env-room-step-body">
        <div class="sun-detail-ai sun-detail-ai-error">
          <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
          <span>${escapeHTML(msg)}</span>
          <button class="sun-session-ai-refresh" onclick="window.refreshRoomAIAnalysis('${escapeAttr(r.id)}')">Try again</button>
        </div>
      </div>
    </div>`;
  }
  return `<div class="light-env-room-step light-env-room-ai">
    ${head}
    <div class="light-env-room-step-body">
      <div class="sun-detail-ai sun-detail-ai-idle">
        <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
        <span>Get a circadian-friendliness verdict for this room.</span>
        <button class="sun-session-ai-refresh" onclick="window.refreshRoomAIAnalysis('${escapeAttr(r.id)}')">Analyze room</button>
      </div>
    </div>
  </div>`;
}

Object.assign(window, {
  refreshRoomAIAnalysis,
  analyzeRoomAI,
  renderRoomAIBlock,
});
