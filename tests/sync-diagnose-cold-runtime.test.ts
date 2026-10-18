// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {state} from '../js/state.js';
import {recordRouteChange} from '../js/route-lifecycle.js';
import {beginSyncDiagnoseOpen, type SyncDiagnoseOpenOwner} from '../js/sync-diagnose-open-owner.js';
import {diagnosticFixture} from './helpers/sync-diagnose-fixtures.js';
import type {EvoluDiagnostics} from '../js/sync-diagnostics-snapshot.js';
import type {RelayHealthVerdict} from '../js/sync-relay-health.js';
const ports = vi.hoisted(() => ({
  diagnostics: vi.fn<() => Promise<EvoluDiagnostics>>(), verify: vi.fn<() => Promise<RelayHealthVerdict>>(),
  quota: vi.fn(), debug: vi.fn(), configured: vi.fn(), notify: vi.fn(),
  compact: vi.fn(), refresh: vi.fn(), rotate: vi.fn(), backfill: vi.fn(), disable: vi.fn(), enable: vi.fn(), telemetry: vi.fn(),
}));
vi.mock('../js/sync-diagnostics-snapshot.js', () => ({getEvoluDiagnostics: ports.diagnostics}));
vi.mock('../js/sync-relay-health.js', () => ({verifyPushLanded: ports.verify, getRelayQuotaEstimate: ports.quota}));
vi.mock('../js/utils.js', () => ({isDebugMode: ports.debug, showNotification: ports.notify}));
vi.mock('../js/sync-diagnose-actions.js', () => ({
  configureSyncDiagnoseActions: ports.configured, confirmCompactRelay: ports.compact, refreshRelayStorage: ports.refresh,
  confirmRotateIdentity: ports.rotate, confirmBackfillBlockers: ports.backfill, confirmDisablePhase2: ports.disable,
  confirmEnablePhase2: ports.enable, confirmResetDeltaTelemetry: ports.telemetry,
}));
vi.mock('../js/modal-lifecycle.js', () => ({
  openModalOverlay: (overlay: Element) => overlay.classList.add('show'),
  closeModalOverlay: (overlay: Element) => overlay.classList.remove('show'),
}));
import {configureSyncDiagnoseUI, showSyncDiagnose, copySyncDiagnose} from '../js/sync-diagnose-ui.js';
const original = {profile: state.currentProfile, data: state.importedData, view: state.currentView};
const owners: SyncDiagnoseOpenOwner[] = [];
const own = () => { const owner = beginSyncDiagnoseOpen(); owners.push(owner); return owner; };
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject}; }
async function mutationTick() { await Promise.resolve(); await Promise.resolve(); }
beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '<main id="main-content"><p>Retained route</p></main><div class="modal-overlay" id="existing"><div class="modal"><p>Retained dialog</p></div></div>';
  state.currentProfile = original.profile; state.importedData = original.data; state.currentView = original.view;
  ports.diagnostics.mockResolvedValue(diagnosticFixture().diagnostics);
  ports.verify.mockResolvedValue({verdict: 'unknown', at: 0, reason: null});
  ports.quota.mockReturnValue(null); ports.debug.mockReturnValue(false);
  configureSyncDiagnoseUI({isPhase2CutoverEnabled: () => false});
});
afterEach(() => {
  owners.splice(0).forEach(owner => owner.release());
  state.currentProfile = original.profile; state.importedData = original.data; state.currentView = original.view;
  document.body.replaceChildren(); vi.useRealTimers();
});

