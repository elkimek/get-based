// @ts-check
// sun-ai-analysis.js — per-session AI verdict + tip for sun sessions.
//
// Thin wrapper around ai-verdict-engine: supplies the sun-specific
// fingerprint, prompt context (with solar phase + dose formatting), and
// system prompt. The engine owns the analyze loop, in-flight tracker,
// 60s watchdog, and orphan purge.
//
// Output is stored on the session itself (sess.aiAnalysis) so it syncs
// naturally via the per-row CRDT and the row template can read it
// without a side-channel cache.

import { escapeHTML, escapeAttr } from './utils.js';
import { hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { getSunDefaults } from './sun-defaults.js';
import { getSessions, formatChannelUnit, CHANNEL_DISPLAY } from './sun.js';
import { solarZenithAngle } from './sun-uvdata.js';
import { createAIVerdict, hashString, dotPrefix } from './ai-verdict-engine.js';
import { aiActionAttrs, registerAIActionHandler } from './ai-action-delegates.js';

// ─── Fingerprint ───────────────────────────────────────────────────────
//
// Hash of the session fields that, when changed, should invalidate a
// previously-cached analysis. Timing and location are biological inputs here,
// not cosmetic metadata: together they determine solar elevation and phase.
function getSessionFingerprint(sess) {
  if (!sess) return '';
  const parts = [
    sess.startedAt || 0,
    sess.endedAt || 0,
    Math.round((sess.durationMin || 0) * 10) / 10,
    sess.bodyExposure?.preset || '',
    Math.round((sess.bodyExposure?.fraction || 0) * 100),
    sess.bodyExposure?.glassBetween ? 1 : 0,
    sess.bodyExposure?.sunscreenSPF || 0,
    sess.bodyExposure?.rotatedSides ? 1 : 0,
    sess.eyeExposure?.mode || '',
    sess.eyeExposure?.lensTint || '',
    Math.round((sess.eyeExposure?.durationSec || 0) / 30),
    sess.posture || '',
    sess.surfaceAlbedo || '',
    sess.location?.lat != null ? Math.round(sess.location.lat * 10000) : '',
    sess.location?.lon != null ? Math.round(sess.location.lon * 10000) : '',
    sess.atmosphere?.uvIndex != null ? Math.round(sess.atmosphere.uvIndex * 10) : '',
    sess.atmosphere?.cloudCover != null ? Math.round(sess.atmosphere.cloudCover) : '',
    sess.atmosphere?.ozoneDU != null ? Math.round(sess.atmosphere.ozoneDU) : '',
    sess.atmosphere?.source || '',
    sess.safety?.fitzpatrick || '',
    Math.round((sess.safety?.medFraction || 0) * 100),
    sess.safety?.fitzpatrickAssumed ? 1 : 0,
    sess.safety?.medicationThresholdUnknown ? 1 : 0,
    sess.safety?.ocularActinicUV != null ? Math.round(sess.safety.ocularActinicUV * 10) : '',
    sess.calculationStatus || '',
  ];
  if (sess.doses) {
    for (const k of Object.keys(sess.doses).sort()) {
      parts.push(k + ':' + Math.round((sess.doses[k] || 0) * 10) / 10);
    }
  }
  return hashString(parts.join('|'));
}
export { getSessionFingerprint };

// ─── Solar-phase classifier ────────────────────────────────────────────

function _formatNumber(n, digits = 1) {
  if (n == null || !Number.isFinite(n)) return '—';
  return Number(n).toFixed(digits).replace(/\.0$/, '');
}

function _localDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Tells the AI what part of the solar cycle the session covered.
// Sunrise + the non-UVA → UVA transition have specific biology that
// midday sessions don't, and the model needs that signal explicitly
// labelled — without it, low-dose sunrise sessions get judged on
// vitamin-D yield (which is correctly zero) and miss the actual benefit
// (melatonin clearance, NO release, cortisol awakening).
function _classifySolarPhase(startElev, endElev) {
  if (startElev == null || endElev == null) return null;
  const rising = endElev > startElev;
  const lo = Math.min(startElev, endElev);
  const hi = Math.max(startElev, endElev);
  if (lo < 0 && hi > 0) return rising
    ? 'civil dawn — sun crossed horizon mid-session (non-UVA → UVA onset)'
    : 'civil dusk — sun set mid-session (UVA fadeout)';
  if (lo < 3 && hi > 3) return rising
    ? 'sunrise window — solar elevation crossed the UVA-onset threshold (~3°) mid-session'
    : 'sunset window — solar elevation dropped below the UVA threshold (~3°) mid-session';
  if (lo < 10 && hi > 10) return rising
    ? 'post-sunrise — solar elevation crossed the UVB-onset threshold (~10°) mid-session'
    : 'pre-sunset — solar elevation dropped below the UVB threshold (~10°) mid-session';
  if (hi < 0) return 'pre-dawn / post-dusk — sun below horizon (no direct sunlight)';
  if (hi < 3) return rising ? 'twilight before sunrise' : 'twilight after sunset';
  if (hi < 10) return rising ? 'low morning sun (UVA-dominant, UVB minimal)' : 'low evening sun (UVA-dominant, UVB minimal)';
  if (hi < 30) return rising ? 'morning, sun climbing' : 'afternoon, sun descending';
  if (hi < 60) return rising ? 'late morning, high-angle sun' : 'early afternoon, high-angle sun';
  return 'midday peak (near-zenith sun)';
}

export function buildSingleSessionContext(sess) {
  if (!sess) return '';
  const sd = getSunDefaults() || {};
  const lines = [];

  lines.push('### Session');
  const start = new Date(sess.startedAt || Date.now());
  const end = sess.endedAt ? new Date(sess.endedAt) : null;
  lines.push(`Local date: ${_localDateKey(start)}`);
  lines.push(`Time: ${start.toTimeString().slice(0, 5)}${end ? '–' + end.toTimeString().slice(0, 5) : ' (in progress)'}`);
  lines.push(`Duration: ${_formatNumber(sess.durationMin)} min`);

  const fraction = sess.bodyExposure?.fraction || 0;
  lines.push(`Body exposure: ${Math.round(fraction * 100)}% (preset: ${sess.bodyExposure?.preset || 'unset'}${sess.bodyExposure?.rotatedSides ? ', rotated front/back' : ''})`);
  if (sess.bodyExposure?.glassBetween) lines.push('Through glass: yes (UVB ~0)');
  if (sess.bodyExposure?.sunscreenSPF) lines.push(`Sunscreen: SPF ${sess.bodyExposure.sunscreenSPF}`);
  lines.push(`Eyes: ${sess.eyeExposure?.mode || 'unset'}${sess.eyeExposure?.lensTint && sess.eyeExposure.lensTint !== 'clear' ? ', ' + sess.eyeExposure.lensTint + ' lens' : ''}`);

  if (sess.atmosphere) {
    lines.push(`UV index: ${_formatNumber(sess.atmosphere.uvIndex)}, cloud: ${sess.atmosphere.cloudCover != null ? Math.round(sess.atmosphere.cloudCover) + '%' : '—'}, ozone: ${sess.atmosphere.ozoneDU ? Math.round(sess.atmosphere.ozoneDU) + ' DU' : '300 (default)'}`);
  }

  // Solar geometry
  if (end && sess.location) {
    try {
      const zStart = solarZenithAngle(start, sess.location.lat, sess.location.lon);
      const zEnd = solarZenithAngle(end, sess.location.lat, sess.location.lon);
      const elevStart = 90 - zStart;
      const elevEnd = 90 - zEnd;
      lines.push(`Solar elevation: ${elevStart.toFixed(1)}° at start → ${elevEnd.toFixed(1)}° at end`);
      const phase = _classifySolarPhase(elevStart, elevEnd);
      if (phase) lines.push(`Solar phase: ${phase}`);
    } catch (_) {}
  }

  if (sess.doses) {
    let zenith = null;
    try {
      if (sess.startedAt && sess.endedAt && sess.location) {
        const mid = new Date((sess.startedAt + sess.endedAt) / 2);
        zenith = solarZenithAngle(mid, sess.location.lat, sess.location.lon);
      }
    } catch (_) {}
    const fitz = sess.safety?.fitzpatrick || sd.fitzpatrick || 'III';
    const uvi = sess.atmosphere?.uvIndex ?? null;
    const dur = sess.durationMin || 0;
    const rotated = !!sess.bodyExposure?.rotatedSides;
    const parts = [];
    const channelOrder = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye'];
    for (const k of channelOrder) {
      const v = sess.doses?.[k];
      if (v == null || v === 0) continue;
      const meta = CHANNEL_DISPLAY[k] || { label: k };
      let display = formatChannelUnit(k, v, dur, fitz, uvi, zenith, rotated, sess.bodyExposure?.fraction || null);
      if (!display) display = 'sunlight signal logged';
      parts.push(`${meta.label || k}: ${display}`);
    }
    if (parts.length) lines.push('Modeled light signals:');
    for (const p of parts) lines.push('  - ' + p);
  }

  if (sess.safety) {
    lines.push(`Modeled burn dose: ${Math.round((sess.safety.medFraction || 0) * 100)}% of Fitzpatrick ${sess.safety.fitzpatrick || sd.fitzpatrick || 'I'} base MED (not a personal threshold; sunscreen not credited as extra safe time)`);
    if (sess.safety.fitzpatrickAssumed) lines.push('Skin type status: conservative Fitzpatrick I assumption was used because skin type was unset.');
    if (sess.safety.medicationThresholdUnknown) lines.push('Medication photosensitivity: caution flag only; no numeric threshold adjustment was invented.');
  }

  return lines.join('\n');
}

// ─── System prompt ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = [
  'You evaluate a single sun/light exposure session for a user tracking their own biology.',
  'Return ONLY valid JSON with three keys: {"dot":"green|yellow|red|gray","tip":"string","detail":"string"}.',
  '',
  'dot:',
  '  green = the record is complete and no deterministic warning is present; describe the strongest modeled signals without calling the exposure sufficient, beneficial, or medically safe',
  '  yellow = a recorded caution or material uncertainty is present (for example near-MED, assumed skin type, medication photosensitivity, or incomplete exposure context); low channel output alone is not a problem',
  '  red = the supplied deterministic data records base MED reached or exceeded; never invent an ocular limit or other threshold that is not supplied',
  '  gray = not enough info (no doses computed, no weather, no body or eye data)',
  '',
  'Solar phase matters. Different parts of the solar cycle carry distinct biology:',
  '  • sunrise / civil dawn: retain the blue/violet circadian and UVA/NO wellness hypotheses, but discuss ambient open-sky light only. Never recommend direct solar gaze at any elevation.',
  '  • sunset / civil dusk: timing context may support evening phase signaling; describe fading UVA/UVB without claiming an endocrine outcome.',
  '  • midday near-zenith: peak UVB → vitamin D, peak burn risk, weakest circadian phase signal.',
  '',
  'When "Solar phase" flags sunrise/sunset or twilight, address the timing signal even when UV-weighted channels are small. Treat modeled channels as wellness hypotheses, not proof of an endocrine outcome. Low vitamin-D-effective UV is expected at low solar elevation and is not a reason to extend exposure. Never recommend looking at the sun.',
  '',
  'tip: one sentence, max 14 words. Reference specific numbers + the solar phase when relevant. Direct, no preamble.',
  'detail: 1–2 sentences. Explain the why, naming the specific dose / MED% / channel / solar phase that drove the verdict. No restating the data verbatim.',
  '',
  'No "you should" — be observational. No emoji.',
].join('\n');

