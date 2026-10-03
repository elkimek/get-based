// Optional report histories, projected into allowlisted, printable facts.
import { reportDay, summarizeNutrition, summarizeWearables, summarizeLight, summarizeEnvironment } from './export-report-aggregates.js';
export { reportDay };
import { NUTRIENT_DEFINITIONS } from './nutrition-nutrient-registry.js';
import { CANONICAL_METRICS, adapterById } from './wearable-adapters.js';
import { formatWearableMetricValue, wearableDisplayUnit } from './wearables-formatters.js';
import { pbmJoulesPerCm2, circadianMelanopicLux, vitaminDIUPerSession } from './sun-spectrum.js';
import { formatValue } from './utils.js';
import type { ReportNutritionMeal, ReportWearableRecord, ReportLightRecord, ReportLightSession, ReportEnvironmentSources, ReportEnvironmentMeasurement } from './export-report-aggregates.js';
import type { NutritionMeal } from '../types/nutrition-data.js';
import type { StoredNutritionMeal } from './nutrition-sync-sanitize.js';
import type { Biometrics } from '../types/profile-context-data.js';
import type { WearableSummarySnapshot } from './wearables-summary-model.js';
import type { StoredWearableRow } from './wearable-storage-types.js';
import type { CanonicalWearableMetricId } from './wearable-adapters.js';
import type { DeviceSessionRecord, LightDeviceRecord } from './light-devices-store.js';
import type { SunSessionRecord } from './sun-sessions-store.js';

export type ReportMeal = Omit<ReportNutritionMeal, 'eatenAt'> & Pick<Partial<StoredNutritionMeal>, 'eatenAt'> & Partial<Pick<NutritionMeal, 'id' | 'name' | 'components'>> & {
  images?: unknown; image?: unknown; dataUrl?: unknown; photoDataUrl?: unknown; fullSizePhoto?: unknown;
  notes?: unknown;
  assumptions?: { join?: (separator: string) => unknown } | null;
  uncertainties?: { join?: (separator: string) => unknown } | null;
};
interface ReportSessionSafety extends Partial<NonNullable<DeviceSessionRecord['safety']>> {
  fitzpatrick?: NonNullable<SunSessionRecord['safety']>['fitzpatrick'];
}
export type ReportSession = Omit<ReportLightSession, 'safety'>
  & Partial<Pick<DeviceSessionRecord, 'deviceSnapshot' | 'notes' | 'fitzpatrick'>>
  & Partial<Pick<SunSessionRecord, 'atmosphere'>>
  & { safety?: ReportSessionSafety | null };
export interface ReportSources extends Omit<ReportEnvironmentSources, 'lightMeasurements'> {
  nutritionMeals?: Array<ReportMeal | null | undefined> | null | undefined;
  deletedMeals?: unknown[] | null | undefined;
  _deleted?: { nutritionMeals?: unknown[] | null | undefined } | null | undefined;
  wearableSummary?: WearableSummarySnapshot | null | undefined;
  wearableDaily?: StoredWearableRow[] | null | undefined;
  biometrics?: Biometrics | null | undefined;
  unavailableWearableRows?: unknown;
  sunSessions?: ReportSession[] | null | undefined;
  deviceSessions?: ReportSession[] | null | undefined;
  lightDevices?: LightDeviceRecord[] | null | undefined;
  lightMeasurements?: Array<ReportEnvironmentMeasurement & { notes?: unknown }> | null | undefined;
}
export interface ReportSectionScope {
  startDate?: string | null | undefined;
  endDate?: string | null | undefined;
  unitSystem: string;
}
export interface ExtraReportSection {
  id: string;
  title: string;
  columns: string[];
  rows: unknown[][];
  note: string;
  summary?: ReturnType<typeof summarizeNutrition | typeof summarizeWearables | typeof summarizeLight | typeof summarizeEnvironment>;
}


