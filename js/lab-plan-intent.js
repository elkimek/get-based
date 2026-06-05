// lab-plan-intent.js — natural chat → actionable lab-test plan.
// This layer stays provider-agnostic: it extracts candidate markers from a
// normal health conversation, then the lab-order layer maps them to providers.

import { getMarkerCrosswalk, resolveMarkerAliases } from './lab-standards/marker-crosswalk.js';

const TEST_PLAN_PROMPTS = [
  'what should i test', 'what should i get tested', 'what to test', 'what labs',
  'what blood tests', 'blood tests would you recommend', 'recommend next',
  'what would you test',
  'what markers', 'which markers', 'next blood draw', 'next labs', 'next lab',
  'what should i order', 'what to order', 'order next', 'order labs', 'lab order',
  'build lab plan', 'build a lab plan', 'build labs', 'build panel', 'build a panel',
  'build blood draw', 'build a blood draw', 'labshop-ready',
  'check next', 'test next', 'get tested next', 'vyšetřit', 'vysetrit',
  'jaké testy', 'jake testy', 'co otestovat', 'krevní testy', 'krevni testy',
];

const PANEL_MARKERS = Object.freeze({
  methylation: [
    ['coagulation.homocysteine', 'Homocysteine', 'Functional methylation marker.'],
    ['vitamins.folate', 'Folate', 'B9 status needed to interpret methylation support.'],
    ['vitamins.vitaminB12', 'Vitamin B12', 'Core B12 status marker.'],
    ['vitamins.holotranscobalamin', 'Holotranscobalamin / active B12', 'Active B12 can clarify usable B12 status.'],
  ],
  b12: [
    ['vitamins.vitaminB12', 'Vitamin B12', 'Core B12 status marker.'],
    ['vitamins.holotranscobalamin', 'Holotranscobalamin / active B12', 'Active B12 can clarify usable B12 status.'],
    ['coagulation.homocysteine', 'Homocysteine', 'Functional downstream marker affected by B12/folate.'],
    ['vitamins.folate', 'Folate', 'B12 interpretation is incomplete without folate context.'],
  ],
  thyroid: [
    ['thyroid.tsh', 'TSH', 'Core thyroid screening marker.'],
    ['thyroid.freeT4', 'Free T4', 'Thyroid hormone output marker.'],
    ['thyroid.freeT3', 'Free T3', 'Active thyroid hormone marker.'],
    ['thyroid.tpoAb', 'TPO antibodies', 'Autoimmune thyroid screen when thyroid panel is suggested.'],
  ],
  tumorMarkers: [
    ['tumor.cea', 'CEA', 'Common broad tumor-marker panel item.'],
    ['tumor.ca199', 'CA 19-9', 'Common broad tumor-marker panel item.'],
    ['tumor.afp', 'AFP', 'Common broad tumor-marker panel item.'],
    ['tumor.psa', 'PSA', 'Sex/context-dependent tumor-marker panel item.'],
  ],
  boneMetabolism: [
    ['vitamins.vitaminD', 'Vitamin D', 'Bone/mineral metabolism marker.'],
    ['minerals.calcium', 'Calcium', 'Bone/mineral metabolism marker.'],
    ['electrolytes.phosphorus', 'Phosphorus', 'Bone/mineral metabolism marker.'],
    ['hormones.pth', 'PTH', 'Parathyroid/bone metabolism marker.'],
    ['bone.alp', 'ALP', 'Bone/liver enzyme relevant to bone turnover context.'],
  ],
  hormonePanel: [
    ['hormones.totalTestosterone', 'Total testosterone', 'Core hormone-panel marker.'],
    ['hormones.freeTestosterone', 'Free testosterone', 'Bioavailable androgen context.'],
    ['hormones.shbg', 'SHBG', 'Needed to interpret testosterone fractions.'],
    ['hormones.lh', 'LH', 'Pituitary-gonadal axis marker.'],
    ['hormones.fsh', 'FSH', 'Pituitary-gonadal axis marker.'],
    ['hormones.prolactin', 'Prolactin', 'Hormone-panel marker that can affect gonadal axis.'],
    ['hormones.estradiol', 'Estradiol', 'Sex-hormone balance marker.'],
  ],
  metabolicPanel: [
    ['biochemistry.glucose', 'Glucose', 'Metabolic panel marker.'],
    ['metabolism.insulin', 'Insulin', 'Metabolic status marker.'],
    ['diabetes.hba1c', 'HbA1c', 'Longer-term glycemic marker.'],
    ['lipids.triglycerides', 'Triglycerides', 'Metabolic/lipid risk marker.'],
    ['lipids.hdl', 'HDL', 'Metabolic/lipid risk marker.'],
    ['lipids.ldl', 'LDL', 'Metabolic/lipid risk marker.'],
  ],
  inflammationPanel: [
    ['inflammation.hsCRP', 'hs-CRP', 'Core inflammation marker.'],
    ['hematology.wbc', 'White blood cells', 'Inflammation/immune context marker.'],
    ['inflammation.esr', 'ESR', 'General inflammation marker.'],
  ],
  liverKidney: [
    ['liver.alt', 'ALT', 'Liver function marker.'],
    ['liver.ast', 'AST', 'Liver function marker.'],
    ['liver.ggt', 'GGT', 'Liver/bile duct marker.'],
    ['liver.bilirubinTotal', 'Total bilirubin', 'Liver/bile marker.'],
    ['kidney.creatinine', 'Creatinine', 'Kidney function marker.'],
    ['kidney.urea', 'Urea / BUN', 'Kidney/protein metabolism marker.'],
    ['kidney.egfr', 'eGFR', 'Kidney filtration estimate.'],
  ],
  ironStudies: [
    ['iron.ferritin', 'Ferritin', 'Iron storage marker.'],
    ['iron.serumIron', 'Serum iron', 'Iron status marker.'],
    ['iron.transferrin', 'Transferrin', 'Iron transport marker.'],
    ['iron.transferrinSaturation', 'Transferrin saturation', 'Iron availability marker.'],
  ],
  purineMetabolism: [
    ['biochemistry.uricAcid', 'Uric acid', 'Purine metabolism / gout-risk marker.'],
  ],
  vitaminD: [
    ['vitamins.vitaminD', 'Vitamin D', 'Vitamin D status marker.'],
  ],
});

