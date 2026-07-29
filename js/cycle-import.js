// @ts-check
// cycle-import.js - menstrual-cycle import adapters, preview, commit, deletion.

import { getErrorMessage } from './caught-error.js';
import { state } from './state.js';
import { saveImportedData } from './data.js';
import { restoreImportedArray } from './data-merge.js';
import { getActiveProfileId, setProfileSex } from './profile.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import { endTour } from './tour.js';
import { escapeAttr, escapeHTML, showConfirmDialog, showNotification } from './utils.js';
import { recordContextCardChangeRuntime } from './context-cards-runtime.js';
import {
  loadCycleImportStylesheetRuntime, navigateCycleViewRuntime, openCycleEditorRuntime,
  renderCycleProfileButtonRuntime,
} from './cycle-runtime.js';
import {
  buildCycleCoverage,
  normalizeCyclePeriods,
  stitchCyclePeriodsFromObservations,
  upgradeMenstrualCycleProfile,
} from './cycle-summary.js';
import {
  looksLikeClueCycleJson,
  looksLikeNaturalCyclesCsv,
  parseClueCycleJson,
  parseDripCycleCsv,
  parseNaturalCyclesCsv,
  parseNaturalCyclesCsvBundle,
} from './cycle-import-adapters.js';
import {
  appleHealthArchiveEntry,
  buildCycleFileContext,
  clueArchiveEntries,
  cycleFileKind,
  naturalCyclesArchiveEntries,
} from './cycle-import-file.js';
import {
  clearCycleImport,
  clearCycleDB,
  clearCycleSource,
  getAllCycleObservationsRaw,
  getCycleImportMeta,
  getCycleImportMetaRaw,
  saveCycleImportMeta,
  upsertCycleObservationBatch,
  upsertCycleImportMetaBatchRaw,
  upsertCycleObservationBatchRaw,
} from './cycle-store.js';

const CYCLE_IMPORT_ACTION = 'data-cycle-import-action';
const CYCLE_IMPORT_ACCEPT = '.csv,.json,.cluedata,.xml,.zip,text/csv,application/json,application/xml,text/xml,application/zip';
const SOURCE_LABELS = {
  apple_health: 'Apple Health',
  drip: 'Drip',
  clue: 'Clue',
  flo: 'Flo',
  natural_cycles: 'Natural Cycles',
  kindara: 'Kindara',
  ovuview: 'OvuView',
  femm: 'FEMM',
  fertility_friend: 'Fertility Friend',
  tempdrop: 'Tempdrop',
  manual: 'Manual',
};
/**
 * @typedef {{
 *   parsed: Record<string, any>,
 *   conflictMode: string,
 *   resolve: (value: any) => void,
 * }} PendingCycleImport
 */
/** @type {PendingCycleImport | null} */
let pendingCycleImport = null;

function navigateCycleImportView(category) {
  return navigateCycleViewRuntime(category);
}

function renderCycleProfileButton() {
  renderCycleProfileButtonRuntime();
}

async function openCycleEditorFromImport() {
  openCycleEditorRuntime();
}

function importActionAttrs(action, data = {}) {
  const attrs = [`${CYCLE_IMPORT_ACTION}="${escapeAttr(action)}"`];
  for (const [key, value] of Object.entries(data)) {
    const attrKey = key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    if (value != null && value !== '') attrs.push(`data-cycle-import-${attrKey}="${escapeAttr(String(value))}"`);
  }
  return attrs.join(' ');
}