// ─── Engine ────────────────────────────────────────────────────────────

const engine = createAIVerdict({
  getTarget: (id) => getSessions().find(s => s.id === id),
  getId: (s) => s?.id,
  getAIAnalysis: (s) => s?.aiAnalysis || null,
  setAIAnalysis: (s, v) => { if (v == null) delete s.aiAnalysis; else s.aiAnalysis = v; },
  getFingerprint: getSessionFingerprint,
  buildContext: buildSingleSessionContext,
  systemPrompt: SYSTEM_PROMPT,
  maxTokens: 400,
  canAnalyze: (s) => !!s?.endedAt && !!s?.doses && !!s?.safety && (!s.calculationStatus || s.calculationStatus === 'computed'),
  // Session interpretation is intentionally on-demand in the detail dialog.
  // Today and Weekly Review already provide automatic synthesis; auto-firing
  // here would duplicate them for every saved row.
  shouldAutoFire: () => false,
  getAllTargets: getSessions,
});

export const analyzeSunSessionAI = engine.analyze;
export const refreshSessionAIAnalysis = engine.refresh;
registerAIActionHandler('refresh-sun-session', refreshSessionAIAnalysis);
export const maybeAnalyzeSessionAfterFinish = engine.maybeAfterFinish;

// ─── Render helpers ────────────────────────────────────────────────────

