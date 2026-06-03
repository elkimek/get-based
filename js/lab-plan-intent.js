// lab-plan-intent.js — natural chat → actionable lab-test plan.
// This layer stays provider-agnostic: it extracts candidate markers from a
// normal health conversation, then the lab-order layer maps them to providers.

import { getMarkerCrosswalk, resolveMarkerAliases } from './lab-standards/marker-crosswalk.js';

const TEST_PLAN_PROMPTS = [
  'what should i test', 'what should i get tested', 'what to test', 'what labs',
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

export function buildLabPlanFromConversation(userText, assistantText = '') {
  const combined = `${userText || ''}\n${assistantText || ''}`;
  const userAskedForPlan = mentionsTestPlan(userText);
  const out = new Map();
  extractMentionedMarkers(combined, out);
  inferPanelMarkers(combined, out);
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
