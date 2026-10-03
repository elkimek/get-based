// Period summaries retain denominators and source boundaries; raw rows remain separate.
import { nutrientRollup } from './nutrition-summary.js';
import { NUTRIENT_DEFINITIONS } from './nutrition-nutrient-registry.js';
import { CANONICAL_METRICS, adapterById } from './wearable-adapters.js';
import { formatWearableMetricValue, wearableDisplayUnit } from './wearables-formatters.js';
import { formatValue } from './utils.js';
import type { computeNutritionHistory } from './nutrition-summary.js';
import type { CanonicalWearableMetricId } from './wearable-adapters.js';
import type { DeviceSessionRecord, LightDeviceRecord } from './light-devices-store.js';
import type { SunSessionRecord } from './sun-sessions-store.js';
import type { LightMeasurement, LightRoom, LightScreen } from './light-env-model.js';

export type ReportNutritionMeal = Pick<ReturnType<typeof computeNutritionHistory>['meals'][number],
  'localDate' | 'eatenAt' | 'reviewed' | 'source' | 'nutrients'>;
export interface ReportWearableRecord {
  id: string;
  source?: string | null | undefined;
  kind: string;
  date: string;
  value: number;
}
export type ReportLightSession = Partial<Pick<DeviceSessionRecord,
  'deviceId' | 'mode' | 'endedAt' | 'durationMin' | 'distanceCm' | 'bodyArea' | 'bodyAreas' | 'eyesProtected' | 'doses'>>
  & Partial<Pick<SunSessionRecord, 'startedAt' | 'bodyExposure' | 'eyeExposure'>>
  & { safety?: Partial<NonNullable<DeviceSessionRecord['safety']>> | null };
export interface ReportLightRecord {
  kind: string;
  session: ReportLightSession;
  device?: LightDeviceRecord | null | undefined;
}
export interface ReportEnvironmentMeasurement extends Omit<LightMeasurement, 'extra'> {
  id?: string;
  roomId?: unknown;
  unit?: unknown;
  label?: unknown;
  extra?: NonNullable<LightMeasurement['extra']> & { calibrationFactor?: unknown; calibrationConfirmed?: unknown } | null | undefined;
}
export interface ReportEnvironmentObservation {
  roomId?: unknown;
  label?: unknown;
  createdAt?: unknown;
  date?: unknown;
}
export interface ReportEnvironmentSources {
  lightEnvironment?: { rooms?: LightRoom[] | null | undefined; screens?: LightScreen[] | null | undefined } | null | undefined;
  lightMeasurements?: ReportEnvironmentMeasurement[] | null | undefined;
  lightAudits?: ReportEnvironmentObservation[] | null | undefined;
  emfAssessment?: ReportEnvironmentObservation & { assessments?: ReportEnvironmentObservation[] | null } | null | undefined;
  measurementFacts?: Record<string, string> | null | undefined;
}
type DateInput = string | number | Date;


export function reportDay(value: unknown) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
  }
  if (value == null || value === '') return '';
  const date = new Date(value as DateInput);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;
const span = (days: string[]) => days.length ? `${days[0]} to ${days[days.length - 1]}` : 'No dated records';
const dayKeys = (rows: Array<{ date: unknown }>) => [...new Set(rows.map(row => reportDay(row.date)).filter(Boolean))].sort();

