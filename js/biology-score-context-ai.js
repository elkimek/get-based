// @ts-check
// biology-score-context-ai.js — AI-assisted context flag review for deterministic Biology Scores.

import { biologyAIRequestOptions } from './biology-score-ai.js';
import { queueBiologyScoreWrite } from './biology-score-persistence.js';
import { mergeProfileMutation } from './profile-data-writes.js';
import { getErrorMessage } from './caught-error.js';
import { filterDatesByRange, getActiveData, invalidateActiveDataCache, saveImportedDataForProfile } from './data.js';
import {
  isGeneticsPriorityInAIContext,
  isGeneticsSummaryInAIContext,
  getSleepContextMismatch,
  isInsightContextCardsEnabled,
  isLabMarkersContextEnabled,
  isLightSunContextEnabled,
  isSupplementsMedsContextEnabled,
  isWearableContextEnabled,
} from './lab-context.js';
import { isAIPaused } from './api.js';
import { callAssistantFeatureAI, getAssistantFeatureIdentity, hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { getProfiles } from './profile.js';
import { state } from './state.js';
import { escapeAttr, escapeHTML, hashString, showNotification } from './utils.js';
import { sortHealthGoalsByPriority } from './health-goals-utils.js';
import { getCurrentSupplements, getSupplementsOverlappingRange } from './supplement-medication-domain.js';
import { resolveActiveMarkerPath } from './marker-placement.js';
import { buildCompactSupplementContextRecords } from './supplement-context.js';

/** @type {{
 *   callClaudeAPI: typeof callAssistantFeatureAI,
 *   hasAIProvider: typeof hasAssistantFeatureProvider,
 *   isAIPaused: typeof isAIPaused,
 *   navigate: null | ((route?: string) => void),
 * }} */
const biologyScoreContextAIDeps = {
  callClaudeAPI: callAssistantFeatureAI,
  hasAIProvider: hasAssistantFeatureProvider,
  isAIPaused,
  navigate: null,
};

/** @param {Partial<typeof biologyScoreContextAIDeps>} [deps] */
export function configureBiologyScoreContextAIDeps(deps = {}) {
  const previous = { ...biologyScoreContextAIDeps };
  if (typeof deps.callClaudeAPI === 'function') biologyScoreContextAIDeps.callClaudeAPI = deps.callClaudeAPI;
  if (typeof deps.hasAIProvider === 'function') biologyScoreContextAIDeps.hasAIProvider = deps.hasAIProvider;
  if (typeof deps.isAIPaused === 'function') biologyScoreContextAIDeps.isAIPaused = deps.isAIPaused;
  if (Object.hasOwn(deps, 'navigate') && (deps.navigate === null || typeof deps.navigate === 'function')) {
    biologyScoreContextAIDeps.navigate = deps.navigate;
  }
  return previous;
}

const FLAG_LABELS = {
  lowMuscleMass: 'Low muscle / creatinine unreliable',
  hormoneTherapy: 'Hormone therapy / TRT / hormonal contraception',
  postmenopause: 'Postmenopause / no active cycle',
  intenseTrainingRecent: 'Recent intense training near blood draw',
  acuteIllnessNearDraw: 'Acute illness / infection / injury near blood draw',
};
const FLAG_KEYS = Object.keys(FLAG_LABELS);
const applicableFlagKeys = () => FLAG_KEYS.filter(flag => flag !== 'postmenopause' || state.profileSex === 'female');
const flagLabel = flag => flag === 'hormoneTherapy' && state.profileSex !== 'female' ? 'Hormone therapy / TRT' : FLAG_LABELS[flag];
export const CONTEXT_REVIEW_RANGES = ['all', '1y', '6m', '3m'];
let installed = false;

function safeContextText(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function safeStructuredContext(value, allowedKeys, maxPerField = 120) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) return value.slice(0, 12).map(item => typeof item === 'object'
    ? safeStructuredContext(item, allowedKeys, maxPerField)
    : safeContextText(item, maxPerField)).filter(Boolean);
  const out = {};
  for (const key of allowedKeys) {
    const v = value[key];
    if (v == null || v === '') continue;
    if (typeof v === 'boolean' || typeof v === 'number') out[key] = v;
    else if (typeof v === 'string') out[key] = safeContextText(v, maxPerField);
    else if (Array.isArray(v)) out[key] = v.slice(0, 8).map(item => safeContextText(item, maxPerField)).filter(Boolean);
  }
  return Object.keys(out).length ? out : null;
}

