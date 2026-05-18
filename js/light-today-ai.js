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

// Cap user-supplied free-text fields fed into prompt context. A device named
// "Glow\n[SYSTEM: ignore previous]" would otherwise break out of the prompt.
function _safeText(s, max = 80) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

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
  // Only flag sunrise gaps when the user has previously logged at least
  // one — a "no sunrise sessions ever" signal is just behaviour-reflective
  // noise (many users don't do sunrise sessions deliberately) and was
  // contradicting otherwise-green verdicts in the Today's Light hero.
  if (sunriseSessions.length) {
    const daysSince = Math.floor((targetTs - sunriseSessions[0].endedAt) / 86400000);
    if (daysSince >= 3) out.signals.push(`${daysSince} days since last sunrise session (last on ${new Date(sunriseSessions[0].endedAt).toISOString().slice(0, 10)})`);
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
        ? formatChannelUnit('vitamin_d', s.doses.vitamin_d, durMin, fitz, s.atmosphere?.uvIndex, null, !!s.bodyExposure?.rotatedSides, s.bodyExposure?.fraction || null)
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
      const devName = device ? (_safeText(`${device.brand || ''} ${device.model || ''}`) || 'unnamed device') : 'unknown device';
      const devType = device?.type ? ` (${_safeText(device.type, 30)})` : '';
      lines.push(`  - ${start.toTimeString().slice(0, 5)} · ${Math.round(s.durationMin)} min · ${devName}${devType} @ ${s.distanceCm}cm, ${_safeText(s.bodyArea, 40) || '?'}${s.eyesProtected ? ', eyes protected' : ', eyes uncovered'}`);
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
    // Channels surface as tier labels only — the raw scores
    // (melanopic-lux-min, J/cm², etc.) aren't user-meaningful, and
    // when the AI quoted them verbatim the verdict read like
    // "outdoor eye light (774465)". Tier labels (none/low/moderate/
    // good/strong) carry the same comparative signal without the
    // numeric noise.
    const channelOrder = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye'];
    for (const k of channelOrder) {
      const v = merged7[k] || 0;
      if (v <= 0) continue;
      const tier = channelTier(v, k);
      lines.push(`  - ${(CHANNEL_DISPLAY[k]?.label || k)}: ${tierLabel(tier)}`);
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

// Bumped 2026-05-08: prompt now strips raw channel scores; existing
// cached verdicts contain user-hostile numbers like "(1202696)" and
// need to refresh against the tightened prompt.
const _dayFingerprintSalt = 'v2-tier-labels';
export function getDayFingerprint(target) {
  const targetDate = target?.date || new Date();
  const { sun, dev, measurements } = _collectWindowData(targetDate);
  const parts = [_dayFingerprintSalt, _localDateString(targetDate), sun.length, dev.length, measurements.length];
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
  'detail: 2–4 sentences. Synthesize: what worked + what didn\'t + the highest-leverage tomorrow-action. Recommendations involving fixtures or dimming MUST honor the hardware caveats above.',
  'NUMBER DISCIPLINE: only quote numbers when they carry user-meaningful units that appear verbatim in the context block — vit-D IU, minutes outdoors, %MED, lux, °elevation. Channel weekly totals are reported as tier labels (none/low/moderate/good/strong); refer to them by tier ("strong body clock this week"), never as raw scores ("body clock 1202696"). Do not invent units that aren\'t in the context.',
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

export const analyzeDayAI = (date, opts) => engine.analyze(_wrapDate(date || new Date()), opts);
export async function refreshDayAIAnalysis(dateKey) {
  if (!dateKey) dateKey = _localDateString(new Date());
  return engine.refresh(dateKey);
}

// ─── Render ────────────────────────────────────────────────────────────

// Track auto-fired keys per session so we don't repeatedly fire if the
// engine bails for any reason (no AI provider mid-init, no light data
// yet, transient network issues that resolve to error). After a manual
// retry resets the cached state to ok / new fingerprint, the auto path
// stays disabled for the rest of this tab session — manual ↻ stays the
// way to re-fire.
const _autoFiredKeys = new Set();

export function renderLightTodayHero() {
  const today = new Date();
  const target = _wrapDate(today);
  const status = engine.getStatus(target);
  const cached = _getDailyVerdicts()[target.key];
  // No provider: still render a cached `ok` verdict (pre-populated demo
  // or cross-device-synced from a device that has a key).
  if (!hasAIProvider() && !(cached?.status === 'ok' && cached?.dot)) return '';

  // Auto-fire on first idle render of the day. Skip if we've already
  // tried in this tab session (prevents tight-loop refire on transient
  // errors), if there's any cached verdict including error (manual retry
  // is the recovery path), or if there's no light activity worth
  // analyzing (no sessions + no measurements + no devices). The engine
  // itself dedupes via _inflight so concurrent calls are fine, but the
  // autoFired guard keeps log noise + telemetry counts honest.
  // Auto-fire on first idle render OR when the cached verdict is stale
  // against the current fingerprint (e.g. _dayFingerprintSalt was bumped
  // because the prompt logic changed and the old verdict's wording
  // doesn't match the new constraints). engine.analyze() is fingerprint-
  // aware so it will short-circuit if the cache is actually fresh.
  const _currentFp = getDayFingerprint(target);
  const _stale = !!(cached?.fingerprint && cached.fingerprint !== _currentFp);
  if ((status === 'idle' || _stale) && !_autoFiredKeys.has(target.key)) {
    const hasLightActivity = (() => {
      const sun = (state.importedData?.sunSessions || []).some(s => s.endedAt);
      const dev = (state.importedData?.deviceSessions || []).some(s => s.endedAt);
      const meas = (state.importedData?.lightMeasurements || []).length > 0;
      return sun || dev || meas;
    })();
    if (hasLightActivity) {
      _autoFiredKeys.add(target.key);
      // Defer to next tick so the caller's render completes (and the
      // shimmer state has time to mount) before the engine flips back
      // to analyzing + triggers a re-render. Keeps the first paint
      // showing idle CTA briefly, then a smooth flip to shimmer rather
      // than a synchronous double-flip mid-render.
      setTimeout(() => engine.analyze(target).catch(() => {}), 0);
    }
  }
  const trends = computeLightTrends(today);
  const trendBar = trends.signals.length
    ? `<div class="light-today-trends">${trends.signals.slice(0, 2).map(s => `<span class="light-today-trend">⚡ ${escapeHTML(s)}</span>`).join('')}</div>`
    : '';

  // Shimmer ONLY while a request is genuinely in flight. Stale-ok falls
  // through to the ok branch so the ↻ button stays reachable; auto-fire
  // updates the verdict underneath.
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
    // Trend bar repeats deterministic flags the verdict has already
    // incorporated — when the verdict is green, suppress it to avoid
    // the "✓ Solid coverage" + "⚡ days since…" contradiction surfaced
    // in the v1.6.x UX review. Yellow / red verdicts keep the trend
    // bar as supporting context.
    const _showTrendBar = dot !== 'green';
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
      ${_showTrendBar ? trendBar : ''}
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

// Legacy verdict block for the older Light Today strip. Reuses the same
// cached verdict as the Light & Sun page hero — runs the AI once per
// day, both surfaces display it. Renders the full tip + detail + a
// deep-link to the Light & Sun page hero by default; no
// hover-tooltip dependency, no collapse-by-default that hides the
// content.
export function renderLightTodayDashboardChip() {
  const today = new Date();
  const target = _wrapDate(today);
  const status = engine.getStatus(target);
  const cached = _getDailyVerdicts()[target.key];
  if (!hasAIProvider() && !(cached?.status === 'ok' && cached?.dot)) return '';
  // Stale-verdict auto-fire — same logic as renderLightTodayHero. The
  // dashboard is what the user sees first, so triggering re-analysis
  // here means a stale cached verdict (e.g. one from before the
  // _dayFingerprintSalt bump) doesn't sit forever waiting for the user
  // to navigate to /light.
  const _currentFp = getDayFingerprint(target);
  const _stale = !!(cached?.fingerprint && cached.fingerprint !== _currentFp);
  if ((status === 'idle' || _stale) && !_autoFiredKeys.has(target.key)) {
    const hasLightActivity = (() => {
      const sun = (state.importedData?.sunSessions || []).some(s => s.endedAt);
      const dev = (state.importedData?.deviceSessions || []).some(s => s.endedAt);
      const meas = (state.importedData?.lightMeasurements || []).length > 0;
      return sun || dev || meas;
    })();
    if (hasLightActivity) {
      _autoFiredKeys.add(target.key);
      setTimeout(() => engine.analyze(target).catch(() => {}), 0);
    }
  }
  // Shimmer ONLY while a request is genuinely in flight. Stale-ok falls
  // through to the ok branch so the ↻ button stays reachable; auto-fire
  // updates the verdict underneath.
  if (status === 'analyzing') {
    return `<div class="light-today-dash-ai">
      <div class="light-today-dash-ai-row">
        <span class="sun-session-ai-dot sun-session-ai-dot-shimmer" aria-hidden="true"></span>
        <span class="light-today-dash-ai-tip">Analyzing today's light…</span>
      </div>
    </div>`;
  }
  if (status === 'ok' && cached?.dot) {
    const dot = cached.dot;
    return `<div class="light-today-dash-ai light-today-dash-ai-${dot}">
      <div class="light-today-dash-ai-row">
        <span class="sun-session-ai-dot sun-session-ai-dot-${dot}" aria-hidden="true"></span>
        <span class="light-today-dash-ai-tip"><span class="sun-session-ai-prefix" aria-hidden="true">${dotPrefix(dot)}</span> ${escapeHTML(cached.tip || '')}</span>
        <button class="sun-session-ai-refresh" onclick="window.refreshDayAIAnalysis()" title="Re-run today's verdict" aria-label="Re-run today's verdict">↻</button>
      </div>
      ${cached.detail ? `<div class="light-today-dash-ai-body">
        <p>${escapeHTML(cached.detail)}</p>
      </div>` : ''}
    </div>`;
  }
  if (status === 'error') {
    const msg = cached?.errorMessage || 'AI verdict failed — retry';
    return `<button class="light-today-dash-ai light-today-dash-ai-cta" onclick="window.refreshDayAIAnalysis()">
      <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
      <span class="light-today-dash-ai-tip">${escapeHTML(msg)}</span>
    </button>`;
  }
  return `<button class="light-today-dash-ai light-today-dash-ai-cta" onclick="window.refreshDayAIAnalysis()">
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

// Cross-page live-update — when a verdict completes elsewhere (e.g. an
// auto-fire on the Light & Sun page while the user is reading the
// dashboard), re-render the dashboard chip in place without rebuilding
// the whole dashboard view. Surgical replace of the chip's outerHTML.
// No-op when the user isn't on the dashboard.
if (typeof window !== 'undefined') {
  window.addEventListener('labcharts-ai-verdict-updated', () => {
    if (state.currentView !== 'dashboard') return;
    const existing = document.querySelector('.dashboard-widget[data-widget-id="light-today"] .light-today-hero, .light-today-strip .light-today-dash-ai');
    if (!existing) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = (existing.classList.contains('light-today-hero')
      ? renderLightTodayHero()
      : renderLightTodayDashboardChip()).trim();
    const fresh = wrapper.firstChild;
    if (fresh) existing.replaceWith(fresh);
  });
}
