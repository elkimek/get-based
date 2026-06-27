// @ts-check
// agent-tools.js — schema-shaped app tools for the browser-local getbased agent

import { state } from './state.js';
import { saveImportedData } from './data.js';
import { appendImportedArrayItem, replaceImportedArrayItem } from './data-merge.js';
import { computeBiologyScores } from './biology-scores.js';
import {
  ABDOMINAL_PAIN,
  ACID_REFLUX,
  APPETITE,
  BLOATING_SEVERITY,
  BOWEL_FREQUENCY,
  BURPING,
  FOOD_SENSITIVITIES,
  GAS_SEVERITY,
  NAUSEA,
  STOOL_CONSISTENCY,
} from './constants.js';
import {
  CONTEXT_CARD_SCHEMAS,
  getAgentContextExtractionPrompt,
  normalizeContextPatch,
  normalizeContextString,
} from './agent-context-schema.js';

export { getAgentContextExtractionPrompt };

/** @type {Record<string, string>} */
const MARKER_LABELS = {
  'lipids.ldl': 'LDL',
  'lipids.hdl': 'HDL',
  'lipids.triglycerides': 'Triglycerides',
  'inflammation.crp': 'CRP',
  'inflammation.hscrp': 'hs-CRP',
  'thyroid.tsh': 'TSH',
  'iron.ferritin': 'Ferritin',
  'glucose.glucose': 'Glucose',
  'diabetes.glucose': 'Glucose',
  'diabetes.insulin': 'Insulin',
  'diabetes.homaIR': 'HOMA-IR',
};

/** @param {{ importedData?: any }} [opts] */
function importedFrom(opts = {}) {
  return opts.importedData || state.importedData || {};
}

/** @param {any} importedData */
function entriesFrom(importedData) {
  return Array.isArray(importedData?.entries) ? importedData.entries.slice() : [];
}

