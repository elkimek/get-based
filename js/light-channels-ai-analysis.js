// @ts-check
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
import { escapeHTML, escapeAttr } from './utils.js';
import { hasAIProvider } from './api.js';
import { createAIVerdict, hashString, dotPrefix } from './ai-verdict-engine.js';
import { formatHealthGoalsText } from './health-goals-utils.js';
import { aiActionAttrs, registerAIActionHandler } from './ai-action-delegates.js';

function _getMix() {
  return state.importedData?.channelMixAI || null;
}

function _setMix(v) {
  if (!state.importedData) return;
  if (v == null) delete state.importedData.channelMixAI;
  else state.importedData.channelMixAI = v;
}

const _CHANNEL_DEF = {
  vitamin_d:  { label: 'Vitamin D potential',      biology: 'modeled UVB on skin; IU-equivalent estimate, not a blood measurement' },
  circadian:  { label: 'Body clock light',         biology: 'blue-weighted brightness at the eye; timing and duration matter' },
  nir_solar:  { label: 'Solar red and infrared',   biology: 'modeled red and near-infrared sunlight on exposed skin' },
  no_cv:      { label: 'UVA on skin',               biology: 'modeled UVA exposure; cannot predict a cardiovascular outcome' },
  pomc:       { label: 'Skin UV response',          biology: 'modeled skin UV exposure; not a mood or hormone measurement' },
  violet_eye: { label: 'Outdoor light',             biology: 'short-wavelength outdoor light at the eye; not an eye-health dose' },
};

function _runtime() {
  return /** @type {Record<string, any>} */ (globalThis);
}

function _callRuntime(name, ...args) {
  const fn = _runtime()[name];
  return typeof fn === 'function' ? fn(...args) : null;
}

function _rollingChannelTotals(days) {
  return _callRuntime('rollingChannelTotals', days) || {};
}

function _rollingDeviceTotals(days) {
  return _callRuntime('rollingDeviceTotals', days) || {};
}

function _getSessions() {
  return _callRuntime('getSessions') || [];
}

function _getDeviceSessions() {
  return _callRuntime('getDeviceSessions') || [];
}

function _weeklyChannelTier(value, channelKey) {
  const tier = _runtime().weeklyChannelTier;
  return typeof tier === 'function' ? tier(value, channelKey) : 0;
}

function _tierLabel(tier) {
  const label = _runtime().tierLabel;
  return typeof label === 'function'
    ? label(tier)
    : (['none', 'low', 'moderate', 'good', 'strong'][tier] || '?');
}

function _channelTotals() {
  const sun7 = _rollingChannelTotals(7);
  const dev7 = _rollingDeviceTotals(7);
  const sun30 = _rollingChannelTotals(30);
  const dev30 = _rollingDeviceTotals(30);
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
  const parts = [];
  for (const k of Object.keys(_CHANNEL_DEF).sort()) {
    parts.push(`${k}:${_weeklyChannelTier(t.c7[k] || 0, k)}`);
  }
  // Also fingerprint sun/device session count split — a user who shifted
  // from outdoor to indoor over the week needs a different verdict.
  const sun7 = _getSessions().filter(s => s.endedAt && s.endedAt > Date.now() - 7 * 86400000).length;
  const dev7 = _getDeviceSessions().filter(s => s.endedAt > Date.now() - 7 * 86400000).length;
  parts.push(`sun7:${sun7}`, `dev7:${dev7}`);
  return hashString(parts.join('|'));
}

export function buildChannelMixContext() {
  const t = _channelTotals();
  const lines = [];

  lines.push('### Channel mix — last 7 days');
  for (const [k, def] of Object.entries(_CHANNEL_DEF)) {
    const t7 = _weeklyChannelTier(t.c7[k] || 0, k);
    const t30 = _weeklyChannelTier(t.c30[k] || 0, k);
    lines.push(`- ${def.label} (${k}): 7d tier "${_tierLabel(t7)}", 30d tier "${_tierLabel(t30)}". Biology: ${def.biology}`);
  }

  // Source split — outdoor vs device contribution per channel
  const sun7Total = Object.values(t.sun7 || {}).reduce((a, b) => a + b, 0);
  const dev7Total = Object.values(t.dev7 || {}).reduce((a, b) => a + b, 0);
  const sunSessCount = _getSessions().filter(s => s.endedAt && s.endedAt > Date.now() - 7 * 86400000).length;
  const devSessCount = _getDeviceSessions().filter(s => s.endedAt > Date.now() - 7 * 86400000).length;
  lines.push('');
  lines.push('### Source mix this week');
  lines.push(`Outdoor sun: ${sunSessCount} session(s)`);
  lines.push(`Light-therapy devices: ${devSessCount} session(s)`);

  // User context
  const sd = state.importedData?.sunDefaults || {};
  const goals = formatHealthGoalsText(state.importedData?.healthGoals);
  if (sd.fitzpatrick) lines.push(`Skin type: Fitzpatrick ${sd.fitzpatrick}`);
  if (sd.dailyVitDTargetIU) lines.push(`User vitamin-D comparison setting: ${sd.dailyVitDTargetIU} IU-equivalent/day (not a measured requirement)`);
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
  'You help a user understand their 7-day light-exposure pattern across six modeled channels.',
  'Return ONLY valid JSON: {"dot":"green|yellow|red|gray","tip":"string","detail":"string"}.',
  '',
  'dot:',
  '  green = a regular, well-documented daytime-light pattern with no safety concern',
  '  yellow = the pattern is sparse, irregular, or has an input-quality caveat',
  '  red = a recorded safety concern, not merely a low exposure channel',
  '  gray = no logged sessions',
  '',
  'Pick one low-friction action that improves the usefulness of the pattern, usually a repeatable outdoor-light break or a dimmer evening routine.',
  'Never optimize for channels-per-minute, uncovered skin, removed sunglasses, or looking toward the solar disc.',
  '',
  'A low UVA, skin-UV, infrared, or outdoor-light index is not a deficiency and does not justify corrective exposure.',
  'Vitamin D potential is an estimate; mention 25(OH)D labs when actual status matters. UVI 3 or higher calls for normal sun protection.',
  '',
  'tip: one sentence, max 18 words. The single multi-channel action.',
  'detail: 2–3 sentences. Name the observed pattern, explain one limitation, and give one safe, concrete next step.',
  '',
  'NEVER use jargon acronyms in the user-facing tip or detail. Specifically:',
  '  • Write "red-light therapy" or "near-infrared light" — NOT "PBM" or "photobiomodulation"',
  '  • Write "circadian" — NOT "SCN" or "melanopic" alone',
  '  • Write "skin UV exposure" rather than hormone-pathway acronyms',
  '  • Write "UVA on skin" rather than claiming a cardiovascular result',
  'The internal channel keys (vit-D, circadian, no_cv, pomc, etc) are for YOUR reasoning — translate to plain English in the output.',
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
    const sun = _getSessions();
    const dev = _getDeviceSessions();
    return sun.some(s => s.endedAt) || dev.length > 0;
  },
  getAllTargets: () => (state.importedData ? [SINGLETON] : []),
});

