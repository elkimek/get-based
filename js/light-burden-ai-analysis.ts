import{captureLightAIView}from'./light-ai-view-values.js';
import type { ProfileData } from '../types/app-state.js';
// light-burden-ai-analysis.js — AI verdict for the live indoor-burden
// summary at the bottom of the Light Environment block.
//
// Replaces the heuristic interpretation in computeIndoorBurden() with
// a personalized read of the user's actual room, screen and occupancy
// mix when a verdict is available from automatic analysis or refresh.
//
// Storage: singleton at state.importedData.lightEnvironment.burdenAI.
// Trigger: auto-fire on render when the user has data + no cached
// verdict (or the cached verdict's fingerprint is stale). Engine
// fingerprint coarsens to d2/d3 tier + per-room/screen shape so a
// cached verdict serves indefinitely as long as the environment
// shape doesn't change at the bucket boundary. The _autoFiredKey
// guard keeps tight-loop refire from happening on transient errors.

import { state } from './state.js';
import { captureAIVerdictOwner } from './ai-verdict-owner.js';
import { projectReviewAI, type ReviewAIVariant } from './light-review-ai-presentation.js';
import { renderHTML } from './components/LightReviewAI.svelte.html.js';
import { hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { createAIVerdict, hashString } from './ai-verdict-engine.js';
import { LIGHTING_HARDWARE_CAVEATS } from './lighting-hardware-caveats.js';
import { computeIndoorBurden, configureLightEnv, isActiveToday } from './light-env.js';
import { getRoomEveningHoursAfterSunset } from './light-env-evening.js';
import { formatHealthGoalsText } from './health-goals-utils.js';
import { aiActionOwner, registerAIActionHandler } from './ai-action-delegates.js';

import type { LightRoom, LightScreen, LightMeasurement } from './light-env-model.js';
import type { AIVerdictAnalysis, AIVerdictConfig, AIVerdictEngine } from './ai-verdict-engine.js';
type RawAnalysis = Partial<Record<keyof AIVerdictAnalysis, unknown>>;
// Private stored-container operations; cache leaves never promise parsed AI output.
interface BurdenEnvironment { rooms: LightRoom[]; screens?: LightScreen[] | null | undefined; burdenAI?: RawAnalysis | null }
type BurdenMeasurement = LightMeasurement & {roomId?: unknown; extra?: NonNullable<LightMeasurement['extra']> & {calibrationConfirmed?: unknown} | null};
type RawVerdictConfig<T> = Omit<AIVerdictConfig<T>, 'getAIAnalysis' | 'setAIAnalysis'> & {getAIAnalysis(target: T, data: ProfileData): RawAnalysis | null | undefined; setAIAnalysis(target: T, value: RawAnalysis | null, data: ProfileData): void};
type RawVerdictEngine<T> = Omit<AIVerdictEngine<T>, 'analyze' | 'refresh'> & {analyze(target: T | null | undefined, options?: Parameters<AIVerdictEngine<T>['analyze']>[1]): Promise<unknown>; refresh(id: string): Promise<unknown>};

function _getEnv(data: ProfileData = state.importedData) {
  if (!data) return null;
  if (!data.lightEnvironment) data.lightEnvironment = { rooms: [], screens: [] };
  return data.lightEnvironment as BurdenEnvironment;
}

const _SOURCE_LABELS: Record<string, string> = {
  unknown: 'unknown', incandescent: 'incandescent / halogen',
  'led-warm': 'warm LED', 'led-cool': 'cool LED',
  'led-tunable': 'tunable LED', fluorescent: 'fluorescent',
  cfl: 'CFL', 'full-spectrum': 'full-spectrum',
  daylight: 'mostly daylight (windows)',
};

const _SCREEN_LABELS: Record<string, string> = {
  phone: 'phone', tablet: 'tablet', laptop: 'laptop',
  monitor: 'monitor', tv: 'TV', ereader: 'e-reader',
};

export function getBurdenFingerprint() {
  const env = _getEnv();
  if (!env) return '';
  const burden = computeIndoorBurden();
  const parts: Array<string | number> = ([
    'v2-screening-not-dose',
    burden.tier,
    Math.round(burden.d2 * 10) / 10,
    Math.round(burden.d3 * 10) / 10,
  ]);
  for (const r of env.rooms || []) {
    if (!isActiveToday(r)) continue;
    parts.push(`r:${r.id}:${r.primarySource || ''}:${r.daylightLevel || ''}:${r.hoursOccupiedPerDay || 0}:${getRoomEveningHoursAfterSunset(r)}`);
    const latestLux = ((state.importedData?.lightMeasurements || []) as BurdenMeasurement[])
      .filter(m => m?.roomId === r.id && m.tool === 'lux')
      .sort((a, b) => ((b.capturedAt || 0) as number) - ((a.capturedAt || 0) as number))[0];
    if (latestLux) parts.push(`lux:${r.id}:${Math.round(Number(latestLux.value) || 0)}:${latestLux.extra?.source || ''}:${latestLux.extra?.calibrationConfirmed ? 1 : 0}`);
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
  const lines: string[] = [];
  lines.push('### Indoor light burden — live snapshot of the user\'s active environment');
  lines.push(`Tier: ${burden.label} (0=generally aligned / 1=mixed signals / 2=needs attention)`);
  lines.push(`Daytime opportunity screening score (d2, 0–10; not hours or dose): ${burden.d2.toFixed(1)}`);
  lines.push(`After-sunset screening score (d3, 0–10; not hours or dose): ${burden.d3.toFixed(1)}`);
  lines.push(`Evidence coverage: ${burden.daylightKnown} daylight signal(s), ${burden.eveningKnown} evening timing signal(s), ${burden.missingDaylightRooms} room daylight answer(s) missing.`);
  lines.push(`Hardcoded heuristic interp this user is ABOUT to see: "${burden.interp}"`);
  lines.push('Your job: write something more specific that references their actual rooms / screens, not just the tier label.');

  const rooms = (env.rooms || []).filter(isActiveToday);
  if (rooms.length) {
    lines.push('');
    lines.push('### Rooms active today');
    for (const r of rooms) {
      const ev = getRoomEveningHoursAfterSunset(r);
      const safeName = String(r.name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      lines.push(`- ${safeName}: source=${_SOURCE_LABELS[r.primarySource as string] || r.primarySource || 'unknown'}, daylight=${r.daylightLevel || 'unknown'}, occupied ${r.hoursOccupiedPerDay || 0} hr/day${ev > 0 ? `, ${ev} hr after sunset` : ''}`);
    }
  }

  const screens = (env.screens || []).filter(isActiveToday);
  if (screens.length) {
    lines.push('');
    lines.push('### Screens active today');
    for (const s of screens) {
      const ev = s.eveningUseAfterSunset != null ? Number(s.eveningUseAfterSunset) : 0;
      const room = s.roomId ? (env.rooms.find(r => r.id === s.roomId)?.name || 'a room') : 'portable';
      lines.push(`- ${_SCREEN_LABELS[s.device as string] || s.device} (${room}): ${s.hoursPerDay || 0} hr/day${ev > 0 ? `, ${ev} hr after sunset` : ''}${s.blueBlockerEnabled ? ', blue reduction noted (not zero exposure)' : ''}`);
    }
  }

  // User context
  const sleep = state.importedData?.sleepRest;
  const goals = formatHealthGoalsText(state.importedData?.healthGoals);
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
  'You evaluate a user\'s LIVE indoor-light screening picture: rooms, stated daylight, after-sunset timing, screens, and measurement quality.',
  'Return ONLY valid JSON: {"dot":"green|yellow|red|gray","tip":"string","detail":"string"}.',
  '',
  'dot:',
  '  green = entered information flags no clear concern and evidence coverage is adequate',
  '  yellow = a meaningful screening signal exists or evidence is incomplete',
  '  red = several strong entered signals stack; never assign red from uncalibrated camera proxies alone',
  '  gray = no mapped exposure or insufficient evidence',
  '',
  'The d2/d3 values are bounded heuristic screening scores. They are not hours, photon dose, melanopic EDI, or hormone effects. Name the specific entered room/screen signals and identify missing evidence before recommending a change.',
  '',
  'Concrete patterns to call out when present:',
  '  • A room with little stated daylight or a trustworthy low daytime lux spot-check',
  '  • A specific screen or room with long after-sunset use',
  '  • Phone-in-bed if a phone is bound to a sleep-coded room',
  '  • Missing daylight answers or only camera proxies: recommend a better measurement before a biological conclusion',
  '  • Screen tint/blue reduction: acknowledge it may help, but never subtract the exposure to zero',
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

const engine = (createAIVerdict as <T>(config: RawVerdictConfig<T>) => RawVerdictEngine<T>)({
  getTarget: (_id, data) => (_getEnv(data) ? SINGLETON : null),
  getId: () => 'default',
  getAIAnalysis: (_target, data) => _getEnv(data)?.burdenAI || null,
  setAIAnalysis: (_t, v, data) => {
    const env = _getEnv(data);
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
  getAllTargets: data => (_getEnv(data) ? [SINGLETON] : []),
});

export const analyzeBurdenAI = (opts?: Parameters<typeof engine.analyze>[1]) => engine.analyze(SINGLETON, opts);
export const refreshBurdenAIAnalysis = () => engine.refresh('default');
registerAIActionHandler('refresh-burden', refreshBurdenAIAnalysis);

// ─── Render ────────────────────────────────────────────────────────────

// Track auto-fired keys for the SINGLETON burden target — once we've
// fired in this tab session we don't refire on every render even if
// the engine errored or the cache is stale. Manual ↻ refresh stays the
// recovery path, matching the light-today auto-fire pattern.
const _autoFiredKeys = new Set<string>();

// The render integrates with the existing burden summary. Returns the
// HTML for the interp paragraph + AI affordance row (CTA / refresh /
// state). Caller is renderEnvironment() in light-env.js, which now
// delegates the interp content to this fn instead of using burden.interp
// directly. Falls through to the heuristic interp when no AI provider.
export function getBurdenInterpretationView(burden: { interp?: unknown } | null | undefined) {
  const heuristic = burden?.interp || '';
  const env = _getEnv();
  const analysis = env?.burdenAI;
  const project = (variant: ReviewAIVariant, status: import('./ai-verdict-engine.js').AIVerdictStatus = 'idle') =>
    captureLightAIView(projectReviewAI({ kind: 'burden', variant, status, analysis, heuristic, actionOwner: aiActionOwner() }));
  if (!env || ((env.rooms || []).length === 0 && (env.screens || []).length === 0)) return project('heuristic');
  const fingerprint = getBurdenFingerprint();
  if (!hasAssistantFeatureProvider()) {
    return analysis?.status === 'ok' && analysis.dot && analysis.tip && analysis.fingerprint === fingerprint
      ? project('cached', 'ok') : project('heuristic');
  }
  const status = engine.getStatus(SINGLETON);
  const stale = !!(analysis?.fingerprint && analysis.fingerprint !== fingerprint);
  const owner = captureAIVerdictOwner();
  const key = owner.key(fingerprint);
  if ((status === 'idle' || stale) && !_autoFiredKeys.has(key)) {
    _autoFiredKeys.add(key);
    setTimeout(() => { if (owner.current()) void engine.analyze(SINGLETON).catch(() => {}); }, 0);
  }
  const variant = status === 'analyzing' || status === 'error' ? status
    : status === 'ok' && !stale ? 'ok' : stale ? 'stale' : 'idle';
  return project(variant, status);
}
export function renderBurdenInterp(burden: {interp?:unknown}|null|undefined){return renderHTML({view:getBurdenInterpretationView(burden)});}

configureLightEnv({ getBurdenInterpretationView });
