// @ts-nocheck
// biology-score-sections.js — question and embedded AI answer sections for Biology Scores.

import { saveImportedData } from './data.js';
import { state } from './state.js';
import { escapeAttr, escapeHTML } from './utils.js';

function renderInlineList(items) {
  return (items || []).map(item => `<span>${escapeHTML(item)}</span>`).join('');
}

export function renderScoreQuestion(score) {
  const question = score.question || `What does ${score.title} say about this biology pattern?`;
  return `<section class="biology-score-question">
    <div class="biology-score-question-kicker">What this score is checking</div>
    <p>${escapeHTML(question)}</p>
    <div class="biology-score-panel-levels" aria-label="Labs used for this score">
      <div><span>Core markers</span><strong>${renderInlineList(score.basicInputs || [])}</strong></div>
      <div><span>Add for better confidence</span><strong>${renderInlineList(score.extendedInputs || [])}</strong></div>
    </div>
  </section>`;
}

function getScoreAICacheKey(score) {
  const basis = [score.id, score.score, score.rawScore, score.coverage, score.recencyStatus, score.recencyBadge, ...score.available.map(item => `${item.key}:${item.displayValue}:${item.date}`), ...score.missing.map(item => `missing:${item.key}`)].join('|');
  return `biology-score-ai-answer:${basis}`;
}

function cleanupLegacyScoreAIAnswerCache() {
  if (typeof localStorage === 'undefined') return;
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('biology-score-ai-answer:')) keys.push(key);
    }
    // Test shims may not implement length/key; cover direct enumerable stores too.
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('biology-score-ai-answer:')) keys.push(key);
    }
    for (const key of new Set(keys)) localStorage.removeItem(key);
  } catch {}
}

function readScoreAIAnswer(score) {
  cleanupLegacyScoreAIAnswerCache();
  const profileAnswer = state.importedData?.biologyScoreAI?.[score.id];
  if (profileAnswer?.text && profileAnswer.fingerprint === getScoreAICacheKey(score)) return profileAnswer.text;
  return '';
}

export async function writeScoreAIAnswer(score, text) {
  cleanupLegacyScoreAIAnswerCache();
  const key = getScoreAICacheKey(score);
  state.importedData.biologyScoreAI = state.importedData.biologyScoreAI || {};
  state.importedData.biologyScoreAI[score.id] = { fingerprint: key, text, updatedAt: Date.now() };
  await saveImportedData({ reason: 'biology-score-ai' });
}

export function renderScoreAIAnswer(score) {
  const cached = readScoreAIAnswer(score);
  return `<section class="biology-score-ai" data-biology-score-ai-panel="${escapeAttr(score.id)}">
    <div class="biology-score-ai-head">
      <div>
        <div class="biology-score-question-kicker">What this means</div>
        <p>A short, non-diagnostic read of what this pattern suggests and what to check next.</p>
      </div>
      <button type="button" class="dashboard-action-btn dashboard-action-btn-secondary" data-biology-score-action="interpret-score-ai" data-biology-score-id="${escapeAttr(score.id)}">${cached ? 'Refresh explanation' : 'Explain this score'}</button>
    </div>
    <div class="biology-score-ai-answer" data-biology-score-ai-answer="${escapeAttr(score.id)}">${cached ? escapeHTML(cached) : 'Tap “Explain this score” for a concise interpretation based on the current marker pattern.'}</div>
  </section>`;
}
