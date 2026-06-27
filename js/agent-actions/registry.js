// @ts-check
// agent-actions/registry.js — typed app-action registry for getbased's browser-local agent.

import {
  applyContextChangeProposal,
  applySupplementChangeProposal,
  compareLatestLabEntries,
  detectAgentNavigationTarget,
  draftContextChangeProposal,
  draftLabPlan,
  draftSupplementChangeProposal,
  executeAgentNavigation,
  getAgentProfileSnapshot,
  investigateBiologyScore,
  reviseSupplementChangeProposal,
} from '../agent-tools.js';
import { synthesizeAgentToolResponse } from '../agent-response-synthesis.js';
import { persistLabPlanArtifact } from '../agent-artifacts.js';
import { AGENT_ACTION_LABELS, AGENT_INTENT_ACTION_MAP, actionPolicy, actionSummary } from './schemas.js';

function fmtValue(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(Math.abs(value) >= 10 ? 1 : 2).replace(/\.00$/, '');
  return String(value ?? '—');
}

function fmtPct(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const sign = value > 0 ? '+' : '';
  return ` (${sign}${value.toFixed(0)}%)`;
}

function topLabChangeLines(comparison, limit = 4) {
  const lines = [];
  for (const m of comparison.changedMarkers.slice(0, limit)) {
    const arrow = m.direction === 'up' ? '↑' : '↓';
    lines.push(`- ${m.label}: ${fmtValue(m.previousValue)} → ${fmtValue(m.latestValue)} ${arrow}${fmtPct(m.percentChange)}`);
  }
  for (const m of comparison.addedMarkers.slice(0, Math.max(0, limit - lines.length))) {
    lines.push(`- ${m.label}: new value ${fmtValue(m.value)}`);
  }
  if (!lines.length) lines.push('- No numeric marker changes found between the two latest lab entries.');
  return lines;
}

function buildFindWhatChangedResult(_input = {}, opts = {}) {
  const snapshot = getAgentProfileSnapshot(opts);
  const comparison = compareLatestLabEntries(opts);
  const lines = topLabChangeLines(comparison);
  const dateLine = comparison.latestDate && comparison.previousDate
    ? `Compared ${comparison.previousDate} → ${comparison.latestDate}.`
    : comparison.latestDate
      ? `Only one lab date found (${comparison.latestDate}), so I can summarize but not compare yet.`
      : 'No lab entries found yet.';
  const content = [
    `### What changed`,
    dateLine,
    '',
    ...lines,
    '',
    snapshot.supplementCount ? `Context seen: ${snapshot.supplementCount} supplement/med entry${snapshot.supplementCount === 1 ? '' : 'ies'} and ${snapshot.healthGoalCount} health goal${snapshot.healthGoalCount === 1 ? '' : 's'}.` : `Context seen: ${snapshot.healthGoalCount} health goal${snapshot.healthGoalCount === 1 ? '' : 's'}; no supplements/meds logged yet.`,
    '',
    'I did not change anything. I can draft a lab-plan or open the relevant view next.',
  ].join('\n');
  return {
    mode: 'find-what-changed',
    label: AGENT_ACTION_LABELS['find-what-changed'],
    status: 'completed',
    policy: actionPolicy('read-only', true),
    toolCalls: [
      { id: 'get_profile_context', status: 'completed' },
      { id: 'compare_latest_labs', status: 'completed' },
    ],
    cards: [
      {
        title: 'Lab changes',
        latestDate: comparison.latestDate,
        previousDate: comparison.previousDate,
        changedMarkers: comparison.changedMarkers.slice(0, 8),
        addedMarkers: comparison.addedMarkers.slice(0, 8),
        removedMarkers: comparison.removedMarkers.slice(0, 8),
      },
    ],
    proposedActions: [
      { id: 'open_labs_view', label: 'Open Labs', requiresConfirmation: false, writeLevel: 'navigation' },
      { id: 'draft_lab_plan', label: 'Draft lab plan', requiresConfirmation: true, writeLevel: 'draft-only' },
    ],
    assistantMessage: {
      role: 'assistant',
      content,
      auto: true,
      agentMode: 'find-what-changed',
      agentResult: { comparison, snapshot },
    },
  };
}

