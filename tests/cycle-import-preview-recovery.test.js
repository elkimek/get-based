// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const runtime = vi.hoisted(() => ({
  state: { currentProfile: 'origin', profileSex: 'female', importedData: { menstrualCycle: null } },
  load: vi.fn(), commit: vi.fn(), confirm: vi.fn(), notify: vi.fn(), navigate: vi.fn(), editor: vi.fn(),
  deleteImport: vi.fn(), deleteSource: vi.fn(),
}));
vi.mock('../js/state.js', () => ({ state: runtime.state }));
vi.mock('../js/cycle-import-mutations.js', () => ({
  commitCycleImport: runtime.commit, deleteCycleImportFromProfile: runtime.deleteImport,
  deleteCycleSourceFromProfile: runtime.deleteSource, clearCycleProfileData: vi.fn(),
  buildCycleImportPlan: () => ({ conflicts: [], importedToApply: [], importedPeriods: [], mergedPeriods: [] }),
}));
vi.mock('../js/utils.js', () => ({ escapeAttr: String, escapeHTML: String, showNotification: runtime.notify, showConfirmDialog: runtime.confirm }));
vi.mock('../js/tour.js', () => ({ endTour: vi.fn() }));
vi.mock('../js/modal-lifecycle.js', () => ({ closeModalOverlay: vi.fn(), openModalOverlay: vi.fn() }));
vi.mock('../js/cycle-runtime.js', () => ({
  loadCycleImportStylesheetRuntime: runtime.load, navigateCycleViewRuntime: runtime.navigate,
  openCycleEditorRuntime: runtime.editor,
}));
const { showCycleImportPreview, handleCycleImportAction, handleCycleImportFile } = await import('../js/cycle-import.js');
const parsed = { source: 'drip', importId: 'preview', observations: [{ date: '2026-09-01' }], periods: [] };
const action = name => handleCycleImportAction({ target: document.querySelector(`[data-cycle-import-action="${name}"]`) });
async function mount() {
  const result = showCycleImportPreview(parsed);
  await vi.waitFor(() => expect(document.querySelector('[data-cycle-import-action="confirm"]')).not.toBeNull());
  return { result };
}
beforeEach(() => {
  vi.clearAllMocks();
  runtime.state.currentProfile = 'origin'; runtime.state.profileSex = 'female';
  runtime.state.importedData = { menstrualCycle: null };
  runtime.load.mockResolvedValue(); runtime.confirm.mockResolvedValue(true);
  runtime.commit.mockResolvedValue({ periods: 1, observations: 1 });
  document.body.innerHTML = '<div id="import-modal-overlay"><div id="import-modal"></div></div>';
});
afterEach(async () => { await action('close'); vi.useRealTimers(); });
it('does not commit a preview after changing profiles', async () => {
  await mount(); runtime.state.currentProfile = 'other';
  await action('confirm'); expect(runtime.commit).not.toHaveBeenCalled();
});
it('does not commit after replacement data is loaded for the same profile', async () => {
  await mount(); runtime.state.importedData = { menstrualCycle: null };
  await action('confirm'); expect(runtime.commit).not.toHaveBeenCalled();
});
it('does not commit after navigation while sex-change consent is pending', async () => {
  await mount(); runtime.state.profileSex = 'male';
  runtime.confirm.mockImplementationOnce(async () => { runtime.state.currentProfile = 'other'; return true; });
  await action('confirm'); expect(runtime.commit).not.toHaveBeenCalled();
});
it('ignores duplicate confirmation while its write is pending', async () => {
  await mount(); let release;
  runtime.commit.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const first = action('confirm'); await Promise.resolve();
  const second = action('confirm'); await Promise.resolve();
  expect(runtime.commit).toHaveBeenCalledTimes(1);
  release({ periods: 1, observations: 1 }); await Promise.all([first, second]);
});
it('does not navigate or reopen history after profile navigation during commit', async () => {
  await mount(); vi.useFakeTimers();
  runtime.commit.mockImplementationOnce(async () => { runtime.state.currentProfile = 'other'; return { periods: 1, observations: 1 }; });
  await action('confirm'); await vi.runAllTimersAsync();
  expect(runtime.navigate).not.toHaveBeenCalled(); expect(runtime.editor).not.toHaveBeenCalled();
});
it('does not display a preview after navigation during stylesheet loading', async () => {
  runtime.load.mockImplementationOnce(async () => { runtime.state.currentProfile = 'other'; });
  const result = showCycleImportPreview(parsed); await Promise.resolve(); await Promise.resolve();
  expect(document.querySelector('[data-cycle-import-action="confirm"]')).toBeNull();
  // Only await after checking DOM so the old unresolved preview is reported as an assertion failure.
  await expect(result).resolves.toBeNull();
});
it.each(['delete-import', 'delete-source'])('%s does not act on a replacement profile after consent', async name => {
  document.body.innerHTML += `<button data-cycle-import-action="${name}" data-cycle-import-import-id="batch" data-cycle-import-source="drip"></button>`;
  runtime.confirm.mockImplementationOnce(async () => { runtime.state.currentProfile = 'other'; return true; });
  await action(name); expect(runtime.deleteImport).not.toHaveBeenCalled(); expect(runtime.deleteSource).not.toHaveBeenCalled();
});
it('can retry after a failed commit without leaving confirmation disabled', async () => {
  await mount(); vi.useFakeTimers();
  runtime.commit.mockRejectedValueOnce(new Error('storage failed'));
  await action('confirm');
  expect(document.querySelector('[data-cycle-import-action="confirm"]').disabled).toBe(false);
  expect(runtime.notify).toHaveBeenCalledWith('Cycle import failed: storage failed', 'error');
  await action('confirm'); expect(runtime.commit).toHaveBeenCalledTimes(2);
  vi.clearAllTimers();
});
it('releases the guard after declining sex-change consent', async () => {
  await mount(); runtime.state.profileSex = 'male'; vi.useFakeTimers();
  runtime.confirm.mockResolvedValueOnce(false);
  await action('confirm'); expect(runtime.commit).not.toHaveBeenCalled();
  await action('confirm'); expect(runtime.commit).toHaveBeenCalledTimes(1);
  vi.clearAllTimers();
});
it('does not commit after the preview is cancelled during consent', async () => {
  const { result } = await mount(); runtime.state.profileSex = 'male';
  runtime.confirm.mockImplementationOnce(async () => { await action('close'); return true; });
  await action('confirm'); expect(runtime.commit).not.toHaveBeenCalled();
  await expect(result).resolves.toBeNull();
});
it('resolves a replaced preview instead of stranding its caller', async () => {
  const first = await mount();
  const second = showCycleImportPreview({ ...parsed, importId: 'second' });
  await expect(first.result).resolves.toBeNull();
  await Promise.resolve(); await action('close'); await expect(second).resolves.toBeNull();
});
it('does not replace a newer preview when an older stylesheet request finishes late', async () => {
  let release;
  runtime.load.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const first = showCycleImportPreview(parsed);
  const second = showCycleImportPreview({ ...parsed, importId: 'second' });
  await Promise.resolve(); release(); await expect(first).resolves.toBeNull();
  vi.useFakeTimers(); await action('confirm');
  expect(runtime.commit).toHaveBeenCalledWith(expect.objectContaining({ importId: 'second' }), expect.any(Object));
  await expect(second).resolves.toMatchObject({ periods: 1 }); vi.clearAllTimers();
});
it('checks profile ownership again before delayed history reopening', async () => {
  await mount(); vi.useFakeTimers(); runtime.navigate.mockReturnValueOnce(true);
  await action('confirm'); runtime.state.currentProfile = 'other';
  await vi.runAllTimersAsync(); expect(runtime.editor).not.toHaveBeenCalled();
});
it('keeps a newer preview open when an older commit finishes', async () => {
  const first = await mount(); let release;
  runtime.commit.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const commit = action('confirm'); await Promise.resolve();
  const second = showCycleImportPreview({ ...parsed, importId: 'second' });
  await expect(first.result).resolves.toBeNull(); await Promise.resolve();
  release({ periods: 1, observations: 1 }); await commit;
  expect(runtime.navigate).not.toHaveBeenCalled();
  vi.useFakeTimers(); await action('confirm');
  expect(runtime.commit.mock.calls[1][0].importId).toBe('second');
  await expect(second).resolves.toMatchObject({ periods: 1 }); vi.clearAllTimers();
});

it.each(['profile', 'data'])('rejects a file read completed after %s replacement', async replacement => {
  const file = { name: 'cycle.csv', text: async () => {
    if (replacement === 'profile') runtime.state.currentProfile = 'other';
    else runtime.state.importedData = { menstrualCycle: null };
    return 'date,bleeding.value\n2026-09-01,1';
  } };
  await expect(handleCycleImportFile(file)).resolves.toBe(false);
  expect(runtime.load).not.toHaveBeenCalled();
  expect(runtime.commit).not.toHaveBeenCalled();
});
