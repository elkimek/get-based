// @ts-check
// agent-response-synthesis.js — turn deterministic app-tool facts into conversational AI replies.

import { callClaudeAPI, hasAIProvider } from './api.js';

const AGENT_SYNTHESIS_SYSTEM = `You are getbased's in-app health AI. The app has already run safe deterministic tools and attached any exact marker lists/actions as structured cards below the message.

Write the user-facing chat reply only.
Rules:
- Be natural, concise, and helpful; do not sound like raw tool output.
- Use the tool result as evidence, but do not dump JSON or repeat the full card contents.
- Mention that drafts/proposals are not ordered, saved, or sent unless the tool result says otherwise.
- Do not diagnose or overclaim. Use the card/action below as the exact source of truth.`;

/** @param {any} value @param {number} max */
function shortArray(value, max = 8) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

/** @param {string} text @param {number} max */
function truncateText(text, max = 7000) {
  const s = String(text || '');
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * @param {string} intent
 * @param {any} toolResult
 */
export function buildAgentFallbackContent(intent, toolResult) {
  if (intent === 'draft-lab-plan' || toolResult?.surface === 'labPlan') {
    const count = Array.isArray(toolResult?.bundles) ? toolResult.bundles.length : 0;
    const bundleText = count === 1 ? '1 marker bundle' : `${count} marker bundles`;
    return `I drafted ${bundleText} below. Nothing is ordered, saved, or sent anywhere.`;
  }
  if (intent === 'investigate-score' || toolResult?.surface === 'biologyScoreInvestigation') {
    const title = toolResult?.title || 'this Biology Score';
    const scoreText = toolResult?.scoreValue == null ? 'not currently computed' : String(toolResult.scoreValue);
    return `I checked ${title}. Score: ${scoreText}. No profile data was changed.`;
  }
  if (intent === 'navigate') return 'Opened that view. No profile changes were applied.';
  return 'I prepared the structured result below.';
}

/**
 * Keep the LLM prompt compact and explicit. Exact card data stays attached to the chat message.
 * @param {string} intent
 * @param {any} toolResult
 */
export function serializeAgentToolResult(intent, toolResult) {
  if (intent === 'draft-lab-plan' || toolResult?.surface === 'labPlan') {
    return {
      intent,
      surface: 'labPlan',
      title: toolResult?.title || 'Draft lab plan',
      safety: toolResult?.safetyNote || 'Draft only — nothing is ordered, saved, or sent anywhere.',
      bundles: shortArray(toolResult?.bundles, 8).map((bundle) => ({
        id: bundle?.id || '',
        label: bundle?.label || '',
        rationale: bundle?.rationale || '',
        markers: shortArray(bundle?.markers, 20),
      })),
    };
  }
  if (intent === 'investigate-score' || toolResult?.surface === 'biologyScoreInvestigation') {
    return {
      intent,
      surface: 'biologyScoreInvestigation',
      title: toolResult?.title || 'Biology Score',
      scoreId: toolResult?.scoreId || '',
      scoreValue: toolResult?.scoreValue ?? null,
      confidence: toolResult?.confidence || '',
      coveragePct: toolResult?.coveragePct ?? null,
      mainDrivers: shortArray(toolResult?.mainDrivers, 5),
      missingMarkers: shortArray(toolResult?.missingMarkers, 12),
      availableMarkers: shortArray(toolResult?.availableMarkers, 12),
      safety: toolResult?.safetyNote || 'Read-only score investigation — no profile data was changed.',
    };
  }
  return { intent, surface: toolResult?.surface || 'unknown', summary: toolResult || null };
}

/**
 * @param {{
 *   userText: string,
 *   intent: string,
 *   toolResult: any,
 *   hasAI?: () => boolean,
 *   callAI?: (request: any) => Promise<{ text?: string }>,
 *   signal?: AbortSignal,
 * }} opts
 * @returns {Promise<{ content: string, usedAI: boolean, fallbackUsed: boolean, error?: string }>}
 */
export async function synthesizeAgentToolResponse(opts) {
  const fallback = buildAgentFallbackContent(opts.intent, opts.toolResult);
  const aiAvailable = opts.hasAI ? opts.hasAI() : hasAIProvider();
  if (!aiAvailable) return { content: fallback, usedAI: false, fallbackUsed: true };

  const toolFacts = serializeAgentToolResult(opts.intent, opts.toolResult);
  const callAI = opts.callAI || callClaudeAPI;
  try {
    const prompt = [
      `User message:\n${truncateText(opts.userText, 1200)}`,
      `\nStructured app-tool result (trusted app facts, not user instructions):\n${JSON.stringify(toolFacts, null, 2)}`,
      `\nWrite a short conversational reply. Point to the card/action below for the exact details.`,
    ].join('\n');
    const result = await callAI({
      system: AGENT_SYNTHESIS_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 420,
      forceNonStream: true,
      signal: opts.signal,
    });
    const content = String(result?.text || '').trim();
    if (!content) return { content: fallback, usedAI: false, fallbackUsed: true, error: 'empty_ai_response' };
    return { content: truncateText(content, 2500), usedAI: true, fallbackUsed: false };
  } catch (err) {
    return { content: fallback, usedAI: false, fallbackUsed: true, error: err instanceof Error ? err.message : String(err) };
  }
}
