// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { collectIngredients, collectPeriods, collectQualityTests } from '../js/supplement-form-ui.js';
import { state } from '../js/state.js';

function installQualityRow(resultText) {
  document.body.innerHTML = `
    <div id="supp-form-panel" data-edit-index="-1"></div>
    <div id="supp-quality-tests">
      <div class="supp-quality-row" data-import-index="0">
        <input class="supp-quality-category" value="contaminant">
        <input class="supp-quality-analyte" value="Lead">
        <input class="supp-quality-result">
        <input class="supp-quality-unit" value="mg">
        <input class="supp-quality-basis" value="per serving">
        <input type="checkbox" class="supp-quality-ai-context" checked>
      </div>
    </div>`;
  document.querySelector('.supp-quality-result').value = resultText;
}

function reviewedImport(resultText, comparator, status) {
  return {
    draft: {
      source: { reviewed: true },
      qualityTests: [{
        category: 'contaminant',
        analyte: 'Lead',
        canonicalAnalyte: 'lead',
        resultText,
        comparator,
        status,
        method: 'ICP-MS',
        provenance: { source: 'coa' },
      }],
    },
    issues: [],
  };
}

describe('supplement quality-result form collection', () => {
  beforeEach(() => {
    state.importedData = { supplements: [] };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it.each([
    ['< 0.01', '<', 'reported'],
    ['pass', '', 'pass'],
  ])('clears stale semantics when an imported %s result is edited to a number', (sourceText, comparator, status) => {
    installQualityRow('0.02');

    const [collected] = collectQualityTests(reviewedImport(sourceText, comparator, status));

    expect(collected).toMatchObject({
      resultText: '0.02',
      comparator: '',
      status: 'reported',
      value: 0.02,
      method: 'ICP-MS',
      canonicalAnalyte: 'lead',
      provenance: { source: 'coa' },
    });
  });

  it('retains source semantics and provenance when the result is unchanged', () => {
    installQualityRow('< 0.01');

    const [collected] = collectQualityTests(reviewedImport('< 0.01', '<', 'pass'));

    expect(collected).toMatchObject({
      resultText: '< 0.01',
      comparator: '<',
      status: 'pass',
      method: 'ICP-MS',
      provenance: { source: 'coa' },
    });
  });
});


it('retains the ingredient identity when a confirmed historical amount is corrected manually', () => {
  state.importedData = { supplements: [{ name: 'TMG', periods: [{ start: '2026-01-01', end: null,
    dose: { value: 500, unit: 'mg', basis: 'day', ingredient: 'TMG', source: 'ingredient' },
  }] }] };
  document.body.innerHTML = `<div id="supp-form-panel" data-edit-index="0"></div><div id="supp-periods">
    <div class="supp-period-row" data-original-index="0"><input class="supp-period-start" value="2026-01-01">
    <input class="supp-period-end" value=""><input class="supp-period-dose" value="250 mg/day"></div></div>`;
  expect(collectPeriods()[0].dose).toEqual({ text: '250 mg/day', ingredient: 'TMG' });
  document.body.innerHTML = '';
});


it('clearing an ingredient frequency override restores the regimen frequency', () => {
  state.importedData = { supplements: [{ ingredients: [{ name: 'TMG', amount: '500 mg', timesPerDay: 2 }] }] };
  document.body.innerHTML = `<div id="supp-form-panel" data-edit-index="0"></div><div id="supp-ingredients"><div class="supp-ingredient-row" data-original-index="0"><input class="supp-ing-name" value="TMG"><input class="supp-ing-amount" value="500"><input class="supp-ing-unit" value="mg"><input class="supp-ing-times" value=""></div></div>`;
  expect(collectIngredients()[0].timesPerDay).toBeUndefined();
  document.body.innerHTML = '';
});
