// A report belongs to one collection; its date alone cannot select a sibling.
import type { LabEntry } from '../types/lab-data.js';
import type { PendingImport } from './pdf-import-review-runtime.js';
import { identifyLabPanels, labPanelId, labPanelJSON } from './lab-panel-identity.js';
import { createLabEntry } from './lab-entry.js';
import { clearTombstone } from './data-merge.js';
import { createUniqueId } from './unique-id.js';
import { filterRemovedLabDates, filterRemovedLabPanels, labDateDeletionState } from './lab-panel-deletions.js';

interface Report { id?: string | undefined; panelId?: string | undefined; date?: string | null | undefined }
interface Data { entries?: LabEntry[] | null; [key: string]: unknown }
export interface ImportSampleChoice { value: string; label: string }
interface ReviewOwner { profileId: string; sourceId: string | null; date: string; choice: string; rows: string; source?: string; sample?: string; missing?: boolean }
const reviews = new WeakMap<PendingImport, ReviewOwner>();
// Sparse profiles can have no persisted lab collection yet. Reads must not
// initialize it, and an unknown container must never be silently overwritten.
function sampleRows(data: Data): LabEntry[] {
  if (data.entries == null) return [];
  if (!Array.isArray(data.entries)) throw new Error('Saved lab samples are not a list. Review this profile before importing.');
  return data.entries;
}
function appendSample(data: Data, entry: LabEntry) {
  const rows = sampleRows(data);
  if (data.entries == null) data.entries = rows;
  rows.push(entry);
}

function activeRows(data: Data) {
  const identified = identifyLabPanels(sampleRows(data));
  if (identified.length !== sampleRows(data).length) throw new Error('Reload the profile to expand its saved sample collections.');
  const active = filterRemovedLabDates(filterRemovedLabPanels(identified, data.labPanelTombstones), data);
  const ids = new Set(active.map(labPanelId));
  return sampleRows(data).filter((_entry, index) => ids.has(labPanelId(identified[index]!)));
}

