// light-audit-ai-analysis.js — per-audit AI verdict for the Light
// Audit feature (frozen snapshot of rooms + screens + measurements).
//
// Distinct from the existing "✨ Interpret changes" button (which fires
// a chat-panel comparison between two audits). This module gives each
// audit its own persistent verdict — visible at-a-glance on the card
// header (color dot) and as a full block in the audit detail body.
// Trigger is manual since audits are explicit checkpoints, not high-
// frequency events.
//
// Storage: audit.aiAnalysis — lightAudits is on the per-row CRDT, so
// verdicts sync naturally.

import { state } from './state.js';
import { escapeHTML, escapeAttr } from './utils.js';
import { hasAIProvider } from './api.js';
import { createAIVerdict, hashString, dotPrefix } from './ai-verdict-engine.js';
import { LIGHTING_HARDWARE_CAVEATS } from './lighting-hardware-caveats.js';
import { getRoomEveningHoursAfterSunset } from './light-env-evening.js';

function _getAudits() {
  if (!state.importedData) return [];
  if (!Array.isArray(state.importedData.lightAudits)) state.importedData.lightAudits = [];
  return state.importedData.lightAudits;
}

const _SCREEN_LABELS = {
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

// Bumped 2026-05-08: synthesis priorities now use Brown 2022 melanopic-
// EDI thresholds; older cached verdicts used a 100-lux daytime / >1
// photopic-lux night anchor and need to refresh.
const _auditFingerprintSalt = 'v2-brown2022-medi';
export function getAuditFingerprint(a) {
  if (!a) return '';
  const parts = [
    _auditFingerprintSalt,
    a.id || '',
    a.date || '',
    a.label || '',
    (a.rooms || []).length,
    (a.screens || []).length,
    (a.measurements || []).length,
  ];
  // Hash room IDs + their primarySource + hours; small but enough to
  // detect a labelled-edit scenario where the user updated a room
  // pre-snapshot.
  for (const r of (a.rooms || [])) {
    parts.push(`r:${r.id}:${r.primarySource || ''}:${r.hoursOccupiedPerDay || 0}:${getRoomEveningHoursAfterSunset(r)}`);
  }
  for (const m of (a.measurements || [])) {
    parts.push(`m:${m.tool}:${typeof m.value === 'number' ? Math.round(m.value * 100) / 100 : m.value}`);
  }
  return hashString(parts.join('|'));
}

function _formatNumber(n, digits = 1) {
  if (n == null || !Number.isFinite(n)) return '—';
  return Number(n).toFixed(digits).replace(/\.0$/, '');
}

// Bound user-controlled free-text in prompt context (audit label, room
// names) to prevent prompt-injection via crafted strings + token bloat.
function _safeText(s, max = 80) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function _latestInAudit(audit, tool, roomId) {
  return (audit?.measurements || [])
    .filter(m => m.tool === tool && m.roomId === roomId)
    .sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0))[0];
}

