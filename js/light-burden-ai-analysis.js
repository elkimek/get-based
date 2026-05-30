// light-burden-ai-analysis.js — AI verdict for the live indoor-burden
// summary at the bottom of the Light Environment block.
//
// Replaces (when an AI provider is configured + the user has clicked
// the CTA) the 5-branch hardcoded heuristic interp string in
// computeIndoorBurden() with a personalized read of the user's actual
// room + screen + occupancy mix.
//
// Storage: singleton at state.importedData.lightEnvironment.burdenAI.
// Trigger: auto-fire on render when the user has data + no cached
// verdict (or the cached verdict's fingerprint is stale). Engine
// fingerprint coarsens to d2/d3 tier + per-room/screen shape so a
// cached verdict serves indefinitely as long as the environment
// shape doesn't change at the bucket boundary. The _autoFiredKey
// guard keeps tight-loop refire from happening on transient errors.

import { state } from './state.js';
import { escapeHTML, escapeAttr } from './utils.js';
import { hasAIProvider } from './api.js';
import { createAIVerdict, hashString, dotPrefix } from './ai-verdict-engine.js';
import { LIGHTING_HARDWARE_CAVEATS } from './lighting-hardware-caveats.js';
import { computeDeficitAxes, computeIndoorBurden, isActiveToday } from './light-env.js';
import { getRoomEveningHoursAfterSunset } from './light-env-evening.js';

function _getEnv() {
  if (!state.importedData) return null;
  if (!state.importedData.lightEnvironment) state.importedData.lightEnvironment = { rooms: [], screens: [] };
  return state.importedData.lightEnvironment;
}

const _SOURCE_LABELS = {
  unknown: 'unknown', incandescent: 'incandescent / halogen',
  'led-warm': 'warm LED', 'led-cool': 'cool LED',
  'led-tunable': 'tunable LED', fluorescent: 'fluorescent',
  cfl: 'CFL', 'full-spectrum': 'full-spectrum',
  daylight: 'mostly daylight (windows)',
};

const _SCREEN_LABELS = {
  phone: 'phone', tablet: 'tablet', laptop: 'laptop',
  monitor: 'monitor', tv: 'TV', ereader: 'e-reader',
};

export function getBurdenFingerprint() {
  const env = _getEnv();
  if (!env) return '';
  const burden = computeIndoorBurden();
  const parts = [
    burden.tier,
    Math.round(burden.d2 * 10) / 10,
    Math.round(burden.d3 * 10) / 10,
  ];
  for (const r of env.rooms || []) {
    if (!isActiveToday(r)) continue;
    parts.push(`r:${r.id}:${r.primarySource || ''}:${r.hoursOccupiedPerDay || 0}:${getRoomEveningHoursAfterSunset(r)}`);
  }
  for (const s of env.screens || []) {
    if (!isActiveToday(s)) continue;
    parts.push(`s:${s.id}:${s.device}:${s.hoursPerDay || 0}:${s.eveningUseAfterSunset || 0}:${s.blueBlockerEnabled ? 1 : 0}`);
  }
  return hashString(parts.join('|'));
}

