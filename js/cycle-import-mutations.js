// @ts-check
// Cycle import persistence and rollback, bound to the initiating profile.
import { state } from './state.js';
import { saveImportedData, saveImportedDataForProfile } from './data.js';
import { restoreImportedArray } from './data-merge.js';
import { getActiveProfileId, setProfileSex } from './profile.js';
import { getErrorMessage } from './caught-error.js';
import { recordContextCardChangeRuntime } from './context-cards-runtime.js';
import { renderCycleProfileButtonRuntime as renderCycleProfileButton } from './cycle-runtime.js';
import { buildCycleCoverage, normalizeCyclePeriods, upgradeMenstrualCycleProfile } from './cycle-summary.js';
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

function cloneJSON(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function snapshotCycleState() {
  return {
    data: state.importedData,
    menstrualCycle: cloneJSON(state.importedData.menstrualCycle),
    changeHistory: cloneJSON(state.importedData.changeHistory || []),
    deleted: cloneJSON(state.importedData._deleted || {}),
    profileSex: state.profileSex,
  };
}
function ownsCycleState(snapshot, profileId) {
  return getActiveProfileId() === profileId && state.importedData === snapshot.data;
}
function requireCycleOwner(snapshot, profileId) {
  if (!ownsCycleState(snapshot, profileId)) throw new Error('Profile changed during cycle operation. Retry in the original profile.');
}
async function restoreCycleState(snapshot, profileId, { restoreSex = false } = {}) {
  snapshot.data.menstrualCycle = snapshot.menstrualCycle;
  restoreImportedArray(snapshot.data, 'changeHistory', snapshot.changeHistory);
  snapshot.data._deleted = snapshot.deleted;
  if (restoreSex) {
    if (!await setProfileSex(profileId, snapshot.profileSex || null)) {
      throw new Error('The profile no longer exists, so its previous sex could not be restored.');
    }
    if (ownsCycleState(snapshot, profileId)) {
      state.profileSex = snapshot.profileSex;
      renderCycleProfileButton();
    }
  }
}
async function persistCycleState() {
  if (!await saveImportedData()) throw new Error('Cycle data could not be saved. No changes were kept.');
}

async function restorePersistedCycleState(snapshot, profileId, options = {}) {
  const baseData = cloneJSON(snapshot.data);
  await restoreCycleState(snapshot, profileId, options);
  if (!await saveImportedDataForProfile(profileId, snapshot.data, { baseData, forceProfileScope: true })) throw new Error('The previous cycle state could not be restored. Reload before making more changes.');
}


let pendingMutation = Promise.resolve();
function queueMutation(operation) {
  const owner = { data: state.importedData };
  const profileId = getActiveProfileId();
  const result = pendingMutation.then(() => {
    requireCycleOwner(owner, profileId);
    return operation();
  });
  pendingMutation = result.then(() => {}, () => {});
  return result;
}
export function commitCycleImport(parsed, options = {}) {
  return queueMutation(() => commitImport(parsed, options));
}
export function deleteCycleImportFromProfile(importId) {
  return queueMutation(() => deleteImport(importId));
}
export function deleteCycleSourceFromProfile(source) {
  return queueMutation(() => deleteSource(source));
}
export function clearCycleProfileData() {
  return queueMutation(() => clearProfile());
}

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
  else rawRows = await getAllCycleObservationsRaw(profileId);
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

async function commitImport(parsed, { conflictMode = 'keep-existing', allowProfileSexChange = false } = {}) {
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
  const priorRows = (await getAllCycleObservationsRaw(profileId))
    .filter(row => row.importId === parsed.importId);
  const priorMeta = await getCycleImportMetaRaw(profileId, parsed.importId);
  requireCycleOwner(snapshot, profileId);
  let sexChanged = false;
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
    requireCycleOwner(snapshot, profileId);
    if (state.profileSex !== 'female') {
      if (!await setProfileSex(profileId, 'female')) {
        throw new Error('The active profile no longer exists.');
      }
      sexChanged = true;
      requireCycleOwner(snapshot, profileId);
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
    const next = await applyRawObservationCounts(base, profileId, parsed.source);
    requireCycleOwner(snapshot, profileId);
    state.importedData.menstrualCycle = next;
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
    await restoreCycleState(snapshot, profileId, { restoreSex: sexChanged });
    throw error;
  }
}

async function deleteImport(importId) {
  if (!importId) return false;
  const profileId = getActiveProfileId();
  const snapshot = snapshotCycleState();
  const mc = snapshot.data.menstrualCycle;
  const rawRows = await getAllCycleObservationsRaw(profileId);
  const rawMeta = await getCycleImportMetaRaw(profileId, importId);
  const meta = await getCycleImportMeta(profileId, importId);
  requireCycleOwner(snapshot, profileId);
  const removed = (mc?.periods || []).filter(period => period.importId === importId);
  if (!rawMeta && !meta && removed.length === 0 && !rawRows.some(row => row.importId === importId)) return false;
  if (!mc) { await clearCycleImport(profileId, importId); return true; }
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
  const updated = await applyRawObservationCounts(next, profileId, source, remainingRows);
  requireCycleOwner(snapshot, profileId);
  state.importedData.menstrualCycle = updated;
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

async function deleteSource(source) {
  if (!source) return false;
  const profileId = getActiveProfileId();
  const mc = state.importedData.menstrualCycle;
  if (!mc) { await clearCycleSource(profileId, source); return true; }
  const snapshot = snapshotCycleState();
  const rawRows = await getAllCycleObservationsRaw(profileId);
  requireCycleOwner(snapshot, profileId);
  const next = { ...mc, periods: (mc.periods || []).filter(period => period.source !== source) };
  const updated = await applyRawObservationCounts(next, profileId, source, rawRows.filter(row => row.source !== source));
  requireCycleOwner(snapshot, profileId);
  state.importedData.menstrualCycle = updated;
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

async function clearProfile() {
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