function sourceLabel(source) {
  return SOURCE_LABELS[source] || source;
}
function cloneJSON(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function snapshotCycleState() {
  return {
    menstrualCycle: cloneJSON(state.importedData.menstrualCycle),
    changeHistory: cloneJSON(state.importedData.changeHistory || []),
    deleted: cloneJSON(state.importedData._deleted || {}),
    profileSex: state.profileSex,
  };
}
async function restoreCycleState(snapshot, profileId, { restoreSex = false } = {}) {
  state.importedData.menstrualCycle = snapshot.menstrualCycle;
  restoreImportedArray(state.importedData, 'changeHistory', snapshot.changeHistory);
  state.importedData._deleted = snapshot.deleted;
  if (restoreSex && state.profileSex !== snapshot.profileSex) {
    if (!await setProfileSex(profileId, snapshot.profileSex || null)) {
      throw new Error('The profile no longer exists, so its previous sex could not be restored.');
    }
    state.profileSex = snapshot.profileSex;
    renderCycleProfileButton();
  }
}
async function persistCycleState() {
  if (!await saveImportedData()) throw new Error('Cycle data could not be saved. No changes were kept.');
}

async function restorePersistedCycleState(snapshot, profileId, options = {}) {
  await restoreCycleState(snapshot, profileId, options);
  if (!await saveImportedData()) throw new Error('The previous cycle state could not be restored. Reload before making more changes.');
}

export function renderCycleImportPickerControls() {
  return `<button type="button" class="cycle-icon-btn" ${importActionAttrs('pick-file')} title="Import cycle data" aria-label="Import cycle data"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="m17 8-5-5-5 5"></path><path d="M12 3v12"></path></svg></button>
    <input type="file" class="cycle-import-file-input" ${importActionAttrs('select-file')} accept="${CYCLE_IMPORT_ACCEPT}" hidden aria-label="Choose a cycle export">`;
}

function stableImportId(source, fileName) {
  const base = String(fileName || source || 'cycle-import')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || source || 'cycle-import';
  return `${source || 'cycle'}-${Date.now()}-${base}`;
}

function isoDateFromApple(value) {
  const day = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}
function dateRangeForObservations(observations) {
  const dates = observations.map(row => row.date).filter(Boolean).sort();
  return { firstDate: dates[0] || null, lastDate: dates[dates.length - 1] || null };
}

const APPLE_FLOW = {
  HKCategoryValueMenstrualFlowUnspecified: 'moderate',
  HKCategoryValueMenstrualFlowLight: 'light',
  HKCategoryValueMenstrualFlowMedium: 'moderate',
  HKCategoryValueMenstrualFlowHeavy: 'heavy',
  HKCategoryValueMenstrualFlowNone: null,
};
const APPLE_OVULATION = {
  HKCategoryValueOvulationTestResultPositive: 'positive',
  HKCategoryValueOvulationTestResultNegative: 'negative',
  HKCategoryValueOvulationTestResultIndeterminate: 'indeterminate',
  HKCategoryValueOvulationTestResultLuteinizingHormoneSurge: 'positive',
};
const APPLE_FLOW_PRIORITY = { spotting: 0, light: 1, moderate: 2, heavy: 3 };
const RECORD_RE = /<Record\b([^>]*?)\/?>/g;
const ATTR_RE = /(\w+)="([^"]*)"/g;

function parseAppleAttrs(raw) {
  const attrs = {};
  ATTR_RE.lastIndex = 0;
  let match;
  while ((match = ATTR_RE.exec(raw)) !== null) attrs[match[1]] = match[2];
  return attrs;
}
function addObservation(map, source, date, patch) {
  if (!date) return;
  const key = `${source}|${date}`;
  const row = map.get(key) || { source, date };
  const next = { ...row, ...patch };
  if (patch.bleeding) {
    const previous = row.bleeding;
    const previousPriority = previous && !previous.excluded ? APPLE_FLOW_PRIORITY[previous.flow] ?? -1 : -1;
    const nextPriority = !patch.bleeding.excluded ? APPLE_FLOW_PRIORITY[patch.bleeding.flow] ?? -1 : -1;
    next.bleeding = !previous || nextPriority >= previousPriority ? { ...previous, ...patch.bleeding } : previous;
  }
  map.set(key, next);
}
function processAppleCycleRecord(attrsRaw, byKey) {
  if (!/HKCategoryTypeIdentifier(MenstrualFlow|IntermenstrualBleeding|OvulationTestResult|CervicalMucusQuality)/.test(attrsRaw)) return;
  const attrs = parseAppleAttrs(attrsRaw);
  const date = isoDateFromApple(attrs.startDate || attrs.creationDate);
  if (!date) return;
  if (attrs.type === 'HKCategoryTypeIdentifierMenstrualFlow') {
    if (Object.prototype.hasOwnProperty.call(APPLE_FLOW, attrs.value)) {
      const flow = APPLE_FLOW[attrs.value];
      if (flow) addObservation(byKey, 'apple_health', date, { bleeding: { flow, excluded: false, intermenstrual: false } });
    }
  } else if (attrs.type === 'HKCategoryTypeIdentifierIntermenstrualBleeding') {
    addObservation(byKey, 'apple_health', date, { bleeding: { flow: 'spotting', excluded: true, intermenstrual: true } });
  } else if (attrs.type === 'HKCategoryTypeIdentifierOvulationTestResult') {
    addObservation(byKey, 'apple_health', date, { ovulationTest: APPLE_OVULATION[attrs.value] || String(attrs.value || '').replace('HKCategoryValueOvulationTestResult', '').toLowerCase() });
  } else if (attrs.type === 'HKCategoryTypeIdentifierCervicalMucusQuality') {
    addObservation(byKey, 'apple_health', date, { cervicalMucus: { quality: String(attrs.value || '').replace('HKCategoryValueCervicalMucusQuality', '').toLowerCase() } });
  }
}
function finalizeAppleHealthCycleImport(byKey, fileName) {
  const observations = Array.from(byKey.values()).sort((a, b) => a.date.localeCompare(b.date));
  if (observations.length === 0) return null;
  const importId = stableImportId('apple_health', fileName);
  const periods = stitchCyclePeriodsFromObservations(observations, {
    source: 'apple_health',
    importId,
    updatedAt: new Date().toISOString(),
  });
  return {
    source: 'apple_health',
    sourceLabel: 'Apple Health',
    sourceFile: fileName,
    importId,
    observations: observations.map(row => ({ ...row, importId })),
    periods,
    warnings: periods.length === 0 ? ['Apple Health had cycle observations, but no menstrual-flow episodes were derived.'] : [],
    detectedRange: dateRangeForObservations(observations),
  };
}

