// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { collectQualityTests } from '../js/supplement-form-ui.js';
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
