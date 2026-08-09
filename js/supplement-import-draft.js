// @ts-check
// supplement-import-draft.js — Validated, review-before-apply extraction drafts.

import {
  formatSupplementAmount,
  normalizeSupplementUnit,
  parseSupplementQuantity,
} from './supplement-medication-domain.js';

/**
 * @typedef {{ value: number, unit: string }} ParsedPageQuantity
 * @typedef {{
 *   name: string,
 *   amountValue: number | null,
 *   amountUnit: string,
 *   basis: string,
 *   confidence: number | null,
 * }} ImportedIngredient
 */

const EMPTYISH = /^(?:n\/?a|none|unknown|not\s+(?:specified|found|available|provided))$/i;

/** @param {unknown} value */
function cleanString(value) {
  if (typeof value !== 'string') return '';
  const clean = value.trim().replace(/\s+/g, ' ');
  return !clean || EMPTYISH.test(clean) ? '' : clean;
}

/** @param {unknown} value */
function cleanConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(1, numeric));
}

/** @param {unknown} value */
function uniqueStrings(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(cleanString).filter(Boolean))];
}

/** @param {unknown} value */
export function supplementImportIngredientKey(value) {
  return cleanString(value)
    .normalize('NFKD')
    // Fold Latin accents for cross-source matching without stripping marks
    // that carry meaning in scripts such as Japanese or Arabic.
    .replace(/([\p{Script=Latin}])\p{M}+/gu, '$1')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .trim()
    .normalize('NFC');
}

/** @param {any} source */
function normalizeSource(source = {}) {
  return {
    kind: cleanString(source.kind) || 'ai',
    url: cleanString(source.url),
    deterministicFields: uniqueStrings(source.deterministicFields),
    reviewed: source.reviewed === true,
  };
}

/** @param {any} raw @param {string} sourceKind */
function normalizeIngredient(raw, sourceKind) {
  if (!raw || typeof raw !== 'object') return null;
  const name = cleanString(raw.name || raw.ingredient || raw.activeIngredient);
  if (!name) return null;
  const amountRaw = cleanString(raw.amount || raw.amountRaw);
  const parsed = parseSupplementQuantity(amountRaw);
  const numeric = Number(raw.amountValue ?? raw.value);
  const amountValue = Number.isFinite(numeric) ? numeric : parsed?.value ?? null;
  const amountUnit = normalizeSupplementUnit(raw.amountUnit || raw.unit || parsed?.unit || '');
  return {
    name,
    amountValue,
    amountUnit,
    amount: amountValue != null ? formatSupplementAmount(amountValue, amountUnit) : amountRaw,
    basis: cleanString(raw.basis || raw.amountBasis || 'per serving'),
    confidence: cleanConfidence(raw.confidence),
    sourceKinds: uniqueStrings([...(raw.sourceKinds || []), sourceKind]),
  };
}

const IMPORT_FACT_FIELDS = [
  'product', 'genericName', 'brand', 'type', 'dosageForm', 'route',
  'servingSize', 'labelDirections', 'ingredients', 'inactiveIngredients', 'qualityTests', 'warnings',
];

const QUALITY_CATEGORIES = new Set(['contaminant', 'potency', 'microbiology', 'identity', 'other']);
const QUALITY_STATUSES = new Set(['pass', 'fail', 'not-detected', 'not-quantified', 'negative', 'reported', 'unknown']);

/** @param {unknown} value */
function normalizeInactiveIngredient(value) {
  const objectValue = value && typeof value === 'object' ? /** @type {any} */ (value) : {};
  const name = cleanString(typeof value === 'string' ? value : objectValue.name || objectValue.ingredient);
  return name || null;
}

/** @param {any} raw @param {string} sourceKind */
function normalizeQualityTest(raw, sourceKind) {
  if (typeof raw === 'string') {
    const [name, ...resultParts] = raw.split(/\s*:\s*/u);
    raw = { analyte: name, resultText: resultParts.join(': ') };
  }
  if (!raw || typeof raw !== 'object') return null;
  const analyte = cleanString(raw.analyte || raw.name || raw.test || raw.substance);
  if (!analyte) return null;
  const resultText = cleanString(raw.resultText || raw.result || raw.measured || raw.valueText);
  const quantityText = resultText.replace(/^(?:≤|<=|>=|<|>|=)\s*/u, '');
  const parsed = parseSupplementQuantity(quantityText);
  const numeric = Number(raw.value ?? raw.amountValue);
  const value = Number.isFinite(numeric) ? numeric : parsed?.value ?? null;
  const category = cleanString(raw.category).toLowerCase();
  const status = cleanString(raw.status).toLowerCase();
  return {
    category: QUALITY_CATEGORIES.has(category) ? category : 'other',
    analyte,
    canonicalAnalyte: cleanString(raw.canonicalAnalyte || raw.canonicalName) || analyte,
    resultText: resultText || (value != null ? formatSupplementAmount(value, raw.unit || parsed?.unit || '') : ''),
    comparator: cleanString(raw.comparator),
    value,
    unit: normalizeSupplementUnit(raw.unit || raw.amountUnit || parsed?.unit || ''),
    basis: cleanString(raw.basis || raw.per || raw.matrix),
    declaredText: cleanString(raw.declaredText || raw.declared || raw.labelClaim),
    limitText: cleanString(raw.limitText || raw.limit || raw.specification),
    method: cleanString(raw.method),
    status: QUALITY_STATUSES.has(status) ? status : 'unknown',
    confidence: cleanConfidence(raw.confidence),
    sourceKinds: uniqueStrings([...(raw.sourceKinds || []), sourceKind]),
  };
}