export function summarizeNutrition(meals: ReportNutritionMeal[]) {
  const dated = meals.filter(meal => reportDay(meal.localDate || meal.eatenAt));
  const rollup = nutrientRollup(dated);
  const days = [...new Set(dated.map(meal => reportDay(meal.localDate || meal.eatenAt)))].sort();
  const core = new Set(['energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fiberG', 'fluidMl', 'plainWaterMl']);
  const rows = NUTRIENT_DEFINITIONS.filter(field => core.has(field.key) || rollup.nutrientCoverage[field.key]).map(field => {
    const coverage = rollup.nutrientCoverage[field.key];
    const average = rollup.dailyAverages[field.key];
    const observed = rollup.totals[field.key];
    return [field.label, finite(average) ? `${formatValue(average)} ${field.unit}` : 'Insufficient recorded values',
      coverage ? `${coverage.completeDays} eligible / ${coverage.loggedDays} logged days; ${coverage.observedMeals}/${coverage.totalMeals} entries` : 'Not recorded',
      finite(observed) ? `${formatValue(observed)} ${field.unit}` : '—'];
  });
  const sources = [...new Set(meals.map(meal => meal.source?.kind || 'source not specified'))].join(', ');
  const reviewed = meals.filter(meal => meal.reviewed === true).length;
  return { columns: ['Recorded nutrient', 'Average / eligible logged day', 'Coverage', 'Recorded total'], rows: meals.length ? rows : [],
    note: `${meals.length} food/drink entries across ${days.length} dated days (${span(days)}); ${meals.length - dated.length} undated entries excluded from averages. ${reviewed} entries explicitly marked reviewed. Sources: ${sources || 'none'}. Eligible means the nutrient is present in all relevant logged food entries, not that a whole day was logged. Drink volumes use explicit volume entries. Missing values and days are unknown, not zero. Plain water is part of beverage volume; neither measures hydration status. Sparse logs do not establish usual intake.` };
}

