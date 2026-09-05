// biology-score-sections.js — question and embedded AI answer sections for Biology Scores.

import { saveImportedData } from './data.js';
import { state } from './state.js';
import { renderMarkdown } from './markdown.js';
import { escapeAttr, escapeHTML } from './utils.js';

function renderInlineList(items) {
  return (items || []).map(item => `<span>${escapeHTML(item)}</span>`).join('');
}

export function renderScoreQuestion(score) {
  const question = score.question || `What does ${score.title} say about this biology pattern?`;
  return `<section class="biology-score-question">
    <p>${escapeHTML(question)}</p>
    <div class="biology-score-panel-levels" aria-label="Labs used for this score">
      <div><span>Core markers</span><strong>${renderInlineList(score.basicInputs || [])}</strong></div>
      <div><span>Add for better confidence</span><strong>${renderInlineList(score.extendedInputs || [])}</strong></div>
    </div>
  </section>`;
}

function getScoreAIMaterialKey(score) {
  const available = (score.available || []).map(item => `${item.key}:${item.displayValue}:${item.date}`).join('|');
  const missing = (score.missing || []).map(item => `missing:${item.key}`).join('|');
  return `biology-score-ai-material:${[score.id, available, missing].join('|')}`;
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
  // User-triggered explanations are expensive and should not vanish after
  // harmless score/coverage recomputation on refresh. Keep the last answer for
  // the score until the user explicitly refreshes it, but flag it if the marker
  // evidence materially changed.
  return profileAnswer && typeof profileAnswer === 'object' ? profileAnswer : null;
}

export async function writeScoreAIAnswer(score, text) {
  cleanupLegacyScoreAIAnswerCache();
  const key = getScoreAICacheKey(score);
  state.importedData.biologyScoreAI = state.importedData.biologyScoreAI || {};
  state.importedData.biologyScoreAI[score.id] = { fingerprint: key, materialFingerprint: getScoreAIMaterialKey(score), text, updatedAt: Date.now() };
  await saveImportedData({ reason: 'biology-score-ai', immediate: true });
}

export function renderScoreAIAnswer(score) {
  const cachedRecord = readScoreAIAnswer(score);
  const cached = cachedRecord?.text || '';
  const stale = cached && cachedRecord?.materialFingerprint && cachedRecord.materialFingerprint !== getScoreAIMaterialKey(score);
  return `<section class="biology-score-ai" data-biology-score-ai-panel="${escapeAttr(score.id)}">
    <div class="biology-score-ai-head">
      <div>
        <div class="biology-score-question-kicker">What this means</div>
      </div>
      <button type="button" class="dashboard-action-btn dashboard-action-btn-secondary" data-biology-score-action="interpret-score-ai" data-biology-score-id="${escapeAttr(score.id)}">${cached ? 'Refresh explanation' : 'Explain score'}</button>
    </div>
    ${stale ? '<p class="biology-score-ai-stale">This explanation was generated before the current marker evidence changed. Refresh it for the latest data.</p>' : ''}
    ${cached ? `<div class="biology-score-ai-answer" data-biology-score-ai-answer="${escapeAttr(score.id)}">${renderMarkdown(cached)}</div>` : `<div class="biology-score-ai-answer" data-biology-score-ai-answer="${escapeAttr(score.id)}"></div>`}
  </section>`;
}