export function parseAppleHealthCycleXml(xmlText, fileName = 'apple-health-export.xml') {
  const byKey = new Map();
  RECORD_RE.lastIndex = 0;
  let match;
  while ((match = RECORD_RE.exec(xmlText)) !== null) processAppleCycleRecord(match[1], byKey);
  return finalizeAppleHealthCycleImport(byKey, fileName);
}
/**
 * @param {Blob} blob
 * @param {string} [fileName]
 * @param {((progress: { stage: string, pct: number }) => void) | null} [onProgress]
 */
export async function parseAppleHealthCycleBlob(blob, fileName = 'apple-health-export.xml', onProgress = null) {
  const byKey = new Map();
  const reader = blob.stream()
    .pipeThrough(new TextDecoderStream('utf-8'))
    .getReader();
  let buffer = '';
  let bytesRead = 0;
  const totalSize = blob.size || 0;

  const flushLine = (line) => {
    if (line.indexOf('<Record') === -1) return;
    RECORD_RE.lastIndex = 0;
    let match;
    while ((match = RECORD_RE.exec(line)) !== null) processAppleCycleRecord(match[1], byKey);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    bytesRead += value.length;
    let nlIdx;
    while ((nlIdx = buffer.indexOf('\n')) !== -1) {
      flushLine(buffer.slice(0, nlIdx));
      buffer = buffer.slice(nlIdx + 1);
    }
    if (totalSize && onProgress) onProgress({ stage: 'parsing-cycle', pct: Math.round((bytesRead / totalSize) * 35 + 40) });
  }
  if (buffer.length) flushLine(buffer);
  return finalizeAppleHealthCycleImport(byKey, fileName);
}

export function isAppleHealthCycleFile(file) {
  return cycleFileKind(file) === 'xml';
}

export const CYCLE_IMPORT_ADAPTERS = Object.freeze([
  {
    id: 'apple_health',
    sourceLabel: 'Apple Health',
    detect: context => context.kind === 'xml' || !!appleHealthArchiveEntry(context),
    parse: async context => {
      const blob = context.kind === 'xml' ? context.file : await appleHealthArchiveEntry(context)?.async('blob');
      return blob ? parseAppleHealthCycleBlob(blob, context.file.name || 'apple-health-export.xml') : null;
    },
  },
  {
    id: 'clue',
    sourceLabel: 'Clue',
    detect: context => context.kind === 'json'
      ? looksLikeClueCycleJson(context.text)
      : context.kind === 'zip' && clueArchiveEntries(context).length > 0,
    parse: async context => {
      if (context.kind === 'json') return parseClueCycleJson(context.text, context.file.name || 'clue-data.json');
      for (const entry of clueArchiveEntries(context)) {
        const parsed = parseClueCycleJson(await entry.async('text'), context.file.name || entry.name);
        if (parsed) return parsed;
      }
      return null;
    },
  },
  {
    id: 'natural_cycles',
    sourceLabel: 'Natural Cycles',
    detect: context => context.kind === 'csv'
      ? looksLikeNaturalCyclesCsv(context.text, context.file.name)
      : context.kind === 'zip' && naturalCyclesArchiveEntries(context).length > 0,
    parse: async context => {
      if (context.kind === 'csv') return parseNaturalCyclesCsv(context.text, context.file.name || 'tracking_data.csv');
      const files = [];
      for (const entry of naturalCyclesArchiveEntries(context)) {
        files.push({ name: entry.name, text: await entry.async('text') });
      }
      return parseNaturalCyclesCsvBundle(files, context.file.name || 'natural-cycles-export.zip');
    },
  },
  {
    id: 'drip',
    sourceLabel: 'Drip',
    detect: context => context.kind === 'csv' || context.kind === 'text',
    parse: async context => parseDripCycleCsv(context.text, context.file.name || 'drip.csv'),
  },
]);

export async function isCycleImportFile(file) {
  const kind = cycleFileKind(file);
  if (kind === 'xml' || kind === 'zip' || String(file?.name || '').toLowerCase().endsWith('.cluedata')) return true;
  if (kind !== 'json') return false;
  try { return looksLikeClueCycleJson(await file.text()); } catch { return false; }
}

export async function parseCycleImportFile(file) {
  if (!file) return null;
  const context = await buildCycleFileContext(file);
  return parseCycleImportContext(context);
}

async function parseCycleImportContext(context) {
  for (const adapter of CYCLE_IMPORT_ADAPTERS) {
    if (!await adapter.detect(context)) continue;
    const parsed = await adapter.parse(context);
    if (parsed) return parsed;
  }
  return null;
}

