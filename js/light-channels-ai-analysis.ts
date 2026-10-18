import{captureLightAIView}from'./light-ai-view-values.js';
import type{WeeklyFallbackView}from'./light-review-ai-presentation.js';
import type { ProfileData } from '../types/app-state.js';
// light-channels-ai-analysis.js — seven-day Light review. It compares the
// most recent seven days with the seven before them, while keeping sunlight
// and targeted devices separate and never grading biological completion.
//
// Storage: singleton at state.importedData.channelMixAI. Rendering queues one
// owner-scoped attempt for idle or stale data; manual refresh remains available.

import { state } from './state.js';
import { captureAIVerdictOwner } from './ai-verdict-owner.js';
import { projectReviewAI, type ReviewAIVariant } from './light-review-ai-presentation.js';
import { renderHTML } from './components/LightReviewAI.svelte.html.js';
import { showNotification } from './utils.js';
import { hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { createAIVerdict, hashString } from './ai-verdict-engine.js';
import { formatHealthGoalsText } from './health-goals-utils.js';
import { aiActionOwner, registerAIActionHandler } from './ai-action-delegates.js';
import { getDeviceSessions, rollingDeviceTotals } from './light-devices-store.js';
import { rollingChannelTotals } from './sun.js';
import { getSessions } from './sun-sessions-store.js';

import type { AnalyzeOptions, AIVerdictAnalysis } from './ai-verdict-engine.js';

// These operation views retain the original unvalidated configured/storage
// reads. They are not guarantees that callbacks or saved JSON were validated.
type ChannelDeps = { rollingChannelTotals: unknown; rollingDeviceTotals: unknown; getSessions: unknown; getDeviceSessions: unknown };
type SessionRead = { id?: unknown; startedAt?: unknown; endedAt?: unknown; durationMin?: unknown };
type MixRead = { status?: unknown; dot?: unknown; tip?: unknown; detail?: unknown; fingerprint?: unknown; errorMessage?: unknown };


const lightChannelsAIAnalysisDeps: ChannelDeps = {
  rollingChannelTotals,
  rollingDeviceTotals,
  getSessions,
  getDeviceSessions,
};

export function configureLightChannelsAIAnalysisDeps(deps: unknown = {}) {
  const previous = { ...lightChannelsAIAnalysisDeps };
  for (const name of Object.keys(lightChannelsAIAnalysisDeps)) {
    if (name in (deps as Record<string, unknown>) && typeof (deps as Record<string, unknown>)[name] === 'function') {
      lightChannelsAIAnalysisDeps[name as keyof ChannelDeps] = (deps as Record<string, unknown>)[name];
    }
  }
  return previous;
}

function _getMix(data: ProfileData = state.importedData) {
  return (data?.channelMixAI || null) as MixRead | null;
}

function _setMix(v: AIVerdictAnalysis | null, data: ProfileData) {
  if (v == null) delete data.channelMixAI;
  else data.channelMixAI = v;
}

const _CHANNEL_DEF: Record<string, { label: string; biology: string }> = {
  vitamin_d:  { label: 'Vitamin D',            biology: 'vitamin-D-effective UVB reaching uncovered skin' },
  circadian:  { label: 'Body clock',           biology: 'timed ambient light reaching the eyes' },
  nir_solar:  { label: 'Cell energy and repair', biology: 'red and near-infrared light reaching skin and deeper tissue; systemic effects remain under study' },
  no_cv:      { label: 'Blood-vessel signal',  biology: 'UVA-related release of nitric oxide stores in skin' },
  pomc:       { label: 'Skin and mood pathway', biology: 'UV-related POMC signaling in skin; downstream response is not measured' },
  violet_eye: { label: 'Outdoor eye light',    biology: 'violet/cyan exposure at the eye; human pathway details remain exploratory' },
};

function _rollingChannelTotals(days: number) {
  return (lightChannelsAIAnalysisDeps.rollingChannelTotals as (days: number) => Record<string, unknown> | null | undefined)(days) || {};
}

function _rollingDeviceTotals(days: number) {
  return (lightChannelsAIAnalysisDeps.rollingDeviceTotals as (days: number) => Record<string, unknown> | null | undefined)(days) || {};
}

function _getSessions() {
  const sessions = (lightChannelsAIAnalysisDeps.getSessions as () => unknown)();
  return Array.isArray(sessions) ? sessions as unknown[] : [];
}

function _getDeviceSessions() {
  const sessions = (lightChannelsAIAnalysisDeps.getDeviceSessions as () => unknown)();
  return Array.isArray(sessions) ? sessions as unknown[] : [];
}

function _channelTotals() {
  const sun7 = _rollingChannelTotals(7);
  const dev7 = _rollingDeviceTotals(7);
  return { sun7, dev7 };
}

const _DAY_MS = 86400000;

function _sessionTime(session: unknown) {
  return Number((session as SessionRead | null | undefined)?.endedAt || 0);
}

function _sessionsInWindow(sessions: readonly unknown[], start: number, end: number) {
  return (Array.isArray(sessions) ? sessions as unknown[] : []).filter(session => {
    const timestamp = _sessionTime(session);
    return timestamp >= start && timestamp < end;
  });
}

function _durationMinutes(session: unknown) {
  const recorded = Number((session as SessionRead | null | undefined)?.durationMin);
  if (Number.isFinite(recorded) && recorded >= 0) return recorded;
  const startedAt = Number((session as SessionRead | null | undefined)?.startedAt);
  const endedAt = Number((session as SessionRead | null | undefined)?.endedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) return 0;
  return (endedAt - startedAt) / 60000;
}

function _localDayKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function _summarizeSessions(sessions: readonly unknown[]) {
  const days = new Set<string>();
  const timing = { morning: 0, afternoon: 0, evening: 0 };
  let durationMin = 0;
  for (const session of sessions) {
    const timestamp = Number((session as SessionRead | null | undefined)?.startedAt || (session as SessionRead | null | undefined)?.endedAt || 0);
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

function _timingText(timing: { morning: number; afternoon: number; evening: number }) {
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
    parts.push(`${k}:sun${((t.sun7[k] || 0) as number) > 0 ? 1 : 0}:dev${((t.dev7[k] || 0) as number) > 0 ? 1 : 0}`);
  }
  for (const [source, sessions] of Object.entries(windows)) {
    for (const session of sessions) {
      parts.push(source, String((session as SessionRead | null | undefined)?.id || ''), String((session as SessionRead | null | undefined)?.startedAt || 0), String((session as SessionRead | null | undefined)?.endedAt || 0), String(Math.round(_durationMinutes(session))));
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
  const lines: string[] = [];

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
    const sun = ((t.sun7[k] || 0) as number) > 0 ? 'logged' : 'not logged';
    const device = ((t.dev7[k] || 0) as number) > 0 ? 'logged separately' : 'not logged';
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
  getTarget: (_id, data) => (data ? SINGLETON : null),
  getId: () => 'default',
  getAIAnalysis: (_target, data) => _getMix(data) as AIVerdictAnalysis | null,
  setAIAnalysis: (_t, v, data) => _setMix(v, data),
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
  getAllTargets: data => (data ? [SINGLETON] : []),
});

export const analyzeChannelMixAI = (opts?: AnalyzeOptions) => engine.analyze(SINGLETON, opts) as Promise<unknown>;
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

type MixSelection<F>={readonly kind:'fallback';readonly value:F|''}|{readonly kind:'ai';readonly variant:ReviewAIVariant;readonly status:import('./ai-verdict-engine.js').AIVerdictStatus;readonly analysis:MixRead|null;readonly fallback:F|undefined};
function selectChannelMixVerdict<F>(staticFallback:F):MixSelection<F>{
  const analysis = _getMix();
  const fingerprint = getChannelMixFingerprint();
  if (!hasAssistantFeatureProvider()) {
    return analysis?.status === 'ok' && analysis.dot && analysis.tip && analysis.fingerprint === fingerprint
      ? {kind:'ai',variant:'cached',status:'ok',analysis,fallback:undefined} : {kind:'fallback',value:staticFallback||''};
  }
  const status = engine.getStatus(SINGLETON);
  const stale = !!(analysis?.fingerprint && analysis.fingerprint !== fingerprint);
  if (!_hasWeeklyReviewData()) return {kind:'ai',variant:'unavailable',status,analysis,fallback:staticFallback};

  const owner = captureAIVerdictOwner();
  const key = owner.key(fingerprint);
  if ((status === 'idle' || stale) && !_autoFiredChannelKeys.has(key)) {
    _autoFiredChannelKeys.add(key);
    setTimeout(() => { if (owner.current()) void engine.analyze(SINGLETON).catch(() => {}); }, 0);
  }
  const variant = status === 'analyzing' || status === 'error' ? status
    : status === 'ok' && !stale ? 'ok' : stale ? 'stale' : 'idle';
  return {kind:'ai',variant,status,analysis,fallback:staticFallback};
}
function projectSelectedMixAI(selection:Extract<MixSelection<unknown>,{kind:'ai'}>,fallback:Parameters<typeof projectReviewAI>[0]['fallback']){
 return captureLightAIView(projectReviewAI({kind:'weekly',variant:selection.variant,status:selection.status,analysis:selection.analysis,fallback:fallback??null,actionOwner:aiActionOwner()}));
}
/** Feature composition uses the already captured native deterministic summary. */
export function getChannelMixVerdictView(staticFallback:Readonly<WeeklyFallbackView>|null){
 const selection=selectChannelMixVerdict(staticFallback);
 return selection.kind==='fallback'?selection.value||null:projectSelectedMixAI(selection,selection.fallback||null);
}
/**
 * The native providerless value/identity contract remains. Legacy fallback data
 * in an AI wrapper becomes literal text; it is never a serialized HTML child.
 */
export function renderChannelMixVerdict(staticFallback:unknown):unknown{
 const selection=selectChannelMixVerdict(staticFallback);
 if(selection.kind==='fallback')return selection.value;
 return renderHTML({view:projectSelectedMixAI(selection,{kind:'public-html',value:selection.fallback})});
}
