// @ts-check
// biology-score-ai.js — embedded AI interpretation for deterministic Biology Scores.

/** @param {any} score */
function scoreLine(score) {
  const scoreText = Number.isFinite(score.score) ? `${score.score}/100` : 'not current';
  const toneText = score.tone || 'not scored';
  const coverageText = `${Math.round((score.coverage || 0) * 100)}% coverage`;
  const recency = score.recencyStatus && score.recencyStatus !== 'fresh' ? `; recency: ${score.recencyBadge}` : '';
  const used = score.available.map(item => {
    const fit = item.profileContextOnly || !Number.isFinite(item.partial) ? 'context only / excluded from score' : `fit ${Math.round(item.partial)}/100`;
    return `${item.label}: ${item.displayValue}${item.unit ? ` ${item.unit}` : ''}, ${fit}, date ${item.date || 'unknown'}`;
  }).join('\n');
  const missing = score.missing.map(item => item.label).join(', ') || 'none';
  const flags = score.flags?.join('\n') || 'none';
  return `Question: ${score.question || ''}\nScore: ${scoreText}; tone: ${toneText}; ${coverageText}${recency}\nMinimum useful panel: ${(score.basicInputs || []).join(', ')}\nExtended confidence panel: ${(score.extendedInputs || []).join(', ')}\nUsed inputs:\n${used || 'none'}\nMissing inputs: ${missing}\nFlags:\n${flags}`;
}

/** @param {any} score */
export async function generateBiologyScoreAIAnswer(score) {
  if (!score) throw new Error('Score not found');
  const hasProvider = (/** @type {any} */ (window)).hasAIProvider?.();
  if (!hasProvider) throw new Error('Connect an AI provider first.');
  if ((/** @type {any} */ (window)).isAIPaused?.()) throw new Error('AI features are paused.');
  const callAI = (/** @type {any} */ (window)).callClaudeAPI;
  if (!callAI) throw new Error('AI engine is not available on this screen.');
  const system = `You explain deterministic getbased Biology Scores. The code already computed the score. Do not recalculate it, diagnose, prescribe, or overclaim. Answer the score question in 3-5 concise bullets. Mention: what the pattern suggests, confidence/coverage limits, missing extended markers if important, and one practical next check/retest direction. Keep it readable for non-expert users.`;
  const { text } = await callAI({
    system,
    messages: [{ role: 'user', content: scoreLine(score) }],
    maxTokens: 360,
    forceNonStream: true,
  });
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}
