// light-screen-ai-analysis.js — per-screen AI verdict for the Light
// Environment screens (phone, tablet, laptop, monitor, TV, e-reader).
//
// Storage: screen.aiAnalysis on each screen object (lightEnvironment.
// screens is on the per-row CRDT — verdicts sync naturally). Manual
// trigger only — screen edits come in flurries (device → hours → evening
// → blue-blocker), and auto-firing on every chip click would burn API
// calls during a single setup pass.

import { state } from './state.js';
import { escapeHTML, escapeAttr } from './utils.js';
import { hasAIProvider } from './api.js';
import { createAIVerdict, hashString, dotPrefix } from './ai-verdict-engine.js';
import { LIGHTING_HARDWARE_CAVEATS } from './lighting-hardware-caveats.js';

function _getScreens() { return state.importedData?.lightEnvironment?.screens || []; }
function _getRooms() { return state.importedData?.lightEnvironment?.rooms || []; }
function _getRoomFor(s) {
  if (!s?.roomId) return null;
  return _getRooms().find(r => r.id === s.roomId) || null;
}

const _DEVICE_LABELS = {
  phone: 'phone', tablet: 'tablet', laptop: 'laptop',
  monitor: 'monitor', tv: 'TV', ereader: 'e-reader',
};

export function getScreenFingerprint(s) {
  if (!s) return '';
  const parts = [
    s.device || '',
    s.roomId || 'portable',
    Math.round((s.hoursPerDay || 0) * 10) / 10,
    Math.round((s.eveningUseAfterSunset || 0) * 10) / 10,
    s.blueBlockerEnabled ? 1 : 0,
  ];
  return hashString(parts.join('|'));
}

