// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  state: { currentProfile: 'synthetic-retry', currentView: 'biochemistry', importedData: { markerLabels: {} as Record<string, string>, categoryLabels: {} as Record<string, string> } },
  prompt: vi.fn(), read: vi.fn(), commit: vi.fn(), notices: vi.fn(), detail: vi.fn(), refresh: vi.fn(),
}));
vi.mock('../js/state.js', () => ({ state: fixture.state }));
vi.mock('../js/data.js', () => ({ getActiveData: () => ({ categories: { biochemistry: { label: 'Biochemistry', markers: { glucose: { name: 'Glucose', storageDotKey: 'biochemistry.glucose' } } } } }), saveImportedData: vi.fn() }));
vi.mock('../js/utils.js', () => ({ showNotification: fixture.notices }));
vi.mock('../js/marker-detail-modal.js', () => ({ showDetailModal: fixture.detail }));
vi.mock('../js/lab-display-store.js', () => ({ readNativeLabDisplay: fixture.read, commitNativeLabDisplay: fixture.commit }));
vi.mock('../js/category-customization-runtime.js', () => ({ getCategoryCustomizationBuildSidebar: () => fixture.refresh, getCategoryCustomizationViewportSize: () => ({ width: 1024, height: 768 }), navigateCategoryCustomizationRuntime: fixture.refresh, showCategoryCustomizationPrompt: fixture.prompt }));
import { renameCategory, renameMarker } from '../js/category-customization.js';

beforeEach(() => {
  vi.clearAllMocks(); fixture.state.currentProfile = 'synthetic-retry'; fixture.state.currentView = 'biochemistry'; fixture.state.importedData = { markerLabels: {}, categoryLabels: {} }; document.body.innerHTML = '';
  fixture.read.mockReset().mockImplementation(async (_profile: string, resource: string) => ({ version: 1, resource, record: resource === 'labCategories' ? { label: 'Biochemistry' } : { name: 'Glucose' } }));
  fixture.prompt.mockReset(); fixture.commit.mockReset().mockResolvedValue({});
});
it.each(['category', 'marker'])('retains a failed %s candidate and retries only after another human confirmation', async kind => {
  fixture.prompt.mockResolvedValueOnce('Typed name').mockResolvedValueOnce('Typed name'); fixture.commit.mockRejectedValueOnce(new Error('Synthetic save failure')).mockResolvedValueOnce({});
  const saved = await (kind === 'category' ? renameCategory('biochemistry') : renameMarker('biochemistry_glucose'));
  expect(saved).toBe(true); expect(fixture.prompt).toHaveBeenCalledTimes(2); expect(fixture.prompt.mock.calls[1]![1].defaultValue).toBe('Typed name'); expect(fixture.commit).toHaveBeenCalledTimes(2);
  expect(fixture.notices.mock.calls.filter(([, tone]) => tone === 'info')).toHaveLength(1); expect(fixture.notices).toHaveBeenCalledWith('Synthetic save failure', 'error');
});
it.each(['category', 'marker'])('allows explicit cancellation of a failed %s rename without claiming success', async kind => {
  fixture.prompt.mockResolvedValueOnce('Typed name').mockResolvedValueOnce(null); fixture.commit.mockRejectedValueOnce(new Error('Synthetic save failure'));
  const command = () => kind === 'category' ? renameCategory('biochemistry') : renameMarker('biochemistry_glucose');
  expect(await command()).toBe(false); expect(fixture.commit).toHaveBeenCalledTimes(1); expect(fixture.refresh).not.toHaveBeenCalled(); expect(fixture.detail).not.toHaveBeenCalled();
  fixture.prompt.mockResolvedValueOnce(null); await command(); expect(fixture.prompt.mock.calls[2]![1].defaultValue).toBe(kind === 'category' ? 'Biochemistry' : 'Glucose');
});
it('keeps the candidate available if the durable read also fails during retry', async () => {
  fixture.prompt.mockResolvedValueOnce('Kept candidate'); fixture.commit.mockRejectedValueOnce(new Error('Write unavailable'));
  fixture.read.mockResolvedValueOnce({ record: { label: 'Biochemistry' } }).mockRejectedValueOnce(new Error('Read unavailable'));
  expect(await renameCategory('biochemistry')).toBe(false); fixture.read.mockResolvedValueOnce({ record: { label: 'Biochemistry' } }); fixture.prompt.mockResolvedValueOnce(null);
  await renameCategory('biochemistry'); expect(fixture.prompt.mock.calls[1]![1].defaultValue).toBe('Kept candidate'); expect(fixture.commit).toHaveBeenCalledTimes(1);
});
it('never reopens a retry prompt over another profile or leaks the source candidate there', async () => {
  fixture.prompt.mockResolvedValueOnce('Private source draft'); fixture.commit.mockImplementationOnce(async () => { fixture.state.currentProfile = 'synthetic-other'; fixture.state.importedData = { markerLabels: {}, categoryLabels: {} }; throw new Error('Origin changed'); });
  expect(await renameCategory('biochemistry')).toBe(false); expect(fixture.prompt).toHaveBeenCalledTimes(1); fixture.prompt.mockResolvedValueOnce(null); await renameCategory('biochemistry');
  expect(fixture.prompt.mock.calls[1]![1].defaultValue).toBe('Biochemistry'); expect(fixture.refresh).not.toHaveBeenCalled();
});