function buildNavigationContent(target) {
  return [`### Opening ${target.label}`, `I'll take you to ${target.label}.`, '', 'No profile changes were applied.'].join('\n');
}

function buildNavigationResult(input = {}) {
  const target = input.target || detectAgentNavigationTarget(input.text || '');
  if (!target) return null;
  const navResult = executeAgentNavigation(target.route);
  return {
    mode: 'navigate',
    label: AGENT_ACTION_LABELS['navigation.open'],
    status: navResult.status,
    policy: actionPolicy('navigation', false),
    toolCalls: [{ id: 'open_view', status: navResult.status, route: target.route }],
    assistantMessage: {
      role: 'assistant',
      content: buildNavigationContent(target),
      auto: true,
      agentMode: 'navigate',
      agentNavigation: { route: target.route, label: target.label, status: navResult.status },
    },
  };
}

function buildLabPlanContent(plan) {
  const count = Array.isArray(plan?.bundles) ? plan.bundles.length : 0;
  const bundleText = count === 1 ? '1 marker bundle' : `${count} marker bundles`;
  return `I drafted ${bundleText} below. Nothing is ordered, saved, or sent anywhere.`;
}

function buildLabPlanModifyContent(plan) {
  const summary = plan?.modification?.summary || 'Updated the draft lab plan.';
  return `${summary} Nothing is ordered, saved, or sent anywhere.`;
}

function normalizeMarkerText(value) {
  const raw = String(value || '').trim().replace(/[.,;:!?]+$/g, '').replace(/\s+/g, ' ');
  if (!raw) return '';
  const key = raw.toLowerCase().replace(/[\s_]+/g, '-');
  const aliases = {
    apob: 'ApoB',
    'apo-b': 'ApoB',
    'apolipoprotein-b': 'ApoB',
    'c-peptide': 'C-peptide',
    cpeptide: 'C-peptide',
    shbg: 'SHBG',
    'sex-hormone-binding-globulin': 'SHBG',
    hba1c: 'HbA1c',
    'hb-a1c': 'HbA1c',
    'hs-crp': 'hs-CRP',
    hscrp: 'hs-CRP',
    'dhea-s': 'DHEA-S',
    dheas: 'DHEA-S',
    tsh: 'TSH',
    lh: 'LH',
    fsh: 'FSH',
    mma: 'MMA',
    hdl: 'HDL',
    ldl: 'LDL',
  };
  if (aliases[key]) return aliases[key];
  return raw.replace(/\b\w/g, c => c.toUpperCase()).replace(/\bAnd\b/g, 'and');
}

function markerKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function allPlanMarkers(plan) {
  const markers = [];
  for (const bundle of plan?.bundles || []) {
    for (const marker of bundle.markers || []) markers.push(marker);
  }
  return markers;
}

function extractMarkersAfter(text, verbs) {
  const source = String(text || '');
  const verbPattern = verbs.join('|');
  const match = source.match(new RegExp(`\\b(?:${verbPattern})\\b\\s+(.+?)(?:\\s+(?:to|from|in|on)\\s+(?:that|this|the)?\\s*(?:list|plan|panel))?$`, 'i'));
  const raw = match?.[1] || '';
  return raw
    .split(/\s*(?:,|\band\b|\+|;)\s*/i)
    .map(part => normalizeMarkerText(part.replace(/^(?:marker|test|lab)\s+/i, '')))
    .filter(Boolean);
}

function resolveExistingMarkersFromText(text, plan) {
  const sourceKey = markerKey(text);
  return allPlanMarkers(plan).filter(marker => sourceKey.includes(markerKey(marker)));
}

