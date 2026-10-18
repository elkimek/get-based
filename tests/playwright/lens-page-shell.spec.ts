import {waitForAsyncCondition} from '../helpers/awaited-condition.js';
import type { Page } from '@playwright/test';
import { createModuleUrl } from '../helpers/browser-module-url.js';
import { expect, test } from './coverage-fixture.js';

const moduleUrl = createModuleUrl('lensPageShellCoverage');

async function prepareApp(page: Page) {
  await page.addInitScript(() => {
    const profileId = localStorage.getItem('labcharts-active-profile') || 'default';
    localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');
  });
  await page.goto('/app', { waitUntil: 'load' });
  expect(await page.evaluate(async () => (await import('/js/views-runtime.js')).navigate('body'))).toBe(true);
  await waitForAsyncCondition(() => page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return !!state;
  }), 0);
}

test('lens page shell default dashboard deps render fallback widgets', async ({ page }) => {
  await prepareApp(page);

  const results = await page.evaluate(async ({ shellUrl }) => {
    const shell = (await import(shellUrl) as unknown) as Pick<typeof import('../../js/lens-page-shell.js'), "renderLensWidget" | "configureLensPageShell">;
    const defaultHtml = shell.renderLensWidget(
      'lab-marker',
      'Lab marker',
      'Default deps',
      {kind:'body-sources',view:{empty:true,sources:[]}}
    );
    (shell.configureLensPageShell as (deps: Omit<NonNullable<Parameters<typeof shell.configureLensPageShell>[0]>, 'openEMFAssessmentEditor'> & {openEMFAssessmentEditor?: () => unknown}) => ReturnType<typeof shell.configureLensPageShell>)({
      getAvailableDashboardFixedWidgetIds: () => ['lab-marker'],
    });
    const defaultPrefsHtml = shell.renderLensWidget(
      'lab-marker',
      'Lab marker',
      'Default prefs',
      null
    );

    return {
      defaultAvailableIdsHideDashboardToggle: !defaultHtml.includes('lens-widget-dashboard-toggle'),
      defaultWidgetRendersTitle: defaultHtml.includes('Lab marker'),
      defaultWidgetRendersDescription: defaultHtml.includes('Default deps'),
      defaultWidgetRendersBody: defaultHtml.includes('Connect body data'),
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
    const originalView: unknown = state.currentView;
    const profileId = profile.getActiveProfileId() || state.currentProfile || 'default';
    const labsOrderKey = `labcharts-${profileId}-lensPageOrder-labs-v1`;
    const savedLabsOrder = localStorage.getItem(labsOrderKey);
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const calls: unknown[][] = [];
    const previousContextCardsRuntime: ReturnType<typeof contextCardsRuntime.configureContextCardsRuntimeCallbacks>|null = contextCardsRuntime.configureContextCardsRuntimeCallbacks({
      triggerDNAFilePicker: () => calls.push(['trigger-dna']),
    });
    const previousSettingsBridge = settingsBridge.configureSettingsModuleBridge({
      openSettingsModal: (pane: unknown) => calls.push(['settings', pane]),
    });
    const previousDnaBridge = dnaBridge.configureDnaModuleBridge({
      reimportDNA: () => calls.push(['reimport-dna']),
      confirmDeleteDNA: () => calls.push(['delete-dna']),
    });
    const restoreShell = (shell.configureLensPageShell as (deps: Omit<NonNullable<Parameters<typeof shell.configureLensPageShell>[0]>, 'openEMFAssessmentEditor'> & {openEMFAssessmentEditor?: () => unknown}) => ReturnType<typeof shell.configureLensPageShell>)({
      addDashboardWidgetFromLens: (id: string) => calls.push(['add', id]),
      navigate: (route: unknown) => {
        calls.push(['navigate', route]);
        views.navigate(route);
      },
      openChatPanel: () => calls.push(['chat']),
      openEMFAssessmentEditor: () => calls.push(['emf']),
      openDashboardBiometricPicker: () => calls.push(['biometrics']),
      removeDashboardWidgetFromLens: (id: string) => calls.push(['remove', id]),
    });

    try {
      if (!dataModule.getActiveData()?.dates?.length) {
        const resp = await fetch('data/demo-male.json');
        (state as {importedData:unknown}).importedData = await resp.json();
        state.profileSex = 'male';
        state.profileDob = '1987-11-22';
        await dataModule.saveImportedData();
        nav.buildSidebar();
      }

      localStorage.removeItem(labsOrderKey);
      await views.navigate('labs');
      await delay(120);

      const widgets = document.querySelector<HTMLElement>('.lens-page-widgets[data-lens-route="labs"]');
      const beforeFirst = widgets?.querySelector<HTMLElement>('.dashboard-widget[data-widget-id]')?.dataset.widgetId || '';
      widgets?.querySelector<HTMLElement>('.dashboard-widget[data-widget-id] [data-lens-page-action="move-widget"][data-lens-page-direction="1"]')?.click();
      await delay(120);
      const afterFirst = document.querySelector<HTMLElement>('.lens-page-widgets[data-lens-route="labs"] .dashboard-widget[data-widget-id]')?.dataset.widgetId || '';

      const dashboardToggle = document.querySelector<HTMLElement>('.lens-page-widgets[data-lens-route="labs"] .lens-widget-dashboard-toggle[data-lens-page-action]');
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
      actionFixture.querySelectorAll<HTMLElement>('button').forEach(button => button.click());
      actionFixture.remove();
      await delay(50);

      return {
        shellRenders: !!widgets,
        noInlineHandlers: !!widgets && !widgets.querySelector<HTMLElement>('.dashboard-widget-tools [onclick], .dashboard-widget-tools [onkeydown]'),
        moveDataAttributes: !!widgets?.querySelector<HTMLElement>('[data-lens-page-action="move-widget"][data-lens-page-direction="1"]'),
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
    const originalData = state.importedData ? (JSON.parse(JSON.stringify(state.importedData)) as unknown) : state.importedData;
    const originalBodyClass = document.body.className;
    const originalMainHTML = main?.innerHTML || '';
    const setupCalls: unknown[] = [];

    const {createDashboardWidgetRenderers}=await import('/js/dashboard-widget-renderers.js');
    const {getLensContentGrid,getLensWidgetChrome}=await import('/js/lens-page-shell.js');
    const {projectDashboardMiniSparkline}=await import('/js/dashboard-owned-widget-projection.js');
    const dna=await import('/js/dna.js');
    const widgets=createDashboardWidgetRenderers({markerHasData:()=>false,rerenderDashboardFromWidgetChange:()=>{},showRecommendations:()=>{}});
    const handlers = createLensPageHandlers({
      setupDropZone: () => setupCalls.push('setup'),
      buildDashboardWidgetContext: (data: unknown) => ({data}),
      projectLabsPriorityBanner: ():import('../../types/dashboard-lab-marker-views.js').DashboardPriorityView => ({
        kind:'priority',id:'ldl',accessibleLabel:'Priority labs: 93 mg/dL',name:'Priority labs',value:'93',
        statusClass:'normal',dotStatus:'normal',priority:'Fixture priority',unit:'mg/dL',sparkline:projectDashboardMiniSparkline([], 'normal'),
      }),
      projectDashboardQuickMarkersWidget: ():import('../../types/dashboard-owned-widgets.js').DashboardQuickMarkersView => ({kind:'quick-markers',rows:[]}),
      projectDashboardKeyTrendsWidget: ():import('../../js/dashboard-key-trends-presentation.js').DashboardKeyTrendsView => ({rows:[]}),
      projectDashboardGenomeWidget: () => {setupCalls.push('project-genome');return widgets.projectDashboardGenomeWidget();},
      getLensContentGrid,
      getLensWidgetChrome,
    });

    try {
      (state as {importedData:unknown}).importedData = {
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
      await Promise.all([dna.ensureSNPTable(),dna.loadHaplogroupTable()]);
      handlers.showGenomeLens();
      const genomeText = main?.textContent || '';
      const genomePanelRendered = !!main?.querySelector('.db-mtdna-panel');
      const genomeHtml = main?.innerHTML || '';
      const genomeCardCount = main?.querySelectorAll<HTMLElement>('.genetics-overview-card').length || 0;

      (state as {importedData:unknown}).importedData = { ...(state.importedData || {}), genetics: { snps: {}, effects: {} } };
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
        genomeLensRenders: genomeText.includes('DNA findings and traits linked to your labs') && setupCalls.includes('project-genome') && genomePanelRendered,
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
        markerBackedLabsSkipDropZone: markerBackedLabsHtml.includes('labs-priority-banner') && markerBackedLabsHtml.includes('Priority labs') && markerBackedLabsHtml.includes('data-dashboard-widget-id="ldl"')
          && !markerBackedLabsHtml.includes('id="drop-zone"'),
        emptyLabsRenderDropZone: emptyLabsHtml.includes('id="drop-zone"') && setupCalls.filter(call => call === 'setup').length >= 2,
      };
    } finally {
      (state as {importedData:unknown}).importedData = originalData;
      document.body.className = originalBodyClass;
      if (main) main.innerHTML = originalMainHTML;
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
