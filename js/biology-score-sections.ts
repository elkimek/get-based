import type { AIExplanationScore, generateBiologyScoreAIAnswer } from './biology-score-ai.js';
import type { BiologyAIAnswer } from './biology-score-persistence.js';
import type { ScorePart, ScoreProfileContext } from './biology-score-types.js';
import type { computeBiologicalCoherence } from './biology-score-coherence.js';
import type { AppState } from '../types/app-state.js';

/** The score evidence consumed by section rendering and durable AI writes. */
export interface BiologySectionScore extends Omit<Partial<AIExplanationScore>,
  'id' | 'available' | 'missing' | 'historicalSnapshot' | 'aiViews' | 'profileContext'> {
  id: string;
  available?: ScorePart[];
  missing?: Partial<ScorePart>[];
  historicalSnapshot?: BiologySectionScore;
  aiViews?: Pick<NonNullable<AIExplanationScore['aiViews']>[number], 'material'>[];
  profileContext?: ScoreProfileContext;
  panelRoute?: string;
  presentationDates?: ReturnType<typeof computeBiologicalCoherence>['presentationDates'];
  aiRangeMode?: unknown;
  scoreConfidence?: string;
  attention?: unknown;
  anchorWarning?: string;
}
/** Legacy answers remain visible even when imported text has a raw scalar value. */
export interface BiologySectionAnswer extends Record<string, unknown>, Partial<Pick<BiologyAIAnswer,
  'materialFingerprint' | 'fingerprint' | 'updatedAt' | 'coveredMaterials' | 'variants'>> { text?: unknown }

interface MaterialRow extends Omit<Partial<ScorePart>, 'dotKey'>, Record<string, unknown> { dotKey?: string | undefined }
interface MaterialSnapshot extends Record<string, unknown> {
  materialFormat?: number | undefined;
  rangeMode?: string;
  flags?: unknown[];
  available?: MaterialRow[];
  missing?: MaterialRow[];
  historical?: { available?: MaterialRow[] };
}
type ScoreAnswer = string | Pick<Awaited<ReturnType<typeof generateBiologyScoreAIAnswer>>, 'text'> &
  Partial<Pick<Awaited<ReturnType<typeof generateBiologyScoreAIAnswer>>, 'summary' | 'generation'>>;
interface ScoreAnswerWrite { score: BiologySectionScore; answer: ScoreAnswer; materialFingerprint: string }
interface UnsavedScoreAnswers { records: Map<string, ScoreAnswerWrite>; baseData: AppState['importedData'] }

// biology-score-sections.js — question and embedded AI answer sections for Biology Scores.

import { queueBiologyScoreWrite, biologyAIRecords, mergeBiologyScoreAIRecords } from './biology-score-persistence.js';
import { saveImportedDataForProfile } from './data.js';
import { BIOLOGY_SCORE_VERSION } from './biology-score-contract.js';
import { getEncryptionEnabled } from './crypto.js';
import { canonicalRange } from './biology-score-inputs.js';
import { state } from './state.js';
import {renderHTML as renderBiologyAI} from './components/BiologyAIPresentation.svelte.html.js';
import {projectBiologyQuestion, projectBiologyAISummary, projectBiologyAIAnswer} from './biology-ai-presentation.js';
import { getProfiles } from './profile.js';
import { buildDemoBiologyInsight } from './demo-biology-insights.js';

// Render pending state from the request lifecycle, including after navigation.
export const pendingScoreExplanations = new Set<string>();
export const scoreExplanationErrors = new Map<string, string>();
export function setScoreExplanationError(keys: Iterable<string>, message = '') {
  for (const key of keys) {
    if (message) scoreExplanationErrors.set(key, message); else scoreExplanationErrors.delete(key);
  }
  while (scoreExplanationErrors.size > 512) scoreExplanationErrors.delete(scoreExplanationErrors.keys().next().value!);
}
export function getScoreAIRequestKey(score: BiologySectionScore, profileId = state.currentProfile) { return `${profileId}:${getScoreAIMaterialKey(score)}`; }
export function isScoreAIProcessing(score: BiologySectionScore) { return pendingScoreExplanations.has(getScoreAIRequestKey(score)); }
export function renderScoreQuestion(score: BiologySectionScore) {
  return renderBiologyAI({kind: 'question', view: projectBiologyQuestion(score)});
}

/** Snapshot domain-owned AI state at the existing synchronous render boundary. */
export function getBiologyAIState(score: BiologySectionScore) {
  return {record: readScoreAIAnswer(score), processing: isScoreAIProcessing(score),
    refreshReason: getScoreAIRefreshReason(score), retry: hasUnsavedScoreAIAnswers(),
    error: scoreExplanationErrors.get(getScoreAIRequestKey(score)) || '', encryption: getEncryptionEnabled()};
}


