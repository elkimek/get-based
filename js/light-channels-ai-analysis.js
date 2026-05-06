// light-channels-ai-analysis.js — AI verdict for the "Your light, by
// what it does" channel-mix section. Replaces the hardcoded
// renderSuggestion() that picked the single lowest-tier channel and
// returned a generic per-channel string ("10 minutes of outdoor light
// before 9 am tends to be..."). The new verdict reasons across all 6
// channels + 7d/30d trends + user goals + biomarkers, and crucially
// can recommend a SINGLE action that hits multiple channels at once
// (a morning walk feeds circadian + violet-eye + NIR + low-dose POMC
// — much higher leverage than a per-channel nudge).
//
// Storage: singleton at state.importedData.channelMixAI. Trigger is
// manual — channel totals shift across days as sessions roll into
// the 7d window, but the verdict is meaningfully stable for hours, so
// auto-fire would be wasteful.

import { state } from './state.js';
import { escapeHTML } from './utils.js';
import { hasAIProvider } from './api.js';
import { createAIVerdict, hashString, dotPrefix } from './ai-verdict-engine.js';

function _getMix() {
  return state.importedData?.channelMixAI || null;
}

function _setMix(v) {
  if (!state.importedData) return;
  if (v == null) delete state.importedData.channelMixAI;
  else state.importedData.channelMixAI = v;
}

const _CHANNEL_DEF = {
  vitamin_d:  { label: 'Vitamin D synthesis',     biology: 'UVB 290–315 nm on skin → 7-DHC → previtamin D3' },
  circadian:  { label: 'Body clock / melanopic',  biology: '450–490 nm at the eye → SCN melanopsin → cortisol/melatonin phase' },
  nir_solar:  { label: 'Cellular repair (solar NIR)', biology: '660–850 nm penetrates deep, supports mitochondria + recovery' },
  no_cv:      { label: 'Cardiovascular NO',       biology: 'UVA-violet on skin → nitric oxide release → vasodilation, BP' },
  pomc:       { label: 'Mood / α-MSH',            biology: 'UVA on skin → POMC cleavage → α-MSH, β-endorphin' },
  violet_eye: { label: 'Violet-eye dopamine',     biology: '360–440 nm at the eye → retinal dopamine, myopia + mood' },
};

function _channelTotals() {
  const sun7 = (typeof window !== 'undefined' && window.rollingChannelTotals) ? window.rollingChannelTotals(7) : {};
  const dev7 = (typeof window !== 'undefined' && window.rollingDeviceTotals) ? window.rollingDeviceTotals(7) : {};
  const sun30 = (typeof window !== 'undefined' && window.rollingChannelTotals) ? window.rollingChannelTotals(30) : {};
  const dev30 = (typeof window !== 'undefined' && window.rollingDeviceTotals) ? window.rollingDeviceTotals(30) : {};
  const merge = (a, b) => {
    const out = {};
    for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
      out[k] = (a[k] || 0) + (b[k] || 0);
    }
    return out;
  };
  return { c7: merge(sun7, dev7), c30: merge(sun30, dev30), sun7, dev7 };
}

export function getChannelMixFingerprint() {
  const t = _channelTotals();
  const tier = (typeof window !== 'undefined' && window.weeklyChannelTier) ? window.weeklyChannelTier : (() => 0);
  const parts = [];
  for (const k of Object.keys(_CHANNEL_DEF).sort()) {
    parts.push(`${k}:${tier(t.c7[k] || 0, k)}`);
  }
  // Also fingerprint sun/device session count split — a user who shifted
  // from outdoor to indoor over the week needs a different verdict.
  const sun7 = ((typeof window !== 'undefined' && window.getSessions) ? window.getSessions() : []).filter(s => s.endedAt && s.endedAt > Date.now() - 7 * 86400000).length;
  const dev7 = ((typeof window !== 'undefined' && window.getDeviceSessions) ? window.getDeviceSessions() : []).filter(s => s.endedAt > Date.now() - 7 * 86400000).length;
  parts.push(`sun7:${sun7}`, `dev7:${dev7}`);
  return hashString(parts.join('|'));
}

