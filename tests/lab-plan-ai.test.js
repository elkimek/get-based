import { describe, expect, it } from 'vitest';

import { LAB_PLAN_AI_SYSTEM_PROMPT, aiPlanResponseToDraft, applyClosedMarkerList, applyVagueConcernGuardrails, buildLabPlanAIUserPrompt, closedMarkerKeysFromHistory } from '../js/lab-plan-ai.js';

describe('AI-powered lab plan conversion', () => {
  it('asks the model for a reasoned, prioritized plan instead of a keyword scrape', () => {
    const prompt = buildLabPlanAIUserPrompt([
      { role: 'user', content: 'Low energy, inflammation, bad sunlight response.' },
      { role: 'assistant', content: 'Could be thyroid, iron, vitamin D, inflammation, methylation.' },
    ], 'PROFILE CONTEXT');

    expect(LAB_PLAN_AI_SYSTEM_PROMPT).toContain('Return ONLY JSON');
    expect(LAB_PLAN_AI_SYSTEM_PROMPT).toContain('why each test belongs');
    expect(LAB_PLAN_AI_SYSTEM_PROMPT).toContain('If you include fasting insulin');
    expect(LAB_PLAN_AI_SYSTEM_PROMPT).toContain('Male hormone / testosterone context');
    expect(LAB_PLAN_AI_SYSTEM_PROMPT).toContain('Metabolic / glycemic context');
    expect(LAB_PLAN_AI_SYSTEM_PROMPT).toContain('treat that list as CLOSED');
    expect(prompt).toContain('PROFILE CONTEXT');
    expect(prompt).toContain('Low energy');
    expect(prompt).toContain('recent health/lab-relevant');
    expect(prompt).toContain('background only');
    expect(prompt).toContain('latest health/lab-related user request');
  });

  it('normalizes model JSON into a provider-agnostic lab plan with model reasons preserved', () => {
    const plan = aiPlanResponseToDraft(`Here is the JSON:\n{
      "title": "Fatigue + sunlight response panel",
      "rationale": "Focus on inflammation, iron status, thyroid output, D status, and methylation bottlenecks.",
      "tests": [
        { "name": "hs-CRP", "reason": "Checks whether low energy is paired with systemic inflammation.", "priority": "core" },
        { "name": "Vitamin D", "reason": "Useful as a sunlight-exposure/status proxy in this context.", "priority": "core" },
        { "name": "Ferritin", "reason": "Screens iron storage as a common fatigue contributor.", "priority": "core" },
        { "name": "TSH", "reason": "Screens thyroid signaling before expanding deeper.", "priority": "core" },
        { "name": "RBC magnesium", "reason": "Candidate mineral status marker; provider mapping may be missing.", "priority": "optional" }
      ]
    }`);

    expect(plan).toEqual(expect.objectContaining({
      source: 'ai_thread_action',
      title: 'Fatigue + sunlight response panel',
      rationale: expect.stringContaining('inflammation'),
      nextAction: 'compare_labs',
    }));
    expect(plan.markers.map(m => m.markerKey)).toEqual([
      'inflammation.hsCRP',
      'vitamins.vitaminD',
      'iron.ferritin',
      'thyroid.tsh',
      'minerals.rbcMagnesium',
    ]);
    expect(plan.markers.find(m => m.markerKey === 'inflammation.hsCRP').reason)
      .toBe('Checks whether low energy is paired with systemic inflammation.');
    expect(plan.markers.find(m => m.markerKey === 'minerals.rbcMagnesium').priority)
      .toBe('optional');
  });

  it('dedupes Czech thyroid-panel aliases before provider comparison', () => {
    const plan = aiPlanResponseToDraft(JSON.stringify({
      title: 'Thyroid panel',
      rationale: 'Check thyroid signaling, hormone output, and autoimmune thyroid antibodies.',
      tests: [
        { name: 'TSH', reason: 'Pituitary thyroid signal.', priority: 'core' },
        { name: 'free T4', reason: 'Thyroid hormone output.', priority: 'core' },
        { name: 'free T3', reason: 'Active thyroid hormone context.', priority: 'core' },
        { name: 'TPO antibodies', reason: 'Autoimmune thyroid screen.', priority: 'core' },
        { name: 'TPOAb', reason: 'Same anti-TPO antibody, duplicate wording from the model.', priority: 'core' },
      ],
    }));

    expect(plan.markers.map(m => m.markerKey)).toEqual([
      'thyroid.tsh',
      'thyroid.freeT4',
      'thyroid.freeT3',
      'thyroid.tpoAb',
    ]);
  });

  it('preserves markers when the AI uses a panel-level test name', () => {
    const plan = aiPlanResponseToDraft(JSON.stringify({
      title: 'Thyroid panel',
      rationale: 'The model grouped the intended thyroid markers under one panel name.',
      tests: [
        { name: 'Thyroid panel', reason: 'TSH plus free thyroid hormone context.', priority: 'core' },
      ],
    }));

    expect(plan.markers.map(m => m.markerKey)).toEqual([
      'thyroid.tsh',
      'thyroid.freeT4',
      'thyroid.freeT3',
    ]);
    expect(plan.markers.every(m => m.reason === 'TSH plus free thyroid hormone context.')).toBe(true);
  });

  it('normalizes total T4 and total T3 as stable thyroid markers rather than unmapped tests', () => {
    const plan = aiPlanResponseToDraft(JSON.stringify({
      title: 'Thyroid retest',
      rationale: 'Retest full thyroid status.',
      tests: [
        { name: 'Total T4', reason: 'Completes T4 assessment.', priority: 'optional' },
        { name: 'Total T3', reason: 'Completes T3 assessment.', priority: 'optional' },
        { name: 'Reverse T3', reason: 'Conversion context if clinically useful.', priority: 'optional' },
      ],
    }));

    expect(plan.markers.map(m => m.markerKey)).toEqual([
      'thyroid.totalT4',
      'thyroid.totalT3',
      'unmapped.reverse_t3',
    ]);
    expect(plan.markers.find(m => m.markerKey === 'thyroid.totalT4').reason).toBe('Completes T4 assessment.');
  });

  it('normalizes the testosterone/metabolic/liver retest plan without duplicates or unmapped obvious markers', () => {
    const plan = aiPlanResponseToDraft(JSON.stringify({
      title: 'Metabolic hormone retest',
      rationale: 'Retest hormone, insulin resistance, D status, liver enzymes, inflammation, uric acid, and kidney filtration context.',
      tests: [
        { name: 'Testosterone Total', reason: 'Declining androgen trend.', priority: 'core' },
        { name: 'shbg', reason: 'Needed for testosterone interpretation.', priority: 'core' },
        { name: 'Fasting Insulin', reason: 'HOMA-IR context.', priority: 'core' },
        { name: 'Glucose (for HOMA-IR)', reason: 'HOMA-IR denominator.', priority: 'core' },
        { name: 'Vitamin D', reason: 'D status.', priority: 'core' },
        { name: 'Vitamin D Total (25-OH)', reason: 'Duplicate model wording for vitamin D.', priority: 'core' },
        { name: 'ALT', reason: 'Liver enzyme.', priority: 'core' },
        { name: 'AST', reason: 'Liver enzyme.', priority: 'core' },
        { name: 'GGT', reason: 'Bile/liver marker.', priority: 'core' },
        { name: 'ALP', reason: 'Liver/bone enzyme.', priority: 'core' },
        { name: 'C-peptide', reason: 'Insulin secretion context.', priority: 'core' },
        { name: 'ESR', reason: 'Inflammation marker.', priority: 'core' },
        { name: 'BUN', reason: 'Kidney/protein metabolism context.', priority: 'core' },
        { name: 'CBC with differential', reason: 'Hematology context.', priority: 'core' },
        { name: 'Reticulocytes', reason: 'Red-cell production context.', priority: 'core' },
        { name: 'hsCRP', reason: 'Inflammation marker.', priority: 'core' },
        { name: 'Uric acid', reason: 'Purine metabolism.', priority: 'core' },
        { name: 'Cystatin C', reason: 'Kidney filtration context.', priority: 'optional' },
        { name: 'EGFR', reason: 'Filtration estimate.', priority: 'optional' },
      ],
    }));

    expect(plan.markers.map(m => m.markerKey)).toEqual([
      'hormones.totalTestosterone',
      'hormones.shbg',
      'metabolism.insulin',
      'biochemistry.glucose',
      'metabolism.homaIR',
      'vitamins.vitaminD',
      'liver.alt',
      'liver.ast',
      'liver.ggt',
      'liver.alp',
      'metabolism.cPeptide',
      'inflammation.esr',
      'kidney.urea',
      'hematology.cbcDiff',
      'hematology.reticulocytes',
      'inflammation.hsCRP',
      'biochemistry.uricAcid',
      'biochemistry.cystatinC',
      'kidney.egfr',
    ]);
    expect(plan.markers.map(m => m.markerKey).filter(key => key === 'vitamins.vitaminD')).toHaveLength(1);
    expect(plan.markers.some(m => m.markerKey.startsWith('unmapped.'))).toBe(false);
    expect(plan.markers.find(m => m.markerKey === 'hormones.shbg').displayName).toBe('SHBG');
  });

  it('normalizes broad preventive lipid/prostate wording and dedupes total PSA', () => {
    const plan = aiPlanResponseToDraft(JSON.stringify({
      title: 'Broad preventive panel',
      rationale: 'Energy, hormones, inflammation, glucose, lipids, vitamin D, kidney/liver, and prostate screening.',
      tests: [
        { name: 'LDL', reason: 'Atherogenic lipid context.', priority: 'core' },
        { name: 'HDL', reason: 'Metabolic lipid context.', priority: 'core' },
        { name: 'ApoA1', reason: 'Apolipoprotein A-I context.', priority: 'core' },
        { name: 'PSA', reason: 'Prostate screening.', priority: 'core' },
        { name: 'PSA (Total)', reason: 'Duplicate wording for total PSA.', priority: 'core' },
        { name: 'Fructosamine', reason: 'Shorter-term glycemic context.', priority: 'optional' },
      ],
    }));

    expect(plan.markers.map(m => m.markerKey)).toEqual([
      'lipids.ldl',
      'lipids.hdl',
      'lipids.apoAI',
      'prostate.psa',
      'metabolism.fructosamine',
    ]);
    expect(plan.markers.map(m => m.markerKey).filter(key => key === 'prostate.psa')).toHaveLength(1);
    expect(plan.markers.some(m => m.markerKey.startsWith('unmapped.'))).toBe(false);
  });

  it('applies explicit closed-list filtering so AI cannot add total cholesterol to an ApoA1 request', () => {
    const history = [
      { role: 'user', content: 'I want triglycerides, ApoB, ApoA1, bilirubin, albumin, creatinine, urea, uric acid, LDL, HDL, PSA, and fructosamine. Can Labshop cover these?' },
      { role: 'assistant', content: 'Build a Labshop-ready plan.' },
    ];
    const closedKeys = closedMarkerKeysFromHistory(history);
    expect(closedKeys).toEqual([
      'lipids.triglycerides',
      'lipids.apoB',
      'lipids.apoAI',
      'liver.bilirubinTotal',
      'proteins.albumin',
      'biochemistry.creatinine',
      'kidney.urea',
      'biochemistry.uricAcid',
      'lipids.ldl',
      'lipids.hdl',
      'prostate.psa',
      'metabolism.fructosamine',
    ]);

    const aiPlan = aiPlanResponseToDraft(JSON.stringify({
      title: 'Bad model expansion',
      tests: [
        { name: 'Triglycerides' },
        { name: 'ApoB' },
        { name: 'ApoA1' },
        { name: 'LDL' },
        { name: 'Total cholesterol' },
        { name: 'HDL' },
        { name: 'PSA' },
        { name: 'Fructosamine' },
      ],
    }));
    const filtered = applyClosedMarkerList(aiPlan, closedKeys);
    expect(filtered.markers.map(m => m.markerKey)).toEqual(closedKeys);
    expect(filtered.markers.map(m => m.markerKey)).not.toContain('lipids.cholesterol');
  });

  it('does not treat historical lab mentions as a closed order list', () => {
    const history = [
      { role: 'user', content: 'Last month I had triglycerides, ApoB, ApoA1, bilirubin, albumin, creatinine, urea, uric acid, LDL, HDL, PSA, and fructosamine tested already.' },
      { role: 'user', content: 'What would you check next for fatigue?' },
    ];

    expect(closedMarkerKeysFromHistory(history)).toEqual([]);
  });

  it('adds deterministic companions for vague thyroid blood sugar inflammation vitamin D and low-testosterone concern', () => {
    const history = [
      { role: 'user', content: 'My energy is weird, I’m worried about thyroid, blood sugar, inflammation, vitamin D, and low testosterone. What would you check in one blood draw?' },
      { role: 'user', content: 'Build a Labshop-ready plan from this conversation.' },
    ];
    const aiPlan = aiPlanResponseToDraft(JSON.stringify({
      title: 'Under-expanded vague plan',
      tests: [
        { name: 'TSH' },
        { name: 'Free T4' },
        { name: 'Free T3' },
        { name: 'Glucose' },
        { name: 'Fasting insulin' },
        { name: 'HbA1c' },
        { name: 'hs-CRP' },
        { name: 'Vitamin D' },
        { name: 'Total testosterone' },
        { name: 'Free testosterone' },
        { name: 'SHBG' },
        { name: 'DHEA-S' },
      ],
    }));
    const guarded = applyVagueConcernGuardrails(aiPlan, history);
    expect(guarded.markers.map(m => m.markerKey)).toEqual([
      'thyroid.tsh',
      'thyroid.freeT4',
      'thyroid.freeT3',
      'biochemistry.glucose',
      'metabolism.insulin',
      'diabetes.hba1c',
      'inflammation.hsCRP',
      'vitamins.vitaminD',
      'hormones.totalTestosterone',
      'hormones.freeTestosterone',
      'hormones.shbg',
      'hormones.dheaS',
      'metabolism.homaIR',
      'hormones.lh',
      'hormones.fsh',
      'hormones.estradiol',
      'hormones.prolactin',
    ]);
  });

  it('returns null for model output that does not contain any usable tests', () => {
    expect(aiPlanResponseToDraft('{"title":"No plan","tests":[]}')).toBeNull();
    expect(aiPlanResponseToDraft('not json and no tests')).toBeNull();
  });
});
