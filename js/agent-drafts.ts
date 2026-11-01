import { captureChatControlAuthorization } from './chat-control-settings.js';
import { chatDataPatchAllowed, CHAT_NATIVE_UI_NOTICE } from '../shared/chat-control-policy.js';
import { applyAgentDataProposal } from './agent-data-apply.js';
import { isLegacyAgentDraft } from './agent-draft-upgrade.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
// Review-and-approve boundary for changes proposed by a connected CLI agent.

import { state } from './state.js';
import { captureChatTurnScope } from './chat-turn-scope.js';
import { saveImportedDataForProfile, notifyProfileDataContextChanged, refreshDataViewRuntime } from './data.js';
import { normalizeAgentContextProposal } from '../shared/agent-tool-contract.js';
import { normalizeAgentDataProposal, parseAgentDataPatch } from '../shared/agent-data-contract.js';
import { agentContextCardModel, applyAgentContextChanges, environmentEMFMode, usesEnvironmentEMFQuickFields } from './agent-context-fields.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import { recordContextCardChange } from './context-cards-runtime.js';
import { CONTEXT_SOURCE_IDS, isContextSourceEnabled } from './context-source-registry.js';
import { getActiveProfileId } from './profile.js';

import type { DraftReader } from './agent-draft-presentation.js';
export { renderAgentDraftCards } from './agent-draft-component.js';

export class AgentDraftConflictError extends Error { readonly noChangeApplied = true; }
export async function confirmAgentDraftSaved(draft: DraftReader | null | undefined) {
  const profile = getActiveProfileId();
  if (!draft || draft.kind !== 'data' || !['failed', 'applying'].includes(String(draft.status)) || draft.profileId !== profile || state.currentProfile !== profile) throw new Error('Switch back to the originating profile and select an unconfirmed library proposal.');
  const proposal = normalizeAgentDataProposal(draft.payload);
  if (proposal && !chatDataPatchAllowed(proposal.resource, proposal.operation, parseAgentDataPatch(proposal.patch))) throw new Error(CHAT_NATIVE_UI_NOTICE);
  throw new Error('This proposal has no Knowledge Base receipt to check.');
}

async function applyContext(payload: unknown, profileId: string, controlsCurrent: () => boolean) {
  const proposal = normalizeAgentContextProposal(payload);
  if (!proposal) throw new Error('This context proposal is invalid.');
  if (!isContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS)) throw new AgentDraftConflictError('Insight Context Cards are disabled. No change was applied.');
  const baseline: unknown = JSON.parse(proposal.baseline);
  const origin = state.importedData, quickEMF = usesEnvironmentEMFQuickFields(proposal);
  const editor = typeof document !== 'undefined' && document.querySelector('[data-context-form-view]')?.getAttribute('data-context-form-view') === proposal.card ? await import('./context-lifestyle-form-view.js') : null;
  const baseData = await readAgentProfileRecords(profileId);
  if (!profileDataValuesEqual(baseData[proposal.card] ?? null, baseline)) {
    throw new AgentDraftConflictError('This context card changed since the proposal. Ask for a new proposal. No change was applied.');
  }
  let conflict = false, revoked = false;
  const canCommit = () => {
    if (!controlsCurrent() || state.currentProfile !== profileId || state.importedData !== origin || !isContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS)) revoked = true;
    if (quickEMF && (environmentEMFMode(baseData) !== 'selfReport' || !profileDataValuesEqual(origin.environment ?? null, baseline) || !profileDataValuesEqual(origin.emfAssessment ?? null, baseData.emfAssessment ?? null))) conflict = true;
    if (editor?.hasLifestyleFormDraft(proposal.card)) conflict = true;
    return !revoked && !conflict;
  };
  if (!canCommit()) throw new AgentDraftConflictError('Context editing authorization or source changed. Ask for a fresh proposal. No change was applied.');
  const next = structuredClone(baseData);
  // The allowlisted card and fields are validated again at the commit boundary.
  applyAgentContextChanges(next, proposal);
  recordContextCardChange(proposal.card, next);
  const saved = await saveImportedDataForProfile(profileId, next, {
    forceProfileScope: true, baseData,
    expectedContextField: { key: proposal.card, value: baseline },
    expectedContextFields: quickEMF ? [{ key: 'emfAssessment', value: baseData.emfAssessment ?? null }] : [],
    canCommit,
    onContextFieldConflict: () => { conflict = true; },
  });
  if (!saved) {
    if (revoked) throw new AgentDraftConflictError('Context editing authorization changed. No change was applied.');
    if (conflict) throw new AgentDraftConflictError('This context card changed. No change was applied. Ask for a new proposal.');
    throw new Error('Could not save the context change.');
  }
  try { if (state.currentProfile === profileId) notifyProfileDataContextChanged(profileId); } catch { /* Storage is already committed. */ }
  try { if (state.currentProfile === profileId && state.importedData === origin) editor?.refreshLifestyleFormAfterContextChange(proposal.card); } catch { /* Storage is already committed; keep any newer draft. */ }
  return `${agentContextCardModel(proposal.card).title} updated.`;
}

export async function applyAgentDraft(draft: DraftReader | null | undefined, originCurrent: () => boolean = () => true) {
  const authorization = captureChatControlAuthorization(draft?.id); authorization.assert();
  if (!draft || draft.status !== 'pending') throw new Error('This proposal is no longer pending.');
  const activeProfileId = getActiveProfileId();
  if (!draft.profileId || draft.profileId !== activeProfileId) {
    throw new Error('Switch back to the profile where this proposal was created before applying it.');
  }
  if (isLegacyAgentDraft(draft)) throw Object.assign(new Error('This older proposal requires a refreshed exact review before Apply. Nothing was changed.'), { noChangeApplied: true, requiresReview: true });
  const scope = captureChatTurnScope(activeProfileId, originCurrent);
  const canCommit = () => authorization.current() && scope.current();
  if (!canCommit()) throw new AgentDraftConflictError('The originating conversation or review changed. Ask for a fresh proposal. No change was applied.');
  let result: string;
  if (draft.kind === 'data') result = await applyAgentDataProposal(draft.payload, activeProfileId, canCommit);
  else if (draft.kind === 'context') result = await applyContext(draft.payload, activeProfileId, canCommit);
  else throw new Error('This proposal type is not supported.');
  // Publishing saved data must neither destroy an open editor's draft nor turn
  // an already committed operation into a failed Apply.
  try {
    if (scope.current() && typeof document !== 'undefined' && document.getElementById('main-content')
      && !document.querySelector('#main-content form, #main-content [contenteditable="true"]')
      && !document.querySelector('dialog[open], .modal-overlay.show')
      && ![...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(dialog => !dialog.closest('#chat-panel') && dialog.getClientRects().length)) refreshDataViewRuntime();
  } catch { /* The domain commit is authoritative. */ }
  return result;
}