/** One material snapshot for a fresh first-party computed score; no state survives this call. */
export function getBiologyAIRenderState(score: BiologySectionScore) {
  if (!plainRenderMaterialInputs(score)) return getBiologyAIState(score);
  let material: string | undefined;
  const key = () => material ??= getScoreAIMaterialKey(score);
  const read = () => {
    const profileAnswer = state.importedData?.biologyScoreAI?.[score.id] as BiologySectionAnswer | undefined;
    return scoreAIAnswerForMaterial(score, profileAnswer, key());
  };
  const refresh = () => {
    const record = read();
    return record?.text ? scoreAIRefreshReasonForMaterial(record, key()) : '';
  };
  // Keep both saved-record reads and each profile/pending/error/encryption read
  // at their original positions. Only the immutable material derivation is shared.
  return {record: read(), processing: pendingScoreExplanations.has(`${state.currentProfile}:${key()}`),
    refreshReason: refresh(), retry: hasUnsavedScoreAIAnswers(),
    error: scoreExplanationErrors.get(`${state.currentProfile}:${key()}`) || '', encryption: getEncryptionEnabled()};
}

/** Descriptor-only eligibility, scoped to evidence and metadata actually read by this render. */
function plainRenderMaterialInputs(score: BiologySectionScore): boolean {
  const rejected = Symbol();
  const value = (object: unknown, key: string): unknown => {
    if (object == null) return undefined;
    if (typeof object !== 'object' || ![null, Object.prototype, Array.prototype].includes(Object.getPrototypeOf(object))) return rejected;
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    return descriptor && !('value' in descriptor) ? rejected : descriptor?.value;
  };
  try {
    const id = value(score, 'id'), range = value(score, 'aiRangeMode');
    if (typeof id !== 'string' || !['reference', 'optimal', 'both'].includes(range as string)) return false;
    const historical = value(score, 'historicalSnapshot');
    // Demo copy also reads presentation fields. Reject every own root accessor
    // without traversing unrelated root values such as genetic context Sets.
    for (const root of [score, historical]) {
      if (root == null) continue;
      if (typeof root !== 'object' || ![null, Object.prototype].includes(Object.getPrototypeOf(root))) return false;
      const keys = Reflect.ownKeys(root);
      if (keys.length > 5000) return false;
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(root, key);
        if (!descriptor || !('value' in descriptor)) return false;
      }
    }
    const fields = ['id', 'panelRoute', 'score', 'rawScore', 'presentationDates', 'aiRangeMode', 'scoreConfidence', 'recencyStatus',
      'flags', 'available', 'missing', 'boundary', 'attention', 'anchorWarning', 'scoreConfidenceLabel'];
    const roots = fields.map(field => value(score, field));
    roots.push(...fields.map(field => value(historical, field)));
    const profile = value(score, 'profileContext');
    roots.push(...['sex', 'ageYears', 'cycleStatus', 'menopauseStatus', 'hormoneTherapy', 'lowMuscleMass', 'recentHardTraining', 'acuteInflammationContext'].map(field => value(profile, field)));
    const imported = value(state, 'importedData'), profiles = value(state, 'profiles');
    const currentProfile = value(state, 'currentProfile');
    if (typeof currentProfile !== 'string' || !Array.isArray(profiles)) return false;
    roots.push(profiles, value(value(imported, 'biologyScoreAI'), id));
    const pending = [...roots], seen = new WeakSet<object>();
    let properties = 0;
    while (pending.length) {
      const item = pending.pop();
      if (item === rejected || typeof item === 'function') return false;
      if (item === null || typeof item !== 'object' || seen.has(item)) continue;
      if (![null, Object.prototype, Array.prototype].includes(Object.getPrototypeOf(item))) return false;
      seen.add(item);
      const keys = Reflect.ownKeys(item);
      properties += keys.length;
      if (properties > 5000) return false;
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !('value' in descriptor)) return false;
        pending.push(descriptor.value);
      }
    }
    return true;
  } catch { return false; }
}

function stable(value: unknown): unknown {
  if (typeof value === 'number' && Number.isFinite(value)) return Number(value.toPrecision(12));
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable((value as Record<string, unknown>)[key])]));
  return value;
}

// Live dose estimates drift while a sun session is running. Their low/normal
// interpretation matters here, not each rounded IU tick inside the same band.
function normalizeAdvisoryFlag(flag: unknown) {
  return String(flag)
    .replace(/(Light context: logged 7-day vitamin-D synthesis is low) \(~[\d,.]+ IU\)/, '$1 (below 4000 IU)')
    .replace(/ is \d+(?:d|mo|y) old; retest this score together before trusting it\./g, ' is older than the collection window; retest this score together before trusting it.');
}