export function summarizeWearables(records: ReportWearableRecord[], scope: { unitSystem: string }) {
  const groups = new Map<string, ReportWearableRecord[]>();
  // Prefer local daily history over its duplicated synced latest reading.
  for (const record of records) {
    if (record.kind === 'Synced latest reading' && records.some(other => other.kind !== record.kind && other.id === record.id && other.source === record.source && other.date === record.date)) continue;
    const key = JSON.stringify([record.id, record.source]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(record);
  }
  const rows: unknown[][] = [];
  for (const records of groups.values()) {
    const { id, source } = records[0]!;
    const metric = CANONICAL_METRICS[id as CanonicalWearableMetricId];
    const dated = records.filter(row => reportDay(row.date)).sort((a, b) => a.date.localeCompare(b.date));
    const days = dayKeys(dated);
    const byDay = new Map<string, number[]>();
    for (const row of dated) { if (!byDay.has(row.date)) byDay.set(row.date, []); byDay.get(row.date)!.push(row.value); }
    const values = [...byDay.values()].map(mean);
    const fmt = (value: number) => formatWearableMetricValue(id, value, metric.unit, scope.unitSystem);
    const latest = dated[dated.length - 1];
    const first = dated[0];
    rows.push([`${metric.label} ${metric.sub || ''}`.trim(), adapterById(source)?.label || source || 'Not specified',
      latest ? `${fmt(latest.value)} (${latest.date})` : 'No dated reading',
      first && days.length > 1 ? `${fmt(first.value)} (${first.date})` : 'No earlier day',
      values.length ? `${fmt(mean(values))}; ${fmt(Math.min(...values))}–${fmt(Math.max(...values))}` : 'Not available',
      `${wearableDisplayUnit(id, metric.unit, scope.unitSystem)}; ${days.length} days / ${dated.length} readings; ${span(days)}${records.length > dated.length ? `; ${records.length - dated.length} undated` : ''}`]);
  }
  return { columns: ['Metric', 'Source', 'Latest', 'Earliest', 'Daily mean; min–max', 'Units / coverage'], rows,
    note: 'Sources are kept separate. Daily means weight each observed day equally; min–max describes daily means. Synced latest readings are replaced by same-source/day history when available. A single latest reading is not a period history. Unlogged days are unknown.' };
}

export function summarizeLight(sessions: ReportLightRecord[], channelExposure: (key: string, value: number, session: ReportLightSession) => string) {
  const groups = new Map<string, ReportLightRecord[]>();
  for (const item of sessions) {
    const key = JSON.stringify([item.kind, item.session.deviceId || item.device?.name || '', item.session.mode || '']);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  const rows: unknown[][] = [];
  for (const items of groups.values()) {
    const { kind, device, session } = items[0]!;
    const completed = items.filter(item => item.session.endedAt && finite(item.session.durationMin) && item.session.durationMin! > 0 && reportDay(item.session.startedAt));
    const durations = completed.map(item => item.session.durationMin!);
    const days = [...new Set(completed.map(item => reportDay(item.session.startedAt)))].sort();
    const total = durations.reduce((sum, value) => sum + value, 0);
    const bases = new Set(completed.map(({ session: s, device: d }) => JSON.stringify([s.distanceCm, s.bodyArea, s.bodyAreas, s.bodyExposure, s.eyeExposure, s.eyesProtected, d || null])));
    const exposures: string[] = [];
    if (completed.length && bases.size === 1) {
      for (const key of ['pbm_red', 'pbm_nir', 'nir_solar', 'circadian']) {
        const usable = completed.filter(item => finite(item.session.doses?.[key]) && item.session.doses![key]! >= 0);
        if (!usable.length) continue;
        const value = mean(usable.map(item => item.session.doses![key]!));
        const durationMin = mean(usable.map(item => item.session.durationMin!));
        exposures.push(`${channelExposure(key, value, { ...session, durationMin })} (${key === 'circadian' ? 'duration-weighted' : 'mean/session'}; ${usable.length}/${completed.length} sessions)`);
      }
    }
    const flagged = items.filter(({ session: s }) => s.safety?.unsafeEyeExposure === true);
    const uvStatuses = [...new Set(items.map(({ session: s }) => s.safety?.uvDoseStatus).filter(Boolean))];
    const sed = items.map(({ session: s }) => s.safety?.erythemalSED).filter(finite);
    const timing = { morning: 0, daytime: 0, evening: 0 };
    for (const { session: s } of completed) { const hour = new Date(s.startedAt as DateInput).getHours(); timing[hour < 10 ? 'morning' : hour < 18 ? 'daytime' : 'evening']++; }
    rows.push([`${kind === 'Device' ? device?.name || 'Unnamed device' : 'Sun'}${session.mode ? ` · ${session.mode}` : ''}`,
      `${completed.length} completed / ${days.length} logged days; ${items.length - completed.length} in progress, undated or missing duration; ${span(days)}`,
      durations.length ? `${formatValue(mean(durations))} min/session; ${formatValue(total / days.length)} min/logged day; ${formatValue(Math.min(...durations))}–${formatValue(Math.max(...durations))} min/session` : 'Not available',
      exposures.join('\n') || (bases.size > 1 ? 'Exposure settings vary; doses not pooled.' : 'Comparable modeled dose not available.'),
      `${timing.morning} before 10:00; ${timing.daytime} 10:00–18:00; ${timing.evening} after 18:00. ${flagged.length} recorded eye-exposure flags. UV status: ${uvStatuses.join(', ') || 'not recorded'}.${sed.length ? ` Peak modeled erythemal dose: ${formatValue(Math.max(...sed))} SED (${sed.length} records).` : ''}`]);
  }
  return { columns: ['Source / mode', 'Coverage', 'Recorded duration', 'Modeled exposure', 'Timing / recorded flags'], rows,
    note: 'Only completed, dated sessions with positive duration enter averages. Unlogged days are unknown. Timing uses this device’s timezone. Exposure is modeled, not a measured health effect. Incompatible settings are not pooled; vitamin-D equivalents are not intake. Detailed safety context is retained in the appendix when selected.' };
}

export function summarizeEnvironment(sources: ReportEnvironmentSources, within: (date: unknown) => unknown, facts: (record: unknown, keys: string[]) => string, describe: (record: unknown) => string) {
  const rows: unknown[][] = [];
  const rooms = sources.lightEnvironment?.rooms || [];
  const roomFields = ['primarySource', 'daylightLevel', 'cct', 'flickerScore', 'hoursOccupiedPerDay', 'eveningHoursAfterSunset', 'notes'];
  for (const room of rooms) {
    const text = facts(room, roomFields);
    if (text) rows.push([room.name || 'Unnamed room', text, 'Current settings; not a dated measurement']);
  }
  for (const screen of sources.lightEnvironment?.screens || []) {
    const text = facts(screen, ['hoursPerDay', 'eveningUseAfterSunset', 'blueBlockerEnabled', 'flickerScore']);
    if (text) rows.push([screen.device || 'Screen', text, 'Current settings']);
  }
  const toolNames: Record<string, string> = { lux: 'Light level', darkness: 'Sleep-light check', flicker: 'Camera banding screen', cct: 'Color temperature', spectrum: 'Camera color pattern', 'glass-transmission': 'Glass transmission', audit: 'Light walkthrough' };
  const unlinked = new Map<unknown, string>();
  let portableCount = 0;
  const groups = new Map<string, { label: unknown; records: Array<{ date: string; timestamp: number; text: string }>; comparable: boolean }>();
  const add = (key: string, label: unknown, date: unknown, text: string, comparable = true) => {
    if (!within(date) || !text) return;
    if (!groups.has(key)) groups.set(key, { label, records: [], comparable });
    groups.get(key)!.records.push({ date: reportDay(date), timestamp: new Date(date as DateInput).getTime(), text });
  };
  for (const item of sources.lightMeasurements || []) {
    if (!within(item.capturedAt)) continue;
    let room = item.roomId ? rooms.find(room => room.id === item.roomId)?.name : null;
    if (!room && item.roomId) {
      if (!unlinked.has(item.roomId)) unlinked.set(item.roomId, `Unlinked location ${unlinked.size + 1}`);
      room = unlinked.get(item.roomId)!;
    } else if (!item.roomId) portableCount++;
    const method = JSON.stringify([item.roomId, item.tool, item.unit, item.extra?.source, item.extra?.method, item.extra?.calibrationFactor, item.extra?.calibrationConfirmed, item.label]);
    const label = [room, item.label, toolNames[item.tool as string] || 'Environmental measurement'].filter(Boolean).join(' · ');
    add(method, label, item.capturedAt, sources.measurementFacts?.[item.id as string] || facts(item, ['value', 'confidence', 'notes', 'extra']), !!item.roomId);
  }
  for (const item of sources.lightAudits || []) add(`audit:${item.roomId || item.label || 'all'}`, item.label || 'Light audit', item.createdAt || item.date, describe(item), !!item.roomId);
  for (const item of sources.emfAssessment?.assessments || (sources.emfAssessment ? [sources.emfAssessment] : [])) add(`emf:${item.label || 'assessment'}`, item.label || 'EMF assessment', item.date, facts(item, ['consultant', 'rooms', 'note']), false);
  for (const { label, records, comparable } of groups.values()) {
    const dated = records.filter(record => record.date).sort((a, b) => a.timestamp - b.timestamp);
    const first = dated[0], last = dated[dated.length - 1];
    const undated = records.length - dated.length;
    const coverage = `${records.length} recorded observation${records.length === 1 ? '' : 's'}${undated ? `; ${undated} undated` : ''}`;
    const earlier = comparable && first && last && first.date !== last.date ? `\nEarlier (${first.date}): ${first.text}` : '';
    rows.push([label, last ? `${last.date}\n${last.text}` : records.at(-1)!.text,
      coverage + earlier + (undated && last ? '; undated details in appendix' : '')]);
  }
  return { columns: ['Assessment', 'Latest / current', 'Recorded coverage / earlier observation'], rows,
    note: 'Light tools normally retain the latest reading per location and tool, not a before/after history. Earlier observations appear only for the same recorded location and method on different dates; capture conditions may still differ. Spot checks do not measure average daily exposure or an intervention effect. Current settings are undated. Camera screening limitations apply.'
      + (portableCount ? ` ${portableCount} reading${portableCount === 1 ? ' has' : 's have'} no linked location; they are not treated as a room comparison.` : '')
      + (unlinked.size ? ` ${unlinked.size} linked location${unlinked.size === 1 ? ' has' : 's have'} no readable room name. Numbered labels distinguish them within this report only.` : '') };
}