function safeCondition(item) {
  if (item && typeof item === 'object') {
    return safeContextText([item.name, item.severity, item.status, item.since && `since ${item.since}`, item.note].filter(Boolean).join(' — '), 180);
  }
  return safeContextText(item, 120);
}

function geneticsSummary(imported) {
  const includeSummary = isGeneticsSummaryInAIContext();
  const includePriority = isGeneticsPriorityInAIContext();
  if (!includeSummary && !includePriority) return null;
  const genetics = imported?.genetics || null;
  const snps = includePriority ? (genetics?.snps || {}) : {};
  if (!genetics && !Object.keys(snps).length) return null;
  const out = {};
  if (includeSummary) {
    const source = safeContextText(genetics?.source, 80);
    const apoe = safeContextText(genetics?.apoe, 40);
    const mtdna = safeContextText(genetics?.mtdna || genetics?.mtDNA || genetics?.mtdnaHaplogroup || genetics?.mtDnaHaplogroup, 40);
    if (source) out.source = source;
    if (apoe) out.apoe = apoe;
    if (mtdna) out.mtdna = mtdna;
  }
  const categories = {};
  for (const stored of Object.values(snps)) {
    const effect = String(stored?.effect || '').toLowerCase();
    const valence = String(stored?.valence || '').toLowerCase();
    if ((effect === 'none' || effect === '') && valence !== 'protective') continue;
    const cat = stored?.category || 'other';
    categories[cat] = (categories[cat] || 0) + 1;
  }
  if (includePriority && Object.keys(snps).length) {
    out.snpCount = Object.keys(snps).length;
    out.categories = categories;
  }
  return Object.keys(out).length ? out : null;
}

function lightSummary(imported) {
  const includeLightContext = isLightSunContextEnabled();
  if (!includeLightContext) return { includeLightContext: false };
  return {
    lightCircadian: safeStructuredContext(imported?.lightCircadian, ['amLight','daytime','uvExposure','skinType','evening','screenTime','techEnv','cold','grounding','mealTiming','note','morningLight','daylight','eveningLight','screenUse','notes'], 120),
    sunSessions14d: Array.isArray(imported?.sunSessions) ? imported.sunSessions.filter(s => Number(s?.endedAt || s?.startedAt || 0) >= Date.now() - 14 * 86400000).length : 0,
    deviceSessions14d: Array.isArray(imported?.deviceSessions) ? imported.deviceSessions.filter(s => Number(s?.endedAt || s?.startedAt || 0) >= Date.now() - 14 * 86400000).length : 0,
    measurements14d: Array.isArray(imported?.lightMeasurements) ? imported.lightMeasurements.filter(m => Number(m?.capturedAt || 0) >= Date.now() - 14 * 86400000).length : 0,
    includeLightContext,
  };
}

function bodySummary(imported) {
  const includeBodyContext = isWearableContextEnabled();
  if (!includeBodyContext) return { includeBodyContext: false };
  const metrics = imported?.wearableSummary?.metrics || {};
  const pick = key => metrics[key] ? { d7: metrics[key].rolling?.d7, baseline: metrics[key].baseline, p25: metrics[key].baselineP25, p75: metrics[key].baselineP75 } : null;
  return { includeBodyContext, hrv: pick('hrv_rmssd'), rhr: pick('rhr'), sleep: pick('sleep_score'), readiness: pick('readiness_score') };
}

function supplementsSummary(imported, data) {
  if (!Array.isArray(imported?.supplements)) return [];
  const relevant = data?.dates?.length
    ? getSupplementsOverlappingRange(imported.supplements, data.dates[0], data.dates[data.dates.length - 1])
    : getCurrentSupplements(imported.supplements);
  return buildCompactSupplementContextRecords(relevant);
}

function supplementInventoryFingerprint(imported) {
  try { return hashString(JSON.stringify(imported?.supplements || [])); }
  catch { return hashString(String(imported?.supplements || '')); }
}

