// @ts-check
// agent-access-proposals.js — proposal-first bridge for external Agent Access callers.

import { state } from './state.js';
import { saveImportedData } from './data.js';
import { showNotification as defaultShowNotification } from './utils.js';
import { applyAgentAction, getAgentAction, runAgentAction } from './agent-actions/registry.js';
import { persistLabPlanArtifact } from './agent-artifacts.js';

function importedFrom(opts = {}) {
  return opts.importedData || state.importedData || {};
}

export function ensureAgentProposals(importedData = state.importedData) {
  if (!Array.isArray(importedData.agentProposals)) importedData.agentProposals = [];
  return importedData.agentProposals;
}

function makeId(prefix = 'agent_access_proposal') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function scrubProposal(proposal) {
  if (!proposal || typeof proposal !== 'object') return proposal;
  const copy = JSON.parse(JSON.stringify(proposal));
  delete copy.sourceText;
  for (const change of copy.changes || []) delete change.sourceText;
  return copy;
}

function scrubArtifact(value) {
  if (!value || typeof value !== 'object') return value;
  const copy = JSON.parse(JSON.stringify(value));
  delete copy.sourceText;
  if (copy.modification) delete copy.modification.sourceText;
  return copy;
}

function notifyProposal(record, opts = {}) {
  if (opts.notify === false) return;
  const fn = opts.showNotification || defaultShowNotification;
  fn?.(`Žofka drafted 1 action for review: ${record.summary || record.actionId}`, 'info');
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function restoreImportedData(target, snapshot) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, clone(snapshot) || {});
}

export async function proposeAgentAction(actionId, input = {}, opts = {}) {
  const action = getAgentAction(actionId);
  if (!action) throw new Error(`Unsupported getbased agent action: ${actionId}`);
  const importedData = importedFrom(opts);
  const result = await runAgentAction(actionId, input, { ...opts, appendToChat: false, persistArtifact: false });
  if (!result) throw new Error(`Agent action produced no proposal: ${actionId}`);
  const record = {
    id: makeId(),
    actionId,
    source: opts.source || 'agent-access',
    status: 'pending',
    createdAt: opts.now || Date.now(),
    updatedAt: opts.now || Date.now(),
    requiresConfirmation: action.requiresConfirmation !== false,
    writeLevel: action.writeLevel || result.policy?.writeLevel || 'draft-only',
    summary: result.assistantMessage?.agentProposal?.summary || result.labPlanDraft?.summary || action.label || actionId,
    agentProposal: result.assistantMessage?.agentProposal ? scrubProposal(result.assistantMessage.agentProposal) : null,
    labPlanDraft: scrubArtifact(result.labPlanDraft || result.assistantMessage?.labPlanDraft || null),
    scoreInvestigation: scrubArtifact(result.scoreInvestigation || result.assistantMessage?.scoreInvestigation || null),
  };
  const before = clone(importedData);
  ensureAgentProposals(importedData).unshift(record);
  if (opts.save !== false) {
    const saved = await saveImportedData({ immediate: true });
    if (!saved) {
      restoreImportedData(importedData, before);
      throw new Error('Could not save agent proposal');
    }
  }
  notifyProposal(record, opts);
  return record;
}

export function listStoredAgentProposals(opts = {}) {
  return ensureAgentProposals(importedFrom(opts)).filter(item => item?.status === 'pending');
}

export async function applyStoredAgentProposal(id, opts = {}) {
  const importedData = importedFrom(opts);
  const proposals = ensureAgentProposals(importedData);
  const record = proposals.find(item => item?.id === id) || null;
  if (!record || record.status !== 'pending') return null;
  if (!record.agentProposal && !record.labPlanDraft) throw new Error('Stored agent proposal has no supported apply payload');
  const before = clone(importedData);
  record.status = 'applying';
  record.updatedAt = opts.now || Date.now();
  try {
    if (record.agentProposal) {
      await applyAgentAction(record.actionId, record.agentProposal, { ...opts, importedData, save: false });
    } else if (record.labPlanDraft) {
      await persistLabPlanArtifact(record.labPlanDraft, { ...opts, importedData, source: record.source || 'agent-access', save: false });
    }
    record.status = 'applied';
    record.appliedAt = opts.now || Date.now();
    record.updatedAt = record.appliedAt;
    if (opts.save !== false) {
      const saved = await saveImportedData({ immediate: true });
      if (!saved) throw new Error('Could not save applied agent proposal');
    }
  } catch (err) {
    restoreImportedData(importedData, before);
    const restored = ensureAgentProposals(importedData).find(item => item?.id === id);
    if (restored) {
      restored.status = 'pending';
      restored.updatedAt = opts.now || Date.now();
    }
    throw err;
  }
  return record;
}

export async function dismissStoredAgentProposal(id, opts = {}) {
  const importedData = importedFrom(opts);
  const record = ensureAgentProposals(importedData).find(item => item?.id === id) || null;
  if (!record || record.status !== 'pending') return null;
  const before = clone(importedData);
  record.status = 'dismissed';
  record.dismissedAt = opts.now || Date.now();
  record.updatedAt = record.dismissedAt;
  if (opts.save !== false) {
    const saved = await saveImportedData({ immediate: true });
    if (!saved) {
      restoreImportedData(importedData, before);
      throw new Error('Could not save dismissed agent proposal');
    }
  }
  return record;
}

export function getAgentAccessProposalApi(defaultOpts = {}) {
  const call = (actionId, payload = {}, opts = {}) => proposeAgentAction(actionId, payload, { ...defaultOpts, ...opts });
  return {
    propose_context_update: (payload = {}, opts = {}) => call('context.update', payload, opts),
    propose_supplement_update: (payload = {}, opts = {}) => call('supplement.update', payload, opts),
    propose_lab_plan: (payload = {}, opts = {}) => call('labPlan.create', payload, opts),
    list_pending_agent_proposals: (opts = {}) => listStoredAgentProposals({ ...defaultOpts, ...opts }),
  };
}

function mergeProposalItems(localItems = [], remoteItems = [], cap = 50) {
  const byId = new Map();
  for (const item of [...remoteItems, ...localItems]) {
    if (!item?.id) continue;
    const prev = byId.get(item.id);
    if (!prev || (item.updatedAt || item.appliedAt || item.dismissedAt || item.createdAt || 0) >= (prev.updatedAt || prev.appliedAt || prev.dismissedAt || prev.createdAt || 0)) byId.set(item.id, { ...item });
  }
  return [...byId.values()].sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)).slice(0, cap);
}

export function mergeAgentProposalState(localData, remoteData, opts = {}) {
  const local = localData || {};
  const remote = remoteData || {};
  local.agentProposals = mergeProposalItems(ensureAgentProposals(local), ensureAgentProposals(remote), opts.limit || 50);
  return local;
}

const accessWindow = /** @type {any} */ (typeof window !== 'undefined' ? window : {});
accessWindow.getbasedAgentAccess = accessWindow.getbasedAgentAccess || getAgentAccessProposalApi();