function modifyLabPlan(plan, text) {
  if (!plan || plan.surface !== 'labPlan' || !Array.isArray(plan.bundles)) return null;
  const sourceText = String(text || '');
  const next = JSON.parse(JSON.stringify(plan));
  const modification = {
    sourceText,
    operation: 'modify',
    addedMarkers: [],
    removedMarkers: [],
    summary: 'I updated the draft lab plan.',
  };
  next.id = `agent_lab_plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  next.revisionOf = plan.id || null;
  next.mode = 'modify-lab-plan';
  next.status = 'draft';
  next.sourceText = sourceText;

  if (/\b(cheaper|cheap|budget|lower cost|less expensive|minimum|minimal|core only|remove optional|without optional)\b/i.test(sourceText)) {
    modification.operation = 'cheaper';
    for (const bundle of next.bundles) {
      const before = Array.isArray(bundle.markers) ? bundle.markers : [];
      bundle.markers = before.slice(0, 3);
      for (const removed of before.slice(3)) modification.removedMarkers.push(removed);
    }
    modification.summary = 'I made the draft lab plan cheaper by keeping the core markers in each bundle.';
  }

  if (/\b(remove|drop|delete|without)\b/i.test(sourceText)) {
    const requested = resolveExistingMarkersFromText(sourceText, next);
    const removeKeys = new Set(requested.map(markerKey));
    if (removeKeys.size) {
      modification.operation = modification.operation === 'cheaper' ? 'cheaper-and-remove' : 'remove';
      for (const bundle of next.bundles) {
        const before = Array.isArray(bundle.markers) ? bundle.markers : [];
        bundle.markers = before.filter(marker => {
          const remove = removeKeys.has(markerKey(marker));
          if (remove) modification.removedMarkers.push(marker);
          return !remove;
        });
      }
      modification.summary = `I removed ${[...new Set(modification.removedMarkers)].join(', ')} from the draft lab plan.`;
    }
  }

  if (/\b(add|include|append|put)\b/i.test(sourceText)) {
    const requested = extractMarkersAfter(sourceText, ['add', 'include', 'append', 'put']);
    const existingKeys = new Set(allPlanMarkers(next).map(markerKey));
    const additions = requested.filter(marker => marker && !existingKeys.has(markerKey(marker)));
    if (additions.length) {
      modification.operation = modification.operation === 'remove' ? 'add-and-remove' : 'add';
      let bundle = next.bundles.find(b => b.id === 'custom-additions');
      if (!bundle) {
        bundle = { id: 'custom-additions', label: 'Added markers', rationale: 'Markers explicitly added in a follow-up request.', markers: [] };
        next.bundles.push(bundle);
      }
      for (const marker of additions) {
        bundle.markers.push(marker);
        modification.addedMarkers.push(marker);
        existingKeys.add(markerKey(marker));
      }
      modification.summary = `I added ${additions.join(', ')} to the draft lab plan.`;
    }
  }

  next.bundles = next.bundles
    .map(bundle => ({ ...bundle, markers: (bundle.markers || []).filter(Boolean) }))
    .filter(bundle => bundle.markers.length);
  modification.addedMarkers = [...new Set(modification.addedMarkers)];
  modification.removedMarkers = [...new Set(modification.removedMarkers)];
  next.modification = modification;
  next.summary = next.bundles.map(b => b.label).join('; ');
  next.title = plan.title || 'Draft lab plan';
  next.safetyNote = plan.safetyNote || 'Draft only — nothing is ordered, saved, or sent anywhere.';
  return next;
}

async function buildLabPlanModifyResult(input = {}, opts = {}) {
  const text = input.text || '';
  const plan = modifyLabPlan(input.labPlanDraft || input.plan, text);
  if (!plan) return null;
  await persistLabPlanArtifact(plan, { ...opts, source: opts.source || 'chat' });
  const fallbackContent = buildLabPlanModifyContent(plan);
  const content = await buildSynthesizedContent('modify-lab-plan', plan, fallbackContent, text, opts);
  return {
    mode: 'modify-lab-plan',
    label: AGENT_ACTION_LABELS['labPlan.modify'],
    status: 'completed',
    policy: actionPolicy('draft-only', true),
    toolCalls: [{ id: 'modify_lab_plan', status: 'completed', operation: plan.modification?.operation || 'modify' }],
    assistantMessage: {
      role: 'assistant',
      content,
      auto: true,
      agentMode: 'modify-lab-plan',
      labPlanDraft: plan,
    },
    labPlanDraft: plan,
  };
}

function markerDisplay(value) {
  return String(value?.label || value?.name || value?.key || value || '').trim();
}

function buildLabPlanFromScoreInvestigation(scoreInvestigation, text = '') {
  if (!scoreInvestigation || scoreInvestigation.surface !== 'biologyScoreInvestigation') return null;
  const markers = (scoreInvestigation.missingMarkers || []).map(markerDisplay).filter(Boolean);
  if (!markers.length) return null;
  const title = `Draft lab plan for ${scoreInvestigation.title || 'Biology Score'} confidence`;
  return {
    id: `agent_lab_plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    surface: 'labPlan',
    mode: 'draft-lab-plan',
    writeLevel: 'draft-only',
    requiresConfirmation: false,
    status: 'draft',
    sourceText: String(text || ''),
    title,
    summary: `Missing markers for ${scoreInvestigation.title || scoreInvestigation.scoreId || 'score'}`,
    sourceScoreInvestigationId: scoreInvestigation.id || null,
    sourceScoreId: scoreInvestigation.scoreId || null,
    bundles: [{
      id: `score-${scoreInvestigation.scoreId || 'investigation'}`,
      label: `${scoreInvestigation.title || 'Biology Score'} confidence markers`,
      rationale: 'Adds missing markers from the prior Biology Score investigation so the score can compute with better confidence.',
      markers,
    }],
    safetyNote: 'Draft only — nothing is ordered, saved, or sent anywhere.',
  };
}