export function buildScreenContext(s) {
  if (!s) return '';
  const lines = [];
  const room = _getRoomFor(s);

  lines.push('### Screen');
  lines.push(`Device: ${_DEVICE_LABELS[s.device] || s.device || 'unspecified'}`);
  // Bound user-supplied room name to prevent prompt-injection via a
  // crafted name like "Bedroom\n[SYSTEM: ...]". 80 chars is plenty for
  // any real room name.
  const safeRoomName = room ? String(room.name || '').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  lines.push(`Used in: ${room ? safeRoomName + ' (room-bound)' : 'portable / multiple rooms'}`);
  lines.push(`Hours per day: ${s.hoursPerDay != null ? s.hoursPerDay : '—'}`);
  if (s.eveningUseAfterSunset != null) {
    const ev = Number(s.eveningUseAfterSunset);
    lines.push(`Time after sunset: ${ev > 0 ? ev + ' hr' : 'none'}`);
  }
  lines.push(`Blue blocker active: ${s.blueBlockerEnabled ? 'yes (glasses / f.lux / Night Shift / amber tint)' : 'no'}`);

  // Bedroom-phone signal — the highest-leverage call-out for most users.
  if (s.device === 'phone' && room && /bedroom|sleep/i.test(room.name || '')) {
    lines.push('');
    lines.push('NOTE: phone is bound to a sleep room. Phone-in-bed is the single largest junk-light vector for most users.');
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
  'You evaluate a single SCREEN device (phone, tablet, laptop, monitor, TV, e-reader) and its circadian impact.',
  'Return ONLY valid JSON: {"dot":"green|yellow|red|gray","tip":"string","detail":"string"}.',
  '',
  'dot:',
  '  green = use pattern is benign (low daily hours, no evening use, OR blue blocker active during evening hours)',
  '  yellow = moderate concern (multi-hour evening use without a blue blocker, or screens in sleep-relevant rooms)',
  '  red = high circadian disruption (phone in bed, multi-hour cool-bright evening use, screens visible from sleeping position)',
  '  gray = not enough data (no device set, no hours)',
  '',
  'Biology priors:',
  '  • Phone-in-bed is the single largest junk-light vector for most users — bright, blue-shifted, eye-direct, often used until sleep onset (Cain & Gradisar 2010, LeBourgeois 2017). When a phone is bound to a sleep room, treat as red unless blue-blocker is active AND evening hours are <1.',
  '  • TV in living room evening — cool blue light + bright + multi-hour. Distance helps (vs phone), but spectrum + duration usually dominate.',
  '  • Monitor / laptop work after sunset — same physiology as TV but typically eye-direct + closer + longer-duration. Blue blocker (f.lux / Night Shift / amber glasses) is the cheapest mitigation.',
  '  • E-reader (e-ink) — backlight off OR warm-tinted = green; cool backlight on at night ≈ tablet impact.',
  '  • Tablet — between phone and laptop in impact. Position-dependent (held close like a phone vs propped on a table like a TV).',
  '',
  ...LIGHTING_HARDWARE_CAVEATS,
  '',
  'tip: one sentence, max 16 words. The single most-leveraged change for THIS screen.',
  'detail: 2–3 sentences. Cite specific numbers (hours, evening hours, blue-blocker state, room context) and the biology that drives the verdict. Concrete, observational.',
  '',
  'No "you should" — be observational. No emoji.',
].join('\n');

const engine = createAIVerdict({
  getTarget: (id) => _getScreens().find(s => s.id === id),
  getId: (s) => s?.id,
  getAIAnalysis: (s) => s?.aiAnalysis || null,
  setAIAnalysis: (s, v) => { if (v == null) delete s.aiAnalysis; else s.aiAnalysis = v; },
  getFingerprint: getScreenFingerprint,
  buildContext: buildScreenContext,
  systemPrompt: SYSTEM_PROMPT,
  maxTokens: 450,
  getAllTargets: _getScreens,
});

export const analyzeScreenAI = engine.analyze;
export const refreshScreenAIAnalysis = engine.refresh;

// ─── Render ────────────────────────────────────────────────────────────

// Track auto-fired screen IDs per session — same gate as the room
// auto-fire path; prevents tight-loop refire on transient errors.
const _autoFiredScreenKeys = new Set();

export function renderScreenAIBlock(s) {
  if (!s) return '';
  if (!hasAIProvider() && !(s.aiAnalysis?.status === 'ok' && s.aiAnalysis?.dot)) return '';
  const status = engine.getStatus(s);
  const a = s.aiAnalysis;
  const currentFingerprint = getScreenFingerprint(s);
  const cachedFingerprint = a?.fingerprint;
  const stale = !!(cachedFingerprint && cachedFingerprint !== currentFingerprint);

  // Auto-fire when the user has set a device (the only mandatory field
  // — defaults to 'phone') AND we don't have a fresh cached verdict.
  // The hours/blue-blocker fields can be defaulted; the `device` field
  // gates a meaningful verdict.
  const _autoKey = `${s.id}:${currentFingerprint}`;
  if (s.device && (status === 'idle' || stale) && !_autoFiredScreenKeys.has(_autoKey)) {
    _autoFiredScreenKeys.add(_autoKey);
    setTimeout(() => engine.analyze(s).catch(() => {}), 0);
  }

  // Shimmer ONLY while a request is genuinely in flight. Stale-ok falls
  // through to the ok branch so the ↻ button stays reachable; auto-fire
  // updates the verdict underneath.
  if (status === 'analyzing') {
    return `<div class="light-env-screen-ai">
      <div class="light-env-screen-ai-head">⚡ AI verdict</div>
      <div class="sun-detail-ai sun-detail-ai-loading">
        <span class="sun-session-ai-dot sun-session-ai-dot-shimmer" aria-hidden="true"></span>
        <span>Analyzing this screen…</span>
      </div>
    </div>`;
  }
  if (status === 'ok') {
    const dot = a.dot;
    return `<div class="light-env-screen-ai">
      <div class="light-env-screen-ai-head">⚡ AI verdict</div>
      <div class="sun-detail-ai sun-detail-ai-${escapeAttr(dot)}">
        <div class="sun-detail-ai-head">
          <span class="sun-session-ai-dot sun-session-ai-dot-${escapeAttr(dot)}" aria-hidden="true"></span>
          <span class="sun-detail-ai-tip"><span class="sun-session-ai-prefix" aria-hidden="true">${dotPrefix(dot)}</span> ${escapeHTML(a.tip || '')}</span>
          <button class="sun-session-ai-refresh" onclick="window.refreshScreenAIAnalysis('${escapeAttr(s.id)}')" title="Re-run analysis" aria-label="Re-run AI analysis">↻</button>
        </div>
        ${a.detail ? `<div class="sun-detail-ai-body">${escapeHTML(a.detail)}</div>` : ''}
      </div>
    </div>`;
  }
  if (status === 'error') {
    const msg = a?.errorMessage ? `Analysis failed — ${a.errorMessage}` : 'Analysis failed.';
    return `<div class="light-env-screen-ai">
      <div class="light-env-screen-ai-head">⚡ AI verdict</div>
      <div class="sun-detail-ai sun-detail-ai-error">
        <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
        <span>${escapeHTML(msg)}</span>
        <button class="sun-session-ai-refresh" onclick="window.refreshScreenAIAnalysis('${escapeAttr(s.id)}')">Try again</button>
      </div>
    </div>`;
  }
  return `<div class="light-env-screen-ai">
    <div class="light-env-screen-ai-head">⚡ AI verdict</div>
    <div class="sun-detail-ai sun-detail-ai-idle">
      <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
      <span>Get a circadian-impact verdict for this screen.</span>
      <button class="sun-session-ai-refresh" onclick="window.refreshScreenAIAnalysis('${escapeAttr(s.id)}')">Analyze screen</button>
    </div>
  </div>`;
}

Object.assign(window, {
  refreshScreenAIAnalysis,
  analyzeScreenAI,
  renderScreenAIBlock,
});