function latest(data, cat, key) {
  const m = resolveActiveMarkerPath(data?.categories, cat, key)?.marker;
  if (!m?.values?.length) return '';
  const idx = m.values.map((v, i) => v == null ? null : i).filter(i => i != null).at(-1);
  if (idx == null) return '';
  return `${m.name || key}: ${m.values[idx]}${m.unit ? ` ${m.unit}` : ''} (${data?.dates?.[idx] || m.singleDate || 'date unknown'})`;
}

const BIOLOGY_CONTEXT_LABS = [['biochemistry','creatinine'], ['biochemistry','egfr'], ['biochemistry','eGFR'], ['biochemistry','cystatinC'], ['proteins','hsCRP'], ['proteins','crp'], ['hematology','hemoglobin'], ['hematology','hct'], ['biochemistry','ck'], ['hormones','testosterone'], ['hormones','estradiol'], ['hormones','shbg']];

function recentContextLabs(data) {
  if (!isLabMarkersContextEnabled()) return [];
  const labs = [];
  BIOLOGY_CONTEXT_LABS.forEach(([c, k]) => {
    const v = latest(data, c, k);
    if (v) labs.push(v);
  });
  return labs;
}

function buildInsightContextPayload(imported, data) {
  const includeInsightCards = isInsightContextCardsEnabled();
  const includeSupplementsMeds = isSupplementsMedsContextEnabled();
  const includeTrackedSleep = isWearableContextEnabled();
  const diagnoses = includeInsightCards ? (imported?.diagnoses || {}) : {};
  return {
    includeInsightCards,
    includeSupplementsMeds,
    currentExplicitFlags: includeInsightCards ? Object.fromEntries(Object.entries(diagnoses.flags || {}).filter(([key]) => key !== 'postmenopause' || state.profileSex === 'female')) : {},
    diagnoses: includeInsightCards && Array.isArray(diagnoses.conditions) ? diagnoses.conditions.slice(0, 20).map(safeCondition).filter(Boolean) : [],
    procedures: includeInsightCards ? safeContextText(diagnoses.proceduresNote, 240) : '',
    medicalNote: includeInsightCards ? safeContextText(diagnoses.note, 240) : '',
    contextNotes: includeInsightCards ? safeContextText(imported?.contextNotes, 240) : '',
    exercise: includeInsightCards ? safeStructuredContext(imported?.exercise, ['frequency','types','intensity','duration','dailyMovement','muscleContext','limitations','note','activityLevel','trainingLoad','recentHardTraining','lastWorkout','notes','injury','mobility'], 140) : {},
    sleepRest: includeInsightCards ? safeStructuredContext(imported?.sleepRest, ['quality','duration','daytimeSleepiness','apneaStatus','papUse','naps','schedule','roomTemp','issues','environment','practices','note','chronotype','wakeTime','bedTime','notes'], 140) : {},
    sleepProfileTrackedMismatch: includeInsightCards && includeTrackedSleep
      ? getSleepContextMismatch(imported?.sleepRest, imported?.wearableSummary)?.summary || ''
      : '',
    stress: includeInsightCards ? safeStructuredContext(imported?.stress, ['level','duration','trend','sources','management','note','workload','recovery','majorStressors','notes'], 140) : {},
    diet: includeInsightCards ? safeStructuredContext(imported?.diet, ['type','pattern','proteinIntake','hydration','alcohol','caffeine','caffeineTiming','recentChanges','restrictions','breakfast','lunch','dinner','snacks','bowelFrequency','stoolConsistency','bloating','gas','acidReflux','nausea','appetite','abdominalPain','foodSensitivities','note','notes'], 100) : {},
    loveLife: includeInsightCards ? safeStructuredContext(imported?.loveLife, ['status','relationship','satisfaction','libido','libidoChange','frequency','orgasm','reproductiveGoals','concerns','note','notes'], 120) : {},
    environment: includeInsightCards ? safeStructuredContext(imported?.environment, ['setting','climate','altitude','inhaledExposures','occupationalExposures','water','waterConcerns','emf','emfMitigation','homeLight','air','toxins','building','note','outdoorTime','sun','mold','airQuality','notes'], 120) : {},
    healthGoals: includeInsightCards && Array.isArray(imported?.healthGoals) ? sortHealthGoalsByPriority(imported.healthGoals).slice(0, 12).map(item => safeContextText(typeof item === 'object' ? JSON.stringify(item) : item, 140)) : [],
    menstrualCycle: includeInsightCards && state.profileSex === 'female' ? safeStructuredContext(imported?.menstrualCycle, ['cycleStatus','status','phase','cycleDay','regularity','contraceptive','contraception','hormoneTherapy','conditions','note','notes'], 140) : {},
    supplements: includeSupplementsMeds ? supplementsSummary(imported, data) : [],
  };
}