async function buildLabPlanFromScoreResult(input = {}, opts = {}) {
  const text = input.text || '';
  const plan = buildLabPlanFromScoreInvestigation(input.scoreInvestigation, text);
  if (!plan) return null;
  if (opts.persistArtifact !== false) await persistLabPlanArtifact(plan, { ...opts, source: opts.source || 'chat' });
  const fallbackContent = buildLabPlanContent(plan);
  const content = await buildSynthesizedContent('draft-lab-plan-from-score', plan, fallbackContent, text, opts);
  return {
    mode: 'draft-lab-plan',
    label: AGENT_ACTION_LABELS['labPlan.fromScoreInvestigation'],
    status: 'completed',
    policy: actionPolicy('draft-only', true),
    toolCalls: [{ id: 'draft_lab_plan_from_score', status: 'completed', scoreId: input.scoreInvestigation?.scoreId || null }],
    assistantMessage: {
      role: 'assistant',
      content,
      auto: true,
      agentMode: 'draft-lab-plan',
      labPlanDraft: plan,
    },
    labPlanDraft: plan,
  };
}

async function buildSynthesizedContent(intent, toolResult, fallback, text, opts = {}) {
  if (typeof opts.synthesizeAgentResponse === 'function') {
    const custom = await opts.synthesizeAgentResponse({ userText: text, intent, toolResult, fallbackContent: fallback });
    if (typeof custom === 'string' && custom.trim()) return custom.trim();
    if (custom && typeof custom.content === 'string' && custom.content.trim()) return custom.content.trim();
  }
  if (opts.synthesizeAgentResponse === false) return fallback;
  const synthesized = await synthesizeAgentToolResponse({ userText: text, intent, toolResult, signal: opts.signal });
  return synthesized.content || fallback;
}

async function buildLabPlanResult(input = {}, opts = {}) {
  const text = input.text || '';
  const plan = draftLabPlan(text, opts);
  if (!plan) return null;
  if (opts.persistArtifact !== false) await persistLabPlanArtifact(plan, { ...opts, source: opts.source || 'chat' });
  const fallbackContent = buildLabPlanContent(plan);
  const content = await buildSynthesizedContent('draft-lab-plan', plan, fallbackContent, text, opts);
  return {
    mode: 'draft-lab-plan',
    label: AGENT_ACTION_LABELS['labPlan.create'],
    status: 'completed',
    policy: actionPolicy('draft-only', true),
    toolCalls: [{ id: 'draft_lab_plan', status: 'completed' }],
    assistantMessage: {
      role: 'assistant',
      content,
      auto: true,
      agentMode: 'draft-lab-plan',
      labPlanDraft: plan,
    },
    labPlanDraft: plan,
  };
}

function buildScoreInvestigationContent(investigation) {
  const scoreText = investigation.scoreValue == null ? 'not currently computed' : String(investigation.scoreValue);
  return [`### ${investigation.title}`, `I checked the current score state below. Score: ${scoreText}. No profile data was changed.`].join('\n');
}

