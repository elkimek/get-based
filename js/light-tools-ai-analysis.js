// @ts-check
// light-tools-ai-analysis.js — per-measurement AI interpretation for the
// Light Tools (Lux Meter, Flicker Detector, Sleep Darkness, CCT Meter,
// Spectrum Classifier, Glass Transmission, Eye-Level Audit).
//
// Thin wrapper around ai-verdict-engine. All tools share state.importedData.
// lightMeasurements[] so this module owns one engine that branches on
// `m.tool` for per-tool prompt context.

import { state } from './state.js';
import { escapeHTML, escapeAttr } from './utils.js';
import { hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { createAIVerdict, hashString, dotPrefix } from './ai-verdict-engine.js';
import { LIGHTING_HARDWARE_CAVEATS } from './lighting-hardware-caveats.js';
import { formatHealthGoalsText } from './health-goals-utils.js';
import { aiActionAttrs, registerAIActionHandler } from './ai-action-delegates.js';

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
    'v2-measurement-quality',
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
  flicker: 'Rolling-shutter camera screen for visible banding; not a calibrated flicker meter',
  darkness: 'Qualitative low-light camera check or user-entered photopic lux-meter reading',
  cct: 'Approximate warm/cool camera estimate; not spectrum or melanopic EDI',
  spectrum: 'Qualitative camera RGB pattern and banding screen; not a spectrometer',
  'glass-transmission': 'Two-sample relative camera-visible comparison through a window',
  audit: 'Eye-level multi-room camera walkthrough for relative brightness; not lux',
};

function _buildLuxContext(m) {
  const cameraEstimate = m.extra?.source === 'camera-estimate';
  const lines = [
    'Tool: lux meter',
    cameraEstimate
      ? `Reading: ~${Math.round(m.value)} camera-estimated photopic lux; approximate and excluded from indoor scoring`
      : `Reading: ${Math.round(m.value)} photopic lux`,
  ];
  if (m.extra?.source) lines.push(`Sensor: ${m.extra.source}`);
  if (m.extra?.source === 'camera-estimate') lines.push(`Camera calibration confirmed: ${m.extra?.calibrationConfirmed === true ? 'yes' : 'no — do not threshold'}`);
  if (m.extra?.calibrationFactor && m.extra.calibrationFactor !== 1) {
    lines.push(`Calibration factor applied: ×${_formatNumber(m.extra.calibrationFactor, 2)}`);
  }
  return lines;
}

function _buildFlickerContext(m) {
  const lines = [`Tool: flicker detector`];
  const SCORE_LABELS = { 0: 'no rolling-shutter banding detected', 1: 'some banding', 2: 'clear banding', 3: 'strong banding' };
  const score = Math.round(m.value || 0);
  lines.push(`Flicker score: ${score}/3 — ${SCORE_LABELS[score] || 'unknown'}`);
  if (m.extra?.label) lines.push(`Tool's verdict: ${m.extra.label}`);
  if (m.extra?.peakBanding != null) lines.push(`Peak banding (intra-frame): ${_formatNumber(m.extra.peakBanding, 2)}`);
  if (m.extra?.stripes != null) lines.push(`Rolling-shutter stripe count: ${m.extra.stripes}`);
  if (m.extra?.frameRatio != null) lines.push(`Frame-luma variance: ${_formatNumber(m.extra.frameRatio, 3)}`);
  return lines;
}

function _buildDarknessContext(m) {
  const lines = [`Tool: sleep-light check`];
  if (m.extra?.method === 'meter-entry') {
    lines.push(`Meter entry: ${_formatNumber(m.value, 2)} photopic lux (not melanopic EDI)`);
  } else {
    lines.push(`Qualitative camera result: ${m.extra?.levelLabel || 'unknown'}`);
    lines.push(`Camera level: ${_formatNumber(m.extra?.cameraLevel ?? m.value, 0)}%; not lux and not a hormone estimate`);
  }
  return lines;
}

function _buildCCTContext(m) {
  const lines = [`Tool: camera warm/cool estimate`, `Approximate color temperature: ~${Math.round(m.value / 100) * 100} K`];
  const blueRatio = m.extra?.cameraBlueRatioProxy ?? m.extra?.melanopic;
  if (blueRatio != null) lines.push(`Camera RGB blue-ratio proxy (not melanopic EDI): ${_formatNumber(blueRatio, 2)}`);
  if (m.extra?.temperatureTone) lines.push(`Tone: ${m.extra.temperatureTone}`);
  if (m.extra?.bandingDetected || m.extra?.pwmActive) lines.push('Rolling-shutter banding detected during reading; frequency and modulation are unknown');
  return lines;
}

function _buildSpectrumContext(m) {
  const lines = [`Tool: spectrum classifier`, `Source classification: ${m.value || m.extra?.label || 'unknown'}`];
  if (m.extra?.reason) lines.push(`Tool's reasoning: ${m.extra.reason}`);
  const blueRatio = m.extra?.cameraBlueRatioProxy ?? m.extra?.melanopic;
  if (blueRatio != null) lines.push(`Camera RGB blue-ratio proxy (not melanopic EDI): ${_formatNumber(blueRatio, 2)}`);
  if (m.extra?.circadian) lines.push(`Circadian category: ${m.extra.circadian}`);
  if (m.extra?.r != null && m.extra?.g != null && m.extra?.b != null) {
    lines.push(`RGB ratios: R=${_formatNumber(m.extra.r, 2)} G=${_formatNumber(m.extra.g, 2)} B=${_formatNumber(m.extra.b, 2)}`);
  }
  return lines;
}

