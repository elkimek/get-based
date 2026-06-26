// @ts-check
// agent-runtime.js — browser-local getbased agent spine and confirmation-gated modes

import { state } from './state.js';
import { saveChatHistory } from './chat-history.js';
import { renderChatMessages } from './chat-render.js';
import { getActivePersonality } from './chat-personalities.js';
import {
  applyContextChangeProposal,
  applySupplementChangeProposal,
  compareLatestLabEntries,
  detectAgentContextSignals,
  detectAgentNavigationTarget,
  detectLabPlanTopics,
  draftContextChangeProposal,
  draftLabPlan,
  draftSupplementChangeProposal,
  executeAgentNavigation,
  getAgentProfileSnapshot,
  getAgentToolRegistry,
  reviseSupplementChangeProposal,
} from './agent-tools.js';

const AGENT_MODE_LABELS = {
  'find-what-changed': 'Find what changed',
  'record-context-change': 'Update supplement log',
  'draft-lab-plan': 'Draft lab plan',
  navigate: 'Open view',
};

const AGENT_PROPOSAL_HANDLERS = {
  supplements: {
    surface: 'supplements',
    label: 'Supplement log',
    editable: true,
    draft: draftSupplementChangeProposal,
    apply: applySupplementChangeProposal,
    revise: reviseSupplementChangeProposal,
    appliedMessage: 'Your supplement log was updated.',
    notification: 'Supplement log updated',
  },
  context: {
    surface: 'context',
    label: 'Profile context',
    editable: false,
    draft: draftContextChangeProposal,
    apply: applyContextChangeProposal,
    revise: null,
    appliedMessage: 'Your profile context was updated.',
    notification: 'Profile context updated',
  },
};

export function getAgentProposalHandlers() {
  return AGENT_PROPOSAL_HANDLERS;
}

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

