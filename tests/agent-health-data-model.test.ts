import {expect, it} from 'vitest';
import {agentDataCapabilities, agentDataDisplay, agentDataIdentity, projectAgentDataChange} from '../js/agent-health-data-model.js';
import {CHAT_NATIVE_UI_NOTICE, CHAT_DATA_READ_RESOURCES} from '../shared/chat-control-policy.js';
import type {AgentDataResource, AgentDataProposal} from '../shared/agent-data-contract.js';

const retired: AgentDataResource[] = ['knowledgeImports', 'knowledgeDocuments', 'knowledgeLibraries', 'knowledgeSettings', 'customMarkers', 'markerRanges', 'markerDisplay', 'labCategories', 'genome'];
it.each(retired)('retained chat projection rejects native-only %s before projecting fields', resource => {
  expect(() => agentDataCapabilities(resource)).toThrow(CHAT_NATIVE_UI_NOTICE);
  expect(() => agentDataDisplay(resource, null)).toThrow(CHAT_NATIVE_UI_NOTICE);
  expect(() => agentDataIdentity(resource, {})).toThrow(CHAT_NATIVE_UI_NOTICE);
  expect(() => projectAgentDataChange({resource, recordId: '', reason: 'Reported correction', evidence: 'Correct this record.', recordedAt: 1793354400000, operation: 'update', baseline: '{}', patch: '{}', effectiveDate: '2026-10-30'} satisfies AgentDataProposal)).toThrow(CHAT_NATIVE_UI_NOTICE);
});
it('keeps capabilities for every declared retained read resource', () => {
  for (const resource of CHAT_DATA_READ_RESOURCES) expect(agentDataCapabilities(resource).fields).toBeTruthy();
});
it('preserves unrelated fields when projecting a retained note correction', () => {
  const projection = projectAgentDataChange({resource: 'datedNotes', recordId: 'note', reason: 'Reported correction', evidence: 'Correct this note.', operation: 'update', baseline: JSON.stringify({date: '2026-10-29', text: 'Before', extension: {kept: true}}), patch: JSON.stringify({text: 'After'}), effectiveDate: '2026-10-30', recordedAt: 1793354400000} satisfies AgentDataProposal);
  expect(projection).toEqual({before: {date: '2026-10-29', text: 'Before', extension: {kept: true}}, after: {date: '2026-10-29', text: 'After', extension: {kept: true}, updatedAt: 1793354400000}});
});