export function buildBiologyScoreContextFingerprint(data, range = state.dateRangeFilter || 'all') {
  const imported = /** @type {any} */ (state.importedData || {});
  const insight = buildInsightContextPayload(imported, data);
  const labs = recentContextLabs(data);
  const basis = JSON.stringify({
    range,
    dates: data?.dates || [],
    profileSex: state.profileSex || '',
    profileDob: state.profileDob || '',
    interpretiveLens: safeContextText(imported.interpretiveLens, 240),
    supplementInventoryFingerprint: supplementInventoryFingerprint(imported),
    insight,
    light: lightSummary(imported),
    genetics: geneticsSummary(imported),
    body: bodySummary(imported),
    labs,
  });
  return `biology-context:${hashString(basis)}`;
}

function dataForReviewRange(rawData, range) {
  if (range === 'all') return rawData || {};
  const previous = state.dateRangeFilter;
  state.dateRangeFilter = range;
  try {
    return filterDatesByRange(rawData || {}, { fallbackToAll: false });
  } finally {
    state.dateRangeFilter = previous;
  }
}

export function buildBiologyScoreContextFingerprintsByRange(rawData) {
  return Object.fromEntries(CONTEXT_REVIEW_RANGES.map(range => [
    range,
    buildBiologyScoreContextFingerprint(dataForReviewRange(rawData, range), range),
  ]));
}

export function buildBiologyScoreContextMaterialSignature(data, range = state.dateRangeFilter || 'all') {
  // Both historical key formats describe the same evidence. Share the basis
  // while retaining their prefixes so existing saved reviews remain current.
  return buildBiologyScoreContextFingerprint(data, range).replace('biology-context:', 'biology-context-material:');
}

export function buildBiologyScoreContextMaterialSignaturesByRange(rawData) {
  return Object.fromEntries(CONTEXT_REVIEW_RANGES.map(range => [
    range,
    buildBiologyScoreContextMaterialSignature(dataForReviewRange(rawData, range), range),
  ]));
}

export function hasCurrentBiologyScoreContextReview(data) {
  const review = (/** @type {any} */ (state.importedData))?.biologyScoreContextAI;
  if (!review?.updatedAt) return false;
  const range = state.dateRangeFilter || 'all';
  const expected = buildBiologyScoreContextFingerprint(data, range);
  if (review.fingerprintsByRange && typeof review.fingerprintsByRange === 'object') {
    return review.fingerprintsByRange[range] === expected;
  }
  return review.range === range && review.fingerprint === expected;
}

export function hasBiologyScoreContextReview(_data = null) {
  const review = (/** @type {any} */ (state.importedData))?.biologyScoreContextAI;
  // A completed review is a one-time availability gate. Context freshness is
  // tracked separately so changing data or app-side fingerprint logic can ask
  // for a refresh without hiding scores the user has already unlocked.
  return !!review?.updatedAt;
}

function buildReviewContext(data) {
  const imported = /** @type {any} */ (state.importedData || {});
  const insight = buildInsightContextPayload(imported, data);
  const context = {
    profileSex: state.profileSex || 'not set',
    profileDob: state.profileDob || 'not set',
    interpretiveLens: safeContextText(imported.interpretiveLens, 240),
    insight,
    light: lightSummary(imported),
    genetics: geneticsSummary(imported),
    body: bodySummary(imported),
    recentLabs: recentContextLabs(data),
  };
  return `[section:untrusted-profile-context]\n${JSON.stringify(context, null, 2)}\n[/section:untrusted-profile-context]`;
}