/** @param {any} test */
function qualityTestKey(test) {
  return [test?.category, supplementImportIngredientKey(test?.canonicalAnalyte || test?.analyte), supplementImportIngredientKey(test?.basis)]
    .filter(Boolean).join('|');
}

/** @param {any} draft */
function collectDraftIssues(draft) {
  const issues = [];
  if (!draft.product) issues.push('Product name was not found.');
  if (!draft.ingredients.length) issues.push('No active ingredients were found.');
  for (const ingredient of draft.ingredients) {
    if (ingredient.amountValue == null) issues.push(`${ingredient.name}: verify the amount.`);
    if (ingredient.amountValue != null && !ingredient.amountUnit) issues.push(`${ingredient.name}: choose a unit.`);
  }
  return issues;
}

/** @param {any} draft */
function draftEvidence(draft) {
  const evidence = Array.isArray(draft?.source?.evidence) && draft.source.evidence.length
    ? draft.source.evidence : draft?.source ? [draft.source] : [];
  return evidence.map(normalizeSource);
}

/** @param {any[]} sources */
function mergeEvidence(sources) {
  const merged = [];
  const positions = new Map();
  for (const rawSource of sources) {
    const source = normalizeSource(rawSource);
    const key = `${source.kind.toLowerCase()}|${source.url}`;
    const position = positions.get(key);
    if (position == null) {
      positions.set(key, merged.length);
      merged.push(source);
      continue;
    }
    const existing = merged[position];
    merged[position] = {
      ...existing,
      deterministicFields: uniqueStrings([
        ...existing.deterministicFields,
        ...source.deterministicFields,
      ]),
      // Re-running a source creates new evidence that must be applied again.
      reviewed: existing.reviewed && source.reviewed,
    };
  }
  return merged;
}

/** @param {any[]} evidence */
function aggregateSource(evidence) {
  const kinds = uniqueStrings(evidence.map(source => source.kind));
  return {
    kind: kinds.join(' + ') || 'ai',
    url: evidence.find(source => source.url)?.url || '',
    deterministicFields: uniqueStrings(evidence.flatMap(source => source.deterministicFields)),
    reviewed: evidence.length > 0 && evidence.every(source => source.reviewed),
    evidence,
  };
}

