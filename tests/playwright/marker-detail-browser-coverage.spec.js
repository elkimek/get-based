import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?markerDetailCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('marker detail editing covers manual values notes delete and revert workflows', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ editingUrl }) => {
    const [editing, { state }, data] = await Promise.all([
      import(editingUrl),
      import('/js/state.js'),
      import('/js/data.js'),
    ]);
    const outcomes = {};
    const calls = [];
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const wait = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async selector => {
      for (let i = 0; i < 40; i += 1) {
        const el = document.querySelector(selector);
        if (el) return el;
        await wait(25);
      }
      throw new Error(`Timed out waiting for ${selector}`);
    };
    const waitUntil = async (predicate, label) => {
      for (let i = 0; i < 40; i += 1) {
        if (predicate()) return;
        await wait(25);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const clickConfirm = async (ok = true) => {
      await waitFor(ok ? '#confirm-ok' : '#confirm-cancel');
      document.getElementById(ok ? 'confirm-ok' : 'confirm-cancel')?.click();
      await wait(0);
    };
    const fillManualForm = ({ date, value, note = '', unit = 'g/l' }) => {
      let fixture = document.getElementById('marker-detail-coverage-fixture');
      if (!fixture) {
        fixture = document.createElement('div');
        fixture.id = 'marker-detail-coverage-fixture';
        document.body.appendChild(fixture);
      }
      fixture.innerHTML = `
        <input id="me-date" value="${date}">
        <input id="me-value" value="${value}">
        <textarea id="me-note">${note}</textarea>
        <input id="me-unit" value="${unit}">
      `;
    };
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const sessionStorageSnapshot = new Map(Array.from({ length: sessionStorage.length }, (_, i) => {
      const key = sessionStorage.key(i);
      return [key, sessionStorage.getItem(key)];
    }));
    const saved = {
      importedData: clone(state.importedData),
      markerRegistry: clone(state.markerRegistry),
      currentProfile: state.currentProfile,
      currentView: state.currentView,
      profileSex: state.profileSex,
      profileDob: state.profileDob,
      unitSystem: state.unitSystem,
      buildSidebar: window.buildSidebar,
    };
    const id = 'proteins_albumin';
    const dotKey = 'proteins.albumin';
    const note500 = 'manual note '.repeat(80);

    try {
      state.currentProfile = 'marker-detail-coverage';
      state.currentView = 'proteins';
      state.profileSex = 'male';
      state.profileDob = '1980-01-02';
      state.unitSystem = 'EU';
      state.importedData = {
        entries: [{
          date: '2026-06-01',
          markers: { [dotKey]: 42 },
          markerSources: { [dotKey]: { file: 'lab.pdf', at: 1 } },
        }],
        notes: [],
        supplements: [],
        customMarkers: {},
        markerNotes: {},
        markerValueNotes: {},
        manualValues: {},
        refOverrides: {},
      };
      data.invalidateActiveDataCache();
      const active = data.getActiveData();
      state.markerRegistry = {
        [id]: active.categories.proteins.markers.albumin,
      };
      window.buildSidebar = () => calls.push(['sidebar']);
      editing.configureMarkerDetailEditing({
        navigate: route => calls.push(['navigate', route]),
        showDetailModal: (modalId, opts) => calls.push(['detail', modalId, opts || null]),
        openManualEntryForm: (modalId, date) => calls.push(['open-form', modalId, date]),
        closeModal: () => calls.push(['close']),
      });

      fillManualForm({ date: '2026-06-01', value: '43.8', note: note500 });
      const overwrite = editing.saveManualEntry(id);
      await clickConfirm(true);
      await overwrite;
      await wait(70);
      outcomes.saveManualEntryOverwritesDuplicateAndCapsNote =
        state.importedData.entries[0].markers[dotKey] === 43.8
        && state.importedData.manualValues[`${dotKey}:2026-06-01`] === 42
        && state.importedData.markerValueNotes[`${dotKey}:2026-06-01`].length === 500
        && sessionStorage.getItem('labcharts-last-manual-date') === '2026-06-01'
        && calls.some(call => call[0] === 'sidebar')
        && calls.some(call => call[0] === 'close')
        && calls.some(call => call[0] === 'navigate' && call[1] === 'proteins')
        && calls.some(call => call[0] === 'detail' && call[1] === id);

      fillManualForm({ date: '2026-06-02', value: '-2', note: 'cancelled warning' });
      const negative = editing.saveManualEntry(id);
      await clickConfirm(false);
      await negative;
      outcomes.cancelledRangeWarningDoesNotCreateEntry =
        !state.importedData.entries.some(entry => entry.date === '2026-06-02');

      fillManualForm({ date: '2026-06-03', value: '45', note: 'add another' });
      await editing.saveAndAddAnotherManualEntry(id);
      outcomes.keepOpenManualEntryReopensForm =
        state.importedData.entries.some(entry => entry.date === '2026-06-03' && entry.markers[dotKey] === 45)
        && calls.some(call => call[0] === 'open-form' && call[1] === id && call[2] === '2026-06-03');

      const valueEl = document.createElement('div');
      valueEl.className = 'mv-value';
      valueEl.textContent = '45';
      document.body.appendChild(valueEl);
      editing.editMarkerValue(id, '2026-06-03', '45', { target: valueEl });
      const editInput = valueEl.querySelector('input');
      editInput.value = '46.5';
      editInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await waitUntil(() => {
        const entry = state.importedData.entries.find(item => item.date === '2026-06-03');
        return entry?.markers?.[dotKey] === 46.5
          && calls.some(call => call[0] === 'detail' && call[1] === id);
      }, 'inline marker value save');
      const editedEntry = state.importedData.entries.find(entry => entry.date === '2026-06-03');
      outcomes.inlineEditUpdatesManualValue = editedEntry?.markers?.[dotKey] === 46.5
        && calls.some(call => call[0] === 'detail' && call[1] === id);

      const cancelEl = document.createElement('div');
      cancelEl.className = 'mv-value';
      cancelEl.textContent = '46.5';
      document.body.appendChild(cancelEl);
      const detailCallsBeforeCancel = calls.filter(call => call[0] === 'detail').length;
      editing.editMarkerValue(id, '2026-06-03', '46.5', { target: cancelEl });
      cancelEl.querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(0);
      outcomes.inlineEditEscapeCancels = calls.filter(call => call[0] === 'detail').length > detailCallsBeforeCancel;

      const noteEdit = editing.editValueNote(id, '2026-06-03');
      const promptInput = await waitFor('#prompt-dialog-input');
      promptInput.value = `${'follow-up '.repeat(70)}`;
      document.getElementById('prompt-ok')?.click();
      await noteEdit;
      outcomes.editValueNoteSavesCappedText =
        state.importedData.markerValueNotes[`${dotKey}:2026-06-03`].length === 500;

      const noteDelete = editing.deleteValueNote(id, '2026-06-03');
      await clickConfirm(true);
      await noteDelete;
      outcomes.deleteValueNoteClearsStoredNote =
        state.importedData.markerValueNotes[`${dotKey}:2026-06-03`] === null;

      await editing.revertMarkerValue(id, '2026-06-01');
      outcomes.revertManualValueRestoresImportedOriginal =
        state.importedData.entries[0].markers[dotKey] === 42
        && state.importedData.manualValues[`${dotKey}:2026-06-01`] === null;

      const deleteValue = editing.deleteMarkerValue(id, '2026-06-03');
      await clickConfirm(true);
      await deleteValue;
      const afterDelete = state.importedData.entries.find(entry => entry.date === '2026-06-03');
      outcomes.deleteMarkerValueRemovesManualEntryValue =
        afterDelete && !Object.prototype.hasOwnProperty.call(afterDelete.markers || {}, dotKey);
    } finally {
      state.importedData = saved.importedData;
      state.markerRegistry = saved.markerRegistry;
      state.currentProfile = saved.currentProfile;
      state.currentView = saved.currentView;
      state.profileSex = saved.profileSex;
      state.profileDob = saved.profileDob;
      state.unitSystem = saved.unitSystem;
      if (saved.buildSidebar) window.buildSidebar = saved.buildSidebar;
      else delete window.buildSidebar;
      data.invalidateActiveDataCache();
      editing.configureMarkerDetailEditing({
        navigate: (...args) => window.navigate?.(...args),
        showDetailModal: () => {},
        openManualEntryForm: () => {},
        closeModal: () => {},
      });
      document.getElementById('marker-detail-coverage-fixture')?.remove();
      document.querySelectorAll('.mv-value,.confirm-overlay,.notification-toast').forEach(el => el.remove());
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
      sessionStorage.clear();
      for (const [key, value] of sessionStorageSnapshot) {
        if (key && value != null) sessionStorage.setItem(key, value);
      }
    }

    return outcomes;
  }, { editingUrl: moduleUrl('/js/marker-detail-editing.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('marker detail editing covers range overrides and marker note editor paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ editingUrl }) => {
    const [editing, { state }, data] = await Promise.all([
      import(editingUrl),
      import('/js/state.js'),
      import('/js/data.js'),
    ]);
    const outcomes = {};
    const calls = [];
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const wait = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
    const waitUntil = async (predicate, label) => {
      for (let i = 0; i < 40; i += 1) {
        if (predicate()) return;
        await wait(25);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const saved = {
      importedData: clone(state.importedData),
      markerRegistry: clone(state.markerRegistry),
      currentProfile: state.currentProfile,
      currentView: state.currentView,
      profileSex: state.profileSex,
      profileDob: state.profileDob,
      unitSystem: state.unitSystem,
    };
    const id = 'proteins_albumin';
    const dotKey = 'proteins.albumin';

    try {
      state.currentProfile = 'marker-detail-range-coverage';
      state.currentView = 'proteins';
      state.profileSex = 'male';
      state.profileDob = '1980-01-02';
      state.unitSystem = 'EU';
      state.importedData = {
        entries: [{ date: '2026-06-01', markers: { [dotKey]: 42 } }],
        notes: [],
        supplements: [],
        customMarkers: {},
        markerNotes: {},
        markerValueNotes: {},
        manualValues: {},
        refOverrides: {},
      };
      data.invalidateActiveDataCache();
      state.markerRegistry = {
        [id]: data.getActiveData().categories.proteins.markers.albumin,
      };
      editing.configureMarkerDetailEditing({
        navigate: route => calls.push(['navigate', route]),
        showDetailModal: modalId => calls.push(['detail', modalId]),
        openManualEntryForm: () => {},
        closeModal: () => {},
      });

      const fixture = document.createElement('div');
      fixture.id = 'marker-detail-range-fixture';
      fixture.innerHTML = `
        <button class="nav-item active" data-category="proteins">Proteins</button>
        <span id="ref-span" class="ref-editable">Reference</span>
        <span id="optimal-span" class="ref-editable">Optimal</span>
        <div id="marker-note-editor" style="display:none">
          <textarea id="marker-note-input"></textarea>
        </div>
      `;
      document.body.appendChild(fixture);

      editing.editRefRange(id, 'ref', { target: document.getElementById('ref-span') });
      outcomes.editRefRangeSwapsInlineInputs =
        document.getElementById('ref-edit-min')?.value === '35'
        && document.getElementById('ref-edit-max')?.value === '52';
      document.getElementById('ref-edit-min').value = '36';
      document.getElementById('ref-edit-max').value = '';
      await editing.saveRefRange(id, 'ref');
      outcomes.saveReferenceRangeStoresManualOpenEndedOverride =
        state.importedData.refOverrides[dotKey]?.refMin === 36
        && state.importedData.refOverrides[dotKey]?.refMax === null
        && state.importedData.refOverrides[dotKey]?.refSource === 'manual'
        && calls.some(call => call[0] === 'navigate')
        && calls.some(call => call[0] === 'detail' && call[1] === id);
      document.querySelectorAll('.ref-edit-form').forEach(el => el.remove());

      Object.assign(state.importedData.refOverrides[dotKey], {
        labRefMin: 35,
        labRefMax: 52,
        refMin: 36,
        refMax: 48,
        refSource: 'manual',
      });
      await editing.revertRefRange(id, 'ref');
      outcomes.revertReferenceRangeRestoresLabRange =
        state.importedData.refOverrides[dotKey]?.refMin === 35
        && state.importedData.refOverrides[dotKey]?.refMax === 52
        && state.importedData.refOverrides[dotKey]?.refSource === 'import'
        && !('labRefMin' in state.importedData.refOverrides[dotKey]);

      editing.editRefRange(id, 'optimal', { target: document.getElementById('optimal-span') });
      const optimalForm = document.querySelector('.ref-edit-form');
      optimalForm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(0);
      outcomes.escapeFromOptimalRangeEditRerendersModal =
        calls.some(call => call[0] === 'detail' && call[1] === id);
      document.querySelectorAll('.ref-edit-form').forEach(el => el.remove());

      const nextOptimalSpan = document.createElement('span');
      nextOptimalSpan.className = 'ref-editable';
      fixture.appendChild(nextOptimalSpan);
      editing.editRefRange(id, 'optimal', { target: nextOptimalSpan });
      document.getElementById('ref-edit-min').value = '44';
      document.getElementById('ref-edit-max').value = '48';
      document.querySelector('.ref-edit-form').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await waitUntil(
        () => state.importedData.refOverrides[dotKey]?.optimalMin === 44
          && state.importedData.refOverrides[dotKey]?.optimalMax === 48
          && state.importedData.refOverrides[dotKey]?.optimalSource === 'manual',
        'optimal range override save'
      );
      outcomes.enterSavesOptimalRangeOverride =
        state.importedData.refOverrides[dotKey]?.optimalMin === 44
        && state.importedData.refOverrides[dotKey]?.optimalMax === 48
        && state.importedData.refOverrides[dotKey]?.optimalSource === 'manual';

      editing.toggleMarkerNoteEditor(dotKey);
      outcomes.toggleMarkerNoteEditorShowsAndFocuses =
        document.getElementById('marker-note-editor')?.style.display === 'block'
        && document.activeElement === document.getElementById('marker-note-input');
      editing.toggleMarkerNoteEditor(dotKey);
      outcomes.toggleMarkerNoteEditorHides =
        document.getElementById('marker-note-editor')?.style.display === 'none';

      document.getElementById('marker-note-input').value = 'track albumin trend';
      await editing.saveMarkerNote(dotKey, id);
      outcomes.saveMarkerNotePersistsText =
        state.importedData.markerNotes[dotKey] === 'track albumin trend'
        && calls.some(call => call[0] === 'detail' && call[1] === id);
      await editing.deleteMarkerNote(dotKey, id);
      outcomes.deleteMarkerNoteRemovesText =
        !Object.prototype.hasOwnProperty.call(state.importedData.markerNotes, dotKey);

      document.getElementById('marker-note-input').value = '';
      const detailCallsBeforeNoop = calls.filter(call => call[0] === 'detail').length;
      await editing.saveMarkerNote(dotKey, id);
      outcomes.emptyMarkerNoteWithoutStoredNoteNoops =
        calls.filter(call => call[0] === 'detail').length === detailCallsBeforeNoop;
    } finally {
      state.importedData = saved.importedData;
      state.markerRegistry = saved.markerRegistry;
      state.currentProfile = saved.currentProfile;
      state.currentView = saved.currentView;
      state.profileSex = saved.profileSex;
      state.profileDob = saved.profileDob;
      state.unitSystem = saved.unitSystem;
      data.invalidateActiveDataCache();
      editing.configureMarkerDetailEditing({
        navigate: (...args) => window.navigate?.(...args),
        showDetailModal: () => {},
        openManualEntryForm: () => {},
        closeModal: () => {},
      });
      document.getElementById('marker-detail-range-fixture')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
    }

    return outcomes;
  }, { editingUrl: moduleUrl('/js/marker-detail-editing.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('marker detail delegated actions cover click key and data attribute contracts', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ actionsUrl }) => {
    const actionsModule = await import(actionsUrl);
    const outcomes = {};
    const calls = [];
    const root = document.createElement('div');
    root.id = 'marker-detail-action-fixture';
    document.body.appendChild(root);
    const actions = {
      closeModal: () => calls.push(['close']),
      toggleDashboardQuickMarkerPin: id => calls.push(['pin', id]),
      editRefRange: (id, type) => calls.push(['edit-ref', id, type]),
      revertRefRange: (id, type) => calls.push(['revert-ref', id, type]),
      renameMarker: id => calls.push(['rename', id]),
      revertMarkerName: id => calls.push(['revert-name', id]),
      editMarkerValue: (id, date, value) => calls.push(['edit-value', id, date, value]),
      deleteMarkerValue: (id, date) => calls.push(['delete-value', id, date]),
      revertMarkerValue: (id, date) => calls.push(['revert-value', id, date]),
      editValueNote: (id, date) => calls.push(['edit-note', id, date]),
      deleteValueNote: (id, date) => calls.push(['delete-note', id, date]),
      showDetailModal: (id, opts) => calls.push(['show', id, opts]),
      openManualEntryForm: id => calls.push(['open-manual', id]),
      askAIAboutMarker: id => calls.push(['ask-ai', id]),
      toggleMarkerNoteEditor: dotKey => calls.push(['toggle-note-editor', dotKey]),
      saveMarkerNote: (dotKey, id) => calls.push(['save-marker-note', dotKey, id]),
      deleteMarkerNote: (dotKey, id) => calls.push(['delete-marker-note', dotKey, id]),
      deleteCustomMarker: id => calls.push(['delete-custom', id]),
      saveManualEntry: id => calls.push(['save-manual', id]),
      saveAndAddAnotherManualEntry: id => calls.push(['save-add-manual', id]),
    };
    const clickAction = (action, attrs = {}, tag = 'button') => {
      const typeAttr = tag === 'button' ? ' type="button"' : '';
      root.insertAdjacentHTML('beforeend', `<${tag}${typeAttr} ${actionsModule.markerDetailActionAttrs(action, attrs)}>Action</${tag}>`);
      const actionEl = root.lastElementChild;
      actionEl.click();
      return actionEl;
    };

    try {
      actionsModule.installMarkerDetailActionDelegates(actions, root);
      actionsModule.installMarkerDetailActionDelegates({
        closeModal: () => calls.push(['duplicate-close']),
      }, root);

      clickAction('close-modal');
      clickAction('quick-pin', { id: 'proteins_albumin' });
      clickAction('edit-ref-range', { id: 'proteins_albumin', type: 'ref' });
      clickAction('revert-ref-range', { id: 'proteins_albumin', type: 'optimal' });
      clickAction('rename-marker', { id: 'proteins_albumin' });
      clickAction('revert-marker-name', { id: 'proteins_albumin' });
      clickAction('edit-marker-value', { id: 'proteins_albumin', date: '2026-06-01', value: 42.2 });
      clickAction('edit-marker-value', { id: 'proteins_albumin', date: '2026-06-01', value: 'not-number' });
      clickAction('delete-marker-value', { id: 'proteins_albumin', date: '2026-06-01' });
      clickAction('revert-marker-value', { id: 'proteins_albumin', date: '2026-06-01' });
      clickAction('edit-value-note', { id: 'proteins_albumin', date: '2026-06-01' });
      clickAction('delete-value-note', { id: 'proteins_albumin', date: '2026-06-01' });
      clickAction('show-detail-modal', {
        id: 'proteins_albumin',
        showAllHistory: true,
        scrollToHistory: true,
        historyLimit: 7,
      });
      clickAction('open-manual-entry', { id: 'proteins_albumin' });
      clickAction('ask-ai', { id: 'proteins_albumin' });
      clickAction('toggle-marker-note-editor', { dotKey: 'proteins.albumin' });
      clickAction('save-marker-note', { dotKey: 'proteins.albumin', id: 'proteins_albumin' });
      clickAction('delete-marker-note', { dotKey: 'proteins.albumin', id: 'proteins_albumin' });
      clickAction('delete-custom-marker', { id: 'customLabs_marker' });
      clickAction('save-manual-entry', { id: 'proteins_albumin' });
      clickAction('save-and-add-manual-entry', { id: 'proteins_albumin' });

      const row = document.createElement('div');
      row.className = 'marker-history-row';
      row.innerHTML = `<button type="button" ${actionsModule.markerDetailActionAttrs('toggle-history-note')}>Note</button><span class="mv-note-text">hidden</span>`;
      root.appendChild(row);
      row.querySelector('button').click();
      outcomes.toggleHistoryNoteAddsShowClass = row.querySelector('.mv-note-text').classList.contains('show');

      const keyEl = document.createElement('div');
      keyEl.setAttribute('role', 'button');
      keyEl.setAttribute('tabindex', '0');
      keyEl.innerHTML = 'Keyboard';
      keyEl.setAttribute('data-marker-detail-action', 'open-manual-entry');
      keyEl.setAttribute('data-marker-detail-id', 'proteins_albumin');
      root.appendChild(keyEl);
      keyEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      keyEl.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));

      const nestedInput = document.createElement('div');
      nestedInput.setAttribute('role', 'button');
      nestedInput.setAttribute('data-marker-detail-action', 'quick-pin');
      nestedInput.setAttribute('data-marker-detail-id', 'proteins_albumin');
      nestedInput.innerHTML = '<input value="typing">';
      root.appendChild(nestedInput);
      const pinCallsBeforeInput = calls.filter(call => call[0] === 'pin').length;
      nestedInput.querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      outcomes.keydownFromFormControlIsIgnored =
        calls.filter(call => call[0] === 'pin').length === pinCallsBeforeInput;

      const escapedAttrs = actionsModule.markerDetailActionAttrs('show-detail-modal', {
        id: 'x"y',
        showAllHistory: false,
        historyLimit: 0,
      });
      outcomes.actionAttrsEscapesAndFiltersValues =
        escapedAttrs.includes('data-marker-detail-id="x&quot;y"')
        && !escapedAttrs.includes('show-all-history')
        && escapedAttrs.includes('data-marker-detail-history-limit="0"');

      outcomes.clickDelegatesCallEveryRegisteredAction =
        calls.some(call => call[0] === 'close')
        && !calls.some(call => call[0] === 'duplicate-close')
        && calls.some(call => call[0] === 'pin' && call[1] === 'proteins_albumin')
        && calls.some(call => call[0] === 'edit-ref' && call[2] === 'ref')
        && calls.some(call => call[0] === 'revert-ref' && call[2] === 'optimal')
        && calls.some(call => call[0] === 'rename')
        && calls.some(call => call[0] === 'revert-name')
        && calls.filter(call => call[0] === 'edit-value').length === 1
        && calls.some(call => call[0] === 'delete-value')
        && calls.some(call => call[0] === 'revert-value')
        && calls.some(call => call[0] === 'edit-note')
        && calls.some(call => call[0] === 'delete-note')
        && calls.some(call => call[0] === 'show' && call[2].showAllHistory === true && call[2].historyLimit === 7)
        && calls.filter(call => call[0] === 'open-manual').length >= 3
        && calls.some(call => call[0] === 'ask-ai')
        && calls.some(call => call[0] === 'toggle-note-editor')
        && calls.some(call => call[0] === 'save-marker-note')
        && calls.some(call => call[0] === 'delete-marker-note')
        && calls.some(call => call[0] === 'delete-custom')
        && calls.some(call => call[0] === 'save-manual')
        && calls.some(call => call[0] === 'save-add-manual');
    } finally {
      root.remove();
    }

    return outcomes;
  }, { actionsUrl: moduleUrl('/js/marker-detail-actions.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('marker detail modal covers default deps descriptions alt units and bio age CRP fallback', async ({ page }) => {
  await page.route('**/marker-detail-modal-isolated-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><html><head><title>Marker detail isolated coverage</title></head>
      <body>
        <div id="modal-overlay" class="modal-overlay"><div id="detail-modal" class="modal"></div></div>
        <div id="notification-container"></div>
      </body></html>`,
  }));
  await page.goto('/marker-detail-modal-isolated-coverage', { waitUntil: 'load' });
  await page.waitForSelector('#modal-overlay', { state: 'attached' });

  const results = await page.evaluate(async ({ modalUrl }) => {
    const [modal, { state }, data] = await Promise.all([
      import(modalUrl),
      import('/js/state.js'),
      import('/js/data.js'),
    ]);
    const outcomes = {};
    const calls = [];
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const wait = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const saved = {
      importedData: clone(state.importedData),
      markerRegistry: clone(state.markerRegistry),
      currentProfile: state.currentProfile,
      currentView: state.currentView,
      profileSex: state.profileSex,
      profileDob: state.profileDob,
      unitSystem: state.unitSystem,
      showAltUnits: state.showAltUnits,
      rangeMode: state.rangeMode,
      chartInstances: state.chartInstances,
    };
    const windowKeys = [
      'toggleDashboardQuickMarkerPin',
      'renameMarker',
      'revertMarkerName',
      'askAIAboutMarker',
      'renderRecommendationSection',
      'isProductRecsEnabled',
      '_getRelevantSNPs',
      'closeEMFInterpretation',
      '_uninstallWearableModalFocusTrap',
    ];
    const savedWindow = Object.fromEntries(windowKeys.map(key => [
      key,
      { had: Object.prototype.hasOwnProperty.call(window, key), value: window[key] },
    ]));
    const date = '2026-06-01';
    const albuminId = 'proteins_albumin';
    const albuminKey = 'proteins.albumin';

    try {
      state.currentProfile = 'marker-detail-modal-coverage';
      state.currentView = 'proteins';
      state.profileSex = 'male';
      state.profileDob = '1980-01-02';
      state.unitSystem = 'EU';
      state.showAltUnits = true;
      state.rangeMode = 'both';
      state.chartInstances = {};
      state.importedData = {
        entries: [{
          date,
          markers: {
            [albuminKey]: 42,
            'biochemistry.creatinine': 82,
            'biochemistry.glucose': 5.1,
            'proteins.crp': 1.2,
            'differential.lymphocytesPct': 0.28,
            'hematology.mcv': 90,
            'hematology.rdwcv': 12.5,
            'biochemistry.alp': 1.1,
            'hematology.wbc': 5.4,
          },
          markerSources: { [albuminKey]: { file: 'coverage-lab.pdf', at: 1 } },
        }],
        notes: [],
        supplements: [],
        customMarkers: {},
        markerLabels: { [albuminKey]: 'Albumin renamed' },
        markerNotes: {},
        markerValueNotes: {},
        manualValues: {},
        refOverrides: {},
        genetics: { snps: [] },
      };
      data.invalidateActiveDataCache();
      state.markerRegistry = {};

      window.toggleDashboardQuickMarkerPin = id => calls.push(['pin', id]);
      window.renameMarker = id => calls.push(['rename', id]);
      window.revertMarkerName = id => calls.push(['revert-name', id]);
      window.askAIAboutMarker = id => calls.push(['ask-ai', id]);
      window.isProductRecsEnabled = () => true;
      window._getRelevantSNPs = () => [];
      window.renderRecommendationSection = async id => `<div class="coverage-rec">rec ${id}</div>`;
      window.closeEMFInterpretation = () => calls.push(['close-emf']);
      window._uninstallWearableModalFocusTrap = () => calls.push(['uninstall-focus']);

      localStorage.setItem('labcharts-marker-desc', JSON.stringify({
        'coverage.cached': 'Cached marker description',
      }));
      outcomes.fetchCustomMarkerDescriptionUsesCache =
        await modal.fetchCustomMarkerDescription('coverage.cached', 'Coverage cached', 'u') === 'Cached marker description';

      modal.showDetailModal(albuminId, { scrollToRec: true });
      await wait(80);
      const detail = document.getElementById('detail-modal');
      const detailText = detail?.textContent || '';
      outcomes.detailModalRendersAltUnitsQuickPinAndRecommendations =
        detailText.includes('Albumin renamed')
        && detailText.includes('g/dl')
        && detailText.includes('coverage-lab.pdf')
        && !!detail?.querySelector('.gb-detail-pin-btn[aria-pressed="false"]')
        && detailText.includes('rec proteins.albumin');

      detail?.querySelector('[data-marker-detail-action="quick-pin"]')?.click();
      detail?.querySelector('[data-marker-detail-action="rename-marker"]')?.click();
      detail?.querySelector('[data-marker-detail-action="revert-marker-name"]')?.click();
      detail?.querySelector('[data-marker-detail-action="ask-ai"]')?.click();
      outcomes.defaultDelegatesCallGlobalMarkerActions =
        calls.some(call => call[0] === 'pin' && call[1] === albuminId)
        && calls.some(call => call[0] === 'rename' && call[1] === albuminId)
        && calls.some(call => call[0] === 'revert-name' && call[1] === albuminId)
        && calls.some(call => call[0] === 'ask-ai' && call[1] === albuminId);

      const icon = document.createElement('span');
      icon.textContent = '*';
      document.body.appendChild(icon);
      modal.pickNewCatIcon(icon);
      outcomes.defaultEmojiPickerNoops = icon.textContent === '*';

      modal.showDetailModal('calculatedRatios_phenoAge');
      await wait(80);
      const bioText = document.getElementById('detail-modal')?.textContent || '';
      outcomes.bioAgeDetailUsesStandardCrpPresenceFallback =
        bioText.includes('PhenoAge')
        && !bioText.includes('Missing: hs-CRP')
        && !bioText.includes('Missing on latest date');

      modal.closeModal();
      outcomes.closeModalRunsCleanupHooks =
        calls.some(call => call[0] === 'close-emf')
        && calls.some(call => call[0] === 'uninstall-focus')
        && !document.getElementById('modal-overlay')?.classList.contains('show');
    } finally {
      state.importedData = saved.importedData;
      state.markerRegistry = saved.markerRegistry;
      state.currentProfile = saved.currentProfile;
      state.currentView = saved.currentView;
      state.profileSex = saved.profileSex;
      state.profileDob = saved.profileDob;
      state.unitSystem = saved.unitSystem;
      state.showAltUnits = saved.showAltUnits;
      state.rangeMode = saved.rangeMode;
      state.chartInstances = saved.chartInstances;
      for (const [key, info] of Object.entries(savedWindow)) {
        if (info.had) window[key] = info.value;
        else delete window[key];
      }
      data.invalidateActiveDataCache();
      modal.configureMarkerDetailModal({
        navigate: (category, payload) => window.navigate?.(category, payload),
        isDashboardQuickMarkerPinned: () => false,
        toggleDashboardQuickMarkerPin: id => globalThis.toggleDashboardQuickMarkerPin?.(id),
        renameMarker: id => globalThis.renameMarker?.(id),
        revertMarkerName: id => globalThis.revertMarkerName?.(id),
        askAIAboutMarker: id => globalThis.askAIAboutMarker?.(id),
        showEmojiPicker: () => {},
      });
      document.getElementById('modal-overlay')?.classList.remove('show');
      document.getElementById('detail-modal')?.replaceChildren();
      document.querySelectorAll('.notification-toast,.confirm-overlay').forEach(el => el.remove());
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return outcomes;
  }, { modalUrl: moduleUrl('/js/marker-detail-modal.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