function _buildGlassContext(m) {
  const lines = [`Tool: two-sample camera window comparison`];
  const pct = Math.round((m.value || 0) * 100);
  lines.push(`Relative camera-visible response: about ${pct}%; not calibrated visible, UV, or IR transmission`);
  if (m.extra?.lockMode !== 'manual') lines.push('Camera auto-exposure was active; treat as qualitative only');
  return lines;
}

function _buildAuditContext(m) {
  const lines = [`Tool: eye-level audit (multi-room walkthrough)`, `Rooms detected: ${Math.round(m.value || 0)}`];
  const rooms = m.extra?.rooms;
  if (Array.isArray(rooms) && rooms.length) {
    for (const r of rooms.slice(0, 6)) {
      lines.push(`  - Room ${r.index}${r.label ? ' (' + r.label + ')' : ''}: ${r.levelLabel || 'relative'} camera brightness`);
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
  const goals = formatHealthGoalsText(state.importedData?.healthGoals);
  const sleep = state.importedData?.sleepRest;
  if (goals) lines.push(`User goals: ${String(goals).slice(0, 200)}`);
  if (sleep?.qualityScore != null) lines.push(`Sleep quality score: ${sleep.qualityScore}`);
  return lines.join('\n');
}

const SYSTEM_PROMPT = [
  'You interpret a single environmental light measurement (lux / flicker / sleep-darkness / CCT / spectrum / glass-transmission / multi-room audit).',
  'Return ONLY valid JSON with three keys: {"dot":"green|yellow|red|gray","tip":"string","detail":"string"}.',
  '',
  'Interpretation rules by tool type:',
  '',
  'lux: ordinary photopic lux is not melanopic EDI. Use sensor or meter-entry values as general brightness spot-checks. All camera estimates, including one-point-calibrated values, stay approximate, excluded from indoor scoring, and gray.',
  'flicker: score 0 means no camera banding detected, not flicker-free. Scores 1–3 indicate increasing banding strength; no frequency or health effect is measured.',
  'darkness: meter-entry photopic lux can flag visible sleep-time light but remains spectrum-blind. Camera-relative darkness results are qualitative and must never produce melatonin percentages, phase-shift claims, or lux thresholds.',
  'CCT: camera estimate is approximate and cannot establish spectral completeness or melanopic content. Time of day changes interpretation, but CCT alone never determines safety.',
  'spectrum: camera RGB is a warm/cool pattern, not a spectrometer. Never infer full spectrum, UV, infrared, or missing wavelengths.',
  'glass transmission: result is a two-sample camera-visible ratio. It cannot infer calibrated visible, UVA, UVB, or infrared transmission.',
  'audit (multi-room): look for room-to-room variation. Bedroom + living-room being near-identical lux suggests over-lit bedrooms or under-lit living spaces.',
  '',
  ...LIGHTING_HARDWARE_CAVEATS,
  '',
  'tip: one sentence, max 14 words. Reference specific number + concrete action when relevant.',
  'detail: 1–2 sentences. State measurement quality before interpretation. Never convert ordinary lux/CCT/RGB into melanopic dose, hormone suppression, or guaranteed sleep effects. If banding is flagged, honor the hardware caveats and never suggest a generic dimmer.',
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
  shouldAutoFire: (m) => !['audit', 'brightness-proxy'].includes(m?.tool),
  getAllTargets: getMeasurements,
  // Anchor the post-verdict rebuild to the row's room so the user
  // stays put when the verdict lands. Portable readings (no roomId)
  // have no specific anchor — let the auto-pick handle them.
  getScrollAnchor: (m) => m?.roomId ? `[data-id="${CSS.escape(String(m.roomId))}"]` : null,
});

export const analyzeMeasurementAI = engine.analyze;
export const refreshMeasurementAIAnalysis = engine.refresh;
registerAIActionHandler('refresh-measurement', refreshMeasurementAIAnalysis);
export const maybeAnalyzeMeasurementAfterSave = engine.maybeAfterFinish;

// ─── Render ────────────────────────────────────────────────────────────

export function renderMeasurementAIInline(m) {
  if (!m) return '';
  if (m.tool === 'audit') return ''; // aggregate row carries no per-tool verdict
  if (!hasAssistantFeatureProvider() && !(m.aiAnalysis?.status === 'ok' && m.aiAnalysis?.dot)) return '';
  const status = engine.getStatus(m);
  const a = m.aiAnalysis;
  const refreshBtn = `<button class="sun-session-ai-refresh" ${aiActionAttrs('refresh-measurement', m.id, { stopPropagation: true })} title="Re-run analysis" aria-label="Re-run AI analysis">↻</button>`;
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
    <button class="sun-session-ai-cta" ${aiActionAttrs('refresh-measurement', m.id, { stopPropagation: true })} title="Run an AI verdict on this measurement — flags significant issues and suggests fixes">Get AI verdict</button>
  </div>`;
}