/** @param {unknown} left @param {unknown} right */
function sameFact(left, right) {
  if (typeof left === 'string' && typeof right === 'string') {
    return cleanString(left).toLowerCase() === cleanString(right).toLowerCase();
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

/** @param {any} ingredient */
function ingredientAmountLabel(ingredient) {
  return ingredient.amountValue != null
    ? formatSupplementAmount(ingredient.amountValue, ingredient.amountUnit)
    : ingredient.amount || 'amount not found';
}

/** @param {unknown} value */
function pageText(value) {
  return typeof value === 'string'
    ? value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
}

// Longest localized unit forms come first. The Unicode-safe lookahead avoids
// relying on \b, whose word semantics do not work at CJK/Cyrillic boundaries.
const PAGE_QUANTITY_RE = /([+-]?(?:\d{1,3}(?:[ ,.\u00a0]\d{3})+|\d+)(?:[.,]\d+)?)\s*((?:(?:billion|milliard|miliard)\s+)?CFU|マイクログラム|ミリリットル|ミリグラム|마이크로그램|밀리그램|밀리리터|अंतरराष्ट्रीय इकाई|माइक्रोग्राम|मिलीग्राम|मिलीलीटर|میكروغرام|ميكروغرام|国际单位|國際單位|国際単位|毫克|微克|毫升|มิลลิกรัม|ไมโครกรัม|มิลลิลิตร|мкг|мг|мл|м\.?е\.?|ед\.?|кое|ملغ|مجم|مكغ|מק["״]?ג|מ["״]?ג|גרם|מ["״]?ל|국제단위|그램|ग्राम|mcg|[µμ]g|ug|mg|mL|ml|IU|I\.U\.|mmol|mEq|CFU|units?|克|グラム|г|غ|مل|%)(?=$|[\s)\](*,/;:†‡（])/iu;

/** @param {string} text @returns {ParsedPageQuantity | null} */
function parsePageQuantity(text) {
  const clean = pageText(text);
  const knownUnit = clean.match(PAGE_QUANTITY_RE);
  if (knownUnit) return parseSupplementQuantity(`${knownUnit[1]} ${knownUnit[2]}`);
  const withoutFootnotes = clean.replace(/\s+(?:\*+|\([^)]*%[^)]*\)|\d+(?:[.,]\d+)?\s*%)\s*$/u, '');
  return parseSupplementQuantity(withoutFootnotes);
}

/**
 * @param {{ value?: number, unit?: string } | null | undefined} amount
 * @returns {amount is ParsedPageQuantity}
 */
function isCredibleIngredientQuantity(amount) {
  const unit = pageText(amount?.unit || '');
  if (!unit || !/[\p{L}%]/u.test(unit) || /^\./u.test(unit)) return false;
  // Administration/package forms describe counts, not active-ingredient
  // strengths. The structural table classifier remains language-independent;
  // this list only rejects common form units that otherwise look numeric.
  return !/(?:capsul|softgel|tablet|caplet|serving|dose|pieces?|count|bottles?|kapsl|dáv|davk|balen|kus|kapsuł|sztuk|gélul|comprim|cápsul|compresse|капсул|таблет|доз|штук|カプセル|錠|粒|片)$/iu.test(unit);
}

/** @param {string} text @param {string} [basis] @returns {ImportedIngredient | null} */
function ingredientFromText(text, basis = 'per serving') {
  const clean = pageText(text);
  const quantityMatch = clean.match(PAGE_QUANTITY_RE);
  const amount = parsePageQuantity(clean);
  if (!amount || !isCredibleIngredientQuantity(amount)) return null;
  let name = '';
  if (quantityMatch?.index != null) {
    name = pageText(clean.slice(0, quantityMatch.index)).replace(/[,:;\-–—]+$/u, '').trim();
    if (!name) name = pageText(clean.slice(quantityMatch.index + quantityMatch[0].length)).replace(/^[,:;\-–—]+/u, '').trim();
  }
  if (!name) return null;
  return {
    name,
    amountValue: amount.value,
    amountUnit: amount.unit,
    basis,
    confidence: 1,
  };
}

/** @param {unknown} value @param {any[]} output */
function collectJsonLdObjects(value, output) {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonLdObjects(item, output);
    return;
  }
  if (!value || typeof value !== 'object') return;
  output.push(value);
  if (Array.isArray(value['@graph'])) collectJsonLdObjects(value['@graph'], output);
}

/** @param {Document} document */
function jsonLdProduct(document) {
  const objects = [];
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { collectJsonLdObjects(JSON.parse(script.textContent || ''), objects); }
    catch { /* malformed publisher JSON is left for the text/AI fallback */ }
  }
  return objects.find(item => /(?:product|drug|dietarysupplement)/iu.test(String(item['@type'] || '')))
    || objects.find(item => item.name && (item.brand || item.description || item.ingredients || item.sku))
    || null;
}

/** @param {any} value */
function structuredBrand(value) {
  if (typeof value === 'string') return pageText(value);
  if (value && typeof value === 'object') return pageText(value.name || value.value);
  return '';
}

/** @param {any} raw @param {string} basis @returns {ImportedIngredient | null} */
function structuredIngredient(raw, basis) {
  if (typeof raw === 'string') return ingredientFromText(raw, basis);
  if (!raw || typeof raw !== 'object') return null;
  const name = pageText(raw.name || raw.ingredient || raw.propertyID || raw.activeIngredient);
  if (!name || /(?:serving|dose|direction|package|count|weight|flavo|color|size)/iu.test(name)) return null;
  const value = raw.amount ?? raw.value ?? raw.dose ?? raw.quantity;
  if (value && typeof value === 'object') {
    const amountValue = Number(value.value ?? value.amount);
    const amountUnit = normalizeSupplementUnit(value.unitText || value.unitCode || value.unit || '');
    if (Number.isFinite(amountValue)) {
      return { name, amountValue, amountUnit, basis, confidence: 1 };
    }
  }
  const parsed = parsePageQuantity(String(value ?? '')) || parsePageQuantity(`${name} ${value ?? ''}`);
  return {
    name,
    amountValue: parsed?.value ?? null,
    amountUnit: parsed?.unit || '',
    basis,
    confidence: parsed ? 1 : null,
  };
}

/** @param {any} product @returns {ImportedIngredient[]} */
function jsonLdIngredients(product) {
  if (!product) return [];
  const basis = pageText(product.servingSize || product.doseSchedule || 'per serving');
  /** @type {any[]} */
  const candidates = [];
  for (const field of ['activeIngredient', 'activeIngredients', 'ingredient', 'ingredients', 'hasPart']) {
    const value = product[field];
    if (Array.isArray(value)) candidates.push(...value);
    else if (value != null) candidates.push(value);
  }
  const additional = Array.isArray(product.additionalProperty)
    ? product.additionalProperty : product.additionalProperty ? [product.additionalProperty] : [];
  candidates.push(...additional);
  return candidates.flatMap(candidate => {
    if (typeof candidate === 'string' && /[;,]/u.test(candidate)) {
      return candidate.split(/\s*[;]\s*/u)
        .map(value => structuredIngredient(value, basis))
        .filter(ingredient => ingredient !== null);
    }
    const ingredient = structuredIngredient(candidate, basis);
    return ingredient ? [ingredient] : [];
  });
}

