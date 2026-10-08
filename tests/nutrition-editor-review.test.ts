// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { renderHTML } from '../js/components/NutritionPresentation.svelte.html.js';
import { projectNutritionEditor } from '../js/nutrition-editor-model.js';
import { projectEditableIngredients, projectReviewChecks, projectReviewEvidence } from '../js/nutrition-editor-review-model.js';
import { NUTRIENT_DEFINITIONS } from '../js/nutrition-nutrient-registry.js';
import { setStatus } from '../js/nutrition-review-ui.js';
const root = (html: string) => { const element = document.createElement('div'); element.innerHTML = html; return element; };
afterEach(() => document.body.replaceChildren());
it('offers every canonical nutrient once with its numeric constraints and stable review-source marker', () => {
  const editor = root(renderHTML({ kind: 'editor', view: projectNutritionEditor({}, '2026-10-08T12:30', false, false, { purpose: 'Photo model', accessibleLabel: 'Meal photo analysis model', selectedValue: '', automatic: true, available: false, automaticLabel: 'Unavailable', savedChoice: '', options: [], provider: 'Local AI', price: 'Local', status: 'Unavailable' }) }));
  expect(editor.querySelectorAll('[data-nutrition-nutrient]')).toHaveLength(NUTRIENT_DEFINITIONS.length);
  for (const definition of NUTRIENT_DEFINITIONS) {
    const fields = editor.querySelectorAll<HTMLInputElement>(`[data-nutrition-nutrient="${definition.key}"]`);
    expect(fields).toHaveLength(1); const field = fields[0]!;
    expect(field.id).toBe(`nutrition-${definition.key}`); expect(field.type).toBe('number'); expect(field.min).toBe('0'); expect(field.step).toBe(definition.step); expect(field.value).toBe('');
    expect(editor.querySelector(`#nutrition-${definition.key}-source`)?.hasAttribute('hidden')).toBe(true);
  }
  expect(editor.querySelectorAll('[role="tab"]')).toHaveLength(3); expect(editor.querySelectorAll('[data-nutrition-action="open-history"]')).toHaveLength(1);
});
it('keeps ingredient identity and historical provenance literal while preserving zero versus missing portions', () => {
  const components = [{ name: '<img src=x onerror=attack()>', quantityG: 0, confidence: 0, foodData: { fdcId: 1, description: '<script>attack()</script>', dataset: 'Historical & reviewed' } }, { name: 'Unknown amount', quantityG: null }];
  const before = structuredClone(components), editor = root(renderHTML({ kind: 'editable-ingredients', rows: projectEditableIngredients(components) }));
  expect(editor.querySelector('img,script,[onerror]')).toBeNull(); expect(editor.textContent).toContain('<script>attack()</script>');
  expect(editor.querySelector<HTMLInputElement>('[data-nutrition-component-name="0"]')?.value).toBe(components[0]!.name);
  expect(editor.querySelector<HTMLInputElement>('[data-nutrition-component-grams="0"]')?.value).toBe('0'); expect(editor.querySelector<HTMLInputElement>('[data-nutrition-component-grams="1"]')?.value).toBe('');
  expect(editor.querySelector('[data-nutrition-action="remove-component"][data-nutrition-index="0"]')?.getAttribute('aria-label')).toBe(`Remove ${components[0]!.name}`);
  expect(editor.querySelector('.is-readonly select')).toBeNull(); expect(components).toEqual(before);
});
it('combines and deduplicates review warnings without turning provider text into controls', () => {
  const result = { analysis: { warnings: ['Review <button>unknown</button>', 'Blur'], assumptions: ['Cooked', 'Cooked'], components: [{ quantityG: 0, nutrientsPer100g: { proteinG: 0 } }] }, images: [{ qualityWarnings: ['Blur', 'Label hidden'] }], source: { kind: 'ai-photo-estimate', modelDisplay: 'Model <literal>', aiNutritionEstimate: { nutrientKeys: ['proteinG'] } } };
  const checks = projectReviewChecks(result); expect(checks.assumptions).toEqual(['Cooked']); expect(checks.warnings).toEqual(['Review <button>unknown</button>', 'Blur', 'Label hidden']);
  const markup = root(renderHTML({ kind: 'editor-feedback', view: checks })); expect(markup.querySelector('button')).toBeNull(); expect(markup.textContent).toContain('Review <button>unknown</button>');
  const evidence = projectReviewEvidence(result, null); expect(evidence.parts).toContain('1/1 portions quantified'); expect(evidence.parts).toContain('1/1 linked to component nutrients'); expect(evidence.usage).toBe('Model <literal> · provider did not report token usage');
});
it('changes status tone without dropping authored style classes or retaining an obsolete tone', () => {
  document.body.innerHTML = '<div id="nutrition-analysis-status" class="nutrition-analysis-status gb:nutrition:text-secondary gb:nutrition:[&.is-error]:text-danger-ink"></div>';
  const status = document.getElementById('nutrition-analysis-status')!;
  setStatus('<literal> failure', 'error'); expect(status.textContent).toBe('<literal> failure'); expect(status.classList.contains('gb:nutrition:[&.is-error]:text-danger-ink')).toBe(true);
  setStatus('Saved', 'success'); expect(status.classList.contains('is-error')).toBe(false); expect(status.classList.contains('is-success')).toBe(true); expect(status.classList.contains('gb:nutrition:text-secondary')).toBe(true);
  setStatus('Ready'); expect(status.classList.contains('is-success')).toBe(false);
});
