import { describe, expect, it } from 'vitest';

import { buildLabPlanFromConversation } from '../js/lab-plan-intent.js';
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
    expect(draft.providerComparisons.map(row => row.providerId)).toEqual(['cz.unilabs', 'cz.labshop']);
    expect(draft.providerComparisons[0]).toEqual(expect.objectContaining({
      providerId: 'cz.unilabs',
      coveredCount: 4,
      requestedCount: 4,
    }));
    expect(draft.providerComparisons[1]).toEqual(expect.objectContaining({
      providerId: 'cz.labshop',
      coveredCount: 2,
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
});
