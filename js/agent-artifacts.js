// @ts-check
// agent-artifacts.js — durable draft artifacts produced by the controlled app agent.

import { state } from './state.js';
import { saveImportedData } from './data.js';

/** @param {{ importedData?: any }} [opts] */
function importedFrom(opts = {}) {
  return opts.importedData || state.importedData || {};
}

/** @param {any} [importedData] */
export function ensureAgentArtifacts(importedData = /** @type {any} */ (state.importedData)) {
  if (!importedData.agentArtifacts || typeof importedData.agentArtifacts !== 'object') importedData.agentArtifacts = { labPlans: [], prelabChecklists: [] };
  if (!Array.isArray(importedData.agentArtifacts.labPlans)) importedData.agentArtifacts.labPlans = [];
  if (!Array.isArray(importedData.agentArtifacts.prelabChecklists)) importedData.agentArtifacts.prelabChecklists = [];
  return importedData.agentArtifacts;
}

/** @param {any} value */
function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function scrubStoredArtifact(value) {
  const copy = clone(value) || {};
  delete copy.sourceText;
  if (copy.modification) delete copy.modification.sourceText;
  return copy;
}

export async function persistLabPlanArtifact(plan, opts = {}) {
  if (!plan || plan.surface !== 'labPlan' || !Array.isArray(plan.bundles)) return null;
  const importedData = importedFrom(opts);
  const artifacts = ensureAgentArtifacts(importedData);
  const beforePlans = clone(artifacts.labPlans || []);
  const now = opts.now || Date.now();
  const stored = {
    ...scrubStoredArtifact(plan),
    source: opts.source || plan.source || 'agent',
    artifactType: 'labPlanDraft',
    updatedAt: now,
    createdAt: plan.createdAt || now,
  };
  const idx = artifacts.labPlans.findIndex(item => item?.id === stored.id);
  if (idx >= 0) artifacts.labPlans[idx] = { ...artifacts.labPlans[idx], ...stored };
  else artifacts.labPlans.unshift(stored);
  artifacts.labPlans = artifacts.labPlans.slice(0, opts.limit || 25);
  if (opts.save !== false) {
    const saved = await saveImportedData({ immediate: true });
    if (!saved) {
      artifacts.labPlans = beforePlans;
      throw new Error('Could not save lab-plan artifact');
    }
  }
  return stored;
}

export function getLatestLabPlanArtifact(opts = {}) {
  const importedData = importedFrom(opts);
  const plans = ensureAgentArtifacts(importedData).labPlans;
  return plans[0] || null;
}

export function getLabPlanArtifact(id, opts = {}) {
  const importedData = importedFrom(opts);
  const targetId = String(id || '');
  if (!targetId) return null;
  return ensureAgentArtifacts(importedData).labPlans.find(plan => plan?.id === targetId) || null;
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function planMarkers(plan) {
  const items = [];
  for (const bundle of plan?.bundles || []) {
    for (const marker of bundle.markers || []) {
      const label = String(marker || '').trim();
      if (!label) continue;
      items.push({ marker: label, bundle: bundle.label || bundle.id || '', status: 'unmapped' });
    }
  }
  return items;
}

export async function createPrelabChecklistFromLabPlan(id, opts = {}) {
  const importedData = importedFrom(opts);
  const artifacts = ensureAgentArtifacts(importedData);
  const plan = getLabPlanArtifact(id, { importedData });
  if (!plan) return null;
  const now = opts.now || Date.now();
  const checklist = {
    id: makeId('agent_prelab'),
    artifactType: 'prelabChecklist',
    sourceLabPlanId: plan.id,
    title: `Prelab checklist: ${plan.title || 'Draft lab plan'}`,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    source: opts.source || 'agent',
    safetyNote: 'Draft checklist only — nothing is ordered, booked, or sent anywhere.',
    items: planMarkers(plan),
  };
  artifacts.prelabChecklists.unshift(checklist);
  artifacts.prelabChecklists = artifacts.prelabChecklists.slice(0, opts.limit || 25);
  if (opts.save !== false) await saveImportedData({ immediate: true });
  return checklist;
}

function mergeById(localItems = [], remoteItems = [], cap = 25) {
  const byId = new Map();
  for (const item of [...remoteItems, ...localItems]) {
    if (!item?.id) continue;
    const prev = byId.get(item.id);
    if (!prev || (item.updatedAt || item.createdAt || 0) >= (prev.updatedAt || prev.createdAt || 0)) byId.set(item.id, { ...item });
  }
  return [...byId.values()].sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)).slice(0, cap);
}

export function mergeAgentArtifacts(localData, remoteData, opts = {}) {
  const local = ensureAgentArtifacts(localData || {});
  const remote = ensureAgentArtifacts(remoteData || {});
  local.labPlans = mergeById(local.labPlans, remote.labPlans, opts.limit || 25);
  local.prelabChecklists = mergeById(local.prelabChecklists, remote.prelabChecklists, opts.limit || 25);
  return local;
}