function normalizeMaterial(value: MaterialSnapshot, template: MaterialSnapshot = value) {
  if (!value || typeof value !== 'object') return value;
  const normalized = structuredClone(value);
  if (normalized.rangeMode === 'both') normalized.rangeMode = 'optimal';
  if (Array.isArray(normalized.flags)) normalized.flags = normalized.flags.map(normalizeAdvisoryFlag).sort();
  for (const key of ['available', 'missing'] as const) {
    if (Array.isArray(normalized[key])) normalized[key] = normalized[key]!.map(item => {
      const row = { ...item };
      if (row.contextReason) row.contextReason = normalizeAdvisoryFlag(row.contextReason);
      if (normalized.materialFormat !== 2) {
        const current = template?.[key]?.find(i => i.key === row.key);
        row.dotKey ||= current?.dotKey;
        if (row.range) row.range = canonicalRange(row as Parameters<typeof canonicalRange>[0], row.range);
        if (row.referenceRange) row.referenceRange = canonicalRange(row as Parameters<typeof canonicalRange>[0], row.referenceRange);
        delete row.value; delete row.displayValue; delete row.unit;
        if (!row.range) delete row.range;
        if (!row.referenceRange) delete row.referenceRange;
      }
      return row;
    });
  }
  if (normalized.historical?.available) normalized.historical.available = normalizeMaterial({ materialFormat: normalized.materialFormat, available: normalized.historical.available }, { available: template?.historical?.available } as MaterialSnapshot).available!;
  normalized.materialFormat = 2;
  return normalized;
}

function materialMatches(saved: unknown, current: unknown) {
  if (saved === current) return true;
  try {
    const parsed = JSON.parse(saved as string) as MaterialSnapshot;
    if (!parsed || !Array.isArray(parsed.flags)) return false;
    const next = JSON.parse(current as string) as MaterialSnapshot;
    return JSON.stringify(stable(normalizeMaterial(parsed, next))) === JSON.stringify(stable(normalizeMaterial(next, parsed)));
  } catch { return false; }
}

function answerMatches(record: Pick<BiologyAIAnswer, 'materialFingerprint' | 'coveredMaterials'> | null | undefined, material: unknown) {
  return materialMatches(record?.materialFingerprint, material)
    || (Array.isArray(record?.coveredMaterials) && record.coveredMaterials.some(key => materialMatches(key, material)));
}

export function getScoreAIRefreshReason(score: BiologySectionScore) {
  const record = readScoreAIAnswer(score);
  if (!record?.text) return '';
  const current = getScoreAIMaterialKey(score);
  return scoreAIRefreshReasonForMaterial(record, current);
}

function scoreAIRefreshReasonForMaterial(record: BiologySectionAnswer, current: string) {
  if (answerMatches(record, current)) return '';
  try {
    const after = normalizeMaterial(JSON.parse(current as string) as MaterialSnapshot);
    const before = normalizeMaterial(JSON.parse(record.materialFingerprint as string) as MaterialSnapshot, after);
    if (!record.coveredMaterials && before.rangeMode !== after.rangeMode) {
      return `Saved ${before.rangeMode === 'reference' ? 'Reference' : 'Optimal'} interpretation. Refresh once to compare ranges and dates.`;
    }
    const names: Record<string, string> = { version: 'scoring model', rangeMode: 'selected ranges', available: 'marker results or their interpretation', missing: 'marker coverage', profileContext: 'profile context', flags: 'context or collection notes', recency: 'collection-window status', historical: 'historical inputs', collectionDates: 'collection dates', score: 'score', rawScore: 'historical score', confidence: 'input confidence' };
    const changed = Object.keys(names).filter(key => JSON.stringify(stable(before[key])) !== JSON.stringify(stable(after[key]))).map(key => names[key]);
    return changed.length ? `Changed since this explanation: ${changed.join(', ')}.` : 'This explanation uses an older context format.';
  } catch { return 'This explanation uses an older context format.'; }
}

