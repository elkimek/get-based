// sun-onboarding-ai.js — AI verdict for the Light & Sun onboarding
// completion. Synthesizes the user's setup answers + Ott burden + sleep
// complaints + goals into a personalized starting plan.
//
// Thin wrapper around ai-verdict-engine. Single-target shape (the
// sunDefaults object); the engine's list APIs handle that as a list of
// one.

import { state } from './state.js';
import { escapeHTML } from './utils.js';
import { hasAIProvider } from './api.js';
import { createAIVerdict, hashString, dotPrefix } from './ai-verdict-engine.js';
import { LIGHTING_HARDWARE_CAVEATS } from './lighting-hardware-caveats.js';

function _getDefaults() { return state.importedData?.sunDefaults || null; }

const _OTT_LABELS = {
  morningDeficit: 'No bright light within 1 hr of waking',
  glassMediated: 'Most daytime hours behind glass',
  dimWorkspace: 'Workspace under 200 lux',
  coolNightLight: 'Cool-toned LEDs after sunset',
  eveningScreens: 'Heavy screen use in evening',
  brightAfterSunset: 'Bright overhead lights after sunset',
  notDarkAtNight: 'Sleep room not fully dark',
  sunscreenAlways: 'Sunscreen even before sun comes up',
  sunglassesOutdoors: 'Sunglasses worn most outdoor time',
  noSunlight: 'Less than 30 min outdoor / day',
};

const _HOME_LIGHT_LABELS = {
  'led-cool': 'cool-white LED', 'led-warm': 'warm LED', 'led-tunable': 'tunable LED',
  'incandescent': 'incandescent / halogen', 'fluorescent': 'fluorescent',
  'candle': 'candles + dim warm sources', 'natural-only': 'mostly daylight (windows / outdoor)',
  'mixed': 'mixed sources', 'unknown': 'not sure',
};

const _EYEWEAR_LABELS = {
  'none': 'no eyewear outdoors', 'sunglasses': 'sunglasses',
  'clear-prescription': 'clear prescription', 'both': 'sunglasses + prescription combinations',
  'contacts-uv': 'UV-blocking contacts',
};

const _PSM_LABELS = {
  none: 'none',
  mild: 'mild (e.g., antihistamines)',
  moderate: 'moderate (e.g., NSAIDs, thiazide diuretics, sulfa, retinols)',
  severe: 'severe (e.g., tetracyclines, oral retinoids, amiodarone)',
};

export function getDefaultsFingerprint() {
  const d = _getDefaults();
  if (!d) return '';
  const parts = [
    d.fitzpatrick || '',
    d.photosensitiveMeds || 'none',
    d.homeLight || '',
    d.eyewear || '',
    d.ottScore != null ? d.ottScore : '',
  ];
  if (d.ott && typeof d.ott === 'object') {
    for (const k of Object.keys(d.ott).sort()) {
      parts.push(`${k}:${d.ott[k] ? 1 : 0}`);
    }
  }
  return hashString(parts.join('|'));
}

export function buildOnboardingContext() {
  const d = _getDefaults();
  if (!d) return '';
  const lines = [];
  lines.push('### Light & Sun setup answers');
  lines.push(`Skin type: Fitzpatrick ${d.fitzpatrick || '?'}`);
  if (d.photosensitiveMeds && d.photosensitiveMeds !== 'none') {
    lines.push(`Photosensitizing medication tier: ${_PSM_LABELS[d.photosensitiveMeds] || d.photosensitiveMeds}`);
  }
  if (d.homeLight) lines.push(`Home / workspace lighting: ${_HOME_LIGHT_LABELS[d.homeLight] || d.homeLight}`);
  if (d.eyewear) lines.push(`Eyewear outdoors: ${_EYEWEAR_LABELS[d.eyewear] || d.eyewear}`);

  if (d.ott && typeof d.ott === 'object') {
    const flagged = Object.keys(d.ott).filter(k => d.ott[k]);
    if (flagged.length) {
      lines.push('');
      lines.push(`### Indoor-light burden audit (10-question Ott)`);
      lines.push(`Score: ${d.ottScore}/10 burden (${10 - d.ottScore}/10 aligned)`);
      lines.push('Flagged signals:');
      for (const k of flagged) lines.push(`  - ${_OTT_LABELS[k] || k}`);
    } else if (d.ottScore === 0) {
      lines.push('Indoor-light burden audit: zero flags (perfectly aligned).');
    }
  }

  const goals = state.importedData?.healthGoals?.goals || '';
  const sleep = state.importedData?.sleepRest;
  if (goals || sleep) {
    lines.push('');
    lines.push('### User context');
    if (goals) lines.push(`Health goals: ${String(goals).slice(0, 250)}`);
    if (sleep?.qualityScore != null) lines.push(`Sleep quality (self-rated): ${sleep.qualityScore}/10`);
    if (sleep?.bedtime) lines.push(`Reported bedtime: ${sleep.bedtime}`);
    if (sleep?.wakeup) lines.push(`Reported wake time: ${sleep.wakeup}`);
  }

  const profileLoc = state.importedData?.profile?.location;
  if (profileLoc?.lat != null) {
    const absLat = Math.abs(profileLoc.lat);
    let latNote = '';
    if (absLat > 50) latNote = ' (high latitude — winter UVB <2 for ~4 months/year)';
    else if (absLat > 35) latNote = ' (mid latitude — winter UVB diminished)';
    else if (absLat < 23) latNote = ' (tropical — year-round UVB available)';
    lines.push(`Profile latitude: ${profileLoc.lat}°${latNote}`);
  }

  try {
    const entries = (state.importedData?.entries || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    for (const e of entries) {
      const v = e?.values?.hormones?.['25-oh-vitamin-d'] ?? e?.values?.lipids?.['25-oh-vitamin-d'];
      if (v != null) { lines.push(`Latest 25-OH-D: ${v} (${e.date})`); break; }
    }
  } catch (_) {}

  return lines.join('\n');
}

const SYSTEM_PROMPT = [
  'You synthesize a user\'s Light & Sun setup answers into a brief contextual read of how their skin type + location + lighting environment shape what matters most for them. The output frames the user\'s situation rather than prescribing a step-by-step plan.',
  'Return ONLY valid JSON: {"dot":"green|yellow|red|gray","tip":"string","detail":"string","actions":["string","string","string"]}.',
  '',
  'dot:',
  '  green = setup is well-aligned (low Ott burden, eyewear/clothing protocol matches goals, lighting environment supports circadian rhythm)',
  '  yellow = mostly OK but specific gaps to address (1–3 Ott flags + minor home lighting issue)',
  '  red = high indoor-light burden / circadian-hostile environment (Ott score 6+, cool LED at night, no morning anchor, sleep room not dark)',
  '  gray = not enough data (defaults missing)',
  '',
  'Weigh signals together — a Fitzpatrick I user with sunglasses-always at high latitude has a vitamin-D risk that a Fitzpatrick V user at low latitude doesn\'t. Photosensitizing meds shrink the safe-dose window dramatically (severe = 4× faster burn). Cool LEDs in evening + sleep-room not dark is a stacked melatonin attack.',
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
  getTarget: () => (_getDefaults() ? SINGLETON_TARGET : null),
  getId: () => 'default',
  getAIAnalysis: () => _getDefaults()?.aiAnalysis || null,
  setAIAnalysis: (_t, v) => {
    const d = _getDefaults();
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
      ? parsed.actions.slice(0, 5).map(a => String(a).slice(0, 200))
      : [],
  }),
  getAllTargets: () => (_getDefaults() ? [SINGLETON_TARGET] : []),
});

