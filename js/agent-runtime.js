// @ts-check
// agent-runtime.js — browser-local getbased agent spine and confirmation-gated modes

import { state } from './state.js';
import { callClaudeAPI, hasAIProvider } from './api.js';
import { saveChatHistory } from './chat-history.js';
import { renderChatMessages } from './chat-render.js';
import { getActivePersonality } from './chat-personalities.js';
import {
  applyContextChangeProposal,
  applySupplementChangeProposal,
  buildContextChangeProposalFromStructured,
  compareLatestLabEntries,
  detectAgentContextSignals,
  detectAgentNavigationTarget,
  detectBiologyScoreTarget,
  detectLabPlanTopics,
  draftContextChangeProposal,
  draftLabPlan,
  draftSupplementChangeProposal,
  executeAgentNavigation,
  getAgentContextExtractionPrompt,
  getAgentProfileSnapshot,
  getAgentToolRegistry,
  investigateBiologyScore,
  reviseSupplementChangeProposal,
} from './agent-tools.js';
import {
  applyAgentAction,
  getAgentProposalSurfaceHandlers,
  listAgentActions,
  resolveAgentActionForIntent,
  resolveAgentActionForProposal,
  reviseAgentActionProposal,
  runAgentAction,
} from './agent-actions/registry.js';
import { synthesizeAgentToolResponse } from './agent-response-synthesis.js';
import { classifyAmbiguousAgentIntent, extractAgentJson } from './agent-intent-router.js';

const AGENT_MODE_LABELS = {
  'find-what-changed': 'Find what changed',
  'record-context-change': 'Update profile context',
  'draft-lab-plan': 'Draft lab plan',
  'investigate-score': 'Investigate Biology Score',
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
  return getAgentProposalSurfaceHandlers();
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
  const target = isContext ? 'profile context' : 'supplement log';
  return `I prepared a ${target} update. Nothing has been saved yet — review the card below and apply it only if it looks right.`;
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
  const explicitLabPlan = /\b(lab plan|lab-order plan|order labs|what labs|which labs|test next|markers? to test|blood work)\b/i.test(s);
  if (explicitLabPlan) return { intent: 'draft-lab-plan', confidence: 'medium', entities: labPlanTopics };
  const scoreTarget = detectBiologyScoreTarget(s);
  if (scoreTarget) return { intent: 'investigate-score', confidence: 'medium', entities: [scoreTarget] };
  const navTarget = detectAgentNavigationTarget(s);
  if (navTarget) return { intent: 'navigate', confidence: 'medium', entities: [{ type: 'route', route: navTarget.route, label: navTarget.label, writeLevel: 'navigation' }] };
  if (/\b(what changed|changed|new labs|uploaded|compare)\b/i.test(s)) return { intent: 'find-what-changed', confidence: 'medium', entities };
  return { intent: 'chat', confidence: 'low', entities };
}

export async function resolveAgentIntent(text = '', opts = {}) {
  const deterministic = classifyAgentIntent(text);
  if (deterministic.intent !== 'chat') return deterministic;
  if (opts.useAIRouter === false) return deterministic;
  const classifyAI = opts.classifyAgentIntentAI || classifyAmbiguousAgentIntent;
  const routed = await classifyAI(text, { signal: opts.signal });
  if (!routed || routed.intent === 'chat') return { ...deterministic, router: routed || null };
  return {
    intent: routed.intent,
    confidence: routed.confidence || 'medium',
    entities: Array.isArray(routed.entities) ? routed.entities : [],
    router: routed,
  };
}