/** @param {string} text @returns {{ value: number | null, unit: string }} */
function servingFromText(text) {
  const match = pageText(text).match(/(?:per|in|ve|v|na)\s*(\d+(?:[.,]\d+)?)\s*(softgels?|capsules?|caps?|kapsl\p{L}*|tablets?|tablet\p{L}*|drops?|kapek|ml|mL|scoops?|odměr\p{L}*)/iu);
  if (!match) return { value: null, unit: '' };
  const rawUnit = match[2].toLowerCase();
  const unit = /softgel|caps|kapsl/.test(rawUnit) ? 'capsule'
    : /tablet/.test(rawUnit) ? 'tablet'
      : /drop|kapek/.test(rawUnit) ? 'drop'
        : /scoop|odměr/.test(rawUnit) ? 'scoop'
          : /ml/.test(rawUnit) ? 'mL' : '';
  return { value: Number(match[1].replace(',', '.')), unit };
}

/** @param {Element} table */
function supplementTableScore(table) {
  const header = pageText(Array.from(table.querySelectorAll('thead th, tr:first-child th'))
    .map(cell => cell.textContent || '').join(' '));
  let context = '';
  let parent = table.parentElement;
  for (let depth = 0; parent && depth < 4; depth++, parent = parent.parentElement) {
    context += ` ${parent.id || ''} ${parent.className || ''}`;
  }
  let score = 0;
  if (/(?:supplement facts?|drug facts?|active|aktivn|účinn|složen|zložen|composition|ingredient|nutritional)/iu.test(header)) score += 10;
  if (/(?:supplement[-_ ]?facts?|drug[-_ ]?facts?)/iu.test(context)) score += 8;
  if (/(?:amount|quantity|množstv|per serving|ve\s*\d+|v\s*\d+)/iu.test(header)) score += 4;
  if (/(?:measured|naměř|deklarov|laborat|result|výsledek)/iu.test(header)) score -= 18;
  const rows = Array.from(table.querySelectorAll('tbody tr, tr'));
  let quantityRows = 0;
  let comparisonRows = 0;
  for (const row of rows) {
    const quantities = Array.from(row.querySelectorAll('th, td')).slice(1)
      .map(cell => parsePageQuantity(cell.textContent || ''))
      .filter(isCredibleIngredientQuantity);
    if (quantities.length) quantityRows++;
    if (quantities.filter(quantity => quantity.unit !== '%').length >= 2) comparisonRows++;
  }
  if (quantityRows >= 2) score += 12;
  else if (quantityRows === 1) score += 3;
  if (comparisonRows) score -= 12;
  return score;
}

/** @param {Document} document @param {RegExp} labelPattern */
function textAfterPageLabel(document, labelPattern) {
  const labels = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,strong,b'));
  const label = labels.find(element => labelPattern.test(
    pageText(element.textContent || '').replace(/[:\s]+$/u, ''),
  ));
  if (!label) return '';
  const inlineContainer = label.closest('p, li');
  const labelledContainer = label.parentElement?.closest('[class*="dosage"], [id*="dosage"], [class*="direction"], [id*="direction"]');
  const source = inlineContainer || labelledContainer || label.nextElementSibling || label.parentElement;
  if (!source) return '';
  const fullText = pageText(source.textContent || '');
  const labelText = pageText(label.textContent || '');
  return pageText(fullText.startsWith(labelText) ? fullText.slice(labelText.length) : fullText)
    .replace(/^[:\-–—]\s*/u, '')
    .slice(0, 1200);
}

/**
 * Put likely label facts before navigation and marketing copy for the AI
 * fallback. Quantities are a language-neutral signal, and original text is
 * preserved so names and directions can remain in the source script.
 * @param {Document} document
 * @param {string} title
 * @param {string} bodyText
 */
function prioritizedPageEvidence(document, title, bodyText) {
  const snippets = [];
  const seen = new Set();
  let length = 0;
  // Tables compactly preserve labels, measured values, limits, and assay
  // outcomes. Give every row to the semantic classifier; numeric shape alone
  // must not decide that a row is an active ingredient.
  for (const element of document.querySelectorAll('tr')) {
    const snippet = pageText(Array.from(element.querySelectorAll(':scope > th, :scope > td'))
      .map(cell => cell.textContent || '').join(' | '));
    if (!snippet || snippet.length > 1600 || seen.has(snippet)) continue;
    seen.add(snippet);
    snippets.push(snippet);
    length += snippet.length;
    if (length >= 12000) break;
  }
  for (const element of document.querySelectorAll('p, li, dt, dd')) {
    const snippet = pageText(element.textContent || '');
    if (!snippet || snippet.length > 1600 || !PAGE_QUANTITY_RE.test(snippet) || seen.has(snippet)) continue;
    seen.add(snippet);
    snippets.push(snippet);
    length += snippet.length;
    if (length >= 16000) break;
  }
  return [title, ...snippets, bodyText].filter(Boolean).join('\n');
}

