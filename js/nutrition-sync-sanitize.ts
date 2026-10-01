import type { NutritionMeal, MealImage } from '../types/nutrition-data.js';
import type { ProfileData } from '../types/app-state.js';
import { persistedNutritionComponent } from './nutrition-photo-provenance.js';

/** Imported meal extensions stay opaque after the existing id/date admission checks. */
export interface StoredNutritionMeal extends Record<string, unknown> {
  id: string;
  eatenAt: unknown;
}

type PersistedFields = Record<string, unknown>;

// Pure thumbnail-only nutrition boundary used by storage and sync codecs.

const THUMBNAIL_PATTERN = /^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/]*={0,2})$/i;
// Four thumbnails share a 1 MB decompressed per-row sync envelope. Keeping
// each one under 160 KiB leaves room for base64 expansion and meal metadata.
const MAX_THUMBNAIL_BYTES = 160 * 1024;

function safeThumbnailUrl(value: unknown) {
  if (typeof value !== 'string') return '';
  const match = value.match(THUMBNAIL_PATTERN);
  if (!match || !match[2] || match[2].length % 4 === 1) return '';
  const encoded = match[2];
  const bytes = Math.max(0, Math.floor((encoded.length * 3) / 4)
    - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0));
  return bytes <= MAX_THUMBNAIL_BYTES ? value : '';
}

function sanitizeMealImage(image: unknown): MealImage | null {
  if (!image || typeof image !== 'object' || Array.isArray(image)) return null;
  const fields = image as PersistedFields;
  const thumbnailUrl = safeThumbnailUrl(fields.thumbnailUrl);
  if (!thumbnailUrl) return null;
  // Allowlist metadata so a future/legacy full-image field cannot bypass this
  // boundary merely because it has a name this version does not recognize.
  const sanitized: MealImage = { thumbnailUrl };
  if (typeof fields.mediaType === 'string') sanitized.mediaType = (fields.mediaType as string).slice(0, 40);
  if (typeof fields.fileName === 'string') sanitized.fileName = (fields.fileName as string).slice(0, 160);
  for (const key of ['width', 'height', 'originalWidth', 'originalHeight'] as const) {
    const value = Number(fields[key]);
    if (Number.isFinite(value) && value >= 0 && value <= 50000) sanitized[key] = value;
  }
  if (Array.isArray(fields.qualityWarnings)) {
    sanitized.qualityWarnings = (fields.qualityWarnings as unknown[])
      .filter((value: unknown): value is string => typeof value === 'string')
      .map(value => value.slice(0, 160))
      .slice(0, 8);
  }
  return sanitized;
}

function sanitizeResponseCheckIn(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const fields = value as PersistedFields;
  const sanitized: NonNullable<NutritionMeal['responseCheckIn']> = {};
  for (const key of ['satiety2h', 'energy2h'] as const) {
    const level = Number(fields[key]);
    if (Number.isInteger(level) && level >= 1 && level <= 3) sanitized[key] = level;
  }
  if (!Object.keys(sanitized).length) return null;
  const recordedAt = new Date((fields.recordedAt || '') as string | number);
  if (Number.isFinite(recordedAt.getTime())) sanitized.recordedAt = recordedAt.toISOString();
  return sanitized;
}

function sanitizeMealComponent(component: unknown) {
  if (!component || typeof component !== 'object' || Array.isArray(component)) return component;
  return persistedNutritionComponent(component);
}

/** Canonical meal shape allowed in IndexedDB, exports, and cross-device sync. */
export function sanitizeNutritionMeal(meal: NutritionMeal): NutritionMeal;
export function sanitizeNutritionMeal(meal: unknown): unknown;
export function sanitizeNutritionMeal(meal: unknown): unknown {
  if (!meal || typeof meal !== 'object' || Array.isArray(meal)) return meal;
  const fields = meal as PersistedFields;
  const sanitized: PersistedFields = { ...meal };
  if (Array.isArray(fields.components)) sanitized.components = (fields.components as unknown[]).map(sanitizeMealComponent).slice(0, 100);
  const sourceImages = Array.isArray(fields.images) && (fields.images as unknown[]).length
    ? fields.images as unknown[]
    : fields.image ? [fields.image] : [];
  sanitized.images = sourceImages.map(sanitizeMealImage).filter(Boolean).slice(0, 4);
  const responseCheckIn = sanitizeResponseCheckIn(fields.responseCheckIn);
  if (responseCheckIn) sanitized.responseCheckIn = responseCheckIn;
  else delete sanitized.responseCheckIn;
  delete sanitized.image;
  for (const key of ['dataUrl', 'photoDataUrl', 'fullSizePhoto']) delete sanitized[key];
  return sanitized;
}

/** Return a shallow profile clone only when its nutrition surface changes. */
export function sanitizeNutritionProfileData(importedData: ProfileData): ProfileData;
export function sanitizeNutritionProfileData(importedData: unknown): unknown;
export function sanitizeNutritionProfileData(importedData: unknown): unknown {
  if (!importedData || typeof importedData !== 'object' || !Array.isArray((importedData as PersistedFields).nutritionMeals)) {
    return importedData;
  }
  return {
    ...importedData,
    nutritionMeals: ((importedData as PersistedFields).nutritionMeals as unknown[]).map(sanitizeNutritionMeal),
  };
}
