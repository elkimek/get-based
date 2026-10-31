import { expect, it, vi } from 'vitest';
import { getAgentToolCatalog, getCodexDynamicTools } from '../shared/agent-tool-contract.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';

it('advertises one current route per health workflow while retaining the version60 compatibility catalog', () => {
  const current = getAgentToolCatalog(undefined, 'current');
  expect(current.map(tool => tool.name)).toEqual([
    'getbased_lab_context', 'getbased_section', 'getbased_search_markers', 'getbased_marker_history',
    'getbased_nutrition_summary', 'getbased_wearable_series', 'getbased_search_knowledge', 'getbased_read_context_card',
    'getbased_read_data', 'getbased_draft_data', 'getbased_navigate', 'getbased_draft_note', 'getbased_draft_context',
    'getbased_app_actions', 'getbased_read_app', 'getbased_request_app',
  ]);
  expect(getAgentToolCatalog()).toHaveLength(19); expect(getCodexDynamicTools()).toHaveLength(19);
  expect(JSON.stringify(current)).not.toMatch(/"(?:binding|label|exposure)":/);
});
it.each(['getbased_draft_meal', 'getbased_draft_biometric', 'getbased_draft_supplement'])('does not execute the unadvertised %s compatibility shortcut in current chat', async tool => {
  const prepareLegacyDraft = vi.fn();
  const runtime = createAgentToolRuntime({ readContext: () => '', prepareLegacyDraft, catalogMode: 'current' });
  expect(runtime.tools.map(tool => tool.name)).toEqual(['getbased_lab_context', 'getbased_section', 'getbased_draft_note']);
  expect(await runtime.execute({ tool, arguments: '{}' })).toMatchObject({ success: false });
  expect(prepareLegacyDraft).not.toHaveBeenCalled(); expect(runtime.getDrafts()).toEqual([]);
});
