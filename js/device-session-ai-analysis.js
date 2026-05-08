// device-session-ai-analysis.js — per-PBM-session AI verdict + tip.
//
// Mirror of sun-ai-analysis.js for light-therapy device sessions
// (Joovv, Mito Red, Sperti UVB, Verilux SAD, dawn simulators, etc.).
// Same factory + render shape — different fingerprint inputs, different
// system prompt that knows about distance / spec mismatch / eye
// protection / device type / per-channel dose interpretation.

import { state } from './state.js';
import { escapeHTML, escapeAttr } from './utils.js';
import { hasAIProvider } from './api.js';
import { getDevices, getDeviceSessions } from './light-devices.js';
import { CHANNEL_DISPLAY, channelTier, tierLabel, formatChannelUnit, BODY_REGIONS } from './sun.js';
import { LIGHTING_HARDWARE_CAVEATS } from './lighting-hardware-caveats.js';
import { createAIVerdict, hashString, dotPrefix } from './ai-verdict-engine.js';

// ─── Fingerprint ───────────────────────────────────────────────────────

function getDeviceSessionFingerprint(sess) {
  if (!sess) return '';
  const parts = [
    sess.endedAt || 0,
    sess.deviceId || '',
    Math.round((sess.durationMin || 0) * 10) / 10,
    Math.round(sess.distanceCm || 0),
    sess.bodyArea || '',
    Array.isArray(sess.bodyAreas) ? sess.bodyAreas.slice().sort().join(',') : '',
    sess.eyesProtected ? 1 : 0,
  ];
  if (sess.doses) {
    for (const k of Object.keys(sess.doses).sort()) {
      parts.push(k + ':' + Math.round((sess.doses[k] || 0) * 10) / 10);
    }
  }
  return hashString(parts.join('|'));
}
export { getDeviceSessionFingerprint };

// ─── Context ────────────────────────────────────────────────────────────

