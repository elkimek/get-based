// @ts-check
// light-today-ai.js — Light Today daily/weekly hero verdict.
//
// Synthesizes one day's full picture (sun + devices + tools) into a single
// verdict. Different shape from row-level engines: cached per date in a
// map, not on a row. Wraps each date in a synthetic target object so the
// shared engine can drive it.

import { state } from './state.js';
import { escapeHTML } from './utils.js';
import { hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { CHANNEL_DISPLAY, formatChannelUnit, rollingChannelTotals, rollingVitaminDIU } from './sun.js';
import { rollingDeviceTotals } from './light-devices-store.js';
import { solarZenithAngle } from './sun-uvdata.js';
import { createAIVerdict, hashString, dotPrefix } from './ai-verdict-engine.js';
import { LIGHTING_HARDWARE_CAVEATS } from './lighting-hardware-caveats.js';
import { formatHealthGoalsText } from './health-goals-utils.js';
import { aiActionAttrs, registerAIActionHandler } from './ai-action-delegates.js';

const defaultLightTodayDeps = {
  solarZenithAngle,
  rollingChannelTotals,
  rollingDeviceTotals,
  rollingVitaminDIU,
};
const lightTodayDeps = { ...defaultLightTodayDeps };

export function configureLightTodayAI(deps = {}) {
  for (const key of Object.keys(defaultLightTodayDeps)) {
    lightTodayDeps[key] = typeof deps[key] === 'function' ? deps[key] : defaultLightTodayDeps[key];
  }
}

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
  if (!state.importedData) state.importedData = /** @type {any} */ ({});
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
  /** @type {{ signals: string[] }} */
  const out = { signals: [] };
  const sunriseSessions = sessions.filter(s => {
    if (!s.location) return false;
    const elev = 90 - lightTodayDeps.solarZenithAngle(new Date(s.startedAt), s.location.lat, s.location.lon);
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
  // Do not compare modeled sunlight IU-equivalents with an oral-intake target.
  // They are different constructs and neither predicts serum 25(OH)D here.
  return out;
}

// ─── Context ───────────────────────────────────────────────────────────

export function buildDayContext(target) {
  const targetDate = target?.date || new Date();
  const { sun, dev, measurements } = _collectWindowData(targetDate);
  const lines = [];
  const sd = state.importedData?.sunDefaults || {};
  const lc = state.importedData?.lightCircadian || {};
  const goals = formatHealthGoalsText(state.importedData?.healthGoals);
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
        if (s.location && s.endedAt) {
          const elevStart = 90 - lightTodayDeps.solarZenithAngle(new Date(s.startedAt), s.location.lat, s.location.lon);
          const elevEnd = 90 - lightTodayDeps.solarZenithAngle(new Date(s.endedAt), s.location.lat, s.location.lon);
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

  const sun7 = lightTodayDeps.rollingChannelTotals(7) || {};
  const dev7 = lightTodayDeps.rollingDeviceTotals(7) || {};
  const vit7 = lightTodayDeps.rollingVitaminDIU(7);
  lines.push('');
  lines.push('### Last 7 days context');
  lines.push(`Modeled sunlight vitamin-D comparison: ~${Math.round(vit7)} IU-equivalent (wide uncertainty; not measured synthesis or intake)`);
  // Channel context reports source presence only. It does not merge targeted
  // devices with sunlight or turn an internal normalization into a grade.
  const channelOrder = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye'];
  for (const k of channelOrder) {
    const sun = (sun7[k] || 0) > 0 ? 'sunlight logged' : 'no sunlight log';
    const device = (dev7[k] || 0) > 0 ? 'device logged separately' : 'no device log';
    if ((sun7[k] || 0) <= 0 && (dev7[k] || 0) <= 0) continue;
    lines.push(`  - ${(CHANNEL_DISPLAY[k]?.label || k)}: ${sun}; ${device}`);
  }

  lines.push('');
  lines.push('### User profile');
  if (sd.fitzpatrick) lines.push(`Skin type: Fitzpatrick ${sd.fitzpatrick}`);
  else if (lc.skinType) lines.push(`Skin type: ${lc.skinType}`);
  if (sd.dailyVitDTargetIU) lines.push(`Separate recorded vitamin-D intake target: ${sd.dailyVitDTargetIU} IU/day (do not compare directly with sunlight IU-equivalent)`);
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

// Source-aware framing invalidates older verdicts that graded channel tiers.
const _dayFingerprintSalt = 'v3-source-signals';
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
  'You summarize a single day of a user\'s logged light. Focus on what stands out now: timing, source, indoor environment, explicit safety flags, and one useful next step.',
  'Return ONLY valid JSON: {"dot":"green|yellow|red|gray","tip":"string","detail":"string"}.',
  '',
  'dot:',
  '  green = a useful timing or source pattern is logged and no supplied deterministic warning is present; never imply biological sufficiency or certify safety',
  '  yellow = mostly aligned but one specific data-backed gap or caution is present',
  '  red = a deterministic safety flag or strongly counterproductive timing pattern is recorded (base MED reached, UV device without goggles, or intense late-evening light)',
  '  gray = not enough data (no logged activity)',
  '',
  'Use the USER\'S GOALS only to select a relevant observation. Never diagnose a deficiency, prescribe treatment, or infer vitamin-D status from light logs.',
  'Trend signals (days since last sunrise or dropping activity) deserve mention when relevant. Never compare sunlight IU-equivalents with an oral-intake target or infer serum 25(OH)D.',
  'Channel lines only say whether sunlight or a device was logged. Never call a channel low, good, strong, complete, deficient, balanced, or a percentage of a target. Missing logs are not missing biology.',
  'Keep sunlight and devices separate. A targeted device does not recreate full-spectrum outdoor light.',
  'Non-obvious patterns to flag: midday session followed by sleep room with measurable light; sunrise sessions logged only on weekends; long device sessions without paired sunlight; evening device sessions on a SAD lamp doing the OPPOSITE of what the user wants.',
  '',
  ...LIGHTING_HARDWARE_CAVEATS,
  '',
  'The separate deterministic UV-safety panel owns modeled burn-dose guidance. You may acknowledge an explicit supplied warning, but never soften, override, or invent it.',
  'tip: one sentence, max 18 words. The single clearest observation or fix for this day. Direct.',
  'detail: 2–4 sentences. Explain what was logged, what remains uncertain, and the highest-leverage today-or-tomorrow action. Recommendations involving fixtures or dimming MUST honor the hardware caveats above.',
  'NUMBER DISCIPLINE: only quote numbers when they carry user-meaningful units that appear verbatim in the context block — vit-D IU-equivalent, minutes outdoors, %MED, lux, or °elevation. Do not invent channel scores or units.',
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
      const oldestKey = allKeys.shift();
      if (!oldestKey) break;
      delete verdicts[oldestKey];
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
registerAIActionHandler('refresh-day', refreshDayAIAnalysis);

// ─── Render ────────────────────────────────────────────────────────────

// Track auto-fired keys per session so we don't repeatedly fire if the
// engine bails for any reason (no AI provider mid-init, no light data
// yet, transient network issues that resolve to error). After a manual
// retry resets the cached state to ok / new fingerprint, the auto path
// stays disabled for the rest of this tab session — manual ↻ stays the
// way to re-fire.
const _autoFiredKeys = new Set();

function renderLightTodayQuestion() {
  return `<section class="light-ai-question">
    <div class="light-ai-kicker">Question this AI answers</div>
    <p>What stands out in today’s logged light, and is there a useful next step?</p>
    <div class="light-ai-panel-levels">
      <div><span>Minimum useful data</span><strong><span>Sun/device sessions</span><span>Time of day</span><span>Duration</span></strong></div>
      <div><span>Extended confidence data</span><strong><span>UV/MED</span><span>Lux/CCT/flicker</span><span>Sleep room darkness</span><span>7-day trends</span></strong></div>
    </div>
  </section>`;
}

function renderLightAIAnswer(dot, body, action = '') {
  return `<section class="light-ai-answer light-ai-answer-${escapeHTML(dot || 'gray')}">
    <div class="light-ai-answer-head">
      <div><div class="light-ai-kicker">AI answer</div><p>Auto-generated once per day when light data exists. Cached in this profile.</p></div>
      ${action}
    </div>
    ${body}
  </section>`;
}

export function renderLightTodayHero() {
  const today = new Date();
  const target = _wrapDate(today);
  const status = engine.getStatus(target);
  const cached = _getDailyVerdicts()[target.key];
  // No provider: still render a cached `ok` verdict (pre-populated demo
  // or cross-device-synced from a device that has a key).
  if (!hasAssistantFeatureProvider() && !(cached?.status === 'ok' && cached?.dot)) return '';

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
      ${renderLightTodayQuestion()}
      ${renderLightAIAnswer('gray', `<div class="sun-detail-ai sun-detail-ai-loading">
        <span class="sun-session-ai-dot sun-session-ai-dot-shimmer" aria-hidden="true"></span>
        <span>Synthesizing your day…</span>
      </div>`)}
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
    const action = `<button class="sun-session-ai-refresh" ${aiActionAttrs('refresh-day')} title="Re-run today's verdict" aria-label="Re-run today's verdict">↻</button>`;
    return `<div class="light-today-hero light-today-hero-${dot}">
      <div class="light-today-hero-head"><span class="light-today-hero-label">Today's light</span></div>
      ${renderLightTodayQuestion()}
      ${renderLightAIAnswer(dot, `<div class="sun-detail-ai sun-detail-ai-${dot}">
        <div class="sun-detail-ai-head">
          <span class="sun-session-ai-dot sun-session-ai-dot-${dot}" aria-hidden="true"></span>
          <span class="sun-detail-ai-tip"><span class="sun-session-ai-prefix" aria-hidden="true">${dotPrefix(dot)}</span> ${escapeHTML(cached.tip || '')}</span>
        </div>
        ${cached.detail ? `<div class="sun-detail-ai-body">${escapeHTML(cached.detail)}</div>` : ''}
      </div>`, action)}
      ${_showTrendBar ? trendBar : ''}
    </div>`;
  }
  if (status === 'error') {
    const msg = cached?.errorMessage ? `Analysis failed — ${cached.errorMessage}` : 'Analysis failed.';
    const action = `<button class="sun-session-ai-refresh" ${aiActionAttrs('refresh-day')}>Try again</button>`;
    return `<div class="light-today-hero">
      <div class="light-today-hero-head"><span class="light-today-hero-label">Today's light</span></div>
      ${renderLightTodayQuestion()}
      ${renderLightAIAnswer('gray', `<div class="sun-detail-ai sun-detail-ai-error">
        <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
        <span>${escapeHTML(msg)}</span>
      </div>`, action)}
      ${trendBar}
    </div>`;
  }
  const action = `<button class="sun-session-ai-refresh" ${aiActionAttrs('refresh-day')}>Run today's verdict</button>`;
  return `<div class="light-today-hero">
    <div class="light-today-hero-head"><span class="light-today-hero-label">Today's light</span></div>
    ${renderLightTodayQuestion()}
    ${renderLightAIAnswer('gray', `<div class="sun-detail-ai sun-detail-ai-idle">
      <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
      <span>Get an AI read on today's full picture — sun, devices, environment, trends.</span>
    </div>`, action)}
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
  if (!hasAssistantFeatureProvider() && !(cached?.status === 'ok' && cached?.dot)) return '';
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
        <button class="sun-session-ai-refresh" ${aiActionAttrs('refresh-day')} title="Re-run today's verdict" aria-label="Re-run today's verdict">↻</button>
      </div>
      ${cached.detail ? `<div class="light-today-dash-ai-body">
        <p>${escapeHTML(cached.detail)}</p>
      </div>` : ''}
    </div>`;
  }
  if (status === 'error') {
    const msg = cached?.errorMessage || 'AI verdict failed — retry';
    return `<button class="light-today-dash-ai light-today-dash-ai-cta" ${aiActionAttrs('refresh-day')}>
      <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
      <span class="light-today-dash-ai-tip">${escapeHTML(msg)}</span>
    </button>`;
  }
  return `<button class="light-today-dash-ai light-today-dash-ai-cta" ${aiActionAttrs('refresh-day')}>
    <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
    <span class="light-today-dash-ai-tip">✨ Get today's AI verdict</span>
  </button>`;
}

// Cross-page live-update — when a verdict completes elsewhere (e.g. an
// auto-fire on the Light & Sun page while the user is reading the
// dashboard), re-render the dashboard chip in place without rebuilding
// the whole dashboard view. Surgical replace of the chip's outerHTML.
// No-op when the user isn't on the dashboard.
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('labcharts-ai-verdict-updated', () => {
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