export { parseClueCycleJson, parseDripCycleCsv, parseNaturalCyclesCsv, parseNaturalCyclesCsvBundle } from './cycle-import-adapters.js';

function overlaps(a, b) {
  return a.startDate <= (b.endDate || b.startDate) && (a.endDate || a.startDate) >= b.startDate;
}
export function buildCycleImportPlan(parsed, mc = state.importedData.menstrualCycle, conflictMode = 'keep-existing') {
  const imported = normalizeCyclePeriods(parsed?.periods || []);
  const existing = normalizeCyclePeriods(mc?.periods || []);
  const conflicts = imported.map(period => ({
    period,
    existing: existing.filter(curr => overlaps(period, curr)),
  })).filter(item => item.existing.length > 0);
  const conflictStarts = new Set(conflicts.map(item => item.period.startDate));
  const importedToApply = imported.filter(period => conflictMode === 'replace-overlapping' || !conflictStarts.has(period.startDate));
  const existingToKeep = conflictMode === 'replace-overlapping'
    ? existing.filter(curr => !importedToApply.some(period => overlaps(period, curr)))
    : existing;
  return {
    conflictMode,
    conflicts,
    importedPeriods: imported,
    importedToApply,
    mergedPeriods: normalizeCyclePeriods([...existingToKeep, ...importedToApply]),
  };
}

async function applyRawObservationCounts(mc, profileId, sourceHint = null, rawRowsOverride = null) {
  const upgraded = upgradeMenstrualCycleProfile(mc);
  if (!upgraded?.coverage) return upgraded;
  let rawRows;
  if (rawRowsOverride) rawRows = rawRowsOverride;
  else try { rawRows = await getAllCycleObservationsRaw(profileId); } catch { return upgraded; }
  const rawBySource = new Map();
  for (const row of rawRows) {
    if (!row?.source || !row?.date) continue;
    const stats = rawBySource.get(row.source) || { count: 0, firstDate: row.date, lastDate: row.date };
    stats.count++;
    if (row.date < stats.firstDate) stats.firstDate = row.date;
    if (row.date > stats.lastDate) stats.lastDate = row.date;
    rawBySource.set(row.source, stats);
  }
  const sources = new Set([...Object.keys(upgraded.coverage.sources || {}), ...rawBySource.keys()]);
  if (sourceHint) sources.add(sourceHint);
  for (const source of sources) {
    const raw = rawBySource.get(source);
    const count = raw?.count || 0;
    const periods = upgraded.coverage.sources[source]?.periods || 0;
    if (count > 0 || periods > 0) {
      upgraded.coverage.sources[source] = {
        ...(upgraded.coverage.sources[source] || { importedAt: null, periods: 0 }),
        observations: count,
        ...(raw ? { firstDate: raw.firstDate, lastDate: raw.lastDate } : {}),
      };
    } else {
      delete upgraded.coverage.sources[source];
    }
  }
  const coverageDates = [
    ...upgraded.periods.flatMap(period => [period.startDate, period.endDate]),
    ...rawRows.map(row => row.date),
  ].filter(Boolean).sort();
  upgraded.coverage.firstDate = coverageDates[0] || null;
  upgraded.coverage.lastDate = coverageDates[coverageDates.length - 1] || null;
  upgraded.coverage.observationCount = rawRows.length;
  return upgraded;
}

