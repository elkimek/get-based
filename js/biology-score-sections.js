// biology-score-sections.js — question and embedded AI answer sections for Biology Scores.

import { queueBiologyScoreWrite, biologyAIRecords, mergeBiologyScoreAIRecords } from './biology-score-persistence.js';
import { saveImportedDataForProfile } from './data.js';
import { BIOLOGY_SCORE_VERSION } from './biology-score-contract.js';
import { getEncryptionEnabled } from './crypto.js';
import { resolveScoreTone } from './biology-score-engine.js';
import { canonicalRange } from './biology-score-inputs.js';
import { state } from './state.js';
import { renderMarkdown } from './markdown.js';
import { escapeAttr, escapeHTML } from './utils.js';
import { getProfiles } from './profile.js';
import { buildDemoBiologyInsight } from './demo-biology-insights.js';

// Render pending state from the request lifecycle, including after navigation.
export const pendingScoreExplanations = new Set();
export const scoreExplanationErrors = new Map();
export function setScoreExplanationError(keys, message = '') {
  for (const key of keys) {
    if (message) scoreExplanationErrors.set(key, message); else scoreExplanationErrors.delete(key);
  }
  while (scoreExplanationErrors.size > 512) scoreExplanationErrors.delete(scoreExplanationErrors.keys().next().value);
}
export function getScoreAIRequestKey(score, profileId = state.currentProfile) { return `${profileId}:${getScoreAIMaterialKey(score)}`; }
export function isScoreAIProcessing(score) { return pendingScoreExplanations.has(getScoreAIRequestKey(score)); }
function processingDot() { return '<span class="biology-score-ai-dot ctx-health-dot-shimmer" aria-hidden="true"></span>'; }
function loadingSkeleton() { return '<span class="biology-score-ai-skeleton" aria-hidden="true"><span></span><span></span><span></span></span>'; }

function renderInlineList(items) {
  return (items || []).map(item => `<span>${escapeHTML(item)}</span>`).join('');
}

export function renderScoreQuestion(score) {
  const question = score.question || `What does ${score.title} say about this biology pattern?`;
  return `<section class="biology-score-question">
    <p>${escapeHTML(question)}</p>
    <div class="biology-score-panel-levels" role="group" aria-label="Labs used for this score">
      <div><span>Core markers</span><strong>${renderInlineList(score.basicInputs || [])}</strong></div>
      <div><span>Additional context</span><strong>${renderInlineList(score.extendedInputs || [])}</strong></div>
    </div>
  </section>`;
}

function stable(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Number(value.toPrecision(12));
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}

// Live dose estimates drift while a sun session is running. Their low/normal
// interpretation matters here, not each rounded IU tick inside the same band.
function normalizeAdvisoryFlag(flag) {
  return String(flag)
    .replace(/(Light context: logged 7-day vitamin-D synthesis is low) \(~[\d,.]+ IU\)/, '$1 (below 4000 IU)')
    .replace(/ is \d+(?:d|mo|y) old; retest this score together before trusting it\./g, ' is older than the collection window; retest this score together before trusting it.');
}

function normalizeMaterial(value, template = value) {
  if (!value || typeof value !== 'object') return value;
  const normalized = structuredClone(value);
  if (normalized.rangeMode === 'both') normalized.rangeMode = 'optimal';
  if (Array.isArray(normalized.flags)) normalized.flags = normalized.flags.map(normalizeAdvisoryFlag).sort();
  for (const key of ['available', 'missing']) {
    if (Array.isArray(normalized[key])) normalized[key] = normalized[key].map(item => {
      const row = { ...item };
      if (row.contextReason) row.contextReason = normalizeAdvisoryFlag(row.contextReason);
      if (normalized.materialFormat !== 2) {
        const current = template?.[key]?.find(i => i.key === row.key);
        row.dotKey ||= current?.dotKey;
        if (row.range) row.range = canonicalRange(row, row.range);
        if (row.referenceRange) row.referenceRange = canonicalRange(row, row.referenceRange);
        delete row.value; delete row.displayValue; delete row.unit;
        if (!row.range) delete row.range;
        if (!row.referenceRange) delete row.referenceRange;
      }
      return row;
    });
  }
  if (normalized.historical?.available) normalized.historical.available = normalizeMaterial({ materialFormat: normalized.materialFormat, available: normalized.historical.available }, { available: template?.historical?.available }).available;
  normalized.materialFormat = 2;
  return normalized;
}

