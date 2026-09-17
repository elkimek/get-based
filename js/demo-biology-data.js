// Synthetic, rolling lab history, used only when creating a new demo profile.
// Existing profiles (including edited demos) are never rewritten on reload.
const DAY = 86400000;
const DRAW_OFFSETS = [406, 348, 290, 232, 174, 116, 58, 0];
const dateAt = ms => new Date(ms).toISOString().slice(0, 10);
const round = value => Number(value.toFixed(3));

// Keep the demo's cycle calendar, source timestamps, therapies and date-keyed
// notes aligned with its labs. Do not shift durations, ages or measurements.
function shiftTimeline(value, delta, key = '') {
  if (typeof value === 'string') return value.replace(/\d{4}-\d{2}-\d{2}/g, date => {
    const timestamp = Date.parse(`${date}T00:00:00Z`);
    return Number.isFinite(timestamp) ? dateAt(timestamp + delta) : date;
  });
  if (typeof value === 'number' && /(?:At|^at)$/.test(key) && value >= 946684800000) return value + delta;
  if (Array.isArray(value)) return value.map(item => shiftTimeline(item, delta, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .map(([name, item]) => [shiftTimeline(name, delta), shiftTimeline(item, delta, name)]));
  return value;
}

export function prepareDemoBiologyData(source, sex, { now = new Date() } = {}) {
  if (source?._source !== 'demo') throw new Error('Only bundled demo data can be prepared.');
  const reference = Date.parse(String(source.exportedAt).slice(0, 10) + 'T00:00:00Z');
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  if (!Number.isFinite(reference) || !Number.isFinite(today)) throw new Error('Invalid demo timeline.');
  const data = shiftTimeline(source, today - DAY - reference);
  const latest = data.entries.map(entry => entry.date).sort().at(-1);
  const latestMs = Date.parse(`${latest}T00:00:00Z`);
  const latestEntries = data.entries.filter(entry => entry.date === latest);
  const markers = Object.assign({}, ...latestEntries.map(entry => entry.markers));
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
  const panels = DRAW_OFFSETS.map((offset, index) => {
    const progress = index / (DRAW_OFFSETS.length - 1);
    const values = { ...markers };
    for (const [path, first] of Object.entries(earlier)) values[path] = round(first + (markers[path] - first) * progress);
    values['diabetes.homaIR'] = round(values['biochemistry.glucose'] * values['diabetes.insulin'] / 22.5);
    values['lipids.nonHdl'] = round(values['lipids.cholesterol'] - values['lipids.hdl']);
    values['lipids.cholHdlRatio'] = round(values['lipids.cholesterol'] / values['lipids.hdl']);
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
  data.entries = [...data.entries.filter(entry => !panelDates.has(entry.date)), ...panels].sort((a, b) => a.date.localeCompare(b.date));
  data.diagnoses ||= {};
  data.diagnoses.flags = { ...data.diagnoses.flags, intenseTrainingRecent: false, acuteIllnessNearDraw: false };
  // Draws are 58 days apart: Sarah's recorded 29-day cycle stays on day 10.
  data.demoBiology = { version: 1, synthetic: true, loadedAt: now.getTime(), panelDates: [...panelDates], months: 14 };
  delete data.biologyScoreAI;
  delete data.biologyScoreContextAI;
  return data;
}