export async function commitCycleImport(parsed, { conflictMode = 'keep-existing', allowProfileSexChange = false } = {}) {
  if (!parsed || !parsed.source || !parsed.importId) throw new Error('Invalid cycle import');
  const profileId = getActiveProfileId();
  if (state.profileSex && state.profileSex !== 'female' && !allowProfileSexChange) {
    const error = /** @type {Error & { code?: string }} */ (new Error('Confirm changing this profile to female before importing cycle data.'));
    error.code = 'profile-sex-confirmation-required';
    throw error;
  }
  const snapshot = snapshotCycleState();
  const now = new Date().toISOString();
  const observations = (parsed.observations || []).map(row => ({ importedAt: Date.now(), ...row, source: parsed.source, importId: parsed.importId }));
  const observationDates = new Set(observations.map(row => row.date));
  const priorRows = (await getAllCycleObservationsRaw(profileId).catch(() => []))
    .filter(row => row.source === parsed.source && observationDates.has(row.date));
  const priorMeta = await getCycleImportMetaRaw(profileId, parsed.importId).catch(() => null);
  try {
    if (observations.length > 0) await upsertCycleObservationBatch(profileId, observations);
    await saveCycleImportMeta(profileId, {
      importId: parsed.importId,
      source: parsed.source,
      sourceFile: parsed.sourceFile || '',
      importedAt: now,
      observationCount: observations.length,
      periodCount: parsed.periods?.length || 0,
      detectedRange: parsed.detectedRange || null,
    });
    if (state.profileSex !== 'female') {
      if (!await setProfileSex(profileId, 'female')) {
        throw new Error('The active profile no longer exists.');
      }
      state.profileSex = 'female';
      renderCycleProfileButton();
    }
    const plan = buildCycleImportPlan(parsed, state.importedData.menstrualCycle, conflictMode);
    const coverage = buildCycleCoverage(plan.mergedPeriods, state.importedData.menstrualCycle?.coverage || null);
    const previousImportIds = coverage.sources[parsed.source]?.importIds || [];
    coverage.sources[parsed.source] = {
      ...(coverage.sources[parsed.source] || { periods: 0, observations: 0 }),
      importedAt: now,
      importIds: Array.from(new Set([...previousImportIds, parsed.importId])),
    };
    const base = { ...(state.importedData.menstrualCycle || {}), periods: plan.mergedPeriods, coverage };
    state.importedData.menstrualCycle = await applyRawObservationCounts(base, profileId, parsed.source);
    recordContextCardChangeRuntime('menstrualCycle');
    await persistCycleState();
    return {
      observations: observations.length,
      periods: plan.importedToApply.length,
      conflicts: plan.conflicts.length,
      source: parsed.source,
    };
  } catch (error) {
    try {
      await clearCycleImport(profileId, parsed.importId);
      await upsertCycleObservationBatchRaw(profileId, priorRows);
      if (priorMeta) await upsertCycleImportMetaBatchRaw(profileId, [priorMeta]);
    } catch (rollbackError) {
      error = new Error(
        `${getErrorMessage(error, 'Cycle import failed')} Rollback also failed: ${getErrorMessage(rollbackError)}`,
        { cause: error },
      );
    }
    await restoreCycleState(snapshot, profileId, { restoreSex: true });
    throw error;
  }
}

export async function deleteCycleImportFromProfile(importId) {
  if (!importId) return false;
  const profileId = getActiveProfileId();
  const mc = state.importedData.menstrualCycle;
  const rawRows = await getAllCycleObservationsRaw(profileId).catch(() => []);
  const rawMeta = await getCycleImportMetaRaw(profileId, importId).catch(() => null);
  const meta = await getCycleImportMeta(profileId, importId).catch(() => null);
  const removed = (mc?.periods || []).filter(period => period.importId === importId);
  if (!rawMeta && !meta && removed.length === 0 && !rawRows.some(row => row.importId === importId)) return false;
  if (!mc) { await clearCycleImport(profileId, importId); return true; }
  const snapshot = snapshotCycleState();
  const source = removed[0]?.source || meta?.source || rawMeta?.source || null;
  const sources = { ...(mc.coverage?.sources || {}) };
  if (source && sources[source]) {
    sources[source] = { ...sources[source], importIds: (sources[source].importIds || []).filter(id => id !== importId) };
  }
  const next = {
    ...mc,
    periods: (mc.periods || []).filter(period => period.importId !== importId),
    ...(mc.coverage ? { coverage: { ...mc.coverage, sources } } : {}),
  };
  const remainingRows = rawRows.filter(row => row.importId !== importId);
  state.importedData.menstrualCycle = await applyRawObservationCounts(next, profileId, source, remainingRows);
  recordContextCardChangeRuntime('menstrualCycle');
  let persisted = false;
  try {
    await persistCycleState();
    persisted = true;
    await clearCycleImport(profileId, importId);
  } catch (error) {
    if (persisted) await restorePersistedCycleState(snapshot, profileId);
    else await restoreCycleState(snapshot, profileId);
    throw error;
  }
  return true;
}

export async function deleteCycleSourceFromProfile(source) {
  if (!source) return false;
  const profileId = getActiveProfileId();
  const mc = state.importedData.menstrualCycle;
  if (!mc) { await clearCycleSource(profileId, source); return true; }
  const snapshot = snapshotCycleState();
  const rawRows = await getAllCycleObservationsRaw(profileId).catch(() => []);
  const next = { ...mc, periods: (mc.periods || []).filter(period => period.source !== source) };
  state.importedData.menstrualCycle = await applyRawObservationCounts(next, profileId, source, rawRows.filter(row => row.source !== source));
  recordContextCardChangeRuntime('menstrualCycle');
  let persisted = false;
  try {
    await persistCycleState();
    persisted = true;
    await clearCycleSource(profileId, source);
  } catch (error) {
    if (persisted) await restorePersistedCycleState(snapshot, profileId);
    else await restoreCycleState(snapshot, profileId);
    throw error;
  }
  return true;
}

export async function clearCycleProfileData() {
  const profileId = getActiveProfileId();
  const snapshot = snapshotCycleState();
  state.importedData.menstrualCycle = null;
  recordContextCardChangeRuntime('menstrualCycle');
  let persisted = false;
  try {
    await persistCycleState();
    persisted = true;
    await clearCycleDB(profileId);
  } catch (error) {
    if (persisted) await restorePersistedCycleState(snapshot, profileId);
    else await restoreCycleState(snapshot, profileId);
    throw error;
  }
  return true;
}