it('pending ownership tolerates unrelated data-display mutations and releases observers without DOM changes', async () => {
  const owner = own(), before = document.body.innerHTML;
  document.querySelector('main p')!.textContent = 'Changed ordinary text';
  document.querySelector('main p')!.classList.add('unrelated'); await mutationTick();
  expect(owner.current()).toBe(true); owner.release();
  expect(document.body.innerHTML).not.toBe(before); expect(document.querySelectorAll('.modal-overlay')).toHaveLength(1);
});
it('a later request retires only the earlier pending request', () => {
  const old = own(), next = own(); expect(old.current()).toBe(false); expect(next.current()).toBe(true);
  old.release(); expect(next.current()).toBe(true);
});
for (const reason of ['route', 'route-away-back', 'view', 'profile', 'data', 'main', 'profile-event'] as const) it(`pending ownership rejects ${reason} replacement`, () => {
  const owner = own();
  if (reason === 'route') recordRouteChange();
  if (reason === 'route-away-back') {const view = state.currentView; recordRouteChange(); state.currentView = view === 'cycle' ? 'dashboard' : 'cycle'; recordRouteChange(); state.currentView = view;}
  if (reason === 'view') state.currentView = original.view === 'cycle' ? 'dashboard' : 'cycle';
  if (reason === 'profile') state.currentProfile = 'other-profile';
  if (reason === 'data') state.importedData = structuredClone(state.importedData);
  if (reason === 'main') document.querySelector('main')!.replaceWith(document.createElement('main'));
  if (reason === 'profile-event') globalThis.dispatchEvent(new Event('labcharts-profile-switched'));
  expect(owner.current()).toBe(false);
});
for (const reason of ['shown', 'transient-show', 'appended', 'transient-append', 'replacement'] as const) it(`pending ownership rejects a new modal owner: ${reason}`, async () => {
  const owner = own(), existing = document.getElementById('existing')!;
  if (reason === 'shown' || reason === 'transient-show') {existing.classList.add('show'); if (reason === 'transient-show') existing.classList.remove('show');}
  if (reason === 'appended' || reason === 'transient-append') {const overlay = document.createElement('div'); overlay.className = 'modal-overlay show'; document.body.append(overlay); if (reason === 'transient-append') overlay.remove();}
  if (reason === 'replacement') existing.querySelector('.modal')!.replaceChildren(document.createElement('section'));
  await mutationTick(); expect(owner.current()).toBe(false);
});

