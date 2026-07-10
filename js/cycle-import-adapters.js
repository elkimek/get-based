// @ts-check
// cycle-import-adapters.js - source-specific cycle export parsers.

import { normalizeCycleFlow, stitchCyclePeriodsFromObservations } from './cycle-summary.js';

const TRUE_VALUES = new Set(['true', '1', 'yes', 'y', 'positive', 'present', 'period']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'n', 'negative', 'none', '']);

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeToken(value) {
  return normalizeKey(value).replace(/\s+/g, '_');
}

function booleanValue(value) {
  if (value === true || value === false) return value;
  const token = normalizeToken(value);
  if (TRUE_VALUES.has(token)) return true;
  if (FALSE_VALUES.has(token)) return false;
  return null;
}

function isoDate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const parsed = new Date(ms);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
  }
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dayFirst = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dayFirst) {
    const first = Number(dayFirst[1]);
    const second = Number(dayFirst[2]);
    const day = first > 12 ? first : second > 12 ? second : first;
    const month = first > 12 ? second : second > 12 ? first : second;
    return `${dayFirst[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

function parseTemperature(value) {
  const raw = typeof value === 'object' && value ? value.value ?? value.temperature : value;
  const n = Number(String(raw ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/)?.[0]);
  if (!Number.isFinite(n)) return null;
  if (n > 80 && n < 110) return Math.round(((n - 32) * 5 / 9) * 100) / 100;
  if (n > 30 && n < 45) return Math.round(n * 100) / 100;
  return null;
}

function flowValue(value, fallbackForTrue = 'moderate') {
  if (value === true) return fallbackForTrue;
  if (value === false || value == null) return null;
  const raw = normalizeToken(typeof value === 'object' ? value.value ?? value.flow : value);
  if (!raw || FALSE_VALUES.has(raw)) return null;
  if (TRUE_VALUES.has(raw)) return fallbackForTrue;
  if (raw.includes('spot')) return 'spotting';
  if (raw.includes('super_heavy')) return 'heavy';
  return normalizeCycleFlow(raw) || (raw.includes('bleed') || raw.includes('menstru') ? fallbackForTrue : null);
}

function resultImportId(source, fileName) {
  const base = String(fileName || source || 'cycle-import')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || source;
  return `${source}-${Date.now()}-${base}`;
}

function addUnique(values, next) {
  for (const value of Array.isArray(next) ? next : [next]) {
    const label = String(value || '').trim();
    if (label && !values.includes(label)) values.push(label);
  }
}

function mergeObservation(map, source, patch) {
  if (!patch?.date) return;
  const existing = map.get(patch.date) || { source, date: patch.date };
  const next = { ...existing, ...patch, source, date: patch.date };
  if (existing.bleeding || patch.bleeding) next.bleeding = { ...(existing.bleeding || {}), ...(patch.bleeding || {}) };
  if (existing.cervicalMucus || patch.cervicalMucus) next.cervicalMucus = { ...(existing.cervicalMucus || {}), ...(patch.cervicalMucus || {}) };
  const symptoms = [];
  addUnique(symptoms, existing.symptoms || []);
  addUnique(symptoms, patch.symptoms || []);
  if (symptoms.length) next.symptoms = symptoms;
  if (existing.note && patch.note && existing.note !== patch.note) next.note = `${existing.note}; ${patch.note}`;
  map.set(patch.date, next);
}

export function mergeCycleImportObservations(source, groups) {
  const byDate = new Map();
  for (const rows of groups || []) {
    for (const row of rows || []) mergeObservation(byDate, source, row);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

const SCHEMA_REVIEW_WARNINGS = {
  clue: 'Clue export formats can change. This adapter is validated with synthetic fixtures; review the detected periods before importing.',
  natural_cycles: 'Natural Cycles export formats can change. This adapter is validated with synthetic fixtures; review the detected periods before importing.',
};

function finalizeImport(source, sourceLabel, fileName, observations, emptyPeriodWarning) {
  const merged = mergeCycleImportObservations(source, [observations]);
  if (!merged.length) return null;
  const importId = resultImportId(source, fileName);
  const periods = stitchCyclePeriodsFromObservations(merged, {
    source,
    importId,
    updatedAt: new Date().toISOString(),
  });
  return {
    source,
    sourceLabel,
    sourceFile: fileName,
    importId,
    observations: merged.map(row => ({ ...row, importId })),
    periods,
    warnings: [
      ...(!periods.length ? [emptyPeriodWarning] : []),
      ...(SCHEMA_REVIEW_WARNINGS[source] ? [SCHEMA_REVIEW_WARNINGS[source]] : []),
    ],
    detectedRange: {
      firstDate: merged[0]?.date || null,
      lastDate: merged[merged.length - 1]?.date || null,
    },
  };
}

function delimiterFor(text) {
  const firstLine = String(text || '').split(/\r?\n/, 1)[0] || '';
  const counts = [',', ';', '\t'].map(delimiter => ({ delimiter, count: firstLine.split(delimiter).length }));
  return counts.sort((a, b) => b.count - a.count)[0]?.delimiter || ',';
}

export function parseDelimitedRows(text) {
  const delimiter = delimiterFor(text);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < String(text || '').length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  row.push(cell);
  if (row.some(value => String(value).trim())) rows.push(row);
  return rows;
}

function findHeader(headers, patterns) {
  return headers.findIndex(header => patterns.some(pattern => pattern.test(header)));
}

function humanLabel(value) {
  const text = String(value || '').replace(/[_-]+/g, ' ').trim();
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}

function headerIndex(headers, name) {
  return headers.indexOf(normalizeKey(name));
}

const DRIP_SYMPTOM_LABELS = {
  'pain cramps': 'Cramps',
  'pain ovulationpain': 'Ovulation pain',
  'pain headache': 'Headache',
  'pain backache': 'Backache',
  'pain nausea': 'Nausea',
  'pain tenderbreasts': 'Tender breasts',
  'pain migraine': 'Migraine',
  'pain other': 'Other pain',
  'mood happy': 'Happy',
  'mood sad': 'Sad',
  'mood stressed': 'Stressed',
  'mood balanced': 'Balanced',
  'mood fine': 'Fine',
  'mood anxious': 'Anxious',
  'mood energetic': 'Energetic',
  'mood fatigue': 'Fatigue',
  'mood angry': 'Angry',
  'mood other': 'Other mood',
};

function parseDripFlow(value, nativeDripScale = false) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'false' || raw === 'no') return null;
  if (nativeDripScale && /^[0-3]$/.test(raw)) return ['spotting', 'light', 'moderate', 'heavy'][Number(raw)];
  if (raw === '0') return null;
  if (/^[1-4]$/.test(raw)) return ['spotting', 'light', 'moderate', 'heavy'][Number(raw) - 1];
  return flowValue(raw);
}

export function parseDripCycleCsv(text, fileName = 'drip.csv') {
  const csv = parseDelimitedRows(text);
  if (csv.length < 2) return null;
  const headers = csv[0].map(normalizeKey);
  const dateIdx = findHeader(headers, [/^date$/, /^day$/, /^datum$/]);
  const nativeDripSchema = headerIndex(headers, 'bleeding.value') >= 0;
  const flowIdx = nativeDripSchema
    ? headerIndex(headers, 'bleeding.value')
    : findHeader(headers, [/^bleeding$/, /^menstrual flow$/, /^period$/, /^flow$/]);
  const bleedingExcludeIdx = headerIndex(headers, 'bleeding.exclude');
  const symptomsIdx = findHeader(headers, [/^symptoms?$/]);
  const tempIdx = headerIndex(headers, 'temperature.value') >= 0
    ? headerIndex(headers, 'temperature.value')
    : findHeader(headers, [/^temperature$/, /^bbt$/, /^basal temperature$/]);
  const tempExcludeIdx = headerIndex(headers, 'temperature.exclude');
  const mucusValueIdx = headerIndex(headers, 'mucus.value');
  const mucusTextureIdx = headerIndex(headers, 'mucus.texture');
  const mucusFeelingIdx = headerIndex(headers, 'mucus.feeling');
  const mucusExcludeIdx = headerIndex(headers, 'mucus.exclude');
  const mucusIdx = mucusValueIdx >= 0 ? mucusValueIdx : findHeader(headers, [/^mucus$/, /^cervical mucus$/]);
  const ovulationIdx = findHeader(headers, [/ovulation/, /\blh\b/]);
  const noteIdx = headerIndex(headers, 'note.value') >= 0
    ? headerIndex(headers, 'note.value')
    : findHeader(headers, [/^note$/, /^comment$/]);
  if (dateIdx === -1 || flowIdx === -1) return null;

  const observations = [];
  for (const cols of csv.slice(1)) {
    const date = isoDate(cols[dateIdx]);
    if (!date) continue;
    const flow = parseDripFlow(cols[flowIdx], nativeDripSchema);
    const bleedingExcluded = bleedingExcludeIdx >= 0 && booleanValue(cols[bleedingExcludeIdx]) === true;
    const temperature = tempIdx >= 0 ? parseTemperature(cols[tempIdx]) : null;
    const temperatureExcluded = tempExcludeIdx >= 0 && booleanValue(cols[tempExcludeIdx]) === true;
    const symptoms = symptomsIdx >= 0
      ? String(cols[symptomsIdx] || '').split(/[;,|]/).map(value => value.trim()).filter(Boolean)
      : [];
    headers.forEach((header, idx) => {
      if (DRIP_SYMPTOM_LABELS[header] && booleanValue(cols[idx]) === true) addUnique(symptoms, DRIP_SYMPTOM_LABELS[header]);
    });
    const mucusParts = [mucusIdx, mucusTextureIdx, mucusFeelingIdx]
      .filter((idx, pos, indexes) => idx >= 0 && indexes.indexOf(idx) === pos)
      .map(idx => String(cols[idx] || '').trim())
      .filter(Boolean);
    const mucusQuality = mucusParts.join(' / ');
    const mucusExcluded = mucusExcludeIdx >= 0 && booleanValue(cols[mucusExcludeIdx]) === true;
    const row = {
      source: 'drip',
      date,
      ...(flow ? { bleeding: { flow, excluded: bleedingExcluded } } : {}),
      ...(symptoms.length ? { symptoms } : {}),
      ...(temperature != null ? { bbtC: temperature, ...(temperatureExcluded ? { bbtExcluded: true } : {}) } : {}),
      ...(mucusQuality ? { cervicalMucus: { quality: mucusQuality, ...(mucusExcluded ? { excluded: true } : {}) } } : {}),
      ...(ovulationIdx >= 0 && cols[ovulationIdx] ? { ovulationTest: String(cols[ovulationIdx]).trim().toLowerCase() } : {}),
      ...(noteIdx >= 0 && cols[noteIdx] ? { note: String(cols[noteIdx]).trim() } : {}),
    };
    if (row.bleeding || row.symptoms?.length || row.bbtC != null || row.cervicalMucus || row.ovulationTest || row.note) observations.push(row);
  }

  return finalizeImport(
    'drip',
    'Drip',
    fileName,
    observations,
    'No period episodes could be derived from bleeding rows.',
  );
}

const NATURAL_CYCLES_FILE_RE = /natural.?cycles|tracking.?data|daily.?entr|cycle.?data/i;
const NATURAL_CYCLES_SPECIFIC_HEADERS = [/fertility status/, /red day/, /green day/, /cycle day/, /measurement device/, /lh test/];

export function looksLikeNaturalCyclesCsv(text, fileName = '') {
  const rows = parseDelimitedRows(text);
  if (rows.length < 2) return false;
  const headers = rows[0].map(normalizeKey);
  const hasDate = findHeader(headers, [/^date$/, /^day$/, /^calendar date$/, /^measurement date$/]) >= 0;
  const hasTemperature = findHeader(headers, [/^temperature(?: c| f)?$/, /^bbt$/, /^basal body temperature$/]) >= 0;
  const hasPeriod = findHeader(headers, [/^period$/, /^period flow$/, /^menstruation$/, /^bleeding$/, /^spotting$/]) >= 0;
  const sourceHint = NATURAL_CYCLES_FILE_RE.test(fileName) || NATURAL_CYCLES_SPECIFIC_HEADERS.some(pattern => headers.some(header => pattern.test(header)));
  return sourceHint && hasDate && (hasTemperature || hasPeriod);
}

const NATURAL_SYMPTOM_COLUMNS = {
  cramps: 'Cramps',
  headache: 'Headache',
  migraine: 'Migraine',
  nausea: 'Nausea',
  fatigue: 'Fatigue',
  pms: 'PMS',
  'tender breasts': 'Tender breasts',
  backache: 'Backache',
  'back pain': 'Backache',
};

export function parseNaturalCyclesCsv(text, fileName = 'tracking_data.csv') {
  if (!looksLikeNaturalCyclesCsv(text, fileName)) return null;
  const rows = parseDelimitedRows(text);
  const headers = rows[0].map(normalizeKey);
  const dateIdx = findHeader(headers, [/^date$/, /^day$/, /^calendar date$/, /^measurement date$/]);
  const temperatureIdx = findHeader(headers, [/^temperature(?: c| f)?$/, /^bbt$/, /^basal body temperature$/, /^temperature value$/]);
  const temperatureExcludedIdx = findHeader(headers, [/^temperature excluded$/, /^exclude temperature$/, /^excluded temperature$/, /^disturbed temperature$/]);
  const periodIdx = findHeader(headers, [/^period$/, /^menstruation$/, /^is period$/, /^bleeding$/]);
  const flowIdx = findHeader(headers, [/^period flow$/, /^flow$/, /^bleeding flow$/]);
  const spottingIdx = findHeader(headers, [/^spotting$/, /^is spotting$/]);
  const mucusIdx = findHeader(headers, [/^cervical mucus$/, /^cervical mucus quality$/, /^mucus$/, /^discharge$/]);
  const ovulationIdx = findHeader(headers, [/^lh test$/, /^lh result$/, /^ovulation test$/, /^ovulation test result$/]);
  const symptomsIdx = findHeader(headers, [/^symptoms?$/, /^trackers?$/]);
  const noteIdx = findHeader(headers, [/^notes?$/, /^comment$/]);
  const observations = [];

  for (const cols of rows.slice(1)) {
    const date = isoDate(cols[dateIdx]);
    if (!date) continue;
    const periodFlow = periodIdx >= 0 ? flowValue(cols[periodIdx]) : null;
    const separateFlow = flowIdx >= 0 ? flowValue(cols[flowIdx]) : null;
    const periodFlag = periodIdx >= 0 ? booleanValue(cols[periodIdx]) : null;
    const spotting = spottingIdx >= 0 && booleanValue(cols[spottingIdx]) === true;
    const menstrualFlow = separateFlow || periodFlow || (periodFlag === true ? 'moderate' : null);
    const spottingOnly = !menstrualFlow && spotting;
    const flow = menstrualFlow || (spottingOnly ? 'spotting' : null);
    const temperature = temperatureIdx >= 0 ? parseTemperature(cols[temperatureIdx]) : null;
    const temperatureExcluded = temperatureExcludedIdx >= 0 && booleanValue(cols[temperatureExcludedIdx]) === true;
    const symptoms = symptomsIdx >= 0
      ? String(cols[symptomsIdx] || '').split(/[;,|]/).map(humanLabel).filter(Boolean)
      : [];
    headers.forEach((header, idx) => {
      const label = NATURAL_SYMPTOM_COLUMNS[header];
      if (label && booleanValue(cols[idx]) === true) addUnique(symptoms, label);
    });
    const mucus = mucusIdx >= 0 ? String(cols[mucusIdx] || '').trim() : '';
    const ovulation = ovulationIdx >= 0 ? normalizeToken(cols[ovulationIdx]) : '';
    const note = noteIdx >= 0 ? String(cols[noteIdx] || '').trim() : '';
    const observation = {
      source: 'natural_cycles',
      date,
      ...(flow ? { bleeding: { flow, excluded: spottingOnly, ...(spottingOnly ? { intermenstrual: true } : {}) } } : {}),
      ...(temperature != null ? { bbtC: temperature, ...(temperatureExcluded ? { bbtExcluded: true } : {}) } : {}),
      ...(symptoms.length ? { symptoms } : {}),
      ...(mucus ? { cervicalMucus: { quality: mucus } } : {}),
      ...(ovulation ? { ovulationTest: ovulation.includes('positive') || ovulation === 'peak' ? 'positive' : ovulation.includes('negative') ? 'negative' : ovulation } : {}),
      ...(note ? { note } : {}),
    };
    if (observation.bleeding || observation.bbtC != null || observation.symptoms || observation.cervicalMucus || observation.ovulationTest || observation.note) {
      observations.push(observation);
    }
  }

  return finalizeImport(
    'natural_cycles',
    'Natural Cycles',
    fileName,
    observations,
    'Natural Cycles had daily observations, but no menstrual-flow episodes were derived.',
  );
}

export function parseNaturalCyclesCsvBundle(files, archiveName = 'natural-cycles-export.zip') {
  const parsed = [];
  for (const file of files || []) {
    const result = parseNaturalCyclesCsv(file.text, file.name);
    if (result) parsed.push(result);
  }
  if (!parsed.length) return null;
  return finalizeImport(
    'natural_cycles',
    'Natural Cycles',
    archiveName,
    mergeCycleImportObservations('natural_cycles', parsed.map(result => result.observations)),
    'Natural Cycles had daily observations, but no menstrual-flow episodes were derived.',
  );
}

const CLUE_DAILY_KEYS = new Set([
  'period', 'pain', 'mood', 'energy', 'sleep', 'cravings', 'digestion', 'skin',
  'hair', 'exercise', 'social', 'motivation', 'sex', 'temperature', 'bbt',
  'cervical_fluid', 'cervical_mucus', 'mucus', 'ovulation_test', 'lh_test', 'note',
]);

function clueDailyRows(root) {
  const candidates = [root?.data, root?.trackingData, root?.tracking_data, root?.days, root?.records];
  return candidates.find(value => Array.isArray(value)) || (Array.isArray(root) ? root : []);
}

export function looksLikeClueCycleJson(value) {
  let root = value;
  if (typeof root === 'string') {
    try { root = JSON.parse(root); } catch { return false; }
  }
  if (!root || typeof root !== 'object') return false;
  const brand = normalizeToken(root.source || root.app || root.application || root.provider || root.exportedBy);
  if (brand.includes('clue')) return true;
  const rows = clueDailyRows(root);
  return rows.some(row => {
    if (!row || typeof row !== 'object' || !isoDate(row.day ?? row.date ?? row.timestamp)) return false;
    return Object.keys(row).some(key => CLUE_DAILY_KEYS.has(normalizeToken(key)));
  });
}

const CLUE_SYMPTOM_LABELS = {
  cramps: 'Cramps',
  ovulation_pain: 'Ovulation pain',
  headache: 'Headache',
  backache: 'Backache',
  back_pain: 'Backache',
  nausea: 'Nausea',
  tender_breasts: 'Tender breasts',
  migraine: 'Migraine',
  exhausted: 'Fatigue',
  low_energy: 'Fatigue',
  fatigue: 'Fatigue',
  pms: 'PMS',
  anxious: 'Anxious',
  stressed: 'Stressed',
  sad: 'Sad',
  sensitive: 'Sensitive',
  happy: 'Happy',
  energized: 'Energetic',
  high_energy: 'Energetic',
};

function clueValues(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    if (Array.isArray(value.values)) return value.values;
    if (value.value != null) return [value.value];
    return Object.entries(value).filter(([, active]) => booleanValue(active) === true).map(([key]) => key);
  }
  return value == null || value === '' ? [] : [value];
}

function clueSymptoms(day) {
  const symptoms = [];
  for (const key of ['pain', 'mood', 'energy', 'cravings']) {
    for (const value of clueValues(day[key])) {
      const token = normalizeToken(value);
      addUnique(symptoms, CLUE_SYMPTOM_LABELS[token] || humanLabel(value));
    }
  }
  for (const value of clueValues(day.symptoms)) addUnique(symptoms, CLUE_SYMPTOM_LABELS[normalizeToken(value)] || humanLabel(value));
  return symptoms;
}

function clueDailyObservation(day) {
  const date = isoDate(day?.day ?? day?.date ?? day?.timestamp ?? day?.created_at ?? day?.startDate);
  if (!date) return null;
  const flow = flowValue(day.period ?? day.bleeding ?? day.menstrual_flow ?? day.flow);
  const spottingOnly = flow === 'spotting' || (!flow && booleanValue(day.spotting) === true);
  const temperature = parseTemperature(day.temperature ?? day.bbt ?? day.basal_body_temperature);
  const symptoms = clueSymptoms(day);
  const mucusRaw = day.cervical_fluid ?? day.cervical_mucus ?? day.mucus ?? day.discharge;
  const mucus = clueValues(mucusRaw).map(value => String(value)).join(' / ');
  const ovulationRaw = day.ovulation_test ?? day.lh_test ?? day.ovulationTest;
  const ovulation = clueValues(ovulationRaw).map(normalizeToken).find(Boolean) || '';
  const note = String(day.note?.value ?? day.note ?? day.notes ?? '').trim();
  const observation = {
    source: 'clue',
    date,
    ...((flow || spottingOnly) ? { bleeding: { flow: spottingOnly ? 'spotting' : flow, excluded: spottingOnly, ...(spottingOnly ? { intermenstrual: true } : {}) } } : {}),
    ...(temperature != null ? { bbtC: temperature } : {}),
    ...(symptoms.length ? { symptoms } : {}),
    ...(mucus ? { cervicalMucus: { quality: mucus } } : {}),
    ...(ovulation ? { ovulationTest: ovulation.includes('positive') ? 'positive' : ovulation.includes('negative') ? 'negative' : ovulation } : {}),
    ...(note ? { note } : {}),
  };
  return observation.bleeding || observation.bbtC != null || observation.symptoms || observation.cervicalMucus || observation.ovulationTest || observation.note
    ? observation
    : null;
}

export function parseClueCycleJson(value, fileName = 'clue-data.json') {
  let root = value;
  if (typeof root === 'string') {
    try { root = JSON.parse(root); } catch { return null; }
  }
  if (!looksLikeClueCycleJson(root)) return null;
  const observations = clueDailyRows(root).map(clueDailyObservation).filter(Boolean);
  return finalizeImport(
    'clue',
    'Clue',
    fileName,
    observations,
    'Clue had tracked cycle observations, but no menstrual-flow episodes were derived.',
  );
}
