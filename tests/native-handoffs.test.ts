import { expect, it, vi } from 'vitest';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { validateAppNavigation, REPORT_HANDOFF_PRESETS } from '../shared/app-navigation-contract.js';
import { REPORT_PRESETS, REPORT_DATE_RANGE_OPTIONS } from '../js/export-report.js';
import { getAgentToolCatalog, getCodexDynamicTools } from '../shared/agent-tool-contract.js';

it.each([
  { view: 'healthImport' }, { view: 'reportBuilder' }, { view: 'profileShare' }, { view: 'profileShare', recordId: 'profile-exact' }, { view: 'lightTools' },
  ...REPORT_HANDOFF_PRESETS.map(subview => ({ view: 'reportBuilder', subview, range: '3m' })),
])('dispatches the finite native handoff without preparing a data mutation: %j', async request => {
  const navigate = vi.fn(() => ({ changed: true, opened: request.view, dataSaved: false, settingsSaved: false, requiresUserAction: true }));
  const create = vi.fn(), runtime = createAgentToolRuntime({ readContext: () => '', navigate, onDraftCreated: create });
  const response = await runtime.execute({ tool: 'getbased_navigate', arguments: request });
  expect(response.success).toBe(true); expect(JSON.parse(response.contentItems[0]!.text)).toMatchObject({ opened: request.view, dataSaved: false, settingsSaved: false, requiresUserAction: true });
  expect(navigate).toHaveBeenCalledExactlyOnceWith({ marker: '', ...request }); expect(create).not.toHaveBeenCalled(); expect(runtime.getDrafts()).toEqual([]);
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
it('matches the real native report templates/date windows in API and CLI discovery', () => {
  expect([...REPORT_HANDOFF_PRESETS].sort()).toEqual(Object.keys(REPORT_PRESETS).sort());
  for (const catalog of [getAgentToolCatalog(), getCodexDynamicTools()]) {
    const properties = catalog.find(tool => tool.name === 'getbased_navigate')!.inputSchema.properties!;
    for (const view of ['healthImport', 'reportBuilder', 'profileShare', 'lightTools']) expect(properties.view!.enum).toContain(view);
    for (const preset of REPORT_HANDOFF_PRESETS) expect(properties.subview!.enum).toContain(preset);
    for (const range of properties.range!.enum || []) expect(REPORT_DATE_RANGE_OPTIONS.map(row => row.value)).toContain(range);
  }
  expect(() => validateAppNavigation({ view: 'healthImport', marker: '', recordId: 'file' })).toThrow();
});
