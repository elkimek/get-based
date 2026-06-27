// @ts-check
// agent-intent-router.js — tiny AI-assisted classifier for ambiguous in-app agent routing.

import { callClaudeAPI, hasAIProvider, resolveAgentRouterConfig } from './api.js';

const ALLOWED_AGENT_INTENTS = new Set([
  'chat',
  'find-what-changed',
  'record-context-change',
  'draft-lab-plan',
  'investigate-score',
  'navigate',
]);

const ACCEPTED_CONFIDENCE = new Set(['high', 'medium']);

const ROUTER_SYSTEM_PROMPT = `You are getbased's fast intent router. Decide whether the user's message should be handled by a constrained in-app tool before the normal chat model.

Return STRICT JSON only:
{"intent":"chat|find-what-changed|record-context-change|draft-lab-plan|investigate-score|navigate","confidence":"high|medium|low","reason":"short reason"}

Use app-tool intents only for clear app actions:
- draft-lab-plan: user asks which blood/lab markers to test, build a lab plan, or clarify biomarkers.
- investigate-score: user asks why a Biology Score is bad/low/missing/confusing.
- find-what-changed: user asks what changed in latest labs/data.
- record-context-change: user says they started/stopped supplements/meds or wants profile context/goals updated. This only creates a confirmation-gated draft.
- navigate: user asks to open/show a getbased app view.
- chat: general health discussion, stories, education, brainstorming, or anything unsafe/unsupported.

Never invent destructive intents. Never route delete/export/share/payment/account actions to app tools.`;

/** @param {string} text @param {number} max */
function truncateText(text, max = 1200) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** @param {string} text */
export function extractAgentJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

/** @param {any} parsed */
function normalizeRouterResult(parsed) {
  const rawIntent = String(parsed?.intent || 'chat').trim();
  const confidence = String(parsed?.confidence || 'low').trim().toLowerCase();
  const reason = String(parsed?.reason || '').trim();
  if (!ALLOWED_AGENT_INTENTS.has(rawIntent)) {
    return { intent: 'chat', confidence: 'low', reason: `Unsupported router intent: ${rawIntent || 'empty'}` };
  }
  if (rawIntent === 'chat') return { intent: 'chat', confidence, reason: reason || 'Router chose normal chat.' };
  if (!ACCEPTED_CONFIDENCE.has(confidence)) {
    return { intent: 'chat', confidence, reason: reason || `Router confidence was ${confidence || 'missing'}.` };
  }
  return { intent: rawIntent, confidence, reason };
}

/**
 * @param {string} userText
 * @param {{
 *   hasAI?: () => boolean,
 *   callAI?: (request: any, provider?: string) => Promise<{ text?: string }>,
 *   signal?: AbortSignal,
 * }} [opts]
 * @returns {Promise<{ intent: string, confidence: string, reason?: string, usedAI: boolean, fallbackUsed: boolean, error?: string }>}
 */
export async function classifyAmbiguousAgentIntent(userText, opts = {}) {
  const canUseAI = opts.callAI ? true : (opts.hasAI ? opts.hasAI() : hasAIProvider());
  if (!canUseAI) {
    return { intent: 'chat', confidence: 'low', reason: 'No AI provider available for ambiguous routing.', usedAI: false, fallbackUsed: true };
  }
  const callAI = opts.callAI || callClaudeAPI;
  try {
    const routerConfig = resolveAgentRouterConfig();
    const result = await callAI({
      system: ROUTER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `User message:\n${truncateText(userText)}` }],
      maxTokens: 120,
      forceNonStream: true,
      modelId: routerConfig.modelId || undefined,
      signal: opts.signal,
    }, routerConfig.provider);
    const parsed = extractAgentJson(result?.text || '');
    if (!parsed) {
      return { intent: 'chat', confidence: 'low', reason: 'Router returned non-JSON.', usedAI: true, fallbackUsed: true };
    }
    return { ...normalizeRouterResult(parsed), usedAI: true, fallbackUsed: false };
  } catch (err) {
    return {
      intent: 'chat',
      confidence: 'low',
      reason: 'Router failed; falling back to normal chat.',
      usedAI: false,
      fallbackUsed: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function getAgentRouterPromptForTests() {
  return ROUTER_SYSTEM_PROMPT;
}