/**
 * Extract verified facts directly from product-page markup. This avoids asking
 * a model to recreate clean ingredient tables as JSON and gives the AI path a
 * deterministic fallback when a storefront already publishes structured data.
 * @param {string} html
 * @param {typeof DOMParser} [Parser]
 */
export function extractSupplementPageFacts(html, Parser = globalThis.DOMParser) {
  if (typeof html !== 'string' || !html.trim() || typeof Parser !== 'function') {
    return { facts: {}, deterministicFields: [], evidenceText: '' };
  }
  const document = new Parser().parseFromString(html, 'text/html');
  const product = jsonLdProduct(document);
  const heading = document.querySelector('h1');
  const cleanHeading = /** @type {Element | null} */ (heading?.cloneNode(true) || null);
  if (cleanHeading) {
    cleanHeading.querySelectorAll('.product-appendix, .appendix').forEach(element => element.remove());
  }
  const title = pageText(cleanHeading?.textContent || '')
    || pageText(product?.name)
    || pageText(document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '').split(/\s+[|–—]\s+/u)[0]
    || pageText(document.title).split(/\s+[|–—]\s+/u)[0];
  const brand = structuredBrand(product?.brand || product?.manufacturer) || pageText(
    document.querySelector('[itemprop="brand"] [itemprop="name"]')?.getAttribute('content')
      || document.querySelector('meta[itemprop="brand"]')?.getAttribute('content')
      || '',
  );
  const tables = Array.from(document.querySelectorAll('table'))
    .map(table => ({ table, score: supplementTableScore(table) }));
  // Ambiguous quantity tables remain AI evidence. Applying them directly as
  // ingredients would confuse certificates, contaminants, and package specs
  // with intentionally formulated actives.
  const selectedTables = tables.filter(candidate => candidate.score >= 16).map(candidate => candidate.table);
  const ingredients = jsonLdIngredients(product);
  const seen = new Set(ingredients.map(ingredient => supplementImportIngredientKey(ingredient.name)));
  /** @type {{ value: number | null, unit: string }} */
  let servingSize = { value: null, unit: '' };
  for (const selectedTable of selectedTables) {
    const headerCells = Array.from(selectedTable.querySelectorAll('thead th, tr:first-child th'));
    const basis = pageText(headerCells[0]?.textContent || '') || 'per serving';
    const tableServing = servingFromText(basis);
    if (servingSize.value == null && tableServing.value != null) servingSize = tableServing;
    const rows = selectedTable.querySelectorAll('tbody tr').length
      ? Array.from(selectedTable.querySelectorAll('tbody tr'))
      : Array.from(selectedTable.querySelectorAll('tr')).slice(1);
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll('th, td'));
      let name = pageText(cells[0]?.textContent || '');
      if (!name) continue;
      let amount = cells.slice(1)
        .map(cell => parsePageQuantity(cell.textContent || ''))
        .find(isCredibleIngredientQuantity);
      if (!amount) {
        const inline = ingredientFromText(name, basis);
        if (inline?.amountValue != null) {
          name = inline.name;
          amount = {
            value: inline.amountValue,
            unit: inline.amountUnit,
          };
        }
      }
      const key = supplementImportIngredientKey(name);
      if (!amount || !key || seen.has(key)) continue;
      seen.add(key);
      ingredients.push({
        name,
        amountValue: amount.value,
        amountUnit: amount.unit,
        basis,
        confidence: 1,
      });
    }
  }
  const definitionPairs = Array.from(document.querySelectorAll(
    '[class*="ingredient"] dt, [id*="ingredient"] dt, [class*="supplement"] dt, [id*="supplement"] dt, [class*="drug-facts"] dt, [id*="drug-facts"] dt',
  ));
  for (const term of definitionPairs) {
    const value = term.nextElementSibling;
    if (!value || value.tagName.toLowerCase() !== 'dd') continue;
    const ingredient = ingredientFromText(`${pageText(term.textContent || '')} ${pageText(value.textContent || '')}`);
    const key = supplementImportIngredientKey(ingredient?.name);
    if (!ingredient || !key || seen.has(key)) continue;
    seen.add(key);
    ingredients.push(ingredient);
  }
  const labelledItems = Array.from(document.querySelectorAll(
    '[class*="ingredient"] li, [id*="ingredient"] li, [class*="supplement-facts"] li, [id*="supplement-facts"] li, [class*="drug-facts"] li, [id*="drug-facts"] li',
  ));
  for (const item of labelledItems) {
    const ingredient = ingredientFromText(item.textContent || '');
    const key = supplementImportIngredientKey(ingredient?.name);
    if (!ingredient || !key || seen.has(key)) continue;
    seen.add(key);
    ingredients.push(ingredient);
  }
  if (servingSize.value == null && product?.servingSize) servingSize = servingFromText(String(product.servingSize));
  const labelDirections = textAfterPageLabel(
    document,
    /^(?:recommended (?:use|dosage)|directions|suggested use|doporučen[ée] dávkování|dávkování|odporúčané dávkovanie)$/iu,
  );
  const warning = textAfterPageLabel(document, /^(?:warning|warnings|upozornění|upozornenie)$/iu);
  const bodyText = pageText(document.body?.textContent || '');
  const type = /(?:doplněk stravy|výživový doplnok|dietary supplement|supplement facts)/iu.test(bodyText)
    ? 'supplement'
    : /(?:drug facts|prescription only|léčivý přípravek|liek)/iu.test(bodyText) ? 'medication' : '';
  const facts = {
    product: title,
    brand,
    type,
    dosageForm: pageText(product?.dosageForm) || servingSize.unit,
    servingSize,
    labelDirections,
    ingredients,
    inactiveIngredients: [],
    qualityTests: [],
    warnings: warning ? [warning] : [],
    confidence: ingredients.some(ingredient => ingredient.amountValue != null) ? 1 : null,
  };
  const deterministicFields = IMPORT_FACT_FIELDS.filter(field => {
    const value = facts[field];
    if (field === 'ingredients') return ingredients.some(ingredient => ingredient.amountValue != null);
    return field === 'servingSize'
      ? value?.value != null || !!value?.unit
      : !!value && (!Array.isArray(value) || value.length > 0);
  });
  return { facts, deterministicFields, evidenceText: prioritizedPageEvidence(document, title, bodyText) };
}

