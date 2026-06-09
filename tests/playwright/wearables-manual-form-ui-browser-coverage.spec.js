import { expect, test } from './coverage-fixture.js';

const moduleUrl = path => `${path}?wearablesManualFormUiCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/wearables-manual-form-ui-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.goto('/wearables-manual-form-ui-coverage', { waitUntil: 'load' });
}

test('wearables manual form ui browser coverage handles chips notes and input values', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ formUiUrl }) => {
    const formUi = await import(formUiUrl);
    const fixture = document.getElementById('fixture');
    const outcomes = {};

    try {
      const bpChips = formUi._renderTagChips('bp_systolic');
      const rhrChips = formUi._renderTagChips('rhr');
      outcomes.knownMetricTagChipsRenderExpectedButtons =
        bpChips.includes('role="group"')
        && bpChips.includes('data-tag="resting"')
        && bpChips.includes('data-tag="morning-fasted"')
        && bpChips.includes('data-tag="post-workout"')
        && bpChips.includes('data-tag="stress"')
        && rhrChips.includes('data-tag="post-workout"')
        && !rhrChips.includes('data-tag="stress"');
      outcomes.unknownMetricTagChipsRenderEmpty =
        formUi._renderTagChips('unknown_metric') === '';

      const noteHtml = formUi._renderNoteField('coverage-note');
      outcomes.noteFieldRendersEscapedIdAndAccessibleLabel =
        noteHtml.includes('id="coverage-note"')
        && noteHtml.includes('class="wearable-log-note"')
        && noteHtml.includes('aria-label="Optional note"');

      fixture.innerHTML = `
        <section id="card">
          ${bpChips}
          ${noteHtml}
          <input id="coverage-input" value="typed value">
          <textarea id="coverage-textarea">written value</textarea>
          <div id="coverage-div">ignored</div>
        </section>
      `;

      const card = document.getElementById('card');
      const [firstChip, secondChip] = card.querySelectorAll('.wearable-log-chip');
      let stopped = 0;
      formUi.toggleManualLogChip(firstChip, { stopPropagation: () => { stopped += 1; } });
      formUi.toggleManualLogChip(secondChip);
      formUi.toggleManualLogChip(secondChip);
      outcomes.toggleManualLogChipStopsEventAndTogglesClass =
        stopped === 1
        && firstChip.classList.contains('active')
        && !secondChip.classList.contains('active');

      outcomes.collectActiveChipsReturnsDatasetTags =
        JSON.stringify(formUi._collectActiveChips(card)) === JSON.stringify(['resting']);

      const input = document.getElementById('coverage-input');
      const textarea = document.getElementById('coverage-textarea');
      const div = document.getElementById('coverage-div');
      outcomes.inputValueFromElementHandlesInputTextareaAndFallback =
        formUi.inputValueFromElement(input) === 'typed value'
        && formUi.inputValueFromElement(textarea) === 'written value'
        && formUi.inputValueFromElement(div) === '';
      outcomes.inputValueByIdReadsExistingElementsAndMissingFallback =
        formUi.inputValueById('coverage-input') === 'typed value'
        && formUi.inputValueById('coverage-textarea') === 'written value'
        && formUi.inputValueById('missing-input') === '';

      outcomes.allOutcomesReached = true;
      return outcomes;
    } finally {
      fixture.textContent = '';
    }
  }, {
    formUiUrl: moduleUrl('/js/wearables-manual-form-ui.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