export const analyzeOnboardingAI = (opts) => engine.analyze(SINGLETON_TARGET, opts);
export const refreshOnboardingAIAnalysis = () => engine.refresh('default');
export function maybeAnalyzeOnboardingAfterSave() {
  engine.maybeAfterFinish(SINGLETON_TARGET);
}

// ─── Render ────────────────────────────────────────────────────────────

export function renderOnboardingAIBlock() {
  const d = _getDefaults();
  if (!d || !d.completedAt) return '';
  if (!hasAIProvider() && !(d.aiAnalysis?.status === 'ok' && d.aiAnalysis?.dot)) return '';
  const status = engine.getStatus(SINGLETON_TARGET);
  const a = d.aiAnalysis;
  if (status === 'analyzing') {
    return `<div class="light-setup-ai-block">
      <div class="light-setup-ai-head">Your light context</div>
      <div class="sun-detail-ai sun-detail-ai-loading">
        <span class="sun-session-ai-dot sun-session-ai-dot-shimmer" aria-hidden="true"></span>
        <span>Synthesizing your setup…</span>
      </div>
    </div>`;
  }
  if (status === 'ok') {
    const dot = a.dot;
    const actionsHtml = Array.isArray(a.actions) && a.actions.length
      ? `<ul class="light-setup-ai-actions">${a.actions.map(s => `<li>${escapeHTML(s)}</li>`).join('')}</ul>`
      : '';
    return `<div class="light-setup-ai-block light-setup-ai-block-${dot}">
      <div class="light-setup-ai-head">
        <span class="light-setup-ai-head-label">Your light context</span>
        <button class="sun-session-ai-refresh" onclick="window.refreshOnboardingAIAnalysis()" title="Re-run analysis" aria-label="Re-run">↻</button>
      </div>
      <div class="sun-detail-ai sun-detail-ai-${dot}">
        <div class="sun-detail-ai-head">
          <span class="sun-session-ai-dot sun-session-ai-dot-${dot}" aria-hidden="true"></span>
          <span class="sun-detail-ai-tip"><span class="sun-session-ai-prefix" aria-hidden="true">${dotPrefix(dot)}</span> ${escapeHTML(a.tip || '')}</span>
        </div>
        ${a.detail ? `<div class="sun-detail-ai-body">${escapeHTML(a.detail)}</div>` : ''}
        ${actionsHtml}
      </div>
    </div>`;
  }
  if (status === 'error') {
    const msg = a?.errorMessage ? `Analysis failed — ${a.errorMessage}` : 'Analysis failed.';
    return `<div class="light-setup-ai-block">
      <div class="light-setup-ai-head">Your light context</div>
      <div class="sun-detail-ai sun-detail-ai-error">
        <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
        <span>${escapeHTML(msg)}</span>
        <button class="sun-session-ai-refresh" onclick="window.refreshOnboardingAIAnalysis()">Try again</button>
      </div>
    </div>`;
  }
  return `<div class="light-setup-ai-block">
    <div class="light-setup-ai-head">Your light context</div>
    <div class="sun-detail-ai sun-detail-ai-idle">
      <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
      <span>Get a contextual read on your skin type, lighting environment, and goals.</span>
      <button class="sun-session-ai-refresh" onclick="window.refreshOnboardingAIAnalysis()">Generate plan</button>
    </div>
  </div>`;
}

Object.assign(window, {
  refreshOnboardingAIAnalysis,
  analyzeOnboardingAI,
  maybeAnalyzeOnboardingAfterSave,
  renderOnboardingAIBlock,
});