export function buildChannelMixContext() {
  const t = _channelTotals();
  const tier = (typeof window !== 'undefined' && window.weeklyChannelTier) ? window.weeklyChannelTier : (() => 0);
  const tierLabel = (typeof window !== 'undefined' && window.tierLabel) ? window.tierLabel : ((n) => ['none', 'low', 'moderate', 'good', 'strong'][n] || '?');
  const lines = [];

  lines.push('### Channel mix — last 7 days');
  for (const [k, def] of Object.entries(_CHANNEL_DEF)) {
    const t7 = tier(t.c7[k] || 0, k);
    const t30 = tier(t.c30[k] || 0, k);
    lines.push(`- ${def.label} (${k}): 7d tier "${tierLabel(t7)}", 30d tier "${tierLabel(t30)}". Biology: ${def.biology}`);
  }

  // Source split — outdoor vs device contribution per channel
  const sun7Total = Object.values(t.sun7 || {}).reduce((a, b) => a + b, 0);
  const dev7Total = Object.values(t.dev7 || {}).reduce((a, b) => a + b, 0);
  const sunSessCount = ((typeof window !== 'undefined' && window.getSessions) ? window.getSessions() : []).filter(s => s.endedAt && s.endedAt > Date.now() - 7 * 86400000).length;
  const devSessCount = ((typeof window !== 'undefined' && window.getDeviceSessions) ? window.getDeviceSessions() : []).filter(s => s.endedAt > Date.now() - 7 * 86400000).length;
  lines.push('');
  lines.push('### Source mix this week');
  lines.push(`Outdoor sun: ${sunSessCount} session(s)`);
  lines.push(`Light-therapy devices: ${devSessCount} session(s)`);

  // User context
  const sd = state.importedData?.sunDefaults || {};
  const goals = state.importedData?.healthGoals?.goals || '';
  if (sd.fitzpatrick) lines.push(`Skin type: Fitzpatrick ${sd.fitzpatrick}`);
  if (sd.dailyVitDTargetIU) lines.push(`Vit-D daily target: ${sd.dailyVitDTargetIU} IU`);
  if (goals) lines.push(`Health goals: ${String(goals).slice(0, 200)}`);

  // Latest 25-OH-D for context
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
  'You evaluate a user\'s 7-day light-channel mix — six biological channels driven by light: vitamin D synthesis, circadian/melanopic, cellular repair (NIR), cardiovascular NO, mood/α-MSH (POMC), and violet-eye. The user already sees a per-channel tier dot for each. Your job is to give one synthesis verdict that reasons ACROSS the channels.',
  'Return ONLY valid JSON: {"dot":"green|yellow|red|gray","tip":"string","detail":"string"}.',
  '',
  'dot:',
  '  green = at least 4 of 6 channels at "good" or "strong" tier, no critical-channel deficit',
  '  yellow = 2–3 channels lit, or one critical channel (vit-D in winter, circadian) at sub-tier',
  '  red = ≤1 channel lit, OR no sun sessions in 7 days, OR vit-D + circadian both at "none"',
  '  gray = no logged sessions',
  '',
  'CRITICAL: pick a tip that hits MULTIPLE channels with one action. Examples of high-leverage cross-channel actions:',
  '  • Morning outdoor walk (15 min before 9 am) → circadian + violet_eye + low-dose NIR + low POMC ALL at once',
  '  • Midday outdoor session with arms uncovered → vitamin_d + no_cv + pomc + nir_solar in 15 min',
  '  • Sunrise watching with eyes-direct → circadian + violet_eye + start-of-day no_cv + cortisol awakening',
  '  • Late-afternoon walk → no_cv + pomc + nir_solar (skips vitamin_d but UVB has dropped anyway)',
  'AVOID single-channel nudges like "more outdoor light before 9 am for circadian" — that\'s what the user already sees in the per-channel pill drill-downs. Your value is the SYNTHESIS — name the action that maximizes channels-per-minute-outdoors.',
  '',
  'When the user has logged device sessions but no outdoor sun: the high-leverage call is OUTDOOR — even 10 min outside delivers channels (violet_eye, NIR, no_cv, low POMC) that no panel can fill. Don\'t recommend more device time when outdoors is missing.',
  'When the user has outdoor sessions but they\'re all at one solar phase (all sunrise, or all midday): the high-leverage move is the OTHER phase — sunrise users already have circadian, need vit-D from midday; midday users have vit-D, need circadian from morning.',
  'When all 6 channels are lit: green verdict + maintenance copy. Don\'t invent gaps.',
  '',
  'tip: one sentence, max 18 words. The single multi-channel action.',
  'detail: 2–3 sentences. Acknowledge what\'s working (cite specific channels), name the gap with biology, give the concrete cross-channel fix. Reference 25-OH-D if present.',
  '',
  'No "you should" — be observational. No emoji.',
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
    const sun = (typeof window !== 'undefined' && window.getSessions) ? window.getSessions() : [];
    const dev = (typeof window !== 'undefined' && window.getDeviceSessions) ? window.getDeviceSessions() : [];
    return sun.some(s => s.endedAt) || dev.length > 0;
  },
  getAllTargets: () => (state.importedData ? [SINGLETON] : []),
});