const PANEL_TRIGGERS = [
  { terms: ['thyroid panel', 'thyroid', 'stitna zlaza', 'štítná žláza'], panel: 'thyroid' },
  { terms: ['tumor markers', 'tumour markers', 'oncomarkers', 'onk-markery', 'onkologicke markery'], panel: 'tumorMarkers' },
  { terms: ['bone metabolism', 'bone panel', 'bone markers', 'mineral metabolism'], panel: 'boneMetabolism' },
  { terms: ['hormone panel', 'hormones panel', 'sex hormones', 'testosterone panel'], panel: 'hormonePanel' },
  { terms: ['metabolic panel', 'metabolic health', 'metabolism panel'], panel: 'metabolicPanel' },
  { terms: ['inflammation panel', 'inflammatory panel', 'immune panel'], panel: 'inflammationPanel' },
  { terms: ['liver kidney function', 'liver and kidney', 'liver kidney', 'liver function', 'kidney function'], panel: 'liverKidney' },
  { terms: ['iron studies', 'iron panel'], panel: 'ironStudies' },
  { terms: ['uric acid'], panel: 'purineMetabolism' },
  { terms: ['vitamin d', '25 oh d', '25(oh)d'], panel: 'vitaminD' },
];

const CANDIDATE_ALIAS_OVERRIDES = Object.freeze({
  ferritin: ['iron.ferritin'],
  'serum ferritin': ['iron.ferritin'],
  'hs crp': ['inflammation.hsCRP'],
  'hs-crp': ['inflammation.hsCRP'],
  hscrp: ['inflammation.hsCRP'],
  'testosterone total': ['hormones.totalTestosterone'],
  'total testosterone': ['hormones.totalTestosterone'],
  'free testosterone': ['hormones.freeTestosterone'],
  'free testo': ['hormones.freeTestosterone'],
  'testosterone free': ['hormones.freeTestosterone'],
  'fasting insulin': ['metabolism.insulin'],
  insulin: ['metabolism.insulin'],
  'glucose for homa ir': ['biochemistry.glucose'],
  'homa ir glucose': ['biochemistry.glucose'],
  'vitamin d total 25 oh': ['vitamins.vitaminD'],
  '25 oh vitamin d': ['vitamins.vitaminD'],
  alt: ['liver.alt'],
  ast: ['liver.ast'],
  ggt: ['liver.ggt'],
  alp: ['liver.alp'],
  'alkaline phosphatase': ['liver.alp'],
  'alkalicka fosfataza': ['liver.alp'],
  'c peptide': ['metabolism.cPeptide'],
  'c-peptide': ['metabolism.cPeptide'],
  'c peptid': ['metabolism.cPeptide'],
  'c-peptid': ['metabolism.cPeptide'],
  esr: ['inflammation.esr'],
  sedimentace: ['inflammation.esr'],
  fw: ['inflammation.esr'],
  bun: ['kidney.urea'],
  urea: ['kidney.urea'],
  mocovina: ['kidney.urea'],
  'blood urea nitrogen': ['kidney.urea'],
  'cbc with differential': ['hematology.cbcDiff'],
  'cbc diff': ['hematology.cbcDiff'],
  'complete blood count with differential': ['hematology.cbcDiff'],
  reticulocytes: ['hematology.reticulocytes'],
  retikulocity: ['hematology.reticulocytes'],
  egfr: ['kidney.egfr'],
  'e gfr': ['kidney.egfr'],
  'cystatin c': ['biochemistry.cystatinC'],
  tsh: ['thyroid.tsh'],
  'free t3': ['thyroid.freeT3'],
  ft3: ['thyroid.freeT3'],
  'free t4': ['thyroid.freeT4'],
  ft4: ['thyroid.freeT4'],
  'tpo antibodies': ['thyroid.tpoAb'],
  'tpo antibody': ['thyroid.tpoAb'],
  tpoab: ['thyroid.tpoAb'],
  'tpo ab': ['thyroid.tpoAb'],
  'anti tpo': ['thyroid.tpoAb'],
  'anti-tpo': ['thyroid.tpoAb'],
  'thyroglobulin antibodies': ['thyroid.tgAb'],
  'thyroglobulin antibody': ['thyroid.tgAb'],
  'thyroglobulin antibodies tgab': ['thyroid.tgAb'],
  'thyroglobulin antibodies tg ab': ['thyroid.tgAb'],
  'thyroglobulin ab': ['thyroid.tgAb'],
  tgab: ['thyroid.tgAb'],
  'tg ab': ['thyroid.tgAb'],
  'anti tg': ['thyroid.tgAb'],
  'anti-tg': ['thyroid.tgAb'],
  'a tg': ['thyroid.tgAb'],
  'a-tg': ['thyroid.tgAb'],
  testosterone: ['hormones.totalTestosterone'],
  shbg: ['hormones.shbg'],
  estradiol: ['hormones.estradiol'],
  e2: ['hormones.estradiol'],
  dht: ['hormones.dht'],
  lh: ['hormones.lh'],
  fsh: ['hormones.fsh'],
  prolactin: ['hormones.prolactin'],
  prolaktin: ['hormones.prolactin'],
  'dhea s': ['hormones.dheaS'],
  'dhea-s': ['hormones.dheaS'],
  dheas: ['hormones.dheaS'],
  'igf 1': ['hormones.igf1'],
  'igf-1': ['hormones.igf1'],
  igf1: ['hormones.igf1'],
  'morning cortisol': ['hormones.morningCortisol'],
  cortisol: ['hormones.morningCortisol'],
  kortizol: ['hormones.morningCortisol'],
  'homa ir': ['metabolism.homaIR'],
  'homa-ir': ['metabolism.homaIR'],
  hba1c: ['diabetes.hba1c'],
  'hb a1c': ['diabetes.hba1c'],
  'glycated hemoglobin': ['diabetes.hba1c'],
  triglycerides: ['lipids.triglycerides'],
  triglyceride: ['lipids.triglycerides'],
  triglyceridy: ['lipids.triglycerides'],
  triacylglyceroly: ['lipids.triglycerides'],
  cholesterol: ['lipids.cholesterol'],
  'total cholesterol': ['lipids.cholesterol'],
  apob: ['lipids.apoB'],
  'apo b': ['lipids.apoB'],
  'apolipoprotein b': ['lipids.apoB'],
  apoa1: ['lipids.apoAI'],
  'apo a1': ['lipids.apoAI'],
  apoai: ['lipids.apoAI'],
  'apo ai': ['lipids.apoAI'],
  'apolipoprotein a1': ['lipids.apoAI'],
  'lp a': ['lipids.lpa'],
  'lp(a)': ['lipids.lpa'],
  lpa: ['lipids.lpa'],
  'lipoprotein a': ['lipids.lpa'],
  'lipoprotein(a)': ['lipids.lpa'],
  albumin: ['proteins.albumin'],
  'serum albumin': ['proteins.albumin'],
  bilirubin: ['liver.bilirubinTotal'],
  'total bilirubin': ['liver.bilirubinTotal'],
  'bilirubin total': ['liver.bilirubinTotal'],
  psa: ['prostate.psa'],
  'psa total': ['prostate.psa'],
  'total psa': ['prostate.psa'],
  'psa (total)': ['prostate.psa'],
});

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function markerDisplayName(markerKey) {
  return getMarkerCrosswalk(markerKey)?.canonicalName || markerKey.split('.').pop() || markerKey;
}