function conflictSummary(plan) {
  const count = plan.conflicts.length;
  return `${count} imported period${count !== 1 ? 's' : ''} overlap${count === 1 ? 's' : ''} existing entries.`;
}
function renderPeriodRows(periods, conflictStarts, conflictMode) {
  return periods.slice(0, 18).map(period => {
    const hasConflict = conflictStarts.has(period.startDate);
    const status = hasConflict
      ? conflictMode === 'replace-overlapping' ? 'Overlap · replace' : 'Overlap · skip'
      : 'Ready';
    return `<tr data-import-status="${hasConflict ? 'unmatched' : 'matched'}">
      <td class="cycle-import-status-cell" data-label="Status"><span class="cycle-import-row-status ${hasConflict ? 'cycle-import-row-status-conflict' : 'cycle-import-row-status-ready'}">${status}</span></td>
      <td data-label="Start">${escapeHTML(period.startDate || '')}</td><td data-label="End">${escapeHTML(period.endDate || period.startDate || '')}</td>
      <td data-label="Flow">${escapeHTML(period.flow || 'moderate')}</td><td data-label="Symptoms">${escapeHTML((period.symptoms || []).join(', '))}</td>
    </tr>`;
  }).join('');
}

function renderCycleImportPreview(parsed, conflictMode = 'keep-existing') {
  const plan = buildCycleImportPlan(parsed, state.importedData.menstrualCycle, conflictMode);
  const source = parsed.sourceLabel || sourceLabel(parsed.source);
  const observationCount = parsed.observations?.length || 0;
  const conflictStarts = new Set(plan.conflicts.map(item => item.period.startDate));
  const importCount = plan.importedToApply.length;
  const confirmLabel = importCount ? `Import ${importCount} period${importCount !== 1 ? 's' : ''}`
    : observationCount ? `Import ${observationCount} daily observation${observationCount !== 1 ? 's' : ''}` : 'Complete import';
  return `<div class="gb-modal-head import-preview-head">
      <div><div class="gb-modal-kicker">Cycle import · ${escapeHTML(source)}</div><div class="gb-modal-title">Review cycle import</div></div>
      <button type="button" class="modal-close" ${importActionAttrs('close')} aria-label="Close import preview">&times;</button>
    </div>
    <div class="gb-form-body import-review-body">
      <div class="import-review-summary">
        <div class="import-review-file"><span class="import-review-label">File</span><strong>${escapeHTML(parsed.sourceFile || source)}</strong></div>
        <div class="import-review-file"><span class="import-review-label">Range</span><strong>${escapeHTML(parsed.detectedRange?.firstDate || '?')} - ${escapeHTML(parsed.detectedRange?.lastDate || '?')}</strong></div>
        <div class="import-review-stats" aria-label="Cycle import summary">
          <span class="import-review-stat"><strong>${observationCount}</strong> daily observations</span><span class="import-review-stat import-review-stat-matched"><strong>${plan.importedPeriods.length}</strong> periods found</span>
          ${plan.conflicts.length ? `<span class="import-review-stat import-review-stat-unmatched"><strong>${plan.conflicts.length}</strong> overlap${plan.conflicts.length !== 1 ? 's' : ''}</span>
          <span class="import-review-stat import-review-stat-new"><strong>${importCount}</strong> will import</span>` : ''}
        </div>
      </div>
      ${plan.conflicts.length ? `<div class="import-review-warning cycle-import-conflict-warning" role="alert"><strong>${escapeHTML(conflictSummary(plan))}</strong><span>Choose how to handle the overlapping periods below.</span></div>` : ''}
      ${parsed.warnings?.length ? `<div class="import-review-warning" role="alert">${parsed.warnings.map(escapeHTML).join('<br>')}</div>` : ''}
      ${plan.conflicts.length ? `<div class="cycle-import-conflicts" role="radiogroup" aria-label="Cycle import conflict handling">
        ${[['keep-existing', 'Keep existing', 'Import non-overlapping periods and leave conflicts unchanged.'],
          ['replace-overlapping', 'Replace overlaps', 'Replace overlapping existing period entries with imported periods.']]
          .map(([value, label, desc]) => `<label class="cycle-import-conflict-option">
          <input type="radio" name="cycle-import-conflict" value="${value}" ${conflictMode === value ? 'checked' : ''} ${importActionAttrs('conflict-mode')}><span><strong>${label}</strong><small>${desc}</small></span>
        </label>`).join('')}
      </div>` : ''}
      <div class="cycle-import-table-heading"><strong>${plan.importedPeriods.length ? 'Periods found' : 'No periods found'}</strong><span>${plan.importedPeriods.length ? 'Check the dates and details before importing.' : 'Daily observations can still be saved on this device.'}</span></div>
      ${plan.importedPeriods.length ? `<div class="import-table-wrap cycle-import-table-wrap">
        <table class="import-table import-review-table cycle-import-table" aria-label="Periods detected in this import">
          <thead><tr><th class="cycle-import-status-heading">Status</th><th>Start</th><th>End</th><th>Flow</th><th>Symptoms</th></tr></thead><tbody>${renderPeriodRows(plan.importedPeriods, conflictStarts, conflictMode)}</tbody>
        </table>
      </div>` : ''}
      ${plan.importedPeriods.length > 18 ? `<div class="cycle-import-more">Showing 18 of ${plan.importedPeriods.length} periods.</div>` : ''}
      <div class="cycle-import-privacy-note">
        <span class="cycle-import-privacy-icon" aria-hidden="true">&#128274;</span><span><strong>Daily details stay on this device.</strong><small>Period summaries can sync across devices when cross-device sync is enabled.</small></span>
      </div>
    </div>
    <div class="import-review-actions">
      <button type="button" class="import-btn import-btn-secondary" ${importActionAttrs('close')}>Cancel</button>
      <button type="button" class="import-btn import-btn-primary" ${importActionAttrs('confirm')}>${confirmLabel}</button>
    </div>`;
}