function buildDeviceSessionContext(sess) {
  if (!sess) return '';
  const device = getDevices().find(d => d.id === sess.deviceId) || null;
  const lines = [];
  const labelByKey = Object.fromEntries((BODY_REGIONS || []).map(r => [r.key, r.label]));
  const fracByKey = Object.fromEntries((BODY_REGIONS || []).map(r => [r.key, r.fraction]));

  lines.push('### Device session');
  if (device) {
    lines.push(`Device: ${device.brand || ''} ${device.model || ''} (${device.type || 'unknown type'})`);
    if (Array.isArray(device.peakWavelengths) && device.peakWavelengths.length) {
      lines.push(`Peak wavelengths: ${device.peakWavelengths.join(', ')} nm`);
    }
    if (device.mwPerCm2At15cm) {
      lines.push(`Vendor irradiance: ${device.mwPerCm2At15cm} mW/cm² at ${device.recommendedDistanceCm || 15} cm`);
    } else if (device.lux) {
      lines.push(`Vendor lux: ${device.lux.toLocaleString()} lux at ${device.recommendedDistanceCm || ''} cm`);
    }
  } else {
    lines.push('Device: removed (the user deleted this device after logging the session)');
  }
  lines.push(`Duration: ${Math.round(sess.durationMin || 0)} min`);
  if (sess.distanceCm) {
    const refCm = device?.recommendedDistanceCm || 15;
    const ratio = sess.distanceCm / refCm;
    let distNote = '';
    if (ratio < 0.6) distNote = ' (much closer than vendor reference — near-field plateau, dose math caps amplification at 3×)';
    else if (ratio < 0.9) distNote = ' (closer than vendor reference)';
    else if (ratio > 1.5) distNote = ' (further than vendor reference — irradiance falls quadratically)';
    else distNote = ' (near vendor reference distance)';
    lines.push(`Distance: ${Math.round(sess.distanceCm)} cm${distNote}`);
  }
  // Body coverage — prefer the precise per-region list when present.
  if (Array.isArray(sess.bodyAreas) && sess.bodyAreas.length > 0) {
    const totalFrac = sess.bodyAreas.reduce((s, k) => s + (fracByKey[k] || 0), 0);
    const labels = sess.bodyAreas.map(k => labelByKey[k] || k).join(', ');
    lines.push(`Body coverage: ${labels} (~${Math.round(totalFrac * 100)}% of skin)`);
  } else if (sess.bodyArea) {
    lines.push(`Body coverage: ${sess.bodyArea} (legacy broad-zone)`);
  }
  lines.push(`Eyes: ${sess.eyesProtected ? 'protected (closed / goggles / blocked)' : 'uncovered'}`);

  // Per-channel doses + tier labels.
  const channelOrder = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye', 'pbm_red', 'pbm_nir'];
  const dosed = channelOrder.filter(k => sess.doses && sess.doses[k] > 0);
  if (dosed.length) {
    lines.push('');
    lines.push('### Channel doses');
    for (const k of dosed) {
      const v = sess.doses[k];
      const tier = channelTier(v, k);
      const label = (CHANNEL_DISPLAY[k]?.label) || k;
      const unit = formatChannelUnit(k, v, sess.durationMin || 0, 'III', null) || '';
      lines.push(`  - ${label}: ${tierLabel(tier)}${unit ? ' (' + unit + ')' : ''}`);
    }
  } else {
    lines.push('Channel doses: zero (session too short, eyes blocked + no skin exposure, or device/spec mismatch)');
  }

  // 7-day device-session rollup (excluding this session).
  try {
    const all = getDeviceSessions().filter(s => s.endedAt && s.id !== sess.id);
    const cutoff = (sess.endedAt || Date.now()) - 7 * 86400000;
    const recent = all.filter(s => s.endedAt >= cutoff);
    if (recent.length) {
      const totalMin = Math.round(recent.reduce((s, x) => s + (x.durationMin || 0), 0));
      lines.push('');
      lines.push('### Last 7 days (excluding this session)');
      lines.push(`${recent.length} device session${recent.length === 1 ? '' : 's'} · ${totalMin} min total`);
    }
  } catch (_) {}

  // User profile + latest 25-OH-D for vit-D-leaning devices.
  try {
    const sd = state.importedData?.sunDefaults || {};
    if (sd.fitzpatrick) lines.push(`Skin type: Fitzpatrick ${sd.fitzpatrick}`);
    const entries = (state.importedData?.entries || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    for (const e of entries) {
      const v = e?.values?.hormones?.['25-oh-vitamin-d'] ?? e?.values?.lipids?.['25-oh-vitamin-d'];
      if (v != null) { lines.push(`Latest 25-OH-D: ${v} (${e.date})`); break; }
    }
  } catch (_) {}

  return lines.join('\n');
}

// ─── System prompt ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = [
  'You evaluate a single light-therapy device session for a user tracking their own biology. Devices include red/NIR PBM panels (Joovv, Mito Red), UVB lamps (Sperti), SAD lamps (Verilux, Carex), and dawn simulators.',
  'Return ONLY valid JSON: {"dot":"green|yellow|red|gray","tip":"string","detail":"string"}.',
  '',
  'dot:',
  '  green = the session was on-protocol — distance reasonable for the device type, eyes appropriately protected for the wavelengths emitted, dose meaningful for the channels the device targets',
  '  yellow = useful but with a specific gap (e.g. distance off vendor reference, brief / under-dosed, or eye exposure to wavelengths that warrant goggles)',
  '  red = unsafe or counterproductive (UVB device with eyes uncovered, way over-distance with vanishing dose, eye exposure to high-irradiance UVA)',
  '  gray = not enough info (no doses computed, removed device, missing body / distance data)',
  '',
  'Device-type biology to weight:',
  '  • PBM (red 660 / NIR 810-850 nm): no UV, no vit-D — dose meaningfully via pbm_red / pbm_nir. Eyes don\'t need to be protected from these wavelengths but high near-field irradiance can still warm the cornea over long sessions. Skin coverage matters because pbm dose × area scales benefit.',
  '  • UVB (Sperti, NB-UVB): primary purpose is vitamin D synthesis. Eyes MUST be closed or behind UV-blocking goggles — the corneal absorption spectrum overlaps UVB. Sessions are minutes, not tens of minutes; over-dose risk is real.',
  '  • SAD lamp (10000-lux full-spectrum or filtered blue): only useful via the eyes (circadian channel). Skin exposure is irrelevant — distance + facing matters. Best used in the morning; evening use is counterproductive.',
  '  • Dawn simulator: gradual ramp into bedroom light. Lower instantaneous irradiance — value lives in the natural-feeling phase advance, not raw lux.',
  '',
  'Distance interpretation (the context flags relative position):',
  '  • Closer than vendor reference: dose math caps inverse-square amplification at 3× because LED panels behave near-field. Don\'t recommend tighter than the vendor spec.',
  '  • Further than vendor reference: dose drops quadratically — flag this in the verdict if the user wanted significant exposure but stood across the room.',
  '',
  ...LIGHTING_HARDWARE_CAVEATS,
  '',
  'tip: one sentence, max 14 words. Reference specific numbers (distance, duration, channel tier) when they drive the verdict.',
  'detail: 1–2 sentences. Why the verdict — name the specific channel + device-type interaction. Be observational, no "you should".',
  'NUMBER DISCIPLINE: only quote numbers with user-meaningful units that appear verbatim in the context (cm, min, mW/cm², lux, nm, IU). Channel doses are referred to by tier label (none/low/moderate/good/strong), never raw scores.',
  '',
  'No emoji.',
].join('\n');

