import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?recommendationActionsBrowserCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/recommendation-actions-browser-coverage', route => {
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><head></head><body><main id="fixture"></main></body></html>',
    });
  });
  await page.goto('/recommendation-actions-browser-coverage', { waitUntil: 'load' });
}

test('recommendation actions browser coverage handles detail modal discussion and state actions', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ actionsUrl }) => {
    const [{ createRecommendationActions }, recommendationRuntime] = await Promise.all([
      import(actionsUrl),
      import('/js/recommendations-runtime.js'),
    ]);
    const outcomes = {};
    const fixture = document.getElementById('fixture');
    const waitForModalSettled = () => new Promise(resolve => setTimeout(resolve, 0));
    const renderCalls = [];
    const stateCalls = [];
    const chatPrompts = [];
    const activeData = { entries: [{ date: '2026-06-11', markers: {} }] };
    const catalog = { slots: { 'vitamins.d': {} } };
    const candidates = [
      {
        id: 'rec-d',
        source: 'catalog',
        label: 'Vitamin D',
        reason: '25(OH)D is low',
        primaryAction: '',
        slotKey: 'vitamins.d',
      },
      {
        id: 'rec-mag',
        source: 'catalog',
        label: 'Magnesium',
        reason: 'Sleep support',
        primaryAction: 'Discuss dose',
        slotKey: 'minerals.magnesium',
      },
    ];
    const actions = createRecommendationActions({
      getActiveData: () => activeData,
      buildDashboardWidgetContext: data => ({ data, ctx: 'dashboard' }),
      getCachedRecommendationsCatalog: () => catalog,
      getGlobalRecommendationCandidates: (ctx, cachedCatalog, options) => {
        renderCalls.push({ kind: 'candidateLookup', ctx, cachedCatalog, options });
        return candidates;
      },
      setRecommendationState: (kind, id, on) => {
        stateCalls.push({ kind, id, on });
      },
    });
    const renderShell = () => {
      fixture.innerHTML = '<div id="modal-overlay" class="modal-overlay"></div><div id="detail-modal"></div>';
      return {
        overlay: document.getElementById('modal-overlay'),
        modal: document.getElementById('detail-modal'),
      };
    };

    const previousRecommendationBridge = recommendationRuntime.configureRecommendationModuleBridge();
    const previousRecommendationRuntime = recommendationRuntime.configureRecommendationsRuntime({
      openChatPanel: prompt => chatPrompts.push(prompt),
    });

    try {
      fixture.innerHTML = '';
      actions.openRecommendationDetail('vitamins.d', 'No shell');
      outcomes.openRecommendationDetailNoOpsWhenShellIsMissing =
        fixture.innerHTML === ''
        && renderCalls.length === 0;

      let shell = renderShell();
      recommendationRuntime.configureRecommendationModuleBridge({
        renderRecommendationSection: async (slotKey, options) => {
          renderCalls.push({ kind: 'render', slotKey, options });
          return '<section class="recommendation-section">Loaded options</section>';
        },
      });
      actions.openRecommendationDetail('vitamins.d', '<Unsafe & Label>', 'low');
      const loadingHtml = shell.modal.innerHTML;
      await waitForModalSettled();
      outcomes.openRecommendationDetailShowsLoadingEscapesLabelAndRendersAsyncHtml =
        shell.overlay.classList.contains('show')
        && shell.modal.className === 'modal recommendation-detail-modal'
        && loadingHtml.includes('Loading options')
        && loadingHtml.includes('&lt;Unsafe &amp; Label&gt;')
        && shell.modal.innerHTML.includes('Loaded options')
        && renderCalls.some(call => call.kind === 'render'
          && call.slotKey === 'vitamins.d'
          && call.options.label === 'Options'
          && call.options.maxProducts === 4
          && call.options.markerStatus === 'low');

      shell = renderShell();
      recommendationRuntime.configureRecommendationModuleBridge({ renderRecommendationSection: async () => '' });
      actions.openRecommendationDetail('missing.slot', 'Missing section');
      await waitForModalSettled();
      outcomes.openRecommendationDetailUsesEmptyFallbackWhenRendererReturnsBlank =
        shell.modal.innerHTML.includes('Missing section')
        && shell.modal.innerHTML.includes('No tip details are available for this topic.');

      shell = renderShell();
      recommendationRuntime.configureRecommendationModuleBridge({
        renderRecommendationSection: async () => { throw new Error('catalog unavailable'); },
      });
      actions.openRecommendationDetail('broken.slot', '');
      await waitForModalSettled();
      outcomes.openRecommendationDetailUsesErrorFallbackWhenRendererRejects =
        shell.modal.innerHTML.includes('<h3>Tip</h3>')
        && shell.modal.innerHTML.includes('Could not load tip details.');

      shell = renderShell();
      recommendationRuntime.configureRecommendationModuleBridge({ renderRecommendationSection: null });
      actions.openRecommendationDetail('undefined.renderer', 'Undefined renderer');
      await waitForModalSettled();
      outcomes.openRecommendationDetailHandlesMissingRendererAsEmptyFallback =
        shell.modal.innerHTML.includes('Undefined renderer')
        && shell.modal.innerHTML.includes('No tip details are available for this topic.');

      actions.discussRecommendation('rec-d');
      actions.discussRecommendation('missing-rec');
      outcomes.discussRecommendationBuildsCandidatePromptAndFallbackPrompt =
        chatPrompts.length === 2
        && chatPrompts[0].includes('Source: catalog')
        && chatPrompts[0].includes('Tip topic: Vitamin D')
        && chatPrompts[0].includes('Why it appeared: 25(OH)D is low')
        && chatPrompts[0].includes('Example shown: none listed')
        && chatPrompts[0].includes('Do not turn this into a diagnosis or treatment plan.')
        && chatPrompts[1].includes('general-information tips currently shown in getbased')
        && chatPrompts[1].includes('Do not rank them as treatment priorities')
        && renderCalls.some(call => call.kind === 'candidateLookup'
          && call.ctx.data === activeData
          && call.cachedCatalog === catalog
          && call.options.includeDismissed === true);

      actions.saveRecommendation('rec-d');
      actions.saveRecommendation('rec-d', false);
      actions.dismissRecommendation('rec-mag');
      actions.dismissRecommendation('rec-mag', false);
      outcomes.saveAndDismissRecommendationForwardBooleanState =
        JSON.stringify(stateCalls) === JSON.stringify([
          { kind: 'saved', id: 'rec-d', on: true },
          { kind: 'saved', id: 'rec-d', on: false },
          { kind: 'dismissed', id: 'rec-mag', on: true },
          { kind: 'dismissed', id: 'rec-mag', on: false },
        ]);

      outcomes.allOutcomesReached = true;
    } finally {
      recommendationRuntime.configureRecommendationModuleBridge({
        renderRecommendationSection: null,
        ...previousRecommendationBridge,
      });
      recommendationRuntime.configureRecommendationsRuntime(previousRecommendationRuntime);
    }

    return outcomes;
  }, {
    actionsUrl: moduleUrl('/js/recommendation-actions.js'),
  });

  const expectedOutcomeKeys = [
    'openRecommendationDetailNoOpsWhenShellIsMissing',
    'openRecommendationDetailShowsLoadingEscapesLabelAndRendersAsyncHtml',
    'openRecommendationDetailUsesEmptyFallbackWhenRendererReturnsBlank',
    'openRecommendationDetailUsesErrorFallbackWhenRendererRejects',
    'openRecommendationDetailHandlesMissingRendererAsEmptyFallback',
    'discussRecommendationBuildsCandidatePromptAndFallbackPrompt',
    'saveAndDismissRecommendationForwardBooleanState',
    'allOutcomesReached',
  ];
  expect(Object.keys(results)).toEqual(expectedOutcomeKeys);
  for (const [name, passed] of Object.entries(results)) {
    expect.soft(passed, name).toBe(true);
  }
});
