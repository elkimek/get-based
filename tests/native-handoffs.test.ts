import { expect, it, vi } from 'vitest';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { validateAppNavigation, REPORT_HANDOFF_PRESETS } from '../shared/app-navigation-contract.js';
import { REPORT_PRESETS, REPORT_DATE_RANGE_OPTIONS } from '../js/export-report.js';
import { getAgentToolCatalog, getCodexDynamicTools } from '../shared/agent-tool-contract.js';

it.each([
  { view: 'healthImport' }, { view: 'reportBuilder' }, { view: 'profileShare' }, { view: 'profileShare', recordId: 'profile-exact' }, { view: 'lightTools' },
  ...REPORT_HANDOFF_PRESETS.map(subview => ({ view: 'reportBuilder', subview, range: '3m' })),
])('keeps management handoffs in native UI without dispatching or preparing data: %j', async request => {
  const navigate = vi.fn(() => ({ changed: true, opened: request.view, dataSaved: false, settingsSaved: false, requiresUserAction: true }));
  const create = vi.fn(), runtime = createAgentToolRuntime({ readContext: () => '', navigate, onDraftCreated: create });
  const response = await runtime.execute({ tool: 'getbased_navigate', arguments: request });
  expect(response.success).toBe(false);
  expect(navigate).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled(); expect(runtime.getDrafts()).toEqual([]);
});
it.each([
  { view: 'healthImport', files: ['/private/file.pdf'] }, { view: 'healthImport', subview: 'clinician' },
  { view: 'reportBuilder', subview: 'automatic-upload' }, { view: 'reportBuilder', subview: 'meals' }, { view: 'reportBuilder', range: 'last-two' },
  { view: 'reportBuilder', recordId: 'sample' }, { view: 'reportBuilder', firstDate: '2026-10-01' }, { view: 'reportBuilder', snapshotId: 'old' },
  { view: 'reportBuilder', generate: true }, { view: 'profileShare', recipient: 'someone@example.test' }, { view: 'profileShare', password: 'secret' },
  { view: 'profileShare', subview: 'full' }, { view: 'profileShare', range: 'all' }, { view: 'lightTools', recordId: 'unknown-room' },
  { view: 'lightTools', permission: true }, { view: 'nutritionHistory', subview: 'personal' }, { view: 'nutritionEditor', subview: 'full' },
])('rejects unsupported handoff parameters before native work: %j', async request => {
  const navigate = vi.fn(), runtime = createAgentToolRuntime({ readContext: () => '', navigate });
  expect((await runtime.execute({ tool: 'getbased_navigate', arguments: request })).success).toBe(false); expect(navigate).not.toHaveBeenCalled();
});
it('retains native report templates and windows while excluding management from API and CLI discovery', () => {
  expect([...REPORT_HANDOFF_PRESETS].sort()).toEqual(Object.keys(REPORT_PRESETS).sort());
  expect(REPORT_DATE_RANGE_OPTIONS.map(row => row.value)).toEqual(['current', '3m', '6m', '1y', 'all']);
  for (const catalog of [getAgentToolCatalog(), getCodexDynamicTools()]) {
    const properties = catalog.find(tool => tool.name === 'getbased_navigate')!.inputSchema.properties!;
    for (const view of ['healthImport', 'reportBuilder', 'profileShare', 'lightTools']) expect(properties.view!.enum).not.toContain(view);
    expect(Object.keys(properties).sort()).toEqual(['view', 'marker', 'category', 'card', 'recordId'].sort());
  }
  expect(() => validateAppNavigation({ view: 'healthImport', marker: '', recordId: 'file' })).toThrow();
});
