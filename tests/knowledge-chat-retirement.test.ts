import { expect, it, vi } from 'vitest';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { getAgentToolCatalog, getCodexDynamicTools } from '../shared/agent-tool-contract.js';
import { CHAT_DATA_READ_RESOURCES, CHAT_DATA_WRITE_RESOURCES } from '../shared/chat-control-policy.js';
import { CHAT_TOOL_INSTRUCTIONS } from '../shared/chat-tool-instructions.js';

it('offers enabled document search without a Knowledge Base inventory or management tool in either catalog', () => {
  for (const tools of [getAgentToolCatalog(), getCodexDynamicTools()]) {
    expect(tools.find(tool => tool.name === 'getbased_search_knowledge')).toBeDefined();
    expect(tools.find(tool => tool.name === 'getbased_read_knowledge')).toBeUndefined();
    for (const resource of ['knowledgeSettings', 'knowledgeLibraries', 'knowledgeDocuments', 'knowledgeImports']) {
      expect(CHAT_DATA_READ_RESOURCES).not.toContain(resource); expect(CHAT_DATA_WRITE_RESOURCES).not.toContain(resource);
    }
  }
  expect(CHAT_TOOL_INSTRUCTIONS).toContain('Knowledge Base management belongs in the native Knowledge Base UI');
  expect(CHAT_TOOL_INSTRUCTIONS).not.toContain('getbased_read_knowledge'); expect(CHAT_TOOL_INSTRUCTIONS).not.toContain('read knowledgeImports');
});
it('rejects cached inventory calls before invoking any native reader', async () => {
  const readKnowledge = vi.fn(), runtime = createAgentToolRuntime({ readContext: () => '', readKnowledge });
  for (const args of [{}, { libraryId: 'saved-library' }, { libraryId: '../private', offset: 0 }]) {
    const result = await runtime.execute({ tool: 'getbased_read_knowledge', arguments: args }); expect(result.success).toBe(false);
  }
  expect(readKnowledge).not.toHaveBeenCalled(); expect(runtime.getDrafts()).toEqual([]);
});
it('preserves search, its saved default excerpt limit, and returned source evidence', async () => {
  const searchKnowledge = vi.fn(async () => ({ available: true, sourceName: 'Enabled reference', chunks: [{ text: 'Synthetic reference', source: 'reference.md' }] }));
  const runtime = createAgentToolRuntime({ readContext: () => '', searchKnowledge });
  const result = await runtime.execute({ tool: 'getbased_search_knowledge', arguments: { query: 'Synthetic health question' } });
  expect(result.success).toBe(true); expect(searchKnowledge).toHaveBeenCalledWith({ query: 'Synthetic health question' });
  expect(JSON.parse(result.contentItems[0].text)).toEqual({ available: true, sourceName: 'Enabled reference', chunks: [{ text: 'Synthetic reference', source: 'reference.md' }] });
  expect(runtime.getDrafts()).toEqual([]);
});
