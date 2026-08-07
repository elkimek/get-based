import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?medicalHistoryCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('medical history default dependencies no-op while saving editor state', async ({ page }) => {
  await page.goto('/js/context-card-medical-history-editor.js', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ editorUrl }) => {
    const [{ state }, editor] = await Promise.all([
      import('/js/state.js'),
      import(editorUrl),
    ]);
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate, attempts = 100) => {
      for (let i = 0; i < attempts; i += 1) {
        try {
          if (await predicate()) return true;
        } catch {}
        await wait(10);
      }
      return false;
    };
    const byId = id => {
      const el = document.getElementById(id);
      if (!el) throw new Error(`Expected #${id} in default medical history editor`);
      return el;
    };
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const saved = {
      importedData: clone(state.importedData),
      currentProfile: state.currentProfile,
    };
    const outcomes = {};
    const overlay = document.createElement('div');
    overlay.id = 'modal-overlay';
    const modal = document.createElement('div');
    modal.id = 'detail-modal';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    try {
      state.currentProfile = 'medical-history-default-deps';
      state.importedData = {
        entries: [],
        notes: [],
        supplements: [],
        healthGoals: [],
        diagnoses: { conditions: [], note: '', familyHistory: [] },
        customMarkers: {},
        markerNotes: {},
        markerValueNotes: {},
        changeHistory: [],
      };

      await editor.openDiagnosesEditor();
      const controlsReady = await waitFor(() => [
        'condition-input',
        'condition-since',
        'ctx-note-input',
      ].every(id => document.getElementById(id)));
      if (!controlsReady) throw new Error('Default medical history controls did not render');
      byId('condition-input').value = 'Migraine';
      byId('condition-since').value = '2020';
      byId('ctx-note-input').value = 'default note';
      let addCrashed = false;
      try { editor.addCondition(); }
      catch (_) { addCrashed = true; }
      outcomes.defaultRecordChangeNoopAllowsConditionAdd =
        !addCrashed
        && state.importedData.diagnoses?.conditions?.length === 0
        && document.querySelector('#detail-modal .ctx-condition-item')?.textContent.includes('Migraine')
        && byId('ctx-note-input').value === 'default note';

      byId('ctx-note-input').value = 'saved with default callback';
      let saveCrashed = false;
      try { editor.saveDiagnoses(); }
      catch (_) { saveCrashed = true; }
      outcomes.defaultSaveAndRefreshNoopAllowsSave =
        !saveCrashed
        && state.importedData.diagnoses?.conditions?.[0]?.name === 'Migraine'
        && state.importedData.diagnoses?.conditions?.[0]?.since === '2020'
        && state.importedData.diagnoses?.note === 'saved with default callback';

      let clearCrashed = false;
      try { editor.clearDiagnoses(); }
      catch (_) { clearCrashed = true; }
      outcomes.defaultSaveAndRefreshNoopAllowsClear =
        !clearCrashed
        && state.importedData.diagnoses === null;
    } finally {
      state.importedData = saved.importedData;
      state.currentProfile = saved.currentProfile;
      overlay.remove();
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return outcomes;
  }, { editorUrl: moduleUrl('/js/context-card-medical-history-editor.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('family history DOM handlers round-trip and mutate entries', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const cards = await import('/js/context-cards.js');
    await (await import('/js/context-card-editor-ui.js')).loadContextEditorStylesheet();
    const { state } = await import('/js/state.js');
    const outcomes = {};

    const originalDiagnoses = state.importedData?.diagnoses;
    state.importedData = state.importedData || {};
    state.importedData.diagnoses = { conditions: [], note: '', familyHistory: [] };

    let detachedModal = null;
    if (!document.getElementById('detail-modal')) {
      detachedModal = document.createElement('div');
      detachedModal.id = 'detail-modal';
      document.body.appendChild(detachedModal);
    }

    await cards.renderDiagnosesModal(document.getElementById('detail-modal'), state.importedData.diagnoses);
    const conditionInput = document.getElementById('condition-input');
    conditionInput.value = 'Alzheimer';
    conditionInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
    const suggestion = document.querySelector('#condition-suggestions .ctx-suggestion-item');
    suggestion.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    outcomes.apostropheConditionRoundTrips = conditionInput.value === "Alzheimer's Disease";
    document.getElementById('detail-modal').innerHTML = '';

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
      const familyItem = document.querySelector('#detail-modal .ctx-family-item');
      outcomes.addFamilyHistoryEntryPushesOne = document.querySelectorAll('#detail-modal .ctx-family-item').length === 1;
      outcomes.addedEntryFieldsMatch = familyItem?.textContent.includes('Mother')
        && familyItem?.textContent.includes('Type 2 Diabetes')
        && familyItem?.textContent.includes('age 45')
        && familyItem?.textContent.includes('on metformin');

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
      const editedFamily = document.querySelector('#detail-modal .ctx-family-item');
      outcomes.editedFamilyEntryUpdatesInPlace = document.querySelectorAll('#detail-modal .ctx-family-item').length === 1
        && editedFamily?.textContent.includes('Father')
        && editedFamily?.textContent.includes('Heart Attack (MI)')
        && editedFamily?.textContent.includes('age 52')
        && editedFamily?.textContent.includes('stent');

      document.getElementById('condition-input').value = 'Hypertension';
      document.getElementById('condition-since').value = '2020';
      cards.addCondition();
      cards.editCondition(0);
      outcomes.editConditionPrefills = document.getElementById('condition-input')?.value === 'Hypertension'
        && document.getElementById('condition-since')?.value === '2020';
      document.getElementById('condition-input').value = 'Psoriasis';
      document.getElementById('condition-since').value = '2022';
      cards.addCondition();
      const editedCondition = document.querySelector('#detail-modal .ctx-condition-item');
      outcomes.editedConditionUpdatesInPlace = document.querySelectorAll('#detail-modal .ctx-condition-item').length === 1
        && editedCondition?.textContent.includes('Psoriasis')
        && editedCondition?.textContent.includes('since 2022');

      cards.editFamilyHistoryEntry(0);
      document.getElementById('fh-relative').value = 'maternal_grandmother';
      document.getElementById('fh-condition').value = "Alzheimer's Disease with early cognitive symptoms";
      document.getElementById('fh-age').value = '61';
      document.getElementById('fh-note').value = 'long note that should truncate inline instead of making the saved row tall';
      cards.addFamilyHistoryEntry();
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

      cards.saveDiagnoses();

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
      cards.saveDiagnoses();
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

test('medical history editor handlers cover autocomplete save clear and close flows', async ({ page }) => {
  await page.goto('/js/context-card-medical-history-editor.js', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ editorUrl }) => {
    const [{ state }, editor] = await Promise.all([
      import('/js/state.js'),
      import(editorUrl),
    ]);
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate, attempts = 100) => {
      for (let i = 0; i < attempts; i += 1) {
        try {
          if (await predicate()) return true;
        } catch {}
        await delay(10);
      }
      return false;
    };
    const byId = id => {
      const el = document.getElementById(id);
      if (!el) throw new Error(`Expected #${id} in medical history editor`);
      return el;
    };
    const outcomes = {};
    const calls = [];
    const saved = {
      importedData: clone(state.importedData),
      profileSex: state.profileSex,
    };
    let outside = null;

    try {
      state.profileSex = 'male';
      state.importedData = {
        ...state.importedData,
        diagnoses: {
          conditions: [{ name: 'Hypertension', severity: 'mild', since: '2019' }],
          proceduresNote: 'Appendectomy in 2010',
          note: 'baseline note',
          familyHistory: [{ relative: 'father', condition: 'Heart Attack (MI)', onsetAge: 52, note: 'stent' }],
        },
      };

      let overlay = document.getElementById('modal-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'modal-overlay';
        document.body.appendChild(overlay);
      }
      let modal = document.getElementById('detail-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'detail-modal';
        overlay.appendChild(modal);
      }
      outside = document.createElement('button');
      outside.id = 'medical-history-outside';
      outside.textContent = 'outside';
      document.body.appendChild(outside);

      editor.configureMedicalHistoryEditor({
        close: () => {
          calls.push(['close']);
          overlay.classList.remove('show');
        },
        recordChange: field => calls.push(['record', field]),
        saveAndRefresh: (msg, field) => calls.push(['saveRefresh', msg, field]),
      });

      await editor.openDiagnosesEditor();
      const editorReady = await waitFor(() => [
        'condition-input',
        'condition-suggestions',
        'condition-since',
        'condition-status',
        'diagnosis-procedures-input',
        'fh-relative',
        'fh-condition',
        'fh-condition-suggestions',
        'fh-age',
        'fh-note',
        'ctx-note-input',
      ].every(id => document.getElementById(id)));
      if (!editorReady) throw new Error('Medical history editor controls did not render');
      outcomes.medicalHistoryInputsUseDelegatedKeydown =
        byId('condition-input').onkeydown === null &&
        byId('fh-condition').onkeydown === null;
      outcomes.openDiagnosesEditorShowsSeededModal = overlay.classList.contains('show') === true
        && modal.getAttribute('aria-label') === 'Medical History'
        && modal.textContent.includes('Hypertension')
        && modal.textContent.includes('Father')
        && byId('diagnosis-procedures-input').value === 'Appendectomy in 2010';
      outcomes.extendedFamilyChoicesStayCompactAndLineageAware = Array.from(byId('fh-relative').options)
        .some(option => option.value === 'half_sibling')
        && Array.from(byId('fh-relative').options).some(option => option.value === 'maternal_relative')
        && Array.from(byId('fh-relative').options).some(option => option.value === 'paternal_relative');

      const conditionInput = byId('condition-input');
      conditionInput.value = 'endo';
      editor.filterConditionSuggestions();
      outcomes.conditionSuggestionsRespectMaleProfile = !byId('condition-suggestions').textContent.includes('Endometriosis');

      conditionInput.value = 'hypertension';
      editor.filterConditionSuggestions();
      outcomes.conditionSuggestionsSkipExistingConditions = byId('condition-suggestions').children.length === 0;

      byId('condition-suggestions').innerHTML = '<div class="ctx-suggestion-item">stale</div>';
      editor.selectConditionSuggestion("Hashimoto's");
      outcomes.selectConditionSuggestionSetsInputAndClearsMenu = conditionInput.value === "Hashimoto's"
        && byId('condition-suggestions').children.length === 0;

      byId('condition-suggestions').innerHTML = '<div class="ctx-suggestion-item">condition</div>';
      byId('fh-condition-suggestions').innerHTML = '<div class="ctx-suggestion-item">family</div>';
      outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      outcomes.outsideClickClosesBothSuggestionMenus = byId('condition-suggestions').children.length === 0
        && byId('fh-condition-suggestions').children.length === 0;

      byId('condition-input').value = "Hashimoto's";
      byId('condition-since').value = '2021';
      byId('condition-status').querySelector('[data-context-value="controlled"]')?.click();
      byId('diagnosis-procedures-input').value = 'Appendectomy in 2010; thyroid biopsy';
      byId('ctx-note-input').value = 'diagnoses note from add';
      editor.addCondition();
      const addedCondition = document.querySelectorAll('#detail-modal .ctx-condition-item')[1];
      outcomes.addConditionAppendsAndSyncsNote = state.importedData.diagnoses.conditions.length === 1
        && document.querySelectorAll('#detail-modal .ctx-condition-item').length === 2
        && addedCondition?.textContent.includes("Hashimoto's")
        && addedCondition?.textContent.includes('controlled')
        && addedCondition?.textContent.includes('since 2021')
        && byId('diagnosis-procedures-input').value.includes('thyroid biopsy')
        && byId('ctx-note-input').value === 'diagnoses note from add';

      const beforeEmptyAdd = document.querySelectorAll('#detail-modal .ctx-condition-item').length;
      byId('condition-input').value = '';
      editor.addCondition();
      outcomes.emptyConditionIsIgnored = document.querySelectorAll('#detail-modal .ctx-condition-item').length === beforeEmptyAdd;

      editor.editCondition(1);
      outcomes.editConditionPrefillsSelectedRow = byId('condition-input').value === "Hashimoto's"
        && byId('condition-since').value === '2021'
        && document.querySelector('#detail-modal .ctx-condition-item.is-editing')?.textContent.includes("Hashimoto's");

      byId('diagnosis-procedures-input').value = 'Unsaved procedure retained after condition cancel';
      byId('ctx-note-input').value = 'Unsaved note retained after condition cancel';
      editor.cancelConditionEdit();
      outcomes.cancelConditionEditClearsEditingState = document.querySelector('#detail-modal .ctx-condition-item.is-editing') === null
        && byId('diagnosis-procedures-input').value === 'Unsaved procedure retained after condition cancel'
        && byId('ctx-note-input').value === 'Unsaved note retained after condition cancel';

      editor.editCondition(1);
      byId('condition-input').value = 'Psoriasis';
      byId('condition-since').value = '2022';
      document.querySelectorAll('#condition-severity .ctx-btn-option').forEach(btn => btn.classList.remove('active'));
      Array.from(document.querySelectorAll('#condition-severity .ctx-btn-option'))
        .find(btn => btn.textContent.trim() === 'Low')
        ?.classList.add('active');
      editor.addCondition();
      const updatedCondition = document.querySelectorAll('#detail-modal .ctx-condition-item')[1];
      outcomes.editConditionUpdatesInPlace = document.querySelectorAll('#detail-modal .ctx-condition-item').length === 2
        && updatedCondition?.textContent.includes('Psoriasis')
        && updatedCondition?.textContent.includes('Low')
        && updatedCondition?.textContent.includes('since 2022');

      editor.deleteCondition(0);
      outcomes.deleteConditionRemovesByIndex = document.querySelectorAll('#detail-modal .ctx-condition-item').length === 1
        && document.querySelector('#detail-modal .ctx-condition-item')?.textContent.includes('Psoriasis');

      byId('fh-condition').value = 'alzh';
      editor.filterFamilyConditionSuggestions();
      outcomes.familyConditionSuggestionsRenderMatches = byId('fh-condition-suggestions').textContent.includes("Alzheimer's Disease") === true;

      editor.selectFamilyConditionSuggestion("Alzheimer's Disease");
      outcomes.selectFamilySuggestionSetsInputAndClearsMenu = byId('fh-condition').value === "Alzheimer's Disease"
        && byId('fh-condition-suggestions').children.length === 0;

      const beforeInvalidFamily = document.querySelectorAll('#detail-modal .ctx-family-item').length;
      const relative = byId('fh-relative');
      relative.insertAdjacentHTML('beforeend', '<option value="__invalid_relative">Invalid</option>');
      relative.value = '__invalid_relative';
      byId('fh-condition').value = 'Asthma';
      editor.addFamilyHistoryEntry();
      outcomes.invalidRelativeIsRejected = document.querySelectorAll('#detail-modal .ctx-family-item').length === beforeInvalidFamily;

      relative.value = 'child';
      byId('fh-condition').value = 'Asthma';
      byId('fh-age').value = '200';
      byId('fh-note').value = 'childhood';
      editor.addFamilyHistoryEntry();
      const addedFamily = document.querySelectorAll('#detail-modal .ctx-family-item')[1];
      outcomes.addFamilyHistoryClampsAge = document.querySelectorAll('#detail-modal .ctx-family-item').length === 2
        && addedFamily?.textContent.includes('Child')
        && addedFamily?.textContent.includes('age 120')
        && addedFamily?.textContent.includes('childhood');

      editor.editFamilyHistoryEntry(1);
      outcomes.editFamilyHistoryPrefillsSelectedRow = byId('fh-relative').value === 'child'
        && byId('fh-condition').value === 'Asthma'
        && document.querySelector('#detail-modal .ctx-family-item.is-editing')?.textContent.includes('Asthma');

      byId('diagnosis-procedures-input').value = 'Unsaved procedure retained after family cancel';
      byId('ctx-note-input').value = 'Unsaved note retained after family cancel';
      editor.cancelFamilyHistoryEdit();
      outcomes.cancelFamilyHistoryEditClearsEditingState = document.querySelector('#detail-modal .ctx-family-item.is-editing') === null
        && byId('diagnosis-procedures-input').value === 'Unsaved procedure retained after family cancel'
        && byId('ctx-note-input').value === 'Unsaved note retained after family cancel';

      editor.editFamilyHistoryEntry(1);
      byId('fh-relative').value = 'mother';
      byId('fh-condition').value = 'Breast Cancer';
      byId('fh-age').value = '-5';
      byId('fh-note').value = 'BRCA';
      editor.addFamilyHistoryEntry();
      const updatedFamily = Array.from(document.querySelectorAll('#detail-modal .ctx-family-item'))
        .find(item => item.textContent.includes('Breast Cancer'));
      outcomes.editFamilyHistoryUpdatesInPlaceAndClampsLowAge = document.querySelectorAll('#detail-modal .ctx-family-item').length === 2
        && updatedFamily?.textContent.includes('Mother')
        && updatedFamily?.textContent.includes('Breast Cancer')
        && updatedFamily?.textContent.includes('age 0')
        && updatedFamily?.textContent.includes('BRCA');

      editor.deleteFamilyHistoryEntry(0);
      outcomes.deleteFamilyHistoryRemovesByIndex = document.querySelectorAll('#detail-modal .ctx-family-item').length === 1
        && document.querySelector('#detail-modal .ctx-family-item')?.textContent.includes('Mother');

      byId('ctx-note-input').value = 'final saved note';
      editor.saveDiagnoses();
      outcomes.saveDiagnosesCallsConfiguredRefresh = state.importedData.diagnoses.note === 'final saved note'
        && state.importedData.diagnoses.conditions.length === 1
        && state.importedData.diagnoses.conditions[0].name === 'Psoriasis'
        && state.importedData.diagnoses.conditions[0].severity === 'minor'
        && state.importedData.diagnoses.conditions[0].status === 'controlled'
        && state.importedData.diagnoses.proceduresNote === 'Unsaved procedure retained after family cancel'
        && state.importedData.diagnoses.familyHistory.length === 1
        && state.importedData.diagnoses.familyHistory[0].relative === 'mother'
        && calls.some(call => call[0] === 'saveRefresh' && call[1] === 'Medical history saved' && call[2] === 'diagnoses');

      state.importedData.diagnoses = { conditions: [], note: '', familyHistory: [] };
      editor.renderDiagnosesModal(modal, state.importedData.diagnoses);
      byId('ctx-note-input').value = '';
      editor.saveDiagnoses();
      outcomes.saveEmptyDiagnosesClearsState = state.importedData.diagnoses === null;

      state.importedData.diagnoses = { conditions: [{ name: 'Migraine', severity: 'minor' }], note: '', familyHistory: [] };
      editor.clearDiagnoses();
      outcomes.clearDiagnosesClearsAndRefreshes = state.importedData.diagnoses === null
        && calls.some(call => call[0] === 'saveRefresh' && call[1] === 'Medical history cleared' && call[2] === 'diagnoses');

      overlay.classList.add('show');
      editor.closeDiagnoses();
      outcomes.closeDiagnosesDelegatesToCloseModal = overlay.classList.contains('show') === false
        && calls.some(call => call[0] === 'close');
    } finally {
      document.removeEventListener('click', editor.closeSuggestionsOnClickOutside);
      state.importedData = saved.importedData;
      state.profileSex = saved.profileSex;
      document.getElementById('modal-overlay')?.classList.remove('show');
      const modal = document.getElementById('detail-modal');
      if (modal) modal.innerHTML = '';
      outside?.remove();
    }

    return outcomes;
  }, { editorUrl: moduleUrl('/js/context-card-medical-history-editor.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
