import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?lensPageShellCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function prepareApp(page) {
  await page.addInitScript(() => {
    const profileId = localStorage.getItem('labcharts-active-profile') || 'default';
    localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(async () => {
    const { state } = await import('/js/state.js');
    return !!state;
  });
}

test('lens page shell default dashboard deps render fallback widgets', async ({ page }) => {
  await prepareApp(page);

  const results = await page.evaluate(async ({ shellUrl }) => {
    const shell = await import(shellUrl);
    const defaultHtml = shell.renderLensWidget(
      'lab-marker',
      'Lab marker',
      'Default deps',
      '<p>Body</p>'
    );
    shell.configureLensPageShell({
      getAvailableDashboardFixedWidgetIds: () => ['lab-marker'],
    });
    const defaultPrefsHtml = shell.renderLensWidget(
      'lab-marker',
      'Lab marker',
      'Default prefs',
      ''
    );

    return {
      defaultAvailableIdsHideDashboardToggle: !defaultHtml.includes('lens-widget-dashboard-toggle'),
      defaultWidgetRendersTitle: defaultHtml.includes('Lab marker'),
      defaultWidgetRendersDescription: defaultHtml.includes('Default deps'),
      defaultWidgetRendersBody: defaultHtml.includes('<p>Body</p>'),
      configuredIdsRenderDashboardToggle: defaultPrefsHtml.includes('lens-widget-dashboard-toggle'),
      defaultPrefsRenderVisibleDashboardAction: defaultPrefsHtml.includes('Remove from Dashboard'),
      emptyBodyUsesDefaultFallback: defaultPrefsHtml.includes('No data available yet.'),
    };
  }, { shellUrl: moduleUrl('/js/lens-page-shell.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('lens page shell delegates move and dashboard toggle actions', async ({ page }) => {
  await prepareApp(page);

  const results = await page.evaluate(async () => {
    const [{ state }, dataModule, shell, profile, contextCardsRuntime, dnaBridge, settingsBridge, views, nav] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/lens-page-shell.js'),
      import('/js/profile.js'),
      import('/js/context-cards-runtime.js'),
      import('/js/dna-runtime-bridge.js'),
      import('/js/settings-runtime-bridge.js'),
      import('/js/views.js'),
      import('/js/nav.js'),
    ]);
    const originalView = state.currentView;
    const profileId = profile.getActiveProfileId() || state.currentProfile || 'default';
    const labsOrderKey = `labcharts-${profileId}-lensPageOrder-labs-v1`;
    const savedLabsOrder = localStorage.getItem(labsOrderKey);
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const calls = [];
    const previousContextCardsRuntime = contextCardsRuntime.configureContextCardsRuntimeCallbacks({
      triggerDNAFilePicker: () => calls.push(['trigger-dna']),
    });
    const previousSettingsBridge = settingsBridge.configureSettingsModuleBridge({
      openSettingsModal: pane => calls.push(['settings', pane]),
    });
    const previousDnaBridge = dnaBridge.configureDnaModuleBridge({
      reimportDNA: () => calls.push(['reimport-dna']),
      confirmDeleteDNA: () => calls.push(['delete-dna']),
    });
    const restoreShell = shell.configureLensPageShell({
      addDashboardWidgetFromLens: id => calls.push(['add', id]),
      navigate: route => {
        calls.push(['navigate', route]);
        views.navigate(route);
      },
      openChatPanel: () => calls.push(['chat']),
      openEMFAssessmentEditor: () => calls.push(['emf']),
      openDashboardBiometricPicker: () => calls.push(['biometrics']),
      removeDashboardWidgetFromLens: id => calls.push(['remove', id]),
    });

    try {
      if (!dataModule.getActiveData()?.dates?.length) {
        const resp = await fetch('data/demo-male.json');
        state.importedData = await resp.json();
        state.profileSex = 'male';
        state.profileDob = '1987-11-22';
        await dataModule.saveImportedData();
        nav.buildSidebar();
      }

      localStorage.removeItem(labsOrderKey);
      views.navigate('labs');
      await delay(120);

      const widgets = document.querySelector('.lens-page-widgets[data-lens-route="labs"]');
      const beforeFirst = widgets?.querySelector('.dashboard-widget[data-widget-id]')?.dataset.widgetId || '';
      widgets?.querySelector('.dashboard-widget[data-widget-id] [data-lens-page-action="move-widget"][data-lens-page-direction="1"]')?.click();
      await delay(120);
      const afterFirst = document.querySelector('.lens-page-widgets[data-lens-route="labs"] .dashboard-widget[data-widget-id]')?.dataset.widgetId || '';

      const dashboardToggle = document.querySelector('.lens-page-widgets[data-lens-route="labs"] .lens-widget-dashboard-toggle[data-lens-page-action]');
      const toggleAction = dashboardToggle?.dataset.lensPageAction || '';
      const toggleId = dashboardToggle?.dataset.lensPageId || '';
      dashboardToggle?.click();
      await delay(50);

      const actionFixture = document.createElement('div');
      actionFixture.className = 'lens-page-header';
      actionFixture.innerHTML = `
        <button type="button" data-lens-page-action="import-dna"></button>
        <button type="button" data-lens-page-action="reimport-dna"></button>
        <button type="button" data-lens-page-action="delete-dna"></button>
        <button type="button" data-lens-page-action="open-wearables-settings"></button>
        <button type="button" data-lens-page-action="open-biometric-picker"></button>
        <button type="button" data-lens-page-action="open-ai-chat"></button>
        <button type="button" data-lens-page-action="open-emf-assessment"></button>
        <button type="button" data-lens-page-action="open-recommendations"></button>
        <button type="button" data-lens-page-action="open-privacy-settings"></button>`;
      document.body.appendChild(actionFixture);
      actionFixture.querySelectorAll('button').forEach(button => button.click());
      actionFixture.remove();
      await delay(50);

      return {
        shellRenders: !!widgets,
        noInlineHandlers: !!widgets && !widgets.querySelector('.dashboard-widget-tools [onclick], .dashboard-widget-tools [onkeydown]'),
        moveDataAttributes: !!widgets?.querySelector('[data-lens-page-action="move-widget"][data-lens-page-direction="1"]'),
        moveReordersSections: !!beforeFirst && !!afterFirst && beforeFirst !== afterFirst,
        dashboardToggleCallsBridge: !!toggleAction && !!toggleId
          && calls.some(([kind, id]) => id === toggleId && `${kind}-dashboard-widget` === toggleAction),
        headerActionsCallBridges: [
          ['trigger-dna'],
          ['reimport-dna'],
          ['delete-dna'],
          ['settings', 'wearables'],
          ['biometrics'],
          ['chat'],
          ['emf'],
          ['navigate', 'recommendations'],
          ['settings', 'privacy'],
        ].every(expected => calls.some(call => call[0] === expected[0] && (expected.length < 2 || call[1] === expected[1]))),
      };
    } finally {
      contextCardsRuntime.configureContextCardsRuntimeCallbacks(previousContextCardsRuntime);
      dnaBridge.configureDnaModuleBridge({
        reimportDNA: null,
        confirmDeleteDNA: null,
        ...previousDnaBridge,
      });
      settingsBridge.configureSettingsModuleBridge(previousSettingsBridge);
      shell.configureLensPageShell(restoreShell);
      if (savedLabsOrder == null) localStorage.removeItem(labsOrderKey);
      else localStorage.setItem(labsOrderKey, savedLabsOrder);
      if (originalView) views.navigate(originalView);
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('lens page browser coverage renders genome details and marker-backed labs', async ({ page }) => {
  await prepareApp(page);

  const results = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { createLensPageHandlers } = await import('/js/lens-pages.js');
    const main = document.getElementById('main-content');
    const originalData = state.importedData ? JSON.parse(JSON.stringify(state.importedData)) : state.importedData;
    const originalBodyClass = document.body.className;
    const originalMainHTML = main?.innerHTML || '';
    const setupCalls = [];

    const renderLensHeader = (title, description, actions = '') => `<header class="lens-page-header">
      <h1>${title}</h1>
      <p>${description}</p>
      <div class="lens-page-actions">${actions}</div>
    </header>`;
    const renderLensPageWidgets = (route, widgets) => `<section class="lens-page-widgets" data-lens-route="${route}">
      ${widgets.filter(Boolean).map(widget => `<article class="dashboard-widget" data-widget-id="${widget.id}">
        <h2>${widget.title}</h2>
        <p>${widget.description}</p>
        <div class="dashboard-widget-body">${widget.body}</div>
      </article>`).join('')}
    </section>`;

    const handlers = createLensPageHandlers({
      setupDropZone: () => setupCalls.push('setup'),
      buildDashboardWidgetContext: data => ({ data }),
      renderLabsPriorityBanner: () => '<section data-testid="labs-priority">Priority labs</section>',
      renderDashboardQuickMarkersWidget: () => '<div data-testid="quick-markers">Quick markers</div>',
      renderDashboardKeyTrendsWidget: () => '<div data-testid="key-trends">Key trends</div>',
      renderDashboardGenomeWidget: () => '<div data-testid="genome-widget">Genome widget</div>',
      renderDashboardWearableTilesWidget: () => '',
      renderDashboardInsightsListWidget: () => '',
      renderDashboardRecommendationsWidget: () => '',
      renderFocusCard: () => '',
      loadFocusCard: () => {},
      getDashboardWidgetPrefs: () => ({ hidden: [] }),
      getCachedRecommendationsCatalog: () => null,
      refreshRecommendationsWhenCatalogReady: () => {},
      getGlobalRecommendationCandidates: () => [],
      renderRecommendationCard: candidate => `<div>${candidate?.title || ''}</div>`,
      renderRecommendationsEmpty: () => '<div>Empty recommendations</div>',
      lensPageActionAttrs: (action, values = {}) => `data-lens-page-action="${action}" data-lens-page-id="${values.id || ''}"`,
      renderLensHeader,
      renderLensPageWidgets,
      renderLensWidget: (id, title, description, body) => `<article data-widget-id="${id}"><h2>${title}</h2><p>${description}</p>${body}</article>`,
    });

    try {
      state.importedData = {
        ...(state.importedData || {}),
        genetics: {
          source: '23andMe <raw>',
          importDate: '2026-02-03',
          coverage: { found: 1234, total: 5678 },
          apoe: 'E3/E4',
          snps: {
            rs1801133: { genotype: 'GA', gene: 'MTHFR' },
            rs429358: { genotype: 'CT', gene: 'APOE' },
          },
          mtdna: {
            haplogroup: 'H1',
            importDate: '2026-02-04',
            coupling: {
              label: 'Stored maternal lineage',
              shortLabel: 'Maternal lineage',
            },
          },
        },
      };
      handlers.showGenomeLens();
      const genomeText = main?.textContent || '';
      const genomeHtml = main?.innerHTML || '';
      const genomeCardCount = main?.querySelectorAll('.genetics-overview-card').length || 0;

      state.importedData = { ...(state.importedData || {}), genetics: { snps: {}, effects: {} } };
      handlers.showGenomeLens();
      const emptyGenomeHtml = main?.innerHTML || '';

      handlers.showLabs({
        dates: [],
        categories: {
          lipids: {
            markers: {
              ldl: { values: [null, 93] },
            },
          },
        },
      });
      const markerBackedLabsHtml = main?.innerHTML || '';

      handlers.showLabs({
        dates: [],
        categories: {
          lipids: {
            markers: {
              ldl: { values: [null, null] },
            },
          },
        },
      });
      const emptyLabsHtml = main?.innerHTML || '';

      return {
        genomeLensRenders: genomeText.includes('DNA findings and traits linked to your labs') && genomeText.includes('Genome widget'),
        genomeImportDetailsRender: genomeCardCount >= 4
          && genomeHtml.includes('genome-import-details')
          && genomeHtml.includes('23andMe &lt;raw&gt;')
          && !genomeHtml.includes('23andMe <raw>'),
        genomeCoverageAndMtdnaRender: genomeText.includes('1,234 / 5,678 catalog SNPs matched')
          && genomeText.includes('mtDNA H1')
          && genomeText.includes('Stored maternal lineage'),
        genomeControlsRender: genomeHtml.includes('data-lens-page-action="reimport-dna"')
          && genomeHtml.includes('data-lens-page-action="delete-dna"')
          && !genomeHtml.includes('onclick='),
        emptyGenomeOmitsImportDetails: !emptyGenomeHtml.includes('genome-import-details'),
        markerBackedLabsSkipDropZone: markerBackedLabsHtml.includes('data-testid="labs-priority"')
          && !markerBackedLabsHtml.includes('id="drop-zone"'),
        emptyLabsRenderDropZone: emptyLabsHtml.includes('id="drop-zone"') && setupCalls.length >= 2,
      };
    } finally {
      state.importedData = originalData;
      document.body.className = originalBodyClass;
      if (main) main.innerHTML = originalMainHTML;
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
