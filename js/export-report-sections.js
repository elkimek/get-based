// @ts-check
// Optional report histories, projected into allowlisted, printable facts.
import { reportDay, summarizeNutrition, summarizeWearables, summarizeLight, summarizeEnvironment } from './export-report-aggregates.js';
export { reportDay };
import { NUTRIENT_DEFINITIONS } from './nutrition-nutrient-registry.js';
import { CANONICAL_METRICS, adapterById } from './wearable-adapters.js';
import { formatWearableMetricValue, wearableDisplayUnit } from './wearables-formatters.js';
import { pbmJoulesPerCm2, circadianMelanopicLux, vitaminDIUPerSession } from './sun-spectrum.js';
import { formatValue } from './utils.js';

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
export function captureReportSources(importedData, sections) {
  const sources = {};
  for (const section of sections) for (const field of SOURCE_FIELDS[section] || []) {
    if (importedData[field] != null) {
      const value = field === 'nutritionMeals' ? importedData[field].map(({ images, image, dataUrl, photoDataUrl, fullSizePhoto, ...meal }) => meal) : importedData[field];
      sources[field] = JSON.parse(JSON.stringify(value));
    }
  }
  if (sections.includes('nutrition')) sources.deletedMeals = [...(importedData._deleted?.nutritionMeals || [])];
  return sources;
}
const FIELD_LABELS = { cct: 'Color temperature (K)', distanceCm: 'Distance (cm)', vitamin_d: 'Vitamin D', nir_solar: 'Solar near-IR', pbm_red: 'Red light', pbm_nir: 'Near-IR', circadian: 'Circadian', erythemalSED: 'Modeled erythemal dose (SED)' };
const humanize = value => FIELD_LABELS[value] || String(value ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, char => char.toUpperCase());
function channelExposure(key, value, session) {
  const label = humanize(key);
  if (['nir_solar', 'pbm_red', 'pbm_nir'].includes(key)) return `${label}: ${formatValue(pbmJoulesPerCm2(value))} J/cm²`;
  if (key === 'circadian' && session.durationMin > 0) return `${label}: ${formatValue(circadianMelanopicLux(value, session.durationMin))} estimated melanopic-equivalent lux`;
  const fitz = session.safety?.fitzpatrick || session.fitzpatrick;
  if (key === 'vitamin_d' && fitz) return `${label}: ${formatValue(vitaminDIUPerSession(value, fitz, session.atmosphere?.uvIndex, !!session.bodyExposure?.rotatedSides, null, session.bodyExposure?.fraction))} modeled IU-equivalent`;
  return `${label}: ${formatValue(value)} a.u.`;
}
function facts(record, keys) {
  return keys.filter(key => record?.[key] != null && record[key] !== '').map(key => `${humanize(key)}: ${describe(record[key])}`).join('; ');
}
function describe(value) {
  if (Array.isArray(value)) return value.map(describe).join(', ');
  if (value && typeof value === 'object') return facts(value, Object.keys(value).filter(key => !/^(id|.*Id|.*At|ai.*|.*Analysis|.*Prompt)$/i.test(key)));
  return String(value ?? '');
}
export function buildExtraReportSections(sources, sections, scope) {
  const within = value => { const day = reportDay(value); return !day || ((!scope.startDate || day >= scope.startDate) && (!scope.endDate || day <= scope.endDate)); };
  const result = [];
  const add = (id, title, columns, rows, note = '') => result.push({ id, title, columns, rows, note });
  if (sections.includes('nutrition')) {
    const deleted = new Set(sources.deletedMeals || sources._deleted?.nutritionMeals || []);
    const meals = (sources.nutritionMeals || []).filter(meal => meal && !deleted.has(meal.id) && within(meal.localDate || meal.eatenAt));
    meals.sort((a, b) => String(a.localDate || a.eatenAt || '').localeCompare(String(b.localDate || b.eatenAt || '')));
    add('nutrition', 'Nutrition and hydration', ['Date / meal', 'Recorded nutrients', 'Source and notes'], meals.map(meal => [
      `${meal.localDate || reportDay(meal.eatenAt) || 'Undated'} ${meal.name || 'Meal'}${meal.components?.length ? '\nFoods: ' + meal.components.map(item => item.name || item.description || '').filter(Boolean).join(', ') : ''}`,
      NUTRIENT_DEFINITIONS.filter(field => typeof meal.nutrients?.[field.key] === 'number' && Number.isFinite(meal.nutrients[field.key])).map(field => `${field.label}: ${formatValue(meal.nutrients[field.key])} ${field.unit}`).join('\n') || 'Not recorded',
      [humanize(meal.source?.kind || 'Not specified'), meal.notes, meal.assumptions?.join?.('; '), meal.uncertainties?.join?.('; ')].filter(Boolean).join('\n'),
    ]), 'Recorded or estimated intake, not a complete dietary assessment. Missing nutrients are not zero. Photos are excluded.');
    result[result.length - 1].summary = summarizeNutrition(meals);
  }
  if (sections.includes('wearables')) {
    const rows = [];
    const records = [];
    const append = (id, value, date, source, kind) => {
      const metric = CANONICAL_METRICS[id];
      if (!metric || typeof value !== 'number' || !Number.isFinite(value) || !within(date)) return;
      records.push({ id, value, date, source, kind });
      rows.push([date || 'Undated', `${metric.label} ${metric.sub || ''}`.trim(), formatWearableMetricValue(id, value, metric.unit, scope.unitSystem), wearableDisplayUnit(id, metric.unit, scope.unitSystem), adapterById(source)?.label || source || 'Not specified', kind]);
    };
    for (const [id, metric] of Object.entries(sources.wearableSummary?.metrics || {})) append(id, metric.latest, metric.latestDate, metric.primarySource, 'Synced latest reading');
    for (const row of sources.wearableDaily || []) for (const id of Object.keys(CANONICAL_METRICS)) append(id, row[id], row.date, row.source, 'Local daily history');
    for (const item of sources.biometrics?.weight || []) append('weight', /lb/i.test(item.unit || '') ? item.value / 2.2046226218 : item.value, item.date, 'manual', 'Profile history');
    for (const item of sources.biometrics?.bp || []) { append('bp_systolic', item.sys, item.date, 'manual', 'Profile history'); append('bp_diastolic', item.dia, item.date, 'manual', 'Profile history'); }
    for (const item of sources.biometrics?.pulse || []) append('rhr', item.value, item.date, 'manual', 'Profile history');
    rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    add('wearables', 'Body and wearable measurements', ['Date', 'Metric', 'Value', 'Unit', 'Source', 'Coverage'], rows, `Daily history is available only where stored on this device; synced latest readings are labeled separately.${sources.unavailableWearableRows ? ` ${sources.unavailableWearableRows} local rows could not be decrypted and are omitted.` : ''}`);
    result[result.length - 1].summary = summarizeWearables(records, scope);
  }
  if (sections.includes('light')) {
    const rows = [];
    const recordedSessions = [];
    for (const [kind, sessions] of [['Sun', sources.sunSessions], ['Device', sources.deviceSessions]]) for (const session of sessions || []) {
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
    result[result.length - 1].summary = summarizeLight(recordedSessions, channelExposure);
  }
  if (sections.includes('environment')) {
    const rows = [];
    for (const room of sources.lightEnvironment?.rooms || []) rows.push(['Current room', room.name || 'Room', facts(room, ['primarySource', 'daylightLevel', 'cct', 'flickerScore', 'hoursOccupiedPerDay', 'eveningHoursAfterSunset', 'notes'])]);
    for (const screen of sources.lightEnvironment?.screens || []) rows.push(['Current screen', humanize(screen.device), facts(screen, ['hoursPerDay', 'eveningUseAfterSunset', 'blueBlockerEnabled', 'flickerScore'])]);
    for (const item of sources.lightMeasurements || []) if (within(item.capturedAt)) rows.push([reportDay(item.capturedAt) || 'Undated', item.label || humanize(item.tool), [sources.measurementFacts?.[item.id] || facts(item, ['value', 'confidence', 'notes', 'extra']), item.notes].filter(Boolean).join('\n')]);
    for (const item of sources.lightAudits || []) if (within(item.createdAt || item.date)) rows.push([reportDay(item.createdAt || item.date) || 'Undated', 'Light audit', describe(item)]);
    for (const item of sources.emfAssessment?.assessments || (sources.emfAssessment ? [sources.emfAssessment] : [])) if (within(item.date)) rows.push([item.date || 'Undated', item.label || 'EMF assessment', facts(item, ['consultant', 'rooms', 'note'])]);
    add('environment', 'Light environment and assessments', ['Date / scope', 'Record', 'Recorded context'], rows, 'Current room and screen settings are a present-day snapshot; dated measurements, light audits and EMF assessments follow the selected date range. Screening and estimated values are not clinical measurements.');
    result[result.length - 1].summary = summarizeEnvironment(sources, within, facts, describe);
  }
  return result;
}
export async function loadExtraReportSources(profileId, sources, sections, scope) {
  if (sections.includes('nutrition') && !Array.isArray(sources.nutritionMeals)) {
    const { listNutritionMeals } = await import('./nutrition-store.js');
    sources.nutritionMeals = await listNutritionMeals(profileId, { limit: Number.MAX_SAFE_INTEGER });
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
