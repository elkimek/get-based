// light-tools-ai-analysis.js — per-measurement AI interpretation for the
// Light Tools (Lux Meter, Flicker Detector, Sleep Darkness, CCT Meter,
// Spectrum Classifier, Glass Transmission, Eye-Level Audit).
//
// Thin wrapper around ai-verdict-engine. All tools share state.importedData.
// lightMeasurements[] so this module owns one engine that branches on
// `m.tool` for per-tool prompt context.

import { state } from './state.js';
import { escapeHTML, escapeAttr } from './utils.js';
import { hasAIProvider } from './api.js';
import { createAIVerdict, hashString, dotPrefix } from './ai-verdict-engine.js';
import { LIGHTING_HARDWARE_CAVEATS } from './lighting-hardware-caveats.js';

function _formatNumber(n, digits = 1) {
  if (n == null || !Number.isFinite(n)) return '—';
  return Number(n).toFixed(digits).replace(/\.0$/, '');
}

function getMeasurements() {
  if (!state.importedData) return [];
  if (!Array.isArray(state.importedData.lightMeasurements)) state.importedData.lightMeasurements = [];
  return state.importedData.lightMeasurements;
}

function getRoomNameFor(m) {
  if (!m?.roomId) return null;
  const rooms = state.importedData?.lightEnvironment?.rooms || [];
  return rooms.find(r => r.id === m.roomId)?.name || null;
}

export function getMeasurementFingerprint(m) {
  if (!m) return '';
  const parts = [
    m.tool || '',
    typeof m.value === 'number' ? Math.round(m.value * 1000) / 1000 : String(m.value || ''),
    m.roomId || '',
    Math.round((m.confidence || 0) * 100),
  ];
  if (m.extra && typeof m.extra === 'object') {
    for (const k of Object.keys(m.extra).sort()) {
      const v = m.extra[k];
      if (typeof v === 'number') parts.push(`${k}:${Math.round(v * 1000) / 1000}`);
      else if (typeof v === 'string' || typeof v === 'boolean') parts.push(`${k}:${v}`);
    }
  }
  return hashString(parts.join('|'));
}

const _TOOL_DESCRIPTIONS = {
  lux: 'Illuminance reading (general light level at the user\'s position)',
  flicker: 'PWM / mains-flicker scan (5 s) — looking for invisible-but-eyestrain pulses',
  darkness: 'Sleep-darkness long-exposure measurement (30 s mean, peak)',
  cct: 'Correlated color temperature (Kelvin) — warmth vs coolness of the source',
  spectrum: 'Spectrum classifier — categorizes the light source by RGB + flicker profile',
  'glass-transmission': 'Glass transmission ratio — how much visible light passes through a window',
  audit: 'Eye-level audit — multi-room walkthrough lux snapshot',
};

function _buildLuxContext(m) {
  const lines = [`Tool: lux meter`, `Reading: ${Math.round(m.value)} lux`];
  if (m.extra?.source) lines.push(`Sensor: ${m.extra.source}`);
  if (m.extra?.calibrationFactor && m.extra.calibrationFactor !== 1) {
    lines.push(`Calibration factor applied: ×${_formatNumber(m.extra.calibrationFactor, 2)}`);
  }
  return lines;
}

function _buildFlickerContext(m) {
  const lines = [`Tool: flicker detector`];
  const SCORE_LABELS = { 0: 'pristine (no detectable flicker)', 1: 'mild', 2: 'moderate', 3: 'severe' };
  const score = Math.round(m.value || 0);
  lines.push(`Flicker score: ${score}/3 — ${SCORE_LABELS[score] || 'unknown'}`);
  if (m.extra?.label) lines.push(`Tool's verdict: ${m.extra.label}`);
  if (m.extra?.peakBanding != null) lines.push(`Peak banding (intra-frame): ${_formatNumber(m.extra.peakBanding, 2)}`);
  if (m.extra?.stripes != null) lines.push(`PWM stripe count: ${m.extra.stripes}`);
  if (m.extra?.frameRatio != null) lines.push(`Frame-luma variance: ${_formatNumber(m.extra.frameRatio, 3)}`);
  return lines;
}

function _buildDarknessContext(m) {
  const lines = [`Tool: sleep-darkness meter (30 s long exposure)`];
  lines.push(`Mean lux: ${_formatNumber(m.extra?.meanLux ?? m.value, 2)}`);
  if (m.extra?.peakLux != null) lines.push(`Peak lux (95th-percentile spike): ${_formatNumber(m.extra.peakLux, 2)}`);
  if (m.extra?.label) lines.push(`Classifier: ${m.extra.label}`);
  if (m.extra?.isoLocked) lines.push('Camera ISO was locked (higher confidence)');
  return lines;
}

