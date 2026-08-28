// @ts-check
// Pure thumbnail-only nutrition boundary used by storage and sync codecs.

const THUMBNAIL_PATTERN = /^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/]*={0,2})$/i;
// Four thumbnails share a 1 MB decompressed per-row sync envelope. Keeping
// each one under 160 KiB leaves room for base64 expansion and meal metadata.
const MAX_THUMBNAIL_BYTES = 160 * 1024;

function safeThumbnailUrl(value) {
  if (typeof value !== 'string') return '';
  const match = value.match(THUMBNAIL_PATTERN);
  if (!match || !match[2] || match[2].length % 4 === 1) return '';
  const encoded = match[2];
  const bytes = Math.max(0, Math.floor((encoded.length * 3) / 4)
    - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0));
  return bytes <= MAX_THUMBNAIL_BYTES ? value : '';
}

function sanitizeMealImage(image) {
  if (!image || typeof image !== 'object' || Array.isArray(image)) return null;
  const thumbnailUrl = safeThumbnailUrl(image.thumbnailUrl);
  if (!thumbnailUrl) return null;
  // Allowlist metadata so a future/legacy full-image field cannot bypass this
  // boundary merely because it has a name this version does not recognize.
  const sanitized = /** @type {any} */ ({ thumbnailUrl });
  if (typeof image.mediaType === 'string') sanitized.mediaType = image.mediaType.slice(0, 40);
  if (typeof image.fileName === 'string') sanitized.fileName = image.fileName.slice(0, 160);
  for (const key of ['width', 'height', 'originalWidth', 'originalHeight']) {
    const value = Number(image[key]);
    if (Number.isFinite(value) && value >= 0 && value <= 50000) sanitized[key] = value;
  }
  if (Array.isArray(image.qualityWarnings)) {
    sanitized.qualityWarnings = image.qualityWarnings
      .filter(value => typeof value === 'string')
      .map(value => value.slice(0, 160))
      .slice(0, 8);
  }
  return sanitized;
}

function sanitizeResponseCheckIn(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const sanitized = {};
  for (const key of ['satiety2h', 'energy2h']) {
    const level = Number(value[key]);
    if (Number.isInteger(level) && level >= 1 && level <= 3) sanitized[key] = level;
  }
  if (!Object.keys(sanitized).length) return null;
  const recordedAt = new Date(value.recordedAt || '');
  if (Number.isFinite(recordedAt.getTime())) sanitized.recordedAt = recordedAt.toISOString();
  return sanitized;
}

function sanitizeMealComponent(component) {
  if (!component || typeof component !== 'object' || Array.isArray(component)) return component;
  const sanitized = { ...component };
  // Candidate lists and pre-enrichment visual snapshots exist only while the
  // editor is open. They are derivable from the local USDA pack and must never
  // add duplicate database data to encrypted storage or cross-device sync.
  delete sanitized.foodDataCandidates;
  delete sanitized.foodCompositionAttempted;
  delete sanitized.visualNutrients;
  delete sanitized.visualNutrientsPer100g;
  return sanitized;
}

/** Canonical meal shape allowed in IndexedDB, exports, and cross-device sync. */
export function sanitizeNutritionMeal(meal) {
  if (!meal || typeof meal !== 'object' || Array.isArray(meal)) return meal;
  const sanitized = { ...meal };
  if (Array.isArray(meal.components)) sanitized.components = meal.components.map(sanitizeMealComponent).slice(0, 100);
  const sourceImages = Array.isArray(meal.images) && meal.images.length
    ? meal.images
    : meal.image ? [meal.image] : [];
  sanitized.images = sourceImages.map(sanitizeMealImage).filter(Boolean).slice(0, 4);
  const responseCheckIn = sanitizeResponseCheckIn(meal.responseCheckIn);
  if (responseCheckIn) sanitized.responseCheckIn = responseCheckIn;
  else delete sanitized.responseCheckIn;
  delete sanitized.image;
  for (const key of ['dataUrl', 'photoDataUrl', 'fullSizePhoto']) delete sanitized[key];
  return sanitized;
}

/** Return a shallow profile clone only when its nutrition surface changes. */
export function sanitizeNutritionProfileData(importedData) {
  if (!importedData || typeof importedData !== 'object' || !Array.isArray(importedData.nutritionMeals)) {
    return importedData;
  }
  return {
    ...importedData,
    nutritionMeals: importedData.nutritionMeals.map(sanitizeNutritionMeal),
  };
}
