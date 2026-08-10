// @ts-check
// supplement-context.js — Token-bounded supplement/medication context for AI features.

import { effectiveTimesPerDay, ingredientDailyTotal } from './supplement-impact.js';
import { getSupplementPeriods, getSupplementStatus } from './supplement-medication-domain.js';
import {
  aggregateSupplementContaminants,
  formatContaminantMass,
  formatSupplementQualityResult,
  isSupplementQualityIncludedInAI,
  supplementQualityEvidenceScope,
} from './supplement-quality.js';

export const SUPPLEMENT_CONTEXT_LIMITS = Object.freeze({
  compact: 6500,
  detail: 12000,
  biology: 4500,
});

const DETAIL_QUERY_RE = /(?:\bsupplements?\b|\bmedications?\b|\bmedicines?\b|\bdrugs?\b|\bvitamins?\b|\bpills?\b|capsul|softgel|tablet|excipient|filler|inactive ingredient|other ingredient|capsule material|capsule shell|coating|allergen|certificate of analysis|\bcoa\b|quality test|laboratory test|heavy metal|contaminant|cadmium|mercury|arsenic|\blead\b|doplněk|doplňky|l[eé]k|kapsl|pomocn[áeé]|plniv|obal kapsle|těžk[ée] kov|kontamin|laboratorn)/iu;
const MATERIAL_HINT_RE = /(?:capsul|softgel|shell|gelatin|cellulos|hypromellos|hpmc|pullulan|coating|allergen|soy|soya|milk|lactose|gluten|wheat|peanut|sesame|kapsl|obal|želatin|celul[oó]z)/iu;

/** @param {unknown} value @param {number} [max] */
function clean(value, max = 220) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]+/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, max);
}

/** @param {unknown} value */
function normalized(value) {
  return clean(value, 1000).normalize('NFKC').toLocaleLowerCase();
}

/** @param {any} value */
function inactiveName(value) {
  return clean(typeof value === 'string' ? value : value?.name || value?.ingredient, 140);
}

/** @param {any} supplement */
function contextQualityTests(supplement) {
  return (Array.isArray(supplement?.qualityTests) ? supplement.qualityTests : [])
    .filter(test => isSupplementQualityIncludedInAI(test, supplement));
}

/** @param {any} supplement */
function qualityScopeLabel(supplement) {
  return {
    'matching-lot': 'user confirmed the report matches their bottle lot',
    'different-lot': 'report is from a different lot',
    'general-specification': 'general specification; not a bottle-specific result',
    unknown: 'relationship to the user’s bottle lot not verified',
  }[supplementQualityEvidenceScope(supplement)];
}

/** @param {any} supplement */
function searchableTerms(supplement) {
  return [
    supplement?.name,
    supplement?.brand,
    supplement?.genericName,
    ...(Array.isArray(supplement?.ingredients) ? supplement.ingredients.flatMap(ingredient => [ingredient?.name]) : []),
    ...(Array.isArray(supplement?.inactiveIngredients) ? supplement.inactiveIngredients.map(inactiveName) : []),
    ...contextQualityTests(supplement).flatMap(test => [test?.analyte, test?.canonicalAnalyte]),
  ].map(normalized).filter(term => [...term].length >= 3);
}

/**
 * Detail selection is script-agnostic for stored facts: a question containing
 * any saved product, ingredient, excipient, or analyte name unlocks detail.
 * The keyword list is only a convenience for generic questions.
 * @param {unknown} queryText
 * @param {any[]} supplements
 * @returns {'compact'|'detail'}
 */
export function resolveSupplementContextMode(queryText, supplements) {
  const query = normalized(queryText);
  if (!query) return 'compact';
  if (DETAIL_QUERY_RE.test(query)) return 'detail';
  for (const supplement of Array.isArray(supplements) ? supplements : []) {
    if (searchableTerms(supplement).some(term => query.includes(term))) return 'detail';
  }
  return 'compact';
}

