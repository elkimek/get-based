// labshop-demo-guarantee.js — bounded Labshop-facing demo guarantee.
//
// This is intentionally not a claim that every possible lab phrase is solved.
// It defines the curated panels getbased should be able to demo reliably to
// Labshop: natural lab-plan prompt → stable markers → verified Labshop rows →
// preview-safe product payload.

import { buildLabPlanFromConversation } from '../../lab-plan-intent.js';
import { buildLabOrderDraftFromMarkers, selectProviderForDraft } from '../../lab-order-intent.js';

export const LABSHOP_DEMO_SCENARIOS = Object.freeze([
  {
    id: 'methylation-fatigue',
    title: 'Methylation + fatigue basics',
    userPrompt: 'Build a Labshop-ready methylation and fatigue blood draw.',
    assistantText: 'Order homocysteine, folate, vitamin B12, active B12, ferritin, vitamin D and hs-CRP.',
    expectedMarkerKeys: [
      'coagulation.homocysteine',
      'vitamins.folate',
      'vitamins.vitaminB12',
      'vitamins.holotranscobalamin',
      'iron.ferritin',
      'vitamins.vitaminD',
      'inflammation.hsCRP',
    ],
    expectedLabshopProductIds: ['19228', '19711', '19312', '19722', '19224', '19134', '19479'],
  },
  {
    id: 'thyroid-complete',
    title: 'Complete thyroid panel',
    userPrompt: 'Build a Labshop-ready thyroid panel.',
    assistantText: 'Order TSH, free T4, free T3, total T4, total T3 and TPO antibodies.',
    expectedMarkerKeys: [
      'thyroid.tsh',
      'thyroid.freeT4',
      'thyroid.freeT3',
      'thyroid.totalT4',
      'thyroid.totalT3',
      'thyroid.tpoAb',
    ],
    expectedLabshopProductIds: ['19297', '19717', '19718', '19234', '19339', '19397'],
  },
  {
    id: 'male-hormone-metabolic',
    title: 'Male hormone + metabolic context',
    userPrompt: 'Build a Labshop-ready male hormone panel with glycemic context.',
    assistantText: 'Order total testosterone, free testosterone, SHBG, estradiol, DHT, LH, FSH, prolactin, DHEA-S, IGF-1, morning cortisol, glucose, fasting insulin and HbA1c.',
    expectedMarkerKeys: [
      'hormones.totalTestosterone',
      'hormones.freeTestosterone',
      'hormones.shbg',
      'hormones.estradiol',
      'hormones.dht',
      'hormones.lh',
      'hormones.fsh',
      'hormones.prolactin',
      'hormones.dheaS',
      'hormones.igf1',
      'hormones.morningCortisol',
      'biochemistry.glucose',
      'metabolism.insulin',
      'diabetes.hba1c',
    ],
    expectedLabshopProductIds: ['19270', '19138', '19199', '19171', '19260', '19269', '19226', '19434', '19378', '19230', '19238', '19232', '19398', '19258'],
  },
  {
    id: 'metabolic-lipids',
    title: 'Metabolic + lipid risk',
    userPrompt: 'Build a Labshop-ready metabolic and lipid panel.',
    assistantText: 'Order glucose, fasting insulin, HbA1c, total cholesterol, triglycerides, ApoB and ApoA1.',
    expectedMarkerKeys: [
      'biochemistry.glucose',
      'metabolism.insulin',
      'diabetes.hba1c',
      'lipids.cholesterol',
      'lipids.triglycerides',
      'lipids.apoB',
      'lipids.apoAI',
    ],
    expectedLabshopProductIds: ['19232', '19398', '19258', '19173', '19406', '19396', '19360'],
  },
  {
    id: 'liver-kidney-biochemistry',
    title: 'Liver, kidney + biochemistry',
    userPrompt: 'Build a Labshop-ready liver, kidney and biochemistry panel.',
    assistantText: 'Order ALT, AST, GGT, ALP, total bilirubin, albumin, creatinine, urea, cystatin C and uric acid.',
    expectedMarkerKeys: [
      'liver.alt',
      'liver.ast',
      'liver.ggt',
      'liver.alp',
      'liver.bilirubinTotal',
      'proteins.albumin',
      'biochemistry.creatinine',
      'kidney.urea',
      'biochemistry.cystatinC',
      'biochemistry.uricAcid',
    ],
    expectedLabshopProductIds: ['19191', '19368', '19217', '19306', '19335', '19373', '19267', '19170', '19369', '19268'],
  },
  {
    id: 'inflammation-hematology',
    title: 'Inflammation + hematology',
    userPrompt: 'Build a Labshop-ready inflammation and hematology panel.',
    assistantText: 'Order hs-CRP, ESR, CBC with differential and reticulocytes.',
    expectedMarkerKeys: [
      'inflammation.hsCRP',
      'inflammation.esr',
      'hematology.cbcDiff',
      'hematology.reticulocytes',
    ],
    expectedLabshopProductIds: ['19479', '19376', '19734', '19735'],
  },
  {
    id: 'bone-mineral-vitamin-d',
    title: 'Bone/mineral + vitamin D',
    userPrompt: 'Build a Labshop-ready bone, mineral and vitamin D panel.',
    assistantText: 'Order vitamin D, PTH, calcium, ALP, creatinine, cystatin C and RBC magnesium.',
    expectedMarkerKeys: [
      'vitamins.vitaminD',
      'hormones.pth',
      'minerals.calcium',
      'liver.alp',
      'biochemistry.creatinine',
      'biochemistry.cystatinC',
      'minerals.rbcMagnesium',
    ],
    expectedLabshopProductIds: ['19134', '19348', '19702', '19306', '19267', '19369', '19705'],
  },
  {
    id: 'preventive-broad-panel',
    title: 'Preventive broad panel',
    userPrompt: 'Build a Labshop-ready broad preventive panel.',
    assistantText: 'Order TSH, vitamin D, ferritin, hs-CRP, glucose, fasting insulin, HbA1c, total cholesterol, triglycerides, ApoB, ALT, AST, GGT, creatinine, urea, uric acid, albumin, total bilirubin, homocysteine and PSA.',
    expectedMarkerKeys: [
      'thyroid.tsh',
      'vitamins.vitaminD',
      'iron.ferritin',
      'inflammation.hsCRP',
      'biochemistry.glucose',
      'metabolism.insulin',
      'diabetes.hba1c',
      'lipids.cholesterol',
      'lipids.triglycerides',
      'lipids.apoB',
      'liver.alt',
      'liver.ast',
      'liver.ggt',
      'biochemistry.creatinine',
      'kidney.urea',
      'biochemistry.uricAcid',
      'proteins.albumin',
      'liver.bilirubinTotal',
      'coagulation.homocysteine',
      'prostate.psa',
    ],
    expectedLabshopProductIds: ['19297', '19134', '19224', '19479', '19232', '19398', '19258', '19173', '19406', '19396', '19191', '19368', '19217', '19267', '19170', '19268', '19373', '19335', '19228', '19242'],
  },
]);

