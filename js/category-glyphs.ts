// category-glyphs.js - Coded glyph rendering for marker categories

import { escapeHTML } from './utils.js';

const CATEGORY_GLYPH_CODES: Readonly<Record<string, string>> = Object.freeze({
  biochemistry: 'BC',
  hormones: 'HR',
  electrolytes: 'EM',
  lipids: 'LP',
  iron: 'FE',
  proteins: 'IN',
  thyroid: 'TH',
  vitamins: 'VT',
  diabetes: 'GL',
  tumorMarkers: 'TM',
  coagulation: 'CG',
  hematology: 'CB',
  wbcDifferential: 'WB',
  bone: 'BN',
  urinalysis: 'UR',
  bodyComposition: 'BD',
  boneDensity: 'DX',
  calculatedRatios: 'RT',
});

export function getCategoryGlyphCode(categoryKey: string, label: unknown = ''): string {
  if (CATEGORY_GLYPH_CODES[categoryKey]) return CATEGORY_GLYPH_CODES[categoryKey]!;
  const words = String(label || categoryKey || '')
    .replace(/&/g, ' ')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  const compact = String(label || categoryKey || 'M').replace(/[^A-Za-z0-9]+/g, '');
  return (compact.slice(0, 2) || 'M').toUpperCase();
}

export function renderCategoryGlyph(categoryKey: string, label: unknown, { large = false }: { large?: boolean } = {}): string {
  const code = getCategoryGlyphCode(categoryKey, label);
  return `<span class="category-glyph${large ? ' category-glyph-large' : ''}" aria-hidden="true">${escapeHTML(code)}</span>`;
}
