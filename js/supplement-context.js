// @ts-check
// supplement-context.js — Token-bounded supplement/medication context for AI features.

import { effectiveTimesPerDay, ingredientDailyTotal } from './supplement-impact.js';
import { getSupplementPeriods, getSupplementStatus, localDateKey, supplementDoseText } from './supplement-medication-domain.js';
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

const DETAIL_QUERY_RE = /(?:\binteraction|\bside effects?\b|\blabel\b|\bwarnings?\b|\bindication\b|why.+(?:taking|take)|(?:stop|paus).+(?:taking|take)|\bdos(?:e|es|age)\b|\bregimen\b|\bsupplements?\b|\bmedications?\b|\bmedicines?\b|\bdrugs?\b|\bvitamins?\b|\bpills?\b|capsul|softgel|tablet|excipient|filler|inactive ingredient|other ingredient|capsule material|capsule shell|coating|allergen|certificate of analysis|\bcoa\b|quality test|laboratory test|heavy metal|contaminant|cadmium|mercury|arsenic|\blead\b|doplněk|doplňky|l[eé]k|kapsl|pomocn[áeé]|plniv|obal kapsle|těžk[ée] kov|kontamin|laboratorn)/iu;
const PRESCRIBER_QUERY_RE = /(?:prescrib|prescription|clinician|doctor|předepis|předeps|lékař)/iu;
const SOURCE_QUERY_RE = /(?:\blinks?\b|\burls?\b|provenance|import|manufacturer|\bbrand\b|bought|purchase|\bbuy\b|zdroj|odkaz|výrobce|koupil)/iu;
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
  if (DETAIL_QUERY_RE.test(query) || PRESCRIBER_QUERY_RE.test(query)
      || requestsSupplementSources(query, supplements)) return 'detail';
  for (const supplement of Array.isArray(supplements) ? supplements : []) {
    if (searchableTerms(supplement).some(term => query.includes(term))) return 'detail';
  }
  return 'compact';
}

/** Match the object of a source question, not unrelated words elsewhere in it. */
function requestsSupplementSources(queryText, supplements = []) {
  const query = normalized(queryText);
  if (SOURCE_QUERY_RE.test(query)) return true;
  const subject = query.match(/\bsources?\s+(?:(?:of|for)\s+)?(?:(?:my|the|this|these|our|saved|original)\s+)*(.*)/u)?.[1] || '';
  return /^(?:therap(?:y|ies)|treatments?|supplements?|medications?|medicines?|products?|drugs?)\b/u.test(subject)
    || supplements.some(supplement => searchableTerms(supplement).some(term => subject.startsWith(term)));
}

/** @param {any} ingredient @param {any} supplement */
function ingredientLabel(ingredient, supplement) {
  const name = clean(ingredient?.name, 120) || 'Unnamed active ingredient';
  const amount = clean(ingredient?.amount, 50) || clean(`${ingredient?.amountValue ?? ''} ${ingredient?.amountUnit || ''}`, 50);
  if (getSupplementPeriods(supplement).some(period => period.dose || period.ingredientDoses?.length) || getSupplementStatus(supplement) !== 'active'
      || !['daily', 'multiple'].includes(supplement?.schedule?.mode || 'daily')) {
    return `${name}${amount ? ` ${amount} per label serving` : ''}`;
  }
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
  const times = Number(schedule.timesPerDay ?? supplement?.timesPerDay);
  if (mode === 'prn') return `as needed (PRN; exposure not assumed)${schedule.maxPerDay != null ? `; maximum ${clean(schedule.maxPerDay, 20)}/day` : ''}${schedule.details ? `; ${clean(schedule.details, 100)}` : ''}`;
  const weekdays = (schedule.daysOfWeek || []).map(day => typeof day === 'number' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day] || day : day);
  const details = clean([weekdays.length ? `weekdays ${weekdays.join(', ')}` : '', schedule.intervalDays ? `every ${schedule.intervalDays} days` : '', schedule.details].filter(Boolean).join('; '), 200);
  return [Number.isFinite(times) && times > 0 ? `${mode || 'daily'}, ${times}×/day` : mode, details].filter(Boolean).join('; ');
}