/**
 * Accepts both the old extraction shape and the v2 strict schema.
 * @param {any} parsed
 * @param {{ kind?: string, url?: string, deterministicFields?: string[] }} [source]
 */
export function normalizeSupplementImportDraft(parsed, source = {}) {
  if (!parsed || typeof parsed !== 'object') throw new Error('Extraction did not return an object');
  const importSource = normalizeSource(source);
  const rawIngredients = Array.isArray(parsed.ingredients)
    ? parsed.ingredients
    : Array.isArray(parsed) ? parsed : [];
  const inactiveIngredients = (Array.isArray(parsed.inactiveIngredients) ? parsed.inactiveIngredients : [])
    .map(normalizeInactiveIngredient).filter(Boolean);
  const qualityTests = (Array.isArray(parsed.qualityTests) ? parsed.qualityTests : [])
    .map(raw => normalizeQualityTest(raw, importSource.kind)).filter(Boolean);
  const nonActiveKeys = new Set([
    ...inactiveIngredients.map(supplementImportIngredientKey),
  ]);
  const ingredients = rawIngredients.map(raw => normalizeIngredient(raw, importSource.kind)).filter(ingredient =>
    ingredient && !nonActiveKeys.has(supplementImportIngredientKey(ingredient.name))
  );
  const serving = parsed.servingSize && typeof parsed.servingSize === 'object'
    ? parsed.servingSize : {};
  const servingValue = Number(serving.value ?? serving.quantity);
  const draft = {
    product: cleanString(parsed.product || parsed.name),
    genericName: cleanString(parsed.genericName || parsed.activeName),
    brand: cleanString(parsed.brand),
    type: parsed.type === 'medication' ? 'medication' : parsed.type === 'supplement' ? 'supplement' : '',
    dosageForm: cleanString(parsed.dosageForm || parsed.form),
    route: cleanString(parsed.route),
    servingSize: {
      value: Number.isFinite(servingValue) ? servingValue : null,
      unit: normalizeSupplementUnit(serving.unit || serving.form || ''),
    },
    labelDirections: cleanString(parsed.labelDirections || parsed.directions || parsed.dosage),
    ingredients,
    inactiveIngredients: uniqueStrings(inactiveIngredients),
    qualityTests,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(cleanString).filter(Boolean) : [],
    confidence: cleanConfidence(parsed.confidence),
    fieldSources: {},
    source: aggregateSource([{ ...importSource, reviewed: false }]),
  };
  for (const field of IMPORT_FACT_FIELDS) {
    const value = draft[field];
    const hasValue = field === 'servingSize'
      ? value?.value != null || !!value?.unit
      : !!value && (!Array.isArray(value) || value.length > 0);
    if (hasValue) draft.fieldSources[field] = importSource.kind;
  }
  return { draft, issues: collectDraftIssues(draft) };
}

/**
 * Combine independently extracted link/photo evidence. Existing reviewed facts
 * win conflicts, missing values are filled, and distinct ingredients are
 * unioned. Conflicts remain visible for manual resolution instead of one
 * source silently replacing the other.
 * @param {{ draft: any, issues: string[] } | null} current
 * @param {{ draft: any, issues: string[] }} incoming
 */