it('configuration keeps exact inherited getter order, original defaults, undefined return and hoisted show callback', () => {
  const trace: string[] = [];
  const enableSync = async () => true, isSyncEnabled = () => true;
  const inherited = Object.create({enableSync, isSyncEnabled});
  for (const name of ['restoreFromMnemonic', 'pushProfile', 'enablePhase2Cutover', 'disablePhase2Cutover', 'isPhase2CutoverEnabled']) Object.defineProperty(inherited, name, {get() {trace.push(name); return undefined;}});
  expect(configureSyncDiagnoseUI(inherited)).toBeUndefined();
  expect(trace).toEqual(['restoreFromMnemonic', 'pushProfile', 'enablePhase2Cutover', 'disablePhase2Cutover', 'isPhase2CutoverEnabled']);
  expect(ports.configured).toHaveBeenLastCalledWith({enableSync, restoreFromMnemonic: undefined, isSyncEnabled, pushProfile: undefined, enablePhase2Cutover: undefined, disablePhase2Cutover: undefined, showSyncDiagnose});
  const failure = new Error('configuration getter failed');
  expect(() => configureSyncDiagnoseUI(Object.defineProperty({}, 'enableSync', {get() {throw failure;}}))).toThrow(failure);
});
it('the genuine lazy UI retains the complete rendered fragment, captured snapshot, delegated action and close behavior', async () => {
  const {renderSyncDiagnoseModal} = await import('../js/sync-diagnose-render.js');
  const input = diagnosticFixture();
  input.quota = {bytes: 25 * 1024 * 1024, cap: 50 * 1024 * 1024, pct: 50, level: 'green'};
  ports.quota.mockReturnValue(input.quota);
  await expect(showSyncDiagnose()).resolves.toBeUndefined();
  const overlay = document.body.lastElementChild as HTMLElement;
  expect(overlay.className).toBe('modal-overlay show');
  expect(overlay.innerHTML).toBe(renderSyncDiagnoseModal(input));
  expect(overlay.dataset.copyText).toContain('synthetic-owner');
  const refresh = overlay.querySelector<HTMLButtonElement>('[data-sync-diagnose-action="refresh-relay-storage"]')!;
  refresh.click(); expect(ports.refresh).toHaveBeenCalledExactlyOnceWith(refresh);
  overlay.querySelector<HTMLButtonElement>('[data-sync-diagnose-close]')!.click();
  expect(overlay.isConnected).toBe(false);
});
it('configuration changed during diagnostics/relay awaits is read when the genuine UI renders', async () => {
  const pending = deferred<RelayHealthVerdict>(); ports.verify.mockReturnValue(pending.promise);
  const first = vi.fn(() => false), next = vi.fn(() => true);
  configureSyncDiagnoseUI({isPhase2CutoverEnabled: first});
  const opening = showSyncDiagnose(); await vi.waitFor(() => expect(ports.verify).toHaveBeenCalledOnce());
  configureSyncDiagnoseUI({isPhase2CutoverEnabled: next});
  pending.resolve({verdict: 'unknown', at: 0, reason: null}); await opening;
  expect(first).not.toHaveBeenCalled(); expect(next).toHaveBeenCalledExactlyOnceWith('synthetic-profile');
});
it('diagnostic failures reject exactly and do not perform health reads or append UI', async () => {
  const failure = new Error('snapshot failed'); ports.diagnostics.mockRejectedValue(failure);
  const before = document.body.innerHTML;
  await expect(showSyncDiagnose()).rejects.toBe(failure);
  expect(ports.verify).not.toHaveBeenCalled(); expect(document.body.innerHTML).toBe(before);
});
it('health failure keeps the original unknown fallback, while later render callback errors reject without committing', async () => {
  ports.verify.mockRejectedValue(new Error('health unavailable'));
  await expect(showSyncDiagnose()).resolves.toBeUndefined();
  document.body.lastElementChild!.remove();
  const failure = new Error('cutover failed'); configureSyncDiagnoseUI({isPhase2CutoverEnabled: () => {throw failure;}});
  const before = document.body.innerHTML;
  await expect(showSyncDiagnose()).rejects.toBe(failure); expect(document.body.innerHTML).toBe(before);
});
for (const stage of ['diagnostics', 'health'] as const) for (const reason of ['route', 'profile', 'new-modal'] as const) it(`genuine UI never opens late after ${reason} while awaiting ${stage}`, async () => {
  const diagnostic = deferred<EvoluDiagnostics>(), health = deferred<RelayHealthVerdict>();
  if (stage === 'diagnostics') ports.diagnostics.mockReturnValue(diagnostic.promise); else ports.verify.mockReturnValue(health.promise);
  const opening = showSyncDiagnose();
  await vi.waitFor(() => expect(stage === 'diagnostics' ? ports.diagnostics : ports.verify).toHaveBeenCalledOnce());
  if (reason === 'route') recordRouteChange();
  if (reason === 'profile') globalThis.dispatchEvent(new Event('labcharts-profile-switched'));
  if (reason === 'new-modal') document.getElementById('existing')!.classList.add('show');
  const before = document.body.innerHTML;
  if (stage === 'diagnostics') diagnostic.resolve(diagnosticFixture().diagnostics); else health.resolve({verdict: 'unknown', at: 0, reason: null});
  await expect(opening).resolves.toBeUndefined(); expect(document.body.innerHTML).toBe(before);
  if (stage === 'diagnostics') expect(ports.verify).not.toHaveBeenCalled();
});
it('newer real UI opens supersede an older unresolved snapshot without overwriting its modal', async () => {
  const delayed = deferred<EvoluDiagnostics>(); ports.diagnostics.mockReturnValueOnce(delayed.promise);
  const old = showSyncDiagnose(); await vi.waitFor(() => expect(ports.diagnostics).toHaveBeenCalledOnce());
  await showSyncDiagnose(); const committed = document.body.lastElementChild;
  delayed.resolve(diagnosticFixture().diagnostics); await old;
  expect(document.body.lastElementChild).toBe(committed); expect(document.querySelectorAll('.modal-overlay.show')).toHaveLength(1);
});
it('clipboard still reads the rendered snapshot and restores the exact old label', async () => {
  vi.useFakeTimers(); const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText}});
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'; overlay.dataset.copyText = 'immutable displayed snapshot';
  const button = document.createElement('button'); button.textContent = 'Copy diagnostic'; overlay.append(button); document.body.append(overlay);
  await copySyncDiagnose(button); expect(writeText).toHaveBeenCalledExactlyOnceWith('immutable displayed snapshot'); expect(button.textContent).toBe('Copied');
  await vi.advanceTimersByTimeAsync(1500); expect(button.textContent).toBe('Copy diagnostic');
});
