import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?cycleBrowserCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function expectAll(outcomes) {
  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
}

test('cycle browser coverage exercises editor save clear and period guards', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ cycleStoreCoverageUrl, cycleUrl }) => {
    const [{ state }, cycle, cycleRuntime, tour, cycleStore, cycleStoreCoverage, contextCardsRuntime] = await Promise.all([
      import('/js/state.js'),
      import(cycleUrl),
      import('/js/cycle-runtime.js'),
      import('/js/tour.js'),
      import('/js/cycle-store.js'),
      import(cycleStoreCoverageUrl),
      import('/js/context-cards-runtime.js'),
    ]);
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const outcomes = {};
    const calls = [];
    let injectedNav = null;
    let injectedCycleSurface = null;
    const saved = {
      importedData: clone(state.importedData),
      profileDob: state.profileDob,
      encryptionEnabled: localStorage.getItem('labcharts-encryption-enabled'),
    };
    const cycleStoreCoverageProfile = `cycle-store-coverage-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const previousContextCardsRuntime = contextCardsRuntime.configureContextCardsRuntimeCallbacks({
      recordChange: field => calls.push(['record', field]),
    });
    const cycleTourKey = `labcharts-${state.currentProfile}-cycleTour`;
    const savedCycleTourState = localStorage.getItem(cycleTourKey);
    const waitFor = async (predicate, attempts = 25, delayMs = 0) => {
      for (let i = 0; i < attempts; i += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      return false;
    };
    const waitForDialog = selector => waitFor(() => !!document.querySelector(selector));
    const toasts = () => Array.from(document.querySelectorAll('.notification-toast')).map(el => el.textContent || '');
    const clearToasts = () => document.querySelectorAll('.notification-toast').forEach(el => el.remove());
    const modal = () => document.getElementById('detail-modal');
    const overlay = () => document.getElementById('modal-overlay');
    const previousCycleRuntime = cycleRuntime.configureCycleRuntimeDeps({
      closeModal: () => {
        calls.push(['close']);
        overlay()?.classList.remove('show');
      },
      navigate: category => {
        calls.push(['navigate', category]);
        if (category === 'cycle' && !injectedCycleSurface) {
          injectedCycleSurface = document.createElement('button');
          injectedCycleSurface.className = 'cycle-summary-card';
          injectedCycleSurface.textContent = 'Cycle summary';
          document.body.appendChild(injectedCycleSurface);
        }
      },
    });

    try {
      localStorage.setItem('labcharts-encryption-enabled', 'false');
      await cycleStoreCoverage.upsertCycleObservation(cycleStoreCoverageProfile, {
        source: 'coverage',
        importId: 'coverage-import',
        date: '2026-07-01',
        bleeding: { flow: 'light' },
      });
      const storedObservation = await cycleStoreCoverage.getCycleObservation(
        cycleStoreCoverageProfile,
        'coverage',
        '2026-07-01',
      );
      const rawRange = await cycleStoreCoverage.getCycleObservationRangeRaw(
        cycleStoreCoverageProfile,
        'coverage',
        '2026-07-01',
        '2026-07-31',
      );
      await cycleStoreCoverage.setCycleMeta(cycleStoreCoverageProfile, 'coverage-key', { ready: true });
      const storedMeta = await cycleStoreCoverage.getCycleMeta(cycleStoreCoverageProfile, 'coverage-key');
      await cycleStoreCoverage.deleteCycleMeta(cycleStoreCoverageProfile, 'coverage-key');
      const deletedMeta = await cycleStoreCoverage.getCycleMeta(cycleStoreCoverageProfile, 'coverage-key');
      await cycleStoreCoverage.clearCycleSource(cycleStoreCoverageProfile, 'coverage');
      const clearedSourceCount = await cycleStoreCoverage.countCycleSource(cycleStoreCoverageProfile, 'coverage');

      localStorage.setItem('labcharts-encryption-enabled', 'true');
      let lockedWriteRejected = false;
      try {
        await cycleStoreCoverage.upsertCycleObservation(cycleStoreCoverageProfile, {
          source: 'coverage',
          importId: 'locked-import',
          date: '2026-07-02',
        });
      } catch (error) {
        lockedWriteRejected = error?.code === 'session-locked';
      }
      localStorage.setItem('labcharts-encryption-enabled', 'false');
      await cycleStoreCoverage.upsertCycleObservationBatchRaw(cycleStoreCoverageProfile, [{
        source: 'coverage',
        importId: 'encrypted-import',
        date: '2026-07-03',
        _payload: { _enc: 'v1', iv: 'coverage', ct: 'coverage' },
      }]);
      const unavailableDecryption = await cycleStoreCoverage.getCycleObservation(
        cycleStoreCoverageProfile,
        'coverage',
        '2026-07-03',
      );
      outcomes.cycleStoreCoversObservationSourceMetaAndDefaultCryptoPaths =
        storedObservation?.bleeding?.flow === 'light'
        && rawRange.length === 1
        && storedMeta?.ready === true
        && deletedMeta === null
        && clearedSourceCount === 0
        && lockedWriteRejected
        && unavailableDecryption === null;

      if (!overlay()) {
        const createdOverlay = document.createElement('div');
        createdOverlay.id = 'modal-overlay';
        document.body.appendChild(createdOverlay);
      }
      if (!modal()) {
        const createdModal = document.createElement('div');
        createdModal.id = 'detail-modal';
        overlay().appendChild(createdModal);
      }
      document.querySelectorAll('.nav-item.active').forEach(el => el.classList.remove('active'));
      const nav = document.createElement('button');
      nav.className = 'nav-item active';
      nav.dataset.category = 'cycle';
      document.body.appendChild(nav);
      injectedNav = nav;

      tour.endTour({ openEmptyChat: false });
      localStorage.removeItem(cycleTourKey);

      state.profileDob = '1974-01-01';
      state.importedData = {
        ...state.importedData,
        menstrualCycle: {
          cycleStatus: 'perimenopause',
          cycleLength: 35,
          periodLength: 5,
          regularity: 'irregular',
          flow: 'heavy',
          contraceptive: 'Barrier',
          conditions: 'PCOS',
          periods: [
            { startDate: '2026-01-01', endDate: '2026-01-05', flow: 'heavy', symptoms: ['Hot flashes'], notes: 'baseline' },
            { startDate: '2026-02-10', endDate: '2026-02-15', flow: 'heavy', symptoms: ['Night sweats'], notes: 'longer' },
            { startDate: '2026-03-28', endDate: '2026-04-02', flow: 'heavy', symptoms: ['Cramps'], notes: 'heavy' },
            { startDate: '2026-05-25', endDate: '2026-05-30', flow: 'moderate', symptoms: [], notes: '' },
          ],
        },
      };
      const labData = {
        dates: ['2026-01-03', '2026-02-12', '2026-03-30', '2026-05-28'],
        categories: {
          hematology: {
            markers: {
              ferritin: { values: [18, 14, 9, 8], refMin: 15, refMax: 150, unit: 'ng/mL' },
            },
          },
        },
      };

      const stats = cycle.calculateCycleStats(state.importedData.menstrualCycle.periods);
      outcomes.calculateStatsUsesPeriodHistory = stats.cycleLength > 35
        && stats.periodLength === 6
        && stats.flow === 'heavy'
        && stats.regularity === 'very_irregular';

      const activeHtml = cycle.renderMenstrualCycleSection(labData);
      outcomes.renderCycleSectionShowsSummaryPhasesAndAlerts = activeHtml.includes('Possible Perimenopause Pattern')
        && activeHtml.includes('Ferritin + Heavy Flow')
        && activeHtml.includes('cycle-draw-phases')
        && activeHtml.includes('severity-major')
        && activeHtml.includes('PCOS');

      const savedCycle = state.importedData.menstrualCycle;
      state.importedData.menstrualCycle = null;
      const promptHtml = cycle.renderMenstrualCycleSection({ dates: [], categories: {} });
      outcomes.renderCyclePromptWhenUnset = promptHtml.includes('cycle-prompt')
        && promptHtml.includes('Track your cycle for better lab interpretation');
      state.importedData.menstrualCycle = savedCycle;

      await cycle.openMenstrualCycleEditor();
      const statusSelect = document.getElementById('mc-cycle-status');
      statusSelect.value = 'postmenopause';
      statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
      outcomes.statusToggleHidesActiveFields = statusSelect.getAttribute('data-cycle-action') === 'toggle-fields'
        && document.getElementById('mc-active-fields')?.hidden === true
        && document.getElementById('mc-period-log-section')?.hidden === true;
      statusSelect.value = 'regular';
      statusSelect.dispatchEvent(new Event('change', { bubbles: true }));

      const startInput = document.getElementById('mc-period-start');
      const endInput = document.getElementById('mc-period-end');
      startInput.value = '';
      endInput.value = '2026-06-02';
      cycle.addPeriodEntry();
      outcomes.addPeriodRequiresStartDate = toasts().some(text => text.includes('Start date is required'));
      clearToasts();

      startInput.value = '2026-01-04';
      endInput.value = '2026-01-06';
      cycle.addPeriodEntry();
      outcomes.addPeriodRejectsOverlap = toasts().some(text => text.includes('overlaps with an existing period entry'));
      clearToasts();

      startInput.value = '2026-06-20';
      endInput.value = '2026-06-18';
      cycle.addPeriodEntry();
      outcomes.addPeriodRejectsInvalidEnd = toasts().some(text => text.includes('End date must be on or after start date'));
      clearToasts();

      startInput.value = '2026-06-20';
      endInput.value = '2026-06-24';
      document.getElementById('mc-period-flow').value = 'light';
      document.getElementById('mc-period-notes').value = 'new notes';
      const symptomButtons = Array.from(document.querySelectorAll('#mc-period-symptoms .ctx-tag'));
      symptomButtons[0]?.click();
      symptomButtons[1]?.click();
      document.querySelector('.cycle-add-btn')?.click();
      const added = state.importedData.menstrualCycle.periods.find(p => p.startDate === '2026-06-20');
      outcomes.addPeriodCollectsSymptomsAndReopensEditor = added?.flow === 'light'
        && added.symptoms.length === 2
        && added.notes === 'new notes'
        && overlay()?.classList.contains('show')
        && modal()?.textContent.includes('Jun 20, 2026');

      document.querySelector('[data-cycle-action="delete-period"][data-cycle-start-date="2026-06-20"]')?.click();
      outcomes.deletePeriodRemovesEntryAndReopensEditor = !state.importedData.menstrualCycle.periods.some(p => p.startDate === '2026-06-20')
        && overlay()?.classList.contains('show');

      document.getElementById('mc-contraceptive').value = 'Copper IUD';
      document.getElementById('mc-conditions').value = 'endometriosis';
      document.getElementById('mc-period-start').value = '2026-07-01';
      document.getElementById('mc-period-end').value = '2026-07-05';
      document.getElementById('mc-period-flow').value = 'heavy';
      document.querySelector('#mc-period-symptoms .ctx-tag')?.click();
      document.getElementById('mc-period-notes').value = 'pending save';
      const saveBefore = calls.length;
      cycle.saveMenstrualCycle();
      const tourStartedAfterSave = await waitFor(
        () => document.getElementById('tour-tooltip')?.textContent?.includes('Cycle-Aware Lab Interpretation'),
        80,
        25
      );
      const saveCalls = calls.slice(saveBefore);
      const savedPeriod = state.importedData.menstrualCycle.periods.find(p => p.startDate === '2026-07-01');
      outcomes.saveSyncsFormPendingPeriodNavigatesAndTours = state.importedData.menstrualCycle.contraceptive === 'Copper IUD'
        && state.importedData.menstrualCycle.conditions === 'endometriosis'
        && savedPeriod?.flow === 'heavy'
        && savedPeriod.notes === 'pending save'
        && saveCalls.some(call => call[0] === 'record' && call[1] === 'menstrualCycle')
        && saveCalls.some(call => call[0] === 'close')
        && saveCalls.some(call => call[0] === 'navigate' && call[1] === 'cycle')
        && tourStartedAfterSave
        && toasts().some(text => text.includes('Menstrual cycle profile saved'));
      clearToasts();
      tour.endTour();

      await cycle.openMenstrualCycleEditor();
      const clearCancel = cycle.clearMenstrualCycle();
      await waitForDialog('#confirm-cancel');
      document.getElementById('confirm-cancel')?.click();
      await clearCancel;
      outcomes.clearCancelKeepsCycleData = !!state.importedData.menstrualCycle;

      await cycleStore.upsertCycleObservation(state.currentProfile, {
        source: 'clue', importId: 'clear-all-browser-import', date: '2026-07-01', note: 'must be deleted', bleeding: { flow: 'heavy' },
      });
      await cycleStore.saveCycleImportMeta(state.currentProfile, {
        importId: 'clear-all-browser-import', source: 'clue', sourceFile: 'ClueBackup.json', observationCount: 1,
      });
      const clearBefore = calls.length;
      const clearConfirm = cycle.clearMenstrualCycle();
      await waitForDialog('#confirm-ok');
      document.getElementById('confirm-ok')?.click();
      await clearConfirm;
      const clearCalls = calls.slice(clearBefore);
      outcomes.clearConfirmResetsCycleAndNavigates = state.importedData.menstrualCycle === null
        && clearCalls.some(call => call[0] === 'record' && call[1] === 'menstrualCycle')
        && clearCalls.some(call => call[0] === 'close')
        && clearCalls.some(call => call[0] === 'navigate' && call[1] === 'cycle')
        && toasts().some(text => text.includes('Menstrual cycle data cleared'));
      outcomes.clearConfirmDeletesRawCycleDatabase = (await cycleStore.getAllCycleObservationsRaw(state.currentProfile)).length === 0
        && (await cycleStore.getAllCycleImportMetaRaw(state.currentProfile)).length === 0;

      const detachedModal = modal();
      detachedModal?.remove();
      outcomes.openEditorFailsClosedWithoutModal = detachedModal instanceof HTMLElement
        && await cycle.openMenstrualCycleEditor() === false;
    } finally {
      state.importedData = saved.importedData;
      state.profileDob = saved.profileDob;
      if (saved.encryptionEnabled == null) localStorage.removeItem('labcharts-encryption-enabled');
      else localStorage.setItem('labcharts-encryption-enabled', saved.encryptionEnabled);
      await cycleStoreCoverage.deleteCycleDB(cycleStoreCoverageProfile).catch(() => {});
      cycleRuntime.configureCycleRuntimeDeps(previousCycleRuntime);
      contextCardsRuntime.configureContextCardsRuntimeCallbacks(previousContextCardsRuntime);
      tour.endTour();
      if (savedCycleTourState) localStorage.setItem(cycleTourKey, savedCycleTourState);
      else localStorage.removeItem(cycleTourKey);
      document.querySelectorAll('.notification-container,.notification-toast,.confirm-overlay').forEach(el => el.remove());
      injectedNav?.remove();
      injectedCycleSurface?.remove();
      document.querySelectorAll('.nav-item.active').forEach(el => el.classList.remove('active'));
    }

    return outcomes;
  }, {
    cycleStoreCoverageUrl: moduleUrl('/js/cycle-store.js'),
    cycleUrl: moduleUrl('/js/cycle.js'),
  });

  expectAll(results);
});