// ─── Engine ────────────────────────────────────────────────────────────

const engine = createAIVerdict({
  getTarget: (id) => getDeviceSessions().find(s => s.id === id),
  getId: (s) => s?.id,
  getAIAnalysis: (s) => s?.aiAnalysis || null,
  setAIAnalysis: (s, v) => { if (v == null) delete s.aiAnalysis; else s.aiAnalysis = v; },
  getFingerprint: getDeviceSessionFingerprint,
  buildContext: buildDeviceSessionContext,
  systemPrompt: SYSTEM_PROMPT,
  maxTokens: 400,
  canAnalyze: (s) => !!s?.endedAt,
  shouldAutoFire: (s) => !!s?.endedAt,
  getAllTargets: getDeviceSessions,
});

export const analyzeDeviceSessionAI = engine.analyze;
export const refreshDeviceSessionAIAnalysis = engine.refresh;
export const maybeAnalyzeDeviceSessionAfterFinish = engine.maybeAfterFinish;

// ─── Render helpers ────────────────────────────────────────────────────

export function renderDeviceSessionAIInline(sess) {
  if (!hasAIProvider() || !sess?.endedAt) return '';
  const status = engine.getStatus(sess);
  const a = sess.aiAnalysis;
  const refreshBtn = `<button class="sun-session-ai-refresh" onclick="event.stopPropagation();window.refreshDeviceSessionAIAnalysis('${escapeAttr(sess.id)}')" title="Re-run analysis" aria-label="Re-run AI analysis">↻</button>`;
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
    <button class="sun-session-ai-cta" onclick="event.stopPropagation();window.refreshDeviceSessionAIAnalysis('${escapeAttr(sess.id)}')">Analyze this session</button>
  </div>`;
}

export function renderDeviceSessionAIDetail(sess) {
  if (!hasAIProvider() || !sess?.endedAt) return '';
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
      <button class="sun-session-ai-refresh" onclick="window.refreshDeviceSessionAIAnalysis('${escapeAttr(sess.id)}')">Try again</button>
    </div>`;
  }
  if (status !== 'ok') {
    return `<div class="sun-detail-ai sun-detail-ai-idle">
      <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
      <span>Not analyzed yet.</span>
      <button class="sun-session-ai-refresh" onclick="window.refreshDeviceSessionAIAnalysis('${escapeAttr(sess.id)}')">Analyze now</button>
    </div>`;
  }
  const dot = a.dot;
  const tip = a.tip || '';
  const detail = a.detail || '';
  return `<div class="sun-detail-ai sun-detail-ai-${escapeAttr(dot)}">
    <div class="sun-detail-ai-head">
      <span class="sun-session-ai-dot sun-session-ai-dot-${escapeAttr(dot)}" aria-hidden="true"></span>
      <span class="sun-detail-ai-tip">${escapeHTML(tip)}</span>
      <button class="sun-session-ai-refresh" onclick="window.refreshDeviceSessionAIAnalysis('${escapeAttr(sess.id)}')" title="Re-run analysis" aria-label="Re-run AI analysis">↻</button>
    </div>
    ${detail ? `<div class="sun-detail-ai-body">${escapeHTML(detail)}</div>` : ''}
  </div>`;
}

Object.assign(window, {
  refreshDeviceSessionAIAnalysis,
  analyzeDeviceSessionAI,
  // Same window-lookup shim sun-ai-analysis uses — light-devices.js
  // calls these without importing the AI module, sidestepping cyclic
  // import risk.
  maybeAnalyzeDeviceSessionAfterFinish,
  renderDeviceSessionAIInline,
  renderDeviceSessionAIDetail,
});
