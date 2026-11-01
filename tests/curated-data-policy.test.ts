import { normalizeChatMessages } from '../js/chat-storage-safety.js';
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { createAgentDataTools } from '../js/agent-data-bindings.js';
import { applyAgentDataProposal } from '../js/agent-data-apply.js';
import { canDiscloseAgentDraftReview } from '../js/agent-tool-bindings.js';
import { projectAgentDraftCards } from '../js/agent-draft-presentation.js';
import { renderAgentDraftCards } from '../js/agent-draft-component.js';
import { getAgentToolCatalog, getCodexDynamicTools } from '../shared/agent-tool-contract.js';
import { AGENT_DATA_RESOURCES, type AgentDataResource, type AgentDataProposal } from '../shared/agent-data-contract.js';
import { CHAT_DATA_READ_RESOURCES, CHAT_DATA_WRITE_RESOURCES, chatDataReadAllowed, chatDataChangeAllowed } from '../shared/chat-control-policy.js';
const retired: AgentDataResource[] = ['knowledgeImports', 'knowledgeSettings', 'knowledgeLibraries', 'knowledgeDocuments', 'markerRanges', 'customMarkers', 'markerDisplay', 'labCategories', 'genome'];
const old = { profile: state.currentProfile, root: state.importedData, thread: state.currentThreadId };
const footprint = () => Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]);
const evidence = 'Manage this for me.';
beforeEach(() => { localStorage.clear(); state.currentProfile = 'data-policy'; state.currentThreadId = 'origin'; state.importedData = structuredClone(old.root); state.importedData.contextNotes = 'PRIVATE_HEALTH'; localStorage.setItem('synthetic-unrelated', 'KEEP'); });
afterEach(() => { Object.assign(state, { currentProfile: old.profile, importedData: old.root, currentThreadId: old.thread }); localStorage.clear(); vi.restoreAllMocks(); });
const proposal = (resource: AgentDataResource, operation: AgentDataProposal['operation'] = 'remove'): AgentDataProposal => ({ resource, operation, recordId: 'retired_record', baseline: '{"private":"PRIVATE_BASELINE"}', patch: '{}', reason: 'Old request', evidence, effectiveDate: '2026-10-29', recordedAt: Date.now() });
it('shares immutable resource scope through API and CLI schemas without narrowing native storage identities', () => {
  expect(Object.isFrozen(CHAT_DATA_READ_RESOURCES)).toBe(true); expect(Object.isFrozen(CHAT_DATA_WRITE_RESOURCES)).toBe(true);
  for (const tools of [getAgentToolCatalog(), getCodexDynamicTools()]) {
    const read = tools.find(tool => tool.name === 'getbased_read_data')!, write = tools.find(tool => tool.name === 'getbased_draft_data')!;
    expect(read.inputSchema.properties?.resource?.enum).toEqual(CHAT_DATA_READ_RESOURCES);
    expect(write.inputSchema.properties?.resource?.enum).toEqual(CHAT_DATA_WRITE_RESOURCES);
    for (const resource of retired) { expect(read.inputSchema.properties?.resource?.enum).not.toContain(resource); expect(write.inputSchema.properties?.resource?.enum).not.toContain(resource); expect(AGENT_DATA_RESOURCES).toContain(resource); }
    expect(read.inputSchema.properties?.resource?.enum).toContain('labReports'); expect(write.inputSchema.properties?.resource?.enum).not.toContain('labReports');
  }
  expect(chatDataChangeAllowed('labSamples', 'update')).toBe(true); expect(chatDataChangeAllowed('labSamples', 'remove')).toBe(false);
  expect(chatDataChangeAllowed('meals', 'unknown')).toBe(false);
});
it.each(retired)('refuses %s reads and preparation before invoking native dependencies', async resource => {
  const readData = vi.fn(), prepareDataChange = vi.fn(), runtime = createAgentToolRuntime({ readContext: () => '', userMessage: evidence, readData, prepareDataChange }), before = footprint(), health = JSON.stringify(state.importedData);
  expect((await runtime.execute({ tool: 'getbased_read_data', arguments: { resource, recordId: 'retired_record' } })).success).toBe(false);
  expect((await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource, operation: 'remove', snapshotId: 'old', patch: '{}', reason: 'Requested', evidence } })).success).toBe(false);
  expect(readData).not.toHaveBeenCalled(); expect(prepareDataChange).not.toHaveBeenCalled(); expect(runtime.getDrafts()).toEqual([]);
  const native = createAgentDataTools();
  expect(await native.readData({ resource, recordId: 'retired_record', create: false, query: '', offset: 0, limit: 10 })).toMatchObject({ available: false, reason: expect.stringContaining('native settings') });
  expect(await native.prepareDataChange({ resource, operation: 'remove', snapshotId: 'old', patch: '{}', reason: 'Requested', evidence })).toMatchObject({ available: false });
  expect(footprint()).toEqual(before); expect(JSON.stringify(state.importedData)).toBe(health);
});
it('lists only permitted resource families while preserving enabled health sources', async () => {
  const result = await createAgentDataTools().readData({ resource: '', recordId: '', create: false, query: '', offset: 0, limit: 25 });
  if (!('resources' in result)) throw new Error('Missing resource directory');
  expect(result.resources.every(row => chatDataReadAllowed(row.resource))).toBe(true);
  expect(JSON.stringify(result)).not.toMatch(/knowledgeSettings|knowledgeLibraries|knowledgeDocuments|markerRanges|customMarkers|markerDisplay|labCategories|"genome"/);
});
it.each([...retired, 'labReports', 'labSamples'] as AgentDataResource[])('blocks historical %s Apply and model disclosure without any data or storage change', async resource => {
  const payload = proposal(resource), before = footprint(), health = JSON.stringify(state.importedData);
  expect(canDiscloseAgentDraftReview({ kind: 'data', profileId: state.currentProfile, payload })).toBe(false);
  await expect(applyAgentDataProposal(payload, state.currentProfile)).rejects.toMatchObject({ noChangeApplied: true });
  expect(footprint()).toEqual(before); expect(JSON.stringify(state.importedData)).toBe(health);
});
it.each(['pending', 'applying', 'applied', 'failed'] as const)('renders retired %s data proposals as read-only without a saved-outcome claim', status => {
  const draft = { id: 'historical', profileId: state.currentProfile, kind: 'data', status, summary: 'Previous proposal', payload: proposal('knowledgeLibraries') };
  expect(projectAgentDraftCards({ agentDrafts: [draft] })[0]).toMatchObject({ nativeOnly: true, requiresRefresh: false, id: undefined });
  const html = renderAgentDraftCards({ agentDrafts: [draft] }, 0);
  expect(html).toContain('Managed in native UI'); expect(html).not.toContain('PRIVATE_BASELINE'); expect(html).not.toContain('data-chat-message-action'); expect(html).not.toMatch(/Applied to|Applying|Review required/);
});

