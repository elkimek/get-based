// light-today-ai.js — Light Today daily/weekly hero verdict.
//
// Synthesizes one day's full picture (sun + devices + tools) into a single
// verdict. Different shape from row-level engines: cached per date in a
// map, not on a row. Wraps each date in a synthetic target object so the
// shared engine can drive it.

import { state } from './state.js';
import { escapeHTML } from './utils.js';
import { hasAIProvider } from './api.js';
import { CHANNEL_DISPLAY, formatChannelUnit, channelTier, tierLabel } from './sun.js';
import { createAIVerdict, hashString, dotPrefix } from './ai-verdict-engine.js';
import { LIGHTING_HARDWARE_CAVEATS } from './lighting-hardware-caveats.js';

function _localDateString(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function _dayBoundaries(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0).getTime();
  return { start, end: start + 86400000 };
}

function _getDailyVerdicts() {
  if (!state.importedData) state.importedData = {};
  if (!state.importedData.lightDailyVerdicts) state.importedData.lightDailyVerdicts = {};
  return state.importedData.lightDailyVerdicts;
}

// Synthetic target wrapper. The engine reads/writes via getAIAnalysis /
// setAIAnalysis, so for the daily-verdicts map shape, we expose `target.key`
// as the id and route reads/writes through the lightDailyVerdicts map.
function _wrapDate(date) {
  const key = _localDateString(date);
  return { key, date, isLightTodayTarget: true };
}

function _allDateTargets() {
  const verdicts = _getDailyVerdicts();
  return Object.keys(verdicts).map(key => {
    const [y, m, d] = key.split('-').map(Number);
    return { key, date: new Date(y, m - 1, d), isLightTodayTarget: true };
  });
}

function _collectWindowData(targetDate) {
  const { start, end } = _dayBoundaries(targetDate);
  const sun = (state.importedData?.sunSessions || []).filter(s => {
    const t = s.endedAt || s.startedAt;
    return t >= start && t < end;
  });
  const dev = (state.importedData?.deviceSessions || []).filter(s => {
    const t = s.endedAt || s.startedAt;
    return t >= start && t < end;
  });
  const measurements = (state.importedData?.lightMeasurements || []).filter(m => {
    return m.capturedAt >= start && m.capturedAt < end;
  });
  return { sun, dev, measurements };
}

// ─── Trends ────────────────────────────────────────────────────────────

export function computeLightTrends(targetDate = new Date()) {
  const sessions = (state.importedData?.sunSessions || []).filter(s => s.endedAt);
  const devSessions = (state.importedData?.deviceSessions || []).filter(s => s.endedAt);
  const targetTs = targetDate.getTime();
  const out = { signals: [] };
  const sunriseSessions = sessions.filter(s => {
    if (!s.location || typeof window.solarZenithAngle !== 'function') return false;
    const elev = 90 - window.solarZenithAngle(new Date(s.startedAt), s.location.lat, s.location.lon);
    return elev < 6 && elev > -6 && (s.endedAt - s.startedAt) > 5 * 60000;
  }).sort((a, b) => b.endedAt - a.endedAt);
  if (sunriseSessions.length) {
    const daysSince = Math.floor((targetTs - sunriseSessions[0].endedAt) / 86400000);
    if (daysSince >= 3) out.signals.push(`${daysSince} days since last sunrise session (last on ${new Date(sunriseSessions[0].endedAt).toISOString().slice(0, 10)})`);
  } else if (sessions.length > 0) {
    out.signals.push('No sunrise sessions logged in available history');
  }
  const cutoff7 = targetTs - 7 * 86400000;
  const cutoff14 = targetTs - 14 * 86400000;
  const last7 = [...sessions, ...devSessions].filter(s => s.endedAt >= cutoff7);
  const prev7 = [...sessions, ...devSessions].filter(s => s.endedAt >= cutoff14 && s.endedAt < cutoff7);
  if (prev7.length > 0 && last7.length < prev7.length * 0.5) {
    out.signals.push(`Light activity dropped ${Math.round((1 - last7.length / prev7.length) * 100)}% vs prior week (${last7.length} sessions vs ${prev7.length})`);
  }
  if (typeof window.rollingVitaminDIU === 'function') {
    const week = window.rollingVitaminDIU(7);
    const target = state.importedData?.sunDefaults?.dailyVitDTargetIU;
    if (target && week < target * 7 * 0.4) {
      out.signals.push(`Weekly vit-D synthesis ~${Math.round(week)} IU is well below your daily target × 7 (${target * 7} IU)`);
    }
  }
  return out;
}