function parseReview(text, allowedFlags) {
  const cleaned = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const json = cleaned.match(/```json\s*([\s\S]*?)```/i)?.[1] || cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned;
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed.summary !== 'string' || !parsed.summary.trim()) throw new Error('The AI returned an incomplete context review. Your saved review is unchanged.');
  const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  return { summary: String(parsed.summary || '').slice(0, 1200), suggestions: suggestions.filter(s => s && allowedFlags.includes(s.flag) && s.value !== false).map(s => ({ flag: s.flag, value: true, confidence: ['high','medium','low'].includes(s.confidence) ? s.confidence : 'medium', reason: String(s.reason || '').slice(0, 700), evidence: Array.isArray(s.evidence) ? s.evidence.slice(0, 8).map(String) : [], affects: Array.isArray(s.affects) ? s.affects.slice(0, 10).map(String) : [] })) };
}

function reviewMaterial(data) {
  const range = state.dateRangeFilter || 'all';
  return { fingerprint: buildBiologyScoreContextFingerprint(dataForReviewRange(data, range), range), fingerprintsByRange: buildBiologyScoreContextFingerprintsByRange(data), contextSignature: buildBiologyScoreContextMaterialSignature(dataForReviewRange(data, range), range), contextSignaturesByRange: buildBiologyScoreContextMaterialSignaturesByRange(data), unlockedRanges: [...CONTEXT_REVIEW_RANGES], range };
}

const pendingReviews = new Map();
const reviewBases = new WeakMap();
export function generateBiologyScoreContextReview(data) {
  const profileId = state.currentProfile;
  const key = buildBiologyScoreContextFingerprint(data);
  const pending = pendingReviews.get(profileId);
  if (pending?.key === key) return pending.promise;
  const promise = requestBiologyScoreContextReview(data).then(review => {
    if (pendingReviews.get(profileId)?.promise === promise) pendingReviews.get(profileId).review = review;
    return review;
  }).catch(error => {
    if (pendingReviews.get(profileId)?.promise === promise) pendingReviews.delete(profileId);
    throw error;
  });
  pendingReviews.set(profileId, { key, promise, review: null });
  return promise;
}

async function requestBiologyScoreContextReview(data) {
  if (!biologyScoreContextAIDeps.hasAIProvider()) throw new Error('Connect an AI provider first.');
  if (biologyScoreContextAIDeps.isAIPaused()) throw new Error('AI features are paused.');
  const profileId = state.currentProfile;
  const material = reviewMaterial(data);
  const baseData = structuredClone(state.importedData);
  const allowedFlags = applicableFlagKeys();
  const identity = getAssistantFeatureIdentity();
  const prompt = buildReviewContext(data);
  const { contextSystem } = await import('./biology-score-ai-protocol.js');
  const result = await biologyScoreContextAIDeps.callClaudeAPI({ system: contextSystem(allowedFlags), messages: [{ role: 'user', content: prompt }], maxTokens: 1800, ...biologyAIRequestOptions() });
  const review = { ...parseReview(result.text, allowedFlags), ...material, profileId, generation: { provider: identity.provider, modelId: identity.modelId, generatedAt: Date.now(), ...(result.usage ? { usage: result.usage } : {}) } };
  reviewBases.set(review, baseData);
  return review;
}

// Roll back only this mutation's fields; keep unrelated profile data intact.
function persistContextChange(change, reason) {
  const profileId = state.currentProfile;
  return queueBiologyScoreWrite(() => {
    if (state.currentProfile !== profileId) throw new Error('Profile changed before saving context.');
    return persistPreparedContextChange(change, reason, profileId);
  });
}