function referencesReport(entry: LabEntry, id: string) {
  return Object.values(entry.markerSources || {}).some(source => source?.snapshotId === id)
    || Object.values(entry.manualOriginals || {}).some(original => original?.source?.snapshotId === id)
    || Object.values(entry.collectionContextSources || {}).includes(id)
    || Object.values(entry.collectionOriginals || {}).some(original => original?.sourceSnapshotId === id);
}
export function selectLabReportSample(data: Data, report: Report, requireUnambiguous = true): LabEntry | null {
  const identified = identifyLabPanels(sampleRows(data)), active = activeRows(data), linked = active.filter(entry => report.id && referencesReport(entry, report.id));
  const named = report.panelId ? active.filter(entry => labPanelId(identified[sampleRows(data).indexOf(entry)]!) === report.panelId) : [];
  if (linked.length > 1 || named.length > 1 || named.length === 1 && linked.some(entry => entry !== named[0])) throw new Error('This report has conflicting sample links. Review its source records before changing it.');
  if (named.length) return named[0]!;
  if (linked.length) {
    if (report.panelId) throw new Error('This report\'s saved sample no longer matches its source links.');
    return linked[0]!;
  }
  if (report.panelId) return null;
  const sameDate = active.filter(entry => entry.date === report.date);
  if (sameDate.length > 1 && requireUnambiguous) throw new Error('This older report has no unambiguous sample link. Choose its collection before changing it.');
  return sameDate.length === 1 ? sameDate[0]! : null;
}
export function reportBelongsToLabSample(data: Data, report: Report, entry: LabEntry) {
  return selectLabReportSample(data, report, false) === entry;
}
function rowsForDate(data: Data, date: string) { return labPanelJSON(sampleRows(data).filter(entry => entry.date === date)); }
export function bindImportReportReview(result: PendingImport, data: Data, profileId: string, report: Report) {
  const entry = selectLabReportSample(data, report);
  if (!report.id || !entry && (report.panelId || sampleRows(data).some(row => row.date === report.date))) throw new Error('This report\'s collection is no longer available.');
  const index = entry ? sampleRows(data).indexOf(entry) : -1, choice = entry ? labPanelId(identifyLabPanels(sampleRows(data))[index]!) : 'new';
  reviews.set(result, { profileId, sourceId: report.id, date: String(result.date || ''), choice, rows: rowsForDate(data, String(result.date || '')), source: labPanelJSON(report), ...(entry ? { sample: labPanelJSON(entry) } : {}), missing: !entry });
}
export function importReviewSourceId(result: PendingImport): string | null { return reviews.get(result)?.sourceId || null; }
export function importReviewSampleOptions(result: PendingImport, data: Data, profileId: string) {
  const date = String(result.date || ''); let owner = reviews.get(result);
  if (!owner) {
    // Extracted JSON and session drafts cannot grant an internal re-review target.
    if (result._reReviewSnapshotId) throw new Error('Reopen this saved import from Settings to verify its current sample before updating it.');
    owner = { profileId, sourceId: null, date, choice: '', rows: rowsForDate(data, date) }; reviews.set(result, owner);
  }
  if (owner.profileId !== profileId) throw new Error('The import review belongs to another profile.');
  if (owner.date !== date) {
    owner.date = date; owner.rows = rowsForDate(data, date);
    // A re-review retains its exact source sample when moving its collection date.
    if (!owner.sourceId) owner.choice = '';
  }
  const active = new Set(activeRows(data)), panels = identifyLabPanels(sampleRows(data)).filter((entry, index) => entry.date === date && active.has(sampleRows(data)[index]!));
  const options: ImportSampleChoice[] = panels.map((entry, index) => ({ value: labPanelId(entry),
    label: `Sample ${index + 1}${entry.specimen ? ` · ${entry.specimen}` : ''}${entry.context?.sampleTime ? ` · ${entry.context.sampleTime}` : ''} · ${Object.keys(entry.markers || {}).length} results` }));
  return { options, value: owner.choice, locked: !!owner.sourceId, required: panels.length > 0 && !owner.sourceId };
}
export function chooseImportSample(result: PendingImport, data: Data, profileId: string, choice: string) {
  const view = importReviewSampleOptions(result, data, profileId), owner = reviews.get(result)!;
  if (view.locked || choice !== 'new' && !view.options.some(option => option.value === choice)) throw new Error('Choose a current sample or a separate new collection.');
  owner.choice = choice; owner.rows = rowsForDate(data, owner.date);
}
export function resolveImportSample(result: PendingImport, data: Data, profileId: string, report: Report | undefined, now: number): LabEntry {
  const view = importReviewSampleOptions(result, data, profileId);
  const owner = reviews.get(result)!, date = owner.date;
  const deletion = labDateDeletionState(data, date);
  if (deletion.deleted && !(typeof deletion.clearedAt === 'number' && deletion.clearedAt > (typeof deletion.deletedAt === 'number' ? deletion.deletedAt : 0))) throw new Error('Restore this removed collection date before importing into it.');
  if (owner.rows !== rowsForDate(data, date)) throw new Error('The samples on this date changed during review. Reopen the review before importing.');
  if (owner.sourceId) {
    if (!report || report.id !== owner.sourceId || labPanelJSON(report) !== owner.source) throw new Error('The saved report changed during review.');
    let entry = selectLabReportSample(data, report);
    if (entry && owner.sample !== labPanelJSON(entry)) throw new Error('The report\'s sample changed during review. Reopen its current data before importing.');
    if (!entry) {
      if (!owner.missing || report.panelId || sampleRows(data).some(row => row.date === date)) throw new Error('The report\'s sample was removed during review.');
      entry = createLabEntry(date, { now }) as LabEntry; entry.panelId = createUniqueId('sample_'); appendSample(data, entry);
    }
    if (entry.date !== date && sampleRows(data).some(row => row !== entry && row.date === date)) throw new Error('That date already contains another collection. Ask chat to propose moving this sample first, then review and apply the change.');
    return entry;
  }
  if (owner.choice && owner.choice !== 'new') {
    if (!view.options.some(option => option.value === owner.choice)) throw new Error('The selected sample is no longer available.');
    const index = identifyLabPanels(sampleRows(data)).findIndex(entry => entry.date === date && labPanelId(entry) === owner.choice);
    if (index < 0) throw new Error('The selected sample is no longer available.');
    const entry = sampleRows(data)[index]!; entry.panelId = owner.choice; return entry;
  }
  if (sampleRows(data).some(entry => entry.date === date) && owner.choice !== 'new') throw new Error('Choose which sample this report belongs to, or choose a separate new collection.');
  const entry = createLabEntry(date, { now }) as LabEntry; entry.panelId = createUniqueId('sample_');
  appendSample(data, entry); clearTombstone(data, 'entries', date); return entry;
}
