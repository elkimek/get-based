import { expect, it, vi } from 'vitest';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { AGENT_CONTEXT_CARDS } from '../shared/agent-tool-contract.js';
it.each([
  { view: 'aiSettings', marker: 'biochemistry.glucose' }, { view: 'category' }, { view: 'dashboard', category: 'biochemistry' },
  { view: 'contextEditor' }, { view: 'contextEditor', card: '__proto__' }, { view: 'labs', card: 'healthGoals' },
  { view: 'lightDevice' }, { view: 'sunSession' }, { view: 'deviceSession' }, { view: 'dashboard', recordId: 'some-id' },
  { view: 'nutritionHistory', subview: 'arbitrary' }, { view: 'nutritionEditor', subview: 'meals' }, { view: 'aiSettings', selector: '#save' },
  { view: 'wearablesSettings', recordId: 'oura' }, { view: 'wearablesSettings', snapshotId: 'fresh' },
  { view: 'https://example.com' }, { view: 'category', category: '' },
  { view: 'dashboard', range: '6m' }, { view: 'labs', range: '20y' }, { view: 'labs', range: '3m', marker: 'biochemistry.glucose' },
  { view: 'labs', layout: 'table' }, { view: 'category', category: 'biochemistry', layout: 'script' },
  { view: 'compare', firstDate: '2026-01-01' }, { view: 'labs', snapshotId: 'snapshot', firstDate: '2026-01-01' },
  { view: 'compare', snapshotId: 'snapshot' }, { view: 'compare', snapshotId: 'snapshot', swapDates: false },
  { view: 'compare', snapshotId: 'snapshot', firstDate: '2026-02-30' }, { view: 'compare', snapshotId: 'snapshot', swapDates: true, firstDate: '2026-01-01' },
  { view: 'compare', snapshotId: 'snapshot', firstDate: '2026-01-01', range: '3m' },
  { view: 'correlations', correlation: '{"markers":[]}' }, { view: 'correlations', snapshotId: 'snapshot' },
  { view: 'dashboard', snapshotId: 'snapshot' }, { view: 'dashboard', correlation: '{"markers":[]}', snapshotId: 'snapshot' },
  { view: 'correlations', snapshotId: 'snapshot', correlation: '{"markers":[]}', undoId: 'undo' },
  { view: 'correlations', snapshotId: 'snapshot', correlation: '{"selector":"#save"}' },
  { view: 'correlations', snapshotId: 'snapshot', correlation: '{"markers":[]}', firstDate: '2026-01-01' },
  { view: 'wearableDetail' }, { view: 'wearableStrip' }, { view: 'nutritionHistory', history: '{"nutritionRange":"all"}' },
  { view: 'nutritionHistory', snapshotId: 'snapshot' }, { view: 'nutritionHistory', snapshotId: 'snapshot', history: '{"nutritionRange":"7d"}' },
  { view: 'nutritionHistory', snapshotId: 'snapshot', history: '{"wearableRange":"all"}' },
  { view: 'nutritionHistory', snapshotId: 'snapshot', history: '{"nutritionView":"trends"}', undoId: 'undo' },
  { view: 'nutritionHistory', snapshotId: 'snapshot', history: '{"nutritionView":"trends"}', subview: 'meals' },
  { view: 'wearableDetail', snapshotId: 'snapshot', history: '{"wearableRange":"all"}' },
  { view: 'wearableDetail', snapshotId: 'snapshot', history: '{"wearableMetricId":"weight","wearableRange":"all"}' },
  { view: 'wearableDetail', snapshotId: 'snapshot', history: '{"metricId":"weight","wearableRange":"30d"}' },
  { view: 'wearableStrip', snapshotId: 'snapshot', history: '{"stripHidden":"yes"}' },
  { view: 'wearableStrip', snapshotId: 'snapshot', history: '{"stripHidden":true,"metricId":"weight"}' },
  { view: 'dashboard', snapshotId: 'snapshot', history: '{"stripHidden":true}' },
  { view: 'wearableStrip', snapshotId: 'snapshot', history: '{"stripHidden":true}', range: '1y' },
])('rejects ambiguous or undeclared destinations before any native action: %j', async args => {
  const navigate = vi.fn(), readContext = vi.fn(); const tools = createAgentToolRuntime({ readContext, navigate });
  expect((await tools.execute({ tool: 'getbased_navigate', arguments: args })).success).toBe(false);
  expect(navigate).not.toHaveBeenCalled(); expect(readContext).not.toHaveBeenCalled(); expect(tools.getDrafts()).toEqual([]);
});
it.each(AGENT_CONTEXT_CARDS)('accepts the declared %s context editor without proposing any data change', async card => {
  const navigate = vi.fn(() => ({ changed: true, dataSaved: false })); const tools = createAgentToolRuntime({ readContext: () => '', navigate });
  expect((await tools.execute({ tool: 'getbased_navigate', arguments: { view: 'contextEditor', card } })).success).toBe(true);
  expect(navigate).toHaveBeenCalledExactlyOnceWith({ view: 'contextEditor', card, marker: '' }); expect(tools.getDrafts()).toEqual([]);
});

it('keeps source refresh handoffs in native UI even with a paired ID and snapshot', async () => {
  const navigate = vi.fn(() => ({ changed: true, opened: 'wearablesSettings', requiresUserAction: true, dataSaved: false }));
  const tools = createAgentToolRuntime({ readContext: () => '', navigate });
  expect((await tools.execute({ tool: 'getbased_navigate', arguments: { view: 'wearablesSettings', recordId: 'oura', snapshotId: 'fresh' } })).success).toBe(false);
  expect(navigate).not.toHaveBeenCalled(); expect(tools.getDrafts()).toEqual([]);
});