export async function showCycleImportPreview(parsed) {
  if (!parsed || (!parsed.observations?.length && !parsed.periods?.length)) {
    showNotification('No cycle data found in this file', 'info');
    return null;
  }
  try {
    await loadCycleImportStylesheetRuntime();
  } catch (err) {
    console.error('[cycle-import] Could not load import stylesheet:', err);
    showNotification('Could not load import review. Reload the app to finish updating, then try again.', 'error');
    return null;
  }
  return new Promise(resolve => {
    endTour({ openEmptyChat: false });
    pendingCycleImport = { parsed, conflictMode: 'keep-existing', resolve };
    const overlay = document.getElementById('import-modal-overlay');
    const modal = document.getElementById('import-modal');
    if (!overlay || !modal) {
      commitCycleImport(parsed).then(resolve).catch(err => {
        showNotification(`Cycle import failed: ${err.message}`, 'error');
        resolve(null);
      });
      return;
    }
    modal.className = 'modal import-preview-modal cycle-import-preview-modal';
    modal.innerHTML = renderCycleImportPreview(parsed);
    openModalOverlay(overlay, { initialFocus: '[data-cycle-import-action="confirm"]', focusDelay: 50 });
  });
}

/** @param {any} [value] */
function closeCycleImportPreview(value = null) {
  const pending = pendingCycleImport;
  pendingCycleImport = null;
  closeModalOverlay('import-modal-overlay');
  pending?.resolve?.(value);
}

export async function handleCycleImportAction(event) {
  const target = event.target instanceof Element ? event.target.closest(`[${CYCLE_IMPORT_ACTION}]`) : null;
  if (!(target instanceof HTMLElement)) return;
  const action = target.getAttribute(CYCLE_IMPORT_ACTION) || '';
  if (action === 'pick-file') {
    const input = target.closest('.cycle-section')?.querySelector('.cycle-import-file-input');
    if (!(input instanceof HTMLInputElement)) {
      showNotification('Cycle import is not available on this screen.', 'error');
      return;
    }
    input.value = '';
    input.click();
  } else if (action === 'select-file' && event.type === 'change' && target instanceof HTMLInputElement) {
    const file = target.files?.[0];
    target.value = '';
    if (file) await handleCycleImportFile(file);
  } else if (action === 'close') {
    closeCycleImportPreview(null);
  } else if (action === 'conflict-mode' && pendingCycleImport && target instanceof HTMLInputElement) {
    pendingCycleImport.conflictMode = target.value || 'keep-existing';
    const modal = document.getElementById('import-modal');
    if (modal) modal.innerHTML = renderCycleImportPreview(pendingCycleImport.parsed, pendingCycleImport.conflictMode);
  } else if (action === 'confirm' && pendingCycleImport) {
    let allowProfileSexChange = false;
    if (state.profileSex && state.profileSex !== 'female') {
      const sexLabel = state.profileSex.charAt(0).toUpperCase() + state.profileSex.slice(1);
      allowProfileSexChange = await showConfirmDialog(`This profile is set to ${sexLabel}. Cycle interpretation uses female reference ranges. Change the profile to Female and continue?`);
      if (!allowProfileSexChange) return;
    }
    target.setAttribute('disabled', 'true');
    try {
      const result = await commitCycleImport(pendingCycleImport.parsed, {
        conflictMode: pendingCycleImport.conflictMode,
        allowProfileSexChange,
      });
      showNotification(`Cycle import complete - ${result.periods} periods, ${result.observations} local observations`, 'success', 1200);
      closeCycleImportPreview(result);
      const didNavigate = navigateCycleImportView('body');
      setTimeout(() => {
        openCycleEditorFromImport().catch(error => showNotification(`Could not reopen cycle history: ${error.message}`, 'error'));
      }, didNavigate ? 1550 : 0);
    } catch (err) {
      target.removeAttribute('disabled');
      showNotification(`Cycle import failed: ${getErrorMessage(err)}`, 'error');
    }
  } else if (action === 'delete-source') {
    const source = target.dataset.cycleImportSource || '';
    if (!source || !await showConfirmDialog(`Remove all ${sourceLabel(source)} cycle data from this profile?`)) return;
    await deleteCycleSourceFromProfile(source);
    showNotification(`${sourceLabel(source)} cycle data removed`, 'info');
    await openCycleEditorFromImport();
  } else if (action === 'delete-import') {
    const importId = target.dataset.cycleImportImportId || '';
    if (!importId || !await showConfirmDialog('Remove this imported cycle batch?')) return;
    await deleteCycleImportFromProfile(importId);
    showNotification('Imported cycle batch removed', 'info');
    await openCycleEditorFromImport();
  }
}

