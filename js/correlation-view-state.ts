// Disclosure-filtered choice metadata and native workspace resolution. No writes or rendering.
import { state } from './state.js';
import { getActiveData } from './data.js';
import { createLabContextDisclosure } from './lab-context-disclosure.js';
import { getContextDisclosureFingerprint } from './lab-context-settings.js';
import { isContextSourceEnabled } from './context-source-registry.js';
import { CORRELATION_PRESETS } from './schema.js';
import { getSupplementRecordId } from './supplement-medication-domain.js';
import { prepareCorrelationSelection, prepareTherapyHistory } from './therapy-correlations.js';
import { currentCorrelationWorkspace } from './correlation-workspace-store.js';
import type { NativeCorrelationWorkspace } from './correlation-workspace-store.js';
import type { CorrelationWorkspacePatch } from '../shared/correlation-view-contract.js';
import { correlationTimelineBounds } from './correlation-timeline-bounds.js';
export function correlationConflict(message: string): never { throw Object.assign(new Error(message), { noChangeApplied: true }); }
export function inspectCorrelationChoices() {
  if (!isContextSourceEnabled('lab-markers')) correlationConflict('Lab correlation tools require enabled lab context. Use the native view; do not enable access automatically.');
  const disclosure = createLabContextDisclosure(), data = disclosure.project(getActiveData());
  const markers = Object.entries(data.categories).flatMap(([categoryId, category]) => Object.entries(category.markers).flatMap(([markerId, marker]) => {
    if (marker.singlePoint || !marker.values.some(value => typeof value === 'number' && Number.isFinite(value))) return [];
    return [{ id: `${categoryId}.${markerId}`, name: String(marker.name || markerId).slice(0, 256), category: String(category.label || categoryId).slice(0, 256), kind: 'marker' as const }];
  }));
  const records = isContextSourceEnabled('supplements-meds') ? state.importedData.supplements || [] : [];
  const therapies = records.flatMap(record => {
    const id = getSupplementRecordId(record); if (!id || records.filter(row => getSupplementRecordId(row) === id).length !== 1) return [];
    return [{ id, name: String(record.name || 'Unnamed item').slice(0, 256), kind: 'therapy' as const, type: record.type === 'medication' ? 'medication' : 'supplement', ingredients: prepareTherapyHistory(record).ingredientOptions }];
  });
  const presets = CORRELATION_PRESETS.map((preset, index) => ({ id: `native:${index}`, label: preset.label, markers: preset.markers.filter(id => markers.some(marker => marker.id === id)) }));
  const imported = { ...state.importedData, entries: disclosure.entries(state.importedData.entries || []), supplements: records };
  const workspace = currentCorrelationWorkspace(), selectedAllowed = workspace.markers.every(id => markers.some(marker => marker.id === id)) && workspace.therapies.every(id => therapies.some(therapy => therapy.id === id));
  const prepare = (value: NativeCorrelationWorkspace) => prepareCorrelationSelection(data, imported, value.markers, value.therapies, 0, value.view);
  const selection = selectedAllowed ? prepare(workspace) : null;
  const fingerprint = getContextDisclosureFingerprint();
  return { markers, therapies, presets, workspace, selectedAllowed, selection, prepare,
    disclosure: fingerprint, signature: JSON.stringify({ data, records, disclosure: fingerprint }) };
}
export function resolveCorrelationWorkspace(choices: ReturnType<typeof inspectCorrelationChoices>, patch: CorrelationWorkspacePatch): NativeCorrelationWorkspace {
  if (!choices.selectedAllowed) correlationConflict('This native workspace cannot be safely controlled from the current chat. Open Correlations manually.');
  const before = choices.workspace, therapies = patch.therapies ?? before.therapies;
  let markers = patch.markers ?? before.markers;
  if (patch.preset) {
    const preset = choices.presets.find(row => row.id === patch.preset);
    if (!preset?.markers.length || therapies.length >= 8) correlationConflict('This preset has no selectable markers with the current permissions and item limit.');
    markers = preset.markers.slice(0, 8 - therapies.length);
  }
  if (markers.length + therapies.length > 8 || markers.some(id => !choices.markers.some(row => row.id === id)) || therapies.some(id => !choices.therapies.some(row => row.id === id))) correlationConflict('Choose up to8 exact permitted markers and treatments.');
  const view = { ...before.view }, selected = [...markers, ...therapies];
  // Match native selection behavior: newly selected items become visible; removed series lose view metadata.
  view.hidden = (view.hidden || []).filter(id => selected.includes(id) && (before.markers.includes(id) || before.therapies.includes(id)));
  view.ingredients = Object.fromEntries(Object.entries(view.ingredients || {}).filter(([id]) => therapies.includes(id)));
  if (patch.preset) { view.pair = '0'; delete view.pairKey; view.hidden = view.hidden.filter(id => !markers.includes(id)); }
  if (patch.view) {
    const { inspectDate, ...rest } = patch.view; Object.assign(view, rest);
    if (patch.view.rangePreset && patch.view.rangePreset !== 'custom') { delete view.start; delete view.end; }
    if (Object.hasOwn(patch.view, 'inspectDate')) { if (inspectDate === null) delete view.inspectDate; else view.inspectDate = inspectDate!; }
  }
  if (view.rangePreset === 'custom' && (!view.start || !view.end || view.start > view.end)) correlationConflict('Choose both custom range boundaries before opening the workspace.');
  if (view.hidden?.some(id => !selected.includes(id))) correlationConflict('Only selected series can be hidden.');
  if (Object.entries(view.ingredients || {}).some(([id, ingredient]) => !therapies.includes(id) || !choices.therapies.find(row => row.id === id)?.ingredients.includes(ingredient))) correlationConflict('Use a returned ingredient name for a selected treatment.');
  const next = { markers: [...markers], therapies: [...therapies], view }, selection = choices.prepare(next);
  if (patch.view?.pairKey && !selection.pairs.some(pair => pair.pairKey === patch.view!.pairKey)) correlationConflict('Choose an exact pairKey after selecting its items.');
  if (selection.activePairKey) view.pairKey = selection.activePairKey; else delete view.pairKey;
  const bounds = correlationTimelineBounds(selection);
  if (view.inspectDate && (view.inspectDate < bounds.firstDate || view.inspectDate > bounds.lastDate)) correlationConflict('Choose an inspector date within the native timeline bounds, or unpin it.');
  return next;
}