function _hasCompleteModeledSession(sess) {
  return !!sess?.endedAt
    && !!sess?.doses
    && !!sess?.safety
    && (!sess.calculationStatus || sess.calculationStatus === 'computed');
}

export function renderSessionAIInline(sess) {
  if (!_hasCompleteModeledSession(sess)) return '';
  // Render cached verdict even when no provider — pre-populated demos +
  // cross-device-synced verdicts shouldn't disappear just because the
  // current device hasn't configured an AI key. Provider-gate only the
  // fresh-analyze paths (engine.analyze checks hasAIProvider internally).
  if (!hasAssistantFeatureProvider() && !(sess.aiAnalysis?.status === 'ok' && sess.aiAnalysis?.dot)) return '';
  const status = engine.getStatus(sess);
  const a = sess.aiAnalysis;
  const refreshBtn = `<button class="sun-session-ai-refresh" ${aiActionAttrs('refresh-sun-session', sess.id, { stopPropagation: true })} title="Re-run analysis" aria-label="Re-run AI analysis">↻</button>`;
  if (status === 'analyzing') {
    return `<div class="sun-session-ai" ${aiActionAttrs('stop-propagation')}>
      <span class="sun-session-ai-dot sun-session-ai-dot-shimmer" aria-hidden="true"></span>
      <span class="sun-session-ai-tip">Analyzing…</span>
    </div>`;
  }
  if (status === 'ok') {
    const dot = a.dot;
    return `<div class="sun-session-ai" ${aiActionAttrs('stop-propagation')}>
      <span class="sun-session-ai-dot sun-session-ai-dot-${escapeAttr(dot)}" aria-hidden="true"></span>
      <span class="sun-session-ai-tip sun-session-ai-tip-${escapeAttr(dot)}"><span class="sun-session-ai-prefix" aria-hidden="true">${dotPrefix(dot)}</span> ${escapeHTML(a.tip || '')}</span>
      ${refreshBtn}
    </div>`;
  }
  if (status === 'error') {
    const msg = a?.errorMessage ? `Analysis failed — ${a.errorMessage}` : 'Analysis failed';
    return `<div class="sun-session-ai sun-session-ai-error" ${aiActionAttrs('stop-propagation')}>
      <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
      <span class="sun-session-ai-tip" title="${escapeAttr(msg)}">${escapeHTML(msg)}</span>
      ${refreshBtn}
    </div>`;
  }
  return `<div class="sun-session-ai sun-session-ai-idle" ${aiActionAttrs('stop-propagation')}>
    <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
    <button class="sun-session-ai-cta" ${aiActionAttrs('refresh-sun-session', sess.id, { stopPropagation: true })}>Analyze this session</button>
  </div>`;
}