/** @param {Array<any>} entries */
function sortEntriesByDate(entries) {
  return entries
    .filter(e => e && typeof e.date === 'string' && e.markers && typeof e.markers === 'object')
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** @param {string} key */
export function markerLabel(key) {
  if (MARKER_LABELS[key]) return MARKER_LABELS[key];
  const tail = String(key || '').split('.').pop() || String(key || '');
  return tail
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/** @param {any} value */
function numericValue(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** @param {number} previous @param {number} latest */
function percentChange(previous, latest) {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((latest - previous) / Math.abs(previous)) * 100;
}

/** @param {string} value */
function titleCaseName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** @param {string} value */
function normalizeNameKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** @param {string} today @param {string} phrase */
function resolveDatePhrase(today, phrase) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(today || '') ? new Date(`${today}T00:00:00Z`) : new Date();
  const text = String(phrase || '').toLowerCase();
  let days = 0;
  if (/last\s+week|a\s+week\s+ago/.test(text)) days = 7;
  else if (/yesterday/.test(text)) days = 1;
  else if (/last\s+month|a\s+month\s+ago/.test(text)) days = 30;
  base.setUTCDate(base.getUTCDate() - days);
  return base.toISOString().slice(0, 10);
}

/** @param {string} raw */
function parseStartedSupplement(raw) {
  const trimmed = String(raw || '').trim().replace(/[.,;]+$/, '');
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const nameWords = [];
  let dosage = '';
  let schedule = '';
  for (const word of words) {
    if (/^\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|µg|μg|iu|ml|caps?|tablets?|tabs?)$/i.test(word)) {
      dosage = word.replace(',', '.');
      continue;
    }
    if (/^(daily|nightly|weekly|monthly|morning|evening|am|pm)$/i.test(word)) {
      schedule = word.toLowerCase();
      continue;
    }
    if (/^(and|plus|with)$/i.test(word)) continue;
    if (!dosage && !schedule) nameWords.push(word);
  }
  const name = titleCaseName(nameWords.join(' '));
  return name ? { name, dosage, schedule } : null;
}

/** @param {string} raw */
function parseStoppedSupplement(raw) {
  const cleaned = String(raw || '').trim().replace(/[.,;]+$/, '').replace(/\b(last|this|week|month|today|yesterday)\b.*$/i, '').trim();
  return cleaned ? { name: titleCaseName(cleaned) } : null;
}

/** @param {any} proposal */
function summarizeSupplementProposal(proposal) {
  const bits = [];
  for (const change of proposal?.changes || []) {
    if (change.action === 'add_or_update') bits.push(`add ${change.name}`);
    if (change.action === 'end') bits.push(`stop ${change.name}`);
  }
  return bits.length ? bits.join('; ') : 'No supplement changes';
}

/** @param {any} proposal */
function summarizeContextProposal(proposal) {
  const labels = [];
  for (const change of proposal?.changes || []) {
    if (change.field === 'sleepRest') labels.push('Sleep & Rest');
    else if (change.field === 'exercise') labels.push('Exercise & Movement');
    else if (change.field === 'lightCircadian') labels.push('Light & Circadian');
    else if (change.field === 'diet') labels.push('Diet & Digestion');
    else if (change.field === 'healthGoals') labels.push(`Health goal: ${change.item?.text || ''}`);
  }
  return labels.length ? labels.join('; ') : 'No context changes';
}

/** @param {{ importedData?: any }} [opts] */
export function getAgentProfileSnapshot(opts = {}) {
  const importedData = importedFrom(opts);
  const entries = entriesFrom(importedData);
  return {
    labEntryCount: entries.length,
    latestLabDate: sortEntriesByDate(entries).at(-1)?.date || null,
    supplementCount: Array.isArray(importedData.supplements) ? importedData.supplements.length : 0,
    healthGoalCount: Array.isArray(importedData.healthGoals) ? importedData.healthGoals.length : 0,
    hasBiologyScoreContextReview: !!importedData.biologyScoreContextAI?.updatedAt,
    hasWearableSummary: !!importedData.wearableSummary,
    hasGenetics: !!(importedData.genetics && Object.keys(importedData.genetics.snps || {}).length),
  };
}

/** @param {{ importedData?: any }} [opts] */
export function compareLatestLabEntries(opts = {}) {
  const importedData = importedFrom(opts);
  const entries = sortEntriesByDate(entriesFrom(importedData));
  const latest = entries.at(-1) || null;
  const previous = entries.length > 1 ? entries.at(-2) : null;
  if (!latest || !previous) {
    return {
      latestDate: latest?.date || null,
      previousDate: previous?.date || null,
      changedMarkers: [],
      addedMarkers: latest ? Object.entries(latest.markers || {}).map(([key, value]) => ({ key, label: markerLabel(key), value })) : [],
      removedMarkers: [],
      hasEnoughData: false,
    };
  }
  const latestMarkers = latest.markers || {};
  const previousMarkers = previous.markers || {};
  const changedMarkers = [];
  const addedMarkers = [];
  const removedMarkers = [];
  for (const [key, latestRaw] of Object.entries(latestMarkers)) {
    if (!(key in previousMarkers)) {
      addedMarkers.push({ key, label: markerLabel(key), value: latestRaw });
      continue;
    }
    const latestValue = numericValue(latestRaw);
    const previousValue = numericValue(previousMarkers[key]);
    if (latestValue == null || previousValue == null || latestValue === previousValue) continue;
    const pct = percentChange(previousValue, latestValue);
    changedMarkers.push({
      key,
      label: markerLabel(key),
      previousValue,
      latestValue,
      delta: latestValue - previousValue,
      percentChange: pct,
      direction: latestValue > previousValue ? 'up' : 'down',
    });
  }
  for (const [key, value] of Object.entries(previousMarkers)) {
    if (!(key in latestMarkers)) removedMarkers.push({ key, label: markerLabel(key), value });
  }
  changedMarkers.sort((a, b) => Math.abs(b.percentChange ?? b.delta) - Math.abs(a.percentChange ?? a.delta));
  addedMarkers.sort((a, b) => a.label.localeCompare(b.label));
  removedMarkers.sort((a, b) => a.label.localeCompare(b.label));
  return {
    latestDate: latest.date,
    previousDate: previous.date,
    changedMarkers,
    addedMarkers,
    removedMarkers,
    hasEnoughData: true,
  };
}

/** @param {string} text @param {{ importedData?: any, today?: string }} [opts] */
export function draftSupplementChangeProposal(text, opts = {}) {
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const sourceText = String(text || '');
  const changes = [];
  const startedRe = /\b(?:started|added|began|begin|taking)\s+([a-z0-9µμ .,+_-]+?)(?=\s+and\s+(?:stopped|quit|removed|discontinued|started|added|began|taking)\b|[.;]|$)/ig;
  const stoppedRe = /\b(?:stopped|quit|removed|discontinued)\s+([a-z0-9µμ .,+_-]+?)(?=\s+and\s+(?:stopped|quit|removed|discontinued|started|added|began|taking)\b|[.;]|$)/ig;
  let match;
  while ((match = startedRe.exec(sourceText))) {
    const parsed = parseStartedSupplement(match[1]);
    if (!parsed) continue;
    changes.push({
      action: 'add_or_update',
      surface: 'supplements',
      name: parsed.name,
      dosage: parsed.dosage,
      schedule: parsed.schedule,
      startDate: resolveDatePhrase(today, sourceText),
    });
  }
  while ((match = stoppedRe.exec(sourceText))) {
    const parsed = parseStoppedSupplement(match[1]);
    if (!parsed) continue;
    changes.push({
      action: 'end',
      surface: 'supplements',
      name: parsed.name,
      endDate: resolveDatePhrase(today, sourceText),
    });
  }
  if (!changes.length) return null;
  return {
    id: `agent_proposal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    surface: 'supplements',
    mode: 'record-context-change',
    requiresConfirmation: true,
    status: 'pending',
    sourceText,
    changes,
    summary: summarizeSupplementProposal({ changes }),
  };
}

function optionOrNull(options, value) {
  return options.includes(value) ? value : null;
}

function digestiveSeverity(text, noneOptions) {
  const s = String(text || '').toLowerCase();
  if (/\b(severe|terrible|awful|very bad|really bad|daily|constant)\b/.test(s)) return optionOrNull(noneOptions, 'severe') || optionOrNull(noneOptions, 'daily') || optionOrNull(noneOptions, 'frequent');
  if (/\b(mild|slight|little|occasional)\b/.test(s)) return optionOrNull(noneOptions, 'mild') || optionOrNull(noneOptions, 'occasional');
  return optionOrNull(noneOptions, 'moderate') || optionOrNull(noneOptions, 'frequent') || optionOrNull(noneOptions, 'occasional');
}

function appendContextNote(existing, addition) {
  const current = String(existing || '').trim();
  const next = String(addition || '').trim();
  if (!next) return current;
  if (!current) return next;
  if (current.toLowerCase().includes(next.toLowerCase())) return current;
  return `${current}\n${next}`;
}

function looksLikeConstipation(text) {
  return /\bconstipat\w*\b/i.test(text) || /\bz[áa]cp(?:a|u|ou|ě|e)\b/i.test(text);
}

function stripMachineNotePrefix(value) {
  return String(value || '').trim().replace(/^User reported (?:context|digestive context):\s*/i, '');
}

function normalizeStructuredDietPatch(patch, sourceText) {
  const haystack = `${sourceText || ''}\n${patch?.note || ''}`;
  if (looksLikeConstipation(haystack)) {
    if (!patch.stoolConsistency) patch.stoolConsistency = 'hard/pellets';
    if (!patch.bowelFrequency) patch.bowelFrequency = 'irregular';
  }
  return patch;
}

export function buildContextChangeProposalFromStructured(input, opts = {}) {
  const sourceText = String(opts.sourceText || input?.sourceText || '').trim();
  const changes = [];
  const rawChanges = Array.isArray(input?.changes) ? input.changes : [];
  for (const raw of rawChanges) {
    const field = String(raw?.field || '').trim();
    if (field === 'healthGoals') {
      const text = normalizeContextString(raw?.item?.text || raw?.text);
      if (text) changes.push({ field: 'healthGoals', label: 'Health goals', action: 'add', item: { text, severity: 'major' } });
      continue;
    }
    let patch = normalizeContextPatch(field, raw?.patch);
    const schema = CONTEXT_CARD_SCHEMAS[field];
    if (!patch || !schema) continue;
    if (!patch.note && sourceText) patch.note = sourceText;
    if (patch.note) patch.note = stripMachineNotePrefix(patch.note);
    if (field === 'diet') patch = normalizeStructuredDietPatch(patch, sourceText);
    changes.push({ field, label: schema.label, patch });
  }
  if (!changes.length) return null;
  const proposal = {
    id: `agent_proposal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    surface: 'context',
    mode: 'record-context-change',
    requiresConfirmation: true,
    status: 'pending',
    sourceText,
    changes,
    extractedBy: opts.extractedBy || 'ai-structured',
  };
  proposal.summary = summarizeContextProposal(proposal);
  return proposal;
}

/** @param {string} text */
function buildDietDigestionPatch(text) {
  const sourceText = String(text || '');
  const s = sourceText.toLowerCase();
  const patch = {};
  if (/\b(watery|water[y ]stools?|diarrh(?:ea|eia)|runs)\b/.test(s)) patch.stoolConsistency = optionOrNull(STOOL_CONSISTENCY, 'watery');
  else if (/\b(loose stools?|looser stools?|soft stools?|stools?\s+(?:are\s+)?loose|stools?\s+(?:are\s+)?soft)\b/.test(s)) patch.stoolConsistency = optionOrNull(STOOL_CONSISTENCY, 'loose') || optionOrNull(STOOL_CONSISTENCY, 'soft');
  else if (/\b(constipat(?:ed|ion)|hard stools?|pellets?)\b/.test(s)) {
    patch.stoolConsistency = optionOrNull(STOOL_CONSISTENCY, 'hard/pellets') || optionOrNull(STOOL_CONSISTENCY, 'firm');
    patch.bowelFrequency = optionOrNull(BOWEL_FREQUENCY, 'every other day') || optionOrNull(BOWEL_FREQUENCY, 'irregular');
  }
  if (/\b(3\+\/day|three\s+times\s+a\s+day|multiple\s+times\s+a\s+day|frequent\s+(?:bowel|stool)|diarrh(?:ea|eia))\b/.test(s)) patch.bowelFrequency = optionOrNull(BOWEL_FREQUENCY, '3+/day');
  else if (/\b(irregular\s+(?:bowel|stool)|bowels?\s+(?:are\s+)?irregular)\b/.test(s)) patch.bowelFrequency = optionOrNull(BOWEL_FREQUENCY, 'irregular');
  if (/\b(bloat(?:ed|ing)?|distended)\b/.test(s)) patch.bloating = digestiveSeverity(sourceText, BLOATING_SEVERITY);
  if (/\b(gas|gassy|flatulence|wind)\b/.test(s)) patch.gas = /\b(excessive|a lot|lots of|terrible)\b/.test(s) ? optionOrNull(GAS_SEVERITY, 'excessive') : digestiveSeverity(sourceText, GAS_SEVERITY);
  if (/\b(reflux|heartburn|gerd|acid)\b/.test(s)) {
    if (/\b(reflux|heartburn|gerd|acid)[^.?!,;]*(daily|constant)\b|\b(daily|constant)[^.?!,;]*(reflux|heartburn|gerd|acid)\b/.test(s)) patch.acidReflux = optionOrNull(ACID_REFLUX, 'daily');
    else if (/\b(reflux|heartburn|gerd|acid)[^.?!,;]*(frequent|often)\b|\b(frequent|often)[^.?!,;]*(reflux|heartburn|gerd|acid)\b/.test(s)) patch.acidReflux = optionOrNull(ACID_REFLUX, 'frequent');
    else patch.acidReflux = digestiveSeverity(sourceText, ACID_REFLUX);
  }
  if (/\b(burp(?:ing)?|belch(?:ing)?|after meals)\b/.test(s)) patch.burping = /\bafter meals\b/.test(s) ? optionOrNull(BURPING, 'after meals') : digestiveSeverity(sourceText, BURPING);
  if (/\b(nausea|nauseous|sick to my stomach)\b/.test(s)) patch.nausea = digestiveSeverity(sourceText, NAUSEA);
  if (/\b(low appetite|appetite.*(?:low|down)|not hungry)\b/.test(s)) patch.appetite = optionOrNull(APPETITE, 'low');
  else if (/\b(excessive appetite|very hungry|hungry all the time)\b/.test(s)) patch.appetite = optionOrNull(APPETITE, 'excessive');
  else if (/\b(variable appetite|appetite.*(?:variable|changes|unstable))\b/.test(s)) patch.appetite = optionOrNull(APPETITE, 'variable');
  if (/\b(abdominal pain|stomach pain|belly pain|gut pain|cramps?)\b/.test(s)) patch.abdominalPain = digestiveSeverity(sourceText, ABDOMINAL_PAIN);
  const sensitivities = FOOD_SENSITIVITIES.filter(item => new RegExp(`\\b${item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(sourceText));
  if (sensitivities.length) patch.foodSensitivities = sensitivities;
  if (/\b(digestion|digestive|gut|bowel|stool|bloat|gas|reflux|heartburn|nausea|appetite|abdominal|stomach|belly|constipat\w*|diarrh\w*)\b/i.test(sourceText)) {
    patch.note = `User reported digestive context: ${sourceText.trim()}`;
  }
  return Object.keys(patch).length ? patch : null;
}

/** @type {Array<any>} */
const CONTEXT_SIGNAL_RULES = [
  {
    field: 'sleepRest',
    label: 'Sleep & Rest',
    match: /\b(sleeping badly|bad sleep|poor sleep|insomnia|not sleeping|sleep is bad|sleep\s+(?:has\s+been\s+)?terrible|terrible sleep)\b/i,
    patch: { quality: 'poor', note: 'User reported poor sleep lately.' },
  },
  {
    field: 'exercise',
    label: 'Exercise & Movement',
    match: /\b(restarted training|started training|back to training|training again|hard training|exercise again|exercising again|working out again)\b/i,
    patch: { note: 'User reported restarting training.' },
  },
  {
    field: 'lightCircadian',
    label: 'Light & Circadian',
    match: /\b(low sunlight|little sun|no sun|low uv|low-sunlight|not getting sun|barely seeing (?:the )?sun|barely any sun)\b/i,
    patch: { note: 'User reported low sunlight exposure right now.' },
  },
  {
    field: 'diet',
    label: 'Diet & Digestion',
    match: /\b(digestion|digestive|gut|bowel|stool|bloat|gas|gassy|reflux|heartburn|nausea|appetite|abdominal|stomach|belly|constipat\w*|diarrh\w*)\b/i,
    buildPatch: buildDietDigestionPatch,
  },
];

function extractGoalText(text) {
  const match = String(text || '').match(/\b(?:add goal|goal|my goal is|my goal|i want to)\s*(?:is|:)?\s*([^.;]+?)(?=\s+and\s+(?:i\s+have|i\s+am|i'm|started|stopped|restarted)\b|[.;]|$)/i);
  return match?.[1] ? titleCaseName(match[1]) : '';
}

/** @param {string} text */
export function detectAgentContextSignals(text) {
  const sourceText = String(text || '');
  const entities = [];
  const educational = /\b(tell me|explain|story|metaphor|evolution|mechanism|research|what do you think|how does|why does)\b/i.test(sourceText);
  const explicitlyPersonal = /\b(my|i am|i'm|im|i have|i’m having|i feel|i started|i stopped)\b|\bm[áa]m\b|\bjsem\b|\bmoje\b/i.test(sourceText);
  if (educational && !explicitlyPersonal) return entities;
  for (const rule of CONTEXT_SIGNAL_RULES) {
    if (rule.match.test(sourceText)) entities.push({ type: 'context', field: rule.field, action: 'update', label: rule.label });
  }
  const goalText = extractGoalText(sourceText);
  if (goalText) entities.push({ type: 'healthGoal', action: 'add', label: goalText });
  return entities;
}

const LAB_PLAN_TOPIC_RULES = [
  {
    id: 'insulin-resistance',
    label: 'Insulin resistance / glucose control',
    match: /\b(insulin resistance|insulin resistant|fasting insulin|insulin|glucose|blood sugar|homa|hba1c|metabolic)\b/i,
    rationale: 'Checks fasting glucose handling and whether insulin is compensating before glucose looks abnormal.',
    markers: ['Fasting glucose', 'Fasting insulin', 'HbA1c', 'C-peptide', 'Triglycerides', 'HDL', 'HOMA-IR'],
  },
  {
    id: 'androgen-axis',
    label: 'Low testosterone / androgen axis',
    match: /\b(low testosterone|testosterone|low t\b|androgen|libido|shbg)\b/i,
    rationale: 'Separates production, binding, pituitary signaling, conversion, and common suppressors.',
    markers: ['Total testosterone', 'Free testosterone', 'SHBG', 'Albumin', 'LH', 'FSH', 'Prolactin', 'Estradiol', 'DHEA-S'],
  },
  {
    id: 'inflammation',
    label: 'Inflammation / immune load',
    match: /\b(inflammation|inflammatory|crp|hs-crp|immune|recovery)\b/i,
    rationale: 'Quantifies systemic inflammation and immune pattern instead of guessing from symptoms.',
    markers: ['hs-CRP', 'CBC with differential', 'Ferritin', 'Fibrinogen', 'ESR'],
  },
  {
    id: 'thyroid',
    label: 'Thyroid coherence',
    match: /\b(thyroid|tsh|free t3|free t4|reverse t3)\b/i,
    rationale: 'Checks pituitary signal, circulating thyroid hormones, conversion, and autoimmunity.',
    markers: ['TSH', 'Free T4', 'Free T3', 'Reverse T3', 'TPO antibodies', 'Thyroglobulin antibodies'],
  },
  {
    id: 'one-carbon',
    label: 'One-carbon / methylation',
    match: /\b(methylation|homocysteine|b12|folate|one-carbon|mthfr)\b/i,
    rationale: 'Covers methylation load and B-vitamin availability with direct functional context.',
    markers: ['Homocysteine', 'Active B12', 'Vitamin B12', 'Folate', 'MMA'],
  },
];

/** @param {string} text */
export function detectLabPlanTopics(text) {
  const sourceText = String(text || '');
  return LAB_PLAN_TOPIC_RULES
    .filter(rule => rule.match.test(sourceText))
    .map(rule => ({ type: 'labPlanTopic', topic: rule.id, label: rule.label }));
}

/** @param {string} text @param {{ importedData?: any }} [opts] */
export function draftLabPlan(text, opts = {}) {
  const sourceText = String(text || '');
  const matched = LAB_PLAN_TOPIC_RULES.filter(rule => rule.match.test(sourceText));
  const selected = matched.length ? matched : LAB_PLAN_TOPIC_RULES.slice(0, 3);
  const seenMarkers = new Set();
  const bundles = selected.map(rule => {
    const markers = rule.markers.filter(marker => {
      const key = marker.toLowerCase();
      if (seenMarkers.has(key)) return false;
      seenMarkers.add(key);
      return true;
    });
    return { id: rule.id, label: rule.label, rationale: rule.rationale, markers };
  }).filter(bundle => bundle.markers.length);
  if (!/\b(lab plan|lab-order plan|order labs|what labs|which labs|test next|markers? to test|blood work)\b/i.test(sourceText) && !matched.length) return null;
  return {
    id: `agent_lab_plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    surface: 'labPlan',
    mode: 'draft-lab-plan',
    writeLevel: 'draft-only',
    requiresConfirmation: false,
    status: 'draft',
    sourceText,
    title: matched.length ? 'Draft lab plan' : 'Draft baseline lab plan',
    summary: bundles.map(b => b.label).join('; '),
    bundles,
    safetyNote: 'Draft only — nothing is ordered, saved, or sent anywhere.',
  };
}

const BIOLOGY_SCORE_INTENT_RULES = [
  { scoreId: 'hormoneAxis', label: 'Hormone Axis', match: /\b(hormone axis|hormones?|testosterone|androgen|low t\b|shbg|lh|fsh)\b/i },
  { scoreId: 'metabolic', label: 'Metabolic', match: /\b(metabolic|insulin|glucose|blood sugar|homa|hba1c)\b/i },
  { scoreId: 'cardiovascular', label: 'Cardiovascular', match: /\b(cardiovascular|apo ?b|lipids?|cholesterol|ldl|hdl|lp\(?a\)?)\b/i },
  { scoreId: 'oneCarbon', label: 'One-Carbon', match: /\b(one[- ]carbon|methylation|homocysteine|b12|folate)\b/i },
  { scoreId: 'thyroidCoherence', label: 'Thyroid Coherence', match: /\b(thyroid|tsh|free t3|free t4|reverse t3)\b/i },
  { scoreId: 'biologicalCoherence', label: 'Biological Coherence', match: /\b(biological coherence|overall biology|coherence score)\b/i },
];

/** @param {string} text */
export function detectBiologyScoreTarget(text) {
  const sourceText = String(text || '');
  if (!/\b(why|what|explain|investigate|score|bad|low|strained|concerning|missing|confidence|coverage)\b/i.test(sourceText)) return null;
  const rule = BIOLOGY_SCORE_INTENT_RULES.find(item => item.match.test(sourceText));
  return rule ? { type: 'biologyScore', scoreId: rule.scoreId, label: rule.label } : null;
}

/** @param {any[]} scores @param {string} scoreId @param {string} label */
function resolveBiologyScore(scores, scoreId, label) {
  const normalizedLabel = String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return (scores || []).find(score => score?.id === scoreId)
    || (scores || []).find(score => String(score?.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '') === normalizedLabel)
    || null;
}

/** @param {any[]} items @param {number} limit */
function scoreMarkerLabels(items, limit = 6) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const label = markerDisplaySafe(item);
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= limit) break;
  }
  return out;
}