function materialMatches(saved, current) {
  if (saved === current) return true;
  try {
    const parsed = JSON.parse(saved);
    if (!parsed || !Array.isArray(parsed.flags)) return false;
    const next = JSON.parse(current);
    return JSON.stringify(stable(normalizeMaterial(parsed, next))) === JSON.stringify(stable(normalizeMaterial(next, parsed)));
  } catch { return false; }
}

function answerMatches(record, material) {
  return materialMatches(record?.materialFingerprint, material)
    || (Array.isArray(record?.coveredMaterials) && record.coveredMaterials.some(key => materialMatches(key, material)));
}

export function getScoreAIRefreshReason(score) {
  const record = readScoreAIAnswer(score);
  if (!record?.text) return '';
  const current = getScoreAIMaterialKey(score);
  if (answerMatches(record, current)) return '';
  try {
    const after = normalizeMaterial(JSON.parse(current));
    const before = normalizeMaterial(JSON.parse(record.materialFingerprint), after);
    if (!record.coveredMaterials && before.rangeMode !== after.rangeMode) {
      return `Saved ${before.rangeMode === 'reference' ? 'Reference' : 'Optimal'} interpretation. Refresh once to compare ranges and dates.`;
    }
    const names = { version: 'scoring model', rangeMode: 'selected ranges', available: 'marker results or their interpretation', missing: 'marker coverage', profileContext: 'profile context', flags: 'context or collection notes', recency: 'collection-window status', historical: 'historical inputs', collectionDates: 'collection dates', score: 'score', rawScore: 'historical score', confidence: 'input confidence' };
    const changed = Object.keys(names).filter(key => JSON.stringify(stable(before[key])) !== JSON.stringify(stable(after[key]))).map(key => names[key]);
    return changed.length ? `Changed since this explanation: ${changed.join(', ')}.` : 'This explanation uses an older context format.';
  } catch { return 'This explanation uses an older context format.'; }
}

export function getScoreAIMaterialKey(score) {
  const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
  // Track the interpreted evidence, not unrelated live telemetry or storage metadata.
  const order = items => [...(items || [])].map(item => pick({ ...item,
    range: item.range ? item.canonicalScoringRange || canonicalRange(item, item.range) : undefined,
    referenceRange: item.referenceRange ? item.canonicalReferenceRange || canonicalRange(item, item.referenceRange) : undefined,
  }, ['key', 'dotKey', 'label', 'canonicalValue', 'date', 'range', 'referenceRange', 'rangeLabel', 'partial', 'core', 'coreGroup', 'contextReason', 'profileContextOnly', 'effectiveWeight', 'configuredWeight', 'evidenceGroup', 'familyWeight', 'specimen', 'method', 'referenceRangeSource', 'referenceSampleTime'])).sort((a, b) => String(a.key).localeCompare(String(b.key)));
  return JSON.stringify(stable({ materialFormat: 2, version: BIOLOGY_SCORE_VERSION, id: score.id, panelRoute: score.panelRoute || '', score: score.score, rawScore: score.rawScore,
    historical: score.historicalSnapshot ? { available: order(score.historicalSnapshot.available), dates: score.historicalSnapshot.presentationDates, recency: score.historicalSnapshot.recencyStatus } : null,
    ...(score.presentationDates ? { collectionDates: score.presentationDates } : {}),
    rangeMode: (score.aiRangeMode || state.rangeMode) === 'both' ? 'optimal' : (score.aiRangeMode || state.rangeMode), profileContext: pick(score.profileContext, ['sex', 'ageYears', 'cycleStatus', 'menopauseStatus', 'hormoneTherapy', 'lowMuscleMass', 'recentHardTraining', 'acuteInflammationContext']), confidence: score.scoreConfidence,
    recency: score.recencyStatus, flags: (score.flags || []).map(normalizeAdvisoryFlag).sort(),
    available: order(score.available), missing: order(score.missing) }));
}

// Legacy global cache entries cannot safely be assigned to a profile. Do not
// erase them while rendering another profile; only explicit data cleanup may.
export function readScoreAIAnswer(score) {
  const profileAnswer = state.importedData?.biologyScoreAI?.[score.id];
  const material = getScoreAIMaterialKey(score);
  const matching = biologyAIRecords(profileAnswer).find(record => answerMatches(record, material));
  // Keep the last answer visible, explicitly stale, if this evidence is new.
  if (matching || profileAnswer?.text) return matching || profileAnswer;
  if (getProfiles().find(profile => profile.id === state.currentProfile)?.tags?.includes('demo')) {
    return buildDemoBiologyInsight(score, material);
  }
  return null;
}