export const analyzeChannelMixAI = (opts) => engine.analyze(SINGLETON, opts);
export const refreshChannelMixAI = () => engine.refresh('default');

// ─── Render ────────────────────────────────────────────────────────────

// Drop-in replacement for renderSuggestion. Returns a verdict block when
// AI is available + has been triggered; otherwise falls through to the
// static suggestion (caller still gets non-empty HTML for the empty
// case, so the layout doesn't shift when AI isn't configured).
export function renderChannelMixVerdict(staticFallback) {
  if (!hasAIProvider()) return staticFallback || '';
  const status = engine.getStatus(SINGLETON);
  const a = _getMix();
  const currentFp = getChannelMixFingerprint();
  const stale = a?.fingerprint && a.fingerprint !== currentFp;

  if (status === 'analyzing') {
    return `<div class="light-channel-mix-ai">
      <div class="sun-detail-ai sun-detail-ai-loading">
        <span class="sun-session-ai-dot sun-session-ai-dot-shimmer" aria-hidden="true"></span>
        <span>Analyzing your channel mix…</span>
      </div>
    </div>`;
  }
  if (status === 'ok' && !stale) {
    const dot = a.dot;
    return `<div class="light-channel-mix-ai light-channel-mix-ai-${dot}">
      <div class="sun-detail-ai sun-detail-ai-${dot}">
        <div class="sun-detail-ai-head">
          <span class="sun-session-ai-dot sun-session-ai-dot-${dot}" aria-hidden="true"></span>
          <span class="sun-detail-ai-tip"><span class="sun-session-ai-prefix" aria-hidden="true">${dotPrefix(dot)}</span> ${escapeHTML(a.tip || '')}</span>
          <button class="sun-session-ai-refresh" onclick="window.refreshChannelMixAI()" title="Re-run analysis" aria-label="Re-run AI analysis">↻</button>
        </div>
        ${a.detail ? `<div class="sun-detail-ai-body">${escapeHTML(a.detail)}</div>` : ''}
      </div>
    </div>`;
  }
  if (status === 'error') {
    const msg = a?.errorMessage ? `Analysis failed — ${a.errorMessage}` : 'Analysis failed.';
    return `<div class="light-channel-mix-ai">
      ${staticFallback || ''}
      <button class="sun-session-ai-refresh light-channel-mix-ai-cta" onclick="window.refreshChannelMixAI()">${escapeHTML(msg)} — retry</button>
    </div>`;
  }
  // Idle, OR cached but stale (channels shifted since last run).
  const ctaLabel = stale ? '✨ Refresh AI verdict (your mix changed)' : '✨ Get AI synthesis of your mix';
  return `<div class="light-channel-mix-ai">
    ${staticFallback || ''}
    <button class="sun-session-ai-refresh light-channel-mix-ai-cta" onclick="window.refreshChannelMixAI()">${escapeHTML(ctaLabel)}</button>
  </div>`;
}

Object.assign(window, {
  refreshChannelMixAI,
  analyzeChannelMixAI,
  renderChannelMixVerdict,
});