export async function runGetbasedAgentMode(mode, opts = {}) {
  const action = resolveAgentActionForIntent(mode);
  if (!action || action.mode !== mode) throw new Error(`Unsupported getbased agent mode: ${mode}`);
  const result = await runAgentAction(action.id, { text: opts.text || '' }, opts);
  if (!result) return null;
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
  const count = Array.isArray(plan?.bundles) ? plan.bundles.length : 0;
  const bundleText = count === 1 ? '1 marker bundle' : `${count} marker bundles`;
  return `I drafted ${bundleText} below. Nothing is ordered, saved, or sent anywhere.`;
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

async function buildLabPlanResult(text, opts = {}) {
  const plan = draftLabPlan(text, opts);
  if (!plan) return null;
  const fallbackContent = buildLabPlanContent(plan);
  const content = await buildSynthesizedContent('draft-lab-plan', plan, fallbackContent, text, opts);
  const assistantMessage = attachPersonality({
    role: 'assistant',
    content,
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

function buildScoreInvestigationContent(investigation) {
  const scoreText = investigation.scoreValue == null ? 'not currently computed' : String(investigation.scoreValue);
  return [`### ${investigation.title}`, `I checked the current score state below. Score: ${scoreText}. No profile data was changed.`].join('\n');
}

async function buildScoreInvestigationResult(text, opts = {}) {
  const investigation = investigateBiologyScore(text, opts);
  if (!investigation) return null;
  const fallbackContent = buildScoreInvestigationContent(investigation);
  const content = await buildSynthesizedContent('investigate-score', investigation, fallbackContent, text, opts);
  const assistantMessage = attachPersonality({
    role: 'assistant',
    content,
    auto: true,
    agentMode: 'investigate-score',
    scoreInvestigation: investigation,
  });
  return {
    mode: 'investigate-score',
    label: AGENT_MODE_LABELS['investigate-score'],
    status: 'completed',
    policy: { writeLevel: 'read-only', requiresConfirmationForWrites: true },
    toolCalls: [{ id: 'investigate_biology_score', status: 'completed', scoreId: investigation.scoreId }],
    assistantMessage,
    scoreInvestigation: investigation,
  };
}

async function buildStructuredContextProposal(text, opts = {}) {
  if (typeof opts.extractContextChangeProposal === 'function') {
    const structured = await opts.extractContextChangeProposal({ userText: text, signal: opts.signal });
    return buildContextChangeProposalFromStructured(structured, { sourceText: text, extractedBy: 'ai-structured-test' });
  }
  const canUseAI = opts.hasAIProvider ? opts.hasAIProvider() : hasAIProvider();
  if (!canUseAI) return null;
  const callAI = opts.callContextExtractorAI || callClaudeAPI;
  try {
    const result = await callAI({
      system: getAgentContextExtractionPrompt(),
      messages: [{ role: 'user', content: `User message:\n${String(text || '').slice(0, 2000)}` }],
      maxTokens: 900,
      forceNonStream: true,
      signal: opts.signal,
    });
    const parsed = extractAgentJson(result?.text || '');
    return buildContextChangeProposalFromStructured(parsed, { sourceText: text, extractedBy: 'ai-structured' });
  } catch {
    return null;
  }
}

function shouldTryStructuredContextExtraction(text, intent) {
  const sourceText = String(text || '');
  if (intent?.intent === 'record-context-change') return true;
  if (intent?.router?.intent === 'record-context-change') return true;
  if (intent?.intent && intent.intent !== 'chat') return false;
  const educational = /\b(tell me|explain|story|metaphor|evolution|mechanism|research|what do you think|how does|why does)\b/i.test(sourceText);
  const explicitlyPersonal = /\b(my|i am|i'm|im|i have|i’m having|i feel|i started|i stopped)\b|m[áa]m|jsem|moje|za[čc]al|p[řr]estal/i.test(sourceText);
  if (educational && !explicitlyPersonal) return false;
  const contextSignal = /\b(sleep|insomnia|training|exercise|sunlight|low uv|digestion|digestive|gut|bowel|stool|bloat|gas|reflux|heartburn|nausea|appetite|abdominal|stomach|constipat|diarrh|goal)\b|sp[áa]nek|tr[áa]ven[íi]|stolice|z[áa]cp|pr[ůu]jem|nad[ýy]m|nafoukl|c[íi]l/i.test(sourceText);
  return explicitlyPersonal && contextSignal;
}

function getActiveLabPlanDraft() {
  for (let i = state.chatHistory.length - 1; i >= 0; i--) {
    const plan = state.chatHistory[i]?.labPlanDraft;
    if (plan?.surface === 'labPlan' && Array.isArray(plan.bundles)) return plan;
  }
  return null;
}

function getActiveScoreInvestigation() {
  for (let i = state.chatHistory.length - 1; i >= 0; i--) {
    const investigation = state.chatHistory[i]?.scoreInvestigation;
    if (investigation?.surface === 'biologyScoreInvestigation') return investigation;
  }
  return null;
}

function looksLikeScoreToLabPlanFollowup(text) {
  const sourceText = String(text || '');
  return /\b(what|which|markers?|labs?|test|testing|order|check|improve confidence|missing)\b/i.test(sourceText)
    && /\b(test|tests|labs?|markers?|confidence|coverage|missing|next)\b/i.test(sourceText);
}

function looksLikeLabPlanModificationFollowup(text) {
  const sourceText = String(text || '');
  return /\b(add|include|append|put|remove|drop|delete|without|cheaper|cheap|budget|lower cost|less expensive|minimum|minimal|core only|optional)\b/i.test(sourceText)
    && /\b(that|this|these|those|list|plan|panel|markers?|labs?|test|apob|apo ?b|c[- ]?peptide|shbg|hba1c|hs[- ]?crp|tsh|lh|fsh|mma)\b/i.test(sourceText);
}

export async function handleAgentUserTurn(text, opts = {}) {
  const activeLabPlanDraft = getActiveLabPlanDraft();
  if (activeLabPlanDraft && looksLikeLabPlanModificationFollowup(text)) {
    const result = await runAgentAction('labPlan.modify', { text, labPlanDraft: activeLabPlanDraft }, opts);
    if (result) {
      result.assistantMessage = attachPersonality(result.assistantMessage);
      const intent = { intent: 'modify-lab-plan', confidence: 'high', reason: 'Follow-up refers to active lab-plan artifact.' };
      if (opts.appendToChat === true) {
        state.chatHistory.push(result.assistantMessage);
        await saveChatHistory();
        renderChatMessages();
      }
      return { handled: true, intent, result };
    }
  }
  const activeScoreInvestigation = getActiveScoreInvestigation();
  if (activeScoreInvestigation && looksLikeScoreToLabPlanFollowup(text)) {
    const result = await runAgentAction('labPlan.fromScoreInvestigation', { text, scoreInvestigation: activeScoreInvestigation }, opts);
    if (result) {
      result.assistantMessage = attachPersonality(result.assistantMessage);
      const intent = { intent: 'draft-lab-plan-from-score', confidence: 'high', reason: 'Follow-up asks what to test from active score investigation.' };
      if (opts.appendToChat === true) {
        state.chatHistory.push(result.assistantMessage);
        await saveChatHistory();
        renderChatMessages();
      }
      return { handled: true, intent, result };
    }
  }
  const intent = await resolveAgentIntent(text, opts);
  const directAction = resolveAgentActionForIntent(intent);
  if (directAction && intent.intent !== 'record-context-change') {
    const input = { text };
    if (intent.intent === 'navigate') input.target = detectAgentNavigationTarget(text);
    const result = await runAgentAction(directAction.id, input, opts);
    if (!result) return { handled: false, intent };
    result.assistantMessage = attachPersonality(result.assistantMessage);
    if (opts.appendToChat === true) {
      state.chatHistory.push(result.assistantMessage);
      await saveChatHistory();
      renderChatMessages();
    }
    return { handled: true, intent, result };
  }
  let proposal = null;
  if (intent.intent === 'record-context-change') {
    proposal = Object.values(getAgentProposalHandlers()).map(handler => handler.draft(text, opts)).find(Boolean);
  }
  if (!proposal && shouldTryStructuredContextExtraction(text, intent)) proposal = await buildStructuredContextProposal(text, opts);
  if (!proposal) return { handled: false, intent };
  const effectiveIntent = intent.intent === 'record-context-change'
    ? intent
    : { ...intent, intent: 'record-context-change', confidence: intent.confidence || 'medium', extractedFromChatFallback: true };
  const actionId = proposal.surface === 'supplements' ? 'supplement.update' : 'context.update';
  const result = await runAgentAction(actionId, { text, proposal }, opts);
  if (!result) return { handled: false, intent: effectiveIntent };
  result.assistantMessage = attachPersonality(result.assistantMessage);
  if (opts.appendToChat === true) {
    state.chatHistory.push(result.assistantMessage);
    await saveChatHistory();
    renderChatMessages();
  }
  return { handled: true, intent: effectiveIntent, result };
}

export async function applyAgentProposalFromChat(msgIndex) {
  const msg = state.chatHistory[msgIndex];
  const proposal = msg?.agentProposal;
  if (!msg || !proposal || proposal.status !== 'pending' || proposal.requiresConfirmation !== true) return null;
  const action = resolveAgentActionForProposal(proposal);
  if (!action?.apply) return null;
  const rollbackData = JSON.stringify(state.importedData || {});
  let result;
  proposal.status = 'applying';
  renderChatMessages();
  try {
    result = await applyAgentAction(action.id, proposal);
  } catch (err) {
    try { state.importedData = JSON.parse(rollbackData); } catch {}
    proposal.status = 'pending';
    window.showNotification?.('Could not save the proposed update. Nothing was applied.', 'error');
    renderChatMessages();
    return null;
  }
  proposal.status = 'applied';
  msg.content = `${msg.content}\n\n✅ Applied. ${action.appliedMessage}`;
  msg.agentApplyResult = result;
  await saveChatHistory();
  renderChatMessages();
  window.showNotification?.(action.notification, 'success');
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
  const action = resolveAgentActionForProposal(proposal);
  if (!action?.editable) return;
  proposal.editing = true;
  renderChatMessages();
}

export async function saveAgentProposalEditsFromChat(msgIndex) {
  const msg = state.chatHistory[msgIndex];
  if (!msg?.agentProposal || msg.agentProposal.status !== 'pending') return null;
  const action = resolveAgentActionForProposal(msg.agentProposal);
  if (!action?.revise) return null;
  msg.agentProposal = reviseAgentActionProposal(action.id, msg.agentProposal, collectProposalEditValues(msgIndex));
  if (!msg.agentProposal) return null;
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
  delete msg.agentProposal.sourceText;
  msg.excludeFromAI = true;
  msg.content = 'Dismissed the proposed update. I’ll answer normally instead.';
  await saveChatHistory();
  renderChatMessages();
}

export function getGetbasedAgentModes() {
  return listAgentActions()
    .filter(action => action.mode === 'find-what-changed')
    .map(action => ({ id: action.mode, label: action.label, writeLevel: action.writeLevel }));
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
  resolveAgentIntent,
  saveAgentProposalEditsFromChat,
});