/** @param {any} ingredient @param {any} supplement */
function ingredientLabel(ingredient, supplement) {
  const name = clean(ingredient?.name, 120) || 'Unnamed active ingredient';
  const total = ingredientDailyTotal(ingredient, supplement);
  const times = effectiveTimesPerDay(ingredient, supplement);
  if (total) return `${name} ${clean(ingredient.amount, 50) || clean(`${ingredient.amountValue ?? ''} ${ingredient.amountUnit || ''}`, 50)} × ${times}/day = ${total.value}${total.unit ? ` ${clean(total.unit, 24)}` : ''}/day`;
  if (times) return `${name}${ingredient?.amount ? ` ${clean(ingredient.amount, 50)}` : ''} × ${times}/day`;
  return `${name}${ingredient?.amount ? ` ${clean(ingredient.amount, 50)}` : ''}`;
}

/** @param {string[]} values @param {number} limit */
function compactOtherIngredients(values, limit) {
  if (values.length <= limit) return values;
  const selected = [];
  const add = value => {
    if (value && !selected.includes(value) && selected.length < limit) selected.push(value);
  };
  values.filter(value => MATERIAL_HINT_RE.test(value)).forEach(add);
  values.slice(0, Math.ceil(limit / 2)).forEach(add);
  values.slice(-Math.ceil(limit / 2)).forEach(add);
  values.forEach(add);
  return selected;
}

/** @param {any} supplement */
function scheduleLabel(supplement) {
  const schedule = supplement?.schedule || {};
  const mode = clean(schedule.mode, 40);
  const times = Number(supplement?.timesPerDay ?? schedule.timesPerDay);
  if (mode === 'prn') return 'as needed (PRN; exposure not assumed)';
  if (Number.isFinite(times) && times > 0) return `${mode || 'daily'}, ${times}×/day`;
  return mode || '';
}

/** @param {any} supplement */
function periodLabel(supplement) {
  const periods = getSupplementPeriods(supplement).filter(period => clean(period?.start, 12));
  if (!periods.length) return getSupplementStatus(supplement);
  const rendered = periods.map(period => `${clean(period.start, 12)}→${clean(period.end, 12) || 'ongoing'}`);
  return `${getSupplementStatus(supplement)}; ${rendered.length > 1 ? `cycling ${rendered.join(', ')}` : rendered[0]}`;
}

/** @param {any[]} tests */
function nonContaminantSummary(tests) {
  const grouped = new Map();
  for (const test of tests) {
    const category = clean(test?.category, 40) || 'other';
    if (category === 'contaminant') continue;
    if (!grouped.has(category)) grouped.set(category, { count: 0, statuses: new Map() });
    const group = grouped.get(category);
    group.count += 1;
    const status = clean(test?.status, 40) || 'unknown';
    group.statuses.set(status, (group.statuses.get(status) || 0) + 1);
  }
  return Array.from(grouped.entries()).map(([category, group]) => {
    const statuses = Array.from(group.statuses.entries()).map(([status, count]) => `${count} ${status}`).join(', ');
    return `${category} ${group.count}${statuses ? ` (${statuses})` : ''}`;
  });
}

/** @param {ReturnType<typeof aggregateSupplementContaminants>[number]} group @param {'compact'|'detail'} mode */
function contaminantLine(group, mode) {
  const limit = mode === 'detail' ? 12 : 3;
  const shown = group.entries.slice(0, limit).map(entry => `${clean(entry.product, 90)}: ${formatSupplementQualityResult(entry.test)}`);
  if (group.entries.length > limit) shown.push(`+${group.entries.length - limit} more stored`);
  const daily = [];
  if (group.exactMcgPerDay > 0) daily.push(`${formatContaminantMass(group.exactMcgPerDay)} measured`);
  if (group.upperMcgPerDay > 0) daily.push(`up to ${formatContaminantMass(group.upperMcgPerDay)} from upper-bound results`);
  const conversion = daily.length
    ? `; scheduled daily mass from ${group.summableCount}/${group.reportedCount} compatible result(s): ${daily.join(' + ')}`
    : `; ${group.summableCount}/${group.reportedCount} result(s) convertible to scheduled daily mass`;
  return `- ${clean(group.analyte, 100)} — ${shown.join('; ')}${conversion}`;
}

