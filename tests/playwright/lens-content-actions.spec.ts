import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {prepareDemoProfile} from './biology-score-fixture.js';
import {expect, test} from './coverage-fixture.js';

test('typed lens controls preserve shell action delegates without changing imported data', async ({page}) => {
  await installDiscussionFixture(page.context());
  await prepareDemoProfile(page);
  expect(await page.evaluate(async () => (await import('/js/views-runtime.js')).navigate('body'))).toBe(true);

  const result = await page.evaluate(async () => {
    const [{state}, {createLensPageHandlers}, shell, presentation, contextRuntime, dnaBridge, settingsBridge] = await Promise.all([
      import('/js/state.js'),
      import('/js/lens-pages.js'),
      import('/js/lens-page-shell.js'),

      import('/js/lens-content-presentation.js'),
      import('/js/context-cards-runtime.js'),
      import('/js/dna-runtime-bridge.js'),
      import('/js/settings-runtime-bridge.js'),
    ]);
    const main = document.getElementById('main-content');
    if (!main) throw new Error('Missing app content mount');
    const previousHTML = main.innerHTML;
    const previousBodyClass = document.body.className;
    const previousData = state.importedData;
    const calls: (string | number)[][] = [];
    let hidden: string[] = [];
    const previousContext = contextRuntime.configureContextCardsRuntimeCallbacks({
      triggerDNAFilePicker: () => { calls.push(['raw-dna']); },
    });
    const previousDna = dnaBridge.configureDnaModuleBridge({
      importSnpReport: () => { calls.push(['snp-report']); },
      openManualSnpModal: () => { calls.push(['manual-snp']); },
      reimportDNA: () => { calls.push(['reimport-dna']); },
      confirmDeleteDNA: () => { calls.push(['delete-dna']); },
    });
    const previousSettings = settingsBridge.configureSettingsModuleBridge({
      openSettingsModal: (pane: string) => { calls.push(['settings', pane]); },
    });
    const previousShell = shell.configureLensPageShell({
      navigate: route => { calls.push(['navigate', route]); },
      openChatPanel: () => { calls.push(['chat']); },
      openEMFAssessmentEditor: async () => { calls.push(['emf']); },
      openDashboardBiometricPicker: () => { calls.push(['metrics']); },
      addDashboardWidgetFromLens: id => { calls.push(['add', id]); },
      removeDashboardWidgetFromLens: id => { calls.push(['remove', id]); },
      getAvailableDashboardFixedWidgetIds: () => [],
      getDashboardWidgetPrefs: () => ({hidden}),
    });
    const {createDashboardWidgetRenderers} = await import('/js/dashboard-widget-renderers.js');
    const projectors = createDashboardWidgetRenderers({markerHasData: () => false, rerenderDashboardFromWidgetChange: () => {}, showRecommendations: () => {}});
    const handlers = createLensPageHandlers({
      ...projectors,
      projectDashboardWearableTilesWidget: (): ReturnType<typeof projectors.projectDashboardWearableTilesWidget> => ({kind: 'wearables', count: '0', pluralSuffix: 's', sync: {stale: false, label: ''}, rows: []}),
      getLensContentGrid: shell.getLensContentGrid,
      getLensWidgetChrome: shell.getLensWidgetChrome,
      setupDropZone: () => {},
      buildDashboardWidgetContext: (data: unknown) => ({data}),
      loadFocusCard: () => {},
      getDashboardWidgetPrefs: () => ({hidden}),
      getCachedRecommendationsCatalog: () => null,
      refreshRecommendationsWhenCatalogReady: () => {},
      getGlobalRecommendationCandidates: () => [],
      renderRecommendationCard: () => '',
      renderRecommendationsEmpty: () => '',
      lensPageActionAttrs: shell.lensPageActionAttrs,
      renderLensHeader: shell.renderLensHeader,
      renderLensPageWidgets: shell.renderLensPageWidgets,
      renderLensWidget: shell.renderLensWidget,
    });
    const click = (selector: string, label: string) => {
      const button = main.querySelector<HTMLButtonElement>(selector);
      if (!button || button.tagName !== 'BUTTON' || button.textContent?.trim() !== label) {
        throw new Error(`Expected rendered button ${label}: ${selector}`);
      }
      if (!button.hasAttribute('data-lens-content-view')) throw new Error(`Missing typed content ownership: ${label}`);
      if (button.hasAttribute('onclick')) throw new Error(`Unexpected inline handler: ${label}`);
      button.click();
    };
    const headerAction = (action: string) => `.lens-page-header button[data-lens-page-action="${action}"]`;
    const assertDataUnchanged = (snapshot: string) => {
      if (JSON.stringify(state.importedData) !== snapshot) throw new Error('Lens action changed imported data');
    };

    try {
      state.importedData = {
        ...previousData,
        genetics: {source: 'Local regression fixture', snps: {rs1801133: {genotype: 'GA', gene: 'MTHFR'}}},
      } as typeof state.importedData;
      let snapshot = JSON.stringify(state.importedData);
      handlers.showGenomeLens();
      click(headerAction('import-dna'), 'Import raw DNA');
      click(headerAction('import-snp-report'), 'Import report');
      click(headerAction('add-manual-snp'), 'Add SNP manually');
      click('[data-widget-id="genome-import"] button[data-lens-page-action="reimport-dna"]', 'Re-import');
      click('[data-widget-id="genome-import"] button[data-lens-page-action="delete-dna"]', 'Delete genome data');
      assertDataUnchanged(snapshot);
      const genomeCalls = calls.splice(0);

      state.importedData = {...state.importedData, wearableConnections: {}, wearableSummary: undefined} as typeof state.importedData;
      snapshot = JSON.stringify(state.importedData);
      handlers.showBodyLens();
      click(headerAction('open-wearables-settings'), 'Connect source');
      click(headerAction('open-biometric-picker'), 'Choose metrics');
      const emptySource = main.querySelector<HTMLButtonElement>('[data-widget-id="body-sources"] button[data-lens-content-view][data-lens-page-action="open-wearables-settings"]');
      if (!emptySource?.textContent?.includes('Connect body data') || !emptySource.hasAttribute('data-lens-content-view')) {
        throw new Error('Missing typed empty source control');
      }
      emptySource.click();
      assertDataUnchanged(snapshot);
      const emptyBodyCalls = calls.splice(0);

      state.importedData = {
        ...state.importedData,
        wearableConnections: {manual: {coverageDays: 7}, Oura: {coverageDays: 14}},
      } as typeof state.importedData;
      snapshot = JSON.stringify(state.importedData);
      handlers.showBodyLens();
      const sourceButtons = Array.from(main.querySelectorAll<HTMLButtonElement>('[data-widget-id="body-sources"] [data-lens-content-view].dashboard-widget-picker-grid > button[data-lens-page-action="open-wearables-settings"]'));
      const sourceLabels = sourceButtons.map(button => button.querySelector('.dashboard-widget-picker-title')?.textContent);
      if (sourceButtons.length !== 2) throw new Error('Expected two connected source controls');
      for (const button of sourceButtons) {
        if (!button.closest('[data-lens-content-view]') || button.dataset.lensPageAction !== 'open-wearables-settings') {
          throw new Error('Unexpected connected source action owner');
        }
        button.click();
      }
      assertDataUnchanged(snapshot);
      const connectedBodyCalls = calls.splice(0);

      // Exercise the actual typed Insight controls and real header/delegate owner,
      // without invoking unrelated context-card health/AI loaders in this action fixture.
      main.innerHTML = shell.renderLensHeader('Insight', '', {kind:'actions',view:presentation.projectLensActions('insight')});
      click(headerAction('open-ai-chat'), 'Open AI chat');
      click(headerAction('open-emf-assessment'), 'EMF assessment');
      click(headerAction('open-recommendations'), 'Tips');
      assertDataUnchanged(snapshot);
      const insightCalls = calls.splice(0);

      handlers.showRecommendations(state.importedData);
      click(headerAction('remove-dashboard-widget'), 'Remove from Dashboard');
      click(headerAction('open-privacy-settings'), 'Disclosure & settings');
      hidden = ['recommendations'];
      handlers.showRecommendations(state.importedData);
      click(headerAction('add-dashboard-widget'), 'Add to Dashboard');
      assertDataUnchanged(snapshot);
      const tipsCalls = calls.splice(0);
      return {genomeCalls, emptyBodyCalls, sourceLabels, connectedBodyCalls, insightCalls, tipsCalls};
    } finally {
      contextRuntime.configureContextCardsRuntimeCallbacks(previousContext);
      dnaBridge.configureDnaModuleBridge({
        importSnpReport: null, openManualSnpModal: null, reimportDNA: null, confirmDeleteDNA: null, ...previousDna,
      });
      settingsBridge.configureSettingsModuleBridge(previousSettings);
      shell.configureLensPageShell(previousShell);
      state.importedData = previousData;
      main.innerHTML = previousHTML;
      document.body.className = previousBodyClass;
    }
  });

  expect(result.genomeCalls).toEqual([['raw-dna'], ['snp-report'], ['manual-snp'], ['reimport-dna'], ['delete-dna']]);
  expect(result.emptyBodyCalls).toEqual([['settings', 'wearables'], ['metrics'], ['settings', 'wearables']]);
  expect(result.sourceLabels).toEqual(['Manual logs', 'Oura']);
  expect(result.connectedBodyCalls).toEqual([['settings', 'wearables'], ['settings', 'wearables']]);
  expect(result.insightCalls).toEqual([['chat'], ['emf'], ['navigate', 'recommendations']]);
  expect(result.tipsCalls).toEqual([['remove', 'recommendations'], ['settings', 'privacy'], ['add', 'recommendations']]);
});