async function buildScoreInvestigationResult(input = {}, opts = {}) {
  const text = input.text || '';
  const investigation = investigateBiologyScore(text, opts);
  if (!investigation) return null;
  const fallbackContent = buildScoreInvestigationContent(investigation);
  const content = await buildSynthesizedContent('investigate-score', investigation, fallbackContent, text, opts);
  return {
    mode: 'investigate-score',
    label: AGENT_ACTION_LABELS['biologyScore.investigate'],
    status: 'completed',
    policy: actionPolicy('read-only', true),
    toolCalls: [{ id: 'investigate_biology_score', status: 'completed', scoreId: investigation.scoreId }],
    assistantMessage: {
      role: 'assistant',
      content,
      auto: true,
      agentMode: 'investigate-score',
      scoreInvestigation: investigation,
    },
    scoreInvestigation: investigation,
  };
}

function buildProposalContent(proposal) {
  const isContext = proposal?.surface === 'context';
  const target = isContext ? 'profile context' : 'supplement log';
  return `I prepared a ${target} update. Nothing has been saved yet — review the card below and apply it only if it looks right.`;
}

function buildContextUpdateResult(input = {}, opts = {}) {
  const text = input.text || '';
  const proposal = input.proposal || draftContextChangeProposal(text, opts);
  if (!proposal) return null;
  return {
    mode: 'record-context-change',
    label: AGENT_ACTION_LABELS['context.update'],
    status: 'awaiting_confirmation',
    policy: actionPolicy('draft-only', true),
    toolCalls: [{ id: 'draft_context_change', status: 'completed' }],
    assistantMessage: {
      role: 'assistant',
      content: buildProposalContent(proposal),
      auto: true,
      agentMode: 'record-context-change',
      agentProposal: proposal,
    },
  };
}

function buildSupplementUpdateResult(input = {}, opts = {}) {
  const text = input.text || '';
  const proposal = input.proposal || draftSupplementChangeProposal(text, opts);
  if (!proposal) return null;
  return {
    mode: 'record-context-change',
    label: AGENT_ACTION_LABELS['supplement.update'],
    status: 'awaiting_confirmation',
    policy: actionPolicy('draft-only', true),
    toolCalls: [{ id: 'draft_supplement_change', status: 'completed' }],
    assistantMessage: {
      role: 'assistant',
      content: buildProposalContent(proposal),
      auto: true,
      agentMode: 'record-context-change',
      agentProposal: proposal,
    },
  };
}

const ACTIONS = [
  {
    id: 'find-what-changed',
    mode: 'find-what-changed',
    label: AGENT_ACTION_LABELS['find-what-changed'],
    description: 'Compare the latest lab entry against the previous entry without changing data.',
    writeLevel: 'read-only',
    requiresConfirmation: true,
    artifactType: 'agentResult',
    scopes: ['labs:read', 'profile:read'],
    run: buildFindWhatChangedResult,
  },
  {
    id: 'context.update',
    mode: 'record-context-change',
    label: AGENT_ACTION_LABELS['context.update'],
    description: 'Draft a confirmation-gated update for Profile Context cards and health goals.',
    writeLevel: 'draft-only',
    requiresConfirmation: true,
    artifactType: 'agentProposal',
    scopes: ['context:write:draft'],
    proposalSurface: 'context',
    editable: false,
    apply: applyContextChangeProposal,
    appliedMessage: 'Your profile context was updated.',
    notification: 'Profile context updated',
    run: buildContextUpdateResult,
  },
  {
    id: 'supplement.update',
    mode: 'record-context-change',
    label: AGENT_ACTION_LABELS['supplement.update'],
    description: 'Draft a confirmation-gated supplement/protocol change.',
    writeLevel: 'draft-only',
    requiresConfirmation: true,
    artifactType: 'agentProposal',
    scopes: ['supplements:write:draft'],
    proposalSurface: 'supplements',
    editable: true,
    apply: applySupplementChangeProposal,
    revise: reviseSupplementChangeProposal,
    appliedMessage: 'Your supplement log was updated.',
    notification: 'Supplement log updated',
    run: buildSupplementUpdateResult,
  },
  {
    id: 'labPlan.create',
    mode: 'draft-lab-plan',
    label: AGENT_ACTION_LABELS['labPlan.create'],
    description: 'Create a draft-only structured lab-plan artifact.',
    writeLevel: 'draft-only',
    requiresConfirmation: true,
    artifactType: 'labPlanDraft',
    scopes: ['labs:read', 'lab-plan:write:draft'],
    run: buildLabPlanResult,
  },
  {
    id: 'labPlan.modify',
    mode: 'modify-lab-plan',
    label: AGENT_ACTION_LABELS['labPlan.modify'],
    description: 'Modify a prior structured lab-plan draft while preserving its authoritative markers.',
    writeLevel: 'draft-only',
    requiresConfirmation: true,
    artifactType: 'labPlanDraft',
    scopes: ['lab-plan:write:draft'],
    run: buildLabPlanModifyResult,
  },
  {
    id: 'labPlan.fromScoreInvestigation',
    mode: 'draft-lab-plan-from-score',
    label: AGENT_ACTION_LABELS['labPlan.fromScoreInvestigation'],
    description: 'Turn a prior Biology Score investigation into a draft lab plan for missing confidence markers.',
    writeLevel: 'draft-only',
    requiresConfirmation: true,
    artifactType: 'labPlanDraft',
    scopes: ['biology-scores:read', 'lab-plan:write:draft'],
    run: buildLabPlanFromScoreResult,
  },
  {
    id: 'biologyScore.investigate',
    mode: 'investigate-score',
    label: AGENT_ACTION_LABELS['biologyScore.investigate'],
    description: 'Read current Biology Score evidence and draft an explanation artifact.',
    writeLevel: 'read-only',
    requiresConfirmation: true,
    artifactType: 'scoreInvestigation',
    scopes: ['biology-scores:read'],
    run: buildScoreInvestigationResult,
  },
  {
    id: 'navigation.open',
    mode: 'navigate',
    label: AGENT_ACTION_LABELS['navigation.open'],
    description: 'Open a safe in-app view without mutating profile data.',
    writeLevel: 'navigation',
    requiresConfirmation: false,
    artifactType: 'agentNavigation',
    scopes: ['navigation:open'],
    run: buildNavigationResult,
  },
];