export async function handleCycleImportFile(file) {
  let parsed = null;
  let importLabel = 'Cycle';
  try {
    const context = await buildCycleFileContext(file);
    const appleHealthEntry = context.kind === 'zip' ? appleHealthArchiveEntry(context) : null;
    if (context.kind === 'xml' || appleHealthEntry) {
      importLabel = 'Apple Health';
      const xmlBlob = context.kind === 'xml' ? context.file : await appleHealthEntry.async('blob');
      const { importAppleHealthFile } = await import('./wearables-apple-health.js');
      showNotification('Importing Apple Health data...', 'info', 1600);
      const result = await importAppleHealthFile(file, null, { xmlBlob });
      const cycleSuffix = result.cycleImport ? ` + ${result.cycleImport.periods} cycle periods` : '';
      showNotification(`Apple Health imported - ${result.rows} days${cycleSuffix}`, 'success', 3000);
      if (result.cycleError) showNotification(`Cycle import skipped: ${result.cycleError}`, 'info', 5000);
      navigateCycleImportView('dashboard');
      return true;
    }
    parsed = await parseCycleImportContext(context);
  } catch (err) {
    showNotification(`${importLabel} import failed: ${getErrorMessage(err)}`, 'error');
    return false;
  }
  if (!parsed) {
    showNotification('No cycle data found in this file', 'info');
    return false;
  }
  await showCycleImportPreview(parsed);
  return true;
}

export async function maybeHandleCycleTextImport(file, text) {
  const parsed = parseNaturalCyclesCsv(text, file.name || 'tracking_data.csv')
    || parseDripCycleCsv(text, file.name || 'cycle.csv');
  if (!parsed) return false;
  await showCycleImportPreview(parsed);
  return true;
}

export function renderCycleImportSummarySection(mc) {
  const upgraded = upgradeMenstrualCycleProfile(mc);
  const coverage = upgraded?.coverage;
  if (!coverage || (!coverage.periodCount && !coverage.observationCount && !Object.keys(coverage.sources || {}).length)) return '';
  const sourceRows = Object.entries(coverage.sources || {})
    .filter(([, info]) => (info?.periods || 0) > 0 || (info?.observations || 0) > 0)
    .map(([source, info]) => {
      const periodImportIds = (upgraded.periods || []).filter(period => period.source === source && period.importId).map(period => period.importId);
      const importIds = Array.from(new Set([...(info.importIds || []), ...periodImportIds]));
      const batchButtons = importIds.map((id, idx) => `<button type="button" class="cycle-mini-action" ${importActionAttrs('delete-import', { importId: id })}>Remove batch ${idx + 1}</button>`).join('');
      return `<div class="cycle-source-row">
        <div class="cycle-source-main">
          <strong>${escapeHTML(sourceLabel(source))}</strong>
          <span>${info.periods || 0} periods / ${info.observations || 0} local observations${info.importedAt ? ` / ${escapeHTML(String(info.importedAt).slice(0, 10))}` : ''}</span>
          ${batchButtons ? `<div class="cycle-import-batches">${batchButtons}</div>` : ''}
        </div>
        ${source !== 'manual' ? `<button type="button" class="cycle-icon-btn cycle-delete-btn" ${importActionAttrs('delete-source', { source })} title="Remove ${escapeAttr(sourceLabel(source))}" aria-label="Remove ${escapeAttr(sourceLabel(source))} cycle data">x</button>` : ''}
      </div>`;
    }).join('');
  return `<section class="cycle-editor-section cycle-import-summary-section">
    <div class="cycle-editor-section-title">Import Coverage</div>
    <div class="cycle-import-coverage">
      <span>${coverage.periodCount || 0} observed periods</span>
      <span>${coverage.observationCount || 0} local daily observations</span>
      ${coverage.firstDate || coverage.lastDate ? `<span>${escapeHTML(coverage.firstDate || '?')} - ${escapeHTML(coverage.lastDate || '?')}</span>` : ''}
    </div>
    ${sourceRows ? `<div class="cycle-source-list">${sourceRows}</div>` : ''}
  </section>`;
}