export function buildAuditContext(a) {
  if (!a) return '';
  const lines = [];
  lines.push(`### Light environment audit`);
  lines.push(`Date: ${a.date}${a.label ? ` (${_safeText(a.label, 100)})` : ''}`);
  lines.push(`Snapshot taken on: ${new Date(a.createdAt || Date.now()).toISOString().slice(0, 10)}`);

  const rooms = a.rooms || [];
  const screens = a.screens || [];
  const measurements = a.measurements || [];
  lines.push(`Rooms: ${rooms.length} · Screens: ${screens.length} · Measurements: ${measurements.length}`);

  // Per-room block
  if (rooms.length) {
    lines.push('');
    lines.push('### Rooms');
    for (const r of rooms) {
      const roomLines = [`- ${_safeText(r.name) || '(unnamed)'}`];
      if (r.primarySource) roomLines.push(`  Primary source: ${_SOURCE_LABELS[r.primarySource] || r.primarySource}`);
      if (r.hoursOccupiedPerDay != null) roomLines.push(`  Hours occupied: ${r.hoursOccupiedPerDay}/day`);
      const eveHrs = getRoomEveningHoursAfterSunset(r);
      if (eveHrs > 0) roomLines.push(`  Evening use after sunset: ${eveHrs} hr/day`);
      // Latest measurements per tool, scoped to this room
      const tools = ['lux', 'flicker', 'darkness', 'cct', 'spectrum', 'glass-transmission'];
      for (const t of tools) {
        const m = _latestInAudit(a, t, r.id);
        if (!m) continue;
        switch (t) {
          case 'lux': roomLines.push(`  Lux: ${Math.round(m.value)} lux`); break;
          case 'flicker': {
            const score = Math.round(m.value || 0);
            const sLabel = ['pristine', 'mild', 'moderate', 'severe'][score] || 'unknown';
            roomLines.push(`  Flicker: ${score}/3 (${sLabel})${m.extra?.stripes ? `, ${m.extra.stripes} PWM stripes` : ''}`);
            break;
          }
          case 'darkness':
            roomLines.push(`  Sleep darkness: mean ${_formatNumber(m.extra?.meanLux ?? m.value, 2)} lux${m.extra?.peakLux != null ? `, peak ${_formatNumber(m.extra.peakLux, 2)}` : ''}`);
            break;
          case 'cct':
            roomLines.push(`  CCT: ${Math.round(m.value)} K${m.extra?.melanopic != null ? `, melanopic ${_formatNumber(m.extra.melanopic, 2)}` : ''}`);
            break;
          case 'spectrum':
            roomLines.push(`  Spectrum: ${m.value || m.extra?.label}`);
            break;
          case 'glass-transmission':
            roomLines.push(`  Window transmission: ${Math.round((m.value || 0) * 100)}%`);
            break;
        }
      }
      // Screens bound to this room
      const roomScreens = screens.filter(s => s.roomId === r.id);
      if (roomScreens.length) {
        const counts = {};
        for (const s of roomScreens) {
          const t = _SCREEN_LABELS[s.device] || s.device;
          counts[t] = (counts[t] || 0) + 1;
        }
        const desc = Object.entries(counts).map(([t, n]) => `${n}× ${t}`).join(', ');
        roomLines.push(`  Screens in room: ${desc}`);
      }
      lines.push(roomLines.join('\n'));
    }
  }

  // Portable screens
  const portable = screens.filter(s => !s.roomId);
  if (portable.length) {
    lines.push('');
    lines.push('### Portable screens');
    for (const s of portable) {
      const ev = s.eveningUseAfterSunset != null ? Number(s.eveningUseAfterSunset) : 0;
      lines.push(`- ${_SCREEN_LABELS[s.device] || s.device}: ${s.hoursPerDay || 0} hr/day${ev > 0 ? ', ' + ev + ' hr after sunset' : ''}${s.blueBlockerEnabled ? ', blue blocker on' : ''}`);
    }
  }

  // User context
  const sleep = state.importedData?.sleepRest;
  const goals = state.importedData?.healthGoals?.goals || '';
  if (goals || sleep) {
    lines.push('');
    lines.push('### User context');
    if (goals) lines.push(`Health goals: ${String(goals).slice(0, 200)}`);
    if (sleep?.qualityScore != null) lines.push(`Sleep quality (self-rated): ${sleep.qualityScore}/10`);
    if (sleep?.bedtime) lines.push(`Reported bedtime: ${sleep.bedtime}`);
  }

  return lines.join('\n');
}

const SYSTEM_PROMPT = [
  'You evaluate a frozen snapshot of a user\'s entire indoor light environment (multiple rooms + screens + tool measurements taken within ±30 days). Return one verdict that synthesizes the whole snapshot.',
  'Return ONLY valid JSON: {"dot":"green|yellow|red|gray","tip":"string","detail":"string"}.',
  '',
  'dot:',
  '  green = the environment is broadly circadian-aligned (daytime rooms bright + cool, evening rooms dim + warm, sleep rooms dark, no significant flicker, screens managed)',
  '  yellow = mostly OK with one or two specific systemic issues (one room\'s evening setup, screens unmanaged, single high-flicker fixture)',
  '  red = circadian-hostile environment overall (multiple rooms hostile, sleep room not dark, phone-in-bed, severe flicker stacking)',
  '  gray = not enough data (snapshot has no measurements)',
  '',
  'Synthesis priorities (rank issues by these when picking the verdict + tip):',
  '  1. Sleep-room contamination: any sleep-room reading meaningfully above the Brown 2022 melanopic-EDI thresholds (<1 m-EDI lux during sleep, <10 in the hour before bed; >1 photopic lux at night is a useful working proxy). Cool CCT in evening hours, phone bound to a sleep room. This dominates everything else for most users.',
  '  2. Severe flicker (score 2+) anywhere the user spends >2 evening hours.',
  '  3. Daytime rooms below ~250 m-EDI lux at the eye (Brown 2022 consensus; ≈ 500 photopic lux for typical mixed-spectrum sources, easier in daylit rooms) — under-lit entrainment is a slow-burn issue but real.',
  '  4. Evening cool LED (>4000K) + high evening occupancy in living spaces.',
  '  5. Phone-in-bed without blue blocker — single largest junk-light vector for most users.',
  '',
  'Specific patterns to flag:',
  '  • Bedroom dark but living room overhead is cool LED + 4 hr evening = melatonin onset is being suppressed BEFORE the user reaches the dark bedroom — the bedroom dark doesn\'t save you.',
  '  • Office is properly bright daytime + dark sleep room + bedroom phone = the daytime / sleep envelope is good but the in-between hour is leaking blue light.',
  '  • All rooms low-lux and warm = the user is in a "cave" environment, sleep may be fine but daytime entrainment is failing.',
  '',
  ...LIGHTING_HARDWARE_CAVEATS,
  '',
  'tip: one sentence, max 18 words. The single highest-leverage fix for THIS environment overall.',
  'detail: 3–4 sentences. Acknowledge what\'s working, name the 1–2 highest-priority issues with specific room + reading citations, and the most-leveraged fix. Concrete, observational.',
  '',
  'No "you should" — be observational. No emoji.',
].join('\n');