export function mergeSupplementImportDrafts(current, incoming) {
  if (!current?.draft) return incoming;
  const base = current.draft;
  const next = incoming.draft;
  const conflicts = [];
  const merged = {
    ...base,
    fieldSources: { ...(base.fieldSources || {}) },
  };
  const labels = {
    product: 'Product name', genericName: 'Generic / active name', brand: 'Brand',
    type: 'Type', dosageForm: 'Form', route: 'Route', labelDirections: 'Label directions',
  };
  for (const field of Object.keys(labels)) {
    if (!merged[field] && next[field]) {
      merged[field] = next[field];
      merged.fieldSources[field] = next.fieldSources?.[field] || next.source.kind;
    } else if (merged[field] && next[field] && !sameFact(merged[field], next[field])) {
      conflicts.push(`${labels[field]} differs between sources; existing value kept. Confirm it in the form.`);
    }
  }

  merged.servingSize = { ...(base.servingSize || {}) };
  for (const field of ['value', 'unit']) {
    const baseValue = merged.servingSize[field];
    const nextValue = next.servingSize?.[field];
    if ((baseValue == null || baseValue === '') && nextValue != null && nextValue !== '') {
      merged.servingSize[field] = nextValue;
      merged.fieldSources.servingSize = next.fieldSources?.servingSize || next.source.kind;
    } else if (baseValue != null && baseValue !== '' && nextValue != null && nextValue !== '' && !sameFact(baseValue, nextValue)) {
      conflicts.push(`Serving size differs between sources; existing value kept. Confirm it in the form.`);
    }
  }

  merged.ingredients = (base.ingredients || []).map(ingredient => ({
    ...ingredient,
    sourceKinds: uniqueStrings(ingredient.sourceKinds),
  }));
  const ingredientPositions = new Map(merged.ingredients.map((ingredient, index) => [
    supplementImportIngredientKey(ingredient.name), index,
  ]));
  for (const incomingIngredient of next.ingredients || []) {
    const key = supplementImportIngredientKey(incomingIngredient.name);
    const position = ingredientPositions.get(key);
    if (position == null) {
      ingredientPositions.set(key, merged.ingredients.length);
      merged.ingredients.push({ ...incomingIngredient });
      continue;
    }
    const existing = merged.ingredients[position];
    const nextAmount = ingredientAmountLabel(incomingIngredient);
    const existingAmount = ingredientAmountLabel(existing);
    const mergedIngredient = {
      ...existing,
      sourceKinds: uniqueStrings([
        ...(existing.sourceKinds || []),
        ...(incomingIngredient.sourceKinds || []),
      ]),
    };
    if (existing.amountValue == null && incomingIngredient.amountValue != null) {
      mergedIngredient.amountValue = incomingIngredient.amountValue;
      mergedIngredient.amountUnit = incomingIngredient.amountUnit;
      mergedIngredient.amount = incomingIngredient.amount;
    } else if (existing.amountValue === incomingIngredient.amountValue
        && !existing.amountUnit && incomingIngredient.amountUnit) {
      mergedIngredient.amountUnit = incomingIngredient.amountUnit;
      mergedIngredient.amount = formatSupplementAmount(existing.amountValue, incomingIngredient.amountUnit);
    } else if (!existing.amount && incomingIngredient.amount) {
      mergedIngredient.amount = incomingIngredient.amount;
    } else if (existingAmount !== 'amount not found' && nextAmount !== 'amount not found' && !sameFact(existingAmount, nextAmount)) {
      conflicts.push(`${existing.name} amount differs (${existingAmount} vs ${nextAmount}); existing value kept. Confirm it in the form.`);
    }
    if (!mergedIngredient.basis && incomingIngredient.basis) mergedIngredient.basis = incomingIngredient.basis;
    if (mergedIngredient.confidence == null && incomingIngredient.confidence != null) {
      mergedIngredient.confidence = incomingIngredient.confidence;
    }
    merged.ingredients[position] = mergedIngredient;
  }
  if (merged.ingredients.length) {
    merged.fieldSources.ingredients = uniqueStrings(merged.ingredients.flatMap(ingredient => ingredient.sourceKinds)).join(' + ');
  }

  merged.inactiveIngredients = uniqueStrings([
    ...(base.inactiveIngredients || []),
    ...(next.inactiveIngredients || []),
  ]);
  if (merged.inactiveIngredients.length) {
    merged.fieldSources.inactiveIngredients = uniqueStrings([
      base.fieldSources?.inactiveIngredients,
      next.fieldSources?.inactiveIngredients,
    ]).join(' + ');
  }

  merged.qualityTests = (base.qualityTests || []).map(test => ({
    ...test,
    sourceKinds: uniqueStrings(test.sourceKinds),
  }));
  const qualityPositions = new Map(merged.qualityTests.map((test, index) => [qualityTestKey(test), index]));
  for (const incomingTest of next.qualityTests || []) {
    const key = qualityTestKey(incomingTest);
    const position = qualityPositions.get(key);
    if (position == null) {
      qualityPositions.set(key, merged.qualityTests.length);
      merged.qualityTests.push({ ...incomingTest });
      continue;
    }
    const existing = merged.qualityTests[position];
    const existingResult = cleanString(existing.resultText);
    const incomingResult = cleanString(incomingTest.resultText);
    if (existingResult && incomingResult && existingResult !== incomingResult) {
      conflicts.push(`${incomingTest.analyte} laboratory result differs between sources; existing value kept. Confirm it in the form.`);
    }
    merged.qualityTests[position] = {
      ...existing,
      ...Object.fromEntries(Object.entries(incomingTest).filter(([, value]) => value != null && value !== '')),
      ...(existingResult ? { resultText: existingResult } : {}),
      sourceKinds: uniqueStrings([...(existing.sourceKinds || []), ...(incomingTest.sourceKinds || [])]),
    };
  }
  if (merged.qualityTests.length) {
    merged.fieldSources.qualityTests = uniqueStrings(merged.qualityTests.flatMap(test => test.sourceKinds)).join(' + ');
  }

  merged.warnings = uniqueStrings([...(base.warnings || []), ...(next.warnings || [])]);
  merged.confidence = Math.max(Number(base.confidence) || 0, Number(next.confidence) || 0) || null;
  const evidence = mergeEvidence([...draftEvidence(base), ...draftEvidence(next)]);
  merged.source = aggregateSource(evidence);
  return {
    draft: merged,
    issues: uniqueStrings([...collectDraftIssues(merged), ...conflicts]),
  };
}

