// Public preference projection; connection addresses, labels and secrets stay local.
import { agentDataObject, parseAgentDataPatch, validateFieldNames } from '../shared/agent-data-contract.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
export interface KnowledgeSettings { enabled: boolean; backend: 'in-browser' | 'external-server'; topK: number; multiQuery: boolean }
export interface KnowledgeSettingsSnapshot { version: 1; scope: 'browser'; revision: string; record: KnowledgeSettings }
export const knowledgeSettingsFields = { enabled: 'Boolean: include the configured Knowledge Base in chat', topK: 'Integer 1–10: excerpts returned per search', multiQuery: 'Boolean: ask the selected AI to rewrite a search into several queries' };
export function displayKnowledgeSettings(value: unknown): KnowledgeSettings {
  const raw = agentDataObject(value), record = agentDataObject(raw.version === 1 ? raw.record : raw);
  if (typeof record.enabled !== 'boolean' || typeof record.multiQuery !== 'boolean' || !Number.isInteger(record.topK) || Number(record.topK) < 1 || Number(record.topK) > 10 || !['in-browser', 'external-server'].includes(String(record.backend))) throw new Error('Review the saved Knowledge Base preferences in settings.');
  return { enabled: record.enabled, backend: record.backend as KnowledgeSettings['backend'], topK: Number(record.topK), multiQuery: record.multiQuery };
}
export function projectKnowledgeSettings(proposal: AgentDataProposal) {
  const snapshot = agentDataObject(JSON.parse(proposal.baseline));
  if (snapshot.version !== 1 || snapshot.scope !== 'browser' || typeof snapshot.revision !== 'string' || !/^[a-f0-9]{64}$/.test(snapshot.revision) || proposal.operation !== 'update' || proposal.recordId) throw new Error('Read the browser Knowledge Base settings again.');
  const before = displayKnowledgeSettings(snapshot), patch = parseAgentDataPatch(proposal.patch); validateFieldNames(patch, Object.keys(knowledgeSettingsFields));
  if (!Object.keys(patch).length) throw new Error('Supply the reported retrieval preference.');
  return { before, after: displayKnowledgeSettings({ ...before, ...patch }) };
}
export function describeKnowledgeSettings(value: unknown): string {
  const record = displayKnowledgeSettings(value);
  return `Include in chat: ${record.enabled ? 'On' : 'Off'}\nExcerpts per search: ${record.topK}\nSearch rewriting: ${record.multiQuery ? 'On' : 'Off'}`;
}
