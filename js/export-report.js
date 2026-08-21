// @ts-check
// export-report.js — PDF report data preparation and HTML export

import { state } from './state.js';
import { getStatus, formatValue, showNotification, escapeHTML } from './utils.js';
import { getActiveData } from './data.js';
import { getAllFlaggedMarkers, getEffectiveRange } from './marker-analysis.js';
import { getProfiles, getProfileHeight } from './profile.js';
import { getBloodDrawPhases } from './cycle.js';
import { callClaudeAPI, getActiveModelDisplay, getActiveModelId, getAIProvider, hasAIProvider, isAIPaused } from './api.js';
import { trackUsage } from './schema.js';
import {
  wearableDisplayUnit,
  wearableDisplayValue,
  weightToKilograms,
} from './wearables-formatters.js';

// ═══════════════════════════════════════════════
// PDF REPORT EXPORT
// ═══════════════════════════════════════════════
export const REPORT_BUILDER_OVERLAY_ID = 'report-builder-overlay';
export const DEFAULT_REPORT_PRESET = 'clinician';
const REPORT_AI_SUMMARY_MAX_CHARS = 2800;
const REPORT_AI_CONTEXT_MARKER_LIMIT = 32;
const REPORT_AI_CONTEXT_FLAG_LIMIT = 16;
const REPORT_AI_CONTEXT_TREND_LIMIT = 12;
const REPORT_AI_CONTEXT_CONTEXT_LIMIT = 10;

const REPORT_AI_SUMMARY_PROMPT = `You write practitioner-facing patient overviews from structured user-owned health data.

Goal: give a clinician or health practitioner the patient's picture in under 1 minute without making them read the full report.

Return exactly these sections, using these headings:
Patient picture:
Key signals:
Context affecting interpretation:
Discussion focus:

Rules:
- Write 180-240 words total.
- Patient picture must be a 2-3 sentence synthesis, not a list.
- Key signals must use 3-5 bullets grouped by clinical theme when possible.
- Context affecting interpretation must use 2-4 bullets covering relevant history, supplements/meds, goals, notes, genetics, or data gaps.
- Discussion focus must use 2-3 bullets framed as verification or follow-up topics, not treatment instructions.
- Use only the provided report facts.
- Mention actual marker names and values only when they help the overview.
- Prioritize patterns, severity, direction of travel, and missing context over exhaustively listing markers.
- Do not diagnose, prescribe, or claim causality.
- Avoid boilerplate disclaimers, generic wellness advice, and repeating every marker.`;

export const REPORT_SECTION_DEFS = [
  { id: 'flagged', label: 'Flagged results' },
  { id: 'categories', label: 'Lab tables' },
  { id: 'summary', label: 'Healthcare summary' },
  { id: 'trends', label: 'Notable trends' },
  { id: 'supplements', label: 'Supplements and meds' },
  { id: 'notes', label: 'Notes' },
  { id: 'genetics', label: 'Genetics' },
  { id: 'context', label: 'Profile context' },
];
const REPORT_SECTION_IDS = REPORT_SECTION_DEFS.map(section => section.id);
export const REPORT_LAB_SECTION_IDS = ['flagged', 'categories', 'summary', 'trends'];

export const REPORT_PRESETS = {
  clinician: {
    label: 'Clinician summary',
    subtitle: 'Priority labs, flags, trends',
    sections: ['flagged', 'categories', 'summary', 'trends', 'supplements', 'context'],
    categoryMode: 'priority',
    dateRange: 'current',
  },
  full: {
    label: 'Full lab report',
    subtitle: 'All dates, all sections',
    sections: REPORT_SECTION_IDS,
    categoryMode: 'all',
    dateRange: 'all',
  },
  personal: {
    label: 'Personal snapshot',
    subtitle: 'Labs, notes, context',
    sections: ['flagged', 'categories', 'trends', 'supplements', 'notes', 'genetics', 'context'],
    categoryMode: 'all',
    dateRange: 'current',
  },
};

export const REPORT_DATE_RANGE_OPTIONS = [
  { value: 'current', label: 'Current dashboard range' },
  { value: '3m', label: 'Last 3 months' },
  { value: '6m', label: 'Last 6 months' },
  { value: '1y', label: 'Last year' },
  { value: 'all', label: 'All dates' },
];


export function getReportPreset(presetId) {
  return REPORT_PRESETS[presetId] || REPORT_PRESETS[DEFAULT_REPORT_PRESET];
}