async function persistPreparedContextChange(change, reason, profileId) {
  const imported = state.importedData;
  if (!imported) throw new Error('Load a profile before saving context.');
  const baseData = structuredClone(imported);
  const prepared = structuredClone(baseData);
  // Fingerprint helpers read state synchronously. Stage their context only
  // during preparation; never expose an uncommitted flag across an await.
  state.importedData = prepared;
  try { change(prepared); }
  finally { state.importedData = imported; invalidateActiveDataCache(); }
  if (!await saveImportedDataForProfile(profileId, prepared, { reason, immediate: true, forceProfileScope: true, baseData })) throw new Error('Could not save context. Please retry.');
  if (state.currentProfile === profileId) {
    for (const key of ['diagnoses', 'biologyScoreContextAI']) {
      const merged = mergeProfileMutation(baseData[key], prepared[key], state.importedData[key]);
      if (merged === undefined) delete state.importedData[key]; else state.importedData[key] = merged;
    }
    invalidateActiveDataCache();
  }
}

export async function saveBiologyScoreContextReview(review) {
  const profileId = review.profileId || state.currentProfile;
  await queueBiologyScoreWrite(async () => {
    if (profileId !== state.currentProfile && !getProfiles().some(p => p.id === profileId)) throw new Error('Profile changed or was removed. No review was saved.');
    const baseData = structuredClone(profileId === state.currentProfile ? state.importedData : reviewBases.get(review));
    if (!baseData) throw new Error('The original profile is unavailable. No review was saved.');
    const savedReview = { ...review, updatedAt: Date.now() };
    const snapshot = { ...baseData, biologyScoreContextAI: savedReview };
    if (!await saveImportedDataForProfile(profileId, snapshot, { reason: 'biology-score-context-ai', immediate: true, forceProfileScope: true, baseData })) throw new Error('Could not save context. Retry the review to save it without another AI request.');
    if (state.currentProfile === profileId) state.importedData.biologyScoreContextAI = savedReview;
    const pending = pendingReviews.get(profileId);
    if (pending?.review === review) pendingReviews.delete(profileId);
  });
}

export async function applyBiologyScoreContextFlag(flag, value = true) {
  if (!applicableFlagKeys().includes(flag)) return;
  await persistContextChange(imported => {
    imported.diagnoses ||= { conditions: [], familyHistory: [], note: '', flags: {} };
    imported.diagnoses.flags ||= {};
    imported.diagnoses.flags[flag] = value;
    const review = imported.biologyScoreContextAI;
    if (Array.isArray(review?.suggestions)) {
      review.suggestions = review.suggestions.filter(s => s.flag !== flag);
      review.updatedAt = Date.now();
      invalidateActiveDataCache();
      Object.assign(review, reviewMaterial(getActiveData()));
    }
  }, 'biology-score-context-flag');
}

export async function dismissBiologyScoreContextFlag(flag) {
  if (!state.importedData?.biologyScoreContextAI?.suggestions || !FLAG_KEYS.includes(flag)) return;
  await persistContextChange(imported => {
    const review = imported.biologyScoreContextAI;
    review.suggestions = review.suggestions.filter(s => s.flag !== flag);
    review.dismissed = [...new Set([...(review.dismissed || []), flag])];
    review.updatedAt = Date.now();
  }, 'biology-score-context-dismiss');
}

function renderSuggestion(s) {
  const active = !!(/** @type {any} */ (state.importedData))?.diagnoses?.flags?.[s.flag];
  return `<div class="biology-context-suggestion biology-context-${escapeAttr(s.confidence)}">
    <div><strong>${escapeHTML(flagLabel(s.flag))}</strong><span>${escapeHTML(s.confidence)} confidence${active ? ' · active' : ''}</span></div>
    <p>${escapeHTML(s.reason || 'AI suggested this context modifier.')}</p>
    ${s.evidence?.length ? `<ul>${s.evidence.map(e => `<li>${escapeHTML(e)}</li>`).join('')}</ul>` : ''}
    ${s.affects?.length ? `<small>Affects: ${escapeHTML(s.affects.join(', '))}</small>` : ''}
    ${active ? '' : `<div class="biology-context-actions"><button type="button" class="dashboard-action-btn dashboard-action-btn-secondary" data-biology-score-action="apply-context-ai" data-context-flag="${escapeAttr(s.flag)}">Apply flag</button><button type="button" class="dashboard-action-btn dashboard-action-btn-secondary" data-biology-score-action="dismiss-context-ai" data-context-flag="${escapeAttr(s.flag)}">Dismiss</button></div>`}
  </div>`;
}

