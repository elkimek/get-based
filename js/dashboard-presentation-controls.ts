// Provider-neutral chat commands share the native Dashboard write boundary, never clinical storage.
import { state } from './state.js';
import { isActiveProfileDataOwner } from './profile.js';
import { getContextDisclosureFingerprint } from './lab-context-settings.js';
import { prepareNativeDashboardControl, isNativeDashboardControlCurrent } from './dashboard-control-runtime.js';
import type { DashboardControlPorts } from './dashboard-control-runtime.js';
import { captureDashboardControlState } from './dashboard-control-state.js';
import { projectDashboardPresentation, planDashboardPresentation } from './dashboard-presentation-model.js';
import { readDashboardPreferenceFootprint, writeDashboardPreferenceRaw, runDashboardPreferenceCommand } from './dashboard-preference-store.js';
import type { DashboardPreferenceFootprint, DashboardPreferenceKind } from './dashboard-preference-store.js';
import { parseDashboardPresentationPatch, validateDashboardNavigation } from '../shared/dashboard-control-contract.js';
import type { AppNavigationRequest } from '../shared/app-navigation-contract.js';
import type { AppNavigationReceipt } from './app-navigation-runtime.js';
interface Owner { profile: string; thread: string; root: typeof state.importedData; history: typeof state.chatHistory }
interface Lease extends Owner { ports: DashboardControlPorts; state: ReturnType<typeof captureDashboardControlState>; disclosure: string; used?: boolean }
interface Undo extends Owner { ports: DashboardControlPorts; before: DashboardPreferenceFootprint; after: DashboardPreferenceFootprint; fields: DashboardPreferenceKind[]; disclosure: string; eligibility: string; used?: boolean }
const leases = new Map<string, Lease>(), undos = new Map<string, Undo>();
const owned = (owner: Owner) => state.currentProfile === owner.profile && state.currentThreadId === owner.thread && state.importedData === owner.root && state.chatHistory === owner.history && isActiveProfileDataOwner(owner.profile, owner.root);
function add<T>(map: Map<string, T>, value: T) { const id = crypto.randomUUID(); if (map.size >= 100) map.delete(map.keys().next().value!); map.set(id, value); return id; }
export async function readDashboardPresentation(profile: string, options: { query?: string; offset?: number; limit?: number } = {}) {
  const origin = { profile, thread: state.currentThreadId || '', root: state.importedData, history: state.chatHistory };
  const current = () => !!origin.thread && owned(origin);
  if (!current()) throw new Error('The originating dashboard profile or chat changed.');
  const ports = await prepareNativeDashboardControl(current);
  if (!ports || !current() || !isNativeDashboardControlCurrent(ports)) return { action: 'dashboard.presentation', available: false, nativeHandoff: 'Open Dashboard and Customize. No setting or health record was changed.' };
  const captured = captureDashboardControlState(ports, profile), disclosure = getContextDisclosureFingerprint();
  if (!current() || !isNativeDashboardControlCurrent(ports)) throw new Error('The originating dashboard profile or native owner changed.');
  const snapshotId = add(leases, { ...origin, ports, state: captured, disclosure });
  const undoChoices = [...undos].filter(([, proof]) => !proof.used && owned(proof) && proof.ports === ports && proof.disclosure === disclosure && proof.eligibility === captured.eligibility && proof.fields.every(field => captured.model.raw[field] === proof.after[field])).map(([id]) => ({ id, view: 'dashboard' }));
  return { action: 'dashboard.presentation', status: 'read_only', snapshotId, ...projectDashboardPresentation(captured.model, options), undoChoices,
    scope: 'active profile; desktop Dashboard widget layout, biometric tile choices and Quick Marker pins', settingsSaved: false, dataSaved: false,
    dashboardFields: { show: 'fixed widget IDs', hide: 'fixed widget IDs', order: 'prefix of exact widgetOrder IDs; other order is preserved', markerWidgets: { add: 'markerOptions.choices IDs', remove: 'current markerWidgets IDs' }, biometrics: { add: 'biometrics.choices IDs', remove: 'biometrics.selected IDs', order: 'selected IDs in desired prefix order' }, pins: { add: 'markerOptions.choices IDs', remove: 'pins.selected IDs', order: 'selected IDs in desired prefix order' }, resetLayout: 'true, standalone; requires available.resetLayout; resets widget and biometric layout, preserving pins' },
    notice: 'Only an explicit presentation request authorizes getbased_navigate(view:dashboard,snapshotId,dashboard:JSON). Only stated preferences change, without an Apply card. Unmentioned order and selections survive. No measurements, dates, sources or notes are returned. Disabled sources stay disabled; unavailable fields require native Customize. Empty widgets may remain absent until they have content. Adding a fifth pin requires an explicit removal; no existing pin is evicted. Saved settings and a confirmed open view are separate outcomes. Undo needs a fresh read and its current undoId instead of dashboard JSON; it restores only saved fields and expires on reload, changed effects or retired context. Finish dialogs and clinical drafts first. No health records are saved.' };
}
export async function openDashboardPresentation(request: AppNavigationRequest & { dashboard?: string }, canOpen: () => boolean, isOwnerCurrent = canOpen): Promise<AppNavigationReceipt> {
  validateDashboardNavigation(request);
  const lease = request.snapshotId && leases.get(request.snapshotId);
  const rejected = (reason: string): AppNavigationReceipt => ({ changed: false, opened: null, settingsSaved: false, dataSaved: false, reason });
  const ready = () => { try { return !!lease && !lease.used && canOpen() && owned(lease) && isNativeDashboardControlCurrent(lease.ports) && getContextDisclosureFingerprint() === lease.disclosure; } catch { return false; } };
  if (!lease || !ready()) return rejected('This Dashboard snapshot expired. Read dashboard.presentation again.');
  const proof = request.undoId ? undos.get(request.undoId) : undefined;
  if (request.undoId && (!proof || proof.used || !owned(proof) || proof.ports !== lease.ports || proof.disclosure !== lease.disclosure || proof.eligibility !== lease.state.eligibility)) return rejected('This Dashboard Undo expired.');
  let writes: Partial<DashboardPreferenceFootprint>;
  try {
    if (await prepareNativeDashboardControl(ready) !== lease.ports || !ready()) return rejected('The native Dashboard owner changed. Read again.');
    if (captureDashboardControlState(lease.ports, lease.profile).eligibility !== lease.state.eligibility) return rejected('The permitted Dashboard choices changed. Read again.');
    writes = proof ? Object.fromEntries(proof.fields.map(field => [field, proof.before[field]])) : planDashboardPresentation(lease.state.model, parseDashboardPresentationPatch(request.dashboard!));
  } catch (error) { return rejected(error instanceof Error && error.message.startsWith('dashboard must') ? error.message : 'Dashboard choices could not be confirmed. Use native Customize.'); }
  if (!ready()) return rejected('The Dashboard context or editor changed before saving.');
  lease.used = true; if (proof) proof.used = true;
  const current = () => { try { return isOwnerCurrent() && owned(lease) && isNativeDashboardControlCurrent(lease.ports) && getContextDisclosureFingerprint() === lease.disclosure; } catch { return false; } };
  let result: Awaited<ReturnType<typeof runDashboardPreferenceCommand>>;
  try {
    result = await runDashboardPreferenceCommand(() => {
      if (captureDashboardControlState(lease.ports, lease.profile).eligibility !== lease.state.eligibility) throw new Error('The permitted Dashboard choices changed before saving.');
      for (const field of Object.keys(writes) as DashboardPreferenceKind[]) writeDashboardPreferenceRaw(field, writes[field]!, lease.profile);
    }, { profileId: lease.profile, expected: proof ? proof.after : lease.state.model.raw, requireLocks: true, canCommit: () => canOpen() && owned(lease) && isNativeDashboardControlCurrent(lease.ports) && getContextDisclosureFingerprint() === lease.disclosure });
  } catch (error) { const message = error instanceof Error && /^(The originating dashboard|The dashboard|These dashboard|Dashboard preference|Safe chat dashboard|The permitted Dashboard)/.test(error.message) ? error.message : 'Dashboard preferences could not be confirmed.'; return { ...rejected(message), ...((error as { persistenceUncertain?: boolean })?.persistenceUncertain ? { persistenceUncertain: true } : {}) }; }
  const saved = result.settingsSaved;
  let opened = false;
  try {
    if (current() && canOpen()) { const runtime = await import('./data-view-controls.js'); if (current() && canOpen()) opened = await runtime.navigateDataViewOutcomeRuntime('dashboard') && current() && state.currentView === 'dashboard' && !!document.querySelector('#main-content .dashboard-widgets,#main-content .m-shell,#main-content .welcome-hero'); }
  } catch { /* Keep the confirmed persistence receipt when optional native rendering fails. */ }
  if (!current()) return { changed: saved, opened: null, settingsSaved: saved, dataSaved: false, reason: 'The Dashboard preference operation completed before its originating view changed. Check Customize; no health records were saved.' };
  let latest: DashboardPreferenceFootprint | null = null; try { latest = readDashboardPreferenceFootprint(lease.profile); } catch { /* Optional Undo proof cannot erase an acknowledged save. */ }
  const undoId = !proof && saved && latest && result.changed.every(field => latest![field] === result.after[field]) ? add(undos, { profile: lease.profile, thread: lease.thread, root: lease.root, history: lease.history, ports: lease.ports, before: result.before, after: result.after, fields: result.changed, disclosure: lease.disclosure, eligibility: lease.state.eligibility }) : null;
  return { changed: saved || opened, opened: opened ? 'dashboard' : null, settingsSaved: saved, dataSaved: false, ...(undoId ? { undoId } : {}), ...(proof ? { undone: true } : {}), scope: 'native Dashboard presentation preferences only', ...(!opened ? { reason: 'Preferences were processed, but Dashboard could not be confirmed open. Open it manually.' } : {}) };
}
