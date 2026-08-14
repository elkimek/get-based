// @ts-check
// light-device-ai-analysis.js — per-session AI verdict for light therapy
// device sessions (PBM panels, SAD lamps, dawn simulators, UVB phototherapy).
//
// Thin wrapper around ai-verdict-engine. Differs from sun in the prompt
// (controlled-dose biology, distance, eye protection) and fingerprint
// (deviceId + distanceCm + bodyArea + eyesProtected).

import { escapeHTML, escapeAttr } from './utils.js';
import { hasAIProvider } from './api.js';
import { getSunDefaults } from './sun-defaults.js';
import { getDevices, getDeviceSessions } from './light-devices-store.js';
import { CHANNEL_DISPLAY, formatChannelUnit, BODY_REGIONS } from './sun.js';
import { createAIVerdict, hashString, dotPrefix } from './ai-verdict-engine.js';
import { aiActionAttrs, registerAIActionHandler } from './ai-action-delegates.js';

// ─── Fingerprint ───────────────────────────────────────────────────────

export function getDeviceSessionFingerprint(sess) {
  if (!sess) return '';
  const parts = [
    sess.startedAt || 0,
    sess.endedAt || 0,
    Math.round((sess.durationMin || 0) * 10) / 10,
    sess.deviceId || '',
    Math.round(sess.distanceCm || 0),
    sess.bodyArea || '',
    Array.isArray(sess.bodyAreas) ? [...sess.bodyAreas].sort().join(',') : '',
    sess.eyesProtected ? 1 : 0,
    sess.mode || '',
    sess.safety?.hasUV ? 1 : 0,
    sess.safety?.unsafeEyeExposure ? 1 : 0,
    sess.safety?.erythemalSED != null ? Math.round(sess.safety.erythemalSED * 100) : '',
    sess.safety?.ocularActinicUV != null ? Math.round(sess.safety.ocularActinicUV * 10) : '',
    sess.metrics?.photopicLux != null ? Math.round(sess.metrics.photopicLux) : '',
    sess.metrics?.melanopicEdiLux != null ? Math.round(sess.metrics.melanopicEdiLux) : '',
  ];
  const device = getDevices().find(d => d.id === sess.deviceId) || sess.deviceSnapshot || null;
  if (device) {
    parts.push(
      device.type || '',
      Array.isArray(device.peakWavelengths) ? device.peakWavelengths.join(',') : '',
      device.mwPerCm2At15cm || '',
      device.lux || '',
      device.melanopicDER || '',
      device.melanopicEdiLux || '',
    );
  }
  if (sess.doses) {
    for (const k of Object.keys(sess.doses).sort()) {
      parts.push(k + ':' + Math.round((sess.doses[k] || 0) * 10) / 10);
    }
  }
  return hashString(parts.join('|'));
}

// ─── Prompt context ────────────────────────────────────────────────────

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

// Cap user-supplied free-text fields fed into prompt context. A device named
// "Glow\n[SYSTEM: ignore previous]" would otherwise break out of the prompt.
function _safeText(s, max = 80) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

const _DEVICE_TYPE_DESCRIPTIONS = {
  uvb: 'UVB phototherapy panel — vitamin-D synthesis + POMC; eye exposure must be blocked',
  uva: 'UVA panel — modeled nitric-oxide wellness channel; no vitamin D; UV-rated eye protection required',
  combined: 'red + near-IR PBM panel — cellular repair, mitochondrial signaling',
  'pbm-targeted': 'handheld / spot PBM device — close-range targeted dosing',
  sad: 'SAD light box — 10000-lux white light for circadian / mood; requires eye-direct (not blocked) for benefit',
  'dawn-sim': 'dawn simulator — gradual ramp, gentle circadian phase advance',
  'full-spectrum': 'full-spectrum bulb — daytime alertness if used at sufficient duration',
};