export function renderSessionAIDetail(sess) {
  if (!_hasCompleteModeledSession(sess)) return '';
  // Render cached verdict even when no provider — pre-populated demos +
  // cross-device-synced verdicts shouldn't disappear just because the
  // current device hasn't configured an AI key. Provider-gate only the
  // fresh-analyze paths (engine.analyze checks hasAIProvider internally).
  if (!hasAssistantFeatureProvider() && !(sess.aiAnalysis?.status === 'ok' && sess.aiAnalysis?.dot)) return '';
  const status = engine.getStatus(sess);
  const a = sess.aiAnalysis;
  if (status === 'analyzing') {
    return `<div class="sun-detail-ai sun-detail-ai-loading">
      <span class="sun-session-ai-dot sun-session-ai-dot-shimmer" aria-hidden="true"></span>
      <span>Analyzing this session…</span>
    </div>`;
  }
  if (status === 'error') {
    const msg = a?.errorMessage ? `Analysis failed — ${a.errorMessage}` : 'Analysis failed.';
    return `<div class="sun-detail-ai sun-detail-ai-error">
      <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
      <span>${escapeHTML(msg)}</span>
      <button class="sun-session-ai-refresh" ${aiActionAttrs('refresh-sun-session', sess.id)}>Try again</button>
    </div>`;
  }
  if (status !== 'ok') {
    return `<div class="sun-detail-ai sun-detail-ai-idle">
      <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
      <span>Not analyzed yet.</span>
      <button class="sun-session-ai-refresh" ${aiActionAttrs('refresh-sun-session', sess.id)}>Analyze now</button>
    </div>`;
  }
  const dot = a.dot;
  const tip = a.tip || '';
  const detail = a.detail || '';
  return `<div class="sun-detail-ai sun-detail-ai-${escapeAttr(dot)}">
    <div class="sun-detail-ai-head">
      <span class="sun-session-ai-dot sun-session-ai-dot-${escapeAttr(dot)}" aria-hidden="true"></span>
      <span class="sun-detail-ai-tip">${escapeHTML(tip)}</span>
      <button class="sun-session-ai-refresh" ${aiActionAttrs('refresh-sun-session', sess.id)} title="Re-run analysis" aria-label="Re-run AI analysis">↻</button>
    </div>
    ${detail ? `<div class="sun-detail-ai-body">${escapeHTML(detail)}</div>` : ''}
  </div>`;
}