/** @param {any} item */
function markerDisplaySafe(item) {
  return String(item?.label || item?.name || item?.key || item?.dotKey || '').trim();
}

/** @param {string} text @param {{ importedData?: any, biologyScores?: any[] }} [opts] */
export function investigateBiologyScore(text, opts = {}) {
  const target = detectBiologyScoreTarget(text);
  if (!target) return null;
  const importedData = importedFrom(opts);
  const scores = Array.isArray(opts.biologyScores) ? opts.biologyScores : computeBiologyScores(importedData || {});
  const score = resolveBiologyScore(scores, target.scoreId, target.label);
  if (!score) return null;
  const missingMarkers = scoreMarkerLabels(score.missing, 8);
  const availableMarkers = scoreMarkerLabels(score.available, 8);
  const flags = (score.flags || []).map(flag => String(flag || '').trim()).filter(Boolean).slice(0, 5);
  const scoreValue = Number.isFinite(score.score) ? Math.round(score.score) : null;
  const coveragePct = Number.isFinite(score.coverage) ? Math.round(score.coverage * 100) : null;
  const confidence = score.scoreConfidenceLabel || score.scoreConfidence || '';
  const mainDrivers = flags.length ? flags.slice(0, 3) : missingMarkers.length ? [`Missing markers: ${missingMarkers.slice(0, 4).join(', ')}`] : ['No obvious missing-marker driver found in the score state.'];
  return {
    id: `agent_score_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    surface: 'biologyScoreInvestigation',
    mode: 'investigate-score',
    writeLevel: 'read-only',
    requiresConfirmation: false,
    status: 'completed',
    sourceText: String(text || ''),
    scoreId: score.id || target.scoreId,
    title: score.title || target.label,
    scoreValue,
    tone: score.tone || null,
    coveragePct,
    confidence,
    missingMarkers,
    availableMarkers,
    flags,
    mainDrivers,
    sourceScore: score,
    safetyNote: 'Read-only score investigation — no profile data was changed.',
  };
}

const NAVIGATION_TARGETS = [
  { route: 'dashboard', label: 'Dashboard', match: /\b(?:show|open|go to|take me to|view)\s+(?:my\s+)?dashboard\b/i },
  { route: 'labs', label: 'Labs', match: /\b(?:show|open|go to|take me to|view)\s+(?:my\s+)?(?:labs|lab results|markers)\b/i },
  { route: 'biology-scores', label: 'Biology Scores', match: /\b(?:show|open|go to|take me to|view)\s+(?:my\s+)?(?:biology scores|biological scores|scores)\b/i },
  { route: 'genome', label: 'Genome', match: /\b(?:show|open|go to|take me to|view)\s+(?:my\s+)?(?:genome|genetics|dna)\b/i },
  { route: 'body', label: 'Body', match: /\b(?:show|open|go to|take me to|view)\s+(?:my\s+)?(?:body|wearables|biometrics)\b/i },
  { route: 'light', label: 'Light', match: /\b(?:show|open|go to|take me to|view)\s+(?:my\s+)?(?:light|sun|light assessment|sunlight)\b/i },
  { route: 'insight', label: 'Insight', match: /\b(?:show|open|go to|take me to|view)\s+(?:my\s+)?(?:insight|insights)\b/i },
  { route: 'recommendations', label: 'Recommendations', match: /\b(?:show|open|go to|take me to|view)\s+(?:my\s+)?recommendations\b/i },
  { route: 'compare', label: 'Compare dates', match: /\b(?:show|open|go to|take me to|view)\s+(?:my\s+)?(?:compare|date comparison|compare dates)\b/i },
  { route: 'correlations', label: 'Correlations', match: /\b(?:show|open|go to|take me to|view)\s+(?:my\s+)?correlations\b/i },
];

/** @param {string} text */
export function detectAgentNavigationTarget(text) {
  const sourceText = String(text || '');
  return NAVIGATION_TARGETS.find(target => target.match.test(sourceText)) || null;
}

/** @param {string} route */
export function executeAgentNavigation(route) {
  const target = NAVIGATION_TARGETS.find(t => t.route === route);
  if (!target) throw new Error(`Unsupported agent navigation route: ${route}`);
  if (typeof window !== 'undefined' && typeof window.navigate === 'function') window.navigate(target.route);
  return { status: 'completed', route: target.route, label: target.label };
}

/** @param {string} text @param {{ importedData?: any, today?: string }} [opts] */
export function draftContextChangeProposal(text, opts = {}) {
  const sourceText = String(text || '');
  const changes = [];
  for (const rawRule of CONTEXT_SIGNAL_RULES) {
    const rule = /** @type {any} */ (rawRule);
    if (!rule.match.test(sourceText)) continue;
    const patch = typeof rule.buildPatch === 'function' ? rule.buildPatch(sourceText) : { ...(rule.patch || {}) };
    if (!patch || typeof patch !== 'object' || Object.keys(patch).length === 0) continue;
    changes.push({
      field: rule.field,
      label: rule.label,
      patch,
    });
  }
  const goalText = extractGoalText(sourceText);
  if (goalText) {
    changes.push({
      field: 'healthGoals',
      label: 'Health goals',
      action: 'add',
      item: { text: goalText, severity: 'major' },
    });
  }
  if (!changes.length) return null;
  const proposal = {
    id: `agent_proposal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    surface: 'context',
    mode: 'record-context-change',
    requiresConfirmation: true,
    status: 'pending',
    sourceText,
    changes,
  };
  proposal.summary = summarizeContextProposal(proposal);
  return proposal;
}