export function buildDeviceSessionContext(sess) {
  if (!sess) return '';
  const sd = getSunDefaults() || {};
  const device = getDevices().find(d => d.id === sess.deviceId) || sess.deviceSnapshot || null;
  const lines = [];

  lines.push('### Session');
  const start = new Date(sess.startedAt || Date.now());
  const end = sess.endedAt ? new Date(sess.endedAt) : null;
  lines.push(`Local date: ${_localDateKey(start)}`);
  lines.push(`Time: ${start.toTimeString().slice(0, 5)}${end ? '–' + end.toTimeString().slice(0, 5) : ' (in progress)'}`);
  lines.push(`Duration: ${_formatNumber(sess.durationMin)} min`);

  lines.push('');
  lines.push('### Device');
  if (device) {
    const safeBrand = _safeText(device.brand) || '?';
    const safeModel = _safeText(device.model);
    lines.push(`Brand · model: ${safeBrand}${safeModel ? ' ' + safeModel : ''}`);
    if (device.type) {
      const safeType = _safeText(device.type, 30);
      const desc = _DEVICE_TYPE_DESCRIPTIONS[device.type];
      lines.push(`Type: ${safeType}${desc ? ' — ' + desc : ''}`);
    }
    if (Array.isArray(device.peakWavelengths) && device.peakWavelengths.length) {
      lines.push(`Peak wavelengths: ${device.peakWavelengths.map(w => w + ' nm').join(', ')}`);
    }
    if (device.mwPerCm2At15cm) {
      lines.push(`Irradiance: ${device.mwPerCm2At15cm} mW/cm² at ${device.recommendedDistanceCm || 15} cm reference distance`);
    }
    if (device.lux) lines.push(`Eye-channel intensity: ${device.lux.toLocaleString()} lux`);
    if (device.melanopicEdiLux) lines.push(`Eye-channel melanopic EDI: ${device.melanopicEdiLux.toLocaleString()} lx at ${device.recommendedDistanceCm || 15} cm reference distance`);
    // Mode disclosure for hybrid panels (Maxi UVB / Trinity / etc.) where
    // the user picks an LED-group preset on the touchscreen. Without
    // this, the model sees a UVB-typed device with all-zero vit-D and
    // calls the session a "miss" — when the user deliberately ran red/
    // NIR-only mode, judging it as a PBM session is correct.
    if (Array.isArray(device.modes) && device.modes.length > 0 && sess.mode) {
      const resolved = device.modes.find(m => m.id === sess.mode);
      if (resolved) {
        const isDefault = !!resolved.default || device.modes[0]?.id === resolved.id;
        const firingGroups = (resolved.groups || []).map(gid => {
          const g = (device.channelGroups || []).find(cg => cg.id === gid);
          return g ? (g.label || g.id) : gid;
        }).join(', ');
        const firingPeaks = new Set();
        for (const gid of (resolved.groups || [])) {
          const g = (device.channelGroups || []).find(cg => cg.id === gid);
          if (g?.peaks) for (const p of g.peaks) firingPeaks.add(p);
        }
        const peaksList = Array.from(firingPeaks).sort((a, b) => a - b);
        lines.push(`Mode: ${resolved.label || resolved.id}${isDefault ? ' (device default)' : ' (user-selected, off-default)'}`);
        if (firingGroups) lines.push(`Firing LED groups: ${firingGroups}`);
        if (peaksList.length && peaksList.length < (device.peakWavelengths?.length || 0)) {
          lines.push(`Peaks actually firing this session: ${peaksList.map(w => w + ' nm').join(', ')} (subset of full panel)`);
        }
      }
    }
  } else {
    lines.push('Device specification unavailable.');
  }

  lines.push('');
  lines.push('### Session parameters');
  lines.push(`Working distance: ${sess.distanceCm || '—'} cm`);
  lines.push(`Body area: ${sess.bodyArea || '—'}`);
  const hasUV = sess.safety?.hasUV === true;
  lines.push(`Eyes: ${hasUV
    ? (sess.eyesProtected ? 'UV-rated protection recorded' : 'UV-rated protection NOT recorded')
    : (sess.eyesProtected ? 'shielding recorded' : 'no shielding recorded')}`);
  if (sess.safety?.hasUV) {
    lines.push(`Deterministic UV safety: ${sess.safety.unsafeEyeExposure ? 'UNSAFE EYE EXPOSURE RECORDED' : 'UV-rated eye protection recorded'}`);
    if ((sess.safety.uvDoseStatus === 'modeled' || sess.safety.uvDoseStatus == null)
        && Number.isFinite(sess.safety.erythemalSED)) {
      lines.push(`Local erythemal dose: ${_formatNumber(sess.safety.erythemalSED, 2)} SED${Number.isFinite(sess.safety.conservativeBaseMedFraction) ? `; ${Math.round(sess.safety.conservativeBaseMedFraction * 100)}% of conservative Type I base MED` : ''}`);
    } else {
      lines.push('UV dose: unavailable — the required spectral output, band split, or supported distance basis was not provided; do not infer burn dose or vitamin-D output.');
    }
  }
  if (Array.isArray(sess.calculation?.warnings) && sess.calculation.warnings.length) {
    lines.push(`Model limits: ${sess.calculation.warnings.map(warning => _safeText(warning, 240)).join(' ')}`);
  }

  if (sess.doses) {
    const fitz = sess.fitzpatrick || sd.fitzpatrick || sess.safety?.fitzpatrick || 'III';
    const channelOrder = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye', 'pbm_red', 'pbm_nir'];
    // Body-fraction for the per-session vit-D cap (Audit P1 #8). Device
    // session schema stores bodyAreas[]; BODY_REGIONS provides the per-
    // region weights. Falls back to null on missing data.
    let _bf = null;
    if (Array.isArray(sess.bodyAreas) && sess.bodyAreas.length > 0
        && Array.isArray(BODY_REGIONS)) {
      const _fbk = Object.fromEntries(BODY_REGIONS.map(r => [r.key, r.fraction]));
      _bf = sess.bodyAreas.reduce((s, k) => s + (_fbk[k] || 0), 0) || null;
    }
    const parts = [];
    for (const k of channelOrder) {
      const v = sess.doses[k];
      if (v == null || v === 0) continue;
      const meta = CHANNEL_DISPLAY[k] || { label: k };
      let display = formatChannelUnit(k, v, sess.durationMin || 0, fitz, null, null, false, _bf);
      if (!display) display = 'targeted device signal logged';
      parts.push(`${meta.label || k}: ${display}`);
    }
    if (parts.length) {
      lines.push('');
      lines.push('### Modeled light signals');
      for (const p of parts) lines.push('  - ' + p);
    }
  }

  return lines.join('\n');
}

