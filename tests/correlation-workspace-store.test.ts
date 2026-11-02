import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => ({ get: vi.fn<(key: string) => Promise<string | null>>(), set: vi.fn<(key: string, value: string) => Promise<void>>(), remove: vi.fn<(key: string) => Promise<void>>(), notify: vi.fn() }));
vi.mock('../js/crypto.js', () => ({ encryptedGetItem: storage.get, encryptedSetItem: storage.set, encryptedRemoveItem: storage.remove }));
vi.mock('../js/utils.js', () => ({ showNotification: storage.notify }));
import { state, resetCorrelationSelection } from '../js/state.js';
import { normalizeCorrelationWorkspace, saveCorrelationWorkspace, restoreCorrelationWorkspace, readCorrelationWorkspaceSnapshot, commitCorrelationWorkspace, correlationWorkspaceIsSupported } from '../js/correlation-workspace-store.js';
let values: Map<string, string>;
beforeEach(() => {
  values = new Map<string, string>();
  storage.get.mockReset().mockImplementation(async key => values.get(key) ?? null);
  storage.set.mockReset().mockImplementation(async (key, value) => { values.set(key, value); });
  storage.remove.mockReset().mockImplementation(async key => { values.delete(key); });
  storage.notify.mockClear();
  state.currentProfile = 'alice';
  resetCorrelationSelection();
});
afterEach(() => { vi.unstubAllGlobals(); });
function installLocks() {
  const queues = new Map<string, Promise<unknown>>();
  vi.stubGlobal('navigator', { locks: { request: (name: string, _options: unknown, callback: () => unknown) => { const pending = (queues.get(name) || Promise.resolve()).then(callback); queues.set(name, pending.catch(() => {})); return pending; } } });
}
it('restores selection and view separately for each profile, including an intentionally empty selection', async () => {
  state.selectedCorrelationMarkers = ['biochemistry.glucose', 'diabetes.hba1c'];
  state.selectedCorrelationSupplements = ['tmg'];
  state.correlationView = { rangePreset: 'custom', start: '2026-03-24', end: '2026-09-28', grouping: 'combined', layout: 'overlay', tab: 'data', pairKey: '["biochemistry.glucose","tmg"]', hidden: ['diabetes.hba1c'], inspectDate: '2026-05-22', ingredients: { tmg: 'TMG' }, analysisOpen: true };
  const expected = structuredClone(state.correlationView);
  await saveCorrelationWorkspace();
  state.currentProfile = 'bob'; resetCorrelationSelection();
  await restoreCorrelationWorkspace('bob');
  expect(state.selectedCorrelationMarkers).toEqual([]);
  state.selectedCorrelationMarkers = ['lipids.ldl'];
  await saveCorrelationWorkspace();
  state.currentProfile = 'alice'; resetCorrelationSelection();
  await restoreCorrelationWorkspace('alice');
  expect(state.selectedCorrelationMarkers).toEqual(['biochemistry.glucose', 'diabetes.hba1c']);
  expect(state.selectedCorrelationSupplements).toEqual(['tmg']);
  expect(state.correlationView).toEqual(expected);
  resetCorrelationSelection(); await saveCorrelationWorkspace();
  await restoreCorrelationWorkspace('alice');
  expect(state.selectedCorrelationMarkers).toEqual([]);
});
it('serializes rapid saves and captures the initiating profile', async () => {
  let release!: () => void;
  storage.set.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  state.selectedCorrelationMarkers = ['first'];
  const first = saveCorrelationWorkspace();
  await vi.waitFor(() => expect(storage.set).toHaveBeenCalledTimes(1));
  state.selectedCorrelationMarkers = ['latest'];
  const latest = saveCorrelationWorkspace();
  state.currentProfile = 'bob';
  expect(storage.set).toHaveBeenCalledTimes(1);
  release(); await first; await latest;
  expect(JSON.parse(storage.set.mock.calls[1]![1]).markers).toEqual(['latest']);
  expect(storage.set.mock.calls.every(([key]) => key === 'labcharts-alice-correlation-workspace')).toBe(true);
});
it('ignores a late restore after switching profiles', async () => {
  let release!: (value: string) => void;
  storage.get.mockImplementationOnce(() => new Promise<string>(resolve => { release = resolve; }));
  const pending = restoreCorrelationWorkspace('alice');
  await Promise.resolve();
  state.currentProfile = 'bob'; state.selectedCorrelationMarkers = ['bob-marker'];
  release(JSON.stringify({ version: 1, markers: ['alice-marker'] }));
  await pending;
  expect(state.selectedCorrelationMarkers).toEqual(['bob-marker']);
});
it('bounds and validates saved settings and handles unsupported or malformed records', async () => {
  const cleaned = normalizeCorrelationWorkspace({ markers: ['a', 'a', 42], therapies: ['t'], view: { layout: 'garbage', tab: 'data', hidden: ['a', 'missing'], chart: {}, ingredients: { t: 'TMG', missing: 'no' } } });
  expect(cleaned).toEqual({ version: 1, markers: ['a'], therapies: ['t'], view: { tab: 'data', hidden: ['a'], ingredients: { t: 'TMG' } } });
  expect(normalizeCorrelationWorkspace({ markers: Array.from({ length: 20 }, (_, i) => String(i)), therapies: ['x'] }).markers).toHaveLength(8);
  storage.get.mockResolvedValueOnce('{bad json'); await restoreCorrelationWorkspace('alice');
  expect(storage.notify).toHaveBeenCalled();
  storage.get.mockResolvedValueOnce('{"version":99,"markers":["old"]}'); await restoreCorrelationWorkspace('alice');
  expect(state.selectedCorrelationMarkers).toEqual([]);
});
it('reports failed saves and allows the next edit to retry', async () => {
  storage.set.mockRejectedValueOnce(new Error('quota'));
  await saveCorrelationWorkspace();
  expect(storage.notify).toHaveBeenCalled();
  state.selectedCorrelationMarkers = ['retry']; await saveCorrelationWorkspace();
  expect(JSON.parse(values.get('labcharts-alice-correlation-workspace')!).markers).toEqual(['retry']);
});
it('saves tool workspace preferences before publishing while preserving the clinical data owner', async () => {
  installLocks(); const health = state.importedData, expected = await readCorrelationWorkspaceSnapshot('alice');
  const result = await commitCorrelationWorkspace('alice', expected, { markers: ['biochemistry.glucose', 'diabetes.hba1c'], therapies: [], view: { tab: 'data' } }, () => true);
  expect(result).toMatchObject({ settingsSaved: true, stateChanged: true, published: true }); expect(state.importedData).toBe(health); expect(state.selectedCorrelationMarkers).toEqual(['biochemistry.glucose', 'diabetes.hba1c']); expect(state.correlationView).toEqual({ tab: 'data' });
  expect([...values.keys()]).toEqual(['labcharts-alice-correlation-workspace']); expect(JSON.parse(values.get('labcharts-alice-correlation-workspace')!).view.tab).toBe('data');
});
it('requires native locks for tools while retaining the native save fallback', async () => {
  vi.stubGlobal('navigator', {}); const expected = await readCorrelationWorkspaceSnapshot('alice'); await expect(commitCorrelationWorkspace('alice', expected, { markers: ['new'], therapies: [], view: {} }, () => true)).rejects.toMatchObject({ noChangeApplied: true }); expect(storage.set).not.toHaveBeenCalled(); await saveCorrelationWorkspace(); expect(storage.set).toHaveBeenCalledOnce();
});
it.each(['selection', 'stored', 'owner'] as const)('rejects a stale %s expectation without a write', async cause => {
  installLocks(); const expected = await readCorrelationWorkspaceSnapshot('alice'); if (cause === 'selection') state.selectedCorrelationMarkers = ['native']; if (cause === 'stored') values.set('labcharts-alice-correlation-workspace', 'foreign');
  await expect(commitCorrelationWorkspace('alice', expected, { markers: ['new'], therapies: [], view: {} }, () => cause !== 'owner')).rejects.toMatchObject({ noChangeApplied: true }); expect(storage.set).not.toHaveBeenCalled(); expect(state.selectedCorrelationMarkers).toEqual(cause === 'selection' ? ['native'] : []);
});
it('a late native edit stays ahead of a queued tool expectation', async () => {
  installLocks(); const expected = await readCorrelationWorkspaceSnapshot('alice'); state.selectedCorrelationMarkers = ['native']; const native = saveCorrelationWorkspace(); const command = commitCorrelationWorkspace('alice', expected, { markers: ['tool'], therapies: [], view: {} }, () => true);
  await native; await expect(command).rejects.toMatchObject({ noChangeApplied: true }); expect(JSON.parse(values.get('labcharts-alice-correlation-workspace')!).markers).toEqual(['native']); expect(state.selectedCorrelationMarkers).toEqual(['native']);
});
it('reports a captured durable write but does not publish into another profile', async () => {
  installLocks(); const expected = await readCorrelationWorkspaceSnapshot('alice'); let reached!: () => void, release!: () => void; const started = new Promise<void>(resolve => { reached = resolve; }), blocked = new Promise<void>(resolve => { release = resolve; });
  storage.set.mockImplementationOnce(async (key, value) => { reached(); await blocked; values.set(key, value); });
  const command = commitCorrelationWorkspace('alice', expected, { markers: ['tool'], therapies: [], view: {} }, () => true); await started; state.currentProfile = 'bob'; state.selectedCorrelationMarkers = ['bob']; release();
  expect(await command).toMatchObject({ published: false, settingsSaved: true, stateChanged: false }); expect(state.selectedCorrelationMarkers).toEqual(['bob']); expect(JSON.parse(values.get('labcharts-alice-correlation-workspace')!).markers).toEqual(['tool']); expect(values.has('labcharts-bob-correlation-workspace')).toBe(false);
});
it('does not overwrite a newer native selection during a pending tool write', async () => {
  installLocks(); const expected = await readCorrelationWorkspaceSnapshot('alice'); let reached!: () => void, release!: () => void; const started = new Promise<void>(resolve => { reached = resolve; }), blocked = new Promise<void>(resolve => { release = resolve; }); storage.set.mockImplementationOnce(async (key, value) => { reached(); await blocked; values.set(key, value); });
  const command = commitCorrelationWorkspace('alice', expected, { markers: ['tool'], therapies: [], view: {} }, () => true); await started; state.selectedCorrelationMarkers = ['native']; const native = saveCorrelationWorkspace(); release(); expect(await command).toMatchObject({ published: false, settingsSaved: true }); await native; expect(state.selectedCorrelationMarkers).toEqual(['native']); expect(JSON.parse(values.get('labcharts-alice-correlation-workspace')!).markers).toEqual(['native']);
});
it('does not let an older restore overwrite a queued workspace command', async () => {
  installLocks(); const expected = await readCorrelationWorkspaceSnapshot('alice'); let reached!: () => void, release!: (value: string) => void; const started = new Promise<void>(resolve => { reached = resolve; }); storage.get.mockImplementationOnce(() => new Promise<string>(resolve => { release = resolve; reached(); }));
  const restore = restoreCorrelationWorkspace('alice'); await started; const command = commitCorrelationWorkspace('alice', expected, { markers: ['tool'], therapies: [], view: {} }, () => true); release(JSON.stringify(normalizeCorrelationWorkspace({ markers: ['old'] }))); await restore; expect(await command).toMatchObject({ settingsSaved: true, published: true }); expect(state.selectedCorrelationMarkers).toEqual(['tool']);
});
it('compensates a partial failed write and leaves the visible workspace unchanged', async () => {
  installLocks(); const expected = await readCorrelationWorkspaceSnapshot('alice'); storage.set.mockImplementationOnce(async (key, value) => { values.set(key, value); throw new Error('Synthetic failure after write'); }); await expect(commitCorrelationWorkspace('alice', expected, { markers: ['tool'], therapies: [], view: {} }, () => true)).rejects.toMatchObject({ noChangeApplied: true }); expect(values.size).toBe(0); expect(state.selectedCorrelationMarkers).toEqual([]); expect(storage.remove).toHaveBeenCalledWith('labcharts-alice-correlation-workspace');
});
it('reports an unconfirmed persistence outcome when rollback also fails', async () => {
  installLocks(); await saveCorrelationWorkspace(); const expected = await readCorrelationWorkspaceSnapshot('alice'); storage.set.mockImplementationOnce(async (key, value) => { values.set(key, value); throw new Error('Synthetic partial write'); }).mockRejectedValueOnce(new Error('Synthetic rollback failure')); await expect(commitCorrelationWorkspace('alice', expected, { markers: ['tool'], therapies: [], view: {} }, () => true)).rejects.toMatchObject({ persistenceUncertain: true }); expect(state.selectedCorrelationMarkers).toEqual([]);
});
it('verifies rollback instead of trusting a removal facade that can swallow storage failure', async () => {
  installLocks(); const expected = await readCorrelationWorkspaceSnapshot('alice'); storage.set.mockImplementationOnce(async (key, value) => { values.set(key, value); throw new Error('Synthetic partial write'); }); storage.remove.mockResolvedValueOnce(); await expect(commitCorrelationWorkspace('alice', expected, { markers: ['tool'], therapies: [], view: {} }, () => true)).rejects.toMatchObject({ persistenceUncertain: true }); expect(state.selectedCorrelationMarkers).toEqual([]); expect(values.size).toBe(1);
});
it('restores the exact captured absence and selection under a fresh guarded expectation', async () => {
  installLocks(); const before = await readCorrelationWorkspaceSnapshot('alice'); await commitCorrelationWorkspace('alice', before, { markers: ['tool'], therapies: [], view: { tab: 'data' } }, () => true); const current = await readCorrelationWorkspaceSnapshot('alice'); expect(current.raw).not.toBeNull(); await commitCorrelationWorkspace('alice', current, before.workspace, () => true, { raw: before.raw }); expect(values.size).toBe(0); expect(state.selectedCorrelationMarkers).toEqual([]); expect(state.correlationView).toEqual({});
});
it('does not normalize away unknown current or saved preference shapes', async () => {
  installLocks(); const snapshot = await readCorrelationWorkspaceSnapshot('alice'); const normal = normalizeCorrelationWorkspace(snapshot.workspace); expect(correlationWorkspaceIsSupported(JSON.stringify(normal), snapshot.workspace)).toBe(true);
  for (const raw of ['{bad', JSON.stringify({ ...normal, future: true }), JSON.stringify({ ...normal, version: 2 }), JSON.stringify({ ...normal, view: { ...normal.view, tab: 'future' } })]) {
    values.set('labcharts-alice-correlation-workspace', raw); const expected = await readCorrelationWorkspaceSnapshot('alice'); await expect(commitCorrelationWorkspace('alice', expected, { markers: ['tool'], therapies: [], view: {} }, () => true)).rejects.toMatchObject({ noChangeApplied: true }); expect(values.get('labcharts-alice-correlation-workspace')).toBe(raw);
  }
  expect(correlationWorkspaceIsSupported(null, { ...snapshot.workspace, view: { tab: 'future' } })).toBe(false); expect(correlationWorkspaceIsSupported(null, { ...snapshot.workspace, markers: ['duplicate', 'duplicate'] })).toBe(false); expect(storage.set).not.toHaveBeenCalled();
});
it('native auto-save preserves unfamiliar saved preferences instead of dropping future metadata', async () => {
  const raw = JSON.stringify({ ...normalizeCorrelationWorkspace({}), future: { keep: true } }); values.set('labcharts-alice-correlation-workspace', raw); state.selectedCorrelationMarkers = ['native']; await saveCorrelationWorkspace(); expect(storage.set).not.toHaveBeenCalled(); expect(values.get('labcharts-alice-correlation-workspace')).toBe(raw); expect(storage.notify).toHaveBeenCalled();
});