export function buildBurdenContext() {
  const env = _getEnv();
  if (!env) return '';
  const burden = computeIndoorBurden();
  const lines = [];
  lines.push('### Indoor light burden — live snapshot of the user\'s active environment');
  lines.push(`Tier: ${burden.label} (0=light / 1=moderate / 2=heavy)`);
  lines.push(`Daytime indoor hours (d2): ${burden.d2.toFixed(1)}`);
  lines.push(`Junk-light hours (d3 — LED-only / blue-after-sunset weighted): ${burden.d3.toFixed(1)}`);
  lines.push(`Hardcoded heuristic interp this user is ABOUT to see: "${burden.interp}"`);
  lines.push('Your job: write something more specific that references their actual rooms / screens, not just the tier label.');

  const rooms = (env.rooms || []).filter(isActiveToday);
  if (rooms.length) {
    lines.push('');
    lines.push('### Rooms active today');
    for (const r of rooms) {
      const ev = getRoomEveningHoursAfterSunset(r);
      const safeName = String(r.name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      lines.push(`- ${safeName}: source=${_SOURCE_LABELS[r.primarySource] || r.primarySource || 'unknown'}, occupied ${r.hoursOccupiedPerDay || 0} hr/day${ev > 0 ? `, ${ev} hr after sunset` : ''}`);
    }
  }

  const screens = (env.screens || []).filter(isActiveToday);
  if (screens.length) {
    lines.push('');
    lines.push('### Screens active today');
    for (const s of screens) {
      const ev = s.eveningUseAfterSunset != null ? Number(s.eveningUseAfterSunset) : 0;
      const room = s.roomId ? (env.rooms.find(r => r.id === s.roomId)?.name || 'a room') : 'portable';
      lines.push(`- ${_SCREEN_LABELS[s.device] || s.device} (${room}): ${s.hoursPerDay || 0} hr/day${ev > 0 ? `, ${ev} hr after sunset` : ''}${s.blueBlockerEnabled ? ', blue blocker on' : ''}`);
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
  'You evaluate a user\'s LIVE indoor-light burden — the right-now snapshot of which rooms + screens they actively use, weighted by hours and source spectrum.',
  'Return ONLY valid JSON: {"dot":"green|yellow|red|gray","tip":"string","detail":"string"}.',
  '',
  'dot:',
  '  green = burden is light (d2 ≤ 4 AND d3 ≤ 2 AND no sleep-room contamination)',
  '  yellow = moderate burden in one axis (long indoor hours OR meaningful evening blue, not both)',
  '  red = heavy burden in both axes OR sleep-room contamination present',
  '  gray = no rooms / screens mapped yet',
  '',
  'You\'re replacing a hardcoded 5-branch heuristic that says generic things like "Plenty of indoor daytime hours. More outdoor light — especially before 10am — is the highest-leverage fix." Your job is to do better than that by NAMING the specific rooms / screens that are driving the burden, and picking a fix that is genuinely the highest-leverage move for THIS user, not a generic talking point.',
  '',
  'Concrete patterns to call out when present:',
  '  • A specific room dominating d2 (e.g. "Office at 8 hr/day under cool LED is the bulk of d2")',
  '  • A specific screen dominating d3 (e.g. "TV at 4 hr after sunset accounts for most of the evening blue load")',
  '  • Phone-in-bed if a phone is bound to a sleep-coded room',
  '  • Daytime cave: all daytime rooms low-lux + warm = sleep is OK but daytime entrainment is failing',
  '  • Mismatch: light load but a single hostile evening fixture undoes the rest',
  '',
  ...LIGHTING_HARDWARE_CAVEATS,
  '',
  'tip: one sentence, max 18 words. Pick the SINGLE highest-leverage fix grounded in the user\'s actual setup. Reference a specific room or device by name when relevant.',
  'detail: 2–3 sentences. Acknowledge what\'s working, name the dominant burden source, give the specific fix. No restating the data verbatim.',
  '',
  'No "you should" — be observational. No emoji.',
].join('\n');

// Singleton-target wrapper. The engine treats burdenAI as a list-of-one.
const SINGLETON = { key: 'default', isBurdenTarget: true };

const engine = createAIVerdict({
  getTarget: () => (_getEnv() ? SINGLETON : null),
  getId: () => 'default',
  getAIAnalysis: () => _getEnv()?.burdenAI || null,
  setAIAnalysis: (_t, v) => {
    const env = _getEnv();
    if (!env) return;
    if (v == null) delete env.burdenAI;
    else env.burdenAI = v;
  },
  getFingerprint: () => getBurdenFingerprint(),
  buildContext: () => buildBurdenContext(),
  systemPrompt: SYSTEM_PROMPT,
  maxTokens: 500,
  canAnalyze: () => {
    const env = _getEnv();
    return !!env && ((env.rooms || []).length > 0 || (env.screens || []).length > 0);
  },
  getAllTargets: () => (_getEnv() ? [SINGLETON] : []),
});

export const analyzeBurdenAI = (opts) => engine.analyze(SINGLETON, opts);
export const refreshBurdenAIAnalysis = () => engine.refresh('default');

// ─── Render ────────────────────────────────────────────────────────────

// Track auto-fired keys for the SINGLETON burden target — once we've
// fired in this tab session we don't refire on every render even if
// the engine errored or the cache is stale. Manual ↻ refresh stays the
// recovery path, matching the light-today auto-fire pattern.
const _autoFiredKeys = new Set();

// The render integrates with the existing burden summary. Returns the
// HTML for the interp paragraph + AI affordance row (CTA / refresh /
// state). Caller is renderEnvironment() in light-env.js, which now
// delegates the interp content to this fn instead of using burden.interp
// directly. Falls through to the heuristic interp when no AI provider.
export function renderBurdenInterp(burden) {
  const heuristic = burden?.interp || '';
  const env = _getEnv();
  if (!env || ((env.rooms || []).length === 0 && (env.screens || []).length === 0)) {
    return `<p class="light-env-summary-interp">${escapeHTML(heuristic)}</p>`;
  }
  // No provider: render a cached AI verdict if one exists (pre-populated
  // demo, cross-device sync from a device that had a provider, etc.) —
  // otherwise fall back to the static heuristic interp text.
  if (!hasAIProvider()) {
    const cached = env?.burdenAI;
    if (cached?.status === 'ok' && cached?.dot && cached?.tip) {
      const dot = cached.dot;
      return `<div class="light-env-summary-ai">
        <div class="sun-detail-ai sun-detail-ai-${escapeAttr(dot)}">
          <div class="sun-detail-ai-head">
            <span class="sun-session-ai-dot sun-session-ai-dot-${escapeAttr(dot)}" aria-hidden="true"></span>
            <span class="sun-detail-ai-tip"><span class="sun-session-ai-prefix" aria-hidden="true">${dotPrefix(dot)}</span> ${escapeHTML(cached.tip)}</span>
          </div>
          ${cached.detail ? `<div class="sun-detail-ai-body">${escapeHTML(cached.detail)}</div>` : ''}
        </div>
      </div>`;
    }
    return `<p class="light-env-summary-interp">${escapeHTML(heuristic)}</p>`;
  }
  const status = engine.getStatus(SINGLETON);
  const a = env.burdenAI;
  const currentFingerprint = getBurdenFingerprint();
  const cachedFingerprint = a?.fingerprint;
  const stale = cachedFingerprint && cachedFingerprint !== currentFingerprint;

  // Auto-fire on first render when there's something to analyze AND
  // we don't have a fresh cached verdict. Same pattern as
  // renderLightTodayHero: deferred to next tick so the caller's render
  // completes (and the shimmer state has time to mount) before the
  // engine flips back to analyzing. _autoFiredKeys guards against
  // refire on transient errors.
  const _autoKey = currentFingerprint;
  if ((status === 'idle' || stale) && !_autoFiredKeys.has(_autoKey)) {
    _autoFiredKeys.add(_autoKey);
    setTimeout(() => engine.analyze(SINGLETON).catch(() => {}), 0);
  }

  // Shimmer ONLY while a request is genuinely in flight. Stale-ok falls
  // through to the bottom CTA branch ("Refresh AI verdict (your setup
  // changed)"); errored falls through to its retry CTA.
  if (status === 'analyzing') {
    return `<div class="light-env-summary-ai">
      <div class="sun-detail-ai sun-detail-ai-loading">
        <span class="sun-session-ai-dot sun-session-ai-dot-shimmer" aria-hidden="true"></span>
        <span>Analyzing your burden mix…</span>
      </div>
    </div>`;
  }
  if (status === 'ok' && !stale) {
    const dot = a.dot;
    return `<div class="light-env-summary-ai light-env-summary-ai-${dot}">
      <span class="sun-session-ai-dot sun-session-ai-dot-${dot}" aria-hidden="true"></span>
      <span class="light-env-summary-ai-tip"><span class="sun-session-ai-prefix" aria-hidden="true">${dotPrefix(dot)}</span> ${escapeHTML(a.tip || '')}</span>
      <button class="sun-session-ai-refresh" onclick="window.refreshBurdenAIAnalysis()" title="Re-run analysis" aria-label="Re-run AI analysis">↻</button>
      ${a.detail ? `<div class="light-env-summary-ai-detail">${escapeHTML(a.detail)}</div>` : ''}
    </div>`;
  }
  if (status === 'error') {
    return `<div class="light-env-summary-ai">
      <p class="light-env-summary-interp">${escapeHTML(heuristic)}</p>
      <button class="sun-session-ai-refresh light-env-summary-ai-cta" onclick="window.refreshBurdenAIAnalysis()">AI verdict failed — retry</button>
    </div>`;
  }
  // Idle, OR cached but stale (env changed since last analyze). Show the
  // heuristic + a CTA. The CTA copy adapts so the user knows when their
  // last AI take is out of date.
  const ctaLabel = stale ? 'Refresh AI verdict (your setup changed)' : '✨ Get AI verdict';
  return `<div class="light-env-summary-ai">
    <p class="light-env-summary-interp">${escapeHTML(heuristic)}</p>
    <button class="sun-session-ai-refresh light-env-summary-ai-cta" onclick="window.refreshBurdenAIAnalysis()">${escapeHTML(ctaLabel)}</button>
  </div>`;
}

Object.assign(window, {
  refreshBurdenAIAnalysis,
  analyzeBurdenAI,
  renderBurdenInterp,
});