export function renderBiologyScoreContextAI(data = null) {
  const review = (/** @type {any} */ (state.importedData))?.biologyScoreContextAI;
  const suggestions = Array.isArray(review?.suggestions) ? review.suggestions.filter(s => applicableFlagKeys().includes(s.flag)) : [];
  const current = data ? hasCurrentBiologyScoreContextReview(data) : !!review?.updatedAt;
  const hasReview = !!review?.updatedAt;
  const buttonLabel = hasReview ? 'Refresh AI review' : 'Review context with AI';
  const status = current ? 'Context is up to date.' : hasReview ? 'Context changed. Refresh recommended; your scores stay available.' : 'Optional AI review; scores already use your saved profile and collection context.';
  return `<section class="biology-context-ai-panel${current ? '' : ' biology-context-ai-required'}">
    <div class="biology-context-ai-head"><div><p>Add context not already captured in your profile or lab entries.</p></div><button type="button" class="dashboard-action-btn dashboard-action-btn-primary" data-biology-score-action="analyze-context-ai">${buttonLabel}</button></div>
    <div class="biology-score-context-fields" role="group" aria-label="Manual score context">${applicableFlagKeys().map(flag => `<label><input type="checkbox" data-biology-context-flag="${escapeAttr(flag)}" ${(/** @type {any} */ (state.importedData))?.diagnoses?.flags?.[flag] ? 'checked' : ''}>${escapeHTML(flagLabel(flag))}</label>`).join('')}</div>
    <p class="biology-scores-note">Set applicable context above without AI. ${state.profileSex === 'female' ? 'Sample timing and cycle phase belong' : 'Sample timing belongs'} to each lab entry.</p>
    <p class="biology-scores-note">${escapeHTML(status)}</p>
    ${review?.summary ? `<p class="biology-context-ai-summary">${escapeHTML(review.summary)}</p>` : ''}
    ${suggestions.length ? `<div class="biology-context-suggestions">${suggestions.map(renderSuggestion).join('')}</div>` : ''}
  </section>`;
}

export function installBiologyScoreContextAIDelegates() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('change', async event => {
    const el = event.target;
    if (!(el instanceof HTMLInputElement) || !applicableFlagKeys().includes(el.dataset.biologyContextFlag || '')) return;
    el.disabled = true;
    try {
      await applyBiologyScoreContextFlag(el.dataset.biologyContextFlag, el.checked);
      biologyScoreContextAIDeps.navigate?.('biology-scores');
    } catch (error) { showNotification(getErrorMessage(error, 'Could not save context'), 'error'); el.checked = !el.checked; }
    finally { el.disabled = false; }
  });
  document.addEventListener('click', async (event) => {
    const el = event.target instanceof Element ? event.target.closest('[data-biology-score-action]') : null;
    if (!(el instanceof HTMLElement)) return;
    const action = el.dataset.biologyScoreAction;
    if (!action || !['analyze-context-ai','apply-context-ai','dismiss-context-ai'].includes(action)) return;
    event.preventDefault();
    const originalText = el.textContent;
    el.setAttribute('disabled', 'true');
    try {
      if (action === 'analyze-context-ai') {
        el.setAttribute('disabled', 'true'); el.textContent = 'Analyzing…';
        const profileId = state.currentProfile;
        const review = await generateBiologyScoreContextReview(getActiveData());
        await saveBiologyScoreContextReview(review);
        if (state.currentProfile === profileId) biologyScoreContextAIDeps.navigate?.('biology-scores');
      } else if (action === 'apply-context-ai') {
        await applyBiologyScoreContextFlag(el.dataset.contextFlag || ''); showNotification('Context flag applied', 'success'); biologyScoreContextAIDeps.navigate?.('biology-scores');
      } else {
        await dismissBiologyScoreContextFlag(el.dataset.contextFlag || ''); showNotification('Context suggestion dismissed', 'info'); biologyScoreContextAIDeps.navigate?.('biology-scores');
      }
    } catch (err) { showNotification(getErrorMessage(err, 'Context AI failed'), 'error'); }
    finally { el.removeAttribute('disabled'); el.textContent = originalText; }
  });
}

installBiologyScoreContextAIDelegates();
