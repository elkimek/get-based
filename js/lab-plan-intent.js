// lab-plan-intent.js — natural chat → actionable lab-test plan.
// This layer stays provider-agnostic: it extracts candidate markers from a
// normal health conversation, then the lab-order layer maps them to providers.

import { getMarkerCrosswalk, resolveMarkerAliases } from './lab-standards/marker-crosswalk.js';

const TEST_PLAN_PROMPTS = [
  'what should i test', 'what should i get tested', 'what to test', 'what labs',
  'what blood tests', 'blood tests would you recommend', 'recommend next',
  'what markers', 'which markers', 'next blood draw', 'next labs', 'next lab',
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
    ['minerals.phosphate', 'Phosphate', 'Bone/mineral metabolism marker.'],
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
  { terms: ['bone metabolism', 'bone panel', 'mineral metabolism'], panel: 'boneMetabolism' },
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
  'hs crp': ['inflammation.hsCRP'],
  'hs-crp': ['inflammation.hsCRP'],
  tsh: ['thyroid.tsh'],
  'free t3': ['thyroid.freeT3'],
  'free t4': ['thyroid.freeT4'],
  testosterone: ['hormones.totalTestosterone'],
  shbg: ['hormones.shbg'],
  lh: ['hormones.lh'],
  fsh: ['hormones.fsh'],
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
  out.set(markerKey, {
    markerKey,
    displayName: opts.displayName || markerDisplayName(markerKey),
    reason: opts.reason || 'Mentioned in the health conversation.',
    priority: opts.priority || 'core',
    confidence: opts.confidence || 'conversation_derived',
  });
}

function inferPanelMarkers(text, out) {
  const normalized = normalize(text);
  if (normalized.includes('methylation') || normalized.includes('homocysteine') || normalized.includes('folate')) {
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

function extractMentionedMarkers(text, out) {
  const raw = String(text || '');
  for (const token of raw.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
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

function splitCandidateList(text) {
  return String(text || '')
    .split(/,|;|\band\b|\+/i)
    .map(cleanCandidateName)
    .filter(Boolean);
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

  const recommendationVerb = /\b(?:recommend|consider|check|test|include|worth checking|worth testing)\b/i;
  for (const line of lines) {
    if (!recommendationVerb.test(line) || isCandidateHeading(line)) continue;
    const afterVerb = line.replace(/^.*?\b(?:recommend|consider|check|test|include|worth checking|worth testing)\b\s*(?:checking|testing|next|for|a|an|the|:)?\s*/i, '');
    splitCandidateList(afterVerb).forEach(candidate => addUnmappedCandidate(out, candidate));
  }
}

export function buildLabPlanFromConversation(userText, assistantText = '') {
  const combined = `${userText || ''}\n${assistantText || ''}`;
  const userAskedForPlan = mentionsTestPlan(userText);
  const out = new Map();
  extractMentionedMarkers(combined, out);
  inferPanelMarkers(combined, out);
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