/** Dated doses take precedence over current product strength and undated directions. */
function periodDose(period) {
  const text = dose => `${supplementDoseText(dose)}${dose?.basis === 'dose' && !dose?.text ? '/dose' : ''}`;
  if (period?.dose) return `${period.dose.ingredient ? `${clean(period.dose.ingredient, 80)}: ` : ''}${clean(text(period.dose), 180)}`;
  if (period?.ingredientDoses?.length) return period.ingredientDoses.slice(0, 12)
    .map(dose => `${clean(dose.ingredient, 80)}: ${clean(text(dose), 100)}`).join(', ')
    + (period.ingredientDoses.length > 12 ? ` (+${period.ingredientDoses.length - 12} more stored)` : '');
  return 'dose not recorded';
}

/** @param {any} supplement @param {number} limit @param {{ detail?: boolean, historyRange?: { start: string, end: string } | null }} [options] */
function datedDoseContext(supplement, limit, { detail = false, historyRange = null } = {}) {
  const today = localDateKey();
  const status = getSupplementStatus(supplement);
  const periods = getSupplementPeriods(supplement).filter(period => clean(period?.start, 12));
  const current = status === 'active' ? periods.find(period => period.start <= today && (!period.end || period.end >= today)) : null;
  const currentDose = current
    ? `${periodDose(current)} (${clean(current.start, 12)}→${clean(current.end, 12) || 'ongoing'})`
    : `none (${status})`;
  const next = periods.filter(period => period.start > today).sort((a, b) => String(a.start).localeCompare(String(b.start)))[0];
  const relevant = detail ? periods : periods.filter(period => period === current || period === next
    || (historyRange && period.start <= historyRange.end && (!period.end || period.end >= historyRange.start)));
  const shown = [...relevant].sort((a, b) => String(b.start).localeCompare(String(a.start))).slice(0, limit);
  const history = shown.map(period => {
    const phase = period.start > today ? 'planned' : period === current ? 'current' : 'past';
    const schedule = period.schedule ? scheduleLabel({ schedule: period.schedule }) : '';
    return `${clean(period.start, 12)}→${clean(period.end, 12) || 'ongoing'} [${phase}]: ${periodDose(period)}${schedule ? `; schedule: ${schedule}` : ''}${detail && period.endReason ? `; ended: ${clean(period.endReason, 140)}` : ''}`;
  });
  return { status, asOf: today, currentDose, doseHistory: history, omittedPeriods: Math.max(0, periods.length - shown.length) };
}

function productMetadata(supplement, { detail = false, queryText = '' } = {}) {
  const provenance = supplement?.importProvenance || {};
  const urls = [supplement?.sourceUrl, provenance.url, ...(Array.isArray(provenance.evidence) ? provenance.evidence.map(item => item?.url) : [])];
  const sourceLinks = [...new Set(urls.flatMap(value => {
    try { const url = new URL(String(value)); return ['http:', 'https:'].includes(url.protocol) && url.href.length <= 1000 ? [url.toString()] : []; }
    catch { return []; }
  }))];
  const fields = {
    genericName: clean(supplement?.genericName, 100),
    dosageForm: clean(supplement?.dosageForm, 50),
    undatedDoseSnapshot: !getSupplementPeriods(supplement).some(period => period.dose || period.ingredientDoses?.length) && supplement?.currentDose
      ? clean(periodDose({ dose: supplement.currentDose }), 180) : '',
    labelServing: clean([supplement?.servingSize?.value, supplement?.servingSize?.unit].filter(value => value != null && value !== '').join(' '), 80),
    ...(detail ? {
      brand: clean(supplement?.brand, 80), reason: clean(supplement?.reason, 200),
      stopOrPauseReason: clean(supplement?.lifecycle?.reason, 180),
      labelDirections: clean(supplement?.labelDirections, 300),
      labelWarnings: (Array.isArray(supplement?.labelWarnings) ? supplement.labelWarnings : []).slice(0, 8).map(value => clean(value, 200)),
    } : {}),
    ...(detail && PRESCRIBER_QUERY_RE.test(queryText) ? { prescriber: clean(supplement?.prescriber, 100) } : {}),
    ...(detail && requestsSupplementSources(queryText, [supplement]) ? { sourceLinks: sourceLinks.slice(0, 3), importSource: clean(provenance.kind, 80) } : {}),
  };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => Array.isArray(value) ? value.length : value));
}

/** Put a specifically requested product before limits are applied. */
function prioritizeProducts(supplements, queryText = '') {
  const query = normalized(queryText);
  return [...supplements].sort((a, b) => {
    const rank = item => query && searchableTerms(item).some(term => query.includes(term)) ? 0 : getSupplementStatus(item) === 'active' ? 1 : 2;
    return rank(a) - rank(b);
  });
}