const engine = createAIVerdict({
  getTarget: (id) => _getAudits().find(a => a.id === id),
  getId: (a) => a?.id,
  getAIAnalysis: (a) => a?.aiAnalysis || null,
  setAIAnalysis: (a, v) => { if (v == null) delete a.aiAnalysis; else a.aiAnalysis = v; },
  getFingerprint: getAuditFingerprint,
  buildContext: buildAuditContext,
  systemPrompt: SYSTEM_PROMPT,
  maxTokens: 700,
  getAllTargets: _getAudits,
});

export const analyzeAuditAI = engine.analyze;
export const refreshAuditAIAnalysis = engine.refresh;
export const maybeAnalyzeAuditAfterSave = engine.maybeAfterFinish;

// ─── Render ────────────────────────────────────────────────────────────

// Block that lives at the top of the audit detail body. Click "Analyze
// audit" once per snapshot — the verdict is then frozen with the audit
// (via aiAnalysis.fingerprint) and won't re-fire on subsequent renders.
export function renderAuditAIBlock(a) {
  if (!a) return '';
  if (!hasAIProvider() && !(a.aiAnalysis?.status === 'ok' && a.aiAnalysis?.dot)) return '';
  const status = engine.getStatus(a);
  const verdict = a.aiAnalysis;
  if (status === 'analyzing') {
    return `<div class="light-audit-ai">
      <div class="light-audit-ai-head">⚡ AI verdict</div>
      <div class="sun-detail-ai sun-detail-ai-loading">
        <span class="sun-session-ai-dot sun-session-ai-dot-shimmer" aria-hidden="true"></span>
        <span>Synthesizing this audit…</span>
      </div>
    </div>`;
  }
  if (status === 'ok') {
    const dot = verdict.dot;
    return `<div class="light-audit-ai">
      <div class="light-audit-ai-head">⚡ AI verdict</div>
      <div class="sun-detail-ai sun-detail-ai-${escapeAttr(dot)}">
        <div class="sun-detail-ai-head">
          <span class="sun-session-ai-dot sun-session-ai-dot-${escapeAttr(dot)}" aria-hidden="true"></span>
          <span class="sun-detail-ai-tip"><span class="sun-session-ai-prefix" aria-hidden="true">${dotPrefix(dot)}</span> ${escapeHTML(verdict.tip || '')}</span>
          <button class="sun-session-ai-refresh" onclick="window.refreshAuditAIAnalysis('${escapeAttr(a.id)}')" title="Re-run analysis" aria-label="Re-run AI analysis">↻</button>
        </div>
        ${verdict.detail ? `<div class="sun-detail-ai-body">${escapeHTML(verdict.detail)}</div>` : ''}
      </div>
    </div>`;
  }
  if (status === 'error') {
    const msg = verdict?.errorMessage ? `Analysis failed — ${verdict.errorMessage}` : 'Analysis failed.';
    return `<div class="light-audit-ai">
      <div class="light-audit-ai-head">⚡ AI verdict</div>
      <div class="sun-detail-ai sun-detail-ai-error">
        <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
        <span>${escapeHTML(msg)}</span>
        <button class="sun-session-ai-refresh" onclick="window.refreshAuditAIAnalysis('${escapeAttr(a.id)}')">Try again</button>
      </div>
    </div>`;
  }
  return `<div class="light-audit-ai">
    <div class="light-audit-ai-head">⚡ AI verdict</div>
    <div class="sun-detail-ai sun-detail-ai-idle">
      <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
      <span>Get a circadian-friendliness verdict for this entire snapshot.</span>
      <button class="sun-session-ai-refresh" onclick="window.refreshAuditAIAnalysis('${escapeAttr(a.id)}')">Analyze audit</button>
    </div>
  </div>`;
}

// Compact dot for the audit card header (collapsed view) — gives users
// an at-a-glance read across multiple audits without expanding each.
export function renderAuditAIDot(a) {
  // Dot is purely a cached-verdict indicator — render whenever the
  // verdict is present, regardless of provider state.
  if (!a?.aiAnalysis?.dot) return '';
  const dot = a.aiAnalysis.dot;
  return `<span class="sun-session-ai-dot sun-session-ai-dot-${escapeAttr(dot)} light-audit-ai-dot" title="AI verdict: ${escapeAttr(a.aiAnalysis.tip || '')}" aria-hidden="true"></span>`;
}

Object.assign(window, {
  refreshAuditAIAnalysis,
  analyzeAuditAI,
  maybeAnalyzeAuditAfterSave,
  renderAuditAIBlock,
  renderAuditAIDot,
});