/** @param {any} proposal @param {Record<string, Record<string, string>>} edits */
export function reviseSupplementChangeProposal(proposal, edits = {}) {
  if (!proposal || !Array.isArray(proposal.changes)) return proposal;
  const allowed = new Set(['name', 'dosage', 'schedule', 'startDate', 'endDate']);
  return {
    ...proposal,
    status: proposal.status === 'applied' ? proposal.status : 'pending',
    changes: proposal.changes.map((change, idx) => {
      const patch = edits[String(idx)] || edits[idx] || {};
      const next = { ...change };
      for (const [key, value] of Object.entries(patch)) {
        if (!allowed.has(key)) continue;
        const trimmed = String(value ?? '').trim();
        if (key === 'name') next[key] = titleCaseName(trimmed);
        else next[key] = trimmed;
      }
      return next;
    }),
  };
}

/** @param {any} proposal @param {{ importedData?: any, now?: number, save?: boolean }} [opts] */
export async function applySupplementChangeProposal(proposal, opts = {}) {
  if (!proposal || proposal.surface !== 'supplements' || !Array.isArray(proposal.changes)) {
    throw new Error('Invalid supplement proposal');
  }
  const importedData = importedFrom(opts);
  if (!Array.isArray(importedData.supplements)) importedData.supplements = [];
  if (!Array.isArray(importedData.changeHistory)) importedData.changeHistory = [];
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const applied = [];
  for (const change of proposal.changes) {
    const idx = importedData.supplements.findIndex(s => normalizeNameKey(s?.name) === normalizeNameKey(change.name));
    if (change.action === 'add_or_update') {
      const existing = idx >= 0 ? importedData.supplements[idx] : null;
      const next = {
        ...(existing || {}),
        name: change.name,
        dosage: change.dosage || existing?.dosage || '',
        type: existing?.type || 'supplement',
        note: existing?.note || '',
        startDate: change.startDate || existing?.startDate || new Date(now).toISOString().slice(0, 10),
        updatedAt: now,
      };
      if (existing?.endDate && existing.endDate < (change.startDate || '')) next.endDate = existing.endDate;
      if (change.schedule) next.schedule = change.schedule;
      if (idx >= 0) replaceImportedArrayItem(importedData, 'supplements', idx, next);
      else appendImportedArrayItem(importedData, 'supplements', next);
      applied.push(`Added/updated ${change.name}`);
    } else if (change.action === 'end') {
      if (idx >= 0) {
        const existing = importedData.supplements[idx];
        replaceImportedArrayItem(importedData, 'supplements', idx, { ...existing, endDate: change.endDate, updatedAt: now });
        applied.push(`Stopped ${change.name}`);
      } else {
        const next = { name: change.name, dosage: '', type: 'supplement', startDate: '', endDate: change.endDate, note: 'Added by agent from a stopped-supplement note.', updatedAt: now };
        appendImportedArrayItem(importedData, 'supplements', next);
        applied.push(`Recorded stopped ${change.name}`);
      }
    }
  }
  importedData.changeHistory.push({
    source: 'agent',
    mode: proposal.mode || 'record-context-change',
    proposalId: proposal.id || null,
    surface: 'supplements',
    summary: applied.join('; ') || summarizeSupplementProposal(proposal),
    confirmedByUser: true,
    timestamp: now,
  });
  if (opts.save !== false) {
    const saved = await saveImportedData({ immediate: true });
    if (!saved) throw new Error('Could not save supplement proposal');
  }
  return { status: 'applied', applied };
}