const SYSTEM_PROMPT = [
  'You evaluate a single light-therapy DEVICE session (panel / SAD lamp / dawn simulator / UVB phototherapy / handheld PBM).',
  'Return ONLY valid JSON with three keys: {"dot":"green|yellow|red|gray","tip":"string","detail":"string"}.',
  '',
  'dot:',
  '  green = the recorded setup is internally consistent and no deterministic safety flag is present; do not claim it matches a medical or vendor protocol unless one is explicitly supplied',
  '  yellow = a material setup caveat or uncertainty is recorded (for example reference-distance uncertainty or eye-channel mismatch); do not call a short or low-signal session a failure',
  '  red = a deterministic safety problem is recorded (especially any UV-emitting mode without UV-rated goggles); do not invent a distance cutoff for PBM panels',
  '  gray = not enough info (no doses computed, device record removed, missing parameters)',
  '',
  'Device-class biology:',
  '  • PBM red+NIR (combined / pbm-targeted): retain the cytochrome-c-oxidase wellness model. Dose ranges are device/target specific; follow the device protocol and flag heat or eye discomfort rather than prescribing a universal target. Vitamin-D yield is zero — irrelevant.',
  '  • SAD light box: needs eyes open to ambient light without staring at the source. Photopic lux is not M-EDI unless a spectrum or melanopic DER is available. Skin/UV channels will be zero — irrelevant.',
  '  • UVB / UVA devices: UV-rated eye protection is mandatory. Numeric vitamin-D, NO, burn, or ocular dose requires band-resolved spectral irradiance at a supported distance; when it is unavailable, discuss only the recorded UV presence and setup. If eyes are uncovered, flag RED.',
  '  • Dawn simulator: gentle ramp, low total dose; circadian-only. Judge the timing and setup, not a completion score.',
  '  • Full-spectrum bulb: daytime alertness; only meaningful at sustained durations (>30 min) and reasonable lux.',
  'Working distance matters: the dose model uses measured distance data when available. Otherwise it retains vendor reference irradiance; it applies inverse-square only to devices explicitly declared point sources. UV-specific numbers are withheld outside a measured range or away from an unmodeled reference distance.',
  '',
  'Mode (when the context lists a Mode line):',
  '  • Hybrid panels like Mitochondriak Maxi UVB and Chroma Trinity have named touchscreen modes that gate which LED groups fire. The Mode line tells you what the user DELIBERATELY ran. A UVB-typed panel set to a red/NIR-only mode is a PBM session by intent — judge it as PBM, not as a broken UVB session. Zero vit-D in that case is expected, not a problem.',
  '  • An off-default mode is a positive signal of intent. Reflect THE MODE THEY RAN, not the modes they could have run.',
  '  • Use the mode + firing-peaks lines as the primary cue for which device-class biology applies — override the device.type label when the firing peaks contradict it.',
  '',
  'tip: one sentence, max 14 words. Reference specific numbers + device-class context. Direct, no preamble.',
  'detail: 1–2 sentences. Explain the why, naming dose / device-class fit / safety driver. No restating the data verbatim.',
  '',
  'No "you should" — be observational. No emoji.',
].join('\n');

