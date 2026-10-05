// Retained source rows and copied marker leaves are not validated by this generator.
interface DemoHistoricalEntry extends Record<string, unknown> { date: unknown; markers?: unknown }
export interface DemoBiologyPanel {
  date: string; file: null; markers: Record<string, unknown>;
  context: { fasting: true; sampleTime: '08:05'; cycleDay?: 10; cyclePhase?: 'follicular'; cyclePhaseDetail?: 'late_follicular'; cyclePhaseSource?: 'recorded' };
  markerSources: Record<string, { file: string; at: number }>;
}
export interface PreparedDemoBiologyData extends Record<string, unknown> {
  entries: Array<DemoHistoricalEntry | DemoBiologyPanel>;
  diagnoses: Record<string, unknown> & { flags: Record<string, unknown> & { intenseTrainingRecent: false; acuteIllnessNearDraw: false } };
  demoBiology: { version: 1; synthetic: true; loadedAt: number; panelDates: string[]; months: 14 };
}
type DemoClock = Pick<Date, 'getFullYear' | 'getMonth' | 'getDate' | 'getTime'>;

// Synthetic, rolling lab history, used only when creating a new demo profile.
// Existing profiles (including edited demos) are never rewritten on reload.
const DAY = 86400000;
const DRAW_OFFSETS = [406, 348, 290, 232, 174, 116, 58, 0];
const dateAt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const round = (value: number) => Number(value.toFixed(3));

// Keep the demo's cycle calendar, source timestamps, therapies and date-keyed
// notes aligned with its labs. Do not shift durations, ages or measurements.
function shiftTimeline(value: string, delta: number, key?: string): string;
function shiftTimeline(value: unknown, delta: number, key?: string): unknown;
function shiftTimeline(value: unknown, delta: number, key = ''): unknown {
  if (typeof value === 'string') return value.replace(/\d{4}-\d{2}-\d{2}/g, date => {
    const timestamp = Date.parse(`${date}T00:00:00Z`);
    return Number.isFinite(timestamp) ? dateAt(timestamp + delta) : date;
  });
  if (typeof value === 'number' && /(?:At|^at)$/.test(key) && value >= 946684800000) return value + delta;
  if (Array.isArray(value)) return value.map(item => shiftTimeline(item, delta, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([name, item]) => [shiftTimeline(name, delta), shiftTimeline(item, delta, name)]));
  return value;
}

export function prepareDemoBiologyData(source: unknown, sex: unknown, { now = new Date() }: { now?: DemoClock | undefined } = {}): PreparedDemoBiologyData {
  if ((source as { _source?: unknown } | null | undefined)?._source !== 'demo') throw new Error('Only bundled demo data can be prepared.');
  const reference = Date.parse(String((source as { exportedAt?: unknown }).exportedAt).slice(0, 10) + 'T00:00:00Z');
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  if (!Number.isFinite(reference) || !Number.isFinite(today)) throw new Error('Invalid demo timeline.');
  const data = shiftTimeline(source, today - DAY - reference) as Record<string, unknown>;
  const latest = (data.entries as DemoHistoricalEntry[]).map(entry => entry.date).sort().at(-1);
  const latestMs = Date.parse(`${latest}T00:00:00Z`);
  const latestEntries = (data.entries as DemoHistoricalEntry[]).filter(entry => entry.date === latest);
  const markers: Record<string, unknown> = Object.assign({}, ...latestEntries.map(entry => entry.markers));
  // Remove an obsolete alias that disagrees with the canonical saturation.
  delete markers['iron.transferrinSaturation'];
  markers['hormones.cortisol'] = sex === 'female' ? 390 : 460;
  const earlier = sex === 'female' ? {
    'iron.ferritin': 16, 'iron.transferrinSat': 18, 'hematology.hemoglobin': 122,
    'thyroid.tsh': 5.2, 'thyroid.ft4': 11.2, 'vitamins.vitaminD': 47,
    'coagulation.homocysteine': 9.5, 'proteins.hsCRP': 2.2,
    'diabetes.insulin': 10, 'biochemistry.glucose': 5.4,
    'fattyAcids.omega3Index': 5.6, 'hormones.cortisol': 480,
  } : {
    'lipids.apoB': 1.3, 'lipids.ldl': 4.1, 'lipids.triglycerides': 1.9,
    'lipids.hdl': 1.05, 'lipids.cholesterol': 6.0,
    'diabetes.insulin': 14, 'biochemistry.glucose': 5.4,
    'proteins.hsCRP': 4.2, 'biochemistry.alt': 0.95,
    'coagulation.homocysteine': 12.5, 'vitamins.vitaminD': 61,
    'fattyAcids.omega3Index': 5.8, 'hormones.cortisol': 550,
  };
  const panels: DemoBiologyPanel[] = DRAW_OFFSETS.map((offset, index) => {
    const progress = index / (DRAW_OFFSETS.length - 1);
    const values = { ...markers };
    for (const [path, first] of Object.entries(earlier)) values[path] = round(first + ((markers[path] as number) - first) * progress);
    values['diabetes.homaIR'] = round((values['biochemistry.glucose'] as number) * (values['diabetes.insulin'] as number) / 22.5);
    values['lipids.nonHdl'] = round((values['lipids.cholesterol'] as number) - (values['lipids.hdl'] as number));
    values['lipids.cholHdlRatio'] = round((values['lipids.cholesterol'] as number) / (values['lipids.hdl'] as number));
    const date = dateAt(latestMs - offset * DAY);
    const file = 'Synthetic demo panel — blood, urine and stool examples';
    return {
      date, file: null, markers: values,
      context: { fasting: true, sampleTime: '08:05', ...(sex === 'female' ? {
        cycleDay: 10, cyclePhase: 'follicular', cyclePhaseDetail: 'late_follicular', cyclePhaseSource: 'recorded',
      } : {}) },
      markerSources: Object.fromEntries(Object.keys(values).map(path => [path, { file, at: Date.parse(`${date}T08:05:00Z`) }])),
    };
  });
  const panelDates = new Set(panels.map(entry => entry.date));
  data.entries = [...(data.entries as DemoHistoricalEntry[]).filter(entry => !panelDates.has(entry.date as string)), ...panels].sort((a, b) => (a.date as { localeCompare(other: unknown): number }).localeCompare(b.date));
  data.diagnoses ||= {};
  (data.diagnoses as { flags?: unknown }).flags = { ...((data.diagnoses as { flags?: unknown }).flags as object), intenseTrainingRecent: false, acuteIllnessNearDraw: false };
  // Draws are 58 days apart: Sarah's recorded 29-day cycle stays on day 10.
  data.demoBiology = { version: 1, synthetic: true, loadedAt: now.getTime(), panelDates: [...panelDates], months: 14 };
  delete data.biologyScoreAI;
  delete data.biologyScoreContextAI;
  return data as PreparedDemoBiologyData;
}