function contaminantContextProducts(supplements) {
  return supplements.map(supplement => {
    const today = localDateKey();
    const current = getSupplementPeriods(supplement).find(period => period.start <= today && (!period.end || period.end >= today));
    const schedule = current?.schedule || supplement.schedule || {};
    const daily = getSupplementStatus(supplement) === 'active' && ['daily', 'multiple'].includes(schedule.mode || 'daily')
      && (!current?.dose || (/** @type {import('../types/supplement-data.js').SupplementDose} */ (/** @type {unknown} */ (current.dose))).source === 'ingredient');
    return { ...supplement, qualityTests: contextQualityTests(supplement),
      timesPerDay: daily ? schedule.timesPerDay ?? supplement.timesPerDay : null,
      schedule: { ...schedule, timesPerDay: daily ? schedule.timesPerDay ?? supplement.timesPerDay : null } };
  });
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
 * @param {{ mode?: 'compact'|'detail', maxChars?: number, inventorySupplements?: any[], queryText?: string, historyRange?: { start: string, end: string } }} [options]
 */
export function buildSupplementAIContext(supplements, options = {}) {
  const mode = options.mode === 'detail' ? 'detail' : 'compact';
  const maxChars = Math.max(500, Number(options.maxChars) || SUPPLEMENT_CONTEXT_LIMITS[mode]);
  const source = prioritizeProducts(Array.isArray(supplements) ? supplements : [], options.queryText);
  const productLimit = mode === 'detail' ? 24 : 12;
  const activeLimit = mode === 'detail' ? 20 : 8;
  const detail = mode === 'detail';
  const lines = detail ? [
    'Source-reported product and lot data below are not personal clinical laboratory results.',
    'Dated dose history overrides product-label amounts and undated directions. Do not project current ingredient totals onto earlier periods; missing doses remain unknown. Current saved records supersede older chat descriptions.',
    'This is a bounded summary: long text and large inventories may be shortened. Source links identify provenance, not verified contents. PRN limits and label directions do not establish actual intake.',
    'Safety boundary: keep ND/NQ distinct from zero. Do not call an exposure high or unsafe unless its basis converts to personal daily intake and an applicable route- and jurisdiction-specific reference is available.',
  ] : ['Dated doses override label amounts and undated directions. Missing historical doses remain unknown. Saved records supersede older chat descriptions. PRN limits are not actual intake. Extra product details are available on relevant questions.'];

  for (const supplement of source.slice(0, productLimit)) {
    const name = clean(supplement?.name, 120) || 'Unnamed product';
    const identity = [clean(supplement?.type, 30) || 'supplement', detail ? clean(supplement?.brand, 80) : '', clean(supplement?.dosageForm, 50), clean(supplement?.route, 40)].filter(Boolean).join(', ');
    const regimen = [clean(supplement?.dosage, 160), scheduleLabel(supplement)].filter(Boolean).join('; ');
    const dated = datedDoseContext(supplement, detail ? 24 : 6, { detail, historyRange: options.historyRange });
    lines.push(`- ${name} [${identity}; ${dated.status}] | current recorded dose as of ${dated.asOf}: ${dated.currentDose}`);
    if (dated.doseHistory.length) lines.push(`  dated dose history (newest first): ${dated.doseHistory.join(' | ')}${dated.omittedPeriods ? ` (+${dated.omittedPeriods} other periods stored)` : ''}`);
    const metadata = productMetadata(supplement, { detail, queryText: options.queryText });
    if (Object.keys(metadata).length) lines.push(`  product facts: ${JSON.stringify(metadata)}`);
    if (regimen) lines.push(`  undated directions/current schedule (not historical dose): ${regimen}`);
    if (detail && (supplement?.note || supplement?.notes)) lines.push(`  note: ${clean(supplement.note || supplement.notes, mode === 'detail' ? 320 : 140)}`);

    const ingredients = Array.isArray(supplement?.ingredients) ? supplement.ingredients : [];
    if (ingredients.length) {
      const shown = ingredients.slice(0, activeLimit).map(ingredient => ingredientLabel(ingredient, supplement));
      lines.push(`  product-label active ingredients (calculated totals are not confirmed historical doses): ${shown.join(', ')}${ingredients.length > activeLimit ? ` (+${ingredients.length - activeLimit} more stored)` : ''}`);
    }

    const inactive = (Array.isArray(supplement?.inactiveIngredients) ? supplement.inactiveIngredients : []).map(inactiveName).filter(Boolean);
    if (detail && inactive.length) {
      const shown = compactOtherIngredients(inactive, 20);
      lines.push(`  other label ingredients (excipients/fillers/coatings/capsule materials): ${shown.join(', ')}${inactive.length > shown.length ? ` (+${inactive.length - shown.length} more stored)` : ''}`);
    }

    const allTests = Array.isArray(supplement?.qualityTests) ? supplement.qualityTests : [];
    const tests = detail ? contextQualityTests(supplement) : [];
    if (tests.length) {
      const contaminantCount = tests.filter(test => test?.category === 'contaminant').length;
      const otherSummary = nonContaminantSummary(tests);
      lines.push(`  source quality evidence included in AI context: ${tests.length} result(s); ${qualityScopeLabel(supplement)}${contaminantCount ? `; ${contaminantCount} contaminant` : ''}${otherSummary.length ? `; ${otherSummary.join('; ')}` : ''}${allTests.length > tests.length ? `; ${allTests.length - tests.length} informational/excluded result(s) retained outside AI context` : ''}`);
      const failures = tests.filter(test => clean(test?.status, 30).toLowerCase() === 'fail');
      if (failures.length) lines.push(`  explicit source failures: ${failures.slice(0, 8).map(test => `${clean(test.analyte, 100)}: ${formatSupplementQualityResult(test)}`).join('; ')}${failures.length > 8 ? ` (+${failures.length - 8} more stored)` : ''}`);
      if (mode === 'detail') {
        const shown = tests.slice(0, 24).map(test => `${clean(test.category, 40) || 'other'} — ${clean(test.analyte, 100)}: ${formatSupplementQualityResult(test)}${test?.limitText ? `; source limit ${clean(test.limitText, 100)}` : ''}${test?.method ? `; method ${clean(test.method, 100)}` : ''}${test?.declaredText ? `; label claim ${clean(test.declaredText, 100)}` : ''}`);
        lines.push(`  detailed source quality results: ${shown.join('; ')}${tests.length > shown.length ? ` (+${tests.length - shown.length} more stored)` : ''}`);
      }
    }
  }
  if (source.length > productLimit) lines.push(`- +${source.length - productLimit} more therapy records stored outside this prompt projection.`);

  const contextSupplements = detail ? contaminantContextProducts(source) : [];
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
 * Descriptive metadata and quality inventories are reserved for relevant chat questions.
 * @param {any[]} supplements
 * @param {{ maxChars?: number, historyRange?: { start: string, end: string } }} [options]
 */
export function buildCompactSupplementContextRecords(supplements, options = {}) {
  const source = prioritizeProducts(Array.isArray(supplements) ? supplements : []);
  const maxChars = Math.max(400, Number(options.maxChars) || SUPPLEMENT_CONTEXT_LIMITS.biology);
  const output = [];
  let included = 0;
  for (const supplement of source.slice(0, 40)) {
    const record = {
      name: clean(supplement?.name, 100),
      ...datedDoseContext(supplement, 6, { historyRange: options.historyRange }),
      ...productMetadata(supplement),
      type: clean(supplement?.type, 30),
      genericName: clean(supplement?.genericName, 80),
      route: clean(supplement?.route, 30),
      regimen: clean([supplement?.dosage, scheduleLabel(supplement)].filter(Boolean).join('; '), 180),
      activeIngredients: (Array.isArray(supplement?.ingredients) ? supplement.ingredients : []).slice(0, 6).map(ingredient => ingredientLabel(ingredient, supplement)),
      omittedActiveIngredients: Math.max(0, (supplement?.ingredients?.length || 0) - 6),
    };
    const remainingAfter = source.length - included - 1;
    const marker = remainingAfter > 0 ? [{ moreTherapyRecordsStored: remainingAfter }] : [];
    if (JSON.stringify([...output, record, ...marker]).length > maxChars) {
      // A single large record must not hide even its identity and current dose.
      const brief = { name: record.name, type: record.type, status: record.status, asOf: record.asOf,
        currentDose: record.currentDose, furtherDetailsStored: true };
      if (JSON.stringify([...output, brief, ...marker]).length > maxChars) break;
      output.push(brief);
      included += 1;
      continue;
    }
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
