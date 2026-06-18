// @ts-check
// import-review-draft.js - session-scoped storage for in-progress import review.

export const IMPORT_REVIEW_DRAFT_KEY = 'labcharts-import-review-draft-v1';

const IMPORT_REVIEW_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

function getImportReviewDraftStorage() {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch (err) {
    return null;
  }
}

export function hasImportReviewDraft() {
  return !!getImportReviewDraftStorage()?.getItem(IMPORT_REVIEW_DRAFT_KEY);
}

export function clearImportReviewDraft() {
  getImportReviewDraftStorage()?.removeItem(IMPORT_REVIEW_DRAFT_KEY);
}

function sanitizeImportReviewDraft(parseResult, excludedIndices) {
  const draft = { ...(parseResult || {}) };
  delete draft.privacyOriginal;
  delete draft.privacyObfuscated;
  delete draft.rawText;
  delete draft.sourceText;
  delete draft.pages;
  draft._excludedImportIndices = excludedIndices;
  return draft;
}

/**
 * @param {any} parseResult
 * @param {{ profileId?: string, excludedIndices?: number[], isBatch?: boolean, debug?: boolean }} [options]
 */
export function persistImportReviewDraft(parseResult, {
  profileId,
  excludedIndices = [],
  isBatch = false,
  debug = false,
} = {}) {
  if (!parseResult || isBatch) {
    if (isBatch) clearImportReviewDraft();
    return;
  }
  const storage = getImportReviewDraftStorage();
  if (!storage) return;
  const payload = {
    profileId: profileId || 'default',
    savedAt: Date.now(),
    parseResult: sanitizeImportReviewDraft(parseResult, excludedIndices),
  };
  try {
    storage.setItem(IMPORT_REVIEW_DRAFT_KEY, JSON.stringify(payload));
  } catch (err) {
    if (debug) console.warn('[Import] Could not save import review draft', err);
  }
}

export function readImportReviewDraft(profileId) {
  const storage = getImportReviewDraftStorage();
  const raw = storage?.getItem(IMPORT_REVIEW_DRAFT_KEY);
  if (!storage || !raw) return null;
  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    storage.removeItem(IMPORT_REVIEW_DRAFT_KEY);
    return null;
  }
  if (!payload || Date.now() - Number(payload.savedAt || 0) > IMPORT_REVIEW_DRAFT_TTL_MS) {
    storage.removeItem(IMPORT_REVIEW_DRAFT_KEY);
    return null;
  }
  if (payload.profileId && payload.profileId !== profileId) return null;
  const parseResult = payload.parseResult;
  if (!parseResult || !Array.isArray(parseResult.markers)) {
    storage.removeItem(IMPORT_REVIEW_DRAFT_KEY);
    return null;
  }
  return parseResult;
}
