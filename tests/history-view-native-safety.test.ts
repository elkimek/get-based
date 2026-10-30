// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, migrateProfileData } from '../js/profile.js';
import { ownsReadonlyHistorySurface } from '../js/readonly-history-surfaces.js';
import { changeWearableDetailRange } from '../js/history-native-controls.js';
import type { StoredWearableRow } from '../js/wearable-storage-types.js';
const reads = vi.hoisted(() => ({ run: vi.fn<(profile: string, source: string, start: string, end: string) => Promise<StoredWearableRow[]>>() }));
vi.mock('../js/wearables-store.js', async importOriginal => ({ ...await importOriginal<typeof import('../js/wearables-store.js')>(), getDailyRange: reads.run }));
const detail = await import('../js/wearables-detail-modal.js');
const original = { profile: state.currentProfile, data: state.importedData, view: state.currentView };
beforeEach(() => {
  localStorage.clear(); reads.run.mockReset().mockResolvedValue([]); detail._uninstallWearableModalFocusTrap(); state.currentProfile = 'alice'; state.currentView = 'dashboard'; localStorage.setItem('labcharts-active-profile', 'bob');
  state.importedData = migrateProfileData({ ...createDefaultProfileData(), wearableSummary: { sources: { manual: {} }, metrics: { weight: { primarySource: 'manual', latest: 72, latestDate: '2026-10-28', baseline: 73, weekly: [] } } } });
  document.body.innerHTML = '<button id="trigger">Weight</button><div id="modal-overlay"><div id="detail-modal"></div></div>';
});
afterEach(() => { detail._uninstallWearableModalFocusTrap(); state.currentProfile = original.profile; state.importedData = original.data; state.currentView = original.view; document.body.innerHTML = ''; vi.restoreAllMocks(); });
it('reads the owning profile even when another tab selected a different shared active-profile key', async () => {
  await detail.openWearableDetail('weight'); expect(reads.run).toHaveBeenCalledTimes(2); expect(reads.run.mock.calls.every(([profile]) => profile === 'alice')).toBe(true); expect(document.querySelector('#modal-overlay')?.classList.contains('show')).toBe(true); expect(ownsReadonlyHistorySurface('wearableDetail')).toBe(true);
});
it('retires a pending history read before querying more records or publishing into another profile', async () => {
  let release!: (rows: StoredWearableRow[]) => void; reads.run.mockImplementationOnce(() => new Promise(resolve => { release = resolve; })); const pending = detail.openWearableDetail('weight'); await vi.waitFor(() => expect(reads.run).toHaveBeenCalledTimes(1)); state.currentProfile = 'bob'; state.importedData = createDefaultProfileData(); release([{ date: '2026-10-28', source: 'manual', weight: 999 }]); await pending; expect(reads.run).toHaveBeenCalledTimes(1); expect(document.getElementById('detail-modal')!.innerHTML).toBe(''); expect(ownsReadonlyHistorySurface('wearableDetail')).toBe(false);
});
it('preserves an open manual-entry draft when a native range button is requested', async () => {
  await detail.openWearableDetail('weight'); const before = JSON.stringify(state.importedData); detail.openManualAddFromDetail('weight'); const input = document.querySelector<HTMLInputElement>('.wearable-manual-add-form input[type="number"]')!; expect(input).not.toBeNull(); input.value = '74'; expect(ownsReadonlyHistorySurface('wearableDetail')).toBe(false); await changeWearableDetailRange('weight', 'all'); expect(localStorage.getItem('wearable-detail-range')).toBeNull(); expect(input.value).toBe('74'); expect(JSON.stringify(state.importedData)).toBe(before);
  detail.closeManualAddFromDetail(); await changeWearableDetailRange('weight', 'all'); expect(localStorage.getItem('wearable-detail-range')).toBe('all'); expect(document.querySelector('[data-wearable-range="all"]')?.classList.contains('active')).toBe(true); expect(JSON.stringify(state.importedData)).toBe(before);
});
it('does not grant surface authority to matching attributes or an arbitrary modal replacement', async () => {
  const modal = document.getElementById('detail-modal')!; modal.innerHTML = '<div class="wearable-detail-range" data-wearable-detail></div>'; document.getElementById('modal-overlay')!.classList.add('show'); expect(ownsReadonlyHistorySurface('wearableDetail')).toBe(false); await detail.openWearableDetail('weight'); expect(ownsReadonlyHistorySurface('wearableDetail')).toBe(true); modal.innerHTML = '<div class="wearable-detail-range" data-wearable-detail></div>'; expect(ownsReadonlyHistorySurface('wearableDetail')).toBe(false);
});
it('retains the live read-only owner after a pending refresh is cancelled by a manual-entry form', async () => {
  await detail.openWearableDetail('weight'); let release!: (rows: StoredWearableRow[]) => void; reads.run.mockImplementationOnce(() => new Promise(resolve => { release = resolve; })); const changing = changeWearableDetailRange('weight', 'all'); await vi.waitFor(() => expect(reads.run).toHaveBeenCalledTimes(3)); detail.openManualAddFromDetail('weight'); const form = document.querySelector('.wearable-manual-add-form'); release([]); await changing; expect(form?.isConnected).toBe(true); expect(ownsReadonlyHistorySurface('wearableDetail')).toBe(false); detail.closeManualAddFromDetail(); expect(ownsReadonlyHistorySurface('wearableDetail')).toBe(true); await changeWearableDetailRange('weight', '1y'); expect(document.querySelector('[data-wearable-range="1y"]')?.classList.contains('active')).toBe(true);
});