/** @param {string} text @param {number} maxChars */
function fitContext(text, maxChars) {
  if (text.length <= maxChars) return text;
  const suffix = '\n[Supplement context truncated; full records remain stored and available in the Supplements & Medications screen.]\n';
  const target = Math.max(0, maxChars - suffix.length);
  const boundary = text.lastIndexOf('\n', target);
  return `${text.slice(0, boundary > target * 0.7 ? boundary : target).trimEnd()}${suffix}`.slice(0, maxChars);
}

/**
 * Render a context section body. All underlying records remain untouched; only
 * this prompt projection is bounded.
 * @param {any[]} supplements
 * @param {{ mode?: 'compact'|'detail', maxChars?: number, inventorySupplements?: any[] }} [options]
 */
export function buildSupplementAIContext(supplements, options = {}) {
  const mode = options.mode === 'detail' ? 'detail' : 'compact';
  const maxChars = Math.max(500, Number(options.maxChars) || SUPPLEMENT_CONTEXT_LIMITS[mode]);
  const source = Array.isArray(supplements) ? supplements : [];
  const productLimit = mode === 'detail' ? 24 : 12;
  const activeLimit = mode === 'detail' ? 20 : 8;
  const inactiveLimit = mode === 'detail' ? 20 : 5;
  const lines = [
    'Source-reported product and lot data below are not personal clinical laboratory results.',
    'Safety boundary: keep ND/NQ distinct from zero. Do not call an exposure high or unsafe unless its basis converts to personal daily intake and an applicable route- and jurisdiction-specific reference is available.',
  ];

  for (const supplement of source.slice(0, productLimit)) {
    const name = clean(supplement?.name, 120) || 'Unnamed product';
    const identity = [clean(supplement?.type, 30) || 'supplement', clean(supplement?.brand, 80), clean(supplement?.dosageForm, 50), clean(supplement?.route, 40)].filter(Boolean).join(', ');
    const regimen = [clean(supplement?.dosage, 160), scheduleLabel(supplement)].filter(Boolean).join('; ');
    lines.push(`- ${name} [${identity}; ${periodLabel(supplement)}]${regimen ? ` | personal regimen: ${regimen}` : ''}${supplement?.note || supplement?.notes ? ` | note: ${clean(supplement.note || supplement.notes, mode === 'detail' ? 320 : 140)}` : ''}`);

    const ingredients = Array.isArray(supplement?.ingredients) ? supplement.ingredients : [];
    if (ingredients.length) {
      const shown = ingredients.slice(0, activeLimit).map(ingredient => ingredientLabel(ingredient, supplement));
      lines.push(`  active ingredients: ${shown.join(', ')}${ingredients.length > activeLimit ? ` (+${ingredients.length - activeLimit} more stored)` : ''}`);
    }

    const inactive = (Array.isArray(supplement?.inactiveIngredients) ? supplement.inactiveIngredients : []).map(inactiveName).filter(Boolean);
    if (inactive.length) {
      const shown = compactOtherIngredients(inactive, inactiveLimit);
      lines.push(`  other label ingredients (excipients/fillers/coatings/capsule materials): ${shown.join(', ')}${inactive.length > shown.length ? ` (+${inactive.length - shown.length} more stored)` : ''}`);
    }

    const allTests = Array.isArray(supplement?.qualityTests) ? supplement.qualityTests : [];
    const tests = contextQualityTests(supplement);
    if (tests.length) {
      const contaminantCount = tests.filter(test => test?.category === 'contaminant').length;
      const otherSummary = nonContaminantSummary(tests);
      lines.push(`  source quality evidence included in AI context: ${tests.length} result(s); ${qualityScopeLabel(supplement)}${contaminantCount ? `; ${contaminantCount} contaminant` : ''}${otherSummary.length ? `; ${otherSummary.join('; ')}` : ''}${allTests.length > tests.length ? `; ${allTests.length - tests.length} informational/excluded result(s) retained outside AI context` : ''}`);
      const failures = tests.filter(test => clean(test?.status, 30).toLowerCase() === 'fail');
      if (failures.length) lines.push(`  explicit source failures: ${failures.slice(0, 8).map(test => `${clean(test.analyte, 100)}: ${formatSupplementQualityResult(test)}`).join('; ')}${failures.length > 8 ? ` (+${failures.length - 8} more stored)` : ''}`);
      if (mode === 'detail') {
        const shown = tests.slice(0, 24).map(test => `${clean(test.category, 40) || 'other'} — ${clean(test.analyte, 100)}: ${formatSupplementQualityResult(test)}${test?.limitText ? `; source limit ${clean(test.limitText, 100)}` : ''}${test?.method ? `; method ${clean(test.method, 100)}` : ''}`);
        lines.push(`  detailed source quality results: ${shown.join('; ')}${tests.length > shown.length ? ` (+${tests.length - shown.length} more stored)` : ''}`);
      }
    }
  }
  if (source.length > productLimit) lines.push(`- +${source.length - productLimit} more therapy records stored outside this prompt projection.`);

  const contextSupplements = source.map(supplement => ({ ...supplement, qualityTests: contextQualityTests(supplement) }));
  const contaminants = aggregateSupplementContaminants(contextSupplements);
  if (contaminants.length) {
    const limit = mode === 'detail' ? 30 : 12;
    lines.push('Source-reported contaminant overview:');
    contaminants.slice(0, limit).forEach(group => lines.push(contaminantLine(group, mode)));
    if (contaminants.length > limit) lines.push(`- +${contaminants.length - limit} more contaminant groups stored.`);
  }

  const inventory = Array.isArray(options.inventorySupplements) ? options.inventorySupplements : source;
  const detailedSet = new Set(source);
  const other = inventory.filter(item => !detailedSet.has(item));
  if (other.length) {
    const limit = mode === 'detail' ? 30 : 12;
    lines.push(`Other stored therapy records (summary only): ${other.slice(0, limit).map(item => `${clean(item?.name, 100) || 'Unnamed'} [${getSupplementStatus(item)}]`).join(', ')}${other.length > limit ? ` (+${other.length - limit} more stored)` : ''}`);
  }

  return fitContext(`${lines.join('\n')}\n`, maxChars);
}