/** @param {any} proposal @param {{ importedData?: any, now?: number, save?: boolean }} [opts] */
export async function applyContextChangeProposal(proposal, opts = {}) {
  if (!proposal || proposal.surface !== 'context' || !Array.isArray(proposal.changes)) {
    throw new Error('Invalid context proposal');
  }
  const importedData = importedFrom(opts);
  if (!Array.isArray(importedData.changeHistory)) importedData.changeHistory = [];
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const applied = [];
  for (const change of proposal.changes) {
    if (change.field === 'healthGoals') {
      if (!Array.isArray(importedData.healthGoals)) importedData.healthGoals = [];
      const text = normalizeContextString(change.item?.text || change.text);
      if (!text) continue;
      const item = { text, severity: normalizeContextString(change.item?.severity || 'major') || 'major', updatedAt: now };
      appendImportedArrayItem(importedData, 'healthGoals', item);
      applied.push(`Added health goal: ${item.text || ''}`);
      continue;
    }
    const schema = CONTEXT_CARD_SCHEMAS[change.field];
    const normalizedPatch = schema ? normalizeContextPatch(change.field, change.patch) : null;
    if (!schema || !normalizedPatch) continue;
    const current = importedData[change.field] && typeof importedData[change.field] === 'object' ? importedData[change.field] : {};
    const patch = /** @type {Record<string, any>} */ ({ ...normalizedPatch });
    if (typeof patch.note === 'string') patch.note = appendContextNote(current.note, patch.note);
    importedData[change.field] = { ...current, ...patch, updatedAt: now };
    applied.push(`Updated ${schema.label || change.label || change.field}`);
  }
  if (!applied.length) throw new Error('Context proposal contained no valid changes');
  importedData.changeHistory.push({
    source: 'agent',
    mode: proposal.mode || 'record-context-change',
    proposalId: proposal.id || null,
    surface: 'context',
    summary: applied.join('; ') || summarizeContextProposal(proposal),
    confirmedByUser: true,
    timestamp: now,
  });
  if (opts.save !== false) {
    const saved = await saveImportedData({ immediate: true });
    if (!saved) throw new Error('Could not save context proposal');
  }
  return { status: 'applied', applied };
}

