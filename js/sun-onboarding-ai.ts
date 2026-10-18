import type { ProfileData } from '../types/app-state.js';
// sun-onboarding-ai.js — AI verdict for the Light & Sun onboarding
// completion. Synthesizes the user's setup answers + light patterns + sleep
// complaints + goals into a personalized starting plan.
//
// Thin wrapper around ai-verdict-engine. Single-target shape (the
// sunDefaults object); the engine's list APIs handle that as a list of
// one.

import type { SunSetupDefaults } from './sun-defaults-model.js';
import type { AIVerdictAnalysis, AnalyzeOptions } from './ai-verdict-engine.js';

export interface OnboardingAIAnalysis extends AIVerdictAnalysis { actions?: unknown }
export interface OnboardingDefaults extends SunSetupDefaults {
  completedAt?: unknown;
  aiAnalysis?: OnboardingAIAnalysis | null;
}

import { state } from './state.js';
import { latestVitaminDContext } from './lab-vitamin-d-context.js';
import { projectOnboardingAI } from './light-onboarding-ai-presentation.js';
import { renderHTML } from './components/LightOnboardingAI.svelte.html.js';
import { hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { createAIVerdict, hashString, dotPrefix } from './ai-verdict-engine.js';
import { LIGHTING_HARDWARE_CAVEATS } from './lighting-hardware-caveats.js';
import { formatHealthGoalsText } from './health-goals-utils.js';
import { aiActionOwner, registerAIActionHandler } from './ai-action-delegates.js';
import { getSunSetupCoords } from './sun-defaults-runtime.js';

function _getDefaults(data: ProfileData = state.importedData) { return (data?.sunDefaults as OnboardingDefaults | null | undefined) || null; }

const _OTT_LABELS: Record<string, string> = {
  'morning-light-deficit': 'Little or no outdoor daylight in the first 1–2 hours after waking',
  'glass-mediated-daytime': 'Most daytime hours behind glass',
  'dim-workspace': 'Dim daytime workspace with little daylight',
  'cool-led-evening': 'Bright, cool or blue-enriched evening light',
  'evening-screens': 'Bright screens during the 2 hours before bed',
  'bright-after-sunset': 'Bright room or overhead light before sleep',
  'sleep-not-dark': 'Light reaches the eyes during sleep',
  'sunscreen-blocks-uvb': 'Sunscreen used on most sun-exposed days',
  'sunglasses-outside': 'Sunglasses worn most outdoor time',
  'low-outdoor-time': 'Less than 30 minutes outdoors on a typical day',
};

const _HOME_LIGHT_LABELS: Record<string, string> = {
  'led-cool': 'cool-white LED', 'led-warm': 'warm LED', 'led-tunable': 'tunable LED',
  'incandescent': 'incandescent / halogen', 'fluorescent': 'fluorescent',
  'candle': 'candles + dim warm sources', 'natural-only': 'mostly daylight (windows / outdoor)',
  'mixed': 'mixed sources', 'unknown': 'not sure',
};

const _EYEWEAR_LABELS: Record<string, string> = {
  'none': 'no eyewear outdoors', 'sunglasses': 'sunglasses',
  'clear-glasses': 'clear prescription glasses', 'both': 'sunglasses + prescription combinations',
  'contacts-uv': 'UV-blocking contacts',
};

const _PSM_LABELS: Record<string, string> = {
  unknown: 'not reviewed',
  none: 'no known warning',
  mild: 'possible sunlight warning',
  moderate: 'known sunlight warning',
  severe: 'prior reaction or strict avoidance warning',
};

export function getDefaultsFingerprint() {
  if (!_getDefaults()) return '';
  return hashString(buildOnboardingContext());
}

export function buildOnboardingContext() {
  const d = _getDefaults();
  if (!d) return '';
  const lines: string[] = [];
  lines.push('### Light & Sun setup answers');
  lines.push(`Skin type: Fitzpatrick ${d.fitzpatrick || '?'}`);
  if (d.photosensitiveMeds && d.photosensitiveMeds !== 'none') {
    lines.push(`Photosensitizing medication tier: ${_PSM_LABELS[d.photosensitiveMeds as string] || d.photosensitiveMeds}`);
  }
  if (d.homeLight) lines.push(`Home / workspace lighting: ${_HOME_LIGHT_LABELS[d.homeLight] || d.homeLight}`);
  if (d.eyewear) lines.push(`Eyewear outdoors: ${_EYEWEAR_LABELS[d.eyewear] || d.eyewear}`);

  if (d.ott && typeof d.ott === 'object') {
    const flagged = Object.keys(d.ott).filter(k => d.ott![k]);
    if (flagged.length) {
      lines.push('');
      lines.push('### Light timing and spectrum context (10-question map)');
      lines.push(`Patterns selected: ${d.ottScore}/10 (educational context, not a clinical score)`);
      lines.push('Selected patterns:');
      for (const k of flagged) lines.push(`  - ${_OTT_LABELS[k] || k}`);
    } else if (d.ottScore === 0) {
      lines.push('Light timing and spectrum context: no patterns selected. Do not infer perfect alignment from this alone.');
    }
  }

  const goals = formatHealthGoalsText(state.importedData?.healthGoals);
  const sleep = state.importedData?.sleepRest;
  if (goals || sleep) {
    lines.push('');
    lines.push('### User context');
    if (goals) lines.push(`Health goals: ${String(goals).slice(0, 250)}`);
    if (sleep?.qualityScore != null) lines.push(`Sleep quality (self-rated): ${sleep.qualityScore}/10`);
    if (sleep?.bedtime) lines.push(`Reported bedtime: ${sleep.bedtime}`);
    if (sleep?.wakeup) lines.push(`Reported wake time: ${sleep.wakeup}`);
  }

  const resolvedCoords = getSunSetupCoords();
  if (resolvedCoords?.lat != null) {
    const latitude = Number(resolvedCoords.lat);
    const absLat = Math.abs(latitude);
    let latNote = '';
    if (absLat > 50) latNote = ' (high latitude — strong seasonal change in day length and UVB availability)';
    else if (absLat > 35) latNote = ' (mid latitude — meaningful seasonal change in day length and UVB availability)';
    else if (absLat < 23) latNote = ' (low latitude — smaller seasonal solar-angle change)';
    lines.push(`Resolved latitude: ${latitude.toFixed(2)}°${latNote}; source: ${resolvedCoords.source || 'unknown'}`);
  }

  const vitaminD = latestVitaminDContext(state.importedData?.entries);
  if (vitaminD) lines.push(vitaminD);

  return lines.join('\n');
}

const SYSTEM_PROMPT = [
  'You synthesize a user\'s Light & Sun setup answers into a brief contextual read of how their skin type + location + lighting environment shape what matters most for them. The output frames the user\'s situation rather than prescribing a step-by-step plan.',
  'Return ONLY valid JSON: {"dot":"green|yellow|red|gray","tip":"string","detail":"string","actions":["string","string","string"]}.',
  '',
  'dot:',
  '  green = available context suggests supportive day–night timing, without claiming a health grade',
  '  yellow = one or more practical timing or light-environment patterns merit attention',
  '  red = use only for a clear, high-priority pattern supported by the answers; never derive it from sunscreen or eyewear alone',
  '  gray = not enough data (defaults missing)',
  '',
  'Treat Fitzpatrick type as a rough UV-model reference, not a diagnosis or safe-time guarantee. A photosensitivity flag adds uncertainty and caution; never invent a numeric burn multiplier.',
  'Treat sunscreen and eyewear as spectrum and dose-context modifiers, not proof of harm. Do not advise stopping prescribed protection, looking at the sun, exposing eyes to UV, or extending exposure. Ocular UVB activation of POMC / α-MSH has been shown in mice, but a human skin-protection effect from removing sunglasses is unproven.',
  '',
  ...LIGHTING_HARDWARE_CAVEATS,
  '',
  'tip: one sentence, max 18 words. The single highest-leverage starting habit. Direct.',
  'detail: 2–3 sentences. Acknowledge the user\'s starting state, name the 1–2 biggest opportunities, and bridge to actions. Reference numbers when given.',
  'actions: array of 3 short concrete first-week actions, each ≤14 words. Imperative voice ("Walk outside within 10 min of waking"). Specific, not generic. Any action involving fixtures or dimming MUST honor the hardware caveats above.',
  '',
  'No "you should" — observational + imperative actions. No emoji.',
].join('\n');

// Synthetic single-target wrapper. The engine treats sunDefaults as a
// list-of-one keyed by the literal string 'default'.
const SINGLETON_TARGET = { key: 'default', isOnboardingTarget: true };

const engine = createAIVerdict({
  getTarget: (_id, data) => (_getDefaults(data) ? SINGLETON_TARGET : null),
  getId: () => 'default',
  getAIAnalysis: (_target, data) => _getDefaults(data)?.aiAnalysis || null,
  setAIAnalysis: (_t, v, data) => {
    const d = _getDefaults(data);
    if (!d) return;
    if (v == null) delete d.aiAnalysis;
    else d.aiAnalysis = v;
  },
  getFingerprint: () => getDefaultsFingerprint(),
  buildContext: () => buildOnboardingContext(),
  systemPrompt: SYSTEM_PROMPT,
  maxTokens: 700,
  canAnalyze: () => !!_getDefaults()?.completedAt,
  shouldAutoFire: () => !!_getDefaults()?.completedAt,
  parseExtraFields: (parsed) => ({
    actions: Array.isArray(parsed.actions)
      ? parsed.actions.slice(0, 5).map((a: unknown) => String(a).slice(0, 200))
      : [],
  }),
  getAllTargets: data => (_getDefaults(data) ? [SINGLETON_TARGET] : []),
});

export const analyzeOnboardingAI = (opts?: AnalyzeOptions) => engine.analyze(SINGLETON_TARGET, opts);
export const refreshOnboardingAIAnalysis = () => engine.refresh('default');
registerAIActionHandler('refresh-onboarding', refreshOnboardingAIAnalysis);
export function maybeAnalyzeOnboardingAfterSave() {
  engine.maybeAfterFinish(SINGLETON_TARGET);
}

// ─── Render ────────────────────────────────────────────────────────────

export function getOnboardingAIView() {
  const defaults = _getDefaults();
  const view = projectOnboardingAI({ actionOwner: aiActionOwner(), completed: !!defaults?.completedAt, provider: hasAssistantFeatureProvider(),
    status: engine.getStatus(SINGLETON_TARGET), analysis: defaults?.aiAnalysis, prefix: dotPrefix(defaults?.aiAnalysis?.dot) });
  return view;
}
export function renderOnboardingAIBlock(){const view=getOnboardingAIView();return view?renderHTML({view}):'';}