/**
 * JSON-safe compact records for specialized AI tasks such as Biology Scores.
 * Methods and full COA inventories are deliberately excluded.
 * @param {any[]} supplements
 * @param {{ maxChars?: number }} [options]
 */
export function buildCompactSupplementContextRecords(supplements, options = {}) {
  const source = Array.isArray(supplements) ? supplements : [];
  const maxChars = Math.max(400, Number(options.maxChars) || SUPPLEMENT_CONTEXT_LIMITS.biology);
  const output = [];
  let included = 0;
  for (const supplement of source.slice(0, 40)) {
    const tests = contextQualityTests(supplement);
    const inactive = (Array.isArray(supplement?.inactiveIngredients) ? supplement.inactiveIngredients : []).map(inactiveName).filter(Boolean);
    const record = {
      name: clean(supplement?.name, 100),
      type: clean(supplement?.type, 30),
      genericName: clean(supplement?.genericName, 80),
      route: clean(supplement?.route, 30),
      regimen: clean([supplement?.dosage, scheduleLabel(supplement)].filter(Boolean).join('; '), 180),
      note: clean(supplement?.note || supplement?.notes, 240),
      activeIngredients: (Array.isArray(supplement?.ingredients) ? supplement.ingredients : []).slice(0, 6).map(ingredient => ingredientLabel(ingredient, supplement)),
      otherLabelIngredients: compactOtherIngredients(inactive, 4),
      qualitySummary: {
        total: tests.length,
        contaminants: tests.filter(test => test?.category === 'contaminant').slice(0, 4).map(test => `${clean(test.analyte, 80)}: ${formatSupplementQualityResult(test)}`),
        failures: tests.filter(test => clean(test?.status, 30).toLowerCase() === 'fail').slice(0, 4).map(test => clean(test?.analyte, 80)),
      },
    };
    const candidate = [...output, record];
    if (JSON.stringify(candidate).length > maxChars) break;
    output.push(record);
    included += 1;
  }
  const remaining = source.length - included;
  if (remaining > 0) {
    const marker = { moreTherapyRecordsStored: remaining };
    if (JSON.stringify([...output, marker]).length <= maxChars) output.push(marker);
  }
  return output;
}