const engine = createAIVerdict({
  getTarget: (id) => getDeviceSessions().find(s => s.id === id),
  getId: (s) => s?.id,
  getAIAnalysis: (s) => s?.aiAnalysis || null,
  setAIAnalysis: (s, v) => { if (v == null) delete s.aiAnalysis; else s.aiAnalysis = v; },
  getFingerprint: getDeviceSessionFingerprint,
  buildContext: buildDeviceSessionContext,
  systemPrompt: SYSTEM_PROMPT,
  maxTokens: 400,
  canAnalyze: (s) => !!s?.endedAt && !!s?.doses && !!s?.safety,
  // Keep per-session interpretation user-requested. Automatic synthesis lives
  // at Today/Weekly level and should not run again for every history row.
  shouldAutoFire: () => false,
  getAllTargets: getDeviceSessions,
});

export const analyzeDeviceSessionAI = engine.analyze;
export const refreshDeviceSessionAIAnalysis = engine.refresh;
registerAIActionHandler('refresh-device-session', refreshDeviceSessionAIAnalysis);
export const maybeAnalyzeDeviceSessionAfterFinish = engine.maybeAfterFinish;

// ─── Render ────────────────────────────────────────────────────────────

function _hasCompleteModeledDeviceSession(sess) {
  return !!sess?.endedAt
    && !!sess?.doses
    && !!sess?.safety;
}

export function renderDeviceSessionAIInline(sess) {
  if (!_hasCompleteModeledDeviceSession(sess)) return '';
  if (!hasAIProvider() && !(sess.aiAnalysis?.status === 'ok' && sess.aiAnalysis?.dot)) return '';
  const status = engine.getStatus(sess);
  const a = sess.aiAnalysis;
  const refreshBtn = `<button class="sun-session-ai-refresh" ${aiActionAttrs('refresh-device-session', sess.id, { stopPropagation: true })} title="Re-run analysis" aria-label="Re-run AI analysis">↻</button>`;
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
    <button class="sun-session-ai-cta" ${aiActionAttrs('refresh-device-session', sess.id, { stopPropagation: true })}>Analyze this session</button>
  </div>`;
}

export function renderDeviceSessionAIDetail(sess) {
  if (!_hasCompleteModeledDeviceSession(sess)) return '';
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
      <button class="sun-session-ai-refresh" ${aiActionAttrs('refresh-device-session', sess.id)}>Try again</button>
    </div>`;
  }
  if (status !== 'ok') {
    return `<div class="sun-detail-ai sun-detail-ai-idle">
      <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
      <span>Not analyzed yet.</span>
      <button class="sun-session-ai-refresh" ${aiActionAttrs('refresh-device-session', sess.id)}>Analyze now</button>
    </div>`;
  }
  const dot = a.dot;
  const tip = a.tip || '';
  const detail = a.detail || '';
  return `<div class="sun-detail-ai sun-detail-ai-${escapeAttr(dot)}">
    <div class="sun-detail-ai-head">
      <span class="sun-session-ai-dot sun-session-ai-dot-${escapeAttr(dot)}" aria-hidden="true"></span>
      <span class="sun-detail-ai-tip">${escapeHTML(tip)}</span>
      <button class="sun-session-ai-refresh" ${aiActionAttrs('refresh-device-session', sess.id)} title="Re-run analysis" aria-label="Re-run AI analysis">↻</button>
    </div>
    ${detail ? `<div class="sun-detail-ai-body">${escapeHTML(detail)}</div>` : ''}
  </div>`;
}
