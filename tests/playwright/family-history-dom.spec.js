import { expect, test } from '@playwright/test';

test('family history DOM handlers round-trip and mutate entries', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const cards = await import('/js/context-cards.js');
    const { state } = await import('/js/state.js');
    const outcomes = {};

    const probe = document.createElement('div');
    probe.innerHTML = '<input id="probe-cond-input"><div id="probe-target"></div>';
    document.body.appendChild(probe);
    try {
      const condition = "Alzheimer's Disease";
      const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[c]));
      const target = document.getElementById('probe-target');
      target.innerHTML = `<div class="ctx-suggestion-item" id="probe-suggest" onmousedown="document.getElementById('probe-cond-input').value = ${escapeHTML(JSON.stringify(condition))}">${escapeHTML(condition)}</div>`;
      document.getElementById('probe-suggest').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      outcomes.apostropheConditionRoundTrips = document.getElementById('probe-cond-input').value === condition;
    } finally {
      probe.remove();
    }

    const originalDiagnoses = state.importedData?.diagnoses;
    state.importedData = state.importedData || {};
    state.importedData.diagnoses = { conditions: [], note: '', familyHistory: [] };

    let detachedModal = null;
    if (!document.getElementById('detail-modal')) {
      detachedModal = document.createElement('div');
      detachedModal.id = 'detail-modal';
      document.body.appendChild(detachedModal);
    }

    const probe2 = document.createElement('div');
    document.body.appendChild(probe2);
    try {
      probe2.innerHTML = `
        <select id="fh-relative"><option value="mother" selected>Mother</option></select>
        <input id="fh-condition" value="Type 2 Diabetes">
        <input id="fh-age" value="45">
        <input id="fh-note" value="on metformin">
        <textarea id="ctx-note-input"></textarea>`;
      cards.addFamilyHistoryEntry();
      const entry = state.importedData.diagnoses.familyHistory?.[0];
      outcomes.addFamilyHistoryEntryPushesOne = state.importedData.diagnoses.familyHistory?.length === 1;
      outcomes.addedEntryFieldsMatch = entry?.relative === 'mother'
        && entry?.condition === 'Type 2 Diabetes'
        && entry?.onsetAge === 45
        && entry?.note === 'on metformin';

      cards.editFamilyHistoryEntry(0);
      outcomes.editFamilyHistoryPrefills = document.getElementById('fh-relative')?.value === 'mother'
        && document.getElementById('fh-condition')?.value === 'Type 2 Diabetes'
        && document.getElementById('fh-age')?.value === '45'
        && document.getElementById('fh-note')?.value === 'on metformin';
      document.getElementById('fh-relative').value = 'father';
      document.getElementById('fh-condition').value = 'Heart Attack (MI)';
      document.getElementById('fh-age').value = '52';
      document.getElementById('fh-note').value = 'stent';
      cards.addFamilyHistoryEntry();
      const editedFamily = state.importedData.diagnoses.familyHistory?.[0];
      outcomes.editedFamilyEntryUpdatesInPlace = state.importedData.diagnoses.familyHistory?.length === 1
        && editedFamily?.relative === 'father'
        && editedFamily?.condition === 'Heart Attack (MI)'
        && editedFamily?.onsetAge === 52
        && editedFamily?.note === 'stent';

      state.importedData.diagnoses.conditions = [{ name: 'Hypertension', severity: 'mild', since: '2020' }];
      cards.renderDiagnosesModal(document.getElementById('detail-modal'), state.importedData.diagnoses);
      cards.editCondition(0);
      outcomes.editConditionPrefills = document.getElementById('condition-input')?.value === 'Hypertension'
        && document.getElementById('condition-since')?.value === '2020';
      document.getElementById('condition-input').value = 'Psoriasis';
      document.getElementById('condition-since').value = '2022';
      cards.addCondition();
      outcomes.editedConditionUpdatesInPlace = state.importedData.diagnoses.conditions?.length === 1
        && state.importedData.diagnoses.conditions[0]?.name === 'Psoriasis'
        && state.importedData.diagnoses.conditions[0]?.since === '2022';

      state.importedData.diagnoses.familyHistory = [{
        relative: 'maternal_grandmother',
        condition: "Alzheimer's Disease with early cognitive symptoms",
        onsetAge: 61,
        note: 'long note that should truncate inline instead of making the saved row tall',
      }];
      cards.renderDiagnosesModal(document.getElementById('detail-modal'), state.importedData.diagnoses);
      await new Promise(resolve => requestAnimationFrame(resolve));
      const longRow = document.querySelector('#detail-modal .ctx-family-item');
      const longCondition = document.querySelector('#detail-modal .ctx-family-condition');
      const longRelative = document.querySelector('#detail-modal .ctx-family-relative-label');
      const rowHeight = longRow?.getBoundingClientRect().height || 0;
      outcomes.longFamilyRowStaysCompact = window.innerWidth < 600 || rowHeight <= 52;
      outcomes.longFamilyRowTextEllipsizes = !!longCondition
        && getComputedStyle(longCondition).whiteSpace === 'nowrap'
        && getComputedStyle(longCondition).textOverflow === 'ellipsis'
        && !!longRelative
        && getComputedStyle(longRelative).textOverflow === 'ellipsis';

      document.getElementById('detail-modal').innerHTML = '';
      probe2.innerHTML = `
        <select id="fh-relative"><option value="__evil_relative" selected>x</option></select>
        <input id="fh-condition" value="something">
        <input id="fh-age" value="50">
        <input id="fh-note" value="">
        <textarea id="ctx-note-input"></textarea>`;
      const beforeReject = state.importedData.diagnoses.familyHistory.length;
      cards.addFamilyHistoryEntry();
      outcomes.tamperedRelativeRejected = state.importedData.diagnoses.familyHistory.length === beforeReject;

      const beforeDelete = state.importedData.diagnoses.familyHistory.length;
      cards.deleteFamilyHistoryEntry(0);
      outcomes.deleteFamilyHistoryRemovesByIndex = state.importedData.diagnoses.familyHistory.length === beforeDelete - 1;
    } finally {
      probe2.remove();
      detachedModal?.remove();
      state.importedData.diagnoses = originalDiagnoses;
    }

    return outcomes;
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