export function normalizeReportOptions(options = {}) {
  const hasExplicitOptions = options && Object.keys(options).length > 0;
  const fallbackPreset = hasExplicitOptions ? DEFAULT_REPORT_PRESET : 'full';
  const presetId = REPORT_PRESETS[options.preset] ? options.preset : fallbackPreset;
  const preset = getReportPreset(presetId);
  const sectionInput = Array.isArray(options.sections)
    ? options.sections
    : preset.sections;
  const sectionSet = new Set(sectionInput);
  const dateRange = REPORT_DATE_RANGE_OPTIONS.some(option => option.value === options.dateRange)
    ? options.dateRange
    : (hasExplicitOptions ? preset.dateRange : 'current');
  return {
    preset: presetId,
    presetLabel: options.presetLabel || preset.label,
    dateRange,
    sections: REPORT_SECTION_IDS.filter(id => sectionSet.has(id)),
    categoryKeys: Array.isArray(options.categoryKeys) ? options.categoryKeys.filter(Boolean) : null,
    aiSummary: normalizeReportAISummary(options.aiSummary),
  };
}

export function reportIncludes(options, sectionId) {
  return options.sections.includes(sectionId);
}

function cleanReportAISummaryText(text) {
  let cleaned = String(text || '').replace(/\r\n?/g, '\n').trim();
  cleaned = cleaned.replace(/^```(?:markdown|text)?\s*/i, '').replace(/```$/i, '').trim();
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned.slice(0, REPORT_AI_SUMMARY_MAX_CHARS).trim();
}

function normalizeReportAISummary(summary) {
  if (!summary) return null;
  const input = typeof summary === 'string' ? { text: summary } : summary;
  if (!input || typeof input !== 'object') return null;
  const text = cleanReportAISummaryText(input.text || input.content || '');
  if (!text) return null;
  return {
    text,
    generatedAt: input.generatedAt || input.createdAt || '',
    model: input.model || input.modelDisplay || '',
    provider: input.provider || '',
    modelId: input.modelId || '',
  };
}

function formatReportDateLabel(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getLatestReportValueIndex(values = []) {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] !== null && values[i] !== undefined) return i;
  }
  return -1;
}

function formatReportRange(min, max) {
  if (min != null && max != null) return `${formatValue(min)}-${formatValue(max)}`;
  if (min != null) return `>${formatValue(min)}`;
  if (max != null) return `<${formatValue(max)}`;
  return 'not specified';
}