export const analyzeChannelMixAI = (opts) => engine.analyze(SINGLETON, opts);
export const refreshChannelMixAI = () => engine.refresh('default');
registerAIActionHandler('refresh-channel-mix', refreshChannelMixAI);

// ─── Render ────────────────────────────────────────────────────────────

// Track auto-fired channel-mix keys per session — same gate as the
// other auto-fire surfaces; prevents tight-loop refire.
const _autoFiredChannelKeys = new Set();

// Drop-in replacement for renderSuggestion. Returns a verdict block when
// AI is available + has been triggered; otherwise falls through to the
// static suggestion (caller still gets non-empty HTML for the empty
// case, so the layout doesn't shift when AI isn't configured).
export function renderChannelMixVerdict(staticFallback) {
  if (!hasAIProvider()) {
    // Pre-populated demo or cross-device synced cached verdict still
    // renders even without a provider — only fresh analyses are gated.
    const cached = _getMix();
    if (cached?.status === 'ok' && cached?.dot && cached?.tip) {
      const dot = cached.dot;
      return `<div class="light-channel-mix-ai">
        <div class="sun-detail-ai sun-detail-ai-${escapeAttr(dot)}">
          <div class="sun-detail-ai-head">
            <span class="sun-session-ai-dot sun-session-ai-dot-${escapeAttr(dot)}" aria-hidden="true"></span>
            <span class="sun-detail-ai-tip"><span class="sun-session-ai-prefix" aria-hidden="true">${dotPrefix(dot)}</span> ${escapeHTML(cached.tip)}</span>
          </div>
          ${cached.detail ? `<div class="sun-detail-ai-body">${escapeHTML(cached.detail)}</div>` : ''}
        </div>
      </div>`;
    }
    return staticFallback || '';
  }
  const status = engine.getStatus(SINGLETON);
  const a = _getMix();
  const currentFp = getChannelMixFingerprint();
  const stale = !!(a?.fingerprint && a.fingerprint !== currentFp);

  // Auto-fire on first render when there's actual signal in the mix —
  // gated on rolling totals having any non-zero channel so a brand-new
  // user without sessions doesn't burn an API call on an all-zero mix.
  const _hasSignal = (() => {
    try {
      const t = _rollingChannelTotals(7);
      return Object.values(t).some(v => v > 0);
    } catch (_) { return false; }
  })();
  const _autoKey = currentFp;
  if (_hasSignal && (status === 'idle' || stale) && !_autoFiredChannelKeys.has(_autoKey)) {
    _autoFiredChannelKeys.add(_autoKey);
    setTimeout(() => engine.analyze(SINGLETON).catch(() => {}), 0);
  }

  // Shimmer ONLY while a request is genuinely in flight. Stale-ok falls
  // through to the bottom CTA branch ("Refresh AI verdict (your mix
  // changed)").
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
          <button class="sun-session-ai-refresh" ${aiActionAttrs('refresh-channel-mix')} title="Re-run analysis" aria-label="Re-run AI analysis">↻</button>
        </div>
        ${a.detail ? `<div class="sun-detail-ai-body">${escapeHTML(a.detail)}</div>` : ''}
      </div>
    </div>`;
  }
  if (status === 'error') {
    const msg = a?.errorMessage ? `Analysis failed — ${a.errorMessage}` : 'Analysis failed.';
    return `<div class="light-channel-mix-ai">
      ${staticFallback || ''}
      <button class="sun-session-ai-refresh light-channel-mix-ai-cta" ${aiActionAttrs('refresh-channel-mix')}>${escapeHTML(msg)} — retry</button>
    </div>`;
  }
  // Idle, OR cached but stale (channels shifted since last run).
  const ctaLabel = stale ? '✨ Refresh summary (your pattern changed)' : '✨ Summarize my light pattern';
  return `<div class="light-channel-mix-ai">
    ${staticFallback || ''}
    <button class="sun-session-ai-refresh light-channel-mix-ai-cta" ${aiActionAttrs('refresh-channel-mix')}>${escapeHTML(ctaLabel)}</button>
  </div>`;
}