function _buildCCTContext(m) {
  const lines = [`Tool: CCT meter`, `Color temperature: ${Math.round(m.value)} K`];
  if (m.extra?.melanopic != null) lines.push(`Melanopic ratio (B/(R+G+B)): ${_formatNumber(m.extra.melanopic, 2)}`);
  if (m.extra?.temperatureTone) lines.push(`Tone: ${m.extra.temperatureTone}`);
  if (m.extra?.pwmActive) lines.push('PWM dimming detected during reading');
  return lines;
}

function _buildSpectrumContext(m) {
  const lines = [`Tool: spectrum classifier`, `Source classification: ${m.value || m.extra?.label || 'unknown'}`];
  if (m.extra?.reason) lines.push(`Tool's reasoning: ${m.extra.reason}`);
  if (m.extra?.melanopic != null) lines.push(`Melanopic ratio: ${_formatNumber(m.extra.melanopic, 2)}`);
  if (m.extra?.circadian) lines.push(`Circadian category: ${m.extra.circadian}`);
  if (m.extra?.r != null && m.extra?.g != null && m.extra?.b != null) {
    lines.push(`RGB ratios: R=${_formatNumber(m.extra.r, 2)} G=${_formatNumber(m.extra.g, 2)} B=${_formatNumber(m.extra.b, 2)}`);
  }
  return lines;
}

function _buildGlassContext(m) {
  const lines = [`Tool: glass transmission test`];
  const pct = Math.round((m.value || 0) * 100);
  lines.push(`Transmission ratio: ${pct}% (${pct}% of outdoor light reaches inside)`);
  if (m.extra?.outside != null) lines.push(`Outdoor lux: ${Math.round(m.extra.outside)}`);
  if (m.extra?.inside != null) lines.push(`Indoor (through-glass) lux: ${Math.round(m.extra.inside)}`);
  if (m.extra?.lockMode === 'manual') lines.push('Camera exposure manually locked (higher confidence)');
  return lines;
}

function _buildAuditContext(m) {
  const lines = [`Tool: eye-level audit (multi-room walkthrough)`, `Rooms detected: ${Math.round(m.value || 0)}`];
  const rooms = m.extra?.rooms;
  if (Array.isArray(rooms) && rooms.length) {
    for (const r of rooms.slice(0, 6)) {
      lines.push(`  - Room ${r.index}${r.label ? ' (' + r.label + ')' : ''}: ${Math.round(r.lux || 0)} lux`);
    }
  }
  return lines;
}

function _buildPerToolContext(m) {
  switch (m.tool) {
    case 'lux': return _buildLuxContext(m);
    case 'flicker': return _buildFlickerContext(m);
    case 'darkness': return _buildDarknessContext(m);
    case 'cct': return _buildCCTContext(m);
    case 'spectrum': return _buildSpectrumContext(m);
    case 'glass-transmission': return _buildGlassContext(m);
    case 'audit': return _buildAuditContext(m);
    default: return [`Tool: ${m.tool || 'unknown'}`, `Value: ${m.value}`];
  }
}

export function buildMeasurementContext(m) {
  if (!m) return '';
  const lines = ['### Measurement', ...(_buildPerToolContext(m))];
  const desc = _TOOL_DESCRIPTIONS[m.tool];
  if (desc) lines.push(`Tool description: ${desc}`);
  lines.push(`Confidence: ${Math.round((m.confidence || 0.7) * 100)}%`);
  if (m.capturedAt) {
    const d = new Date(m.capturedAt);
    const hour = d.getHours();
    const timeOfDay = hour < 6 ? 'pre-dawn' :
      hour < 9 ? 'morning' :
      hour < 17 ? 'daytime' :
      hour < 20 ? 'evening' :
      hour < 23 ? 'night' : 'late night';
    lines.push(`Captured: ${d.toLocaleString()} (${timeOfDay})`);
  }
  const room = getRoomNameFor(m);
  // Bound user-supplied room name to prevent prompt-injection.
  if (room) lines.push(`Room: ${String(room).replace(/\s+/g, ' ').trim().slice(0, 80)}`);
  const goals = state.importedData?.healthGoals?.goals || '';
  const sleep = state.importedData?.sleepRest;
  if (goals) lines.push(`User goals: ${String(goals).slice(0, 200)}`);
  if (sleep?.qualityScore != null) lines.push(`Sleep quality score: ${sleep.qualityScore}`);
  return lines.join('\n');
}