function slugifyMarkerName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function titleCaseMarkerName(name) {
  const trimmed = String(name || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  if (/^[A-Z0-9\-() ]{2,}$/.test(trimmed)) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function mentionsTestPlan(text) {
  const normalized = normalize(text);
  return TEST_PLAN_PROMPTS.some(term => normalized.includes(normalize(term)));
}

function addMarker(out, markerKey, opts = {}) {
  if (!markerKey || out.has(markerKey)) return;
  const displayName = opts.displayName || markerDisplayName(markerKey);
  const normalizedDisplay = normalize(displayName);
  if (normalizedDisplay && [...out.values()].some(marker => normalize(marker.displayName) === normalizedDisplay)) return;
  out.set(markerKey, {
    markerKey,
    displayName,
    reason: opts.reason || 'Mentioned in the health conversation.',
    priority: opts.priority || 'core',
    confidence: opts.confidence || 'conversation_derived',
  });
}

function inferPanelMarkers(text, out) {
  const normalized = normalize(text);
  if (normalized.includes('methylation')) {
    for (const [markerKey, displayName, reason] of PANEL_MARKERS.methylation) {
      addMarker(out, markerKey, { displayName, reason, confidence: 'context_template' });
    }
  }
  if (normalized.includes('b12') || normalized.includes('cobalamin') || normalized.includes('kobalamin')) {
    for (const [markerKey, displayName, reason] of PANEL_MARKERS.b12) {
      addMarker(out, markerKey, { displayName, reason, confidence: 'context_template' });
    }
  }
  for (const trigger of PANEL_TRIGGERS) {
    if (!trigger.terms.some(term => normalized.includes(normalize(term)))) continue;
    for (const [markerKey, displayName, reason] of PANEL_MARKERS[trigger.panel] || []) {
      addMarker(out, markerKey, { displayName, reason, confidence: 'panel_phrase' });
    }
  }
}

function textForPanelInference(text) {
  return String(text || '')
    // If the assistant already spelled out a broad group as components, do not
    // also expand the group label into a second implicit panel. Example:
    // "Full thyroid panel (TSH, Free T4, Free T3)" should request exactly those
    // three markers, not a duplicate thyroid package plus TPO antibodies.
    .replace(/\b[^\n()]*\b(?:panel|markers|studies|profile|enzymes)\s*\(([^()]+)\)/gi, '($1)');
}

function extractMentionedMarkers(text, out) {
  const raw = String(text || '');
  for (const match of raw.matchAll(/[\p{L}\p{N}]+/gu)) {
    const token = match[0];
    const before = raw[match.index - 1] || '';
    const after = raw[match.index + token.length] || '';
    if (token.length < 3 || before === '-' || after === '-') continue;
    resolveMarkerAliases(token).forEach(markerKey => addMarker(out, markerKey));
  }
  resolveMarkerAliases(raw).forEach(markerKey => addMarker(out, markerKey));
}

function cleanCandidateName(candidate) {
  return String(candidate || '')
    .replace(/^[\s:#>*_`~]+/, '')
    .replace(/[\s*_`~]+$/g, '')
    .replace(/^[\s\-*•\d.)]+/, '')
    .replace(/^(next|then|also)\s*:\s*/i, '')
    .replace(/\b(panel|test|tests|marker|markers|studies|profile)\b$/i, '')
    .replace(/[.;:]+$/g, '')
    .replace(/[\s*_`~]+$/g, '')
    .trim();
}

function splitTopLevelList(text, separators = { comma: true, semicolon: true, plus: true, and: true, or: false }) {
  const raw = String(text || '');
  const parts = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '(' || ch === '[') depth += 1;
    if ((ch === ')' || ch === ']') && depth > 0) depth -= 1;
    const atTop = depth === 0;
    const rest = raw.slice(i);
    const wordSep = atTop && (
      (separators.and && /^\s+and\s+/i.test(rest)) ||
      (separators.or && /^\s+or\s+/i.test(rest))
    );
    const charSep = atTop && (
      (separators.comma && ch === ',') ||
      (separators.semicolon && ch === ';') ||
      (separators.plus && ch === '+')
    );
    if (charSep || wordSep) {
      parts.push(current);
      current = '';
      if (wordSep) {
        const m = rest.match(/^\s+(?:and|or)\s+/i);
        i += (m?.[0]?.length || 1) - 1;
      }
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

function parentheticalInnerCandidates(text) {
  const out = [];
  const raw = String(text || '');
  const re = /\(([^()]+)\)/g;
  let match;
  while ((match = re.exec(raw))) {
    splitTopLevelList(match[1], { comma: true, semicolon: true, plus: true, and: true, or: true })
      .map(cleanCandidateName)
      .filter(Boolean)
      .forEach(candidate => out.push(candidate));
  }
  return out;
}

function splitCandidateList(text) {
  const topLevel = splitTopLevelList(text, { comma: true, semicolon: true, plus: true, and: true, or: false })
    .map(cleanCandidateName)
    .filter(Boolean);
  const expanded = [];
  for (const candidate of topLevel) {
    const shouldExpandParenthetical = /\b(?:panel|markers|studies|profile|enzymes)\s*\(/i.test(candidate);
    if (!shouldExpandParenthetical) {
      expanded.push(candidate);
      continue;
    }
    const parenthetical = parentheticalInnerCandidates(candidate);
    const withoutParenthetical = cleanCandidateName(candidate.replace(/\([^()]+\)/g, ''));
    // The provider comparison should reason over orderable single markers.
    // Do not keep broad labels like "Full thyroid" or "Liver enzymes" as
    // separate requested tests when the component markers are present.
    if (withoutParenthetical && !parenthetical.length) expanded.push(withoutParenthetical);
    if (parenthetical.length) expanded.push(...parenthetical);
    if (!withoutParenthetical && !parenthetical.length) expanded.push(candidate);
  }
  return expanded.filter(Boolean);
}

function isCandidateHeading(line) {
  const cleaned = cleanCandidateName(line);
  if (!cleaned) return true;
  if (/[:：]\s*$/.test(String(line || '').trim())) return true;
  if (/\*\*\s*$/.test(String(line || '').trim())) return true;
  return false;
}

function looksLikeNoise(candidate) {
  const normalized = normalize(candidate);
  if (!normalized || normalized.length < 2) return true;
  if (normalized.length > 80) return true;
  if (/^(and|or|with|plus|maybe|optional|core|next|also|then|because|for these)$/.test(normalized)) return true;
  if (/^(thyroid|bone|hormone|metabolic|inflammation|liver kidney|kidney|liver|tumor|tumour)$/.test(normalized)) return true;
  if (/\b(i would|i recommend|consider|check|test|include|worth|next time)\b/.test(normalized)) return true;
  return false;
}

function addUnmappedCandidate(out, name) {
  const displayName = titleCaseMarkerName(cleanCandidateName(name));
  if (looksLikeNoise(displayName)) return;
  const overrideKeys = CANDIDATE_ALIAS_OVERRIDES[normalize(displayName)] || [];
  const mappedKeys = overrideKeys.length ? overrideKeys : resolveMarkerAliases(displayName);
  if (mappedKeys.length) {
    mappedKeys.forEach(markerKey => addMarker(out, markerKey, {
      displayName: markerDisplayName(markerKey),
      reason: 'Recommended by the assistant.',
      confidence: 'llm_recommended_mapped',
    }));
    return;
  }
  const normalizedDisplay = normalize(displayName);
  if ([...out.values()].some(marker => normalize(marker.displayName) === normalizedDisplay)) return;
  const slug = slugifyMarkerName(displayName);
  if (!slug) return;
  addMarker(out, `unmapped.${slug}`, {
    displayName,
    reason: 'Recommended by the assistant; provider/catalog mapping is not verified yet.',
    priority: 'candidate',
    confidence: 'llm_recommended_unmapped',
  });
}

function extractRecommendationCandidates(text, out) {
  const raw = String(text || '');
  const lines = raw.split(/\n+/).map(line => line.trim()).filter(Boolean);
  for (const line of lines) {
    const bullet = line.match(/^\s*(?:[-•]|\d+[.)])\s+(.+)$/);
    if (bullet && !isCandidateHeading(bullet[1])) {
      splitCandidateList(bullet[1]).forEach(candidate => addUnmappedCandidate(out, candidate));
    }
  }

  const recommendationVerb = /\b(?:recommend|consider|check|test|include|order|add|worth checking|worth testing)\b/i;
  for (const line of lines) {
    if (!recommendationVerb.test(line) || isCandidateHeading(line)) continue;
    const afterVerb = line.replace(/^.*?\b(?:recommend|consider|check|test|include|order|add|worth checking|worth testing)\b\s*(?:(?:checking|testing|ordering|adding|next|for|a|an|the)\b\s*)?:?\s*/i, '');
    splitCandidateList(afterVerb).forEach(candidate => addUnmappedCandidate(out, candidate));
  }
}

export function buildLabPlanFromConversation(userText, assistantText = '') {
  const combined = `${userText || ''}\n${assistantText || ''}`;
  const userAskedForPlan = mentionsTestPlan(userText);
  const out = new Map();
  extractMentionedMarkers(combined, out);
  inferPanelMarkers(textForPanelInference(combined), out);
  if (userAskedForPlan) extractRecommendationCandidates(assistantText, out);
  const markers = [...out.values()];
  if (!userAskedForPlan || !markers.length) return null;
  return {
    id: `labplan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    status: 'suggested',
    title: markers.length > 4 ? 'Suggested next lab plan' : 'Suggested focused lab plan',
    source: 'conversation',
    userPrompt: String(userText || ''),
    markers,
    safetyBoundary: 'This is a test plan, not a diagnosis. Compare labs only after you review/edit the marker list.',
    nextAction: 'compare_labs',
  };
}

export function buildLabPlanFromThread(messages = []) {
  const transcript = (Array.isArray(messages) ? messages : [])
    .filter(msg => msg && !msg.hidden && !msg.joined && typeof msg.content === 'string' && msg.content.trim())
    .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n');
  const out = new Map();
  extractMentionedMarkers(transcript, out);
  inferPanelMarkers(textForPanelInference(transcript), out);
  extractRecommendationCandidates(transcript, out);
  const markers = [...out.values()];
  if (!markers.length) return null;
  return {
    id: `labplan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    status: 'suggested',
    title: markers.length > 4 ? 'Next blood draw' : 'Focused lab plan',
    source: 'thread_action',
    userPrompt: 'Build lab plan from this conversation',
    markers,
    safetyBoundary: 'This lab plan was pulled from the conversation. Review/edit it before comparing labs or preparing any provider handoff.',
    nextAction: 'compare_labs',
  };
}