export const EXTRA_REPORT_SECTIONS = [
  { id: 'nutrition', label: 'Nutrition and hydration logs' },
  { id: 'wearables', label: 'Body and wearable measurements' },
  { id: 'light', label: 'Sun and light-device sessions' },
  { id: 'environment', label: 'Light environment and assessments' },
];
const SOURCE_FIELDS = {
  nutrition: ['nutritionMeals'],
  wearables: ['wearableSummary', 'biometrics'],
  light: ['sunSessions', 'deviceSessions', 'lightDevices'],
  environment: ['lightEnvironment', 'lightMeasurements', 'lightAudits', 'emfAssessment'],
};
export function captureReportSources(importedData: ReportSources, sections: string[]): ReportSources {
  const sources: ReportSources = {};
  for (const section of sections) for (const field of (SOURCE_FIELDS as Record<string, string[]>)[section] || []) {
    if ((importedData as Record<string, unknown>)[field] != null) {
      const value = field === 'nutritionMeals' ? ((importedData as Record<string, unknown>)[field] as ReportMeal[]).map(({ images, image, dataUrl, photoDataUrl, fullSizePhoto, ...meal }) => meal) : (importedData as Record<string, unknown>)[field];
      (sources as Record<string, unknown>)[field] = JSON.parse(JSON.stringify(value));
    }
  }
  if (sections.includes('nutrition')) sources.deletedMeals = [...(importedData._deleted?.nutritionMeals || [])];
  return sources;
}
const FIELD_LABELS = { cct: 'Color temperature (K)', distanceCm: 'Distance (cm)', vitamin_d: 'Vitamin D', nir_solar: 'Solar near-IR', pbm_red: 'Red light', pbm_nir: 'Near-IR', circadian: 'Circadian', erythemalSED: 'Modeled erythemal dose (SED)' };
const humanize = (value: unknown) => (FIELD_LABELS as Record<string, string>)[value as string] || String(value ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, char => char.toUpperCase());
function channelExposure(key: string, value: number, session: ReportLightSession) {
  const label = humanize(key);
  if (['nir_solar', 'pbm_red', 'pbm_nir'].includes(key)) return `${label}: ${formatValue(pbmJoulesPerCm2(value))} J/cm²`;
  if (key === 'circadian' && session.durationMin! > 0) return `${label}: ${formatValue(circadianMelanopicLux(value, session.durationMin!))} estimated melanopic-equivalent lux`;
  const fitz = (session.safety as ReportSession['safety'])?.fitzpatrick || (session as ReportSession).fitzpatrick;
  if (key === 'vitamin_d' && fitz) return `${label}: ${formatValue(vitaminDIUPerSession(value, fitz, (session as ReportSession).atmosphere?.uvIndex as number | null | undefined, !!session.bodyExposure?.rotatedSides, null, session.bodyExposure?.fraction))} modeled IU-equivalent`;
  return `${label}: ${formatValue(value)} a.u.`;
}
function facts(record: unknown, keys: string[]): string {
  return keys.filter(key => (record as Record<string, unknown> | null | undefined)?.[key] != null && (record as Record<string, unknown>)[key] !== '').map(key => `${humanize(key)}: ${describe((record as Record<string, unknown>)[key])}`).join('; ');
}
function describe(value: unknown): string {
  if (Array.isArray(value)) return value.map(describe).join(', ');
  if (value && typeof value === 'object') return facts(value, Object.keys(value).filter(key => !/^(id|.*Id|.*At|ai.*|.*Analysis|.*Prompt)$/i.test(key)));
  return String(value ?? '');
}
export function buildExtraReportSections(sources: ReportSources, sections: string[], scope: ReportSectionScope) {
  const within = (value: unknown) => { const day = reportDay(value); return !day || ((!scope.startDate || day >= scope.startDate) && (!scope.endDate || day <= scope.endDate)); };
  const result: ExtraReportSection[] = [];
  const add = (id: string, title: string, columns: string[], rows: unknown[][], note = '') => result.push({ id, title, columns, rows, note });
  if (sections.includes('nutrition')) {
    const deleted = new Set(sources.deletedMeals || sources._deleted?.nutritionMeals || []);
    const meals = (sources.nutritionMeals || []).filter(meal => meal && !deleted.has(meal.id) && within(meal.localDate || meal.eatenAt)) as ReportMeal[];
    meals.sort((a, b) => String(a.localDate || a.eatenAt || '').localeCompare(String(b.localDate || b.eatenAt || '')));
    add('nutrition', 'Nutrition and hydration', ['Date / meal', 'Recorded nutrients', 'Source and notes'], meals.map(meal => [
      `${meal.localDate || reportDay(meal.eatenAt) || 'Undated'} ${meal.name || 'Meal'}${meal.components?.length ? '\nFoods: ' + meal.components.map(item => item.name || item.description || '').filter(Boolean).join(', ') : ''}`,
      NUTRIENT_DEFINITIONS.filter(field => typeof meal.nutrients?.[field.key] === 'number' && Number.isFinite(meal.nutrients[field.key])).map(field => `${field.label}: ${formatValue(meal.nutrients![field.key] as number)} ${field.unit}`).join('\n') || 'Not recorded',
      [humanize(meal.source?.kind || 'Not specified'), meal.notes, meal.assumptions?.join?.('; '), meal.uncertainties?.join?.('; ')].filter(Boolean).join('\n'),
    ]), 'Recorded or estimated intake, not a complete dietary assessment. Missing nutrients are not zero. Photos are excluded.');
    result[result.length - 1]!.summary = summarizeNutrition(meals as Parameters<typeof summarizeNutrition>[0]);
  }
  if (sections.includes('wearables')) {
    const rows: Array<[string, string, ...unknown[]]> = [];
    const records: ReportWearableRecord[] = [];
    const append = (id: string, value: unknown, date: unknown, source: unknown, kind: string) => {
      const metric = CANONICAL_METRICS[id as CanonicalWearableMetricId];
      if (!metric || typeof value !== 'number' || !Number.isFinite(value) || !within(date)) return;
      records.push({ id, value, date, source, kind } as ReportWearableRecord);
      rows.push([date as string || 'Undated', `${metric.label} ${metric.sub || ''}`.trim(), formatWearableMetricValue(id, value, metric.unit, scope.unitSystem), wearableDisplayUnit(id, metric.unit, scope.unitSystem), adapterById(source)?.label || source || 'Not specified', kind]);
    };
    for (const [id, metric] of Object.entries(sources.wearableSummary?.metrics || {})) append(id, metric.latest, metric.latestDate, metric.primarySource, 'Synced latest reading');
    for (const row of sources.wearableDaily || []) for (const id of Object.keys(CANONICAL_METRICS)) append(id, row[id], row.date, row.source, 'Local daily history');
    for (const item of sources.biometrics?.weight || []) append('weight', /lb/i.test(item.unit || '') ? item.value / 2.2046226218 : item.value, item.date, 'manual', 'Profile history');
    for (const item of sources.biometrics?.bp || []) { append('bp_systolic', item.sys, item.date, 'manual', 'Profile history'); append('bp_diastolic', item.dia, item.date, 'manual', 'Profile history'); }
    for (const item of sources.biometrics?.pulse || []) append('rhr', item.value, item.date, 'manual', 'Profile history');
    rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    add('wearables', 'Body and wearable measurements', ['Date', 'Metric', 'Value', 'Unit', 'Source', 'Coverage'], rows, `Daily history is available only where stored on this device; synced latest readings are labeled separately.${sources.unavailableWearableRows ? ` ${sources.unavailableWearableRows} local rows could not be decrypted and are omitted.` : ''}`);
    result[result.length - 1]!.summary = summarizeWearables(records, scope);
  }
  if (sections.includes('light')) {
    const rows: Array<[string, string, ...unknown[]]> = [];
    const recordedSessions: ReportLightRecord[] = [];
    for (const [kind, sessions] of [['Sun', sources.sunSessions], ['Device', sources.deviceSessions]] as Array<[string, ReportSession[] | null | undefined]>) for (const session of sessions || []) {
      if (!within(session.startedAt)) continue;
      const device = session.deviceSnapshot || sources.lightDevices?.find(item => item.id === session.deviceId);
      recordedSessions.push({ kind, session, device });
      rows.push([reportDay(session.startedAt) || 'Undated', kind === 'Device' ? `Device: ${device?.name || 'Unnamed'}` : kind,
        !session.endedAt ? 'In progress' : session.durationMin != null ? `${formatValue(session.durationMin)} min` : 'Not recorded',
        [facts(session, ['mode', 'distanceCm', 'bodyArea', 'bodyExposure', 'eyeExposure', 'eyesProtected']), session.notes].filter(Boolean).join('\n'),
        session.doses ? Object.entries(session.doses).filter(([, value]) => typeof value === 'number').map(([key, value]) => channelExposure(key, value, session)).join('\n') : 'Not calculated',
        facts(session.safety, ['unsafeEyeExposure', 'erythemalSED', 'uvDoseStatus', 'conservativeBaseMedFraction']),
      ]);
    }
    rows.sort((a, b) => a[0].localeCompare(b[0]));
    add('light', 'Sun and light-device sessions', ['Date', 'Source', 'Duration', 'Exposure / notes', 'Modeled channel exposure', 'Safety context'], rows, 'Exposure values are model estimates, not measured health effects or vitamin D intake. Unconverted channels use model units (a.u.); missing calculations are identified.');
    result[result.length - 1]!.summary = summarizeLight(recordedSessions, channelExposure);
  }
  if (sections.includes('environment')) {
    const rows: unknown[][] = [];
    for (const room of sources.lightEnvironment?.rooms || []) rows.push(['Current room', room.name || 'Room', facts(room, ['primarySource', 'daylightLevel', 'cct', 'flickerScore', 'hoursOccupiedPerDay', 'eveningHoursAfterSunset', 'notes'])]);
    for (const screen of sources.lightEnvironment?.screens || []) rows.push(['Current screen', humanize(screen.device), facts(screen, ['hoursPerDay', 'eveningUseAfterSunset', 'blueBlockerEnabled', 'flickerScore'])]);
    for (const item of sources.lightMeasurements || []) if (within(item.capturedAt)) rows.push([reportDay(item.capturedAt) || 'Undated', item.label || humanize(item.tool), [sources.measurementFacts?.[item.id as string] || facts(item, ['value', 'confidence', 'notes', 'extra']), item.notes].filter(Boolean).join('\n')]);
    for (const item of sources.lightAudits || []) if (within(item.createdAt || item.date)) rows.push([reportDay(item.createdAt || item.date) || 'Undated', 'Light audit', describe(item)]);
    for (const item of sources.emfAssessment?.assessments || (sources.emfAssessment ? [sources.emfAssessment] : [])) if (within(item.date)) rows.push([item.date || 'Undated', item.label || 'EMF assessment', facts(item, ['consultant', 'rooms', 'note'])]);
    add('environment', 'Light environment and assessments', ['Date / scope', 'Record', 'Recorded context'], rows, 'Current room and screen settings are a present-day snapshot; dated measurements, light audits and EMF assessments follow the selected date range. Screening and estimated values are not clinical measurements.');
    result[result.length - 1]!.summary = summarizeEnvironment(sources, within, facts, describe);
  }
  return result;
}
export async function loadExtraReportSources(profileId: string, sources: ReportSources, sections: string[], scope: ReportSectionScope) {
  if (sections.includes('nutrition') && !Array.isArray(sources.nutritionMeals)) {
    const { listNutritionMeals } = await import('./nutrition-store.js');
    sources.nutritionMeals = await listNutritionMeals(profileId, { limit: Number.MAX_SAFE_INTEGER }) as ReportMeal[];
  }
  if (sections.includes('wearables')) {
    const { getDailyForReport } = await import('./wearables-store.js');
    const history = await getDailyForReport(profileId, scope.startDate, scope.endDate);
    sources.wearableDaily = history.rows;
    sources.unavailableWearableRows = history.unavailable;
  }
  if (sections.includes('environment')) {
    const { buildMeasurementFacts } = await import('./light-tools-ai-analysis.js');
    sources.measurementFacts = Object.fromEntries((sources.lightMeasurements || []).map(item => [item.id, buildMeasurementFacts(item).join('\n')]));
  }
  return buildExtraReportSections(sources, sections, scope);
}
