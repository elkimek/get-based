import type { ProfileData } from '../types/app-state.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import type { ProfileSaveOptions } from './data-core-types.js';
import type { MarkerRangeRecord, MarkerRangeSnapshot, MarkerRangeValue } from './marker-range-commands.js';
import { parseAgentDataPatch } from '../shared/agent-data-contract.js';
import { markerRangeAddress, parseMarkerRangeSnapshot, projectMarkerRange } from './marker-range-commands.js';
import { applyBaseMarkerRanges, validateMarkerRange, writeMarkerRangeOverride, restoreMarkerRangeOverride } from './marker-range-core.js';
import type { RangeFields } from './marker-range-core.js';
import { labToolRegistry, labToolMarker } from './lab-tool-markers.js';
import { MARKER_SCHEMA, OPTIMAL_RANGES } from './schema.js';
import { getMarkerInputUnits } from './unit-profiles.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
import { readCurrentProfileMeta, getProfileSex } from './profile.js';
import { saveImportedDataForProfile, notifyProfileDataContextChanged } from './data.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import { state } from './state.js';

const fail = (message: string): never => { throw Object.assign(new Error(message), { noChangeApplied: true }); };
const rangeSource = (value: unknown) => value === 'manual' || value === 'import' ? value : 'custom';
function overrides(data: ProfileData) {
  if (data.refOverrides != null && (typeof data.refOverrides !== 'object' || Array.isArray(data.refOverrides))) throw new Error('Review the saved ranges in their native editor.');
  return data.refOverrides || {};
}
function row(data: ProfileData, id: string, sex: unknown, categories = labToolRegistry(data)): MarkerRangeRecord {
  const { markerKey, kind } = markerRangeAddress(id), target = labToolMarker(data, markerKey, categories), all = overrides(data), raw = all[markerKey];
  if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) throw new Error('Review this saved range in its native editor.');
  const override = (raw || {}) as Record<string, unknown>, prefix = kind === 'reference' ? 'ref' : 'optimal', lab = kind === 'reference' ? 'labRef' : 'labOptimal';
  for (const key of [`${prefix}Min`, `${prefix}Max`, `${lab}Min`, `${lab}Max`]) if (Object.hasOwn(override, key) && override[key] !== null && !(typeof override[key] === 'number' && Number.isFinite(override[key]))) throw new Error('Review the invalid saved range before editing.');
  const projected = (saved: Record<string, unknown>) => {
    const value: typeof target.value & RangeFields = { ...target.value }, selected = { [target.categoryKey]: { markers: { [markerKey.split('.')[1]!]: value } } };
    applyBaseMarkerRanges(selected, sex, OPTIMAL_RANGES[markerKey] ? { [markerKey]: OPTIMAL_RANGES[markerKey]! } : {}, { [markerKey]: saved });
    return value;
  };
  const value = projected(override), hasOverride = Object.hasOwn(override, `${prefix}Min`) || Object.hasOwn(override, `${prefix}Max`);
  const min = value[`${prefix}Min`] ?? null, max = value[`${prefix}Max`] ?? null; validateMarkerRange(min, max);
  const defaultSource = Object.hasOwn(MARKER_SCHEMA[target.categoryKey]?.markers || {}, markerKey.split('.')[1]!) ? 'builtin' : 'custom marker';
  const source = hasOverride ? rangeSource(override[`${prefix}Source`]) : defaultSource;
  const restoredOverride = { ...override }; restoreMarkerRangeOverride(restoredOverride, kind);
  const restored = projected(restoredOverride);
  const restore: MarkerRangeValue = { min: restored[`${prefix}Min`] ?? null, max: restored[`${prefix}Max`] ?? null,
    source: `${prefix}Min` in restoredOverride || `${prefix}Max` in restoredOverride ? rangeSource(restoredOverride[`${prefix}Source`]) : defaultSource };
  validateMarkerRange(restore.min, restore.max);
  return { id, markerKey, markerName: target.name, category: String(target.category.label || target.categoryKey), kind,
    min, max, source, unit: String(value.unit || ''), inputUnits: value.unit && target.usesStandardUnit ? getMarkerInputUnits(markerKey, 'EU', String(value.unit)) : [String(value.unit || '')],
    hasOverride, hasSavedOriginal: `${lab}Min` in override || `${lab}Max` in override, canRevert: source === 'manual', restore };
}
async function snapshot(data: ProfileData, id: string, sex: unknown): Promise<MarkerRangeSnapshot> {
  const record = row(data, id, sex), { markerKey } = record;
  const defaultData = { ...data, refOverrides: {} };
  const defaults = row(defaultData, id, sex), selected = { record, sex, override: overrides(data)[markerKey] ?? null, definition: data.customMarkers?.[markerKey] ?? null };
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(selected)));
  labToolMarker(data, markerKey);
  return { version: 1, record, defaults: { min: defaults.min, max: defaults.max, source: defaults.source }, revision: [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('') };
}
export function canDiscloseMarkerRange(data: ProfileData, id: string, categories?: ReturnType<typeof labToolRegistry>) { try { labToolMarker(data, markerRangeAddress(id).markerKey, categories); return true; } catch { return false; } }
export async function readCurrentMarkerRange(profileId: string, id: string) {
  const [data, meta] = await Promise.all([readAgentProfileRecords(profileId), readCurrentProfileMeta(profileId)]);
  return snapshot(data, id, meta?.sex);
}
export async function listCurrentMarkerRanges(profileId: string) {
  const [data, meta] = await Promise.all([readAgentProfileRecords(profileId), readCurrentProfileMeta(profileId)]), categories = labToolRegistry(data), rows: MarkerRangeRecord[] = [];
  for (const [category, value] of Object.entries(categories)) for (const key of Object.keys(value.markers)) for (const kind of ['reference', 'optimal']) {
    const id = `${kind}.${category}.${key}`; if (!canDiscloseMarkerRange(data, id, categories)) continue;
    try { rows.push(row(data, id, meta?.sex, categories)); } catch { /* Invalid native records are not disclosed as editable values. */ }
  }
  return rows;
}
export async function commitReviewedMarkerRange(profileId: string, proposal: AgentDataProposal, authorized: () => boolean) {
  const expected = parseMarkerRangeSnapshot(JSON.parse(proposal.baseline)), patch = parseAgentDataPatch(proposal.patch), { before, after } = projectMarkerRange(proposal, patch);
  const [base, meta] = await Promise.all([readAgentProfileRecords(profileId), readCurrentProfileMeta(profileId)]);
  const { markerKey, kind } = markerRangeAddress(proposal.recordId), { categoryKey } = labToolMarker(base, markerKey);
  const allowed = () => authorized() && canDiscloseMarkerRange(base, proposal.recordId) && getProfileSex(profileId) === (meta?.sex || null)
    && !(typeof document !== 'undefined' && document.querySelector('.ref-edit-form'))
    && (state.currentProfile !== profileId || profileDataValuesEqual(state.importedData.refOverrides?.[markerKey] ?? null, overrides(base)[markerKey] ?? null));
  if (!allowed()) fail('This range review is no longer authorized, or a native range edit is pending. Your data is kept.');
  if (!profileDataValuesEqual(expected, await snapshot(base, proposal.recordId, meta?.sex))) fail('The marker, units, range or profile changed. Read it again. Nothing was applied.');
  const next = structuredClone(base); next.refOverrides ||= {}; const override = { ...(next.refOverrides[markerKey] || {}) };
  if (proposal.operation === 'revert') restoreMarkerRangeOverride(override, kind);
  else writeMarkerRangeOverride(override, kind, after, before);
  if (Object.keys(override).length) next.refOverrides[markerKey] = override; else delete next.refOverrides[markerKey];
  if (!profileDataValuesEqual(row(next, proposal.recordId, meta?.sex), after)) fail('The native range projection changed. Read it again.');
  let conflict = false, revoked = false;
  const options: ProfileSaveOptions = { baseData: base, forceProfileScope: true,
    expectedProfileMapEntries: [{ key: 'refOverrides', id: markerKey, value: overrides(base)[markerKey] ?? null }, { key: 'markerLabels', id: markerKey, value: base.markerLabels?.[markerKey] ?? null }, { key: 'categoryLabels', id: categoryKey, value: base.categoryLabels?.[categoryKey] ?? null }],
    expectedContextField: { key: 'customMarkers', value: base.customMarkers ?? null }, onContextFieldConflict: () => { conflict = true; }, canCommit: () => { revoked ||= !allowed(); return !revoked; } };
  if (!await saveImportedDataForProfile(profileId, next, options)) {
    if (conflict || revoked) fail('This range or its editing context changed before saving. Nothing was applied.');
    throw new Error('The marker range could not be saved. Check its native editor before retrying.');
  }
  try { notifyProfileDataContextChanged(profileId); } catch { /* The selected range is already durable. */ }
  return `${kind === 'reference' ? 'Reference' : 'Optimal'} range ${proposal.operation === 'revert' ? 'restored' : 'updated'}.`;
}
