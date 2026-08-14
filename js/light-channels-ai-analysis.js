// @ts-check
// light-channels-ai-analysis.js — seven-day Light review. It compares the
// most recent seven days with the seven before them, while keeping sunlight
// and targeted devices separate and never grading biological completion.
//
// Storage: singleton at state.importedData.channelMixAI. Trigger is
// manual — channel totals shift across days as sessions roll into
// the 7d window, but the verdict is meaningfully stable for hours, so
// auto-fire would be wasteful.

import { state } from './state.js';
import { escapeHTML, showNotification } from './utils.js';
import { hasAIProvider } from './api.js';
import { createAIVerdict, hashString } from './ai-verdict-engine.js';
import { formatHealthGoalsText } from './health-goals-utils.js';
import { aiActionAttrs, registerAIActionHandler } from './ai-action-delegates.js';
import { getDeviceSessions, rollingDeviceTotals } from './light-devices-store.js';
import { rollingChannelTotals } from './sun.js';
import { getSessions } from './sun-sessions-store.js';

const lightChannelsAIAnalysisDeps = {
  rollingChannelTotals,
  rollingDeviceTotals,
  getSessions,
  getDeviceSessions,
};

/**
 * @param {{
 *   rollingChannelTotals?: ((days: number) => Record<string, number>) | null,
 *   rollingDeviceTotals?: ((days: number) => Record<string, number>) | null,
 *   getSessions?: (() => any[]) | null,
 *   getDeviceSessions?: (() => any[]) | null,
 * }} deps
 */
export function configureLightChannelsAIAnalysisDeps(deps = {}) {
  const previous = { ...lightChannelsAIAnalysisDeps };
  for (const name of Object.keys(lightChannelsAIAnalysisDeps)) {
    if (name in deps && typeof deps[name] === 'function') {
      lightChannelsAIAnalysisDeps[name] = deps[name];
    }
  }
  return previous;
}

function _getMix() {
  return state.importedData?.channelMixAI || null;
}

function _setMix(v) {
  if (!state.importedData) return;
  if (v == null) delete state.importedData.channelMixAI;
  else state.importedData.channelMixAI = v;
}

const _CHANNEL_DEF = {
  vitamin_d:  { label: 'Vitamin D',            biology: 'vitamin-D-effective UVB reaching uncovered skin' },
  circadian:  { label: 'Body clock',           biology: 'timed ambient light reaching the eyes' },
  nir_solar:  { label: 'Cell energy and repair', biology: 'red and near-infrared light reaching skin and deeper tissue; systemic effects remain under study' },
  no_cv:      { label: 'Blood-vessel signal',  biology: 'UVA-related release of nitric oxide stores in skin' },
  pomc:       { label: 'Skin and mood pathway', biology: 'UV-related POMC signaling in skin; downstream response is not measured' },
  violet_eye: { label: 'Outdoor eye light',    biology: 'violet/cyan exposure at the eye; human pathway details remain exploratory' },
};

function _rollingChannelTotals(days) {
  return lightChannelsAIAnalysisDeps.rollingChannelTotals(days) || {};
}

function _rollingDeviceTotals(days) {
  return lightChannelsAIAnalysisDeps.rollingDeviceTotals(days) || {};
}

function _getSessions() {
  const sessions = lightChannelsAIAnalysisDeps.getSessions();
  return Array.isArray(sessions) ? sessions : [];
}

function _getDeviceSessions() {
  const sessions = lightChannelsAIAnalysisDeps.getDeviceSessions();
  return Array.isArray(sessions) ? sessions : [];
}

function _channelTotals() {
  const sun7 = _rollingChannelTotals(7);
  const dev7 = _rollingDeviceTotals(7);
  return { sun7, dev7 };
}

const _DAY_MS = 86400000;

function _sessionTime(session) {
  return Number(session?.endedAt || 0);
}

function _sessionsInWindow(sessions, start, end) {
  return (Array.isArray(sessions) ? sessions : []).filter(session => {
    const timestamp = _sessionTime(session);
    return timestamp >= start && timestamp < end;
  });
}

function _durationMinutes(session) {
  const recorded = Number(session?.durationMin);
  if (Number.isFinite(recorded) && recorded >= 0) return recorded;
  const startedAt = Number(session?.startedAt);
  const endedAt = Number(session?.endedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) return 0;
  return (endedAt - startedAt) / 60000;
}