export function getScoreAIMaterialKey(score: BiologySectionScore) {
  const pick = (value: unknown, keys: readonly string[]) => Object.fromEntries(keys.filter(key => (value as Record<string, unknown> | null | undefined)?.[key] !== undefined).map(key => [key, (value as Record<string, unknown>)[key]]));
  // Track the interpreted evidence, not unrelated live telemetry or storage metadata.
  const order = (items: readonly Partial<ScorePart>[] | null | undefined) => [...(items || [])].map(item => pick({ ...item,
    range: item.range ? item.canonicalScoringRange || canonicalRange(item as Parameters<typeof canonicalRange>[0], item.range) : undefined,
    referenceRange: item.referenceRange ? item.canonicalReferenceRange || canonicalRange(item as Parameters<typeof canonicalRange>[0], item.referenceRange) : undefined,
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
export function readScoreAIAnswer(score: BiologySectionScore): BiologySectionAnswer | null {
  const profileAnswer = state.importedData?.biologyScoreAI?.[score.id] as BiologySectionAnswer | undefined;
  const material = getScoreAIMaterialKey(score);
  return scoreAIAnswerForMaterial(score, profileAnswer, material);
}

function scoreAIAnswerForMaterial(score: BiologySectionScore, profileAnswer: BiologySectionAnswer | undefined, material: string): BiologySectionAnswer | null {
  const matching = biologyAIRecords(profileAnswer).find(record => answerMatches(record, material));
  // Keep the last answer visible, explicitly stale, if this evidence is new.
  if (matching || profileAnswer?.text) return matching || profileAnswer!;
  if (getProfiles().find(profile => profile.id === state.currentProfile)?.tags?.includes('demo')) {
    return buildDemoBiologyInsight(score, material);
  }
  return null;
}

export function hasCurrentScoreAIAssessment(score: BiologySectionScore) {
  const records = biologyAIRecords(state.importedData?.biologyScoreAI?.[score.id]).filter(record => record.summary && record.text);
  const shared = records.filter(record => Array.isArray(record.coveredMaterials));
  if (shared.length) return shared.some(record => score.aiViews!.every(view => answerMatches(record, view.material)));
  // A legacy assessment is never upgraded automatically just for a filter.
  return records.some(record => score.aiViews!.some(view => answerMatches(record, view.material)));
}

export function renderScoreAISummary(score: BiologySectionScore) {
  return renderBiologyAI({kind: 'summary', view: projectBiologyAISummary(score, getBiologyAIState(score))});
}

// Failed durable saves remain retryable without another provider request. This
// recovery buffer is deliberately memory-only, never a plaintext disk cache.
const unsavedAnswers = new Map<string, UnsavedScoreAnswers>();
export function hasUnsavedScoreAIAnswers(profileId = state.currentProfile) { return unsavedAnswers.has(profileId); }
export async function retryUnsavedScoreAIAnswers(profileId = state.currentProfile) {
  const pending = unsavedAnswers.get(profileId);
  if (!pending) return [];
  const ids = [...pending.records.keys()];
  await writeScoreAIAnswers([...pending.records.values()], profileId, pending.baseData);
  return ids;
}

// Serialize AI writes so two independent refreshes cannot overwrite each other.
export function writeScoreAIAnswers(records: readonly ScoreAnswerWrite[], expectedProfile = state.currentProfile, expectedData = state.importedData) {
  const write = async () => {
    if (!expectedData || (state.currentProfile !== expectedProfile && !getProfiles().some(p => p.id === expectedProfile))) throw new Error('Profile changed or was removed. No answer was saved.');
    // Sync/hydration may replace the object without changing the profile. Merge
    // into its latest data instead of rejecting that harmless identity change.
    const baseData = structuredClone(state.currentProfile === expectedProfile ? state.importedData : expectedData);
    const snapshot = structuredClone(baseData);
    const updates: Record<string, ReturnType<typeof mergeBiologyScoreAIRecords>> = {};
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

export function writeScoreAIAnswer(score: BiologySectionScore, answer: ScoreAnswer, expectedProfile = state.currentProfile, expectedData = state.importedData, materialFingerprint = getScoreAIMaterialKey(score)) {
  return writeScoreAIAnswers([{ score, answer, materialFingerprint }], expectedProfile, expectedData);
}

export function scoreAIAnswerNeedsRefresh(score: BiologySectionScore) {
  const record = readScoreAIAnswer(score);
  return !record?.summary || !record?.text || !answerMatches(record, getScoreAIMaterialKey(score));
}

export function renderScoreAIAnswer(score: BiologySectionScore) {
  return renderBiologyAI({kind: 'answer', view: projectBiologyAIAnswer(score, getBiologyAIState(score))});
}

/** Explicit first-party renderer: callers keep separate snapshots across DOM/focus publication. */
export function renderScoreAISummaryForRender(score: BiologySectionScore) {
  return renderBiologyAI({kind: 'summary', view: projectBiologyAISummary(score, getBiologyAIRenderState(score))});
}
export function renderScoreAIAnswerForRender(score: BiologySectionScore) {
  return renderBiologyAI({kind: 'answer', view: projectBiologyAIAnswer(score, getBiologyAIRenderState(score))});
}
