// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { projectNutritionMealDetail } from '../js/nutrition-meal-detail-model.js';
import { renderMealDetail } from '../js/nutrition-render.js';
import type { NutritionRenderMeal } from '../js/nutrition-render.js';
const meal: NutritionRenderMeal = { id: 'detail-meal', name: 'Lunch', eatenAt: '2026-10-08T12:00:00Z', mealType: 'lunch',
  nutrients: { energyKcal: 620, proteinG: 0, carbohydrateG: 72, fatG: 28, fiberG: null, ironMg: '2.5' },
  components: [{ name: 'Rice', quantityG: 150 }, { name: 'Unknown amount', quantityG: null }],
  source: { kind: 'ai-label-scan', modelDisplay: 'Vision model', provider: 'local', usage: { inputTokens: 100, outputTokens: 50 },
    review: { editedPortions: 2, editedNutrients: ['proteinG'], editedComponentIdentities: ['rice'] },
    label: { servingSizeText: '150 g', servingsPerContainer: 2, consumedAmount: 1, consumedUnit: 'serving' },
    correction: { userProvidedMealName: 'Lunch' } },
  confidence: 0, assumptions: ['Reviewed serving'], warnings: ['Check label'], note: 'Keep this note',
  images: [{ dataUrl: 'data:image/png;base64,a', thumbnailUrl: 'data:image/png;base64,b' }], responseCheckIn: { satiety2h: 3 } };
it('preserves zero versus unknown nutrients, provenance, photos, review evidence and return actions without mutating the meal', () => {
  const before = structuredClone(meal), view = projectNutritionMealDetail(meal, { returnTo: 'editor' });
  expect(view.overview).toContainEqual({ label: 'Protein', unit: 'g', value: '0' }); expect(view.nutrients.some(item => item.label === 'Fiber')).toBe(false);
  expect(view.nutrients).toContainEqual({ label: 'Iron', unit: 'mg', value: '2.5' }); expect(view.components[1]?.quantity).toBe('—');
  expect(view.metadata).toEqual(['Lunch','Vision model label scan via local','Uncalibrated identity self-check','Identification corrected']);
  expect(view.usage).toContain('150 tokens (100 in · 50 out)'); expect(view.review).toBe('1 ingredient identity corrected · 2 portions adjusted · 1 nutrient value adjusted');
  expect(view.evidence[0]).toContain('Serving size: 150 g'); expect(view.images).toEqual(['data:image/png;base64,a']); expect(view.response).toEqual({ satiety2h: 3, energy2h: null });
  const root=document.createElement('div');root.innerHTML=renderMealDetail(meal,{returnTo:'editor'});
  expect(root.querySelector('[data-nutrition-action="back"]')?.getAttribute('data-nutrition-origin')).toBe('editor');
  expect(root.querySelector('[data-nutrition-action="back"]')?.textContent).toContain('Meal entry');
  expect(root.querySelectorAll('[data-nutrition-action="edit"], [data-nutrition-action="reuse"], [data-nutrition-action="delete"]')).toHaveLength(3);
  expect(root.querySelector('input[name="nutrition-response-satiety"][value="3"]')?.hasAttribute('checked')).toBe(true);expect(meal).toEqual(before);
});
it('keeps missing composition unknown and omits check-ins when fuel composition is unavailable', () => {
  const sparse={id:'sparse',name:'Unknown',eatenAt:'invalid',nutrients:{proteinG:20},source:{kind:'ai-photo-estimate',model:'Unreported model'}};
  const view=projectNutritionMealDetail(sparse);expect(view.date).toBe('');expect(view.fuel).toBeNull();expect(view.usage).toContain('token usage was not reported');
  const root=document.createElement('div');root.innerHTML=renderMealDetail(sparse);expect(root.querySelector('.nutrition-response-card')).toBeNull();
  expect(projectNutritionMealDetail({id:'none',nutrients:{}}).nutrients).toEqual([]);
});
it('preserves barcode, reused-meal and historical food-composition provenance', () => {
  const barcode=projectNutritionMealDetail({...meal,source:{kind:'barcode-database',foodData:{sourceName:'Community foods',barcode:'123',schemaVersion:2,cacheHit:true},foodComposition:{dataset:'legacy',matchedComponents:1,totalComponents:2}}});
  expect(barcode.metadata).toContain('Community foods · barcode 123');expect(barcode.evidence.join(' ')).toContain('Loaded from encrypted local cache');expect(barcode.evidence.join(' ')).toContain('1/2 ingredients matched');
  expect(barcode.evidence.join(' ')).toContain('Unmatched nutrients remain unknown');
  expect(projectNutritionMealDetail({...meal,source:{kind:'reused-meal',originalSource:{kind:'ai-label-scan'}}}).metadata).toContain('Logged again from a reviewed meal · originally label scan');
});
it('renders stored names, notes and assumptions as text, with stable identifiers rather than injected markup', () => {
  const hostile={...meal,name:'<script>attack()</script>',note:'<img src=x onerror=attack()>',assumptions:['<button data-nutrition-action="delete">Bad</button>']};
  const root=document.createElement('div');root.innerHTML=renderMealDetail(hostile);
  expect(root.querySelector('script')).toBeNull();expect(root.querySelectorAll('[data-nutrition-action="delete"]')).toHaveLength(1);
  expect(root.querySelectorAll('img')).toHaveLength(1);expect(root.textContent).toContain(hostile.note);expect(root.textContent).toContain(hostile.name);
});
