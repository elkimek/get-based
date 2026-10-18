import{captureLightAIView}from'./light-ai-view-values.js';
import type { ProfileData } from '../types/app-state.js';
// light-today-ai.js — Light Today daily/weekly hero verdict.
//
// Synthesizes one day's full picture (sun + devices + tools) into a single
// verdict. Different shape from row-level engines: cached per date in a
// map, not on a row. Wraps each date in a synthetic target object so the
// shared engine can drive it.

import { state } from './state.js';
import { captureAIVerdictOwner } from './ai-verdict-owner.js';
import { projectReviewAI } from './light-review-ai-presentation.js';
import { renderHTML } from './components/LightReviewAI.svelte.html.js';
import { latestVitaminDContext } from './lab-vitamin-d-context.js';
import { hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { CHANNEL_DISPLAY, formatChannelUnit, rollingChannelTotals, rollingVitaminDIU } from './sun.js';
import { rollingDeviceTotals } from './light-devices-store.js';
import { solarZenithAngle } from './sun-uvdata.js';
import { createAIVerdict, hashString } from './ai-verdict-engine.js';
import { LIGHTING_HARDWARE_CAVEATS } from './lighting-hardware-caveats.js';
import { formatHealthGoalsText } from './health-goals-utils.js';
import { aiActionOwner, registerAIActionHandler } from './ai-action-delegates.js';

import type { SunSessionRecord } from './sun-sessions-store.js';
import type { DeviceSessionRecord, LightDeviceRecord } from './light-devices-store.js';
import type { StoredLightMeasurement } from './light-tools.js';
import type { SunSetupDefaults } from './sun-defaults-model.js';
import type { AnalyzeOptions, AIVerdictAnalysis } from './ai-verdict-engine.js';

interface DayTarget { key: string; date: Date; isLightTodayTarget: boolean }
type VerdictRead = { status?: unknown; dot?: unknown; tip?: unknown; detail?: unknown; fingerprint?: unknown; errorMessage?: unknown };
// Raw configurable results and saved verdicts retain their original unchecked
// property/method reads. Numerical assertions describe existing operations.
type TodayDependencies = { solarZenithAngle: unknown; rollingChannelTotals: unknown; rollingDeviceTotals: unknown; rollingVitaminDIU: unknown };


const defaultLightTodayDeps = {
  solarZenithAngle,
  rollingChannelTotals,
  rollingDeviceTotals,
  rollingVitaminDIU,
};
const lightTodayDeps: TodayDependencies = { ...defaultLightTodayDeps };

export function configureLightTodayAI(deps: unknown = {}) {
  for (const key of Object.keys(defaultLightTodayDeps)) {
    lightTodayDeps[key as keyof TodayDependencies] = typeof (deps as Record<string, unknown>)[key] === 'function' ? (deps as Record<string, unknown>)[key] : defaultLightTodayDeps[key as keyof TodayDependencies];
  }
}

// Cap user-supplied free-text fields fed into prompt context. A device named
// "Glow\n[SYSTEM: ignore previous]" would otherwise break out of the prompt.
function _safeText(s: unknown, max = 80) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function _localDateString(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function _dayBoundaries(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0).getTime();
  return { start, end: start + 86400000 };
}

function _getDailyVerdicts(data: ProfileData = state.importedData) {
  if (!data.lightDailyVerdicts) data.lightDailyVerdicts = {};
  return data.lightDailyVerdicts as Record<string, unknown>;
}

// Synthetic target wrapper. The engine reads/writes via getAIAnalysis /
// setAIAnalysis, so for the daily-verdicts map shape, we expose `target.key`
// as the id and route reads/writes through the lightDailyVerdicts map.
function _wrapDate(date: Date) {
  const key = _localDateString(date);
  return { key, date, isLightTodayTarget: true };
}

function _allDateTargets(data: ProfileData = state.importedData) {
  const verdicts = _getDailyVerdicts(data);
  return Object.keys(verdicts).map(key => {
    const [y, m, d] = key.split('-').map(Number);
    return { key, date: new Date(y as number, (m as number) - 1, d as number), isLightTodayTarget: true };
  });
}

function _collectWindowData(targetDate: Date) {
  const { start, end } = _dayBoundaries(targetDate);
  const sun = ((state.importedData?.sunSessions || []) as SunSessionRecord[]).filter(s => {
    const t = s.endedAt || s.startedAt;
    return t >= start && t < end;
  });
  const dev = ((state.importedData?.deviceSessions || []) as DeviceSessionRecord[]).filter(s => {
    const t = s.endedAt || s.startedAt;
    return t >= start && t < end;
  });
  const measurements = ((state.importedData?.lightMeasurements || []) as StoredLightMeasurement[]).filter(m => {
    return (m.capturedAt as number) >= start && (m.capturedAt as number) < end;
  });
  return { sun, dev, measurements };
}

// ─── Trends ────────────────────────────────────────────────────────────

export function computeLightTrends(targetDate = new Date()) {
  const sessions = ((state.importedData?.sunSessions || []) as SunSessionRecord[]).filter(s => s.endedAt);
  const devSessions = ((state.importedData?.deviceSessions || []) as DeviceSessionRecord[]).filter(s => s.endedAt);
  const targetTs = targetDate.getTime();
  const out: { signals: string[] } = { signals: [] };
  const sunriseSessions = sessions.filter(s => {
    if (!s.location) return false;
    const elev = 90 - ((lightTodayDeps.solarZenithAngle as (date: Date, lat: unknown, lon: unknown) => unknown)(new Date(s.startedAt), s.location.lat, s.location.lon) as number);
    return elev < 6 && elev > -6 && ((s.endedAt as number) - s.startedAt) > 5 * 60000;
  }).sort((a, b) => (b.endedAt as number) - (a.endedAt as number));
  // Only flag sunrise gaps when the user has previously logged at least
  // one — a "no sunrise sessions ever" signal is just behaviour-reflective
  // noise (many users don't do sunrise sessions deliberately) and was
  // contradicting otherwise-green verdicts in the Today's Light hero.
  if (sunriseSessions.length) {
    const daysSince = Math.floor((targetTs - (sunriseSessions[0]!.endedAt as number)) / 86400000);
    if (daysSince >= 3) out.signals.push(`${daysSince} days since last sunrise session (last on ${new Date(sunriseSessions[0]!.endedAt as number).toISOString().slice(0, 10)})`);
  }
  const cutoff7 = targetTs - 7 * 86400000;
  const cutoff14 = targetTs - 14 * 86400000;
  const last7 = [...sessions, ...devSessions].filter(s => (s.endedAt as number) >= cutoff7);
  const prev7 = [...sessions, ...devSessions].filter(s => (s.endedAt as number) >= cutoff14 && (s.endedAt as number) < cutoff7);
  if (prev7.length > 0 && last7.length < prev7.length * 0.5) {
    out.signals.push(`Light activity dropped ${Math.round((1 - last7.length / prev7.length) * 100)}% vs prior week (${last7.length} sessions vs ${prev7.length})`);
  }
  // Do not compare modeled sunlight IU-equivalents with an oral-intake target.
  // They are different constructs and neither predicts serum 25(OH)D here.
  return out;
}

// ─── Context ───────────────────────────────────────────────────────────

export function buildDayContext(target: Partial<DayTarget> | null | undefined) {
  const targetDate = target?.date || new Date();
  const { sun, dev, measurements } = _collectWindowData(targetDate);
  const lines: string[] = [];
  const sd = (state.importedData?.sunDefaults || {}) as SunSetupDefaults & { dailyVitDTargetIU?: unknown };
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
          const elevStart = 90 - ((lightTodayDeps.solarZenithAngle as (date: Date, lat: unknown, lon: unknown) => unknown)(new Date(s.startedAt), s.location.lat, s.location.lon) as number);
          const elevEnd = 90 - ((lightTodayDeps.solarZenithAngle as (date: Date, lat: unknown, lon: unknown) => unknown)(new Date(s.endedAt), s.location.lat, s.location.lon) as number);
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
    const deviceById = Object.fromEntries(((state.importedData?.lightDevices || []) as LightDeviceRecord[]).map(d => [d.id, d]));
    for (const s of dev.sort((a, b) => a.startedAt - b.startedAt)) {
      const start = new Date(s.startedAt);
      const device = deviceById[s.deviceId as string];
      const devName = device ? (_safeText(`${device.brand || ''} ${device.model || ''}`) || 'unnamed device') : 'unknown device';
      const devType = device?.type ? ` (${_safeText(device.type, 30)})` : '';
      lines.push(`  - ${start.toTimeString().slice(0, 5)} · ${Math.round(s.durationMin as number)} min · ${devName}${devType} @ ${s.distanceCm}cm, ${_safeText(s.bodyArea, 40) || '?'}${s.eyesProtected ? ', eyes protected' : ', eyes uncovered'}`);
    }
  }

  if (measurements.length) {
    lines.push('');
    lines.push(`### Tool measurements (${measurements.length})`);
    const byTool: Record<string, StoredLightMeasurement[]> = {};
    for (const m of measurements) {
      if (!byTool[m.tool as string]) byTool[m.tool as string] = [];
      byTool[m.tool as string]!.push(m);
    }
    for (const [tool, list] of Object.entries(byTool)) {
      if (tool === 'lux' || tool === 'cct' || tool === 'glass-transmission') {
        lines.push(`  - ${tool}: ${list.map(m => Math.round(m.value as number)).join(', ')}`);
      } else if (tool === 'flicker') {
        lines.push(`  - flicker: scores ${list.map(m => Math.round(m.value as number)).join(', ')} (0=pristine, 3=severe)`);
      } else if (tool === 'darkness') {
        const m = list[0]!;
        lines.push(`  - sleep darkness: ${(m.extra as { label?: unknown } | null)?.label || ''} (${m.value} lux mean)`);
      } else if (tool === 'spectrum') {
        const m = list[0]!;
        lines.push(`  - spectrum: ${m.value || (m.extra as { label?: unknown } | null)?.label}`);
      }
    }
  }

  const sun7 = (lightTodayDeps.rollingChannelTotals as (days: number) => Record<string, unknown> | null)(7) || {};
  const dev7 = (lightTodayDeps.rollingDeviceTotals as (days: number) => Record<string, unknown> | null)(7) || {};
  const vit7 = (lightTodayDeps.rollingVitaminDIU as (days: number) => unknown)(7);
  lines.push('');
  lines.push('### Last 7 days context');
  lines.push(`Modeled sunlight vitamin-D comparison: ~${Math.round(vit7 as number)} IU-equivalent (wide uncertainty; not measured synthesis or intake)`);
  // Channel context reports source presence only. It does not merge targeted
  // devices with sunlight or turn an internal normalization into a grade.
  const channelOrder = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye'];
  for (const k of channelOrder) {
    const sun = ((sun7[k] || 0) as number) > 0 ? 'sunlight logged' : 'no sunlight log';
    const device = ((dev7[k] || 0) as number) > 0 ? 'device logged separately' : 'no device log';
    if (((sun7[k] || 0) as number) <= 0 && ((dev7[k] || 0) as number) <= 0) continue;
    lines.push(`  - ${((CHANNEL_DISPLAY as Record<string, { label?: unknown }>)[k]?.label || k)}: ${sun}; ${device}`);
  }

  lines.push('');
  lines.push('### User profile');
  if (sd.fitzpatrick) lines.push(`Skin type: Fitzpatrick ${sd.fitzpatrick}`);
  else if (lc.skinType) lines.push(`Skin type: ${lc.skinType}`);
  if (sd.dailyVitDTargetIU) lines.push(`Separate recorded vitamin-D intake target: ${sd.dailyVitDTargetIU} IU/day (do not compare directly with sunlight IU-equivalent)`);
  if (goals) lines.push(`Health goals: ${String(goals).slice(0, 200)}`);

  const vitaminD = latestVitaminDContext(state.importedData?.entries);
  if (vitaminD) lines.push(vitaminD);

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
export function getDayFingerprint(target: Partial<DayTarget> | null | undefined) {
  const targetDate = target?.date || new Date();
  const { sun, dev, measurements } = _collectWindowData(targetDate);
  const parts: unknown[] = [_dayFingerprintSalt, _localDateString(targetDate), sun.length, dev.length, measurements.length];
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

const engine = createAIVerdict<DayTarget>({
  // Synthetic-target shape: target = { key, date, isLightTodayTarget: true }
  getTarget: (key) => {
    const [y, m, d] = String(key).split('-').map(Number);
    if (!y || !m || !d) return null;
    return _wrapDate(new Date(y as number, (m as number) - 1, d as number));
  },
  getId: (t) => t?.key,
  getAIAnalysis: (t, data) => (_getDailyVerdicts(data)[t.key] || null) as AIVerdictAnalysis | null,
  setAIAnalysis: (t, v, data) => {
    const verdicts = _getDailyVerdicts(data);
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

export const analyzeDayAI = (date?: Date | null, opts?: AnalyzeOptions) => engine.analyze(_wrapDate(date || new Date()), opts) as Promise<unknown>;
export async function refreshDayAIAnalysis(dateKey?: string | null) {
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
const _autoFiredKeys = new Set<string>();

// Both surfaces share one attempt per current profile/root/epoch and date.
function queueDayAnalysis(target: DayTarget, status: import('./ai-verdict-engine.js').AIVerdictStatus, cached: VerdictRead | undefined) {
  const stale = !!(cached?.fingerprint && cached.fingerprint !== getDayFingerprint(target));
  const owner = captureAIVerdictOwner();
  const key = owner.key(target.key);
  if ((status !== 'idle' && !stale) || _autoFiredKeys.has(key)) return;
  const data = state.importedData;
  const hasActivity = (data.sunSessions || []).some(session => session.endedAt)
    || (data.deviceSessions || []).some(session => session.endedAt)
    || (data.lightMeasurements || []).length > 0;
  if (!hasActivity) return;
  _autoFiredKeys.add(key);
  setTimeout(() => { if (owner.current()) void engine.analyze(target).catch(() => {}); }, 0);
}

export function getLightTodayHeroView() {
  const today = new Date();
  const target = _wrapDate(today);
  const status = engine.getStatus(target);
  const cached = _getDailyVerdicts()[target.key] as VerdictRead | undefined;
  if (!hasAssistantFeatureProvider() && !(cached?.status === 'ok' && cached?.dot)) return null;
  queueDayAnalysis(target, status, cached);
  return captureLightAIView(projectReviewAI({ kind: 'today', status, variant: status,
    analysis: cached, actionOwner: aiActionOwner(), trends: computeLightTrends(today).signals,
  }));
}
export function renderLightTodayHero(){const view=getLightTodayHeroView();return view?renderHTML({view}):'';}

// The dashboard reads the same daily cache and exposes full detail without hover.
export function getLightTodayDashboardView() {
  const target = _wrapDate(new Date());
  const status = engine.getStatus(target);
  const cached = _getDailyVerdicts()[target.key] as VerdictRead | undefined;
  if (!hasAssistantFeatureProvider() && !(cached?.status === 'ok' && cached?.dot)) return null;
  queueDayAnalysis(target, status, cached);
  return captureLightAIView(projectReviewAI({ kind: 'dashboard', status,
    variant: status === 'ok' && !cached?.dot ? 'idle' : status,
    analysis: cached, actionOwner: aiActionOwner(),
  }));
}
export function renderLightTodayDashboardChip(){const view=getLightTodayDashboardView();return view?renderHTML({view}):'';}

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
