import { describe, expect, it } from 'vitest';

import { buildLabPlanFromConversation, buildLabPlanFromThread } from '../js/lab-plan-intent.js';
import { buildLabOrderDraftFromMarkers } from '../js/lab-order-intent.js';

describe('natural lab plan intent', () => {
  it('builds a provider-agnostic lab plan from a natural next-test question and assistant context', () => {
    const plan = buildLabPlanFromConversation(
      'What should I get tested next time?',
      'Given our methylation discussion, I would check homocysteine, folate, B12 and active B12.'
    );

    expect(plan).toEqual(expect.objectContaining({
      status: 'suggested',
      source: 'conversation',
      nextAction: 'compare_labs',
    }));
    expect(plan.markers.map(m => m.markerKey)).toEqual(expect.arrayContaining([
      'coagulation.homocysteine',
      'vitamins.folate',
      'vitamins.vitaminB12',
      'vitamins.holotranscobalamin',
    ]));
    expect(plan.markers.every(m => m.reason && m.priority)).toBe(true);
  });

  it('recognizes "what would you test" as a natural lab-plan request', () => {
    const plan = buildLabPlanFromConversation(
      'What would you test for low energy, inflammation and bad sunlight response?',
      'I would check hs-CRP, vitamin D, ferritin, TSH, free T3, free T4, B12, folate and homocysteine.'
    );

    expect(plan).not.toBeNull();
    expect(plan.markers.map(m => m.markerKey)).toEqual(expect.arrayContaining([
      'inflammation.hsCRP',
      'vitamins.vitaminD',
      'iron.ferritin',
      'thyroid.tsh',
      'thyroid.freeT3',
      'thyroid.freeT4',
      'vitamins.vitaminB12',
      'vitamins.folate',
      'coagulation.homocysteine',
    ]));
  });

  it('resolves common lipid and biochemistry test names before provider comparison', () => {
    const plan = buildLabPlanFromConversation(
      'What should I order for metabolic risk and liver function?',
      'Order triglycerides, total cholesterol, ApoB, ApoA1, Lp(a), albumin and total bilirubin.'
    );

    expect(plan.markers.map(m => m.markerKey)).toEqual(expect.arrayContaining([
      'lipids.triglycerides',
      'lipids.cholesterol',
      'lipids.apoB',
      'lipids.apoAI',
      'lipids.lpa',
      'proteins.albumin',
      'liver.bilirubinTotal',
    ]));
    expect(plan.markers.map(m => m.markerKey).filter(k => k.startsWith('unmapped.'))).toEqual([]);
  });

  it('resolves thyroglobulin-antibody wording to a stable thyroid marker', () => {
    const plan = buildLabPlanFromConversation(
      'What blood tests would you recommend for a thyroid follow-up?',
      'Order TSH, Free T4, Free T3, TPO antibodies and Thyroglobulin antibodies / TgAb.'
    );

    const keys = plan.markers.map(m => m.markerKey);
    expect(keys).toEqual(expect.arrayContaining([
      'thyroid.tsh',
      'thyroid.freeT4',
      'thyroid.freeT3',
      'thyroid.tpoAb',
      'thyroid.tgAb',
    ]));
    expect(keys).not.toContain('unmapped.thyroglobulin_antibodies_tgab');
    expect(keys.filter(k => k.startsWith('unmapped.'))).toEqual([]);
  });

  it('does not spawn a plan when markers are mentioned without a user next-action request', () => {
    const plan = buildLabPlanFromConversation(
      'Tell me about B12 and sunlight.',
      'B12 and active B12 are interesting in photobiology.'
    );

    expect(plan).toBeNull();
  });

  it('hands a natural plan to the deterministic provider coverage matrix', () => {
    const plan = buildLabPlanFromConversation(
      'What labs should I check next?',
      'For methylation, check homocysteine, folate, B12 and active B12.'
    );
    const draft = buildLabOrderDraftFromMarkers(plan.markers, { userRequest: plan.userPrompt });

    expect(draft.status).toBe('provider_selection');
    expect(draft.providerComparisons.map(row => row.providerId)).toEqual(['cz.labshop', 'cz.unilabs']);
    expect(draft.providerComparisons[0]).toEqual(expect.objectContaining({
      providerId: 'cz.labshop',
      coveredCount: 4,
      requestedCount: 4,
    }));
    expect(draft.providerComparisons[1]).toEqual(expect.objectContaining({
      providerId: 'cz.unilabs',
      coveredCount: 4,
      requestedCount: 4,
    }));
  });

  it('captures broad panel recommendations from the assistant instead of only mapped B markers', () => {
    const plan = buildLabPlanFromConversation(
      'What should I get tested next time?',
      'I would consider a thyroid panel, tumor markers, bone metabolism, hormone panel, metabolic panel, inflammation panel, liver kidney function, iron studies, uric acid, homocysteine and vitamin D.'
    );

    const keys = plan.markers.map(m => m.markerKey);
    expect(keys).toEqual(expect.arrayContaining([
      'thyroid.tsh',
      'tumor.cea',
      'hormones.totalTestosterone',
      'biochemistry.glucose',
      'inflammation.hsCRP',
      'liver.alt',
      'kidney.creatinine',
      'iron.ferritin',
      'biochemistry.uricAcid',
      'vitamins.vitaminD',
      'coagulation.homocysteine',
    ]));
    expect(plan.markers.length).toBeGreaterThan(25);
  });

  it('preserves assistant-recommended candidates that are not yet in the app catalogue', () => {
    const plan = buildLabPlanFromConversation(
      'Based on this, what blood tests would you recommend next?',
      'Worth checking next: ceruloplasmin, RBC magnesium, omega-3 index, neurofilament light chain and mystery biomarker X.'
    );

    expect(plan.markers).toEqual(expect.arrayContaining([
      expect.objectContaining({ markerKey: 'proteins.ceruloplasmin', displayName: 'Ceruloplasmin', confidence: 'conversation_derived' }),
      expect.objectContaining({ markerKey: 'minerals.rbcMagnesium', displayName: 'RBC Magnesium', confidence: 'conversation_derived' }),
      expect.objectContaining({ markerKey: 'unmapped.omega_3_index', displayName: 'Omega-3 index', confidence: 'llm_recommended_unmapped' }),
      expect.objectContaining({ markerKey: 'unmapped.neurofilament_light_chain', displayName: 'Neurofilament light chain', confidence: 'llm_recommended_unmapped' }),
      expect.objectContaining({ markerKey: 'unmapped.mystery_biomarker_x', displayName: 'Mystery biomarker X', confidence: 'llm_recommended_unmapped' }),
    ]));
  });

  it('maps vitamin D/mineral demo recommendations to stable orderable markers before provider comparison', () => {
    const plan = buildLabPlanFromConversation(
      'Build a Labshop-ready vitamin D and mineral panel.',
      'Recommended tests: Vitamin D, PTH, Calcium, Magnesium RBC, Zinc (serum or RBC), Copper (serum), Phosphorus, Ceruloplasmin, Selenium (serum or plasma).'
    );

    expect(plan.markers.map(marker => marker.markerKey)).toEqual(expect.arrayContaining([
      'vitamins.vitaminD',
      'hormones.pth',
      'minerals.calcium',
      'minerals.rbcMagnesium',
      'electrolytes.zinc',
      'electrolytes.copper',
      'electrolytes.phosphorus',
      'proteins.ceruloplasmin',
      'electrolytes.selenium',
    ]));
    expect(plan.markers.map(marker => marker.markerKey)).not.toEqual(expect.arrayContaining([
      'unmapped.magnesium_rbc',
      'unmapped.zinc_serum_or_rbc',
      'unmapped.copper_serum',
      'unmapped.phosphorus',
      'unmapped.ceruloplasmin',
      'unmapped.selenium_serum_or_plasma',
    ]));
  });

  it('recognizes the real dogfood prompt as a plan request', () => {
    const plan = buildLabPlanFromConversation(
      'Based on my CMT2A and fatigue, what blood tests would you recommend next? Then create a lab order draft and compare Labshop vs Unilabs/Spadia coverage.',
      'Worth checking next: ceruloplasmin, RBC magnesium, omega-3 index, neurofilament light chain, GDF15, FGF21, lactate, pyruvate, CoQ10, copper, zinc, homocysteine, B12, folate, ferritin, hs-CRP, TSH, free T3, free T4, testosterone, SHBG, LH, FSH and vitamin D.'
    );

    expect(plan).not.toBeNull();
    expect(plan.markers.map(m => m.markerKey)).toEqual(expect.arrayContaining([
      'proteins.ceruloplasmin',
      'unmapped.neurofilament_light_chain',
      'coagulation.homocysteine',
      'vitamins.vitaminB12',
      'vitamins.folate',
      'iron.ferritin',
      'inflammation.hsCRP',
      'thyroid.tsh',
      'hormones.totalTestosterone',
      'hormones.shbg',
      'hormones.lh',
      'hormones.fsh',
      'vitamins.vitaminD',
    ]));
  });

  it('does not turn markdown section headings or medical disclaimers into unmapped tests', () => {
    const plan = buildLabPlanFromConversation(
      'Based on my CMT2A and fatigue, what blood tests would you recommend next? Then create a lab order draft and compare Labshop vs Unilabs coverage.',
      `**Important disclaimer:** I am not a doctor. Always consult your physician before ordering or interpreting any tests, especially with CMT2A.

### Recommended next tests
**Mitochondrial & fatigue markers:**
- Lactate, pyruvate, lactate/pyruvate ratio
- GDF15, FGF21

**Neuropathy / axonal damage:**
- Neurofilament light chain (NfL)

**Nutrient + methylation panel:**
- RBC magnesium, omega-3 index, homocysteine, active B12, MMA, folate, vitamin D, ceruloplasmin, copper, zinc, ferritin`
    );

    const keys = plan.markers.map(m => m.markerKey);
    const labels = plan.markers.map(m => m.displayName);
    expect(keys).toEqual(expect.arrayContaining([
      'metabolism.lactate',
      'unmapped.pyruvate',
      'unmapped.gdf15',
      'unmapped.fgf21',
      'unmapped.neurofilament_light_chain_nfl',
      'minerals.rbcMagnesium',
      'unmapped.omega_3_index',
      'coagulation.homocysteine',
      'vitamins.holotranscobalamin',
      'unmapped.mma',
      'vitamins.folate',
      'vitamins.vitaminD',
      'proteins.ceruloplasmin',
      'electrolytes.copper',
      'electrolytes.zinc',
      'iron.ferritin',
    ]));
    expect(labels).not.toContain('Mitochondrial & fatigue markers:**');
    expect(labels).not.toContain('Nutrient + methylation panel:**');
    expect(labels).not.toContain('Ing or interpreting any');
    expect(labels).not.toContain('Especially with CMT2A');
  });

  it('expands parenthesized panel recommendations to single markers without keeping panel labels as missing tests', () => {
    const plan = buildLabPlanFromThread([
      { role: 'user', content: 'What should I order next?' },
      { role: 'assistant', content: `- Total testosterone
- DHT
- SHBG
- Estradiol
- Free testosterone
- Fasting insulin
- IGF-1
- HOMA-IR
- Morning cortisol
- hs-CRP
- ESR
- Fibrinogen
- Vitamin D3
- HbA1c
- Homocysteine
- Cystatin C
- eGFR
- Urine protein/creatinine ratio
- Full thyroid panel (TSH, Free T4, Free T3)
- Liver enzymes (ALT, GGT, AST)
- PSA
- PSA
- Bone markers (osteocalcin, CTX or P1NP)` },
    ]);

    const keys = plan.markers.map(m => m.markerKey);
    const labels = plan.markers.map(m => m.displayName);
    expect(keys).toEqual(expect.arrayContaining([
      'hormones.freeTestosterone',
      'thyroid.tsh',
      'thyroid.freeT4',
      'thyroid.freeT3',
      'liver.alt',
      'liver.ggt',
      'liver.ast',
      'vitamins.vitaminD',
      'diabetes.hba1c',
    ]));
    expect(labels.filter(label => label === 'PSA')).toHaveLength(1);
    expect(labels).not.toContain('Full thyroid');
    expect(labels).not.toContain('Liver enzymes');
    expect(keys).not.toContain('vitamins.vitaminB12');
    expect(keys).not.toContain('vitamins.folate');
    expect(keys).not.toContain('thyroid.totalT4');
    expect(keys).not.toContain('thyroid.totalT3');
    expect(keys).not.toContain('thyroid.tpoAb');
    expect(keys).not.toContain('minerals.calcium');
    expect(keys).not.toContain('hormones.pth');
    expect(labels).not.toContain('Thyroid panel (TSH');
    expect(labels).not.toContain('Reverse T3)');
    expect(labels).not.toContain('Bone markers (osteocalcin');
    expect(labels).not.toContain('CTX or P1NP)');
  });

  it('builds a lab plan from the whole thread only when explicitly triggered by the UI action', () => {
    const plan = buildLabPlanFromThread([
      { role: 'user', content: 'I feel low energy and my sunlight response is bad.' },
      { role: 'assistant', content: 'I would check hs-CRP, vitamin D, ferritin, TSH, free T3, free T4, B12, folate and homocysteine.' },
      { role: 'user', content: 'Can you turn this into my next blood draw?' },
    ]);

    expect(plan).not.toBeNull();
    expect(plan.source).toBe('thread_action');
    expect(plan.nextAction).toBe('compare_labs');
    expect(plan.markers.map(m => m.markerKey)).toEqual(expect.arrayContaining([
      'inflammation.hsCRP',
      'vitamins.vitaminD',
      'iron.ferritin',
      'thyroid.tsh',
      'thyroid.freeT3',
      'thyroid.freeT4',
      'vitamins.vitaminB12',
      'vitamins.folate',
      'coagulation.homocysteine',
    ]));
  });
});
