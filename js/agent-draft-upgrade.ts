// Older cards stay readable. Their first action prepares a new exact review;
// it never interprets the old approval as permission for a changed proposal.
import { LEGACY_AGENT_DRAFT_KINDS } from '../shared/agent-data-contract.js';
import type { AgentLegacyDraftKind } from '../shared/agent-data-contract.js';
import { createAgentDataTools } from './agent-data-bindings.js';
import { getActiveProfileId } from './profile.js';
import type { AgentDraft } from './agent-tool-runtime.js';
import type { DraftReader } from './agent-draft-presentation.js';

export function isLegacyAgentDraft(draft: DraftReader | null | undefined) {
  return !!draft && LEGACY_AGENT_DRAFT_KINDS.includes(draft.kind as AgentLegacyDraftKind);
}
export async function prepareLegacyAgentDraftReview(draft: DraftReader, userMessage: string) {
  if (!isLegacyAgentDraft(draft) || draft.status !== 'pending' || draft.profileId !== getActiveProfileId()) throw new Error('Switch back to the originating pending proposal before refreshing its review.');
  const evidence = userMessage.trim().slice(0, 1000);
  if (!evidence) throw new Error('The original user message is unavailable. Ask the chat for a new proposal.');
  if (typeof draft.id !== 'string' || !draft.id || draft.id.length > 128) throw new Error('This saved proposal has no stable identity. Ask for a new proposal.');
  const result = await createAgentDataTools().prepareLegacyDraft({ kind: draft.kind as AgentLegacyDraftKind, payload: draft.payload as Record<string, unknown>, evidence });
  if (draft.profileId !== getActiveProfileId()) throw new Error('Switch back to the originating profile before reviewing this change.');
  if (!result.available) throw new Error(result.reason);
  const proposals = await Promise.all(result.proposals.map(async (proposal, index) => {
    const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(['getbased-legacy-review-v1', draft.profileId, draft.id, index])));
    const identity = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    // Two stale renderers must refresh the same old card into one claim and one
    // new entity, even when they prepared independent create snapshots.
    const payload = { ...proposal, ...(proposal.operation === 'add' && ['meals', 'supplements'].includes(proposal.resource) ? { recordId: `legacy.${identity}` } : {}) };
    return { id: `review.${identity}`, profileId: String(draft.profileId), kind: 'data' as const, status: 'pending' as const,
      payload, summary: 'Refreshed proposal · review before applying' } satisfies AgentDraft & { profileId: string };
  }));
  if (draft.profileId !== getActiveProfileId()) throw new Error('Switch back to the originating profile before reviewing this change.');
  return proposals;
}
