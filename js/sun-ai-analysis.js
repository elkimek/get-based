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

import { state } from './state.js';
import { escapeHTML, escapeAttr } from './utils.js';
import { hasAIProvider } from './api.js';
import { getSunDefaults } from './sun-defaults.js';
import { getSessions, formatChannelUnit, CHANNEL_DISPLAY, channelTier, tierLabel } from './sun.js';
import { createAIVerdict, hashString, dotPrefix } from './ai-verdict-engine.js';

// ─── Fingerprint ───────────────────────────────────────────────────────
//
// Hash of the session fields that, when changed, should invalidate a
// previously-cached analysis. Deliberately excludes id and startedAt
// (cosmetic) and includes the dose / safety / coverage / weather snapshot
// since those are what the verdict actually keys on.
function getSessionFingerprint(sess) {
  if (!sess) return '';
  const parts = [
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
    sess.atmosphere?.uvIndex != null ? Math.round(sess.atmosphere.uvIndex * 10) : '',
    sess.atmosphere?.cloudCover != null ? Math.round(sess.atmosphere.cloudCover) : '',
    sess.safety?.fitzpatrick || '',
    Math.round((sess.safety?.medFraction || 0) * 100),
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

function _sevenDayRollup(currentSess) {
  const sessions = getSessions().filter(s => s.endedAt && s.id !== currentSess?.id);
  const cutoff = (currentSess?.endedAt || Date.now()) - 7 * 86400000;
  const recent = sessions.filter(s => s.endedAt >= cutoff);
  if (!recent.length) return null;
  const genetics = state.importedData?.genetics || null;
  let totalMin = 0, totalVitDIU = 0, maxMed = 0;
  const daysWithSession = new Set();
  for (const s of recent) {
    totalMin += s.durationMin || 0;
    const rawVitD = s.doses?.vitamin_d || 0;
    if (rawVitD > 0 && typeof window.vitaminDIU === 'function') {
      const iu = window.vitaminDIU(
        rawVitD,
        s.safety?.fitzpatrick || 'III',
        s.atmosphere?.uvIndex ?? null,
        !!s.bodyExposure?.rotatedSides,
        genetics,
      );
      if (Number.isFinite(iu)) totalVitDIU += iu;
    }
    if ((s.safety?.medFraction || 0) > maxMed) maxMed = s.safety.medFraction;
    daysWithSession.add(new Date(s.endedAt).toISOString().slice(0, 10));
  }
  return {
    sessionCount: recent.length,
    daysWithSession: daysWithSession.size,
    totalMin: Math.round(totalMin),
    totalVitDIU: Math.round(totalVitDIU),
    maxMedPct: Math.round(maxMed * 100),
  };
}

export function buildSingleSessionContext(sess) {
  if (!sess) return '';
  const sd = getSunDefaults() || {};
  const lc = state.importedData?.lightCircadian || {};
  const goals = state.importedData?.healthGoals?.goals || '';
  const lines = [];

  lines.push('### Session');
  const start = new Date(sess.startedAt || Date.now());
  const end = sess.endedAt ? new Date(sess.endedAt) : null;
  lines.push(`Date: ${start.toISOString().slice(0, 10)}`);
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
  if (end && sess.location && typeof window.solarZenithAngle === 'function') {
    try {
      const zStart = window.solarZenithAngle(start, sess.location.lat, sess.location.lon);
      const zEnd = window.solarZenithAngle(end, sess.location.lat, sess.location.lon);
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
      if (sess.startedAt && sess.endedAt && sess.location && typeof window.solarZenithAngle === 'function') {
        const mid = new Date((sess.startedAt + sess.endedAt) / 2);
        zenith = window.solarZenithAngle(mid, sess.location.lat, sess.location.lon);
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
      if (!display) {
        const t = channelTier(v, k);
        const tlabel = tierLabel(t);
        const target = meta.dailyTarget || 0;
        const pct = (target > 0 && v > 0) ? Math.round(100 * v / target) : null;
        display = pct != null ? `${tlabel} (${pct}% of daily target)` : tlabel;
      }
      parts.push(`${meta.label || k}: ${display}`);
    }
    if (parts.length) lines.push('Doses (as displayed to user):');
    for (const p of parts) lines.push('  - ' + p);
  }

  if (sess.safety) {
    lines.push(`Burn dose: ${Math.round((sess.safety.medFraction || 0) * 100)}% of MED (Fitzpatrick ${sess.safety.fitzpatrick || sd.fitzpatrick || 'III'})`);
  }

  lines.push('');
  lines.push('### User profile');
  if (sd.fitzpatrick) lines.push(`Skin type: Fitzpatrick ${sd.fitzpatrick}`);
  else if (lc.skinType) lines.push(`Skin type: ${lc.skinType}`);
  if (sd.photosensitiveMeds && sd.photosensitiveMeds !== 'none') lines.push(`Photosensitizing meds: ${sd.photosensitiveMeds}`);
  if (sd.dailyVitDTargetIU) lines.push(`Vit-D daily target: ${sd.dailyVitDTargetIU} IU`);
  if (goals) lines.push(`Health goals: ${String(goals).slice(0, 200)}`);

  try {
    const entries = (state.importedData?.entries || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    for (const e of entries) {
      const v = e?.values?.hormones?.['25-oh-vitamin-d'] ?? e?.values?.lipids?.['25-oh-vitamin-d'];
      if (v != null) { lines.push(`Latest 25-OH-D: ${v} (${e.date})`); break; }
    }
  } catch (_) {}

  const rollup = _sevenDayRollup(sess);
  if (rollup) {
    lines.push('');
    lines.push('### Last 7 days (excluding this session)');
    lines.push(`Sessions: ${rollup.sessionCount} across ${rollup.daysWithSession} days · ${rollup.totalMin} min total`);
    lines.push(`Vit-D total: ~${rollup.totalVitDIU} IU · max burn dose: ${rollup.maxMedPct}%`);
  }

  return lines.join('\n');
}

// ─── System prompt ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = [
  'You evaluate a single sun/light exposure session for a user tracking their own biology.',
  'Return ONLY valid JSON with three keys: {"dot":"green|yellow|red|gray","tip":"string","detail":"string"}.',
  '',
  'dot:',
  '  green = the session was worthwhile relative to the user\'s goals AND stayed safely under burn / eye-strain thresholds',
  '  yellow = useful but with a caveat (e.g. low yield, near-MED, eye exposure with shaded eyes, or single-side rotation)',
  '  red = counterproductive (over MED, eye damage risk, or prolonged glass / heavy clothing wasted the session)',
  '  gray = not enough info (no doses computed, no weather, no body or eye data)',
  '',
  'Solar phase matters. Different parts of the solar cycle carry distinct biology:',
  '  • sunrise / civil dawn: blue+violet light pre-horizon clears pineal melatonin and triggers cortisol awakening; the moment the sun crosses the horizon and UVA begins to register (~3° elevation) drives nitric-oxide release from skin/mucosa and is the strongest natural circadian phase-advance signal of the day. Eye exposure during this transition is uniquely valuable and is ~1000× safer than direct gaze later in the arc.',
  '  • sunset / civil dusk: mirror — phase-delaying signal, melatonin onset preparation. UVA fadeout still gives a final NO/POMC bump.',
  '  • midday near-zenith: peak UVB → vitamin D, peak burn risk, weakest circadian phase signal.',
  '',
  'When "Solar phase" flags a sunrise/sunset transition or twilight window, the verdict MUST address that biology, even if every dose channel shows 0%. Heavy cloud cover dampens the spectral dose model but does NOT erase the value of the session: the visual brightening cue alone entrains the suprachiasmatic master clock, the photic zeitgeber works through retinal melanopsin which saturates at modest illuminance (~100-1000 lux), and being outdoors at this solar phase is qualitatively different from staying indoors. Vitamin-D yield will be near zero (UVB requires elevation > ~10°) and that is NEVER a yellow flag for a sunrise/sunset session — the value lives in circadian + NO + POMC + cortisol awakening, not in UVB-dependent channels. A green verdict is appropriate when the user attended the transition, even with cloud-suppressed doses.',
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
  canAnalyze: (s) => !!s?.endedAt,
  shouldAutoFire: (s) => !!s?.endedAt,
  getAllTargets: getSessions,
});

export const analyzeSunSessionAI = engine.analyze;
export const refreshSessionAIAnalysis = engine.refresh;
export const maybeAnalyzeSessionAfterFinish = engine.maybeAfterFinish;

// ─── Render helpers ────────────────────────────────────────────────────

export function renderSessionAIInline(sess) {
  if (!sess?.endedAt) return '';
  // Render cached verdict even when no provider — pre-populated demos +
  // cross-device-synced verdicts shouldn't disappear just because the
  // current device hasn't configured an AI key. Provider-gate only the
  // fresh-analyze paths (engine.analyze checks hasAIProvider internally).
  if (!hasAIProvider() && !(sess.aiAnalysis?.status === 'ok' && sess.aiAnalysis?.dot)) return '';
  const status = engine.getStatus(sess);
  const a = sess.aiAnalysis;
  const refreshBtn = `<button class="sun-session-ai-refresh" onclick="event.stopPropagation();window.refreshSessionAIAnalysis('${escapeAttr(sess.id)}')" title="Re-run analysis" aria-label="Re-run AI analysis">↻</button>`;
  if (status === 'analyzing') {
    return `<div class="sun-session-ai" onclick="event.stopPropagation()">
      <span class="sun-session-ai-dot sun-session-ai-dot-shimmer" aria-hidden="true"></span>
      <span class="sun-session-ai-tip">Analyzing…</span>
    </div>`;
  }
  if (status === 'ok') {
    const dot = a.dot;
    return `<div class="sun-session-ai" onclick="event.stopPropagation()">
      <span class="sun-session-ai-dot sun-session-ai-dot-${escapeAttr(dot)}" aria-hidden="true"></span>
      <span class="sun-session-ai-tip sun-session-ai-tip-${escapeAttr(dot)}"><span class="sun-session-ai-prefix" aria-hidden="true">${dotPrefix(dot)}</span> ${escapeHTML(a.tip || '')}</span>
      ${refreshBtn}
    </div>`;
  }
  if (status === 'error') {
    const msg = a?.errorMessage ? `Analysis failed — ${a.errorMessage}` : 'Analysis failed';
    return `<div class="sun-session-ai sun-session-ai-error" onclick="event.stopPropagation()">
      <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
      <span class="sun-session-ai-tip" title="${escapeAttr(msg)}">${escapeHTML(msg)}</span>
      ${refreshBtn}
    </div>`;
  }
  return `<div class="sun-session-ai sun-session-ai-idle" onclick="event.stopPropagation()">
    <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
    <button class="sun-session-ai-cta" onclick="event.stopPropagation();window.refreshSessionAIAnalysis('${escapeAttr(sess.id)}')">Analyze this session</button>
  </div>`;
}

export function renderSessionAIDetail(sess) {
  if (!sess?.endedAt) return '';
  // Render cached verdict even when no provider — pre-populated demos +
  // cross-device-synced verdicts shouldn't disappear just because the
  // current device hasn't configured an AI key. Provider-gate only the
  // fresh-analyze paths (engine.analyze checks hasAIProvider internally).
  if (!hasAIProvider() && !(sess.aiAnalysis?.status === 'ok' && sess.aiAnalysis?.dot)) return '';
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
      <button class="sun-session-ai-refresh" onclick="window.refreshSessionAIAnalysis('${escapeAttr(sess.id)}')">Try again</button>
    </div>`;
  }
  if (status !== 'ok') {
    return `<div class="sun-detail-ai sun-detail-ai-idle">
      <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
      <span>Not analyzed yet.</span>
      <button class="sun-session-ai-refresh" onclick="window.refreshSessionAIAnalysis('${escapeAttr(sess.id)}')">Analyze now</button>
    </div>`;
  }
  const dot = a.dot;
  const tip = a.tip || '';
  const detail = a.detail || '';
  return `<div class="sun-detail-ai sun-detail-ai-${escapeAttr(dot)}">
    <div class="sun-detail-ai-head">
      <span class="sun-session-ai-dot sun-session-ai-dot-${escapeAttr(dot)}" aria-hidden="true"></span>
      <span class="sun-detail-ai-tip">${escapeHTML(tip)}</span>
      <button class="sun-session-ai-refresh" onclick="window.refreshSessionAIAnalysis('${escapeAttr(sess.id)}')" title="Re-run analysis" aria-label="Re-run AI analysis">↻</button>
    </div>
    ${detail ? `<div class="sun-detail-ai-body">${escapeHTML(detail)}</div>` : ''}
  </div>`;
}

Object.assign(window, {
  refreshSessionAIAnalysis,
  analyzeSunSessionAI,
  // Exposed so sun.js can call into the AI module without importing it
  // — the reciprocal import would create a TDZ-risky cycle. Same
  // window-lookup pattern other AI modules use (renderRoomAIBlock,
  // renderScreenAIBlock, etc.).
  maybeAnalyzeSessionAfterFinish,
  renderSessionAIInline,
  renderSessionAIDetail,
});