function previewPayloadFromSelectedDraft(selectedDraft) {
  return {
    action: 'create_cart_preview',
    products: (selectedDraft.products || []).map(product => ({
      idProduct: String(product.providerProductId),
      quantity: 1,
    })),
  };
}

function scenarioFailureReasons(scenario, result) {
  const failures = [];
  if (!result.plan) failures.push('plan_not_created');
  for (const key of scenario.expectedMarkerKeys || []) {
    if (!result.markerKeys.includes(key)) failures.push(`missing_expected_marker:${key}`);
  }
  for (const key of result.unmappedMarkerKeys) failures.push(`unmapped_marker:${key}`);
  for (const key of result.missingMarkerKeys) failures.push(`labshop_missing:${key}`);
  for (const id of scenario.expectedLabshopProductIds || []) {
    if (!result.productIds.includes(id)) failures.push(`missing_expected_product:${id}`);
  }
  if (!result.previewPayload.products.length) failures.push('empty_preview_payload');
  return failures;
}

export function buildLabshopDemoScenarioResult(scenario) {
  const plan = buildLabPlanFromConversation(scenario.userPrompt, scenario.assistantText);
  const markers = plan?.markers || [];
  const draft = buildLabOrderDraftFromMarkers(markers, {
    country: 'CZ',
    userRequest: scenario.userPrompt,
  });
  const labshopComparison = (draft.providerComparisons || []).find(row => row.providerId === 'cz.labshop') || null;
  const selectedDraft = selectProviderForDraft(draft, 'cz.labshop');
  const markerKeys = markers.map(marker => marker.markerKey);
  const unmappedMarkerKeys = markerKeys.filter(key => key.startsWith('unmapped.'));
  const missingMarkerKeys = labshopComparison?.missingMarkerKeys || [];
  const productIds = (selectedDraft.products || []).map(product => String(product.providerProductId));
  const previewPayload = previewPayloadFromSelectedDraft(selectedDraft);
  const result = {
    id: scenario.id,
    title: scenario.title,
    planCreated: Boolean(plan),
    markerKeys,
    expectedMarkerKeys: [...(scenario.expectedMarkerKeys || [])],
    unmappedMarkerKeys,
    requestedCount: labshopComparison?.requestedCount || 0,
    coveredCount: labshopComparison?.coveredCount || 0,
    coveragePercent: labshopComparison?.coveragePercent || 0,
    missingMarkerKeys,
    productIds,
    expectedLabshopProductIds: [...(scenario.expectedLabshopProductIds || [])],
    previewPayload,
    totalEstimateCzk: selectedDraft.totalEstimateCzk,
  };
  const failures = scenarioFailureReasons(scenario, { ...result, plan });
  return {
    ...result,
    ok: failures.length === 0,
    failures,
  };
}

export function buildLabshopDemoGuaranteeReport(scenarios = LABSHOP_DEMO_SCENARIOS) {
  const results = scenarios.map(buildLabshopDemoScenarioResult);
  const failures = results.flatMap(result => result.failures.map(reason => ({ scenarioId: result.id, reason })));
  return {
    providerId: 'cz.labshop',
    scenarioCount: scenarios.length,
    ok: failures.length === 0,
    failures,
    scenarios: results,
  };
}