/** @param {string} text */
export function parseSupplementImportJson(text) {
  if (typeof text !== 'string') throw new Error('Extraction returned no text');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = (fenced || text).trim().replace(/^\uFEFF/, '');
  const objectStart = source.indexOf('{');
  const arrayStart = source.indexOf('[');
  const start = objectStart < 0 ? arrayStart : arrayStart < 0 ? objectStart : Math.min(objectStart, arrayStart);
  const objectEnd = source.lastIndexOf('}');
  const arrayEnd = source.lastIndexOf(']');
  const end = Math.max(objectEnd, arrayEnd);
  const candidate = start >= 0 && end >= start ? source.slice(start, end + 1) : '';
  if (!candidate) throw new Error('Extraction returned invalid JSON');
  try {
    return JSON.parse(candidate);
  } catch {
    // Small local models commonly emit smart quotes or trailing commas even
    // when instructed to return JSON. Repair only these unambiguous syntax
    // defects; semantic uncertainty still belongs in the review draft.
    const repaired = candidate
      .replace(/[“”]/g, '"')
      .replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(repaired); }
    catch { throw new Error('Extraction returned invalid JSON'); }
  }
}

export const SUPPLEMENT_EXTRACTION_SCHEMA_PROMPT = `Return ONLY one JSON object using this schema:
{"product":"","genericName":"","brand":"","type":"supplement|medication|null","dosageForm":"capsule/tablet/liquid/etc or null","route":"oral/topical/inhaled/injection/etc or null","servingSize":{"value":null,"unit":"capsule/tablet/mL/etc"},"labelDirections":"verbatim label meaning, concise","ingredients":[{"name":"formulated active ingredient only","amountValue":null,"amountUnit":"mg/mcg/g/mL/IU/CFU/%/mmol/mEq/units or source unit","basis":"per serving","confidence":0.0}],"inactiveIngredients":["excipient, filler, coating, capsule material, flavor, color, sweetener, or other non-active ingredient"],"qualityTests":[{"category":"contaminant|potency|microbiology|identity|other","analyte":"tested substance or organism exactly as shown","canonicalAnalyte":"language-independent canonical name for grouping, e.g. lead, cadmium, mercury, arsenic, or the original name if unknown","resultText":"exact reported result such as ND, NQ, < 0.01, 98 mg, negative, or pass","comparator":"<|<=|>|>=|=|ND|NQ or empty","value":null,"unit":"reported measurement unit or empty","basis":"per capsule, per serving, mg/kg, CFU/g, matrix, or empty","declaredText":"label claim if this is a potency comparison","limitText":"specification or regulatory limit if explicitly shown","method":"test method if shown","status":"pass|fail|not-detected|not-quantified|negative|reported|unknown","confidence":0.0}],"warnings":[],"confidence":0.0}
Understand the source in its original language and script. Preserve product, brand, ingredient, direction, warning, analyte, and result wording in that script; do not translate names. Extract only facts visible in the supplied source. Never invent a personal dose or schedule. Keep product label directions separate from personal use.
Classification is mandatory: ingredients contains only substances deliberately formulated as active dietary or medicinal ingredients. Put excipients and other non-active formulation substances in inactiveIngredients. Put every certificate-of-analysis or laboratory result—including potency verification, heavy metals, contaminants, microbes, allergens, identity/purity tests, ND/NQ values, and pass/fail results—only in qualityTests, never in ingredients. A tested analyte is not evidence that it was intentionally added. Exclude product metadata such as barcodes/EAN/GTIN/SKU, package count, price, stock, and expiry dates from all three lists. Ignore names, prescription numbers, pharmacy details, addresses and other patient-identifying text. Use null when a fact is not present.`;