export function hasCurrentScoreAIAssessment(score) {
  const records = biologyAIRecords(state.importedData?.biologyScoreAI?.[score.id]).filter(record => record.summary && record.text);
  const shared = records.filter(record => Array.isArray(record.coveredMaterials));
  if (shared.length) return shared.some(record => score.aiViews.every(view => answerMatches(record, view.material)));
  // A legacy assessment is never upgraded automatically just for a filter.
  return records.some(record => score.aiViews.some(view => answerMatches(record, view.material)));
}

export function renderScoreAISummary(score) {
  const record = readScoreAIAnswer(score);
  const demo = record?.source === 'demo';
  const processing = isScoreAIProcessing(score);
  const refreshReason = getScoreAIRefreshReason(score);
  const stale = !!refreshReason;
  const summary = typeof record?.summary === 'string' ? record.summary : '';
  const presented = score.historicalSnapshot || score;
  const value = Number.isFinite(presented.score) ? presented.score : ['stale', 'mixed-dates'].includes(presented.recencyStatus) ? presented.rawScore : null;
  const tone = presented.tone || resolveScoreTone(value);
  const color = !record?.text || !Number.isFinite(value) ? 'var(--text-muted)' : ['excellent', 'good'].includes(tone) ? 'var(--green)' : tone === 'strained' ? 'var(--yellow)' : 'var(--red)';
  const overview = score.id === 'biologicalCoherence';
  const retry = overview && hasUnsavedScoreAIAnswers();
  const action = retry ? 'retry-save-score-insights' : overview ? 'update-score-insights' : 'interpret-score-ai';
  const label = demo ? 'Use AI' : retry ? 'Retry saving' : overview ? 'Update missing insights' : record?.text ? 'Refresh' : 'Explain score';
  return `<span class="biology-score-ai-teaser" data-biology-score-ai-summary="${escapeAttr(score.id)}" aria-busy="${processing}">
    <span class="biology-score-ai-teaser-label" role="status" aria-live="polite" aria-atomic="true" aria-label="${processing ? 'Assessing markers' : stale ? 'refresh needed' : demo ? 'Demo insight, generated locally without AI' : record?.text ? 'Saved interpretation' : 'Interpretation not generated'}">${processing ? processingDot() : `<span class="biology-score-ai-dot" style="background:${color}" aria-hidden="true"></span>`}${processing ? 'Assessing' : stale ? 'refresh needed' : demo ? 'Demo insight' : ''}</span>
    <span class="biology-score-ai-teaser-text">${processing && !summary ? loadingSkeleton() : escapeHTML(summary || (record?.text ? 'Refresh to add a short, complete insight. Your full explanation is saved.' : ''))}</span>
    <button type="button" class="biology-score-ai-teaser-action" ${processing ? 'disabled' : ''} data-biology-score-action="${action}" data-biology-score-id="${escapeAttr(score.id)}" aria-label="${label} — ${escapeAttr(overview ? 'Biology Scores' : score.title)}">${label}</button>
    ${stale ? `<span class="biology-score-ai-refresh-reason">${escapeHTML(refreshReason)}</span>` : ''}
    <span class="biology-score-ai-error" role="status">${escapeHTML(scoreExplanationErrors.get(getScoreAIRequestKey(score)) || '')}</span>
  </span>`;
}

// Failed durable saves remain retryable without another provider request. This
// recovery buffer is deliberately memory-only, never a plaintext disk cache.
const unsavedAnswers = new Map();
export function hasUnsavedScoreAIAnswers(profileId = state.currentProfile) { return unsavedAnswers.has(profileId); }
export async function retryUnsavedScoreAIAnswers(profileId = state.currentProfile) {
  const pending = unsavedAnswers.get(profileId);
  if (!pending) return [];
  const ids = [...pending.records.keys()];
  await writeScoreAIAnswers([...pending.records.values()], profileId, pending.baseData);
  return ids;
}

