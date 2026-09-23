// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { renderNutritionComparisonResults, toggleComparisonPresentation, exitComparisonPresentation } from '../js/nutrition-comparison-results.js';
beforeEach(() => {
  document.body.className = '';
  document.body.innerHTML = '<div id="detail-modal"><div id="nutrition-model-comparison"><div id="nutrition-comparison-results"></div></div><button data-nutrition-action="toggle-comparison-presentation"><span data-nutrition-presentation-label></span></button></div>';
  document.getElementById('nutrition-model-comparison').scrollTo = vi.fn();
});
const run = {route:{provider:'fixture',model:'m'},providerLabel:'Fixture',modelLabel:'Model',status:'complete',result:{analysis:{mealName:'Lunch',components:[],nutrients:{energyKcal:300}}}};
function render(runs, extra = {}) { renderNutritionComparisonResults({runs,reference:{},referenceRun:null,referenceRunIndex:null,isRestored:false,...extra}); return document.getElementById('nutrition-comparison-results'); }
it('labels unreferenced estimates unranked and unavailable usage unknown', () => {
  const area = render([run]);
  expect(area.textContent).toContain('Not ranked');
  expect(area.textContent).toContain('Cost unknown');
  expect(area.textContent).toContain('do not assume the request was free');
});
it('keeps failed requests visibly potentially billable', () => {
  const area = render([{...run,result:null,status:'error',error:'Provider timeout'}]);
  expect(area.textContent).toContain('This request may still be billable');
  expect(area.querySelector('[data-nutrition-action="retry-comparison"]')).not.toBeNull();
});
it('requires a fresh photo to retry restored failures', () => {
  const area = render([{...run,result:null,status:'error'}],{isRestored:true});
  expect(area.textContent).toContain('Choose a photo');
  expect(area.querySelector('[data-nutrition-action="retry-comparison"]')).toBeNull();
});
it('does not render provider errors or model labels as HTML', () => {
  const area = render([{...run,modelLabel:'<img src=x onerror=alert(1)>',result:null,status:'error',error:'<script>alert(1)</script>'}]);
  expect(area.querySelector('img,script')).toBeNull();
  expect(area.textContent).toContain('<script>alert(1)</script>');
});
it('distinguishes a model baseline from ground truth', () => {
  const area = render([run],{referenceRun:run,referenceRunIndex:0,reference:{energyKcal:300}});
  expect(area.textContent).toContain('A model baseline is not ground truth');
  expect(area.textContent).toContain('Baseline');
});
it('exposes cancellation only while the corresponding model is running', () => {
  const area = render([{...run,result:null,status:'running'}]);
  expect(area.querySelector('[data-nutrition-action="cancel-comparison-run"]')).not.toBeNull();
  render([{...run,result:null,status:'cancelled'}]);
  expect(area.querySelector('[data-nutrition-action="cancel-comparison-run"]')).toBeNull();
  expect(area.textContent).toContain('Canceled');
});
it('toggles presentation accessibly and clears all presentation classes on exit', () => {
  expect(toggleComparisonPresentation()).toBe(true);
  const button = document.querySelector('button');
  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(document.body.classList.contains('nutrition-comparison-presenting')).toBe(true);
  expect(exitComparisonPresentation()).toBe(true);
  expect(button.getAttribute('aria-pressed')).toBe('false');
  expect(document.querySelector('.is-presentation,.nutrition-comparison-presentation,.nutrition-comparison-presenting')).toBeNull();
  expect(exitComparisonPresentation()).toBe(false);
});
it('refuses presentation when the comparison workspace is hidden', () => {
  document.getElementById('nutrition-model-comparison').hidden = true;
  expect(toggleComparisonPresentation()).toBe(false);
  expect(document.body.className).toBe('');
});
it('cleans presentation after the workspace is removed', () => {
  toggleComparisonPresentation();
  document.getElementById('nutrition-model-comparison').remove();
  expect(exitComparisonPresentation()).toBe(true);
  expect(document.body.className).toBe('');
});
