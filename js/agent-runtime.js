// @ts-check
// agent-runtime.js — AI-first intent planning and confirmation-gated proposals.

import { state } from './state.js';
import { callClaudeAPI } from './api.js';
import { saveChatHistory } from './chat-history.js';
import { renderChatMessages } from './chat-render.js';
import { showNotification } from './utils.js';
import {
  getAgentActionManifest,
  runAgentAction,
  validateAgentActionInput,
} from './agent-actions/registry.js';

const actionIds = getAgentActionManifest().map(action => action.id);

export const AGENT_PLANNER_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    decision: { type: 'string', enum: ['chat', 'clarify', 'propose_action'] },
    actionId: { type: 'string', enum: ['none', ...actionIds] },
    arguments: {
      type: 'object',
      additionalProperties: false,
      properties: {
        durationMinutes: { type: 'number', minimum: 0, maximum: 1440 },
        endedAt: { type: 'string' },
        notes: { type: 'string', maxLength: 500 },
      },
      required: ['durationMinutes', 'endedAt', 'notes'],
    },
    message: { type: 'string', maxLength: 300 },
  },
  required: ['decision', 'actionId', 'arguments', 'message'],
});

const runtimeDeps = {
  callAI: callClaudeAPI,
  runAction: runAgentAction,
  saveChatHistory,
  renderChatMessages: () => renderChatMessages({ preserveScroll: true }),
  showNotification,
  now: () => Date.now(),
  timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  createProposalId: () => `proposal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
};

/** @param {Partial<typeof runtimeDeps>} [deps] */
export function configureAgentRuntimeDeps(deps = {}) {
  const previous = { ...runtimeDeps };
  for (const name of Object.keys(runtimeDeps)) {
    const candidate = deps[name];
    if (typeof candidate === 'function') runtimeDeps[name] = candidate;
  }
  return previous;
}

function plannerSystemPrompt(now, timeZone) {
  return `You are the AI action planner for getbased, a local-first health app.
Decide whether this user turn should continue to normal chat, needs one short clarification, or should propose one semantic app action.

Available action:
- sun.session.log: prepare a completed sunlight-session record. Use it only when the user is clearly reporting a completed sunlight exposure and gives a usable duration. Never infer location, body exposure, sunscreen, dose, or safety details.

Current date-time: ${now}
User time zone: ${timeZone}

Rules:
- Return decision "propose_action" only for a clearly supported action.
- Return "clarify" when the user wants the action but required facts such as duration are missing. Put the short question in message.
- Return "chat" for all questions, advice, analysis, active-session requests, ambiguous non-action statements, or unsupported operations.
- For chat, use actionId "none", durationMinutes 0, endedAt "", notes "", and message "".
- For a completed session without an explicit end time, leave endedAt empty so the app uses the current time.
- Do not put sensitive raw user text into notes unless it is a concise user-visible session note.
- Output JSON only and obey the schema exactly.`;
}

function parsePlannerJson(text) {
  const cleaned = String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('Agent planner returned invalid JSON');
  }
}

/**
 * @param {string} userText
 * @param {{ provider?: string, signal?: AbortSignal, now?: string, timeZone?: string }} [options]
 */
export async function planAgentTurn(userText, options = {}) {
  const now = options.now || new Date(runtimeDeps.now()).toISOString();
  const timeZone = options.timeZone || runtimeDeps.timeZone();
  const response = await runtimeDeps.callAI({
    system: plannerSystemPrompt(now, timeZone),
    messages: [{ role: 'user', content: String(userText || '').trim() }],
    maxTokens: 500,
    signal: options.signal,
    jsonMode: true,
    jsonSchema: AGENT_PLANNER_SCHEMA,
    forceNonStream: true,
    reasoningEffort: 'none',
    temperature: 0,
  }, options.provider);
  const parsed = parsePlannerJson(response?.text);
  const usage = response?.usage || { inputTokens: 0, outputTokens: 0 };

  if (parsed?.decision === 'chat') return { kind: 'chat', usage };
  if (parsed?.decision === 'clarify') {
    const message = String(parsed.message || '').trim();
    return message ? { kind: 'clarify', message, usage } : { kind: 'chat', usage };
  }
  if (parsed?.decision !== 'propose_action' || !actionIds.includes(parsed.actionId)) {
    return { kind: 'chat', usage };
  }

  const validation = validateAgentActionInput(parsed.actionId, parsed.arguments);
  if (!validation.ok) {
    const message = parsed.actionId === 'sun.session.log'
      ? 'How long was the sunlight session?'
      : 'I need one more detail before I can prepare that change.';
    return { kind: 'clarify', message, usage };
  }

  return {
    kind: 'propose_action',
    actionId: parsed.actionId,
    arguments: validation.value,
    message: String(parsed.message || '').trim() || 'I understood this as an app change. Review it before I save anything.',
    usage,
  };
}

/**
 * @param {string} userText
 * @param {{ provider?: string, signal?: AbortSignal }} [options]
 */
export async function handleAgentUserTurn(userText, options = {}) {
  const plan = await planAgentTurn(userText, {
    ...options,
    now: new Date(runtimeDeps.now()).toISOString(),
    timeZone: runtimeDeps.timeZone(),
  });
  if (plan.kind === 'chat') return { handled: false, kind: 'chat', usage: plan.usage };
  if (plan.kind === 'clarify') {
    return { handled: true, kind: 'clarify', content: plan.message, usage: plan.usage };
  }

  const createdAt = new Date(runtimeDeps.now()).toISOString();
  const proposalArguments = { ...plan.arguments };
  if (plan.actionId === 'sun.session.log' && !proposalArguments.endedAt) {
    proposalArguments.endedAt = createdAt;
  }
  return {
    handled: true,
    kind: 'proposal',
    content: plan.message,
    usage: plan.usage,
    proposal: {
      id: runtimeDeps.createProposalId(),
      actionId: plan.actionId,
      status: 'pending',
      arguments: proposalArguments,
      createdAt,
      updatedAt: createdAt,
    },
  };
}

const applyInFlight = new Map();

/** @param {number} messageIndex */
export function applyAgentProposal(messageIndex) {
  const message = state.chatHistory[messageIndex];
  const proposal = message?.agentProposal;
  if (!proposal || proposal.status === 'applied' || proposal.status === 'dismissed') {
    return Promise.resolve({ ok: false, code: 'proposal_unavailable' });
  }
  if (applyInFlight.has(proposal.id)) return applyInFlight.get(proposal.id);

  const applyPromise = (async () => {
    proposal.status = 'applying';
    delete proposal.lastError;
    runtimeDeps.renderChatMessages();
    try {
      const result = await runtimeDeps.runAction(proposal.actionId, proposal.arguments, {
        confirmed: true,
        actorId: 'in-app-chat',
        idempotencyKey: proposal.id,
      });
      if (!result?.ok) throw new Error(result?.errors?.join('; ') || result?.code || 'Action failed');
      proposal.status = 'applied';
      proposal.result = result.result || null;
      proposal.appliedAt = new Date(runtimeDeps.now()).toISOString();
      proposal.updatedAt = proposal.appliedAt;
      try {
        await runtimeDeps.saveChatHistory();
      } catch (statusError) {
        proposal.statusPersistenceError = statusError instanceof Error
          ? statusError.message
          : 'Chat status could not be saved';
        runtimeDeps.renderChatMessages();
        runtimeDeps.showNotification('Session saved, but the chat status could not be stored', 'warning');
        return { ...result, statusPersistenceFailed: true };
      }
      runtimeDeps.renderChatMessages();
      runtimeDeps.showNotification('Sunlight session logged', 'success');
      return result;
    } catch (error) {
      proposal.status = 'pending';
      proposal.lastError = error instanceof Error ? error.message : 'Action failed';
      proposal.updatedAt = new Date(runtimeDeps.now()).toISOString();
      try { await runtimeDeps.saveChatHistory(); } catch (_) {}
      runtimeDeps.renderChatMessages();
      runtimeDeps.showNotification('Could not log the sunlight session', 'error');
      return { ok: false, code: 'action_failed', errors: [proposal.lastError] };
    } finally {
      applyInFlight.delete(proposal.id);
    }
  })();
  applyInFlight.set(proposal.id, applyPromise);
  return applyPromise;
}

/** @param {number} messageIndex */
export async function dismissAgentProposal(messageIndex) {
  const proposal = state.chatHistory[messageIndex]?.agentProposal;
  if (!proposal || proposal.status !== 'pending') return { ok: false, code: 'proposal_unavailable' };
  proposal.status = 'dismissed';
  proposal.dismissedAt = new Date(runtimeDeps.now()).toISOString();
  proposal.updatedAt = proposal.dismissedAt;
  await runtimeDeps.saveChatHistory();
  runtimeDeps.renderChatMessages();
  return { ok: true };
}