// Serialize AI writes so two independent refreshes cannot overwrite each other.
export function writeScoreAIAnswers(records, expectedProfile = state.currentProfile, expectedData = state.importedData) {
  const write = async () => {
    if (!expectedData || (state.currentProfile !== expectedProfile && !getProfiles().some(p => p.id === expectedProfile))) throw new Error('Profile changed or was removed. No answer was saved.');
    // Sync/hydration may replace the object without changing the profile. Merge
    // into its latest data instead of rejecting that harmless identity change.
    const baseData = structuredClone(state.currentProfile === expectedProfile ? state.importedData : expectedData);
    const snapshot = structuredClone(baseData);
    const updates = {};
    for (const { score, answer, materialFingerprint } of records) {
      const content = typeof answer === 'string' ? { text: answer } : { text: answer.text, summary: answer.summary, ...(answer.generation ? { generation: answer.generation } : {}) };
      updates[score.id] = mergeBiologyScoreAIRecords(updates[score.id] || snapshot.biologyScoreAI?.[score.id], {
        fingerprint: materialFingerprint, materialFingerprint, ...content, updatedAt: Date.now(),
        ...(score.aiViews ? { coveredMaterials: score.aiViews.map(view => view.material) } : {}),
      });
    }
    snapshot.biologyScoreAI = { ...snapshot.biologyScoreAI, ...updates };
    const saved = await saveImportedDataForProfile(expectedProfile, snapshot, { reason: 'biology-score-ai', immediate: true, forceProfileScope: true, baseData });
    if (!saved) throw new Error('Could not save the explanation. Retry saving without another AI charge before leaving this page.');
    if (state.currentProfile === expectedProfile) {
      state.importedData.biologyScoreAI ||= {};
      for (const [id, update] of Object.entries(updates)) state.importedData.biologyScoreAI[id] = mergeBiologyScoreAIRecords(state.importedData.biologyScoreAI[id], update);
    }
  };
  return queueBiologyScoreWrite(write).then(() => {
    const pending = unsavedAnswers.get(expectedProfile);
    for (const record of records) {
      pending?.records.delete(record.score.id);
    }
    if (pending && !pending.records.size) unsavedAnswers.delete(expectedProfile);
  }).catch(error => {
    const pending = unsavedAnswers.get(expectedProfile) || { records: new Map(), baseData: structuredClone(expectedData) };
    for (const record of records) pending.records.set(record.score.id, record);
    unsavedAnswers.set(expectedProfile, pending);
    throw error;
  });
}

export function writeScoreAIAnswer(score, answer, expectedProfile = state.currentProfile, expectedData = state.importedData, materialFingerprint = getScoreAIMaterialKey(score)) {
  return writeScoreAIAnswers([{ score, answer, materialFingerprint }], expectedProfile, expectedData);
}

export function scoreAIAnswerNeedsRefresh(score) {
  const record = readScoreAIAnswer(score);
  return !record?.summary || !record?.text || !answerMatches(record, getScoreAIMaterialKey(score));
}

export function renderScoreAIAnswer(score) {
  const processing = isScoreAIProcessing(score);
  const cachedRecord = readScoreAIAnswer(score);
  const demo = cachedRecord?.source === 'demo';
  const cached = cachedRecord?.text || '';
  const refreshReason = getScoreAIRefreshReason(score);
  const stale = !!refreshReason;
  return `<section class="biology-score-ai" tabindex="-1" data-biology-score-ai-panel="${escapeAttr(score.id)}" aria-busy="${processing}">
    <div class="biology-score-ai-head">
      <div>
        ${demo ? '<h4>Demo explanation</h4>' : score.id === 'biologicalCoherence' ? '' : '<h4>AI interpretation</h4>'}
        ${processing ? `<span class="biology-score-ai-processing" role="status">${processingDot()}Assessing markers</span>` : ''}
      </div>
      <button type="button" class="dashboard-action-btn dashboard-action-btn-secondary" ${processing ? 'disabled' : ''} data-biology-score-action="interpret-score-ai" data-biology-score-id="${escapeAttr(score.id)}">${demo ? 'Explain with AI' : cached ? 'Refresh explanation' : 'Explain score'}</button>
    </div>
    ${stale ? `<p class="biology-score-ai-stale">${escapeHTML(refreshReason)} Refresh to use the latest inputs.</p>` : ''}
    ${recordProvenance(cachedRecord)}
    <div class="biology-score-ai-answer" data-biology-score-ai-answer="${escapeAttr(score.id)}">${cached ? renderMarkdown(cached) : processing ? loadingSkeleton() : 'Explain the main signal, the context that matters, and what to check next.'}</div>
  </section>`;
}

function recordProvenance(record) {
  if (!record?.updatedAt || record.source === 'demo') return '';
  const source = record.generation?.modelId;
  return `<p class="biology-scores-note">Saved ${escapeHTML(new Date(record.updatedAt).toLocaleString())}${source ? ` · ${escapeHTML(source)}` : ''}. Saved with your profile for sync and backups. ${getEncryptionEnabled() ? 'Local encryption is enabled.' : 'Local encryption is off; enable it in Settings → Data protection.'}</p>`;
}