export function getAgentToolRegistry() {
  return [
    { id: 'get_profile_context', writeLevel: 'read-only', description: 'Summarize profile/data availability for agent routing.' },
    { id: 'compare_latest_labs', writeLevel: 'read-only', description: 'Compare the latest lab entry with the previous lab entry.' },
    { id: 'draft_supplement_change', writeLevel: 'draft-only', requiresConfirmation: true, description: 'Draft supplement/med changes from a user message without mutating data.' },
    { id: 'apply_supplement_change', writeLevel: 'write', requiresConfirmation: true, description: 'Apply a confirmed supplement/med proposal and record an audit trail.' },
    { id: 'draft_context_change', writeLevel: 'draft-only', requiresConfirmation: true, description: 'Draft profile context and health-goal changes from a user message without mutating data.' },
    { id: 'apply_context_change', writeLevel: 'write', requiresConfirmation: true, description: 'Apply confirmed profile context/health-goal changes and record an audit trail.' },
    { id: 'open_view', writeLevel: 'navigation', description: 'Open a known app view such as dashboard, labs, biology-scores, genome, body, light, insight, recommendations, compare, or correlations; no data writes.' },
    { id: 'open_labs_view', writeLevel: 'navigation', description: 'Open the Labs view; no data writes.' },
    { id: 'draft_lab_plan', writeLevel: 'draft-only', requiresConfirmation: true, description: 'Draft a lab plan in chat; requires explicit user confirmation before saving/sending anywhere.' },
    { id: 'investigate_biology_score', writeLevel: 'read-only', description: 'Explain the current deterministic Biology Score state, missing markers, confidence, and flags without changing data.' },
  ];
}