const ACTION_BY_ID = new Map(ACTIONS.map(action => [action.id, action]));

export function listAgentActions() {
  return ACTIONS.map(actionSummary);
}

export function getAgentAction(id) {
  return ACTION_BY_ID.get(id) || null;
}

export function resolveAgentActionForIntent(intent) {
  const intentId = typeof intent === 'string' ? intent : intent?.intent;
  if (!intentId) return null;
  const actionId = AGENT_INTENT_ACTION_MAP[intentId] || intentId;
  return getAgentAction(actionId);
}

export async function runAgentAction(actionId, input = {}, opts = {}) {
  const action = getAgentAction(actionId);
  if (!action?.run) throw new Error(`Unsupported getbased agent action: ${actionId}`);
  return action.run(input, opts);
}

export function resolveAgentActionForProposal(proposal) {
  const surface = proposal?.surface;
  if (!surface) return null;
  return ACTIONS.find(action => action.proposalSurface === surface) || null;
}

export async function applyAgentAction(actionId, proposal, opts = {}) {
  const action = getAgentAction(actionId);
  if (!action?.apply) throw new Error(`Agent action does not support apply: ${actionId}`);
  if (action.proposalSurface && proposal?.surface !== action.proposalSurface) {
    throw new Error(`Proposal surface ${proposal?.surface || 'missing'} does not match action ${actionId}`);
  }
  return action.apply(proposal, opts);
}

export function reviseAgentActionProposal(actionId, proposal, edits = {}) {
  const action = getAgentAction(actionId);
  if (!action?.revise) return null;
  if (action.proposalSurface && proposal?.surface !== action.proposalSurface) return null;
  return action.revise(proposal, edits);
}

export function getAgentProposalSurfaceHandlers() {
  const handlers = {};
  for (const action of ACTIONS) {
    if (!action.proposalSurface) continue;
    handlers[action.proposalSurface] = {
      actionId: action.id,
      surface: action.proposalSurface,
      label: action.label,
      editable: action.editable === true,
      draft: action.id === 'context.update'
        ? draftContextChangeProposal
        : action.id === 'supplement.update'
          ? draftSupplementChangeProposal
          : null,
      apply: action.apply,
      revise: action.revise || null,
      appliedMessage: action.appliedMessage || 'The update was applied.',
      notification: action.notification || 'Update applied',
    };
  }
  return handlers;
}