function getReportAgeLabel(dob) {
  if (!dob) return '';
  const birth = new Date(dob + 'T00:00:00');
  if (Number.isNaN(birth.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 && age <= 130 ? `${age} years` : '';
}

export function getReportHeaderProfile(profileName) {
  const profile = getProfiles().find(p => p.id === state.currentProfile) || null;
  return {
    ...(profile || {}),
    name: profile?.name || profileName,
    sex: profile?.sex || state.profileSex || null,
    dob: profile?.dob || state.profileDob || null,
  };
}

function formatReportLocationLabel(location) {
  if (!location) return '';
  if (typeof location === 'string') return location.trim();
  if (typeof location !== 'object') return '';
  if (location.label) return String(location.label).trim();
  const parts = [];
  const city = location.city || location.locality;
  const region = location.region || location.state || location.province;
  const country = location.country;
  const zip = location.zip || location.postalCode || location.postcode;
  for (const part of [city, region, country, zip]) {
    const text = String(part || '').trim();
    if (text && !parts.includes(text)) parts.push(text);
  }
  if (parts.length > 0) return parts.join(', ');
  if (Number.isFinite(location.lat) && Number.isFinite(location.lon)) {
    return `${location.lat.toFixed(2)}, ${location.lon.toFixed(2)}`;
  }
  return '';
}

function getReportHeightInfo(profile) {
  const stored = getProfileHeight(state.currentProfile);
  const height = stored?.height ?? profile?.height ?? null;
  if (height == null || height === '') return null;
  const numericHeight = Number(height);
  if (!Number.isFinite(numericHeight) || numericHeight <= 0) return null;
  return {
    height: numericHeight,
    unit: stored?.unit || profile?.heightUnit || 'cm',
  };
}

function getReportHeightMeters(heightInfo) {
  if (!heightInfo?.height) return null;
  const unit = String(heightInfo.unit || 'cm').toLowerCase();
  if (unit === 'in' || unit === 'inch' || unit === 'inches') return heightInfo.height * 0.0254;
  if (unit === 'm' || unit === 'meter' || unit === 'meters') return heightInfo.height;
  return heightInfo.height / 100;
}

function formatReportHeightLabel(heightInfo) {
  if (!heightInfo?.height) return '';
  const unit = String(heightInfo.unit || 'cm').toLowerCase();
  if (unit === 'in' || unit === 'inch' || unit === 'inches') {
    const totalInches = Math.round(heightInfo.height);
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return `${feet} ft ${inches} in`;
  }
  if (unit === 'm' || unit === 'meter' || unit === 'meters') return `${formatValue(heightInfo.height)} m`;
  return `${formatValue(heightInfo.height)} cm`;
}

function getLatestReportCandidate(candidates) {
  return candidates
    .filter(item => item && item.value != null)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0] || null;
}

function getLatestReportWeight() {
  const candidates = [];
  const biometrics = state.importedData.biometrics;
  if (Array.isArray(biometrics?.weight)) {
    for (const entry of biometrics.weight) {
      if (Number.isFinite(Number(entry.value))) {
        candidates.push({
          valueKg: weightToKilograms(Number(entry.value), entry.unit || 'kg'),
          date: entry.date || '',
          source: entry.source || 'manual',
        });
      }
    }
  }
  const wearableWeight = state.importedData?.wearableSummary?.metrics?.weight;
  if (Number.isFinite(wearableWeight?.latest)) {
    candidates.push({
      valueKg: wearableWeight.latest,
      date: wearableWeight.latestDate || '',
      source: wearableWeight.primarySource || 'wearable',
    });
  }
  const latest = getLatestReportCandidate(candidates.map(candidate => ({
    ...candidate,
    value: candidate.valueKg,
  })));
  if (!latest) return null;
  return {
    ...latest,
    value: wearableDisplayValue('weight', latest.valueKg, state.unitSystem),
    unit: wearableDisplayUnit('weight', 'kg', state.unitSystem),
  };
}

function getWeightKg(weight) {
  if (!weight) return null;
  if (Number.isFinite(weight.valueKg)) return weight.valueKg;
  return weightToKilograms(weight.value, weight.unit || 'kg');
}

function getLatestReportBloodPressure() {
  const candidates = [];
  const biometrics = state.importedData.biometrics;
  if (Array.isArray(biometrics?.bp)) {
    for (const entry of biometrics.bp) {
      const sys = Number(entry.sys ?? entry.systolic);
      const dia = Number(entry.dia ?? entry.diastolic);
      if (Number.isFinite(sys) && Number.isFinite(dia)) {
        candidates.push({ value: `${formatValue(sys)}/${formatValue(dia)} mmHg`, date: entry.date || '' });
      }
    }
  }
  const wm = state.importedData?.wearableSummary?.metrics;
  if (Number.isFinite(wm?.bp_systolic?.latest) && Number.isFinite(wm?.bp_diastolic?.latest)) {
    candidates.push({
      value: `${formatValue(wm.bp_systolic.latest)}/${formatValue(wm.bp_diastolic.latest)} mmHg`,
      date: wm.bp_systolic.latestDate || wm.bp_diastolic.latestDate || '',
    });
  }
  return getLatestReportCandidate(candidates);
}

function getLatestReportRestingPulse() {
  const candidates = [];
  const biometrics = state.importedData.biometrics;
  if (Array.isArray(biometrics?.pulse)) {
    for (const entry of biometrics.pulse) {
      if (Number.isFinite(Number(entry.value))) {
        candidates.push({ value: `${formatValue(Number(entry.value))} bpm`, date: entry.date || '' });
      }
    }
  }
  const rhr = state.importedData?.wearableSummary?.metrics?.rhr;
  if (Number.isFinite(rhr?.latest)) {
    candidates.push({ value: `${formatValue(rhr.latest)} bpm`, date: rhr.latestDate || '' });
  }
  return getLatestReportCandidate(candidates);
}

function getLatestReportBodyFat() {
  const bodyFat = state.importedData?.wearableSummary?.metrics?.body_fat_pct;
  if (!Number.isFinite(bodyFat?.latest)) return null;
  return { value: `${formatValue(bodyFat.latest)}%`, date: bodyFat.latestDate || '' };
}

function formatReportValueWithDate(value, date) {
  if (!value) return '';
  const dateLabel = formatReportDateLabel(date);
  return dateLabel ? `${value} (${dateLabel})` : value;
}

export function buildReportHeaderFacts({ profile, reportOptions, dateRange, sexLabel, unitLabel }) {
  const heightInfo = getReportHeightInfo(profile);
  const latestWeight = getLatestReportWeight();
  const weightKg = getWeightKg(latestWeight);
  const heightMeters = getReportHeightMeters(heightInfo);
  const bmi = weightKg && heightMeters ? weightKg / (heightMeters * heightMeters) : null;
  const dob = profile?.dob || state.profileDob || '';
  const dobLabel = formatReportDateLabel(dob);
  const ageLabel = getReportAgeLabel(dob);
  const dobAge = [dobLabel, ageLabel ? `(${ageLabel})` : ''].filter(Boolean).join(' ');
  const latestBp = getLatestReportBloodPressure();
  const latestPulse = getLatestReportRestingPulse();
  const latestBodyFat = getLatestReportBodyFat();
  const rows = [
    { label: 'Report type', value: reportOptions.presetLabel },
    { label: 'Date range', value: dateRange },
    { label: 'Sex', value: sexLabel },
    { label: 'DOB / Age', value: dobAge },
    { label: 'Location', value: formatReportLocationLabel(profile?.location) },
    { label: 'Height', value: formatReportHeightLabel(heightInfo) },
    { label: 'Weight', value: latestWeight ? formatReportValueWithDate(`${formatValue(latestWeight.value)} ${latestWeight.unit || 'kg'}`, latestWeight.date) : '' },
    { label: 'BMI', value: bmi != null && Number.isFinite(bmi) ? formatReportValueWithDate(bmi.toFixed(1), latestWeight?.date) : '' },
    { label: 'Blood pressure', value: latestBp ? formatReportValueWithDate(latestBp.value, latestBp.date) : '' },
    { label: 'Resting pulse', value: latestPulse ? formatReportValueWithDate(latestPulse.value, latestPulse.date) : '' },
    { label: 'Body fat', value: latestBodyFat ? formatReportValueWithDate(latestBodyFat.value, latestBodyFat.date) : '' },
    { label: 'Units', value: unitLabel },
  ];
  return rows.filter(row => row.value != null && String(row.value).trim());
}

function filterDataByDateIndices(data, indices, cutoffStr) {
  const selectedDates = new Set(indices.map(i => data.dates[i]));
  const filtered = {
    dates: indices.map(i => data.dates[i]),
    dateLabels: indices.map(i => data.dateLabels?.[i] || data.dates[i]),
    ...(data.phaseLabels && { phaseLabels: indices.map(i => data.phaseLabels[i]) }),
    ...(data.phaseDisplayLabels && { phaseDisplayLabels: indices.map(i => data.phaseDisplayLabels[i]) }),
    ...(data.phaseCycleDays && { phaseCycleDays: indices.map(i => data.phaseCycleDays[i]) }),
    ...(data.phaseSources && { phaseSources: indices.map(i => data.phaseSources[i]) }),
    ...(data.entryContextByDate && {
      entryContextByDate: Object.fromEntries(
        Object.entries(data.entryContextByDate).filter(([date]) => selectedDates.has(date))
      ),
    }),
    categories: {}
  };
  for (const [catKey, cat] of Object.entries(data.categories || {})) {
    const filteredCat = { ...cat, markers: {} };
    for (const [mKey, marker] of Object.entries(cat.markers || {})) {
      if (marker.singlePoint || cat.singlePoint) {
        const spDate = marker.singleDate || cat.singleDate;
        if (spDate && cutoffStr && spDate < cutoffStr) {
          filteredCat.markers[mKey] = { ...marker, values: [null], singleDate: null };
        } else {
          filteredCat.markers[mKey] = marker;
        }
      } else {
        filteredCat.markers[mKey] = {
          ...marker,
          values: indices.map(i => marker.values?.[i] ?? null),
          ...(marker.phaseRefRanges && { phaseRefRanges: indices.map(i => marker.phaseRefRanges[i]) }),
          ...(marker.phaseLabels && { phaseLabels: indices.map(i => marker.phaseLabels[i]) }),
          ...(marker.phaseDisplayLabels && { phaseDisplayLabels: indices.map(i => marker.phaseDisplayLabels[i]) }),
          ...(marker.phaseCycleDays && { phaseCycleDays: indices.map(i => marker.phaseCycleDays[i]) }),
          ...(marker.phaseSources && { phaseSources: indices.map(i => marker.phaseSources[i]) }),
          ...(marker.contextRefRanges && { contextRefRanges: indices.map(i => marker.contextRefRanges[i]) }),
          ...(marker.contextRangeLabels && { contextRangeLabels: indices.map(i => marker.contextRangeLabels[i]) }),
          ...(marker.contextOptimalRanges && { contextOptimalRanges: indices.map(i => marker.contextOptimalRanges[i]) }),
          ...(marker.contextOptimalRangeLabels && { contextOptimalRangeLabels: indices.map(i => marker.contextOptimalRangeLabels[i]) }),
        };
      }
    }
    filtered.categories[catKey] = filteredCat;
  }
  return filtered;
}

function getReportCutoffDate(range) {
  const effectiveRange = range === 'current' ? state.dateRangeFilter : range;
  if (!effectiveRange || effectiveRange === 'all') return null;
  const months = effectiveRange === '3m' ? 3 : effectiveRange === '6m' ? 6 : 12;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return cutoff.toISOString().slice(0, 10);
}

function filterDataByReportRange(rawData, range) {
  if (!rawData || range === 'all') return rawData;
  const cutoffStr = getReportCutoffDate(range);
  if (!cutoffStr) return rawData;
  const indices = [];
  for (let i = 0; i < (rawData.dates || []).length; i++) {
    if (rawData.dates[i] >= cutoffStr) indices.push(i);
  }
  return filterDataByDateIndices(rawData, indices, cutoffStr);
}

function filterReportCategories(data, categoryKeys) {
  if (!Array.isArray(categoryKeys)) return data;
  const allowed = new Set(categoryKeys);
  const categories = {};
  for (const [catKey, cat] of Object.entries(data.categories || {})) {
    if (allowed.has(catKey)) categories[catKey] = cat;
  }
  return { ...data, categories };
}

function getReportNotes(options) {
  const notes = (state.importedData.notes || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const cutoffStr = getReportCutoffDate(options.dateRange);
  if (!cutoffStr) return notes;
  return notes.filter(note => !note.date || note.date >= cutoffStr);
}

function buildReportContextSections(data) {
  const contextSections = [];
  const humanizeContextKey = key => String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\b(Am|Uv|Emf|Bp|If|Rf|Hr|Dna)\b/g, match => match.toUpperCase());
  const formatConditionItem = item => {
    if (typeof item !== 'object' || item == null) return String(item);
    const name = item.name || item.condition || item.text || '';
    const details = [];
    if (item.severity) details.push(item.severity);
    if (item.since) details.push(`since ${item.since}`);
    if (item.variant) details.push(item.variant);
    if (item.genotype) details.push(item.genotype);
    if (item.note) details.push(item.note);
    return [name, details.length ? `(${details.join(', ')})` : ''].filter(Boolean).join(' ');
  };
  const formatFamilyHistoryItem = item => {
    if (typeof item !== 'object' || item == null) return String(item);
    const relative = item.relative ? humanizeContextKey(item.relative) : 'Family';
    const details = [];
    if (item.onsetAge != null && item.onsetAge !== '') details.push(`onset ${item.onsetAge}`);
    if (item.note) details.push(item.note);
    return `${relative}: ${item.condition || 'Condition not specified'}${details.length ? ` (${details.join(', ')})` : ''}`;
  };
  const formatObjectItem = item => {
    if (typeof item !== 'object' || item == null) return String(item);
    if (item.relative || item.condition) return formatFamilyHistoryItem(item);
    if (item.name || item.severity || item.since) return formatConditionItem(item);
    const parts = [];
    for (const [key, value] of Object.entries(item)) {
      if (value == null || value === '') continue;
      parts.push(`${humanizeContextKey(key)}: ${formatContextValue(key, value)}`);
    }
    return parts.join('; ');
  };
  const formatContextValue = (key, value) => {
    if (value == null || value === '') return '';
    if (Array.isArray(value)) {
      const items = value.map(item => {
        if (key === 'familyHistory') return formatFamilyHistoryItem(item);
        if (key === 'conditions') return formatConditionItem(item);
        return typeof item === 'object' ? formatObjectItem(item) : String(item);
      }).filter(Boolean);
      return items.join('; ');
    }
    if (typeof value === 'object') return formatObjectItem(value);
    return String(value);
  };
  const fmtCtx = obj => {
    if (typeof obj === 'string') return obj;
    const parts = [];
    for (const [k, v] of Object.entries(obj)) {
      if (v == null || k === 'note') continue;
      const formatted = formatContextValue(k, v);
      if (formatted) parts.push(`${humanizeContextKey(k)}: ${formatted}`);
    }
    if (obj.note) parts.push(`Note: ${obj.note}`);
    return parts.join('\n');
  };
  if (state.importedData.diagnoses) contextSections.push({ title: 'Medical History', text: fmtCtx(state.importedData.diagnoses) });
  if (state.importedData.diet) contextSections.push({ title: 'Diet & Digestion', text: fmtCtx(state.importedData.diet) });
  if (state.importedData.exercise) contextSections.push({ title: 'Exercise & Movement', text: fmtCtx(state.importedData.exercise) });
  if (state.importedData.sleepRest) contextSections.push({ title: 'Sleep & Rest', text: fmtCtx(state.importedData.sleepRest) });
  if (state.importedData.lightCircadian) contextSections.push({ title: 'Light & Circadian', text: fmtCtx(state.importedData.lightCircadian) });
  if (state.importedData.stress) contextSections.push({ title: 'Stress', text: fmtCtx(state.importedData.stress) });
  if (state.importedData.loveLife) contextSections.push({ title: 'Love Life & Relationships', text: fmtCtx(state.importedData.loveLife) });
  if (state.importedData.environment) contextSections.push({ title: 'Environment', text: fmtCtx(state.importedData.environment) });
  if (state.importedData.interpretiveLens) contextSections.push({ title: 'Interpretive Lens', text: state.importedData.interpretiveLens });
  if (state.importedData.contextNotes) contextSections.push({ title: 'Additional Notes', text: state.importedData.contextNotes });
  const hg = state.importedData.healthGoals || [];
  if (hg.length) {
    const goalsText = hg.map(g => `[${g.severity}] ${g.text}`).join('\n');
    contextSections.push({ title: 'Health Goals', text: goalsText });
  }
  const mc = state.importedData.menstrualCycle;
  if (mc && state.profileSex === 'female') {
    const regLabel = mc.regularity === 'very_irregular' ? 'very irregular' : mc.regularity || 'regular';
    let cycleText = `${mc.cycleLength || 28}-day cycle, ${regLabel}, ${mc.flow || 'moderate'} flow`;
    if (mc.contraceptive) cycleText += `. Contraceptive: ${mc.contraceptive}`;
    if (mc.conditions) cycleText += `. Conditions: ${mc.conditions}`;
    const phases = getBloodDrawPhases(mc, data.dates, data.entryContextByDate);
    const phaseDates = Object.entries(phases);
    if (phaseDates.length > 0) {
      cycleText += '\n\nBlood draw phases:\n' + phaseDates.map(([d, p]) => {
        const day = p.cycleDay ? `Day ${p.cycleDay}, ` : '';
        const source = p.source === 'recorded' ? 'recorded' : 'predicted';
        return `${d}: ${day}${p.phaseDetailName || p.phaseName} (${source})`;
      }).join('\n');
    }
    contextSections.push({ title: 'Menstrual Cycle', text: cycleText });
  }
  const pBio = state.importedData.biometrics;
  const pHeight = getProfileHeight(state.currentProfile);
  // Fallback to the wearable summary when legacy biometrics arrays are empty -
  // wearable-only users (manual via Edit Client retired in Phase 4 + OAuth
  // sources) carry weight/BP/pulse only inside wearableSummary.metrics.
  const wm = state.importedData?.wearableSummary?.metrics;
  if (pBio || pHeight?.height || wm) {
    let bioText = '';
    if (pHeight?.height) bioText += `Height: ${formatReportHeightLabel({ height: pHeight.height, unit: pHeight.unit || 'cm' })}\n`;
    const latestWeight = getLatestReportWeight();
    if (latestWeight) {
      bioText += `Latest weight: ${formatValue(latestWeight.value)} ${latestWeight.unit} (${latestWeight.date || '-'})\n`;
    }
    if (pBio?.bp?.length) {
      const latest = [...pBio.bp].sort((a, b) => b.date.localeCompare(a.date))[0];
      bioText += `Latest BP: ${latest.sys}/${latest.dia} mmHg (${latest.date})\n`;
    } else if (typeof wm?.bp_systolic?.latest === 'number' && typeof wm?.bp_diastolic?.latest === 'number') {
      bioText += `Latest BP: ${wm.bp_systolic.latest}/${wm.bp_diastolic.latest} mmHg (${wm.bp_systolic.latestDate || '-'})\n`;
    }
    if (pBio?.pulse?.length) {
      const latest = [...pBio.pulse].sort((a, b) => b.date.localeCompare(a.date))[0];
      bioText += `Latest pulse: ${latest.value} bpm (${latest.date})\n`;
    } else if (typeof wm?.rhr?.latest === 'number') {
      bioText += `Latest resting HR: ${wm.rhr.latest} bpm (${wm.rhr.latestDate || '-'})\n`;
    }
    if (bioText) contextSections.push({ title: 'Biometrics', text: bioText.trim() });
  }
  return contextSections.filter(section => String(section.text || '').trim());
}

export function buildPreparedReportPayload(options = {}) {
  const reportOptions = normalizeReportOptions(options);
  const rawData = getActiveData();
  let data = filterDataByReportRange(rawData, reportOptions.dateRange);
  data = filterReportCategories(data, reportOptions.categoryKeys);
  const profiles = getProfiles();
  const profile = profiles.find(p => p.id === state.currentProfile) || { name: 'Profile' };
  const profileName = profile.name;
  const sexLabel = state.profileSex === 'female' ? 'Female' : state.profileSex === 'male' ? 'Male' : 'Not specified';
  const flags = getAllFlaggedMarkers(data);
  const notes = getReportNotes(reportOptions);
  const supps = state.importedData.supplements || [];
  const contextSections = buildReportContextSections(data);

  return { reportOptions, data, profile, profileName, sexLabel, flags, notes, supps, contextSections };
}

function buildReportAITrendLines(data, limit = REPORT_AI_CONTEXT_TREND_LIMIT) {
  const items = [];
  for (const cat of Object.values(data.categories || {})) {
    for (const marker of Object.values(cat.markers || {})) {
      const nonNull = (marker.values || []).map((v, i) => ({ v, i })).filter(x => x.v !== null && x.v !== undefined);
      if (nonNull.length < 2) continue;
      const first = nonNull[0];
      const last = nonNull[nonNull.length - 1];
      if (first.v === 0) continue;
      const pctChange = ((last.v - first.v) / first.v) * 100;
      if (Math.abs(pctChange) <= 10) continue;
      const direction = pctChange > 0 ? 'increased' : 'decreased';
      const firstDate = formatReportDateLabel(data.dates?.[first.i]) || data.dates?.[first.i] || 'first result';
      const lastDate = formatReportDateLabel(data.dates?.[last.i]) || data.dates?.[last.i] || 'latest result';
      items.push(`${marker.name} ${direction} ${Math.abs(pctChange).toFixed(0)}% (${formatValue(first.v)} to ${formatValue(last.v)} ${marker.unit || ''}, ${firstDate} to ${lastDate})`);
    }
  }
  return items.slice(0, limit);
}

function buildReportAISummaryContext(payload) {
  const { reportOptions, data, profile, profileName, sexLabel, flags, notes, supps, contextSections } = payload;
  const sections = new Set(reportOptions.sections);
  const includesLabData = reportOptions.sections.some(section => REPORT_LAB_SECTION_IDS.includes(section));
  const dateLabels = (data.dates || []).map(formatReportDateLabel).filter(Boolean);
  const dateRange = dateLabels.length
    ? `${dateLabels[0]} to ${dateLabels[dateLabels.length - 1]}`
    : 'No lab dates in selected range';
  const markerLines = [];
  let totalWithData = 0;
  let totalInRange = 0;

  for (const cat of Object.values(data.categories || {})) {
    for (const marker of Object.values(cat.markers || {})) {
      const idx = getLatestReportValueIndex(marker.values || []);
      if (idx === -1) continue;
      const value = marker.values[idx];
      const range = getEffectiveRange(marker);
      const status = getStatus(value, range.min, range.max);
      totalWithData++;
      if (status === 'normal') totalInRange++;
      const date = formatReportDateLabel(data.dates?.[idx]) || data.dates?.[idx] || 'latest';
      const category = cat.label || 'Labs';
      markerLines.push({
        priority: status === 'normal' ? 1 : 0,
        text: `${category}: ${marker.name} ${formatValue(value)} ${marker.unit || ''} (${status}; range ${formatReportRange(range.min, range.max)}; ${date})`
      });
    }
  }

  markerLines.sort((a, b) => a.priority - b.priority || a.text.localeCompare(b.text));

  const lines = [
    `Profile: ${profileName}`,
    `Sex: ${sexLabel}`,
    `Age: ${getReportAgeLabel(profile?.dob) || 'not specified'}`,
    `Profile status: ${profile?.status || 'not specified'}`,
    `Report type: ${reportOptions.presetLabel}`,
  ];
  if (includesLabData) lines.push(`Selected report window: ${dateRange}`, `Range mode: ${state.rangeMode || 'optimal'}`, `Lab dates in report: ${data.dates?.length || 0}`, `Markers reviewed: ${totalWithData}`, `Markers within selected range: ${totalInRange}`, `Latest markers outside selected range: ${flags.length}`);
  if (sections.has('context') && Array.isArray(profile?.tags) && profile.tags.length > 0) {
    lines.push(`Profile tags: ${profile.tags.slice(0, 8).join(', ')}`);
  }
  if (sections.has('context') && profile?.notes) {
    lines.push(`Profile notes: ${String(profile.notes).replace(/\s+/g, ' ').slice(0, 280)}`);
  }

  if ((sections.has('flagged') || sections.has('summary')) && flags.length > 0) {
    lines.push('Latest out-of-range markers:');
    for (const flag of flags.slice(0, REPORT_AI_CONTEXT_FLAG_LIMIT)) {
      lines.push(`- ${flag.name}: ${flag.value} ${flag.unit || ''} ${flag.status} (range ${formatReportRange(flag.effectiveMin, flag.effectiveMax)})`);
    }
  }

  if ((sections.has('categories') || sections.has('summary')) && markerLines.length > 0) {
    lines.push('Representative latest lab results:');
    for (const item of markerLines.slice(0, REPORT_AI_CONTEXT_MARKER_LIMIT)) {
      lines.push(`- ${item.text}`);
    }
  }

  const trendLines = buildReportAITrendLines(data);
  if (sections.has('trends') && trendLines.length > 0) {
    lines.push('Notable trends:');
    for (const item of trendLines) lines.push(`- ${item}`);
  }

  if (sections.has('supplements') && Array.isArray(supps) && supps.length > 0) {
    lines.push('Supplements and medications:');
    for (const supp of supps.slice(0, 12)) {
      const dosage = [supp.dosage, supp.dose, supp.amount, supp.frequency].filter(Boolean).join(', ');
      lines.push(`- ${supp.name || 'Unnamed'}${dosage ? ` (${dosage})` : ''}`);
    }
  }

  if (sections.has('notes') && notes.length > 0) {
    lines.push('Recent report notes:');
    for (const note of notes.slice(-5)) {
      lines.push(`- ${note.date || 'undated'}: ${String(note.text || '').slice(0, 220)}`);
    }
  }

  if (sections.has('context') && contextSections.length > 0) {
    lines.push('Profile context:');
    for (const section of contextSections.slice(0, REPORT_AI_CONTEXT_CONTEXT_LIMIT)) {
      lines.push(`- ${section.title}: ${String(section.text || '').replace(/\s+/g, ' ').slice(0, 280)}`);
    }
  }

  const genetics = state.importedData.genetics;
  if (sections.has('genetics') && genetics?.apoe) lines.push(`Genetics: APOE ${genetics.apoe}`);

  return lines.join('\n');
}

export async function generateReportAISummary(options = {}) {
  if (Array.isArray(options.sections) && options.sections.length === 0) {
    showNotification('Choose at least one report section', 'error');
    return null;
  }
  if (!hasAIProvider()) {
    showNotification('Connect an AI provider before generating a report summary', 'error');
    return null;
  }
  if (isAIPaused()) {
    showNotification('AI features are paused', 'info');
    return null;
  }

  const payload = buildPreparedReportPayload(options);
  const provider = getAIProvider();
  const modelId = getActiveModelId(provider);
  const modelDisplay = getActiveModelDisplay(provider);
  const result = await callClaudeAPI({
    system: REPORT_AI_SUMMARY_PROMPT,
    messages: [{ role: 'user', content: buildReportAISummaryContext(payload) }],
    maxTokens: 900,
    forceNonStream: true,
  }, provider);

  const text = cleanReportAISummaryText(result?.text || '');
  if (!text) throw new Error('AI returned an empty summary');
  if (result?.usage) {
    trackUsage(provider, modelId, result.usage.inputTokens || 0, result.usage.outputTokens || 0);
  }
  return {
    text,
    generatedAt: new Date().toISOString(),
    provider,
    modelId,
    model: modelDisplay,
  };
}

function renderReportAISummaryText(text) {
  const lines = cleanReportAISummaryText(text).split('\n').map(line => line.trim()).filter(Boolean);
  const chunks = [];
  let list = [];
  const flushList = () => {
    if (list.length === 0) return;
    chunks.push(`<ul class="report-list">${list.map(item => `<li>${escapeHTML(item)}</li>`).join('')}</ul>`);
    list = [];
  };
  for (const line of lines) {
    const bullet = line.match(/^(?:[-*]|\u2022|\d+[.)])\s+(.+)$/);
    if (bullet) {
      list.push(bullet[1]);
    } else if (/^[A-Za-z][A-Za-z /&-]{2,42}:$/.test(line)) {
      flushList();
      chunks.push(`<p class="report-ai-subhead">${escapeHTML(line.slice(0, -1))}</p>`);
    } else {
      flushList();
      chunks.push(`<p>${escapeHTML(line)}</p>`);
    }
  }
  flushList();
  return chunks.join('') || '<p>No practitioner overview was generated.</p>';
}

export function renderReportAISummarySection(summary) {
  if (!summary?.text) return '';
  const generatedDate = summary.generatedAt
    ? new Date(summary.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const meta = [summary.model, generatedDate ? `generated ${generatedDate}` : ''].filter(Boolean).join(' · ');
  return `<section class="report-ai-summary">
    <h2>Practitioner Overview</h2>
    <div class="report-ai-summary-body">${renderReportAISummaryText(summary.text)}</div>
    ${meta ? `<p class="report-ai-meta">${escapeHTML(meta)}</p>` : ''}
    <p class="report-note">AI-generated from the selected report data. Review for accuracy before sharing.</p>
  </section>`;
}