const SYSTEM_PROMPT = [
  'You interpret a single environmental light measurement (lux / flicker / sleep-darkness / CCT / spectrum / glass-transmission / multi-room audit).',
  'Return ONLY valid JSON with three keys: {"dot":"green|yellow|red|gray","tip":"string","detail":"string"}.',
  '',
  'Color thresholds by tool type:',
  '',
  'lux: <50 lux daytime → red (sub-circadian); 50–500 lux daytime → yellow; 500+ lux daytime → green. Evening/night flips: anything >5 lux post-sunset trends yellow→red for melatonin onset; <1 lux green.',
  'flicker: 0 → green; 1 → yellow; 2 → yellow→red; 3 → red.',
  'darkness (sleep room, captured at night): <0.1 lux → green; 0.1–1 lux → yellow; 1–10 lux → red (clinically significant melatonin suppression); >10 lux → red.',
  'CCT: warm (1800–2700 K) → green for evening, yellow daytime; cool (4000+ K) → green daytime, red evening. PWM-active flag → yellow regardless.',
  'spectrum: incandescent / halogen / full-spectrum LED → green; warm LED with PWM, fluorescent → yellow; cool LED in evening → red.',
  'glass transmission: standard window blocks ~98% UVB, transmits ~70-85% UVA + visible. Note that no UVB passes through standard glass even at 90% visible transmission.',
  'audit (multi-room): look for room-to-room variation. Bedroom + living-room being near-identical lux suggests over-lit bedrooms or under-lit living spaces.',
  '',
  ...LIGHTING_HARDWARE_CAVEATS,
  '',
  'tip: one sentence, max 14 words. Reference specific number + concrete action when relevant.',
  'detail: 1–2 sentences. Cite the threshold or biology that drove the verdict. No restating the data verbatim. If the measurement flags flicker (score 1+) or PWM, the recommendation MUST honor the hardware caveats above — never suggest a generic "dimmable LED" or "dim it" as a fix.',
  '',
  'No "you should" — be observational. No emoji.',
].join('\n');

const engine = createAIVerdict({
  getTarget: (id) => getMeasurements().find(m => m.id === id),
  getId: (m) => m?.id,
  getAIAnalysis: (m) => m?.aiAnalysis || null,
  setAIAnalysis: (m, v) => { if (v == null) delete m.aiAnalysis; else m.aiAnalysis = v; },
  getFingerprint: getMeasurementFingerprint,
  buildContext: buildMeasurementContext,
  systemPrompt: SYSTEM_PROMPT,
  maxTokens: 350,
  // Skip the audit aggregate row — its per-room lux entries get analyzed
  // on their own (saveMeasurement fires once per pause).
  shouldAutoFire: (m) => m?.tool !== 'audit',
  getAllTargets: getMeasurements,
});

export const analyzeMeasurementAI = engine.analyze;
export const refreshMeasurementAIAnalysis = engine.refresh;
export const maybeAnalyzeMeasurementAfterSave = engine.maybeAfterFinish;

// ─── Render ────────────────────────────────────────────────────────────

export function renderMeasurementAIInline(m) {
  if (!m) return '';
  if (m.tool === 'audit') return ''; // aggregate row carries no per-tool verdict
  if (!hasAIProvider() && !(m.aiAnalysis?.status === 'ok' && m.aiAnalysis?.dot)) return '';
  const status = engine.getStatus(m);
  const a = m.aiAnalysis;
  const refreshBtn = `<button class="sun-session-ai-refresh" onclick="event.stopPropagation();window.refreshMeasurementAIAnalysis('${escapeAttr(m.id)}')" title="Re-run analysis" aria-label="Re-run AI analysis">↻</button>`;
  if (status === 'analyzing') {
    return `<div class="light-env-reading-ai">
      <span class="sun-session-ai-dot sun-session-ai-dot-shimmer" aria-hidden="true"></span>
      <span class="sun-session-ai-tip">Analyzing…</span>
    </div>`;
  }
  if (status === 'ok') {
    const dot = a.dot;
    return `<div class="light-env-reading-ai" title="${escapeAttr(a.detail || '')}">
      <span class="sun-session-ai-dot sun-session-ai-dot-${escapeAttr(dot)}" aria-hidden="true"></span>
      <span class="sun-session-ai-tip sun-session-ai-tip-${escapeAttr(dot)}"><span class="sun-session-ai-prefix" aria-hidden="true">${dotPrefix(dot)}</span> ${escapeHTML(a.tip || '')}</span>
      ${refreshBtn}
    </div>`;
  }
  if (status === 'error') {
    return `<div class="light-env-reading-ai sun-session-ai-error">
      <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
      <span class="sun-session-ai-tip">Analysis failed</span>
      ${refreshBtn}
    </div>`;
  }
  return `<div class="light-env-reading-ai sun-session-ai-idle">
    <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
    <button class="sun-session-ai-cta" onclick="event.stopPropagation();window.refreshMeasurementAIAnalysis('${escapeAttr(m.id)}')" title="Run an AI verdict on this measurement — flags significant issues and suggests fixes">Get AI verdict</button>
  </div>`;
}

Object.assign(window, {
  refreshMeasurementAIAnalysis,
  analyzeMeasurementAI,
  renderMeasurementAIInline,
  maybeAnalyzeMeasurementAfterSave,
});