// ─── Context ───────────────────────────────────────────────────────────

export function buildDayContext(target) {
  const targetDate = target?.date || new Date();
  const { sun, dev, measurements } = _collectWindowData(targetDate);
  const lines = [];
  const sd = state.importedData?.sunDefaults || {};
  const lc = state.importedData?.lightCircadian || {};
  const goals = state.importedData?.healthGoals?.goals || '';
  const dateStr = _localDateString(targetDate);

  lines.push(`### Day: ${dateStr}`);

  if (sun.length === 0 && dev.length === 0 && measurements.length === 0) {
    lines.push('No light activity logged for this day.');
  }

  if (sun.length) {
    lines.push('');
    lines.push(`### Sun sessions (${sun.length})`);
    for (const s of sun.sort((a, b) => a.startedAt - b.startedAt)) {
      const start = new Date(s.startedAt);
      const fitz = s.safety?.fitzpatrick || sd.fitzpatrick || 'III';
      const durMin = Math.round(s.durationMin || 0);
      const med = s.safety?.medFraction != null ? Math.round(s.safety.medFraction * 100) + '% MED' : '';
      const vitDStr = s.doses?.vitamin_d
        ? formatChannelUnit('vitamin_d', s.doses.vitamin_d, durMin, fitz, s.atmosphere?.uvIndex, null, !!s.bodyExposure?.rotatedSides)
        : '';
      let elevPhase = '';
      try {
        if (s.location && typeof window.solarZenithAngle === 'function' && s.endedAt) {
          const elevStart = 90 - window.solarZenithAngle(new Date(s.startedAt), s.location.lat, s.location.lon);
          const elevEnd = 90 - window.solarZenithAngle(new Date(s.endedAt), s.location.lat, s.location.lon);
          if (elevStart < 0 && elevEnd > 0) elevPhase = ' [SUNRISE — horizon crossing]';
          else if (elevStart > 0 && elevEnd < 0) elevPhase = ' [SUNSET — horizon crossing]';
          else if (elevEnd < 6 && elevEnd > -6) elevPhase = ' [twilight]';
          else if (elevEnd > 60) elevPhase = ' [near-zenith]';
        }
      } catch (_) {}
      const eyeStr = s.eyeExposure?.mode === 'direct' ? ', eyes direct' : (s.eyeExposure?.mode === 'indoor' ? ', eyes indoors' : '');
      lines.push(`  - ${start.toTimeString().slice(0, 5)} · ${durMin} min${elevPhase} · ${med}${vitDStr ? ' · ' + vitDStr : ''}${eyeStr}`);
    }
  }

  if (dev.length) {
    lines.push('');
    lines.push(`### Device sessions (${dev.length})`);
    const deviceById = Object.fromEntries((state.importedData?.lightDevices || []).map(d => [d.id, d]));
    for (const s of dev.sort((a, b) => a.startedAt - b.startedAt)) {
      const start = new Date(s.startedAt);
      const device = deviceById[s.deviceId];
      const devName = device ? `${device.brand || ''} ${device.model || ''}`.trim() : 'unknown device';
      const devType = device?.type ? ` (${device.type})` : '';
      lines.push(`  - ${start.toTimeString().slice(0, 5)} · ${Math.round(s.durationMin)} min · ${devName}${devType} @ ${s.distanceCm}cm, ${s.bodyArea || '?'}${s.eyesProtected ? ', eyes protected' : ', eyes uncovered'}`);
    }
  }

  if (measurements.length) {
    lines.push('');
    lines.push(`### Tool measurements (${measurements.length})`);
    const byTool = {};
    for (const m of measurements) {
      if (!byTool[m.tool]) byTool[m.tool] = [];
      byTool[m.tool].push(m);
    }
    for (const [tool, list] of Object.entries(byTool)) {
      if (tool === 'lux' || tool === 'cct' || tool === 'glass-transmission') {
        lines.push(`  - ${tool}: ${list.map(m => Math.round(m.value)).join(', ')}`);
      } else if (tool === 'flicker') {
        lines.push(`  - flicker: scores ${list.map(m => Math.round(m.value)).join(', ')} (0=pristine, 3=severe)`);
      } else if (tool === 'darkness') {
        const m = list[0];
        lines.push(`  - sleep darkness: ${m.extra?.label || ''} (${m.value} lux mean)`);
      } else if (tool === 'spectrum') {
        const m = list[0];
        lines.push(`  - spectrum: ${m.value || m.extra?.label}`);
      }
    }
  }

  if (typeof window.rollingChannelTotals === 'function' && typeof window.rollingDeviceTotals === 'function') {
    const sun7 = window.rollingChannelTotals(7) || {};
    const dev7 = window.rollingDeviceTotals(7) || {};
    const merged7 = {};
    for (const k of new Set([...Object.keys(sun7), ...Object.keys(dev7)])) {
      merged7[k] = (sun7[k] || 0) + (dev7[k] || 0);
    }
    const vit7 = (typeof window.rollingVitaminDIU === 'function') ? window.rollingVitaminDIU(7) : null;
    lines.push('');
    lines.push('### Last 7 days context');
    if (vit7 != null) lines.push(`Cumulative vit-D synthesized from sun: ~${Math.round(vit7)} IU`);
    const channelOrder = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye'];
    for (const k of channelOrder) {
      const v = merged7[k] || 0;
      if (v <= 0) continue;
      const tier = channelTier(v, k);
      lines.push(`  - ${(CHANNEL_DISPLAY[k]?.label || k)}: ${tierLabel(tier)} (${Math.round(v)})`);
    }
  }

  lines.push('');
  lines.push('### User profile');
  if (sd.fitzpatrick) lines.push(`Skin type: Fitzpatrick ${sd.fitzpatrick}`);
  else if (lc.skinType) lines.push(`Skin type: ${lc.skinType}`);
  if (sd.dailyVitDTargetIU) lines.push(`Vit-D daily target: ${sd.dailyVitDTargetIU} IU`);
  if (goals) lines.push(`Health goals: ${String(goals).slice(0, 200)}`);

  try {
    const entries = (state.importedData?.entries || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    for (const e of entries) {
      const v = e?.values?.hormones?.['25-oh-vitamin-d'] ?? e?.values?.lipids?.['25-oh-vitamin-d'];
      if (v != null) { lines.push(`Latest 25-OH-D: ${v} (${e.date})`); break; }
    }
  } catch (_) {}

  const trends = computeLightTrends(targetDate);
  if (trends.signals.length) {
    lines.push('');
    lines.push('### Trend signals');
    for (const s of trends.signals) lines.push(`  - ${s}`);
  }

  return lines.join('\n');
}

function getDayFingerprint(target) {
  const targetDate = target?.date || new Date();
  const { sun, dev, measurements } = _collectWindowData(targetDate);
  const parts = [_localDateString(targetDate), sun.length, dev.length, measurements.length];
  for (const s of sun) parts.push(s.id, s.endedAt || 0, Math.round((s.safety?.medFraction || 0) * 100));
  for (const s of dev) parts.push(s.id, s.endedAt || 0);
  for (const m of measurements) parts.push(m.id);
  return hashString(parts.join('|'));
}

const SYSTEM_PROMPT = [
  'You evaluate a single day of a user\'s light exposure. Return one verdict that synthesizes sun + light-therapy + indoor environment + recent trends against the user\'s goals.',
  'Return ONLY valid JSON: {"dot":"green|yellow|red|gray","tip":"string","detail":"string"}.',
  '',
  'dot:',
  '  green = the day was on-protocol — sufficient outdoor / circadian exposure, safe burn doses, evening light environment supports sleep',
  '  yellow = mostly OK but one specific gap (e.g., no sunrise + indoor-only screens, evening lights too bright, weekly vit-D under target trending)',
  '  red = circadian-hostile day or unsafe (over MED + no eye protection, late-evening cool-bright light + no morning anchor, prolonged indoor with no daylight at all)',
  '  gray = not enough data (no logged activity)',
  '',
  'Weight the day relative to the USER\'S GOALS (vit-D restoration vs SAD relief vs sleep optimization vs general health). Reference 25-OH-D when present.',
  'Trend signals (days since last sunrise, weekly vit-D under target, dropping activity) deserve mention when relevant.',
  'Non-obvious patterns to flag: midday session followed by sleep room with measurable light; sunrise sessions logged only on weekends; long device sessions without paired sunlight; evening device sessions on a SAD lamp doing the OPPOSITE of what the user wants.',
  '',
  ...LIGHTING_HARDWARE_CAVEATS,
  '',
  'tip: one sentence, max 18 words. The single highest-leverage observation or fix for this day. Direct.',
  'detail: 2–4 sentences. Synthesize: what worked + what didn\'t + the highest-leverage tomorrow-action. Reference specific numbers. Recommendations involving fixtures or dimming MUST honor the hardware caveats above.',
  '',
  'No "you should" — be observational. No emoji.',
].join('\n');

const engine = createAIVerdict({
  // Synthetic-target shape: target = { key, date, isLightTodayTarget: true }
  getTarget: (key) => {
    const [y, m, d] = String(key).split('-').map(Number);
    if (!y || !m || !d) return null;
    return _wrapDate(new Date(y, m - 1, d));
  },
  getId: (t) => t?.key,
  getAIAnalysis: (t) => _getDailyVerdicts()[t.key] || null,
  setAIAnalysis: (t, v) => {
    const verdicts = _getDailyVerdicts();
    if (v == null) delete verdicts[t.key];
    else verdicts[t.key] = v;
    // Trim cache: keep last 30 days only — stops the map growing unbounded.
    const allKeys = Object.keys(verdicts).sort();
    while (allKeys.length > 30) {
      delete verdicts[allKeys.shift()];
    }
  },
  getFingerprint: getDayFingerprint,
  buildContext: buildDayContext,
  systemPrompt: SYSTEM_PROMPT,
  maxTokens: 600,
  getAllTargets: _allDateTargets,
});

export const isDayAnalyzing = engine.isAnalyzing;
export const analyzeDayAI = (date, opts) => engine.analyze(_wrapDate(date || new Date()), opts);
export async function refreshDayAIAnalysis(dateKey) {
  if (!dateKey) dateKey = _localDateString(new Date());
  return engine.refresh(dateKey);
}

// ─── Render ────────────────────────────────────────────────────────────

export function renderLightTodayHero() {
  if (!hasAIProvider()) return '';
  const today = new Date();
  const target = _wrapDate(today);
  const status = engine.getStatus(target);
  const cached = _getDailyVerdicts()[target.key];
  const trends = computeLightTrends(today);
  const trendBar = trends.signals.length
    ? `<div class="light-today-trends">${trends.signals.slice(0, 2).map(s => `<span class="light-today-trend">⚡ ${escapeHTML(s)}</span>`).join('')}</div>`
    : '';

  if (status === 'analyzing') {
    return `<div class="light-today-hero">
      <div class="light-today-hero-head"><span class="light-today-hero-label">Today's light</span></div>
      <div class="sun-detail-ai sun-detail-ai-loading">
        <span class="sun-session-ai-dot sun-session-ai-dot-shimmer" aria-hidden="true"></span>
        <span>Synthesizing your day…</span>
      </div>
      ${trendBar}
    </div>`;
  }
  if (status === 'ok') {
    const dot = cached.dot;
    return `<div class="light-today-hero light-today-hero-${dot}">
      <div class="light-today-hero-head">
        <span class="light-today-hero-label">Today's light</span>
        <button class="sun-session-ai-refresh" onclick="window.refreshDayAIAnalysis()" title="Re-run today's verdict" aria-label="Re-run today's verdict">↻</button>
      </div>
      <div class="sun-detail-ai sun-detail-ai-${dot}">
        <div class="sun-detail-ai-head">
          <span class="sun-session-ai-dot sun-session-ai-dot-${dot}" aria-hidden="true"></span>
          <span class="sun-detail-ai-tip"><span class="sun-session-ai-prefix" aria-hidden="true">${dotPrefix(dot)}</span> ${escapeHTML(cached.tip || '')}</span>
        </div>
        ${cached.detail ? `<div class="sun-detail-ai-body">${escapeHTML(cached.detail)}</div>` : ''}
      </div>
      ${trendBar}
    </div>`;
  }
  if (status === 'error') {
    const msg = cached?.errorMessage ? `Analysis failed — ${cached.errorMessage}` : 'Analysis failed.';
    return `<div class="light-today-hero">
      <div class="light-today-hero-head"><span class="light-today-hero-label">Today's light</span></div>
      <div class="sun-detail-ai sun-detail-ai-error">
        <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
        <span>${escapeHTML(msg)}</span>
        <button class="sun-session-ai-refresh" onclick="window.refreshDayAIAnalysis()">Try again</button>
      </div>
      ${trendBar}
    </div>`;
  }
  return `<div class="light-today-hero">
    <div class="light-today-hero-head"><span class="light-today-hero-label">Today's light</span></div>
    <div class="sun-detail-ai sun-detail-ai-idle">
      <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
      <span>Get an AI read on today's full picture — sun, devices, environment, trends.</span>
      <button class="sun-session-ai-refresh" onclick="window.refreshDayAIAnalysis()">Run today's verdict</button>
    </div>
    ${trendBar}
  </div>`;
}

// Compact verdict line for the DASHBOARD's Light Today strip. Reuses
// the same cached verdict as the Light & Sun page hero — runs the AI
// once per day, both surfaces display it. The dashboard variant is
// terser (one-line tip + dot + click-through) to fit the dense strip.
export function renderLightTodayDashboardChip() {
  if (!hasAIProvider()) return '';
  const today = new Date();
  const target = _wrapDate(today);
  const status = engine.getStatus(target);
  const cached = _getDailyVerdicts()[target.key];
  if (status === 'analyzing') {
    return `<div class="light-today-dash-ai">
      <span class="sun-session-ai-dot sun-session-ai-dot-shimmer" aria-hidden="true"></span>
      <span class="light-today-dash-ai-tip">Analyzing today's light…</span>
    </div>`;
  }
  if (status === 'ok' && cached?.dot) {
    const dot = cached.dot;
    return `<a class="light-today-dash-ai light-today-dash-ai-${dot}" href="#" onclick="event.preventDefault();window.navigate && window.navigate('light')" title="${escapeHTML(cached.detail || '')}">
      <span class="sun-session-ai-dot sun-session-ai-dot-${dot}" aria-hidden="true"></span>
      <span class="light-today-dash-ai-tip"><span class="sun-session-ai-prefix" aria-hidden="true">${dotPrefix(dot)}</span> ${escapeHTML(cached.tip || '')}</span>
    </a>`;
  }
  if (status === 'error') {
    return `<button class="light-today-dash-ai light-today-dash-ai-cta" onclick="window.refreshDayAIAnalysis()" title="Retry today's verdict">
      <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
      <span class="light-today-dash-ai-tip">AI verdict failed — retry</span>
    </button>`;
  }
  // Idle — never analyzed today
  return `<button class="light-today-dash-ai light-today-dash-ai-cta" onclick="window.refreshDayAIAnalysis()" title="Run an AI synthesis of today's sun + devices + environment">
    <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
    <span class="light-today-dash-ai-tip">✨ Get today's AI verdict</span>
  </button>`;
}

Object.assign(window, {
  refreshDayAIAnalysis,
  analyzeDayAI,
  renderLightTodayHero,
  renderLightTodayDashboardChip,
  computeLightTrends,
});