it.each(retired)('retains historical %s payloads through chat normalization without restoring execution authority', resource => {
  const payload = proposal(resource), normalized = normalizeChatMessages([{ role: 'assistant', content: 'Previous review.', agentDrafts: [{ id: crypto.randomUUID(), kind: 'data', status: 'applied', profileId: state.currentProfile, summary: 'Previous proposal', payload }] }]);
  expect(normalized[0]?.agentDrafts?.[0]?.payload).toEqual(payload);
  expect(projectAgentDraftCards(normalized[0])[0]).toMatchObject({ nativeOnly: true, id: undefined });
});

it('does not expose newly added native resources or operations without an explicit chat policy change', async () => {
  vi.resetModules();
  vi.doMock('../shared/agent-data-contract.js', async () => {
    const actual = await vi.importActual<typeof import('../shared/agent-data-contract.js')>('../shared/agent-data-contract.js');
    return { ...actual, AGENT_DATA_RESOURCES: [...actual.AGENT_DATA_RESOURCES, 'futureAdministration'], AGENT_DATA_OPERATIONS: [...actual.AGENT_DATA_OPERATIONS, 'futureDestructiveOperation'] };
  });
  try {
    const policy = await import('../shared/chat-control-policy.js');
    expect(policy.chatDataReadAllowed('futureAdministration')).toBe(false);
    expect(policy.chatDataChangeAllowed('futureAdministration', 'update')).toBe(false);
    expect(policy.chatDataChangeAllowed('profile', 'futureDestructiveOperation')).toBe(false);
    expect(policy.CHAT_DATA_READ_RESOURCES).not.toContain('futureAdministration');
    expect(policy.CHAT_DATA_OPERATIONS).not.toContain('futureDestructiveOperation');
  } finally { vi.doUnmock('../shared/agent-data-contract.js'); vi.resetModules(); }
});
