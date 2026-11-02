// Exact permitted date metadata and transient view commands; no storage or calculations of their own.
import { validComparisonDate, validateComparisonNavigation } from '../shared/comparison-view-contract.js';
import type { AppNavigationRequest } from '../shared/app-navigation-contract.js';
import type { AppNavigationReceipt } from './app-navigation-runtime.js';
import { state } from './state.js';
import { getActiveData } from './data.js';
import { createLabContextDisclosure } from './lab-context-disclosure.js';
import { getContextDisclosureFingerprint } from './lab-context-settings.js';
import { CONTEXT_SOURCE_IDS, isContextSourceEnabled } from './context-source-registry.js';
import { isActiveProfileDataOwner } from './profile.js';
import { nativeComparePair, selectNativeCompareDates } from './compare-date-selection.js';
interface Lease { profile: string; thread: string; root: typeof state.importedData; history: typeof state.chatHistory; signature: string; disclosure: string; dates: string[]; selected: ReturnType<typeof nativeComparePair>; used?: boolean }
const leases = new Map<string, Lease>();
function conflict(message: string): never { throw Object.assign(new Error(message), { noChangeApplied: true }); }
const ownerCurrent = (lease: Pick<Lease, 'profile' | 'thread' | 'root' | 'history'>) => state.currentProfile === lease.profile && state.currentThreadId === lease.thread && state.importedData === lease.root && state.chatHistory === lease.history && isActiveProfileDataOwner(lease.profile, lease.root);
function comparisonState() {
  if (!isContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS)) conflict('Lab comparison tools are disabled by this profile’s context permissions. Use the native Compare view; do not enable access automatically.');
  const native = getActiveData(), disclosure = createLabContextDisclosure(), visible = disclosure.project(native);
  const dates = new Set(disclosure.entries(state.importedData.entries || []).map(row => row.date));
  for (const category of Object.values(visible.categories)) if (!category.singlePoint) for (const marker of Object.values(category.markers)) {
    if (marker.singlePoint) continue;
    marker.values.forEach((value, index) => { if (value != null && Number.isFinite(value) && visible.dates[index]) dates.add(visible.dates[index]!); });
  }
  const permitted = native.dates.filter(date => validComparisonDate(date) && dates.has(date));
  const raw = { firstDate: state.compareDate1, secondDate: state.compareDate2 }, defaults = nativeComparePair(permitted);
  const selected = { firstDate: raw.firstDate && !permitted.includes(raw.firstDate) ? null : defaults.firstDate,
    secondDate: raw.secondDate && !permitted.includes(raw.secondDate) ? null : defaults.secondDate };
  const fingerprint = getContextDisclosureFingerprint();
  return { dates: permitted, selected, disclosure: fingerprint, signature: JSON.stringify({ dates: permitted, raw, disclosure: fingerprint }) };
}
export function readLabComparison(profile: string, options: { query?: string; offset?: number; limit?: number } = {}) {
  const origin = { profile, thread: state.currentThreadId || '', root: state.importedData, history: state.chatHistory };
  if (!origin.thread || !ownerCurrent(origin)) conflict('The originating comparison profile or chat changed.');
  const current = comparisonState(), query = (options.query || '').trim(), offset = options.offset ?? 0, limit = options.limit ?? 25;
  const dates = current.dates.filter(date => !query || date.includes(query));
  let snapshotId: string | null = null;
  if (current.dates.length >= 2) { snapshotId = crypto.randomUUID(); if (leases.size >= 100) leases.delete(leases.keys().next().value!); leases.set(snapshotId, { ...origin, ...current }); }
  return { action: 'labs.comparison', status: 'read_only', snapshotId, dates: dates.slice(offset, offset + limit), totalDates: dates.length, nextOffset: offset + limit < dates.length ? offset + limit : null,
    selected: current.selected, latestPair: current.dates.length >= 2 ? { firstDate: current.dates.at(-2), secondDate: current.dates.at(-1) } : null,
    canCompare: current.dates.length >= 2, swapAvailable: !!current.selected.firstDate && !!current.selected.secondDate,
    scope: 'current comparison session; dates with permitted recorded data only', dataSaved: false, settingsSaved: false,
    notice: 'Use getbased_navigate(view:compare,snapshotId,firstDate and/or secondDate) or swapDates:true. No review card is needed for this session-only view. Null selection means the current date cannot be disclosed; choose both permitted dates explicitly. Same-day separate specimens remain separate records; the existing native table compares its date-level projection, not individual samples. No values, source files or private notes are returned.' };
}
export async function openLabComparison(request: AppNavigationRequest, canOpen: () => boolean, isOwnerCurrent = canOpen): Promise<AppNavigationReceipt> {
  validateComparisonNavigation(request);
  const lease = request.snapshotId && leases.get(request.snapshotId);
  const rejected = (reason: string): AppNavigationReceipt => ({ changed: false, opened: null, reason, dataSaved: false, settingsSaved: false });
  const check = () => { try { return !!lease && !lease.used && canOpen() && ownerCurrent(lease) && comparisonState().signature === lease.signature; } catch { return false; } };
  if (!check() || !lease) return rejected('This comparison snapshot expired or its dates/selection changed. Read labs.comparison again.');
  const pair = request.swapDates ? { firstDate: lease.selected.secondDate, secondDate: lease.selected.firstDate }
    : { firstDate: request.firstDate ?? lease.selected.firstDate, secondDate: request.secondDate ?? lease.selected.secondDate };
  if (!pair.firstDate || !pair.secondDate || !lease.dates.includes(pair.firstDate) || !lease.dates.includes(pair.secondDate)) return rejected('Choose permitted dates for both sides. No comparison selection was changed.');
  await import('./compare-correlations.js');
  if (!check()) return rejected('The comparison profile, dates or editor changed while loading. Read a fresh snapshot.');
  lease.used = true;
  const committed = selectNativeCompareDates(getActiveData().dates, pair);
  if (!committed) return rejected('These recorded dates are no longer available. No comparison selection was changed.');
  let rendered = false;
  try { const view = await import('./data-view-controls.js'); if (isOwnerCurrent()) rendered = await view.navigateDataViewOutcomeRuntime('compare'); } catch { /* Session selection remains authoritative when rendering fails. */ }
  let completedCurrent = false;
  try { completedCurrent = isOwnerCurrent() && ownerCurrent(lease) && getContextDisclosureFingerprint() === lease.disclosure && comparisonState().signature === JSON.stringify({ dates: lease.dates, raw: { firstDate: pair.firstDate, secondDate: pair.secondDate }, disclosure: lease.disclosure }); } catch { /* Do not reveal dates from a retired disclosure context. */ }
  if (!completedCurrent) {
    return { changed: committed.changed, opened: null, dataSaved: false, settingsSaved: false, reason: 'The originating comparison context changed while opening. Check the native Compare view; no health data or settings were saved.' };
  }
  const opened = rendered && state.currentView === 'compare' && document.querySelector<HTMLSelectElement>('#compare-select-1')?.value === pair.firstDate && document.querySelector<HTMLSelectElement>('#compare-select-2')?.value === pair.secondDate;
  return { changed: committed.changed || opened, opened: opened ? 'compare' : null, firstDate: pair.firstDate, secondDate: pair.secondDate,
    dataSaved: false, settingsSaved: false, scope: 'current comparison session only', ...(!opened ? { reason: committed.changed ? 'The date selection changed, but the comparison table could not be confirmed. Open the native Compare view.' : 'The comparison view could not be confirmed. Try the native Compare view.' } : {}) };
}