function _localDayKey(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function _summarizeSessions(sessions) {
  const days = new Set();
  const timing = { morning: 0, afternoon: 0, evening: 0 };
  let durationMin = 0;
  for (const session of sessions) {
    const timestamp = Number(session?.startedAt || session?.endedAt || 0);
    if (timestamp) {
      days.add(_localDayKey(timestamp));
      const hour = new Date(timestamp).getHours();
      if (hour < 12) timing.morning++;
      else if (hour < 17) timing.afternoon++;
      else timing.evening++;
    }
    durationMin += _durationMinutes(session);
  }
  return { count: sessions.length, days: days.size, durationMin: Math.round(durationMin), timing };
}

function _timingText(timing) {
  return `morning ${timing.morning}; afternoon ${timing.afternoon}; evening ${timing.evening}`;
}

function _weeklyWindows(now = Date.now()) {
  const currentStart = now - 7 * _DAY_MS;
  const previousStart = now - 14 * _DAY_MS;
  const sun = _getSessions();
  const device = _getDeviceSessions();
  return {
    currentSun: _sessionsInWindow(sun, currentStart, now),
    currentDevice: _sessionsInWindow(device, currentStart, now),
    previousSun: _sessionsInWindow(sun, previousStart, currentStart),
    previousDevice: _sessionsInWindow(device, previousStart, currentStart),
  };
}

function _hasWeeklyReviewData() {
  const windows = _weeklyWindows();
  return windows.currentSun.length + windows.currentDevice.length
    + windows.previousSun.length + windows.previousDevice.length > 0;
}

export function getChannelMixFingerprint() {
  const t = _channelTotals();
  const windows = _weeklyWindows();
  const parts = ['weekly-light-pattern-v2'];
  for (const k of Object.keys(_CHANNEL_DEF).sort()) {
    parts.push(`${k}:sun${(t.sun7[k] || 0) > 0 ? 1 : 0}:dev${(t.dev7[k] || 0) > 0 ? 1 : 0}`);
  }
  for (const [source, sessions] of Object.entries(windows)) {
    for (const session of sessions) {
      parts.push(source, String(session?.id || ''), String(session?.startedAt || 0), String(session?.endedAt || 0), String(Math.round(_durationMinutes(session))));
    }
  }
  return hashString(parts.join('|'));
}

export function buildChannelMixContext() {
  const t = _channelTotals();
  const windows = _weeklyWindows();
  const currentSun = _summarizeSessions(windows.currentSun);
  const currentDevice = _summarizeSessions(windows.currentDevice);
  const previousSun = _summarizeSessions(windows.previousSun);
  const previousDevice = _summarizeSessions(windows.previousDevice);
  const lines = [];

  lines.push('### Weekly light review');
  lines.push('Window: rolling past 7 days, compared with the previous 7 days. These are logged records, not continuous exposure measurements.');
  lines.push('');
  lines.push('### Logged sessions — past 7 days');
  lines.push(`Outdoor sun: ${currentSun.count} session(s) across ${currentSun.days} day(s), ${currentSun.durationMin} total minute(s). Timing: ${_timingText(currentSun.timing)}.`);
  lines.push(`Light-therapy devices: ${currentDevice.count} session(s) across ${currentDevice.days} day(s), ${currentDevice.durationMin} total minute(s). Timing: ${_timingText(currentDevice.timing)}.`);
  lines.push('');
  lines.push('### Comparison — previous 7 days');
  lines.push(`Outdoor sun: ${previousSun.count} session(s) across ${previousSun.days} day(s), ${previousSun.durationMin} total minute(s). Timing: ${_timingText(previousSun.timing)}.`);
  lines.push(`Light-therapy devices: ${previousDevice.count} session(s) across ${previousDevice.days} day(s), ${previousDevice.durationMin} total minute(s). Timing: ${_timingText(previousDevice.timing)}.`);
  if (currentSun.count + currentDevice.count === 0) {
    lines.push('No sessions were logged in the current period. This is missing log data, not evidence of no real-world light exposure.');
  }

  lines.push('');
  lines.push('### Light-responsive source signals — past 7 days');
  for (const [k, def] of Object.entries(_CHANNEL_DEF)) {
    const sun = (t.sun7[k] || 0) > 0 ? 'logged' : 'not logged';
    const device = (t.dev7[k] || 0) > 0 ? 'logged separately' : 'not logged';
    lines.push(`- ${def.label} (${k}): sunlight ${sun}; device ${device}. Model: ${def.biology}`);
  }

  // Goals can make a timing observation more useful, but they never turn
  // this review into a diagnosis, treatment recommendation, or target score.
  const goals = formatHealthGoalsText(state.importedData?.healthGoals);
  if (goals) lines.push(`Health goals: ${String(goals).slice(0, 200)}`);

  return lines.join('\n');
}

const SYSTEM_PROMPT = [
  'You summarize a user\'s logged light pattern for the past 7 days and compare it with the previous 7 days. Keep sunlight and devices separate. A device may deliver a targeted wavelength, but it is not full-spectrum sunlight.',
  'Return ONLY valid JSON: {"dot":"green|yellow|red|gray","tip":"string","detail":"string"}.',
  'Always return "gray" for dot. The UI is a neutral pattern review, not a traffic-light grade.',
  '',
  'Lead with the clearest comparison: source, logged days, timing, or cadence. Say "logged" whenever absence of records could be mistaken for absence of exposure.',
  'Never say the user received enough, too little, deficient, complete, balanced, low, good, strong, saturated, or a percentage of a biological target. Missing logs are missing data, not missing biology.',
  'Never infer vitamin-D status or measured synthesis. Do not turn session count or duration into a universal light requirement.',
  'Morning and evening light may have different timing effects; do not add them into one positive score.',
  'Do not recommend extra UV, uncovered midday exposure, removing sunglasses, or extending a session to activate a pathway. Never recommend looking at the sun.',
  '',
  'If only device sessions are logged, explain simply that targeted devices do not recreate the wider spectrum and time-of-day context of outdoor light.',
  'If no current sessions are logged, say the app cannot tell whether exposure was limited or simply unrecorded. Compare with the previous window only as logging activity.',
  'If sunlight is logged, acknowledge it without asking the user to collect every pathway. Deterministic UV safety belongs to the Today section, not this review.',
  '',
  'tip: one sentence, max 18 words. State the clearest change or stable pattern.',
  'detail: 2–3 short sentences. Explain the comparison, the logging uncertainty, and one safe routine-level option if useful.',
  '',
  'NEVER use jargon acronyms in the user-facing tip or detail. Specifically:',
  '  • Write "red-light therapy" or "near-infrared light" — NOT "PBM" or "photobiomodulation"',
  '  • Write "circadian" — NOT "SCN" or "melanopic" alone',
  '  • Write "mood/α-MSH" only if you also explain it in plain language; otherwise just write "mood"',
  '  • Write "cardiovascular nitric oxide" or "blood-vessel" — NOT "NO" alone',
  'The internal channel keys (vit-D, circadian, no_cv, pomc, etc) are for YOUR reasoning — translate to plain English in the output.',
  '',
  'Use plain language. No "you should". No emoji.',
].join('\n');

const SINGLETON = { key: 'default', isChannelMixTarget: true };

const engine = createAIVerdict({
  getTarget: () => (state.importedData ? SINGLETON : null),
  getId: () => 'default',
  getAIAnalysis: () => _getMix(),
  setAIAnalysis: (_t, v) => _setMix(v),
  getFingerprint: () => getChannelMixFingerprint(),
  buildContext: () => buildChannelMixContext(),
  systemPrompt: SYSTEM_PROMPT,
  maxTokens: 500,
  canAnalyze: () => {
    const now = Date.now();
    const cutoff = now - 14 * _DAY_MS;
    const sun = _getSessions();
    const dev = _getDeviceSessions();
    return sun.some(s => _sessionTime(s) >= cutoff && _sessionTime(s) < now)
      || dev.some(s => _sessionTime(s) >= cutoff && _sessionTime(s) < now);
  },
  getAllTargets: () => (state.importedData ? [SINGLETON] : []),
});

export const analyzeChannelMixAI = (opts) => engine.analyze(SINGLETON, opts);
export async function refreshChannelMixAI() {
  if (!_hasWeeklyReviewData()) {
    if (typeof document !== 'undefined') {
      showNotification('Weekly review needs at least one completed sun or device session from the past 14 days.', 'info', 4500);
    }
    return null;
  }
  return engine.refresh('default');
}
registerAIActionHandler('refresh-channel-mix', refreshChannelMixAI);

// ─── Render ────────────────────────────────────────────────────────────

// Track auto-fired channel-mix keys per session — same gate as the
// other auto-fire surfaces; prevents tight-loop refire.
const _autoFiredChannelKeys = new Set();

function _renderWeeklyAIReview(analysis, action = '') {
  return `<div class="light-channel-mix-ai">
    <section class="light-weekly-ai-review">
      <div class="light-weekly-ai-head">
        <div>
          <div class="light-weekly-period">AI summary · What changed</div>
          <div class="light-weekly-ai-tip">${escapeHTML(analysis?.tip || '')}</div>
        </div>
        ${action}
      </div>
      ${analysis?.detail ? `<div class="light-weekly-ai-detail">${escapeHTML(analysis.detail)}</div>` : ''}
    </section>
  </div>`;
}

// Drop-in replacement for renderSuggestion. The AI output is deliberately
// neutral: safety colors belong to deterministic Today checks, while this
// block only explains patterns in the two rolling seven-day windows.
export function renderChannelMixVerdict(staticFallback) {
  if (!hasAIProvider()) {
    // Pre-populated demo or cross-device synced cached verdict still
    // renders even without a provider when it matches the new source-aware
    // fingerprint. Older target/deficit verdicts must not leak back in.
    const cached = _getMix();
    const currentFp = getChannelMixFingerprint();
    if (cached?.status === 'ok' && cached?.dot && cached?.tip && cached?.fingerprint === currentFp) {
      return _renderWeeklyAIReview(cached);
    }
    return staticFallback || '';
  }
  const status = engine.getStatus(SINGLETON);
  const a = _getMix();
  const currentFp = getChannelMixFingerprint();
  const stale = !!(a?.fingerprint && a.fingerprint !== currentFp);
  const hasReviewData = _hasWeeklyReviewData();

  // A stale cached verdict can survive after its source sessions roll out of
  // both comparison periods. Do not leave a refresh button that the engine
  // must reject silently; explain the requirement beside the existing log
  // action instead. refreshChannelMixAI repeats this guard for old DOM/races.
  if (!hasReviewData) {
    return `<div class="light-channel-mix-ai">
      ${staticFallback || ''}
      <div class="light-weekly-ai-unavailable" role="status">
        <strong>AI review needs a little history.</strong>
        <span>Complete at least one sun or device session; the review will become available here.</span>
      </div>
    </div>`;
  }

  // Auto-fire only when either comparison window contains a completed
  // session. This still analyzes a current no-log week when the prior week
  // has records, but does not spend a request on a completely blank profile.
  const _autoKey = currentFp;
  if ((status === 'idle' || stale) && !_autoFiredChannelKeys.has(_autoKey)) {
    _autoFiredChannelKeys.add(_autoKey);
    setTimeout(() => engine.analyze(SINGLETON).catch(() => {}), 0);
  }

  // Shimmer ONLY while a request is genuinely in flight. Stale results fall
  // through to a refresh CTA so an older time window is never presented as
  // the current comparison.
  if (status === 'analyzing') {
    return `<div class="light-channel-mix-ai">
      <div class="light-weekly-ai-loading">
        <span class="sun-session-ai-dot sun-session-ai-dot-shimmer" aria-hidden="true"></span>
        <span>Comparing the past two weeks…</span>
      </div>
    </div>`;
  }
  if (status === 'ok' && !stale) {
    const action = `<button class="sun-session-ai-refresh" ${aiActionAttrs('refresh-channel-mix')} title="Refresh weekly review" aria-label="Refresh weekly light review">↻</button>`;
    return _renderWeeklyAIReview(a, action);
  }
  if (status === 'error') {
    const msg = a?.errorMessage ? `Analysis failed — ${a.errorMessage}` : 'Analysis failed.';
    return `<div class="light-channel-mix-ai">
      ${staticFallback || ''}
      <div class="light-weekly-ai-action-row" role="status">
        <span class="light-weekly-ai-action-status">${escapeHTML(msg)}</span>
        <button class="dashboard-action-btn light-channel-mix-ai-cta" ${aiActionAttrs('refresh-channel-mix')}>Try again</button>
      </div>
    </div>`;
  }
  // Idle, OR cached but stale (the rolling windows shifted since last run).
  const ctaLabel = stale ? 'Refresh review' : 'Generate weekly review';
  const helper = stale ? 'Your logs changed since this review was generated.' : 'Compares the past 7 days with the 7 before them.';
  return `<div class="light-channel-mix-ai">
    ${staticFallback || ''}
    <div class="light-weekly-ai-action-row">
      <button class="dashboard-action-btn light-channel-mix-ai-cta" ${aiActionAttrs('refresh-channel-mix')}><span aria-hidden="true">↻</span> ${escapeHTML(ctaLabel)}</button>
      <span class="light-weekly-ai-action-status">${escapeHTML(helper)}</span>
    </div>
  </div>`;
}