function buildFindWhatChangedResult(opts = {}) {
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
    label: AGENT_MODE_LABELS['find-what-changed'],
    status: 'completed',
    policy: { writeLevel: 'read-only', requiresConfirmationForWrites: true },
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

function buildProposalContent(proposal) {
  const isContext = proposal?.surface === 'context';
  const lines = ['### Proposed update', isContext ? 'I think you want to update your profile context:' : 'I think you want to update your supplement log:', ''];
  for (const change of proposal.changes || []) {
    if (change.action === 'add_or_update') {
      const bits = [change.name, change.dosage, change.schedule, change.startDate ? `started ${change.startDate}` : ''].filter(Boolean);
      lines.push(`- Add/update ${bits.join(' · ')}`);
    } else if (change.action === 'end') {
      lines.push(`- Mark ${change.name} as stopped${change.endDate ? ` on ${change.endDate}` : ''}`);
    } else if (change.field === 'sleepRest') {
      lines.push(`- Sleep & Rest: poor sleep context${change.patch?.note ? ` — ${change.patch.note}` : ''}`);
    } else if (change.field === 'exercise') {
      lines.push(`- Exercise & Movement: restarted training${change.patch?.note ? ` — ${change.patch.note}` : ''}`);
    } else if (change.field === 'lightCircadian') {
      lines.push(`- Light & Circadian: low sunlight/UV exposure${change.patch?.note ? ` — ${change.patch.note}` : ''}`);
    } else if (change.field === 'healthGoals') {
      lines.push(`- Health goal: ${change.item?.text || ''}`);
    }
  }
  lines.push('', 'Nothing has been saved yet. Apply these changes?');
  return lines.join('\n');
}

function attachPersonality(message) {
  const personality = getActivePersonality?.();
  if (personality) {
    message.personalityName = personality.name;
    message.personalityIcon = personality.icon;
  }
  return message;
}

export function classifyAgentIntent(text = '') {
  const s = String(text || '');
  const entities = [];
  const supplementRegexes = [
    { action: 'started', re: /\b(?:started|added|began|begin|taking)\s+([a-z0-9 +_-]{2,40})/ig },
    { action: 'stopped', re: /\b(?:stopped|quit|removed|discontinued)\s+([a-z0-9 +_-]{2,40})/ig },
  ];
  for (const { action, re } of supplementRegexes) {
    let m;
    while ((m = re.exec(s))) {
      const raw = (m[1] || '').replace(/\b(last|this|week|month|today|yesterday)\b.*$/i, '').trim();
      if (raw) entities.push({ type: 'supplement', action, label: raw });
    }
  }
  entities.push(...detectAgentContextSignals(s));
  if (entities.length) return { intent: 'record-context-change', confidence: 'medium', entities };
  const labPlanTopics = detectLabPlanTopics(s);
  if (/\b(lab plan|lab-order plan|order labs|what labs|which labs|test next|markers? to test|blood work)\b/i.test(s) || labPlanTopics.length) {
    return { intent: 'draft-lab-plan', confidence: 'medium', entities: labPlanTopics };
  }
  const navTarget = detectAgentNavigationTarget(s);
  if (navTarget) return { intent: 'navigate', confidence: 'medium', entities: [{ type: 'route', route: navTarget.route, label: navTarget.label, writeLevel: 'navigation' }] };
  if (/\b(what changed|changed|new labs|uploaded|compare)\b/i.test(s)) return { intent: 'find-what-changed', confidence: 'medium', entities };
  return { intent: 'chat', confidence: 'low', entities };
}

export async function runGetbasedAgentMode(mode, opts = {}) {
  if (mode !== 'find-what-changed') throw new Error(`Unsupported getbased agent mode: ${mode}`);
  const result = buildFindWhatChangedResult(opts);
  if (opts.appendToChat === true) {
    state.chatHistory.push(attachPersonality(result.assistantMessage));
    await saveChatHistory();
    renderChatMessages();
  }
  return result;
}

function buildNavigationContent(target) {
  return [`### Opening ${target.label}`, `I'll take you to ${target.label}.`, '', 'No profile changes were applied.'].join('\n');
}

function buildNavigationResult(target) {
  const navResult = executeAgentNavigation(target.route);
  const assistantMessage = attachPersonality({
    role: 'assistant',
    content: buildNavigationContent(target),
    auto: true,
    agentMode: 'navigate',
    agentNavigation: { route: target.route, label: target.label, status: navResult.status },
  });
  return {
    mode: 'navigate',
    label: AGENT_MODE_LABELS.navigate,
    status: navResult.status,
    policy: { writeLevel: 'navigation', requiresConfirmationForWrites: false },
    toolCalls: [{ id: 'open_view', status: navResult.status, route: target.route }],
    assistantMessage,
  };
}

function buildLabPlanContent(plan) {
  const lines = ['### Draft lab plan', 'Draft only — nothing is ordered, saved, or sent anywhere.', ''];
  for (const bundle of plan.bundles || []) {
    lines.push(`- ${bundle.label}: ${(bundle.markers || []).join(', ')}`);
  }
  lines.push('', 'Use this as a starting point and refine against local lab availability.');
  return lines.join('\n');
}

function buildLabPlanResult(text, opts = {}) {
  const plan = draftLabPlan(text, opts);
  if (!plan) return null;
  const assistantMessage = attachPersonality({
    role: 'assistant',
    content: buildLabPlanContent(plan),
    auto: true,
    agentMode: 'draft-lab-plan',
    labPlanDraft: plan,
  });
  return {
    mode: 'draft-lab-plan',
    label: AGENT_MODE_LABELS['draft-lab-plan'],
    status: 'completed',
    policy: { writeLevel: 'draft-only', requiresConfirmationForWrites: true },
    toolCalls: [{ id: 'draft_lab_plan', status: 'completed' }],
    assistantMessage,
    labPlanDraft: plan,
  };
}

export async function handleAgentUserTurn(text, opts = {}) {
  const intent = classifyAgentIntent(text);
  if (intent.intent === 'draft-lab-plan') {
    const result = buildLabPlanResult(text, opts);
    if (!result) return { handled: false, intent };
    if (opts.appendToChat === true) {
      state.chatHistory.push(result.assistantMessage);
      await saveChatHistory();
      renderChatMessages();
    }
    return { handled: true, intent, result };
  }
  if (intent.intent === 'navigate') {
    const target = detectAgentNavigationTarget(text);
    if (!target) return { handled: false, intent };
    const result = buildNavigationResult(target);
    if (opts.appendToChat === true) {
      state.chatHistory.push(result.assistantMessage);
      await saveChatHistory();
      renderChatMessages();
    }
    return { handled: true, intent, result };
  }
  if (intent.intent !== 'record-context-change') return { handled: false, intent };
  const proposal = Object.values(AGENT_PROPOSAL_HANDLERS).map(handler => handler.draft(text, opts)).find(Boolean);
  if (!proposal) return { handled: false, intent };
  const assistantMessage = attachPersonality({
    role: 'assistant',
    content: buildProposalContent(proposal),
    auto: true,
    agentMode: 'record-context-change',
    agentProposal: proposal,
  });
  const result = {
    mode: 'record-context-change',
    label: AGENT_MODE_LABELS['record-context-change'],
    status: 'awaiting_confirmation',
    policy: { writeLevel: 'draft-only', requiresConfirmationForWrites: true },
    toolCalls: [{ id: proposal.surface === 'context' ? 'draft_context_change' : 'draft_supplement_change', status: 'completed' }],
    assistantMessage,
  };
  if (opts.appendToChat === true) {
    state.chatHistory.push(assistantMessage);
    await saveChatHistory();
    renderChatMessages();
  }
  return { handled: true, intent, result };
}

export async function applyAgentProposalFromChat(msgIndex) {
  const msg = state.chatHistory[msgIndex];
  const proposal = msg?.agentProposal;
  if (!msg || !proposal || proposal.status === 'applied') return null;
  const handler = AGENT_PROPOSAL_HANDLERS[proposal.surface];
  if (!handler?.apply) return null;
  const result = await handler.apply(proposal);
  proposal.status = 'applied';
  msg.content = `${msg.content}\n\n✅ Applied. ${handler.appliedMessage}`;
  msg.agentApplyResult = result;
  await saveChatHistory();
  renderChatMessages();
  window.showNotification?.(handler.notification, 'success');
  return result;
}

function collectProposalEditValues(msgIndex) {
  const card = document.querySelector(`.agent-proposal-card[data-agent-proposal-message-index="${msgIndex}"]`);
  if (!card) return {};
  const edits = {};
  card.querySelectorAll('[data-agent-proposal-change-index][data-agent-proposal-field]').forEach(el => {
    if (!(el instanceof HTMLInputElement)) return;
    const changeIndex = el.dataset.agentProposalChangeIndex;
    const field = el.dataset.agentProposalField;
    if (changeIndex == null || !field) return;
    if (!edits[changeIndex]) edits[changeIndex] = {};
    edits[changeIndex][field] = el.value;
  });
  return edits;
}

export function editAgentProposalFromChat(msgIndex) {
  const msg = state.chatHistory[msgIndex];
  const proposal = msg?.agentProposal;
  if (!proposal || proposal.status !== 'pending') return;
  const handler = AGENT_PROPOSAL_HANDLERS[proposal.surface];
  if (!handler?.editable) return;
  proposal.editing = true;
  renderChatMessages();
}

export async function saveAgentProposalEditsFromChat(msgIndex) {
  const msg = state.chatHistory[msgIndex];
  if (!msg?.agentProposal || msg.agentProposal.status !== 'pending') return null;
  const handler = AGENT_PROPOSAL_HANDLERS[msg.agentProposal.surface];
  if (!handler?.revise) return null;
  msg.agentProposal = handler.revise(msg.agentProposal, collectProposalEditValues(msgIndex));
  msg.agentProposal.editing = false;
  msg.content = buildProposalContent(msg.agentProposal);
  await saveChatHistory();
  renderChatMessages();
  return msg.agentProposal;
}

export async function dismissAgentProposalFromChat(msgIndex) {
  const msg = state.chatHistory[msgIndex];
  if (!msg?.agentProposal) return;
  msg.agentProposal.status = 'dismissed';
  await saveChatHistory();
  renderChatMessages();
}

export function getGetbasedAgentModes() {
  return [
    { id: 'find-what-changed', label: AGENT_MODE_LABELS['find-what-changed'], writeLevel: 'read-only' },
  ];
}

Object.assign(window, {
  applyAgentProposalFromChat,
  classifyAgentIntent,
  dismissAgentProposalFromChat,
  editAgentProposalFromChat,
  getAgentProposalHandlers,
  getAgentToolRegistry,
  getGetbasedAgentModes,
  handleAgentUserTurn,
  runGetbasedAgentMode,
  saveAgentProposalEditsFromChat,
});
